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

### Performance
- Async file operations (non-blocking)
- File locking for concurrency safety
- Rate limiting with Bottleneck
- Efficient Telegram polling

### Bot Commands
- Public commands for wallet creation and management
- Admin commands for minting and transfers
- Check-in system for rewards
- Comprehensive wallet operations

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
- November 2, 2025: Project imported to Replit
  - Installed all npm dependencies
  - Configured Telegram Bot workflow
  - Created project documentation
