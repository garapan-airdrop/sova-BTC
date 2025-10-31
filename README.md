# Sova BTC Telegram Bot - Replit Documentation

## Overview
Telegram bot untuk faucet sovaBTC token di Sova Testnet. Bot ini menggunakan Web3.js untuk interaksi blockchain dan Telegram Bot API untuk interface pengguna.

**Status:** ✅ Active - Bot dikonfigurasi dan siap dijalankan
**Last Updated:** 31 Oktober 2025
**Version:** 2.1 (With Faucet System & User-Friendly Transfer)

## Recent Changes

### Setup for Replit (31 Oktober 2025)
- ✅ Node.js 20 terinstall
- ✅ Dependencies terinstall (dotenv, node-telegram-bot-api, web3)
- ✅ .gitignore dibuat untuk melindungi file sensitif
- ✅ Workflow dikonfigurasi untuk menjalankan bot
- ✅ Secrets diminta (TELEGRAM_BOT_TOKEN, PRIVATE_KEY)

## Project Architecture

### Core Components
- **index.js** - Main bot application dengan semua command handlers
- **package.json** - Node.js dependencies
- **.env** - Environment variables template (tidak digunakan di Replit)
- **.gitignore** - Proteksi file sensitif
- **wallet.json** - Multi-wallet data (auto-created, not committed)
- **claims.json** - Daily claim tracking (auto-created, not committed)

### Technology Stack
- **Runtime:** Node.js 20
- **Blockchain:** Web3.js v4.16.0
- **Bot Framework:** node-telegram-bot-api v0.66.0
- **Environment:** dotenv v17.2.3 (fallback, Replit Secrets preferred)
- **Network:** Sova Testnet

## Configuration

### Required Secrets (Replit Secrets)
- `TELEGRAM_BOT_TOKEN` - Bot token dari @BotFather
- `PRIVATE_KEY` - Ethereum wallet private key untuk main faucet wallet

### Optional Environment Variables
- `RPC_URL` - Default: https://rpc.testnet.sova.io
- `CONTRACT_ADDRESS` - Default: 0x5Db496debB227455cE9f482f9E443f1073a55456
- `ALLOWED_USERS` - Comma-separated Telegram user IDs (kosong = semua user bisa akses admin commands)

## Bot Commands

### Public Commands (Semua User)
- `/start` - Welcome message
- `/help` - Help guide
- `/faucet` - Claim sovaBTC tokens (1x per hari)

### Admin Commands (Restricted)
**Single Wallet:**
- `/mint` - Mint sovaBTC dari main wallet
- `/balance` - Check ETH dan sovaBTC balance
- `/info` - Display wallet dan network info
- `/transfer <address> <amount>` - Transfer sovaBTC

**Multi-Wallet Mass Minting:**
- `/createwallets <count>` - Create multiple wallets (max 100)
- `/fundwallets` - Transfer 0.001 ETH gas ke semua wallets
- `/mintall` - Mint dari semua wallets
- `/collectall` - Collect sovaBTC ke main wallet (5% creator reward)
- `/collectgas` - Collect ETH ke main wallet (5% creator reward)
- `/walletstatus` - Check status semua wallets

## Features

### Faucet System
- Daily claim limits (1x per user per day)
- Automatic reset at 00:00 WIB
- Address validation
- Claim history tracking
- User-friendly interactive flow

### Mass Minting System
- Multi-wallet automation
- Automatic wallet creation
- Batch funding dan minting
- Token collection dengan creator reward (5%)

### Security Features
- Dual authorization (admin vs public)
- Self-transfer prevention
- BigInt support untuk precise calculations
- Proper error handling
- Memory leak prevention dengan cleanup
- Unencrypted wallet.json warning

## User Preferences
- Language: Indonesian
- Bot responses: Friendly dengan emojis
- Error messages: Clear dengan solusi
- Status updates: Real-time progress

## Development Notes
- Bot menggunakan polling mode
- Web3 connects to Sova Testnet
- Transaction gas auto-estimated dengan 20% safety margin
- Secrets managed via Replit Secrets
- Temporary wallets properly cleaned up
- Claims tracked dengan daily reset

## Security Model
- Secrets stored in Replit Secrets (tidak di .env)
- .gitignore melindungi sensitive files
- wallet.json stores private keys in plaintext (by design for automation)
- Recommendation: Keep Repl private
- Creator reward system (5% dari collectall & collectgas)
- Creator address: 0x3FAD363a36A7d89D93C6a478BbF18B53191145F2

## Known Issues
- None currently (code berfungsi dengan baik)

## Future Improvements
- Consider encrypting wallet.json
- Add database support untuk better claims tracking
- Rate limiting untuk API calls
- Webhook mode option (instead of polling)
- Multi-language support

---

**Maintained by:** Replit Community
**Bot Type:** Faucet & Admin Management
**Network:** Sova Testnet Only
