const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { db, getSetting } = require('../db');
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../auth');

const router = express.Router();

function getUserPhotoQuota(userId) {
  const maxPhotos = Number(getSetting('max_photos_per_user', config.MAX_PHOTOS_PER_USER));
  const used = db.prepare('SELECT COUNT(*) as c FROM uploaded_photos WHERE user_id = ?').get(userId).c;
  return {
    usedPhotos: used,
    maxPhotos,
    remainingPhotos: Math.max(0, maxPhotos - used),
  };
}

async function sendMelipayamakOtp(phone, code) {
  const token = String(config.MELIPAYAMAK_TOKEN || '').trim();
  if (!token) {
    throw new Error('MELIPAYAMAK_TOKEN is not configured');
  }
  const url = `https://console.melipayamak.com/api/send/shared/${encodeURIComponent(token)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bodyId: Number(config.MELIPAYAMAK_OTP_BODY_ID) || 595982,
      to: phone,
      args: [String(code)],
    }),
  });
  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!resp.ok) {
    throw new Error(`Melipayamak HTTP ${resp.status}: ${text}`);
  }
  if (data && data.status && /error|fail|invalid/i.test(String(data.status))) {
    throw new Error(`Melipayamak error: ${text}`);
  }
  return data || { ok: true };
}

router.post('/request-otp', async (req, res) => {
  const phone = config.normalizePhone(req.body?.phone);
  const roleHint = req.body?.role === 'agent' ? 'agent' : 'customer';

  if (!config.isValidIranMobile(phone)) {
    return res.status(400).json({ error: 'شماره موبایل وارد شده معتبر نیست (مثال: 09123456789).' });
  }

  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Invalidate older unused codes for this phone
  db.prepare('UPDATE otp_codes SET used = 1 WHERE phone = ? AND used = 0').run(phone);
  db.prepare(`
    INSERT INTO otp_codes (phone, code, role_hint, expires_at, used)
    VALUES (?, ?, ?, ?, 0)
  `).run(phone, code, roleHint, expiresAt);

  if (config.OTP_TEST_MODE) {
    console.log(`[OTP TEST MODE] Phone: ${phone} | Code: ${code}`);
  } else {
    try {
      const smsRes = await sendMelipayamakOtp(phone, code);
      console.log(`[OTP SMS] Sent to ${phone} via Melipayamak (bodyId=${config.MELIPAYAMAK_OTP_BODY_ID}):`, smsRes);
    } catch (err) {
      console.error('[OTP SMS ERROR]', err?.message || err);
      return res.status(502).json({ error: 'خطا در ارسال پیامک کد تایید. لطفاً لحظاتی دیگر دوباره تلاش کنید.' });
    }
  }

  res.json({
    ok: true,
    phone,
    testMode: config.OTP_TEST_MODE,
    testOtp: config.OTP_TEST_MODE ? code : undefined,
    message: config.OTP_TEST_MODE
      ? `کد تایید تستی صادر شد: ${code}`
      : 'کد تایید به شماره همراه شما پیامک شد.',
  });
});

router.post('/verify-otp', (req, res) => {
  const phone = config.normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  const fullName = String(req.body?.fullName || '').trim();
  const requestedRole = req.body?.role === 'agent' ? 'agent' : 'customer';
  const messenger = ['bale', 'whatsapp'].includes(req.body?.messenger) ? req.body.messenger : null;
  const agencyName = String(req.body?.agencyName || '').trim();

  if (!config.isValidIranMobile(phone)) {
    return res.status(400).json({ error: 'شماره موبایل معتبر نیست.' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'کد تایید باید ۶ رقم باشد.' });
  }

  const otpRow = db
    .prepare('SELECT * FROM otp_codes WHERE phone = ? AND code = ? AND used = 0 ORDER BY id DESC LIMIT 1')
    .get(phone, code);

  if (!otpRow || otpRow.expires_at < Date.now()) {
    return res.status(400).json({ error: 'کد تایید نامعتبر یا منقضی شده است.' });
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otpRow.id);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

  if (!user) {
    const role = phone === config.ADMIN_PHONE ? 'admin' : requestedRole;
    const defaultCommission = Number(getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT));
    const info = db.prepare(`
      INSERT INTO users (phone, full_name, role, messenger, agency_name, commission_percent, is_approved)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(phone, fullName, role, messenger, agencyName, defaultCommission);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else {
    // Update profile fields if supplied and user isn't downgrading admin
    const nextRole =
      user.phone === config.ADMIN_PHONE
        ? 'admin'
        : user.role === 'admin'
          ? 'admin'
          : requestedRole === 'agent' && user.role === 'customer'
            ? 'agent'
            : user.role;

    db.prepare(`
      UPDATE users
      SET full_name = CASE WHEN ? != '' THEN ? ELSE full_name END,
          agency_name = CASE WHEN ? != '' THEN ? ELSE agency_name END,
          messenger = COALESCE(?, messenger),
          role = ?
      WHERE id = ?
    `).run(fullName, fullName, agencyName, agencyName, messenger, nextRole, user.id);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  setSessionCookie(res, user);

  res.json({
    ok: true,
    user,
    quota: getUserPhotoQuota(user.id),
  });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const maxPhotos = Number(getSetting('max_photos_per_user', config.MAX_PHOTOS_PER_USER));
  const referralDiscountToman = Number(getSetting('referral_discount_toman', config.REFERRAL_DISCOUNT_TOMAN));
  if (!req.user) {
    return res.json({
      authenticated: false,
      user: null,
      config: {
        otpTestMode: config.OTP_TEST_MODE,
        maxPhotosPerUser: maxPhotos,
        referralDiscountToman,
        contactPhone: config.CONTACT_PHONE_DISPLAY,
      },
    });
  }
  res.json({
    authenticated: true,
    user: req.user,
    quota: getUserPhotoQuota(req.user.id),
    config: {
      otpTestMode: config.OTP_TEST_MODE,
      maxPhotosPerUser: maxPhotos,
      referralDiscountToman,
      contactPhone: config.CONTACT_PHONE_DISPLAY,
    },
  });
});

router.patch('/profile', requireAuth, (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const agencyName = String(req.body?.agencyName || '').trim();
  const messenger = ['bale', 'whatsapp'].includes(req.body?.messenger) ? req.body.messenger : req.user.messenger;

  db.prepare(`
    UPDATE users SET full_name = ?, agency_name = ?, messenger = ? WHERE id = ?
  `).run(fullName || req.user.full_name, agencyName || req.user.agency_name, messenger, req.user.id);

  const updated = db.prepare('SELECT id, phone, full_name, role, messenger, agency_name, commission_percent, is_approved, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: updated });
});

module.exports = router;
module.exports.getUserPhotoQuota = getUserPhotoQuota;
