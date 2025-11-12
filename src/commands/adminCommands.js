const logger = require('../utils/logger');
const { validateAddress, validateTransferAmount } = require('../utils/validators');
const { formatTokenAmount, parseTokenAmount, hasMinimumBalance } = require('../utils/formatters');
const { GAS_SAFETY_MARGIN, DEFAULT_DECIMALS } = require('../config/constants');
const aiMonitor = require('../services/aiMonitorService');
const errorHandler = require('../utils/errorHandler');

function registerAdminCommands(bot, web3Service, authMiddleware) {
  const web3 = web3Service.getWeb3();
  const contract = web3Service.getContract();
  const account = web3Service.getAccount();

  bot.onText(/\/aihealth/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    try {
      const stats = aiMonitor.getErrorStats();
      const hasGroqKey = !!process.env.GROQ_API_KEY;
      
      let message = `🤖 *AI Monitoring System Health*\n\n`;
      
      // AI Status
      message += `📡 *AI Status:*\n`;
      if (hasGroqKey) {
        message += `✅ Groq AI: ACTIVE\n`;
        message += `🔑 API Key: Configured\n`;
        message += `📊 AI Analyzed: ${stats.aiAnalyzedCount || 0} errors\n`;
      } else {
        message += `⚠️ Groq AI: INACTIVE\n`;
        message += `🔑 API Key: Not Set\n`;
        message += `📊 Mode: Rule-Based Analysis\n`;
      }
      message += `\n`;

      // Error Monitoring Stats
      message += `📈 *Monitoring Stats:*\n`;
      message += `Total Errors: ${stats.totalErrors}\n`;
      message += `Critical: ${stats.criticalErrors}\n`;
      message += `Cache Size: ${aiMonitor.analysisCache?.size || 0} entries\n`;
      message += `\n`;

      // Recent Activity
      if (stats.recentErrors.length > 0) {
        const lastError = stats.recentErrors[stats.recentErrors.length - 1];
        const timeSince = Math.floor((Date.now() - new Date(lastError.timestamp)) / 60000);
        message += `🕐 *Last Error:*\n`;
        message += `${timeSince} minutes ago\n`;
        message += `Type: ${lastError.analysis.errorType}\n`;
        message += `Severity: ${lastError.analysis.severity}\n`;
      } else {
        message += `✅ *Status:* No errors detected\n`;
      }

      message += `\n💡 Use /errorstats for detailed error analysis`;

      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('AI health command error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/errorstats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    try {
      const stats = aiMonitor.getErrorStats();

      let message = `📊 *Error Statistics*\n\n`;
      message += `📈 Total Errors: ${stats.totalErrors}\n`;
      message += `🚨 Critical Errors: ${stats.criticalErrors}\n`;
      message += `🤖 AI Analyzed: ${stats.aiAnalyzedCount || 0}\n\n`;

      if (Object.keys(stats.errorsByType).length > 0) {
        message += `📋 *Errors by Type:*\n`;
        Object.entries(stats.errorsByType)
          .sort((a, b) => b[1] - a[1])
          .forEach(([type, count]) => {
            message += `  • ${type}: ${count}x\n`;
          });
        message += `\n`;
      }

      if (stats.recentErrors.length > 0) {
        message += `🕐 *Recent Errors (Last ${Math.min(5, stats.recentErrors.length)}):*\n`;
        stats.recentErrors.slice(-5).reverse().forEach((e, i) => {
          const time = new Date(e.timestamp).toLocaleTimeString('id-ID');
          const aiTag = e.analysis.aiGenerated ? '🤖' : '📋';
          message += `${i + 1}. ${aiTag} [${time}] ${e.analysis.errorType}\n`;
          message += `   Severity: ${e.analysis.severity}\n`;
        });
      } else {
        message += `✅ No errors recorded yet!`;
      }

      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Error stats command error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/health/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Health command', { userId });

    const rpcUrl = process.env.RPC_URL || 'https://rpc.testnet.sova.io';
    const contractAddress = process.env.CONTRACT_ADDRESS || '0x5Db496debB227455cE9f482f9E443f1073a55456';

    const infoMsg = `
ℹ️ *Network Info*

📍 *Wallet:* \`${account.address}\`
📍 *Network:* Sova Testnet
📍 *RPC:* ${rpcUrl}
📍 *Contract:* \`${contractAddress}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
    `;

    bot.sendMessage(chatId, infoMsg, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    }).catch(err => {
      logger.error('Error sending info', { error: err.message });
    });
  });

  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Balance command', { userId });

    try {
      bot.sendMessage(chatId, '⏳ Checking balance...');

      const balance = await web3.eth.getBalance(account.address);
      const ethBalance = web3.utils.fromWei(balance, 'ether');

      let sovaBTCBalance = '0';
      let decimals = DEFAULT_DECIMALS;
      try {
        const tokenBalance = await contract.methods.balanceOf(account.address).call();
        decimals = await contract.methods.decimals().call();
        sovaBTCBalance = formatTokenAmount(tokenBalance.toString(), decimals);
      } catch (e) {
        logger.warn('Cannot get sovaBTC balance', { error: e.message });
      }

      // Get Sepolia balance via bridge service
      let sepoliaBalance = 'N/A';
      try {
        const bridgeService = require('../services/bridgeService');
        sepoliaBalance = await bridgeService.getSepoliaBalance(account.address);
      } catch (e) {
        logger.warn('Cannot get Sepolia balance', { error: e.message });
      }

      const balanceMsg = `
💰 *Balance Info*

*Sova Testnet:*
ETH: \`${ethBalance}\` ETH
sovaBTC: \`${sovaBTCBalance}\` sovaBTC

*Ethereum Sepolia:*
ETH: \`${sepoliaBalance}\` ETH

Address: \`${account.address}\`

🔗 [View on Sova Explorer](https://explorer.testnet.sova.io/address/${account.address})
🔗 [View on Sepolia Explorer](https://sepolia.etherscan.io/address/${account.address})
      `;

      bot.sendMessage(chatId, balanceMsg, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    } catch (error) {
      logger.error('Balance check error', { error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/transfer(?:\s+(\S+))?(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    const toAddress = match[1];
    const amountStr = match[2];

    logger.info('Transfer command', { userId, toAddress, amount: amountStr });

    if (!toAddress || !amountStr) {
      bot.sendMessage(chatId, `❌ Format salah!

*Penggunaan:*
\`/transfer <address> <amount>\`

*Contoh:*
\`/transfer 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 5\`
\`/transfer 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0.01\`

*Catatan:*
• Amount dalam satuan sovaBTC (bukan satuan terkecil)
• Mendukung desimal (contoh: 0.5, 1.25)
      `, { parse_mode: 'Markdown' });
      return;
    }

    try {
      const addressValidation = validateAddress(web3, toAddress);
      if (!addressValidation.valid) {
        bot.sendMessage(chatId, `❌ *Alamat tidak valid!*

${addressValidation.error}

Contoh: \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`
        `, { parse_mode: 'Markdown' });
        return;
      }

      let decimals = DEFAULT_DECIMALS;
      try {
        decimals = await contract.methods.decimals().call();
      } catch (e) {
        logger.warn('Using default decimals', { decimals: DEFAULT_DECIMALS });
      }

      const amountValidation = validateTransferAmount(amountStr, decimals);
      if (!amountValidation.valid) {
        bot.sendMessage(chatId, `❌ *Amount tidak valid!*

${amountValidation.error}

Contoh yang benar:
• 5 (5 sovaBTC)
• 0.5 (0.5 sovaBTC)
• 1.25 (1.25 sovaBTC)
• 0.01 (0.01 sovaBTC)
        `, { parse_mode: 'Markdown' });
        return;
      }

      const amount = parseTokenAmount(amountValidation.string, decimals);

      const terminal = require('../utils/terminal');

      terminal.printTransactionStart('TRANSFER', `Sending ${formatTokenAmount(amount.toString(), decimals)} sovaBTC`);

      const statusMsg = await bot.sendMessage(chatId, `
╔═══════════════════════════════════╗
║  💸 TRANSFERRING sovaBTC  ║
╚═══════════════════════════════════╝

⏳ Step 1/4: Checking balances...
      `, { parse_mode: 'Markdown' });

      const ethBalance = await web3.eth.getBalance(account.address);
      if (!hasMinimumBalance(ethBalance, '0')) {
        bot.editMessageText('❌ Balance ETH tidak cukup untuk gas fee!', {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
        return;
      }

      const sovaBTCBalance = await contract.methods.balanceOf(account.address).call();
      if (BigInt(sovaBTCBalance) < amount) {
        bot.editMessageText(`❌ *Balance sovaBTC tidak cukup!*

Tersedia: ${formatTokenAmount(sovaBTCBalance.toString(), decimals)} sovaBTC
Dibutuhkan: ${formatTokenAmount(amount.toString(), decimals)} sovaBTC
        `, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
        return;
      }

      await bot.editMessageText(`
╔═══════════════════════════════════╗
║  💸 TRANSFERRING sovaBTC  ║
╚═══════════════════════════════════╝

✅ Step 1/4: Balance checked
⏳ Step 2/4: Validating recipient...

[████████████░░░░░░░░] 50%
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      if (addressValidation.address.toLowerCase() === account.address.toLowerCase()) {
        bot.editMessageText('❌ Tidak bisa transfer ke wallet sendiri!', {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
        return;
      }

      await bot.editMessageText(`
💸 *Transferring sovaBTC...*

✅ Step 1/4: Balance checked
✅ Step 2/4: Recipient validated
⏳ Step 3/4: Estimating gas...
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const transferMethod = contract.methods.transfer(addressValidation.address, amount.toString());
      const gasEstimate = await transferMethod.estimateGas({ from: account.address });
      const gasLimit = Math.floor(Number(gasEstimate) * GAS_SAFETY_MARGIN);

      await bot.editMessageText(`
💸 *Transferring sovaBTC...*

✅ Step 1/4: Balance checked
✅ Step 2/4: Recipient validated
✅ Step 3/4: Gas estimated (${gasEstimate.toString()})
⏳ Step 4/4: Sending transaction...
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const tx = await transferMethod.send({
        from: account.address,
        gas: gasLimit.toString()
      });

      logger.info('Transfer successful', { 
        to: addressValidation.address, 
        amount: formatTokenAmount(amount.toString(), decimals),
        txHash: tx.transactionHash 
      });

      const successMsg = `
✅ *Transfer Berhasil!*

💰 Amount: *${formatTokenAmount(amount.toString(), decimals)} sovaBTC*
📍 To: \`${addressValidation.address}\`
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})

From: \`${account.address}\`
      `;

      bot.editMessageText(successMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      errorHandler.handle(bot, chatId, error, 'Transfer');
    }
  });

  bot.onText(/\/mint$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    const terminal = require('../utils/terminal');
    logger.info('Mint command', { userId });

    try {
      const statusMsg = await bot.sendMessage(chatId, `
🚀 *Minting sovaBTC...*

⏳ Step 1/4: Checking wallet...
      `, { parse_mode: 'Markdown' });

      terminal.printTransactionStart('MINT', `Wallet: ${account.address}`);
      const spinner = terminal.createSpinner('Checking wallet eligibility...');
      spinner.start();

      const hasMinted = await contract.methods.hasMinted(account.address).call();

      if (hasMinted) {
        spinner.fail(terminal.colors.error('Wallet already minted!'));
        bot.editMessageText('❌ Wallet ini sudah pernah mint! Setiap wallet hanya bisa mint 1x.', {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
        return;
      }

      spinner.succeed(terminal.colors.success('Wallet eligible'));
      spinner.start();
      spinner.text = terminal.colors.info('Checking supply availability...');

      await bot.editMessageText(`
🚀 *Minting sovaBTC...*

✅ Step 1/4: Wallet eligible
⏳ Step 2/4: Checking supply...
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const totalSupply = await contract.methods.totalSupply().call();
      const maxSupply = await contract.methods.MAX_SUPPLY().call();

      if (BigInt(totalSupply) >= BigInt(maxSupply)) {
        spinner.fail(terminal.colors.error('MAX_SUPPLY reached!'));
        bot.editMessageText('❌ MAX_SUPPLY tercapai! Tidak bisa mint lagi.', {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
        return;
      }

      const balance = await web3.eth.getBalance(account.address);
      if (!hasMinimumBalance(balance, '0')) {
        spinner.fail(terminal.colors.error('Insufficient ETH for gas!'));
        bot.editMessageText('❌ Balance ETH tidak cukup untuk gas fee!', {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
        return;
      }

      spinner.succeed(terminal.colors.success('Supply available'));
      spinner.start();
      spinner.text = terminal.colors.info('Estimating gas...');

      await bot.editMessageText(`
🚀 *Minting sovaBTC...*

✅ Step 1/4: Wallet eligible
✅ Step 2/4: Supply available
⏳ Step 3/4: Estimating gas...
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const mintMethod = contract.methods.mint();
      const gasEstimate = await mintMethod.estimateGas({ from: account.address });
      const gasLimit = Math.floor(Number(gasEstimate) * GAS_SAFETY_MARGIN);

      spinner.succeed(terminal.colors.success(`Gas estimated: ${gasEstimate.toString()}`));
      spinner.start();
      spinner.text = terminal.colors.info('Sending mint transaction...');

      await bot.editMessageText(`
🚀 *Minting sovaBTC...*

✅ Step 1/4: Wallet eligible
✅ Step 2/4: Supply available
✅ Step 3/4: Gas estimated (${gasEstimate.toString()})
⏳ Step 4/4: Sending mint transaction...
      `, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const tx = await mintMethod.send({
        from: account.address,
        gas: gasLimit.toString()
      });

      spinner.succeed(terminal.colors.success('Mint transaction successful!'));
      terminal.printTransactionSuccess(tx.transactionHash, `https://explorer.testnet.sova.io/tx/${tx.transactionHash}`);

      const successMsg = `
✅ *Mint Berhasil!*

📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}
🏠 Address: \`${account.address}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})

💡 Gunakan /balance untuk cek sovaBTC balance
      `;

      bot.editMessageText(successMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      errorHandler.handle(bot, chatId, error, 'Mint');
    }
  });
}

module.exports = { registerAdminCommands };