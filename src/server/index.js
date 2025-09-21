require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const morgan = require('morgan');
const logger = require('./utils/logger');

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  path: '/socket.io'
});

// Middleware setup
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// HTTP request logging with Morgan + Winston
morgan.token('user-id', (req) => req.user?.id || 'anonymous');
app.use(morgan(
  ':method :url :status :res[content-length] - :response-time ms :user-id',
  { 
    stream: logger.stream,
    skip: (req, res) => {
      // Skip static file requests in production
      return process.env.NODE_ENV === 'production' && req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/);
    }
  }
));

const JWT_SECRET = process.env.JWT_SECRET || 'n10l-evaluation-secret-2024';

// Session storage for students (in production, use Redis)
const activeSessions = new Map();
const crypto = require('crypto');

// Clean up expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.expiresAt < now) {
      activeSessions.delete(sessionId);
    }
  }
}, 60 * 60 * 1000);

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'n10l',
};

let pool;

// Store real-time data
const connectedAdmins = new Set();
const studentProgress = new Map();

// Build immutable textual report snapshot (mirrors client generateReport)
function buildEvaluationReport({ meta, score, passedItems, failedItems, notes }) {
  try {
    const lines = [];
    lines.push('NURS 10L - Personal Care Peer Evaluation Report');
    lines.push('================================================');
    lines.push('');
    lines.push(`Student Evaluated: ${meta.studentName}`);
    lines.push(`Evaluator: ${meta.evaluatorName}`);
    lines.push(`Date: ${meta.date}`);
    lines.push(`Scenario: ${meta.scenario || 'Personal Care Evaluation'}`);
    if (meta.scenarioTime) lines.push(`Scenario Time: ${meta.scenarioTime}`);
    lines.push('');
    lines.push('SUMMARY');
    lines.push('-------');
    lines.push(`Tasks Completed: ${score.passed} / ${score.total}`);
    lines.push(`Tasks Failed: ${score.failed}`);
    lines.push(`Overall Score: ${score.percent}%`);
    lines.push('');
    if (passedItems.length) {
      lines.push('PASSED TASKS');
      lines.push('-----------');
      passedItems.forEach(i => lines.push('✓ ' + i.item_description));
      lines.push('');
    }
    if (failedItems.length) {
      lines.push('TASKS NEEDING IMPROVEMENT');
      lines.push('-------------------------');
      failedItems.forEach(i => lines.push('✗ ' + i.item_description));
      lines.push('');
    }
    if (notes && Object.keys(notes).length) {
      const sections = [
        ['SBAR NOTES','sbar_notes'],
        ['COLLABORATION NOTES','collaboration_notes'],
        ['CRITICAL THINKING NOTES','critical_thinking_notes'],
        ['CLINICAL JUDGMENT NOTES','clinical_judgment_notes'],
        ['ADDITIONAL NOTES','additional_notes']
      ];
      sections.forEach(([title, key]) => {
        const val = notes[key];
        if (val && typeof val === 'string' && val.trim()) {
          lines.push(title); lines.push('-'.repeat(title.length)); lines.push(val.trim()); lines.push('');
        }
      });
    }
    lines.push('Report generated on: ' + new Date().toLocaleString());
    return lines.join('\n');
  } catch (e) {
    return null;
  }
}

async function initDb() {
  try {
    logger.database.connection('attempting', cfg);
    // Ensure database exists (connect without database first)
    try {
      const adminConn = await mysql.createConnection({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
      });
      await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await adminConn.end();
      logger.database.connection('database_ensured', { database: cfg.database });
    } catch (e) {
      logger.database.error(e);
      // continue; pool creation may still work if DB exists
    }

    pool = await mysql.createPool({
      ...cfg,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    });
    
    logger.database.connection('pool_created', { 
      host: cfg.host, 
      database: cfg.database,
      connectionLimit: 10 
    });
  
    const conn = await pool.getConnection();
    try {
    // Create organized table structure for N10L evaluations
    
    // 1. Courses table - to manage different course weeks
    await conn.query(`CREATE TABLE IF NOT EXISTS n10l_courses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      week_number INT NOT NULL,
      week_name VARCHAR(255) NOT NULL,
      scenario_title VARCHAR(255) NOT NULL,
      scenario_description TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_week (week_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    // 2. Insert default weeks if they don't exist
    const weekData = [
      { week: 1, name: 'Week 1', title: 'Personal Care Evaluation', description: 'Shannon Shaw Case Study - Personal Care Assessment' },
      { week: 2, name: 'Week 2', title: 'Medication Administration', description: 'Medication Safety and Administration Procedures' },
      { week: 3, name: 'Week 3', title: 'Vital Signs Assessment', description: 'Comprehensive Vital Signs and Documentation' },
      { week: 4, name: 'Week 4', title: 'Wound Care Management', description: 'Sterile Technique and Wound Assessment' },
      { week: 5, name: 'Week 5', title: 'Emergency Response', description: 'Code Blue and Emergency Procedures' }
    ];

    for (const week of weekData) {
      await conn.query(`
        INSERT IGNORE INTO n10l_courses (week_number, week_name, scenario_title, scenario_description)
        VALUES (?, ?, ?, ?)
      `, [week.week, week.name, week.title, week.description]);
    }

    // 3. Create evaluation sessions table (now includes report_text snapshot)
    await conn.query(`CREATE TABLE IF NOT EXISTS n10l_evaluation_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      course_week_id INT NOT NULL,
      student_name VARCHAR(255) NOT NULL,
      evaluator_name VARCHAR(255) NOT NULL,
      session_date DATE NOT NULL,
      scenario_time VARCHAR(64) NULL,
      status ENUM('in_progress', 'completed', 'incomplete') DEFAULT 'in_progress',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      total_items INT DEFAULT 0,
      passed_items INT DEFAULT 0,
      failed_items INT DEFAULT 0,
      score_percentage DECIMAL(5,2) DEFAULT 0.00,
      notes JSON NULL,
      report_text MEDIUMTEXT NULL,
      FOREIGN KEY (course_week_id) REFERENCES n10l_courses(id),
      INDEX idx_student_week (student_name, course_week_id),
      INDEX idx_date (session_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    // Migration safety for existing deployments
    try { await conn.query("ALTER TABLE n10l_evaluation_sessions ADD COLUMN report_text MEDIUMTEXT NULL"); } catch(e) {}

    // 4. Create detailed evaluation items table (expanded with section_code + sequence)
    await conn.query(`CREATE TABLE IF NOT EXISTS n10l_evaluation_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      section_name VARCHAR(255) NOT NULL,
      item_description TEXT NOT NULL,
      item_key VARCHAR(255) NULL,
      status ENUM('pass', 'fail', 'not_completed') DEFAULT 'not_completed',
      checked_at TIMESTAMP NULL,
      notes TEXT NULL,
      section_code VARCHAR(100) NULL,
      sequence INT NULL,
      FOREIGN KEY (session_id) REFERENCES n10l_evaluation_sessions(id) ON DELETE CASCADE,
      INDEX idx_session_section (session_id, section_name),
      INDEX idx_section_sequence (section_name, sequence)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    // Migration safety: add columns if table pre-existed
    try { await conn.query("ALTER TABLE n10l_evaluation_items ADD COLUMN section_code VARCHAR(100) NULL"); } catch(e) {}
    try { await conn.query("ALTER TABLE n10l_evaluation_items ADD COLUMN sequence INT NULL"); } catch(e) {}
    try { await conn.query("CREATE INDEX idx_section_sequence ON n10l_evaluation_items(section_name, sequence)"); } catch(e) {}

    // 5. Create real-time tracking table for live sessions
    await conn.query(`CREATE TABLE IF NOT EXISTS n10l_live_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      student_name VARCHAR(255) NOT NULL,
      socket_id VARCHAR(255) NULL,
      connection_status ENUM('connected', 'disconnected', 'evaluating') DEFAULT 'connected',
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      current_progress JSON NULL,
      FOREIGN KEY (session_id) REFERENCES n10l_evaluation_sessions(id) ON DELETE CASCADE,
      UNIQUE KEY unique_session (session_id),
      INDEX idx_student (student_name),
      INDEX idx_status (connection_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    // 6. Users table for authentication
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'instructor', 'student') DEFAULT 'student',
      full_name VARCHAR(255) NULL,
      email VARCHAR(255) NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      INDEX idx_username (username),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    // 7. Academic Management Tables for Admin Interface
    await conn.query(`CREATE TABLE IF NOT EXISTS n10l_semesters (
      id INT PRIMARY KEY AUTO_INCREMENT,
      semester_name VARCHAR(100) NOT NULL,
      semester_code VARCHAR(20) NOT NULL UNIQUE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_semester_active (is_active),
      INDEX idx_semester_dates (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS n10l_student_cohorts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      cohort_name VARCHAR(100) NOT NULL,
      cohort_code VARCHAR(20) NOT NULL,
      semester_id INT NOT NULL,
      instructor_name VARCHAR(255),
      max_students INT DEFAULT 30,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (semester_id) REFERENCES n10l_semesters(id) ON DELETE CASCADE,
      UNIQUE KEY unique_cohort_semester (cohort_code, semester_id),
      INDEX idx_cohort_active (is_active),
      INDEX idx_cohort_semester (semester_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS n10l_student_enrollments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_name VARCHAR(255) NOT NULL,
      student_id VARCHAR(50),
      cohort_id INT NOT NULL,
      semester_id INT NOT NULL,
      enrollment_date DATE DEFAULT (CURRENT_DATE),
      status ENUM('active', 'withdrawn', 'completed') DEFAULT 'active',
      final_grade VARCHAR(10),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (cohort_id) REFERENCES n10l_student_cohorts(id) ON DELETE CASCADE,
      FOREIGN KEY (semester_id) REFERENCES n10l_semesters(id) ON DELETE CASCADE,
      UNIQUE KEY unique_student_cohort (student_name, cohort_id),
      INDEX idx_enrollment_status (status),
      INDEX idx_enrollment_semester (semester_id),
      INDEX idx_enrollment_cohort (cohort_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    // 8. Speech transcriptions table for voice recording features
    await conn.query(`CREATE TABLE IF NOT EXISTS speech_transcriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(255),
      student_name VARCHAR(255) NOT NULL,
      course_id INT,
      transcript TEXT NOT NULL,
      interim_transcript TEXT,
      is_final BOOLEAN DEFAULT FALSE,
      start_time DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      duration_seconds DECIMAL(10,2),
      INDEX idx_student_name (student_name),
      INDEX idx_session_id (session_id),
      INDEX idx_course_id (course_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    // Create default admin user if not exists
    const [adminExists] = await conn.query('SELECT id FROM users WHERE username = "admin"');
    if (adminExists.length === 0) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      await conn.query(
        'INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)',
        ['admin', adminPassword, 'admin', 'System Administrator']
      );
      console.log('Default admin user created: admin/admin123');
    }

    // Insert default semester data if none exists
    const [semesterExists] = await conn.query('SELECT id FROM n10l_semesters LIMIT 1');
    if (semesterExists.length === 0) {
      await conn.query(`INSERT INTO n10l_semesters (semester_name, semester_code, start_date, end_date, is_active) VALUES
        ('Fall 2025', 'F2025', '2025-08-15', '2025-12-15', TRUE),
        ('Spring 2026', 'S2026', '2026-01-15', '2026-05-15', FALSE)`);
      
      // Insert default cohort
      await conn.query(`INSERT INTO n10l_student_cohorts (cohort_name, cohort_code, semester_id, instructor_name) VALUES
        ('Fall 2025 Nursing Cohort A', 'F25-A', 1, 'Dr. Healthcare')`);
      
      console.log('Default semester and cohort data created');
    }

    logger.database.connection('success', { 
      tablesCreated: ['n10l_courses', 'n10l_evaluation_sessions', 'n10l_evaluation_items', 'n10l_live_sessions', 'users', 'n10l_semesters', 'n10l_student_cohorts', 'n10l_student_enrollments', 'speech_transcriptions'],
      adminUserExists: true 
    });
    
    console.log('Database structure updated with academic management for admin interface');
  } finally {
    conn.release();
  }
  } catch (error) {
    logger.database.error(error);
    logger.error('Database initialization failed', { 
      error: error.message, 
      stack: error.stack,
      config: { host: cfg.host, database: cfg.database }
    });
    throw error;
  }
}

// JWT Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Hybrid Socket.IO authentication middleware
function authenticateSocket(socket, next) {
  const { token, sessionId } = socket.handshake.auth;
  
  // Admin connection (JWT)
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        logger.auth.tokenError(err, token, socket.handshake.address);
        return next(new Error('Invalid admin token'));
      }
      socket.user = user;
      socket.userType = 'admin';
      next();
    });
  }
  // Student connection (session)
  else if (sessionId) {
    const session = activeSessions.get(sessionId);
    if (session && session.expiresAt > Date.now()) {
      socket.user = { 
        username: session.studentName, 
        role: 'student' 
      };
      socket.userType = 'student';
      socket.sessionId = sessionId;
      next();
    } else {
      if (session && session.expiresAt <= Date.now()) {
        activeSessions.delete(sessionId); // Clean up expired session
      }
      return next(new Error('Invalid or expired student session'));
    }
  }
  else {
    return next(new Error('No authentication provided'));
  }
}

// Socket.IO connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
  logger.socket.connection(socket.id, socket.user.username, socket.user.role);

  if (socket.user.role === 'admin') {
    connectedAdmins.add(socket.id);
    logger.info('Admin connected to real-time dashboard', { 
      adminId: socket.user.username,
      socketId: socket.id,
      activeStudents: studentProgress.size
    });
    
    // Send current student progress to newly connected admin
    socket.emit('student-progress-update', Array.from(studentProgress.values()));
  } else if (socket.user.role === 'student') {
    // Initialize student session
    const studentData = {
      id: socket.id,
      username: socket.user.username,
      status: 'connected',
      score: { passed: 0, failed: 0, total: 0, percent: 0 },
      currentItems: [],
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
    
    activeSessions.set(socket.user.username, studentData);
    studentProgress.set(socket.user.username, studentData);
    
    // Notify all admins about new student connection
    socket.broadcast.to('admins').emit('student-connected', studentData);
  }

  // Join appropriate room
  socket.join(socket.user.role === 'admin' ? 'admins' : 'students');

  // Handle student evaluation updates
  socket.on('evaluation-update', (data) => {
    try {
      if (socket.user.role === 'student') {
        const studentData = studentProgress.get(socket.user.username);
        if (studentData) {
          studentData.score = data.score || studentData.score;
          studentData.currentItems = data.items || studentData.currentItems;
          studentData.lastUpdate = new Date().toISOString();
          studentData.status = 'evaluating';
          if (data.courseWeekId) studentData.courseWeekId = data.courseWeekId;
          if (data.scenarioTitle) studentData.scenarioTitle = data.scenarioTitle;
          
          studentProgress.set(socket.user.username, studentData);
          
          logger.evaluation.progress(
            studentData.sessionId,
            socket.user.username,
            studentData.score,
            studentData.currentItems?.length || 0
          );
          
          // Broadcast to all admins
          io.to('admins').emit('student-progress-update', [studentData]);
        }
      }
    } catch (error) {
      logger.socket.error(error, socket.id, socket.user.username);
    }
  });

  // Handle evaluation completion
  socket.on('evaluation-complete', async (data) => {
    if (socket.user.role === 'student') {
      const studentData = studentProgress.get(socket.user.username);
      if (studentData) {
        studentData.status = 'completed';
        studentData.finalScore = data.score;
        studentData.completedAt = new Date().toISOString();
        
        // Save to database
        try {
          // Determine which course/week this evaluation is for
          const courseWeekId = data.courseWeekId || 1; // Default to Week 1 (Personal Care)
          const evaluatorName = data.evaluatorName || 'Self-Assessment';
          const scenarioTime = data.scenarioTime || null;
          const currentDate = new Date().toISOString().split('T')[0];
          
          // Handle overwrite if requested
          console.log('🔍 Evaluation data received:', {
            studentName: socket.user.username,
            overwrite: data.overwrite,
            overwriteType: typeof data.overwrite,
            courseWeekId
          });
          
          // Only overwrite if explicitly true (not an object or other truthy value)
          if (data.overwrite === true) {
            console.log('🗑️ Overwrite requested, deleting previous evaluations');
            // Delete existing evaluations for this student and course
            await pool.query(
              'DELETE FROM n10l_evaluation_items WHERE session_id IN (SELECT id FROM n10l_evaluation_sessions WHERE student_name = ? AND course_week_id = ?)',
              [socket.user.username, courseWeekId]
            );
            
            await pool.query(
              'DELETE FROM n10l_evaluation_sessions WHERE student_name = ? AND course_week_id = ?',
              [socket.user.username, courseWeekId]
            );
            
            await pool.query(
              'DELETE FROM n10l_evaluations WHERE student_name = ?',
              [socket.user.username]
            );
            
            logger.info('Previous evaluation overwritten', {
              service: 'n10l-server',
              studentName: socket.user.username,
              courseWeekId
            });
          }
          
          // Create evaluation session record (report_text initially NULL, updated after items saved)
          const [sessionResult] = await pool.query(
            `INSERT INTO n10l_evaluation_sessions 
             (course_week_id, student_name, evaluator_name, session_date, scenario_time, 
              status, total_items, passed_items, failed_items, score_percentage, notes, report_text, completed_at)
             VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, NOW())`,
            [
              courseWeekId,
              socket.user.username,
              evaluatorName,
              currentDate,
              scenarioTime,
              data.score.total,
              data.score.passed,
              data.score.failed,
              data.score.percent,
              JSON.stringify(data.notes || {}),
              null
            ]
          );
          
          const sessionId = sessionResult.insertId;
          
          // Save individual evaluation items
          if (data.items && data.items.length > 0) {
            const itemInserts = data.items.map(item => [
              sessionId,
              item.section || 'General',
              item.item || item.description || item.text || 'Unknown item',
              item.key || null,
              item.status || (item.checked ? 'pass' : 'fail'),
              item.notes || null,
              item.section_code || null,
              (typeof item.sequence === 'number') ? item.sequence : null
            ]);

            await pool.query(
              `INSERT INTO n10l_evaluation_items 
               (session_id, section_name, item_description, item_key, status, notes, section_code, sequence)
               VALUES ${itemInserts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
              itemInserts.flat()
            );
          }
          
          // Build textual report snapshot now that items are known
          try {
            const passedItems = (data.items || []).filter(i => (i.status === 'pass') || (i.checked && !i.failed)).map(i => ({ item_description: i.item || i.description || i.text || 'Unknown item'}));
            const failedItems = (data.items || []).filter(i => (i.status === 'fail') || i.failed).map(i => ({ item_description: i.item || i.description || i.text || 'Unknown item'}));
            const reportText = buildEvaluationReport({
              meta: { studentName: socket.user.username, evaluatorName, date: currentDate, scenarioTime, scenario: 'Personal Care Evaluation' },
              score: data.score,
              passedItems,
              failedItems,
              notes: data.notes || {}
            });
            if (reportText) {
              await pool.query('UPDATE n10l_evaluation_sessions SET report_text = ? WHERE id = ?', [reportText, sessionResult.insertId]);
            }
          } catch(reportErr) {
            console.warn('Failed to generate report_text snapshot:', reportErr.message);
          }

          // Also save to legacy table for backward compatibility
          await pool.query(
            `INSERT INTO n10l_evaluations
             (student_name, evaluator_name, evaluation_date, scenario_time, 
              summary_passed, summary_failed, summary_total, summary_score_pct, notes, items)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              socket.user.username,
              evaluatorName,
              currentDate,
              scenarioTime,
              data.score.passed,
              data.score.failed,
              data.score.total,
              data.score.percent,
              JSON.stringify(data.notes || {}),
              JSON.stringify(data.items || [])
            ]
          );
          
          logger.info('Evaluation saved successfully', {
            service: 'n10l-server',
            studentName: socket.user.username,
            courseWeekId,
            sessionId,
            totalItems: data.score.total,
            scorePercent: data.score.percent
          });
          
          // Notify admins of completion with enhanced data
          const completionData = {
            ...studentData,
            sessionId,
            courseWeekId,
            evaluationDate: currentDate,
            finalScore: data.score
          };
          io.to('admins').emit('evaluation-completed', completionData);
          
        } catch (error) {
          logger.error('Error saving evaluation:', {
            service: 'n10l-server',
            studentName: socket.user.username,
            error: error.message,
            stack: error.stack
          });
          socket.emit('error', { message: 'Failed to save evaluation' });
        }
      }
    }
  });

  // Speech-to-Text real-time event handlers
  socket.on('speech-start', (data) => {
    try {
      logger.info('🎤 Speech recognition started', {
        sessionId: data.sessionId,
        studentName: data.studentName,
        courseId: data.courseId,
        studentSocketId: socket.id,
        connectedAdmins: connectedAdmins.size,
        service: 'speech-realtime'
      });

      // Broadcast to all admins
      const speechStartData = {
        ...data,
        socketId: socket.id,
        timestamp: new Date()
      };
      
      io.to('admins').emit('student-speech-start', speechStartData);
      logger.info('📡 Broadcasted speech-start to admins', {
        adminRoomSize: io.sockets.adapter.rooms.get('admins')?.size || 0,
        data: speechStartData
      });
    } catch (error) {
      logger.error('Speech start event error', { error: error.message, service: 'speech-realtime' });
    }
  });

  socket.on('speech-realtime', (data) => {
    try {
      logger.info('🔄 Speech realtime update', {
        studentName: data.studentName,
        transcriptLength: data.finalTranscript?.length || 0,
        hasInterim: !!data.interimTranscript,
        service: 'speech-realtime'
      });
      
      // Broadcast real-time speech updates to all admins
      const speechUpdateData = {
        ...data,
        socketId: socket.id,
        timestamp: new Date()
      };
      
      io.to('admins').emit('student-speech-update', speechUpdateData);
      logger.info('📡 Broadcasted speech-update to admins', {
        adminRoomSize: io.sockets.adapter.rooms.get('admins')?.size || 0
      });
    } catch (error) {
      logger.error('Speech realtime event error', { error: error.message, service: 'speech-realtime' });
    }
  });

  socket.on('speech-stop', (data) => {
    try {
      logger.info('Speech recognition stopped', {
        sessionId: data.sessionId,
        studentName: data.studentName,
        courseId: data.courseId,
        duration: data.duration,
        finalLength: data.finalTranscript?.length || 0,
        service: 'speech-realtime'
      });

      // Broadcast to all admins
      io.to('admins').emit('student-speech-stop', {
        ...data,
        socketId: socket.id,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Speech stop event error', { error: error.message, service: 'speech-realtime' });
    }
  });

  socket.on('speech-save', (data) => {
    try {
      logger.info('Speech transcript manually saved', {
        sessionId: data.sessionId,
        studentName: data.studentName,
        courseId: data.courseId,
        saveType: data.saveType,
        service: 'speech-realtime'
      });

      // Broadcast to all admins
      io.to('admins').emit('student-speech-save', {
        ...data,
        socketId: socket.id,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Speech save event error', { error: error.message, service: 'speech-realtime' });
    }
  });

  socket.on('speech-submit', (data) => {
    try {
      logger.info('Speech transcript submitted', {
        sessionId: data.sessionId,
        studentName: data.studentName,
        courseId: data.courseId,
        duration: data.duration,
        finalLength: data.finalTranscript?.length || 0,
        service: 'speech-realtime'
      });

      // Broadcast to all admins
      io.to('admins').emit('student-speech-submit', {
        ...data,
        socketId: socket.id,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Speech submit event error', { error: error.message, service: 'speech-realtime' });
    }
  });

  // Admin debug test handler
  socket.on('admin-test', (data) => {
    try {
      logger.info('Admin socket test received', {
        adminId: socket.user.username,
        socketId: socket.id,
        role: socket.user.role,
        rooms: Array.from(socket.rooms),
        data: data,
        connectedAdmins: connectedAdmins.size,
        service: 'admin-debug'
      });
      
      // Send confirmation back to admin
      socket.emit('admin-test-response', {
        status: 'success',
        message: 'Admin socket connection working',
        serverTime: new Date(),
        yourSocketId: socket.id,
        yourRole: socket.user.role,
        yourRooms: Array.from(socket.rooms),
        connectedAdmins: connectedAdmins.size,
        activeStudents: studentProgress.size
      });
    } catch (error) {
      logger.error('Admin test error', { error: error.message, service: 'admin-debug' });
    }
  });

  // Health check ping/pong for admin dashboard
  socket.on('admin-ping', (payload = {}) => {
    if (socket.user.role !== 'admin') return;

    const serverTime = Date.now();
    const sentAt = typeof payload.timestamp === 'number' ? payload.timestamp : null;
    const latency = sentAt !== null ? serverTime - sentAt : null;

    socket.emit('admin-pong', {
      serverTime,
      latency,
      type: payload.type || 'health-check'
    });
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.user.username} disconnected`);
    
    if (socket.user.role === 'admin') {
      connectedAdmins.delete(socket.id);
    } else if (socket.user.role === 'student') {
      const studentData = studentProgress.get(socket.user.username);
      if (studentData) {
        studentData.status = 'disconnected';
        studentData.disconnectedAt = new Date().toISOString();
        
        // Notify admins
        io.to('admins').emit('student-disconnected', studentData);
      }
      activeSessions.delete(socket.user.username);
    }
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Authentication endpoints
// Simple student login - just password check, no database storage needed
// Hybrid authentication: Admin (JWT) + Student (Session)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Name and password required' });
    }

    // Admin login (existing JWT system)
    if (username === 'admin' || password !== 'fresnostate123') {
      try {
        // Check if admin user exists in database
        const [users] = await pool.query('SELECT * FROM users WHERE username = ? AND role = ?', [username, 'admin']);
        const user = users[0];
        
        if (user && await bcrypt.compare(password, user.password_hash)) {
          const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          // Update last login
          await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
          
          return res.json({ 
            token, 
            user: { 
              id: user.id, 
              username: user.username, 
              role: user.role 
            } 
          });
        }
        
        return res.status(401).json({ error: 'Invalid admin credentials' });
      } catch (adminError) {
        console.error('Admin login error:', adminError);
        return res.status(500).json({ error: 'Admin authentication failed' });
      }
    }
    
    // Student login (simple session-based)
    if (password === 'fresnostate123') {
      // Auto-enroll student in active semester/cohort
      try {
        // Get active semester and cohort
        const [activeSemesters] = await pool.query('SELECT * FROM n10l_semesters WHERE is_active = TRUE LIMIT 1');
        const [activeCohorts] = await pool.query('SELECT * FROM n10l_student_cohorts WHERE is_active = TRUE LIMIT 1');
        
        if (activeSemesters.length > 0 && activeCohorts.length > 0) {
          const semester = activeSemesters[0];
          const cohort = activeCohorts[0];
          
          // Check if student is already enrolled
          const [existing] = await pool.query(
            'SELECT id FROM n10l_student_enrollments WHERE student_name = ? AND cohort_id = ? AND semester_id = ?',
            [username, cohort.id, semester.id]
          );
          
          // Enroll student if not already enrolled
          if (existing.length === 0) {
            await pool.query(`
              INSERT INTO n10l_student_enrollments (student_name, cohort_id, semester_id, status)
              VALUES (?, ?, ?, 'active')
            `, [username, cohort.id, semester.id]);
            
            console.log(`✅ Auto-enrolled ${username} in ${semester.semester_name} - ${cohort.cohort_name}`);
          }
        }
      } catch (enrollError) {
        console.error('Auto-enrollment error:', enrollError);
        // Continue with login even if enrollment fails
      }
      
      const sessionId = crypto.randomUUID();
      const sessionData = {
        studentName: username,
        createdAt: Date.now(),
        expiresAt: Date.now() + (8 * 60 * 60 * 1000) // 8 hours
      };
      
      activeSessions.set(sessionId, sessionData);
      
      logger.info('Student session created', {
        service: 'n10l-auth',
        studentName: username,
        sessionId: sessionId.substring(0, 8) + '...'
      });
      
      return res.json({ 
        sessionId, 
        studentName: username, 
        role: 'student',
        expiresAt: sessionData.expiresAt
      });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Session validation for students
app.post('/api/auth/validate-session', (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = activeSessions.get(sessionId);
  if (session && session.expiresAt > Date.now()) {
    res.json({ 
      valid: true, 
      studentName: session.studentName,
      expiresAt: session.expiresAt
    });
  } else {
    if (session && session.expiresAt <= Date.now()) {
      activeSessions.delete(sessionId);
    }
    res.status(401).json({ error: 'Invalid or expired session' });
  }
});

// Admin token verification (existing)
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Check for duplicate evaluations before submission
app.post('/api/evaluations/check-duplicate', async (req, res) => {
  try {
    const { studentName, courseWeekId = 1 } = req.body;
    
    if (!studentName) {
      return res.status(400).json({ error: 'Student name required' });
    }
    
    // Check for existing evaluation for this student and week
    const [existingEvaluations] = await pool.query(
      `SELECT id, session_date, score_percentage, completed_at
       FROM n10l_evaluation_sessions 
       WHERE student_name = ? AND course_week_id = ? 
       ORDER BY completed_at DESC LIMIT 1`,
      [studentName, courseWeekId]
    );
    
    if (existingEvaluations.length > 0) {
      const existing = existingEvaluations[0];
      res.json({
        duplicate: true,
        existingEvaluation: {
          id: existing.id,
          date: existing.session_date,
          score: existing.score_percentage,
          completedAt: existing.completed_at
        }
      });
    } else {
      res.json({ duplicate: false });
    }
    
  } catch (error) {
    console.error('Duplicate check error:', error);
    res.status(500).json({ error: 'Server error checking for duplicates' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role = 'student' } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, passwordHash, role]
    );

    const token = jwt.sign(
      { id: result.insertId, username, role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      token, 
      user: { 
        id: result.insertId, 
        username, 
        role 
      } 
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get active students (for admin dashboard)
app.get('/api/students/active', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  res.json(Array.from(studentProgress.values()));
});

// Original evaluation endpoint (now with authentication)
app.post('/api/evaluations', authenticateToken, async (req, res) => {
  try {
    const {
      studentName,
      evaluatorName,
      evaluationDate,
      scenarioTime,
      passed = 0,
      failed = 0,
      total = 0,
      percent = 0,
      items = [],
      notes = {},
    } = req.body || {};

    if (!studentName || !evaluatorName || !evaluationDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Determine course week (default to Personal Care if not specified)
    const courseWeekId = req.body.courseWeekId || 1;
    
    // Create evaluation session record (report_text to be generated post item insert)
    const [sessionResult] = await pool.query(
      `INSERT INTO n10l_evaluation_sessions 
       (course_week_id, student_name, evaluator_name, session_date, scenario_time, 
        status, total_items, passed_items, failed_items, score_percentage, notes, report_text, completed_at)
       VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, NOW())`,
      [
        courseWeekId, studentName, evaluatorName, evaluationDate, scenarioTime,
        total, passed, failed, percent, JSON.stringify(notes), null
      ]
    );
    
    const sessionId = sessionResult.insertId;
    
    // Save individual evaluation items if provided
    if (items && items.length > 0) {
      const itemInserts = items.map(item => [
        sessionId,
        item.section || 'General',
        item.item || item.description || item.text || 'Unknown item',
        item.key || null,
        item.status || (item.checked ? 'pass' : 'fail'),
        item.notes || null,
        item.section_code || null,
        (typeof item.sequence === 'number') ? item.sequence : null
      ]);

      await pool.query(
        `INSERT INTO n10l_evaluation_items 
         (session_id, section_name, item_description, item_key, status, notes, section_code, sequence)
         VALUES ${itemInserts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
        itemInserts.flat()
      );
    }
    
    // Also save to legacy table for backward compatibility
    const [result] = await pool.query(
      `INSERT INTO n10l_evaluations
       (student_name, evaluator_name, evaluation_date, scenario_time, 
        summary_passed, summary_failed, summary_total, summary_score_pct, notes, items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentName, evaluatorName, evaluationDate, scenarioTime, 
       passed, failed, total, percent, JSON.stringify(notes), JSON.stringify(items)]
    );

    // Build textual report snapshot
    try {
      const passedItems = (items || []).filter(i => (i.status === 'pass') || (i.checked && !i.failed)).map(i => ({ item_description: i.item || i.description || i.text || 'Unknown item'}));
      const failedItems = (items || []).filter(i => (i.status === 'fail') || i.failed).map(i => ({ item_description: i.item || i.description || i.text || 'Unknown item'}));
      const reportText = buildEvaluationReport({
        meta: { studentName, evaluatorName, date: evaluationDate, scenarioTime, scenario: 'Personal Care Evaluation' },
        score: { passed, failed, total, percent },
        passedItems,
        failedItems,
        notes: notes || {}
      });
      if (reportText) {
        await pool.query('UPDATE n10l_evaluation_sessions SET report_text = ? WHERE id = ?', [reportText, sessionResult.insertId]);
      }
    } catch(e) { console.warn('Report generation failed (REST):', e.message); }

    res.status(201).json({ id: result.insertId, ok: true });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Week-based Course Management API Endpoints

// Get all available weeks/courses
app.get('/api/courses', async (req, res) => {
  try {
    const [courses] = await pool.query(`
      SELECT id, week_number, week_name, scenario_title, scenario_description, active 
      FROM n10l_courses 
      WHERE active = TRUE 
      ORDER BY week_number
    `);
    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific week details
app.get('/api/courses/:weekNumber', async (req, res) => {
  try {
    const { weekNumber } = req.params;
    const [courses] = await pool.query(`
      SELECT id, week_number, week_name, scenario_title, scenario_description, active 
      FROM n10l_courses 
      WHERE week_number = ? AND active = TRUE
    `, [weekNumber]);
    
    if (courses.length === 0) {
      return res.status(404).json({ error: 'Week not found' });
    }
    
    res.json(courses[0]);
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start new evaluation session for specific week
app.post('/api/evaluations/start', authenticateToken, async (req, res) => {
  try {
    const { weekNumber, evaluatorName, scenarioTime } = req.body;
    const studentName = req.user.username;
    
    if (!weekNumber) {
      return res.status(400).json({ error: 'Week number is required' });
    }

    // Get course details
    const [courses] = await pool.query('SELECT id FROM n10l_courses WHERE week_number = ? AND active = TRUE', [weekNumber]);
    if (courses.length === 0) {
      return res.status(404).json({ error: 'Week not found' });
    }

    const courseId = courses[0].id;

    // Create new evaluation session
    const [result] = await pool.query(`
      INSERT INTO n10l_evaluation_sessions 
      (course_week_id, student_name, evaluator_name, session_date, scenario_time, status)
      VALUES (?, ?, ?, CURDATE(), ?, 'in_progress')
    `, [courseId, studentName, evaluatorName || 'Self-Assessment', scenarioTime]);

    // Create live session tracking
    await pool.query(`
      INSERT INTO n10l_live_sessions (session_id, student_name, connection_status)
      VALUES (?, ?, 'connected')
    `, [result.insertId, studentName]);

    res.status(201).json({ 
      sessionId: result.insertId, 
      weekNumber, 
      courseId,
      message: 'Evaluation session started' 
    });
  } catch (error) {
    console.error('Error starting evaluation:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save evaluation progress (new organized structure)
app.post('/api/evaluations/:sessionId/progress', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { items, score, notes } = req.body;
    const studentName = req.user.username;

    // Verify session belongs to student
    const [sessions] = await pool.query(`
      SELECT id FROM n10l_evaluation_sessions 
      WHERE id = ? AND student_name = ? AND status = 'in_progress'
    `, [sessionId, studentName]);

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found or not accessible' });
    }

    // Update session progress
    await pool.query(`
      UPDATE n10l_evaluation_sessions 
      SET total_items = ?, passed_items = ?, failed_items = ?, score_percentage = ?, notes = ?
      WHERE id = ?
    `, [score.total, score.passed, score.failed, score.percent, JSON.stringify(notes), sessionId]);

    // Delete existing items for this session and insert new ones
    await pool.query('DELETE FROM n10l_evaluation_items WHERE session_id = ?', [sessionId]);
    
    if (items && items.length > 0) {
      const itemValues = items.map(item => [
        sessionId,
        item.section || 'General',
        item.item || item.description || 'Unknown Item',
        item.key || null,
        item.checked ? 'pass' : (item.failed ? 'fail' : 'not_completed'),
        item.checked || item.failed ? new Date() : null,
        item.notes || null,
        item.section_code || null,
        (typeof item.sequence === 'number') ? item.sequence : null
      ]);

      await pool.query(`
        INSERT INTO n10l_evaluation_items 
        (session_id, section_name, item_description, item_key, status, checked_at, notes, section_code, sequence)
        VALUES ?
      `, [itemValues]);
    }

    // Update live session tracking
    await pool.query(`
      UPDATE n10l_live_sessions 
      SET connection_status = 'evaluating', current_progress = ?, last_activity = NOW()
      WHERE session_id = ?
    `, [JSON.stringify(score), sessionId]);

    res.json({ message: 'Progress saved successfully' });
  } catch (error) {
    console.error('Error saving progress:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Complete evaluation session
app.post('/api/evaluations/:sessionId/complete', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { finalScore, finalItems, notes } = req.body;
    const studentName = req.user.username;

    // Verify session belongs to student
    const [sessions] = await pool.query(`
      SELECT id FROM n10l_evaluation_sessions 
      WHERE id = ? AND student_name = ? AND status = 'in_progress'
    `, [sessionId, studentName]);

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found or already completed' });
    }

    // Save final items to database
    if (finalItems && finalItems.length > 0) {
      // Delete existing items for this session and insert final ones
      await pool.query('DELETE FROM n10l_evaluation_items WHERE session_id = ?', [sessionId]);
      
      const itemValues = finalItems.map(item => [
        sessionId,
        item.section || 'General',
        item.item || item.description || item.text || 'Unknown item',
        item.key || null,
        item.checked ? 'pass' : 'not_completed',
        item.checked ? new Date() : null,
        item.notes || (item.checked ? 'Completed' : 'Not completed'),
        item.section_code || null,
        (typeof item.sequence === 'number') ? item.sequence : null
      ]);

      await pool.query(`
        INSERT INTO n10l_evaluation_items 
        (session_id, section_name, item_description, item_key, status, checked_at, notes, section_code, sequence)
        VALUES ?
      `, [itemValues]);
    }

    // Complete the session
    await pool.query(`
      UPDATE n10l_evaluation_sessions 
      SET status = 'completed', completed_at = NOW(), 
          total_items = ?, passed_items = ?, failed_items = ?, score_percentage = ?, notes = ?
      WHERE id = ?
    `, [finalScore.total, finalScore.passed, finalScore.failed, finalScore.percent, JSON.stringify(notes), sessionId]);

    // Update live session tracking
    await pool.query(`
      UPDATE n10l_live_sessions 
      SET connection_status = 'disconnected', current_progress = ?
      WHERE session_id = ?
    `, [JSON.stringify(finalScore), sessionId]);

    res.json({ message: 'Evaluation completed successfully', score: finalScore });
  } catch (error) {
    console.error('Error completing evaluation:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get evaluation history for student
app.get('/api/evaluations/history', authenticateToken, async (req, res) => {
  try {
    const studentName = req.user.username;
    const { weekNumber } = req.query;

    let query = `
      SELECT 
        es.id, es.session_date, es.scenario_time, es.status, es.started_at, es.completed_at,
        es.total_items, es.passed_items, es.failed_items, es.score_percentage,
        c.week_number, c.week_name, c.scenario_title
      FROM n10l_evaluation_sessions es
      JOIN n10l_courses c ON es.course_week_id = c.id
      WHERE es.student_name = ?
    `;
    
    const params = [studentName];
    
    if (weekNumber) {
      query += ' AND c.week_number = ?';
      params.push(weekNumber);
    }
    
    query += ' ORDER BY es.session_date DESC, es.started_at DESC';

    const [evaluations] = await pool.query(query, params);
    res.json(evaluations);
  } catch (error) {
    console.error('Error fetching evaluation history:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get detailed evaluation results with individual answers
app.get('/api/evaluations/:sessionId/details', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentName = req.user.username;
    const isAdmin = req.user.role === 'admin';

    // Get evaluation session details
    let sessionQuery = `
      SELECT 
        es.id, es.student_name, es.evaluator_name, es.session_date, es.scenario_time,
        es.status, es.started_at, es.completed_at, es.total_items, es.passed_items, 
        es.failed_items, es.score_percentage, es.notes, es.report_text,
        c.week_number, c.week_name, c.scenario_title
      FROM n10l_evaluation_sessions es
      JOIN n10l_courses c ON es.course_week_id = c.id
      WHERE es.id = ?
    `;
    
    const sessionParams = [sessionId];
    
    // Non-admin users can only view their own evaluations
    if (!isAdmin) {
      sessionQuery += ' AND es.student_name = ?';
      sessionParams.push(studentName);
    }

    const [sessions] = await pool.query(sessionQuery, sessionParams);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Evaluation session not found or not accessible' });
    }

    const session = sessions[0];

    // Get individual evaluation items
    const [items] = await pool.query(`
      SELECT 
        section_name, item_description, item_key, status, checked_at, notes, section_code, sequence
      FROM n10l_evaluation_items 
      WHERE session_id = ?
      ORDER BY section_name, sequence IS NULL, sequence, item_description
    `, [sessionId]);

    // Group items by section
    const itemsBySection = {};
  items.forEach(item => {
      if (!itemsBySection[item.section_name]) {
        itemsBySection[item.section_name] = [];
      }
      itemsBySection[item.section_name].push({
        description: item.item_description,
        key: item.item_key,
        status: item.status,
        completed_at: item.checked_at,
    notes: item.notes,
    section_code: item.section_code,
    sequence: item.sequence
      });
    });

    res.json({
      session: { ...session, report_text: undefined },
      items_by_section: itemsBySection,
      total_individual_items: items.length,
      report_text_available: !!session.report_text
    });
  } catch (error) {
    console.error('Error fetching evaluation details:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get plain text report snapshot
app.get('/api/evaluations/:sessionId/report.txt', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentName = req.user.username;
    const isAdmin = req.user.role === 'admin';
    let query = 'SELECT student_name, evaluator_name, report_text FROM n10l_evaluation_sessions WHERE id = ?';
    const params = [sessionId];
    if (!isAdmin) { query += ' AND student_name = ?'; params.push(studentName); }
    const [rows] = await pool.query(query, params);
    if (rows.length === 0) return res.status(404).send('Report not found');
    const row = rows[0];
    if (!row.report_text) return res.status(404).send('Report snapshot not available');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="evaluation_${sessionId}.txt"`);
    res.send(row.report_text);
  } catch (e) {
    console.error('Error fetching report text:', e);
    res.status(500).send('Server error');
  }
});

// List failed evaluation items (admin) with optional filters
app.get('/api/evaluations/failed-items', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { student, sessionId, weekNumber } = req.query;
    const conditions = ['ei.status = "fail"'];
    const params = [];
    if (student) { conditions.push('es.student_name = ?'); params.push(student); }
    if (sessionId) { conditions.push('es.id = ?'); params.push(sessionId); }
    if (weekNumber) { conditions.push('c.week_number = ?'); params.push(weekNumber); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(`
      SELECT es.id as session_id, es.student_name, c.week_name, c.week_number, es.score_percentage,
             ei.section_name, ei.item_description, ei.checked_at as completed_at
      FROM n10l_evaluation_items ei
      JOIN n10l_evaluation_sessions es ON ei.session_id = es.id
      JOIN n10l_courses c ON es.course_week_id = c.id
      ${where}
      ORDER BY es.completed_at DESC, es.student_name, ei.section_name, ei.sequence IS NULL, ei.sequence, ei.item_description
      LIMIT 500
    `, params);
    res.json(rows);
  } catch (e) {
    console.error('Error listing failed items:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Get all active students across all weeks
app.get('/api/admin/active-sessions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const [activeSessions] = await pool.query(`
      SELECT 
        es.id as session_id, es.student_name, es.evaluator_name, es.started_at,
        es.total_items, es.passed_items, es.failed_items, es.score_percentage,
        c.week_number, c.week_name, c.scenario_title,
        ls.connection_status, ls.last_activity, ls.current_progress
      FROM n10l_evaluation_sessions es
      JOIN n10l_courses c ON es.course_week_id = c.id
      LEFT JOIN n10l_live_sessions ls ON es.id = ls.session_id
      WHERE es.status = 'in_progress'
      ORDER BY ls.last_activity DESC
    `);

    res.json(activeSessions);
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Get evaluation statistics by week
app.get('/api/admin/statistics', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const [stats] = await pool.query(`
      SELECT 
        c.week_number, c.week_name, c.scenario_title,
        COUNT(es.id) as total_evaluations,
        COUNT(CASE WHEN es.status = 'completed' THEN 1 END) as completed_evaluations,
        COUNT(CASE WHEN es.status = 'in_progress' THEN 1 END) as in_progress_evaluations,
        AVG(CASE WHEN es.status = 'completed' THEN es.score_percentage END) as average_score,
        MAX(es.score_percentage) as highest_score,
        MIN(es.score_percentage) as lowest_score
      FROM n10l_courses c
      LEFT JOIN n10l_evaluation_sessions es ON c.id = es.course_week_id
      WHERE c.active = TRUE
      GROUP BY c.id, c.week_number, c.week_name, c.scenario_title
      ORDER BY c.week_number
    `);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Token verification endpoint
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role
  });
});

// Evaluation statistics endpoint  
app.get('/api/evaluations/stats', authenticateToken, async (req, res) => {
  try {
    // Get overall statistics
    const [totalResult] = await pool.query(
      'SELECT COUNT(*) as total FROM n10l_evaluation_sessions WHERE status = "completed"'
    );
    
    const [avgResult] = await pool.query(
      'SELECT AVG(score_percentage) as average FROM n10l_evaluation_sessions WHERE status = "completed"'
    );
    
    const [recentResult] = await pool.query(
      'SELECT COUNT(*) as recent FROM n10l_evaluation_sessions WHERE status = "completed" AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );
    
    // Get weekly statistics
    const [weeklyResult] = await pool.query(`
      SELECT 
        s.course_week_id as courseId,
        COUNT(*) as completions,
        AVG(s.score_percentage) as averageScore,
        COUNT(DISTINCT s.student_name) as totalStudents
      FROM n10l_evaluation_sessions s
      WHERE s.status = 'completed'
      GROUP BY s.course_week_id
    `);

    res.json({
      totalEvaluations: totalResult[0].total,
      averageScore: Math.round(avgResult[0].average || 0),
      recentEvaluations: recentResult[0].recent,
      weeklyStats: weeklyResult.map(w => ({
        courseId: w.courseId,
        completions: w.completions,
        averageScore: Math.round(w.averageScore || 0),
        totalStudents: w.totalStudents
      }))
    });
  } catch (error) {
    console.error('Error fetching evaluation stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export evaluation data (admin only)
app.get('/api/evaluations/export/:courseId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { courseId } = req.params;
    
    const [results] = await pool.query(`
      SELECT 
        s.student_name,
        s.evaluator_name,
        s.session_date,
        s.scenario_time,
        s.score_percentage,
        s.total_items,
        s.passed_items,
        s.failed_items,
        s.started_at,
        s.completed_at,
        c.week_name,
        c.scenario_title
      FROM n10l_evaluation_sessions s
      JOIN n10l_courses c ON s.course_week_id = c.id
      WHERE s.course_week_id = ? AND s.status = 'completed'
      ORDER BY s.completed_at DESC
    `, [courseId]);

    // Convert to CSV
    const csvHeaders = 'Student Name,Evaluator,Session Date,Scenario Time,Score %,Total Items,Passed,Failed,Started At,Completed At,Week,Scenario Title\n';
    const csvRows = results.map(row => 
      `"${row.student_name}","${row.evaluator_name}","${row.session_date}","${row.scenario_time || ''}","${row.score_percentage}","${row.total_items}","${row.passed_items}","${row.failed_items}","${row.started_at}","${row.completed_at}","${row.week_name}","${row.scenario_title}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="week_${courseId}_evaluations.csv"`);
    res.send(csvHeaders + csvRows);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export detailed evaluation data with individual answers (admin only)
app.get('/api/evaluations/export-detailed/:courseId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { courseId } = req.params;
    
    // Get evaluation sessions with individual items
    const [results] = await pool.query(`
      SELECT 
        s.id as session_id,
        s.student_name,
        s.evaluator_name,
        s.session_date,
        s.scenario_time,
        s.score_percentage,
        s.total_items,
        s.passed_items,
        s.failed_items,
        s.started_at,
        s.completed_at,
        c.week_name,
        c.scenario_title,
        i.section_name,
        i.item_description,
        i.item_key,
        i.status as item_status,
        i.checked_at,
        i.notes as item_notes
      FROM n10l_evaluation_sessions s
      JOIN n10l_courses c ON s.course_week_id = c.id
      LEFT JOIN n10l_evaluation_items i ON s.id = i.session_id
      WHERE s.course_week_id = ? AND s.status = 'completed'
      ORDER BY s.completed_at DESC, s.student_name, i.section_name, i.item_description
    `, [courseId]);

    // Convert to CSV with individual items
    const csvHeaders = 'Student Name,Evaluator,Session Date,Scenario Time,Overall Score %,Total Items,Passed,Failed,Started At,Completed At,Week,Scenario Title,Section,Item Description,Item Key,Item Status,Item Completed At,Item Notes\n';
    const csvRows = results.map(row => 
      `"${row.student_name}","${row.evaluator_name}","${row.session_date}","${row.scenario_time || ''}","${row.score_percentage}","${row.total_items}","${row.passed_items}","${row.failed_items}","${row.started_at}","${row.completed_at}","${row.week_name}","${row.scenario_title}","${row.section_name || ''}","${row.item_description || ''}","${row.item_key || ''}","${row.item_status || ''}","${row.checked_at || ''}","${row.item_notes || ''}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="week_${courseId}_detailed_evaluations.csv"`);
    res.send(csvHeaders + csvRows);
  } catch (error) {
    console.error('Error exporting detailed data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// ACADEMIC MANAGEMENT API ENDPOINTS
// ==========================================

// Get student evaluations for admin dashboard
app.get('/api/academic/student-evaluations', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [evaluations] = await pool.query(`
      SELECT 
        es.id,
        es.student_name,
        es.evaluator_name,
        es.session_date,
        es.scenario_time,
        es.status,
        es.started_at,
        es.completed_at,
        es.total_items,
        es.passed_items,
        es.failed_items,
        es.score_percentage,
        c.week_number,
        c.week_name,
        c.scenario_title,
        CASE 
          WHEN es.score_percentage >= 80 THEN 'PASS'
          WHEN es.score_percentage >= 70 THEN 'CONDITIONAL'
          ELSE 'FAIL'
        END as grade_status
      FROM n10l_evaluation_sessions es
      LEFT JOIN n10l_courses c ON es.course_week_id = c.id
      WHERE es.status = 'completed'
      ORDER BY es.completed_at DESC
    `);

    console.log(`Fetched student evaluations: ${evaluations.length} records`);
    res.json(evaluations);
  } catch (error) {
    console.error('Error fetching student evaluations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all semesters (admin only)
app.get('/api/academic/semesters', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [semesters] = await pool.query(`
      SELECT 
        s.*,
        COUNT(DISTINCT c.id) as cohort_count,
        COUNT(DISTINCT e.id) as student_count
      FROM n10l_semesters s
      LEFT JOIN n10l_student_cohorts c ON s.id = c.semester_id
      LEFT JOIN n10l_student_enrollments e ON c.id = e.cohort_id
      GROUP BY s.id
      ORDER BY s.start_date DESC
    `);
    
    logger.info('Fetched semesters data', { 
      service: 'n10l-server', 
      count: semesters.length,
      user: req.user.username 
    });
    
    res.json(semesters);
  } catch (error) {
    console.error('Error fetching semesters:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new semester (admin only)
app.post('/api/academic/semesters', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { semester_name, semester_code, start_date, end_date } = req.body;
    
    if (!semester_name || !semester_code || !start_date || !end_date) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check for duplicate semester code
    const [existing] = await pool.query('SELECT id FROM n10l_semesters WHERE semester_code = ?', [semester_code]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Semester code already exists' });
    }

    const [result] = await pool.query(`
      INSERT INTO n10l_semesters (semester_name, semester_code, start_date, end_date)
      VALUES (?, ?, ?, ?)
    `, [semester_name, semester_code, start_date, end_date]);

    logger.info('Created new semester', {
      service: 'n10l-server',
      semesterId: result.insertId,
      semesterCode: semester_code,
      user: req.user.username
    });

    res.status(201).json({ 
      id: result.insertId, 
      message: 'Semester created successfully' 
    });
  } catch (error) {
    console.error('Error creating semester:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Activate a semester (set is_active=true, optionally deactivate others)
app.post('/api/academic/semesters/:id/activate', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    // Ensure semester exists
    const [rows] = await pool.query('SELECT id FROM n10l_semesters WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Semester not found' });
    // Deactivate others
    await pool.query('UPDATE n10l_semesters SET is_active = FALSE WHERE id != ?', [id]);
    // Activate target
    await pool.query('UPDATE n10l_semesters SET is_active = TRUE WHERE id = ?', [id]);
    logger.info('Activated semester', { service:'n10l-server', semesterId:id, user:req.user.username });
    res.json({ message: 'Semester activated' });
  } catch (err) {
    console.error('Error activating semester:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Deactivate a semester
app.post('/api/academic/semesters/:id/deactivate', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const [rows] = await pool.query('SELECT id FROM n10l_semesters WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Semester not found' });
    await pool.query('UPDATE n10l_semesters SET is_active = FALSE WHERE id = ?', [id]);
    logger.info('Deactivated semester', { service:'n10l-server', semesterId:id, user:req.user.username });
    res.json({ message: 'Semester deactivated' });
  } catch (err) {
    console.error('Error deactivating semester:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete semester (only if no cohorts attached)
app.delete('/api/academic/semesters/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const [exists] = await pool.query('SELECT id FROM n10l_semesters WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ error: 'Semester not found' });
    const [cohortCountRows] = await pool.query('SELECT COUNT(*) as cnt FROM n10l_student_cohorts WHERE semester_id = ?', [id]);
    const hasCohorts = cohortCountRows[0].cnt > 0;
    if (hasCohorts) {
      return res.status(400).json({ error: 'Cannot delete semester with existing cohorts. Delete or move cohorts first.' });
    }
    await pool.query('DELETE FROM n10l_semesters WHERE id = ?', [id]);
    logger.info('Deleted semester', { service: 'n10l-server', semesterId: id, user: req.user.username });
    res.json({ message: 'Semester deleted' });
  } catch (err) {
    console.error('Error deleting semester:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all cohorts (admin only)
app.get('/api/academic/cohorts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [cohorts] = await pool.query(`
      SELECT 
        c.*,
        s.semester_name,
        COUNT(DISTINCT e.id) as student_count
      FROM n10l_student_cohorts c
      JOIN n10l_semesters s ON c.semester_id = s.id
      LEFT JOIN n10l_student_enrollments e ON c.id = e.cohort_id
      GROUP BY c.id, s.id
      ORDER BY s.start_date DESC, c.cohort_name
    `);
    
    logger.info('Fetched cohorts data', { 
      service: 'n10l-server', 
      count: cohorts.length,
      user: req.user.username 
    });
    
    res.json(cohorts);
  } catch (error) {
    console.error('Error fetching cohorts:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Student progress (scores by week) for admin dashboard
app.get('/api/academic/progress', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { semester_id, cohort_id } = req.query;

    // 1. Pull enrollments (filtered)
    let enrollmentSql = `
      SELECT e.student_name, e.cohort_id, c.cohort_name, e.semester_id, s.semester_name
      FROM n10l_student_enrollments e
      JOIN n10l_student_cohorts c ON e.cohort_id = c.id
      JOIN n10l_semesters s ON e.semester_id = s.id
      WHERE e.status = 'active'
    `;
    const params = [];
    if (semester_id) { enrollmentSql += ' AND e.semester_id = ?'; params.push(semester_id); }
    if (cohort_id) { enrollmentSql += ' AND e.cohort_id = ?'; params.push(cohort_id); }
    enrollmentSql += ' ORDER BY e.student_name';

    const [enrollments] = await pool.query(enrollmentSql, params);
    const studentNames = enrollments.map(r => r.student_name);

    // Map for quick lookup
    const baseMap = new Map();
    enrollments.forEach(r => {
      baseMap.set(r.student_name, {
        studentName: r.student_name,
        cohortId: r.cohort_id,
        cohortName: r.cohort_name,
        semesterId: r.semester_id,
        semesterName: r.semester_name,
        weeks: [] // fill later
      });
    });

    // 2. Pull evaluation summaries (latest completed per week per student)
    let evalSql = `
      SELECT es.student_name, c.week_number, c.week_name,
             SUBSTRING_INDEX(GROUP_CONCAT(es.score_percentage ORDER BY es.completed_at DESC), ',', 1) AS score_percentage,
             SUBSTRING_INDEX(GROUP_CONCAT(
               CASE 
                 WHEN es.score_percentage >= 80 THEN 'PASS'
                 WHEN es.score_percentage >= 70 THEN 'CONDITIONAL'
                 ELSE 'FAIL'
               END ORDER BY es.completed_at DESC), ',', 1) AS grade_status
      FROM n10l_evaluation_sessions es
      JOIN n10l_courses c ON es.course_week_id = c.id
      WHERE es.status = 'completed'
    `;
    const evalParams = [];
    if (studentNames.length) {
      evalSql += ` AND es.student_name IN (${studentNames.map(() => '?').join(',')})`;
      evalParams.push(...studentNames);
    }
    evalSql += ' GROUP BY es.student_name, c.week_number, c.week_name';

    let evalRows = [];
    if (studentNames.length) {
      const [rows] = await pool.query(evalSql, evalParams);
      evalRows = rows;
    }

    // 3. Organize evaluations into map keyed by student -> week_number
    const evalMap = new Map(); // key: student::week -> data
    evalRows.forEach(r => {
      evalMap.set(`${r.student_name}::${r.week_number}`, r);
    });

    // 4. Ensure all students have week placeholders (1..5 default)
    const DEFAULT_WEEKS = [1,2,3,4,5];
    baseMap.forEach(studentObj => {
      studentObj.weeks = DEFAULT_WEEKS.map(n => {
        const rec = evalMap.get(`${studentObj.studentName}::${n}`);
        if (rec) {
          return {
            weekNumber: n,
            weekName: rec.week_name || `Week ${n}`,
            score: rec.score_percentage !== null ? Number(rec.score_percentage) : null,
            gradeStatus: rec.grade_status || null
          };
        }
        return { weekNumber: n, weekName: `Week ${n}`, score: null, gradeStatus: null };
      });
    });

    // 5. Include evaluation-only students not in enrollment (edge case)
    evalRows.forEach(r => {
      if (!baseMap.has(r.student_name)) {
        const weeks = DEFAULT_WEEKS.map(n => {
          if (n === r.week_number) {
            return { weekNumber: n, weekName: r.week_name, score: Number(r.score_percentage), gradeStatus: r.grade_status };
          }
          return { weekNumber: n, weekName: `Week ${n}`, score: null, gradeStatus: null };
        });
        baseMap.set(r.student_name, {
          studentName: r.student_name,
            cohortId: null,
            cohortName: 'Unassigned',
            semesterId: null,
            semesterName: 'Unknown',
            weeks
        });
      }
    });

    res.json(Array.from(baseMap.values()));
  } catch (error) {
    console.error('Error building academic progress:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove a student's evaluation data (admin cleanup for test / rogue entries)
app.delete('/api/academic/students/:studentName/cleanup', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { studentName } = req.params;
    if (!studentName) return res.status(400).json({ error: 'studentName required' });

    // Check if student is enrolled; if enrolled warn but still allow (client can decide to block)
    const [enroll] = await pool.query('SELECT id FROM n10l_student_enrollments WHERE student_name = ? LIMIT 1', [studentName]);
    const enrolled = enroll.length > 0;

    // Delete evaluation sessions (cascade removes items), live sessions & legacy entries
    const [sessCount] = await pool.query('SELECT COUNT(*) as cnt FROM n10l_evaluation_sessions WHERE student_name = ?', [studentName]);
    const evaluationsFound = sessCount[0].cnt;
    await pool.query('DELETE FROM n10l_live_sessions WHERE student_name = ?', [studentName]);
    await pool.query('DELETE FROM n10l_evaluation_sessions WHERE student_name = ?', [studentName]);
    await pool.query('DELETE FROM n10l_evaluations WHERE student_name = ?', [studentName]);

    res.json({ removedEvaluations: evaluationsFound, enrolled });
  } catch (error) {
    console.error('Error cleaning student evaluations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new cohort (admin only)
app.post('/api/academic/cohorts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { semester_id, cohort_name, cohort_code, instructor_name, max_students } = req.body;
    
    if (!semester_id || !cohort_name || !cohort_code) {
      return res.status(400).json({ error: 'Semester, cohort name, and code are required' });
    }

    let finalSemesterId = semester_id;

    // Check if semester_id is a number (existing semester) or string (new semester name)
    if (isNaN(semester_id)) {
      // It's a semester name, check if it exists or create it
      const [existingSemester] = await pool.query(
        'SELECT id FROM n10l_semesters WHERE semester_name = ?', 
        [semester_id]
      );
      
      if (existingSemester.length > 0) {
        finalSemesterId = existingSemester[0].id;
      } else {
        // Create new semester with default dates
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        const semesterCode = semester_id.replace(/\s+/g, '').toUpperCase();
        
        const [semesterResult] = await pool.query(`
          INSERT INTO n10l_semesters (semester_name, semester_code, start_date, end_date)
          VALUES (?, ?, ?, ?)
        `, [
          semester_id,
          semesterCode,
          `${currentYear}-08-15`, // Default start date
          `${nextYear}-05-15`     // Default end date
        ]);
        
        finalSemesterId = semesterResult.insertId;
        
        logger.info('Created new semester', {
          service: 'n10l-server',
          semesterId: finalSemesterId,
          semesterName: semester_id,
          user: req.user.username
        });
      }
    }

    // Check for duplicate cohort code within semester
    const [existing] = await pool.query(
      'SELECT id FROM n10l_student_cohorts WHERE cohort_code = ? AND semester_id = ?', 
      [cohort_code, finalSemesterId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Cohort code already exists in this semester' });
    }

    const [result] = await pool.query(`
      INSERT INTO n10l_student_cohorts (semester_id, cohort_name, cohort_code, instructor_name, max_students)
      VALUES (?, ?, ?, ?, ?)
    `, [finalSemesterId, cohort_name, cohort_code, instructor_name || null, max_students || 30]);

    logger.info('Created new cohort', {
      service: 'n10l-server',
      cohortId: result.insertId,
      cohortCode: cohort_code,
      semesterId: finalSemesterId,
      user: req.user.username
    });

    res.status(201).json({ 
      id: result.insertId, 
      message: 'Cohort created successfully' 
    });
  } catch (error) {
    console.error('Error creating cohort:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single cohort details (admin only)
app.get('/api/academic/cohorts/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const [cohorts] = await pool.query(`
      SELECT 
        c.*,
        s.semester_name,
        s.semester_code
      FROM n10l_student_cohorts c
      JOIN n10l_semesters s ON c.semester_id = s.id
      WHERE c.id = ?
    `, [id]);

    if (cohorts.length === 0) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    res.json(cohorts[0]);
  } catch (error) {
    console.error('Error fetching cohort details:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update cohort (admin only)
app.put('/api/academic/cohorts/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    let { cohort_name, cohort_code, semester_id, instructor_name, max_students, is_active } = req.body;

    if (!cohort_name || !cohort_code || !semester_id) {
      return res.status(400).json({ error: 'cohort_name, cohort_code and semester_id are required' });
    }

    // Ensure cohort exists
    const [existingCohort] = await pool.query('SELECT id FROM n10l_student_cohorts WHERE id = ?', [id]);
    if (existingCohort.length === 0) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Semester may be a name; resolve to ID
    let finalSemesterId = semester_id;
    if (isNaN(semester_id)) {
      const semesterName = semester_id.trim();
      const [found] = await pool.query('SELECT id FROM n10l_semesters WHERE semester_name = ?', [semesterName]);
      if (found.length > 0) {
        finalSemesterId = found[0].id;
      } else {
        const yearMatch = semesterName.match(/(20\d{2})/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : (new Date().getFullYear());
        const nextYear = year + 1;
        const semesterCode = semesterName.replace(/\s+/g,'').toUpperCase().slice(0,12);
        const [created] = await pool.query(
          'INSERT INTO n10l_semesters (semester_name, semester_code, start_date, end_date) VALUES (?,?,?,?)',
          [semesterName, semesterCode, `${year}-08-15`, `${nextYear}-05-15`]
        );
        finalSemesterId = created.insertId;
        logger.info('Created semester during cohort update', { service:'n10l-server', semesterId: finalSemesterId, semesterName });
      }
    }

    // Prevent duplicate cohort code within semester (excluding current)
    const [duplicate] = await pool.query(
      'SELECT id FROM n10l_student_cohorts WHERE cohort_code = ? AND semester_id = ? AND id != ?',
      [cohort_code, finalSemesterId, id]
    );
    if (duplicate.length > 0) {
      return res.status(400).json({ error: 'Cohort code already exists in this semester' });
    }

    await pool.query(`
      UPDATE n10l_student_cohorts
      SET cohort_name = ?, cohort_code = ?, semester_id = ?, instructor_name = ?, max_students = ?, is_active = ?
      WHERE id = ?
    `, [cohort_name, cohort_code, finalSemesterId, instructor_name || null, max_students || 30, !!is_active, id]);

    logger.info('Updated cohort', { service: 'n10l-server', cohortId: id, semesterId: finalSemesterId, user: req.user.username });
    res.json({ message: 'Cohort updated successfully' });
  } catch (error) {
    console.error('Error updating cohort:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete cohort (admin only)
app.delete('/api/academic/cohorts/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Check if cohort exists
    const [existing] = await pool.query('SELECT id FROM n10l_student_cohorts WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Delete related records first (cascading delete)
    await pool.query('DELETE FROM n10l_student_enrollments WHERE cohort_id = ?', [id]);
    await pool.query('DELETE FROM n10l_student_cohorts WHERE id = ?', [id]);

    logger.info('Deleted cohort', {
      service: 'n10l-server',
      cohortId: id,
      user: req.user.username
    });

    res.json({ message: 'Cohort deleted successfully' });
  } catch (error) {
    console.error('Error deleting cohort:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get cohort enrollments (admin only)
app.get('/api/academic/cohorts/:id/enrollments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const [enrollments] = await pool.query(`
      SELECT e.*
      FROM n10l_student_enrollments e
      WHERE e.cohort_id = ?
      ORDER BY e.enrollment_date DESC
    `, [id]);

    // Add evaluation stats separately to avoid collation issues
    for (let enrollment of enrollments) {
      const [evalStats] = await pool.query(`
        SELECT 
          COUNT(*) as total_evaluations,
          AVG(CASE WHEN status = 'completed' THEN score_percentage END) as avg_score
        FROM n10l_evaluation_sessions 
        WHERE student_name = ?
      `, [enrollment.student_name]);
      
      enrollment.total_evaluations = evalStats[0].total_evaluations || 0;
      enrollment.avg_score = evalStats[0].avg_score || null;
    }

    res.json(enrollments);
  } catch (error) {
    console.error('Error fetching cohort enrollments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Enroll student in cohort (admin only)
app.post('/api/academic/cohorts/:id/enroll', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { student_name } = req.body;

    if (!student_name) {
      return res.status(400).json({ error: 'Student name is required' });
    }

    // Check if cohort exists
    const [cohort] = await pool.query('SELECT * FROM n10l_student_cohorts WHERE id = ?', [id]);
    if (cohort.length === 0) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Check if student is already enrolled
    const [existing] = await pool.query(
      'SELECT id FROM n10l_student_enrollments WHERE student_name = ? AND cohort_id = ?',
      [student_name, id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Student is already enrolled in this cohort' });
    }

    // Check cohort capacity
    const [currentCount] = await pool.query(
      'SELECT COUNT(*) as count FROM n10l_student_enrollments WHERE cohort_id = ?',
      [id]
    );
    if (currentCount[0].count >= cohort[0].max_students) {
      return res.status(400).json({ error: 'Cohort is at maximum capacity' });
    }

    await pool.query(`
      INSERT INTO n10l_student_enrollments (student_name, semester_id, cohort_id)
      VALUES (?, ?, ?)
    `, [student_name, cohort[0].semester_id, id]);

    logger.info('Student enrolled in cohort', {
      service: 'n10l-server',
      studentName: student_name,
      cohortId: id,
      user: req.user.username
    });

    res.status(201).json({ message: 'Student enrolled successfully' });
  } catch (error) {
    console.error('Error enrolling student:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove student from cohort (admin only)
app.delete('/api/academic/cohorts/:id/unenroll', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { student_name } = req.body;

    if (!student_name) {
      return res.status(400).json({ error: 'Student name is required' });
    }

    const result = await pool.query(
      'DELETE FROM n10l_student_enrollments WHERE student_name = ? AND cohort_id = ?',
      [student_name, id]
    );

    if (result[0].affectedRows === 0) {
      return res.status(404).json({ error: 'Student enrollment not found' });
    }

    logger.info('Student removed from cohort', {
      service: 'n10l-server',
      studentName: student_name,
      cohortId: id,
      user: req.user.username
    });

    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    console.error('Error removing student:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export cohort data (admin only)
app.get('/api/academic/cohorts/:id/export', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Get cohort info
    const [cohort] = await pool.query(`
      SELECT c.*, s.semester_name, s.academic_year
      FROM n10l_student_cohorts c
      JOIN n10l_semesters s ON c.semester_id = s.id
      WHERE c.id = ?
    `, [id]);

    if (cohort.length === 0) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Get detailed enrollment and evaluation data
    const [data] = await pool.query(`
      SELECT 
        e.student_name,
        e.enrollment_date,
        COUNT(es.id) as total_evaluations,
        COUNT(CASE WHEN es.status = 'completed' THEN 1 END) as completed_evaluations,
        AVG(CASE WHEN es.status = 'completed' THEN es.score_percentage END) as avg_score,
        MAX(CASE WHEN es.status = 'completed' THEN es.score_percentage END) as best_score,
        MIN(CASE WHEN es.status = 'completed' THEN es.score_percentage END) as lowest_score,
        MAX(es.completed_at) as last_evaluation
      FROM n10l_student_enrollments e
      LEFT JOIN n10l_evaluation_sessions es ON e.student_name = es.student_name
      WHERE e.cohort_id = ?
      GROUP BY e.id, e.student_name, e.enrollment_date
      ORDER BY e.student_name
    `, [id]);

    // Convert to CSV
    const csvHeaders = 'Student Name,Enrollment Date,Total Evaluations,Completed,Average Score,Best Score,Lowest Score,Last Evaluation,Semester,Cohort\n';
    const csvRows = data.map(row => 
      `"${row.student_name}","${row.enrollment_date}","${row.total_evaluations}","${row.completed_evaluations}","${row.avg_score || 'N/A'}","${row.best_score || 'N/A'}","${row.lowest_score || 'N/A'}","${row.last_evaluation || 'N/A'}","${cohort[0].semester_name}","${cohort[0].cohort_name}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${cohort[0].cohort_code}_cohort_data.csv"`);
    res.send(csvHeaders + csvRows);
  } catch (error) {
    console.error('Error exporting cohort data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get student progress by semester/cohort (admin only)
app.get('/api/academic/progress', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { semester_id, cohort_id } = req.query;
    
    let whereClause = '';
    let params = [];
    
    if (semester_id) {
      whereClause += ' AND se.semester_id = ?';
      params.push(semester_id);
    }
    
    if (cohort_id) {
      whereClause += ' AND se.cohort_id = ?';
      params.push(cohort_id);
    }

    const [progress] = await pool.query(`
      SELECT 
        se.student_name,
        sc.cohort_name,
        sem.semester_name,
        co.week_number,
        co.week_name,
        es.score_percentage,
        es.status as evaluation_status,
        es.completed_at,
        CASE 
          WHEN es.score_percentage >= co.passing_score_percent THEN 'PASS'
          WHEN es.score_percentage < co.passing_score_percent THEN 'FAIL'
          ELSE 'INCOMPLETE'
        END as grade_status
      FROM n10l_student_enrollments se
      JOIN n10l_student_cohorts sc ON se.cohort_id = sc.id
      JOIN n10l_semesters sem ON se.semester_id = sem.id
      CROSS JOIN n10l_courses co
      LEFT JOIN n10l_evaluation_sessions es ON (
        se.id = es.student_enrollment_id 
        AND co.id = es.course_week_id
      )
      WHERE se.status = 'active' AND co.is_active = TRUE ${whereClause}
      ORDER BY se.student_name, co.week_number
    `, params);
    
    // Group by student
    const studentProgress = {};
    progress.forEach(row => {
      if (!studentProgress[row.student_name]) {
        studentProgress[row.student_name] = {
          studentName: row.student_name,
          cohortName: row.cohort_name,
          semesterName: row.semester_name,
          weeks: []
        };
      }
      
      studentProgress[row.student_name].weeks.push({
        weekNumber: row.week_number,
        weekName: row.week_name,
        score: row.score_percentage,
        status: row.evaluation_status,
        gradeStatus: row.grade_status,
        completedAt: row.completed_at
      });
    });
    
    res.json(Object.values(studentProgress));
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve client files with friendly routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/admin.html'));
});

app.get('/academic-admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/academic-admin.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dashboard.html'));
});

app.get('/personal-care', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/PersonalCare.html'));
});

// Week evaluation routes
app.get('/vital-signs', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/VitalSigns.html'));
});

app.get('/medications', (req, res) => {
  // TODO: Create Medications.html  
  res.status(501).send('Week 3: Medication Administration - Coming Soon!');
});

app.get('/gtube-care', (req, res) => {
  // TODO: Create GTubeCare.html
  res.status(501).send('Week 4: G-tube Management - Coming Soon!');
});

app.get('/physical-exam', (req, res) => {
  // TODO: Create PhysicalExam.html
  res.status(501).send('Week 5: Physical Examination - Coming Soon!');
});

// Speech-to-Text API endpoints
app.post('/api/speech/save', async (req, res) => {
  const logger = require('./utils/logger');
  
  try {
    const {
      sessionId,
      studentName,
      courseId,
      transcript,
      interimTranscript,
      isFinal,
      startTime,
      timestamp,
      duration
    } = req.body;

    // Validate required fields
    if (!studentName || !transcript) {
      return res.status(400).json({ 
        error: 'Missing required fields: studentName and transcript are required' 
      });
    }

    // Check if session already exists and append transcript, otherwise insert new record
    let result;
    if (sessionId) {
      // Get existing record to append to current transcript
      const [existingRecords] = await pool.execute(`
        SELECT id, transcript, created_at FROM speech_transcriptions WHERE session_id = ?
      `, [sessionId]);

      if (existingRecords.length > 0) {
        // Existing session found - append new transcript with timing
        const existingRecord = existingRecords[0];
        const timeSinceStart = startTime ? (new Date() - new Date(existingRecord.created_at)) / 1000 : 0;
        
        // Create timestamp marker for this segment
        const timeMarker = `\n[${Math.floor(timeSinceStart / 60)}:${String(Math.floor(timeSinceStart % 60)).padStart(2, '0')}] `;
        
        // Append new transcript to existing (with improved deduplication)
        const existingTranscript = existingRecord.transcript || '';
        const newContent = transcript.trim();
        
        let combinedTranscript;
        if (existingTranscript.length === 0) {
          // First segment - no time marker needed
          combinedTranscript = newContent;
        } else {
          // Check if newContent is a proper extension or completely different content
          const lastSegmentMatch = existingTranscript.match(/\n\[\d+:\d+\] (.*)$/) || [null, existingTranscript];
          const lastSegment = lastSegmentMatch[1] || existingTranscript;
          
          // If new content starts with the last segment, it's likely an extension
          if (newContent.startsWith(lastSegment)) {
            // Extract only the new part that extends beyond the last segment
            const extensionPart = newContent.substring(lastSegment.length).trim();
            if (extensionPart.length > 0) {
              // Only append the new extension part
              combinedTranscript = existingTranscript + ' ' + extensionPart;
            } else {
              // No new content, keep existing
              combinedTranscript = existingTranscript;
            }
          } else if (lastSegment.startsWith(newContent)) {
            // New content is a subset of the last segment, don't append
            combinedTranscript = existingTranscript;
          } else if (existingTranscript.includes(newContent)) {
            // Exact content already exists somewhere, don't append
            combinedTranscript = existingTranscript;
          } else {
            // Completely new content, append with time marker
            combinedTranscript = existingTranscript + timeMarker + newContent;
          }
        }
        
        const [updateResult] = await pool.execute(`
          UPDATE speech_transcriptions 
          SET transcript = ?, interim_transcript = ?, is_final = ?, duration_seconds = ?
          WHERE session_id = ?
        `, [
          combinedTranscript,
          interimTranscript || '',
          isFinal || false,
          duration || 0,
          sessionId
        ]);
        
        result = { insertId: existingRecord.id, affectedRows: updateResult.affectedRows };
      } else {
        // No existing record found, create new one
        const [insertResult] = await pool.execute(`
          INSERT INTO speech_transcriptions 
          (session_id, student_name, course_id, transcript, interim_transcript, is_final, start_time, duration_seconds) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sessionId,
          studentName,
          courseId || null,
          transcript,
          interimTranscript || '',
          isFinal || false,
          startTime ? new Date(startTime) : null,
          duration || 0
        ]);
        result = insertResult;
      }
    } else {
      // No session ID provided, create new record
      const [insertResult] = await pool.execute(`
        INSERT INTO speech_transcriptions 
        (session_id, student_name, course_id, transcript, interim_transcript, is_final, start_time, duration_seconds) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        sessionId || null,
        studentName,
        courseId || null,
        transcript,
        interimTranscript || '',
        isFinal || false,
        startTime ? new Date(startTime) : null,
        duration || 0
      ]);
      result = insertResult;
    }

    logger.info('Speech transcription saved', {
      id: result.insertId,
      studentName,
      courseId,
      sessionId,
      isFinal,
      transcriptLength: transcript.length,
      service: 'speech-api'
    });

    res.json({
      success: true,
      id: result.insertId,
      message: 'Speech transcription saved successfully'
    });

  } catch (error) {
    logger.error('Failed to save speech transcription', {
      error: error.message,
      stack: error.stack,
      service: 'speech-api'
    });
    
    res.status(500).json({ 
      error: 'Failed to save speech transcription',
      details: error.message 
    });
  }
});

app.get('/api/speech/session/:sessionId', async (req, res) => {
  const logger = require('./utils/logger');
  
  try {
    const { sessionId } = req.params;

    const [rows] = await pool.execute(`
      SELECT 
        id,
        session_id,
        student_name,
        course_id,
        transcript,
        interim_transcript,
        is_final,
        start_time,
        created_at,
        duration_seconds
      FROM speech_transcriptions 
      WHERE session_id = ? 
      ORDER BY created_at ASC
    `, [sessionId]);

    res.json({
      success: true,
      sessionId,
      transcriptions: rows
    });

  } catch (error) {
    logger.error('Failed to retrieve session transcriptions', {
      error: error.message,
      sessionId: req.params.sessionId,
      service: 'speech-api'
    });
    
    res.status(500).json({ 
      error: 'Failed to retrieve transcriptions',
      details: error.message 
    });
  }
});

app.get('/api/admin/speech/all', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const logger = require('./utils/logger');
  
  try {
    const { limit = 50, offset = 0, studentName, courseId, isFinal } = req.query;

    let query = `
      SELECT 
        st.id,
        st.session_id,
        st.student_name,
        st.course_id,
        st.transcript,
        st.interim_transcript,
        st.is_final,
        st.start_time,
        st.created_at,
        st.duration_seconds
      FROM speech_transcriptions st
      WHERE 1=1
    `;
    
    const params = [];
    
    if (studentName) {
      query += ' AND st.student_name LIKE ?';
      params.push(`%${studentName}%`);
    }
    
    if (courseId) {
      query += ' AND st.course_id = ?';
      params.push(courseId);
    }
    
    if (isFinal !== undefined) {
      query += ' AND st.is_final = ?';
      params.push(isFinal === 'true');
    }
    
    // Validate and sanitize limit and offset for direct SQL insertion
    const sanitizedLimit = Math.max(1, Math.min(1000, parseInt(limit) || 50));
    const sanitizedOffset = Math.max(0, parseInt(offset) || 0);
    
    query += ` ORDER BY st.created_at DESC LIMIT ${sanitizedLimit} OFFSET ${sanitizedOffset}`;

    console.log('Speech query:', query);
    console.log('Speech params:', params);

    const [rows] = await pool.execute(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM speech_transcriptions WHERE 1=1';
    const countParams = [];
    
    if (studentName) {
      countQuery += ' AND student_name LIKE ?';
      countParams.push(`%${studentName}%`);
    }
    
    if (courseId) {
      countQuery += ' AND course_id = ?';
      countParams.push(courseId);
    }
    
    if (isFinal !== undefined) {
      countQuery += ' AND is_final = ?';
      countParams.push(isFinal === 'true');
    }

    const [countResult] = await pool.execute(countQuery, countParams);

    res.json({
      success: true,
      transcriptions: rows,
      pagination: {
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < countResult[0].total
      }
    });

  } catch (error) {
    logger.error('Failed to retrieve all transcriptions', {
      error: error.message,
      query: req.query,
      service: 'speech-api'
    });
    
    res.status(500).json({ 
      error: 'Failed to retrieve transcriptions',
      details: error.message 
    });
  }
});

app.delete('/api/admin/speech/:id', authenticateToken, async (req, res) => {
  const logger = require('./utils/logger');
  
  try {
    const { id } = req.params;

    const [result] = await pool.execute(`
      DELETE FROM speech_transcriptions WHERE id = ?
    `, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Speech transcription not found'
      });
    }

    logger.info('Speech transcription deleted', {
      id,
      service: 'speech-api'
    });

    res.json({
      success: true,
      message: 'Speech transcription deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete speech transcription', {
      error: error.message,
      id: req.params.id,
      service: 'speech-api'
    });
    
    res.status(500).json({ 
      error: 'Failed to delete transcription',
      details: error.message 
    });
  }
});

const port = Number(process.env.PORT || 3001);
// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));
// Also serve under /N10L when behind reverse proxy
app.use('/N10L', express.static(path.join(__dirname, '../client')));

initDb()
  .then(() => httpServer.listen(port, () => console.log(`N10L Evaluation Server with Socket.IO listening on ${port}. Open http://localhost:${port}/PersonalCare.html`)))
  .catch((e) => { console.error('DB init failed:', e); process.exit(1); });
