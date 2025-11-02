
const logger = require('../utils/logger');
const vaultService = require('../services/vaultService');
const { formatTokenAmount, parseTokenAmount } = require('../utils/formatters');
const { validateAddress, validateTransferAmount } = require('../utils/validators');
const { GAS_SAFETY_MARGIN, DEFAULT_DECIMALS } = require('../config/constants');

function registerVaultCommands(bot, web3Service, authMiddleware) {
  const { web3, account } = web3Service.getWeb3 
    ? { web3: web3Service.getWeb3(), account: web3Service.getAccount() }
    : web3Service;

  let vaultInitialized = false;
  let vaultInitError = null;

  // Initialize vault service (async) with better error handling
  // Only attempt initialization if vault is configured
  vaultService.initialize(web3)
    .then(() => {
      vaultInitialized = true;
      logger.info('Vault service ready for operations');
      
      // Notify admin vault is ready (optional, only if configured)
      const ALLOWED_USERS = process.env.ALLOWED_USERS 
        ? process.env.ALLOWED_USERS.split(',').map(id => id.trim()) 
        : [];
      
      if (ALLOWED_USERS.length > 0 && process.env.SPBTC_CONTRACT) {
        const adminId = ALLOWED_USERS[0];
        bot.sendMessage(adminId, `
✅ *Vault Service Active*

Sova Prime vault commands are now available:
• /vaultinfo - Check vault stats
• /vaultdeposit <amount> - Deposit to vault
• /vaultwithdraw <shares> - Withdraw from vault

Vault is ready for use!
        `, { parse_mode: 'Markdown' }).catch(() => {});
      }
    })
    .catch(err => {
      vaultInitialized = false;
      vaultInitError = err.message;
      
      // Only log as info if it's a "not configured" error
      if (err.message.includes('not configured')) {
        logger.info('Vault features disabled - not configured (this is normal)');
        vaultInitError = 'Vault not configured. Set SPBTC_CONTRACT and CONDUIT_CONTRACT to enable.';
      } else {
        // Log as error if it's a real failure
        logger.error('Vault service initialization failed', { error: err.message });
        
        // Notify admin about vault service failure (only for real errors)
        const ALLOWED_USERS = process.env.ALLOWED_USERS 
          ? process.env.ALLOWED_USERS.split(',').map(id => id.trim()) 
          : [];
        
        if (ALLOWED_USERS.length > 0 && process.env.SPBTC_CONTRACT) {
          const adminId = ALLOWED_USERS[0];
          bot.sendMessage(adminId, `
⚠️ *Vault Service Initialization Failed*

The Sova Prime vault commands will not be available.

*Error:* ${err.message}

*Possible causes:*
• Contract addresses incorrect for this network
• Network connection issue
• Contract not deployed on current network

*Action needed:*
Check and update environment variables:
\`SPBTC_CONTRACT=0x...\` (verify address is correct)
\`CONDUIT_CONTRACT=0x...\` (verify address is correct)

Other bot functions are working normally.
          `, { parse_mode: 'Markdown' }).catch(() => {
            logger.error('Failed to notify admin about vault init failure');
          });
        }
      }
    });

  // Helper function to check if vault is available
  function checkVaultAvailability(chatId) {
    if (!vaultInitialized) {
      const errorMsg = `❌ *Vault Service Unavailable*

The Sova Prime vault is currently not available.

*Reason:* ${vaultInitError || 'Service not initialized'}

Please contact the bot administrator.

*Note:* Other bot functions (minting, transfers, check-ins) are working normally.
      `;
      bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
      return false;
    }
    return true;
  }

  bot.onText(/\/vaultinfo/, async (msg) => {
    const chatId = msg.chat.id;

    if (!checkVaultAvailability(chatId)) return;

    try {
      const stats = await vaultService.getVaultStats();
      const userBalance = await vaultService.getVaultBalance(account.address);

      const infoMsg = `
🏦 *Sova Prime Vault Info*

📊 *Vault Statistics:*
Total Assets: \`${formatTokenAmount(stats.totalAssets, DEFAULT_DECIMALS)}\` spBTC
Total Shares: \`${formatTokenAmount(stats.totalSupply, DEFAULT_DECIMALS)}\`
Share Value: \`${(Number(stats.shareValue) / 10000).toFixed(4)}\` spBTC per share

👤 *Your Position:*
Shares: \`${formatTokenAmount(userBalance.shares, DEFAULT_DECIMALS)}\`
Assets: \`${formatTokenAmount(userBalance.assets, DEFAULT_DECIMALS)}\` spBTC

📍 Conduit: \`${vaultService.conduitContract.options.address}\`
      `;

      bot.sendMessage(chatId, infoMsg, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Vault info error', { error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/vaultdeposit(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    if (!checkVaultAvailability(chatId)) return;

    const amountStr = match[1];

    if (!amountStr) {
      bot.sendMessage(chatId, '❌ Usage: `/vaultdeposit <amount>`\nExample: `/vaultdeposit 1.5`', {
        parse_mode: 'Markdown'
      });
      return;
    }

    try {
      const amountValidation = validateTransferAmount(amountStr, DEFAULT_DECIMALS);
      if (!amountValidation.valid) {
        bot.sendMessage(chatId, `❌ ${amountValidation.error}`);
        return;
      }

      const amount = parseTokenAmount(amountValidation.string, DEFAULT_DECIMALS);

      const statusMsg = await bot.sendMessage(chatId, `
🏦 *Depositing to Vault...*

⏳ Step 1/3: Checking balance...
      `, { parse_mode: 'Markdown' });

      const spBTCBalance = await vaultService.spBTCContract.methods
        .balanceOf(account.address)
        .call();

      if (BigInt(spBTCBalance) < amount) {
        bot.editMessageText(`❌ *Insufficient spBTC balance!*

Available: ${formatTokenAmount(spBTCBalance.toString(), DEFAULT_DECIMALS)} spBTC
Required: ${formatTokenAmount(amount.toString(), DEFAULT_DECIMALS)} spBTC
        `, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
        return;
      }

      await bot.editMessageText(`
🏦 *Depositing to Vault...*

✅ Step 1/3: Balance checked
⏳ Step 2/3: Approving spBTC...
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const tx = await vaultService.depositToVault(account, amount);

      bot.editMessageText(`
✅ *Deposit Successful!*

💰 Amount: ${formatTokenAmount(amount.toString(), DEFAULT_DECIMALS)} spBTC
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      logger.error('Vault deposit error', { error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/vaultwithdraw(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    if (!checkVaultAvailability(chatId)) return;

    const sharesStr = match[1];

    if (!sharesStr) {
      bot.sendMessage(chatId, '❌ Usage: `/vaultwithdraw <shares>`\nExample: `/vaultwithdraw 1.5`', {
        parse_mode: 'Markdown'
      });
      return;
    }

    try {
      const amountValidation = validateTransferAmount(sharesStr, DEFAULT_DECIMALS);
      if (!amountValidation.valid) {
        bot.sendMessage(chatId, `❌ ${amountValidation.error}`);
        return;
      }

      const shares = parseTokenAmount(amountValidation.string, DEFAULT_DECIMALS);

      const statusMsg = await bot.sendMessage(chatId, `
🏦 *Withdrawing from Vault...*

⏳ Step 1/2: Checking shares...
      `, { parse_mode: 'Markdown' });

      const userBalance = await vaultService.getVaultBalance(account.address);

      if (BigInt(userBalance.shares) < shares) {
        bot.editMessageText(`❌ *Insufficient shares!*

Available: ${formatTokenAmount(userBalance.shares, DEFAULT_DECIMALS)} shares
Required: ${formatTokenAmount(shares.toString(), DEFAULT_DECIMALS)} shares
        `, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
        return;
      }

      await bot.editMessageText(`
🏦 *Withdrawing from Vault...*

✅ Step 1/2: Shares checked
⏳ Step 2/2: Redeeming shares...
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const tx = await vaultService.withdrawFromVault(account, shares);

      bot.editMessageText(`
✅ *Withdrawal Successful!*

📊 Shares: ${formatTokenAmount(shares.toString(), DEFAULT_DECIMALS)}
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      logger.error('Vault withdraw error', { error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  logger.info('Vault commands registered');
}

module.exports = { registerVaultCommands };
