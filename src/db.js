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
  const defaultSettings = {
    max_photos_per_user: String(config.MAX_PHOTOS_PER_USER),
    default_commission_percent: String(config.DEFAULT_AGENT_COMMISSION_PERCENT),
    referral_discount_toman: String(config.REFERRAL_DISCOUNT_TOMAN),
  };

  for (const [k, v] of Object.entries(defaultSettings)) {
    const exists = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
    if (!exists || (k === 'max_photos_per_user' && exists.value === '5')) {
      setSetting(k, v);
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
