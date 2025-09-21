/**
 * Simple transcription cleanup without external dependencies
 */

const mysql = require('mysql2');

// Database configuration
const dbConfig = {
  host: 'mysql-va-units',
  port: 3306,
  user: 'va_service',
  password: 'service_pass_2024',
  database: 'N10L'
};

function removeRepetition(text) {
  if (!text) return text;
  
  // Split into words
  const words = text.split(/\s+/);
  const result = [];
  
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    
    // Check for immediate repetition
    if (i + 1 < words.length && words[i + 1] === word) {
      // Found repetition, add word once and skip duplicates
      result.push(word);
      i++;
      while (i < words.length && words[i] === word) {
        i++;
      }
    } else {
      result.push(word);
      i++;
    }
  }
  
  return result.join(' ');
}

function cleanupDatabase() {
  console.log('Starting database cleanup...');
  
  const connection = mysql.createConnection(dbConfig);
  
  connection.connect((err) => {
    if (err) {
      console.error('Database connection failed:', err);
      return;
    }
    console.log('Connected to database');
    
    // Get all transcription records
    connection.query(
      'SELECT id, transcript FROM speech_transcriptions WHERE transcript IS NOT NULL',
      (err, results) => {
        if (err) {
          console.error('Query failed:', err);
          connection.end();
          return;
        }
        
        console.log(`Found ${results.length} records to process`);
        let processed = 0;
        let updated = 0;
        
        results.forEach((record) => {
          const cleaned = removeRepetition(record.transcript);
          
          if (cleaned !== record.transcript) {
            // Update the record
            connection.query(
              'UPDATE speech_transcriptions SET transcript = ? WHERE id = ?',
              [cleaned, record.id],
              (updateErr) => {
                if (updateErr) {
                  console.error(`Failed to update record ${record.id}:`, updateErr);
                } else {
                  updated++;
                  console.log(`Updated record ${record.id}: ${record.transcript.length} -> ${cleaned.length} chars`);
                }
                
                processed++;
                if (processed === results.length) {
                  console.log(`Cleanup complete: ${updated} records updated out of ${results.length} total`);
                  connection.end();
                }
              }
            );
          } else {
            processed++;
            if (processed === results.length) {
              console.log(`Cleanup complete: ${updated} records updated out of ${results.length} total`);
              connection.end();
            }
          }
        });
        
        if (results.length === 0) {
          console.log('No records found to process');
          connection.end();
        }
      }
    );
  });
}

cleanupDatabase();