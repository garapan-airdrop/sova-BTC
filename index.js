require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Web3 } = require('web3');

// Konfigurasi
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOVA_TESTNET_RPC = process.env.RPC_URL || 'https://rpc.testnet.sova.io';
const SOVA_BTC_CONTRACT = process.env.CONTRACT_ADDRESS || '0xb5374db36960708bc582E4103C89F91d055Fc58B';
const SPBTC_VAULT_CONTRACT = process.env.SPBTC_VAULT_ADDRESS || '';
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
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// ERC-4626 Vault ABI untuk Sova Prime spBTC vault
const VAULT_ABI = [
  {
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' }
    ],
    name: 'deposit',
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' }
    ],
    name: 'mint',
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' }
    ],
    name: 'withdraw',
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' }
    ],
    name: 'redeem',
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'assets', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ name: '', type: 'uint256' }],
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
    inputs: [],
    name: 'asset',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

let web3, contract, vaultContract, account;

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
  
  if (SPBTC_VAULT_CONTRACT) {
    vaultContract = new web3.eth.Contract(VAULT_ABI, SPBTC_VAULT_CONTRACT);
  }
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
🤖 *Sova BTC + Prime Vault Bot*

Halo ${username}! 👋

Bot ini untuk interact dengan sovaBTC & Sova Prime Vault!

*🪙 sovaBTC Commands:*
/mint <amount> - Mint sovaBTC
/transfer <address> <amount> - Transfer sovaBTC
/tokenbalance - Cek sovaBTC balance

*🏦 Sova Prime Vault:*
/vaultdeposit <amount> - Deposit ke vault
/vaultwithdraw <amount> - Withdraw dari vault
/vaultredeem <shares> - Redeem spBTC shares
/vaultbalance - Cek spBTC shares
/vaultinfo - Info vault & APY
/preview <deposit|withdraw> <amount> - Preview konversi

*🔐 Allowance:*
/approve <address> <amount> - Approve spending
/allowance <address> - Cek allowance

*ℹ️ Info:*
/balance - Cek ETH balance
/info - Network info
/test - Test RPC
/help - Bantuan lengkap

🔐 Your User ID: \`${msg.from.id}\`

⚠️  *Note:* RPC kadang lambat, bersabarlah...
  `;
  
  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMsg = `
📖 *Panduan Penggunaan Lengkap*

*🪙 sovaBTC Operations:*
/mint <jumlah> - Mint sovaBTC
  Contoh: \`/mint 1\`

/transfer <address> <jumlah> - Transfer sovaBTC
  Contoh: \`/transfer 0x742d35Cc... 0.5\`

/tokenbalance - Cek sovaBTC balance

*🏦 Sova Prime Vault (Earn Yield):*
/vaultdeposit <jumlah> - Deposit sovaBTC ke vault
  Contoh: \`/vaultdeposit 10\`
  → Terima spBTC shares yang earn yield!

/vaultwithdraw <jumlah> - Withdraw sovaBTC dari vault
  Contoh: \`/vaultwithdraw 5\`

/vaultredeem <shares> - Redeem spBTC shares
  Contoh: \`/vaultredeem 1\`

/vaultbalance - Cek spBTC shares & nilai aset
/vaultinfo - Info vault (total assets, APY, dll)

/preview <deposit|withdraw> <jumlah> - Preview konversi
  Contoh: \`/preview deposit 10\`

*🔐 Allowance Management:*
/approve <address> <jumlah> - Approve allowance
  Contoh: \`/approve 0xVault... 100\`
  → Diperlukan sebelum deposit ke vault!

/allowance <address> - Cek allowance
  Contoh: \`/allowance 0xVault...\`

*💰 Balance & Info:*
/balance - Cek ETH balance (untuk gas)
/info - Info wallet & network
/test - Test koneksi RPC

*🎯 Flow untuk Sova Prime:*
1. Mint sovaBTC: \`/mint 10\`
2. Approve vault: \`/approve <vault_address> 10\`
3. Deposit: \`/vaultdeposit 10\`
4. Earn yield otomatis! 📈
5. Check: \`/vaultbalance\`
6. Withdraw: \`/vaultwithdraw 5\`

*❓ Tips:*
• Pastikan ada ETH untuk gas fee
• Transaksi bisa butuh waktu 30-60 detik
• Vault address perlu diset di secrets (SPBTC_VAULT_ADDRESS)
• Jika timeout, tunggu & coba lagi
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

// ===== SOVA PRIME COMMANDS =====

// Command: /approve
bot.onText(/\/approve\s+(\S+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const spender = match[1].trim();
  const amount = parseFloat(match[2]);
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!isValidAddress(spender)) {
    bot.sendMessage(chatId, '❌ Invalid spender address!\n\nExample: /approve 0x742d35Cc... 100');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, '❌ Amount must be positive number!\n\nExample: /approve 0x742d35Cc... 100');
    return;
  }
  
  let statusMsg;
  
  try {
    statusMsg = await bot.sendMessage(chatId, `
🔐 *Approving ${amount} sovaBTC*

Spender: \`${spender}\`

⏳ This may take 30-60 seconds...
    `, { parse_mode: 'Markdown' });
    
    const amountInWei = (amount * 100000000).toString();
    
    const gasEstimate = await retryWithBackoff(
      () => web3Call(() => 
        contract.methods
          .approve(spender, amountInWei)
          .estimateGas({ from: account.address })
      ),
      'Gas Estimation',
      MAX_RETRIES
    );
    
    const gasLimit = Math.floor(Number(gasEstimate) * 1.3);
    
    const nonce = await retryWithBackoff(
      () => web3Call(() => web3.eth.getTransactionCount(account.address, 'pending')),
      'Get Nonce',
      MAX_RETRIES
    );
    
    const tx = await retryWithBackoff(
      () => web3Call(() => 
        contract.methods
          .approve(spender, amountInWei)
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
✅ *Approval Successful!*

💵 Amount: *${amount} sovaBTC*
🔐 Spender: \`${spender}\`
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
    `;
    
    bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    const errorMsg = `
❌ *Approval Failed!*

Error: \`${error.message}\`

Try /test to check connection.
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
    console.error('Approve error:', error);
  }
});

// Command: /allowance
bot.onText(/\/allowance\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const spender = match[1].trim();
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!isValidAddress(spender)) {
    bot.sendMessage(chatId, '❌ Invalid address!\n\nExample: /allowance 0x742d35Cc...');
    return;
  }
  
  const statusMsg = await bot.sendMessage(chatId, '⏳ Checking allowance...');
  
  try {
    const allowance = await retryWithBackoff(
      () => web3Call(() => contract.methods.allowance(account.address, spender).call()),
      'Get Allowance',
      MAX_RETRIES
    );
    
    const formattedAllowance = (Number(allowance) / 100000000).toFixed(8);
    
    const allowanceMsg = `
🔐 *Allowance Info*

Owner: \`${account.address}\`
Spender: \`${spender}\`
Allowance: \`${formattedAllowance}\` sovaBTC
    `;
    
    bot.editMessageText(allowanceMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    bot.editMessageText(
      `❌ Failed to get allowance.\n\nError: ${error.message}`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );
    console.error('Allowance error:', error);
  }
});

// Command: /vaultdeposit
bot.onText(/\/vaultdeposit (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseFloat(match[1]);
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!SPBTC_VAULT_CONTRACT) {
    bot.sendMessage(chatId, '❌ Vault contract not configured! Set SPBTC_VAULT_ADDRESS in secrets.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, '❌ Amount must be positive number!\n\nExample: /vaultdeposit 1');
    return;
  }
  
  let statusMsg;
  let currentStep = 0;
  
  try {
    statusMsg = await bot.sendMessage(chatId, `
🏦 *Depositing ${amount} sovaBTC to Vault*

⏳ This may take 1-2 minutes...

[1/8] 🔄 Testing connection...
    `, { parse_mode: 'Markdown' });
    
    await retryWithBackoff(
      () => web3Call(() => web3.eth.getBlockNumber()),
      'Connection Test',
      3
    );
    currentStep = 1;
    
    await bot.editMessageText(`
🏦 *Depositing ${amount} sovaBTC to Vault*

[1/8] ✅ Connection OK
[2/8] 🔄 Verifying vault contract...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Verify vault asset matches our token
    const vaultAsset = await retryWithBackoff(
      () => web3Call(() => vaultContract.methods.asset().call()),
      'Verify Vault Asset',
      MAX_RETRIES
    );
    currentStep = 2;
    
    if (vaultAsset.toLowerCase() !== SOVA_BTC_CONTRACT.toLowerCase()) {
      bot.editMessageText(
        `❌ Vault asset mismatch!\n\nVault expects: \`${vaultAsset}\`\nToken contract: \`${SOVA_BTC_CONTRACT}\`\n\n⚠️ Wrong vault address!`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
      );
      return;
    }
    
    await bot.editMessageText(`
🏦 *Depositing ${amount} sovaBTC to Vault*

[1/8] ✅ Connection OK
[2/8] ✅ Vault verified
[3/8] 🔄 Checking sovaBTC balance...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
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
        `❌ Insufficient sovaBTC!\n\nYour balance: ${tokenBalanceFormatted} sovaBTC\nNeeded: ${amount} sovaBTC`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
      return;
    }
    
    await bot.editMessageText(`
🏦 *Depositing ${amount} sovaBTC to Vault*

[1/8] ✅ Connection OK
[2/8] ✅ Vault verified
[3/8] ✅ Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/8] 🔄 Checking allowance...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    const allowance = await retryWithBackoff(
      () => web3Call(() => contract.methods.allowance(account.address, SPBTC_VAULT_CONTRACT).call()),
      'Check Allowance',
      MAX_RETRIES
    );
    const allowanceFormatted = (Number(allowance) / 100000000).toFixed(8);
    currentStep = 4;
    
    if (BigInt(allowance) < BigInt(amountInWei)) {
      bot.editMessageText(
        `❌ Insufficient allowance!\n\nCurrent: ${allowanceFormatted} sovaBTC\nNeeded: ${amount} sovaBTC\n\nApprove first:\n\`/approve ${SPBTC_VAULT_CONTRACT} ${amount}\``,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
      );
      return;
    }
    
    await bot.editMessageText(`
🏦 *Depositing ${amount} sovaBTC to Vault*

[1/8] ✅ Connection OK
[2/8] ✅ Vault verified
[3/8] ✅ Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/8] ✅ Allowance OK (${allowanceFormatted} sovaBTC)
[5/8] 🔄 Previewing deposit...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    // Preview shares yang akan diterima
    const expectedShares = await retryWithBackoff(
      () => web3Call(() => vaultContract.methods.convertToShares(amountInWei).call()),
      'Preview Shares',
      MAX_RETRIES
    );
    const sharesFormatted = (Number(expectedShares) / 100000000).toFixed(8);
    currentStep = 5;
    
    await bot.editMessageText(`
🏦 *Depositing ${amount} sovaBTC to Vault*

[1/8] ✅ Connection OK
[2/8] ✅ Vault verified
[3/8] ✅ Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/8] ✅ Allowance OK (${allowanceFormatted} sovaBTC)
[5/8] ✅ Preview: ~${sharesFormatted} spBTC
[6/8] 🔄 Estimating gas...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    const gasEstimate = await retryWithBackoff(
      () => web3Call(() => 
        vaultContract.methods
          .deposit(amountInWei, account.address)
          .estimateGas({ from: account.address })
      ),
      'Gas Estimation',
      MAX_RETRIES
    );
    const gasLimit = Math.floor(Number(gasEstimate) * 1.3);
    currentStep = 6;
    
    await bot.editMessageText(`
🏦 *Depositing ${amount} sovaBTC to Vault*

[1/8] ✅ Connection OK
[2/8] ✅ Vault verified
[3/8] ✅ Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/8] ✅ Allowance OK (${allowanceFormatted} sovaBTC)
[5/8] ✅ Preview: ~${sharesFormatted} spBTC
[6/8] ✅ Gas estimated (${gasEstimate.toString()})
[7/8] 🔄 Preparing transaction...
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
    currentStep = 7;
    
    await bot.editMessageText(`
🏦 *Depositing ${amount} sovaBTC to Vault*

[1/8] ✅ Connection OK
[2/8] ✅ Vault verified
[3/8] ✅ Balance OK (${tokenBalanceFormatted} sovaBTC)
[4/8] ✅ Allowance OK (${allowanceFormatted} sovaBTC)
[5/8] ✅ Preview: ~${sharesFormatted} spBTC
[6/8] ✅ Gas estimated (${gasEstimate.toString()})
[7/8] ✅ Transaction prepared (nonce: ${nonce})
[8/8] 🔄 Sending deposit transaction...
    `, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
    
    const tx = await retryWithBackoff(
      () => web3Call(() => 
        vaultContract.methods
          .deposit(amountInWei, account.address)
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
✅ *Vault Deposit Successful!*

💵 Deposited: *${amount} sovaBTC*
🏦 You received spBTC shares
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

Use /vaultbalance to check your shares!

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
    `;
    
    bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    const stepNames = ['Initial', 'Connection', 'Vault Verification', 'Balance Check', 'Allowance Check', 'Preview', 'Gas Estimation', 'Transaction Prep', 'Send Transaction'];
    
    let errorDetails = error.message;
    let troubleshooting = '💡 Try: /test to check connection';
    
    // Decode specific errors
    if (error.message.includes('execution reverted')) {
      if (error.data === '0x7939f424') {
        errorDetails = 'ERC4626: deposit more than max';
        troubleshooting = `
💡 *Possible issues:*
1. Vault might have deposit limit
2. Try smaller amount: \`/vaultdeposit ${(amount / 2).toFixed(2)}\`
3. Check vault info: /vaultinfo
4. Verify vault address is correct
        `;
      } else if (error.message.includes('insufficient allowance')) {
        troubleshooting = `
💡 *Solution:*
Re-approve the vault:
\`/approve ${SPBTC_VAULT_CONTRACT} ${amount * 2}\`
        `;
      }
    }
    
    const errorMsg = `
❌ *Deposit Failed at Step ${currentStep + 1}!*

Failed at: *${stepNames[currentStep]}*

⚠️ Error: \`${errorDetails}\`

${troubleshooting}

🔧 *Debug Info:*
• Amount: ${amount} sovaBTC
• Vault: \`${SPBTC_VAULT_CONTRACT}\`
• Token: \`${SOVA_BTC_CONTRACT}\`
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
    console.error(`Vault deposit error at step ${currentStep}:`, error);
  }
});

// Command: /vaultwithdraw
bot.onText(/\/vaultwithdraw (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseFloat(match[1]);
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!SPBTC_VAULT_CONTRACT) {
    bot.sendMessage(chatId, '❌ Vault contract not configured! Set SPBTC_VAULT_ADDRESS in secrets.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, '❌ Amount must be positive number!\n\nExample: /vaultwithdraw 1');
    return;
  }
  
  let statusMsg;
  
  try {
    statusMsg = await bot.sendMessage(chatId, `
🏦 *Withdrawing ${amount} sovaBTC from Vault*

⏳ This may take 1-2 minutes...
    `, { parse_mode: 'Markdown' });
    
    const amountInWei = (amount * 100000000).toString();
    
    const gasEstimate = await retryWithBackoff(
      () => web3Call(() => 
        vaultContract.methods
          .withdraw(amountInWei, account.address, account.address)
          .estimateGas({ from: account.address })
      ),
      'Gas Estimation',
      MAX_RETRIES
    );
    
    const gasLimit = Math.floor(Number(gasEstimate) * 1.3);
    
    const nonce = await retryWithBackoff(
      () => web3Call(() => web3.eth.getTransactionCount(account.address, 'pending')),
      'Get Nonce',
      MAX_RETRIES
    );
    
    const tx = await retryWithBackoff(
      () => web3Call(() => 
        vaultContract.methods
          .withdraw(amountInWei, account.address, account.address)
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
✅ *Vault Withdrawal Successful!*

💵 Withdrawn: *${amount} sovaBTC*
🏦 spBTC shares burned
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
    `;
    
    bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    const errorMsg = `
❌ *Withdrawal Failed!*

Error: \`${error.message}\`

💡 Check:
- Do you have enough shares? (/vaultbalance)
- Is RPC working? (/test)
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
    console.error('Vault withdraw error:', error);
  }
});

// Command: /vaultredeem
bot.onText(/\/vaultredeem (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const shares = parseFloat(match[1]);
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!SPBTC_VAULT_CONTRACT) {
    bot.sendMessage(chatId, '❌ Vault contract not configured!');
    return;
  }
  
  if (isNaN(shares) || shares <= 0) {
    bot.sendMessage(chatId, '❌ Shares must be positive number!\n\nExample: /vaultredeem 1');
    return;
  }
  
  let statusMsg;
  
  try {
    statusMsg = await bot.sendMessage(chatId, `
🏦 *Redeeming ${shares} spBTC shares*

⏳ This may take 1-2 minutes...
    `, { parse_mode: 'Markdown' });
    
    const sharesInWei = (shares * 100000000).toString();
    
    const gasEstimate = await retryWithBackoff(
      () => web3Call(() => 
        vaultContract.methods
          .redeem(sharesInWei, account.address, account.address)
          .estimateGas({ from: account.address })
      ),
      'Gas Estimation',
      MAX_RETRIES
    );
    
    const gasLimit = Math.floor(Number(gasEstimate) * 1.3);
    
    const nonce = await retryWithBackoff(
      () => web3Call(() => web3.eth.getTransactionCount(account.address, 'pending')),
      'Get Nonce',
      MAX_RETRIES
    );
    
    const tx = await retryWithBackoff(
      () => web3Call(() => 
        vaultContract.methods
          .redeem(sharesInWei, account.address, account.address)
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
✅ *Vault Redeem Successful!*

🎯 Redeemed: *${shares} spBTC shares*
💵 Received sovaBTC back
📄 TX Hash: \`${tx.transactionHash}\`
⛽ Gas Used: ${tx.gasUsed.toString()}

🔗 [View on Explorer](https://explorer.testnet.sova.io/tx/${tx.transactionHash})
    `;
    
    bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    const errorMsg = `
❌ *Redeem Failed!*

Error: \`${error.message}\`

Check /vaultbalance to verify shares.
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
    console.error('Vault redeem error:', error);
  }
});

// Command: /vaultbalance
bot.onText(/\/vaultbalance/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!SPBTC_VAULT_CONTRACT) {
    bot.sendMessage(chatId, '❌ Vault contract not configured!');
    return;
  }
  
  const statusMsg = await bot.sendMessage(chatId, '⏳ Checking vault balance...');
  
  try {
    const sharesBalance = await retryWithBackoff(
      () => web3Call(() => vaultContract.methods.balanceOf(account.address).call()),
      'Get Vault Balance',
      MAX_RETRIES
    );
    
    const formattedShares = (Number(sharesBalance) / 100000000).toFixed(8);
    
    let assetValue = '0.00000000';
    if (BigInt(sharesBalance) > 0n) {
      const assets = await retryWithBackoff(
        () => web3Call(() => vaultContract.methods.convertToAssets(sharesBalance).call()),
        'Convert to Assets',
        MAX_RETRIES
      );
      assetValue = (Number(assets) / 100000000).toFixed(8);
    }
    
    const balanceMsg = `
🏦 *Vault Balance*

spBTC Shares: \`${formattedShares}\` spBTC
Asset Value: \`${assetValue}\` sovaBTC

Address: \`${account.address}\`
Vault: \`${SPBTC_VAULT_CONTRACT}\`
    `;
    
    bot.editMessageText(balanceMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    bot.editMessageText(
      `❌ Failed to get vault balance.\n\nError: ${error.message}`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );
    console.error('Vault balance error:', error);
  }
});

// Command: /vaultinfo
bot.onText(/\/vaultinfo/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!SPBTC_VAULT_CONTRACT) {
    bot.sendMessage(chatId, '❌ Vault contract not configured!');
    return;
  }
  
  const statusMsg = await bot.sendMessage(chatId, '⏳ Loading vault info...');
  
  try {
    const totalAssets = await retryWithBackoff(
      () => web3Call(() => vaultContract.methods.totalAssets().call()),
      'Get Total Assets',
      MAX_RETRIES
    );
    
    const totalSupply = await retryWithBackoff(
      () => web3Call(() => vaultContract.methods.totalSupply().call()),
      'Get Total Supply',
      MAX_RETRIES
    );
    
    const underlyingAsset = await retryWithBackoff(
      () => web3Call(() => vaultContract.methods.asset().call()),
      'Get Asset',
      MAX_RETRIES
    );
    
    const formattedAssets = (Number(totalAssets) / 100000000).toFixed(8);
    const formattedSupply = (Number(totalSupply) / 100000000).toFixed(8);
    
    let exchangeRate = '1.00000000';
    if (BigInt(totalSupply) > 0n) {
      const rate = (Number(totalAssets) / Number(totalSupply)).toFixed(8);
      exchangeRate = rate;
    }
    
    const infoMsg = `
🏦 *Sova Prime Vault Info*

📊 *Vault Statistics:*
• Total Assets: \`${formattedAssets}\` sovaBTC
• Total Shares: \`${formattedSupply}\` spBTC
• Exchange Rate: \`${exchangeRate}\` sovaBTC per spBTC

📍 *Addresses:*
• Vault: \`${SPBTC_VAULT_CONTRACT}\`
• Asset: \`${underlyingAsset}\`

💡 *How to use:*
1. Approve: \`/approve ${SPBTC_VAULT_CONTRACT} <amount>\`
2. Deposit: \`/vaultdeposit <amount>\`
3. Check: \`/vaultbalance\`
4. Withdraw: \`/vaultwithdraw <amount>\`

🔗 [View Contract](https://explorer.testnet.sova.io/address/${SPBTC_VAULT_CONTRACT})
    `;
    
    bot.editMessageText(infoMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    bot.editMessageText(
      `❌ Failed to get vault info.\n\nError: ${error.message}`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );
    console.error('Vault info error:', error);
  }
});

// Command: /preview
bot.onText(/\/preview\s+(deposit|withdraw)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const action = match[1];
  const amount = parseFloat(match[2]);
  
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized! Contact admin.');
    return;
  }
  
  if (!SPBTC_VAULT_CONTRACT) {
    bot.sendMessage(chatId, '❌ Vault contract not configured!');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, '❌ Amount must be positive!\n\nExample: /preview deposit 1');
    return;
  }
  
  const statusMsg = await bot.sendMessage(chatId, '⏳ Calculating...');
  
  try {
    const amountInWei = (amount * 100000000).toString();
    let result;
    let resultFormatted;
    let previewMsg;
    
    if (action === 'deposit') {
      result = await retryWithBackoff(
        () => web3Call(() => vaultContract.methods.convertToShares(amountInWei).call()),
        'Convert to Shares',
        MAX_RETRIES
      );
      resultFormatted = (Number(result) / 100000000).toFixed(8);
      
      previewMsg = `
📊 *Deposit Preview*

💵 Deposit: \`${amount}\` sovaBTC
🎯 You will receive: \`${resultFormatted}\` spBTC shares

To proceed:
\`/vaultdeposit ${amount}\`
      `;
    } else {
      result = await retryWithBackoff(
        () => web3Call(() => vaultContract.methods.convertToAssets(amountInWei).call()),
        'Convert to Assets',
        MAX_RETRIES
      );
      resultFormatted = (Number(result) / 100000000).toFixed(8);
      
      previewMsg = `
📊 *Withdrawal Preview*

🎯 Redeem: \`${amount}\` spBTC shares
💵 You will receive: \`${resultFormatted}\` sovaBTC

To proceed:
\`/vaultredeem ${amount}\`
      `;
    }
    
    bot.editMessageText(previewMsg, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    bot.editMessageText(
      `❌ Preview failed.\n\nError: ${error.message}`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );
    console.error('Preview error:', error);
  }
});

// Handle unknown commands
bot.on('message', (msg) => {
  const text = msg.text;
  
  if (!text || !text.startsWith('/')) return;
  if (text.startsWith('/start') || text.startsWith('/help') || 
      text.startsWith('/mint') || text.startsWith('/balance') || 
      text.startsWith('/tokenbalance') || text.startsWith('/transfer') ||
      text.startsWith('/info') || text.startsWith('/test') ||
      text.startsWith('/approve') || text.startsWith('/allowance') ||
      text.startsWith('/vaultdeposit') || text.startsWith('/vaultwithdraw') ||
      text.startsWith('/vaultredeem') || text.startsWith('/vaultbalance') ||
      text.startsWith('/vaultinfo') || text.startsWith('/preview')) return;
  
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
