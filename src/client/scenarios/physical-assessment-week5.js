// Physical Assessment Week 5 - Configuration Only
export default {
  id: 'physical-assessment-week5',
  pageTitle: 'N10L - Physical Assessment Week 5',
  title: 'Physical Assessment Week 5',
  subtitle: 'Full Physical Assessment with Normal Description',
  defaultScenarioTime: '0900',
  contentPath: 'scenarios/physical-assessment-week5.html',
  
  // Speech-to-text configuration
  speech: {
    language: 'en-US',
    saveInterval: 10000, // Save every 10 seconds
    promptText: 'Recording physical assessment...'
  },
  
  // Evaluation configuration
  evaluation: {
    passingScore: 80,
    criticalItems: [
      'airway_assessment',
      'breathing_assessment', 
      'circulation_assessment',
      'neurological_assessment'
    ],
    storagePrefix: 'physicalAssessment'
  }
};