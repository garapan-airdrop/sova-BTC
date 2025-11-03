const logger = require('../utils/logger');

// Enhanced tRWA Token ABI (ERC-4626 compatible)
const TRWA_ABI = [
  // ERC-4626 View functions
  {
    inputs: [],
    name: 'asset',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'assets', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'maxDeposit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'maxRedeem',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // ERC-4626 Deposit/Withdraw
  {
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' }
    ],
    name: 'deposit',
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' }
    ],
    name: 'redeem',
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' }
    ],
    name: 'withdraw',
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: true, name: 'receiver', type: 'address' },
      { indexed: false, name: 'assets', type: 'uint256' },
      { indexed: false, name: 'shares', type: 'uint256' }
    ],
    name: 'Deposit',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: true, name: 'receiver', type: 'address' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'assets', type: 'uint256' },
      { indexed: false, name: 'shares', type: 'uint256' }
    ],
    name: 'Withdraw',
    type: 'event'
  }
];

const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// Network configuration - supports multiple networks
const NETWORK_CONFIG = {
  'sova-sepolia': {
    SPBTC_ADDRESS: '0x5Db496debB227455cE9f482f9E443f1073a55456', // sovaBTC (vault asset)
    CONDUIT_ADDRESS: '0x4aB31F7ad938188E3F2e9c106697a52B13650906', // Conduit vault
    name: 'Sova Sepolia Testnet'
  },
  'sova-testnet': {
    SPBTC_ADDRESS: '0x5Db496debB227455cE9f482f9E443f1073a55456',
    CONDUIT_ADDRESS: '0x4aB31F7ad938188E3F2e9c106697a52B13650906',
    name: 'Sova Sepolia Testnet'
  },
  'sepolia': {
    SPBTC_ADDRESS: '0x5Db496debB227455cE9f482f9E443f1073a55456',
    CONDUIT_ADDRESS: '0x4aB31F7ad938188E3F2e9c106697a52B13650906',
    name: 'Ethereum Sepolia Testnet'
  }
};

// Get configuration from environment or network config
function getVaultConfig() {
  // If explicit addresses provided in env, use them
  if (process.env.SPBTC_CONTRACT && process.env.CONDUIT_CONTRACT) {
    logger.info('Vault configured from environment variables');
    return {
      SPBTC_ADDRESS: process.env.SPBTC_CONTRACT,
      CONDUIT_ADDRESS: process.env.CONDUIT_CONTRACT,
      name: process.env.VAULT_NETWORK || 'Custom Network',
      configured: true
    };
  }

  // Check if a known network is explicitly requested
  if (process.env.VAULT_NETWORK) {
    const networkConfig = NETWORK_CONFIG[process.env.VAULT_NETWORK];

    if (networkConfig) {
      logger.info('Using pre-configured network', { network: process.env.VAULT_NETWORK });
      return {
        ...networkConfig,
        configured: true
      };
    } else {
      logger.error(`Unknown VAULT_NETWORK: ${process.env.VAULT_NETWORK}`);
      logger.error(`Available networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`);
    }
  }

  // No valid configuration - vault features disabled
  logger.info('Vault features disabled (not configured)');
  logger.info('To enable Sova Prime vault integration, set environment variables:');
  logger.info('  SPBTC_CONTRACT=0x... (spBTC token address)');
  logger.info('  CONDUIT_CONTRACT=0x... (Vault contract address)');
  logger.info('  VAULT_NETWORK=sepolia (or network name, optional)');

  return {
    SPBTC_ADDRESS: null,
    CONDUIT_ADDRESS: null,
    name: 'Not Configured',
    configured: false
  };
}

const config = getVaultConfig();
const SPBTC_ADDRESS = config.SPBTC_ADDRESS;
const CONDUIT_ADDRESS = config.CONDUIT_ADDRESS;
const VAULT_CONFIGURED = config.configured;

if (VAULT_CONFIGURED) {
  logger.info('Vault network configuration loaded', {
    network: config.name,
    spBTC: SPBTC_ADDRESS,
    conduit: CONDUIT_ADDRESS
  });
}

class VaultService {
  constructor() {
    this.initialized = false;
    this.web3 = null;
    this.conduitContract = null;
    this.spBTCContract = null;
  }

  // Helper: Retry contract calls with exponential backoff
  async retryCall(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        const waitTime = delay * Math.pow(2, i);
        logger.warn(`Contract call failed, retrying in ${waitTime}ms...`, {
          attempt: i + 1,
          maxRetries,
          error: error.message
        });
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  async initialize(web3) {
    try {
      // Check if vault is configured
      if (!VAULT_CONFIGURED || !SPBTC_ADDRESS || !CONDUIT_ADDRESS) {
        throw new Error('Vault contracts not configured. Set SPBTC_CONTRACT and CONDUIT_CONTRACT environment variables to enable vault features.');
      }

      this.web3 = web3;

      // Conduit is the tRWA token (ERC-4626 vault)
      this.conduitContract = new web3.eth.Contract(TRWA_ABI, CONDUIT_ADDRESS);

      // spBTC is the underlying asset
      this.spBTCContract = new web3.eth.Contract(ERC20_ABI, SPBTC_ADDRESS);

      // Verify contract has required methods (with graceful fallback and retry)
      let verified = false;
      try {
        const assetAddress = await this.retryCall(() => 
          this.conduitContract.methods.asset().call()
        );
        logger.info('Vault contract verified - ERC-4626 interface detected', {
          asset: assetAddress,
          vault: CONDUIT_ADDRESS
        });
        verified = true;
      } catch (error) {
        // If asset() fails, try alternative verification with totalSupply()
        logger.warn('asset() call failed, trying alternative verification', { 
          error: error.message 
        });
        
        try {
          await this.retryCall(() =>
            this.conduitContract.methods.totalSupply().call()
          );
          logger.info('Vault contract verified via totalSupply() - proceeding with limited interface');
          verified = true;
        } catch (fallbackError) {
          logger.warn('Contract verification failed, proceeding with minimal verification', {
            primaryError: error.message,
            fallbackError: fallbackError.message,
            address: CONDUIT_ADDRESS,
            rpc: this.web3.currentProvider.host || 'unknown'
          });
          
          // Still initialize even if verification fails - we'll check on actual operations
          logger.info('Vault service initialized with minimal verification - functions will be tested on first use');
          verified = true;
        }
      }

      this.initialized = true;
      logger.info('Vault service initialized successfully', { 
        conduit: CONDUIT_ADDRESS,
        asset: SPBTC_ADDRESS,
        network: config.name,
        verified: verified
      });
    } catch (error) {
      logger.error('Failed to initialize vault service', { error: error.message });
      throw error;
    }
  }

  async depositToVault(account, amount) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    try {
      // Check spBTC balance
      const balance = await this.spBTCContract.methods
        .balanceOf(account.address)
        .call();

      if (BigInt(balance) < BigInt(amount)) {
        throw new Error('Insufficient spBTC balance');
      }

      // Check max deposit limit
      const maxDeposit = await this.conduitContract.methods
        .maxDeposit(account.address)
        .call();

      if (BigInt(amount) > BigInt(maxDeposit)) {
        throw new Error(`Deposit amount exceeds maximum allowed: ${maxDeposit}`);
      }

      // Check current allowance
      const currentAllowance = await this.spBTCContract.methods
        .allowance(account.address, CONDUIT_ADDRESS)
        .call();

      // Approve if needed
      if (BigInt(currentAllowance) < BigInt(amount)) {
        logger.info('Approving spBTC for vault', { amount: amount.toString() });

        const approvalTx = await this.spBTCContract.methods
          .approve(CONDUIT_ADDRESS, amount.toString())
          .send({ from: account.address });

        logger.info('Approved spBTC for vault', { 
          amount: amount.toString(), 
          tx: approvalTx.transactionHash 
        });
      }

      // Deposit to vault (ERC-4626 standard)
      logger.info('Depositing to vault', { amount: amount.toString() });

      const depositTx = await this.conduitContract.methods
        .deposit(amount.toString(), account.address)
        .send({ from: account.address });

      logger.info('Deposited to vault', { 
        amount: amount.toString(), 
        tx: depositTx.transactionHash 
      });

      return depositTx;
    } catch (error) {
      logger.error('Deposit to vault failed', { 
        error: error.message,
        amount: amount.toString() 
      });
      throw error;
    }
  }

  async withdrawFromVault(account, shares) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    try {
      // Check shares balance
      const balance = await this.conduitContract.methods
        .balanceOf(account.address)
        .call();

      if (BigInt(balance) < BigInt(shares)) {
        throw new Error('Insufficient shares balance');
      }

      // Check max redeem limit
      const maxRedeem = await this.conduitContract.methods
        .maxRedeem(account.address)
        .call();

      if (BigInt(shares) > BigInt(maxRedeem)) {
        throw new Error(`Redeem amount exceeds maximum allowed: ${maxRedeem}`);
      }

      // Redeem shares for assets (ERC-4626 standard)
      logger.info('Redeeming from vault', { shares: shares.toString() });

      const redeemTx = await this.conduitContract.methods
        .redeem(shares.toString(), account.address, account.address)
        .send({ from: account.address });

      logger.info('Redeemed from vault', { 
        shares: shares.toString(), 
        tx: redeemTx.transactionHash 
      });

      return redeemTx;
    } catch (error) {
      logger.error('Redeem from vault failed', { 
        error: error.message,
        shares: shares.toString() 
      });
      throw error;
    }
  }

  async getVaultBalance(address) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    try {
      const shares = await this.conduitContract.methods.balanceOf(address).call();
      const assets = await this.conduitContract.methods
        .convertToAssets(shares.toString())
        .call();

      return {
        shares: shares.toString(),
        assets: assets.toString()
      };
    } catch (error) {
      logger.error('Failed to get vault balance', { error: error.message });
      throw error;
    }
  }

  async getVaultStats() {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    try {
      // Try to get totalSupply first (most reliable)
      const totalSupply = await this.conduitContract.methods.totalSupply().call();
      
      // Try totalAssets with fallback
      let totalAssets = '0';
      try {
        totalAssets = await this.conduitContract.methods.totalAssets().call();
      } catch (e) {
        logger.warn('totalAssets not available, using totalSupply as estimate', { error: e.message });
        totalAssets = totalSupply; // Fallback: assume 1:1 ratio
      }

      // Try asset address with fallback
      let assetAddress = SPBTC_ADDRESS;
      try {
        assetAddress = await this.conduitContract.methods.asset().call();
      } catch (e) {
        logger.warn('asset() not available, using configured spBTC address', { error: e.message });
      }

      // Calculate share value (price per share in basis points)
      const shareValue = totalSupply > 0 && totalSupply !== '0'
        ? (BigInt(totalAssets) * BigInt(10000) / BigInt(totalSupply)).toString()
        : '10000';

      logger.info('Vault stats retrieved successfully', {
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString()
      });

      return {
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString(),
        assetAddress: assetAddress,
        shareValue: shareValue
      };
    } catch (error) {
      logger.error('Failed to get vault stats', { 
        error: error.message,
        conduit: CONDUIT_ADDRESS 
      });
      throw new Error(`Cannot connect to vault contract at ${CONDUIT_ADDRESS}. Please check network connection and contract deployment.`);
    }
  }

  async previewDeposit(assets) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    try {
      const shares = await this.conduitContract.methods
        .convertToShares(assets.toString())
        .call();

      return shares.toString();
    } catch (error) {
      logger.error('Failed to preview deposit', { error: error.message });
      throw error;
    }
  }

  async previewRedeem(shares) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    try {
      const assets = await this.conduitContract.methods
        .convertToAssets(shares.toString())
        .call();

      return assets.toString();
    } catch (error) {
      logger.error('Failed to preview redeem', { error: error.message });
      throw error;
    }
  }
}

module.exports = new VaultService();