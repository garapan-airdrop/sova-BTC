const crypto = require('crypto');
const logger = require('./logger');
const { 
  ENCRYPTION_ALGORITHM, 
  ENCRYPTION_KEY_LENGTH,
  ENCRYPTION_IV_LENGTH,
  ENCRYPTION_AUTH_TAG_LENGTH 
} = require('../config/constants');

function getEncryptionKey() {
  const key = process.env.WALLET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('WALLET_ENCRYPTION_KEY not set');
  }
  return Buffer.from(key, 'hex').slice(0, ENCRYPTION_KEY_LENGTH);
}

function encryptData(plaintext) {
  try {
    const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error('Encryption error', { error: error.message });
    throw new Error('Failed to encrypt data');
  }
}

function decryptData(encryptedData) {
  try {
    const parts = encryptedData.split(':');
    
    if (parts.length === 2) {
      logger.debug('Legacy CBC format detected, attempting decryption');
      return decryptLegacyCBC(encryptedData);
    }
    
    if (parts.length !== 3) {
      logger.debug('Not encrypted format, returning as-is');
      return encryptedData;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption failed', { error: error.message });
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

function decryptLegacyCBC(encryptedData) {
  try {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Legacy decryption failed', { error: error.message });
    throw new Error('Failed to decrypt legacy data');
  }
}

function generateEncryptionKey() {
  return crypto.randomBytes(ENCRYPTION_KEY_LENGTH).toString('hex');
}

function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function signData(data, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('hex');
}

function verifySignature(data, signature, secret) {
  const expectedSignature = signData(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

module.exports = {
  encryptData,
  decryptData,
  generateEncryptionKey,
  hashData,
  signData,
  verifySignature
};
