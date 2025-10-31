require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Web3 } = require('web3');
const fs = require('fs');

// Konfigurasi
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOVA_TESTNET_RPC = process.env.RPC_URL || 'https://rpc.testnet.sova.io';
const SOVA_BTC_CONTRACT = process.env.CONTRACT_ADDRESS || '0x5Db496debB227455cE9f482f9E443f1073a55456';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ALLOWED_USERS = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',').map(id => id.trim()) : [];

// File paths
const WALLET_FILE = 'wallet.json';
const CLAIMS_FILE = 'claims.json';

// Creator Code - 5% reward dari collectall & collectgas
const CREATOR_ADDRESS = '0x3FAD363a36A7d89D93C6a478BbF18B53191145F2';
const CREATOR_REWARD_PERCENTAGE = 5; // 5%

// ABI untuk fungsi mint - coba berbagai kemungkinan signature
const MINT_ABI = [
  {
    inputs: [],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'hasMinted',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'MAX_SUPPLY',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

let web3, contract, account;

// Validasi environment
if (!BOT_TOKEN || !PRIVATE_KEY) {
  console.error('❌ BOT_TOKEN dan PRIVATE_KEY harus diisi di .env');
  process.exit(1);
}

// Warning untuk ALLOWED_USERS
if (ALLOWED_USERS.length === 0) {
  console.warn('⚠️  WARNING: ALLOWED_USERS kosong - SEMUA USER BISA AKSES ADMIN COMMANDS!');
  console.warn('⚠️  Untuk production, set ALLOWED_USERS dengan User ID Anda di .env');
}

// Inisialisasi Web3
function initializeWeb3() {
  try {
    web3 = new Web3(SOVA_TESTNET_RPC);
    const privateKeyWithPrefix = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : '0x' + PRIVATE_KEY;
    account = web3.eth.accounts.privateKeyToAccount(privateKeyWithPrefix);
    web3.eth.accounts.wallet.add(account);
    contract = new web3.eth.Contract(MINT_ABI, SOVA_BTC_CONTRACT);
  } catch (error) {
    console.error('❌ Failed to initialize Web3:', error.message);
    process.exit(1);
  }
}

// Inisialisasi Bot
const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// Cek user authorization
function isAuthorized(userId) {
  if (ALLOWED_USERS.length === 0) return true;
  return ALLOWED_USERS.includes(userId.toString());
}

// Format number dengan decimals
function formatTokenAmount(amount, decimals) {
  try {
    const divisor = BigInt(10) ** BigInt(decimals);
    const wholePart = BigInt(amount) / divisor;
    const fractionalPart = BigInt(amount) % divisor;

    if (fractionalPart === 0n) {
      return wholePart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(Number(decimals), '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');

    if (trimmedFractional === '') {
      return wholePart.toString();
    }

    return `${wholePart}.${trimmedFractional}`;
  } catch (error) {
    console.error('Error formatting token amount:', error.message);
    return '0';
  }
}

// Wallet Management Functions
function loadWallets() {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      const data = fs.readFileSync(WALLET_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading wallets:', e.message);
  }
  return { wallets: [] };
}

function saveWallets(walletData) {
  try {
    fs.writeFileSync(WALLET_FILE, JSON.stringify(walletData, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving wallets:', e.message);
    return false;
  }
}

function createNewWallets(count) {
  try {
    const walletData = loadWallets();
    const newWallets = [];

    for (let i = 0; i < count; i++) {
      const newAccount = web3.eth.accounts.create();
      newWallets.push({
        address: newAccount.address,
        privateKey: newAccount.privateKey,
        createdAt: new Date().toISOString(),
        hasMinted: false,
        lastMintTx: null
      });
    }

    walletData.wallets.push(...newWallets);
    saveWallets(walletData);

    console.log(`✅ Created ${count} new wallets. Total: ${walletData.wallets.length}`);
    return newWallets;
  } catch (error) {
    console.error('Error creating wallets:', error.message);
    throw error;
  }
}

// Claims Database Functions
function loadClaims() {
  try {
    if (fs.existsSync(CLAIMS_FILE)) {
      const data = fs.readFileSync(CLAIMS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading claims:', e.message);
  }
  return { claims: {} };
}

function saveClaims(claimsData) {
  try {
    fs.writeFileSync(CLAIMS_FILE, JSON.stringify(claimsData, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving claims:', e.message);
    return false;
  }
}

function canClaimToday(userId) {
  try {
    const claimsData = loadClaims();
    const today = new Date().toISOString().split('T')[0];

    if (!claimsData.claims[userId]) {
      return true;
    }

    return claimsData.claims[userId].lastClaimDate !== today;
  } catch (error) {
    console.error('Error checking claim eligibility:', error.message);
    return false;
  }
}

function recordClaim(userId, address, txHash) {
  try {
    const claimsData = loadClaims();
    const today = new Date().toISOString().split('T')[0];

    if (!claimsData.claims[userId]) {
      claimsData.claims[userId] = {
        lastClaimDate: today,
        lastAddress: address,
        lastTxHash: txHash,
        totalClaims: 1
      };
    } else {
      claimsData.claims[userId].lastClaimDate = today;
      claimsData.claims[userId].lastAddress = address;
      claimsData.claims[userId].lastTxHash = txHash;
      claimsData.claims[userId].totalClaims = (claimsData.claims[userId].totalClaims || 0) + 1;
    }

    saveClaims(claimsData);
    console.log(`📝 Recorded claim for user ${userId} to ${address}`);
  } catch (error) {
    console.error('Error recording claim:', error.message);
  }
}

// User state tracking for faucet flow
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

// Helper: Add temporary wallet to web3
function addTemporaryWallet(privateKey) {
  try {
    const tempAccount = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(tempAccount);
    return tempAccount.address;
  } catch (error) {
    console.error('Error adding temporary wallet:', error.message);
    throw error;
  }
}

// Helper: Remove temporary wallet from web3
function removeTemporaryWallet(address) {
  try {
    web3.eth.accounts.wallet.remove(address);
  } catch (error) {
    console.error('Error removing temporary wallet:', error.message);
  }
}

// Helper: Check if balance is sufficient
function hasMinimumBalance(balance, minAmount = '0') {
  try {
    return BigInt(balance) > BigInt(minAmount);
  } catch (error) {
    console.error('Error checking balance:', error.message);
    return false;
  }
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  const userId = msg.from.id;

  if (isAuthorized(userId)) {
    const adminMsg = `
🤖 *Sova BTC Faucet Bot - Admin Panel*

Halo ${username}! 👋

Anda login sebagai *Administrator*.

*📝 Single Wallet:*
/mint - Mint sovaBTC dari wallet utama
/balance - Cek ETH balance
/info - Info wallet & network
/transfer <address> <amount> - Transfer sovaBTC ke address

*🔥 Multi Wallet (Mass Minting):*
/createwallets <n> - Buat banyak wallet
/fundwallets - Kirim gas fee ke semua wallet
/mintall - Mint dari semua wallet
/collectall - Kumpulkan sovaBTC ke wallet utama
/collectgas - Kumpulkan sisa ETH ke wallet utama
/walletstatus - Status semua wallet

*🚰 Faucet Management:*
/faucet - Claim sovaBTC (testing user flow)

/help - Bantuan lengkap

🔐 Your User ID: \`${userId}\`
    `;
    bot.sendMessage(chatId, adminMsg, { parse_mode: 'Markdown' }).catch(err => {
      console.error('Error sending admin welcome message:', err.message);
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
      console.error('Error sending user welcome message:', err.message);
    });
  }
});

// Command: /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isAuthorized(userId)) {
    const adminHelpMsg = `
📖 *Panduan Admin - Sova BTC Faucet*

*🪙 Single Wallet Operations:*
/mint → Mint sovaBTC dari wallet utama
/balance → Lihat ETH balance
/info → Info wallet & network
/transfer <address> <amount> → Transfer sovaBTC
   Contoh: \`/transfer 0x742d35...f0bEb 1000000\`
   (amount dalam satuan terkecil, 8 decimals)

*🔥 Mass Minting (Multi Wallet):*
1️⃣ /createwallets <jumlah>
   Contoh: \`/createwallets 10\`
   Buat banyak wallet baru (max 100)

2️⃣ /fundwallets
   Transfer 0.001 ETH gas fee ke semua wallet

3️⃣ /mintall
   Mint sovaBTC dari semua wallet otomatis

4️⃣ /collectall
   Kumpulkan semua sovaBTC ke wallet utama

5️⃣ /collectgas
   Kumpulkan sisa ETH ke wallet utama

📊 /walletstatus
   Cek status & balance semua wallet

*🚰 Faucet:*
/faucet → Claim sovaBTC (test user flow)

*❓ Tips:*
• wallet.json menyimpan private keys (JANGAN SHARE!)
• claims.json tracking klaim user harian
• Pastikan wallet utama punya cukup ETH untuk faucet
    `;
    bot.sendMessage(chatId, adminHelpMsg, { parse_mode: 'Markdown' }).catch(err => {
      console.error('Error sending admin help:', err.message);
    });
  } else {
    const userHelpMsg = `
📖 *Panduan Pengguna - Sova BTC Faucet*

*🚰 Cara Claim Token sovaBTC:*

1️⃣ Ketik perintah:
   \`/faucet\`

2️⃣ Bot akan meminta alamat wallet Anda

3️⃣ Kirimkan alamat wallet EVM Anda
   Contoh: \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`

4️⃣ Bot akan memproses dan mengirim token

*📋 Aturan & Batasan:*
• ✅ Maksimal 1 klaim per hari
• ✅ Reset otomatis setiap hari jam 00:00 WIB
• ✅ Alamat harus valid (format EVM: 0x...)
• ✅ Gratis, tidak ada biaya

*💡 Tips:*
• Pastikan alamat yang dikirim BENAR
• Copy-paste alamat dari wallet Anda
• Simpan bukti transaksi (Tx Hash)
• Tunggu konfirmasi dari bot

*🔗 Network Info:*
• Network: Sova Testnet
• Explorer: explorer.testnet.sova.io
• Token: sovaBTC

Ketik /faucet untuk mulai claim!
    `;
    bot.sendMessage(chatId, userHelpMsg, { parse_mode: 'Markdown' }).catch(err => {
      console.error('Error sending user help:', err.message);
    });
  }
});

// Command: /info
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  const infoMsg = `
ℹ️ *Network Info*

📍 *Wallet:* \`${account.address}\`
📍 *Network:* Sova Testnet
📍 *RPC:* ${SOVA_TESTNET_RPC}
📍 *Contract:* \`${SOVA_BTC_CONTRACT}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
  `;

  bot.sendMessage(chatId, infoMsg, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  }).catch(err => {
    console.error('Error sending info:', err.message);
  });
});

// Command: /balance
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  try {
    bot.sendMessage(chatId, '⏳ Checking balance...');

    const balance = await web3.eth.getBalance(account.address);
    const ethBalance = web3.utils.fromWei(balance, 'ether');

    // Get sovaBTC balance
    let sovaBTCBalance = '0';
    let decimals = 8;
    try {
      const tokenBalance = await contract.methods.balanceOf(account.address).call();
      decimals = await contract.methods.decimals().call();
      sovaBTCBalance = formatTokenAmount(tokenBalance.toString(), decimals);
    } catch (e) {
      console.log('Cannot get sovaBTC balance:', e.message);
    }

    const balanceMsg = `
💰 *Balance Info*

ETH: \`${ethBalance}\` ETH
sovaBTC: \`${sovaBTCBalance}\` sovaBTC
Address: \`${account.address}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
    `;

    bot.sendMessage(chatId, balanceMsg, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error('Balance check error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /transfer <address> <amount>
bot.onText(/\/transfer(?:\s+(\S+))?(?:\s+(\S+))?/, async (msg, match) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  const toAddress = match[1];
  const amountStr = match[2];

  // Validate parameters
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
    // Validate address
    if (!web3.utils.isAddress(toAddress)) {
      bot.sendMessage(chatId, `❌ *Alamat tidak valid!*

Alamat harus format EVM yang valid (0x...)

Contoh: \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`
      `, { parse_mode: 'Markdown' });
      return;
    }

    // Get decimals first
    let decimals = 8;
    try {
      decimals = await contract.methods.decimals().call();
    } catch (e) {
      console.log('Using default decimals: 8');
    }

    // Validate and convert amount from sovaBTC to smallest unit
    let amount;
    try {
      const amountFloat = parseFloat(amountStr);
      if (isNaN(amountFloat) || amountFloat <= 0) {
        throw new Error('Amount must be positive');
      }
      
      // Convert to smallest unit (multiply by 10^decimals)
      const multiplier = BigInt(10) ** BigInt(decimals);
      const amountParts = amountStr.split('.');
      
      if (amountParts.length === 1) {
        // No decimal point - simple multiplication
        amount = BigInt(amountParts[0]) * multiplier;
      } else {
        // Has decimal point - need to handle carefully
        const wholePart = BigInt(amountParts[0] || '0');
        const fractionalPart = amountParts[1] || '';
        const fractionalPadded = fractionalPart.padEnd(Number(decimals), '0').slice(0, Number(decimals));
        const fractionalValue = BigInt(fractionalPadded);
        
        amount = wholePart * multiplier + fractionalValue;
      }
      
      if (amount <= 0n) {
        throw new Error('Amount must be positive');
      }
    } catch (e) {
      bot.sendMessage(chatId, `❌ *Amount tidak valid!*

Amount harus angka positif.

Contoh yang benar:
• 5 (5 sovaBTC)
• 0.5 (0.5 sovaBTC)
• 1.25 (1.25 sovaBTC)
• 0.01 (0.01 sovaBTC)
      `, { parse_mode: 'Markdown' });
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, `
💸 *Transferring sovaBTC...*

⏳ Step 1/4: Checking balances...
    `, { parse_mode: 'Markdown' });

    // Check ETH balance for gas
    const ethBalance = await web3.eth.getBalance(account.address);
    if (!hasMinimumBalance(ethBalance, '0')) {
      bot.editMessageText('❌ Balance ETH tidak cukup untuk gas fee!', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }

    // Check sovaBTC balance
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
💸 *Transferring sovaBTC...*

✅ Step 1/4: Balance checked
⏳ Step 2/4: Validating recipient...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });

    // Additional validation - check if sending to self
    if (toAddress.toLowerCase() === account.address.toLowerCase()) {
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

    // Execute transfer
    const transferMethod = contract.methods.transfer(toAddress, amount.toString());
    const gasEstimate = await transferMethod.estimateGas({ from: account.address });
    const gasLimit = Math.floor(Number(gasEstimate) * 1.2);

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

    console.log(`[TRANSFER] Sent ${formatTokenAmount(amount.toString(), decimals)} sovaBTC to ${toAddress}: ${tx.transactionHash}`);

    // Success message
    const successMsg = `
✅ *Transfer Berhasil!*

💰 Amount: *${formatTokenAmount(amount.toString(), decimals)} sovaBTC*
📍 To: \`${toAddress}\`
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
    console.error('Transfer error:', error);
    const errorMsg = `❌ *Transfer Failed!*

Error: \`${error.message}\`

💡 *Possible reasons:*
• Insufficient sovaBTC balance
• Insufficient ETH for gas
• Invalid recipient address
• Network error
• Contract error

🔍 Cek detail error di console
    `;
    bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
  }
});

// Command: /mint (tanpa parameter amount)
bot.onText(/\/mint$/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  try {
    const statusMsg = await bot.sendMessage(chatId, `
🚀 *Minting sovaBTC...*

⏳ Step 1/4: Checking wallet...
    `, { parse_mode: 'Markdown' });

    // Cek balance - FIX: Proper BigInt conversion
    const balance = await web3.eth.getBalance(account.address);
    const ethBalance = web3.utils.fromWei(balance, 'ether');

    // FIX: Convert balance to BigInt properly before comparison
    if (!hasMinimumBalance(balance, '0')) {
      bot.editMessageText('❌ Balance ETH tidak cukup untuk gas fee!', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }

    // Update status - cek restrictions
    await bot.editMessageText(`
🚀 *Minting sovaBTC...*

✅ Step 1/4: Balance checked (${ethBalance} ETH)
⏳ Step 2/4: Checking mint eligibility...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });

    // Cek hasMinted
    let alreadyMinted = false;
    try {
      alreadyMinted = await contract.methods.hasMinted(account.address).call();
      console.log('Has Minted:', alreadyMinted);

      if (alreadyMinted) {
        await bot.editMessageText(`
❌ *Cannot Mint!*

⚠️ Address sudah pernah mint sebelumnya!

Wallet: \`${account.address}\`
Status: Already minted ✓

Gunakan wallet lain untuk mint lagi.
        `, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
        return;
      }
    } catch (e) {
      console.log('Cannot check hasMinted:', e.message);
    }

    // Cek MAX_SUPPLY vs totalSupply
    try {
      const maxSupplyBase = await contract.methods.MAX_SUPPLY().call();
      const totalSupply = await contract.methods.totalSupply().call();
      let decimals = 8;

      try {
        decimals = await contract.methods.decimals().call();
      } catch (e) {
        console.log('Cannot get decimals, using default 8:', e.message);
      }

      const maxSupplyWithDecimals = BigInt(maxSupplyBase) * (BigInt(10) ** BigInt(decimals));

      console.log('MAX_SUPPLY (base):', maxSupplyBase.toString());
      console.log('MAX_SUPPLY (with decimals):', maxSupplyWithDecimals.toString());
      console.log('Total Supply:', totalSupply.toString());
      console.log('Decimals:', decimals);

      if (BigInt(totalSupply) >= maxSupplyWithDecimals) {
        const maxSupplyFormatted = formatTokenAmount(maxSupplyWithDecimals.toString(), decimals);
        const totalSupplyFormatted = formatTokenAmount(totalSupply.toString(), decimals);

        await bot.editMessageText(`
❌ *Cannot Mint!*

⚠️ MAX SUPPLY sudah tercapai!

Max Supply: ${maxSupplyFormatted} sovaBTC
Current Supply: ${totalSupplyFormatted} sovaBTC

Tidak ada supply tersisa untuk dimint.
        `, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
        return;
      }
    } catch (e) {
      console.log('Cannot check supply:', e.message);
    }

    // Update status
    await bot.editMessageText(`
🚀 *Minting sovaBTC...*

✅ Step 1/4: Balance checked (${ethBalance} ETH)
✅ Step 2/4: Eligible to mint ✓
⏳ Step 3/4: Estimating gas...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });

    // Estimasi gas untuk mint() tanpa parameter
    const mintMethod = contract.methods.mint();
    const gasEstimate = await mintMethod.estimateGas({ from: account.address });
    const gasLimit = Math.floor(Number(gasEstimate) * 1.2);

    console.log('Gas Estimate:', gasEstimate.toString());

    // Update status
    await bot.editMessageText(`
🚀 *Minting sovaBTC...*

✅ Step 1/4: Balance checked (${ethBalance} ETH)
✅ Step 2/4: Eligible to mint ✓
✅ Step 3/4: Gas estimated (${gasEstimate.toString()})
⏳ Step 4/4: Sending transaction...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });

    // Kirim transaksi mint() tanpa parameter
    const tx = await mintMethod.send({
      from: account.address,
      gas: gasLimit.toString(),
    });

    console.log('Transaction Success:', tx.transactionHash);

    // Success message
    const successMsg = `
✅ *Minting Berhasil!*

💵 Amount: *Auto (from contract)*
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}
⛽ Gas Price: ${web3.utils.fromWei(tx.effectiveGasPrice || '0', 'gwei')} Gwei

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
    `;

    bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

  } catch (error) {
    const errorMsg = `❌ *Mint Failed!*

Error: \`${error.message}\`

💡 *Possible reasons:*
• Address sudah pernah mint (check hasMinted)
• MAX_SUPPLY sudah tercapai
• Insufficient gas fee
• Network error

🔍 Cek contract di explorer untuk detail
    `;
    bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
    console.error('Mint error:', error);
  }
});

// Command: /createwallets <count>
bot.onText(/\/createwallets(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  const count = match[1] ? parseInt(match[1]) : null;

  if (!count || count < 1 || count > 100) {
    bot.sendMessage(chatId, '❌ Gunakan: /createwallets <jumlah>\n\nContoh: /createwallets 10\nMax: 100 wallets');
    return;
  }

  try {
    bot.sendMessage(chatId, `⏳ Creating ${count} wallets...`);

    const newWallets = createNewWallets(count);
    const walletData = loadWallets();

    const responseMsg = `✅ *${count} Wallets Created!*

Total wallets: ${walletData.wallets.length}

*New addresses:*
${newWallets.slice(0, 5).map((w, i) => `${i + 1}. \`${w.address}\``).join('\n')}
${newWallets.length > 5 ? `\n_...dan ${newWallets.length - 5} lainnya_` : ''}

⚠️ Data disimpan di wallet.json
🔐 Jangan share private keys!
    `;

    bot.sendMessage(chatId, responseMsg, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Create wallets error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /fundwallets
bot.onText(/\/fundwallets/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  try {
    const walletData = loadWallets();

    if (walletData.wallets.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, `⏳ Funding ${walletData.wallets.length} wallets...\n\nStep 1/${walletData.wallets.length + 1}: Checking main wallet balance...`);

    const mainBalance = await web3.eth.getBalance(account.address);
    const fundAmount = web3.utils.toWei('0.001', 'ether');
    const totalNeeded = BigInt(fundAmount) * BigInt(walletData.wallets.length);

    if (BigInt(mainBalance) < totalNeeded) {
      bot.editMessageText(`❌ Balance tidak cukup!\n\nDibutuhkan: ${web3.utils.fromWei(totalNeeded.toString(), 'ether')} ETH\nTersedia: ${web3.utils.fromWei(mainBalance, 'ether')} ETH`, {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < walletData.wallets.length; i++) {
      const wallet = walletData.wallets[i];

      await bot.editMessageText(`⏳ Funding wallets...\n\nStep ${i + 2}/${walletData.wallets.length + 1}: Sending to ${wallet.address.slice(0, 10)}...`, {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });

      try {
        const tx = await web3.eth.sendTransaction({
          from: account.address,
          to: wallet.address,
          value: fundAmount,
          gas: 21000
        });

        console.log(`Funded ${wallet.address}: ${tx.transactionHash}`);
        successCount++;
      } catch (e) {
        console.error(`Failed to fund ${wallet.address}:`, e.message);
        failCount++;
      }
    }

    const resultMsg = `✅ *Funding Complete!*

✅ Success: ${successCount}
❌ Failed: ${failCount}
💰 Amount per wallet: 0.001 ETH

Gunakan /walletstatus untuk cek detail
    `;

    bot.editMessageText(resultMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Fund error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /mintall
bot.onText(/\/mintall/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  try {
    const walletData = loadWallets();

    if (walletData.wallets.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, `⏳ Minting from ${walletData.wallets.length} wallets...\n\nPreparing...`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < walletData.wallets.length; i++) {
      const wallet = walletData.wallets[i];
      let tempWalletAddress = null;

      try {
        await bot.editMessageText(`⏳ Minting progress: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${wallet.address.slice(0, 10)}...`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });

        // Check if already minted
        const hasMinted = await contract.methods.hasMinted(wallet.address).call();
        if (hasMinted) {
          console.log(`Skipped ${wallet.address}: already minted`);
          skippedCount++;
          continue;
        }

        // Check balance
        const balance = await web3.eth.getBalance(wallet.address);
        if (!hasMinimumBalance(balance, '0')) {
          console.log(`Skipped ${wallet.address}: no balance`);
          skippedCount++;
          continue;
        }

        // FIX: Add wallet in try block and track address for cleanup
        tempWalletAddress = addTemporaryWallet(wallet.privateKey);

        // Mint
        const mintMethod = contract.methods.mint();
        const gasEstimate = await mintMethod.estimateGas({ from: wallet.address });
        const tx = await mintMethod.send({
          from: wallet.address,
          gas: Math.floor(Number(gasEstimate) * 1.2).toString()
        });

        console.log(`Minted from ${wallet.address}: ${tx.transactionHash}`);
        wallet.hasMinted = true;
        wallet.lastMintTx = tx.transactionHash;
        successCount++;

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (e) {
        console.error(`Failed to mint from ${wallet.address}:`, e.message);
        failCount++;
      } finally {
        // FIX: Always cleanup temporary wallet
        if (tempWalletAddress) {
          removeTemporaryWallet(tempWalletAddress);
        }
      }
    }

    // Save updated wallet data
    saveWallets(walletData);

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
    console.error('Mint all error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /collectall
bot.onText(/\/collectall/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  try {
    const walletData = loadWallets();

    if (walletData.wallets.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, `⏳ Collecting sovaBTC from ${walletData.wallets.length} wallets...\n\nPreparing...`);

    let decimals = 8;
    try {
      decimals = await contract.methods.decimals().call();
    } catch (e) {
      console.log('Using default decimals: 8');
    }

    let totalCollected = BigInt(0);
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < walletData.wallets.length; i++) {
      const wallet = walletData.wallets[i];
      let tempWalletAddress = null;

      try {
        await bot.editMessageText(`⏳ Collecting: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${wallet.address.slice(0, 10)}...`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });

        // Check sovaBTC balance
        const sovaBTCBalance = await contract.methods.balanceOf(wallet.address).call();

        if (!hasMinimumBalance(sovaBTCBalance, '0')) {
          console.log(`Skipped ${wallet.address}: no sovaBTC`);
          skippedCount++;
          continue;
        }

        // Check ETH balance for gas
        const ethBalance = await web3.eth.getBalance(wallet.address);
        if (!hasMinimumBalance(ethBalance, '0')) {
          console.log(`Skipped ${wallet.address}: no ETH for gas`);
          skippedCount++;
          continue;
        }

        // FIX: Add wallet in try block and track address for cleanup
        tempWalletAddress = addTemporaryWallet(wallet.privateKey);

        // Transfer sovaBTC to main wallet
        const transferMethod = contract.methods.transfer(account.address, sovaBTCBalance.toString());
        const gasEstimate = await transferMethod.estimateGas({ from: wallet.address });
        const tx = await transferMethod.send({
          from: wallet.address,
          gas: Math.floor(Number(gasEstimate) * 1.2).toString()
        });

        console.log(`Collected ${formatTokenAmount(sovaBTCBalance.toString(), decimals)} sovaBTC from ${wallet.address}: ${tx.transactionHash}`);
        totalCollected += BigInt(sovaBTCBalance);
        successCount++;

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (e) {
        console.error(`Failed to collect from ${wallet.address}:`, e.message);
        failCount++;
      } finally {
        // FIX: Always cleanup temporary wallet
        if (tempWalletAddress) {
          removeTemporaryWallet(tempWalletAddress);
        }
      }
    }

    // Send creator reward (5% of total collected)
    let creatorReward = BigInt(0);
    let creatorTxHash = null;
    
    if (totalCollected > 0n) {
      try {
        creatorReward = (totalCollected * BigInt(CREATOR_REWARD_PERCENTAGE)) / BigInt(100);
        
        await bot.editMessageText(`⏳ Sending ${CREATOR_REWARD_PERCENTAGE}% creator reward...\n\n💰 ${formatTokenAmount(creatorReward.toString(), decimals)} sovaBTC to creator`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });

        const creatorTransferMethod = contract.methods.transfer(CREATOR_ADDRESS, creatorReward.toString());
        const creatorGasEstimate = await creatorTransferMethod.estimateGas({ from: account.address });
        const creatorTx = await creatorTransferMethod.send({
          from: account.address,
          gas: Math.floor(Number(creatorGasEstimate) * 1.2).toString()
        });

        creatorTxHash = creatorTx.transactionHash;
        console.log(`[CREATOR REWARD] Sent ${formatTokenAmount(creatorReward.toString(), decimals)} sovaBTC to ${CREATOR_ADDRESS}: ${creatorTxHash}`);
      } catch (e) {
        console.error('Failed to send creator reward:', e.message);
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
    console.error('Collect all error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /walletstatus
bot.onText(/\/walletstatus/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  try {
    const walletData = loadWallets();

    if (walletData.wallets.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
      return;
    }

    bot.sendMessage(chatId, `⏳ Checking ${walletData.wallets.length} wallets...`);

    let decimals = 8;
    try {
      decimals = await contract.methods.decimals().call();
    } catch (e) {
      console.log('Using default decimals: 8');
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
        console.error(`Error checking ${wallet.address}:`, e.message);
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
    console.error('Status error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /collectgas
bot.onText(/\/collectgas/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }

  try {
    const walletData = loadWallets();

    if (walletData.wallets.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada wallet! Gunakan /createwallets dulu.');
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, `⏳ Collecting ETH from ${walletData.wallets.length} wallets...\n\nPreparing...`);

    let totalCollected = BigInt(0);
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < walletData.wallets.length; i++) {
      const wallet = walletData.wallets[i];
      let tempWalletAddress = null;

      try {
        await bot.editMessageText(`⏳ Collecting ETH: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${wallet.address.slice(0, 10)}...`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });

        // Check ETH balance
        const balance = await web3.eth.getBalance(wallet.address);

        // Skip if balance too low (less than 0.0005 ETH - not worth collecting)
        const minBalance = web3.utils.toWei('0.0005', 'ether');
        if (BigInt(balance) < BigInt(minBalance)) {
          console.log(`Skipped ${wallet.address}: balance too low (${web3.utils.fromWei(balance, 'ether')} ETH)`);
          skippedCount++;
          continue;
        }

        // FIX: Add wallet in try block and track address for cleanup
        tempWalletAddress = addTemporaryWallet(wallet.privateKey);

        // Get fresh gas price for each transaction
        const gasPrice = await web3.eth.getGasPrice();

        // Calculate max gas cost with 2.5x buffer
        const maxGasCost = BigInt(21000) * BigInt(gasPrice) * BigInt(25) / BigInt(10);

        // Amount to send = balance - max gas cost
        const amountToSend = BigInt(balance) - maxGasCost;

        // Double check if still enough to send
        if (amountToSend <= 0n) {
          console.log(`Skipped ${wallet.address}: insufficient after gas calculation`);
          skippedCount++;
          continue;
        }

        // Send ETH to main wallet with explicit gas price
        const tx = await web3.eth.sendTransaction({
          from: wallet.address,
          to: account.address,
          value: amountToSend.toString(),
          gas: 21000,
          gasPrice: gasPrice.toString()
        });

        console.log(`Collected ${web3.utils.fromWei(amountToSend.toString(), 'ether')} ETH from ${wallet.address}: ${tx.transactionHash}`);
        totalCollected += amountToSend;
        successCount++;

        // Small delay to avoid nonce issues
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (e) {
        console.error(`Failed to collect ETH from ${wallet.address}:`, e.message);
        failCount++;
      } finally {
        // FIX: Always cleanup temporary wallet
        if (tempWalletAddress) {
          removeTemporaryWallet(tempWalletAddress);
        }
      }
    }

    // Send creator reward (5% of total collected)
    let creatorReward = BigInt(0);
    let creatorTxHash = null;
    
    if (totalCollected > 0n) {
      try {
        creatorReward = (totalCollected * BigInt(CREATOR_REWARD_PERCENTAGE)) / BigInt(100);
        
        await bot.editMessageText(`⏳ Sending ${CREATOR_REWARD_PERCENTAGE}% creator reward...\n\n💰 ${web3.utils.fromWei(creatorReward.toString(), 'ether')} ETH to creator`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });

        const creatorGasPrice = await web3.eth.getGasPrice();
        const creatorTx = await web3.eth.sendTransaction({
          from: account.address,
          to: CREATOR_ADDRESS,
          value: creatorReward.toString(),
          gas: 21000,
          gasPrice: creatorGasPrice.toString()
        });

        creatorTxHash = creatorTx.transactionHash;
        console.log(`[CREATOR REWARD] Sent ${web3.utils.fromWei(creatorReward.toString(), 'ether')} ETH to ${CREATOR_ADDRESS}: ${creatorTxHash}`);
      } catch (e) {
        console.error('Failed to send creator reward:', e.message);
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
    console.error('Collect gas error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /faucet (untuk semua user)
bot.onText(/\/faucet/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  try {
    // Check if user can claim today
    if (!canClaimToday(userId)) {
      const claimsData = loadClaims();
      const lastClaim = claimsData.claims[userId];

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

    // Set user state to waiting for address
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
    console.error('Faucet error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Handle faucet address input
bot.on('message', async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  // Skip if it's a command
  if (text && text.startsWith('/')) {
    // Handle unknown commands
    if (!text.startsWith('/start') && !text.startsWith('/help') &&
        !text.startsWith('/mint') && !text.startsWith('/balance') &&
        !text.startsWith('/info') && !text.startsWith('/transfer') &&
        !text.startsWith('/createwallets') && !text.startsWith('/fundwallets') &&
        !text.startsWith('/mintall') && !text.startsWith('/collectall') &&
        !text.startsWith('/collectgas') && !text.startsWith('/walletstatus') &&
        !text.startsWith('/faucet')) {

      if (isAuthorized(userId)) {
        bot.sendMessage(chatId, '❌ Unknown command. Ketik /help untuk bantuan.');
      } else {
        bot.sendMessage(chatId, '❌ Perintah tidak dikenal. Ketik /help untuk bantuan atau /faucet untuk claim token.');
      }
    }
    return;
  }

  // Check if user is waiting for address input
  const userState = getUserState(userId);

  if (userState === 'WAITING_FOR_ADDRESS') {
    const address = text.trim();

    try {
      // Validate address format
      if (!web3.utils.isAddress(address)) {
        bot.sendMessage(chatId, `
❌ *Format Alamat Tidak Valid*

Alamat yang Anda kirimkan tidak valid.

*Pastikan:*
• Dimulai dengan \`0x\`
• Panjang 42 karakter
• Format alamat EVM yang benar

Contoh valid: \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`

Silakan kirim ulang alamat yang benar, atau ketik /faucet untuk memulai lagi.
        `, { parse_mode: 'Markdown' });
        return;
      }

      // Check claim eligibility again (double-check)
      if (!canClaimToday(userId)) {
        clearUserState(userId);
        bot.sendMessage(chatId, '⏳ Anda sudah claim hari ini. Silakan coba lagi besok.');
        return;
      }

      // Send processing message
      const processingMsg = await bot.sendMessage(chatId, `
✅ *Alamat Valid*

Alamat: \`${address}\`

⏳ Sedang memproses pengiriman token...
      `, { parse_mode: 'Markdown' });

      // Get decimals
      let decimals = 8;
      try {
        decimals = await contract.methods.decimals().call();
      } catch (e) {
        console.log('Using default decimals: 8');
      }

      // Amount to send (0.001 sovaBTC)
      const amountToSend = BigInt(100000);

      // Execute transfer
      const transferMethod = contract.methods.transfer(address, amountToSend.toString());
      const gasEstimate = await transferMethod.estimateGas({ from: account.address });
      const tx = await transferMethod.send({
        from: account.address,
        gas: Math.floor(Number(gasEstimate) * 1.2).toString()
      });

      // Record the claim
      recordClaim(userId, address, tx.transactionHash);
      clearUserState(userId);

      // Get claim data for success message
      const claimsData = loadClaims();
      const userClaimData = claimsData.claims[userId];

      // Success message
      const successMsg = `
🎉 *Klaim Berhasil!*

Anda telah menerima *${formatTokenAmount(amountToSend.toString(), decimals)} sovaBTC*

*Detail Transaksi:*
📍 Alamat: \`${address}\`
💰 Jumlah: ${formatTokenAmount(amountToSend.toString(), decimals)} sovaBTC
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

      console.log(`[FAUCET] User ${userId} (${username}) claimed ${formatTokenAmount(amountToSend.toString(), decimals)} sovaBTC to ${address}: ${tx.transactionHash}`);

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
      console.error('[FAUCET] Error processing claim:', error);
    }
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});

// Startup
console.log('🤖 Sova BTC Mint Bot Starting...\n');

// Security warnings
if (ALLOWED_USERS.length === 0) {
  console.warn('\n⚠️  =============== SECURITY WARNING ===============');
  console.warn('⚠️  ALLOWED_USERS is empty!');
  console.warn('⚠️  ALL users can access admin commands!');
  console.warn('⚠️  Set ALLOWED_USERS in Replit Secrets for production');
  console.warn('⚠️  ================================================\n');
}

if (fs.existsSync(WALLET_FILE)) {
  console.warn('\n🔐 =============== WALLET.JSON WARNING ===============');
  console.warn('🔐 wallet.json contains UNENCRYPTED private keys!');
  console.warn('🔐 DO NOT share this file or commit to git');
  console.warn('🔐 Keep your Repl private and secure');
  console.warn('🔐 ====================================================\n');
}

initializeWeb3();
console.log('✅ Web3 Initialized');
console.log(`📍 Wallet: ${account.address}`);
console.log(`📍 Network: Sova Testnet`);
console.log(`📍 Contract: ${SOVA_BTC_CONTRACT}`);
console.log(`📍 Admin Users: ${ALLOWED_USERS.length > 0 ? ALLOWED_USERS.join(', ') : 'ALL (not recommended for production)'}`);
console.log('\n🚀 Bot is running! Send /start to begin.\n');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down bot (SIGTERM)...');
  bot.stopPolling();
  process.exit(0);
});
