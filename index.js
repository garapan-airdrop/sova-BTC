require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Bottleneck = require('bottleneck');
const logger = require('./src/utils/logger');
const web3Service = require('./src/services/web3Service');
const AuthMiddleware = require('./src/middleware/auth');
const { registerPublicCommands } = require('./src/commands/publicCommands');
const { registerAdminCommands } = require('./src/commands/adminCommands');
const { registerWalletCommands } = require('./src/commands/walletCommands');
const { TELEGRAM_POLLING_INTERVAL, TELEGRAM_POLLING_TIMEOUT, TELEGRAM_MIN_TIME_MS, TELEGRAM_MAX_CONCURRENT } = require('./src/config/constants');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ALLOWED_USERS = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',').map(id => id.trim()) : [];

if (!BOT_TOKEN || !PRIVATE_KEY) {
  logger.error('Missing required environment variables');
  logger.error('TELEGRAM_BOT_TOKEN and PRIVATE_KEY must be set in Replit Secrets');
  process.exit(1);
}

if (ALLOWED_USERS.length === 0) {
  logger.warn('⚠️  =============== SECURITY WARNING ===============');
  logger.warn('⚠️  ALLOWED_USERS is empty!');
  logger.warn('⚠️  ALL users can access admin commands!');
  logger.warn('⚠️  Set ALLOWED_USERS in Replit Secrets for production');
  logger.warn('⚠️  ================================================');
}

logger.info('🤖 Sova BTC Faucet Bot Starting...');

try {
  const { web3, contract, account } = web3Service.initialize(PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS);
  
  logger.info('✅ Web3 Initialized');
  logger.info('📍 Wallet', { address: account.address });
  logger.info('📍 Network: Sova Testnet');
  logger.info('📍 Contract', { address: CONTRACT_ADDRESS || '0x5Db496debB227455cE9f482f9E443f1073a55456' });
  logger.info('📍 Admin Users', { 
    count: ALLOWED_USERS.length,
    users: ALLOWED_USERS.length > 0 ? ALLOWED_USERS.join(', ') : 'ALL (not recommended for production)'
  });

  const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      interval: TELEGRAM_POLLING_INTERVAL,
      autoStart: true,
      params: {
        timeout: TELEGRAM_POLLING_TIMEOUT
      }
    }
  });

  const limiter = new Bottleneck({
    minTime: TELEGRAM_MIN_TIME_MS,
    maxConcurrent: TELEGRAM_MAX_CONCURRENT
  });

  const originalSendMessage = bot.sendMessage.bind(bot);
  const originalEditMessageText = bot.editMessageText.bind(bot);
  
  bot.sendMessage = limiter.wrap(originalSendMessage);
  bot.editMessageText = limiter.wrap(originalEditMessageText);

  const authMiddleware = new AuthMiddleware(ALLOWED_USERS);

  registerPublicCommands(bot, web3Service, authMiddleware);
  registerAdminCommands(bot, web3Service, authMiddleware);
  registerWalletCommands(bot, web3Service, authMiddleware);

  bot.on('polling_error', (error) => {
    logger.error('Telegram polling error', { 
      code: error.code, 
      message: error.message 
    });
  });

  bot.on('error', (error) => {
    logger.error('Bot error', { error: error.message, stack: error.stack });
  });

  logger.info('🚀 Bot is running! Send /start to begin.');

} catch (error) {
  logger.error('Fatal initialization error', { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { 
    reason: reason, 
    promise: promise 
  });
  
  if (ALLOWED_USERS.length > 0) {
    const adminId = ALLOWED_USERS[0];
    const bot = new TelegramBot(BOT_TOKEN, { polling: false });
    bot.sendMessage(adminId, `⚠️ Bot Error:\n${reason}`).catch(err => {
      logger.error('Failed to send error notification to admin', { error: err.message });
    });
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('👋 Shutting down bot (SIGINT)...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('👋 Shutting down bot (SIGTERM)...');
  process.exit(0);
});
