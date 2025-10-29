# Sova BTC Telegram Bot

## Overview
Telegram bot untuk minting sovaBTC token di Sova Testnet. Bot ini menggunakan Web3 untuk berinteraksi dengan smart contract sovaBTC dan Telegram Bot API untuk interface pengguna.

**Status:** Active - Bot configured and ready to run
**Last Updated:** October 29, 2025

## Project Structure
```
.
├── index.js           # Main bot application
├── package.json       # Node.js dependencies
├── .env              # Environment variables (not committed)
├── .gitignore        # Git ignore rules
└── README.md         # Original project documentation
```

## Technology Stack
- **Runtime:** Node.js 20
- **Blockchain:** Web3.js v4.16.0
- **Bot Framework:** node-telegram-bot-api v0.66.0
- **Environment:** dotenv v17.2.3

## Configuration

### Required Environment Variables (.env)
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `PRIVATE_KEY` - Ethereum wallet private key (with or without 0x prefix)

### Optional Environment Variables
- `RPC_URL` - Sova Testnet RPC endpoint (default: https://rpc.testnet.sova.io)
- `CONTRACT_ADDRESS` - sovaBTC contract address (default: 0x5Db496debB227455cE9f482f9E443f1073a55456)
- `ALLOWED_USERS` - Comma-separated user IDs who can use the bot (empty = all users)

## Bot Commands
- `/start` - Welcome message and bot introduction
- `/mint` - Mint sovaBTC tokens (auto amount from contract)
- `/balance` - Check ETH balance on Sova Testnet
- `/info` - Display wallet and network information
- `/help` - Show help and usage guide

## Features
- ✅ Automatic mint eligibility checking (hasMinted status)
- ✅ Max supply validation before minting
- ✅ Gas estimation and optimization
- ✅ Real-time transaction status updates
- ✅ User authorization (optional whitelist)
- ✅ Multi-language support (Indonesian)

## Workflow
- **Telegram Bot** - Runs `npm start` to start the bot with console output

## Known Issues
### 409 Conflict Error
If you see "terminated by other getUpdates request" error, it means:
- Another instance of this bot is running elsewhere with the same token
- Solution: Stop other instances or wait for them to disconnect
- The bot is configured correctly - this is a Telegram API limitation (only one polling instance per token)

## Development Notes
- Bot uses polling mode to receive Telegram updates
- Web3 connects to Sova Testnet for blockchain interactions
- Transaction gas is automatically estimated with 20% safety margin
- All secrets are managed via .env file (not committed to git)

## Sova Testnet Information
- **Network:** Sova Testnet
- **RPC:** https://rpc.testnet.sova.io
- **Explorer:** https://explorer.testnet.sova.io
- **Contract:** 0x5Db496debB227455cE9f482f9E443f1073a55456

### Recent Updates
- Testnet minting limits have been implemented
- If balance shows zero, users can mint again
- Contract enforces one mint per address
- Max supply cap is now enforced

## Security
- Private keys are stored in .env (excluded from git)
- Optional user whitelist via ALLOWED_USERS
- All transactions signed locally before broadcast
