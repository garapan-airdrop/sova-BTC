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
/mint - Mint sovaBTC dari wallet utama
/balance - Cek ETH & sovaBTC balance
/info - Info wallet & network
/transfer <address> <amount> - Transfer sovaBTC

*🔥 Multi Wallet (Mass Minting):*
/createwallets <n> - Buat banyak wallet (max 100)
/fundwallets - Kirim gas fee ke semua wallet
/mintall - Mint dari semua wallet otomatis
/collectall - Kumpulkan sovaBTC ke wallet utama
/collectgas - Kumpulkan sisa ETH ke wallet utama
/walletstatus - Status & balance semua wallet

*📋 Daily Check-in System:*
/checkin - Daily check-in untuk rewards
/checkinall - Mass check-in dari semua wallet

*🌉 Bridge (Sepolia → Sova):*
/bridgeinfo - Info bridge & Sepolia balance
/bridge <amount> - Bridge ETH ke Sova Sepolia
/bridgestatus <txhash> - Track bridge transaction

*🏦 Sova Prime Vault:*
/vaultinfo - Info vault & your position
/vaultdeposit <amount> - Deposit spBTC untuk earn yield
/vaultwithdraw <shares> - Withdraw dari vault

*🚰 Faucet Management:*
/faucet - Claim sovaBTC (testing user flow)

*❓ Bantuan:*
/help - Panduan lengkap semua command

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
1. Ketik /faucet
2. Kirimkan alamat wallet EVM Anda
3. Terima sovaBTC gratis!

*📋 Aturan:*
• Maksimal 1 klaim per hari
• Reset setiap hari jam 00:00 WIB
• Alamat harus valid (format 0x...)

/help - Panduan lengkap
/faucet - Mulai claim token

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
/mint → Mint sovaBTC dari wallet utama
   • Setiap wallet hanya bisa mint 1x
   • Auto-check MAX_SUPPLY & eligibility
   • Membutuhkan ETH untuk gas fee

/balance → Lihat ETH & sovaBTC balance
   • Menampilkan balance wallet utama
   • Explorer link tersedia

/info → Info wallet & network detail
   • Alamat wallet, RPC URL, Contract address
   • Link ke blockchain explorer

/transfer <address> <amount> → Transfer sovaBTC
   • Amount dalam sovaBTC (bukan wei)
   • Support desimal (0.5, 1.25, dll)
   • Auto-validasi alamat & balance
   • Contoh: \`/transfer 0x742d35...f0bEb 5\`

*🔥 Mass Minting (Multi Wallet):*
/createwallets <jumlah> → Buat banyak wallet
   • Max: 100 wallets per batch
   • Auto-save ke wallet.json (encrypted)
   • Wallet dibuat dengan private key random
   • Contoh: \`/createwallets 10\`

/fundwallets → Kirim gas fee ke semua wallet
   • Transfer 0.001 ETH per wallet
   • Dari wallet utama ke semua wallet
   • Skip wallet yang sudah funded

/mintall → Mass mint dari semua wallet
   • Mint otomatis dari wallet yang eligible
   • Skip wallet yang sudah mint
   • Skip wallet tanpa gas fee
   • Progress tracking real-time

/collectall → Kumpulkan sovaBTC ke wallet utama
   • Collect dari semua wallet
   • 5% creator reward otomatis
   • Skip wallet dengan 0 balance

/collectgas → Kumpulkan ETH ke wallet utama
   • Collect sisa gas dari semua wallet
   • 5% creator reward otomatis
   • Minimal 0.0001 ETH per wallet

/archivecompleted → Pindahkan wallet yang sudah selesai ke archive

/walletstatus → Status semua wallet
   • ETH & sovaBTC balance
   • Mint status (✅ minted / ❌ not minted)
   • Summary total balance

*🔐 Backup & Recovery:*
/listbackups → List semua wallet backups
   • Auto-backup setiap kali save
   • Keep 5 backup terakhir
   • Show date & size

/restorebackup <number> → Restore dari backup
   • Restore wallet.json dari backup
   • Requires confirmation
   • Contoh: \`/restorebackup 1\`

*📋 Daily Check-in System:*
/checkin → Daily check-in untuk rewards
   • 1x per hari per wallet
   • Earn points dari API Sova
   • Reset otomatis 00:00 WIB

/checkinall → Mass check-in semua wallet
   • Check-in otomatis dari semua wallet
   • Skip wallet yang sudah check-in hari ini
   • Progress tracking real-time

*🌉 Bridge (Sepolia → Sova):*
/bridgeinfo → Info bridge & Sepolia balance
   • Cek saldo ETH Sepolia Anda
   • Info contract bridge
   • Perkiraan gas fee

/bridge <amount> → Bridge ETH ke Sova Sepolia
   • Kirim jumlah ETH dari Sepolia ke Sova
   • Membutuhkan gas fee di Sepolia
   • Contoh: \`/bridge 0.1\`

/bridgestatus <txhash> → Track bridge transaction
   • Cek status transaksi bridge Anda
   • Inputkan TX Hash dari Sepolia
   • Contoh: \`/bridgestatus 0xabc...xyz\`

*🏦 Sova Prime Vault (Earn Yield):*
/vaultinfo → Info vault & your position
   • Total assets & shares di vault
   • Share value (exchange rate)
   • Your vault balance

/vaultdeposit <amount> → Deposit spBTC ke vault
   • Deposit untuk earn yield otomatis
   • ERC-4626 standard vault
   • Market-neutral BTC strategies
   • Contoh: \`/vaultdeposit 1.5\`

/vaultwithdraw <shares> → Withdraw dari vault
   • Redeem shares untuk spBTC
   • Withdraw kapan saja (permissionless)
   • Contoh: \`/vaultwithdraw 1.5\`

*🚰 Faucet Management:*
/faucet → Claim sovaBTC (test user flow)
   • Untuk testing pengalaman user
   • Subject to daily limit (1x per hari)
      `;

      const adminHelpMsg2 = `
*🔗 Documentation & Links:*
• Sova Prime: https://docs.sova.io/sova-prime
• Explorer: https://explorer.testnet.sova.io

*❓ Tips & Best Practices:*
• wallet.json menyimpan private keys (KEEP PRIVATE!)
• claims.json tracking klaim user harian
• checkins.json tracking check-in data
• Wallet utama harus punya ETH untuk:
  - Gas fee saat /mint atau /transfer
  - Fund wallets saat /fundwallets
• Setiap wallet hanya bisa mint 1x (contract rule)
• Creator reward (5%) otomatis saat collect

*⚠️ Security Notes:*
• Jangan share wallet.json dengan siapapun
• Backup wallet.json secara berkala
• Keep Repl private (jangan publish)
• ALLOWED_USERS sudah di-set untuk security
      `;

      bot.sendMessage(chatId, adminHelpMsg, { parse_mode: 'Markdown' })
        .then(() => {
          return bot.sendMessage(chatId, adminHelpMsg2, { parse_mode: 'Markdown' });
        })
        .catch(err => {
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
   • Format: 0x... (42 karakter)
   • Contoh: \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`

4️⃣ Bot akan memproses dan mengirim token
   • Anda akan menerima sovaBTC secara otomatis
   • Tx Hash akan dikirimkan sebagai bukti

*📋 Aturan & Batasan:*
• ✅ Maksimal 1 klaim per hari per user
• ✅ Reset otomatis setiap hari jam 00:00 WIB
• ✅ Alamat harus valid (format EVM: 0x...)
• ✅ Gratis, tidak ada biaya untuk user
• ✅ Instant transfer setelah validasi

*📊 Tracking Klaim Anda:*
Setiap klaim akan tercatat:
• Tanggal & waktu klaim
• Alamat yang digunakan
• Transaction Hash (bukti)
• Total klaim yang sudah dilakukan

*💡 Tips & Best Practices:*
• Pastikan alamat yang dikirim BENAR
• Copy-paste alamat dari wallet Anda
• JANGAN ketik manual (risiko typo)
• Simpan Tx Hash sebagai bukti transaksi
• Tunggu konfirmasi dari bot
• Cek di Explorer jika perlu verifikasi

*❌ Error Umum & Solusi:*
• "Sudah claim hari ini" → Tunggu reset jam 00:00 WIB
• "Alamat tidak valid" → Periksa format alamat (0x...)
• "Gas fee tidak cukup" → Hubungi admin (masalah server)
• "Network error" → Coba lagi beberapa saat

*🔗 Network Info:*
• Network: Sova Testnet
• RPC: https://rpc.testnet.sova.io
• Explorer: https://explorer.testnet.sova.io
• Token: sovaBTC
• Contract: 0x5Db496debB227455cE9f482f9E443f1073a55456

*🎯 Supported Wallets:*
✅ MetaMask
✅ Trust Wallet
✅ Coinbase Wallet
✅ WalletConnect compatible wallets
✅ Semua wallet yang support EVM

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