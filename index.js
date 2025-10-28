require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Web3 } = require('web3');

// Konfigurasi
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOVA_TESTNET_RPC = process.env.RPC_URL || 'https://rpc.testnet.sova.io';
const SOVA_BTC_CONTRACT = process.env.CONTRACT_ADDRESS || '0xb5374db36960708bc582E4103C89F91d055Fc58B';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const ALLOWED_USERS = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [];

// Konfigurasi retry dan timeout
const MAX_RETRIES = 5;
const RETRY_DELAY = 3000; // 3 detik
const REQUEST_TIMEOUT = 90000; // 90 detik

// Extended ABI untuk fungsi mint, transfer, dan balanceOf
const TOKEN_ABI = [
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
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
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
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
];

let web3, contract, account;

// Validasi environment
if (!BOT_TOKEN || !PRIVATE_KEY || !WALLET_ADDRESS) {
  console.error('❌ BOT_TOKEN, PRIVATE_KEY, dan WALLET_ADDRESS harus diisi di .env');
  process.exit(1);
}

// Inisialisasi Web3 dengan provider yang lebih robust
function initializeWeb3() {
  const providerOptions = {
    timeout: REQUEST_TIMEOUT,
    keepAlive: true,
    withCredentials: false,
    headers: [
      {
        name: 'Content-Type',
        value: 'application/json'
      }
    ]
  };

  web3 = new Web3(new Web3.providers.HttpProvider(SOVA_TESTNET_RPC, providerOptions));

  const privateKeyWithPrefix = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : '0x' + PRIVATE_KEY;
  account = web3.eth.accounts.privateKeyToAccount(privateKeyWithPrefix);
  web3.eth.accounts.wallet.add(account);
  contract = new web3.eth.Contract(TOKEN_ABI, SOVA_BTC_CONTRACT);
}

// Advanced retry dengan exponential backoff
async function retryWithBackoff(fn, operationName = 'operation', maxRetries = MAX_RETRIES) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 ${operationName} - Attempt ${attempt}/${maxRetries}`);
      const result = await fn();
      console.log(`✅ ${operationName} - Success on attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      const isTimeout = error.code === 'ETIMEDOUT' || error.message.includes('timeout');
      const isNetworkError = error.type === 'system' || error.code === 'ECONNREFUSED';
      
      console.error(`❌ ${operationName} - Attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries && (isTimeout || isNetworkError)) {
        const backoffDelay = RETRY_DELAY * Math.pow(1.5, attempt - 1);
        console.log(`⏳ Waiting ${Math.round(backoffDelay/1000)}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        if (attempt % 2 === 0) {
          console.log('🔄 Reinitializing Web3 connection...');
          initializeWeb3();
        }
      } else if (attempt === maxRetries) {
        console.error(`💥 ${operationName} - All ${maxRetries} attempts failed`);
        throw lastError;
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

// Wrapper untuk operasi Web3 dengan timeout protection
async function web3Call(operation, timeoutMs = REQUEST_TIMEOUT) {
  return Promise.race([
    operation(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    )
  ]);
}

// Helper: Validasi alamat Ethereum
function isValidAddress(address) {
  return web3.utils.isAddress(address);
}

// Inisialisasi Bot
const bot = new TelegramBot(BOT_TOKEN, { 
  polling: {
    interval: 2000,
    autoStart: true,
    params: {
      timeout: 30
    }
  },
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4
    },
    timeout: 60000
  }
});

// Cek user authorization
function isAuthorized(userId) {
  if (ALLOWED_USERS.length === 0) return true;
  return ALLOWED_USERS.includes(userId.toString());
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  
  const welcomeMsg = `
🤖 *Sova BTC Mint Bot*

Halo ${username}! 👋

Bot ini untuk minting dan transfer sovaBTC di Sova Testnet.

*📝 Commands:*
/mint <amount> - Mint sovaBTC
  Contoh: \`/mint 1\`

/transfer <address> <amount> - Transfer sovaBTC
  Contoh: \`/transfer 0x123... 0.5\`

/tokenbalance - Cek sovaBTC balance
/balance - Cek ETH balance
/info - Info wallet & network
/test - Test RPC connection
/help - Tampilkan bantuan

🔐 Your User ID: \`${msg.from.id}\`

⚠️  *Note:* RPC kadang lambat, bersabarlah...
  `;
  
  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMsg = `
📖 *Panduan Penggunaan*

*🪙 Mint sovaBTC:*
/mint <jumlah>
Contoh: \`/mint 1\` → Mint 1 sovaBTC

*💸 Transfer sovaBTC:*
/transfer <address> <jumlah>
Contoh: 
• \`/transfer 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0.5\`
• \`/transfer 0xABC... 10\`

*💰 Cek Balance:*
/tokenbalance → Lihat sovaBTC balance
/balance → Lihat ETH balance

*ℹ️ Info Network:*
/info → Lihat info wallet & network

*🔧 Test Connection:*
/test → Test koneksi ke RPC

*❓ Tips:*
• Pastikan ada ETH untuk gas fee
• Pastikan alamat tujuan valid (0x...)
• Transaksi bisa butuh waktu 30-60 detik
• Jika timeout, tunggu sebentar lalu coba lagi
  `;
  
  bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
});

// Command: /test
bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  const testMsg = await bot.sendMessage(chatId, '🔍 Testing RPC connection (may take 30s)...');
  
  try {
    const startTime = Date.now();
    
    const blockNumber = await retryWithBackoff(
      () => web3Call(() => web3.eth.getBlockNumber()),
      'Get Block Number',
      3
    );
    const test1Time = Date.now() - startTime;
    
    const balanceStartTime = Date.now();
    const balance = await retryWithBackoff(
      () => web3Call(() => web3.eth.getBalance(account.address)),
      'Get Balance',
      3
    );
    const test2Time = Date.now() - balanceStartTime;
    
    const ethBalance = web3.utils.fromWei(balance, 'ether');
    
    const resultMsg = `
✅ *RPC Connection Test Successful!*

📊 *Test Results:*
• Block Number: ${blockNumber}
• Test 1 Time: ${test1Time}ms
• Test 2 Time: ${test2Time}ms
• Your Balance: ${ethBalance} ETH

🌐 *RPC Endpoint:*
\`${SOVA_TESTNET_RPC}\`

✅ Network responding (but may be slow)
    `;
    
    bot.editMessageText(resultMsg, {
      chat_id: chatId,
      message_id: testMsg.message_id,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    const errorMsg = `
❌ *RPC Connection Test Failed!*

⚠️  *Error:*
\`${error.message}\`

🔧 *Try:*
1. Wait 1-2 minutes and try again
2. RPC might be overloaded
3. Check your internet connection

🌐 *RPC:* \`${SOVA_TESTNET_RPC}\`
    `;
    
    bot.editMessageText(errorMsg, {
      chat_id: chatId,
      message_id: testMsg.message_id,
      parse_mode: 'Markdown'
    });
    console.error('Test error:', error);
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

⚙️ *Settings:*
• Timeout: ${REQUEST_TIMEOUT/1000}s
• Max Retries: ${MAX_RETRIES}x
• Retry Delay: ${RETRY_DELAY/1000}s

🔗 [View Explorer](https://explorer.testnet.sova.io/address/${account.address})
  `;
  
  bot.sendMessage(chatId, infoMsg, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true 
  });
});

// Command: /balance (ETH)
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  const statusMsg = await bot.sendMessage(chatId, '⏳ Checking balance (may take 30s)...');
  
  try {
    const balance = await retryWithBackoff(
      () => web3Call(() => web3.eth.getBalance(account.address)),
      'Get Balance',
      MAX_RETRIES
    );
    
    const ethBalance = web3.utils.fromWei(balance, 'ether');
    
    const balanceMsg = `
💰 *Balance Info*

ETH: \`${ethBalance}\` ETH
Address: \`${account.address}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
    `;
    
    bot.editMessageText(balanceMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    bot.editMessageText(
      `❌ Failed after ${MAX_RETRIES} retries.\n\n` +
      `Error: ${error.message}\n\n` +
      `Try /test to check connection.`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );
    console.error('Balance error:', error);
  }
});

// Command: /tokenbalance (sovaBTC)
bot.onText(/\/tokenbalance/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  const statusMsg = await bot.sendMessage(chatId, '⏳ Checking sovaBTC balance (may take 30s)...');
  
  try {
    const tokenBalance = await retryWithBackoff(
      () => web3Call(() => contract.methods.balanceOf(account.address).call()),
      'Get Token Balance',
      MAX_RETRIES
    );
    
    // sovaBTC uses 8 decimals
    const formattedBalance = (Number(tokenBalance) / 100000000).toFixed(8);
    
    const balanceMsg = `
💰 *sovaBTC Balance*

sovaBTC: \`${formattedBalance}\` sovaBTC
Address: \`${account.address}\`
Contract: \`${SOVA_BTC_CONTRACT}\`

🔗 [View on Explorer](https://explorer.testnet.sova.io/address/${account.address})
    `;
    
    bot.editMessageText(balanceMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    bot.editMessageText(
      `❌ Failed to get token balance.\n\n` +
      `Error: ${error.message}\n\n` +
      `Try /test to check connection.`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );
    console.error('Token balance error:', error);
  }
});

// Command: /mint
bot.onText(/\/mint (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseFloat(match[1]);
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, '❌ Jumlah harus angka positif!\n\nContoh: /mint 1');
    return;
  }
  
  let statusMsg;
  let currentStep = 0;
  
  try {
    statusMsg = await bot.sendMessage(chatId, `
🚀 *Minting ${amount} sovaBTC*

⏳ This may take 1-2 minutes, please wait...

[1/5] 🔄 Testing connection...
    `, { parse_mode: 'Markdown' });
    
    await retryWithBackoff(
      () => web3Call(() => web3.eth.getBlockNumber()),
      'Connection Test',
      3
    );
    currentStep = 1;
    
    await bot.editMessageText(`
🚀 *Minting ${amount} sovaBTC*

⏳ This may take 1-2 minutes, please wait...

[1/5] ✅ Connection OK
[2/5] 🔄 Checking balance...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    const balance = await retryWithBackoff(
      () => web3Call(() => web3.eth.getBalance(account.address)),
      'Balance Check',
      MAX_RETRIES
    );
    const ethBalance = web3.utils.fromWei(balance, 'ether');
    currentStep = 2;
    
    if (balance === 0n) {
      bot.editMessageText('❌ Balance ETH tidak cukup!', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }
    
    await bot.editMessageText(`
🚀 *Minting ${amount} sovaBTC*

⏳ This may take 1-2 minutes, please wait...

[1/5] ✅ Connection OK
[2/5] ✅ Balance OK (${ethBalance} ETH)
[3/5] 🔄 Estimating gas...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    const amountInWei = (amount * 100000000).toString();
    const gasEstimate = await retryWithBackoff(
      () => web3Call(() => 
        contract.methods
          .mint(WALLET_ADDRESS, amountInWei)
          .estimateGas({ from: account.address })
      ),
      'Gas Estimation',
      MAX_RETRIES
    );
    
    const gasLimit = Math.floor(Number(gasEstimate) * 1.3);
    currentStep = 3;
    
    await bot.editMessageText(`
🚀 *Minting ${amount} sovaBTC*

⏳ This may take 1-2 minutes, please wait...

[1/5] ✅ Connection OK
[2/5] ✅ Balance OK (${ethBalance} ETH)
[3/5] ✅ Gas estimated (${gasEstimate.toString()})
[4/5] 🔄 Building transaction...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    const nonce = await retryWithBackoff(
      () => web3Call(() => web3.eth.getTransactionCount(account.address, 'pending')),
      'Get Nonce',
      MAX_RETRIES
    );
    currentStep = 4;
    
    await bot.editMessageText(`
🚀 *Minting ${amount} sovaBTC*

⏳ This may take 1-2 minutes, please wait...

[1/5] ✅ Connection OK
[2/5] ✅ Balance OK (${ethBalance} ETH)
[3/5] ✅ Gas estimated (${gasEstimate.toString()})
[4/5] ✅ Transaction prepared (nonce: ${nonce})
[5/5] 🔄 Sending transaction...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    const tx = await retryWithBackoff(
      () => web3Call(() => 
        contract.methods
          .mint(WALLET_ADDRESS, amountInWei)
          .send({
            from: account.address,
            gas: gasLimit.toString(),
            nonce: nonce
          }),
        120000
      ),
      'Send Transaction',
      MAX_RETRIES
    );
    
    const successMsg = `
✅ *Minting Berhasil!*

💵 Amount: *${amount} sovaBTC*
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}
📦 Block: ${tx.blockNumber}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
    `;
    
    bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    const stepNames = ['Initial', 'Connection', 'Balance', 'Gas Estimation', 'Transaction Prep', 'Send Transaction'];
    const errorMsg = `
❌ *Minting Failed at Step ${currentStep + 1}!*

Failed at: *${stepNames[currentStep]}*

⚠️  Error: \`${error.message}\`

💡 *What to do:*
1. Run /test to check RPC status
2. Wait 2-3 minutes (RPC might be busy)
3. Try again with /mint ${amount}
4. If keeps failing, contact admin

*Note:* No funds were deducted if transaction failed.
    `;
    
    if (statusMsg) {
      bot.editMessageText(errorMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    } else {
      bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
    }
    console.error(`Mint error at step ${currentStep}:`, error);
  }
});

// Command: /transfer
bot.onText(/\/transfer\s+(\S+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const toAddress = match[1].trim();
  const amount = parseFloat(match[2]);
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  // Validasi alamat
  if (!isValidAddress(toAddress)) {
    bot.sendMessage(chatId, '❌ Alamat tidak valid!\n\nContoh: /transfer 0x742d35Cc... 1');
    return;
  }
  
  // Validasi amount
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, '❌ Jumlah harus angka positif!\n\nContoh: /transfer 0x742d35Cc... 1');
    return;
  }
  
  let statusMsg;
  let currentStep = 0;
  
  try {
    statusMsg = await bot.sendMessage(chatId, `
📤 *Transferring ${amount} sovaBTC*

To: \`${toAddress}\`

⏳ This may take 1-2 minutes, please wait...

[1/6] 🔄 Testing connection...
    `, { parse_mode: 'Markdown' });
    
    // Step 1: Test connection
    await retryWithBackoff(
      () => web3Call(() => web3.eth.getBlockNumber()),
      'Connection Test',
      3
    );
    currentStep = 1;
    
    await bot.editMessageText(`
📤 *Transferring ${amount} sovaBTC*

To: \`${toAddress}\`

⏳ This may take 1-2 minutes, please wait...

[1/6] ✅ Connection OK
[2/6] 🔄 Checking ETH balance...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Step 2: Check ETH balance for gas
    const ethBalance = await retryWithBackoff(
      () => web3Call(() => web3.eth.getBalance(account.address)),
      'ETH Balance Check',
      MAX_RETRIES
    );
    const ethBalanceFormatted = web3.utils.fromWei(ethBalance, 'ether');
    currentStep = 2;
    
    if (ethBalance === 0n) {
      bot.editMessageText('❌ Balance ETH tidak cukup untuk gas fee!', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }
    
    await bot.editMessageText(`
📤 *Transferring ${amount} sovaBTC*

To: \`${toAddress}\`

⏳ This may take 1-2 minutes, please wait...

[1/6] ✅ Connection OK
[2/6] ✅ ETH Balance OK (${ethBalanceFormatted} ETH)
[3/6] 🔄 Checking token balance...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Step 3: Check token balance
    const tokenBalance = await retryWithBackoff(
      () => web3Call(() => contract.methods.balanceOf(account.address).call()),
      'Token Balance Check',
      MAX_RETRIES
    );
    const tokenBalanceFormatted = (Number(tokenBalance) / 100000000).toFixed(8);
    currentStep = 3;
    
    const amountInWei = (amount * 100000000).toString();
    if (BigInt(tokenBalance) < BigInt(amountInWei)) {
      bot.editMessageText(
        `❌ sovaBTC balance tidak cukup!\n\n` +
        `Your balance: ${tokenBalanceFormatted} sovaBTC\n` +
        `Needed: ${amount} sovaBTC`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id
        }
      );
      return;
    }
    
    await bot.editMessageText(`
📤 *Transferring ${amount} sovaBTC*

To: \`${toAddress}\`

⏳ This may take 1-2 minutes, please wait...

[1/6] ✅ Connection OK
[2/6] ✅ ETH Balance OK (${ethBalanceFormatted} ETH)
[3/6] ✅ Token Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/6] 🔄 Estimating gas...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Step 4: Estimate gas
    const gasEstimate = await retryWithBackoff(
      () => web3Call(() => 
        contract.methods
          .transfer(toAddress, amountInWei)
          .estimateGas({ from: account.address })
      ),
      'Gas Estimation',
      MAX_RETRIES
    );
    
    const gasLimit = Math.floor(Number(gasEstimate) * 1.3);
    currentStep = 4;
    
    await bot.editMessageText(`
📤 *Transferring ${amount} sovaBTC*

To: \`${toAddress}\`

⏳ This may take 1-2 minutes, please wait...

[1/6] ✅ Connection OK
[2/6] ✅ ETH Balance OK (${ethBalanceFormatted} ETH)
[3/6] ✅ Token Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/6] ✅ Gas estimated (${gasEstimate.toString()})
[5/6] 🔄 Building transaction...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Step 5: Get nonce
    const nonce = await retryWithBackoff(
      () => web3Call(() => web3.eth.getTransactionCount(account.address, 'pending')),
      'Get Nonce',
      MAX_RETRIES
    );
    currentStep = 5;
    
    await bot.editMessageText(`
📤 *Transferring ${amount} sovaBTC*

To: \`${toAddress}\`

⏳ This may take 1-2 minutes, please wait...

[1/6] ✅ Connection OK
[2/6] ✅ ETH Balance OK (${ethBalanceFormatted} ETH)
[3/6] ✅ Token Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/6] ✅ Gas estimated (${gasEstimate.toString()})
[5/6] ✅ Transaction prepared (nonce: ${nonce})
[6/6] 🔄 Sending transaction...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Step 6: Send transaction
    const tx = await retryWithBackoff(
      () => web3Call(() => 
        contract.methods
          .transfer(toAddress, amountInWei)
          .send({
            from: account.address,
            gas: gasLimit.toString(),
            nonce: nonce
          }),
        120000
      ),
      'Send Transaction',
      MAX_RETRIES
    );
    
    // Success!
    const successMsg = `
✅ *Transfer Berhasil!*

💵 Amount: *${amount} sovaBTC*
📨 To: \`${toAddress}\`
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}
📦 Block: ${tx.blockNumber}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
    `;
    
    bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    const stepNames = ['Initial', 'Connection', 'ETH Balance', 'Token Balance', 'Gas Estimation', 'Transaction Prep', 'Send Transaction'];
    const errorMsg = `
❌ *Transfer Failed at Step ${currentStep + 1}!*

Failed at: *${stepNames[currentStep]}*

⚠️  Error: \`${error.message}\`

💡 *What to do:*
1. Run /test to check RPC status
2. Run /tokenbalance to verify balance
3. Wait 2-3 minutes (RPC might be busy)
4. Try again with /transfer ${toAddress} ${amount}
5. If keeps failing, contact admin

*Note:* No funds were deducted if transaction failed.
    `;
    
    if (statusMsg) {
      bot.editMessageText(errorMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    } else {
      bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
    }
    console.error(`Transfer error at step ${currentStep}:`, error);
  }
});

// Handle unknown commands
bot.on('message', (msg) => {
  const text = msg.text;
  
  if (!text || !text.startsWith('/')) return;
  if (text.startsWith('/start') || text.startsWith('/help') || 
      text.startsWith('/mint') || text.startsWith('/balance') || 
      text.startsWith('/tokenbalance') || text.startsWith('/transfer') ||
      text.startsWith('/info') || text.startsWith('/test')) return;
  
  bot.sendMessage(msg.chat.id, '❌ Unknown command. Ketik /help untuk bantuan.');
});

// Polling error handler
bot.on('polling_error', (error) => {
  console.error('⚠️  Polling error:', error.code);
});

// Startup dengan extended testing
async function startup() {
  console.log('🤖 Sova BTC Mint & Transfer Bot Starting...\n');
  console.log(`⚙️  Configuration:`);
  console.log(`   • Timeout: ${REQUEST_TIMEOUT/1000}s`);
  console.log(`   • Max Retries: ${MAX_RETRIES}x`);
  console.log(`   • Retry Delay: ${RETRY_DELAY/1000}s (with backoff)\n`);
  
  try {
    initializeWeb3();
    console.log('✅ Web3 Initialized');
    console.log(`📍 Wallet: ${account.address}`);
    console.log(`📍 Network: Sova Testnet`);
    console.log(`📍 RPC: ${SOVA_TESTNET_RPC}`);
    console.log(`📍 Token Contract: ${SOVA_BTC_CONTRACT}\n`);
    
    console.log('🔍 Testing RPC connection (may take 30s)...');
    const blockNumber = await retryWithBackoff(
      () => web3Call(() => web3.eth.getBlockNumber()),
      'Startup Connection Test',
      5
    );
    console.log(`✅ Connected! Current block: ${blockNumber}\n`);
    
    console.log('🚀 Bot is running! Send /start to begin.\n');
    console.log('📝 Available features:');
    console.log('   • Mint sovaBTC tokens');
    console.log('   • Transfer sovaBTC tokens');
    console.log('   • Check ETH & Token balances\n');
    console.log('⚠️  Note: RPC is slow/unstable - transactions may take 1-2 minutes\n');
  } catch (error) {
    console.error('❌ Startup test failed:', error.message);
    console.error('⚠️  Bot will continue but expect slow/failed requests.');
    console.error('💡 Check RPC_URL in .env or wait for RPC to stabilize.\n');
  }
}

startup();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});
