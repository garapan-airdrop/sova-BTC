const logger = require('../utils/logger');

class AuthMiddleware {
  constructor(allowedUsers = []) {
    this.allowedUsers = allowedUsers;
    logger.info('Auth middleware initialized', { 
      allowedCount: allowedUsers.length,
      isRestricted: allowedUsers.length > 0
    });
  }

  isAuthorized(userId) {
    if (this.allowedUsers.length === 0) {
      return true;
    }
    return this.allowedUsers.includes(userId.toString());
  }

  requireAuth(callback) {
    return async (msg, ...args) => {
      const userId = msg.from.id;
      
      if (!this.isAuthorized(userId)) {
        logger.warn('Unauthorized access attempt', { 
          userId, 
          username: msg.from.username 
        });
        return null;
      }
      
      return callback(msg, ...args);
    };
  }

  getAllowedUsers() {
    return this.allowedUsers;
  }
}

module.exports = AuthMiddleware;
