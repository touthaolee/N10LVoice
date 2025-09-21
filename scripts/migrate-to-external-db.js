#!/usr/bin/env node

/**
 * Database Migration Script for External MySQL
 * Applies N10L academic management schema to external database
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Database configuration from environment
const config = {
  host: process.env.DB_HOST || 'mysql-va-units',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'va_service', 
  password: process.env.DB_PASSWORD || 'service_pass_2024',
  database: process.env.DB_NAME || 'N10L',
  multipleStatements: true
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🔄 Connecting to external MySQL database...');
    console.log(`📍 Host: ${config.host}:${config.port}`);
    console.log(`🗄️  Database: ${config.database}`);
    
    // Connect to database
    connection = await mysql.createConnection(config);
    
    console.log('✅ Connected to external MySQL database');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '002_semester_management.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('📄 Loaded migration: 002_semester_management.sql');
    
    // Execute migration
    console.log('🚀 Executing migration...');
    await connection.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify tables were created
    const [tables] = await connection.query(`
      SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'n10l_%'
      ORDER BY TABLE_NAME
    `, [config.database]);
    
    console.log('\n📋 Database Tables Status:');
    console.log('===============================');
    tables.forEach(table => {
      console.log(`✓ ${table.TABLE_NAME} (${table.TABLE_ROWS || 0} rows)`);
    });
    
    // Check initial data
    const [semesters] = await connection.query('SELECT * FROM n10l_semesters ORDER BY start_date');
    const [cohorts] = await connection.query('SELECT * FROM n10l_student_cohorts ORDER BY created_at');
    
    console.log('\n📊 Initial Data:');
    console.log('=================');
    console.log(`📅 Semesters: ${semesters.length}`);
    semesters.forEach(sem => {
      console.log(`   • ${sem.semester_name} (${sem.semester_code}) - ${sem.is_active ? 'Active' : 'Inactive'}`);
    });
    
    console.log(`👥 Cohorts: ${cohorts.length}`);  
    cohorts.forEach(cohort => {
      console.log(`   • ${cohort.cohort_name} (${cohort.cohort_code})`);
    });
    
    console.log('\n🎉 N10L Database optimized for comprehensive admin interface!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Tip: Ensure external MySQL server is running and accessible');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Tip: Check database credentials in environment variables');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('💡 Tip: Database might not exist, creating it...');
      
      try {
        // Try to create database
        const adminConnection = await mysql.createConnection({
          ...config,
          database: undefined
        });
        
        await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`✅ Database ${config.database} created`);
        await adminConnection.end();
        
        // Retry migration
        console.log('🔄 Retrying migration...');
        return runMigration();
        
      } catch (createError) {
        console.error('❌ Failed to create database:', createError.message);
      }
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { runMigration };
