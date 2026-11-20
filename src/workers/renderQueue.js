const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db } = require('../db');
const { validateKitchenScene } = require('../engine/geometryValidator');
const { renderKitchenSceneMultiAngle } = require('../engine/renderEngine');

const RENDERS_DIR = path.join(config.UPLOADS_DIR, 'renders');
const GLB_DIR = path.join(config.UPLOADS_DIR, 'glb');
fs.mkdirSync(RENDERS_DIR, { recursive: true });
fs.mkdirSync(GLB_DIR, { recursive: true });

let isProcessing = false;
let workerKickScheduled = false;

function findCachedRendersByHash(sceneHash) {
  const row = db
    .prepare(
      `SELECT renders_json FROM render_jobs WHERE scene_hash = ? AND status = 'completed' ORDER BY id DESC LIMIT 1`
    )
    .get(sceneHash);
  if (!row) return null;
  try {
    const renders = JSON.parse(row.renders_json || '[]');
    if (renders.length < 3) return null;
    const allExist = renders.every((r) => r.filePath && fs.existsSync(r.filePath));
    return allExist ? renders : null;
  } catch {
    return null;
  }
}

function enqueueRenderJob({ projectId, versionNum, sceneHash }) {
  // Check if a job for same project & version is already active
  const existingActive = db
    .prepare(
      `SELECT * FROM render_jobs WHERE project_id = ? AND version_num = ? AND status IN ('queued', 'validating', 'rendering') ORDER BY id DESC LIMIT 1`
    )
    .get(projectId, versionNum);
  if (existingActive) {
    scheduleWorker();
    return existingActive;
  }

  // Deduplication cache check by scene_hash
  const cached = findCachedRendersByHash(sceneHash);
  if (cached) {
    const info = db
      .prepare(
        `INSERT INTO render_jobs (project_id, version_num, scene_hash, status, step_label, attempts, renders_json)
         VALUES (?, ?, ?, 'completed', 'تصاویر رندر با موفقیت آماده شد (بازیافت کش هندسی)', 1, ?)`
      )
      .run(projectId, versionNum, sceneHash, JSON.stringify(cached));

    db.prepare(`UPDATE kitchen_projects SET status = 'ready', updated_at = datetime('now') WHERE id = ?`).run(projectId);
    return db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(info.lastInsertRowid);
  }

  const info = db
    .prepare(
      `INSERT INTO render_jobs (project_id, version_num, scene_hash, status, step_label)
       VALUES (?, ?, ?, 'queued', 'در صف پردازش رندر سه‌بعدی...')`
    )
    .run(projectId, versionNum, sceneHash);

  db.prepare(`UPDATE kitchen_projects SET status = 'rendering', updated_at = datetime('now') WHERE id = ?`).run(projectId);

  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(info.lastInsertRowid);
  scheduleWorker();
  return job;
}

function scheduleWorker() {
  if (workerKickScheduled || isProcessing) return;
  workerKickScheduled = true;
  setImmediate(async () => {
    workerKickScheduled = false;
    await processNextJob();
  });
}

async function processNextJob() {
  if (isProcessing) return;
  const nextJob = db
    .prepare(`SELECT * FROM render_jobs WHERE status = 'queued' ORDER BY id ASC LIMIT 1`)
    .get();
  if (!nextJob) return;

  isProcessing = true;
  const jobId = nextJob.id;

  try {
    // Again check hash deduplication right before rendering
    const cached = findCachedRendersByHash(nextJob.scene_hash);
    if (cached) {
      db.prepare(
        `UPDATE render_jobs SET status = 'completed', step_label = 'تصاویر رندر آماده شد!', renders_json = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(JSON.stringify(cached), jobId);
      db.prepare(`UPDATE kitchen_projects SET status = 'ready', updated_at = datetime('now') WHERE id = ?`).run(nextJob.project_id);
      return;
    }

    db.prepare(
      `UPDATE render_jobs SET status = 'validating', attempts = attempts + 1, step_label = 'در حال کنترل نهایی هندسه سه‌بعدی...', updated_at = datetime('now') WHERE id = ?`
    ).run(jobId);

    const versionRow = db
      .prepare(`SELECT * FROM kitchen_scene_versions WHERE project_id = ? AND version_num = ?`)
      .get(nextJob.project_id, nextJob.version_num);

    if (!versionRow) {
      throw new Error('نسخه مدل سه‌بعدی برای رندر یافت نشد.');
    }

    const scene = JSON.parse(versionRow.scene_json);
    const { scene: validated, report } = validateKitchenScene(scene);
    if (!report.approved) {
      throw new Error(`مدل سه‌بعدی تایید نشد: ${report.errors.join(' | ')}`);
    }

    db.prepare(
      `UPDATE render_jobs SET status = 'rendering', step_label = 'در حال تولید تصاویر فوتورئال از چند زاویه...', updated_at = datetime('now') WHERE id = ?`
    ).run(jobId);

    const renderRes = await renderKitchenSceneMultiAngle(validated, {
      outputDir: RENDERS_DIR,
      prefix: `proj${nextJob.project_id}-v${nextJob.version_num}`,
      width: 960,
      height: 720,
    });

    db.prepare(
      `UPDATE render_jobs SET status = 'completed', step_label = 'تصاویر رندر و برآورد قیمت آماده شد!', renders_json = ?, error_message = '', updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(renderRes.renders), jobId);

    db.prepare(`UPDATE kitchen_projects SET status = 'ready', updated_at = datetime('now') WHERE id = ?`).run(nextJob.project_id);
  } catch (err) {
    const jobSnapshot = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(jobId);
    const canRetry = jobSnapshot && jobSnapshot.attempts < jobSnapshot.max_attempts;
    if (canRetry) {
      db.prepare(
        `UPDATE render_jobs SET status = 'queued', step_label = 'تلاش مجدد خودکار برای رندر...', error_message = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(err.message || String(err), jobId);
    } else {
      db.prepare(
        `UPDATE render_jobs SET status = 'failed', step_label = 'خطا در تولید رندر (امکان تلاش مجدد وجود دارد)', error_message = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(err.message || String(err), jobId);
      db.prepare(
        `UPDATE kitchen_projects SET status = 'render_failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(err.message || String(err), nextJob.project_id);
    }
  } finally {
    isProcessing = false;
    // Check if more queued jobs exist
    const more = db.prepare(`SELECT id FROM render_jobs WHERE status = 'queued' LIMIT 1`).get();
    if (more) {
      setTimeout(() => scheduleWorker(), 80);
    }
  }
}

function retryRenderJob(projectId) {
  const latest = db
    .prepare(`SELECT * FROM render_jobs WHERE project_id = ? ORDER BY id DESC LIMIT 1`)
    .get(projectId);
  if (!latest) return null;
  db.prepare(
    `UPDATE render_jobs SET status = 'queued', attempts = 0, step_label = 'در صف تلاش مجدد...', error_message = '', updated_at = datetime('now') WHERE id = ?`
  ).run(latest.id);
  db.prepare(`UPDATE kitchen_projects SET status = 'rendering', updated_at = datetime('now') WHERE id = ?`).run(projectId);
  scheduleWorker();
  return db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(latest.id);
}

module.exports = {
  RENDERS_DIR,
  GLB_DIR,
  enqueueRenderJob,
  retryRenderJob,
  findCachedRendersByHash,
};
