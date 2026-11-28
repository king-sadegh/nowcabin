const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { outreachManager } = require('../outreach/outreachManager');
const { vlessTunnel } = require('../outreach/vlessTunnel');
const { leadDiscoveryEngine } = require('../outreach/leadDiscovery');
const { evaluateAgentReply, renderCampaignTemplate } = require('../outreach/ruleEngine');

const router = express.Router();

router.use(requireRole('admin'));

// 1. Full overview (connections, dual campaign progress, stats, settings)
router.get('/overview', (_req, res) => {
  res.json(outreachManager.getOverviewState());
});

// 2. Paginated / filtered contact list
router.get('/contacts', (req, res) => {
  const filter = String(req.query.filter || 'all'); // all | serious | unread | replied | registered | wa_queued | bale_queued | failed
  const search = String(req.query.search || '').trim();
  const limit = Math.min(250, Math.max(10, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const conditions = [];
  const params = [];

  if (filter === 'serious') {
    conditions.push('c.is_serious = 1');
  } else if (filter === 'unread') {
    conditions.push('c.unread_count > 0');
  } else if (filter === 'replied') {
    conditions.push("(c.wa_status IN ('replied', 'registered') OR c.bale_status IN ('replied', 'registered'))");
  } else if (filter === 'registered') {
    conditions.push("(c.wa_status = 'registered' OR c.bale_status = 'registered' OR c.registered_agent_id IS NOT NULL)");
  } else if (filter === 'wa_queued') {
    conditions.push("c.wa_status = 'queued'");
  } else if (filter === 'bale_queued') {
    conditions.push("c.bale_status = 'queued'");
  } else if (filter === 'failed') {
    conditions.push("(c.wa_status = 'failed' OR c.bale_status = 'failed')");
  }

  if (search) {
    const normPhone = config.normalizePhone(search);
    conditions.push('(c.phone LIKE ? OR c.full_name LIKE ? OR c.agency_name LIKE ? OR c.district LIKE ?)');
    const q = `%${search}%`;
    params.push(`%${normPhone || search}%`, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM outreach_contacts c ${whereClause}`)
    .get(...params);

  const contacts = db
    .prepare(`
      SELECT
        c.*,
        (
          SELECT m.body
          FROM outreach_messages m
          WHERE m.contact_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_message_body,
        (
          SELECT m.channel
          FROM outreach_messages m
          WHERE m.contact_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_message_channel,
        (
          SELECT m.direction
          FROM outreach_messages m
          WHERE m.contact_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_message_direction
      FROM outreach_contacts c
      ${whereClause}
      ORDER BY c.is_serious DESC, c.unread_count DESC, c.updated_at DESC, c.id DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset);

  res.json({
    ok: true,
    total: Number(totalRow?.c || 0),
    contacts,
  });
});

// 3. Bulk import up to 2000+ contacts
router.post('/contacts/import', (req, res) => {
  const rawText = String(req.body?.rawText || '');
  const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  const defaultDistrict = String(req.body?.defaultDistrict || 'شمال و شرق تهران').trim();

  if (!rawText.trim() && contacts.length === 0) {
    return res.status(400).json({ error: 'لطفاً فایل CSV/اکسل یا لیست شماره‌ها را وارد کنید.' });
  }

  const result = outreachManager.importContacts({
    rawText,
    contacts,
    defaultDistrict,
  });

  res.json({
    ...result,
    message: `${result.inserted} شماره جدید اضافه شد و ${result.updated} شماره موجود به‌روزرسانی گردید.`,
  });
});

// 4. Update single contact (pause/resume bot, mark serious, register as agent, reset status)
router.patch('/contacts/:id', (req, res) => {
  const id = Number(req.params.id);
  const contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(id);
  if (!contact) {
    return res.status(404).json({ error: 'مخاطب یافت نشد.' });
  }

  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName).trim() : contact.full_name;
  const agencyName = req.body?.agencyName !== undefined ? String(req.body.agencyName).trim() : contact.agency_name;
  const district = req.body?.district !== undefined ? String(req.body.district).trim() : contact.district;
  const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : contact.notes;
  const isSerious = req.body?.isSerious !== undefined ? (req.body.isSerious ? 1 : 0) : contact.is_serious;
  const seriousReason =
    req.body?.seriousReason !== undefined ? String(req.body.seriousReason).trim() : contact.serious_reason;
  const botPaused = req.body?.botPaused !== undefined ? (req.body.botPaused ? 1 : 0) : contact.bot_paused;
  const waStatus = req.body?.waStatus || contact.wa_status;
  const baleStatus = req.body?.baleStatus || contact.bale_status;

  db.prepare(`
    UPDATE outreach_contacts
    SET full_name = ?,
        agency_name = ?,
        district = ?,
        notes = ?,
        is_serious = ?,
        serious_reason = ?,
        bot_paused = ?,
        wa_status = ?,
        bale_status = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(fullName, agencyName, district, notes, isSerious, seriousReason, botPaused, waStatus, baleStatus, id);

  if (req.body?.registerAsAgent) {
    const updated = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(id);
    outreachManager.ensureAgentRegisteredInSystem(updated, req.body.preferredMessenger || 'whatsapp');
  }

  res.json({
    ok: true,
    contact: db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(id),
  });
});

// 5. Delete a contact or bulk reset failed contacts
router.delete('/contacts/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM outreach_contacts WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/contacts/reset-failed', (req, res) => {
  const channel = req.body?.channel;
  if (channel === 'whatsapp' || channel === 'both') {
    db.prepare(`UPDATE outreach_contacts SET wa_status = 'queued', wa_error = '' WHERE wa_status IN ('failed', 'skipped')`).run();
  }
  if (channel === 'bale' || channel === 'both') {
    db.prepare(`UPDATE outreach_contacts SET bale_status = 'queued', bale_error = '' WHERE bale_status IN ('failed', 'skipped')`).run();
  }
  res.json({ ok: true, message: 'مخاطبین ناموفق مجدداً در صف ارسال قرار گرفتند.' });
});

// 6. Get conversation thread messages for a contact
router.get('/contacts/:id/messages', (req, res) => {
  const id = Number(req.params.id);
  const contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(id);
  if (!contact) {
    return res.status(404).json({ error: 'مخاطب یافت نشد.' });
  }

  // Clear unread badge when admin opens thread
  if (contact.unread_count > 0) {
    db.prepare('UPDATE outreach_contacts SET unread_count = 0 WHERE id = ?').run(id);
    contact.unread_count = 0;
  }

  const messages = db
    .prepare('SELECT * FROM outreach_messages WHERE contact_id = ? ORDER BY id ASC')
    .all(id);

  res.json({
    ok: true,
    contact,
    messages,
  });
});

// 7. Send manual message from Admin Panel (on WhatsApp or Bale)
router.post('/contacts/:id/send', async (req, res) => {
  const id = Number(req.params.id);
  const channel = req.body?.channel === 'bale' ? 'bale' : 'whatsapp';
  const text = String(req.body?.text || '').trim();

  if (!text) {
    return res.status(400).json({ error: 'متن پیام را وارد کنید.' });
  }

  try {
    await outreachManager.sendDirectMessage(id, channel, text, { senderType: 'admin' });
    const messages = db
      .prepare('SELECT * FROM outreach_messages WHERE contact_id = ? ORDER BY id ASC')
      .all(id);
    const contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(id);
    res.json({
      ok: true,
      message: `پیام شما در ${channel === 'bale' ? 'بله' : 'واتس‌اپ'} ارسال شد.`,
      contact,
      messages,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'خطا در ارسال پیام' });
  }
});

// 8. Simulate an inbound reply from a contact (for instant testing without needing live WA/Bale)
router.post('/contacts/:id/simulate-inbound', async (req, res) => {
  const id = Number(req.params.id);
  const contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(id);
  if (!contact) {
    return res.status(404).json({ error: 'مخاطب یافت نشد.' });
  }

  const channel = req.body?.channel === 'bale' ? 'bale' : 'whatsapp';
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'متن پیام آزمایشی مشاور را وارد کنید.' });
  }

  // Record inbound message and run the exact same rule engine decision logic
  db.prepare(`
    INSERT INTO outreach_messages (contact_id, channel, direction, sender_type, body)
    VALUES (?, ?, 'inbound', 'contact', ?)
  `).run(contact.id, channel, text);

  const decision = evaluateAgentReply(text, contact);
  const statusCol = channel === 'whatsapp' ? 'wa_status' : 'bale_status';

  if (decision.isOptOut) {
    db.prepare(`UPDATE outreach_contacts SET ${statusCol} = 'opted_out', bot_paused = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
  } else if (decision.autoRegisterAgent) {
    outreachManager.ensureAgentRegisteredInSystem(contact, channel);
    db.prepare(`UPDATE outreach_contacts SET ${statusCol} = 'registered', updated_at = datetime('now') WHERE id = ?`).run(id);
  } else {
    db.prepare(`UPDATE outreach_contacts SET ${statusCol} = 'replied', updated_at = datetime('now') WHERE id = ?`).run(id);
  }

  if (decision.isSerious) {
    db.prepare(`
      UPDATE outreach_contacts
      SET is_serious = 1,
          serious_reason = ?,
          serious_at = datetime('now'),
          bot_paused = 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(decision.seriousReason || 'مورد جدی همکاری', id);
  }

  if (decision.replyText && !contact.bot_paused) {
    db.prepare(`
      INSERT INTO outreach_messages (contact_id, channel, direction, sender_type, body, matched_rule)
      VALUES (?, ?, 'outbound', 'bot', ?, ?)
    `).run(id, channel, decision.replyText, decision.category);
  }

  const updatedContact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(id);
  const messages = db.prepare('SELECT * FROM outreach_messages WHERE contact_id = ? ORDER BY id ASC').all(id);

  res.json({
    ok: true,
    decision,
    contact: updatedContact,
    messages,
  });
});

// 9. Update Outreach & Campaign Settings
router.patch('/settings', (req, res) => {
  const settings = outreachManager.updateOutreachSettings(req.body || {});
  res.json({
    ok: true,
    settings,
    message: 'تنظیمات ربات و کمپین‌ها ذخیره شد.',
  });
});

// 10. WhatsApp Connection Controls
router.post('/whatsapp/connect', async (req, res) => {
  try {
    if (req.body?.proxyUrl !== undefined) {
      const prevProxy = outreachManager.getOutreachSettings().waProxyUrl;
      const nextProxy = String(req.body.proxyUrl).trim();
      outreachManager.updateOutreachSettings({ waProxyUrl: nextProxy });
      if (prevProxy !== nextProxy && outreachManager.wa.status !== 'disconnected') {
        await outreachManager.wa.stop();
      }
    }
    const state = await outreachManager.wa.start({ forceNewQr: Boolean(req.body?.forceNewQr) });
    res.json({ ok: true, whatsapp: state });
  } catch (err) {
    res.status(400).json({ error: err.message || 'خطا در اتصال واتس‌اپ' });
  }
});

router.post('/whatsapp/disconnect', async (_req, res) => {
  const state = await outreachManager.wa.stop();
  res.json({ ok: true, whatsapp: state });
});

router.post('/whatsapp/logout', async (_req, res) => {
  const state = await outreachManager.wa.logout();
  res.json({ ok: true, whatsapp: state });
});

router.post('/proxy/apply', async (req, res) => {
  try {
    const proxyUrl = String(req.body?.proxyUrl || '').trim();
    outreachManager.updateOutreachSettings({ waProxyUrl: proxyUrl });
    const testResult = await vlessTunnel.testProxy(proxyUrl);

    if (outreachManager.wa.status !== 'disconnected') {
      await outreachManager.wa.stop();
    }
    const waState = await outreachManager.wa.start({ forceNewQr: false });

    res.json({
      ok: true,
      testResult,
      whatsapp: waState,
      message: testResult.whatsappReachable
        ? 'پروکسی اعمال شد و دسترسی به واتس‌اپ برقرار است!'
        : 'پروکسی ذخیره شد اما تست دسترسی به واتس‌اپ با خطا مواجه شد.',
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'خطا در اعمال پروکسی' });
  }
});

router.post('/proxy/test', async (req, res) => {
  try {
    const proxyUrl =
      req.body?.proxyUrl !== undefined
        ? String(req.body.proxyUrl).trim()
        : outreachManager.getOutreachSettings().waProxyUrl;
    const testResult = await vlessTunnel.testProxy(proxyUrl);
    res.json({ ok: true, testResult, vlessTunnel: vlessTunnel.getState() });
  } catch (err) {
    res.status(400).json({ error: err.message || 'خطا در تست پروکسی' });
  }
});

// 11. Bale Web Connection Controls
router.post('/bale/start', async (req, res) => {
  if (req.body?.proxyUrl !== undefined) {
    outreachManager.updateOutreachSettings({ baleProxyUrl: String(req.body.proxyUrl).trim() });
  }
  const state = await outreachManager.bale.start();
  res.json({ ok: true, bale: state });
});

router.post('/bale/screenshot', async (_req, res) => {
  const state = await outreachManager.bale.refreshStatusAndScreenshot();
  res.json({ ok: true, bale: state });
});

router.post('/bale/login-phone', async (req, res) => {
  try {
    const state = await outreachManager.bale.submitPhoneNumber(req.body?.phone);
    res.json({ ok: true, bale: state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bale/select-iran', async (_req, res) => {
  try {
    const state = await outreachManager.bale.selectIranCountry();
    res.json({ ok: true, bale: state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bale/login-otp', async (req, res) => {
  try {
    const state = await outreachManager.bale.submitOtpCode(req.body?.code);
    res.json({ ok: true, bale: state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bale/interact', async (req, res) => {
  try {
    const state = await outreachManager.bale.remoteInteract(req.body || {});
    res.json({ ok: true, bale: state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bale/logout', async (_req, res) => {
  const state = await outreachManager.bale.logout();
  res.json({ ok: true, bale: state });
});

// 12. Preview rule engine or campaign template
router.post('/preview-rule', (req, res) => {
  const text = String(req.body?.text || '');
  const sampleContact = {
    phone: req.body?.phone || '09121112233',
    full_name: req.body?.fullName || 'مهندس رضایی',
    agency_name: req.body?.agencyName || 'املاک نیاوران',
    district: req.body?.district || 'شمال و شرق تهران',
  };
  const decision = evaluateAgentReply(text, sampleContact);
  const templates = outreachManager.getOutreachSettings().templates;
  const renderedTemplates = templates.map((t) => renderCampaignTemplate(t, sampleContact));
  res.json({
    ok: true,
    decision,
    renderedTemplates,
  });
});

// 13. Automated Lead Discovery (Public Web Phones + Divar Unique Agents for North Tehran Districts 1-8)
router.get('/discovery/overview', (req, res) => {
  const data = leadDiscoveryEngine.getDiscoveryOverview({
    filter: String(req.query.filter || 'all'),
    district: String(req.query.district || ''),
    search: String(req.query.search || '').trim(),
    limit: Number(req.query.limit) || 150,
  });
  res.json(data);
});

router.post('/discovery/start', (req, res) => {
  try {
    const job = leadDiscoveryEngine.startDiscoveryJob({
      mode: req.body?.mode || 'both',
      districts: req.body?.districts || ['1', '2', '3'],
      autoImportToOutreach: req.body?.autoImportToOutreach !== false,
    });
    res.json({
      ok: true,
      job,
      message: 'موتور استخراج خودکار مشاورین شمال تهران آغاز به کار کرد.',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/discovery/stop', (_req, res) => {
  leadDiscoveryEngine.stopActiveJob();
  res.json({ ok: true, message: 'درخواست توقف عملیات استخراج ثبت شد.' });
});

router.post('/discovery/parse-text', async (req, res) => {
  const rawText = String(req.body?.rawText || '').trim();
  const defaultDistrict = String(req.body?.defaultDistrict || 'منطقه 1').trim();
  if (!rawText) {
    return res.status(400).json({ error: 'لطفاً متن یا محتوای کپی‌شده را وارد کنید.' });
  }
  const result = await leadDiscoveryEngine.parseCustomTextWithAI(rawText, {
    defaultDistrict,
    autoImportToOutreach: req.body?.autoImportToOutreach !== false,
  });
  res.json({
    ...result,
    message: `${result.saved} مشاور جدید (${result.phones} شماره موبایل) با موفقیت استخراج شد.`,
  });
});

router.post('/discovery/import-to-outreach', (_req, res) => {
  const resImport = leadDiscoveryEngine.importAllMobileLeadsToOutreach();
  res.json({
    ...resImport,
    message: `${resImport.imported} شماره موبایل جدید به صف کمپین بله و واتس‌اپ اضافه شد.`,
  });
});

router.patch('/discovery/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM discovered_leads WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'ردیف مورد نظر یافت نشد.' });
  }
  const phone = req.body?.phone ? config.normalizePhone(req.body.phone) : existing.phone;
  if (req.body?.phone && !config.isValidIranMobile(phone)) {
    return res.status(400).json({ error: 'شماره موبایل معتبر وارد کنید (09...).' });
  }
  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName).trim() : existing.full_name;
  const agencyName = req.body?.agencyName !== undefined ? String(req.body.agencyName).trim() : existing.agency_name;
  const district = req.body?.district !== undefined ? String(req.body.district).trim() : existing.district;

  db.prepare(`
    UPDATE discovered_leads
    SET phone = ?, full_name = ?, agency_name = ?, district = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(phone, fullName, agencyName, district, id);

  // If valid phone added to a Divar unique agent, automatically push into outreach_contacts!
  if (config.isValidIranMobile(phone) && phone !== config.ADMIN_PHONE) {
    const cExists = db.prepare('SELECT id FROM outreach_contacts WHERE phone = ?').get(phone);
    if (!cExists) {
      db.prepare(`
        INSERT INTO outreach_contacts (phone, full_name, agency_name, district, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(phone, fullName, agencyName, district, `تکمیل شماره مشاور دیوار - ${existing.neighborhood || ''}`);
    }
    db.prepare('UPDATE discovered_leads SET imported_to_outreach = 1 WHERE id = ?').run(id);
  }

  res.json({ ok: true, message: 'اطلاعات مشاور ذخیره و به لیست ارسال اضافه شد.' });
});

router.get('/discovery/export.csv', (_req, res) => {
  const rows = db.prepare('SELECT * FROM discovered_leads ORDER BY (CASE WHEN phone != "" THEN 0 ELSE 1 END), id DESC').all();
  const header = 'phone,full_name,agency_name,district,neighborhood,landline,source,active_ads_count,listing_url';
  const csvLines = rows.map((r) =>
    [
      r.phone,
      r.full_name,
      r.agency_name,
      r.district,
      r.neighborhood,
      r.landline,
      r.source,
      r.active_ads_count,
      r.listing_url,
    ]
      .map((val) => `"${String(val || '').replace(/"/g, '""')}"`)
      .join(',')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nokabin_north_tehran_agents.csv"');
  res.send('\uFEFF' + [header, ...csvLines].join('\n'));
});

module.exports = router;
