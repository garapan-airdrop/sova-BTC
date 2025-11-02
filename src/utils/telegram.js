const formatBoldText = (text) => `*${text}*`;
const formatItalicText = (text) => `_${text}_`;
const formatCodeText = (text) => `\`${text}\``;
const formatCodeBlock = (text) => `\`\`\`\n${text}\n\`\`\``;
const formatLink = (text, url) => `[${text}](${url})`;

function createInlineKeyboard(buttons) {
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

function createMainMenuKeyboard() {
  return createInlineKeyboard([
    [
      { text: '💰 Claim Faucet', callback_data: 'faucet' },
      { text: '❓ Help', callback_data: 'help' }
    ]
  ]);
}

function createAdminMenuKeyboard() {
  return createInlineKeyboard([
    [
      { text: '💰 Balance', callback_data: 'balance' },
      { text: 'ℹ️ Info', callback_data: 'info' }
    ],
    [
      { text: '🏭 Mint', callback_data: 'mint' },
      { text: '📤 Transfer', callback_data: 'transfer_start' }
    ],
    [
      { text: '👛 Wallet Status', callback_data: 'walletstatus' },
      { text: '⚙️ More...', callback_data: 'admin_more' }
    ]
  ]);
}

function createAdminMoreKeyboard() {
  return createInlineKeyboard([
    [
      { text: '➕ Create Wallets', callback_data: 'createwallets' },
      { text: '💵 Fund Wallets', callback_data: 'fundwallets' }
    ],
    [
      { text: '🏭 Mint All', callback_data: 'mintall' },
      { text: '📥 Collect All', callback_data: 'collectall' }
    ],
    [
      { text: '⛽ Collect Gas', callback_data: 'collectgas' },
      { text: '⬅️ Back', callback_data: 'admin_menu' }
    ]
  ]);
}

function formatWelcomeMessage() {
  return `🎉 *Selamat Datang di Sova BTC Faucet Bot!*

🪙 *sovaBTC* adalah token di Sova Testnet yang bisa Anda claim setiap hari!

📋 *Fitur Utama:*
• 💰 Claim gratis sovaBTC setiap 24 jam
• ⚡ Transfer instan ke wallet Anda
• 🔒 Aman dan terpercaya

🚀 *Cara Menggunakan:*
1. Klik tombol ${formatBoldText('Claim Faucet')} di bawah
2. Masukkan alamat wallet EVM Anda
3. Terima sovaBTC langsung!

💡 *Tips:* Claim setiap hari untuk mendapatkan token maksimal!`;
}

function formatHelpMessage() {
  return `📖 *Panduan Menggunakan Bot*

*Public Commands:*
/start - Mulai menggunakan bot
/help - Tampilkan panduan ini
/faucet - Claim sovaBTC (1x per hari)

*Informasi Penting:*
🕐 Claim limit: 1x per 24 jam
💰 Jumlah claim: 0.001 sovaBTC
🔄 Reset otomatis setiap tengah malam WIB

*Network Info:*
🌐 Network: Sova Testnet
🔗 RPC: https://rpc.testnet.sova.io
📜 Contract: \`0x5Db4...5456\`

⚠️ *Penting:*
• Pastikan alamat wallet Anda benar
• Gunakan alamat EVM (Ethereum-compatible)
• Simpan private key Anda dengan aman

Butuh bantuan? Hubungi admin!`;
}

function formatBalanceMessage(ethBalance, tokenBalance, address) {
  return `💼 *Informasi Balance*

👛 *Wallet:* \`${address.slice(0, 6)}...${address.slice(-4)}\`

💎 *ETH Balance:*
${formatCodeText(ethBalance)} ETH

🪙 *sovaBTC Balance:*
${formatCodeText(tokenBalance)} sovaBTC

📊 Total aset Anda dalam Sova Testnet`;
}

function formatSuccessMessage(title, message) {
  return `✅ *${title}*\n\n${message}`;
}

function formatErrorMessage(title, message) {
  return `❌ *${title}*\n\n${message}`;
}

function formatWarningMessage(title, message) {
  return `⚠️ *${title}*\n\n${message}`;
}

function formatInfoMessage(title, message) {
  return `ℹ️ *${title}*\n\n${message}`;
}

function formatTransactionMessage(txHash, explorerUrl = 'https://explorer.testnet.sova.io') {
  return `🔗 *Transaction Hash:*
\`${txHash}\`

🔍 [Lihat di Explorer](${explorerUrl}/tx/${txHash})`;
}

function formatProgressMessage(current, total, action) {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round(percentage / 5);
  const empty = 20 - filled;
  const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
  
  return `⏳ *${action}*\n\n${progressBar} ${percentage}%\n${current}/${total} selesai`;
}

function formatClaimSuccessMessage(amount, txHash, address) {
  return `${formatSuccessMessage('Claim Berhasil!', '')}

💰 *Jumlah:* ${amount} sovaBTC
📬 *Dikirim ke:* \`${address.slice(0, 6)}...${address.slice(-4)}\`

${formatTransactionMessage(txHash)}

✨ Token sudah ada di wallet Anda!
⏰ Claim berikutnya: 24 jam lagi`;
}

function formatClaimLimitMessage(nextClaimTime) {
  return formatWarningMessage(
    'Sudah Claim Hari Ini',
    `Anda sudah melakukan claim hari ini!\n\n⏰ Claim berikutnya: ${nextClaimTime}\n\n💡 Kembali besok untuk claim lagi!`
  );
}

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

module.exports = {
  formatBoldText,
  formatItalicText,
  formatCodeText,
  formatCodeBlock,
  formatLink,
  createInlineKeyboard,
  createMainMenuKeyboard,
  createAdminMenuKeyboard,
  createAdminMoreKeyboard,
  formatWelcomeMessage,
  formatHelpMessage,
  formatBalanceMessage,
  formatSuccessMessage,
  formatErrorMessage,
  formatWarningMessage,
  formatInfoMessage,
  formatTransactionMessage,
  formatProgressMessage,
  formatClaimSuccessMessage,
  formatClaimLimitMessage,
  escapeMarkdown
};
