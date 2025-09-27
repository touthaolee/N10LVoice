/**
 * N10L Speech-to-Text Module
 * Web Speech API wrapper for continuous speech recognition
 * Based on W3C Web Speech API examples with enhancements for educational evaluation
 * Optimized for student nursing assessment evaluations
 */

class SpeechToText {
    constructor(options = {}) {
        this.options = {
            continuous: true,
            interimResults: true,
            language: 'en-US', // Explicitly set for US English medical terminology
            maxAlternatives: 5, // Increased to provide more options for medical terms
            autoSave: true,
            saveInterval: 5000, // Save every 5 seconds
            apiBaseUrl: '/api', // Default API base URL
            enableRealtime: false, // Enable real-time Socket.IO streaming
            manualControl: true, // NEW: User controls start/stop (no auto-restart)
            silenceTimeout: 0, // Disabled by default for manual control
            maxRestarts: 3, // Reduced - only for critical recovery
            ...options
        };

        // Socket.IO instance for real-time communication
        this.socket = options.socket || null;

        this.recognition = null;
        this.isRecognizing = false;
        this.isSupported = false;
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.lastSavedTranscript = ''; // Track last saved content to prevent duplicates
        this.sessionId = null;
        this.studentName = null;
        this.courseId = null;
        this.startTime = null;
        this.saveTimer = null;
        this.silenceTimer = null; // Track silence timeout
        this.restartCount = 0; // Track number of restarts
        this.lastSpeechTime = null; // Track when we last detected speech
        this.userStopped = false; // NEW: Track if user manually stopped
        this.healthCheckTimer = null; // NEW: Monitor connection health
        this.lastActivityTime = null; // NEW: Track any activity (speech or interim results)
        this.connectionState = 'disconnected'; // NEW: Track connection state
        this.reconnectionAttempts = 0; // NEW: Track reconnection attempts
        this.maxReconnectionAttempts = 10; // NEW: Maximum reconnection attempts
        this.reconnectionDelay = 1000; // NEW: Base reconnection delay
        this.networkMonitor = null; // NEW: Network status monitor
        this.visibilityMonitor = null; // NEW: Page visibility monitor
        this.isReconnecting = false; // NEW: Prevent multiple reconnection attempts
        
        // Event callbacks
        this.onStart = null;
        this.onStop = null;
        this.onResult = null;
        this.onError = null;
        this.onSave = null;
        this.onConnectionChange = null; // NEW: Connection status callback
        
        this.init();
    }

    setupMedicalGrammar() {
        // Check if SpeechGrammarList is supported
        const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
        
        if (!SpeechGrammarList) {
            console.warn('⚠️ SpeechGrammarList not supported, using default recognition');
            return;
        }

        try {
            // Create medical terminology grammar based on nursing scenarios
            const medicalGrammar = this.createMedicalGrammar();
            
            const grammarList = new SpeechGrammarList();
            grammarList.addFromString(medicalGrammar, 1.0); // Weight of 1.0 (highest priority)
            
            this.recognition.grammars = grammarList;
            console.log('✅ Medical terminology grammar loaded successfully');
            console.log('📋 Grammar includes:', Object.keys(this.getMedicalTermCategories()).join(', '));
            
        } catch (error) {
            console.warn('⚠️ Failed to set up medical grammar:', error);
            console.log('📝 Continuing with default recognition');
        }
    }

    createMedicalGrammar() {
        const terms = this.getMedicalTermCategories();
        
        // Build JSGF (Java Speech Grammar Format) grammar
        let grammar = '#JSGF V1.0;\n';
        grammar += 'grammar medicalTerms;\n';
        
        // Define each category as a rule
        Object.entries(terms).forEach(([category, termList]) => {
            const ruleName = category.toLowerCase().replace(/[^a-z]/g, '');
            grammar += `public <${ruleName}> = ${termList.join(' | ')};\n`;
        });
        
        // Main rule that includes all categories
        const allRuleNames = Object.keys(terms).map(cat => 
            `<${cat.toLowerCase().replace(/[^a-z]/g, '')}>`
        ).join(' | ');
        
        grammar += `public <medicalTerm> = ${allRuleNames};\n`;
        
        console.log('📝 Generated medical grammar with', Object.keys(terms).length, 'categories');
        return grammar;
    }

    getMedicalTermCategories() {
        return {
            // Vital Signs & Measurements
            vitalSigns: [
                'temperature', 'blood pressure', 'pulse', 'respirations', 'oxygen saturation',
                'radial pulse', 'apical pulse', 'systolic', 'diastolic', 'beats per minute',
                'respirations per minute', 'degrees celsius', 'degrees fahrenheit',
                'millimeters mercury', 'bpm', 'mmHg', 'O2 sat', 'oxygen sat'
            ],
            
            // Medical Conditions & Diagnoses
            conditions: [
                'pneumonia', 'CHF', 'congestive heart failure', 'diabetes', 'hypertension',
                'CVA', 'stroke', 'hemiparesis', 'dysphagia', 'malnutrition', 'dementia',
                'COPD', 'asthma', 'OSA', 'obstructive sleep apnea', 'CAD', 'coronary artery disease',
                'HLD', 'hyperlipidemia', 'CKD', 'chronic kidney disease', 'NIDDM'
            ],
            
            // Assessment Terms
            assessments: [
                'AAO', 'alert and oriented', 'oriented times three', 'PERRLA',
                'pupils equal round reactive to light', 'Glasgow Coma Scale',
                'symmetry', 'auscultation', 'palpation', 'percussion', 'inspection',
                'turgor', 'edema', 'cyanosis', 'jaundice', 'lesions', 'bruising'
            ],
            
            // Medications
            medications: [
                'Lasix', 'furosemide', 'insulin', 'NPH insulin', 'regular insulin',
                'metformin', 'simvastatin', 'Zocor', 'potassium chloride', 'KCL',
                'Beclovent', 'beclomethasone', 'MDI', 'metered dose inhaler',
                'Reglan', 'metoclopramide', 'artificial tears'
            ],
            
            // Procedures & Techniques
            procedures: [
                'hand hygiene', 'PPE', 'personal protective equipment', 'gait belt',
                'transfer', 'bed to chair', 'chair to bed', 'glucose monitoring',
                'finger stick', 'blood glucose', 'G tube', 'gastrostomy tube',
                'PEG tube', 'nasogastric', 'residual check', 'feeding tube'
            ],
            
            // Anatomical Terms
            anatomy: [
                'antecubital', 'brachial artery', 'radial artery', 'intercostal space',
                'midclavicular line', 'conjunctival sac', 'nasolacrimal duct',
                'abdomen', 'thorax', 'extremities', 'mucous membranes',
                'scalp', 'fingernails', 'capillary refill'
            ],
            
            // Clinical Observations
            observations: [
                'moist', 'dry', 'pink', 'pale', 'warm', 'cool', 'regular', 'irregular',
                'symmetric', 'asymmetric', 'tender', 'non-tender', 'soft', 'firm',
                'distended', 'flat', 'clear', 'cloudy', 'thick', 'thin',
                'productive cough', 'nonproductive cough', 'shortness of breath', 'SOB'
            ],
            
            // SBAR Communication
            sbar: [
                'SBAR', 'situation', 'background', 'assessment', 'recommendation',
                'medical history', 'allergies', 'NKA', 'no known allergies',
                'current medications', 'vital signs', 'orders', 'precautions'
            ],
            
            // Pain Assessment (PQRSTU)
            painAssessment: [
                'PQRSTU', 'provocation', 'palliation', 'quality', 'region', 'radiation',
                'severity', 'timing', 'understanding', 'pain scale', 'zero to ten',
                'sharp', 'dull', 'burning', 'stabbing', 'throbbing', 'aching'
            ],
            
            // Equipment & Supplies
            equipment: [
                'stethoscope', 'blood pressure cuff', 'thermometer', 'glucometer',
                'test strips', 'lancet', 'alcohol swab', 'gauze', 'cotton ball',
                'syringe', 'needle', 'gloves', 'gown', 'mask', 'eyewear',
                'call light', 'side rails', 'bed height'
            ],
            
            // Laboratory Values
            labValues: [
                'potassium', 'sodium', 'magnesium', 'phosphorus', 'chloride',
                'albumin', 'glucose', 'FBS', 'fasting blood sugar',
                'AC', 'ante cibum', 'HS', 'hora somni', 'sliding scale'
            ],
            
            // Common Nursing Actions
            nursingActions: [
                'verifies orders', 'gathers equipment', 'identifies client',
                'introduces self', 'explains procedure', 'provides privacy',
                'positions client', 'assists client', 'documents findings',
                'raises side rails', 'lowers bed', 'call light within reach'
            ]
        };
    }

    init() {
        // Feature detection following MDN best practices
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('❌ Web Speech API not supported in this browser');
            this.isSupported = false;
            return;
        }

        this.isSupported = true;
        console.log('✅ Using Web Speech API for speech recognition');
        
        // Create recognition instance
        this.recognition = new SpeechRecognition();
        
        // Configure recognition settings for student evaluations
        this.recognition.continuous = this.options.continuous;        // Keep listening
        this.recognition.interimResults = this.options.interimResults;// Live feedback
        this.recognition.lang = this.options.language;               // Language
        this.recognition.maxAlternatives = this.options.maxAlternatives;

        // Enhanced Speech Recognition Configuration
        this.setupMedicalGrammar();
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        if (!this.recognition) return;

        // Recognition started
        this.recognition.onstart = () => {
            this.isRecognizing = true;
            this.connectionState = 'connected';
            this.reconnectionAttempts = 0; // Reset on successful start
            this.isReconnecting = false;
            this.startTime = new Date();
            this.notifyConnectionChange('connected', 'Speech recognition started');
            console.log('✅ Speech recognition started and connected');
            
            // Emit start event via Socket.IO
            if (this.options.enableRealtime && this.socket && this.socket.connected) {
                const startData = {
                    sessionId: this.sessionId,
                    studentName: this.studentName,
                    courseId: this.courseId,
                    startTime: this.startTime
                };
                console.log('🚀 Emitting speech-start event:', startData);
                this.socket.emit('speech-start', startData);
            } else {
                console.warn('❌ Cannot emit speech-start:', {
                    enableRealtime: this.options.enableRealtime,
                    hasSocket: !!this.socket,
                    socketConnected: this.socket?.connected,
                    sessionId: this.sessionId,
                    studentName: this.studentName
                });
            }
            
            if (this.options.autoSave && this.options.saveInterval > 0) {
                this.startAutoSave();
            }
            
            if (this.onStart) this.onStart();
        };

        // Recognition ended
        this.recognition.onend = () => {
            console.log('🔄 Speech recognition ended - analyzing reason and determining action...');
            
            // If user manually stopped, don't reconnect
            if (this.userStopped) {
                console.log('✅ Recognition ended by user - assessment complete');
                this.connectionState = 'disconnected';
                this.isRecognizing = false;
                this.clearSilenceTimer();
                this.stopAutoSave();
                this.notifyConnectionChange('disconnected', 'Stopped by user');
                
                // Emit stop event via Socket.IO
                if (this.options.enableRealtime && this.socket && this.socket.connected) {
                    const stopData = {
                        sessionId: this.sessionId,
                        studentName: this.studentName,
                        courseId: this.courseId,
                        finalTranscript: this.finalTranscript,
                        duration: this.startTime ? (new Date() - this.startTime) / 1000 : 0,
                        timestamp: new Date()
                    };
                    console.log('🛑 Emitting speech-stop event:', stopData);
                    this.socket.emit('speech-stop', stopData);
                }
                
                // Save final transcript if auto-save is enabled
                if (this.options.autoSave && this.finalTranscript.length > 0) {
                    this.saveTranscript(true); // Final save
                }
                
                if (this.onStop) this.onStop();
                return;
            }
            
            // In manual control mode, always attempt reconnection unless explicitly stopped
            if (this.options.manualControl && this.isRecognizing) {
                this.connectionState = 'reconnecting';
                this.notifyConnectionChange('reconnecting', 'Attempting to reconnect...');
                console.log('🔄 Unexpected disconnection - starting intelligent reconnection...');
                this.attemptIntelligentReconnection();
                return; // NEVER emit stop event for automatic reconnection
            }
            
            // This should only be reached if not in manual control mode
            console.log('🛑 Recognition ended in non-manual mode');
            this.connectionState = 'disconnected';
            this.isRecognizing = false;
            this.clearSilenceTimer();
            this.stopAutoSave();
            this.notifyConnectionChange('disconnected', 'Recognition ended');
            
            if (this.onStop) this.onStop();
        };

        // Recognition results
        this.recognition.onresult = (event) => {
            let final = '';
            let interim = '';
            let alternatives = [];
            
            // Track ANY activity for health monitoring
            this.lastActivityTime = new Date();
            this.lastSpeechTime = new Date();
            
            // Track speech activity for silence detection (if enabled)
            if (this.options.silenceTimeout > 0) {
                this.resetSilenceTimer();
            }
            
            // Process all results
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                
                // Collect alternatives for medical term validation
                const resultAlternatives = [];
                for (let j = 0; j < Math.min(result.length, this.options.maxAlternatives); j++) {
                    resultAlternatives.push({
                        transcript: result[j].transcript,
                        confidence: result[j].confidence || 0
                    });
                }
                
                if (result.isFinal) {
                    // Choose best medical term match from alternatives
                    const bestMatch = this.chooseBestMedicalMatch(resultAlternatives);
                    final += bestMatch + ' ';
                    
                    // Log alternatives for debugging
                    if (resultAlternatives.length > 1) {
                        console.log('🏥 Medical term alternatives:', resultAlternatives.map(alt => 
                            `"${alt.transcript}" (${(alt.confidence * 100).toFixed(1)}%)`
                        ).join(', '));
                        console.log('✅ Selected:', bestMatch);
                    }
                } else {
                    interim += transcript;
                }
                
                alternatives.push(...resultAlternatives);
            }

            // Update transcripts
            if (final) {
                this.finalTranscript += final;
                // Reset restart count on successful speech recognition
                this.restartCount = 0;
                console.log(`📝 Speech captured: "${final.trim()}" (Total: ${this.finalTranscript.length} chars)`);
            }
            
            if (interim) {
                console.log(`🎤 Live speech: "${interim}"`);
            }
            
            this.interimTranscript = interim;

            // Real-time Socket.IO emission
            if (this.options.enableRealtime && this.socket && this.socket.connected) {
                const realtimeData = {
                    sessionId: this.sessionId,
                    studentName: this.studentName,
                    courseId: this.courseId,
                    finalTranscript: this.finalTranscript,
                    interimTranscript: this.interimTranscript,
                    latestFinal: final,
                    latestInterim: interim,
                    alternatives: alternatives, // Include alternatives in real-time data
                    timestamp: new Date(),
                    isFinal: !!final
                };
                console.log('🔄 Emitting speech-realtime event:', {
                    studentName: this.studentName,
                    finalLength: this.finalTranscript.length,
                    interimLength: this.interimTranscript.length,
                    hasLatestFinal: !!final,
                    hasLatestInterim: !!interim,
                    alternativeCount: alternatives.length
                });
                this.socket.emit('speech-realtime', realtimeData);
            } else {
                console.warn('❌ Cannot emit speech-realtime:', {
                    enableRealtime: this.options.enableRealtime,
                    hasSocket: !!this.socket,
                    socketConnected: this.socket?.connected
                });
            }

            // Trigger callback with results
            if (this.onResult) {
                this.onResult({
                    final: this.finalTranscript,
                    interim: this.interimTranscript,
                    latest: final || interim,
                    alternatives: alternatives
                });
            }
        };

        // Recognition errors
        this.recognition.onerror = (event) => {
            console.error('🚨 Speech recognition error:', {
                error: event.error,
                type: event.type,
                target: event.target,
                timeStamp: event.timeStamp,
                isSecureContext: window.isSecureContext,
                protocol: window.location.protocol,
                userAgent: navigator.userAgent.substring(0, 100)
            });
            
            const errorInfo = {
                error: event.error,
                message: this.getErrorMessage(event.error),
                details: {
                    isSecureContext: window.isSecureContext,
                    protocol: window.location.protocol,
                    isOnline: navigator.onLine,
                    connectionState: this.connectionState,
                    reconnectionAttempts: this.reconnectionAttempts
                },
                timestamp: new Date().toISOString()
            };
            
            // Handle different error types with specific strategies
            if (event.error === 'no-speech') {
                // In manual mode, no-speech is completely normal - student might be thinking/pausing
                console.log('🔇 No speech detected - student may be pausing, continuing to listen...');
                return; // Never treat this as an error in manual mode
            }
            
            // For permission errors, these are critical and cannot be auto-recovered
            if (['not-allowed', 'service-not-allowed'].includes(event.error)) {
                console.error('❌ Permission error - user must fix manually:', event.error);
                this.connectionState = 'error';
                this.isRecognizing = false;
                this.userStopped = true;
                this.notifyConnectionChange('error', 'Microphone permission denied');
                if (this.onError) this.onError(errorInfo);
                return;
            }
            
            // For recoverable errors, immediately try to reconnect
            if (['network', 'audio-capture', 'aborted'].includes(event.error)) {
                if (this.options.manualControl && !this.userStopped && this.isRecognizing) {
                    console.log(`🔄 Recoverable error (${event.error}) - starting intelligent reconnection...`);
                    this.connectionState = 'reconnecting';
                    this.notifyConnectionChange('reconnecting', `Recovering from ${event.error} error`);
                    this.attemptIntelligentReconnection();
                    return; // Don't call onError for recoverable issues
                }
            }
            
            // For other errors, log but continue trying to maintain session
            console.warn(`⚠️ Speech error: ${event.error}, attempting recovery...`);
            if (this.options.manualControl && !this.userStopped && this.isRecognizing) {
                this.connectionState = 'reconnecting';
                this.notifyConnectionChange('reconnecting', `Recovering from ${event.error} error`);
                this.attemptIntelligentReconnection();
            } else {
                // Only notify error if we can't recover
                if (this.onError) this.onError(errorInfo);
            }
        };
    }

    getErrorMessage(error) {
        const errorMessages = {
            'no-speech': 'No speech was detected. Please speak clearly into your microphone and try again.',
            'audio-capture': 'Audio capture failed. Please check that your microphone is connected and working properly.',
            'not-allowed': 'Microphone access denied. Please allow microphone access in your browser settings and refresh the page.',
            'network': 'Network error occurred. Speech recognition requires internet connection. Please check your network and try again.',
            'language-not-supported': 'The selected language is not supported by your browser.',
            'service-not-allowed': 'Speech recognition service is not allowed. This may be due to browser security settings.',
            'bad-grammar': 'Speech recognition grammar error occurred.',
            'aborted': 'Speech recognition was stopped unexpectedly.'
        };
        
        const baseMessage = errorMessages[error] || `Speech recognition error: ${error}`;
        
        // Add additional context for network errors
        if (error === 'network') {
            const isSecure = window.isSecureContext;
            const protocol = window.location.protocol;
            return `${baseMessage}\n\nTechnical details:\n- Secure context: ${isSecure}\n- Protocol: ${protocol}\n- Online: ${navigator.onLine}`;
        }
        
        return baseMessage;
    }

    // Medical term matching for choosing best alternative
    chooseBestMedicalMatch(alternatives) {
        if (!alternatives || alternatives.length === 0) return '';
        if (alternatives.length === 1) return alternatives[0].transcript;
        
        // Get medical terms for matching
        const medicalTerms = this.getAllMedicalTerms();
        
        let bestMatch = alternatives[0];
        let highestScore = this.calculateMedicalScore(alternatives[0].transcript, medicalTerms);
        
        // Evaluate each alternative
        for (let i = 1; i < alternatives.length; i++) {
            const alternative = alternatives[i];
            const score = this.calculateMedicalScore(alternative.transcript, medicalTerms);
            
            // Prefer alternatives with higher medical relevance
            if (score > highestScore || 
                (score === highestScore && alternative.confidence > bestMatch.confidence)) {
                bestMatch = alternative;
                highestScore = score;
            }
        }
        
        return bestMatch.transcript;
    }
    
    // Calculate medical relevance score for a transcript
    calculateMedicalScore(transcript, medicalTerms) {
        if (!transcript) return 0;
        
        const words = transcript.toLowerCase().split(/\s+/);
        let score = 0;
        
        for (const word of words) {
            // Direct match with medical terms
            if (medicalTerms.has(word)) {
                score += 10;
            }
            // Partial match for compound medical terms
            else if (Array.from(medicalTerms).some(term => term.includes(word) && word.length > 2)) {
                score += 5;
            }
            // Common medical abbreviations
            else if (/^(AAO|PERRLA|CHF|COPD|HTN|DM|CVA|UTI|GCS|SBAR|PQRSTU)$/i.test(word)) {
                score += 15;
            }
            // Medical measurements and values
            else if (/^\d+(\.\d+)?\s*(mmhg|bpm|kg|cm|ml|mg|mcg|units?|degrees?|celsius|fahrenheit)$/i.test(word)) {
                score += 8;
            }
        }
        
        return score;
    }
    
    // Get all medical terms as a Set for fast lookup
    getAllMedicalTerms() {
        if (this._medicalTermsCache) return this._medicalTermsCache;
        
        const categories = this.getMedicalTermCategories();
        const allTerms = new Set();
        
        Object.values(categories).forEach(categoryTerms => {
            categoryTerms.forEach(term => {
                // Add the term and its individual words
                allTerms.add(term.toLowerCase());
                if (term.includes(' ')) {
                    term.split(' ').forEach(word => {
                        if (word.length > 2) allTerms.add(word.toLowerCase());
                    });
                }
            });
        });
        
        this._medicalTermsCache = allTerms;
        return allTerms;
    }

    // Public methods
    start(sessionData = {}) {
        if (!this.isSupported) {
            console.error('Speech recognition not supported');
            return false;
        }

        if (this.isRecognizing) {
            console.warn('Speech recognition already active');
            return false;
        }

        // Set session data
        this.sessionId = sessionData.sessionId || null;
        this.studentName = sessionData.studentName || null;
        this.courseId = sessionData.courseId || null;
        
        // Reset transcripts and counters
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.lastSavedTranscript = '';
        this.resetRestartCounter();
        this.lastSpeechTime = new Date();
        this.userStopped = false; // NEW: Reset user stop flag

        this.isRecognizing = true;
        
        // Start silence timer if configured (disabled by default in manual mode)
        if (this.options.silenceTimeout > 0) {
            this.resetSilenceTimer();
        }
        
        console.log('🎤 Starting continuous speech recognition for student assessment');
        
        // Set up medical grammar for enhanced recognition
        this.setupMedicalGrammar();
        
        // Start health monitoring
        this.startHealthMonitoring();
        
        try {
            this.recognition.start();
            console.log('✅ Speech recognition started - recording student assessment');
            return true;
        } catch (error) {
            console.error('❌ Failed to start speech recognition:', error);
            this.isRecognizing = false;
            this.userStopped = true;
            this.clearSilenceTimer();
            
            // Try to restart after a short delay
            if (error.name === 'InvalidStateError') {
                console.log('🔄 Retrying speech recognition start...');
                setTimeout(() => {
                    try {
                        this.userStopped = false;
                        this.recognition.start();
                        this.isRecognizing = true;
                        if (this.options.silenceTimeout > 0) {
                            this.resetSilenceTimer();
                        }
                        console.log('✅ Speech recognition started on retry');
                    } catch (retryError) {
                        console.error('❌ Failed to start speech recognition on retry:', retryError);
                        this.isRecognizing = false;
                        this.userStopped = true;
                    }
                }, 100);
            }
            
            return false;
        }
    }

    stop() {
        if (!this.isRecognizing) {
            console.warn('Speech recognition not active');
            return false;
        }

        console.log('🛑 Student stopping speech recognition - assessment complete');
        this.userStopped = true; // NEW: Mark as user-initiated stop
        this.isRecognizing = false; // Prevent any auto-restart
        this.clearSilenceTimer();
        this.stopHealthMonitoring(); // NEW: Stop health monitoring
        this.resetRestartCounter();

        try {
            this.recognition.stop();
            console.log('✅ Speech recognition stopped by student');
            return true;
        } catch (error) {
            console.error('Failed to stop speech recognition:', error);
            return false;
        }
    }

    toggle(sessionData = {}) {
        if (this.isRecognizing) {
            return this.stop();
        } else {
            return this.start(sessionData);
        }
    }

    // Auto-save functionality
    startAutoSave() {
        this.stopAutoSave(); // Clear any existing timer
        
        this.saveTimer = setInterval(() => {
            if (this.finalTranscript.length > 0 && this.finalTranscript !== this.lastSavedTranscript) {
                console.log('Auto-saving: transcript changed');
                this.saveTranscript(false); // Interim save
            }
        }, this.options.saveInterval);
    }

    stopAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }

    // Save transcript to server
    async saveTranscript(isFinal = false) {
        if (!this.finalTranscript.length) return;

        const transcriptData = {
            sessionId: this.sessionId,
            studentName: this.studentName,
            courseId: this.courseId,
            transcript: this.finalTranscript,
            interimTranscript: this.interimTranscript,
            isFinal: isFinal,
            startTime: this.startTime,
            timestamp: new Date(),
            duration: this.startTime ? (new Date() - this.startTime) / 1000 : 0
        };

        try {
            const response = await fetch(`${this.options.apiBaseUrl}/speech/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(transcriptData)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Transcript saved:', result);
                
                // Update last saved transcript to prevent duplicates
                this.lastSavedTranscript = this.finalTranscript;
                
                if (this.onSave) {
                    this.onSave({
                        success: true,
                        data: result,
                        isFinal: isFinal
                    });
                }
            } else {
                throw new Error(`Save failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to save transcript:', error);
            
            if (this.onSave) {
                this.onSave({
                    success: false,
                    error: error.message,
                    isFinal: isFinal
                });
            }
        }
    }

    // Manual save method
    async save() {
        const result = await this.saveTranscript(true);
        
        // Emit manual save event via Socket.IO
        if (this.options.enableRealtime && this.socket && this.socket.connected) {
            this.socket.emit('speech-save', {
                sessionId: this.sessionId,
                studentName: this.studentName,
                courseId: this.courseId,
                finalTranscript: this.finalTranscript,
                timestamp: new Date(),
                saveType: 'manual'
            });
        }
        
        return result;
    }

    // Submit transcript (final save with review)
    async submit() {
        if (!this.finalTranscript.trim()) {
            throw new Error('No transcript to submit');
        }
        
        const result = await this.saveTranscript(true);
        
        // Emit submit event via Socket.IO
        if (this.options.enableRealtime && this.socket && this.socket.connected) {
            this.socket.emit('speech-submit', {
                sessionId: this.sessionId,
                studentName: this.studentName,
                courseId: this.courseId,
                finalTranscript: this.finalTranscript,
                timestamp: new Date(),
                duration: this.startTime ? (new Date() - this.startTime) / 1000 : 0
            });
        }
        
        return result;
    }

    // Get current transcripts
    getTranscripts() {
        return {
            final: this.finalTranscript,
            interim: this.interimTranscript,
            combined: this.finalTranscript + this.interimTranscript
        };
    }

    // Clear transcripts
    clear() {
        this.finalTranscript = '';
        this.interimTranscript = '';
    }

    // Get recording status
    getStatus() {
        return {
            isSupported: this.isSupported,
            isRecognizing: this.isRecognizing,
            hasTranscript: this.finalTranscript.length > 0,
            sessionId: this.sessionId,
            studentName: this.studentName,
            courseId: this.courseId,
            startTime: this.startTime,
            duration: this.startTime ? (new Date() - this.startTime) / 1000 : 0,
            speechAPI: 'Web Speech API (Google servers)'
        };
    }

    // Start health monitoring to detect frozen/stuck recognition
    startHealthMonitoring() {
        this.stopHealthMonitoring(); // Clear any existing monitor
        this.lastActivityTime = new Date();
        
        this.healthCheckTimer = setInterval(() => {
            if (!this.userStopped && this.isRecognizing) {
                const now = new Date();
                const timeSinceActivity = now - (this.lastActivityTime || this.lastSpeechTime || now);
                
                // If no activity for 30 seconds, the connection might be stuck
                if (timeSinceActivity > 30000) {
                    console.warn('⚠️ No speech activity detected for 30s - checking connection health...');
                    this.performHealthCheck();
                }
            }
        }, 10000); // Check every 10 seconds
    }

    stopHealthMonitoring() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    performHealthCheck() {
        if (this.userStopped || !this.isRecognizing) return;
        
        console.log('🔧 Performing speech recognition health check...');
        
        // Force a restart to refresh the connection
        try {
            this.recognition.stop();
            // The onend handler will automatically restart
        } catch (error) {
            console.warn('⚠️ Health check stop failed:', error);
            // Try direct restart
            setTimeout(() => {
                if (!this.userStopped && this.isRecognizing) {
                    try {
                        this.recognition.start();
                        console.log('✅ Health check restart successful');
                        this.lastActivityTime = new Date();
                    } catch (restartError) {
                        console.warn('⚠️ Health check restart failed:', restartError);
                        this.scheduleReconnectionAttempt();
                    }
                }
            }, 100);
        }
    }

    // Schedule persistent reconnection attempts
    scheduleReconnectionAttempt() {
        if (this.userStopped || !this.isRecognizing) return;
        
        // Progressive backoff: 2s, 4s, 6s, 8s, then 10s max
        const attemptDelay = Math.min(2000 + (this.restartCount * 2000), 10000);
        
        console.log(`🔄 Scheduling reconnection attempt in ${attemptDelay/1000}s...`);
        
        setTimeout(() => {
            if (!this.userStopped && this.isRecognizing) {
                this.restartCount++;
                console.log(`🔄 Persistent reconnection attempt ${this.restartCount}`);
                
                try {
                    this.recognition.start();
                    console.log('✅ Speech recognition reconnected via persistence');
                    this.restartCount = 0; // Reset on success
                } catch (error) {
                    console.warn('⚠️ Persistent reconnection failed:', error);
                    // Keep trying - never give up during user session
                    this.scheduleReconnectionAttempt();
                }
            }
        }, attemptDelay);
    }

    // Handle critical recording failure
    handleRecordingFailure() {
        // In manual mode, don't fail - keep trying to reconnect
        if (this.options.manualControl && !this.userStopped) {
            console.warn('⚠️ Recording issues detected, switching to persistent reconnection mode');
            this.scheduleReconnectionAttempt();
            return;
        }
        
        console.error('❌ Critical recording failure - stopping assessment');
        this.isRecognizing = false;
        this.userStopped = true;
        this.clearSilenceTimer();
        
        if (this.onError) {
            this.onError({
                error: 'recording-failed',
                message: 'Speech recording failed. Please try starting a new assessment.',
                critical: true,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Silence timer management
    resetSilenceTimer() {
        this.clearSilenceTimer();
        
        if (this.options.silenceTimeout > 0) {
            this.silenceTimer = setTimeout(() => {
                console.log(`⏰ Silence timeout (${this.options.silenceTimeout}ms) reached, stopping recognition`);
                this.stop();
            }, this.options.silenceTimeout);
        }
    }

    clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    // Reset restart counter (call when user manually starts/stops)
    resetRestartCounter() {
        this.restartCount = 0;
        console.log('🔄 Restart counter reset');
    }

    // Static method to check browser support
    static isSupported() {
        return ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
    }

    // Static method to request microphone permission
    static async requestPermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop()); // Stop the stream
            return true;
        } catch (error) {
            console.error('Microphone permission denied:', error);
            return false;
        }
    }
}

// Export for use in other modules
window.SpeechToText = SpeechToText;