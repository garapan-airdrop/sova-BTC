const logger = require('./logger');

function validateAddress(web3, address) {
  try {
    if (!address || typeof address !== 'string') {
      return { 
        valid: false, 
        error: 'Alamat harus berupa string yang valid' 
      };
    }
    
    const trimmedAddress = address.trim();
    
    if (!trimmedAddress.startsWith('0x')) {
      return { 
        valid: false, 
        error: 'Alamat harus dimulai dengan 0x' 
      };
    }
    
    if (trimmedAddress.length !== 42) {
      return { 
        valid: false, 
        error: 'Alamat harus 42 karakter (termasuk 0x)' 
      };
    }
    
    if (!web3.utils.isAddress(trimmedAddress)) {
      return { 
        valid: false, 
        error: 'Format alamat EVM tidak valid' 
      };
    }
    
    return { valid: true, address: trimmedAddress };
  } catch (error) {
    logger.error('Address validation error', { error: error.message });
    return { 
      valid: false, 
      error: 'Error saat memvalidasi alamat' 
    };
  }
}

function validateTransferAmount(amountStr, decimals = 8) {
  try {
    if (!amountStr || typeof amountStr !== 'string') {
      return { 
        valid: false, 
        error: 'Amount harus berupa string yang valid' 
      };
    }
    
    const trimmed = amountStr.trim();
    
    if (trimmed.startsWith('-')) {
      return { 
        valid: false, 
        error: 'Amount tidak boleh negatif' 
      };
    }
    
    if (trimmed.toLowerCase().includes('e')) {
      return { 
        valid: false, 
        error: 'Format scientific notation tidak didukung' 
      };
    }
    
    const parts = trimmed.split('.');
    if (parts.length > 2) {
      return { 
        valid: false, 
        error: 'Format amount tidak valid (terlalu banyak titik desimal)' 
      };
    }
    
    if (parts.length === 2 && parts[1].length > decimals) {
      return { 
        valid: false, 
        error: `Maksimal ${decimals} angka desimal` 
      };
    }
    
    const num = parseFloat(trimmed);
    if (isNaN(num) || num <= 0) {
      return { 
        valid: false, 
        error: 'Amount harus angka positif yang valid' 
      };
    }
    
    if (num > Number.MAX_SAFE_INTEGER) {
      return { 
        valid: false, 
        error: 'Amount terlalu besar' 
      };
    }
    
    return { valid: true, value: num, string: trimmed };
  } catch (error) {
    logger.error('Amount validation error', { error: error.message });
    return { 
      valid: false, 
      error: 'Error saat memvalidasi amount' 
    };
  }
}

function validateWalletCount(countStr, maxCount = 100) {
  const count = parseInt(countStr);
  
  if (isNaN(count)) {
    return { 
      valid: false, 
      error: 'Jumlah wallet harus berupa angka' 
    };
  }
  
  if (count < 1) {
    return { 
      valid: false, 
      error: 'Jumlah wallet minimal 1' 
    };
  }
  
  if (count > maxCount) {
    return { 
      valid: false, 
      error: `Jumlah wallet maksimal ${maxCount}` 
    };
  }
  
  return { valid: true, count };
}

function sanitizeUserId(userId) {
  return String(userId).replace(/[^0-9]/g, '');
}

module.exports = {
  validateAddress,
  validateTransferAmount,
  validateWalletCount,
  sanitizeUserId
};
