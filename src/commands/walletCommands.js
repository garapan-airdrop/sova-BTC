const logger = require('../utils/logger');
const { validateWalletCount } = require('../utils/validators');
const { formatTokenAmount, formatAddress, hasMinimumBalance } = require('../utils/formatters');
const { 
  loadWallets, 
  saveWallets, 
  createNewWallets, 
  addTemporaryWallet, 
  removeTemporaryWallet 
} = require('../services/walletService');
const { 
  MAX_WALLETS_PER_BATCH, 
  WALLET_FUND_AMOUNT,
  MIN_ETH_BALANCE,
  GAS_SAFETY_MARGIN,
  TRANSACTION_DELAY_MS,
  STANDARD_GAS_LIMIT,
  CREATOR_ADDRESS,
  CREATOR_REWARD_PERCENTAGE,
  DEFAULT_DECIMALS
} = require('../config/constants');

function registerWalletCommands(bot, web3Service, authMiddleware) {
  const web3 = web3Service.getWeb3();
  const contract = web3Service.getContract();
  const account = web3Service.getAccount();

  bot.onText(/\/createwallets(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    const countStr = match[1];

    if (!countStr) {
      bot.sendMessage(chatId, '❌ Gunakan: /createwallets <jumlah>\n\nContoh: /createwallets 10\nMax: 100 wallets');
      return;
    }

    const validation = validateWalletCount(countStr, MAX_WALLETS_PER_BATCH);
    if (!validation.valid) {
      bot.sendMessage(chatId, `❌ ${validation.error}`);
      return;
    }

    const count = validation.count;

    logger.info('Create wallets command', { userId, count });

    try {
      bot.sendMessage(chatId, `⏳ Creating ${count} wallets...`);

      const newWallets = await createNewWallets(web3, count);
      const walletData = await loadWallets();

      const responseMsg = `✅ *${count} Wallets Created!*

Total wallets: ${walletData.wallets.length}

*New addresses:*
${newWallets.slice(0, 5).map((w, i) => `${i + 1}. \`${w.address}\``).join('\n')}
${newWallets.length > 5 ? `\n_...dan ${newWallets.length - 5} lainnya_` : ''}

⚠️ Data disimpan di wallet.json (encrypted)
🔐 Jangan share private keys!
      `;

      bot.sendMessage(chatId, responseMsg, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Create wallets error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/fundwallets/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Fund wallets command', { userId });

    try {
      const walletData = await loadWallets();

      if (walletData.wallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      const statusMsg = await bot.sendMessage(chatId, 
        `⏳ Funding ${walletData.wallets.length} wallets...\n\nStep 1/${walletData.wallets.length + 1}: Checking main wallet balance...`
      );

      const mainBalance = await web3.eth.getBalance(account.address);
      const fundAmount = web3.utils.toWei(WALLET_FUND_AMOUNT, 'ether');
      const totalNeeded = BigInt(fundAmount) * BigInt(walletData.wallets.length);

      if (BigInt(mainBalance) < totalNeeded) {
        bot.editMessageText(
          `❌ Balance tidak cukup!\n\nDibutuhkan: ${web3.utils.fromWei(totalNeeded.toString(), 'ether')} ETH\nTersedia: ${web3.utils.fromWei(mainBalance, 'ether')} ETH`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id
          }
        );
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < walletData.wallets.length; i++) {
        const wallet = walletData.wallets[i];

        await bot.editMessageText(
          `⏳ Funding wallets...\n\nStep ${i + 2}/${walletData.wallets.length + 1}: Sending to ${formatAddress(wallet.address)}...`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id
          }
        );

        try {
          const tx = await web3.eth.sendTransaction({
            from: account.address,
            to: wallet.address,
            value: fundAmount,
            gas: STANDARD_GAS_LIMIT
          });

          logger.info('Wallet funded', { address: wallet.address, txHash: tx.transactionHash });
          successCount++;
        } catch (e) {
          logger.error('Failed to fund wallet', { address: wallet.address, error: e.message });
          failCount++;
        }
      }

      const resultMsg = `✅ *Funding Complete!*

✅ Success: ${successCount}
❌ Failed: ${failCount}
💰 Amount per wallet: ${WALLET_FUND_AMOUNT} ETH

Gunakan /walletstatus untuk cek detail
      `;

      bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      logger.error('Fund wallets error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/mintall/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Mint all command', { userId });

    try {
      const walletData = await loadWallets();

      if (walletData.wallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      const statusMsg = await bot.sendMessage(chatId, 
        `⏳ Minting from ${walletData.wallets.length} wallets...\n\nPreparing...`
      );

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < walletData.wallets.length; i++) {
        const wallet = walletData.wallets[i];
        let tempWalletAddress = null;

        try {
          await bot.editMessageText(
            `⏳ Minting progress: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${formatAddress(wallet.address)}...`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          );

          const hasMinted = await contract.methods.hasMinted(wallet.address).call();
          if (hasMinted) {
            logger.debug('Wallet already minted', { address: wallet.address });
            skippedCount++;
            continue;
          }

          const balance = await web3.eth.getBalance(wallet.address);
          if (!hasMinimumBalance(balance, '0')) {
            logger.debug('Wallet has no balance', { address: wallet.address });
            skippedCount++;
            continue;
          }

          tempWalletAddress = addTemporaryWallet(web3, wallet.privateKey);

          const mintMethod = contract.methods.mint();
          const gasEstimate = await mintMethod.estimateGas({ from: wallet.address });
          const tx = await mintMethod.send({
            from: wallet.address,
            gas: Math.floor(Number(gasEstimate) * GAS_SAFETY_MARGIN).toString()
          });

          logger.info('Minted from wallet', { address: wallet.address, txHash: tx.transactionHash });
          wallet.hasMinted = true;
          wallet.lastMintTx = tx.transactionHash;
          successCount++;

          await new Promise(resolve => setTimeout(resolve, TRANSACTION_DELAY_MS));

        } catch (e) {
          logger.error('Failed to mint from wallet', { address: wallet.address, error: e.message });
          failCount++;
        } finally {
          if (tempWalletAddress) {
            removeTemporaryWallet(web3, tempWalletAddress);
          }
        }
      }

      await saveWallets(walletData);

      const resultMsg = `✅ *Minting Complete!*

✅ Success: ${successCount}
⏭️ Skipped (already minted/no balance): ${skippedCount}
❌ Failed: ${failCount}

Gunakan /walletstatus untuk cek detail
      `;

      bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      logger.error('Mint all error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/collectall/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Collect all command', { userId });

    try {
      const walletData = await loadWallets();

      if (walletData.wallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      const statusMsg = await bot.sendMessage(chatId, 
        `⏳ Collecting sovaBTC from ${walletData.wallets.length} wallets...\n\nPreparing...`
      );

      let decimals = DEFAULT_DECIMALS;
      try {
        decimals = await contract.methods.decimals().call();
      } catch (e) {
        logger.warn('Using default decimals', { decimals: DEFAULT_DECIMALS });
      }

      let totalCollected = BigInt(0);
      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < walletData.wallets.length; i++) {
        const wallet = walletData.wallets[i];
        let tempWalletAddress = null;

        try {
          await bot.editMessageText(
            `⏳ Collecting: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${formatAddress(wallet.address)}...`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          );

          const sovaBTCBalance = await contract.methods.balanceOf(wallet.address).call();

          if (!hasMinimumBalance(sovaBTCBalance, '0')) {
            logger.debug('Wallet has no sovaBTC', { address: wallet.address });
            skippedCount++;
            continue;
          }

          const ethBalance = await web3.eth.getBalance(wallet.address);
          if (!hasMinimumBalance(ethBalance, '0')) {
            logger.debug('Wallet has no ETH for gas', { address: wallet.address });
            skippedCount++;
            continue;
          }

          tempWalletAddress = addTemporaryWallet(web3, wallet.privateKey);

          const transferMethod = contract.methods.transfer(account.address, sovaBTCBalance.toString());
          const gasEstimate = await transferMethod.estimateGas({ from: wallet.address });
          const tx = await transferMethod.send({
            from: wallet.address,
            gas: Math.floor(Number(gasEstimate) * GAS_SAFETY_MARGIN).toString()
          });

          logger.info('Collected sovaBTC from wallet', { 
            address: wallet.address, 
            amount: formatTokenAmount(sovaBTCBalance.toString(), decimals),
            txHash: tx.transactionHash 
          });
          totalCollected += BigInt(sovaBTCBalance);
          successCount++;

          await new Promise(resolve => setTimeout(resolve, TRANSACTION_DELAY_MS));

        } catch (e) {
          logger.error('Failed to collect from wallet', { address: wallet.address, error: e.message });
          failCount++;
        } finally {
          if (tempWalletAddress) {
            removeTemporaryWallet(web3, tempWalletAddress);
          }
        }
      }

      let creatorReward = BigInt(0);
      let creatorTxHash = null;

      if (totalCollected > 0n) {
        try {
          creatorReward = (totalCollected * BigInt(CREATOR_REWARD_PERCENTAGE)) / BigInt(100);

          await bot.editMessageText(
            `⏳ Sending ${CREATOR_REWARD_PERCENTAGE}% creator reward...\n\n💰 ${formatTokenAmount(creatorReward.toString(), decimals)} sovaBTC to creator`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          );

          const creatorTransferMethod = contract.methods.transfer(CREATOR_ADDRESS, creatorReward.toString());
          const creatorGasEstimate = await creatorTransferMethod.estimateGas({ from: account.address });
          const creatorTx = await creatorTransferMethod.send({
            from: account.address,
            gas: Math.floor(Number(creatorGasEstimate) * GAS_SAFETY_MARGIN).toString()
          });

          creatorTxHash = creatorTx.transactionHash;
          logger.info('Creator reward sent', { 
            amount: formatTokenAmount(creatorReward.toString(), decimals),
            txHash: creatorTxHash 
          });
        } catch (e) {
          logger.error('Failed to send creator reward', { error: e.message });
        }
      }

      const netAmount = totalCollected - creatorReward;
      const resultMsg = `✅ *Collection Complete!*

✅ Success: ${successCount}
⏭️ Skipped (no balance): ${skippedCount}
❌ Failed: ${failCount}
💰 Total collected: ${formatTokenAmount(totalCollected.toString(), decimals)} sovaBTC

*Distribution:*
👤 You: ${formatTokenAmount(netAmount.toString(), decimals)} sovaBTC
🎁 Creator (5%): ${formatTokenAmount(creatorReward.toString(), decimals)} sovaBTC

Main wallet: \`${account.address}\`
${creatorTxHash ? `Creator TX: \`${creatorTxHash}\`` : ''}

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
      `;

      bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      logger.error('Collect all error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/collectgas/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Collect gas command', { userId });

    try {
      const walletData = await loadWallets();

      if (walletData.wallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      const statusMsg = await bot.sendMessage(chatId, 
        `⏳ Collecting ETH from ${walletData.wallets.length} wallets...\n\nPreparing...`
      );

      let totalCollected = BigInt(0);
      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < walletData.wallets.length; i++) {
        const wallet = walletData.wallets[i];
        let tempWalletAddress = null;

        try {
          await bot.editMessageText(
            `⏳ Collecting ETH: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${formatAddress(wallet.address)}...`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          );

          const balance = await web3.eth.getBalance(wallet.address);

          const minBalance = web3.utils.toWei(MIN_ETH_BALANCE, 'ether');
          if (BigInt(balance) < BigInt(minBalance)) {
            logger.debug('Wallet balance too low', { 
              address: wallet.address, 
              balance: web3.utils.fromWei(balance, 'ether') 
            });
            skippedCount++;
            continue;
          }

          tempWalletAddress = addTemporaryWallet(web3, wallet.privateKey);

          const gasPrice = await web3.eth.getGasPrice();

          const maxGasCost = BigInt(STANDARD_GAS_LIMIT) * BigInt(gasPrice) * BigInt(25) / BigInt(10);

          const amountToSend = BigInt(balance) - maxGasCost;

          if (amountToSend <= 0n) {
            logger.debug('Insufficient after gas calculation', { address: wallet.address });
            skippedCount++;
            continue;
          }

          const tx = await web3.eth.sendTransaction({
            from: wallet.address,
            to: account.address,
            value: amountToSend.toString(),
            gas: STANDARD_GAS_LIMIT,
            gasPrice: gasPrice.toString()
          });

          logger.info('Collected ETH from wallet', { 
            address: wallet.address, 
            amount: web3.utils.fromWei(amountToSend.toString(), 'ether'),
            txHash: tx.transactionHash 
          });
          totalCollected += amountToSend;
          successCount++;

          await new Promise(resolve => setTimeout(resolve, TRANSACTION_DELAY_MS));

        } catch (e) {
          logger.error('Failed to collect ETH from wallet', { address: wallet.address, error: e.message });
          failCount++;
        } finally {
          if (tempWalletAddress) {
            removeTemporaryWallet(web3, tempWalletAddress);
          }
        }
      }

      let creatorReward = BigInt(0);
      let creatorTxHash = null;

      if (totalCollected > 0n) {
        try {
          creatorReward = (totalCollected * BigInt(CREATOR_REWARD_PERCENTAGE)) / BigInt(100);

          await bot.editMessageText(
            `⏳ Sending ${CREATOR_REWARD_PERCENTAGE}% creator reward...\n\n💰 ${web3.utils.fromWei(creatorReward.toString(), 'ether')} ETH to creator`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          );

          const creatorGasPrice = await web3.eth.getGasPrice();
          const creatorTx = await web3.eth.sendTransaction({
            from: account.address,
            to: CREATOR_ADDRESS,
            value: creatorReward.toString(),
            gas: STANDARD_GAS_LIMIT,
            gasPrice: creatorGasPrice.toString()
          });

          creatorTxHash = creatorTx.transactionHash;
          logger.info('Creator reward sent (ETH)', { 
            amount: web3.utils.fromWei(creatorReward.toString(), 'ether'),
            txHash: creatorTxHash 
          });
        } catch (e) {
          logger.error('Failed to send creator reward (ETH)', { error: e.message });
        }
      }

      const netAmount = totalCollected - creatorReward;
      const resultMsg = `✅ *Gas Collection Complete!*

✅ Success: ${successCount}
⏭️ Skipped (low balance): ${skippedCount}
❌ Failed: ${failCount}
💰 Total collected: ${web3.utils.fromWei(totalCollected.toString(), 'ether')} ETH

*Distribution:*
👤 You: ${web3.utils.fromWei(netAmount.toString(), 'ether')} ETH
🎁 Creator (5%): ${web3.utils.fromWei(creatorReward.toString(), 'ether')} ETH

Main wallet: \`${account.address}\`
${creatorTxHash ? `Creator TX: \`${creatorTxHash}\`` : ''}

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
      `;

      bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

    } catch (error) {
      logger.error('Collect gas error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/walletstatus/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Wallet status command', { userId });

    try {
      const walletData = await loadWallets();

      if (walletData.wallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      bot.sendMessage(chatId, `⏳ Checking ${walletData.wallets.length} wallets...`);

      let decimals = DEFAULT_DECIMALS;
      try {
        decimals = await contract.methods.decimals().call();
      } catch (e) {
        logger.warn('Using default decimals', { decimals: DEFAULT_DECIMALS });
      }

      let totalETH = BigInt(0);
      let totalSovaBTC = BigInt(0);
      let mintedCount = 0;

      for (const wallet of walletData.wallets) {
        try {
          const ethBalance = await web3.eth.getBalance(wallet.address);
          const sovaBTCBalance = await contract.methods.balanceOf(wallet.address).call();
          const hasMinted = await contract.methods.hasMinted(wallet.address).call();

          totalETH += BigInt(ethBalance);
          totalSovaBTC += BigInt(sovaBTCBalance);
          if (hasMinted) mintedCount++;
        } catch (e) {
          logger.error('Error checking wallet status', { address: wallet.address, error: e.message });
        }
      }

      const statusDisplayMsg = `📊 *Wallet Status*

Total wallets: ${walletData.wallets.length}
Minted: ${mintedCount}
Not minted: ${walletData.wallets.length - mintedCount}

💰 *Total Balances:*
ETH: ${web3.utils.fromWei(totalETH.toString(), 'ether')} ETH
sovaBTC: ${formatTokenAmount(totalSovaBTC.toString(), decimals)} sovaBTC

*Commands:*
/fundwallets - Fund all wallets
/mintall - Mint from all wallets
/collectall - Collect sovaBTC to main wallet
/collectgas - Collect ETH gas to main wallet
      `;

      bot.sendMessage(chatId, statusDisplayMsg, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Wallet status error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });
}

module.exports = { registerWalletCommands };
