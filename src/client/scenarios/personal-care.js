// Personal Care Week 1 - Configuration Only
export default {
  id: 'personal-care',
  pageTitle: 'NURS 10L - Personal Care Evaluation',
  title: 'NURS 10L - Personal Care Evaluation', 
  subtitle: 'Week 1 Peer Assessment',
  defaultScenarioTime: '0700 (Breakfast at 0730)',
  contentPath: 'scenarios/personal-care.html',
  
  // Speech-to-text configuration
  speech: {
    language: 'en-US',
    saveInterval: 15000, // Save every 15 seconds for basic care
    promptText: 'Recording personal care assessment...'
  },
  
  // Evaluation configuration
  evaluation: {
    passingScore: 75,
    criticalItems: [
      'privacy_dignity',
      'safety_measures',
      'infection_control',
      'communication'
    ],
    storagePrefix: 'personalCare'
  }
};
