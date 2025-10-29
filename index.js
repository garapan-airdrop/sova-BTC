require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Web3 } = require('web3');

// Konfigurasi
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOVA_TESTNET_RPC = process.env.RPC_URL || 'https://rpc.testnet.sova.io';
const SOVA_BTC_CONTRACT = process.env.CONTRACT_ADDRESS || '0x5Db496debB227455cE9f482f9E443f1073a55456';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ALLOWED_USERS = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [];

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
  }
];

let web3, contract, account;

// Validasi environment
if (!BOT_TOKEN || !PRIVATE_KEY) {
  console.error('❌ BOT_TOKEN dan PRIVATE_KEY harus diisi di .env');
  process.exit(1);
}

// Inisialisasi Web3
function initializeWeb3() {
  web3 = new Web3(SOVA_TESTNET_RPC);
  const privateKeyWithPrefix = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : '0x' + PRIVATE_KEY;
  account = web3.eth.accounts.privateKeyToAccount(privateKeyWithPrefix);
  web3.eth.accounts.wallet.add(account);
  contract = new web3.eth.Contract(MINT_ABI, SOVA_BTC_CONTRACT);
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
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;

  const welcomeMsg = `
🤖 *Sova BTC Mint Bot*

Halo ${username}! 👋

Bot ini untuk minting sovaBTC di Sova Testnet.

*📝 Commands:*
/mint - Mint sovaBTC (auto amount)

/balance - Cek ETH balance
/info - Info wallet & network
/help - Tampilkan bantuan

🔐 Your User ID: \`${msg.from.id}\`

⚠️ Note: Amount ditentukan oleh contract
  `;

  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  const helpMsg = `
📖 *Panduan Penggunaan*

*🪙 Mint sovaBTC:*
/mint

⚠️ Amount sudah ditentukan oleh contract
Tinggal ketik \`/mint\` dan tunggu proses selesai

*💰 Cek Balance:*
/balance → Lihat ETH balance

*ℹ️ Info Network:*
/info → Lihat info wallet & network

*❓ Tips:*
• Pastikan ada ETH untuk gas fee
• Transaksi butuh waktu beberapa detik
• Cek hasil di Sova Explorer
  `;

  bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
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

🔗 [View Explorer](https://explorer.testnet.sova.io/address/${account.address})
  `;

  bot.sendMessage(chatId, infoMsg, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true 
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

    const balanceMsg = `
💰 *Balance Info*

ETH: \`${ethBalance}\` ETH
Address: \`${account.address}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
    `;

    bot.sendMessage(chatId, balanceMsg, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true 
    });
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
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
    // Status awal
    const statusMsg = await bot.sendMessage(chatId, `
🚀 *Minting sovaBTC...*

⏳ Step 1/4: Checking wallet...
    `, { parse_mode: 'Markdown' });

    // Cek balance
    const balance = await web3.eth.getBalance(account.address);
    const ethBalance = web3.utils.fromWei(balance, 'ether');

    if (balance === 0n) {
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
      let decimals = 8; // Default BTC decimals
      
      try {
        decimals = await contract.methods.decimals().call();
      } catch (e) {
        console.log('Cannot get decimals, using default 8:', e.message);
      }
      
      // MAX_SUPPLY dari contract adalah base value, harus dikali 10^decimals
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

// Handle unknown commands
bot.on('message', (msg) => {
  const text = msg.text;

  if (!text || !text.startsWith('/')) return;
  if (text.startsWith('/start') || text.startsWith('/help') || 
      text.startsWith('/mint') || text.startsWith('/balance') || 
      text.startsWith('/info')) return;

  bot.sendMessage(msg.chat.id, '❌ Unknown command. Ketik /help untuk bantuan.');
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Startup
console.log('🤖 Sova BTC Mint Bot Starting...\n');
initializeWeb3();
console.log('✅ Web3 Initialized');
console.log(`📍 Wallet: ${account.address}`);
console.log(`📍 Network: Sova Testnet`);
console.log(`📍 Contract: ${SOVA_BTC_CONTRACT}`);
console.log('\n🚀 Bot is running! Send /start to begin.\n');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});
