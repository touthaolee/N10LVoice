const $ = (selector) => document.querySelector(selector);

// Socket connection management
let socket = null;
let sessionId = null;
let studentName = null;
let isManualDisconnect = false;
let lastPingTime = null;
const maxReconnectAttempts = 10;

// Configuration
const BASE_PATH = window.location.hostname === 'localhost' ? '' : '/N10LVoice';
const API_BASE = `${BASE_PATH}/api`;
const SOCKET_PATH = `${BASE_PATH}/socket.io`;

function initializeSession() {
  sessionId = localStorage.getItem('studentSession');
  studentName = localStorage.getItem('studentName');
  
  if (sessionId && studentName) {
    updateConnectionStatus('connecting');
    hideLoginModal();
    validateAndConnectSocket();
  } else {
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

function hideLoginError() {
  const loginError = $('#loginError');
  if (loginError) {
    loginError.style.display = 'none';
  }
}

function setupLoginForm() {
  const loginForm = $('#loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideLoginError();
      
      const name = $('#loginStudentName').value.trim();
      const passInput = $('#loginPassword').value;
      
      if (!name) {
        showLoginError('Please enter your student name');
        return;
      }
      
      // Use default password if none provided (matching original behavior)
      const effectivePassword = passInput || 'fresnostate123';
      
      try {
        updateConnectionStatus('connecting', 'Authenticating...');
        
        const response = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name, password: effectivePassword })
        });
        
        const data = await response.json().catch(() => ({}));
        
        if (!response.ok) {
          const message = data?.error || (response.status === 401 ? 'Invalid student credentials. Use fresnostate123.' : 'Login failed');
          showLoginError(message);
          updateConnectionStatus('no-session', 'Login failed');
          return;
        }
        
        if (data && data.role === 'student' && data.sessionId) {
          // Store student session data
          sessionId = data.sessionId;
          studentName = name;
          localStorage.setItem('studentSession', sessionId);
          localStorage.setItem('studentName', studentName);
          
          // Update UI
          hideLoginModal();
          updateConnectionStatus('connecting');
          
          // Set student name in form
          const studentNameField = $('#studentName');
          if (studentNameField) {
            studentNameField.value = studentName;
          }
          
          // Connect socket
          connectSocket();
          
          console.log('✅ Student login successful:', studentName);
        } else {
          showLoginError('Invalid response from server');
          updateConnectionStatus('no-session', 'Login failed');
        }
      } catch (error) {
        console.error('❌ Login error:', error);
        showLoginError('Connection error. Please try again.');
        updateConnectionStatus('no-session', 'Connection error');
      }
    });
  }
  
  // Setup logout button
  const switchStudentBtn = $('#switchStudent');
  if (switchStudentBtn) {
    switchStudentBtn.addEventListener('click', () => {
      logout();
    });
  }
}

function connectSocket() {
  if (!studentName || !sessionId) {
    updateConnectionStatus('no-session', 'No active session');
    return;
  }
  
  // Disconnect existing socket if present
  if (socket && socket.connected) {
    socket.disconnect();
  }

  console.log('🔌 Establishing student socket connection...');
  
  socket = io({
    path: SOCKET_PATH,
    auth: { sessionId },
    // Enhanced connection settings for robustness
    timeout: 20000,
    reconnection: true,
    reconnectionAttempts: maxReconnectAttempts,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    forceNew: false
  });

  socket.on('connect', () => {
    console.log('✅ Student socket connected to server');
    console.log('🔗 Socket ID:', socket.id);
    console.log('👤 Student:', studentName);
    
    updateConnectionStatus('connected');
    isManualDisconnect = false;
    
    // Initialize scenario-specific functionality after connection
    initializeScenarioFeatures();
    
    // Send connection ping to verify bidirectional communication
    sendConnectionPing();
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Student socket disconnected:', reason);
    updateConnectionStatus('disconnected');
    
    if (!isManualDisconnect) {
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - try to reconnect after delay
        console.log('🔄 Server initiated disconnect, scheduling reconnection...');
        setTimeout(() => {
          if (!socket.connected) {
            attemptReconnection();
          }
        }, 3000);
      }
    }
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log(`✅ Student socket reconnected after ${attemptNumber} attempts`);
    updateConnectionStatus('connected');
    isManualDisconnect = false;
    sendConnectionPing();
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`🔄 Student socket reconnection attempt ${attemptNumber}`);
    updateConnectionStatus('reconnecting', attemptNumber);
  });

  socket.on('reconnect_failed', () => {
    console.error('❌ Student socket reconnection failed after maximum attempts');
    updateConnectionStatus('failed');
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error);
    
    if (error && /auth|invalid|session/i.test(error.message || '')) {
      console.log('🔑 Session expired or invalid');
      logout();
    } else {
      updateConnectionStatus('error', error.message);
    }
  });

  socket.on('session_expired', () => {
    console.log('🔑 Session expired notification from server');
    logout();
  });

  // Add ping/pong for connection health monitoring
  socket.on('student-pong', (data = {}) => {
    const pingTime = Date.now() - lastPingTime;
    console.log(`🏓 Pong received, latency: ${pingTime}ms`);
    updateConnectionStatus('connected', `${pingTime}ms`);
    lastPingTime = null;
  });
}

function sendConnectionPing() {
  if (socket && socket.connected) {
    lastPingTime = Date.now();
    socket.emit('student-ping', { timestamp: lastPingTime });
  }
}

function initializeScenarioFeatures() {
  // This function can be overridden by scenario modules
  // to initialize scenario-specific socket features
  console.log('🎯 Initializing scenario features after socket connection');
}

async function validateAndConnectSocket() {
  try {
    const response = await fetch(`${API_BASE}/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });

    if (response.ok) {
      connectSocket();
      setTimeout(loadState, 800);
      updateRecallButtonVisibility();
    } else {
      logout();
    }
  } catch (error) {
    console.error('Session validation failed:', error);
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
      if (socket) socket.disconnect();
      connectSocket();
    } else {
      logout();
    }
  } catch (error) {
    console.error('Reconnection failed:', error);
  }
}

function startReconnectionProcess() {
  setTimeout(() => {
    if (!socket || !socket.connected) {
      attemptReconnection();
    }
  }, 2000);
}

function updateConnectionStatus(status, detail = null) {
  const statusElement = $('#connectionStatus');
  if (statusElement) {
    let message = '';
    let className = 'connection-status';
    
    switch (status) {
      case 'connected':
        message = detail ? `🟢 Connected (${detail})` : '🟢 Connected';
        className += ' connected';
        break;
      case 'disconnected':
        message = '🔴 Disconnected';
        className += ' disconnected';
        break;
      case 'reconnecting':
        message = detail ? `🟡 Reconnecting... (${detail}/${maxReconnectAttempts})` : '🟡 Reconnecting...';
        className += ' reconnecting';
        break;
      case 'failed':
        message = '🔴 Connection Failed';
        className += ' failed';
        break;
      case 'error':
        message = detail ? `🔴 Error: ${detail}` : '🔴 Connection Error';
        className += ' error';
        break;
      case 'no-session':
        message = detail || '⚪ No Session';
        className += ' no-session';
        break;
      default:
        message = '🔄 Connecting...';
        className += ' connecting';
    }
    
    statusElement.textContent = message;
    statusElement.className = className;
  }
}

function updateRecallButtonVisibility() {
  // Implementation depends on specific scenario requirements
  console.log('Updating recall button visibility');
}

function loadState() {
  // Load saved state from localStorage or server
  console.log('Loading saved state');
}

function logout() {
  isManualDisconnect = true;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  // Clear session data
  localStorage.removeItem('studentSession');
  localStorage.removeItem('studentName');
  sessionId = null;
  studentName = null;
  
  // Update UI
  updateConnectionStatus('no-session', 'Please log in to continue');
  showLoginModal();
  
  // Clear student name field
  const studentNameField = $('#studentName');
  if (studentNameField) {
    studentNameField.value = '';
  }
  
  console.log('👋 Student logged out');
}

function setText(id, value) {
  const el = $(id);
  if (el) {
    el.textContent = value ?? '';
  }
}

function setValue(id, value) {
  const el = $(id);
  if (el) {
    el.value = value ?? '';
  }
}

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
    if (typeof setup === 'function') {
      Promise.resolve()
        .then(() => setup())
        .catch((error) => {
          console.error('Scenario setup failed:', error);
        });
    }
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

  console.info(`Initialized scenario: ${id}`);
}

// Export socket and utility functions for use by scenario modules
export { socket, sessionId, studentName, connectSocket, logout, updateConnectionStatus };
