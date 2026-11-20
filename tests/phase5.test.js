const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const PORT = 3511;
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
    env: { ...process.env, PORT: String(PORT), OTP_TEST_MODE: 'true' },
    stdio: 'ignore',
  });
  await waitForHealth();
});

test.after(() => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
  }
});

test('Phase 5.1: Geometry-driven Pricing Engine computes breakdown and min-max range without relying solely on raw photo', () => {
  const { createPrototypeKitchenScene } = require('../src/engine/prototypeKitchen');
  const { calculateKitchenPricing } = require('../src/engine/pricingEngine');

  const scene = createPrototypeKitchenScene({ initialState: 'before' });
  const pricing = calculateKitchenPricing(scene);
  assert.ok(pricing.metrics.doorsCount >= 10);
  assert.ok(pricing.metrics.drawersCount >= 6);
  assert.ok(pricing.metrics.totalFrontAreaSqM > 4);
  assert.ok(pricing.range.minMillions < pricing.range.maxMillions);
  assert.ok(pricing.breakdown.length >= 5);
  assert.ok(pricing.disclaimer.includes('بازدید'));
});

test('Phase 5.2: End-to-End API /api/projects flow (Missing dims -> Complete dims -> Async Render Queue -> NL Change -> Deduplication Cache)', async () => {
  const samplePhoto = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'before-1.jpg'));

  // 1. Submit missing dimensions -> must request exact dimensions and NOT approve
  const fdMissing = new FormData();
  fdMissing.append('photos', new Blob([samplePhoto], { type: 'image/jpeg' }), 'before-1.jpg');
  fdMissing.append('wallLengthMeters', '4.2'); // sideWallMeters & ceilingHeightMeters missing
  const resMissing = await fetch(`${BASE}/api/projects`, { method: 'POST', body: fdMissing });
  const missJson = await resMissing.json();
  assert.equal(missJson.ok, true);
  assert.equal(missJson.needsClarification, true);
  assert.ok(missJson.missingDimensions.some((m) => m.field === 'ceilingHeightMeters'));
  const projectId = missJson.projectId;

  // 2. Supply missing dimensions -> auto-constructs model, exports GLB, queues background render
  const resComplete = await fetch(`${BASE}/api/projects/${projectId}/dimensions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sideWallMeters: 3.4, ceilingHeightMeters: 2.8, layoutType: 'l_shape' }),
  });
  const compJson = await resComplete.json();
  assert.equal(compJson.approved, true);
  assert.ok(compJson.glbUrl && compJson.glbUrl.endsWith('.glb'));
  assert.ok(compJson.pricing.range.minMillions > 20);

  // Verify GLB downloadable via /uploads/glb/...
  const glbResp = await fetch(`${BASE}${compJson.glbUrl}`);
  assert.equal(glbResp.status, 200);
  const glbArr = Buffer.from(await glbResp.arrayBuffer());
  assert.equal(glbArr.readUInt32LE(0), 0x46546c67, 'Served GLB must be valid glTF 2.0 binary');

  // 3. Poll until initial background render finishes (without blocking HTTP server!)
  let projState = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const pollResp = await fetch(`${BASE}/api/projects/${projectId}`);
    projState = await pollResp.json();
    if (projState.project.job?.status === 'completed') break;
  }
  assert.equal(projState.project.job.status, 'completed');
  assert.equal(projState.project.job.renders.length, 3, 'Must produce 3 multi-angle renders from shared geometry');

  // Verify all 3 rendered PNGs are accessible via HTTP
  for (const r of projState.project.job.renders) {
    const imgResp = await fetch(`${BASE}${r.url}`);
    assert.equal(imgResp.status, 200);
    const bytes = (await imgResp.arrayBuffer()).byteLength;
    assert.ok(bytes > 25000);
  }

  // 4. Submit customer natural language change -> preserves layout on color/handle edit & updates render version
  const chResp = await fetch(`${BASE}/api/projects/${projectId}/changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeText: 'کابینت‌ها را کرم استخوانی کن، دستگیره‌ها را طلایی کن و صفحه کابینت را طرح چوب روشن کن',
    }),
  });
  const chJson = await chResp.json();
  assert.equal(chJson.ok, true);
  assert.equal(chJson.version, compJson.version + 1);
  assert.equal(chJson.layoutPreserved, true);
  assert.notEqual(chJson.sceneHash, compJson.sceneHash);

  // Poll modified version render completion
  let chState = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const pollResp = await fetch(`${BASE}/api/projects/${projectId}`);
    chState = await pollResp.json();
    if (chState.project.job?.status === 'completed') break;
  }
  assert.equal(chState.project.job.status, 'completed');
  assert.equal(chState.project.job.renders.length, 3);

  // 5. Duplicate hash check: re-submitting identical op hits render cache immediately
  const dupResp = await fetch(`${BASE}/api/projects/${projectId}/changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeText: 'کابینت‌ها را کرم استخوانی کن',
    }),
  });
  const dupJson = await dupResp.json();
  assert.equal(dupJson.ok, true);
  assert.equal(dupJson.sceneHash, chJson.sceneHash, 'Identical material state produces same sceneHash');
  assert.equal(dupJson.job.status, 'completed', 'Duplicate sceneHash must hit deduplication cache immediately');
});
