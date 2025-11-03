
const logger = require('../utils/logger');
const { Web3 } = require('web3');

const BRIDGE_ABI = [
  {
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
      { name: '_gasLimit', type: 'uint64' },
      { name: '_isCreation', type: 'bool' },
      { name: '_data', type: 'bytes' }
    ],
    name: 'depositTransaction',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  }
];

// Bridge configuration
const BRIDGE_CONFIG = {
  SEPOLIA_RPC: 'https://rpc.sepolia.org',
  SEPOLIA_CHAIN_ID: 11155111,
  BRIDGE_CONTRACT: '0xc497E485C414dB594F0030fa6C32365578C7E99E',
  DEFAULT_GAS_LIMIT: 21000,
  MIN_BRIDGE_AMOUNT: '0.001', // 0.001 ETH minimum
  MAX_BRIDGE_AMOUNT: '1' // 1 ETH maximum
};

class BridgeService {
  constructor() {
    this.sepoliaWeb3 = null;
    this.bridgeContract = null;
  }

  initialize(privateKey) {
    try {
      this.sepoliaWeb3 = new Web3(BRIDGE_CONFIG.SEPOLIA_RPC);
      
      const privateKeyWithPrefix = privateKey.startsWith('0x') 
        ? privateKey 
        : '0x' + privateKey;
      
      this.account = this.sepoliaWeb3.eth.accounts.privateKeyToAccount(privateKeyWithPrefix);
      this.sepoliaWeb3.eth.accounts.wallet.add(this.account);
      
      this.bridgeContract = new this.sepoliaWeb3.eth.Contract(
        BRIDGE_ABI, 
        BRIDGE_CONFIG.BRIDGE_CONTRACT
      );
      
      logger.info('Bridge service initialized', { 
        wallet: this.account.address,
        bridgeContract: BRIDGE_CONFIG.BRIDGE_CONTRACT
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize bridge service', { error: error.message });
      throw error;
    }
  }

  async bridgeToSova(toAddress, amountETH) {
    try {
      if (!this.sepoliaWeb3 || !this.bridgeContract) {
        throw new Error('Bridge service not initialized');
      }

      // Validate amount
      const minAmount = this.sepoliaWeb3.utils.toWei(BRIDGE_CONFIG.MIN_BRIDGE_AMOUNT, 'ether');
      const maxAmount = this.sepoliaWeb3.utils.toWei(BRIDGE_CONFIG.MAX_BRIDGE_AMOUNT, 'ether');
      const amount = this.sepoliaWeb3.utils.toWei(amountETH.toString(), 'ether');

      if (BigInt(amount) < BigInt(minAmount)) {
        throw new Error(`Minimum bridge amount is ${BRIDGE_CONFIG.MIN_BRIDGE_AMOUNT} ETH`);
      }

      if (BigInt(amount) > BigInt(maxAmount)) {
        throw new Error(`Maximum bridge amount is ${BRIDGE_CONFIG.MAX_BRIDGE_AMOUNT} ETH`);
      }

      // Check Sepolia balance
      const balance = await this.sepoliaWeb3.eth.getBalance(this.account.address);
      const gasPrice = await this.sepoliaWeb3.eth.getGasPrice();
      const estimatedGas = BigInt(100000) * BigInt(gasPrice); // Estimate gas cost
      const totalNeeded = BigInt(amount) + estimatedGas;

      if (BigInt(balance) < totalNeeded) {
        throw new Error(`Insufficient Sepolia balance. Need ${this.sepoliaWeb3.utils.fromWei(totalNeeded.toString(), 'ether')} ETH`);
      }

      // Call depositTransaction
      const depositMethod = this.bridgeContract.methods.depositTransaction(
        toAddress,
        amount,
        BRIDGE_CONFIG.DEFAULT_GAS_LIMIT,
        false,
        '0x'
      );

      const gasEstimate = await depositMethod.estimateGas({
        from: this.account.address,
        value: amount
      });

      const tx = await depositMethod.send({
        from: this.account.address,
        value: amount,
        gas: Math.floor(Number(gasEstimate) * 1.2).toString()
      });

      logger.info('Bridge transaction successful', {
        txHash: tx.transactionHash,
        amount: amountETH,
        to: toAddress
      });

      return {
        success: true,
        txHash: tx.transactionHash,
        amount: amountETH,
        from: this.account.address,
        to: toAddress,
        explorerUrl: `https://sepolia.etherscan.io/tx/${tx.transactionHash}`
      };

    } catch (error) {
      logger.error('Bridge transaction failed', { error: error.message });
      throw error;
    }
  }

  async getSepoliaBalance(address) {
    try {
      if (!this.sepoliaWeb3) {
        throw new Error('Bridge service not initialized');
      }

      const balance = await this.sepoliaWeb3.eth.getBalance(address);
      return this.sepoliaWeb3.utils.fromWei(balance, 'ether');
    } catch (error) {
      logger.error('Error getting Sepolia balance', { error: error.message });
      throw error;
    }
  }

  async getBridgeTransactionStatus(txHash) {
    try {
      if (!this.sepoliaWeb3) {
        throw new Error('Bridge service not initialized');
      }

      const receipt = await this.sepoliaWeb3.eth.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return {
          status: 'pending',
          message: 'Transaction pending confirmation...'
        };
      }

      if (receipt.status) {
        return {
          status: 'success',
          message: 'Bridge transaction confirmed!',
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        };
      } else {
        return {
          status: 'failed',
          message: 'Bridge transaction failed'
        };
      }
    } catch (error) {
      logger.error('Error checking bridge status', { error: error.message });
      throw error;
    }
  }

  getBridgeConfig() {
    return BRIDGE_CONFIG;
  }
}

module.exports = new BridgeService();
