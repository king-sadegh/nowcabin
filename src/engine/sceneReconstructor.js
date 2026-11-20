const path = require('path');
const { execFile } = require('child_process');
const {
  createEmptyScene,
  buildCabinetDoors,
  createDefaultCameras,
} = require('./kitchenSchema');
const { validateKitchenScene } = require('./geometryValidator');

function runComputerVisionAnalysis(imagePaths) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      return reject(new Error('حداقل یک تصویر برای تحلیل بینایی ماشین الزامی است.'));
    }
    const scriptPath = path.join(__dirname, 'cv_analyzer.py');
    execFile('python3', [scriptPath, ...imagePaths], { maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`خطا در تحلیل تصاویر: ${stderr || err.message}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) {
          return reject(new Error(parsed.error || 'تحلیل تصاویر ناموفق بود.'));
        }
        resolve(parsed);
      } catch (parseErr) {
        reject(new Error(`خروجی نامعتبر از ماژول تحلیل تصویر: ${parseErr.message}`));
      }
    });
  });
}

/**
 * Checks mandatory customer-supplied architectural dimensions before trusting geometry.
 * Strictly obeys Rule 11.10: Never assumes metric dimensions from a raw photo alone.
 */
function checkRequiredDimensions(dimsInput = {}) {
  const missingDimensions = [];
  const clarificationQuestions = [];

  const wallLength = Number(dimsInput.wallLengthMeters ?? dimsInput.width);
  const sideWallLength = Number(dimsInput.sideWallMeters ?? dimsInput.depth);
  const ceilingHeight = Number(dimsInput.ceilingHeightMeters ?? dimsInput.ceilingHeight);
  const layoutType = String(dimsInput.layoutType || 'l_shape');

  if (!wallLength || wallLength < 1.8 || wallLength > 10) {
    missingDimensions.push({ field: 'wallLengthMeters', label: 'طول دیوار اصلی آشپزخانه (۱.۸ تا ۱۰ متر)' });
    clarificationQuestions.push('طول دیوار اصلی که یخچال، سینک و گاز روی آن قرار دارند چند متر است؟');
  }
  if (!sideWallLength || sideWallLength < 1.8 || sideWallLength > 10) {
    missingDimensions.push({ field: 'sideWallMeters', label: 'عمق / طول دیوار جانبی آشپزخانه (۱.۸ تا ۱۰ متر)' });
    clarificationQuestions.push('عمق یا طول دیوار جانبی آشپزخانه چند متر است؟');
  }
  if (!ceilingHeight || ceilingHeight < 2.2 || ceilingHeight > 4.2) {
    missingDimensions.push({ field: 'ceilingHeightMeters', label: 'ارتفاع کف تا سقف (۲.۲ تا ۴.۲ متر)' });
    clarificationQuestions.push('ارتفاع کف تا سقف آشپزخانه چند متر است؟');
  }

  return {
    sufficient: missingDimensions.length === 0,
    missingDimensions,
    clarificationQuestions,
    normalized: {
      width: Number((wallLength || 3.8).toFixed(2)),
      depth: Number((sideWallLength || 3.2).toFixed(2)),
      ceilingHeight: Number((ceilingHeight || 2.8).toFixed(2)),
      baseHeight: Number((Number(dimsInput.baseHeightMeters) || 0.86).toFixed(2)),
      baseDepth: Number((Number(dimsInput.baseDepthMeters) || 0.60).toFixed(2)),
      upperHeight: Number((Number(dimsInput.upperHeightMeters) || 0.78).toFixed(2)),
      upperDepth: Number((Number(dimsInput.upperDepthMeters) || 0.35).toFixed(2)),
      layoutType: ['linear', 'l_shape', 'galley'].includes(layoutType) ? layoutType : 'l_shape',
      fridgeSide: dimsInput.fridgePosition === 'right' ? 'right' : 'left',
      sinkRatio: Number(dimsInput.sinkPositionRatio) || 0.48,
      stoveRatio: Number(dimsInput.stovePositionRatio) || 0.70,
      hasWindow: Boolean(dimsInput.hasWindow),
      windowWall: dimsInput.windowWall || 'wall_left',
      condition: dimsInput.condition || 'MDF / چوب سالم',
    },
  };
}

/**
 * Combines verified CV analysis from 1-3 customer images + customer-entered metric dimensions
 * to build a parametric, collision-free KitchenScene JSON and auto-approve if valid.
 */
async function reconstructKitchenFromPhotosAndDimensions({ imagePaths = [], dimensionsInput = {}, sceneId } = {}) {
  let cvResult = null;
  if (imagePaths.length > 0) {
    cvResult = await runComputerVisionAnalysis(imagePaths);
  }

  const dimCheck = checkRequiredDimensions(dimensionsInput);
  if (!dimCheck.sufficient) {
    return {
      approved: false,
      needsClarification: true,
      missingDimensions: dimCheck.missingDimensions,
      clarificationQuestions: dimCheck.clarificationQuestions,
      cvAnalysis: cvResult,
      scene: null,
    };
  }

  const d = dimCheck.normalized;
  const W = d.width;
  const D = d.depth;
  const H = d.ceilingHeight;

  const scene = createEmptyScene({
    sceneId: sceneId || `cust_scene_${Date.now()}`,
    width: W,
    depth: D,
    ceilingHeight: H,
    layoutType: d.layoutType,
  });

  // Preserve CV-detected cabinet colors as "before" starting state if provided
  const detectedUpper = cvResult?.reconciled?.upperColorHex || '#7d5233';
  const detectedLower = cvResult?.reconciled?.lowerColorHex || '#6e4529';
  const cvConfidence = cvResult?.reconciled?.averageConfidence ?? 0.90;

  scene.materials = {
    cabinetFinishId: 'cashmere_beige',
    upperColor: '#e6dfd3', // Default proposed NoKabin renovation look; original recorded in metadata
    lowerColor: '#c4b7a6',
    cabinetSurfaceType: 'polyurethane_satin',
    countertopId: 'quartz_white_veined',
    backsplashId: 'calacatta_slab',
    handleId: 'matte_black',
  };

  scene.metadata = {
    source: imagePaths.length > 0 ? 'cv_plus_customer_dimensions' : 'customer_dimensions',
    photosCount: imagePaths.length,
    averageConfidence: cvConfidence,
    cvDetectedCabinetCount: cvResult?.reconciled?.estimatedCabinetBays || 0,
    detectedOriginalUpperHex: detectedUpper,
    detectedOriginalLowerHex: detectedLower,
    lightingTone: cvResult?.reconciled?.lightingTone || 'طبیعی',
    condition: d.condition,
  };

  const fridgeW = 0.84;
  const fridgeH = Math.min(1.98, H - 0.12);
  const fridgeD = 0.68;
  const fridgeSide = dimensionsInput.fridgePosition
    ? d.fridgeSide
    : cvResult?.reconciled?.fridgeSideHint || 'left';

  // Reserve fridge zone on left or right end of back wall, plus optional coffee bar gap if space >= 3.9m
  const fridgeX = fridgeSide === 'left' ? fridgeW / 2 + 0.04 : W - fridgeW / 2 - 0.04;
  const runStart = fridgeSide === 'left' ? fridgeW + 0.08 : 0.04;
  const runEnd = fridgeSide === 'left' ? W - 0.04 : W - fridgeW - 0.08;
  const runLen = Math.max(1.2, runEnd - runStart);

  // Split back wall base cabinet run cleanly into 3 or 4 parametric modules
  const moduleCount = runLen >= 3.0 ? 4 : 3;
  const modW = Number((runLen / moduleCount).toFixed(3));
  const baseH = d.baseHeight;
  const baseD = d.baseDepth;
  const upperY = Number(Math.min(H - d.upperHeight - 0.12, baseH + 0.58).toFixed(2));
  const upperH = d.upperHeight;
  const upperD = d.upperDepth;

  const sinkIdx = 0;
  const stoveIdx = Math.min(moduleCount - 1, 1);

  scene.appliances.push({
    id: 'app_fridge',
    type: 'fridge',
    label: 'یخچال',
    position: [Number(fridgeX.toFixed(3)), 0, fridgeD / 2],
    size: { width: fridgeW, height: fridgeH, depth: fridgeD },
    rotationY: 0,
    color: '#cfd4d8',
    confidence: 0.92,
  });

  for (let i = 0; i < moduleCount; i++) {
    const cx = Number((runStart + (i + 0.5) * modW).toFixed(3));
    const isStoveUnit = i === stoveIdx;
    const isSinkUnit = i === sinkIdx;
    const cabId = `cab_back_base_${i + 1}`;

    scene.cabinets.push({
      id: cabId,
      kind: 'base',
      row: 'row_back',
      label: isSinkUnit ? 'یونیت زیر سینک' : isStoveUnit ? 'یونیت کشودار اجاق' : `کابینت زمینی ${i + 1}`,
      position: [cx, 0, baseD / 2],
      size: { width: modW, height: baseH, depth: baseD },
      rotationY: 0,
      color: scene.materials.lowerColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors(cabId, modW, baseH - 0.10, isStoveUnit ? 'drawer' : modW >= 0.65 ? 'double' : 'single', isStoveUnit ? 3 : 0),
      confidence: cvConfidence,
    });

    if (isSinkUnit) {
      scene.appliances.push({
        id: 'app_sink',
        type: 'sink',
        label: 'سینک ظرفشویی',
        position: [cx, baseH - 0.01, baseD / 2],
        size: { width: Math.min(0.76, modW - 0.06), height: 0.18, depth: 0.46 },
        rotationY: 0,
        color: '#b8bec4',
        confidence: 0.90,
      });
    }

    if (isStoveUnit) {
      scene.appliances.push({
        id: 'app_stove',
        type: 'stove',
        label: 'اجاق گاز',
        position: [cx, baseH + 0.01, baseD / 2],
        size: { width: Math.min(0.74, modW - 0.06), height: 0.06, depth: 0.48 },
        rotationY: 0,
        color: '#1e1f22',
        confidence: 0.90,
      });
      scene.appliances.push({
        id: 'app_hood',
        type: 'hood',
        label: 'هود',
        position: [cx, upperY + 0.10, upperD * 0.62],
        size: { width: Math.min(0.76, modW - 0.04), height: 0.48, depth: 0.42 },
        rotationY: 0,
        color: '#2b2d30',
        confidence: 0.88,
      });
    } else {
      const uId = `cab_back_upper_${i + 1}`;
      scene.cabinets.push({
        id: uId,
        kind: 'upper',
        row: 'row_back',
        label: `کابینت دیواری ${i + 1}`,
        position: [cx, upperY, upperD / 2],
        size: { width: modW, height: upperH, depth: upperD },
        rotationY: 0,
        color: scene.materials.upperColor,
        doorStyle: 'shaker',
        handleId: scene.materials.handleId,
        doors: buildCabinetDoors(uId, modW, upperH, modW >= 0.65 ? 'double' : 'single', 0),
        confidence: cvConfidence,
      });
    }
  }

  scene.countertops.push({
    id: 'ct_back',
    row: 'row_back',
    position: [Number(((runStart + runEnd) / 2).toFixed(3)), baseH, baseD / 2 + 0.01],
    size: { width: Number(runLen.toFixed(3)), height: 0.04, depth: baseD + 0.02 },
    rotationY: 0,
    materialId: scene.materials.countertopId,
  });

  scene.backsplashes.push({
    id: 'bs_back',
    row: 'row_back',
    position: [Number(((runStart + runEnd) / 2).toFixed(3)), baseH + 0.04, 0.012],
    size: { width: Number(runLen.toFixed(3)), height: Number((upperY - (baseH + 0.04)).toFixed(3)), depth: 0.02 },
    rotationY: 0,
    materialId: scene.materials.backsplashId,
  });

  // Add second row for L-shape or Galley layouts cleanly without colliding with back row
  if (d.layoutType === 'l_shape' || d.layoutType === 'galley') {
    const isRightRow = fridgeSide === 'left' || d.layoutType === 'galley';
    const wallX = isRightRow ? W - baseD / 2 : baseD / 2;
    const rotY = isRightRow ? -Math.PI / 2 : Math.PI / 2;
    const rowName = isRightRow ? 'row_right' : 'row_left';
    const sideStartZ = baseD + 0.06;
    const sideAvail = Math.min(1.80, D - sideStartZ - 0.30);

    if (sideAvail >= 0.75) {
      const sideMods = sideAvail >= 1.40 ? 2 : 1;
      const sideModW = Number((sideAvail / sideMods).toFixed(3));
      for (let s = 0; s < sideMods; s++) {
        const cz = Number((sideStartZ + (s + 0.5) * sideModW).toFixed(3));
        const sbId = `cab_side_base_${s + 1}`;
        scene.cabinets.push({
          id: sbId,
          kind: 'base',
          row: rowName,
          label: `کابینت زمینی کناری ${s + 1}`,
          position: [Number(wallX.toFixed(3)), 0, cz],
          size: { width: sideModW, height: baseH, depth: baseD },
          rotationY: rotY,
          color: scene.materials.lowerColor,
          doorStyle: 'shaker',
          handleId: scene.materials.handleId,
          doors: buildCabinetDoors(sbId, sideModW, baseH - 0.10, s === 0 ? 'drawer' : 'double', s === 0 ? 3 : 0),
          confidence: cvConfidence,
        });

        if (s === 0) {
          const suId = `cab_side_upper_1`;
          const uWallX = isRightRow ? W - upperD / 2 : upperD / 2;
          scene.cabinets.push({
            id: suId,
            kind: 'upper',
            row: rowName,
            label: 'کابینت دیواری کناری',
            position: [Number(uWallX.toFixed(3)), upperY, cz],
            size: { width: sideModW, height: upperH, depth: upperD },
            rotationY: rotY,
            color: scene.materials.upperColor,
            doorStyle: 'shaker',
            handleId: scene.materials.handleId,
            doors: buildCabinetDoors(suId, sideModW, upperH, sideModW >= 0.65 ? 'double' : 'single', 0),
            confidence: cvConfidence,
          });
        }
      }

      const ctCenterZ = Number((sideStartZ + sideAvail / 2).toFixed(3));
      scene.countertops.push({
        id: 'ct_side',
        row: rowName,
        position: [Number((isRightRow ? W - (baseD + 0.02) / 2 : (baseD + 0.02) / 2).toFixed(3)), baseH, ctCenterZ],
        size: { width: Number(sideAvail.toFixed(3)), height: 0.04, depth: baseD + 0.02 },
        rotationY: rotY,
        materialId: scene.materials.countertopId,
      });
      scene.backsplashes.push({
        id: 'bs_side',
        row: rowName,
        position: [Number((isRightRow ? W - 0.012 : 0.012).toFixed(3)), baseH + 0.04, ctCenterZ],
        size: { width: Number(sideAvail.toFixed(3)), height: Number((upperY - (baseH + 0.04)).toFixed(3)), depth: 0.02 },
        rotationY: rotY,
        materialId: scene.materials.backsplashId,
      });
    }
  }

  scene.cameras = createDefaultCameras(W, D, H);

  const { scene: validatedScene, report } = validateKitchenScene(scene);
  return {
    approved: report.approved,
    needsClarification: !report.approved,
    missingDimensions: report.missingDimensions,
    clarificationQuestions: report.clarificationQuestions,
    validation: report,
    cvAnalysis: cvResult,
    scene: validatedScene,
  };
}

module.exports = {
  runComputerVisionAnalysis,
  checkRequiredDimensions,
  reconstructKitchenFromPhotosAndDimensions,
};
