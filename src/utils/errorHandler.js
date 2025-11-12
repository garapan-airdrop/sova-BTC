
const logger = require('./logger');
const aiMonitor = require('../services/aiMonitorService');

class ErrorHandler {
  constructor() {
    this.botInstance = null;
    this.adminUsers = [];
  }

  initialize(bot, adminUsers) {
    this.botInstance = bot;
    this.adminUsers = adminUsers || [];
  }

  async handleError(error, context = {}) {
    // AI Analysis
    const analysis = await aiMonitor.analyzeErrorWithGroq(error, context);
    
    // Log with AI analysis
    logger.error('Error occurred', {
      error: error.message,
      stack: error.stack,
      context,
      aiAnalysis: analysis
    });

    // Auto notify admin for CRITICAL and MEDIUM errors
    if (this.botInstance && this.adminUsers.length > 0 && 
        (analysis.severity === 'CRITICAL' || analysis.severity === 'MEDIUM')) {
      const adminId = this.adminUsers[0];
      const analysisMsg = aiMonitor.formatAnalysisForTelegram(analysis, error);
      
      try {
        await this.botInstance.sendMessage(adminId, analysisMsg, { 
          parse_mode: 'Markdown' 
        });
      } catch (notifyError) {
        logger.error('Failed to notify admin', { error: notifyError.message });
      }
    }

    return analysis;
  }

  async handleCommandError(chatId, error, context = {}) {
    const analysis = await this.handleError(error, context);
    
    if (this.botInstance) {
      let userMsg = '❌ *Error Terjadi*\n\n';
      
      if (analysis.severity === 'CRITICAL') {
        userMsg += '⚠️ Error serius terdeteksi. Admin sudah diberitahu.\n\n';
      }
      
      userMsg += `${error.message}\n\n`;
      
      if (analysis.suggestedFixes && analysis.suggestedFixes.length > 0) {
        userMsg += '*Saran:*\n';
        analysis.suggestedFixes.slice(0, 2).forEach(fix => {
          userMsg += `${fix}\n`;
        });
      }

      try {
        await this.botInstance.sendMessage(chatId, userMsg, { 
          parse_mode: 'Markdown' 
        });
      } catch (sendError) {
        logger.error('Failed to send error message to user', { 
          error: sendError.message 
        });
      }
    }

    return analysis;
  }
}

module.exports = new ErrorHandler();
