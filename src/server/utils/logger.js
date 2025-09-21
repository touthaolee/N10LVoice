const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');

// Winston logger configuration
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'n10l-server' },
    transports: [
        // Error logs
        new winston.transports.File({ 
            filename: path.join(logsDir, 'n10l-error.log'), 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Combined logs
        new winston.transports.File({ 
            filename: path.join(logsDir, 'n10l-app.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Socket.IO specific logging
logger.socket = {
    connection: (socketId, username, role) => {
        logger.info('Socket connection established', { socketId, username, role });
    },
    disconnection: (socketId, username, role) => {
        logger.info('Socket disconnected', { socketId, username, role });
    },
    error: (error, socketId, username) => {
        logger.error('Socket error', { error: error.message, socketId, username, stack: error.stack });
    }
};

// Database specific logging
logger.database = {
    connection: (action, details) => {
        logger.info(`Database ${action}`, details);
    },
    error: (error) => {
        logger.error('Database error', { error: error.message, stack: error.stack });
    }
};

// Authentication specific logging
logger.auth = {
    login: (username, role, success) => {
        logger.info('Login attempt', { username, role, success });
    },
    tokenError: (error, token, clientIp) => {
        logger.warn('Token authentication failed', { 
            error: error.message, 
            tokenPresent: !!token,
            clientIp 
        });
    }
};

// Evaluation specific logging
logger.evaluation = {
    start: (sessionId, studentName, weekId) => {
        logger.info('Evaluation started', { sessionId, studentName, weekId });
    },
    progress: (sessionId, studentName, score, itemCount) => {
        logger.info('Evaluation progress', { sessionId, studentName, score, itemCount });
    },
    complete: (sessionId, studentName, finalScore) => {
        logger.info('Evaluation completed', { sessionId, studentName, finalScore });
    }
};

// Create a stream for Morgan HTTP logging
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

module.exports = logger;