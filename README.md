# Sova BTC Telegram Bot

## Overview
Telegram bot untuk minting dan distribusi sovaBTC token di Sova Testnet. Bot ini menggunakan Web3.js untuk berinteraksi dengan smart contract sovaBTC dan Telegram Bot API untuk interface pengguna.

**Status:** ✅ Active - Bot configured and ready to run
**Last Updated:** October 29, 2025
**Version:** 2.0 (Improved with bug fixes and security enhancements)

## Recent Changes (October 29, 2025)

### New Features
- ✅ Added `/transfer` command for admin to transfer sovaBTC to any address
- ✅ Enhanced `/balance` command to show both ETH and sovaBTC balance

### Bug Fixes
- ✅ Fixed balance check BigInt comparison bug in `/mint` command
- ✅ Added proper cleanup for temporary wallets in finally blocks (prevents memory leaks)
- ✅ Fixed ALLOWED_USERS parsing to trim whitespace from user IDs
- ✅ Improved error handling across all commands

### Improvements
- ✅ Added security warnings for ALLOWED_USERS and wallet.json at startup
- ✅ Added helper functions for better code organization (hasMinimumBalance, addTemporaryWallet, removeTemporaryWallet)
- ✅ Improved error messages and logging throughout
- ✅ Better try-catch blocks to prevent crashes
- ✅ Added graceful shutdown handlers (SIGINT, SIGTERM)
- ✅ Comprehensive input validation for all admin commands

### Security Enhancements
- ✅ Console warnings when ALLOWED_USERS is empty (all users can access admin commands)
- ✅ Console warnings about unencrypted wallet.json storage
- ✅ Proper .gitignore to prevent committing sensitive files
- ✅ Self-transfer prevention in /transfer command

## Project Structure
```
.
├── index.js           # Main bot application (improved v2.0)
├── package.json       # Node.js dependencies
├── .env              # Environment variables (managed by Replit Secrets)
├── .gitignore        # Git ignore rules (protects sensitive files)
├── wallet.json        # Multi-wallet data (auto-created, not committed)
├── claims.json        # Daily claim tracking (auto-created, not committed)
└── replit.md         # Project documentation
```

## Technology Stack
- **Runtime:** Node.js 20
- **Blockchain:** Web3.js v4.16.0
- **Bot Framework:** node-telegram-bot-api v0.66.0
- **Environment:** dotenv v17.2.3
- **Network:** Sova Testnet

## Configuration

### Required Secrets (Replit Secrets)
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather on Telegram
- `PRIVATE_KEY` - Ethereum wallet private key for main faucet wallet (with or without 0x prefix)

### Optional Environment Variables
- `RPC_URL` - Sova Testnet RPC endpoint (default: https://rpc.testnet.sova.io)
- `CONTRACT_ADDRESS` - sovaBTC contract address (default: 0x5Db496debB227455cE9f482f9E443f1073a55456)
- `ALLOWED_USERS` - Comma-separated Telegram user IDs for admin access (empty = all users)

⚠️ **Security Note:** For production use, ALWAYS set ALLOWED_USERS to restrict admin access!

## Bot Commands

### Public Commands (All Users)
- `/start` - Welcome message and bot introduction
- `/help` - Show help and usage guide
- `/faucet` - Claim sovaBTC tokens (1x per day limit)

### Admin Commands (Restricted)
**Single Wallet:**
- `/mint` - Mint sovaBTC from main wallet (auto amount from contract)
- `/balance` - Check ETH and sovaBTC balance on Sova Testnet
- `/info` - Display wallet and network information
- `/transfer <address> <amount>` - Transfer sovaBTC to any address (amount in smallest unit, 8 decimals)

**Multi-Wallet Mass Minting:**
- `/createwallets <count>` - Create multiple wallets (max 100) and save to wallet.json
- `/fundwallets` - Transfer 0.001 ETH gas fee from main wallet to all created wallets
- `/mintall` - Automatically mint sovaBTC from all wallets that haven't minted yet
- `/collectall` - Collect all sovaBTC from wallets back to main wallet
- `/collectgas` - Collect remaining ETH gas from wallets back to main wallet
- `/walletstatus` - Check status and balances of all created wallets

## Features
- ✅ Automatic mint eligibility checking (hasMinted status)
- ✅ Max supply validation before minting
- ✅ Gas estimation and optimization
- ✅ Real-time transaction status updates
- ✅ User authorization system (admin whitelist)
- ✅ Multi-language support (Indonesian)
- ✅ Multi-wallet mass minting automation
- ✅ Automatic wallet creation and management
- ✅ Batch funding and minting operations
- ✅ Token collection to main wallet
- ✅ Daily claim limits for faucet users
- ✅ Proper error handling and recovery
- ✅ Memory leak prevention with cleanup

## Workflow
- **Telegram Bot** - Runs `npm start` to start the bot with console output
- **Output Type:** Console (backend service, no web interface)

## Security Best Practices

### Current Security Status
- ✅ Secrets stored in Replit Secrets (not in code)
- ✅ .gitignore protects sensitive files
- ⚠️ wallet.json stores private keys in plaintext (by design for automation)
- ⚠️ Recommendation: Keep Repl private, never share wallet.json

### Admin Access Control
When `ALLOWED_USERS` is empty, **ALL** users can access admin commands. For production:
1. Get your Telegram User ID: Send `/start` to the bot
2. Add to Replit Secrets: `ALLOWED_USERS=your_user_id`
3. Restart the bot

Example: `ALLOWED_USERS=123456789,987654321` (multiple admins)

## Known Issues & Solutions

### 409 Conflict Error
**Issue:** "terminated by other getUpdates request" error
**Cause:** Another instance of bot running with same token
**Solution:** Stop other instances or wait for them to disconnect

### Wallet.json Security
**Issue:** Private keys stored unencrypted in wallet.json
**Status:** By design for mass minting automation
**Mitigation:** 
- Keep Repl private
- Don't commit to public repos
- Use separate wallet for faucet operations
- Don't store large amounts of funds

## Development Notes
- Bot uses polling mode to receive Telegram updates
- Web3 connects to Sova Testnet for blockchain interactions
- Transaction gas automatically estimated with 20% safety margin
- All secrets managed via Replit Secrets (no .env commit)
- Temporary wallets properly cleaned up after use
- Claims tracked in claims.json with daily reset at 00:00 WIB

## Sova Testnet Information
- **Network:** Sova Testnet
- **RPC:** https://rpc.testnet.sova.io
- **Explorer:** https://explorer.testnet.sova.io
- **Contract:** 0x5Db496debB227455cE9f482f9E443f1073a55456

## Troubleshooting

### Bot Not Responding
1. Check workflow is running (should show "RUNNING" status)
2. Verify TELEGRAM_BOT_TOKEN is set in Replit Secrets
3. Check logs for error messages
4. Ensure no other instance is using same bot token

### Transaction Failures
1. Check main wallet has sufficient ETH for gas
2. Verify contract address is correct
3. Check if address already minted (hasMinted = true)
4. Check if MAX_SUPPLY reached
5. Review transaction on explorer for details

### Faucet Claims Not Working
1. Verify user hasn't claimed today (1x per day limit)
2. Check main wallet has sovaBTC tokens
3. Check main wallet has ETH for gas fees
4. Review error message for specific issue

## User Preferences
- Language: Indonesian
- Bot responses: Friendly and informative with emojis
- Error messages: Clear with possible solutions
- Status updates: Real-time progress for long operations

## Future Improvements (Recommendations)
1. Consider encrypting wallet.json for added security
2. Add database support for better claims tracking
3. Implement rate limiting for API calls
4. Add metrics and monitoring
5. Support multiple languages
6. Add webhook mode option (instead of polling)

## Support
For issues or questions:
1. Check logs for error details
2. Review troubleshooting section
3. Verify all secrets are correctly set
4. Ensure wallet has sufficient funds
