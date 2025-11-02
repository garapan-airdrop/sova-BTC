const fs = require('fs').promises;
const fsSync = require('fs');
const lockfile = require('proper-lockfile');
const logger = require('../utils/logger');
const { signData, verifySignature } = require('../utils/crypto');
const { CLAIMS_FILE, LOCK_RETRIES, LOCK_MIN_TIMEOUT } = require('../config/constants');

async function loadClaims() {
  let release;
  try {
    if (fsSync.existsSync(CLAIMS_FILE)) {
      release = await lockfile.lock(CLAIMS_FILE, {
        retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT }
      });
      
      const data = await fs.readFile(CLAIMS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed.signature) {
        if (!process.env.WALLET_ENCRYPTION_KEY) {
          logger.warn('WALLET_ENCRYPTION_KEY not set - cannot verify claims signature');
        } else {
          const { signature, ...claimsData } = parsed;
          const secret = process.env.WALLET_ENCRYPTION_KEY;
          const dataString = JSON.stringify(claimsData);
          
          if (!verifySignature(dataString, signature, secret)) {
            logger.warn('Claims data signature mismatch - possible tampering detected');
          }
        }
      }
      
      return parsed;
    }
  } catch (error) {
    logger.error('Error loading claims', { error: error.message });
  } finally {
    if (release) {
      await release();
    }
  }
  return { claims: {} };
}

async function saveClaims(claimsData) {
  let release;
  try {
    release = await lockfile.lock(CLAIMS_FILE, {
      retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT },
      realpath: false
    });
    
    if (!process.env.WALLET_ENCRYPTION_KEY) {
      throw new Error('WALLET_ENCRYPTION_KEY is required for secure claims storage');
    }
    
    const secret = process.env.WALLET_ENCRYPTION_KEY;
    const { signature: _, ...dataToSign } = claimsData;
    const dataString = JSON.stringify(dataToSign);
    const signature = signData(dataString, secret);
    
    const signedData = {
      ...dataToSign,
      signature
    };
    
    await fs.writeFile(CLAIMS_FILE, JSON.stringify(signedData, null, 2));
    logger.debug('Claims saved successfully with signature');
    return true;
  } catch (error) {
    logger.error('Error saving claims', { error: error.message });
    return false;
  } finally {
    if (release) {
      await release();
    }
  }
}

async function canClaimToday(userId) {
  try {
    const claimsData = await loadClaims();
    const today = new Date().toISOString().split('T')[0];

    if (!claimsData.claims[userId]) {
      return true;
    }

    const canClaim = claimsData.claims[userId].lastClaimDate !== today;
    logger.debug('Claim eligibility check', { userId, canClaim, today });
    return canClaim;
  } catch (error) {
    logger.error('Error checking claim eligibility', { 
      userId, 
      error: error.message 
    });
    return false;
  }
}

async function recordClaim(userId, address, txHash) {
  try {
    const claimsData = await loadClaims();
    const today = new Date().toISOString().split('T')[0];

    if (!claimsData.claims[userId]) {
      claimsData.claims[userId] = {
        lastClaimDate: today,
        lastAddress: address,
        lastTxHash: txHash,
        totalClaims: 1
      };
    } else {
      claimsData.claims[userId].lastClaimDate = today;
      claimsData.claims[userId].lastAddress = address;
      claimsData.claims[userId].lastTxHash = txHash;
      claimsData.claims[userId].totalClaims = 
        (claimsData.claims[userId].totalClaims || 0) + 1;
    }

    await saveClaims(claimsData);
    logger.info('Claim recorded', { userId, address, txHash });
  } catch (error) {
    logger.error('Error recording claim', { 
      userId, 
      address, 
      error: error.message 
    });
  }
}

async function getUserClaimData(userId) {
  try {
    const claimsData = await loadClaims();
    return claimsData.claims[userId] || null;
  } catch (error) {
    logger.error('Error getting user claim data', { 
      userId, 
      error: error.message 
    });
    return null;
  }
}

module.exports = {
  loadClaims,
  saveClaims,
  canClaimToday,
  recordClaim,
  getUserClaimData
};
