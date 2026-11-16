const crypto = require('crypto');
const config = require('./config');
const { db } = require('./db');

const COOKIE_NAME = 'nokabin_session';

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.APP_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac('sha256', config.APP_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getCurrentUser(req) {
  const token = req.cookies?.[COOKIE_NAME] || extractBearer(req);
  const decoded = verifyToken(token);
  if (!decoded?.uid) return null;
  const user = db
    .prepare('SELECT id, phone, full_name, role, messenger, agency_name, commission_percent, is_approved, created_at FROM users WHERE id = ?')
    .get(decoded.uid);
  return user || null;
}

function extractBearer(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

function attachUser(req, _res, next) {
  req.user = getCurrentUser(req);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'شما دسترسی لازم به این بخش را ندارید.' });
    }
    next();
  };
}

function setSessionCookie(res, user) {
  const token = signToken({ uid: user.id, role: user.role, phone: user.phone });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // works on HTTP behind reverse proxy or IP in Iran VPS
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
  return token;
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = {
  COOKIE_NAME,
  signToken,
  verifyToken,
  attachUser,
  requireAuth,
  requireRole,
  setSessionCookie,
  clearSessionCookie,
};
