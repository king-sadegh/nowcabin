const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('child_process');

const PORT = 3519;
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

function generateDistinctKitchenTestImages() {
  const outDir = '/tmp/nokabin_phase6_fixtures';
  fs.mkdirSync(outDir, { recursive: true });
  const py = `
import os
from PIL import Image, ImageDraw
os.makedirs("${outDir}", exist_ok=True)

# Photo A: Linear 3m White Kitchen, Fridge on Left, Sink Center, Stove Right
imA = Image.new("RGB", (640, 480), (218, 212, 202))
dA = ImageDraw.Draw(imA)
dA.rectangle([0, 0, 640, 55], fill=(175, 168, 158))      # Ceiling shadow
dA.rectangle([0, 440, 640, 480], fill=(130, 122, 112))   # Stone floor
dA.rectangle([20, 60, 140, 440], fill=(195, 200, 206))   # Fridge left
dA.rectangle([150, 70, 610, 205], fill=(244, 242, 238))  # White uppers
dA.rectangle([150, 205, 610, 260], fill=(190, 184, 174)) # Backsplash
dA.rectangle([150, 260, 610, 440], fill=(238, 236, 232)) # White lowers
dA.line([(300, 260), (300, 440)], fill=(150, 145, 138), width=3)
dA.line([(460, 260), (460, 440)], fill=(150, 145, 138), width=3)
dA.rectangle([500, 250, 600, 265], fill=(30, 30, 34))    # Dark stove right
imA.save("${outDir}/kitchen_a.jpg", "JPEG")

# Photo B: L-shape 4m x 3m Brown Kitchen, Fridge on Right
imB = Image.new("RGB", (640, 480), (140, 100, 68))
dB = ImageDraw.Draw(imB)
dB.rectangle([500, 55, 620, 445], fill=(195, 200, 206))  # Fridge right
dB.rectangle([30, 65, 490, 210], fill=(122, 82, 48))  # Brown uppers
dB.rectangle([30, 260, 490, 445], fill=(108, 70, 38))  # Brown lowers
for x in [120, 210, 300, 390]:
    dB.line([(x, 260), (x, 445)], fill=(65, 40, 20), width=3)
dB.rectangle([160, 250, 260, 266], fill=(24, 24, 28))  # Dark stove on 1st wall
imB.save("${outDir}/kitchen_b.jpg", "JPEG")
`;
  execFileSync('python3', ['-c', py]);
  return {
    photoA: path.join(outDir, 'kitchen_a.jpg'),
    photoB: path.join(outDir, 'kitchen_b.jpg'),
  };
}

async function pollUntilDone(projectId) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 900));
    const resp = await fetch(`${BASE}/api/projects/${projectId}`);
    const data = await resp.json();
    if (data.project?.job?.status === 'completed') return data.project;
    if (data.project?.job?.status === 'failed') {
      throw new Error(`Render job failed for project ${projectId}: ${data.project.job.errorMessage}`);
    }
  }
  throw new Error(`Timed out polling project ${projectId}`);
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

test('Phase 6: Mandatory Two-Kitchen Verification (Project A Linear 3m White vs Project B L-Shape 4x3m Brown) produces genuinely distinct 3D geometry, traceability, and renders', async () => {
  const { photoA, photoB } = generateDistinctKitchenTestImages();

  // Project A: Linear 3m, white cabinets, fridge left, sink center, stove right
  const fdA = new FormData();
  fdA.append('photos', new Blob([fs.readFileSync(photoA)], { type: 'image/jpeg' }), 'kitchen_a.jpg');
  fdA.append('wallLengthMeters', '3.0');
  fdA.append('sideWallMeters', '2.4');
  fdA.append('ceilingHeightMeters', '2.8');
  fdA.append('layoutType', 'linear');
  fdA.append('fridgePosition', 'left');
  fdA.append('sinkPosition', 'center');
  fdA.append('stovePosition', 'right');
  fdA.append('paletteName', 'سفید ابریشمی');
  fdA.append('paletteUpperHex', '#f7f5f0');
  fdA.append('paletteLowerHex', '#f7f5f0');

  const resA = await fetch(`${BASE}/api/projects`, { method: 'POST', body: fdA });
  const jsonA = await resA.json();
  assert.equal(resA.status, 201, `Project A failed: ${JSON.stringify(jsonA)}`);
  assert.equal(jsonA.approved, true);

  // Project B: L-shape 4m x 3m, brown cabinets, fridge right, sink on 2nd wall, stove on 1st wall
  const fdB = new FormData();
  fdB.append('photos', new Blob([fs.readFileSync(photoB)], { type: 'image/jpeg' }), 'kitchen_b.jpg');
  fdB.append('wallLengthMeters', '4.0');
  fdB.append('sideWallMeters', '3.0');
  fdB.append('ceilingHeightMeters', '2.8');
  fdB.append('layoutType', 'l_shape');
  fdB.append('fridgePosition', 'right');
  fdB.append('sinkPosition', 'side_wall');
  fdB.append('stovePosition', 'first_wall');
  fdB.append('paletteName', 'قهوه‌ای موکا مدرن');
  fdB.append('paletteUpperHex', '#6e5544');
  fdB.append('paletteLowerHex', '#6e5544');

  const resB = await fetch(`${BASE}/api/projects`, { method: 'POST', body: fdB });
  const jsonB = await resB.json();
  assert.equal(resB.status, 201, `Project B failed: ${JSON.stringify(jsonB)}`);
  assert.equal(jsonB.approved, true);

  // Poll both projects to render completion
  const [projA, projB] = await Promise.all([
    pollUntilDone(jsonA.projectId),
    pollUntilDone(jsonB.projectId),
  ]);

  // 1. Distinct sceneHash & generated_model_id (zero cache collision!)
  assert.notEqual(jsonA.sceneHash, jsonB.sceneHash, 'Project A and B must NOT share the same sceneHash');
  assert.notEqual(
    projA.processingTrace.generated_model_id,
    projB.processingTrace.generated_model_id,
    'Generated model IDs must be distinct'
  );
  assert.notEqual(
    projA.processingTrace.uploaded_image_hashes[0],
    projB.processingTrace.uploaded_image_hashes[0],
    'Uploaded image SHA-256 hashes must be distinct'
  );

  // 2. Verify geometry & layout differences
  assert.equal(projA.processingTrace.detected_kitchen_layout, 'linear');
  assert.equal(projB.processingTrace.detected_kitchen_layout, 'l_shape');

  const cabsA = projA.processingTrace.detected_cabinets;
  const cabsB = projB.processingTrace.detected_cabinets;
  assert.ok(cabsA.every((c) => c.row === 'row_back'), 'Project A (linear) must only have row_back cabinets');
  assert.ok(cabsB.some((c) => c.row === 'row_left' || c.row === 'row_right'), 'Project B (L-shape) must have a second wall row');
  assert.notEqual(cabsA.length, cabsB.length, 'Cabinet counts must differ between 3m linear and 4x3m L-shape');

  // 3. Verify appliance placements match input specs
  const appA = Object.fromEntries(projA.processingTrace.detected_appliances.map((a) => [a.type, a.position]));
  const appB = Object.fromEntries(projB.processingTrace.detected_appliances.map((a) => [a.type, a.position]));

  // Project A: fridge left (x < 1.0), sink center (~1.0..2.2), stove right (> 2.0)
  assert.ok(appA.fridge[0] < 1.0, `Project A fridge must be on left, got x=${appA.fridge[0]}`);
  assert.ok(appA.sink[0] > appA.fridge[0] && appA.sink[0] < appA.stove[0], `Project A must have fridge < sink < stove, got ${JSON.stringify(appA)}`);

  // Project B: fridge right (x > 3.0), sink on 2nd wall (z > 0.7), stove on 1st wall (z < 0.5)
  assert.ok(appB.fridge[0] > 3.0, `Project B fridge must be on right, got x=${appB.fridge[0]}`);
  assert.ok(appB.sink[2] > 0.7, `Project B sink must be on 2nd wall (z > 0.7), got z=${appB.sink[2]}`);
  assert.ok(appB.stove[2] < 0.5, `Project B stove must be on 1st wall (z < 0.5), got z=${appB.stove[2]}`);

  // 4. Verify 3 renders each & rendered PNGs are distinct between A and B
  assert.equal(projA.job.renders.length, 3);
  assert.equal(projB.job.renders.length, 3);
  assert.equal(projA.processingTrace.output_image_paths.length, 3);
  assert.equal(projB.processingTrace.output_image_paths.length, 3);

  const imgA0 = fs.readFileSync(projA.job.renders[0].filePath);
  const imgB0 = fs.readFileSync(projB.job.renders[0].filePath);
  assert.equal(imgA0.equals(imgB0), false, 'Project A and Project B rendered images must differ');

  // 5. Verify 6 processing steps recorded
  assert.ok(projA.processingSteps.length >= 6);
  assert.ok(projB.processingSteps.length >= 6);
  assert.equal(projA.processingSteps.every((s) => s.status === 'completed'), true);
  assert.equal(projB.processingSteps.every((s) => s.status === 'completed'), true);
});
