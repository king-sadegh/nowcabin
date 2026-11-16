const express = require('express');
const config = require('../config');
const { db, getSetting } = require('../db');
const { requireRole } = require('../auth');
const { syncReferralCommission } = require('./inspections');

const router = express.Router();

router.post('/apply', (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const phone = config.normalizePhone(req.body?.phone);
  const agencyName = String(req.body?.agencyName || '').trim();
  const district = String(req.body?.district || 'شمال و شرق تهران').trim();
  const messenger = req.body?.messenger === 'bale' ? 'bale' : 'whatsapp';
  const notes = String(req.body?.notes || '').trim();

  if (!fullName) {
    return res.status(400).json({ error: 'لطفاً نام و نام خانوادگی خود را وارد کنید.' });
  }
  if (!config.isValidIranMobile(phone)) {
    return res.status(400).json({ error: 'لطفاً شماره موبایل معتبر وارد کنید (مثال: 09123456789).' });
  }

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  const defaultCommission = Number(getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT));

  if (!user) {
    const info = db.prepare(`
      INSERT INTO users (phone, full_name, role, messenger, agency_name, commission_percent, is_approved)
      VALUES (?, ?, 'agent', ?, ?, ?, 1)
    `).run(phone, fullName, messenger, agencyName, defaultCommission);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else {
    const nextRole = user.role === 'admin' ? 'admin' : 'agent';
    db.prepare(`
      UPDATE users
      SET full_name = ?,
          role = ?,
          messenger = ?,
          agency_name = CASE WHEN ? != '' THEN ? ELSE agency_name END
      WHERE id = ?
    `).run(fullName, nextRole, messenger, agencyName, agencyName, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  db.prepare(`
    INSERT INTO agent_applications (user_id, full_name, phone, agency_name, district, messenger, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
  `).run(user.id, fullName, phone, agencyName, district, messenger, notes);

  // Retroactively link any existing inspection requests that already had this agent's phone as referrer
  const existingReferrals = db
    .prepare('SELECT id, contract_amount_toman FROM inspection_requests WHERE referrer_phone = ?')
    .all(phone);
  for (const r of existingReferrals) {
    syncReferralCommission(r.id, phone, r.contract_amount_toman);
  }

  res.status(201).json({
    ok: true,
    referralPhone: phone,
    messenger,
    message:
      messenger === 'bale'
        ? 'درخواست همکاری شما ثبت شد! لینک دعوت اختصاصی شما فعال است و از طریق پیام‌رسان بله با شما در ارتباط خواهیم بود.'
        : 'درخواست همکاری شما ثبت شد! لینک دعوت اختصاصی شما فعال است و از طریق واتس‌اپ با شما در ارتباط خواهیم بود.',
  });
});

router.get('/dashboard', requireRole('agent', 'admin'), (req, res) => {
  const agentId = req.user.id;
  const agentPhone = req.user.phone;

  const referrals = db
    .prepare(`
      SELECT
        ir.id,
        ir.full_name,
        ir.phone,
        ir.district,
        ir.estimated_meters,
        ir.discount_toman,
        ir.contract_amount_toman,
        ir.status,
        ir.created_at,
        COALESCE(c.amount_toman, ROUND(ir.contract_amount_toman * ? / 100.0)) AS commission_toman,
        COALESCE(c.status, 'pending') AS commission_status,
        c.paid_at
      FROM inspection_requests ir
      LEFT JOIN commissions c ON c.request_id = ir.id
      WHERE ir.referrer_phone = ?
      ORDER BY ir.id DESC
    `)
    .all(Number(req.user.commission_percent || 5), agentPhone);

  let totalEarned = 0;
  let paidTotal = 0;
  let pendingTotal = 0;
  let activeCount = 0;

  const sanitizedReferrals = referrals.map((row) => {
    const comm = Number(row.commission_toman) || 0;
    if (row.status !== 'cancelled') {
      totalEarned += comm;
      if (row.commission_status === 'paid') paidTotal += comm;
      else pendingTotal += comm;
    }
    if (['pending', 'contacted', 'inspected', 'in_progress'].includes(row.status)) {
      activeCount += 1;
    }
    const maskedPhone = row.phone.length >= 11 ? `${row.phone.slice(0, 4)}***${row.phone.slice(7)}` : row.phone;
    return {
      ...row,
      masked_phone: maskedPhone,
    };
  });

  res.json({
    ok: true,
    agent: {
      id: agentId,
      fullName: req.user.full_name,
      phone: agentPhone,
      agencyName: req.user.agency_name,
      messenger: req.user.messenger || 'whatsapp',
      commissionPercent: req.user.commission_percent,
      referralParam: agentPhone,
    },
    stats: {
      totalReferred: sanitizedReferrals.length,
      activeProjects: activeCount,
      totalCommissionToman: totalEarned,
      paidCommissionToman: paidTotal,
      pendingCommissionToman: pendingTotal,
    },
    referrals: sanitizedReferrals,
  });
});

module.exports = router;
