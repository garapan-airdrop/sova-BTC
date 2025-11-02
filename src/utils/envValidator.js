const logger = require('./logger');
const { REQUIRED_ENV_VARS } = require('../config/constants');

function validateEnvironmentVariables() {
  const missing = [];
  const warnings = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    logger.error('Missing required environment variables:');
    missing.forEach(varName => {
      logger.error(`  - ${varName}`);
    });
    
    if (missing.includes('WALLET_ENCRYPTION_KEY')) {
      logger.error('');
      logger.error('Generate a WALLET_ENCRYPTION_KEY:');
      logger.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      logger.error('');
    }
    
    if (missing.includes('TELEGRAM_BOT_TOKEN')) {
      logger.error('Get TELEGRAM_BOT_TOKEN from @BotFather on Telegram');
      logger.error('');
    }
    
    if (missing.includes('PRIVATE_KEY')) {
      logger.error('Set PRIVATE_KEY to your Ethereum wallet private key');
      logger.error('(This should be a testnet wallet with no real funds)');
      logger.error('');
    }
    
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
  if (encryptionKey) {
    const keyBuffer = Buffer.from(encryptionKey, 'hex');
    if (keyBuffer.length !== 32) {
      logger.warn('WALLET_ENCRYPTION_KEY should be 32 bytes (64 hex characters)');
      warnings.push('WALLET_ENCRYPTION_KEY length is incorrect');
    }
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (privateKey && !privateKey.match(/^(0x)?[a-fA-F0-9]{64}$/)) {
    logger.warn('PRIVATE_KEY format may be invalid (should be 64 hex characters with optional 0x prefix)');
    warnings.push('PRIVATE_KEY format may be invalid');
  }

  if (warnings.length > 0) {
    logger.warn('Environment validation warnings:', warnings);
  }

  logger.info('Environment validation passed');
  return { valid: true, warnings };
}

function generateEncryptionKey() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  validateEnvironmentVariables,
  generateEncryptionKey
};
