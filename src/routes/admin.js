const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const { db, getSetting, setSetting } = require('../db');
const { requireRole } = require('../auth');
const { upload, cleanupFiles } = require('../upload');
const { syncReferralCommission } = require('./inspections');

const router = express.Router();

router.use(requireRole('admin'));

router.get('/overview', (_req, res) => {
  const requests = db.prepare('SELECT * FROM inspection_requests ORDER BY id DESC').all();
  const photosStmt = db.prepare('SELECT id, file_path, original_name, size_bytes FROM uploaded_photos WHERE request_id = ?');
  const enrichedRequests = requests.map((r) => ({
    ...r,
    photos: photosStmt.all(r.id),
  }));

  const agents = db
    .prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM inspection_requests ir WHERE ir.referrer_phone = u.phone) AS referrals_count,
        (SELECT COALESCE(SUM(c.amount_toman), 0) FROM commissions c WHERE c.agent_user_id = u.id) AS total_commission_toman
      FROM users u
      WHERE u.role = 'agent'
      ORDER BY u.id DESC
    `)
    .all();

  const agentApplications = db
    .prepare('SELECT * FROM agent_applications ORDER BY id DESC')
    .all();

  const commissions = db
    .prepare(`
      SELECT c.*, u.full_name AS agent_name, u.phone AS agent_phone, u.messenger AS agent_messenger,
             ir.full_name AS customer_name, ir.district, ir.contract_amount_toman, ir.status AS request_status
      FROM commissions c
      JOIN users u ON u.id = c.agent_user_id
      JOIN inspection_requests ir ON ir.id = c.request_id
      ORDER BY c.id DESC
    `)
    .all();

  const users = db
    .prepare(`
      SELECT u.id, u.phone, u.full_name, u.role, u.messenger, u.agency_name, u.commission_percent, u.is_approved, u.created_at,
        (SELECT COUNT(*) FROM uploaded_photos up WHERE up.user_id = u.id) AS photos_count
      FROM users u
      ORDER BY u.id DESC
    `)
    .all();

  const gallery = db.prepare('SELECT * FROM gallery_projects ORDER BY id DESC').all();

  const stats = {
    totalRequests: requests.length,
    pendingRequests: requests.filter((r) => r.status === 'pending').length,
    inProgressRequests: requests.filter((r) => r.status === 'in_progress').length,
    totalAgents: agents.length,
    totalCustomers: users.filter((u) => u.role === 'customer').length,
    totalPhotos: db.prepare('SELECT COUNT(*) as c FROM uploaded_photos').get().c,
    totalPendingCommissionToman: commissions
      .filter((c) => c.status !== 'paid')
      .reduce((sum, c) => sum + Number(c.amount_toman || 0), 0),
    galleryCount: gallery.length,
  };

  const settings = {
    max_photos_per_user: Number(getSetting('max_photos_per_user', config.MAX_PHOTOS_PER_USER)),
    default_commission_percent: Number(getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT)),
    referral_discount_toman: Number(getSetting('referral_discount_toman', config.REFERRAL_DISCOUNT_TOMAN)),
    otp_test_mode: config.OTP_TEST_MODE,
  };

  res.json({
    ok: true,
    stats,
    requests: enrichedRequests,
    agents,
    agentApplications,
    commissions,
    users,
    gallery,
    settings,
  });
});

router.patch('/requests/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM inspection_requests WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'درخواست یافت نشد.' });
  }

  const validStatuses = new Set(['pending', 'contacted', 'inspected', 'in_progress', 'completed', 'cancelled']);
  const status = validStatuses.has(req.body?.status) ? req.body.status : existing.status;
  const contractAmountToman =
    req.body?.contractAmountToman !== undefined
      ? Math.max(0, Number(req.body.contractAmountToman) || 0)
      : existing.contract_amount_toman;
  const discountToman =
    req.body?.discountToman !== undefined
      ? Math.max(0, Number(req.body.discountToman) || 0)
      : existing.discount_toman;
  const adminNotes =
    req.body?.adminNotes !== undefined ? String(req.body.adminNotes) : existing.admin_notes;

  db.prepare(`
    UPDATE inspection_requests
    SET status = ?, contract_amount_toman = ?, discount_toman = ?, admin_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, contractAmountToman, discountToman, adminNotes, id);

  if (existing.referrer_phone) {
    syncReferralCommission(id, existing.referrer_phone, contractAmountToman);
  }

  res.json({ ok: true, message: 'وضعیت درخواست به‌روزرسانی شد.' });
});

router.patch('/agents/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'مشاور یافت نشد.' });

  const commissionPercent =
    req.body?.commissionPercent !== undefined
      ? Math.max(1, Math.min(30, Number(req.body.commissionPercent) || 5))
      : user.commission_percent;
  const isApproved =
    req.body?.isApproved !== undefined ? (req.body.isApproved ? 1 : 0) : user.is_approved;

  db.prepare('UPDATE users SET commission_percent = ?, is_approved = ? WHERE id = ?').run(
    commissionPercent,
    isApproved,
    userId
  );

  res.json({ ok: true, message: 'تنظیمات مشاور ذخیره شد.' });
});

router.patch('/commissions/:id', (req, res) => {
  const id = Number(req.params.id);
  const comm = db.prepare('SELECT * FROM commissions WHERE id = ?').get(id);
  if (!comm) return res.status(404).json({ error: 'رکورد پورسانت یافت نشد.' });

  const valid = new Set(['pending', 'approved', 'paid']);
  const status = valid.has(req.body?.status) ? req.body.status : comm.status;
  const paidAt = status === 'paid' ? new Date().toISOString() : null;

  db.prepare('UPDATE commissions SET status = ?, paid_at = ? WHERE id = ?').run(status, paidAt, id);
  res.json({ ok: true, message: 'وضعیت پورسانت به‌روزرسانی شد.' });
});

router.post(
  '/gallery',
  upload.fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 },
  ]),
  (req, res) => {
    const beforeFile = req.files?.beforeImage?.[0];
    const afterFile = req.files?.afterImage?.[0];
    const allFiles = [beforeFile, afterFile].filter(Boolean);

    try {
      const title = String(req.body?.title || '').trim();
      const district = String(req.body?.district || 'شمال و شرق تهران').trim();
      const paintColor = String(req.body?.paintColor || 'پلی‌اورتان غیرکوره‌ای').trim();
      const durationDays = Math.max(1, Number(req.body?.durationDays) || 15);
      const costToman = Math.max(0, Number(req.body?.costToman) || 70000000);
      const description = String(req.body?.description || '').trim();

      if (!title || !beforeFile || !afterFile) {
        cleanupFiles(allFiles);
        return res.status(400).json({ error: 'عنوان پروژه و هر دو تصویر قبل و بعد الزامی هستند.' });
      }

      const info = db.prepare(`
        INSERT INTO gallery_projects (title, district, paint_color, duration_days, cost_toman, before_image, after_image, description, is_featured)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        title,
        district,
        paintColor,
        durationDays,
        costToman,
        `/uploads/${beforeFile.filename}`,
        `/uploads/${afterFile.filename}`,
        description
      );

      res.status(201).json({
        ok: true,
        id: info.lastInsertRowid,
        message: 'نمونه کار واقعی جدید به صفحه تغییرات واقعی اضافه شد.',
      });
    } catch (err) {
      cleanupFiles(allFiles);
      res.status(400).json({ error: err.message || 'خطا در افزودن پروژه گالری.' });
    }
  }
);

router.delete('/gallery/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM gallery_projects WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  db.prepare('DELETE FROM gallery_projects WHERE id = ?').run(id);

  for (const imgPath of [item.before_image, item.after_image]) {
    if (imgPath && imgPath.startsWith('/uploads/')) {
      const abs = path.join(config.UPLOADS_DIR, path.basename(imgPath));
      if (fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
        } catch {
          // ignore
        }
      }
    }
  }

  res.json({ ok: true, message: 'پروژه از گالری حذف شد.' });
});

router.patch('/settings', (req, res) => {
  if (req.body?.max_photos_per_user !== undefined) {
    const val = Math.max(1, Math.min(30, Number(req.body.max_photos_per_user) || 5));
    setSetting('max_photos_per_user', val);
  }
  if (req.body?.default_commission_percent !== undefined) {
    const val = Math.max(1, Math.min(30, Number(req.body.default_commission_percent) || 5));
    setSetting('default_commission_percent', val);
  }
  if (req.body?.referral_discount_toman !== undefined) {
    const val = Math.max(0, Number(req.body.referral_discount_toman) || 2000000);
    setSetting('referral_discount_toman', val);
  }
  res.json({ ok: true, message: 'تنظیمات سیستم ذخیره شد.' });
});

module.exports = router;
