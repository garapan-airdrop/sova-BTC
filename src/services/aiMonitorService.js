
const logger = require('../utils/logger');

class AIMonitorService {
  constructor() {
    this.errorPatterns = new Map();
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.groqApiKey = process.env.GROQ_API_KEY || null;
    this.groqModels = [
      {
        name: 'llama-3.3-70b-versatile',
        dailyLimit: 1000,
        quality: 10,
        description: 'Premium Quality (10/10)'
      },
      {
        name: 'llama-3.1-8b-instant',
        dailyLimit: 14400,


  getCacheKey(errorMsg, context) {
    const contextStr = JSON.stringify(context);
    return `${errorMsg.substring(0, 100)}_${contextStr.substring(0, 50)}`;
  }

        quality: 7,
        description: 'Standard Quality (7/10)'
      }
    ];
    this.currentModelIndex = 0;
    this.analysisCache = new Map(); // Cache untuk error yang sama
    this.cacheExpiry = 3600000; // 1 jam
    this.rateLimitRetry = 3;
  }

  async analyzeErrorWithGroq(error, context = {}) {
    if (!this.groqApiKey) {
      logger.warn('GROQ_API_KEY not set, using rule-based analysis');
      return this.analyzeError(error, context);
    }

    const errorMsg = error.message || String(error);
    
    // Check cache first
    const cacheKey = this.getCacheKey(errorMsg, context);
    const cached = this.analysisCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
      logger.info('Using cached AI analysis', { errorType: cached.analysis.errorType });
      return cached.analysis;
    }

    try {
      const prompt = `Analyze this error from a Telegram bot for sovaBTC faucet:

Error: ${errorMsg}
Context: ${JSON.stringify(context)}

Provide:
1. Error Type (one line)
2. Severity (CRITICAL/MEDIUM/LOW)
3. Possible Causes (max 3 bullet points)
4. Suggested Fixes (max 3 actionable steps)
5. Prevention Tips (max 2 tips)

Keep response concise and in Bahasa Indonesia.`;

      const model = this.groqModels[this.currentModelIndex];
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model.name,
          messages: [
            {
              role: 'system',
              content: 'You are an expert blockchain developer assistant specializing in Ethereum, Web3, and Telegram bots. Provide concise, actionable advice in Bahasa Indonesia.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit, try next model
          this.currentModelIndex = (this.currentModelIndex + 1) % this.groqModels.length;
          logger.warn(`Rate limited on ${model.name}, switching to next model`);
          return await this.analyzeErrorWithGroq(error, context);
        }
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;

      // Parse AI response
      const analysis = this.parseGroqResponse(aiResponse, error);
      this.recordError(error, analysis);

      // Store in cache
      this.analysisCache.set(cacheKey, {
        analysis,
        timestamp: Date.now()
      });

      logger.info('Error analyzed with Groq AI', { 
        model: model.name,
        errorType: analysis.errorType 
      });

      return analysis;

    } catch (groqError) {
      logger.error('Groq AI analysis failed, falling back to rule-based', { 
        error: groqError.message 
      });
      return this.analyzeError(error, context);
    }
  }

  parseGroqResponse(aiResponse, error) {
    const lines = aiResponse.split('\n').filter(l => l.trim());
    
    return {
      errorType: this.extractSection(lines, 'Error Type', 'type') || this.classifyError(error),
      severity: this.extractSection(lines, 'Severity', 'severity') || this.determineSeverity(error),
      possibleCauses: this.extractBullets(lines, 'Possible Causes') || this.identifyPossibleCauses(error, {}),
      suggestedFixes: this.extractBullets(lines, 'Suggested Fixes') || this.suggestFixes(error, {}),
      preventionTips: this.extractBullets(lines, 'Prevention') || this.getPreventionTips(error),
      timestamp: new Date().toISOString(),
      aiGenerated: true
    };
  }

  extractSection(lines, keyword, type = 'text') {
    const line = lines.find(l => l.includes(keyword));
    if (!line) return null;
    
    if (type === 'severity') {
      if (line.includes('CRITICAL')) return 'CRITICAL';
      if (line.includes('MEDIUM')) return 'MEDIUM';
      if (line.includes('LOW')) return 'LOW';
    }
    
    return line.split(':')[1]?.trim() || null;
  }

  extractBullets(lines, keyword) {
    const startIdx = lines.findIndex(l => l.includes(keyword));
    if (startIdx === -1) return [];
    
    const bullets = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\d+\./) || line.startsWith('-') || line.startsWith('•')) {
        bullets.push(line.replace(/^[\d\.\-•]\s*/, '').trim());
      } else if (bullets.length > 0 && !line) {
        break;
      }
    }
    
    return bullets.length > 0 ? bullets : null;
  }

  analyzeError(error, context = {}) {
    const analysis = {
      errorType: this.classifyError(error),
      severity: this.determineSeverity(error),
      possibleCauses: this.identifyPossibleCauses(error, context),
      suggestedFixes: this.suggestFixes(error, context),
      preventionTips: this.getPreventionTips(error),
      timestamp: new Date().toISOString(),
      aiGenerated: false
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
      return 'LOW';
    }
    if (errorMsg.includes('insufficient funds')) {
      return 'MEDIUM';
    }
    if (errorMsg.includes('PRIVATE_KEY') || errorMsg.includes('decrypt')) {
      return 'CRITICAL';
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
      fixes.push('💰 Top up main wallet');
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
      criticalErrors: this.errorHistory.filter(e => e.analysis.severity === 'CRITICAL').length,
      aiAnalyzedCount: this.errorHistory.filter(e => e.analysis.aiGenerated).length
    };

    return stats;
  }

  formatAnalysisForTelegram(analysis, error) {
    let message = `🚨 *Error Detected & Analyzed*\n`;
    if (analysis.aiGenerated) {
      message += `🤖 _Analyzed by Groq AI_\n`;
    }
    message += `\n`;
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
