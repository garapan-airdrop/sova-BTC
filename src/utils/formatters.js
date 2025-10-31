const logger = require('./logger');

function formatTokenAmount(amount, decimals) {
  try {
    const divisor = BigInt(10) ** BigInt(decimals);
    const wholePart = BigInt(amount) / divisor;
    const fractionalPart = BigInt(amount) % divisor;

    if (fractionalPart === 0n) {
      return wholePart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(Number(decimals), '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');

    if (trimmedFractional === '') {
      return wholePart.toString();
    }

    return `${wholePart}.${trimmedFractional}`;
  } catch (error) {
    logger.error('Error formatting token amount', { 
      error: error.message, 
      amount, 
      decimals 
    });
    return '0';
  }
}

function parseTokenAmount(amountStr, decimals) {
  try {
    const amountParts = amountStr.split('.');
    const multiplier = BigInt(10) ** BigInt(decimals);
    
    if (amountParts.length === 1) {
      return BigInt(amountParts[0]) * multiplier;
    } else {
      const wholePart = BigInt(amountParts[0] || '0');
      const fractionalPart = amountParts[1] || '';
      const fractionalPadded = fractionalPart
        .padEnd(Number(decimals), '0')
        .slice(0, Number(decimals));
      const fractionalValue = BigInt(fractionalPadded);
      
      return wholePart * multiplier + fractionalValue;
    }
  } catch (error) {
    logger.error('Error parsing token amount', { 
      error: error.message, 
      amountStr, 
      decimals 
    });
    throw new Error('Invalid amount format');
  }
}

function formatAddress(address, length = 10) {
  if (!address || address.length < length) {
    return address;
  }
  return `${address.slice(0, length)}...`;
}

function hasMinimumBalance(balance, minAmount = '0') {
  try {
    return BigInt(balance) > BigInt(minAmount);
  } catch (error) {
    logger.error('Error checking balance', { error: error.message });
    return false;
  }
}

module.exports = {
  formatTokenAmount,
  parseTokenAmount,
  formatAddress,
  hasMinimumBalance
};
