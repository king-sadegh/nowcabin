const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrototypeKitchenScene } = require('../src/engine/prototypeKitchen');
const { parseNaturalLanguageToOperations, applyStructuredOperations } = require('../src/engine/changeEngine');
const { renderKitchenSceneMultiAngle } = require('../src/engine/renderEngine');
const { generateBlenderCyclesScript } = require('../src/engine/blenderScriptGenerator');

const TEST_OUT = path.join(__dirname, '..', 'renders', 'phase3_test');

test('Phase 3.1: Blender Cycles bpy script generator outputs valid scene & camera script', () => {
  const scene = createPrototypeKitchenScene({ initialState: 'before' });
  const py = generateBlenderCyclesScript(scene, '/tmp/blender_test');
  assert.ok(py.includes('bpy.ops.render.render'));
  assert.ok(py.includes('cam_front'));
  assert.ok(py.includes('cam_right'));
  assert.ok(py.includes('cam_left'));
});

test('Phase 3.2: Multi-angle WebGL PBR Renderer renders 3 distinct synchronized angles from shared 3D geometry (Before + After Changes)', async () => {
  const beforeScene = createPrototypeKitchenScene({ initialState: 'before' });
  const beforeRes = await renderKitchenSceneMultiAngle(beforeScene, {
    outputDir: TEST_OUT,
    prefix: 'proto_before',
    width: 960,
    height: 720,
  });

  assert.equal(beforeRes.renders.length, 3);
  beforeRes.renders.forEach((r) => {
    assert.ok(fs.existsSync(r.filePath), `${r.filePath} must exist`);
    assert.ok(r.byteLength > 25000, `Rendered PNG ${r.filename} must have rich visual content (${r.byteLength} bytes)`);
    const buf = fs.readFileSync(r.filePath);
    assert.equal(buf.slice(1, 4).toString('ascii'), 'PNG', 'Must be valid PNG binary');
  });

  // Apply real customer NL renovation changes
  const { scene: afterScene } = applyStructuredOperations(
    beforeScene,
    parseNaturalLanguageToOperations(
      'کابینت‌ها را کرم کن و یک کافی‌بار در سمت راست یخچال اضافه کن و دستگیره‌ها را مشکی کن و صفحه کابینت را طرح چوب روشن کن و کابینت‌های بالایی را تا سقف ادامه بده'
    )
  );

  const afterRes = await renderKitchenSceneMultiAngle(afterScene, {
    outputDir: TEST_OUT,
    prefix: 'proto_after',
    width: 960,
    height: 720,
  });

  assert.equal(afterRes.renders.length, 3);
  assert.notEqual(beforeRes.sceneHash, afterRes.sceneHash, 'Scene hash must update after geometric & material change');

  // Verify angles differ visually (different byte buffers) & after differs from before
  const bFront = fs.readFileSync(beforeRes.renders[0].filePath);
  const aFront = fs.readFileSync(afterRes.renders[0].filePath);
  const aRight = fs.readFileSync(afterRes.renders[1].filePath);
  const aLeft = fs.readFileSync(afterRes.renders[2].filePath);

  assert.equal(aFront.equals(aRight), false, 'Front and Right camera angles must produce distinct views');
  assert.equal(aFront.equals(aLeft), false, 'Front and Left camera angles must produce distinct views');
  assert.equal(bFront.equals(aFront), false, 'After renovation render must differ from Before render');
});
