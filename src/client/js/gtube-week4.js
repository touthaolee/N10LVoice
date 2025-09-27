import { socket, sessionId, studentName } from './scenario.js';

export default function setupGtubeWeek4Scenario() {
  // Subpath support when served behind Traefik at /N10LVoice
  const BASE_PATH = location.pathname.toLowerCase().startsWith('/n10lvoice/') ? '/N10LVoice' : '';
  const API_BASE = `${BASE_PATH}/api`;
  const SOCKET_PATH = `${BASE_PATH}/socket.io`;

  const defaultScenarioField = document.getElementById('scenarioTime');
  const defaultEvaluationDateField = document.getElementById('evaluationDate');
  const DEFAULT_SCENARIO_TIME = defaultScenarioField ? defaultScenarioField.value : '1200 (Lunch feeding)';
  const DEFAULT_EVALUATION_DATE = defaultEvaluationDateField ? defaultEvaluationDateField.value : new Date().toISOString().split('T')[0];

  const LAST_EVALUATION_PREFIX = 'gtubeWeek4LastEvaluation_';

  // Speech-to-text variables
  let speechToText = null;
  let isRecording = false;
  let finalTranscript = '';
  let interimTranscript = '';

  function getLastEvaluationStorageKey() {
    if (!studentName) return null;
    return `${LAST_EVALUATION_PREFIX}${studentName}`;
  }

  function saveLastEvaluationSnapshot(snapshot) {
    try {
      const key = getLastEvaluationStorageKey();
      if (!key) return;
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch (error) {
      console.error('Failed to save last evaluation snapshot:', error);
    }
  }

  function loadLastEvaluationSnapshot() {
    try {
      const key = getLastEvaluationStorageKey();
      if (!key) return null;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load last evaluation snapshot:', error);
      return null;
    }
  }

    // Speech-to-text integration setup
  function initializeSpeechToText() {
    console.log('🎤 Initializing SpeechToText for G-tube scenario with socket:', {
      socketConnected: socket?.connected,
      socketId: socket?.id,
      enableRealtime: true
    });
    
    if (!socket || !socket.connected) {
      console.error('❌ Cannot initialize SpeechToText: Socket not connected');
      const speechError = document.getElementById('speechError');
      if (speechError) {
        speechError.textContent = 'Speech recognition requires active connection. Please ensure you are logged in.';
        speechError.style.display = 'block';
      }
      return;
    }

    // Check if SpeechToText is supported
    if (!window.SpeechToText || !window.SpeechToText.isSupported()) {
      console.warn('SpeechToText not supported in this browser');
      const speechError = document.getElementById('speechError');
      if (speechError) {
        speechError.textContent = 'Speech recognition not supported in this browser';
        speechError.style.display = 'block';
      }
      return;
    }

    // Initialize SpeechToText with the connected socket
    speechToText = new window.SpeechToText({
      continuous: true,
      interimResults: true,
      language: 'en-US',
      autoSave: true,
      saveInterval: 10000, // Save every 10 seconds
      enableRealtime: true, // Enable real-time Socket.IO streaming
      socket: socket, // Pass the socket instance for real-time communication
      manualControl: true // User controls start/stop
    });

    console.log('✅ SpeechToText initialized successfully for G-tube scenario with socket:', socket.id);

    const speechControls = document.querySelector('.speech-controls');
    if (speechControls) {
      speechControls.style.display = 'block';
    }

    // Set up event handlers
    speechToText.onStart = () => {
      console.log('Speech recognition started for G-tube');
      isRecording = true;
      const speechStatusText = document.getElementById('speechStatusText');
      const recordingDot = document.getElementById('recordingDot');
      const speechStartBtn = document.getElementById('speechStartBtn');
      const speechStopBtn = document.getElementById('speechStopBtn');
      
      if (speechStatusText) speechStatusText.textContent = 'Recording G-tube procedure...';
      if (recordingDot) recordingDot.style.display = 'inline-block';
      if (speechStartBtn) speechStartBtn.style.display = 'none';
      if (speechStopBtn) speechStopBtn.style.display = 'inline-block';
    };

    speechToText.onStop = () => {
      console.log('Speech recognition stopped for G-tube');
      isRecording = false;
      const speechStatusText = document.getElementById('speechStatusText');
      const recordingDot = document.getElementById('recordingDot');
      const speechStartBtn = document.getElementById('speechStartBtn');
      const speechStopBtn = document.getElementById('speechStopBtn');
      const speechSaveBtn = document.getElementById('speechSaveBtn');
      const speechSubmitBtn = document.getElementById('speechSubmitBtn');
      
      if (speechStatusText) speechStatusText.textContent = 'Recording stopped';
      if (recordingDot) recordingDot.style.display = 'none';
      if (speechStartBtn) speechStartBtn.style.display = 'inline-block';
      if (speechStopBtn) speechStopBtn.style.display = 'none';
      if (speechSaveBtn) speechSaveBtn.style.display = 'inline-block';
      if (speechSubmitBtn) speechSubmitBtn.style.display = 'inline-block';
    };

    speechToText.onResult = (results) => {
      console.log('Speech result for G-tube:', results);
      const transcriptFinal = document.getElementById('transcriptFinal');
      const transcriptInterim = document.getElementById('transcriptInterim');
      
      if (results.final) {
        finalTranscript += results.final + ' ';
        if (transcriptFinal) transcriptFinal.textContent = finalTranscript;
        if (transcriptInterim) transcriptInterim.textContent = '';
      } else if (results.interim) {
        if (transcriptInterim) transcriptInterim.textContent = results.interim;
      }
    };

    speechToText.onError = (error) => {
      console.error('🚨 Speech recognition error in G-tube:', error);
      const speechError = document.getElementById('speechError');
      if (speechError) {
        speechError.textContent = `Speech recognition error: ${error.message || error.error}`;
        speechError.style.display = 'block';
        setTimeout(() => {
          speechError.style.display = 'none';
        }, 5000);
      }
      
      // Reset UI state
      isRecording = false;
      const speechStatusText = document.getElementById('speechStatusText');
      const recordingDot = document.getElementById('recordingDot');
      const speechStartBtn = document.getElementById('speechStartBtn');
      const speechStopBtn = document.getElementById('speechStopBtn');
      
      if (speechStatusText) speechStatusText.textContent = 'Ready to begin procedure';
      if (recordingDot) recordingDot.style.display = 'none';
      if (speechStartBtn) speechStartBtn.style.display = 'inline-block';
      if (speechStopBtn) speechStopBtn.style.display = 'none';
    };

    speechToText.onSave = (result) => {
      if (result.success) {
        console.log('G-tube transcript saved successfully');
        showToast('Transcript saved successfully', 'success');
      } else {
        console.error('Failed to save G-tube transcript:', result.error);
        showToast('Failed to save transcript', 'error');
      }
    };

    // Setup speech control buttons
    const speechStartBtn = document.getElementById('speechStartBtn');
    const speechStopBtn = document.getElementById('speechStopBtn');
    const speechSaveBtn = document.getElementById('speechSaveBtn');
    
    if (speechStartBtn) {
      speechStartBtn.addEventListener('click', () => {
        if (speechToText && !isRecording) {
          console.log('🎤 Starting G-tube speech recognition...');
          speechToText.start();
        } else if (!speechToText) {
          console.error('SpeechToText not initialized for G-tube');
          showToast('Speech recognition not available. Please refresh and try again.', 'error');
        }
      });
    }

    if (speechStopBtn) {
      speechStopBtn.addEventListener('click', () => {
        if (speechToText && isRecording) {
          console.log('⏹️ Stopping G-tube speech recognition...');
          speechToText.stop();
        }
      });
    }

    if (speechSaveBtn) {
      speechSaveBtn.addEventListener('click', () => {
        const transcript = finalTranscript.trim();
        if (transcript) {
          localStorage.setItem('gtubeTranscript', transcript);
          showToast('Transcript saved locally', 'success');
        } else {
          showToast('No transcript to save', 'warning');
        }
      });
    }
  }

  // Toast notification system
  function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    // Set colors based on type
    switch(type) {
      case 'success':
        toast.style.backgroundColor = '#059669';
        break;
      case 'error':
        toast.style.backgroundColor = '#dc2626';
        break;
      case 'warning':
        toast.style.backgroundColor = '#d97706';
        break;
      default:
        toast.style.backgroundColor = '#2563eb';
    }
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 5000);
  }

  // Initialize evaluation form defaults
  function initializeFormDefaults() {
    const scenarioTimeField = document.getElementById('scenarioTime');
    const evaluationDateField = document.getElementById('evaluationDate');
    
    if (scenarioTimeField && !scenarioTimeField.value) {
      scenarioTimeField.value = DEFAULT_SCENARIO_TIME;
    }
    
    if (evaluationDateField && !evaluationDateField.value) {
      evaluationDateField.value = DEFAULT_EVALUATION_DATE;
    }
  }

  // Section counting and progress tracking
  function updateSectionCounts() {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
      const sectionId = section.id;
      const checkboxes = section.querySelectorAll('.checkbox');
      const passCheckboxes = section.querySelectorAll('.checkbox.pass:checked');
      const failCheckboxes = section.querySelectorAll('.checkbox.fail:checked');
      
      const total = checkboxes.length / 2; // Divide by 2 since each item has pass/fail pair
      const completed = Math.max(passCheckboxes.length, failCheckboxes.length);
      
      const metaSpan = section.querySelector('.section-meta');
      if (metaSpan) {
        metaSpan.textContent = `${completed}/${total}`;
      }
    });
  }

  // Socket.IO connection for G-tube scenario
  function initializeSocketConnection() {
    if (typeof io === 'undefined') {
      console.error('Socket.IO not loaded');
      return;
    }

    const socket = io({
      path: SOCKET_PATH,
      auth: {
        sessionId: sessionId
      }
    });

    socket.on('connect', () => {
      console.log('Connected to G-tube evaluation server');
      const studentNameField = document.getElementById('studentName');
      if (studentNameField) {
        studentNameField.value = studentName;
        studentNameField.readonly = true;
        studentNameField.style.backgroundColor = '#f8f9fa';
        studentNameField.style.color = '#495057';
        studentNameField.style.border = '2px solid #28a745';
        studentNameField.style.fontWeight = 'bold';
      }
    });

    return socket;
  }

  // Evaluation submission
  function submitEvaluation() {
    try {
      const form = document.getElementById('evaluationForm');
      if (!form) return;

      const formData = new FormData(form);
      const score = calculateScore();
      const items = gatherEvaluationItems();
      
      const evaluationData = {
        studentName: formData.get('studentName'),
        evaluatorName: formData.get('evaluatorName'),
        evaluationDate: formData.get('evaluationDate'),
        scenarioTime: formData.get('scenarioTime'),
        courseWeekId: 4, // G-tube Week 4
        score: score,
        items: items,
        notes: gatherNotes()
      };

      // Save snapshot before submission
      saveLastEvaluationSnapshot(evaluationData);

      // Submit via API
      fetch(`${API_BASE}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evaluationData)
      })
      .then(response => response.json())
      .then(result => {
        if (result.ok || result.success) {
          alert('✅ G-tube evaluation submitted successfully!');
        } else {
          throw new Error(result.error || 'Submission failed');
        }
      })
      .catch(error => {
        console.error('Submission error:', error);
        alert('❌ Failed to submit evaluation: ' + error.message);
      });

    } catch (error) {
      console.error('Evaluation submission error:', error);
      alert('❌ Error preparing evaluation data');
    }
  }

  function calculateScore() {
    const passCheckboxes = document.querySelectorAll('.checkbox.pass:checked');
    const failCheckboxes = document.querySelectorAll('.checkbox.fail:checked');
    const totalItems = document.querySelectorAll('.checklist-item').length;
    
    const passed = passCheckboxes.length;
    const failed = failCheckboxes.length;
    const total = totalItems;
    const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    return { passed, failed, total, percent };
  }

  function gatherEvaluationItems() {
    const items = [];
    const checklistItems = document.querySelectorAll('.checklist-item');
    
    checklistItems.forEach(item => {
      const passCheckbox = item.querySelector('.checkbox.pass');
      const failCheckbox = item.querySelector('.checkbox.fail');
      const itemText = item.querySelector('.item-text');
      
      if (passCheckbox && itemText) {
        const isChecked = passCheckbox.checked || failCheckbox.checked;
        const status = passCheckbox.checked ? 'pass' : failCheckbox.checked ? 'fail' : 'not_completed';
        
        items.push({
          key: passCheckbox.dataset.key || '',
          item: itemText.textContent.trim(),
          status: status,
          checked: isChecked,
          failed: failCheckbox && failCheckbox.checked,
          critical: passCheckbox.dataset.critical === 'true'
        });
      }
    });
    
    return items;
  }

  function gatherNotes() {
    const notes = {};
    const noteTextareas = document.querySelectorAll('textarea[data-section]');
    noteTextareas.forEach(textarea => {
      const section = textarea.dataset.section;
      if (section && textarea.value.trim()) {
        notes[section] = textarea.value.trim();
      }
    });
    return notes;
  }

  // Toast notification system
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    // Set background color based on type
    switch (type) {
      case 'success':
        toast.style.backgroundColor = '#10b981';
        break;
      case 'error':
        toast.style.backgroundColor = '#ef4444';
        break;
      case 'warning':
        toast.style.backgroundColor = '#f59e0b';
        break;
      default:
        toast.style.backgroundColor = '#3b82f6';
    }
    
    document.body.appendChild(toast);
    
    // Fade in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 100);
    
    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // Initialize everything
  initializeFormDefaults();
  
  // Initialize speech recognition once socket is available
  if (socket && socket.connected) {
    initializeSpeechToText();
  } else {
    // Wait for socket connection
    console.log('⏳ Waiting for socket connection before initializing G-tube speech...');
    const checkSocket = () => {
      if (socket && socket.connected) {
        console.log('🔌 Socket connected, initializing G-tube speech recognition...');
        initializeSpeechToText();
      } else {
        setTimeout(checkSocket, 500);
      }
    };
    checkSocket();
  }

  // Set up event listeners
  const submitButton = document.getElementById('submitEvaluation');
  if (submitButton) {
    submitButton.addEventListener('click', submitEvaluation);
  }

  // Set up checkbox change handlers for progress tracking
  document.addEventListener('change', function(e) {
    if (e.target.classList.contains('checkbox')) {
      updateSectionCounts();
    }
  });

  // Initial count update
  updateSectionCounts();

  // Return the module functions for external access
  return {
    initializeSpeechToText,
    showToast
  };
}