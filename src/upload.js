const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${rand}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 6 * 1024 * 1024, // 6 MB per image
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error('فقط فایل‌های تصویری با فرمت JPG، PNG یا WebP مجاز هستند.'));
    }
    cb(null, true);
  },
});

function cleanupFiles(files) {
  if (!Array.isArray(files)) return;
  for (const f of files) {
    if (f?.path && fs.existsSync(f.path)) {
      try {
        fs.unlinkSync(f.path);
      } catch {
        // ignore cleanup error
      }
    }
  }
}

module.exports = {
  upload,
  cleanupFiles,
};
