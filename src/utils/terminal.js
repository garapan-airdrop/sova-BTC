
const chalk = require('chalk');
const ora = require('ora').default || require('ora');

const colors = {
  primary: chalk.hex('#00D9FF'),
  success: chalk.hex('#00FF88'),
  warning: chalk.hex('#FFB800'),
  error: chalk.hex('#FF4757'),
  info: chalk.hex('#5F27CD'),
  muted: chalk.gray,
  highlight: chalk.bold.hex('#FFA502'),
};

function printBanner() {
  console.log('\n');
  console.log(colors.primary('╔══════════════════════════════════════════════════════════╗'));
  console.log(colors.primary('║') + '                                                          ' + colors.primary('║'));
  console.log(colors.primary('║') + colors.highlight('           🤖 SOVA BTC FAUCET BOT 🤖                  ') + colors.primary('║'));
  console.log(colors.primary('║') + '                                                          ' + colors.primary('║'));
  console.log(colors.primary('╚══════════════════════════════════════════════════════════╝'));
  console.log('\n');
}

function printSection(title) {
  console.log('\n' + colors.primary('━━━ ') + colors.highlight(title) + colors.primary(' ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
}

function printSuccess(icon, message, data = null) {
  const prefix = colors.success(`${icon} ✓`);
  if (data) {
    console.log(`${prefix} ${message}`, colors.muted(JSON.stringify(data, null, 2)));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function printInfo(icon, message, data = null) {
  const prefix = colors.info(`${icon} ℹ`);
  if (data) {
    console.log(`${prefix} ${message}`, colors.muted(JSON.stringify(data, null, 2)));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function printWarning(icon, message) {
  const prefix = colors.warning(`${icon} ⚠`);
  console.log(`${prefix} ${message}`);
}

function printError(icon, message, error = null) {
  const prefix = colors.error(`${icon} ✗`);
  if (error) {
    console.log(`${prefix} ${message}`, colors.muted(error));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function createSpinner(text) {
  return ora({
    text: colors.info(text),
    spinner: 'dots12',
    color: 'cyan'
  });
}

function printWalletInfo(address, label = 'Wallet') {
  console.log(colors.info('📍') + ` ${label}: ` + colors.highlight(address));
}

function printNetworkInfo(network) {
  console.log(colors.info('🌐') + ` Network: ` + colors.success(network));
}

function printContractInfo(address) {
  console.log(colors.info('📜') + ` Contract: ` + colors.highlight(address));
}

function printAdminInfo(count, users) {
  if (count === 0) {
    console.log(colors.warning('⚠️ ') + ` Admin Users: ` + colors.error('ALL (INSECURE!)'));
  } else {
    console.log(colors.info('👥') + ` Admin Users: ` + colors.success(`${count} authorized`));
  }
}

function printDivider() {
  console.log(colors.muted('─'.repeat(60)));
}

function printReadyMessage() {
  console.log('\n');
  console.log(colors.success('╔══════════════════════════════════════════════════════════╗'));
  console.log(colors.success('║') + colors.highlight('              🚀 BOT IS READY TO SERVE! 🚀              ') + colors.success('║'));
  console.log(colors.success('╚══════════════════════════════════════════════════════════╝'));
  console.log('\n');
}

function printTransactionStart(type, details) {
  console.log('\n');
  console.log(colors.primary('╔════════════════════════════════════════════════════════════╗'));
  console.log(colors.primary('║') + colors.highlight(`  💰 ${type.toUpperCase()} TRANSACTION  `) + ' '.repeat(Math.max(0, 41 - type.length)) + colors.primary('║'));
  console.log(colors.primary('╠════════════════════════════════════════════════════════════╣'));
  if (details) {
    console.log(colors.primary('║ ') + colors.info(details) + ' '.repeat(Math.max(0, 58 - details.length)) + colors.primary('║'));
  }
  console.log(colors.primary('╚════════════════════════════════════════════════════════════╝'));
  console.log('');
}

function printTransactionSuccess(txHash, explorerUrl = null) {
  console.log('');
  console.log(colors.success('╔════════════════════════════════════════════════════════════╗'));
  console.log(colors.success('║') + colors.highlight('  ✅ TRANSACTION SUCCESSFUL!  ') + ' '.repeat(30) + colors.success('║'));
  console.log(colors.success('╠════════════════════════════════════════════════════════════╣'));
  console.log(colors.success('║ ') + colors.muted('Hash: ') + colors.info(txHash.substring(0, 20) + '...') + ' '.repeat(17) + colors.success('║'));
  if (explorerUrl) {
    console.log(colors.success('║ ') + colors.muted('Explorer: ') + colors.info(explorerUrl.substring(0, 45) + '...') + colors.success('║'));
  }
  console.log(colors.success('╚════════════════════════════════════════════════════════════╝'));
  console.log('');
}

function printProgressBar(current, total, label = '') {
  const percentage = Math.floor((current / total) * 100);
  const filled = Math.floor(percentage / 2);
  const empty = 50 - filled;
  const bar = colors.success('█'.repeat(filled)) + colors.muted('░'.repeat(empty));
  
  console.log(colors.info(`${label} [${bar}] ${percentage}% (${current}/${total})`));
}

function createProgressBarText(current, total) {
  const percentage = Math.floor((current / total) * 100);
  const filled = Math.floor(percentage / 5);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  
  return `[${bar}] ${percentage}%`;
}

function printSummary(title, success, failed, skipped = 0) {
  console.log('\n');
  console.log(colors.primary('╔════════════════════════════════════════════════════════════╗'));
  console.log(colors.primary('║') + colors.highlight(`  ${title}  `) + ' '.repeat(Math.max(0, 58 - title.length)) + colors.primary('║'));
  console.log(colors.primary('╠════════════════════════════════════════════════════════════╣'));
  console.log(colors.primary('║ ') + colors.success(`✅ Success: ${success}`) + ' '.repeat(Math.max(0, 58 - `✅ Success: ${success}`.length)) + colors.primary('║'));
  if (skipped > 0) {
    console.log(colors.primary('║ ') + colors.warning(`⏭️  Skipped: ${skipped}`) + ' '.repeat(Math.max(0, 58 - `⏭️  Skipped: ${skipped}`.length)) + colors.primary('║'));
  }
  console.log(colors.primary('║ ') + colors.error(`❌ Failed: ${failed}`) + ' '.repeat(Math.max(0, 58 - `❌ Failed: ${failed}`.length)) + colors.primary('║'));
  console.log(colors.primary('╚════════════════════════════════════════════════════════════╝'));
  console.log('\n');
}

module.exports = {
  colors,
  printBanner,
  printSection,
  printSuccess,
  printInfo,
  printWarning,
  printError,
  createSpinner,
  printWalletInfo,
  printNetworkInfo,
  printContractInfo,
  printAdminInfo,
  printDivider,
  printReadyMessage,
  printTransactionStart,
  printTransactionSuccess,
  printProgressBar,
  createProgressBarText,
  printSummary
};
