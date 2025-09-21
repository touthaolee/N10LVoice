-- Enhanced database structure for semester and cohort management
-- Fall 2025 / Spring 2026 academic cycle management

-- Create semesters table to manage academic periods
CREATE TABLE IF NOT EXISTS n10l_semesters (
    id INT PRIMARY KEY AUTO_INCREMENT,
    semester_name VARCHAR(100) NOT NULL, -- e.g., "Fall 2025", "Spring 2026"
    semester_code VARCHAR(20) NOT NULL UNIQUE, -- e.g., "F2025", "S2026"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_semester_active (is_active),
    INDEX idx_semester_dates (start_date, end_date)
);

-- Create student cohorts table for managing groups of students
CREATE TABLE IF NOT EXISTS n10l_student_cohorts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cohort_name VARCHAR(100) NOT NULL, -- e.g., "Fall 2025 Nursing Cohort A"
    cohort_code VARCHAR(20) NOT NULL, -- e.g., "F25-A", "S26-B"
    semester_id INT NOT NULL,
    instructor_name VARCHAR(255),
    max_students INT DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (semester_id) REFERENCES n10l_semesters(id) ON DELETE CASCADE,
    UNIQUE KEY unique_cohort_semester (cohort_code, semester_id),
    INDEX idx_cohort_active (is_active),
    INDEX idx_cohort_semester (semester_id)
);

-- Enhanced student enrollment table
CREATE TABLE IF NOT EXISTS n10l_student_enrollments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_name VARCHAR(255) NOT NULL,
    student_id VARCHAR(50), -- Optional student ID number
    cohort_id INT NOT NULL,
    semester_id INT NOT NULL,
    enrollment_date DATE DEFAULT (CURRENT_DATE),
    status ENUM('active', 'withdrawn', 'completed') DEFAULT 'active',
    final_grade VARCHAR(10), -- A, B, C, D, F, etc.
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cohort_id) REFERENCES n10l_student_cohorts(id) ON DELETE CASCADE,
    FOREIGN KEY (semester_id) REFERENCES n10l_semesters(id) ON DELETE CASCADE,
    UNIQUE KEY unique_student_cohort (student_name, cohort_id),
    INDEX idx_enrollment_status (status),
    INDEX idx_enrollment_semester (semester_id),
    INDEX idx_enrollment_cohort (cohort_id)
);

-- Enhanced courses table with semester linkage
ALTER TABLE n10l_courses 
ADD COLUMN semester_id INT,
ADD COLUMN week_description TEXT,
ADD COLUMN learning_objectives JSON,
ADD COLUMN total_possible_points INT DEFAULT 100,
ADD COLUMN passing_score_percent DECIMAL(5,2) DEFAULT 70.00,
ADD COLUMN is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
ADD FOREIGN KEY (semester_id) REFERENCES n10l_semesters(id) ON DELETE SET NULL,
ADD INDEX idx_course_semester (semester_id),
ADD INDEX idx_course_active (is_active);

-- Enhanced evaluation sessions with cohort tracking
ALTER TABLE n10l_evaluation_sessions
ADD COLUMN cohort_id INT,
ADD COLUMN semester_id INT,
ADD COLUMN student_enrollment_id INT,
ADD COLUMN evaluator_id INT, -- Link to users table for instructor
MODIFY COLUMN evaluator_name VARCHAR(255) NULL,
ADD FOREIGN KEY (cohort_id) REFERENCES n10l_student_cohorts(id) ON DELETE SET NULL,
ADD FOREIGN KEY (semester_id) REFERENCES n10l_semesters(id) ON DELETE SET NULL,
ADD FOREIGN KEY (student_enrollment_id) REFERENCES n10l_student_enrollments(id) ON DELETE SET NULL,
ADD FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE SET NULL,
ADD INDEX idx_session_cohort (cohort_id),
ADD INDEX idx_session_semester (semester_id),
ADD INDEX idx_session_enrollment (student_enrollment_id);

-- Create academic reporting views
CREATE OR REPLACE VIEW v_semester_progress AS
SELECT 
    s.semester_name,
    s.semester_code,
    c.cohort_name,
    COUNT(DISTINCT se.id) as total_students,
    COUNT(DISTINCT CASE WHEN se.status = 'active' THEN se.id END) as active_students,
    COUNT(DISTINCT es.id) as total_evaluations,
    COUNT(DISTINCT CASE WHEN es.status = 'completed' THEN es.id END) as completed_evaluations,
    AVG(es.score_percentage) as average_score,
    COUNT(DISTINCT es.course_week_id) as weeks_evaluated
FROM n10l_semesters s
LEFT JOIN n10l_student_cohorts c ON s.id = c.semester_id
LEFT JOIN n10l_student_enrollments se ON c.id = se.cohort_id
LEFT JOIN n10l_evaluation_sessions es ON se.id = es.student_enrollment_id
GROUP BY s.id, c.id;

CREATE OR REPLACE VIEW v_student_progress_by_week AS
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
WHERE se.status = 'active' AND co.is_active = TRUE
ORDER BY se.student_name, co.week_number;

-- Insert initial semester data
INSERT INTO n10l_semesters (semester_name, semester_code, start_date, end_date, is_active) VALUES
('Fall 2025', 'F2025', '2025-08-15', '2025-12-15', TRUE),
('Spring 2026', 'S2026', '2026-01-15', '2026-05-15', FALSE);

-- Insert initial cohort
INSERT INTO n10l_student_cohorts (cohort_name, cohort_code, semester_id, instructor_name) VALUES
('Fall 2025 Nursing Cohort A', 'F25-A', 1, 'Dr. Healthcare');

-- Update existing courses with semester linkage
UPDATE n10l_courses SET 
    semester_id = 1,
    week_description = CASE 
        WHEN week_number = 1 THEN 'Foundation skills in personal care, hygiene, and basic patient interaction'
        WHEN week_number = 2 THEN 'Vital signs assessment, documentation, and monitoring techniques'
        WHEN week_number = 3 THEN 'Medication administration safety, dosage calculations, and procedures'
        WHEN week_number = 4 THEN 'Wound care management, sterile technique, and infection control'
        WHEN week_number = 5 THEN 'Emergency response protocols, code blue procedures, and critical thinking'
    END,
    learning_objectives = CASE 
        WHEN week_number = 1 THEN JSON_ARRAY(
            'Demonstrate proper personal care techniques',
            'Maintain patient dignity and privacy',
            'Document care activities accurately'
        )
        WHEN week_number = 2 THEN JSON_ARRAY(
            'Accurately measure and document vital signs',
            'Recognize abnormal vital sign values',
            'Understand Glasgow Coma Scale assessment',
            'Perform PERRLA examination'
        )
        ELSE JSON_ARRAY('Learning objectives to be defined')
    END;
