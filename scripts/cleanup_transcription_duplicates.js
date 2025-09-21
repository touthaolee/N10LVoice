#!/usr/bin/env node

/**
 * Speech Transcription Deduplication Utility
 * 
 * This script cleans up duplicated phrases in existing speech transcription records.
 * It identifies and removes repetitive content patterns that were created by the
 * faulty duplication detection logic.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'va_service',
  password: process.env.DB_PASSWORD || 'service_pass_2024',
  database: process.env.DB_NAME || 'N10L',
};

/**
 * Remove repetitive patterns from a transcript
 */
function deduplicateTranscript(transcript) {
  if (!transcript || transcript.length === 0) return transcript;
  
  // Split into segments by time markers
  const segments = transcript.split(/\n\[\d+:\d+\] /);
  const cleanedSegments = [];
  
  for (const segment of segments) {
    if (!segment.trim()) continue;
    
    // Remove repetitive word sequences within a segment
    const cleaned = removeWordRepetition(segment.trim());
    if (cleaned.length > 0) {
      cleanedSegments.push(cleaned);
    }
  }
  
  // Rejoin segments (first segment won't have time marker)
  if (cleanedSegments.length === 0) return '';
  if (cleanedSegments.length === 1) return cleanedSegments[0];
  
  // Add time markers back (simplified - just use incremental timing)
  let result = cleanedSegments[0];
  for (let i = 1; i < cleanedSegments.length; i++) {
    const timeMarker = `\n[${Math.floor(i * 10 / 60)}:${String((i * 10) % 60).padStart(2, '0')}] `;
    result += timeMarker + cleanedSegments[i];
  }
  
  return result;
}

/**
 * Remove word-level repetition patterns
 */
function removeWordRepetition(text) {
  const words = text.split(/\s+/);
  const cleanedWords = [];
  
  let i = 0;
  while (i < words.length) {
    const currentWord = words[i];
    
    // Look ahead to see if this word/phrase repeats
    let repeatLength = findRepeatLength(words, i);
    
    if (repeatLength > 0) {
      // Add the phrase once and skip the repetitions
      for (let j = 0; j < repeatLength; j++) {
        cleanedWords.push(words[i + j]);
      }
      
      // Skip past all repetitions
      i += repeatLength;
      while (i < words.length && wordsMatch(words, i, cleanedWords, cleanedWords.length - repeatLength, repeatLength)) {
        i += repeatLength;
      }
    } else {
      cleanedWords.push(currentWord);
      i++;
    }
  }
  
  return cleanedWords.join(' ');
}

/**
 * Find the length of a repeating pattern starting at position
 */
function findRepeatLength(words, startPos) {
  for (let len = 1; len <= Math.min(10, Math.floor((words.length - startPos) / 2)); len++) {
    if (startPos + len * 2 <= words.length) {
      if (wordsMatch(words, startPos, words, startPos + len, len)) {
        return len;
      }
    }
  }
  return 0;
}

/**
 * Check if two word sequences match
 */
function wordsMatch(words1, start1, words2, start2, length) {
  for (let i = 0; i < length; i++) {
    if (words1[start1 + i] !== words2[start2 + i]) {
      return false;
    }
  }
  return true;
}

/**
 * Main cleanup function
 */
async function cleanupTranscriptionDuplicates() {
  console.log('🧹 Starting transcription deduplication cleanup...');
  
  const pool = mysql.createPool(cfg);
  
  try {
    // Get all transcription records
    const [rows] = await pool.execute(`
      SELECT id, transcript, student_name, session_id, created_at
      FROM speech_transcriptions 
      WHERE transcript IS NOT NULL AND transcript != ''
      ORDER BY created_at DESC
    `);
    
    console.log(`📝 Found ${rows.length} transcription records to process`);
    
    let updatedCount = 0;
    let totalSavings = 0;
    
    for (const record of rows) {
      const originalLength = record.transcript.length;
      const cleanedTranscript = deduplicateTranscript(record.transcript);
      const newLength = cleanedTranscript.length;
      
      if (cleanedTranscript !== record.transcript) {
        // Update the record
        await pool.execute(`
          UPDATE speech_transcriptions 
          SET transcript = ?
          WHERE id = ?
        `, [cleanedTranscript, record.id]);
        
        updatedCount++;
        const savings = originalLength - newLength;
        totalSavings += savings;
        
        console.log(`✅ Updated record ${record.id} for ${record.student_name}`);
        console.log(`   Original: ${originalLength} chars -> Cleaned: ${newLength} chars (saved ${savings} chars)`);
        console.log(`   Session: ${record.session_id} | Date: ${record.created_at}`);
        
        // Show preview of changes
        if (originalLength < 200) {
          console.log(`   Before: "${record.transcript}"`);
          console.log(`   After:  "${cleanedTranscript}"`);
        } else {
          console.log(`   Before: "${record.transcript.substring(0, 100)}..."`);
          console.log(`   After:  "${cleanedTranscript.substring(0, 100)}..."`);
        }
        console.log('');
      }
    }
    
    console.log('🎉 Cleanup completed!');
    console.log(`📊 Statistics:`);
    console.log(`   - Total records processed: ${rows.length}`);
    console.log(`   - Records updated: ${updatedCount}`);
    console.log(`   - Total characters saved: ${totalSavings}`);
    console.log(`   - Average savings per updated record: ${updatedCount > 0 ? Math.round(totalSavings / updatedCount) : 0} chars`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the cleanup if called directly
if (require.main === module) {
  cleanupTranscriptionDuplicates()
    .then(() => {
      console.log('✅ Cleanup script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Cleanup script failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupTranscriptionDuplicates, deduplicateTranscript };