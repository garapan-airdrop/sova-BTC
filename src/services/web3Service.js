const { Web3 } = require('web3');
const logger = require('../utils/logger');
const { DEFAULT_RPC_URL, DEFAULT_CONTRACT_ADDRESS } = require('../config/constants');

const MINT_ABI = [
  {
    inputs: [],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'hasMinted',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'MAX_SUPPLY',
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
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
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
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

class Web3Service {
  constructor() {
    this.web3 = null;
    this.contract = null;
    this.account = null;
  }

  initialize(privateKey, rpcUrl, contractAddress) {
    try {
      const rpc = rpcUrl || DEFAULT_RPC_URL;
      const contract = contractAddress || DEFAULT_CONTRACT_ADDRESS;
      
      this.web3 = new Web3(rpc);
      
      const privateKeyWithPrefix = privateKey.startsWith('0x') 
        ? privateKey 
        : '0x' + privateKey;
      
      this.account = this.web3.eth.accounts.privateKeyToAccount(privateKeyWithPrefix);
      this.web3.eth.accounts.wallet.add(this.account);
      this.contract = new this.web3.eth.Contract(MINT_ABI, contract);
      
      logger.info('Web3 initialized', { 
        wallet: this.account.address,
        network: rpc,
        contract
      });
      
      return {
        web3: this.web3,
        contract: this.contract,
        account: this.account
      };
    } catch (error) {
      logger.error('Failed to initialize Web3', { error: error.message });
      throw error;
    }
  }

  getWeb3() {
    if (!this.web3) {
      throw new Error('Web3 not initialized');
    }
    return this.web3;
  }

  getContract() {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }
    return this.contract;
  }

  getAccount() {
    if (!this.account) {
      throw new Error('Account not initialized');
    }
    return this.account;
  }
}

module.exports = new Web3Service();
