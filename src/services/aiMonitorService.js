
const logger = require('../utils/logger');

class AIMonitorService {
  constructor() {
    this.errorPatterns = new Map();
    this.errorHistory = [];
    this.maxHistorySize = 100;
  }

  analyzeError(error, context = {}) {
    const analysis = {
      errorType: this.classifyError(error),
      severity: this.determineSeverity(error),
      possibleCauses: this.identifyPossibleCauses(error, context),
      suggestedFixes: this.suggestFixes(error, context),
      preventionTips: this.getPreventionTips(error),
      timestamp: new Date().toISOString()
    };

    this.recordError(error, analysis);
    return analysis;
  }

  classifyError(error) {
    const errorMsg = error.message || String(error);
    
    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT')) {
      return 'Network/RPC Connection Error';
    }
    if (errorMsg.includes('insufficient funds') || errorMsg.includes('gas')) {
      return 'Insufficient Funds/Gas Error';
    }
    if (errorMsg.includes('nonce') || errorMsg.includes('already known')) {
      return 'Transaction Nonce Error';
    }
    if (errorMsg.includes('revert') || errorMsg.includes('execution reverted')) {
      return 'Smart Contract Revert Error';
    }
    if (errorMsg.includes('decrypt') || errorMsg.includes('encrypt')) {
      return 'Wallet Encryption Error';
    }
    if (errorMsg.includes('polling') || errorMsg.includes('EFATAL')) {
      return 'Telegram Polling Error';
    }
    if (errorMsg.includes('lock') || errorMsg.includes('ENOENT')) {
      return 'File System Error';
    }
    
    return 'General Application Error';
  }

  determineSeverity(error) {
    const errorMsg = error.message || String(error);
    
    if (errorMsg.includes('EFATAL') || errorMsg.includes('polling')) {
      return 'LOW'; // Auto-recoverable
    }
    if (errorMsg.includes('insufficient funds')) {
      return 'MEDIUM'; // Needs manual action
    }
    if (errorMsg.includes('PRIVATE_KEY') || errorMsg.includes('decrypt')) {
      return 'CRITICAL'; // Bot can't operate
    }
    
    return 'MEDIUM';
  }

  identifyPossibleCauses(error, context) {
    const errorMsg = error.message || String(error);
    const causes = [];

    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT')) {
      causes.push('RPC endpoint down atau tidak responsif');
      causes.push('Network connectivity issue');
      causes.push('Rate limiting dari RPC provider');
    }
    
    if (errorMsg.includes('insufficient funds')) {
      causes.push('Main wallet kehabisan ETH');
      causes.push('Wallet tidak ter-fund dengan cukup');
      causes.push('Gas price terlalu tinggi');
    }

    if (errorMsg.includes('nonce')) {
      causes.push('Multiple transactions dikirim bersamaan');
      causes.push('Transaction pending yang belum confirmed');
      causes.push('Nonce tidak tersinkronisasi');
    }

    if (errorMsg.includes('revert')) {
      causes.push('Wallet sudah pernah mint');
      causes.push('Contract conditions tidak terpenuhi');
      causes.push('Balance tidak cukup di contract');
    }

    if (errorMsg.includes('decrypt')) {
      causes.push('WALLET_ENCRYPTION_KEY salah atau berubah');
      causes.push('File wallet.json corrupt');
      causes.push('Format encryption berubah');
    }

    if (errorMsg.includes('EFATAL') || errorMsg.includes('polling')) {
      causes.push('Temporary network hiccup (normal)');
      causes.push('Telegram server sedang maintenance');
    }

    return causes.length > 0 ? causes : ['Error tidak spesifik, perlu investigasi manual'];
  }

  suggestFixes(error, context) {
    const errorMsg = error.message || String(error);
    const fixes = [];

    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT')) {
      fixes.push('✅ Cek status RPC endpoint: https://rpc.testnet.sova.io');
      fixes.push('✅ Gunakan /health command untuk verify koneksi');
      fixes.push('✅ Tunggu beberapa menit jika RPC overloaded');
      fixes.push('✅ Restart bot jika masalah berlanjut');
    }

    if (errorMsg.includes('insufficient funds')) {
      fixes.push('💰 Top up main wallet (0x3199782bcd48686B71dfaC8e74c16625f951Cc7F)');
      fixes.push('💰 Gunakan /collectgas untuk collect ETH dari wallets');
      fixes.push('💰 Cek balance dengan /balance command');
    }

    if (errorMsg.includes('nonce')) {
      fixes.push('⏸️ Tunggu pending transactions selesai');
      fixes.push('⏸️ Restart bot untuk reset nonce tracking');
      fixes.push('⏸️ Gunakan delay lebih lama antar transaksi');
    }

    if (errorMsg.includes('revert')) {
      if (errorMsg.includes('Already minted')) {
        fixes.push('✅ Wallet sudah pernah mint - NORMAL');
        fixes.push('✅ Gunakan /archivecompleted untuk cleanup');
        fixes.push('✅ Tidak perlu action, skip wallet ini');
      } else {
        fixes.push('🔍 Cek contract state dengan blockchain explorer');
        fixes.push('🔍 Verify wallet memenuhi syarat mint');
        fixes.push('🔍 Cek apakah faucet masih aktif');
      }
    }

    if (errorMsg.includes('decrypt')) {
      fixes.push('🔑 Verify WALLET_ENCRYPTION_KEY di Replit Secrets');
      fixes.push('🔑 Restore dari backup jika key hilang');
      fixes.push('🔑 Gunakan /listbackups untuk cek backup available');
    }

    if (errorMsg.includes('EFATAL') || errorMsg.includes('polling')) {
      fixes.push('✅ Ini normal network hiccup - bot auto-recover');
      fixes.push('✅ Tidak perlu action, akan resolved sendiri');
    }

    return fixes.length > 0 ? fixes : ['🔧 Cek logs detail di logs/error.log', '🔧 Contact developer jika persistent'];
  }

  getPreventionTips(error) {
    const errorMsg = error.message || String(error);
    const tips = [];

    if (errorMsg.includes('insufficient funds')) {
      tips.push('💡 Monitor balance regular dengan /balance');
      tips.push('💡 Set alert ketika balance < 0.01 ETH');
    }

    if (errorMsg.includes('nonce')) {
      tips.push('💡 Gunakan delay antar batch transactions');
      tips.push('💡 Jangan run multiple instances bot');
    }

    if (errorMsg.includes('ECONNREFUSED')) {
      tips.push('💡 Gunakan backup RPC endpoint jika ada');
      tips.push('💡 Monitor RPC health secara berkala');
    }

    return tips;
  }

  recordError(error, analysis) {
    this.errorHistory.push({
      error: error.message || String(error),
      analysis,
      timestamp: new Date().toISOString()
    });

    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    const errorKey = analysis.errorType;
    const count = this.errorPatterns.get(errorKey) || 0;
    this.errorPatterns.set(errorKey, count + 1);
  }

  getErrorStats() {
    const stats = {
      totalErrors: this.errorHistory.length,
      recentErrors: this.errorHistory.slice(-10),
      errorsByType: Object.fromEntries(this.errorPatterns),
      criticalErrors: this.errorHistory.filter(e => e.analysis.severity === 'CRITICAL').length
    };

    return stats;
  }

  formatAnalysisForTelegram(analysis, error) {
    let message = `🚨 *Error Detected & Analyzed*\n\n`;
    message += `❌ *Error Type:* ${analysis.errorType}\n`;
    message += `⚠️ *Severity:* ${analysis.severity}\n\n`;
    
    if (analysis.possibleCauses.length > 0) {
      message += `🔍 *Possible Causes:*\n`;
      analysis.possibleCauses.forEach(cause => {
        message += `  • ${cause}\n`;
      });
      message += `\n`;
    }

    if (analysis.suggestedFixes.length > 0) {
      message += `💊 *Suggested Fixes:*\n`;
      analysis.suggestedFixes.forEach(fix => {
        message += `${fix}\n`;
      });
      message += `\n`;
    }

    if (analysis.preventionTips.length > 0) {
      message += `🛡️ *Prevention Tips:*\n`;
      analysis.preventionTips.forEach(tip => {
        message += `${tip}\n`;
      });
    }

    message += `\n⏰ Time: ${new Date(analysis.timestamp).toLocaleString('id-ID')}`;

    return message;
  }
}

module.exports = new AIMonitorService();
