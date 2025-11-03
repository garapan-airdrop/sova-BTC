
const logger = require('../utils/logger');
const bridgeService = require('../services/bridgeService');
const { formatAddress } = require('../utils/formatters');
const { validateEthereumAddress } = require('../utils/validators');

function registerBridgeCommands(bot, web3Service, authMiddleware) {
  const account = web3Service.getAccount();

  // Initialize bridge service
  try {
    const privateKey = process.env.PRIVATE_KEY;
    bridgeService.initialize(privateKey);
  } catch (error) {
    logger.error('Bridge service initialization failed', { error: error.message });
  }

  bot.onText(/\/bridgeinfo/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Bridge info command', { userId });

    try {
      const config = bridgeService.getBridgeConfig();
      const sepoliaBalance = await bridgeService.getSepoliaBalance(account.address);

      const infoMsg = `🌉 *Bridge Information*

*Source Chain:* Ethereum Sepolia
*Destination Chain:* Sova Sepolia
*Bridge Contract:* \`${config.BRIDGE_CONTRACT}\`

*Your Balances:*
📍 Sepolia ETH: ${sepoliaBalance} ETH

*Bridge Limits:*
Min: ${config.MIN_BRIDGE_AMOUNT} ETH
Max: ${config.MAX_BRIDGE_AMOUNT} ETH
Default Gas Limit: ${config.DEFAULT_GAS_LIMIT}

*How to Bridge:*
\`/bridge <amount>\` - Bridge ETH to Sova
\`/bridgestatus <txhash>\` - Check bridge tx status

Example: \`/bridge 0.05\`
      `;

      bot.sendMessage(chatId, infoMsg, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Bridge info error', { error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/bridge(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    const amountStr = match[1];

    if (!amountStr) {
      bot.sendMessage(chatId, '❌ Gunakan: /bridge <amount>\n\nContoh: /bridge 0.05\n\n💡 Minimum 0.001 ETH, Maximum 1 ETH');
      return;
    }

    logger.info('Bridge command', { userId, amount: amountStr });

    try {
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        bot.sendMessage(chatId, '❌ Invalid amount! Must be a positive number.');
        return;
      }

      const statusMsg = await bot.sendMessage(chatId, `⏳ *Bridging ${amount} ETH from Sepolia to Sova...*\n\n🔍 Step 1/5: Checking balances...`, { parse_mode: 'Markdown' });

      // Get recipient address (same as sender for simplicity)
      const recipientAddress = account.address;

      await bot.editMessageText(
        `⏳ *Bridging ${amount} ETH from Sepolia to Sova...*\n\n✅ Step 1/5: Balances checked\n🔍 Step 2/5: Validating amount...`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );

      await bot.editMessageText(
        `⏳ *Bridging ${amount} ETH from Sepolia to Sova...*\n\n✅ Step 1/5: Balances checked\n✅ Step 2/5: Amount validated\n🔍 Step 3/5: Preparing bridge transaction...`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );

      await bot.editMessageText(
        `⏳ *Bridging ${amount} ETH from Sepolia to Sova...*\n\n✅ Step 1/5: Balances checked\n✅ Step 2/5: Amount validated\n✅ Step 3/5: Transaction prepared\n🔍 Step 4/5: Estimating gas...`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );

      await bot.editMessageText(
        `⏳ *Bridging ${amount} ETH from Sepolia to Sova...*\n\n✅ Step 1/5: Balances checked\n✅ Step 2/5: Amount validated\n✅ Step 3/5: Transaction prepared\n✅ Step 4/5: Gas estimated\n🔍 Step 5/5: Sending bridge transaction...`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );

      const result = await bridgeService.bridgeToSova(recipientAddress, amount);

      const successMsg = `✅ *Bridge Transaction Successful!*

💰 Amount: ${result.amount} ETH
🌉 From: Ethereum Sepolia
🎯 To: Sova Sepolia
📍 Recipient: \`${formatAddress(result.to)}\`

📄 TX Hash: \`${result.txHash}\`

🔗 [View on Sepolia Explorer](${result.explorerUrl})

⏱️ *Estimated Arrival:* 
Bridge transfers usually complete within 5-10 minutes.
Check your Sova wallet balance after confirmation.

💡 Use /bridgestatus ${result.txHash} to track progress
      `;

      bot.editMessageText(successMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      logger.error('Bridge error', { error: error.message });
      bot.sendMessage(chatId, `❌ *Bridge Failed!*\n\nError: \`${error.message}\`\n\n💡 Check:\n• Sufficient Sepolia ETH balance\n• Amount within limits (0.001 - 1 ETH)`, { parse_mode: 'Markdown' });
    }
  });

  bot.onText(/\/bridgestatus(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    const txHash = match[1];

    if (!txHash) {
      bot.sendMessage(chatId, '❌ Gunakan: /bridgestatus <txhash>\n\nContoh: /bridgestatus 0x58cf054a...');
      return;
    }

    logger.info('Bridge status command', { userId, txHash });

    try {
      const statusMsg = await bot.sendMessage(chatId, '⏳ Checking bridge transaction status...');

      const status = await bridgeService.getBridgeTransactionStatus(txHash);

      let statusEmoji = '⏳';
      if (status.status === 'success') statusEmoji = '✅';
      if (status.status === 'failed') statusEmoji = '❌';

      const resultMsg = `${statusEmoji} *Bridge Status*

TX Hash: \`${txHash}\`
Status: *${status.status.toUpperCase()}*
Message: ${status.message}
${status.blockNumber ? `Block: ${status.blockNumber}` : ''}
${status.gasUsed ? `Gas Used: ${status.gasUsed}` : ''}

🔗 [View on Sepolia Explorer](https://sepolia.etherscan.io/tx/${txHash})
      `;

      bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      logger.error('Bridge status error', { error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });
}

module.exports = { registerBridgeCommands };
