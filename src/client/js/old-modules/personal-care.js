export default function setupPersonalCareScenario() {
// Subpath support when served behind Traefik at /N10LVoice
    const BASE_PATH = location.pathname.toLowerCase().startsWith('/n10lvoice/') ? '/N10LVoice' : '';
    const API_BASE = `${BASE_PATH}/api`;
    const SOCKET_PATH = `${BASE_PATH}/socket.io`;

    const defaultScenarioField = document.getElementById('scenarioTime');
    const defaultEvaluationDateField = document.getElementById('evaluationDate');
    const DEFAULT_SCENARIO_TIME = defaultScenarioField ? defaultScenarioField.value : '0700 (Breakfast at 0730)';
    const DEFAULT_EVALUATION_DATE = defaultEvaluationDateField ? defaultEvaluationDateField.value : new Date().toISOString().split('T')[0];

    const LAST_EVALUATION_PREFIX = 'personalCareLastEvaluation_';

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
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to load last evaluation snapshot:', error);
        return null;
      }
    }

    function updateRecallButtonVisibility() {
      const btn = document.getElementById('recallEvaluationBtn');
      if (!btn) return;
      const key = getLastEvaluationStorageKey();
      const hasSnapshot = key && localStorage.getItem(key);
      btn.style.display = hasSnapshot ? 'inline-flex' : 'none';
      btn.disabled = !hasSnapshot;
      if (hasSnapshot) {
        btn.setAttribute('aria-label', 'Recall your most recent submission for review');
      }
    }

    // Utilities
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
    const $  = (sel, root=document) => root.querySelector(sel);

    // Real-time Socket.IO functionality
    let socket = null;
    let sessionId = localStorage.getItem('studentSession');
    let studentName = localStorage.getItem('studentName');
    let evaluationStartTime = null;
    let reconnectAttempts = 0;
    let maxReconnectAttempts = 5;
    let reconnectInterval = null;
    let isManualDisconnect = false;

    // Check if student is already logged in with valid session
    // Auto-save form state during disconnections
    function saveFormState() {
      const formData = {
        evaluatorName: document.getElementById('evaluatorName')?.value || '',
        scenarioTime: document.getElementById('scenarioTime')?.value || '',
        additionalNotes: document.getElementById('additional_notes')?.value || '',
        checkboxStates: {},
        timestamp: Date.now()
      };
      
      // Save all checkbox states
      document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        if (checkbox.id) {
          formData.checkboxStates[checkbox.id] = checkbox.checked;
        }
      });
      
      localStorage.setItem('evaluationFormState', JSON.stringify(formData));
    }

    function restoreFormState() {
      const savedState = localStorage.getItem('evaluationFormState');
      if (!savedState) return;
      
      try {
        const formData = JSON.parse(savedState);
        
        // Only restore if saved within last hour
        if (Date.now() - formData.timestamp > 60 * 60 * 1000) {
          localStorage.removeItem('evaluationFormState');
          return;
        }
        
        // Restore form fields
        if (formData.evaluatorName) {
          const field = document.getElementById('evaluatorName');
          if (field) field.value = formData.evaluatorName;
        }
        
        if (formData.scenarioTime) {
          const field = document.getElementById('scenarioTime');
          if (field) field.value = formData.scenarioTime;
        }
        
        if (formData.additionalNotes) {
          const field = document.getElementById('additional_notes');
          if (field) field.value = formData.additionalNotes;
        }
        
        // Restore checkbox states
        Object.entries(formData.checkboxStates).forEach(([id, checked]) => {
          const checkbox = document.getElementById(id);
          if (checkbox) {
            checkbox.checked = checked;
          }
        });
        
        updateCounts();
        showSuccess('📋 Previous form data restored from auto-save');
        
      } catch (error) {
        console.error('Error restoring form state:', error);
        localStorage.removeItem('evaluationFormState');
      }
    }

    async function checkExistingSession() {
      if (sessionId && studentName) {
        try {
          const response = await fetch(`${API_BASE}/auth/validate-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
          
          if (response.ok) {
            connectSocket();
            // Restore any saved form state after connecting
            setTimeout(restoreFormState, 1000);
            updateRecallButtonVisibility();
            return;
          }
        } catch (error) {
          console.log('Session validation failed:', error);
        }
        
        // Clear invalid session
        localStorage.removeItem('studentSession');
        localStorage.removeItem('studentName');
        sessionId = null;
        studentName = null;
        updateRecallButtonVisibility();
      }
      
      showLoginModal();
    }

    checkExistingSession();

    function showLoginModal() {
      document.getElementById('loginModal').style.display = 'flex';
    }

    function hideLoginModal() {
      document.getElementById('loginModal').style.display = 'none';
    }

    function updateConnectionStatus(status, attempts = 0) {
      const statusEl = document.getElementById('connectionStatus');
      statusEl.style.display = 'block';
      statusEl.style.color = 'white';
      
      switch (status) {
        case 'connected':
          statusEl.style.background = 'var(--pass)';
          statusEl.textContent = '🟢 Connected';
          break;
        case 'disconnected':
          statusEl.style.background = 'var(--fail)';
          statusEl.textContent = '� Disconnected';
          break;
        case 'reconnecting':
          statusEl.style.background = 'var(--warn)';
          statusEl.textContent = `🟡 Reconnecting... (${attempts}/${maxReconnectAttempts})`;
          break;
        case 'failed':
          statusEl.style.background = 'var(--fail)';
          statusEl.textContent = '🔴 Connection Failed - Click to Retry';
          statusEl.style.cursor = 'pointer';
          statusEl.onclick = () => attemptReconnection();
          break;
        default:
          statusEl.style.background = 'var(--muted)';
          statusEl.textContent = '⚪ Unknown Status';
      }
    }

    // Enhanced speech recognition connection status
    function updateSpeechConnectionStatus(state, message, attempts = 0, maxAttempts = 10) {
      const statusEl = document.getElementById('connectionStatus');
      if (!statusEl) return;
      
      statusEl.style.display = 'block';
      statusEl.style.color = 'white';
      statusEl.style.cursor = 'default';
      statusEl.onclick = null;
      
      switch (state) {
        case 'connected':
          statusEl.style.background = '#28a745'; // Green
          statusEl.textContent = '🎤 Speech Recognition Active';
          // Auto-hide after successful connection
          setTimeout(() => {
            if (statusEl.textContent.includes('Active')) {
              statusEl.style.display = 'none';
            }
          }, 3000);
          break;
          
        case 'connecting':
          statusEl.style.background = '#17a2b8'; // Blue
          statusEl.textContent = '🔄 Starting Speech Recognition...';
          break;
          
        case 'reconnecting':
          statusEl.style.background = '#ffc107'; // Yellow
          if (attempts > 0) {
            statusEl.textContent = `🔄 Reconnecting Speech... (${attempts}/${maxAttempts})`;
          } else {
            statusEl.textContent = '🔄 Reconnecting Speech Recognition...';
          }
          break;
          
        case 'disconnected':
          statusEl.style.background = '#6c757d'; // Gray
          statusEl.textContent = '⏸️ Speech Recognition Stopped';
          // Auto-hide disconnected status after delay
          setTimeout(() => {
            if (statusEl.textContent.includes('Stopped')) {
              statusEl.style.display = 'none';
            }
          }, 2000);
          break;
          
        case 'error':
          statusEl.style.background = '#dc3545'; // Red
          statusEl.textContent = '🚨 Speech Recognition Error';
          statusEl.style.cursor = 'pointer';
          statusEl.title = message || 'Click to retry';
          statusEl.onclick = () => {
            if (typeof startSpeechRecognition === 'function') {
              startSpeechRecognition();
            }
          };
          break;
          
        default:
          statusEl.style.background = '#6c757d';
          statusEl.textContent = `🔄 ${state}: ${message}`;
      }
    }

    // Show speech status notifications
    function showSpeechStatus(message, type = 'info', duration = 3000) {
      // Create or get notification element
      let notification = document.getElementById('speechNotification');
      if (!notification) {
        notification = document.createElement('div');
        notification.id = 'speechNotification';
        notification.style.cssText = `
          position: fixed;
          top: 80px;
          right: 20px;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          z-index: 1000;
          max-width: 300px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: all 0.3s ease;
          transform: translateX(100%);
        `;
        document.body.appendChild(notification);
      }
      
      // Style based on type
      switch (type) {
        case 'success':
          notification.style.background = '#d4edda';
          notification.style.color = '#155724';
          notification.style.border = '1px solid #c3e6cb';
          break;
        case 'warning':
          notification.style.background = '#fff3cd';
          notification.style.color = '#856404';
          notification.style.border = '1px solid #ffeaa7';
          break;
        case 'error':
          notification.style.background = '#f8d7da';
          notification.style.color = '#721c24';
          notification.style.border = '1px solid #f5c6cb';
          break;
        default: // info
          notification.style.background = '#d1ecf1';
          notification.style.color = '#0c5460';
          notification.style.border = '1px solid #bee5eb';
      }
      
      notification.textContent = message;
      notification.style.transform = 'translateX(0)';
      
      // Auto-hide after duration
      setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, duration);
    }

    async function registerStudent(name) {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password: 'student123', role: 'student' })
      });
      const data = await response.json();
      if (response.ok) return data.token;
      if (response.status === 409) return await loginStudent(name);
      throw new Error(data.error || 'Registration failed');
    }

    async function loginStudent(name) {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password: 'student123' })
      });
      const data = await response.json();
      if (response.ok) return data.token;
      throw new Error(data.error || 'Login failed');
    }

    function connectSocket() {
      if (!studentName || !sessionId) return;
      
      // Configure Socket.IO with reconnection settings
      socket = io({ 
        path: SOCKET_PATH, 
        auth: { sessionId: sessionId },
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
      });

      socket.on('connect', () => {
        console.log('Connected to evaluation server');
        updateConnectionStatus('connected');
        reconnectAttempts = 0;
        clearInterval(reconnectInterval);
        
        // Save evaluation start time only on first connect
        if (!evaluationStartTime) {
          evaluationStartTime = new Date().toISOString();
        }
        
        // Initialize Speech-to-Text after socket connection
        console.log('🔗 Socket connected, initializing speech...');
        initializeSpeech();
        
        // Pre-fill and lock student name in form
        const studentNameField = document.getElementById('studentName');
        if (studentNameField) {
          studentNameField.value = studentName;
          studentNameField.readonly = true;
          studentNameField.style.backgroundColor = '#f8f9fa';
          studentNameField.style.color = '#495057';
          studentNameField.style.border = '2px solid #28a745';
          studentNameField.style.fontWeight = 'bold';
          studentNameField.title = '🔒 Locked to logged-in user: ' + studentName;
        }
        
        // Show success message if this was a reconnection
        if (reconnectAttempts > 0) {
          showSuccess('✅ Reconnected successfully! Your progress is preserved.');
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        updateConnectionStatus('disconnected');
        
        // Only attempt reconnection if it wasn't a manual disconnect
        if (!isManualDisconnect && reason !== 'io client disconnect') {
          startReconnectionProcess();
        }
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Reconnection attempt ${attemptNumber}`);
        updateConnectionStatus('reconnecting', attemptNumber);
      });

      socket.on('reconnect_failed', () => {
        console.log('All reconnection attempts failed');
        updateConnectionStatus('failed');
        showError('❌ Connection lost. Click the status indicator to retry.');
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        
        if (error.message === 'Authentication error' || error.message.includes('session')) {
          showError('🔐 Session expired. Please sign in again.');
          logout();
        } else {
          updateConnectionStatus('disconnected');
          if (!isManualDisconnect) {
            startReconnectionProcess();
          }
        }
      });
    }

    function startReconnectionProcess() {
      if (reconnectInterval) return; // Already reconnecting
      
      reconnectInterval = setInterval(() => {
        reconnectAttempts++;
        console.log(`Manual reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
        updateConnectionStatus('reconnecting', reconnectAttempts);
        
        if (reconnectAttempts >= maxReconnectAttempts) {
          clearInterval(reconnectInterval);
          reconnectInterval = null;
          updateConnectionStatus('failed');
          return;
        }
        
        // Attempt to validate session and reconnect
        attemptReconnection();
      }, 3000);
    }

    async function attemptReconnection() {
      try {
        // First validate the session
        const response = await fetch(`${API_BASE}/auth/validate-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
        
        if (response.ok) {
          // Session is valid, try to reconnect socket
          if (socket) {
            socket.disconnect();
          }
          connectSocket();
        } else {
          // Session expired
          showError('🔐 Your session has expired. Please sign in again.');
          logout();
        }
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }

    function logout() {
      isManualDisconnect = true;
      clearInterval(reconnectInterval);
      reconnectInterval = null;
      
      localStorage.removeItem('studentSession');
      localStorage.removeItem('studentName');
      localStorage.removeItem('sessionExpires');
      sessionId = null;
      studentName = null;
      evaluationStartTime = null;
      reconnectAttempts = 0;
      
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      
      isManualDisconnect = false;
      showLoginModal();
      updateConnectionStatus('disconnected');
    }

    function showError(message) {
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    }

    function showSuccess(message) {
      // Create temporary success message
      const successEl = document.createElement('div');
      successEl.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: var(--pass); color: white; padding: 12px 20px;
        border-radius: 6px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;
      successEl.textContent = message;
      document.body.appendChild(successEl);
      
      setTimeout(() => {
        successEl.remove();
      }, 4000);
    }

  function sendProgressUpdate() {
      if (!socket || !socket.connected) return;

      const score = getCurrentScore();
      const items = getCurrentItems();
      
      socket.emit('evaluation-update', {
        score: score,
        items: items,
        timestamp: new Date().toISOString(),
        courseWeekId: 1,
        scenarioTitle: 'Week 1 - Personal Care'
      });
    }

    function getCurrentScore() {
      let passed = 0, failed = 0, total = 0;
      
      $$('.checklist-item').forEach(item => {
        if (item.closest('.section')) {
          total++;
          const passCheckbox = item.querySelector('input.checkbox.pass[type="checkbox"]');
          const failCheckbox = item.querySelector('input.checkbox.fail[type="checkbox"]');
          
          if (passCheckbox && passCheckbox.checked) {
            passed++;
          } else if (failCheckbox && failCheckbox.checked) {
            failed++;
          }
          // Items with neither checked are just incomplete
        }
      });

      // Calculate percentage based on completed items (passed + failed) vs total items
      const completed = passed + failed;
      const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
      
      return { passed, failed, total, percent };
    }

    function getCurrentItems() {
      const items = [];
      // Maintain per-section sequence counters for deterministic ordering
      const sectionSequenceCounters = {};

      $$('.section').forEach(section => {
        const sectionName = section.querySelector('.section-title')?.textContent?.trim() || 'Unknown Section';
        const checklistItems = $$('.checklist-item', section);
        if (!(sectionName in sectionSequenceCounters)) sectionSequenceCounters[sectionName] = 0;

        checklistItems.forEach((checklistItem) => {
          const seq = sectionSequenceCounters[sectionName]++;
          // Get the item text
            const itemTextDiv = checklistItem.querySelector('.item-text');
            const itemText = itemTextDiv ? itemTextDiv.textContent?.trim() : 'Unknown Item';

            // Check for PASS and FAIL checkboxes
            const passCheckbox = checklistItem.querySelector('input.checkbox.pass[type="checkbox"]');
            const failCheckbox = checklistItem.querySelector('input.checkbox.fail[type="checkbox"]');
            const isCritical = passCheckbox?.dataset.critical === 'true';

            let status = 'not_completed';
            let notes = 'Not completed';

            if (passCheckbox && passCheckbox.checked) {
              status = 'pass';
              notes = 'Passed - criteria met';
            } else if (failCheckbox && failCheckbox.checked) {
              status = 'fail';
              notes = 'Failed - criteria not met';
            }

            // Unique key stable with sequence
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

    // =============== Guided Error Correction ===============
    let guidedQueue = [];
    let guidedIndex = 0;
    let guidedActive = false;

    function collectIncompleteItems() {
      const list = [];
      $$('.checklist-item').forEach(ci => {
        const pass = ci.querySelector('input.checkbox.pass');
        const fail = ci.querySelector('input.checkbox.fail');
        if (!pass || !fail) return;
        if (!pass.checked && !fail.checked) {
          list.push(ci);
        }
      });
      return list;
    }

    function ensureSectionVisible(item) {
      const section = item.closest('.section');
      if (!section) return;
      if (section.classList.contains('collapsed')) {
        const header = section.querySelector('.section-header');
        header?.setAttribute('aria-expanded','true');
        section.classList.remove('collapsed');
      }
      // Scroll with smooth center alignment
      setTimeout(()=>{
        item.scrollIntoView({ behavior:'smooth', block:'center'});
      }, 50);
    }

    function clearGuidedFocus() {
      $$('.checklist-item.incomplete-focus').forEach(el=> el.classList.remove('incomplete-focus'));
    }

    function showGuidedToast() {
      const root = $('#guidedToastRoot');
      if (!root) return;
      const remaining = guidedQueue.length - guidedIndex;
      const currentItem = guidedQueue[guidedIndex];
      if (!currentItem) { root.innerHTML=''; guidedActive=false; return; }
      const itemText = currentItem.querySelector('.item-text')?.textContent?.trim() || 'Checklist item';
      const pct = guidedQueue.length ? Math.round((guidedIndex)/guidedQueue.length*100) : 100;
      root.innerHTML = `
        <div class="guided-toast" role="dialog" aria-label="Incomplete checklist guidance">
          <button class="guided-close" onclick="cancelGuidedMode()" aria-label="Close">×</button>
          <h4>Complete All Items Before Submitting</h4>
          <div class="guided-progress">Item ${guidedIndex+1} of ${guidedQueue.length} • ${pct}% reviewed</div>
          <div class="guided-item-text">${itemText}</div>
          <div class="guided-actions">
            <button class="guided-btn pass" onclick="markGuided('pass')">✓ Pass</button>
            <button class="guided-btn fail" onclick="markGuided('fail')">✗ Fail</button>
            <button class="guided-btn next" onclick="skipGuided()" ${remaining<=1? 'disabled style=\"opacity:.4;cursor:not-allowed;\"':''}>Skip</button>
            <button class="guided-btn submit" onclick="resumeSubmission()" ${remaining>1? 'disabled':''}><span>Submit Now</span></button>
          </div>
        </div>`;
    }
    window.showGuidedToast = showGuidedToast;

    function startGuidedMode(onSubmitAfter=true) {
      guidedQueue = collectIncompleteItems();
      guidedIndex = 0;
      guidedActive = true;
      if (!guidedQueue.length) return false;
      focusCurrentGuided();
      showGuidedToast();
      return true;
    }
    window.startGuidedMode = startGuidedMode;

    function focusCurrentGuided() {
      clearGuidedFocus();
      const current = guidedQueue[guidedIndex];
      if (!current) return;
      current.classList.add('incomplete-focus');
      ensureSectionVisible(current);
    }

    function markGuided(mode) {
      const current = guidedQueue[guidedIndex];
      if (!current) return;
      const key = current.querySelector('input.checkbox.pass')?.getAttribute('data-key');
      if (mode==='pass') {
        const pass = current.querySelector('input.checkbox.pass');
        const fail = current.querySelector('input.checkbox.fail');
        if (pass) { pass.checked = true; fail && (fail.checked = false); }
        current.classList.add('checked'); current.classList.remove('failed');
      } else if (mode==='fail') {
        const pass = current.querySelector('input.checkbox.pass');
        const fail = current.querySelector('input.checkbox.fail');
        if (fail) { fail.checked = true; pass && (pass.checked = false); }
        current.classList.add('failed'); current.classList.remove('checked');
      }
      updateCounts();
      advanceGuided();
    }
    window.markGuided = markGuided;

    function skipGuided() {
      advanceGuided();
    }
    window.skipGuided = skipGuided;

    function advanceGuided() {
      guidedQueue = collectIncompleteItems();
      if (guidedQueue.length === 0) { completeGuided(); return; }
      if (guidedIndex >= guidedQueue.length) guidedIndex = 0; // wrap
      focusCurrentGuided();
      showGuidedToast();
    }

    function completeGuided() {
      clearGuidedFocus();
      guidedActive = false;
      const root = $('#guidedToastRoot');
      if (root) root.innerHTML = `<div class="guided-toast" style="background:#0f172a;">
        <h4>All items answered ✅</h4>
        <div style="font-size:.85rem; opacity:.85;">You can submit now.</div>
        <div class="guided-actions" style="margin-top:10px;">
          <button class="guided-btn submit" onclick="resumeSubmission()">Submit Evaluation</button>
          <button class="guided-btn next" onclick="cancelGuidedMode()">Close</button>
        </div>
      </div>`;
    }

    function cancelGuidedMode() {
      guidedActive = false;
      clearGuidedFocus();
      const root = $('#guidedToastRoot');
      if (root) root.innerHTML = '';
    }
    window.cancelGuidedMode = cancelGuidedMode;

    let pendingSubmitForce = false;
    function guardedSubmit(forceOverwrite=false) {
      const incompletes = collectIncompleteItems();
      if (incompletes.length) {
        // Start guided mode
        startGuidedMode();
        showGuidedToast();
        pendingSubmitForce = forceOverwrite;
        return; // Halt normal submission
      }
      // All good – proceed
      submitEvaluation(forceOverwrite);
    }

    function resumeSubmission() {
      // Re-check in case items still incomplete
      const incompletes = collectIncompleteItems();
      if (incompletes.length) {
        guidedQueue = incompletes; guidedIndex = 0; focusCurrentGuided(); showGuidedToast();
        return;
      }
      cancelGuidedMode();
      submitEvaluation(pendingSubmitForce);
    }
    window.resumeSubmission = resumeSubmission;

    async function submitEvaluation(forceOverwrite = false) {
      console.log('🚀 submitEvaluation called with forceOverwrite:', forceOverwrite);
      
      if (!socket || !socket.connected) {
        const retry = confirm(
          '🔌 Not connected to server.\n\n' +
          'Would you like to try reconnecting first?\n\n' +
          'Click OK to attempt reconnection, or Cancel to abort submission.'
        );
        
        if (retry) {
          showSuccess('🔄 Attempting to reconnect...');
          await attemptReconnection();
          
          // Wait a moment for reconnection
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (!socket || !socket.connected) {
            alert('❌ Reconnection failed. Please refresh the page and try again.');
            return;
          } else {
            showSuccess('✅ Reconnected! Proceeding with submission...');
          }
        } else {
          return;
        }
      }

      const score = getCurrentScore();
      const items = getCurrentItems();
      const notes = {
        additionalNotes: document.getElementById('additional_notes')?.value || '',
        evaluatorName: document.getElementById('evaluatorName')?.value || '',
        scenarioTime: document.getElementById('scenarioTime')?.value || '',
        evaluationDate: document.getElementById('evaluationDate')?.value || '',
        sbar_notes: document.getElementById('sbar_notes')?.value || '',
        collaboration_notes: document.getElementById('collaboration_notes')?.value || '',
        critical_thinking_notes: document.getElementById('critical_thinking_notes')?.value || '',
        clinical_judgment_notes: document.getElementById('clinical_judgment_notes')?.value || ''
      };

      // Check for duplicate evaluations first (unless forcing overwrite)
      if (!forceOverwrite) {
        try {
          console.log('🔍 Checking for duplicate evaluation for:', studentName);
          console.log('🌐 API Base URL:', API_BASE);
          console.log('📝 Request payload:', { studentName: studentName, courseWeekId: 1 });
          
          const duplicateResponse = await fetch(`${API_BASE}/evaluations/check-duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              studentName: studentName, 
              courseWeekId: 1 
            })
          });
          
          console.log('📡 Duplicate check response status:', duplicateResponse.status);
          
          if (!duplicateResponse.ok) {
            console.error('❌ Duplicate check failed with status:', duplicateResponse.status);
            throw new Error(`HTTP ${duplicateResponse.status}`);
          }
          
          const duplicateData = await duplicateResponse.json();
          console.log('📊 Duplicate check result:', duplicateData);
          
          if (duplicateData.duplicate) {
            const existing = duplicateData.existingEvaluation;
            const existingDate = new Date(existing.completedAt).toLocaleDateString();
            const existingTime = new Date(existing.completedAt).toLocaleTimeString();
            
            const overwrite = confirm(
              `⚠️ DUPLICATE EVALUATION DETECTED\n\n` +
              `Student "${studentName}" already has an evaluation for Personal Care:\n\n` +
              `• Previous Score: ${existing.score}%\n` +
              `• Completed: ${existingDate} at ${existingTime}\n\n` +
              `Do you want to OVERWRITE the previous evaluation?\n\n` +
              `Click OK to overwrite, or Cancel to keep the existing evaluation.`
            );
            
            if (!overwrite) {
              alert('Evaluation submission cancelled. Previous evaluation preserved.');
              return;
            }
            
            // User confirmed overwrite, proceed with forced submission
            return submitEvaluation(true);
          }
        } catch (error) {
          console.error('❌ Error checking for duplicates:', error);
          alert(`⚠️ Duplicate check failed: ${error.message}\n\nPlease check the console for details.`);
          const proceed = confirm(
            'Unable to check for duplicate evaluations.\n\n' +
            'Do you want to proceed with submission anyway?'
          );
          if (!proceed) return;
        }
      }

      // Send completion event to server
      console.log('📡 Emitting evaluation-complete with overwrite:', forceOverwrite);
      
      socket.emit('evaluation-complete', {
        courseWeekId: 1, // Week 1 - Personal Care Evaluation
        courseName: 'Personal Care Evaluation',
        score: score,
        items: items,
        notes: notes,
        evaluatorName: notes.evaluatorName,
        scenarioTime: notes.scenarioTime,
        startTime: evaluationStartTime,
        endTime: new Date().toISOString(),
        overwrite: forceOverwrite
      });

      // Clear auto-saved form state after successful submission
      localStorage.removeItem('evaluationFormState');
      const snapshot = {
        timestamp: Date.now(),
        studentName,
        courseWeekId: 1,
        score,
        notes,
        items
      };
      saveLastEvaluationSnapshot(snapshot);
      updateRecallButtonVisibility();

      alert(`Evaluation completed!\nScore: ${score.percent}% (${score.passed}/${score.total})`);

      resetAssessmentState({ preserveStudentInfo: true, preserveSpeechTranscript: false, silent: true });
      showSuccess('Submission recorded. Workspace reset for the next assessment.');
    }

    // Login form handler
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('loginStudentName').value.trim();
      const password = document.getElementById('loginPassword').value;
      if (!name) { showError('Please enter your name'); return; }
      if (!password) { showError('Password is required'); return; }
      const prevName = localStorage.getItem('studentName');
      try {
        const response = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: password }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Login failed');
        if (data.sessionId && data.studentName) {
          // Clear previous student's data BEFORE overwriting localStorage
          clearWeek1ProgressForNewStudent(data.studentName);
          studentName = data.studentName;
          sessionId = data.sessionId;
          localStorage.setItem('studentName', data.studentName);
            localStorage.setItem('studentSession', data.sessionId);
          localStorage.setItem('sessionExpires', data.expiresAt);
          hideLoginModal();
          connectSocket();
        } else {
          throw new Error('Login failed - no session created');
        }
      } catch (error) {
        showError(error.message || 'Failed to sign in');
      }
    });

    // --- New Student Login Clearing Logic ---
    function clearWeek1ProgressForNewStudent(newName){
      const prev = localStorage.getItem('studentName');
      if(prev && prev.trim().toLowerCase() !== newName.trim().toLowerCase()){
        // Remove stored states relevant to Week 1 / Personal Care
        localStorage.removeItem('n10l_peer_eval_state');
        localStorage.removeItem('evaluationFormState');
        // Reset checklist UI
        $$('.checklist-item').forEach(ci=>{
          ci.classList.remove('checked','failed');
          ci.querySelectorAll('input[type="checkbox"]').forEach(c=> c.checked = false);
        });
        // Clear evaluator name (studentName stays locked to new login)
        const evaluatorField = document.getElementById('evaluatorName');
        if(evaluatorField) evaluatorField.value='';
        updateCounts();
        showSuccess('Previous student data cleared');
      }
    }

  // Removed delayed clearing listener – clearing now handled synchronously in login handler.

    // --- Switch Student / Logout Feature (Week 1) ---
    function switchStudent(){
      if(!confirm('Switch student? This will clear current progress.')) return;
      try { if(socket) socket.disconnect(); } catch(e){}
      // Clear global session identifiers
      localStorage.removeItem('studentSession');
      localStorage.removeItem('studentName');
      // Clear week-specific stored state
      localStorage.removeItem('n10l_peer_eval_state');
      localStorage.removeItem('evaluationFormState');
      // Reset in‑memory vars
      sessionId=null; studentName=null; evaluationStartTime=null;
      // Clear UI selections
      $$('.checklist-item').forEach(ci=>{ ci.classList.remove('checked','failed'); ci.querySelectorAll('input[type="checkbox"]').forEach(c=> c.checked=false); });
      const evalField=$('#evaluatorName'); if(evalField) evalField.value='';
      // Show login modal again
      if(typeof showLoginModal==='function') showLoginModal(); else document.getElementById('loginModal').style.display='flex';
      showSuccess('Student session cleared. Ready for new login.');
    }
    // Attach listener after DOM ready if button exists
    const attachSwitchStudentHandler = () => {
      const btn = document.getElementById('switchStudent');
      if (btn) btn.addEventListener('click', switchStudent);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachSwitchStudentHandler, { once: true });
    } else {
      attachSwitchStudentHandler();
    }

    function toggleSection(btn) {
      const section = btn.closest('.section');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      section.classList.toggle('collapsed', expanded);
    }
    window.toggleSection = toggleSection;

    function updateCounts() {
      // Per-section counts
      $$('.section').forEach(sec => {
        const content = $('.section-content', sec);
        if (!content) return;
        const items = $$('.checklist-item', content);
        const passed = items.filter(x => x.classList.contains('checked')).length;
        const failed = items.filter(x => x.classList.contains('failed')).length;
        const metaSpan = $('[data-count]', sec);
        if (metaSpan) metaSpan.textContent = `${passed}✓ / ${failed}✗ of ${items.length}`;
      });

      // Overall
      const allItems = $$('.checklist-item');
      const passed = allItems.filter(x => x.classList.contains('checked')).length;
  const failed = allItems.filter(x => x.classList.contains('failed')).length;
  const total  = allItems.length;
  const criticalFailed = allItems.filter(x => x.classList.contains('failed') && x.querySelector('input.checkbox.pass[data-critical="true"]')).length;
      const pct = total ? Math.round((passed / total) * 100) : 0;
      $('#completedScore').textContent = `${passed} / ${total}`;
      $('#failedScore').textContent = `${failed}`;
  const critEl = $('#criticalFailedScore');
  if (critEl) critEl.textContent = criticalFailed;
      const scoreEl = $('#overallScore');
      scoreEl.textContent = `${pct}%`;
      scoreEl.style.background = pct >= 90 ? 'var(--ok)' : (pct >= 75 ? 'var(--warn)' : 'var(--fail)');

      // Progress bar
      const completed = passed + failed;
      const progressPct = total ? (completed / total) * 100 : 0;
      $('#progressFill').style.width = progressPct + '%';

      // Send real-time update to admin dashboard
      sendProgressUpdate();
    }

    function clearSpeechInterface() {
      const hasSpeech = typeof speechToText !== 'undefined' && speechToText;
      if (hasSpeech && speechToText.isRecognizing) {
        try { stopSpeechRecognition(); } catch (error) {
          console.debug('Speech stop (ignore if not recording):', error?.message || error);
        }
      }
      if (hasSpeech && typeof speechToText.clear === 'function') {
        speechToText.clear();
      }
      const finalTranscriptEl = document.getElementById('transcriptFinal');
      const interimTranscriptEl = document.getElementById('transcriptInterim');
      if (finalTranscriptEl) finalTranscriptEl.textContent = '';
      if (interimTranscriptEl) interimTranscriptEl.textContent = '';
      const statusTextEl = document.getElementById('speechStatusText');
      if (statusTextEl) statusTextEl.textContent = 'Ready to begin assessment';
      const recordingDot = document.getElementById('recordingDot');
      if (recordingDot) recordingDot.classList.remove('active');
      if (typeof updateSpeechUI === 'function') {
        updateSpeechUI(false);
      } else {
        const startBtn = document.getElementById('speechStartBtn');
        const stopBtn = document.getElementById('speechStopBtn');
        const saveBtn = document.getElementById('speechSaveBtn');
        const submitBtn = document.getElementById('speechSubmitBtn');
        if (startBtn) startBtn.style.display = 'flex';
        if (stopBtn) stopBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'none';
      }
    }

    function resetAssessmentState(options = {}) {
      const {
        preserveStudentInfo = true,
        preserveSpeechTranscript = false,
        silent = false
      } = options;

      $$('.checklist-item').forEach(item => {
        item.classList.remove('checked', 'failed');
        const pass = item.querySelector('input.checkbox.pass');
        const fail = item.querySelector('input.checkbox.fail');
        if (pass) pass.checked = false;
        if (fail) fail.checked = false;
      });

      const noteFields = [
        'sbar_notes',
        'collaboration_notes',
        'critical_thinking_notes',
        'clinical_judgment_notes',
        'additional_notes'
      ];
      noteFields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = '';
      });

      const evaluatorField = document.getElementById('evaluatorName');
      if (evaluatorField) evaluatorField.value = '';

      const scenarioField = document.getElementById('scenarioTime');
      if (scenarioField) scenarioField.value = DEFAULT_SCENARIO_TIME;

      const dateField = document.getElementById('evaluationDate');
      if (dateField) {
        dateField.value = DEFAULT_EVALUATION_DATE;
      }

      localStorage.removeItem('evaluationFormState');
      localStorage.removeItem('n10l_peer_eval_state');

      guidedQueue = [];
      guidedIndex = 0;
      guidedActive = false;
      clearGuidedFocus();

      updateCounts();

      if (!preserveSpeechTranscript) {
        clearSpeechInterface();
      }

      assessmentSessionId = null;
      speechSegmentCount = 0;

      if (!silent) {
        showSuccess('Assessment reset. Ready for a new attempt.');
      }

      if (!preserveStudentInfo) {
        const studentField = document.getElementById('studentName');
        if (studentField) studentField.value = '';
      }
    }

    function applyEvaluationSnapshot(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.items)) {
        showError('No saved submission found to recall.');
        updateRecallButtonVisibility();
        return;
      }

      resetAssessmentState({ preserveStudentInfo: true, preserveSpeechTranscript: true, silent: true });

      const itemsByKey = new Map(snapshot.items.map(item => [item.key, item]));

      $$('.section').forEach(section => {
        const sectionName = section.querySelector('.section-title')?.textContent?.trim() || 'Unknown Section';
        let sequence = 0;
        $$('.checklist-item', section).forEach(checklistItem => {
          const key = `${sectionName.toLowerCase().replace(/\s+/g, '_')}_${sequence++}`;
          const saved = itemsByKey.get(key);

          const passCheckbox = checklistItem.querySelector('input.checkbox.pass[type="checkbox"]');
          const failCheckbox = checklistItem.querySelector('input.checkbox.fail[type="checkbox"]');

          if (passCheckbox) passCheckbox.checked = false;
          if (failCheckbox) failCheckbox.checked = false;
          checklistItem.classList.remove('checked', 'failed');

          if (!saved) return;
          const status = saved.status || (saved.checked ? 'pass' : saved.failed ? 'fail' : 'not_completed');
          if (status === 'pass' && passCheckbox) {
            passCheckbox.checked = true;
            checklistItem.classList.add('checked');
          } else if (status === 'fail' && failCheckbox) {
            failCheckbox.checked = true;
            checklistItem.classList.add('failed');
          }
        });
      });

      const notes = snapshot.notes || {};
      const noteFieldMap = {
        evaluatorName: notes.evaluatorName || '',
        scenarioTime: notes.scenarioTime || DEFAULT_SCENARIO_TIME,
        evaluationDate: notes.evaluationDate || DEFAULT_EVALUATION_DATE,
        sbar_notes: notes.sbar_notes || '',
        collaboration_notes: notes.collaboration_notes || '',
        critical_thinking_notes: notes.critical_thinking_notes || '',
        clinical_judgment_notes: notes.clinical_judgment_notes || '',
        additional_notes: notes.additional_notes || ''
      };

      Object.entries(noteFieldMap).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
      });

      updateCounts();

      showSuccess('Last submission recalled. You may review or make adjustments before resubmitting.');
    }

    function recallLastEvaluation() {
      const snapshot = loadLastEvaluationSnapshot();
      if (!snapshot) {
        showError('No saved submission found to recall.');
        updateRecallButtonVisibility();
        return;
      }
      applyEvaluationSnapshot(snapshot);
    }

    window.resetAssessmentState = resetAssessmentState;
    window.recallLastEvaluation = recallLastEvaluation;

    function handleToggle(e) {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains('checkbox')) return;
      const item = input.closest('.checklist-item');
      const isFail = input.hasAttribute('data-fail');
      const key = input.getAttribute('data-key') || '';

      // Mutually exclusive pass/fail
      const siblings = $$(`input[data-key="${key}"]`, item);
      siblings.forEach(s => { if (s !== input) s.checked = false; });

      if (input.checked) {
        if (isFail) {
          item.classList.add('failed');
          item.classList.remove('checked');
        } else {
          item.classList.add('checked');
          item.classList.remove('failed');
        }
      } else {
        item.classList.remove('checked', 'failed');
      }

      saveState();
      updateCounts();
    }

    function resetFormHard() {
      if (!confirm('Reset the entire form? This cannot be undone.')) return;
      resetAssessmentState({ preserveStudentInfo: true, preserveSpeechTranscript: false, silent: true });
      showSuccess('Form reset. You can begin the assessment again.');
      updateRecallButtonVisibility();
    }

    function saveState() {
      const state = {
        studentName: $('#studentName').value,
        evaluatorName: $('#evaluatorName').value,
        evaluationDate: $('#evaluationDate').value,
        scenarioTime: $('#scenarioTime').value,
        notes: {
          sbar: $('#sbar_notes').value,
          collab: $('#collaboration_notes').value,
          crit: $('#critical_thinking_notes').value,
          clinical: $('#clinical_judgment_notes').value,
          add: $('#additional_notes').value
        },
        items: $$('.checklist-item').map(item => {
          // derive first input data-key for an id
          const passInput = $('input.checkbox.pass', item);
          const key = passInput ? passInput.getAttribute('data-key') : undefined;
          return { key, checked: item.classList.contains('checked'), failed: item.classList.contains('failed') };
        })
      };
      localStorage.setItem('n10l_peer_eval_state', JSON.stringify(state));
    }

    function loadState() {
      const raw = localStorage.getItem('n10l_peer_eval_state');
      if (!raw) return;
      try {
        const state = JSON.parse(raw);
        if (state.studentName) $('#studentName').value = state.studentName;
        if (state.evaluatorName) $('#evaluatorName').value = state.evaluatorName;
        if (state.evaluationDate) $('#evaluationDate').value = state.evaluationDate;
        if (state.scenarioTime) $('#scenarioTime').value = state.scenarioTime;
        if (state.notes) {
          $('#sbar_notes').value = state.notes.sbar || '';
          $('#collaboration_notes').value = state.notes.collab || '';
          $('#critical_thinking_notes').value = state.notes.crit || '';
          $('#clinical_judgment_notes').value = state.notes.clinical || '';
          $('#additional_notes').value = state.notes.add || '';
        }
        if (Array.isArray(state.items)) {
          state.items.forEach(entry => {
            if (!entry || !entry.key) return;
            const item = $(`.checklist-item input[data-key="${entry.key}"]`)?.closest('.checklist-item');
            if (!item) return;
            const pass = $('input.checkbox.pass', item);
            const fail = $('input.checkbox.fail', item);
            if (entry.failed) {
              if (fail) fail.checked = true;
              if (pass) pass.checked = false;
              item.classList.add('failed');
              item.classList.remove('checked');
            } else if (entry.checked) {
              if (pass) pass.checked = true;
              if (fail) fail.checked = false;
              item.classList.add('checked');
              item.classList.remove('failed');
            } else {
              if (pass) pass.checked = false;
              if (fail) fail.checked = false;
              item.classList.remove('checked','failed');
            }
          });
        }
      } catch {}
    }

    // Speech-to-Text Integration
    let speechToText = null;
    let assessmentSessionId = null; // Persistent session for entire assessment
    let speechSegmentCount = 0; // Track speech segments within session

    // Test speech recognition connectivity
    async function testSpeechConnectivity() {
      console.log('🧪 Testing speech recognition connectivity...');
      
      const results = {
        webSpeechSupported: false,
        secureContext: window.isSecureContext,
        protocol: window.location.protocol,
        online: navigator.onLine,
        userAgent: navigator.userAgent.substring(0, 50),
        canCreateRecognition: false
      };
      
      try {
        // Test if Web Speech API is supported
        results.webSpeechSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        
        // Test if we can create a recognition instance
        if (results.webSpeechSupported) {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          const testRecognition = new SpeechRecognition();
          results.canCreateRecognition = true;
          
          // Test basic configuration
          testRecognition.continuous = false;
          testRecognition.interimResults = false;
          testRecognition.lang = 'en-US';
        }
        
      } catch (error) {
        console.error('Speech recognition test failed:', error);
        results.error = error.message;
      }
      
      console.log('🔍 Speech connectivity test results:', results);
      return results;
    }

    function initializeSpeech() {
      // Run connectivity test first
      testSpeechConnectivity();
      
      // Check if browser supports Web Speech API
      if (!SpeechToText.isSupported()) {
        console.warn('Web Speech API not supported in this browser');
        // Hide speech controls
        const speechControls = document.querySelector('.speech-controls');
        if (speechControls) {
          speechControls.style.display = 'none';
        }
        return;
      }

      // Initialize speech-to-text instance
      console.log('🎤 Initializing SpeechToText with socket:', {
        socketConnected: socket?.connected,
        socketId: socket?.id,
        enableRealtime: true
      });
      
      if (!socket || !socket.connected) {
        console.error('❌ Cannot initialize SpeechToText: Socket not connected');
        return;
      }
      
      speechToText = new SpeechToText({
        continuous: true,
        interimResults: true,
        language: 'en-US',
        autoSave: true,
        saveInterval: 10000, // Save every 10 seconds
        apiBaseUrl: API_BASE, // Use the same API base as other requests
        enableRealtime: true, // Enable real-time Socket.IO streaming
        socket: socket // Pass the socket instance for real-time communication
      });

      console.log('✅ SpeechToText initialized successfully with socket:', socket.id);

      // Set up event handlers
      speechToText.onStart = () => {
        console.log('Speech recognition started');
        updateSpeechUI(true);
      };

      speechToText.onStop = () => {
        console.log('Speech recognition stopped');
        updateSpeechUI(false);
      };

      speechToText.onResult = (results) => {
        updateTranscriptDisplay(results.final, results.interim);
      };

      speechToText.onError = (error) => {
        console.error('🚨 Speech recognition error in PersonalCare:', {
          error: error.error,
          message: error.message,
          details: error.details,
          timestamp: new Date().toISOString()
        });
        
        // Show user-friendly error message
        let displayMessage = error.message;
        
        // Special handling for network errors
        if (error.error === 'network') {
          displayMessage = `Speech recognition network error. This usually happens when:\n\n• Internet connection is unstable\n• Browser can't reach Google's speech servers\n• Firewall is blocking speech recognition\n\nPlease check your connection and try again.`;
        }
        
        showSpeechError(displayMessage);
        updateSpeechUI(false);
        
        // Log additional debugging info
        console.log('🔍 Speech error debugging info:', {
          userAgent: navigator.userAgent,
          isOnline: navigator.onLine,
          isSecureContext: window.isSecureContext,
          protocol: window.location.protocol,
          href: window.location.href
        });
      };

      speechToText.onSave = (result) => {
        if (result.success) {
          console.log('Transcript saved successfully');
        } else {
          console.error('Failed to save transcript:', result.error);
        }
      };

      // Enhanced connection status callbacks for robust reconnection
      speechToText.onConnectionChange = (event) => {
        console.log('🔄 Speech connection state changed:', event);
        updateSpeechConnectionStatus(event.state, event.message, event.reconnectionAttempts, event.maxAttempts);
      };

      speechToText.onReconnectionSuccess = (event) => {
        console.log('✅ Speech recognition reconnected successfully:', event);
        showSpeechStatus('Speech recognition reconnected successfully!', 'success');
      };

      speechToText.onConnect = (event) => {
        console.log('🟢 Speech recognition connected:', event);
        showSpeechStatus('Speech recognition is ready', 'success');
      };

      speechToText.onDisconnect = (event) => {
        console.log('🔴 Speech recognition disconnected:', event);
        showSpeechStatus('Speech recognition disconnected', 'warning');
      };

      // Set up button event handlers
      const startBtn = document.getElementById('speechStartBtn');
      const stopBtn = document.getElementById('speechStopBtn');
      const saveBtn = document.getElementById('speechSaveBtn');
      const submitBtn = document.getElementById('speechSubmitBtn');

      if (startBtn) {
        startBtn.addEventListener('click', startSpeechRecognition);
      }

      if (stopBtn) {
        stopBtn.addEventListener('click', stopSpeechRecognition);
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', saveSpeechTranscript);
      }

      if (submitBtn) {
        submitBtn.addEventListener('click', submitSpeechTranscript);
      }

      // Request microphone permission on first load
      SpeechToText.requestPermission().then(granted => {
        if (!granted) {
          showSpeechError('Microphone access denied. Please allow microphone access to use speech recognition.');
        }
      });
    }

    function startSpeechRecognition() {
      if (!speechToText) return;

      // Generate assessment session ID if this is the first recording of the assessment
      if (!assessmentSessionId) {
        assessmentSessionId = `assessment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        speechSegmentCount = 0;
        console.log('Starting new assessment session:', assessmentSessionId);
      }

      // Increment speech segment for this assessment
      speechSegmentCount++;

      const sessionData = {
        sessionId: assessmentSessionId, // Use persistent assessment session ID
        studentName: document.getElementById('studentName')?.value || 'Unknown',
        courseId: 1, // PersonalCare course
        segmentNumber: speechSegmentCount,
        segmentStartTime: new Date()
      };

      console.log('🎯 Starting speech recognition with session data:', sessionData);
      console.log('🔌 Socket connection status:', {
        connected: socket?.connected,
        socketId: socket?.id
      });

      const success = speechToText.start(sessionData);
      if (!success) {
        showSpeechError('Failed to start speech recognition. Please try again.');
      }
    }

    function stopSpeechRecognition() {
      if (!speechToText) return;

      const success = speechToText.stop();
      if (!success) {
        showSpeechError('Failed to stop speech recognition.');
      }
    }

    function updateSpeechUI(isRecording) {
      const startBtn = document.getElementById('speechStartBtn');
      const stopBtn = document.getElementById('speechStopBtn');
      const saveBtn = document.getElementById('speechSaveBtn');
      const submitBtn = document.getElementById('speechSubmitBtn');
      const statusText = document.getElementById('speechStatusText');
      const recordingDot = document.getElementById('recordingDot');

      if (startBtn && stopBtn && saveBtn && submitBtn && statusText && recordingDot) {
        if (isRecording) {
          startBtn.style.display = 'none';
          stopBtn.style.display = 'flex';
          saveBtn.style.display = 'flex';
          submitBtn.style.display = 'none';
          statusText.textContent = 'Recording...';
          recordingDot.classList.add('active');
        } else {
          startBtn.style.display = 'flex';
          stopBtn.style.display = 'none';
          
          // Show save/submit buttons if there's transcript content
          const hasTranscript = speechToText && speechToText.getTranscripts().final.trim().length > 0;
          saveBtn.style.display = hasTranscript ? 'flex' : 'none';
          submitBtn.style.display = hasTranscript ? 'flex' : 'none';
          
          statusText.textContent = hasTranscript ? 'Ready to save or submit' : 'Ready to record';
          recordingDot.classList.remove('active');
        }
      }
    }

    async function saveSpeechTranscript() {
      if (!speechToText) return;

      try {
        const result = await speechToText.save();
        if (result) {
          showSpeechSuccess('Transcript saved successfully');
          console.log('Manual save completed');
        }
      } catch (error) {
        console.error('Save failed:', error);
        showSpeechError('Failed to save transcript: ' + error.message);
      }
    }

    async function submitSpeechTranscript() {
      if (!speechToText) return;

      // Confirm submission
      const transcript = speechToText.getTranscripts().final.trim();
      if (!transcript) {
        showSpeechError('No transcript to submit');
        return;
      }

      const confirmed = confirm(`Submit this transcript?\n\nPreview: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
      if (!confirmed) return;

      try {
        const result = await speechToText.submit();
        if (result) {
          showSpeechSuccess('Transcript submitted successfully');
          console.log('Final submission completed for assessment session:', assessmentSessionId);
          
          // Clear assessment session - this ends the assessment recording
          assessmentSessionId = null;
          speechSegmentCount = 0;
          
          // Clear transcript after successful submission
          speechToText.clear();
          updateTranscriptDisplay('', '');
          updateSpeechUI(false);
        }
      } catch (error) {
        console.error('Submit failed:', error);
        showSpeechError('Failed to submit transcript: ' + error.message);
      }
    }

    function showSpeechSuccess(message) {
      const errorDiv = document.getElementById('speechError');
      if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.background = '#dcfce7';
        errorDiv.style.color = '#166534';
        errorDiv.style.border = '1px solid #bbf7d0';
        errorDiv.classList.add('visible');
        
        setTimeout(() => {
          errorDiv.classList.remove('visible');
        }, 3000);
      }
    }

    function updateTranscriptDisplay(finalText, interimText) {
      const transcriptDiv = document.getElementById('speechTranscript');
      const finalDiv = document.getElementById('transcriptFinal');
      const interimDiv = document.getElementById('transcriptInterim');

      if (transcriptDiv && finalDiv && interimDiv) {
        // Show transcript area if there's content
        if (finalText || interimText) {
          transcriptDiv.classList.add('visible');
        }

        finalDiv.textContent = finalText;
        interimDiv.textContent = interimText;

        // Auto-scroll to bottom
        transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
      }
    }

    function showSpeechError(message) {
      const errorDiv = document.getElementById('speechError');
      if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('visible');
        
        // Hide error after 5 seconds
        setTimeout(() => {
          errorDiv.classList.remove('visible');
        }, 5000);
      }
    }

    // Init
    const initializeScenario = () => {
      // Pre-fill date to today if empty
      const today = new Date().toISOString().slice(0,10);
      const dateEl = $('#evaluationDate');
      if (!dateEl.value) dateEl.value = today;

      // Load saved state (if any)
      loadState();
      const recallBtn = document.getElementById('recallEvaluationBtn');
      if (recallBtn) {
        recallBtn.addEventListener('click', recallLastEvaluation);
      }
      updateRecallButtonVisibility();

      // Listeners
      document.body.addEventListener('change', handleToggle);
      $('#resetForm').addEventListener('click', resetFormHard);
      $('#submitEvaluation').addEventListener('click', (e) => {
        console.log('🔘 Submit button clicked');
        e.preventDefault();
        guardedSubmit();
      });
      $('#expandAll').addEventListener('click', () => $$('.section').forEach(s => { s.classList.remove('collapsed'); $('.section-header', s)?.setAttribute('aria-expanded','true'); }));
      $('#collapseAll').addEventListener('click', () => $$('.section').forEach(s => { s.classList.add('collapsed'); $('.section-header', s)?.setAttribute('aria-expanded','false'); }));

      // Update counts initially and on typing for notes/fields
      updateCounts();
      $$('input, textarea').forEach(el => el.addEventListener('input', () => { 
        saveState(); 
        saveFormState(); // Auto-save for disconnection recovery
      }));
      
      // Auto-save on checkbox changes
      $$('input[type="checkbox"]').forEach(el => el.addEventListener('change', () => {
        saveFormState();
      }));
      
      // Auto-save every 30 seconds
      setInterval(saveFormState, 30000);
      
      // Note: Speech-to-Text will be initialized after socket connection
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeScenario, { once: true });
    } else {
      initializeScenario();
    }
}
