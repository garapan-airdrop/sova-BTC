
const logger = require('../utils/logger');

// tRWA Token ABI (ERC-4626 compatible)
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
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// Sova Prime addresses
const SPBTC_ADDRESS = '0x3b5B1c8D1aCf8e253C06B7a6E77D1Cade71D6b3f';
const CONDUIT_ADDRESS = '0x4aB31F7ad938188E3F2e9c106697a52B13650906';

class VaultService {
  constructor() {
    this.initialized = false;
  }

  initialize(web3) {
    try {
      this.web3 = web3;
      
      // Conduit is the tRWA token (ERC-4626 vault)
      this.conduitContract = new web3.eth.Contract(TRWA_ABI, CONDUIT_ADDRESS);
      
      // spBTC is the underlying asset
      this.spBTCContract = new web3.eth.Contract(ERC20_ABI, SPBTC_ADDRESS);
      
      this.initialized = true;
      logger.info('Vault service initialized', { 
        vault: CONDUIT_ADDRESS,
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

    // Check current allowance
    const currentAllowance = await this.spBTCContract.methods
      .allowance(account.address, CONDUIT_ADDRESS)
      .call();

    // Only approve if needed
    if (BigInt(currentAllowance) < amount) {
      const approvalTx = await this.spBTCContract.methods
        .approve(CONDUIT_ADDRESS, amount.toString())
        .send({ from: account.address });

      logger.info('Approved spBTC for vault', { 
        amount: amount.toString(), 
        tx: approvalTx.transactionHash 
      });
    }

    // Deposit to vault (ERC-4626 standard)
    const depositTx = await this.conduitContract.methods
      .deposit(amount.toString(), account.address)
      .send({ from: account.address });

    logger.info('Deposited to vault', { 
      amount: amount.toString(), 
      tx: depositTx.transactionHash 
    });

    return depositTx;
  }

  async withdrawFromVault(account, shares) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    // Redeem shares for assets (ERC-4626 standard)
    const redeemTx = await this.conduitContract.methods
      .redeem(shares.toString(), account.address, account.address)
      .send({ from: account.address });

    logger.info('Redeemed from vault', { 
      shares: shares.toString(), 
      tx: redeemTx.transactionHash 
    });

    return redeemTx;
  }

  async getVaultBalance(address) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    const shares = await this.conduitContract.methods.balanceOf(address).call();
    const assets = await this.conduitContract.methods
      .convertToAssets(shares.toString())
      .call();

    return {
      shares: shares.toString(),
      assets: assets.toString()
    };
  }

  async getVaultStats() {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    const totalAssets = await this.conduitContract.methods.totalAssets().call();
    const totalSupply = await this.conduitContract.methods.totalSupply().call();
    const assetAddress = await this.conduitContract.methods.asset().call();

    return {
      totalAssets: totalAssets.toString(),
      totalSupply: totalSupply.toString(),
      assetAddress: assetAddress,
      shareValue: totalSupply > 0 
        ? (BigInt(totalAssets) * BigInt(10000) / BigInt(totalSupply)).toString()
        : '10000'
    };
  }
}

module.exports = new VaultService();
