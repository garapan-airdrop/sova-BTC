
const logger = require('../utils/logger');
const { loadWallets, loadMintedWallets, getAllWalletsForCheckin } = require('../services/walletService');
const { getProfile, performCheckIn, checkInStatus } = require('../services/checkinService');
const { formatAddress } = require('../utils/formatters');
const { MAX_CONCURRENT_OPERATIONS, TELEGRAM_UPDATE_INTERVAL } = require('../config/constants');

function createConcurrencyLimiter(limit) {
  let running = 0;
  const queue = [];

  return async function(fn) {
    while (running >= limit) {
      await new Promise(resolve => queue.push(resolve));
    }

    running++;
    try {
      return await fn();
    } finally {
      running--;
      const resolve = queue.shift();
      if (resolve) resolve();
    }
  };
}

function registerCheckinCommands(bot, web3Service, authMiddleware) {
  const account = web3Service.getAccount();

  bot.onText(/\/checkin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Check-in command', { userId });

    try {
      const statusMsg = await bot.sendMessage(chatId, '⏳ Performing check-in for main wallet...');

      const result = await performCheckIn(account.address);

      if (result.success && result.data && result.data.success) {
        const msg = `✅ *Check-In Berhasil!*

💰 Points Awarded: +${result.data.pointsAwarded}
📊 Total Points: ${result.data.totalPoints}
🔥 Streak: ${result.data.streak} hari
📅 Next Check-In: ${new Date(result.data.nextCheckIn).toLocaleString('id-ID')}

Wallet: \`${account.address}\`
        `;
        bot.editMessageText(msg, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
      } else {
        // If check-in fails, check status to see why
        const status = await checkInStatus(account.address);
        if (status && !status.canCheckIn) {
          const msg = `⏰ *Sudah Check-In Hari Ini*

📊 Total Points: ${status.totalPoints}
🔥 Streak: ${status.streak} hari
⏭️ Next Check-In: ${status.nextCheckIn ? new Date(status.nextCheckIn).toLocaleString('id-ID') : 'Soon'}
📅 Last Check-In: ${new Date(status.lastCheckIn).toLocaleString('id-ID')}

Wallet: \`${account.address}\`
          `;
          bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          });
        } else {
          bot.editMessageText(`❌ Check-in gagal: ${result.error || JSON.stringify(result.data) || 'Unknown error'}`, {
            chat_id: chatId,
            message_id: statusMsg.message_id
          });
        }
      }
    } catch (error) {
      logger.error('Check-in error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/checkinall/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Check-in all command', { userId });

    try {
      const allWallets = await getAllWalletsForCheckin();

      if (allWallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      const statusMsg = await bot.sendMessage(chatId, 
        `⏳ Performing check-in for ${allWallets.length} wallets...\n\nPreparing...`
      );

      logger.disableConsole();
      
      const terminal = require('../utils/terminal');
      terminal.printSection(`✅ DAILY CHECK-IN FOR ${allWallets.length} WALLETS`);
      const spinner = terminal.createSpinner('Initializing check-in...');
      spinner.start();

      let successCount = 0;
      let alreadyCheckedCount = 0;
      let failCount = 0;
      let totalPoints = 0;

      const limiter = createConcurrencyLimiter(MAX_CONCURRENT_OPERATIONS);
      let processedCount = 0;
      let lastUpdateCount = 0;

      const checkinTasks = allWallets.map((wallet, index) => 
        limiter(async () => {
          try {
            const result = await performCheckIn(wallet.address);

            if (result.success && result.data && result.data.success) {
              spinner.succeed(terminal.colors.success(`✓ ${processedCount + 1}/${allWallets.length} ${formatAddress(wallet.address)} → +${result.data.pointsAwarded} pts`));
              spinner.start();
              successCount++;
              totalPoints += result.data.pointsAwarded;
            } else {
              const status = await checkInStatus(wallet.address);
              if (status && !status.canCheckIn) {
                spinner.warn(terminal.colors.warning(`⊘ ${processedCount + 1}/${allWallets.length} ${formatAddress(wallet.address)} - Already checked in`));
                spinner.start();
                alreadyCheckedCount++;
              } else {
                spinner.fail(terminal.colors.error(`✗ ${processedCount + 1}/${allWallets.length} ${formatAddress(wallet.address)}`));
                spinner.start();
                failCount++;
              }
            }

          } catch (e) {
            spinner.fail(terminal.colors.error(`✗ ${processedCount + 1}/${allWallets.length} ${formatAddress(wallet.address)}`));
            spinner.start();
            failCount++;
          } finally {
            processedCount++;

            if (processedCount - lastUpdateCount >= TELEGRAM_UPDATE_INTERVAL || processedCount === allWallets.length) {
              terminal.printProgressBar(processedCount, allWallets.length, `📅 Check-In Progress`);

              bot.editMessageText(
                `✅ Check-In: ${processedCount}/${allWallets.length}\n\n✅ ${successCount} | ⏭️ ${alreadyCheckedCount} | ❌ ${failCount}\n\n${terminal.createProgressBarText(processedCount, allWallets.length)}`,
                { chat_id: chatId, message_id: statusMsg.message_id }
              ).catch(() => {});

              lastUpdateCount = processedCount;
            }
          }
        })
      );

      await Promise.all(checkinTasks);

      spinner.stop();
      logger.enableConsole();
      terminal.printSummary('CHECK-IN COMPLETE', successCount, failCount, alreadyCheckedCount);

      const resultMsg = `✅ *Check-In Complete!*

✅ Success: ${successCount}
⏭️ Already Checked: ${alreadyCheckedCount}
❌ Failed: ${failCount}
💰 Total Points Earned: +${totalPoints}

🔁 Gunakan /checkinstatus untuk detail
      `;

      bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      logger.error('Check-in all error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/checkinwallet (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const walletAddress = match[1].trim();

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Check-in wallet command', { userId, walletAddress });

    // Validate address format
    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      bot.sendMessage(chatId, `❌ *Format address tidak valid!*

*Penggunaan:*
\`/checkinwallet <wallet_address>\`

*Contoh:*
\`/checkinwallet 0x3FAD363a36A7d89D93C6a478BbF18B53191145F2\`
      `, { parse_mode: 'Markdown' });
      return;
    }

    try {
      const statusMsg = await bot.sendMessage(chatId, `⏳ Performing check-in for wallet...\n\n\`${walletAddress}\``);

      const result = await performCheckIn(walletAddress);

      if (result.success && result.data && result.data.success) {
        const msg = `✅ *Check-In Berhasil!*

💰 Points Awarded: +${result.data.pointsAwarded}
📊 Total Points: ${result.data.totalPoints}
🔥 Streak: ${result.data.streak} hari
📅 Next Check-In: ${new Date(result.data.nextCheckIn).toLocaleString('id-ID')}

Wallet: \`${walletAddress}\`
        `;
        bot.editMessageText(msg, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
      } else {
        // If check-in fails, check status to see why
        const status = await checkInStatus(walletAddress);
        if (status && !status.canCheckIn) {
          const msg = `⏰ *Sudah Check-In Hari Ini*

📊 Total Points: ${status.totalPoints}
🔥 Streak: ${status.streak} hari
⏭️ Next Check-In: ${status.nextCheckIn ? new Date(status.nextCheckIn).toLocaleString('id-ID') : 'Soon'}
📅 Last Check-In: ${new Date(status.lastCheckIn).toLocaleString('id-ID')}

Wallet: \`${walletAddress}\`
          `;
          bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          });
        } else {
          bot.editMessageText(`❌ Check-in gagal: ${result.error || JSON.stringify(result.data) || 'Unknown error'}`, {
            chat_id: chatId,
            message_id: statusMsg.message_id
          });
        }
      }
    } catch (error) {
      logger.error('Check-in wallet error', { userId, walletAddress, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/\/checkinstatus/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!authMiddleware.isAuthorized(userId)) {
      bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
      return;
    }

    logger.info('Check-in status command', { userId });

    try {
      const activeWallets = await loadWallets();
      const mintedWallets = await loadMintedWallets();
      const allWallets = [...activeWallets.wallets, ...mintedWallets.wallets];

      if (allWallets.length === 0) {
        bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
        return;
      }

      const statusMsg = await bot.sendMessage(chatId, 
        `⏳ Checking status for ${allWallets.length} wallets...`
      );

      let totalPoints = 0;
      let canCheckInCount = 0;
      let checkedTodayCount = 0;
      let totalStreak = 0;

      for (const wallet of allWallets) {
        try {
          const status = await checkInStatus(wallet.address);
          if (status) {
            totalPoints += status.totalPoints || 0;
            totalStreak += status.streak || 0;
            if (status.canCheckIn) {
              canCheckInCount++;
            } else {
              checkedTodayCount++;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
          logger.error('Error checking status', { address: wallet.address, error: e.message });
        }
      }

      const avgStreak = allWallets.length > 0 ? (totalStreak / allWallets.length).toFixed(1) : 0;

      const statusDisplayMsg = `📊 *Check-In Status*

📁 Active wallets: ${activeWallets.wallets.length}
🎯 Minted wallets: ${mintedWallets.wallets.length}
📊 Total wallets: ${allWallets.length}

✅ Checked today: ${checkedTodayCount}
⏰ Can check-in: ${canCheckInCount}

💰 *Total Points:* ${totalPoints}
🔥 *Average Streak:* ${avgStreak} hari

*Commands:*
/checkin - Check-in main wallet
/checkinwallet <address> - Check-in specific wallet
/checkinall - Check-in all wallets
/checkinstatus - Status semua wallet
      `;

      bot.editMessageText(statusDisplayMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      logger.error('Check-in status error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });
}

module.exports = { registerCheckinCommands };
