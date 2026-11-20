const path = require('path');

function normalizePhone(input) {
  if (!input) return '';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  let str = String(input).trim();
  str = str.replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)));
  str = str.replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)));
  str = str.replace(/[\s\-()]/g, '');
  if (str.startsWith('+98')) str = '0' + str.slice(3);
  else if (str.startsWith('0098')) str = '0' + str.slice(4);
  else if (str.startsWith('98') && str.length === 12) str = '0' + str.slice(2);
  else if (str.startsWith('9') && str.length === 10) str = '0' + str;
  return str;
}

function isValidIranMobile(phone) {
  return /^09\d{9}$/.test(normalizePhone(phone));
}

const ROOT_DIR = path.resolve(__dirname, '..');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_SECRET: process.env.APP_SECRET || 'nokabin-dev-secret-change-in-production-2026',
  OTP_TEST_MODE: String(process.env.OTP_TEST_MODE ?? 'true').toLowerCase() !== 'false',
  ADMIN_PHONE: normalizePhone(process.env.ADMIN_PHONE || '09225603574'),
  MAX_PHOTOS_PER_USER: Number(process.env.MAX_PHOTOS_PER_USER) || 3,
  REFERRAL_DISCOUNT_TOMAN: Number(process.env.REFERRAL_DISCOUNT_TOMAN) || 2000000,
  DEFAULT_AGENT_COMMISSION_PERCENT: Number(process.env.DEFAULT_AGENT_COMMISSION_PERCENT) || 5,
  CONTACT_PHONE_DISPLAY: '+989225603574',
  CONTACT_PHONE_RAW: '989225603574',
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT_DIR, 'data'),
  UPLOADS_DIR: process.env.UPLOADS_DIR || path.join(ROOT_DIR, 'uploads'),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
  GEMINI_VISION_MODEL: process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
  GEMINI_SUPPORTED_IMAGE_MODELS: [
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
    'gemini-3.1-flash-lite-image',
  ],
  GEMINI_MAX_COST_USD_PER_DAY: Number(process.env.GEMINI_MAX_COST_USD_PER_DAY) || 25,
  GEMINI_MAX_REQUESTS_PER_DAY: Number(process.env.GEMINI_MAX_REQUESTS_PER_DAY) || 300,
  GEMINI_MAX_RETRIES_PER_IMAGE: 1,
  ROOT_DIR,
  normalizePhone,
  isValidIranMobile,
};
