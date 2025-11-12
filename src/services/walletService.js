const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const logger = require('../utils/logger');
const { encryptData, decryptData } = require('../utils/crypto');
const { WALLET_FILE, MINTED_WALLET_FILE, LOCK_RETRIES, LOCK_MIN_TIMEOUT, BACKUP_THROTTLE_OPERATIONS } = require('../config/constants');

const BACKUP_DIR = 'backups';
const MAX_BACKUPS = 5;

let walletCache = null;
let walletCacheTimestamp = 0;
const CACHE_TTL_MS = 5000;
let operationsSinceBackup = 0;

async function loadWallets() {
  const now = Date.now();
  if (walletCache && (now - walletCacheTimestamp) < CACHE_TTL_MS) {
    return JSON.parse(JSON.stringify(walletCache));
  }

  let release;
  try {
    if (fsSync.existsSync(WALLET_FILE)) {
      release = await lockfile.lock(WALLET_FILE, {
        retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT }
      });
      
      const data = await fs.readFile(WALLET_FILE, 'utf8');
      const walletData = JSON.parse(data);
      
      if (walletData.wallets) {
        walletData.wallets = walletData.wallets.map(wallet => ({
          ...wallet,
          privateKey: decryptData(wallet.privateKey)
        }));
      }
      
      walletCache = JSON.parse(JSON.stringify(walletData));
      walletCacheTimestamp = now;
      
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
        privateKey: encryptData(wallet.privateKey)
      }))
    };
    
    release = await lockfile.lock(WALLET_FILE, {
      retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT },
      realpath: false
    });
    
    await fs.writeFile(WALLET_FILE, JSON.stringify(encryptedData, null, 2));
    
    walletCache = JSON.parse(JSON.stringify(walletData));
    walletCacheTimestamp = Date.now();
    
    logger.info('Wallets saved successfully', { count: walletData.wallets.length });
    
    operationsSinceBackup++;
    if (operationsSinceBackup >= BACKUP_THROTTLE_OPERATIONS) {
      const currentCount = operationsSinceBackup;
      setImmediate(() => {
        createBackup(WALLET_FILE, encryptedData)
          .then(() => {
            operationsSinceBackup = 0;
            logger.info('Throttled backup completed successfully');
          })
          .catch((err) => {
            logger.error('Throttled backup failed', { error: err.message });
          });
      });
    }
    
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

async function createBackup(filename, data) {
  try {
    // Ensure backup directory exists
    if (!fsSync.existsSync(BACKUP_DIR)) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = path.basename(filename, path.extname(filename));
    const backupFilename = `${basename}_backup_${timestamp}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFilename);
    
    // Save backup
    await fs.writeFile(backupPath, JSON.stringify(data, null, 2));
    logger.info('Backup created', { file: backupPath });
    
    // Clean old backups (keep only last MAX_BACKUPS)
    await cleanOldBackups(basename);
    
    return backupPath;
  } catch (error) {
    logger.error('Backup creation failed', { error: error.message });
    // Don't throw - backup failure shouldn't break main save
    return null;
  }
}

async function cleanOldBackups(basename) {
  try {
    const backupFiles = await fs.readdir(BACKUP_DIR);
    const relevantBackups = backupFiles
      .filter(f => f.startsWith(`${basename}_backup_`))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fsSync.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Sort newest first
    
    // Delete old backups (keep only MAX_BACKUPS)
    if (relevantBackups.length > MAX_BACKUPS) {
      const toDelete = relevantBackups.slice(MAX_BACKUPS);
      for (const backup of toDelete) {
        await fs.unlink(backup.path);
        logger.info('Old backup deleted', { file: backup.name });
      }
    }
  } catch (error) {
    logger.error('Error cleaning old backups', { error: error.message });
  }
}

async function listBackups(filename = WALLET_FILE) {
  try {
    if (!fsSync.existsSync(BACKUP_DIR)) {
      return [];
    }
    
    const basename = path.basename(filename, path.extname(filename));
    const backupFiles = await fs.readdir(BACKUP_DIR);
    
    return backupFiles
      .filter(f => f.startsWith(`${basename}_backup_`))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fsSync.statSync(path.join(BACKUP_DIR, f)).mtime,
        size: fsSync.statSync(path.join(BACKUP_DIR, f)).size
      }))
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  } catch (error) {
    logger.error('Error listing backups', { error: error.message });
    return [];
  }
}

async function restoreFromBackup(backupPath) {
  let release;
  try {
    // Read backup file
    const backupData = await fs.readFile(backupPath, 'utf8');
    const walletData = JSON.parse(backupData);
    
    // Validate backup data
    if (!walletData.wallets || !Array.isArray(walletData.wallets)) {
      throw new Error('Invalid backup file format');
    }
    
    // Lock and write to main file
    release = await lockfile.lock(WALLET_FILE, {
      retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT },
      realpath: false
    });
    
    await fs.writeFile(WALLET_FILE, JSON.stringify(walletData, null, 2));
    
    walletCache = null;
    walletCacheTimestamp = 0;
    
    logger.info('Wallet restored from backup', { 
      backup: backupPath, 
      walletCount: walletData.wallets.length 
    });
    
    return true;
  } catch (error) {
    logger.error('Error restoring from backup', { error: error.message });
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

async function loadMintedWallets() {
  let release;
  try {
    if (fsSync.existsSync(MINTED_WALLET_FILE)) {
      release = await lockfile.lock(MINTED_WALLET_FILE, {
        retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT }
      });
      
      const data = await fs.readFile(MINTED_WALLET_FILE, 'utf8');
      const walletData = JSON.parse(data);
      
      if (walletData.wallets) {
        walletData.wallets = walletData.wallets.map(wallet => ({
          ...wallet,
          privateKey: decryptData(wallet.privateKey)
        }));
      }
      
      return walletData;
    }
  } catch (error) {
    logger.error('Error loading minted wallets', { error: error.message });
  } finally {
    if (release) {
      await release();
    }
  }
  return { wallets: [] };
}

async function saveMintedWallets(walletData) {
  let release;
  try {
    const encryptedData = {
      ...walletData,
      wallets: walletData.wallets.map(wallet => ({
        ...wallet,
        privateKey: encryptData(wallet.privateKey)
      }))
    };
    
    release = await lockfile.lock(MINTED_WALLET_FILE, {
      retries: { retries: LOCK_RETRIES, minTimeout: LOCK_MIN_TIMEOUT },
      realpath: false
    });
    
    await fs.writeFile(MINTED_WALLET_FILE, JSON.stringify(encryptedData, null, 2));
    logger.info('Minted wallets saved successfully', { count: walletData.wallets.length });
    return true;
  } catch (error) {
    logger.error('Error saving minted wallets', { error: error.message });
    return false;
  } finally {
    if (release) {
      await release();
    }
  }
}

async function archiveMintedWallet(wallet) {
  try {
    const mintedData = await loadMintedWallets();
    mintedData.wallets.push({
      ...wallet,
      archivedAt: new Date().toISOString()
    });
    await saveMintedWallets(mintedData);
    logger.info('Wallet archived to minted_wallets.json', { address: wallet.address });
    return true;
  } catch (error) {
    logger.error('Error archiving wallet', { error: error.message });
    return false;
  }
}

async function getAllWalletsForCheckin() {
  const activeWallets = await loadWallets();
  const mintedWallets = await loadMintedWallets();
  return [...activeWallets.wallets, ...mintedWallets.wallets];
}

module.exports = {
  loadWallets,
  saveWallets,
  createNewWallets,
  addTemporaryWallet,
  removeTemporaryWallet,
  loadMintedWallets,
  saveMintedWallets,
  archiveMintedWallet,
  getAllWalletsForCheckin,
  listBackups,
  restoreFromBackup,
  createBackup
};
