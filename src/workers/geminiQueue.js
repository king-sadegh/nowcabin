const { db } = require('../db');
const { editSingleKitchenPhoto, getActiveImageModel } = require('../engine/geminiImageEditor');

const activeGeminiQueue = [];
let isGeminiWorkerBusy = false;

function enqueueGeminiProjectJob({ projectId, photos = [], options = {}, modelOverride }) {
  const jobPayload = {
    projectId,
    photos,
    options,
    modelOverride,
    createdAt: Date.now(),
  };

  db.prepare(
    `UPDATE kitchen_projects
     SET status = 'gemini_queued',
         error_log = '',
         processing_steps_json = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    JSON.stringify([
      { key: 'receive_photos', label: 'دریافت تصاویر', status: 'completed', detail: `${photos.length} تصویر دریافت شد` },
      { key: 'analyze_kitchen', label: 'تحلیل تصویر با Gemini', status: 'in_progress', detail: 'در صف پردازش...' },
      { key: 'gemini_edit', label: 'ویرایش فوتورئال Nano Banana', status: 'waiting', detail: '' },
      { key: 'qa_check', label: 'کنترل کیفیت حفظ ساختار', status: 'waiting', detail: '' },
    ]),
    projectId
  );

  activeGeminiQueue.push(jobPayload);
  kickGeminiWorker();
}

function kickGeminiWorker() {
  if (isGeminiWorkerBusy || activeGeminiQueue.length === 0) return;
  setImmediate(processNextGeminiJob);
}

async function processNextGeminiJob() {
  if (isGeminiWorkerBusy || activeGeminiQueue.length === 0) return;
  isGeminiWorkerBusy = true;
  const job = activeGeminiQueue.shift();
  const { projectId, photos, options, modelOverride } = job;

  try {
    const allPaths = photos.map((p) => p.absPath);
    const results = [];

    db.prepare(
      `UPDATE kitchen_projects SET status = 'gemini_processing', processing_steps_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      JSON.stringify([
        { key: 'receive_photos', label: 'دریافت تصاویر', status: 'completed', detail: `${photos.length} تصویر دریافت شد` },
        { key: 'analyze_kitchen', label: 'تحلیل تصویر با Gemini', status: 'in_progress', detail: `مدل: ${getActiveImageModel(modelOverride)}` },
        { key: 'gemini_edit', label: 'ویرایش فوتورئال Nano Banana', status: 'in_progress', detail: `پردازش مستقل ${photos.length} تصویر` },
        { key: 'qa_check', label: 'کنترل کیفیت حفظ ساختار', status: 'waiting', detail: '' },
      ]),
      projectId
    );

    // Process EACH uploaded photo with its own independent API request
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const refPaths = allPaths.filter((_, idx) => idx !== i);
      const res = await editSingleKitchenPhoto({
        projectId,
        imageId: p.id || `img_${i + 1}`,
        imagePath: p.absPath,
        referenceImagePaths: refPaths,
        imageIndex: i,
        totalImages: photos.length,
        options,
        modelOverride,
      });
      results.push({
        imageId: res.imageId,
        beforeUrl: p.url,
        afterUrl: res.outputUrl,
        modelName: res.modelName,
        generationTimeMs: res.generationTimeMs,
        retryCount: res.retryCount,
        estimatedCostUsd: res.estimatedCostUsd,
        qaPassed: Boolean(res.qaResult?.passed),
      });
    }

    const outPaths = results.map((r) => r.afterUrl);
    db.prepare(
      `UPDATE kitchen_projects
       SET status = 'gemini_ready',
           output_image_paths_json = ?,
           scene_parameters_json = ?,
           processing_steps_json = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      JSON.stringify(outPaths),
      JSON.stringify({ mode: 'gemini_image_editing', model: getActiveImageModel(modelOverride), options, results }),
      JSON.stringify([
        { key: 'receive_photos', label: 'دریافت تصاویر', status: 'completed', detail: `${photos.length} تصویر` },
        { key: 'analyze_kitchen', label: 'تحلیل تصویر با Gemini', status: 'completed', detail: 'استخراج کامل ساختار' },
        { key: 'gemini_edit', label: 'ویرایش فوتورئال Nano Banana', status: 'completed', detail: `${results.length} تصویر ویرایش شد` },
        { key: 'qa_check', label: 'کنترل کیفیت حفظ ساختار', status: 'completed', detail: 'تایید کیفیت قبل/بعد' },
      ]),
      projectId
    );
  } catch (err) {
    db.prepare(
      `UPDATE kitchen_projects
       SET status = 'gemini_failed',
           error_log = ?,
           processing_steps_json = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      err.message || String(err),
      JSON.stringify([
        { key: 'receive_photos', label: 'دریافت تصاویر', status: 'completed', detail: `${photos.length} تصویر` },
        { key: 'analyze_kitchen', label: 'تحلیل تصویر با Gemini', status: 'failed', detail: err.message || 'خطا' },
        { key: 'gemini_edit', label: 'ویرایش فوتورئال Nano Banana', status: 'failed', detail: err.message || 'ناموفق' },
        { key: 'qa_check', label: 'کنترل کیفیت حفظ ساختار', status: 'failed', detail: '' },
      ]),
      projectId
    );
  } finally {
    isGeminiWorkerBusy = false;
    kickGeminiWorker();
  }
}

module.exports = {
  enqueueGeminiProjectJob,
};
