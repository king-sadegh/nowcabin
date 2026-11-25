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

const MELIPAYAMAK_ERROR_MESSAGES = {
  '-112': 'دسترسی وب‌سرویس برای حساب ملی‌پیامک غیرفعال است (کد -112).',
  '-111': 'IP سرور درخواست‌کننده در پنل ملی‌پیامک مجاز نیست (کد -111).',
  '-110': 'الزام استفاده از API Key به‌جای رمز عبور در پنل ملی‌پیامک (کد -110).',
  '-109': 'تنظیم IP مجاز سرور در بخش تنظیمات وب‌سرویس پنل ملی‌پیامک الزامی است (کد -109).',
  '-108': 'IP سرور به‌دلیل تلاش ناموفق در پنل ملی‌پیامک مسدود شده است (کد -108).',
  '-10': 'ارسال لینک یا کاراکتر غیرمجاز در متغیر پترن (کد -10).',
  '-7': 'خطا در خط فرستنده خدماتی ملی‌پیامک (کد -7).',
  '-6': 'خطای داخلی ساختار پترن در ملی‌پیامک (کد -6).',
  '-5': 'تعداد متغیرهای ارسالی با متغیرهای پترن همخوانی ندارد (کد -5).',
  '-4': 'کد پترن (595982) اشتباه است یا هنوز در پنل ملی‌پیامک تأیید نهایی نشده است (کد -4).',
  '-3': 'سرشماره خدماتی در سیستم تعریف نشده است (کد -3).',
  '-2': 'محدودیت تعداد گیرنده در هر فراخوانی (کد -2).',
  '-1': 'دسترسی به وب‌سرویس پترن (خدماتی) برای این حساب غیرفعال است (کد -1).',
  '0': 'نام کاربری یا رمز وب‌سرویس (API Key) ملی‌پیامک اشتباه است (کد 0).',
  '2': 'اعتبار (شارژ) پنل ملی‌پیامک کافی نیست (کد 2).',
  '6': 'سامانه ملی‌پیامک در حال بروزرسانی است (کد 6).',
  '7': 'متن پیامک حاوی کلمه فیلترشده است (کد 7).',
  '10': 'پنل کاربری ملی‌پیامک غیرفعال است (کد 10).',
  '11': 'ارسال پیامک انجام نشد (کد 11).',
  '12': 'مدارک احراز هویت پنل ملی‌پیامک کامل نیست (کد 12).',
  '18': 'شماره موبایل گیرنده معتبر نیست (کد 18).',
  '19': 'سقف محدودیت ارسال ساعتی API تکمیل شده است (کد 19).',
};

async function sendMelipayamakOtp(phone, code) {
  const rawUser = String(config.MELIPAYAMAK_USERNAME || '989225603574').trim();
  const core10 = rawUser.replace(/^(\+98|0098|98|0)/, '');
  const usernameCandidates = [
    ...new Set([
      rawUser,
      `98${core10}`,
      `0${core10}`,
      core10,
      `+98${core10}`,
    ]),
  ];

  const password = String(config.MELIPAYAMAK_PASSWORD || config.MELIPAYAMAK_TOKEN || '80c521ed-98e2-49e9-97f9-869c2af8c27c').trim();
  const bodyId = Number(config.MELIPAYAMAK_OTP_BODY_ID) || 595982;

  const restUrl = 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';
  let restText = '';
  let restData = null;

  for (const username of usernameCandidates) {
    try {
      const resp = await fetch(restUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          username,
          password,
          text: String(code),
          to: phone,
          bodyId,
        }),
      });
      restText = await resp.text();
      try {
        restData = JSON.parse(restText);
      } catch {}

      const valStr = restData && restData.Value !== undefined ? String(restData.Value).trim() : '';
      if (resp.ok && restData && Number(restData.RetStatus) === 1 && (valStr.length > 3 || Number(valStr) > 100)) {
        return restData;
      }
      console.error(`[Melipayamak BaseServiceNumber (user=${username}) Error] HTTP ${resp.status} | Response: ${restText}`);
      // If error is not auth/0, don't retry other username format
      if (valStr && valStr !== '0') break;
    } catch (restErr) {
      console.error(`[Melipayamak BaseServiceNumber (user=${username}) Exception]`, restErr?.message || restErr);
    }
  }

  // Fallback 1: HTTP POST form-urlencoded to api.payamak-panel.com/post/Send.asmx/SendByBaseNumber2
  for (const username of usernameCandidates) {
    try {
      const formBody = new URLSearchParams({
        username,
        password,
        text: String(code),
        to: phone,
        bodyId: String(bodyId),
      });
      const asmxResp = await fetch('http://api.payamak-panel.com/post/Send.asmx/SendByBaseNumber2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
        body: formBody.toString(),
      });
      const asmxText = await asmxResp.text();
      const match = asmxText.match(/<string[^>]*>([^<]+)<\/string>/i);
      const asmxVal = match ? match[1].trim() : '';
      if (asmxResp.ok && asmxVal && (asmxVal.length > 3 || Number(asmxVal) > 100)) {
        return { Value: asmxVal, RetStatus: 1, StrRetStatus: 'Ok' };
      }
      console.error(`[Melipayamak ASMX SendByBaseNumber2 (user=${username})] HTTP ${asmxResp.status} | Val: ${asmxVal || asmxText.slice(0, 120)}`);
      if (asmxVal && asmxVal !== '0') break;
    } catch (asmxErr) {
      console.error('[Melipayamak ASMX Exception]', asmxErr?.message || asmxErr);
    }
  }

  // Fallback 2: console.melipayamak.com shared pattern endpoint
  const cleanToken = password.replace(/-/g, '') || '80c521ed98e249e997f9869c2af8c27c';
  for (const tokenCandidate of [cleanToken, password]) {
    try {
      const fallbackUrl = `https://console.melipayamak.com/api/send/shared/${encodeURIComponent(tokenCandidate)}`;
      const fbResp = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          bodyId,
          to: phone,
          args: [String(code)],
        }),
      });
      const fbText = await fbResp.text();
      let fbData = null;
      try {
        fbData = JSON.parse(fbText);
      } catch {}

      if (fbResp.ok && fbData && fbData.recId) {
        return fbData;
      }
      if (fbResp.ok && fbData && !fbData.status && !/error|fail|invalid|مشترک|غیرفعال|اشتباه|معتبر/i.test(fbText)) {
        return fbData;
      }
      console.error(`[Melipayamak Console Fallback (${tokenCandidate.slice(0, 8)}...)] HTTP ${fbResp.status} | Response: ${fbText}`);
    } catch (fbErr) {
      console.error('[Melipayamak Console Fallback Exception]', fbErr?.message || fbErr);
    }
  }

  const valKey = restData && restData.Value !== undefined ? String(restData.Value).trim() : '';
  const retKey = restData && restData.RetStatus !== undefined ? String(restData.RetStatus).trim() : '';
  const reason =
    MELIPAYAMAK_ERROR_MESSAGES[valKey] ||
    MELIPAYAMAK_ERROR_MESSAGES[retKey] ||
    (restText ? `پاسخ وب‌سرویس ملی‌پیامک: ${restText}` : 'عدم پاسخ از سرور ملی‌پیامک');

  const err = new Error(`Melipayamak OTP failed: ${reason} | Raw: ${restText}`);
  err.userMessage = `خطا در ارسال پیامک کد تایید: ${reason}`;
  throw err;
}

const DIRECT_LOGIN_ACCOUNTS = {
  customer: {
    phone: '09123334455',
    fullName: 'سارا محمدی',
    role: 'customer',
    messenger: null,
    agencyName: '',
  },
  agent: {
    phone: '09121112233',
    fullName: 'حسین رضایی',
    role: 'agent',
    messenger: 'bale',
    agencyName: 'مسکن نیاوران',
  },
  admin: {
    phone: config.ADMIN_PHONE,
    fullName: 'مدیریت نوکابین',
    role: 'admin',
    messenger: 'whatsapp',
    agencyName: '',
  },
};

function getDirectAccountSpec(phone, role) {
  if (role === 'admin' || phone === config.ADMIN_PHONE) {
    return DIRECT_LOGIN_ACCOUNTS.admin;
  }
  if (phone === '09121112233') return DIRECT_LOGIN_ACCOUNTS.agent;
  if (phone === '09123334455') return DIRECT_LOGIN_ACCOUNTS.customer;
  return null;
}

function getOrCreateDirectUser(spec) {
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(spec.phone);
  const defaultCommission = Number(getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT));
  if (!user) {
    const info = db.prepare(`
      INSERT INTO users (phone, full_name, role, messenger, agency_name, commission_percent, is_approved)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(spec.phone, spec.fullName, spec.role, spec.messenger, spec.agencyName, defaultCommission);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else if (user.role !== spec.role) {
    db.prepare('UPDATE users SET role = ?, is_approved = 1 WHERE id = ?').run(spec.role, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }
  return user;
}

router.post('/demo-login', (req, res) => {
  const requestedRole = ['customer', 'agent', 'admin'].includes(req.body?.role) ? req.body.role : '';
  const phone = config.normalizePhone(req.body?.phone);
  const spec = DIRECT_LOGIN_ACCOUNTS[requestedRole] || getDirectAccountSpec(phone, requestedRole);

  if (!spec) {
    return res.status(400).json({ error: 'حساب نمونه یا مدیریت معتبر نیست.' });
  }

  const user = getOrCreateDirectUser(spec);
  setSessionCookie(res, user);

  return res.json({
    ok: true,
    directLogin: true,
    user,
    quota: getUserPhotoQuota(user.id),
    message: 'ورود مستقیم با موفقیت انجام شد.',
  });
});

router.post('/request-otp', async (req, res) => {
  const phone = config.normalizePhone(req.body?.phone);
  const requestedRole = ['customer', 'agent', 'admin'].includes(req.body?.role) ? req.body.role : 'customer';
  const roleHint = requestedRole === 'agent' ? 'agent' : 'customer';

  const directSpec = getDirectAccountSpec(phone, requestedRole);
  if (directSpec) {
    const user = getOrCreateDirectUser(directSpec);
    setSessionCookie(res, user);
    return res.json({
      ok: true,
      directLogin: true,
      phone: user.phone,
      user,
      quota: getUserPhotoQuota(user.id),
      message: 'ورود مستقیم با موفقیت انجام شد.',
    });
  }

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
      return res.status(502).json({
        error: err?.userMessage || 'خطا در ارسال پیامک کد تایید. لطفاً لحظاتی دیگر دوباره تلاش کنید.',
      });
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
