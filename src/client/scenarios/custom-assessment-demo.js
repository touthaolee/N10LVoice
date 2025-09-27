// Custom Assessment Example - Configuration Only (20 lines!)
export default {
  id: 'custom-assessment-demo',
  pageTitle: 'N10L - Custom Assessment Demo',
  title: 'Custom Assessment Demo',
  subtitle: 'Example of how easy it is to create new assessments',
  defaultScenarioTime: '1000',
  contentPath: 'scenarios/custom-assessment-demo.html',
  
  // Speech-to-text configuration
  speech: {
    language: 'en-US',
    saveInterval: 5000, // Save every 5 seconds
    promptText: 'Recording custom assessment demo...'
  },
  
  // Evaluation configuration
  evaluation: {
    passingScore: 70,
    criticalItems: [
      'safety_check',
      'procedure_verification'
    ],
    storagePrefix: 'customDemo'
  }
};