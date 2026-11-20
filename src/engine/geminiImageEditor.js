const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db, getSetting } = require('../db');
const { KitchenEditPromptBuilder } = require('./KitchenEditPromptBuilder');
const {
  analyzeKitchenPhoto,
  compareBeforeAndAfter,
  fileToInlinePart,
  getGenAIClient,
} = require('./geminiKitchenAnalyzer');

const MODEL_ESTIMATED_COST_USD = {
  'gemini-3.1-flash-image': 0.04,
  'gemini-3-pro-image': 0.12,
  'gemini-3.1-flash-lite-image': 0.02,
};

function getActiveImageModel(overrideModel) {
  const candidate =
    overrideModel ||
    getSetting('gemini_image_model', '') ||
    process.env.GEMINI_IMAGE_MODEL ||
    config.GEMINI_IMAGE_MODEL ||
    'gemini-3.1-flash-image';
  return String(candidate).trim();
}

function estimateRequestCostUsd(modelName, retries = 0) {
  const perEdit = MODEL_ESTIMATED_COST_USD[modelName] ?? 0.04;
  const visionOverhead = 0.002 * (1 + retries);
  return Number((perEdit * (1 + retries) + visionOverhead).toFixed(4));
}

function checkDailyBudget() {
  const row = db
    .prepare(
      `SELECT COUNT(*) as reqs, COALESCE(SUM(estimated_cost), 0) as totalCost
       FROM gemini_edit_logs
       WHERE date(created_at) = date('now')`
    )
    .get();

  const maxReqs = Number(getSetting('gemini_max_requests_per_day', config.GEMINI_MAX_REQUESTS_PER_DAY)) || 300;
  const maxCost = Number(getSetting('gemini_max_cost_usd_per_day', config.GEMINI_MAX_COST_USD_PER_DAY)) || 25;

  if ((row?.reqs || 0) >= maxReqs) {
    throw new Error('سقف تعداد درخواست‌های روزانه هوش مصنوعی به پایان رسیده است.');
  }
  if ((row?.totalCost || 0) >= maxCost) {
    throw new Error('سقف هزینه روزانه هوش مصنوعی به پایان رسیده است.');
  }
}

function extractImageFromResponse(response) {
  const candidates = response?.candidates || [];
  for (const cand of candidates) {
    const parts = cand?.content?.parts || [];
    for (const part of parts) {
      if (part?.inlineData?.data) {
        return {
          dataBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
  }
  return null;
}

/**
 * Runs the full Gemini Image Editing pipeline for a SINGLE customer kitchen photo:
 * Input Validation -> Vision Analysis -> Dynamic Prompt -> Gemini Image Edit -> QA -> (Max 1 Retry) -> Store
 */
async function editSingleKitchenPhoto({
  projectId,
  imageId,
  imagePath,
  referenceImagePaths = [],
  imageIndex = 0,
  totalImages = 1,
  options = {},
  modelOverride,
  apiKeyOverride,
  skipQa = false,
} = {}) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error(`فایل تصویر ورودی یافت نشد (${imageId || 'unknown'}).`);
  }

  const ai = getGenAIClient(apiKeyOverride);
  checkDailyBudget();

  const modelName = getActiveImageModel(modelOverride);
  const inputSize = fs.statSync(imagePath).size;
  const projectOutDir = path.join(config.UPLOADS_DIR, 'projects', `proj_${projectId}`);
  fs.mkdirSync(projectOutDir, { recursive: true });

  const requestId = `req_${projectId}_${crypto.randomBytes(5).toString('hex')}`;
  const startedAt = Date.now();

  const logInsert = db
    .prepare(
      `INSERT INTO gemini_edit_logs (
         project_id, image_id, model_name, input_image_size, prompt, request_id, status
       ) VALUES (?, ?, ?, ?, '', ?, 'analyzing')`
    )
    .run(projectId, String(imageId || path.basename(imagePath)), modelName, inputSize, requestId);
  const logId = Number(logInsert.lastInsertRowid);

  let retryCount = 0;
  let finalOutputAbsPath = '';
  let finalOutputUrl = '';
  let lastPrompt = '';
  let analysis = {};
  let qaResult = {};

  try {
    // 1. Analyze input photo using Gemini Vision
    analysis = await analyzeKitchenPhoto(imagePath, { apiKey: apiKeyOverride });
    db.prepare(
      `UPDATE gemini_edit_logs SET analysis_json = ?, status = 'editing', updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(analysis), logId);

    const maxRetries = Number(config.GEMINI_MAX_RETRIES_PER_IMAGE ?? 1);
    let qaFeedback = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      retryCount = attempt;
      lastPrompt = KitchenEditPromptBuilder.build({
        imageIndex,
        totalImages,
        analysis,
        options,
        qaFeedback,
      });

      db.prepare(
        `UPDATE gemini_edit_logs SET prompt = ?, retry_count = ?, status = 'editing', updated_at = datetime('now') WHERE id = ?`
      ).run(lastPrompt, retryCount, logId);

      // Primary photo FIRST, followed by optional secondary reference photos
      const contents = [fileToInlinePart(imagePath)];
      for (const refPath of referenceImagePaths) {
        if (refPath && refPath !== imagePath && fs.existsSync(refPath)) {
          contents.push(fileToInlinePart(refPath));
        }
      }
      contents.push({ text: lastPrompt });

      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
        },
      });

      const extracted = extractImageFromResponse(response);
      if (!extracted) {
        throw new Error('مدل Gemini تصویر ویرایش‌شده‌ای برنگرداند.');
      }

      const ext = extracted.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const outFilename = `edited_${imageIndex + 1}_${requestId}_a${attempt}.${ext}`;
      finalOutputAbsPath = path.join(projectOutDir, outFilename);
      finalOutputUrl = `/uploads/projects/proj_${projectId}/${outFilename}`;
      fs.writeFileSync(finalOutputAbsPath, Buffer.from(extracted.dataBase64, 'base64'));

      if (skipQa) {
        qaResult = { passed: true, skipped: true };
        break;
      }

      // 2. Quality Verification comparing Original vs Edited
      db.prepare(
        `UPDATE gemini_edit_logs SET status = 'qa_checking', output_image_path = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(finalOutputUrl, logId);

      const reqSummary = `Color: ${options.cabinetColor || options.cabinetColorHex || 'cream'}, Countertop: ${options.countertopMaterial || 'unchanged'}, Handles: ${options.handleStyle || 'unchanged'}, Style: ${options.designStyle || 'modern'}`;
      qaResult = await compareBeforeAndAfter(imagePath, finalOutputAbsPath, reqSummary, { apiKey: apiKeyOverride });

      if (qaResult.passed) {
        break;
      }

      qaFeedback = qaResult.feedback || 'Preserve exact kitchen layout, windows, appliances, and cabinet count while applying requested cabinet finish.';
      if (attempt === maxRetries) {
        throw new Error(`خروجی تولیدشده کنترل کیفیت حفظ ساختار را پاس نکرد: ${qaFeedback}`);
      }
    }

    const elapsedMs = Date.now() - startedAt;
    const estCost = estimateRequestCostUsd(modelName, retryCount);

    db.prepare(
      `UPDATE gemini_edit_logs
       SET status = 'completed',
           generation_time = ?,
           output_image_path = ?,
           retry_count = ?,
           estimated_cost = ?,
           qa_result_json = ?,
           error_message = '',
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(elapsedMs, finalOutputUrl, retryCount, estCost, JSON.stringify(qaResult), logId);

    return {
      ok: true,
      logId,
      requestId,
      projectId,
      imageId: String(imageId || path.basename(imagePath)),
      modelName,
      generationTimeMs: elapsedMs,
      retryCount,
      estimatedCostUsd: estCost,
      outputUrl: finalOutputUrl,
      outputPath: finalOutputAbsPath,
      analysis,
      qaResult,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const estCost = estimateRequestCostUsd(modelName, retryCount);
    db.prepare(
      `UPDATE gemini_edit_logs
       SET status = 'failed',
           generation_time = ?,
           retry_count = ?,
           estimated_cost = ?,
           qa_result_json = ?,
           error_message = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(elapsedMs, retryCount, estCost, JSON.stringify(qaResult), err.message || String(err), logId);
    throw err;
  }
}

module.exports = {
  editSingleKitchenPhoto,
  getActiveImageModel,
  estimateRequestCostUsd,
  checkDailyBudget,
  MODEL_ESTIMATED_COST_USD,
};
