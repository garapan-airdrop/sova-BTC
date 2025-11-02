
const axios = require('axios');
const logger = require('../utils/logger');

const SOVA_API_BASE = 'https://score.sova.io/api';

// Create axios instance with default headers
const apiClient = axios.create({
  headers: {
    'Origin': 'https://prime-beta.sova.io',
    'Referer': 'https://prime-beta.sova.io/',
    'Accept': '*/*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  }
});

async function getProfile(address) {
  try {
    const response = await apiClient.get(`${SOVA_API_BASE}/profile/${address}`);
    return response.data;
  } catch (error) {
    logger.error('Error fetching profile', { address, error: error.message });
    return null;
  }
}

async function performCheckIn(address) {
  try {
    const response = await apiClient.post(
      `${SOVA_API_BASE}/checkin/simple`,
      {},
      {
        params: {
          wallet_address: address.toLowerCase()
        }
      }
    );
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    if (error.response && error.response.data) {
      return {
        success: false,
        data: error.response.data
      };
    }
    logger.error('Check-in error', { address, error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

async function checkInStatus(address) {
  try {
    const response = await apiClient.get(
      `${SOVA_API_BASE}/checkin/status/simple`,
      {
        params: {
          wallet_address: address.toLowerCase()
        }
      }
    );
    return response.data;
  } catch (error) {
    logger.error('Error checking status', { address, error: error.message });
    return null;
  }
}

module.exports = {
  getProfile,
  performCheckIn,
  checkInStatus
};
