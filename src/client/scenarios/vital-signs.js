export default {
  id: 'vital-signs',
  pageTitle: 'NURS 10L - Vital Signs Assessment',
  title: 'Week 2 Vital Signs Assessment',
  subtitle: 'Comprehensive vital signs and physical assessment',
  defaultScenarioTime: '0900',
  contentPath: 'scenarios/vital-signs.html',
  setup: () => import('../js/vital-signs.js').then((mod) => mod.default())
};
