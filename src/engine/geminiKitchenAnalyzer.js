const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const config = require('../config');

function detectMimeType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function fileToInlinePart(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    inlineData: {
      mimeType: detectMimeType(filePath),
      data: buf.toString('base64'),
    },
  };
}

function getGenAIClient(apiKeyOverride) {
  const key = apiKeyOverride || process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;
  if (!key) {
    throw new Error('کلید GEMINI_API_KEY در تنظیمات سرور وارد نشده است.');
  }
  return new GoogleGenAI({ apiKey: key });
}

function safeParseJson(text, fallback = {}) {
  try {
    const clean = String(text || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(clean);
  } catch {
    return fallback;
  }
}

/**
 * Analyzes a real customer kitchen photo using Gemini Vision and extracts structured
 * architectural, appliance, material, lighting, camera angle, and perspective metadata.
 */
async function analyzeKitchenPhoto(imagePath, { apiKey, visionModel } = {}) {
  const ai = getGenAIClient(apiKey);
  const model = visionModel || process.env.GEMINI_VISION_MODEL || config.GEMINI_VISION_MODEL || 'gemini-2.5-flash';

  const analysisPrompt = `Analyze this real kitchen photograph in detail for architectural renovation editing.
Return ONLY valid JSON with these exact keys:
{
  "kitchenShape": "linear | l_shape | u_shape | galley | island | other",
  "wallPositions": "description of visible walls",
  "baseCabinets": "description of lower cabinets",
  "upperCabinets": "description of upper wall cabinets",
  "doorCountEstimate": 0,
  "drawerCountEstimate": 0,
  "countertop": "current countertop material and color",
  "handles": "current handle style and finish",
  "sink": "location and type or none",
  "stove": "location and type or none",
  "hood": "location and type or none",
  "fridge": "location and type or none",
  "windows": "location and size or none",
  "doors": "room doors visible or none",
  "floor": "flooring material and color",
  "ceiling": "ceiling type and lighting",
  "backsplash": "current backsplash material and color",
  "lighting": "natural/warm/cool lighting direction and brightness",
  "cameraAngle": "eye-level / slightly angled left / slightly angled right / wide",
  "perspective": "perspective vanishing point and framing description",
  "appliancesSummary": "one-line summary of exact locations of fridge, sink, stove, hood, and windows"
}`;

  const response = await ai.models.generateContent({
    model,
    contents: [fileToInlinePart(imagePath), { text: analysisPrompt }],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = safeParseJson(text, null);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('تحلیل ساختار تصویر آشپزخانه توسط Gemini خروجی معتبر برنگرداند.');
  }
  return parsed;
}

/**
 * Compares the original customer photo against the Gemini-edited output image
 * to verify preservation of layout, windows, appliances, cabinet count, requested changes, and photorealism.
 */
async function compareBeforeAndAfter(beforePath, afterPath, requestedSummary = '', { apiKey, visionModel } = {}) {
  const ai = getGenAIClient(apiKey);
  const model = visionModel || process.env.GEMINI_VISION_MODEL || config.GEMINI_VISION_MODEL || 'gemini-2.5-flash';

  const qaPrompt = `Compare Image 1 (ORIGINAL kitchen photo) and Image 2 (RENOVATED kitchen photo).
Requested renovation: ${requestedSummary || 'Cabinet renovation'}

Evaluate strictly whether Image 2 is a genuine edit of Image 1 (not a different kitchen) and whether all constraints were respected.
Return ONLY valid JSON:
{
  "structurePreserved": true,
  "windowsPreserved": true,
  "fridgePreserved": true,
  "sinkPreserved": true,
  "stovePreserved": true,
  "cabinetCountPreserved": true,
  "requestedChangesApplied": true,
  "photorealistic": true,
  "passed": true,
  "feedback": "If passed is false, give a concise 1-2 sentence instruction describing what failed so the editor can fix it on retry; otherwise empty string."
}`;

  const response = await ai.models.generateContent({
    model,
    contents: [fileToInlinePart(beforePath), fileToInlinePart(afterPath), { text: qaPrompt }],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = safeParseJson(text, null);
  if (!parsed || typeof parsed !== 'object') {
    return {
      structurePreserved: false,
      photorealistic: false,
      passed: false,
      feedback: 'QA comparison could not parse structured JSON.',
    };
  }

  const passed = Boolean(
    parsed.passed &&
      parsed.structurePreserved !== false &&
      parsed.windowsPreserved !== false &&
      parsed.cabinetCountPreserved !== false &&
      parsed.requestedChangesApplied !== false &&
      parsed.photorealistic !== false
  );

  return {
    ...parsed,
    passed,
  };
}

module.exports = {
  analyzeKitchenPhoto,
  compareBeforeAndAfter,
  fileToInlinePart,
  getGenAIClient,
  detectMimeType,
};
