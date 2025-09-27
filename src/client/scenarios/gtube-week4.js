// G-tube Week 4 - Configuration Only
export default {
  id: 'gtube-week4',
  pageTitle: 'N10L - G-tube Week 4',
  title: 'G-tube Week 4',
  subtitle: 'Gastronomy tube feeding procedure and safety assessment',
  defaultScenarioTime: '1200 (Lunch feeding)',
  contentPath: 'scenarios/gtube-week4.html',
  
  // Speech-to-text configuration  
  speech: {
    language: 'en-US',
    saveInterval: 10000, // Save every 10 seconds
    promptText: 'Recording G-tube procedure...'
  },
  
  // Evaluation configuration
  evaluation: {
    passingScore: 85,
    criticalItems: [
      'tube_verification',
      'feeding_safety',
      'aspiration_prevention',
      'medication_administration'
    ],
    storagePrefix: 'gtubeWeek4'
  }
};