require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Bottleneck = require('bottleneck');
const logger = require('./src/utils/logger');
const terminal = require('./src/utils/terminal');
const { validateEnvironmentVariables } = require('./src/utils/envValidator');
const web3Service = require('./src/services/web3Service');
const AuthMiddleware = require('./src/middleware/auth');
const { registerPublicCommands } = require('./src/commands/publicCommands');
const { registerAdminCommands } = require('./src/commands/adminCommands');
const { registerWalletCommands } = require('./src/commands/walletCommands');
const { registerCheckinCommands } = require('./src/commands/checkinCommands');
const { registerVaultCommands } = require('./src/commands/vaultCommands');
const { registerBridgeCommands } = require('./src/commands/bridgeCommands');
const { TELEGRAM_POLLING_INTERVAL, TELEGRAM_POLLING_TIMEOUT, TELEGRAM_MIN_TIME_MS, TELEGRAM_MAX_CONCURRENT } = require('./src/config/constants');

try {
  validateEnvironmentVariables();
} catch (error) {
  logger.error('Environment validation failed:', error.message);
  process.exit(1);
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ALLOWED_USERS = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',').map(id => id.trim()) : [];

terminal.printBanner();

if (ALLOWED_USERS.length === 0) {
  console.log('\n');
  terminal.printWarning('⚠️', '═══════════════ SECURITY WARNING ═══════════════');
  terminal.printWarning('⚠️', 'ALLOWED_USERS is empty!');
  terminal.printWarning('⚠️', 'ALL users can access admin commands!');
  terminal.printWarning('⚠️', 'Set ALLOWED_USERS in Replit Secrets for production');
  terminal.printWarning('⚠️', '═══════════════════════════════════════════════');
  console.log('\n');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function animatedStartup() {
  const steps = [
    { text: 'Loading Web3 module...', delay: 300 },
    { text: 'Connecting to Sova Testnet...', delay: 500 },
    { text: 'Initializing smart contract...', delay: 400 },
    { text: 'Setting up Telegram Bot...', delay: 300 },
    { text: 'Configuring auth middleware...', delay: 200 }
  ];

  for (const step of steps) {
    const spinner = terminal.createSpinner(step.text);
    spinner.start();
    await sleep(step.delay);
    spinner.succeed(terminal.colors.success(step.text.replace('...', ' ✓')));
  }
}

(async () => {
  await animatedStartup();
  const initSpinner = terminal.createSpinner('Finalizing initialization...');
  initSpinner.start();

try {
  const { web3, contract, account } = web3Service.initialize(PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS);
  
  initSpinner.succeed(terminal.colors.success('Web3 Initialized Successfully!'));
  
  terminal.printSection('📋 Configuration');
  terminal.printWalletInfo(account.address, 'Main Wallet');
  terminal.printNetworkInfo('Sova Testnet');
  terminal.printContractInfo(CONTRACT_ADDRESS || '0x5Db496debB227455cE9f482f9E443f1073a55456');
  terminal.printAdminInfo(ALLOWED_USERS.length, ALLOWED_USERS);
  
  logger.info('Web3 initialized', { 
    wallet: account.address, 
    network: RPC_URL, 
    contract: CONTRACT_ADDRESS || '0x5Db496debB227455cE9f482f9E443f1073a55456' 
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
  registerCheckinCommands(bot, web3Service, authMiddleware);
  registerVaultCommands(bot, web3Service, authMiddleware);
  registerBridgeCommands(bot, web3Service, authMiddleware);

  bot.on('polling_error', (error) => {
    // Ignore EFATAL errors (usually network hiccups)
    if (error.code === 'EFATAL') {
      return;
    }
    logger.error('Telegram polling error', { 
      code: error.code, 
      message: error.message 
    });
  });

  bot.on('error', (error) => {
    logger.error('Bot error', { error: error.message, stack: error.stack });
  });

  terminal.printSection('🎯 Status');
  terminal.printReadyMessage();
  terminal.printInfo('💬', 'Send /start in Telegram to begin using the bot');
  terminal.printDivider();
  console.log('\n');

} catch (error) {
  initSpinner.fail(terminal.colors.error('Initialization Failed!'));
  terminal.printError('💥', 'Fatal initialization error:', error.message);
  logger.error('Fatal initialization error', { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
}
})().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});

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
  console.log('\n');
  terminal.printWarning('👋', 'Shutting down bot gracefully...');
  logger.info('Shutting down bot (SIGINT)');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n');
  terminal.printWarning('👋', 'Shutting down bot gracefully...');
  logger.info('Shutting down bot (SIGTERM)');
  process.exit(0);
});
