const fs = require('fs').promises;
const fsSync = require('fs');
const lockfile = require('proper-lockfile');
const logger = require('../utils/logger');
const { encryptData, decryptData } = require('../utils/crypto');
const { WALLET_FILE, MINTED_WALLET_FILE, LOCK_RETRIES, LOCK_MIN_TIMEOUT } = require('../config/constants');

async function loadWallets() {
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
  getAllWalletsForCheckin
};
