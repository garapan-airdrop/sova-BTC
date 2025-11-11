# Sova BTC Telegram Bot

## Overview
This is a Telegram bot for minting and transferring sovaBTC on Sova Testnet. The bot provides wallet management, check-in rewards, and admin commands for managing the sovaBTC token.

**Status:** ✅ Imported and Ready for Configuration  
**Last Updated:** November 2, 2025  
**Version:** 2.2 (Security & Performance Enhanced)

## Project Structure
```
├── src/
│   ├── commands/          # Bot command handlers
│   │   ├── adminCommands.js
│   │   ├── checkinCommands.js
│   │   ├── publicCommands.js
│   │   └── walletCommands.js
│   ├── config/
│   │   └── constants.js   # Configuration constants
│   ├── middleware/
│   │   └── auth.js        # Authentication middleware
│   ├── services/          # Core services
│   │   ├── checkinService.js
│   │   ├── claimsService.js
│   │   ├── walletService.js
│   │   └── web3Service.js
│   └── utils/             # Utility functions
│       ├── crypto.js
│       ├── envValidator.js
│       ├── formatters.js
│       ├── logger.js
│       ├── telegram.js
│       ├── terminal.js
│       └── validators.js
├── index.js               # Main entry point
├── package.json
└── README.md
```

## Required Configuration

Before the bot can run, you need to set up the following environment variables in Replit Secrets:

### Required Secrets
1. **TELEGRAM_BOT_TOKEN** - Get this from @BotFather on Telegram
2. **PRIVATE_KEY** - Your Ethereum wallet private key (use a testnet wallet!)
3. **WALLET_ENCRYPTION_KEY** - 32-byte hex string for encrypting wallet data
   - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Optional Configuration
- **RPC_URL** - Default: `https://rpc.testnet.sova.io`
- **CONTRACT_ADDRESS** - Default: `0x5Db496debB227455cE9f482f9E443f1073a55456`
- **ALLOWED_USERS** - Comma-separated Telegram user IDs for admin access
- **AMOUNT** - Amount to mint (default: 100000000 = 1 sovaBTC with 8 decimals)

## Features

### Security
- AES-256-GCM encryption for wallet data
- HMAC signatures for data integrity
- Environment validation at startup
- Secure key management

### Performance ⚡
- **Controlled Concurrency**: 20 parallel operations for batch commands
- **Batching Strategy**: fundwallets uses 10-tx batches with sequential nonces
- **Optimized Updates**: Telegram progress updates every 10 wallets (90% reduction)
- **Caching**: Gas prices and wallet conversions cached during operations
- **Fast Startup**: Reduced animation delays (~1.7s → ~250ms)
- Async file operations (non-blocking)
- File locking for concurrency safety
- Rate limiting with Bottleneck
- Efficient Telegram polling

### Bot Commands
- Public commands for wallet creation and management
- Admin commands for minting and transfers
  - `/fundwallets` - Fund all wallets with ETH
  - `/fundwallets <count>` - Fund specific number of wallets (auto-calculated if balance insufficient)
  - `/mintall` - Mint sovaBTC from all wallets
  - `/collectall` - Collect sovaBTC from all wallets
  - `/collectgas` - Collect excess gas from all wallets
- Check-in system for rewards
- Comprehensive wallet operations
- Smart balance checking with auto-suggestions

## Dependencies
- **node-telegram-bot-api** - Telegram bot framework
- **web3** - Ethereum blockchain interaction
- **dotenv** - Environment variable management
- **winston** - Logging
- **bottleneck** - Rate limiting
- **proper-lockfile** - File locking
- **axios** - HTTP requests
- **chalk** - Terminal colors
- **ora** - Terminal spinners

## Next Steps

1. **Set up your environment variables** in Replit Secrets (see Required Configuration above)
2. **Start the bot** - It will automatically validate your configuration
3. **Get your Telegram Bot Token** from @BotFather if you don't have one
4. **Configure admin users** by setting ALLOWED_USERS (optional)
5. **Test the bot** by sending commands in Telegram

## Development Notes

### Workflow
The project has a "Telegram Bot" workflow configured to run `node index.js`. The workflow will fail until you configure the required environment variables - this is expected behavior.

### Data Files
The bot creates two data files (automatically):
- `wallet.json` - Encrypted wallet storage
- `claims.json` - Check-in claim history (with HMAC signatures)

These files are gitignored for security.

## User Preferences
- None specified yet

## Recent Changes

### November 11, 2025: Performance Optimization 🚀

**Major Performance Improvements (5-10x faster):**
- ✅ Increased concurrency from 5 → 20 for batch operations
- ✅ fundwallets now uses batching (10 tx at once) instead of sequential
- ✅ mintall/collectall/collectgas use controlled concurrency (20 parallel)
- ✅ Telegram updates throttled to every 10 wallets (was every wallet)
- ✅ Cache optimizations for gas prices and wallet conversions
- ✅ Startup delays reduced from ~1.7s to ~250ms
- ✅ Custom concurrency limiter (replaced p-limit for CommonJS compatibility)

**Technical Details:**
- `MAX_CONCURRENT_OPERATIONS`: 20 parallel wallet operations
- `FUNDWALLET_BATCH_SIZE`: 10 transactions per batch
- `TELEGRAM_UPDATE_INTERVAL`: Update every 10 wallets
- Nonce management: Sequential with explicit tracking (no collisions)

### November 2, 2025: Major Updates & Security Enhancements

**Vault Integration Improvements:**
- ✅ Network-configurable vault service (support multi-network)
- ✅ Graceful degradation when vault not configured
- ✅ Better error handling with admin notifications
- ✅ Vault commands added to help documentation

**Backup & Recovery System:**
- ✅ Auto-backup wallet.json on every save
- ✅ Keep last 5 backups with automatic rotation
- ✅ Admin commands: `/listbackups` and `/restorebackup`
- ✅ Confirmation workflow for restore operations
- ✅ Backups stored in `backups/` directory (gitignored)

**Documentation Updates:**
- ✅ Vault commands added to `/help` and `/start`
- ✅ Backup commands documented in admin help
- ✅ Enhanced .env.example with vault configuration guide
- ✅ Comprehensive analysis document created (ANALISIS_KODE_DAN_SARAN_PERBAIKAN.md)

**Code Quality:**
- ✅ Improved error messages for vault service
- ✅ Better environment variable validation
- ✅ Enhanced logging for configuration issues

- November 2, 2025: Project imported to Replit
  - Installed all npm dependencies
  - Configured Telegram Bot workflow
  - Created project documentation
