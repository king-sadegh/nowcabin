const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('./src/config');
require('./src/db'); // initialize & seed DB
const { attachUser } = require('./src/auth');

const authRoutes = require('./src/routes/auth');
const inspectionRoutes = require('./src/routes/inspections');
const agentRoutes = require('./src/routes/agents');
const galleryRoutes = require('./src/routes/gallery');
const adminRoutes = require('./src/routes/admin');
const aiStudioRoutes = require('./src/routes/ai-studio');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(attachUser);

// Static files & uploaded photos
app.use('/uploads', express.static(config.UPLOADS_DIR));
app.use(express.static(path.join(config.ROOT_DIR, 'public')));

// Health check for Docker / aaPanel monitoring
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'nokabin', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai-studio', aiStudioRoutes);

// Friendly HTML route aliases
app.get(['/changes', '/gallery.html', '/gallery'], (_req, res) => {
  res.sendFile(path.join(config.ROOT_DIR, 'public', 'changes.html'));
});
app.get('/panel', (_req, res) => {
  res.sendFile(path.join(config.ROOT_DIR, 'public', 'panel.html'));
});

// Global error handler (including Multer file upload errors)
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'حجم هر تصویر نباید بیشتر از ۶ مگابایت باشد.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'تعداد فایل‌های ارسالی بیش از حد مجاز است.' });
  }
  res.status(err.status || 400).json({
    error: err.message || 'خطای غیرمنتظره‌ای در سرور رخ داد.',
  });
});

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`NoKabin server running on http://0.0.0.0:${config.PORT} (OTP_TEST_MODE=${config.OTP_TEST_MODE})`);
});
