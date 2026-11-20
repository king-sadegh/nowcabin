const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const { KitchenEditPromptBuilder } = require('../src/engine/KitchenEditPromptBuilder');
const { getActiveImageModel, estimateRequestCostUsd } = require('../src/engine/geminiImageEditor');

const PORT = 3525;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc = null;

async function waitForHealth() {
  for (let i = 0; i < 25; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not start in time');
}

test.before(async () => {
  serverProc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), GEMINI_API_KEY: '', OTP_TEST_MODE: 'true' },
    stdio: 'ignore',
  });
  await waitForHealth();
});

test.after(() => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
  }
});

test('Phase 7.1: KitchenEditPromptBuilder generates distinct per-photo prompts with strict preservation & customer options', () => {
  const pA = KitchenEditPromptBuilder.build({
    imageIndex: 0,
    totalImages: 1,
    analysis: {
      kitchenShape: 'linear',
      doorCountEstimate: 8,
      drawerCountEstimate: 3,
      appliancesSummary: 'Fridge on left, sink center, stove right',
    },
    options: {
      cabinetColor: 'cream',
      countertopMaterial: 'wood',
      handleStyle: 'black',
      designStyle: 'neoclassical',
    },
  });

  const pB = KitchenEditPromptBuilder.build({
    imageIndex: 1,
    totalImages: 3,
    analysis: {
      kitchenShape: 'l_shape',
      doorCountEstimate: 14,
      drawerCountEstimate: 6,
      appliancesSummary: 'Fridge on right, window above sink',
    },
    options: {
      cabinetColor: 'olive_green',
      upperColor: 'white',
      countertopMaterial: 'marble',
      handleStyle: 'gold',
      designStyle: 'modern',
      changeBacksplash: true,
    },
    qaFeedback: 'Keep the window frame on the right wall untouched.',
  });

  assert.notEqual(pA, pB);
  assert.ok(pA.includes('EDIT THE PROVIDED REAL KITCHEN PHOTOGRAPH'));
  assert.ok(pA.includes('Warm Ivory Cream'));
  assert.ok(pA.includes('butcher-block wood'));
  assert.ok(pA.includes('Matte black'));
  assert.ok(pB.includes('Olive Sage Green'));
  assert.ok(pB.includes('Warm Silk White'));
  assert.ok(pB.includes('MULTI-ANGLE CONSISTENCY NOTE'));
  assert.ok(pB.includes('CORRECTION FROM QUALITY CHECK'));
});

test('Phase 7.2: Default Gemini model is gemini-3.1-flash-image and cost estimator works per model', () => {
  assert.equal(getActiveImageModel(), 'gemini-3.1-flash-image');
  assert.equal(getActiveImageModel('gemini-3-pro-image'), 'gemini-3-pro-image');
  assert.ok(estimateRequestCostUsd('gemini-3.1-flash-image', 0) < estimateRequestCostUsd('gemini-3-pro-image', 0));
  assert.ok(estimateRequestCostUsd('gemini-3.1-flash-image', 1) > estimateRequestCostUsd('gemini-3.1-flash-image', 0));
});

test('Phase 7.3: Missing GEMINI_API_KEY fails loudly with 503 and never leaks or fakes output', async () => {
  const cfgResp = await fetch(`${BASE}/api/projects/gemini/config`).then((r) => r.json());
  assert.equal(cfgResp.ok, true);
  assert.equal(cfgResp.configured, false);
  assert.equal(cfgResp.activeModel, 'gemini-3.1-flash-image');

  const sample = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'before-1.jpg'));
  const fd = new FormData();
  fd.append('photos', new Blob([sample], { type: 'image/jpeg' }), 'before-1.jpg');
  fd.append('cabinetColor', 'cream');

  const editResp = await fetch(`${BASE}/api/projects/gemini-edit`, { method: 'POST', body: fd });
  assert.equal(editResp.status, 503);
  const editJson = await editResp.json();
  assert.equal(editJson.missingApiKey, true);
  assert.ok(editJson.error.includes('GEMINI_API_KEY'));
});
