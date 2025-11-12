const logger = require('../utils/logger');
const { validateAddress } = require('../utils/validators');
const { formatTokenAmount } = require('../utils/formatters');
const { canClaimToday, recordClaim, getUserClaimData } = require('../services/claimsService');
const { FAUCET_AMOUNT, GAS_SAFETY_MARGIN, DEFAULT_DECIMALS } = require('../config/constants');

const userStates = {};

function setUserState(userId, state) {
  userStates[userId] = state;
}

function getUserState(userId) {
  return userStates[userId] || null;
}

function clearUserState(userId) {
  delete userStates[userId];
}

function registerPublicCommands(bot, web3Service, authMiddleware) {
  const web3 = web3Service.getWeb3();
  const contract = web3Service.getContract();
  const account = web3Service.getAccount();

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    const userId = msg.from.id;

    logger.info('Start command', { userId, username });

    if (authMiddleware.isAuthorized(userId)) {
      const adminMsg = `
🤖 *Sova BTC Faucet Bot - Admin Panel*

Halo ${username}! 👋

Anda login sebagai *Administrator*.

*📝 Single Wallet:*
• /mint - Mint sovaBTC dari wallet utama
• /balance - Cek ETH & sovaBTC balance
• /info - Info wallet & network
• /transfer <address> <amount> - Transfer sovaBTC

*🔥 Multi Wallet (Mass Minting):*
• /createwallets <n> - Buat banyak wallet (max 100)
• /fundwallets - Kirim gas fee ke semua wallet
• /mintall - Mint dari semua wallet otomatis
• /collectall - Kumpulkan sovaBTC ke wallet utama
• /collectgas - Kumpulkan sisa ETH ke wallet utama
• /walletstatus - Status & balance semua wallet

*📋 Daily Check-in System:*
• /checkin - Daily check-in untuk rewards
• /checkinall - Mass check-in dari semua wallet

*🌉 Bridge (Sepolia → Sova):*
• /bridgeinfo - Info bridge & Sepolia balance
• /bridge <amount> - Bridge ETH ke Sova Sepolia
• /bridgestatus <txhash> - Track bridge transaction

*🏦 Sova Prime Vault:*
• /vaultinfo - Info vault & your position
• /vaultdeposit <amount> - Deposit spBTC untuk earn yield
• /vaultwithdraw <shares> - Withdraw dari vault

*🚰 Faucet Management:*
• /faucet - Claim sovaBTC (testing user flow)

*❓ Bantuan:*
• /help - Panduan lengkap semua command

*📊 Quick Stats:*
• Wallet utama: \`${account.address.substring(0, 10)}...${account.address.substring(38)}\`
• Network: Sova Testnet
• Your User ID: \`${userId}\`

💡 Ketik /help untuk panduan detail
      `;
      bot.sendMessage(chatId, adminMsg, { parse_mode: 'Markdown' }).catch(err => {
        logger.error('Error sending admin welcome', { error: err.message });
      });
    } else {
      const userMsg = `
🤖 *Sova BTC Faucet Bot*

Halo ${username}! 👋

Selamat datang di Sova BTC Faucet!

*🚰 Cara Claim Token:*
1\\. Ketik /faucet
2\\. Kirimkan alamat wallet EVM Anda
3\\. Terima sovaBTC gratis!

*📋 Aturan:*
• Maksimal 1 klaim per hari
• Reset setiap hari jam 00:00 WIB
• Alamat harus valid (format 0x\\.\\.\\.)

*🎯 Command:*
• /help \\- Panduan lengkap
• /faucet \\- Mulai claim token

💡 User ID Anda: \`${userId}\`
      `;
      bot.sendMessage(chatId, userMsg, { parse_mode: 'Markdown' }).catch(err => {
        logger.error('Error sending user welcome', { error: err.message });
      });
    }
  });

  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    logger.info('Help command', { userId });

    if (authMiddleware.isAuthorized(userId)) {
      const adminHelpMsg = `
📖 *Panduan Admin - Sova BTC Faucet*

*🪙 Single Wallet Operations:*
• /mint → Mint sovaBTC dari wallet utama
• /balance → Lihat ETH & sovaBTC balance
• /info → Info wallet & network detail
• /transfer <address> <amount> → Transfer sovaBTC

*🔥 Mass Minting (Multi Wallet):*
• /createwallets <jumlah> → Buat banyak wallet
• /fundwallets → Kirim gas fee ke semua wallet
• /mintall → Mass mint dari semua wallet
• /collectall → Kumpulkan sovaBTC ke wallet utama
• /collectgas → Kumpulkan ETH ke wallet utama
• /archivecompleted → Pindahkan wallet yang sudah selesai ke archive
• /walletstatus → Status semua wallet

*🔐 Backup & Recovery:*
• /listbackups → List semua wallet backups
• /restorebackup <number> → Restore dari backup

*📋 Daily Check-in System:*
• /checkin → Daily check-in untuk rewards
• /checkinall → Mass check-in semua wallet

*🌉 Bridge (Sepolia → Sova):*
• /bridgeinfo → Info bridge & Sepolia balance
• /bridge <amount> → Bridge ETH ke Sova Sepolia
• /bridgestatus <txhash> → Track bridge transaction

*🏦 Sova Prime Vault (Earn Yield):*
• /vaultinfo → Info vault & your position
• /vaultdeposit <amount> → Deposit spBTC ke vault
• /vaultwithdraw <shares> → Withdraw dari vault

*🚰 Faucet Management:*
• /faucet → Claim sovaBTC (test user flow)

*🤖 AI Monitoring:*
• /errorstats → AI error monitoring stats

*🔧 Admin Commands:*
• /balance - Cek balance main wallet
• /checkbalance <address> - Cek balance specific address
• /health - Bot health check
• /errorstats - AI error monitoring stats
• /logs - View recent logs
      `;
      bot.sendMessage(chatId, adminHelpMsg, { parse_mode: 'Markdown' }).catch(err => {
        logger.error('Error sending admin help', { error: err.message });
      });
    } else {
      const userHelpMsg = `
📖 *Panduan Pengguna - Sova BTC Faucet*

*🚰 Cara Claim Token sovaBTC:*

1️⃣ Ketik perintah:
   \`/faucet\`

2️⃣ Bot akan meminta alamat wallet Anda

3️⃣ Kirimkan alamat wallet EVM Anda
   • Contoh: \`0xe0d5F80B06055Ec6d094d83413084DEcA8c160Bb\`

4️⃣ Bot akan memproses dan mengirim token
   • Anda akan menerima sovaBTC secara otomatis
   • Tx Hash akan dikirimkan sebagai bukti

Ketik /faucet untuk mulai claim sekarang! 🚀
      `;
      bot.sendMessage(chatId, userHelpMsg, { parse_mode: 'Markdown' }).catch(err => {
        logger.error('Error sending user help', { error: err.message });
      });
    }
  });

  bot.onText(/\/faucet/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    logger.info('Faucet command', { userId, username });

    try {
      if (!(await canClaimToday(userId))) {
        const lastClaim = await getUserClaimData(userId);

        bot.sendMessage(chatId, `
⏳ *Sudah Claim Hari Ini*

Halo ${username}, Anda sudah mengklaim token hari ini!

*Detail Klaim Terakhir:*
📅 Tanggal: ${lastClaim.lastClaimDate}
📍 Alamat: \`${lastClaim.lastAddress}\`
🔗 TX: \`${lastClaim.lastTxHash}\`
📊 Total Klaim: ${lastClaim.totalClaims}x

Silakan coba lagi besok setelah pukul 00:00 WIB untuk reset harian.

💡 Setiap user hanya bisa claim 1x per hari.
        `, { parse_mode: 'Markdown' });
        return;
      }

      setUserState(userId, 'WAITING_FOR_ADDRESS');

      bot.sendMessage(chatId, `
🚰 *Sova BTC Faucet - Claim Token*

Baik ${username}, mohon kirimkan *alamat wallet EVM* Anda untuk menerima sovaBTC.

*Format alamat yang valid:*
• Harus dimulai dengan \`0x\`
• Panjang 42 karakter
• Contoh: \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`

*Support Networks:*
✅ Sova Testnet
✅ Ethereum
✅ Base, Arbitrum, dll (EVM Compatible)

Silakan kirim alamat Anda sekarang:
      `, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Faucet error', { userId, error: error.message });
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });

  bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    if (text && text.startsWith('/')) {
      return;
    }

    const userState = getUserState(userId);

    if (userState === 'WAITING_FOR_ADDRESS') {
      const address = text.trim();

      try {
        const validation = validateAddress(web3, address);
        if (!validation.valid) {
          bot.sendMessage(chatId, `
❌ *Format Alamat Tidak Valid*

${validation.error}

*Pastikan:*
• Dimulai dengan \`0x\`
• Panjang 42 karakter
• Format alamat EVM yang benar

Contoh valid: \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`

Silakan kirim ulang alamat yang benar, atau ketik /faucet untuk memulai lagi.
          `, { parse_mode: 'Markdown' });
          return;
        }

        if (!(await canClaimToday(userId))) {
          clearUserState(userId);
          bot.sendMessage(chatId, '⏳ Anda sudah claim hari ini. Silakan coba lagi besok.');
          return;
        }

        const processingMsg = await bot.sendMessage(chatId, `
✅ *Alamat Valid*

Alamat: \`${validation.address}\`

⏳ Sedang memproses pengiriman token...
        `, { parse_mode: 'Markdown' });

        let decimals = DEFAULT_DECIMALS;
        try {
          decimals = await contract.methods.decimals().call();
        } catch (e) {
          logger.warn('Using default decimals', { decimals: DEFAULT_DECIMALS });
        }

        const transferMethod = contract.methods.transfer(
          validation.address, 
          FAUCET_AMOUNT.toString()
        );
        const gasEstimate = await transferMethod.estimateGas({ from: account.address });
        const tx = await transferMethod.send({
          from: account.address,
          gas: Math.floor(Number(gasEstimate) * GAS_SAFETY_MARGIN).toString()
        });

        await recordClaim(userId, validation.address, tx.transactionHash);
        clearUserState(userId);

        const userClaimData = await getUserClaimData(userId);

        const successMsg = `
🎉 *Klaim Berhasil!*

Anda telah menerima *${formatTokenAmount(FAUCET_AMOUNT.toString(), decimals)} sovaBTC*

*Detail Transaksi:*
📍 Alamat: \`${validation.address}\`
💰 Jumlah: ${formatTokenAmount(FAUCET_AMOUNT.toString(), decimals)} sovaBTC
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

🔗 [Lihat di Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})

*Informasi:*
✅ Token sudah dikirim ke wallet Anda
⏰ Claim berikutnya: Besok jam 00:00 WIB
👤 User: ${username}
📊 Total Klaim: ${userClaimData.totalClaims}x

Terima kasih telah menggunakan Sova BTC Faucet! 🚀
        `;

        bot.editMessageText(successMsg, {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });

        logger.info('Faucet claim successful', { 
          userId, 
          username, 
          address: validation.address, 
          txHash: tx.transactionHash 
        });

      } catch (error) {
        clearUserState(userId);

        const errorMsg = `
⚠️ *Terjadi Kegagalan*

Maaf, terjadi kegagalan saat mengirim transaksi.

*Error:* \`${error.message}\`

*Kemungkinan penyebab:*
• Gas fee tidak cukup di wallet faucet
• Jaringan sedang sibuk
• Kontrak error

Silakan coba lagi beberapa saat atau hubungi admin.
        `;

        bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
        logger.error('Faucet claim failed', { userId, error: error.message });
      }
    }
  });
}

module.exports = { registerPublicCommands };