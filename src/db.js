const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.DATA_DIR, { recursive: true });
fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });

const dbPath = path.join(config.DATA_DIR, 'nokabin.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'agent', 'admin')),
    messenger TEXT DEFAULT NULL CHECK(messenger IN ('bale', 'whatsapp') OR messenger IS NULL),
    agency_name TEXT DEFAULT '',
    commission_percent REAL NOT NULL DEFAULT 5,
    is_approved INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    role_hint TEXT DEFAULT 'customer',
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inspection_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    district TEXT NOT NULL,
    address TEXT DEFAULT '',
    cabinet_type TEXT DEFAULT 'ام‌دی‌اف / چوب قدیمی',
    estimated_meters INTEGER DEFAULT 10,
    referrer_phone TEXT DEFAULT '',
    discount_toman INTEGER NOT NULL DEFAULT 0,
    contract_amount_toman INTEGER NOT NULL DEFAULT 70000000,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'contacted', 'inspected', 'in_progress', 'completed', 'cancelled')),
    notes TEXT DEFAULT '',
    admin_notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS uploaded_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    request_id INTEGER DEFAULT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES inspection_requests(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    agency_name TEXT DEFAULT '',
    district TEXT NOT NULL DEFAULT 'شمال و شرق تهران',
    messenger TEXT NOT NULL DEFAULT 'whatsapp' CHECK(messenger IN ('bale', 'whatsapp')),
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_user_id INTEGER NOT NULL,
    request_id INTEGER NOT NULL UNIQUE,
    amount_toman INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'paid')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT DEFAULT NULL,
    FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES inspection_requests(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gallery_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    district TEXT NOT NULL,
    paint_color TEXT NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 15,
    cost_toman INTEGER NOT NULL DEFAULT 70000000,
    before_image TEXT NOT NULL,
    after_image TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_featured INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kitchen_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER DEFAULT NULL,
    title TEXT NOT NULL DEFAULT 'پروژه بازسازی آشپزخانه',
    status TEXT NOT NULL DEFAULT 'draft',
    customer_photos_json TEXT NOT NULL DEFAULT '[]',
    dimensions_json TEXT NOT NULL DEFAULT '{}',
    cv_analysis_json TEXT DEFAULT NULL,
    missing_dimensions_json TEXT NOT NULL DEFAULT '[]',
    current_version INTEGER NOT NULL DEFAULT 1,
    error_log TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kitchen_scene_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    version_num INTEGER NOT NULL,
    scene_hash TEXT NOT NULL,
    scene_json TEXT NOT NULL,
    validation_json TEXT NOT NULL,
    change_request_text TEXT DEFAULT '',
    operations_json TEXT NOT NULL DEFAULT '[]',
    glb_path TEXT DEFAULT '',
    pricing_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, version_num),
    FOREIGN KEY (project_id) REFERENCES kitchen_projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS render_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    version_num INTEGER NOT NULL,
    scene_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'validating', 'rendering', 'completed', 'failed')),
    step_label TEXT NOT NULL DEFAULT 'در صف پردازش...',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 2,
    renders_json TEXT NOT NULL DEFAULT '[]',
    error_message TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES kitchen_projects(id) ON DELETE CASCADE
  );
`);

// Safe incremental migrations for kitchen_projects full pipeline traceability
(function migrateKitchenProjectsTraceability() {
  const cols = db.prepare('PRAGMA table_info(kitchen_projects)').all().map((c) => c.name);
  const additions = [
    ['uploaded_image_ids_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['uploaded_image_hashes_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['detected_kitchen_layout', "TEXT DEFAULT ''"],
    ['detected_cabinets_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['detected_appliances_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['detected_dimensions_json', "TEXT NOT NULL DEFAULT '{}'"],
    ['scene_parameters_json', "TEXT NOT NULL DEFAULT '{}'"],
    ['generated_model_id', "TEXT DEFAULT ''"],
    ['output_image_paths_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['processing_steps_json', "TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [col, def] of additions) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE kitchen_projects ADD COLUMN ${col} ${def};`);
    }
  }
})();

db.exec(`
  CREATE TABLE IF NOT EXISTS gemini_edit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    image_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_image_size INTEGER NOT NULL DEFAULT 0,
    prompt TEXT NOT NULL,
    request_id TEXT DEFAULT '',
    generation_time INTEGER NOT NULL DEFAULT 0,
    output_image_path TEXT DEFAULT '',
    retry_count INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'analyzing', 'editing', 'qa_checking', 'completed', 'failed')),
    analysis_json TEXT DEFAULT '{}',
    qa_result_json TEXT DEFAULT '{}',
    error_message TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES kitchen_projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS outreach_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL DEFAULT '',
    agency_name TEXT NOT NULL DEFAULT '',
    district TEXT NOT NULL DEFAULT 'شمال و شرق تهران',
    notes TEXT NOT NULL DEFAULT '',
    wa_status TEXT NOT NULL DEFAULT 'queued' CHECK(wa_status IN ('queued', 'sent', 'replied', 'registered', 'opted_out', 'failed', 'skipped')),
    wa_sent_at TEXT DEFAULT NULL,
    wa_last_msg_at TEXT DEFAULT NULL,
    wa_template_idx INTEGER DEFAULT NULL,
    wa_error TEXT DEFAULT '',
    bale_status TEXT NOT NULL DEFAULT 'queued' CHECK(bale_status IN ('queued', 'sent', 'replied', 'registered', 'opted_out', 'failed', 'skipped')),
    bale_sent_at TEXT DEFAULT NULL,
    bale_last_msg_at TEXT DEFAULT NULL,
    bale_template_idx INTEGER DEFAULT NULL,
    bale_error TEXT DEFAULT '',
    is_serious INTEGER NOT NULL DEFAULT 0,
    serious_reason TEXT NOT NULL DEFAULT '',
    serious_at TEXT DEFAULT NULL,
    bot_paused INTEGER NOT NULL DEFAULT 0,
    registered_agent_id INTEGER DEFAULT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outreach_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    channel TEXT NOT NULL CHECK(channel IN ('whatsapp', 'bale')),
    direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
    sender_type TEXT NOT NULL DEFAULT 'bot' CHECK(sender_type IN ('campaign', 'bot', 'admin', 'contact')),
    body TEXT NOT NULL,
    matched_rule TEXT DEFAULT '',
    external_id TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES outreach_contacts(id) ON DELETE CASCADE
  );
`);

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function seedDefaults() {
  const defaultTemplates = [
    'سلام {{name}}، مشاور محترم {{district}} 🌹\nمن از مجموعه تخصصی «نوکابین» پیام می‌دم. ما کابینت‌های قدیمی رو بدون تخریب و تعویض، با رنگ پلی‌اورتان در ۱۵ روز کاری با یک‌دهم هزینه تعویض (حدود ۷۰ میلیون به‌جای ۷۰۰ میلیون) نو می‌کنیم.\nبرای مشاورین املاک محترم {{district}}، ۵٪ پورسانت نقدی (~۳.۵ میلیون تومان) + ۲ میلیون تخفیف ویژه برای مشتری در نظر گرفتیم.\nمایل هستید شرایط همکاری و لینک اختصاصی‌تون رو بفرستم؟',
    'سلام {{name}}، مشاور محترم {{district}} 🌟\nخیلی از فایل‌های فروش یا اجاره در {{district}} فقط به‌خاطر قدیمی بودن کابینت آشپزخانه دیرتر معامله می‌شن.\nما در «نوکابین» بدون تخریب و با حفظ بدنه، کابینت‌ها رو با رنگ تخصصی پلی‌اورتان با ۱/۱۰ قیمت تعویض بازسازی می‌کنیم.\nبا معرفی هر مشتری، هم مشتری ۲ میلیون تخفیف می‌گیره و هم ۵٪ مبلغ قرارداد پورسانت تقدیم شما می‌شه. دوست دارید نمونه‌کارهای واقعی قبل و بعد رو ببینید؟',
    'سلام {{name}}، مشاور محترم {{district}} 🙏\nاز تیم مدیریت «نوکابین» (بازسازی تخصصی کابینت بدون تعویض) پیام می‌دم.\nطرح همکاری ویژه‌ای با دفاتر املاک {{district}} شروع کردیم: اجرای ۱۵ روزه با رنگ پلی‌اورتان، ۲ میلیون تخفیف مستقیم برای مشتری شما و ۵٪ پورسانت همکاری برای شما.\nاگر موافق باشید لینک دعوت اختصاصی و عکس نمونه‌کارها رو براتون ارسال کنم.'
  ];

  const defaultSettings = {
    max_photos_per_user: String(config.MAX_PHOTOS_PER_USER),
    default_commission_percent: String(config.DEFAULT_AGENT_COMMISSION_PERCENT),
    referral_discount_toman: String(config.REFERRAL_DISCOUNT_TOMAN),
    outreach_wa_campaign_enabled: 'false',
    outreach_bale_campaign_enabled: 'false',
    outreach_auto_reply_enabled: 'true',
    outreach_warmup_enabled: 'true',
    outreach_wa_daily_limit: '45',
    outreach_bale_daily_limit: '40',
    outreach_min_delay_sec: '90',
    outreach_max_delay_sec: '210',
    outreach_work_hour_start: '9',
    outreach_work_hour_end: '21',
    outreach_wa_proxy_url:
      'vless://307dac3f-2a85-4217-b109-cd79674c5f83@hu-node4a.aattaashserver.xyz:443?alpn=h2%2Chttp%2F1.1&encryption=mlkem768x25519plus.native.0rtt._nlfSFJEyY8tcgc295OROa03MtOUaS7bfU1tHecflkk&fp=chrome&security=tls&sni=hu-node4a.aattaashserver.xyz&type=tcp#TLS-MSKarami3',
    outreach_bale_proxy_url: '',
    outreach_admin_alert_phone: config.ADMIN_PHONE || '09225603574',
    outreach_admin_alert_channel: 'both',
    outreach_templates_json: JSON.stringify(defaultTemplates),
    outreach_wa_started_date: '',
    outreach_bale_started_date: '',
  };

  for (const [k, v] of Object.entries(defaultSettings)) {
    const exists = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
    if (
      !exists ||
      (k === 'max_photos_per_user' && exists.value === '5') ||
      (k === 'outreach_wa_proxy_url' && (!exists.value || exists.value.includes('h-pl.ok-habits.xyz'))) ||
      (k === 'outreach_templates_json' && exists.value.includes('سلام {{name}} عزیز'))
    ) {
      setSetting(k, v);
    }
  }

  // Clean any existing outreach_contacts where Persian comma '،' caused full_name to contain phone/agency/district
  const dirtyContacts = db
    .prepare("SELECT id, phone, full_name, agency_name, district FROM outreach_contacts WHERE full_name LIKE '%،%' OR full_name LIKE '%,%' OR full_name LIKE '%09%'")
    .all();
  for (const row of dirtyContacts) {
    const parts = String(row.full_name || '')
      .split(/[,،;\t|]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !config.isValidIranMobile(config.normalizePhone(s)));
    if (parts.length > 0) {
      const cleanName = parts[0];
      const cleanAgency = row.agency_name || (parts.length >= 2 ? parts[1] : '');
      const cleanDistrict = parts.length >= 3 ? parts[2] : row.district;
      db.prepare('UPDATE outreach_contacts SET full_name = ?, agency_name = ?, district = ? WHERE id = ?').run(
        cleanName,
        cleanAgency,
        cleanDistrict,
        row.id
      );
    }
  }

  // Ensure admin user exists
  const adminPhone = config.ADMIN_PHONE;
  const adminExists = db.prepare('SELECT id FROM users WHERE phone = ?').get(adminPhone);
  if (!adminExists) {
    db.prepare(`
      INSERT INTO users (phone, full_name, role, messenger, is_approved)
      VALUES (?, ?, 'admin', 'whatsapp', 1)
    `).run(adminPhone, 'مدیریت نوکابین');
  } else {
    db.prepare(`UPDATE users SET role = 'admin', is_approved = 1 WHERE phone = ?`).run(adminPhone);
  }

  // Seed initial demo agent & customer + 1 sample request if users count <= 1
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount <= 1) {
    const agentInfo = db.prepare(`
      INSERT INTO users (phone, full_name, role, messenger, agency_name, commission_percent, is_approved)
      VALUES ('09121112233', 'حسین رضایی', 'agent', 'bale', 'مسکن نیاوران', 5, 1)
    `).run();

    const custInfo = db.prepare(`
      INSERT INTO users (phone, full_name, role, is_approved)
      VALUES ('09123334455', 'سارا محمدی', 'customer', 1)
    `).run();

    db.prepare(`
      INSERT INTO agent_applications (user_id, full_name, phone, agency_name, district, messenger, notes, status)
      VALUES (?, 'حسین رضایی', '09121112233', 'مسکن نیاوران', 'شمال و شرق تهران', 'bale', 'همکاری در فایل‌های بازسازی منطقه ۱ و ۳', 'approved')
    `).run(agentInfo.lastInsertRowid);

    const reqInfo = db.prepare(`
      INSERT INTO inspection_requests (
        user_id, full_name, phone, district, address, cabinet_type, estimated_meters,
        referrer_phone, discount_toman, contract_amount_toman, status, notes
      ) VALUES (
        ?, 'سارا محمدی', '09123334455', 'شمال و شرق تهران', 'پاسداران، بوستان پنجم', 'چوب و روکش بلوط قدیمی', 12,
        '09121112233', 2000000, 70000000, 'in_progress', 'تغییر رنگ به کرم روشن و طوسی گرم با رنگ پلی‌اورتان'
      )
    `).run(custInfo.lastInsertRowid);

    db.prepare(`
      INSERT INTO commissions (agent_user_id, request_id, amount_toman, status)
      VALUES (?, ?, 3500000, 'approved')
    `).run(agentInfo.lastInsertRowid, reqInfo.lastInsertRowid);
  }

  // Seed realistic gallery projects if empty
  const galleryCount = db.prepare('SELECT COUNT(*) as c FROM gallery_projects').get().c;
  if (galleryCount === 0) {
    const insertGallery = db.prepare(`
      INSERT INTO gallery_projects (title, district, paint_color, duration_days, cost_toman, before_image, after_image, description, is_featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertGallery.run(
      'بازسازی کامل کابینت بلوط قدیمی — پروژه نیاوران',
      'شمال و شرق تهران',
      'رنگ پلی‌اورتان دو رنگ (گریژ گرم و کرم استخوانی)',
      15,
      70000000,
      '/assets/before-1.jpg',
      '/assets/after-1.jpg',
      'بدون تغییر چیدمان، بدون تعویض بدنه و بدون تغییر طرح درب‌ها؛ صرفاً زیرسازی تخصصی و اجرای رنگ پلی‌اورتان در ۱۵ روز کاری.',
      1
    );

    insertGallery.run(
      'احیای کابینت کلاسیک قهوه‌ای — پروژه پاسداران',
      'شمال و شرق تهران',
      'رنگ پلی‌اورتان سفید آلاباستر مات ابریشمی',
      15,
      68000000,
      '/assets/before-2.jpg',
      '/assets/after-2.jpg',
      'حفظ کامل درب‌های ابزارخورده و دستگیره‌های قبلی؛ تبدیل فضای تیره آشپزخانه به محیطی دلباز با یک‌دهم هزینه تعویض.',
      1
    );

    insertGallery.run(
      'ترمیم و رنگ‌آمیزی کابینت زردشده — پروژه تهرانپارس',
      'شمال و شرق تهران',
      'رنگ پلی‌اورتان بژ کشمیری ساتن',
      15,
      65000000,
      '/assets/before-3.jpg',
      '/assets/after-3.jpg',
      'رفع کامل خط و خش و زردشدگی قدیمی با بتونه‌کاری صنعتی و اجرای پوشش مقاوم رنگ پلی‌اورتان.',
      1
    );
  }

  // Normalize any legacy "غیرکوره‌ای" or "کوره‌ای" text in existing DB records
  db.prepare(`UPDATE gallery_projects SET paint_color = REPLACE(REPLACE(paint_color, ' غیرکوره‌ای', ''), ' کوره‌ای', ''), description = REPLACE(REPLACE(description, ' غیرکوره‌ای', ''), ' کوره‌ای', '')`).run();
  db.prepare(`UPDATE inspection_requests SET notes = REPLACE(REPLACE(notes, ' غیرکوره‌ای', ''), ' کوره‌ای', '') WHERE notes IS NOT NULL`).run();
}

seedDefaults();

module.exports = {
  db,
  getSetting,
  setSetting,
};
