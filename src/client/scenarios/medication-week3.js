// Medication Week 3 - Configuration Only
export default {
  id: 'medication-week3',
  pageTitle: 'NURS 10L - Week 3 Medication Administration',
  title: 'Week 3 Medication Administration Evaluation',
  subtitle: 'Safe medication preparation and administration',
  defaultScenarioTime: '0900 (Medication pass)',
  contentPath: 'scenarios/medication-week3.html',
  
  // Speech-to-text configuration
  speech: {
    language: 'en-US',
    saveInterval: 12000, // Save every 12 seconds for medication
    promptText: 'Recording medication administration...'
  },
  
  // Evaluation configuration
  evaluation: {
    passingScore: 90, // Higher passing score for medication safety
    criticalItems: [
      'patient_identification',
      'medication_verification',
      'dosage_calculation',
      'route_confirmation',
      'timing_accuracy',
      'documentation'
    ],
    storagePrefix: 'medicationWeek3'
  }
};
