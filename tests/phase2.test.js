const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrototypeKitchenScene } = require('../src/engine/prototypeKitchen');
const { validateKitchenScene } = require('../src/engine/geometryValidator');
const { parseNaturalLanguageToOperations, applyStructuredOperations } = require('../src/engine/changeEngine');
const { exportKitchenSceneToGLB } = require('../src/engine/glbExporter');
const { cloneScene } = require('../src/engine/kitchenSchema');

test('Phase 2.1: Prototype Kitchen contains 2 rows, upper cabinets, doors, handles, countertop, appliances and passes validation', () => {
  const scene = createPrototypeKitchenScene({ initialState: 'before' });
  assert.equal(scene.validation.valid, true);
  assert.equal(scene.validation.approved, true);
  assert.equal(scene.validation.errors.length, 0);

  const rows = new Set(scene.cabinets.map((c) => c.row));
  assert.ok(rows.has('row_back') && rows.has('row_right'), 'Must contain two rows of cabinets');

  const upperCount = scene.cabinets.filter((c) => c.kind === 'upper').length;
  const baseCount = scene.cabinets.filter((c) => c.kind === 'base').length;
  assert.ok(baseCount >= 5, 'Should contain base cabinets in 2 rows');
  assert.ok(upperCount >= 3, 'Should contain upper wall cabinets');

  scene.cabinets.forEach((cab) => {
    assert.ok(Array.isArray(cab.doors) && cab.doors.length > 0, `${cab.id} must have independent doors`);
    assert.ok(cab.handleId, `${cab.id} must reference handle style`);
  });

  const types = new Set(scene.appliances.map((a) => a.type));
  assert.ok(types.has('fridge') && types.has('sink') && types.has('stove') && types.has('hood'));
  assert.ok(scene.countertops.length >= 2);
});

test('Phase 2.2: Geometry Validator detects overlap, bounds protrusion, missing dimensions, and low confidence', () => {
  const baseScene = createPrototypeKitchenScene();

  // Overlap test
  const badOverlap = cloneScene(baseScene);
  badOverlap.cabinets[1].position[0] = badOverlap.cabinets[0].position[0]; // force overlap
  const overlapRes = validateKitchenScene(badOverlap);
  assert.equal(overlapRes.report.valid, false);
  assert.ok(overlapRes.report.errors.some((e) => e.includes('تداخل هندسی')));

  // Missing dimensions test
  const missingDims = cloneScene(baseScene);
  missingDims.dimensions.ceilingHeight = null;
  const missRes = validateKitchenScene(missingDims);
  assert.equal(missRes.report.approved, false);
  assert.ok(missRes.report.missingDimensions.some((m) => m.field === 'ceilingHeight'));
  assert.ok(missRes.report.clarificationQuestions.length > 0);

  // Low confidence component triggers clarification request
  const lowConf = cloneScene(baseScene);
  lowConf.appliances[0].confidence = 0.42;
  const confRes = validateKitchenScene(lowConf, { minConfidence: 0.65 });
  assert.equal(confRes.report.approved, false);
  assert.ok(confRes.report.clarificationQuestions.some((q) => q.includes('یخچال')));

  // Minor floor tolerance <= 4cm gets auto-repaired cleanly
  const minorSnap = cloneScene(baseScene);
  minorSnap.cabinets[0].position[1] = -0.02;
  const snapRes = validateKitchenScene(minorSnap, { autoRepair: true });
  assert.equal(snapRes.report.valid, true);
  assert.equal(snapRes.scene.cabinets[0].position[1], 0);
  assert.ok(snapRes.report.autoRepairs.length >= 1);
});

test('Phase 2.3: Natural-language parser produces allowlisted JSON ops and appearance mutations preserve layout', () => {
  const before = createPrototypeKitchenScene({ initialState: 'before' });
  const text = 'کابینت‌ها را کرم کن و دستگیره‌ها را مشکی کن و صفحه کابینت را طرح چوب روشن کن';
  const ops = parseNaturalLanguageToOperations(text);

  assert.ok(ops.some((o) => o.op === 'change_cabinet_color'));
  assert.ok(ops.some((o) => o.op === 'change_handle' && o.handleId === 'matte_black'));
  assert.ok(ops.some((o) => o.op === 'change_countertop' && o.countertopId === 'light_wood_butcher'));

  const res = applyStructuredOperations(before, ops);
  assert.equal(res.report.valid, true);
  assert.equal(res.layoutPreserved, true, 'Appearance edits must not mutate cabinet dimensions or door count');
  assert.equal(res.scene.materials.handleId, 'matte_black');
  assert.equal(res.scene.materials.countertopId, 'light_wood_butcher');
  assert.equal(res.scene.materials.upperColor, '#f4efe6');
});

test('Phase 2.4: Adding CoffeeBar right of fridge and extending upper cabinets to ceiling modifies real 3D geometry without collision', () => {
  const before = createPrototypeKitchenScene({ initialState: 'before' });
  const ops = parseNaturalLanguageToOperations('یک کافی‌بار در سمت راست یخچال اضافه کن و کابینت‌های بالایی را تا سقف ادامه بده');

  const res = applyStructuredOperations(before, ops);
  assert.equal(res.report.valid, true);
  assert.equal(res.report.approved, true);
  assert.equal(res.scene.coffeeBars.length, 1);

  const fridge = res.scene.appliances.find((a) => a.type === 'fridge');
  const coffeeBar = res.scene.coffeeBars[0];
  assert.ok(coffeeBar.position[0] > fridge.position[0], 'CoffeeBar must sit to the right of fridge');

  const upper = res.scene.cabinets.find((c) => c.id === 'cab_upper_1');
  assert.ok(upper.position[1] + upper.size.height > 2.75, 'Upper cabinets should extend up near 2.8m ceiling');

  // Test rejection + alternative suggestion when alcove is blocked
  const blockedScene = cloneScene(res.scene);
  blockedScene.cabinets.push({
    id: 'blocker_cab',
    kind: 'base',
    row: 'row_back',
    position: [1.32, 0, 0.30],
    size: { width: 0.78, height: 0.86, depth: 0.60 },
    rotationY: 0,
    doors: [{ id: 'blocker_door', kind: 'door', width: 0.76, height: 0.74, offsetX: 0, offsetY: 0.01 }],
    handleId: 'matte_black',
    confidence: 1.0,
  });
  // Make end of back wall occupied too or check blocking of right_of_fridge specifically
  const resBlocked = applyStructuredOperations(blockedScene, [{ op: 'add_coffee_bar', placementHint: 'right_of_fridge', width: 0.78 }]);
  assert.ok(resBlocked.rejected.length > 0 || resBlocked.scene.coffeeBars[0].position[0] > 1.72);
});

test('Phase 2.5: GLB binary glTF 2.0 exporter outputs valid GLB containing named cabinet, door, handle, and CoffeeBar nodes', () => {
  const before = createPrototypeKitchenScene({ initialState: 'before' });
  const { scene } = applyStructuredOperations(
    before,
    parseNaturalLanguageToOperations('کابینت‌ها را کرم کن و یک کافی‌بار در سمت راست یخچال اضافه کن')
  );

  const { glbBuffer, stats } = exportKitchenSceneToGLB(scene);
  assert.ok(Buffer.isBuffer(glbBuffer));
  assert.equal(glbBuffer.readUInt32LE(0), 0x46546c67, 'Valid glTF magic header');
  assert.equal(glbBuffer.readUInt32LE(4), 2, 'glTF version 2');
  assert.equal(glbBuffer.readUInt32LE(8), glbBuffer.length, 'Total byteLength matches');

  const jsonLen = glbBuffer.readUInt32LE(12);
  const jsonStr = glbBuffer.slice(20, 20 + jsonLen).toString('utf8');
  const gltf = JSON.parse(jsonStr);
  const nodeNames = new Set(gltf.nodes.map((n) => n.name));

  assert.ok(nodeNames.has('cab_base_1_body'));
  assert.ok(nodeNames.has('cab_base_1_door_1'));
  assert.ok(nodeNames.has('cab_base_1_door_1_handle'));
  assert.ok(nodeNames.has('app_fridge'));
  assert.ok(nodeNames.has('cb_main_base'));
  assert.ok(stats.materialsCount >= 4);
});
