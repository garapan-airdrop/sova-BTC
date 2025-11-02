const logger = require('../utils/logger');
const { validateWalletCount } = require('../utils/validators');
const { formatTokenAmount, formatAddress, hasMinimumBalance } = require('../utils/formatters');
const { 
  loadWallets, 
  saveWallets, 
  createNewWallets, 
  addTemporaryWallet, 
  removeTemporaryWallet,
  archiveMintedWallet,
  loadMintedWallets
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
      const gasPrice = await web3.eth.getGasPrice();
      const estimatedGasPerTx = BigInt(STANDARD_GAS_LIMIT) * BigInt(gasPrice);
      const totalValueTransfer = BigInt(fundAmount) * BigInt(walletData.wallets.length);
      const totalGasCost = estimatedGasPerTx * BigInt(walletData.wallets.length);
      const totalNeeded = totalValueTransfer + totalGasCost;

      if (BigInt(mainBalance) < totalNeeded) {
        const totalValueETH = web3.utils.fromWei(totalValueTransfer.toString(), 'ether');
        const totalGasETH = web3.utils.fromWei(totalGasCost.toString(), 'ether');
        const totalNeededETH = web3.utils.fromWei(totalNeeded.toString(), 'ether');
        const balanceETH = web3.utils.fromWei(mainBalance, 'ether');
        
        bot.editMessageText(
          `❌ *Balance Tidak Cukup!*

💰 *Transfer:* ${totalValueETH} ETH (${walletData.wallets.length} × ${WALLET_FUND_AMOUNT})
⛽ *Gas Fee:* ~${totalGasETH} ETH
━━━━━━━━━━━━━━━━
📊 *Total Needed:* ${totalNeededETH} ETH
💼 *Your Balance:* ${balanceETH} ETH
❌ *Kurang:* ${web3.utils.fromWei((totalNeeded - BigInt(mainBalance)).toString(), 'ether')} ETH

💡 Tip: Reduce jumlah wallets atau top up balance dulu.
          `,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          }
        );
        return;
      }

      let successCount = 0;
      let failCount = 0;
      const terminal = require('../utils/terminal');
      
      logger.disableConsole();
      
      terminal.printSection(`💰 FUNDING ${walletData.wallets.length} WALLETS`);
      const spinner = terminal.createSpinner('Initializing wallet funding...');
      spinner.start();

      for (let i = 0; i < walletData.wallets.length; i++) {
        const walletAccount = web3.eth.accounts.privateKeyToAccount(walletData.wallets[i].privateKey);

        terminal.printProgressBar(i + 1, walletData.wallets.length, `💸 Funding Progress`);
        spinner.text = terminal.colors.info(`Processing ${formatAddress(walletAccount.address)}`);

        await bot.editMessageText(
          `💰 Funding Wallets: ${i + 1}/${walletData.wallets.length}\n\n✅ ${successCount} | ❌ ${failCount}\n\n${terminal.createProgressBarText(i + 1, walletData.wallets.length)}\n\n${formatAddress(walletAccount.address)}`,
          { chat_id: chatId, message_id: statusMsg.message_id }
        ).catch(() => {});

        try {
          const tx = await web3.eth.sendTransaction({
            from: account.address,
            to: walletAccount.address,
            value: fundAmount,
            gas: STANDARD_GAS_LIMIT
          });

          spinner.succeed(terminal.colors.success(`✓ ${i + 1}/${walletData.wallets.length} ${formatAddress(walletAccount.address)}`));
          spinner.start();
          successCount++;
        } catch (e) {
          spinner.fail(terminal.colors.error(`✗ ${i + 1}/${walletData.wallets.length} ${formatAddress(walletAccount.address)}`));
          spinner.start();
          failCount++;
        }
      }

      spinner.stop();
      logger.enableConsole();
      terminal.printSummary('FUNDING COMPLETE', successCount, failCount, 0);

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

    const terminal = require('../utils/terminal');
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

      logger.disableConsole();
      
      terminal.printSection(`🪙 MASS MINTING FROM ${walletData.wallets.length} WALLETS`);
      const spinner = terminal.createSpinner('Initializing mass minting...');
      spinner.start();

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < walletData.wallets.length; i++) {
        const wallet = walletData.wallets[i];
        let tempWalletAddress = null;

        try {
          terminal.printProgressBar(i + 1, walletData.wallets.length, `⚡ Minting Progress`);
          spinner.text = terminal.colors.info(`Processing ${formatAddress(wallet.address)}`);

          await bot.editMessageText(
            `🪙 Minting: ${i + 1}/${walletData.wallets.length}\n\n✅ ${successCount} | ⏭️ ${skippedCount} | ❌ ${failCount}\n\n${terminal.createProgressBarText(i + 1, walletData.wallets.length)}\n\n${formatAddress(wallet.address)}`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          ).catch(() => {});

          const hasMinted = await contract.methods.hasMinted(wallet.address).call();
          if (hasMinted) {
            spinner.warn(terminal.colors.warning(`⊘ ${i + 1}/${walletData.wallets.length} Already minted`));
            spinner.start();
            skippedCount++;
            continue;
          }

          const balance = await web3.eth.getBalance(wallet.address);
          if (!hasMinimumBalance(balance, '0')) {
            spinner.warn(terminal.colors.warning(`⊘ ${i + 1}/${walletData.wallets.length} No balance`));
            spinner.start();
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

          spinner.succeed(terminal.colors.success(`✓ ${i + 1}/${walletData.wallets.length} ${formatAddress(wallet.address)}`));
          spinner.start();

          wallet.hasMinted = true;
          wallet.lastMintTx = tx.transactionHash;
          successCount++;

          await new Promise(resolve => setTimeout(resolve, TRANSACTION_DELAY_MS));

        } catch (e) {
          spinner.fail(terminal.colors.error(`✗ ${i + 1}/${walletData.wallets.length} ${formatAddress(wallet.address)}`));
          spinner.start();
          failCount++;
        } finally {
          if (tempWalletAddress) {
            removeTemporaryWallet(web3, tempWalletAddress);
          }
        }
      }

      spinner.stop();
      logger.enableConsole();
      terminal.printSummary('MINTING COMPLETE', successCount, failCount, skippedCount);

      // Save updated wallet data (keep minted wallets in active list)
      if (successCount > 0) {
        await saveWallets(walletData);
        logger.info('Minting status updated', { 
          totalWallets: walletData.wallets.length,
          mintedCount: walletData.wallets.filter(w => w.hasMinted).length
        });
      }

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

      logger.disableConsole();
      
      const terminal = require('../utils/terminal');
      terminal.printSection(`💎 COLLECTING sovaBTC FROM ${walletData.wallets.length} WALLETS`);
      const spinner = terminal.createSpinner('Initializing collection...');
      spinner.start();
      
      let totalCollected = BigInt(0);
      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < walletData.wallets.length; i++) {
        const wallet = walletData.wallets[i];
        let tempWalletAddress = null;

        try {
          terminal.printProgressBar(i + 1, walletData.wallets.length, `💰 Collection Progress`);
          spinner.text = terminal.colors.info(`Processing ${formatAddress(wallet.address)}`);
          
          await bot.editMessageText(
            `💎 Collecting: ${i + 1}/${walletData.wallets.length}\n\n✅ ${successCount} | ⏭️ ${skippedCount} | ❌ ${failCount}\n\n${terminal.createProgressBarText(i + 1, walletData.wallets.length)}\n\n${formatAddress(wallet.address)}`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          ).catch(() => {});

          const sovaBTCBalance = await contract.methods.balanceOf(wallet.address).call();

          if (!hasMinimumBalance(sovaBTCBalance, '0')) {
            spinner.warn(terminal.colors.warning(`⊘ ${i + 1}/${walletData.wallets.length} No sovaBTC`));
            spinner.start();
            skippedCount++;
            continue;
          }

          const ethBalance = await web3.eth.getBalance(wallet.address);
          if (!hasMinimumBalance(ethBalance, '0')) {
            spinner.warn(terminal.colors.warning(`⊘ ${i + 1}/${walletData.wallets.length} No gas`));
            spinner.start();
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

          spinner.succeed(terminal.colors.success(`✓ ${i + 1}/${walletData.wallets.length} ${formatAddress(wallet.address)} → ${formatTokenAmount(sovaBTCBalance.toString(), decimals)} sovaBTC`));
          spinner.start();
          
          totalCollected += BigInt(sovaBTCBalance);
          successCount++;

          await new Promise(resolve => setTimeout(resolve, TRANSACTION_DELAY_MS));

        } catch (e) {
          spinner.fail(terminal.colors.error(`✗ ${i + 1}/${walletData.wallets.length} ${formatAddress(wallet.address)}`));
          spinner.start();
          failCount++;
        } finally {
          if (tempWalletAddress) {
            removeTemporaryWallet(web3, tempWalletAddress);
          }
        }
      }
      
      spinner.stop();
      logger.enableConsole();
      terminal.printSummary('COLLECTION COMPLETE', successCount, failCount, skippedCount);

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

      logger.disableConsole();
      
      const terminal = require('../utils/terminal');
      terminal.printSection(`⛽ COLLECTING GAS FROM ${walletData.wallets.length} WALLETS`);
      const spinner = terminal.createSpinner('Initializing gas collection...');
      spinner.start();
      
      let totalCollected = BigInt(0);
      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < walletData.wallets.length; i++) {
        const wallet = walletData.wallets[i];
        let tempWalletAddress = null;

        try {
          terminal.printProgressBar(i + 1, walletData.wallets.length, `⛽ Gas Collection`);
          spinner.text = terminal.colors.info(`Processing ${formatAddress(wallet.address)}`);
          
          await bot.editMessageText(
            `⛽ Collecting Gas: ${i + 1}/${walletData.wallets.length}\n\n✅ ${successCount} | ⏭️ ${skippedCount} | ❌ ${failCount}\n\n${terminal.createProgressBarText(i + 1, walletData.wallets.length)}\n\n${formatAddress(wallet.address)}`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id
            }
          ).catch(() => {});

          const balance = await web3.eth.getBalance(wallet.address);

          const minBalance = web3.utils.toWei(MIN_ETH_BALANCE, 'ether');
          if (BigInt(balance) < BigInt(minBalance)) {
            spinner.warn(terminal.colors.warning(`⊘ ${i + 1}/${walletData.wallets.length} Balance too low`));
            spinner.start();
            skippedCount++;
            continue;
          }

          tempWalletAddress = addTemporaryWallet(web3, wallet.privateKey);

          const gasPrice = await web3.eth.getGasPrice();
          const maxGasCost = BigInt(STANDARD_GAS_LIMIT) * BigInt(gasPrice) * BigInt(25) / BigInt(10);
          const amountToSend = BigInt(balance) - maxGasCost;

          if (amountToSend <= 0n) {
            spinner.warn(terminal.colors.warning(`⊘ ${i + 1}/${walletData.wallets.length} Insufficient after gas`));
            spinner.start();
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

          spinner.succeed(terminal.colors.success(`✓ ${i + 1}/${walletData.wallets.length} ${formatAddress(wallet.address)} → ${web3.utils.fromWei(amountToSend.toString(), 'ether')} ETH`));
          spinner.start();
          
          totalCollected += amountToSend;
          successCount++;

          await new Promise(resolve => setTimeout(resolve, TRANSACTION_DELAY_MS));

        } catch (e) {
          spinner.fail(terminal.colors.error(`✗ ${i + 1}/${walletData.wallets.length} ${formatAddress(wallet.address)}`));
          spinner.start();
          failCount++;
        } finally {
          if (tempWalletAddress) {
            removeTemporaryWallet(web3, tempWalletAddress);
          }
        }
      }
      
      spinner.stop();
      logger.enableConsole();
      terminal.printSummary('GAS COLLECTION COMPLETE', successCount, failCount, skippedCount);

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

  bot.onText(/\/archivecompleted/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Archive completed command', { userId });

    try {
      const walletData = await loadWallets();

      if (walletData.wallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet aktif!');
        return;
      }

      // Find wallets that have minted and have no sovaBTC balance left
      const statusMsg = await bot.sendMessage(chatId, 
        `⏳ Checking ${walletData.wallets.length} wallets for archiving...`
      );

      let archivedCount = 0;
      const walletsToKeep = [];

      for (const wallet of walletData.wallets) {
        if (!wallet.hasMinted) {
          walletsToKeep.push(wallet);
          continue;
        }

        try {
          const sovaBTCBalance = await contract.methods.balanceOf(wallet.address).call();
          const ethBalance = await web3.eth.getBalance(wallet.address);

          // Archive if: already minted AND no sovaBTC AND very low ETH
          if (BigInt(sovaBTCBalance) === 0n && BigInt(ethBalance) < BigInt(web3.utils.toWei('0.0001', 'ether'))) {
            await archiveMintedWallet(wallet);
            archivedCount++;
          } else {
            walletsToKeep.push(wallet);
          }
        } catch (e) {
          logger.error('Error checking wallet for archive', { address: wallet.address, error: e.message });
          walletsToKeep.push(wallet);
        }
      }

      walletData.wallets = walletsToKeep;
      await saveWallets(walletData);

      const resultMsg = `✅ *Archive Complete!*

📦 Archived: ${archivedCount} wallets
📁 Remaining active: ${walletsToKeep.length} wallets

Wallet yang di-archive:
• Sudah mint ✓
• sovaBTC balance = 0
• ETH balance < 0.0001

Gunakan /walletstatus untuk cek detail
      `;

      bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      logger.error('Archive completed error', { userId, error: error.message });
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
      const activeWallets = await loadWallets();
      const mintedWallets = await loadMintedWallets();
      const allWallets = [...activeWallets.wallets, ...mintedWallets.wallets];

      if (allWallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      bot.sendMessage(chatId, `⏳ Checking ${allWallets.length} wallets...`);

      let decimals = DEFAULT_DECIMALS;
      try {
        decimals = await contract.methods.decimals().call();
      } catch (e) {
        logger.warn('Using default decimals', { decimals: DEFAULT_DECIMALS });
      }

      let totalETH = BigInt(0);
      let totalSovaBTC = BigInt(0);

      for (const wallet of allWallets) {
        try {
          const ethBalance = await web3.eth.getBalance(wallet.address);
          const sovaBTCBalance = await contract.methods.balanceOf(wallet.address).call();

          totalETH += BigInt(ethBalance);
          totalSovaBTC += BigInt(sovaBTCBalance);
        } catch (e) {
          logger.error('Error checking wallet status', { address: wallet.address, error: e.message });
        }
      }

      const mintedActive = activeWallets.wallets.filter(w => w.hasMinted).length;
      const unmintedActive = activeWallets.wallets.length - mintedActive;

      const statusDisplayMsg = `📊 *Wallet Status*

📁 *Active wallets:* ${activeWallets.wallets.length}
   • Belum mint: ${unmintedActive}
   • Sudah mint: ${mintedActive}

📦 *Archived wallets:* ${mintedWallets.wallets.length}
   (Sudah selesai semua proses)

📊 *Total:* ${allWallets.length} wallets

💰 *Total Balances (Active):*
ETH: ${web3.utils.fromWei(totalETH.toString(), 'ether')} ETH
sovaBTC: ${formatTokenAmount(totalSovaBTC.toString(), decimals)} sovaBTC

*Commands:*
/fundwallets - Fund semua wallet aktif
/mintall - Mint dari wallet yang belum mint
/collectall - Collect sovaBTC dari semua wallet
/collectgas - Collect ETH gas dari semua wallet
/archivecompleted - Pindahkan wallet selesai ke archive
      `;

      bot.sendMessage(chatId, statusDisplayMsg, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Wallet status error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });
}

module.exports = { registerWalletCommands };