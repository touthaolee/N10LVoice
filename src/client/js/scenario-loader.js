import { initScenario } from './scenario.js';

function showScenarioHub() {
  // Set page title and header
  document.getElementById('pageTitle').textContent = 'NURS 10L - Scenario Hub';
  document.getElementById('scenarioTitle').textContent = 'NURS 10L Scenarios';
  document.getElementById('scenarioSubtitle').textContent = 'Select a nursing scenario to begin evaluation';
  
  // Hide toolbar and other scenario-specific elements
  const toolbar = document.getElementById('toolbar');
  const speechTranscript = document.getElementById('speechTranscript');
  const speechError = document.getElementById('speechError');
  const evaluationForm = document.getElementById('evaluationForm');
  const scorebar = document.querySelector('.scorebar');
  const guidedToastRoot = document.getElementById('guidedToastRoot');
  
  if (toolbar) toolbar.style.display = 'none';
  if (speechTranscript) speechTranscript.style.display = 'none';
  if (speechError) speechError.style.display = 'none';
  if (evaluationForm) evaluationForm.style.display = 'none';
  if (scorebar) scorebar.style.display = 'none';
  if (guidedToastRoot) guidedToastRoot.style.display = 'none';
  
  // Create scenario navigation
  const hubContent = `
    <div class="scenario-hub">
      <div class="hub-intro">
        <h3>Available Nursing Scenarios</h3>
        <p>Choose from the following clinical evaluation scenarios. Each scenario includes voice-to-text recording, interactive checklists, and comprehensive assessment tools.</p>
      </div>
      
      <div class="scenario-grid">
        <div class="scenario-card" onclick="window.location.href='?scenario=personal-care'">
          <div class="scenario-icon">🧼</div>
          <h4>Personal Care</h4>
          <p>Shannon Shaw Case Study - Basic personal care and hygiene assessment</p>
          <div class="scenario-meta">Interactive checklist • Voice recording</div>
        </div>
        
        <div class="scenario-card" onclick="window.location.href='?scenario=vital-signs-week2'">
          <div class="scenario-icon">📊</div>
          <h4>Vital Signs Week 2</h4>
          <p>Comprehensive vital signs assessment and documentation</p>
          <div class="scenario-meta">Vital signs checklist • Assessment recording</div>
        </div>
        
        <div class="scenario-card" onclick="window.location.href='?scenario=medication-week3'">
          <div class="scenario-icon">💊</div>
          <h4>Medication Week 3</h4>
          <p>Medication administration safety and documentation</p>
          <div class="scenario-meta">Safety checklist • Procedure recording</div>
        </div>
        
        <div class="scenario-card" onclick="window.location.href='?scenario=gtube-week4'">
          <div class="scenario-icon">🍽️</div>
          <h4>G-tube Week 4</h4>
          <p>Gastronomy tube feeding procedure and safety assessment</p>
          <div class="scenario-meta">Procedure checklist • Safety documentation</div>
        </div>
        
        <div class="scenario-card" onclick="window.location.href='?scenario=physical-assessment-week5'">
          <div class="scenario-icon">🩺</div>
          <h4>Physical Assessment Week 5</h4>
          <p>Comprehensive head-to-toe physical assessment</p>
          <div class="scenario-meta">Full body assessment • Critical findings</div>
        </div>
        
        <div class="scenario-card" onclick="window.location.href='?scenario=custom-assessment-demo'" style="border: 2px solid #059669;">
          <div class="scenario-icon">🧪</div>
          <h4>Custom Assessment Demo</h4>
          <p>Example of unified architecture - created with only 20 lines of config!</p>
          <div class="scenario-meta">Demo • Configuration-only</div>
        </div>
      </div>
      
      <div class="hub-footer">
        <h4>Getting Started</h4>
        <ol>
          <li>Select a scenario from the cards above</li>
          <li>Log in with your institutional credentials</li>
          <li>Complete the interactive assessment checklist</li>
          <li>Use voice recording to document your findings</li>
          <li>Submit your evaluation for instructor review</li>
        </ol>
        
        <div class="support-links">
          <a href="/admin.html" class="support-link">👨‍🏫 Instructor Dashboard</a>
          <a href="/" class="support-link">🏠 Main Menu</a>
        </div>
      </div>
    </div>
  `;
  
  // Replace evaluation form with hub content
  const container = document.querySelector('.container');
  const existingContent = container.querySelector('#evaluationForm');
  if (existingContent) {
    existingContent.outerHTML = hubContent;
  } else {
    container.insertAdjacentHTML('beforeend', hubContent);
  }
}

const registry = {
  'personal-care': () => import('../scenarios/personal-care.js').then((m) => m.default),
  'vital-signs-week2': () => import('../scenarios/vital-signs-week2.js').then((m) => m.default),
  'medication-week3': () => import('../scenarios/medication-week3.js').then((m) => m.default),
  'gtube-week4': () => import('../scenarios/gtube-week4.js').then((m) => m.default),
  'physical-assessment-week5': () => import('../scenarios/physical-assessment-week5.js').then((m) => m.default),
  'custom-assessment-demo': () => import('../scenarios/custom-assessment-demo.js').then((m) => m.default)
};

function parseScenarioId() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('scenario');
  if (raw) return raw.toLowerCase();
  return null; // Return null to show hub when no scenario specified
}

async function loadScenario() {
  const scenarioId = parseScenarioId();
  
  console.log('🎬 Loading scenario:', {
    scenarioId: scenarioId,
    currentURL: window.location.href,
    urlParams: Object.fromEntries(new URLSearchParams(window.location.search))
  });
  
  // Show scenario hub if no specific scenario requested
  if (!scenarioId) {
    console.log('🏠 No scenario specified, showing hub');
    showScenarioHub();
    return;
  }
  
  console.log('🔍 Looking up scenario loader for:', scenarioId);
  const loader = registry[scenarioId];
  
  if (!loader) {
    console.warn('⚠️ No loader found for scenario:', scenarioId);
  }
  
  try {
    const config = loader ? await loader() : null;
    console.log('📋 Scenario config loaded:', {
      scenarioId: scenarioId,
      configFound: !!config,
      configTitle: config ? config.title : 'N/A'
    });
    
    if (config) {
      console.log('🚀 Initializing scenario with config...');
      initScenario(config);
    } else {
      console.log('❌ Scenario not found, showing error...');
      initScenario({
        id: 'not-found',
        title: 'Scenario Not Found',
        subtitle: 'Please verify the scenario name and try again.',
        contentHtml: '<p>The requested scenario is not yet available.</p>'
      });
    }
  } catch (error) {
    console.error('💥 Failed to load scenario:', error);
    initScenario({
      id: 'load-error',
      title: 'Unable to load scenario',
      subtitle: 'An error occurred while loading scenario content.',
      contentHtml: '<p>Please refresh the page or contact an administrator.</p>'
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM Content Loaded - starting scenario initialization');
  console.log('🌐 Current page state:', {
    URL: window.location.href,
    search: window.location.search,
    scenario: new URLSearchParams(window.location.search).get('scenario'),
    timestamp: new Date().toISOString()
  });
  loadScenario();
});
