
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

// Sova Sepolia Testnet addresses
const SPBTC_ADDRESS = '0x3b5B1c8D1aCf8e253C06B7a6E77D1Cade71D6b3f';
const CONDUIT_ADDRESS = '0x4aB31F7ad938188E3F2e9c106697a52B13650906';

class VaultService {
  constructor() {
    this.initialized = false;
    this.web3 = null;
    this.conduitContract = null;
    this.spBTCContract = null;
  }

  async initialize(web3) {
    try {
      this.web3 = web3;
      
      // Conduit is the tRWA token (ERC-4626 vault)
      this.conduitContract = new web3.eth.Contract(TRWA_ABI, CONDUIT_ADDRESS);
      
      // spBTC is the underlying asset
      this.spBTCContract = new web3.eth.Contract(ERC20_ABI, SPBTC_ADDRESS);
      
      // Verify contract has required methods
      try {
        await this.conduitContract.methods.asset().call();
        logger.info('Vault contract verified - ERC-4626 interface detected');
      } catch (error) {
        logger.warn('Vault contract may not support full ERC-4626 interface', { 
          error: error.message,
          address: CONDUIT_ADDRESS 
        });
      }
      
      this.initialized = true;
      logger.info('Vault service initialized', { 
        conduit: CONDUIT_ADDRESS,
        asset: SPBTC_ADDRESS 
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
      // Try to call methods with better error handling
      const [totalAssets, totalSupply, assetAddress] = await Promise.all([
        this.conduitContract.methods.totalAssets().call().catch(e => {
          logger.warn('totalAssets call failed', { error: e.message });
          return '0';
        }),
        this.conduitContract.methods.totalSupply().call().catch(e => {
          logger.warn('totalSupply call failed', { error: e.message });
          return '0';
        }),
        this.conduitContract.methods.asset().call().catch(e => {
          logger.warn('asset call failed', { error: e.message });
          return SPBTC_ADDRESS;
        })
      ]);

      // Calculate share value (price per share in basis points)
      const shareValue = totalSupply > 0 && totalSupply !== '0'
        ? (BigInt(totalAssets) * BigInt(10000) / BigInt(totalSupply)).toString()
        : '10000';

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
      throw new Error(`Vault stats unavailable. Please check if the Conduit contract supports ERC-4626 interface at ${CONDUIT_ADDRESS}`);
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
