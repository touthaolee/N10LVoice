// Global state variables
let socket = null;
let sessionId = null;
let studentName = null;
let currentScenario = null;
let scenarioManager = null;
let isManualDisconnect = false;
let lastPingTime = null;
const maxReconnectAttempts = 10;

// Configuration
const BASE_PATH = window.location.hostname === 'localhost' ? '' : '/N10LVoice';
const API_BASE = `${BASE_PATH}/api`;
const SOCKET_PATH = `${BASE_PATH}/socket.io`;

/**
 * Unified Scenario Manager - Handles all common functionality
 * Speech recognition, form handling, evaluation, progress saving, etc.
 */
class ScenarioManager {
  constructor(config) {
    this.config = config;
    this.speechToText = null;
    this.isRecording = false;
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.progressTimer = null;
    
    // Guided mode properties
    this.guidedQueue = [];
    this.guidedIndex = 0;
    this.guidedActive = false;
    
    // Initialize core systems
    this.initializeElements();
    this.initializeForm();
    this.initializeEventListeners();
    this.setupAutoSave();
    
    // Initialize speech if socket is ready
    this.initializeSpeechWhenReady();
  }

  initializeElements() {
    // Cache common DOM elements
    this.elements = {
      // Speech controls
      speechStartBtn: document.getElementById('speechStartBtn'),
      speechStopBtn: document.getElementById('speechStopBtn'),
      speechSaveBtn: document.getElementById('speechSaveBtn'),
      speechSubmitBtn: document.getElementById('speechSubmitBtn'),
      speechStatusText: document.getElementById('speechStatusText'),
      recordingDot: document.getElementById('recordingDot'),
      transcriptFinal: document.getElementById('transcriptFinal'),
      transcriptInterim: document.getElementById('transcriptInterim'),
      speechError: document.getElementById('speechError'),
      
      // Form elements
      evaluationForm: document.getElementById('evaluationForm'),
      studentNameField: document.getElementById('studentName'),
      evaluatorName: document.getElementById('evaluatorName'),
      evaluationDate: document.getElementById('evaluationDate'),
      scenarioTime: document.getElementById('scenarioTime'),
      
      // UI controls
      submitBtn: document.getElementById('submitEvaluation'),
      expandAllBtn: document.getElementById('expandAll'),
      collapseAllBtn: document.getElementById('collapseAll'),
      resetBtn: document.getElementById('resetForm'),
      recallBtn: document.getElementById('recallEvaluationBtn')
    };
  }

  initializeForm() {
    const { elements } = this;
    
    // Set current date
    if (elements.evaluationDate) {
      elements.evaluationDate.value = new Date().toISOString().split('T')[0];
    }
    
    // Set default scenario time if provided
    if (elements.scenarioTime && this.config.defaultScenarioTime) {
      elements.scenarioTime.value = this.config.defaultScenarioTime;
    }
    
    // Set student name from session
    if (elements.studentNameField && studentName) {
      elements.studentNameField.value = studentName;
    }
    
    // Initialize checkboxes
    this.setupCheckboxes();
    this.updateScores();
    this.loadSavedProgress();
  }

  initializeEventListeners() {
    const { elements } = this;
    
    // Speech controls
    if (elements.speechStartBtn) {
      elements.speechStartBtn.addEventListener('click', () => this.startRecording());
    }
    if (elements.speechStopBtn) {
      elements.speechStopBtn.addEventListener('click', () => this.stopRecording());
    }
    if (elements.speechSaveBtn) {
      elements.speechSaveBtn.addEventListener('click', () => this.saveTranscript());
    }
    if (elements.speechSubmitBtn) {
      elements.speechSubmitBtn.addEventListener('click', () => this.submitFinalAssessment());
    }
    
    // Form controls
    if (elements.submitBtn) {
      elements.submitBtn.addEventListener('click', () => this.submitEvaluation());
    }
    if (elements.expandAllBtn) {
      elements.expandAllBtn.addEventListener('click', () => this.expandAllSections());
    }
    if (elements.collapseAllBtn) {
      elements.collapseAllBtn.addEventListener('click', () => this.collapseAllSections());
    }
    if (elements.resetBtn) {
      elements.resetBtn.addEventListener('click', () => this.resetForm());
    }
    if (elements.recallBtn) {
      elements.recallBtn.addEventListener('click', () => this.recallLastEvaluation());
    }
    
    // Checkbox change handlers
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('checkbox')) {
        this.handleCheckboxChange(e.target);
        this.updateScores();
      }
    });
  }

  async initializeSpeechWhenReady() {
    if (socket && socket.connected) {
      // Also check if we have session data
      const currentSessionId = sessionId || localStorage.getItem('studentSession');
      const currentStudentName = studentName || localStorage.getItem('studentName');
      
      if (currentSessionId && currentStudentName) {
        this.initializeSpeech();
      } else {
        console.log('⏳ Waiting for session data before initializing speech...');
        this.waitForSessionData();
      }
    } else {
      console.log('⏳ Waiting for socket connection before initializing speech...');
      const checkSocket = () => {
        if (socket && socket.connected) {
          console.log('🔌 Socket connected, checking session data...');
          const currentSessionId = sessionId || localStorage.getItem('studentSession');
          const currentStudentName = studentName || localStorage.getItem('studentName');
          
          if (currentSessionId && currentStudentName) {
            this.initializeSpeech();
          } else {
            this.waitForSessionData();
          }
        } else {
          setTimeout(checkSocket, 500);
        }
      };
      checkSocket();
    }
  }

  waitForSessionData() {
    console.log('⏳ Waiting for session data...');
    const checkSessionData = () => {
      const currentSessionId = sessionId || localStorage.getItem('studentSession');
      const currentStudentName = studentName || localStorage.getItem('studentName');
      
      if (currentSessionId && currentStudentName) {
        console.log('✅ Session data available, initializing speech recognition...');
        this.initializeSpeech();
      } else {
        setTimeout(checkSessionData, 500);
      }
    };
    checkSessionData();
  }

  initializeSpeech() {
    // Get current session data from localStorage to ensure we have valid values
    const currentSessionId = sessionId || localStorage.getItem('studentSession');
    const currentStudentName = studentName || localStorage.getItem('studentName');
    
    console.log('🎤 Initializing SpeechToText with socket:', {
      socketConnected: socket?.connected,
      socketId: socket?.id,
      scenarioId: this.config.id
    });
    
    console.log('🔍 SpeechToText session parameters:', {
      sessionId: currentSessionId,
      studentName: currentStudentName,
      courseId: this.config.id,
      apiBaseUrl: API_BASE
    });
    
    if (!socket || !socket.connected) {
      console.error('❌ Cannot initialize SpeechToText: Socket not connected');
      this.showSpeechError('Speech recognition requires active connection. Please ensure you are logged in.');
      return;
    }

    if (!currentSessionId || !currentStudentName) {
      console.error('❌ Cannot initialize SpeechToText: Missing session data');
      this.showSpeechError('Speech recognition requires valid session. Please log in again.');
      return;
    }

    if (!window.SpeechToText || !window.SpeechToText.isSupported()) {
      console.warn('SpeechToText not supported in this browser');
      this.showSpeechError('Speech recognition not supported in this browser');
      return;
    }

    // Get speech config from scenario or use defaults
    const speechConfig = this.config.speech || {};
    
    this.speechToText = new window.SpeechToText({
      continuous: true,
      interimResults: true,
      language: speechConfig.language || 'en-US',
      autoSave: true,
      saveInterval: speechConfig.saveInterval || 10000,
      enableRealtime: true,
      socket: socket,
      manualControl: true,
      apiBaseUrl: API_BASE
      // Note: sessionId, studentName, courseId will be passed to start() method instead
    });

    this.setupSpeechEventHandlers();
    console.log('✅ SpeechToText initialized successfully');
  }

  setupSpeechEventHandlers() {
    const { elements } = this;
    const speechConfig = this.config.speech || {};
    
    this.speechToText.onStart = () => {
      console.log('Speech recognition started');
      this.isRecording = true;
      if (elements.speechStatusText) {
        elements.speechStatusText.textContent = speechConfig.promptText || 'Recording assessment...';
      }
      if (elements.recordingDot) elements.recordingDot.style.display = 'inline-block';
      if (elements.speechStartBtn) elements.speechStartBtn.style.display = 'none';
      if (elements.speechStopBtn) elements.speechStopBtn.style.display = 'inline-block';
      
      // Show transcript area
      if (elements.transcriptFinal) {
        const transcriptContainer = elements.transcriptFinal.parentElement;
        if (transcriptContainer) transcriptContainer.classList.add('visible');
      }
    };

    this.speechToText.onStop = () => {
      console.log('Speech recognition stopped');
      this.isRecording = false;
      if (elements.speechStatusText) elements.speechStatusText.textContent = 'Recording stopped';
      if (elements.recordingDot) elements.recordingDot.style.display = 'none';
      if (elements.speechStartBtn) elements.speechStartBtn.style.display = 'inline-block';
      if (elements.speechStopBtn) elements.speechStopBtn.style.display = 'none';
      if (elements.speechSaveBtn) elements.speechSaveBtn.style.display = 'inline-block';
      if (elements.speechSubmitBtn) elements.speechSubmitBtn.style.display = 'inline-block';
    };

    this.speechToText.onResult = (results) => {
      if (results.final) {
        this.finalTranscript += results.final + ' ';
        if (elements.transcriptFinal) {
          elements.transcriptFinal.textContent = this.finalTranscript;
        }
        if (elements.transcriptInterim) {
          elements.transcriptInterim.textContent = '';
        }
      } else if (results.interim && elements.transcriptInterim) {
        elements.transcriptInterim.textContent = results.interim;
      }
    };

    this.speechToText.onError = (error) => {
      console.error('🚨 Speech recognition error:', error);
      this.showSpeechError(`Speech recognition error: ${error.message || error.error}`);
      this.resetSpeechUI();
    };

    this.speechToText.onSave = (result) => {
      if (result.success) {
        console.log('Transcript saved successfully');
        this.showToast('Transcript saved successfully', 'success');
      } else {
        console.error('Failed to save transcript:', result.error);
        this.showToast('Failed to save transcript', 'error');
      }
    };
  }

  startRecording() {
    if (this.speechToText && !this.isRecording) {
      console.log('🎤 Starting speech recognition...');
      
      // Prepare session data for speech recognition
      const currentSessionId = sessionId || localStorage.getItem('studentSession');
      const currentStudentName = studentName || localStorage.getItem('studentName');
      
      const sessionData = {
        sessionId: currentSessionId,
        studentName: currentStudentName,
        courseId: this.config.id,
        segmentNumber: 1, // Can be incremented for multiple segments
        segmentStartTime: new Date()
      };
      
      console.log('🎯 Starting speech recognition with session data:', {
        sessionId: sessionData.sessionId ? sessionData.sessionId.substring(0, 8) + '...' : 'null',
        studentName: sessionData.studentName || 'null',
        courseId: sessionData.courseId || 'null'
      });
      
      this.speechToText.start(sessionData);
    } else if (!this.speechToText) {
      console.error('SpeechToText not initialized');
      this.showToast('Speech recognition not available. Please refresh and try again.', 'error');
    }
  }

  stopRecording() {
    if (this.speechToText && this.isRecording) {
      console.log('⏹️ Stopping speech recognition...');
      this.speechToText.stop();
    }
  }

  saveTranscript() {
    const transcript = this.finalTranscript.trim();
    if (transcript) {
      const storageKey = `${this.config.id}_transcript`;
      localStorage.setItem(storageKey, transcript);
      this.showToast('Transcript saved locally', 'success');
    } else {
      this.showToast('No transcript to save', 'warning');
    }
  }

  showSpeechError(message) {
    if (this.elements.speechError) {
      this.elements.speechError.textContent = message;
      this.elements.speechError.style.display = 'block';
      setTimeout(() => {
        this.elements.speechError.style.display = 'none';
      }, 5000);
    }
  }

  resetSpeechUI() {
    const { elements } = this;
    this.isRecording = false;
    if (elements.speechStatusText) elements.speechStatusText.textContent = 'Ready to begin assessment';
    if (elements.recordingDot) elements.recordingDot.style.display = 'none';
    if (elements.speechStartBtn) elements.speechStartBtn.style.display = 'inline-block';
    if (elements.speechStopBtn) elements.speechStopBtn.style.display = 'none';
  }

  setupCheckboxes() {
    const checkboxes = document.querySelectorAll('.checkbox');
    
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        this.handleCheckboxChange(e.target);
      });
    });
  }

  handleCheckboxChange(checkbox) {
    const key = checkbox.dataset.key;
    const isPass = checkbox.classList.contains('pass');
    
    // Uncheck opposite checkbox
    if (checkbox.checked) {
      const checkboxes = document.querySelectorAll(`[data-key="${key}"]`);
      checkboxes.forEach(cb => {
        if (cb !== checkbox) {
          cb.checked = false;
        }
      });
    }

    // Update scores and send real-time progress update to admin
    this.updateScores();
    this.sendProgressUpdate();
  }

  calculateScores() {
    const checkboxes = document.querySelectorAll('.checkbox');
    let passedItems = 0;
    let failedItems = 0;
    let criticalFails = 0;

    const sections = {};

    // First pass: collect all unique items by data-key (regardless of checked state)
    checkboxes.forEach(checkbox => {
      const key = checkbox.dataset.key;
      const isCritical = checkbox.hasAttribute('data-critical');
      
      if (!sections[key]) {
        sections[key] = { pass: false, fail: false, critical: isCritical };
      }
    });

    // Second pass: mark checked items
    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        const key = checkbox.dataset.key;
        const isPass = checkbox.classList.contains('pass');
        const isCritical = checkbox.hasAttribute('data-critical');

        if (isPass) {
          sections[key].pass = true;
          passedItems++;
        } else {
          sections[key].fail = true;
          failedItems++;
          if (isCritical) {
            criticalFails++;
          }
        }
      }
    });

    const totalItems = Object.keys(sections).length;
    const percentage = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

    return {
      total: totalItems,
      passed: passedItems,
      failed: failedItems,
      criticalFails: criticalFails,
      percentage: percentage,
      sections: sections
    };
  }

  getCurrentItems() {
    const items = [];
    const sectionSequenceCounters = {};

    document.querySelectorAll('.section').forEach(section => {
      const sectionName = section.querySelector('.section-title')?.textContent?.trim() || 'Unknown Section';
      const checklistItems = section.querySelectorAll('.checklist-item');
      if (!(sectionName in sectionSequenceCounters)) sectionSequenceCounters[sectionName] = 0;

      checklistItems.forEach((checklistItem) => {
        const seq = sectionSequenceCounters[sectionName]++;
        const itemTextDiv = checklistItem.querySelector('.item-text');
        const itemText = itemTextDiv ? itemTextDiv.textContent?.trim() : 'Unknown Item';

        const passCheckbox = checklistItem.querySelector('input.checkbox.pass[type="checkbox"]');
        const failCheckbox = checklistItem.querySelector('input.checkbox.fail[type="checkbox"]');
        const isCritical = passCheckbox?.dataset.critical === 'true' || passCheckbox?.hasAttribute('data-critical');

        let status = 'not_completed';
        let notes = 'Not completed';

        if (passCheckbox && passCheckbox.checked) {
          status = 'pass';
          notes = 'Passed - criteria met';
        } else if (failCheckbox && failCheckbox.checked) {
          status = 'fail';
          notes = 'Failed - criteria not met';
        }

        const itemKey = `${sectionName.toLowerCase().replace(/\s+/g, '_')}_${seq}`;

        items.push({
          section: sectionName,
          item: itemText,
          key: itemKey,
          checked: status === 'pass',
          failed: status === 'fail',
          status: status,
          timestamp: new Date().toISOString(),
          notes: notes,
          sequence: seq,
          critical: isCritical
        });
      });
    });

    return items;
  }

  sendProgressUpdate() {
    // Use this.socket instead of global socket for better consistency
    if (!this.socket || !this.socket.connected) {
      console.warn('⚠️ Cannot send progress update: Socket not connected');
      return;
    }

    const sessionId = localStorage.getItem('studentSession');
    const studentName = localStorage.getItem('studentName');
    
    if (!sessionId || !studentName) {
      console.warn('⚠️ Cannot send progress update: Missing session data');
      return;
    }

    const score = this.calculateScores();
    const items = this.getCurrentItems();
    
    // Build comprehensive progress data
    const progressData = {
      studentName: studentName,
      sessionId: sessionId,
      score: {
        total: score.total,
        passed: score.passed,
        failed: score.failed,
        percent: score.percentage,
        percentage: score.percentage  // Include both formats for compatibility
      },
      items: items,
      timestamp: new Date().toISOString(),
      courseWeekId: this.getCourseWeekId(),
      scenarioTitle: this.config.title,
      status: 'evaluating'
    };
    
    this.socket.emit('evaluation-update', progressData);

    console.log('📊 Sent progress update to admin:', {
      studentName: studentName,
      sessionId: sessionId.substring(0, 8) + '...',
      score: score.percentage + '%',
      items: items.length,
      scenarioTitle: this.config.title,
      socketId: this.socket.id
    });
  }

  // Send initial progress state on connection/reconnection
  sendInitialProgressUpdate() {
    console.log('🔄 Sending initial progress state on connection...');
    
    // Check if there are any checked checkboxes to report
    const checkboxes = document.querySelectorAll('.checkbox:checked');
    const checkedCount = checkboxes.length;
    
    if (checkedCount > 0) {
      console.log(`📋 Found ${checkedCount} checked items to report to admin`);
    } else {
      console.log('📋 No checked items found, still sending current state to admin');
    }
    
    // Wait a moment for everything to be properly initialized
    setTimeout(() => {
      this.sendProgressUpdate();
    }, 500);
  }

  updateScores() {
    const scores = this.calculateScores();
    
    const elements = {
      completedScore: document.getElementById('completedScore'),
      failedScore: document.getElementById('failedScore'),
      criticalFailedScore: document.getElementById('criticalFailedScore'),
      overallScore: document.getElementById('overallScore')
    };
    
    if (elements.completedScore) elements.completedScore.textContent = `${scores.passed} / ${scores.total}`;
    if (elements.failedScore) elements.failedScore.textContent = scores.failed;
    if (elements.criticalFailedScore) elements.criticalFailedScore.textContent = scores.criticalFails;
    if (elements.overallScore) elements.overallScore.textContent = `${scores.percentage}%`;
    
    this.updateSectionCounts();
  }

  updateSectionCounts() {
    const sections = document.querySelectorAll('.section');
    
    sections.forEach(section => {
      const sectionId = section.id;
      const checkboxes = section.querySelectorAll('.checkbox:checked');
      const metaSpan = section.querySelector(`[data-count="${sectionId}"]`);
      
      if (metaSpan) {
        metaSpan.textContent = `(${checkboxes.length})`;
      }
    });
  }

  async submitEvaluation() {
    // Check for incomplete items first
    const incompleteItems = this.collectIncompleteItems();
    if (incompleteItems.length > 0) {
      // Start guided mode for incomplete items
      this.startGuidedMode(incompleteItems);
      return;
    }

    // All items complete, proceed with submission
    this.doFinalSubmission();
  }

  collectIncompleteItems() {
    const incompleteItems = [];
    const checkboxes = document.querySelectorAll('.checkbox');
    const sections = {};

    // Collect all unique items by data-key
    checkboxes.forEach(checkbox => {
      const key = checkbox.dataset.key;
      if (!sections[key]) {
        sections[key] = { pass: false, fail: false, item: null };
      }
    });

    // Check which items have neither pass nor fail checked
    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        const key = checkbox.dataset.key;
        const isPass = checkbox.classList.contains('pass');
        if (isPass) {
          sections[key].pass = true;
        } else {
          sections[key].fail = true;
        }
      }
    });

    // Find items with no selection and get their DOM elements
    Object.keys(sections).forEach(key => {
      const section = sections[key];
      if (!section.pass && !section.fail) {
        // Find the checklist item for this key
        const item = document.querySelector(`[data-key="${key}"]`)?.closest('.checklist-item');
        if (item) {
          incompleteItems.push(item);
        }
      }
    });

    return incompleteItems;
  }

  startGuidedMode(incompleteItems) {
    this.guidedQueue = incompleteItems;
    this.guidedIndex = 0;
    this.guidedActive = true;
    
    console.log(`🎯 Starting guided mode for ${incompleteItems.length} incomplete items`);
    this.showNextGuidedItem();
  }

  showNextGuidedItem() {
    if (this.guidedIndex >= this.guidedQueue.length) {
      // All items complete, proceed to final submission
      this.finishGuidedMode();
      return;
    }

    const currentItem = this.guidedQueue[this.guidedIndex];
    const itemText = currentItem.querySelector('.item-text')?.textContent?.trim() || 'Unknown Item';
    const progress = `${this.guidedIndex + 1} of ${this.guidedQueue.length}`;

    // Highlight current item
    this.highlightGuidedItem(currentItem);

    // Show guided toast
    const guidedToast = document.getElementById('guidedToast');
    const guidedProgress = document.getElementById('guidedProgress');
    const guidedItemText = document.getElementById('guidedItemText');
    const guidedActions = document.getElementById('guidedActions');

    guidedProgress.textContent = `Question ${progress}`;
    guidedItemText.textContent = itemText;
    
    guidedActions.innerHTML = `
      <button class="guided-btn pass" onclick="window.markGuidedItem('pass')">✓ PASS</button>
      <button class="guided-btn fail" onclick="window.markGuidedItem('fail')">✗ FAIL</button>
      <button class="guided-btn next" onclick="window.skipGuidedItem()">Skip</button>
      <button class="guided-btn next" onclick="window.cancelGuidedMode()">Cancel</button>
    `;

    guidedToast.style.display = 'block';
    
    // Scroll to current item
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  highlightGuidedItem(item) {
    // Remove previous highlights
    document.querySelectorAll('.checklist-item').forEach(el => {
      el.classList.remove('guided-highlight');
    });
    
    // Add highlight to current item
    item.classList.add('guided-highlight');
  }

  finishGuidedMode() {
    this.guidedActive = false;
    this.guidedQueue = [];
    this.guidedIndex = 0;
    
    // Hide guided toast
    const guidedToast = document.getElementById('guidedToast');
    guidedToast.style.display = 'none';
    
    // Remove highlights
    document.querySelectorAll('.checklist-item').forEach(el => {
      el.classList.remove('guided-highlight');
    });
    
    console.log('✅ Guided mode completed, proceeding to submission');
    this.doFinalSubmission();
  }

  async doFinalSubmission() {
    const formData = new FormData(this.elements.evaluationForm);
    const evaluationData = Object.fromEntries(formData.entries());
    
    // Add scenario-specific data
    evaluationData.scenario = this.config.title;
    evaluationData.type = this.config.id;
    evaluationData.transcript = this.finalTranscript.trim();
    evaluationData.scores = this.calculateScores();
    evaluationData.items = this.getCurrentItems();
    
    try {
      // Get session data from localStorage
      const sessionId = localStorage.getItem('studentSession');
      const studentName = localStorage.getItem('studentName');
      
      if (!sessionId) {
        throw new Error('No session ID found');
      }

      if (!this.socket || !this.socket.connected) {
        throw new Error('Socket connection not available');
      }

      console.log('🔄 Submitting evaluation via socket:', {
        sessionId: sessionId,
        studentName: studentName,
        socketConnected: this.socket.connected,
        dataKeys: Object.keys(evaluationData)
      });

      // Submit via Socket.IO (matching old HTML format)
      this.socket.emit('evaluation-complete', {
        courseWeekId: this.getCourseWeekId(),
        courseName: this.getCourseName(),
        score: {
          pct: evaluationData.scores.percentage,
          passed: evaluationData.scores.passed,
          failed: evaluationData.scores.failed || 0, // Ensure failed is always set
          total: evaluationData.scores.total,
          percentage: evaluationData.scores.percentage,
          percent: evaluationData.scores.percentage
        },
        items: evaluationData.items,
        notes: {
          summary: '',
          safety: '',
          follow: '',
          evaluatorName: 'Self-Assessment',
          scenarioTime: '',
          evaluationDate: new Date().toISOString().split('T')[0]
        },
        evaluatorName: 'Self-Assessment',
        scenarioTime: '',
        startTime: this.evaluationStartTime || new Date().toISOString(),
        endTime: new Date().toISOString(),
        overwrite: false // Will be set to true if user confirms overwrite
      });

      // Handle existing evaluation prompt
      this.socket.once('evaluation-exists', (response) => {
        const confirmMessage = `${response.message}\n\nCurrent Score: ${response.existingEvaluation.score}%\nNew Score: ${response.newScore}%\n\nClick OK to overwrite, Cancel to keep existing.`;
        
        if (confirm(confirmMessage)) {
          console.log('👤 User confirmed overwrite of existing evaluation');
          // Resubmit with overwrite flag
          this.socket.emit('evaluation-complete', {
            courseWeekId: this.getCourseWeekId(),
            courseName: this.getCourseName(),
            score: {
              pct: evaluationData.scores.percentage,
              passed: evaluationData.scores.passed,
              failed: evaluationData.scores.failed || 0,
              total: evaluationData.scores.total,
              percentage: evaluationData.scores.percentage,
              percent: evaluationData.scores.percentage
            },
            items: evaluationData.items,
            notes: {
              summary: '',
              safety: '',
              follow: '',
              evaluatorName: 'Self-Assessment',
              scenarioTime: '',
              evaluationDate: new Date().toISOString().split('T')[0]
            },
            evaluatorName: 'Self-Assessment',
            scenarioTime: '',
            startTime: this.evaluationStartTime || new Date().toISOString(),
            endTime: new Date().toISOString(),
            overwrite: true
          });
        } else {
          console.log('👤 User cancelled evaluation overwrite');
          alert('Evaluation submission cancelled. Your existing evaluation remains unchanged.');
        }
      });

      // Listen for success response
      this.socket.once('evaluation-saved', (response) => {
        if (response.success) {
          console.log('✅ Evaluation submitted successfully via socket:', response);
          
          // Show success message (matching old HTML format)
          const scores = evaluationData.scores;
          let message = `Assessment submitted! Score: ${scores.percentage}% (${scores.passed}/${scores.total})`;
          
          // Add mode indicator and detailed status
          if (response.practiceMode) {
            message += '\n\n⚠️ PRACTICE MODE - Not saved to database';
            console.log('📝 Practice mode - evaluation not saved to database');
          } else {
            message += '\n\n✅ LIVE MODE - Successfully saved to database';
            if (response.wasOverwritten) {
              message += '\n🔄 Previous evaluation was overwritten';
            }
            console.log('💾 Live test session - evaluation saved to database successfully');
          }
          
          alert(message);
          
          // Clear saved state on successful submission
          localStorage.removeItem(`${this.config.id}_progress`);
        } else {
          console.error('❌ Evaluation submission failed:', response);
          alert(`❌ Failed to save evaluation to database!\n\nError: ${response.message || 'Unknown error'}\n\nPlease try again or contact your instructor.`);
        }
      });

    } catch (error) {
      console.error('❌ Error submitting evaluation:', error);
      alert(`❌ Failed to submit evaluation: ${error.message}`);
    }
  }

  // Helper method to determine course week ID based on scenario
  getCourseWeekId() {
    const scenario = this.config.id;
    if (scenario.includes('personal-care') || scenario.includes('week1')) return 1;
    if (scenario.includes('vital-signs') || scenario.includes('week2')) return 2;
    if (scenario.includes('medication') || scenario.includes('week3')) return 3;
    if (scenario.includes('gtube') || scenario.includes('week4')) return 4;
    if (scenario.includes('physical-assessment') || scenario.includes('week5')) return 5;
    return 1; // Default to week 1
  }

  // Helper method to get course name based on scenario
  getCourseName() {
    const scenario = this.config.id;
    if (scenario.includes('personal-care') || scenario.includes('week1')) return 'Week 1 - Personal Care';
    if (scenario.includes('vital-signs') || scenario.includes('week2')) return 'Week 2 - Vital Signs';
    if (scenario.includes('medication') || scenario.includes('week3')) return 'Week 3 - Medication';
    if (scenario.includes('gtube') || scenario.includes('week4')) return 'Week 4 - G-tube';
    if (scenario.includes('physical-assessment') || scenario.includes('week5')) return 'Week 5 - Physical Assessment';
    return this.config.title || 'Unknown Scenario';
  }

  submitFinalAssessment() {
    this.submitEvaluation();
  }

  expandAllSections() {
    const sections = document.querySelectorAll('.section-content');
    const buttons = document.querySelectorAll('[data-section-toggle]');
    
    sections.forEach(section => {
      section.style.display = 'block';
    });
    
    buttons.forEach(button => {
      button.setAttribute('aria-expanded', 'true');
      const icon = button.querySelector('.toggle-icon');
      if (icon) icon.textContent = '▾';
    });
  }

  collapseAllSections() {
    const sections = document.querySelectorAll('.section-content');
    const buttons = document.querySelectorAll('[data-section-toggle]');
    
    sections.forEach(section => {
      section.style.display = 'none';
    });
    
    buttons.forEach(button => {
      button.setAttribute('aria-expanded', 'false');
      const icon = button.querySelector('.toggle-icon');
      if (icon) icon.textContent = '▸';
    });
  }

  resetForm() {
    if (confirm('Are you sure you want to reset the entire form? This will clear all progress.')) {
      this.elements.evaluationForm.reset();
      this.finalTranscript = '';
      if (this.elements.transcriptFinal) this.elements.transcriptFinal.textContent = '';
      if (this.elements.transcriptInterim) this.elements.transcriptInterim.textContent = '';
      this.updateScores();
      this.showToast('Form reset successfully', 'info');
    }
  }

  saveProgress() {
    const formData = new FormData(this.elements.evaluationForm);
    const checkboxData = {};
    
    document.querySelectorAll('.checkbox:checked').forEach(cb => {
      checkboxData[cb.dataset.key] = true;
    });
    
    const progressData = {
      form: Object.fromEntries(formData.entries()),
      checkboxes: checkboxData,
      transcript: this.finalTranscript,
      timestamp: new Date().toISOString()
    };
    
    const storageKey = `${this.config.id}_progress`;
    localStorage.setItem(storageKey, JSON.stringify(progressData));
  }

  loadSavedProgress() {
    const storageKey = `${this.config.id}_progress`;
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
      try {
        const data = JSON.parse(saved);
        let hasRestoredCheckboxes = false;
        
        // Restore form values
        Object.keys(data.form || {}).forEach(key => {
          const field = document.getElementById(key);
          if (field && field !== this.elements.studentNameField) { // Don't override student name
            field.value = data.form[key];
          }
        });
        
        // Restore checkboxes
        Object.keys(data.checkboxes || {}).forEach(key => {
          const checkbox = document.querySelector(`[data-key="${key}"]`);
          if (checkbox) {
            checkbox.checked = data.checkboxes[key];
            if (data.checkboxes[key]) {
              hasRestoredCheckboxes = true;
            }
          }
        });
        
        // Restore transcript
        if (data.transcript) {
          this.finalTranscript = data.transcript;
          if (this.elements.transcriptFinal) {
            this.elements.transcriptFinal.textContent = this.finalTranscript;
          }
        }
        
        this.updateScores();
        
        // If we restored any checked checkboxes, send progress update to admin
        if (hasRestoredCheckboxes) {
          console.log('🔄 Restored checkboxes detected, will send progress update...');
          // Use a timeout to ensure socket is connected
          setTimeout(() => {
            if (this.socket && this.socket.connected) {
              this.sendProgressUpdate();
              console.log('📊 Sent progress update for restored checkboxes');
            }
          }, 2000);
        }
      } catch (error) {
        console.error('Error loading saved progress:', error);
      }
    }
  }

  saveLastEvaluation(data) {
    const storageKey = `${this.config.id}_lastEvaluation_${studentName}`;
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  recallLastEvaluation() {
    const storageKey = `${this.config.id}_lastEvaluation_${studentName}`;
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Restore the evaluation data
        this.loadSavedProgress();
        this.showToast('Last evaluation recalled successfully', 'success');
      } catch (error) {
        console.error('Error recalling last evaluation:', error);
        this.showToast('Error recalling last evaluation', 'error');
      }
    } else {
      this.showToast('No previous evaluation found', 'warning');
    }
  }

  setupAutoSave() {
    // Auto-save progress every 30 seconds
    this.progressTimer = setInterval(() => {
      this.saveProgress();
    }, 30000);

    // Save progress on page unload
    window.addEventListener('beforeunload', () => {
      this.saveProgress();
    });
  }

  showToast(message, type = 'info') {
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

  destroy() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }
    if (this.speechToText) {
      this.speechToText.stop();
    }
  }
}

// Make section toggle function global for HTML onclick handlers
window.toggleSection = function(button) {
  const content = button.nextElementSibling;
  const icon = button.querySelector('.toggle-icon');
  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  
  button.setAttribute('aria-expanded', !isExpanded);
  content.style.display = isExpanded ? 'none' : 'block';
  icon.textContent = isExpanded ? '▸' : '▾';
};

// Utility functions
const $ = (selector) => document.querySelector(selector);

function setText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function setValue(selector, value) {
  const element = $(selector);
  if (element) element.value = value;
}

// Session management functions (keeping existing login/socket logic)
function initializeSession() {
  console.log('🚀 Initializing session...');
  sessionId = localStorage.getItem('studentSession');
  studentName = localStorage.getItem('studentName');
  
  console.log('💾 Session data from localStorage:', {
    sessionId: sessionId,
    studentName: studentName,
    currentURL: window.location.href,
    scenario: new URLSearchParams(window.location.search).get('scenario')
  });
  
  if (sessionId && studentName) {
    console.log('✅ Valid session found, attempting to validate...');
    updateConnectionStatus('connecting');
    hideLoginModal();
    validateAndConnectSocket();
  } else {
    console.log('❌ No valid session found, showing login modal');
    updateConnectionStatus('no-session', 'Please log in to continue');
    showLoginModal();
  }
}

function showLoginModal() {
  const loginModal = $('#loginModal');
  if (loginModal) {
    loginModal.style.display = 'flex';
  }
}

function hideLoginModal() {
  const loginModal = $('#loginModal');
  if (loginModal) {
    loginModal.style.display = 'none';
  }
}

function showLoginError(message) {
  const loginError = $('#loginError');
  if (loginError) {
    loginError.textContent = message;
    loginError.style.display = 'block';
  }
}

function updateConnectionStatus(status, message = '') {
  const statusElement = $('#connectionStatus');
  if (!statusElement) return;

  const statusConfig = {
    'connecting': { emoji: '🔄', text: 'Connecting...', color: '#f59e0b' },
    'connected': { emoji: '✅', text: 'Connected', color: '#10b981' },
    'disconnected': { emoji: '❌', text: 'Disconnected', color: '#ef4444' },
    'reconnecting': { emoji: '🔄', text: 'Reconnecting...', color: '#f59e0b' },
    'no-session': { emoji: '🔒', text: 'Please log in', color: '#6b7280' }
  };

  const config = statusConfig[status] || statusConfig['disconnected'];
  statusElement.innerHTML = `${config.emoji} ${config.text}${message ? ': ' + message : ''}`;
  statusElement.style.color = config.color;
}

function updateSessionMode(isLive) {
  const sessionMode = document.getElementById('sessionMode');
  if (!sessionMode) return;
  
  sessionMode.style.display = 'inline-block';
  
  if (isLive) {
    sessionMode.className = 'session-mode live';
    sessionMode.textContent = '🔴 LIVE MODE';
  } else {
    sessionMode.className = 'session-mode practice';
    sessionMode.textContent = '📝 PRACTICE MODE';
  }
}

async function checkSessionMode() {
  try {
    const response = await fetch(`${API_BASE}/admin/status`);
    if (response.ok) {
      const data = await response.json();
      updateSessionMode(data.liveTestSessionActive);
      console.log('📊 Session mode:', data.liveTestSessionActive ? 'LIVE' : 'PRACTICE');
    }
  } catch (error) {
    console.warn('⚠️ Could not check session mode:', error);
    // Default to practice mode if we can't determine
    updateSessionMode(false);
  }
}

function showSessionModeNotification(message, mode) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `session-notification ${mode}`;
  notification.innerHTML = `
    <div class="notification-content">
      <strong>${message}</strong>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
  
  // Remove on click
  notification.addEventListener('click', () => {
    notification.remove();
  });
}

function setupLoginForm() {
  console.log('🔧 Setting up login form...');
  const loginForm = $('#loginForm');
  const usernameInput = $('#loginStudentName');
  const passwordInput = $('#loginPassword');
  
  console.log('🔍 Login form elements found:', {
    loginForm: !!loginForm,
    usernameInput: !!usernameInput,
    passwordInput: !!passwordInput
  });
  
  if (!loginForm || !usernameInput || !passwordInput) {
    console.error('❌ Missing login form elements');
    return;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('📝 Login form submitted');
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    console.log('🔐 Login attempt:', {
      username: username,
      passwordLength: password.length,
      currentURL: window.location.href,
      scenario: new URLSearchParams(window.location.search).get('scenario')
    });
    
    if (!username) {
      console.warn('⚠️ No username provided');
      showLoginError('Please enter your username');
      return;
    }
    
    if (!password) {
      console.warn('⚠️ No password provided');
      showLoginError('Please enter your password');
      return;
    }

    updateConnectionStatus('connecting');
    console.log('🌐 Sending login request to:', `${API_BASE}/auth/login`);
    
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      });

      console.log('📡 Login response status:', response.status);
      const result = await response.json();
      console.log('📦 Login response data:', result);
      
      if (response.ok && result.sessionId) {
        sessionId = result.sessionId;
        studentName = result.studentName || username;
        
        console.log('✅ Login successful:', {
          sessionId: sessionId,
          studentName: studentName,
          currentURL: window.location.href,
          scenario: new URLSearchParams(window.location.search).get('scenario')
        });
        
        localStorage.setItem('studentSession', sessionId);
        localStorage.setItem('studentName', studentName);
        
        console.log('💾 Session stored in localStorage');
        
        hideLoginModal();
        updateConnectionStatus('connecting');
        
        const studentNameField = $('#studentName');
        if (studentNameField) {
          studentNameField.value = studentName;
        }
        
        console.log('🔌 Attempting to connect socket...');
        connectSocket();
        
        console.log('✅ Student login successful:', studentName);
      } else {
        console.error('❌ Login failed:', {
          status: response.status,
          result: result
        });
        showLoginError('Invalid credentials or server error');
        updateConnectionStatus('no-session', 'Login failed');
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      showLoginError('Connection error. Please try again.');
      updateConnectionStatus('no-session', 'Connection error');
    }
  });
  
  const switchStudentBtn = $('#switchStudent');
  if (switchStudentBtn) {
    switchStudentBtn.addEventListener('click', () => {
      logout();
    });
  }
}

function connectSocket() {
  console.log('🔌 connectSocket called with:', {
    studentName: studentName,
    sessionId: sessionId,
    currentURL: window.location.href,
    scenario: new URLSearchParams(window.location.search).get('scenario')
  });
  
  if (!studentName || !sessionId) {
    console.error('❌ Cannot connect socket: missing credentials');
    updateConnectionStatus('no-session', 'No active session');
    return;
  }
  
  if (socket && socket.connected) {
    console.log('🔄 Disconnecting existing socket...');
    socket.disconnect();
  }

  console.log('🔌 Establishing student socket connection...');
  
  socket = io({
    path: SOCKET_PATH,
    auth: { 
      sessionId: sessionId,
      studentName: studentName,  // Add explicit student name
      role: 'student'
    },
    transports: ['websocket', 'polling'],
    timeout: 20000,
    autoConnect: true
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', {
      socketId: socket.id,
      studentName: studentName,
      scenario: new URLSearchParams(window.location.search).get('scenario')
    });
    updateConnectionStatus('connected');
    lastPingTime = Date.now();
    
    // Check session mode when socket connects
    checkSessionMode();
    
    // Initialize scenario features after socket connection
    console.log('🎯 Initializing scenario features...');
    initializeScenarioFeatures();
    
    // Send initial progress state to admin (for reconnections with existing checkmarks)
    setTimeout(() => {
      if (window.currentScenarioManager) {
        window.currentScenarioManager.sendInitialProgressUpdate();
      }
    }, 1000);
  });

  // Handle socket reconnection
  socket.on('reconnect', () => {
    console.log('🔄 Socket reconnected successfully');
    updateConnectionStatus('connected');
    lastPingTime = Date.now();
    
    // Send progress update after reconnection
    setTimeout(() => {
      if (window.currentScenarioManager) {
        console.log('📊 Sending progress update after reconnection...');
        window.currentScenarioManager.sendInitialProgressUpdate();
      }
    }, 1500);
  });

  // Listen for live test session mode changes from admin
  socket.on('session-mode-changed', (data) => {
    console.log('🔄 Session mode changed:', data);
    updateSessionMode(data.isLiveMode);
    
    // Show notification to user
    const message = data.isLiveMode 
      ? '🔴 LIVE MODE ACTIVATED - Your work will be saved to database!'
      : '📝 PRACTICE MODE - Your work will not be saved to database';
    
    // Create a temporary notification
    showSessionModeNotification(message, data.isLiveMode ? 'live' : 'practice');
  });

  // Listen for admin transcript save confirmations
  socket.on('admin-transcript-saved', (data) => {
    console.log('✅ Admin confirmed transcript saved:', data);
    
    // Show user confirmation that their speech was saved by admin
    if (data.saved) {
      showSessionModeNotification('💾 Your speech transcript has been saved by instructor', 'success');
    } else {
      showSessionModeNotification('❌ Failed to save speech transcript', 'error');
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', {
      reason: reason,
      scenario: new URLSearchParams(window.location.search).get('scenario')
    });
    updateConnectionStatus('disconnected', reason);
    
    if (!isManualDisconnect && reason !== 'io client disconnect') {
      setTimeout(() => attemptReconnection(), 2000);
    }
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Socket connection error:', error);
    updateConnectionStatus('disconnected', 'Connection failed');
    setTimeout(() => attemptReconnection(), 5000);
  });

  socket.on('pong', (timestamp) => {
    lastPingTime = Date.now(); // Use current time instead of timestamp
    console.log('🏓 Pong received, connection healthy');
  });

  // Improved health monitoring with exponential backoff
  const pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      const now = Date.now();
      socket.emit('ping', now);
      
      // More lenient timeout - 45 seconds instead of 30
      if (lastPingTime && (now - lastPingTime) > 45000) {
        console.warn('⚠️ No pong received in 45 seconds, connection may be stale');
        updateConnectionStatus('reconnecting', 'Checking connection...');
        
        // Try a gentle reconnection after extended silence
        if ((now - lastPingTime) > 60000) {
          console.log('🔄 Force reconnection due to ping timeout');
          socket.disconnect();
          attemptReconnection();
        }
      }
    }
  }, 15000); // Ping every 15 seconds instead of default
}

function initializeScenarioFeatures() {
  // Initialize the scenario manager if config is available
  if (currentScenario && !scenarioManager) {
    scenarioManager = new ScenarioManager(currentScenario);
    
    // Assign the global socket to the scenario manager
    if (socket) {
      scenarioManager.socket = socket;
      console.log('🔌 Assigned socket to ScenarioManager:', socket.id);
    }
    
    window.currentScenarioManager = scenarioManager; // Store reference for guided mode
    console.log('🎯 Scenario features initialized:', currentScenario.id);
    
    // Send initial progress update after a brief delay to ensure everything is loaded
    setTimeout(() => {
      if (scenarioManager && socket && socket.connected) {
        scenarioManager.sendInitialProgressUpdate();
      }
    }, 1500);
  }
}

async function validateAndConnectSocket() {
  console.log('🔍 Validating session with server...');
  try {
    const response = await fetch(`${API_BASE}/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });

    console.log('📡 Session validation response:', {
      status: response.status,
      ok: response.ok,
      sessionId: sessionId
    });

    if (response.ok) {
      const validationResult = await response.json();
      console.log('✅ Session validation successful:', validationResult);
      
      console.log('🔌 Connecting socket...');
      connectSocket();
      setTimeout(loadState, 800);
      updateRecallButtonVisibility();
    } else {
      const errorData = await response.text();
      console.error('❌ Session validation failed:', {
        status: response.status,
        error: errorData
      });
      console.log('🚪 Logging out due to invalid session...');
      logout();
    }
  } catch (error) {
    console.error('💥 Session validation error:', error);
  }
}

async function attemptReconnection() {
  try {
    const response = await fetch(`${API_BASE}/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });

    if (response.ok) {
      updateConnectionStatus('reconnecting');
      connectSocket();
    } else {
      logout();
    }
  } catch (error) {
    console.error('Reconnection failed:', error);
    setTimeout(() => attemptReconnection(), 10000);
  }
}

function logout() {
  console.log('🚪 Logout called - stack trace:', new Error().stack);
  console.log('🚪 Logout details:', {
    currentURL: window.location.href,
    scenario: new URLSearchParams(window.location.search).get('scenario'),
    sessionId: sessionId,
    studentName: studentName,
    socketConnected: socket ? socket.connected : false
  });
  
  isManualDisconnect = true;
  
  if (socket) {
    console.log('🔌 Disconnecting socket...');
    socket.disconnect();
    socket = null;
  }
  
  if (scenarioManager) {
    console.log('🧹 Destroying scenario manager...');
    scenarioManager.destroy();
    scenarioManager = null;
  }
  
  console.log('🗑️ Clearing localStorage...');
  localStorage.removeItem('studentSession');
  localStorage.removeItem('studentName');
  
  sessionId = null;
  studentName = null;
  
  console.log('📱 Updating UI for logout...');
  updateConnectionStatus('no-session', 'Logged out');
  showLoginModal();
  
  const studentNameField = $('#studentName');
  if (studentNameField) {
    studentNameField.value = '';
  }
  
  isManualDisconnect = false;
  console.log('🚪 Logout complete');
}

async function loadState() {
  // Load any saved state after connection
  console.log('📊 Loading saved state...');
}

function updateRecallButtonVisibility() {
  const recallBtn = $('#recallEvaluationBtn');
  if (recallBtn && studentName) {
    const hasLastEvaluation = localStorage.getItem(`${currentScenario?.id}_lastEvaluation_${studentName}`);
    recallBtn.style.display = hasLastEvaluation ? 'inline-block' : 'none';
  }
}

// Initialize scenario with unified system
export function initScenario(config = {}) {
  const {
    id = 'scenario',
    pageTitle = 'NURS 10L Scenario',
    title = 'NURS 10L Scenario',
    subtitle = 'Peer assessment practice',
    defaultScenarioTime = '',
    contentHtml = '',
    contentPath = '',
    setup
  } = config;

  // Store current scenario config globally
  currentScenario = config;

  document.documentElement.setAttribute('data-scenario', id);
  setText('#pageTitle', pageTitle);
  setText('#scenarioTitle', title);
  setText('#scenarioSubtitle', subtitle);

  const today = new Date().toISOString().split('T')[0];
  setValue('#evaluationDate', today);
  setValue('#scenarioTime', defaultScenarioTime);

  // Initialize socket connection
  initializeSession();
  
  // Setup login form handler
  setupLoginForm();

  const contentContainer = $('#scenarioContent');

  function setContent(html) {
    if (contentContainer) {
      contentContainer.innerHTML = html;
    }
  }

  function runSetup() {
    // Instead of running arbitrary setup function, 
    // initialize the unified scenario manager
    if (socket && socket.connected) {
      initializeScenarioFeatures();
    }
    // The scenario manager will be initialized when socket connects
  }

  if (contentHtml) {
    setContent(contentHtml);
    runSetup();
  } else if (contentPath) {
    fetch(contentPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load scenario content (${response.status})`);
        }
        return response.text();
      })
      .then((html) => {
        setContent(html);
        runSetup();
      })
      .catch((error) => {
        console.error('Error loading scenario content:', error);
        setContent('<p>Unable to load scenario content at this time.</p>');
        runSetup();
      });
  } else {
    setContent('<p>Scenario content will be available soon.</p>');
    runSetup();
  }

  console.info(`Initialized unified scenario: ${id}`);
}

// Global guided mode functions
window.markGuidedItem = function(result) {
  if (!window.currentScenarioManager?.guidedActive) return;
  
  const currentItem = window.currentScenarioManager.guidedQueue[window.currentScenarioManager.guidedIndex];
  if (!currentItem) return;
  
  const passCheckbox = currentItem.querySelector('input.checkbox.pass');
  const failCheckbox = currentItem.querySelector('input.checkbox.fail');
  
  if (result === 'pass' && passCheckbox) {
    passCheckbox.checked = true;
    if (failCheckbox) failCheckbox.checked = false;
    currentItem.classList.add('checked');
    currentItem.classList.remove('failed');
  } else if (result === 'fail' && failCheckbox) {
    failCheckbox.checked = true;
    if (passCheckbox) passCheckbox.checked = false;
    currentItem.classList.add('failed');
    currentItem.classList.remove('checked');
  }
  
  // Update progress and continue
  window.currentScenarioManager.updateScores();
  window.currentScenarioManager.sendProgressUpdate();
  window.advanceGuidedItem();
};

window.skipGuidedItem = function() {
  if (!window.currentScenarioManager?.guidedActive) return;
  window.advanceGuidedItem();
};

window.advanceGuidedItem = function() {
  if (!window.currentScenarioManager?.guidedActive) return;
  
  window.currentScenarioManager.guidedIndex++;
  window.currentScenarioManager.showNextGuidedItem();
};

window.cancelGuidedMode = function() {
  if (!window.currentScenarioManager?.guidedActive) return;
  
  window.currentScenarioManager.guidedActive = false;
  window.currentScenarioManager.guidedQueue = [];
  window.currentScenarioManager.guidedIndex = 0;
  
  // Hide guided toast
  const guidedToast = document.getElementById('guidedToast');
  if (guidedToast) guidedToast.style.display = 'none';
  
  // Remove highlights
  document.querySelectorAll('.checklist-item').forEach(el => {
    el.classList.remove('guided-highlight');
  });
  
  console.log('❌ Guided mode cancelled');
};

// Export socket and utility functions for use by scenario modules
export { socket, sessionId, studentName, connectSocket, logout, updateConnectionStatus, ScenarioManager };