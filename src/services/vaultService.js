
const logger = require('../utils/logger');

const VAULT_ABI = [
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
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
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
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
    inputs: [{ name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'assets', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const REGISTRY_ADDRESS = '0x9D6d5891FF579356D2D63655Af05D50A71e4C313';
const CONDUIT_ADDRESS = '0x4aB31F7ad938188E3F2e9c106697a52B13650906';
const SPBTC_ADDRESS = '0x3b5B1c8D1aCf8e253C06B7a6E77D1Cade71D6b3f';

class VaultService {
  constructor() {
    this.initialized = false;
  }

  initialize(web3) {
    try {
      this.web3 = web3;
      this.conduitContract = new web3.eth.Contract(VAULT_ABI, CONDUIT_ADDRESS);
      this.spBTCContract = new web3.eth.Contract(
        [
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
          }
        ],
        SPBTC_ADDRESS
      );
      this.initialized = true;
      logger.info('Vault service initialized', { conduit: CONDUIT_ADDRESS });
    } catch (error) {
      logger.error('Failed to initialize vault service', { error: error.message });
      throw error;
    }
  }

  async depositToVault(account, amount) {
    if (!this.initialized) {
      throw new Error('Vault service not initialized');
    }

    // First approve spBTC to conduit
    const approvalTx = await this.spBTCContract.methods
      .approve(CONDUIT_ADDRESS, amount.toString())
      .send({ from: account.address });

    logger.info('Approved spBTC for vault', { 
      amount: amount.toString(), 
      tx: approvalTx.transactionHash 
    });

    // Then deposit
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

    return {
      totalAssets: totalAssets.toString(),
      totalSupply: totalSupply.toString(),
      shareValue: totalSupply > 0 
        ? (BigInt(totalAssets) * BigInt(10000) / BigInt(totalSupply)).toString()
        : '10000'
    };
  }
}

module.exports = new VaultService();
