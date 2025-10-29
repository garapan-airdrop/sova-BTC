
# Sova BTC Telegram Bot

## Overview
Telegram bot untuk minting, distribusi, dan faucet sovaBTC token di Sova Testnet. Bot ini menggunakan Web3.js untuk berinteraksi dengan smart contract sovaBTC dan Telegram Bot API untuk interface pengguna.

**Status:** ✅ Active - Bot configured and ready to run
**Last Updated:** 29/19/25
**Version:** 2.1 (With Faucet System & User-Friendly Transfer)

## Recent Changes (Latest Version)

### New Features
- ✅ **Public Faucet System** - Users can claim sovaBTC tokens daily
- ✅ **Daily Claim Tracking** - One claim per user per day with automatic reset
- ✅ **User-Friendly Transfer** - Transfer command now accepts sovaBTC amounts directly (e.g., `/transfer <address> 5` instead of smallest units)
- ✅ **Claims Database** - Persistent claim tracking in claims.json
- ✅ **User State Management** - Interactive faucet flow with address validation

### Bug Fixes
- ✅ Fixed balance check BigInt comparison bug in `/mint` command
- ✅ Added proper cleanup for temporary wallets in finally blocks (prevents memory leaks)
- ✅ Fixed ALLOWED_USERS parsing to trim whitespace from user IDs
- ✅ Improved error handling across all commands
- ✅ Fixed transfer command to accept decimal amounts in sovaBTC

### Improvements
- ✅ Added security warnings for ALLOWED_USERS and wallet.json at startup
- ✅ Added helper functions for better code organization (hasMinimumBalance, addTemporaryWallet, removeTemporaryWallet)
- ✅ Improved error messages and logging throughout
- ✅ Better try-catch blocks to prevent crashes
- ✅ Added graceful shutdown handlers (SIGINT, SIGTERM)
- ✅ Comprehensive input validation for all admin commands
- ✅ Support for decimal amounts in transfer command (0.5, 1.25, etc.)

### Security Enhancements
- ✅ Console warnings when ALLOWED_USERS is empty (all users can access admin commands)
- ✅ Console warnings about unencrypted wallet.json storage
- ✅ Proper .gitignore to prevent committing sensitive files
- ✅ Self-transfer prevention in /transfer command
- ✅ Dual authorization system (admin vs public users)

## Project Structure
```
.
├── index.js           # Main bot application (improved v2.1)
├── package.json       # Node.js dependencies
├── .env              # Environment variables (managed by Replit Secrets)
├── .gitignore        # Git ignore rules (protects sensitive files)
├── wallet.json        # Multi-wallet data (auto-created, not committed)
├── claims.json        # Daily claim tracking (auto-created, not committed)
├── replit.md         # Detailed project documentation
└── README.md         # This file
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
- `/transfer <address> <amount>` - Transfer sovaBTC to any address
  - **New Format:** Amount in sovaBTC (not smallest unit)
  - Example: `/transfer 0x742d35...f0bEb 5` (sends 5 sovaBTC)
  - Example: `/transfer 0x742d35...f0bEb 0.5` (sends 0.5 sovaBTC)
  - Supports decimal amounts

**Multi-Wallet Mass Minting:**
- `/createwallets <count>` - Create multiple wallets (max 100) and save to wallet.json
- `/fundwallets` - Transfer 0.001 ETH gas fee from main wallet to all created wallets
- `/mintall` - Automatically mint sovaBTC from all wallets that haven't minted yet
- `/collectall` - Collect all sovaBTC from wallets back to main wallet
- `/collectgas` - Collect remaining ETH gas from wallets back to main wallet
- `/walletstatus` - Check status and balances of all created wallets

## Features

### Core Features
- ✅ Automatic mint eligibility checking (hasMinted status)
- ✅ Max supply validation before minting
- ✅ Gas estimation and optimization
- ✅ Real-time transaction status updates
- ✅ User authorization system (admin whitelist)
- ✅ Multi-language support (Indonesian)

### Faucet System
- ✅ Public faucet for daily token claims
- ✅ Daily claim limits (1 claim per user per day)
- ✅ Automatic reset at 00:00 WIB
- ✅ Address validation for security
- ✅ Claim history tracking
- ✅ User-friendly interactive flow

### Mass Minting System
- ✅ Multi-wallet mass minting automation
- ✅ Automatic wallet creation and management
- ✅ Batch funding and minting operations
- ✅ Token collection to main wallet
- ✅ Gas collection to main wallet

### Technical Features
- ✅ Proper error handling and recovery
- ✅ Memory leak prevention with cleanup
- ✅ BigInt support for precise calculations
- ✅ Decimal amount support in transfers
- ✅ Self-transfer prevention

## Usage Examples

### For Public Users

**Claim Daily Tokens:**
1. Send `/faucet` to the bot
2. Bot will ask for your wallet address
3. Send your EVM wallet address (e.g., `0x742d35...`)
4. Receive sovaBTC tokens instantly
5. Come back tomorrow for next claim

### For Admins

**Transfer Tokens (New Easy Format):**
```
/transfer 0x3FAD363a36A7d89D93C6a478BbF18B53191145F2 5
```
Sends 5 sovaBTC

```
/transfer 0x3FAD363a36A7d89D93C6a478BbF18B53191145F2 0.5
```
Sends 0.5 sovaBTC

**Mass Minting Workflow:**
1. Create wallets: `/createwallets 10`
2. Fund wallets: `/fundwallets`
3. Mint from all: `/mintall`
4. Check status: `/walletstatus`
5. Collect tokens: `/collectall`
6. Collect gas: `/collectgas`

## Workflow
- **Telegram Bot** - Runs `npm start` to start the bot with console output
- **Output Type:** Console (backend service, no web interface)

## Security Best Practices

### Current Security Status
- ✅ Secrets stored in Replit Secrets (not in code)
- ✅ .gitignore protects sensitive files
- ✅ Dual authorization (admin vs public users)
- ⚠️ wallet.json stores private keys in plaintext (by design for automation)
- ⚠️ claims.json tracks user claims (non-sensitive)
- ⚠️ Recommendation: Keep Repl private, never share wallet.json

### Admin Access Control
When `ALLOWED_USERS` is empty, **ALL** users can access admin commands. For production:
1. Get your Telegram User ID: Send `/start` to the bot
2. Add to Replit Secrets: `ALLOWED_USERS=your_user_id`
3. Restart the bot

Example: `ALLOWED_USERS=123456789,987654321` (multiple admins)

### Faucet Configuration
- Default claim amount: 0.001 sovaBTC
- Claim limit: 1x per day per user
- Reset time: 00:00 WIB daily
- Main wallet must have sufficient sovaBTC and ETH

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

### Claims.json
**Status:** Automatically managed by bot
**Content:** Non-sensitive user claim history
**Reset:** Daily at 00:00 WIB (automatic)

## Development Notes
- Bot uses polling mode to receive Telegram updates
- Web3 connects to Sova Testnet for blockchain interactions
- Transaction gas automatically estimated with 20% safety margin
- All secrets managed via Replit Secrets (no .env commit)
- Temporary wallets properly cleaned up after use
- Claims tracked in claims.json with daily reset
- Transfer amounts converted from sovaBTC to smallest unit automatically

## Sova Testnet Information
- **Network:** Sova Testnet
- **RPC:** https://rpc.testnet.sova.io
- **Explorer:** https://explorer.testnet.sova.io
- **Contract:** 0x5Db496debB227455cE9f482f9E443f1073a55456
- **Decimals:** 8

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
5. Check claims.json for user claim history

### Transfer Command Issues
1. Ensure amount is in sovaBTC format (not smallest unit)
2. Use decimal notation (e.g., 0.5, 1.25, 5)
3. Check balance is sufficient
4. Verify recipient address is valid
5. Cannot transfer to own address

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
7. Implement claim amount customization
8. Add referral system for faucet
9. Weekly/monthly claim statistics

## Support
For issues or questions:
1. Check logs for error details
2. Review troubleshooting section
3. Verify all secrets are correctly set
4. Ensure wallet has sufficient funds
5. Check replit.md for detailed documentation

## License
This project is for educational and testing purposes on Sova Testnet.

---

**Maintained by:** Replit Community
**Bot Type:** Faucet & Admin Management
**Network:** Sova Testnet Only
