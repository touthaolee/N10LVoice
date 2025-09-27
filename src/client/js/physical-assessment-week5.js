// Physical Assessment Week 5 JavaScript Module
import { socket, sessionId, studentName } from './scenario.js';

export function setupPhysicalAssessmentWeek5() {
    let speechToText = null;
    let isRecording = false;
    let finalTranscript = '';
    let interimTranscript = '';

    // Speech controls
    const speechStartBtn = document.getElementById('speechStartBtn');
    const speechStopBtn = document.getElementById('speechStopBtn');
    const speechSaveBtn = document.getElementById('speechSaveBtn');
    const speechSubmitBtn = document.getElementById('speechSubmitBtn');
    const speechStatusText = document.getElementById('speechStatusText');
    const recordingDot = document.getElementById('recordingDot');
    const transcriptFinal = document.getElementById('transcriptFinal');
    const transcriptInterim = document.getElementById('transcriptInterim');
    const speechError = document.getElementById('speechError');
    
    // Form elements
    const evaluationForm = document.getElementById('evaluationForm');
    const studentName = document.getElementById('studentName');
    const evaluatorName = document.getElementById('evaluatorName');
    const evaluationDate = document.getElementById('evaluationDate');
    const scenarioTime = document.getElementById('scenarioTime');

    // Initialize form
    function initializeForm() {
        // Set current date
        evaluationDate.value = new Date().toISOString().split('T')[0];
        
        // Set student name from login
        const currentUser = sessionStorage.getItem('currentUser');
        if (currentUser) {
            studentName.value = currentUser;
        }
    }

    // Initialize speech recognition
    function initializeSpeechRecognition() {
        console.log('🎤 Initializing SpeechToText with socket:', {
            socketConnected: socket?.connected,
            socketId: socket?.id,
            enableRealtime: true
        });
        
        if (!socket || !socket.connected) {
            console.error('❌ Cannot initialize SpeechToText: Socket not connected');
            speechError.textContent = 'Speech recognition requires active connection. Please ensure you are logged in.';
            speechError.style.display = 'block';
            return;
        }

        // Check if SpeechToText is supported
        if (!window.SpeechToText || !window.SpeechToText.isSupported()) {
            console.warn('SpeechToText not supported in this browser');
            speechError.textContent = 'Speech recognition not supported in this browser';
            speechError.style.display = 'block';
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

        console.log('✅ SpeechToText initialized successfully with socket:', socket.id);

        // Set up event handlers
        speechToText.onStart = () => {
            console.log('Speech recognition started');
            isRecording = true;
            speechStatusText.textContent = 'Recording assessment...';
            recordingDot.style.display = 'inline-block';
            speechStartBtn.style.display = 'none';
            speechStopBtn.style.display = 'inline-block';
        };

        speechToText.onStop = () => {
            console.log('Speech recognition stopped');
            isRecording = false;
            speechStatusText.textContent = 'Recording stopped';
            recordingDot.style.display = 'none';
            speechStartBtn.style.display = 'inline-block';
            speechStopBtn.style.display = 'none';
            speechSaveBtn.style.display = 'inline-block';
            speechSubmitBtn.style.display = 'inline-block';
        };

        speechToText.onResult = (results) => {
            console.log('Speech result:', results);
            if (results.final) {
                finalTranscript += results.final + ' ';
                transcriptFinal.textContent = finalTranscript;
                transcriptInterim.textContent = '';
            } else if (results.interim) {
                transcriptInterim.textContent = results.interim;
            }
        };

        speechToText.onError = (error) => {
            console.error('🚨 Speech recognition error:', error);
            speechError.textContent = `Speech recognition error: ${error.message || error.error}`;
            speechError.style.display = 'block';
            setTimeout(() => {
                speechError.style.display = 'none';
            }, 5000);
            
            // Reset UI state
            isRecording = false;
            speechStatusText.textContent = 'Ready to begin assessment';
            recordingDot.style.display = 'none';
            speechStartBtn.style.display = 'inline-block';
            speechStopBtn.style.display = 'none';
        };

        speechToText.onSave = (result) => {
            if (result.success) {
                console.log('Transcript saved successfully');
                showToast('Transcript saved successfully', 'success');
            } else {
                console.error('Failed to save transcript:', result.error);
                showToast('Failed to save transcript', 'error');
            }
        };

        // Connection status callbacks
        speechToText.onConnectionChange = (event) => {
            console.log('🔄 Speech connection state changed:', event);
        };

        speechToText.onReconnectionSuccess = (event) => {
            console.log('✅ Speech recognition reconnected successfully:', event);
            showToast('Speech recognition reconnected successfully!', 'success');
        };

        speechToText.onConnect = (event) => {
            console.log('✅ Speech recognition connected:', event);
            showToast('Speech recognition connected', 'success');
        };

        speechToText.onDisconnect = (event) => {
            console.log('⚠️ Speech recognition disconnected:', event);
            showToast('Speech recognition disconnected', 'warning');
        };
    }

    // Speech control event listeners
    if (speechStartBtn) {
        speechStartBtn.addEventListener('click', () => {
            if (speechToText && !isRecording) {
                console.log('🎤 Starting speech recognition...');
                speechToText.start();
            } else if (!speechToText) {
                console.error('SpeechToText not initialized');
                showToast('Speech recognition not available. Please refresh and try again.', 'error');
            }
        });
    }

    if (speechStopBtn) {
        speechStopBtn.addEventListener('click', () => {
            if (speechToText && isRecording) {
                console.log('⏹️ Stopping speech recognition...');
                speechToText.stop();
            }
        });
    }

    if (speechSaveBtn) {
        speechSaveBtn.addEventListener('click', () => {
            saveTranscript();
        });
    }

    if (speechSubmitBtn) {
        speechSubmitBtn.addEventListener('click', () => {
            submitFinalAssessment();
        });
    }

    // Save transcript functionality
    function saveTranscript() {
        const transcript = finalTranscript.trim();
        if (transcript) {
            localStorage.setItem('physicalAssessmentTranscript', transcript);
            showToast('Transcript saved locally', 'success');
        } else {
            showToast('No transcript to save', 'warning');
        }
    }

    // Submit final assessment
    function submitFinalAssessment() {
        const formData = new FormData(evaluationForm);
        const evaluationData = Object.fromEntries(formData.entries());
        
        // Add transcript
        evaluationData.transcript = finalTranscript.trim();
        
        // Add assessment scores
        const scores = calculateScores();
        evaluationData.scores = scores;
        
        // Submit to server
        submitEvaluation(evaluationData);
    }

    // Calculate assessment scores
    function calculateScores() {
        const checkboxes = document.querySelectorAll('.checkbox');
        let totalItems = 0;
        let passedItems = 0;
        let failedItems = 0;
        let criticalFails = 0;

        const sections = {};

        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const key = checkbox.dataset.key;
                const isPass = checkbox.classList.contains('pass');
                const isCritical = checkbox.hasAttribute('data-critical');
                
                if (!sections[key]) {
                    sections[key] = { pass: false, fail: false, critical: isCritical };
                    totalItems++;
                }

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

        const percentage = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

        return {
            total: totalItems,
            passed: passedItems,
            failed: failedItems,
            criticalFails: criticalFails,
            percentage: percentage
        };
    }

    // Submit evaluation to server
    async function submitEvaluation(data) {
        try {
            const response = await fetch('/submit-evaluation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...data,
                    scenario: 'Physical Assessment Week 5',
                    type: 'physical-assessment-week5'
                })
            });

            if (response.ok) {
                showToast('Assessment submitted successfully!', 'success');
                // Clear form or redirect as needed
            } else {
                throw new Error('Submission failed');
            }
        } catch (error) {
            console.error('Error submitting evaluation:', error);
            showToast('Error submitting assessment. Please try again.', 'error');
        }
    }

    // Checkbox management
    function setupCheckboxes() {
        const checkboxes = document.querySelectorAll('.checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const key = this.dataset.key;
                const isPass = this.classList.contains('pass');
                
                // Uncheck opposite checkbox
                if (this.checked) {
                    checkboxes.forEach(cb => {
                        if (cb.dataset.key === key && cb !== this) {
                            cb.checked = false;
                        }
                    });
                }
                
                updateScores();
            });
        });
    }

    // Update score display
    function updateScores() {
        const scores = calculateScores();
        
        document.getElementById('completedScore').textContent = `${scores.passed} / ${scores.total}`;
        document.getElementById('failedScore').textContent = scores.failed;
        document.getElementById('criticalFailedScore').textContent = scores.criticalFails;
        document.getElementById('overallScore').textContent = `${scores.percentage}%`;
        
        // Update section counts
        updateSectionCounts();
    }

    // Update section counts
    function updateSectionCounts() {
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

    // Section toggle functionality
    window.toggleSection = function(button) {
        const content = button.nextElementSibling;
        const icon = button.querySelector('.toggle-icon');
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        
        button.setAttribute('aria-expanded', !isExpanded);
        content.style.display = isExpanded ? 'none' : 'block';
        icon.textContent = isExpanded ? '▸' : '▾';
    };

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

    // Load saved progress
    function loadSavedProgress() {
        const saved = localStorage.getItem('physicalAssessmentProgress');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                
                // Restore form values
                Object.keys(data.form || {}).forEach(key => {
                    const field = document.getElementById(key);
                    if (field) {
                        field.value = data.form[key];
                    }
                });
                
                // Restore checkboxes
                Object.keys(data.checkboxes || {}).forEach(key => {
                    const checkbox = document.querySelector(`[data-key="${key}"]`);
                    if (checkbox) {
                        checkbox.checked = data.checkboxes[key];
                    }
                });
                
                // Restore transcript
                if (data.transcript) {
                    finalTranscript = data.transcript;
                    transcriptFinal.textContent = finalTranscript;
                }
                
                updateScores();
            } catch (error) {
                console.error('Error loading saved progress:', error);
            }
        }
    }

    // Save progress periodically
    function saveProgress() {
        const formData = new FormData(evaluationForm);
        const checkboxData = {};
        
        document.querySelectorAll('.checkbox:checked').forEach(cb => {
            checkboxData[cb.dataset.key] = true;
        });
        
        const progressData = {
            form: Object.fromEntries(formData.entries()),
            checkboxes: checkboxData,
            transcript: finalTranscript,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('physicalAssessmentProgress', JSON.stringify(progressData));
    }

    // Auto-save progress every 30 seconds
    setInterval(saveProgress, 30000);

    // Save progress on page unload
    window.addEventListener('beforeunload', saveProgress);

    // Initialize everything
    initializeForm();
    setupCheckboxes();
    loadSavedProgress();
    updateScores();

    // Initialize speech recognition once socket is available
    if (socket && socket.connected) {
        initializeSpeechRecognition();
    } else {
        // Wait for socket connection
        console.log('⏳ Waiting for socket connection before initializing speech...');
        const checkSocket = () => {
            if (socket && socket.connected) {
                console.log('🔌 Socket connected, initializing speech recognition...');
                initializeSpeechRecognition();
            } else {
                setTimeout(checkSocket, 500);
            }
        };
        checkSocket();
    }

    return {
        saveProgress,
        calculateScores,
        submitEvaluation,
        initializeSpeechRecognition // Export for manual initialization if needed
    };
}