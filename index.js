require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Web3 } = require('web3');
const fs = require('fs');

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

// Wallet Management Functions
const WALLET_FILE = 'wallet.json';

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
  
  return newWallets;
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;

  const welcomeMsg = `
🤖 *Sova BTC Mint Bot*

Halo ${username}! 👋

Bot ini untuk minting sovaBTC di Sova Testnet.

*📝 Single Wallet:*
/mint - Mint sovaBTC dari wallet utama
/balance - Cek ETH balance
/info - Info wallet & network

*🔥 Multi Wallet (Mass Minting):*
/createwallets <n> - Buat banyak wallet
/fundwallets - Kirim gas fee ke semua wallet
/mintall - Mint dari semua wallet
/collectall - Kumpulkan sovaBTC ke wallet utama
/walletstatus - Status semua wallet

/help - Bantuan lengkap

🔐 Your User ID: \`${msg.from.id}\`
  `;

  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  const helpMsg = `
📖 *Panduan Penggunaan*

*🪙 Single Mint:*
/mint → Mint sovaBTC dari wallet utama
/balance → Lihat ETH balance
/info → Info wallet & network

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

📊 /walletstatus
   Cek status & balance semua wallet

*❓ Tips:*
• wallet.json menyimpan private keys (JANGAN SHARE!)
• Pastikan wallet utama punya cukup ETH untuk gas
• Setiap address hanya bisa mint 1x
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
    
    const msg = `✅ *${count} Wallets Created!*

Total wallets: ${walletData.wallets.length}

*New addresses:*
${newWallets.slice(0, 5).map((w, i) => `${i + 1}. \`${w.address}\``).join('\n')}
${newWallets.length > 5 ? `\n_...dan ${newWallets.length - 5} lainnya_` : ''}

⚠️ Data disimpan di wallet.json
🔐 Jangan share private keys!
    `;
    
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  } catch (error) {
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
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    console.error('Fund error:', error);
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
      
      await bot.editMessageText(`⏳ Minting progress: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${wallet.address.slice(0, 10)}...`, {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });

      try {
        // Check if already minted
        const hasMinted = await contract.methods.hasMinted(wallet.address).call();
        if (hasMinted) {
          console.log(`Skipped ${wallet.address}: already minted`);
          skippedCount++;
          continue;
        }

        // Add wallet to web3 temporarily
        const tempAccount = web3.eth.accounts.privateKeyToAccount(wallet.privateKey);
        web3.eth.accounts.wallet.add(tempAccount);

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

        // Remove from web3 wallet
        web3.eth.accounts.wallet.remove(wallet.address);

      } catch (e) {
        console.error(`Failed to mint from ${wallet.address}:`, e.message);
        failCount++;
      }
    }

    saveWallets(walletData);

    const resultMsg = `✅ *Minting Complete!*

✅ Success: ${successCount}
⏭️ Skipped (already minted): ${skippedCount}
❌ Failed: ${failCount}

Total wallets: ${walletData.wallets.length}

Gunakan /collectall untuk kumpulkan sovaBTC
    `;

    bot.editMessageText(resultMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });

  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    console.error('Mint all error:', error);
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
    } catch (e) {}

    let totalCollected = BigInt(0);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < walletData.wallets.length; i++) {
      const wallet = walletData.wallets[i];
      
      await bot.editMessageText(`⏳ Collecting progress: ${i + 1}/${walletData.wallets.length}\n\nProcessing ${wallet.address.slice(0, 10)}...`, {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });

      try {
        // Check balance
        const balance = await contract.methods.balanceOf(wallet.address).call();
        
        if (BigInt(balance) === 0n) {
          console.log(`Skipped ${wallet.address}: no balance`);
          continue;
        }

        // Add wallet to web3 temporarily
        const tempAccount = web3.eth.accounts.privateKeyToAccount(wallet.privateKey);
        web3.eth.accounts.wallet.add(tempAccount);

        // Transfer to main wallet
        const transferMethod = contract.methods.transfer(account.address, balance.toString());
        const gasEstimate = await transferMethod.estimateGas({ from: wallet.address });
        const tx = await transferMethod.send({
          from: wallet.address,
          gas: Math.floor(Number(gasEstimate) * 1.2).toString()
        });

        console.log(`Collected ${formatTokenAmount(balance.toString(), decimals)} from ${wallet.address}: ${tx.transactionHash}`);
        totalCollected += BigInt(balance);
        successCount++;

        // Remove from web3 wallet
        web3.eth.accounts.wallet.remove(wallet.address);

      } catch (e) {
        console.error(`Failed to collect from ${wallet.address}:`, e.message);
        failCount++;
      }
    }

    const resultMsg = `✅ *Collection Complete!*

✅ Success: ${successCount}
❌ Failed: ${failCount}
💰 Total collected: ${formatTokenAmount(totalCollected.toString(), decimals)} sovaBTC

Main wallet: \`${account.address}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
    `;

    bot.editMessageText(resultMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    console.error('Collect all error:', error);
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
    } catch (e) {}

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

    const statusMsg = `📊 *Wallet Status*

Total wallets: ${walletData.wallets.length}
Minted: ${mintedCount}
Not minted: ${walletData.wallets.length - mintedCount}

💰 *Total Balances:*
ETH: ${web3.utils.fromWei(totalETH.toString(), 'ether')} ETH
sovaBTC: ${formatTokenAmount(totalSovaBTC.toString(), decimals)} sovaBTC

*Commands:*
/fundwallets - Fund all wallets
/mintall - Mint from all wallets
/collectall - Collect to main wallet
    `;

    bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' });

  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    console.error('Status error:', error);
  }
});

// Handle unknown commands
bot.on('message', (msg) => {
  const text = msg.text;

  if (!text || !text.startsWith('/')) return;
  if (text.startsWith('/start') || text.startsWith('/help') || 
      text.startsWith('/mint') || text.startsWith('/balance') || 
      text.startsWith('/info') || text.startsWith('/createwallets') ||
      text.startsWith('/fundwallets') || text.startsWith('/mintall') ||
      text.startsWith('/collectall') || text.startsWith('/walletstatus')) return;

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
