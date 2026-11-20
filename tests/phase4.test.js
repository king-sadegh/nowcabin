const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runComputerVisionAnalysis,
  reconstructKitchenFromPhotosAndDimensions,
} = require('../src/engine/sceneReconstructor');
const { parseNaturalLanguageToOperations, applyStructuredOperations } = require('../src/engine/changeEngine');
const { renderKitchenSceneMultiAngle } = require('../src/engine/renderEngine');

const SAMPLE_PHOTOS = [
  path.join(__dirname, '..', 'public', 'assets', 'before-1.jpg'),
  path.join(__dirname, '..', 'public', 'assets', 'before-2.jpg'),
  path.join(__dirname, '..', 'public', 'assets', 'before-3.jpg'),
];

test('Phase 4.1: Python CV Analyzer extracts real visual structure, dominant colors, bay count, and component confidence from 3 real photos', async () => {
  const cv = await runComputerVisionAnalysis(SAMPLE_PHOTOS);
  assert.equal(cv.ok, true);
  assert.equal(cv.photosAnalyzed, 3);
  assert.equal(cv.perPhoto.length, 3);
  assert.ok(/^#[0-9a-f]{6}$/i.test(cv.reconciled.upperColorHex));
  assert.ok(/^#[0-9a-f]{6}$/i.test(cv.reconciled.lowerColorHex));
  assert.ok(cv.reconciled.estimatedCabinetBays >= 3);
  assert.ok(cv.reconciled.averageConfidence >= 0.65);
  assert.equal(cv.reconciled.requiresCustomerDimensions, true);
});

test('Phase 4.2: Missing customer dimensions blocks unverified approval and asks exact targeted questions', async () => {
  const res = await reconstructKitchenFromPhotosAndDimensions({
    imagePaths: [SAMPLE_PHOTOS[0]],
    dimensionsInput: { wallLengthMeters: 4.0 }, // missing sideWallMeters and ceilingHeightMeters
  });
  assert.equal(res.approved, false);
  assert.equal(res.needsClarification, true);
  assert.equal(res.scene, null);
  assert.ok(res.missingDimensions.some((m) => m.field === 'sideWallMeters'));
  assert.ok(res.missingDimensions.some((m) => m.field === 'ceilingHeightMeters'));
  assert.ok(res.clarificationQuestions.length >= 2);
});

test('Phase 4.3: End-to-End Reconstruction from 3 Real Photos + Customer Dimensions + Renovation Changes + Multi-Angle Render', async () => {
  const recon = await reconstructKitchenFromPhotosAndDimensions({
    imagePaths: SAMPLE_PHOTOS,
    dimensionsInput: {
      wallLengthMeters: 4.1,
      sideWallMeters: 3.3,
      ceilingHeightMeters: 2.8,
      layoutType: 'l_shape',
      fridgePosition: 'left',
      condition: 'MDF / چوب سالم',
    },
  });

  assert.equal(recon.approved, true, `Validation errors: ${JSON.stringify(recon.validation.errors)}`);
  assert.equal(recon.needsClarification, false);
  assert.ok(recon.scene.cabinets.length >= 6);
  assert.ok(recon.scene.appliances.some((a) => a.type === 'fridge'));
  assert.ok(recon.scene.appliances.some((a) => a.type === 'sink'));
  assert.ok(recon.scene.appliances.some((a) => a.type === 'stove'));

  // Apply changes & render 3 synchronized views
  const { scene: modified, report } = applyStructuredOperations(
    recon.scene,
    parseNaturalLanguageToOperations('کابینت‌ها را سبز اکالیپتوس کن و صفحه کابینت را طرح چوب روشن کن و دستگیره را طلایی کن')
  );
  assert.equal(report.approved, true);
  assert.equal(modified.materials.handleId, 'brushed_brass');
  assert.equal(modified.materials.countertopId, 'light_wood_butcher');

  const renderRes = await renderKitchenSceneMultiAngle(modified, {
    outputDir: path.join(__dirname, '..', 'renders', 'phase4_test'),
    prefix: 'reconstructed',
    width: 800,
    height: 600,
  });
  assert.equal(renderRes.renders.length, 3);
});
