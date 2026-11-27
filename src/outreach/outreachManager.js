const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db, getSetting, setSetting } = require('../db');
const { syncReferralCommission } = require('../routes/inspections');
const { WhatsAppClient } = require('./whatsappClient');
const { BaleWebClient } = require('./baleClient');
const { evaluateAgentReply, renderCampaignTemplate, buildReferralLink } = require('./ruleEngine');

function getTehranDateHour() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return {
      dateStr: `${map.year}-${map.month}-${map.day}`,
      hour: Number(map.hour) % 24,
    };
  } catch {
    return {
      dateStr: now.toISOString().slice(0, 10),
      hour: now.getHours(),
    };
  }
}

function parseTemplatesJson(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((s) => String(s || '').trim()).filter(Boolean);
    }
  } catch {}
  return [
    'سلام {{name}} عزیز وقت بخیر 🌹\nمن از مجموعه تخصصی «نوکابین» پیام می‌دم. ما کابینت‌های قدیمی رو بدون تخریب و تعویض، با رنگ پلی‌اورتان در ۱۵ روز کاری با یک‌دهم هزینه تعویض (حدود ۷۰ میلیون به‌جای ۷۰۰ میلیون) نو می‌کنیم.\nبرای مشاورین املاک محترم منطقه {{district}}، ۵٪ پورسانت نقدی (~۳.۵ میلیون تومان) + ۲ میلیون تخفیف ویژه برای مشتری در نظر گرفتیم.\nمایل هستید شرایط همکاری و لینک اختصاصی‌تون رو بفرستم؟',
  ];
}

class OutreachManager {
  constructor() {
    this.wa = new WhatsAppClient();
    this.bale = new BaleWebClient();

    this.waNextSendAt = 0;
    this.baleNextSendAt = 0;
    this.waConsecutiveErrors = 0;
    this.baleConsecutiveErrors = 0;
    this.schedulerTimer = null;
    this.processingWa = false;
    this.processingBale = false;

    this._bindEvents();
  }

  init() {
    const waCreds = path.join(config.DATA_DIR, 'wa_auth', 'creds.json');
    const baleProfileDir = path.join(config.DATA_DIR, 'bale_profile');

    // Auto-resume WhatsApp session if credentials already exist on disk
    if (fs.existsSync(waCreds)) {
      this.wa.start().catch((err) => {
        console.error('[Outreach] Auto-start WhatsApp error:', err.message);
      });
    }

    // Auto-resume Bale Web browser if profile already exists on disk
    if (fs.existsSync(baleProfileDir)) {
      setTimeout(() => {
        this.bale.start().catch((err) => {
          console.error('[Outreach] Auto-start Bale error:', err.message);
        });
      }, 2000);
    }

    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = setInterval(() => {
      this.runSchedulerTick().catch((err) => {
        console.error('[Outreach] Scheduler tick error:', err.message);
      });
    }, 10000);

    // 60s Keep-Alive Watchdog: keeps both WhatsApp and Bale running permanently without manual login
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (fs.existsSync(waCreds) && this.wa.status === 'disconnected' && !this.wa.manualStop) {
        this.wa.start().catch(() => {});
      }
      if (fs.existsSync(baleProfileDir) && (this.bale.status === 'disconnected' || this.bale.status === 'error')) {
        this.bale.start().catch(() => {});
      }
    }, 60000);
  }

  _bindEvents() {
    this.wa.on('inbound_message', (payload) => {
      this.handleInboundMessage(payload).catch((err) => {
        console.error('[Outreach] WA inbound error:', err.message);
      });
    });

    this.wa.on('human_outbound', (payload) => {
      this.handleHumanPhoneTakeover(payload).catch((err) => {
        console.error('[Outreach] WA human takeover error:', err.message);
      });
    });

    this.bale.on('inbound_message', (payload) => {
      this.handleInboundMessage(payload).catch((err) => {
        console.error('[Outreach] Bale inbound error:', err.message);
      });
    });
  }

  getOutreachSettings() {
    return {
      waCampaignEnabled: getSetting('outreach_wa_campaign_enabled', 'false') === 'true',
      baleCampaignEnabled: getSetting('outreach_bale_campaign_enabled', 'false') === 'true',
      autoReplyEnabled: getSetting('outreach_auto_reply_enabled', 'true') === 'true',
      warmupEnabled: getSetting('outreach_warmup_enabled', 'true') === 'true',
      waDailyLimit: Math.max(1, Number(getSetting('outreach_wa_daily_limit', '45')) || 45),
      baleDailyLimit: Math.max(1, Number(getSetting('outreach_bale_daily_limit', '40')) || 40),
      minDelaySec: Math.max(15, Number(getSetting('outreach_min_delay_sec', '90')) || 90),
      maxDelaySec: Math.max(30, Number(getSetting('outreach_max_delay_sec', '210')) || 210),
      workHourStart: Number(getSetting('outreach_work_hour_start', '9')) || 9,
      workHourEnd: Number(getSetting('outreach_work_hour_end', '21')) || 21,
      waProxyUrl: getSetting('outreach_wa_proxy_url', ''),
      baleProxyUrl: getSetting('outreach_bale_proxy_url', ''),
      adminAlertPhone: config.normalizePhone(getSetting('outreach_admin_alert_phone', config.ADMIN_PHONE)),
      adminAlertChannel: getSetting('outreach_admin_alert_channel', 'both'),
      templates: parseTemplatesJson(getSetting('outreach_templates_json', '[]')),
      waStartedDate: getSetting('outreach_wa_started_date', ''),
      baleStartedDate: getSetting('outreach_bale_started_date', ''),
    };
  }

  updateOutreachSettings(patch = {}) {
    const map = {
      waCampaignEnabled: 'outreach_wa_campaign_enabled',
      baleCampaignEnabled: 'outreach_bale_campaign_enabled',
      autoReplyEnabled: 'outreach_auto_reply_enabled',
      warmupEnabled: 'outreach_warmup_enabled',
      waDailyLimit: 'outreach_wa_daily_limit',
      baleDailyLimit: 'outreach_bale_daily_limit',
      minDelaySec: 'outreach_min_delay_sec',
      maxDelaySec: 'outreach_max_delay_sec',
      workHourStart: 'outreach_work_hour_start',
      workHourEnd: 'outreach_work_hour_end',
      waProxyUrl: 'outreach_wa_proxy_url',
      baleProxyUrl: 'outreach_bale_proxy_url',
      adminAlertPhone: 'outreach_admin_alert_phone',
      adminAlertChannel: 'outreach_admin_alert_channel',
    };

    for (const [jsKey, dbKey] of Object.entries(map)) {
      if (patch[jsKey] !== undefined) {
        const val =
          typeof patch[jsKey] === 'boolean'
            ? patch[jsKey]
              ? 'true'
              : 'false'
            : String(patch[jsKey]).trim();
        setSetting(dbKey, val);
      }
    }

    if (Array.isArray(patch.templates)) {
      const cleaned = patch.templates.map((t) => String(t || '').trim()).filter(Boolean);
      if (cleaned.length > 0) {
        setSetting('outreach_templates_json', JSON.stringify(cleaned));
      }
    }

    const { dateStr } = getTehranDateHour();
    if (patch.waCampaignEnabled === true && !getSetting('outreach_wa_started_date', '')) {
      setSetting('outreach_wa_started_date', dateStr);
    }
    if (patch.baleCampaignEnabled === true && !getSetting('outreach_bale_started_date', '')) {
      setSetting('outreach_bale_started_date', dateStr);
    }

    return this.getOutreachSettings();
  }

  /**
   * Computes effective daily cap with gradual warm-up if enabled.
   */
  getEffectiveDailyCap(channel, settings) {
    const maxCap = channel === 'whatsapp' ? settings.waDailyLimit : settings.baleDailyLimit;
    if (!settings.warmupEnabled) return maxCap;

    const startedDate = channel === 'whatsapp' ? settings.waStartedDate : settings.baleStartedDate;
    if (!startedDate) return Math.min(maxCap, 15);

    const startMs = Date.parse(startedDate);
    if (Number.isNaN(startMs)) return maxCap;
    const daysElapsed = Math.max(0, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)));

    if (daysElapsed < 2) return Math.min(maxCap, 15);
    if (daysElapsed < 4) return Math.min(maxCap, 25);
    if (daysElapsed < 7) return Math.min(maxCap, 35);
    return maxCap;
  }

  getSentTodayCount(channel) {
    const col = channel === 'whatsapp' ? 'wa_sent_at' : 'bale_sent_at';
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM outreach_contacts WHERE ${col} >= date('now')`)
      .get();
    return Number(row?.c || 0);
  }

  /**
   * Bulk imports contacts from CSV/TSV/lines or JSON array.
   * Supports up to 2000+ numbers in a single fast SQLite transaction.
   */
  importContacts({ rawText = '', contacts = [], defaultDistrict = 'شمال و شرق تهران' } = {}) {
    const parsedRows = [];

    if (Array.isArray(contacts) && contacts.length > 0) {
      for (const c of contacts) {
        parsedRows.push({
          phone: config.normalizePhone(c.phone || ''),
          fullName: String(c.fullName || c.full_name || c.name || '').trim(),
          agencyName: String(c.agencyName || c.agency_name || c.agency || '').trim(),
          district: String(c.district || defaultDistrict || 'شمال و شرق تهران').trim(),
          notes: String(c.notes || '').trim(),
        });
      }
    }

    if (rawText && typeof rawText === 'string') {
      const lines = rawText.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Skip header row
        if (/^(phone|mobile|شماره|نام|ردیف)/i.test(line) && !/09\d{9}/.test(config.normalizePhone(line))) {
          continue;
        }

        // Split by comma, semicolon, tab, or pipe
        const parts = line.split(/[,;\t|]/).map((s) => s.trim());
        let phone = '';
        let fullName = '';
        let agencyName = '';
        let district = defaultDistrict || 'شمال و شرق تهران';

        // Find which column holds an Iranian mobile number
        let phoneIdx = -1;
        for (let i = 0; i < parts.length; i++) {
          const candidate = config.normalizePhone(parts[i]);
          if (config.isValidIranMobile(candidate)) {
            phone = candidate;
            phoneIdx = i;
            break;
          }
        }

        // Fallback: regex extract phone anywhere in line
        if (!phone) {
          const match = config.normalizePhone(line).match(/09\d{9}/);
          if (match) phone = match[0];
        }

        if (!phone) continue;

        const otherCols = parts.filter((_, idx) => idx !== phoneIdx && Boolean(_));
        if (otherCols.length >= 1) fullName = otherCols[0];
        if (otherCols.length >= 2) agencyName = otherCols[1];
        if (otherCols.length >= 3) district = otherCols[2];

        parsedRows.push({
          phone,
          fullName,
          agencyName,
          district: district || defaultDistrict || 'شمال و شرق تهران',
          notes: '',
        });
      }
    }

    let inserted = 0;
    let updated = 0;
    let invalid = 0;
    const seen = new Set();

    const existingStmt = db.prepare('SELECT id, full_name, agency_name, district FROM outreach_contacts WHERE phone = ?');
    const insertStmt = db.prepare(`
      INSERT INTO outreach_contacts (phone, full_name, agency_name, district, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`
      UPDATE outreach_contacts
      SET full_name = CASE WHEN ? != '' THEN ? ELSE full_name END,
          agency_name = CASE WHEN ? != '' THEN ? ELSE agency_name END,
          district = CASE WHEN ? != '' THEN ? ELSE district END,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    db.exec('BEGIN');
    try {
      for (const row of parsedRows) {
        if (!config.isValidIranMobile(row.phone)) {
          invalid++;
          continue;
        }
        if (seen.has(row.phone)) continue;
        seen.add(row.phone);

        // Skip admin's own number
        if (row.phone === config.ADMIN_PHONE) continue;

        const existing = existingStmt.get(row.phone);
        if (!existing) {
          insertStmt.run(
            row.phone,
            row.fullName || '',
            row.agencyName || '',
            row.district || 'شمال و شرق تهران',
            row.notes || ''
          );
          inserted++;
        } else {
          updateStmt.run(
            row.fullName,
            row.fullName,
            row.agencyName,
            row.agencyName,
            row.district,
            row.district,
            existing.id
          );
          updated++;
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return {
      ok: true,
      inserted,
      updated,
      invalid,
      totalProcessed: inserted + updated,
    };
  }

  /**
   * Registers or upgrades a contact as an approved Real Estate Agent in NoKabin's main users/agent_applications tables.
   */
  ensureAgentRegisteredInSystem(contact, preferredMessenger = 'whatsapp') {
    const phone = config.normalizePhone(contact.phone);
    if (!config.isValidIranMobile(phone)) return null;

    const fullName = (contact.full_name || '').trim() || `مشاور املاک (${phone})`;
    const agencyName = (contact.agency_name || '').trim();
    const district = (contact.district || '').trim() || 'شمال و شرق تهران';
    const messenger = preferredMessenger === 'bale' ? 'bale' : 'whatsapp';
    const defaultCommission = Number(
      getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT)
    );

    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      const info = db
        .prepare(`
          INSERT INTO users (phone, full_name, role, messenger, agency_name, commission_percent, is_approved)
          VALUES (?, ?, 'agent', ?, ?, ?, 1)
        `)
        .run(phone, fullName, messenger, agencyName, defaultCommission);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    } else {
      const nextRole = user.role === 'admin' ? 'admin' : 'agent';
      db.prepare(`
        UPDATE users
        SET role = ?,
            full_name = CASE WHEN full_name = '' THEN ? ELSE full_name END,
            agency_name = CASE WHEN agency_name = '' AND ? != '' THEN ? ELSE agency_name END,
            messenger = COALESCE(messenger, ?)
        WHERE id = ?
      `).run(nextRole, fullName, agencyName, agencyName, messenger, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    const appExists = db.prepare('SELECT id FROM agent_applications WHERE phone = ?').get(phone);
    if (!appExists) {
      db.prepare(`
        INSERT INTO agent_applications (user_id, full_name, phone, agency_name, district, messenger, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, 'ثبت خودکار از کمپین دعوت مشاورین املاک', 'approved')
      `).run(user.id, fullName, phone, agencyName, district, messenger);
    }

    // Retroactively link any inspection requests with this agent's phone
    const existingReferrals = db
      .prepare('SELECT id, contract_amount_toman FROM inspection_requests WHERE referrer_phone = ?')
      .all(phone);
    for (const r of existingReferrals) {
      syncReferralCommission(r.id, phone, r.contract_amount_toman);
    }

    db.prepare(`
      UPDATE outreach_contacts
      SET registered_agent_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(user.id, contact.id);

    return user;
  }

  /**
   * Handles when the admin replies directly from their WhatsApp mobile app on the separate phone line.
   * Automatically pauses the bot for that contact so the bot never interrupts the admin.
   */
  async handleHumanPhoneTakeover({ channel, phone, text, externalId }) {
    const norm = config.normalizePhone(phone);
    if (!config.isValidIranMobile(norm) || norm === config.ADMIN_PHONE) return;

    let contact = db.prepare('SELECT * FROM outreach_contacts WHERE phone = ?').get(norm);
    if (!contact) return;

    db.prepare(`
      INSERT INTO outreach_messages (contact_id, channel, direction, sender_type, body, external_id)
      VALUES (?, ?, 'outbound', 'admin', ?, ?)
    `).run(contact.id, channel, text, externalId || '');

    db.prepare(`
      UPDATE outreach_contacts
      SET bot_paused = 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(contact.id);
  }

  /**
   * Handles any incoming message from an agent on WhatsApp or Bale.
   */
  async handleInboundMessage({ channel, phone, text, pushName = '', externalId = '' }) {
    const norm = config.normalizePhone(phone);
    if (!config.isValidIranMobile(norm)) return;

    const settings = this.getOutreachSettings();
    // Ignore messages coming from the admin alert phone to prevent feedback loops
    if (norm === settings.adminAlertPhone) return;

    let contact = db.prepare('SELECT * FROM outreach_contacts WHERE phone = ?').get(norm);
    if (!contact) {
      const info = db
        .prepare(`
          INSERT INTO outreach_contacts (phone, full_name, wa_status, bale_status)
          VALUES (?, ?, ?, ?)
        `)
        .run(
          norm,
          pushName || '',
          channel === 'whatsapp' ? 'replied' : 'queued',
          channel === 'bale' ? 'replied' : 'queued'
        );
      contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(info.lastInsertRowid);
    } else if (!contact.full_name && pushName) {
      db.prepare('UPDATE outreach_contacts SET full_name = ? WHERE id = ?').run(pushName, contact.id);
      contact.full_name = pushName;
    }

    // Deduplicate identical externalId if present
    if (externalId) {
      const dup = db
        .prepare('SELECT id FROM outreach_messages WHERE contact_id = ? AND external_id = ?')
        .get(contact.id, externalId);
      if (dup) return;
    }

    // Record inbound message
    db.prepare(`
      INSERT INTO outreach_messages (contact_id, channel, direction, sender_type, body, external_id)
      VALUES (?, ?, 'inbound', 'contact', ?, ?)
    `).run(contact.id, channel, text, externalId || '');

    const statusCol = channel === 'whatsapp' ? 'wa_status' : 'bale_status';
    const timeCol = channel === 'whatsapp' ? 'wa_last_msg_at' : 'bale_last_msg_at';

    const currentStatus = contact[statusCol];
    const nextStatus = currentStatus === 'registered' ? 'registered' : 'replied';

    db.prepare(`
      UPDATE outreach_contacts
      SET ${statusCol} = ?,
          ${timeCol} = datetime('now'),
          unread_count = unread_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, contact.id);

    // Refresh contact row
    contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(contact.id);

    // If bot is paused for this contact (either already serious or admin took over), still notify admin if needed and stop
    if (contact.bot_paused) {
      if (contact.is_serious) {
        await this.notifyAdminSeriousLead(contact, channel, text, contact.serious_reason || 'پیام جدید از مشاور جدی');
      }
      return;
    }

    // Evaluate with Persian Rule & Keyword Engine
    const decision = evaluateAgentReply(text, contact);

    if (decision.isOptOut) {
      db.prepare(`
        UPDATE outreach_contacts
        SET wa_status = CASE WHEN ? = 'whatsapp' OR wa_status = 'queued' THEN 'opted_out' ELSE wa_status END,
            bale_status = CASE WHEN ? = 'bale' OR bale_status = 'queued' THEN 'opted_out' ELSE bale_status END,
            bot_paused = 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(channel, channel, contact.id);
    }

    if (decision.autoRegisterAgent) {
      this.ensureAgentRegisteredInSystem(contact, channel);
      db.prepare(`
        UPDATE outreach_contacts
        SET ${statusCol} = 'registered',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(contact.id);
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
      `).run(decision.seriousReason || 'مورد جدی همکاری', contact.id);
    }

    // Send automatic rule reply if autoReplyEnabled
    if (settings.autoReplyEnabled && decision.replyText) {
      try {
        await this.sendDirectMessage(contact.id, channel, decision.replyText, {
          senderType: 'bot',
          matchedRule: decision.category,
        });
      } catch (err) {
        console.error(`[Outreach] Failed auto-reply on ${channel} to ${contact.phone}:`, err.message);
      }
    }

    // If serious, forward summary to Admin's main number (09225603574) on WhatsApp/Bale
    if (decision.isSerious) {
      contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(contact.id);
      await this.notifyAdminSeriousLead(contact, channel, text, decision.seriousReason);
    }
  }

  /**
   * Sends a summary alert of a serious real-estate agent conversation to the admin's main phone (09225603574).
   */
  async notifyAdminSeriousLead(contact, sourceChannel, latestInboundText, reason = '') {
    const settings = this.getOutreachSettings();
    const adminPhone = config.normalizePhone(settings.adminAlertPhone || config.ADMIN_PHONE);
    if (!config.isValidIranMobile(adminPhone)) return;

    const channelLabel = sourceChannel === 'bale' ? 'پیام‌رسان بله' : 'واتس‌اپ';
    const refLink = buildReferralLink(contact.phone);

    const summaryText =
      `🔴 *هشدار مورد جدی مشاور املاک (نوکابین)*\n\n` +
      `👤 نام مشاور: ${contact.full_name || 'نامشخص'}\n` +
      `🏢 دفتر املاک: ${contact.agency_name || '-'}\n` +
      `📍 منطقه: ${contact.district || '-'}\n` +
      `📱 شماره تماس: ${contact.phone}\n` +
      `💬 پیام‌رسان: ${channelLabel}\n` +
      `🎯 علت تشخیص: ${reason || 'نیازمند ورود مدیریت'}\n\n` +
      `📩 آخرین پیام مشاور:\n«${latestInboundText}»\n\n` +
      `🔗 لینک اختصاصی مشاور:\n${refLink}\n` +
      `🛑 ربات برای این شماره متوقف شد تا شما مستقیماً در ${channelLabel} یا پنل مدیریت پاسخ دهید.`;

    const pref = settings.adminAlertChannel || 'both';
    const tryWa = (pref === 'both' || pref === 'whatsapp') && this.wa.status === 'connected';
    const tryBale = (pref === 'both' || pref === 'bale') && this.bale.status === 'connected';

    if (tryWa) {
      try {
        await this.wa.sendMessage(adminPhone, summaryText);
      } catch (err) {
        console.error('[Outreach] Failed sending WA alert to admin:', err.message);
      }
    }

    if (tryBale) {
      try {
        await this.bale.sendMessage(adminPhone, summaryText, { contactName: 'مدیریت نوکابین' });
      } catch (err) {
        console.error('[Outreach] Failed sending Bale alert to admin:', err.message);
      }
    }
  }

  /**
   * Sends an outbound message on WhatsApp or Bale and logs it in outreach_messages.
   */
  async sendDirectMessage(
    contactId,
    channel,
    text,
    { senderType = 'admin', matchedRule = '', templateIdx = null } = {}
  ) {
    const contact = db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(Number(contactId));
    if (!contact) {
      throw new Error('مخاطب مورد نظر یافت نشد.');
    }

    const cleanText = String(text || '').trim();
    if (!cleanText) {
      throw new Error('متن پیام نمی‌تواند خالی باشد.');
    }

    let sendRes;
    if (channel === 'whatsapp') {
      sendRes = await this.wa.sendMessage(contact.phone, cleanText);
    } else if (channel === 'bale') {
      sendRes = await this.bale.sendMessage(contact.phone, cleanText, {
        contactName: contact.full_name || `مشاور ${contact.phone}`,
      });
    } else {
      throw new Error('کانال پیام‌رسان نامعتبر است.');
    }

    db.prepare(`
      INSERT INTO outreach_messages (contact_id, channel, direction, sender_type, body, matched_rule, external_id)
      VALUES (?, ?, 'outbound', ?, ?, ?, ?)
    `).run(contact.id, channel, senderType, cleanText, matchedRule || '', sendRes?.externalId || '');

    const timeCol = channel === 'whatsapp' ? 'wa_last_msg_at' : 'bale_last_msg_at';
    db.prepare(`
      UPDATE outreach_contacts
      SET ${timeCol} = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(contact.id);

    // Only auto-pause bot when admin is replying to an existing inbound conversation (not initial manual invite)
    if (senderType === 'admin') {
      const inboundCount = db
        .prepare("SELECT COUNT(*) AS c FROM outreach_messages WHERE contact_id = ? AND direction = 'inbound'")
        .get(contact.id)?.c || 0;
      if (inboundCount > 0) {
        db.prepare('UPDATE outreach_contacts SET bot_paused = 1, unread_count = 0 WHERE id = ?').run(contact.id);
      } else {
        db.prepare('UPDATE outreach_contacts SET unread_count = 0 WHERE id = ?').run(contact.id);
      }
    }

    return sendRes;
  }

  /**
   * Periodic background scheduler tick: runs two independent campaigns (WhatsApp & Bale)
   * with work-hours enforcement, warm-up daily caps, random human jitter, and circuit-breaker safety.
   */
  async runSchedulerTick() {
    const settings = this.getOutreachSettings();
    const { hour } = getTehranDateHour();

    const withinWorkHours =
      settings.workHourStart <= settings.workHourEnd
        ? hour >= settings.workHourStart && hour < settings.workHourEnd
        : hour >= settings.workHourStart || hour < settings.workHourEnd;

    if (!withinWorkHours) return;

    const now = Date.now();

    // 1. Independent WhatsApp Campaign
    if (
      settings.waCampaignEnabled &&
      this.wa.status === 'connected' &&
      !this.processingWa &&
      now >= this.waNextSendAt
    ) {
      await this._processNextCampaignContact('whatsapp', settings);
    }

    // 2. Independent Bale Campaign
    if (
      settings.baleCampaignEnabled &&
      this.bale.status === 'connected' &&
      !this.processingBale &&
      now >= this.baleNextSendAt
    ) {
      await this._processNextCampaignContact('bale', settings);
    }
  }

  async _processNextCampaignContact(channel, settings) {
    const isWa = channel === 'whatsapp';
    if (isWa) this.processingWa = true;
    else this.processingBale = true;

    try {
      const sentToday = this.getSentTodayCount(channel);
      const effectiveCap = this.getEffectiveDailyCap(channel, settings);
      if (sentToday >= effectiveCap) {
        return;
      }

      const statusCol = isWa ? 'wa_status' : 'bale_status';
      const sentAtCol = isWa ? 'wa_sent_at' : 'bale_sent_at';
      const tplCol = isWa ? 'wa_template_idx' : 'bale_template_idx';
      const errCol = isWa ? 'wa_error' : 'bale_error';

      const contact = db
        .prepare(`
          SELECT * FROM outreach_contacts
          WHERE ${statusCol} = 'queued'
            AND wa_status != 'opted_out'
            AND bale_status != 'opted_out'
          ORDER BY id ASC
          LIMIT 1
        `)
        .get();

      if (!contact) {
        // Queue completed
        return;
      }

      const templates = settings.templates;
      const tplIdx = contact.id % templates.length;
      const messageBody = renderCampaignTemplate(templates[tplIdx], contact);

      try {
        await this.sendDirectMessage(contact.id, channel, messageBody, {
          senderType: 'campaign',
          templateIdx: tplIdx,
        });

        db.prepare(`
          UPDATE outreach_contacts
          SET ${statusCol} = 'sent',
              ${sentAtCol} = datetime('now'),
              ${tplCol} = ?,
              ${errCol} = '',
              updated_at = datetime('now')
          WHERE id = ?
        `).run(tplIdx, contact.id);

        if (isWa) this.waConsecutiveErrors = 0;
        else this.baleConsecutiveErrors = 0;
      } catch (err) {
        const isNotRegistered = err.code === 'NOT_ON_WHATSAPP';
        const failStatus = isNotRegistered ? 'skipped' : 'failed';

        db.prepare(`
          UPDATE outreach_contacts
          SET ${statusCol} = ?,
              ${errCol} = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(failStatus, String(err.message || 'خطا در ارسال'), contact.id);

        if (!isNotRegistered) {
          if (isWa) {
            this.waConsecutiveErrors++;
            if (this.waConsecutiveErrors >= 5) {
              setSetting('outreach_wa_campaign_enabled', 'false');
              console.warn('[Outreach] Circuit breaker paused WhatsApp campaign after 5 consecutive errors.');
            }
          } else {
            this.baleConsecutiveErrors++;
            if (this.baleConsecutiveErrors >= 5) {
              setSetting('outreach_bale_campaign_enabled', 'false');
              console.warn('[Outreach] Circuit breaker paused Bale campaign after 5 consecutive errors.');
            }
          }
        }
      }

      // Schedule next send with random human jitter
      const minMs = settings.minDelaySec * 1000;
      const maxMs = Math.max(minMs + 5000, settings.maxDelaySec * 1000);
      const jitterMs = minMs + Math.floor(Math.random() * (maxMs - minMs));

      if (isWa) this.waNextSendAt = Date.now() + jitterMs;
      else this.baleNextSendAt = Date.now() + jitterMs;
    } finally {
      if (isWa) this.processingWa = false;
      else this.processingBale = false;
    }
  }

  getOverviewState() {
    const settings = this.getOutreachSettings();
    const { dateStr, hour } = getTehranDateHour();

    const counts = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN is_serious = 1 THEN 1 ELSE 0 END) AS serious_count,
          SUM(CASE WHEN unread_count > 0 THEN 1 ELSE 0 END) AS unread_Threads,
          SUM(CASE WHEN wa_status = 'queued' THEN 1 ELSE 0 END) AS wa_queued,
          SUM(CASE WHEN wa_status = 'sent' THEN 1 ELSE 0 END) AS wa_sent,
          SUM(CASE WHEN wa_status = 'replied' THEN 1 ELSE 0 END) AS wa_replied,
          SUM(CASE WHEN wa_status = 'registered' THEN 1 ELSE 0 END) AS wa_registered,
          SUM(CASE WHEN wa_status = 'opted_out' THEN 1 ELSE 0 END) AS wa_opted_out,
          SUM(CASE WHEN wa_status = 'failed' THEN 1 ELSE 0 END) AS wa_failed,
          SUM(CASE WHEN wa_status = 'skipped' THEN 1 ELSE 0 END) AS wa_skipped,
          SUM(CASE WHEN bale_status = 'queued' THEN 1 ELSE 0 END) AS bale_queued,
          SUM(CASE WHEN bale_status = 'sent' THEN 1 ELSE 0 END) AS bale_sent,
          SUM(CASE WHEN bale_status = 'replied' THEN 1 ELSE 0 END) AS bale_replied,
          SUM(CASE WHEN bale_status = 'registered' THEN 1 ELSE 0 END) AS bale_registered,
          SUM(CASE WHEN bale_status = 'opted_out' THEN 1 ELSE 0 END) AS bale_opted_out,
          SUM(CASE WHEN bale_status = 'failed' THEN 1 ELSE 0 END) AS bale_failed,
          SUM(CASE WHEN bale_status = 'skipped' THEN 1 ELSE 0 END) AS bale_skipped
        FROM outreach_contacts
      `)
      .get();

    const waSentToday = this.getSentTodayCount('whatsapp');
    const baleSentToday = this.getSentTodayCount('bale');
    const waEffectiveCap = this.getEffectiveDailyCap('whatsapp', settings);
    const baleEffectiveCap = this.getEffectiveDailyCap('bale', settings);

    return {
      ok: true,
      tehranTime: { dateStr, hour },
      connections: {
        whatsapp: this.wa.getState(),
        bale: this.bale.getState(),
      },
      campaigns: {
        whatsapp: {
          enabled: settings.waCampaignEnabled,
          sentToday: waSentToday,
          effectiveDailyCap: waEffectiveCap,
          configuredDailyLimit: settings.waDailyLimit,
          nextSendInSec: Math.max(0, Math.round((this.waNextSendAt - Date.now()) / 1000)),
          consecutiveErrors: this.waConsecutiveErrors,
        },
        bale: {
          enabled: settings.baleCampaignEnabled,
          sentToday: baleSentToday,
          effectiveDailyCap: baleEffectiveCap,
          configuredDailyLimit: settings.baleDailyLimit,
          nextSendInSec: Math.max(0, Math.round((this.baleNextSendAt - Date.now()) / 1000)),
          consecutiveErrors: this.baleConsecutiveErrors,
        },
      },
      stats: {
        totalContacts: Number(counts?.total || 0),
        seriousCount: Number(counts?.serious_count || 0),
        unreadThreads: Number(counts?.unread_Threads || 0),
        whatsapp: {
          queued: Number(counts?.wa_queued || 0),
          sent: Number(counts?.wa_sent || 0),
          replied: Number(counts?.wa_replied || 0),
          registered: Number(counts?.wa_registered || 0),
          optedOut: Number(counts?.wa_opted_out || 0),
          failed: Number(counts?.wa_failed || 0),
          skipped: Number(counts?.wa_skipped || 0),
        },
        bale: {
          queued: Number(counts?.bale_queued || 0),
          sent: Number(counts?.bale_sent || 0),
          replied: Number(counts?.bale_replied || 0),
          registered: Number(counts?.bale_registered || 0),
          optedOut: Number(counts?.bale_opted_out || 0),
          failed: Number(counts?.bale_failed || 0),
          skipped: Number(counts?.bale_skipped || 0),
        },
      },
      settings,
    };
  }
}

const outreachManager = new OutreachManager();

module.exports = {
  outreachManager,
};
