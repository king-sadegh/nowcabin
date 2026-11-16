const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const { db, getSetting } = require('../db');
const { requireAuth } = require('../auth');
const { upload, cleanupFiles } = require('../upload');
const { getUserPhotoQuota } = require('./auth');

const router = express.Router();

function syncReferralCommission(requestId, referrerPhone, contractAmountToman) {
  if (!referrerPhone) return;
  const agent = db
    .prepare("SELECT id, commission_percent FROM users WHERE phone = ? AND role IN ('agent', 'admin')")
    .get(referrerPhone);
  if (!agent) return;

  const pct = Number(agent.commission_percent || getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT));
  const commissionAmount = Math.round((Number(contractAmountToman || 70000000) * pct) / 100);

  db.prepare(`
    INSERT INTO commissions (agent_user_id, request_id, amount_toman, status)
    VALUES (?, ?, ?, 'pending')
    ON CONFLICT(request_id) DO UPDATE SET
      agent_user_id = excluded.agent_user_id,
      amount_toman = excluded.amount_toman
  `).run(agent.id, requestId, commissionAmount);
}

router.post('/', upload.array('photos', 10), (req, res) => {
  const files = req.files || [];
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const phone = config.normalizePhone(req.body?.phone || req.user?.phone);
    const district = String(req.body?.district || 'شمال و شرق تهران').trim();
    const address = String(req.body?.address || '').trim();
    const cabinetType = String(req.body?.cabinetType || 'ام‌دی‌اف / چوب قدیمی').trim();
    const estimatedMeters = Math.max(1, Math.min(100, Number(req.body?.estimatedMeters) || 10));
    const referrerPhoneRaw = config.normalizePhone(req.body?.referrerPhone || '');
    const notes = String(req.body?.notes || '').trim();

    if (!fullName) {
      cleanupFiles(files);
      return res.status(400).json({ error: 'لطفاً نام و نام خانوادگی خود را وارد کنید.' });
    }
    if (!config.isValidIranMobile(phone)) {
      cleanupFiles(files);
      return res.status(400).json({ error: 'لطفاً شماره موبایل معتبر وارد کنید (مثال: 09123456789).' });
    }
    if (referrerPhoneRaw && !config.isValidIranMobile(referrerPhoneRaw)) {
      cleanupFiles(files);
      return res.status(400).json({ error: 'شماره همراه مشاور املاک معرفی‌کننده معتبر نیست.' });
    }

    const referrerPhone = referrerPhoneRaw && referrerPhoneRaw !== phone ? referrerPhoneRaw : '';

    // Find or create customer user record for this phone so they can later view it in Customer Panel
    let targetUser = req.user;
    if (!targetUser || (targetUser.phone !== phone && targetUser.role === 'customer')) {
      let existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      if (!existing) {
        const defaultCommission = Number(getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT));
        const info = db.prepare(`
          INSERT INTO users (phone, full_name, role, commission_percent, is_approved)
          VALUES (?, ?, 'customer', ?, 1)
        `).run(phone, fullName, defaultCommission);
        existing = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      } else if (!existing.full_name) {
        db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, existing.id);
      }
      targetUser = existing;
    }

    // Enforce per-user photo upload limit
    const quota = getUserPhotoQuota(targetUser.id);
    if (files.length > quota.remainingPhotos) {
      cleanupFiles(files);
      return res.status(400).json({
        error: `محدودیت آپلود عکس: هر کاربر حداکثر ${quota.maxPhotos} عکس می‌تواند آپلود کند. سهمیه باقی‌مانده شما ${quota.remainingPhotos} عکس است.`,
        quota,
      });
    }

    const referralDiscount = referrerPhone
      ? Number(getSetting('referral_discount_toman', config.REFERRAL_DISCOUNT_TOMAN))
      : 0;
    const baseEstimatedContract = Math.max(45000000, estimatedMeters * 7000000);

    const reqInsert = db.prepare(`
      INSERT INTO inspection_requests (
        user_id, full_name, phone, district, address, cabinet_type,
        estimated_meters, referrer_phone, discount_toman, contract_amount_toman, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      targetUser.id,
      fullName,
      phone,
      district,
      address,
      cabinetType,
      estimatedMeters,
      referrerPhone,
      referralDiscount,
      baseEstimatedContract,
      notes
    );

    const requestId = Number(reqInsert.lastInsertRowid);

    const photoInsert = db.prepare(`
      INSERT INTO uploaded_photos (user_id, request_id, file_path, original_name, size_bytes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const savedPhotos = [];
    for (const file of files) {
      const publicUrl = `/uploads/${file.filename}`;
      photoInsert.run(targetUser.id, requestId, publicUrl, file.originalname, file.size);
      savedPhotos.push({ file_path: publicUrl, original_name: file.originalname });
    }

    if (referrerPhone) {
      syncReferralCommission(requestId, referrerPhone, baseEstimatedContract);
    }

    res.status(201).json({
      ok: true,
      requestId,
      discountApplied: referralDiscount,
      photosCount: savedPhotos.length,
      quota: getUserPhotoQuota(targetUser.id),
      message: referralDiscount > 0
        ? 'درخواست بازدید رایگان شما ثبت شد و تخفیف ۲ میلیون تومانی معرف برای شما لحاظ گردید.'
        : 'درخواست بازدید و کارشناسی رایگان شما با موفقیت ثبت شد. کارشناسان نوکابین به‌زودی تماس می‌گیرند.',
    });
  } catch (err) {
    cleanupFiles(files);
    res.status(400).json({ error: err.message || 'خطا در ثبت درخواست بازدید.' });
  }
});

router.get('/my', requireAuth, (req, res) => {
  const requests = db
    .prepare('SELECT * FROM inspection_requests WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);

  const photosStmt = db.prepare('SELECT id, file_path, original_name, size_bytes, created_at FROM uploaded_photos WHERE request_id = ? ORDER BY id ASC');
  const enriched = requests.map((r) => ({
    ...r,
    photos: photosStmt.all(r.id),
  }));

  res.json({
    ok: true,
    requests: enriched,
    quota: getUserPhotoQuota(req.user.id),
  });
});

router.post('/:id/photos', requireAuth, upload.array('photos', 5), (req, res) => {
  const files = req.files || [];
  try {
    const requestId = Number(req.params.id);
    const reqRow = db.prepare('SELECT * FROM inspection_requests WHERE id = ?').get(requestId);
    if (!reqRow || (reqRow.user_id !== req.user.id && req.user.role !== 'admin')) {
      cleanupFiles(files);
      return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: 'حداقل یک تصویر انتخاب کنید.' });
    }

    const quota = getUserPhotoQuota(reqRow.user_id);
    if (files.length > quota.remainingPhotos) {
      cleanupFiles(files);
      return res.status(400).json({
        error: `حداکثر ${quota.maxPhotos} عکس برای هر کاربر مجاز است. شما ${quota.remainingPhotos} ظرفیت باقی‌مانده دارید.`,
        quota,
      });
    }

    const stmt = db.prepare(`
      INSERT INTO uploaded_photos (user_id, request_id, file_path, original_name, size_bytes)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const f of files) {
      stmt.run(reqRow.user_id, requestId, `/uploads/${f.filename}`, f.originalname, f.size);
    }

    res.json({
      ok: true,
      quota: getUserPhotoQuota(reqRow.user_id),
      message: 'تصاویر با موفقیت آپلود شدند.',
    });
  } catch (err) {
    cleanupFiles(files);
    res.status(400).json({ error: err.message || 'خطا در آپلود تصاویر.' });
  }
});

router.delete('/photos/:photoId', requireAuth, (req, res) => {
  const photoId = Number(req.params.photoId);
  const photo = db.prepare('SELECT * FROM uploaded_photos WHERE id = ?').get(photoId);
  if (!photo || (photo.user_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).json({ error: 'تصویر یافت نشد.' });
  }

  db.prepare('DELETE FROM uploaded_photos WHERE id = ?').run(photoId);

  const fileName = path.basename(photo.file_path);
  const absPath = path.join(config.UPLOADS_DIR, fileName);
  if (fs.existsSync(absPath)) {
    try {
      fs.unlinkSync(absPath);
    } catch {
      // ignore
    }
  }

  res.json({
    ok: true,
    quota: getUserPhotoQuota(photo.user_id),
  });
});

module.exports = router;
module.exports.syncReferralCommission = syncReferralCommission;
