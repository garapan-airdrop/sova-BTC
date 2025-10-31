module.exports = {
  // Faucet Configuration
  FAUCET_AMOUNT: BigInt(100000),
  CLAIM_LIMIT_HOURS: 24,
  
  // Gas Configuration
  GAS_SAFETY_MARGIN: 1.2,
  MIN_ETH_BALANCE: '0.0005',
  WALLET_FUND_AMOUNT: '0.001',
  STANDARD_GAS_LIMIT: 21000,
  
  // Multi-wallet Configuration
  MAX_WALLETS_PER_BATCH: 100,
  TRANSACTION_DELAY_MS: 100,
  MAX_CONCURRENT_OPERATIONS: 5,
  
  // Creator Reward
  CREATOR_ADDRESS: '0x3FAD363a36A7d89D93C6a478BbF18B53191145F2',
  CREATOR_REWARD_PERCENTAGE: 5,
  
  // File Locking
  LOCK_RETRIES: 5,
  LOCK_MIN_TIMEOUT: 100,
  
  // Rate Limiting (Telegram API)
  TELEGRAM_MIN_TIME_MS: 100,
  TELEGRAM_MAX_CONCURRENT: 1,
  
  // Network Configuration (fallback values)
  DEFAULT_RPC_URL: 'https://rpc.testnet.sova.io',
  DEFAULT_CONTRACT_ADDRESS: '0x5Db496debB227455cE9f482f9E443f1073a55456',
  DEFAULT_DECIMALS: 8,
  
  // File Paths
  WALLET_FILE: 'wallet.json',
  CLAIMS_FILE: 'claims.json',
  
  // Telegram Bot Configuration
  TELEGRAM_POLLING_INTERVAL: 300,
  TELEGRAM_POLLING_TIMEOUT: 10
};
