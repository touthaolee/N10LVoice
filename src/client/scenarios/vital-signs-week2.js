// Vital Signs Week 2 - Configuration Only  
export default {
  id: 'vital-signs-week2',
  pageTitle: 'NURS 10L - Week 2 Vital Signs Comprehensive Evaluation',
  title: 'Week 2 Vital Signs Comprehensive Evaluation',
  subtitle: 'Oxygenation-focused vital signs assessment',
  defaultScenarioTime: '0800 (Breakfast 0830)',
  contentPath: 'scenarios/vital-signs-week2.html',
  
  // Speech-to-text configuration
  speech: {
    language: 'en-US',
    saveInterval: 8000, // Save every 8 seconds for vital signs
    promptText: 'Recording vital signs assessment...'
  },
  
  // Evaluation configuration
  evaluation: {
    passingScore: 85,
    criticalItems: [
      'blood_pressure_accuracy',
      'pulse_assessment',
      'respiratory_assessment',
      'temperature_measurement',
      'oxygen_saturation'
    ],
    storagePrefix: 'vitalSignsWeek2'
  }
};
