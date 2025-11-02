const winston = require('winston');

// Disable console logging for specific operations to reduce spam
let consoleLoggingEnabled = true;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          if (!consoleLoggingEnabled) return '';
          let metaStr = '';
          if (Object.keys(meta).length > 0) {
            metaStr = JSON.stringify(meta);
          }
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

logger.disableConsole = () => { consoleLoggingEnabled = false; };
logger.enableConsole = () => { consoleLoggingEnabled = true; };

module.exports = logger;
