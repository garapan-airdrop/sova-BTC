
# Sova BTC Telegram Bot

🤖 Advanced Telegram bot for managing sovaBTC token operations on Sova Testnet with multi-wallet support, daily check-ins, and Sova Prime vault integration.

[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](https://github.com/yourusername/sova-btc-bot)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 🌟 Features

### Core Functionality
- ✅ **Single Wallet Operations** - Mint, transfer, and manage sovaBTC from main wallet
- ✅ **Multi-Wallet Management** - Create up to 100 wallets per batch for mass operations
- ✅ **Mass Minting** - Automated minting from multiple wallets with progress tracking
- ✅ **Token Collection** - Gather sovaBTC and ETH from all wallets with 5% creator reward
- ✅ **Daily Check-in System** - Earn points through Sova API integration
- ✅ **Sova Prime Vault** - Deposit spBTC to earn yield (ERC-4626 compatible)

### Security
- 🔐 **AES-256-GCM Encryption** - Military-grade encryption for wallet private keys
- 🔐 **HMAC Signatures** - Data integrity protection for claims history
- 🔐 **Environment Validation** - Startup checks for required secrets
- 🔐 **Admin Authorization** - User ID-based access control
- 🔐 **Automated Backups** - Auto-backup with 5-backup rotation

### Performance
- ⚡ **Async File Operations** - Non-blocking I/O for better concurrency
- ⚡ **File Locking** - Race condition prevention with proper-lockfile
- ⚡ **Rate Limiting** - Bottleneck integration for API protection
- ⚡ **Progress Tracking** - Real-time status updates with terminal spinners

## 📋 Table of Contents

- [Installation](#-installation)
- [Configuration](#-configuration)
- [Bot Commands](#-bot-commands)
- [Vault Integration](#-vault-integration)
- [Architecture](#-architecture)
- [Security Notes](#-security-notes)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🚀 Installation

### Prerequisites
- Node.js >= 20.0.0
- Telegram Bot Token (from @BotFather)
- Ethereum wallet with testnet ETH
- Replit account (recommended) or local Node.js environment

### Quick Start

1. **Clone or Fork this Repl**

2. **Configure Environment Variables** (Replit Secrets)

Required:
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
PRIVATE_KEY=your_wallet_private_key
WALLET_ENCRYPTION_KEY=generate_32_byte_hex_string
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. **Optional Configuration**
```bash
# Network Configuration
RPC_URL=https://rpc.testnet.sova.io
CONTRACT_ADDRESS=0x5Db496debB227455cE9f482f9E443f1073a55456

# Admin Access (comma-separated Telegram user IDs)
ALLOWED_USERS=123456789,987654321

# Vault Configuration (for Sova Prime integration)
SPBTC_CONTRACT=0x5Db496debB227455cE9f482f9E443f1073a55456
CONDUIT_CONTRACT=0x3b5b1c8d1acf8e253c06b7a6e77d1cade71d6b3f
MODULE_CONTRACT=0x4aB31F7ad938188E3F2e9c106697a52B13650906
VAULT_NETWORK=sova-sepolia
```

4. **Start the Bot**
```bash
npm start
```

Or click the **Run** button in Replit.

## ⚙️ Configuration

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | - | Bot token from @BotFather |
| `PRIVATE_KEY` | ✅ | - | Main wallet private key (with 0x prefix) |
| `WALLET_ENCRYPTION_KEY` | ✅ | - | 32-byte hex for encrypting wallet data |
| `RPC_URL` | ❌ | Sova Testnet RPC | Blockchain RPC endpoint |
| `CONTRACT_ADDRESS` | ❌ | sovaBTC contract | Token contract address |
| `ALLOWED_USERS` | ❌ | None | Admin user IDs (comma-separated) |
| `AMOUNT` | ❌ | 100000000 | Mint amount (1 sovaBTC = 10^8 units) |
| `SPBTC_CONTRACT` | ❌ | - | spBTC token address for vault |
| `CONDUIT_CONTRACT` | ❌ | - | Vault contract address |
| `MODULE_CONTRACT` | ❌ | - | Module contract for approvals |
| `VAULT_NETWORK` | ❌ | - | Network name (sova-sepolia, sepolia) |

### Network Support

The bot supports multiple networks:
- **Sova Sepolia Testnet** (default)
- **Ethereum Sepolia**
- Custom networks via RPC_URL

## 📱 Bot Commands

### Public Commands (All Users)

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message and bot overview | `/start` |
| `/help` | Complete command guide | `/help` |
| `/faucet` | Claim free sovaBTC (1x per day) | `/faucet` |

### Admin Commands (Single Wallet)

| Command | Description | Example |
|---------|-------------|---------|
| `/mint` | Mint sovaBTC from main wallet | `/mint` |
| `/balance` | Check ETH & sovaBTC balance | `/balance` |
| `/info` | Wallet and network information | `/info` |
| `/transfer <address> <amount>` | Transfer sovaBTC to address | `/transfer 0x742d35... 5` |

### Multi-Wallet Operations

| Command | Description | Example |
|---------|-------------|---------|
| `/createwallets <n>` | Create n wallets (max 100) | `/createwallets 10` |
| `/fundwallets` | Send 0.001 ETH to all wallets | `/fundwallets` |
| `/mintall` | Mass mint from all eligible wallets | `/mintall` |
| `/collectall` | Collect sovaBTC to main wallet | `/collectall` |
| `/collectgas` | Collect ETH gas to main wallet | `/collectgas` |
| `/walletstatus` | Status & balance of all wallets | `/walletstatus` |
| `/archivecompleted` | Archive completed wallets | `/archivecompleted` |

### Check-in System

| Command | Description | Example |
|---------|-------------|---------|
| `/checkin` | Daily check-in for main wallet | `/checkin` |
| `/checkinall` | Mass check-in for all wallets | `/checkinall` |
| `/checkinwallet <address>` | Check-in specific wallet | `/checkinwallet 0x...` |
| `/checkinstatus` | View check-in statistics | `/checkinstatus` |

### Backup & Recovery

| Command | Description | Example |
|---------|-------------|---------|
| `/listbackups` | List available backups | `/listbackups` |
| `/restorebackup <n>` | Restore from backup | `/restorebackup 1` |

### Vault Operations (Sova Prime)

| Command | Description | Example |
|---------|-------------|---------|
| `/vaultinfo` | Vault stats and your position | `/vaultinfo` |
| `/vaultdeposit <amount>` | Deposit spBTC to earn yield | `/vaultdeposit 1.5` |
| `/vaultwithdraw <shares>` | Withdraw shares from vault | `/vaultwithdraw 0.5` |

## 🏦 Vault Integration

### What is Sova Prime Vault?

Sova Prime is an ERC-4626 compliant vault that enables users to earn yield on their spBTC holdings through automated market-neutral BTC strategies.

### How It Works

1. **Deposit**: User deposits spBTC → Receives vault shares
2. **Earn**: Vault executes yield strategies automatically
3. **Withdraw**: User redeems shares → Receives spBTC + yield

### Setup Vault Integration

```bash
# Add to Replit Secrets
SPBTC_CONTRACT=0x5Db496debB227455cE9f482f9E443f1073a55456
CONDUIT_CONTRACT=0x3b5b1c8d1acf8e253c06b7a6e77d1cade71d6b3f
MODULE_CONTRACT=0x4aB31F7ad938188E3F2e9c106697a52B13650906
VAULT_NETWORK=sova-sepolia
```

### Vault Commands Usage

```bash
# Check vault information
/vaultinfo

# Deposit 1.5 spBTC
/vaultdeposit 1.5

# Withdraw 0.5 shares
/vaultwithdraw 0.5
```

## 🏗️ Architecture

### Project Structure

```
├── src/
│   ├── commands/          # Telegram command handlers
│   │   ├── publicCommands.js    # User-facing commands
│   │   ├── adminCommands.js     # Admin-only commands
│   │   ├── walletCommands.js    # Multi-wallet operations
│   │   ├── checkinCommands.js   # Check-in system
│   │   └── vaultCommands.js     # Vault integration
│   ├── services/          # Business logic
│   │   ├── web3Service.js       # Blockchain interaction
│   │   ├── walletService.js     # Wallet management
│   │   ├── claimsService.js     # Faucet claims tracking
│   │   ├── checkinService.js    # Sova API integration
│   │   └── vaultService.js      # Vault operations
│   ├── utils/             # Helper functions
│   │   ├── crypto.js            # Encryption utilities
│   │   ├── formatters.js        # Number formatting
│   │   ├── validators.js        # Input validation
│   │   ├── logger.js            # Winston logger
│   │   ├── terminal.js          # Console UI
│   │   ├── telegram.js          # Message helpers
│   │   └── envValidator.js      # Env validation
│   ├── middleware/        # Express-like middleware
│   │   └── auth.js              # Authorization
│   └── config/            # Configuration
│       └── constants.js         # App constants
├── backups/               # Auto-generated backups
├── logs/                  # Winston logs
├── index.js               # Entry point
├── package.json           # Dependencies
└── README.md              # This file
```

### Data Files

The bot creates encrypted data files:

- `wallet.json` - Encrypted wallet storage (AES-256-GCM)
- `minted_wallets.json` - Archived completed wallets
- `claims.json` - Faucet claim history (HMAC signed)
- `backups/` - Auto-backups (5 most recent kept)

⚠️ **Never commit these files to Git!** They are automatically gitignored.

### Technology Stack

- **Runtime**: Node.js 20+
- **Blockchain**: Web3.js 4.x
- **Bot Framework**: node-telegram-bot-api
- **Encryption**: Node.js crypto (AES-256-GCM, HMAC-SHA256)
- **Logging**: Winston
- **Rate Limiting**: Bottleneck
- **File Locking**: proper-lockfile
- **HTTP Client**: Axios
- **Terminal UI**: Chalk, Ora

## 🔒 Security Notes

### Best Practices

1. **Never Share Your Private Keys**
   - Keep `PRIVATE_KEY` and `WALLET_ENCRYPTION_KEY` secret
   - Don't commit `.env` or data files to Git
   - Use Replit Secrets for sensitive data

2. **Admin Access Control**
   - Always set `ALLOWED_USERS` in production
   - Use your Telegram user ID only
   - Get user ID from bot: `/start`

3. **Testnet Only**
   - Use testnet wallets (Sepolia ETH)
   - Never use mainnet wallets
   - Test thoroughly before any mainnet deployment

4. **Backup Your Data**
   - Bot auto-backups every save
   - Manual backups: copy `wallet.json` externally
   - Use `/listbackups` and `/restorebackup` for recovery

### Security Features

- ✅ AES-256-GCM authenticated encryption
- ✅ HMAC-SHA256 data signatures
- ✅ Startup environment validation
- ✅ File locking for concurrency
- ✅ Rate limiting (30 msg/min)
- ✅ Auto-backup with rotation

## 🐛 Troubleshooting

### Common Issues

**Bot won't start**
```
Error: Environment validation failed
```
**Solution**: Set all required environment variables in Replit Secrets.

**Vault commands not working**
```
❌ Vault Service Unavailable
```
**Solution**: Configure vault environment variables (SPBTC_CONTRACT, CONDUIT_CONTRACT).

**"Insufficient ETH for gas"**
```
❌ Balance ETH tidak cukup untuk gas fee!
```
**Solution**: Add testnet ETH to your main wallet from a faucet.

**"Already minted"**
```
❌ Wallet ini sudah pernah mint!
```
**Solution**: Each wallet can only mint once (contract rule).

### Debug Mode

Enable detailed logging:
```bash
# Check logs/combined.log for errors
tail -f logs/combined.log

# Check console output in Replit
```

### Getting Help

1. Check [SECURITY.md](SECURITY.md) for security guidelines
2. Review bot logs in `logs/` directory
3. Test with `/help` command
4. Verify environment variables

## 📊 Performance Metrics

- **Concurrency**: Supports up to 100 wallets
- **Rate Limit**: 30 messages/minute (configurable)
- **File Operations**: Async (non-blocking)
- **Backup Rotation**: Last 5 backups kept
- **Transaction Delay**: 1000ms between operations

## 🔄 Update History

### Version 2.2.0 (November 2025)
- ✅ Sova Prime vault integration (ERC-4626)
- ✅ Auto-backup system with rotation
- ✅ Enhanced error handling
- ✅ Network-configurable vault service
- ✅ Graceful degradation when vault not configured
- ✅ Admin notification system

### Version 2.1.0
- ✅ AES-256-GCM encryption upgrade
- ✅ HMAC signature verification
- ✅ Environment validation
- ✅ Async file operations
- ✅ Check-in system integration

### Version 2.0.0
- ✅ Multi-wallet support
- ✅ Mass minting feature
- ✅ Wallet archiving
- ✅ Creator reward system (5%)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Sova Network** - Blockchain infrastructure
- **Telegram Bot API** - Bot framework
- **Web3.js** - Ethereum integration
- **Community** - Testing and feedback

## 🔗 Links

- [Sova Testnet Explorer](https://explorer.testnet.sova.io)
- [Sova Prime Documentation](https://docs.sova.io/sova-prime)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Web3.js Documentation](https://web3js.readthedocs.io)

---

**Made with ❤️ by Hokireceh & Team**

**⚠️ Disclaimer**: This bot is for educational and testing purposes on testnet only. Use at your own risk.
