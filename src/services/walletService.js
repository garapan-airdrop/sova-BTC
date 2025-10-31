const fs = require('fs');
const crypto = require('crypto');
const lockfile = require('proper-lockfile');
const logger = require('../utils/logger');
const { WALLET_FILE, LOCK_RETRIES, LOCK_MIN_TIMEOUT } = require('../config/constants');

const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || 
  crypto.randomBytes(32).toString('hex');

if (!process.env.WALLET_ENCRYPTION_KEY) {
  logger.warn('WALLET_ENCRYPTION_KEY not set, using generated key (will regenerate on restart)');
  logger.warn('Set WALLET_ENCRYPTION_KEY in Replit Secrets for persistence');
}

function encryptPrivateKey(privateKey) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32),
      iv
    );
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    logger.error('Encryption error', { error: error.message });
    throw new Error('Failed to encrypt private key');
  }
}

function decryptPrivateKey(encryptedData) {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      return encryptedData;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error('Decryption error', { error: error.message });
    return encryptedData;
  }
}

async function loadWallets() {
  let release;
  try {
    if (fs.existsSync(WALLET_FILE)) {
      release = await lockfile.lock(WALLET_FILE, {
        retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT }
      });
      
      const data = fs.readFileSync(WALLET_FILE, 'utf8');
      const walletData = JSON.parse(data);
      
      if (walletData.wallets) {
        walletData.wallets = walletData.wallets.map(wallet => ({
          ...wallet,
          privateKey: decryptPrivateKey(wallet.privateKey)
        }));
      }
      
      return walletData;
    }
  } catch (error) {
    logger.error('Error loading wallets', { error: error.message });
  } finally {
    if (release) {
      await release();
    }
  }
  return { wallets: [] };
}

async function saveWallets(walletData) {
  let release;
  try {
    const encryptedData = {
      ...walletData,
      wallets: walletData.wallets.map(wallet => ({
        ...wallet,
        privateKey: encryptPrivateKey(wallet.privateKey)
      }))
    };
    
    release = await lockfile.lock(WALLET_FILE, {
      retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT },
      realpath: false
    });
    
    fs.writeFileSync(WALLET_FILE, JSON.stringify(encryptedData, null, 2));
    logger.info('Wallets saved successfully', { count: walletData.wallets.length });
    return true;
  } catch (error) {
    logger.error('Error saving wallets', { error: error.message });
    return false;
  } finally {
    if (release) {
      await release();
    }
  }
}

async function createNewWallets(web3, count) {
  try {
    const walletData = await loadWallets();
    const newWallets = [];

    for (let i = 0; i < count; i++) {
      const newAccount = web3.eth.accounts.create();
      newWallets.push({
        address: newAccount.address,
        privateKey: newAccount.privateKey,
        createdAt: new Date().toISOString(),
        hasMinted: false,
        lastMintTx: null
      });
    }

    walletData.wallets.push(...newWallets);
    await saveWallets(walletData);

    logger.info('Created new wallets', { 
      count, 
      total: walletData.wallets.length 
    });
    return newWallets;
  } catch (error) {
    logger.error('Error creating wallets', { error: error.message });
    throw error;
  }
}

function addTemporaryWallet(web3, privateKey) {
  try {
    const tempAccount = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(tempAccount);
    return tempAccount.address;
  } catch (error) {
    logger.error('Error adding temporary wallet', { error: error.message });
    throw error;
  }
}

function removeTemporaryWallet(web3, address) {
  try {
    web3.eth.accounts.wallet.remove(address);
  } catch (error) {
    logger.error('Error removing temporary wallet', { error: error.message });
  }
}

module.exports = {
  loadWallets,
  saveWallets,
  createNewWallets,
  addTemporaryWallet,
  removeTemporaryWallet
};
