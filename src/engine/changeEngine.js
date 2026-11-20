const { cloneScene, getComponentAABB, buildCabinetDoors } = require('./kitchenSchema');
const {
  CABINET_FINISHES,
  COUNTERTOP_MATERIALS,
  BACKSPLASH_MATERIALS,
  HANDLE_STYLES,
  findColorMatch,
} = require('./materials');
const { validateKitchenScene, boxesOverlap3D } = require('./geometryValidator');

const ALLOWED_OPERATIONS = new Set([
  'change_cabinet_color',
  'change_cabinet_material',
  'change_handle',
  'change_countertop',
  'change_backsplash',
  'add_coffee_bar',
  'extend_upper_to_ceiling',
  'add_island',
  'add_lighting',
  'resize_component',
  'reposition_component',
  'remove_component',
]);

/**
 * Converts natural language Persian/English renovation requests into strict allowlisted JSON operations.
 * Never evaluates raw text as code.
 */
function parseNaturalLanguageToOperations(text) {
  const input = String(text || '').trim();
  const operations = [];
  if (!input) return operations;

  const lowerText = input.toLowerCase();

  // 1. Two-tone rule: "کابینت‌های بالایی را روشن‌تر از کابینت‌های پایینی کن"
  if (/بالا.*روشن|روشن.*بالا|دو رنگ|دورنگ|two.?tone/.test(lowerText)) {
    const colorMatch = findColorMatch(input);
    operations.push({
      op: 'change_cabinet_color',
      target: 'two_tone',
      upperColor: colorMatch?.upperHex || '#f5f1e8',
      lowerColor: colorMatch?.lowerHex || '#9f9284',
      label: colorMatch?.nameFa || 'دورنگ (بالا روشن‌تر از پایین)',
    });
  } else {
    // Check explicit color commands for upper/lower or all cabinets
    const hasUpperKeyword = /بالا|دیواری|هوایی/.test(lowerText) && !/پایین|زمینی/.test(lowerText);
    const hasLowerKeyword = /پایین|زمینی/.test(lowerText) && !/بالا|دیواری|هوایی/.test(lowerText);
    const colorMatch = findColorMatch(input);
    // Avoid mistaking "صفحه چوب روشن" or "دستگیره مشکی" for cabinet door color
    const strippedForCabinet = input
      .replace(/دستگیره[^\n،.]+/g, '')
      .replace(/صفحه[^\n،.]+/g, '')
      .replace(/بین‌کابینتی[^\n،.]+/g, '')
      .replace(/بین کابینتی[^\n،.]+/g, '');
    const cabColorMatch = findColorMatch(strippedForCabinet);

    if (cabColorMatch) {
      operations.push({
        op: 'change_cabinet_color',
        target: hasUpperKeyword ? 'upper' : hasLowerKeyword ? 'lower' : 'all',
        upperColor: cabColorMatch.upperHex,
        lowerColor: cabColorMatch.lowerHex,
        finishId: cabColorMatch.finishId,
        label: cabColorMatch.nameFa,
      });
    } else if (colorMatch && !/دستگیره|صفحه|بین/.test(lowerText)) {
      operations.push({
        op: 'change_cabinet_color',
        target: 'all',
        upperColor: colorMatch.upperHex,
        lowerColor: colorMatch.lowerHex,
        finishId: colorMatch.finishId,
        label: colorMatch.nameFa,
      });
    }
  }

  // 2. Extend upper cabinets to ceiling: "کابینت‌های بالایی را تا سقف ادامه بده"
  if (/تا سقف|به سقف|تاج سقف|تا بالا/.test(lowerText)) {
    operations.push({
      op: 'extend_upper_to_ceiling',
    });
  }

  // 3. Cabinet surface material
  if (/چوب|بلوط|روکش/.test(lowerText) && !/صفحه.*چوب/.test(lowerText)) {
    operations.push({
      op: 'change_cabinet_material',
      surfaceType: 'oak_wood',
    });
  } else if (/پلی.?اورتان|مات|ابریشمی/.test(lowerText)) {
    operations.push({
      op: 'change_cabinet_material',
      surfaceType: 'polyurethane_satin',
    });
  }

  // 4. Handles: "دستگیره‌ها را مشکی کن" / طلایی / نقره‌ای
  if (/دستگیره/.test(lowerText)) {
    let handleId = 'matte_black';
    if (/طلایی|گلد|شامپاینی|برس/.test(lowerText)) handleId = 'brushed_brass';
    else if (/استیل|نقره‌ای|سیلور/.test(lowerText)) handleId = 'satin_nickel';
    else if (/برنز/.test(lowerText)) handleId = 'dark_bronze';
    operations.push({
      op: 'change_handle',
      handleId,
    });
  }

  // 5. Countertop: "صفحه کابینت را طرح چوب روشن کن" / کوارتز / مرمر / مشکی
  if (/صفحه|کانتر|تاپ/.test(lowerText)) {
    let countertopId = 'quartz_white_veined';
    if (/چوب/.test(lowerText)) countertopId = 'light_wood_butcher';
    else if (/ماربل|مرمر|کالاکاتا|رگه/.test(lowerText)) countertopId = 'calacatta_gold';
    else if (/مشکی|گرانیت|تیره/.test(lowerText)) countertopId = 'charcoal_granite';
    operations.push({
      op: 'change_countertop',
      countertopId,
    });
  }

  // 6. Backsplash: "سرامیک" / "بین‌کابینتی" / "کاشی"
  if (/بین‌کابینتی|بین کابینتی|کاشی|سرامیک/.test(lowerText)) {
    let backsplashId = 'modern_ceramic_tile';
    if (/سبز/.test(lowerText)) backsplashId = 'sage_ceramic_tile';
    else if (/ماربل|مرمر|کالاکاتا|اسلب/.test(lowerText)) backsplashId = 'calacatta_slab';
    else if (/کلاسیک|مترو|ساب/.test(lowerText)) backsplashId = 'warm_subway_tile';
    operations.push({
      op: 'change_backsplash',
      backsplashId,
    });
  }

  // 7. Add Coffee Bar: "یک کافی‌بار در سمت راست یخچال اضافه کن"
  if (/کافی.?بار|قهوه|coffee.?bar/.test(lowerText)) {
    let placementHint = 'auto';
    if (/راست یخچال|کنار یخچال/.test(lowerText)) placementHint = 'right_of_fridge';
    else if (/چپ یخچال/.test(lowerText)) placementHint = 'left_of_fridge';
    else if (/راست/.test(lowerText)) placementHint = 'right_wall';
    operations.push({
      op: 'add_coffee_bar',
      placementHint,
      width: 0.78,
    });
  }

  // 8. Add Island: "جزیره"
  if (/جزیره|island/.test(lowerText)) {
    operations.push({
      op: 'add_island',
      width: 1.50,
      depth: 0.78,
    });
  }

  // 9. Lighting
  if (/نور|لاین نوری|نور مخفی|چراغ/.test(lowerText)) {
    operations.push({
      op: 'add_lighting',
      underCabinetLed: true,
    });
  }

  return operations;
}

/**
 * Finds collision-free space next to fridge or along back/right walls for a CoffeeBar unit.
 */
function findSpaceForCoffeeBar(scene, desiredWidth = 0.78, placementHint = 'auto') {
  const roomW = scene.dimensions.width;
  const fridge = (scene.appliances || []).find((a) => a.type === 'fridge');
  const obstacles = [...(scene.cabinets || []), ...(scene.appliances || [])].map((item) => ({
    id: item.id,
    box: getComponentAABB(item),
  }));

  const candidateRegions = [];
  if (fridge) {
    const fBox = getComponentAABB(fridge);
    if (placementHint === 'left_of_fridge') {
      candidateRegions.push({
        label: 'سمت چپ یخچال',
        cx: fBox.minX - desiredWidth / 2 - 0.02,
      });
    }
    // Primary preference for right of fridge
    candidateRegions.push({
      label: 'سمت راست یخچال',
      cx: fBox.maxX + desiredWidth / 2 + 0.02,
    });
  }

  // Also check end of back wall or right wall if primary fails
  candidateRegions.push({
    label: 'انتهای دیوار اصلی',
    cx: roomW - desiredWidth / 2 - 0.04,
  });

  const barDepth = 0.52;
  const barHeight = 2.15;

  for (const cand of candidateRegions) {
    if (cand.cx - desiredWidth / 2 < 0.02 || cand.cx + desiredWidth / 2 > roomW - 0.02) continue;

    const testComp = {
      position: [Number(cand.cx.toFixed(3)), 0, barDepth / 2],
      size: { width: desiredWidth, height: barHeight, depth: barDepth },
      rotationY: 0,
    };
    const testBox = getComponentAABB(testComp);
    const hits = obstacles.filter((o) => boxesOverlap3D(testBox, o.box, 0.02));
    if (hits.length === 0) {
      return {
        fits: true,
        locationLabel: cand.label,
        position: testComp.position,
        size: testComp.size,
      };
    }
  }

  return {
    fits: false,
    suggestion:
      'فضای آزاد مستقیم در کنار یخچال وجود ندارد؛ پیشنهاد جایگزین: تبدیل انتهای ردیف راست کابینت‌ها یا کاهش عرض یکی از یونیت‌های کناری به ۶۰ سانتی‌متر جهت ایجاد فضای کافی‌بار.',
  };
}

/**
 * Applies a validated list of structured operations to a KitchenScene.
 * Returns { scene, applied, rejected, alternatives, layoutPreserved }
 */
function applyStructuredOperations(inputScene, rawOperations) {
  const beforeScene = cloneScene(inputScene);
  const scene = cloneScene(inputScene);
  const applied = [];
  const rejected = [];
  const alternatives = [];

  if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
    const { scene: vScene, report } = validateKitchenScene(scene);
    return { scene: vScene, report, applied, rejected, alternatives, layoutPreserved: true };
  }

  // Track if only appearance changes occurred
  const APPEARANCE_OPS = new Set([
    'change_cabinet_color',
    'change_cabinet_material',
    'change_handle',
    'change_countertop',
    'change_backsplash',
    'add_lighting',
  ]);
  const isPureAppearanceChange = rawOperations.every((op) => APPEARANCE_OPS.has(op?.op));

  for (const op of rawOperations) {
    if (!op || !ALLOWED_OPERATIONS.has(op.op)) {
      rejected.push({ operation: op, reason: `عملیات غیرمجاز یا ناشناخته: ${op?.op || 'نامشخص'}` });
      continue;
    }

    if (op.op === 'change_cabinet_color') {
      const target = op.target || 'all';
      const finish = op.finishId && CABINET_FINISHES[op.finishId] ? CABINET_FINISHES[op.finishId] : null;
      const upperHex = op.upperColor || finish?.upperHex || op.color || scene.materials.upperColor;
      const lowerHex = op.lowerColor || finish?.lowerHex || op.color || scene.materials.lowerColor;

      if (target === 'upper') {
        scene.materials.upperColor = upperHex;
        scene.cabinets.filter((c) => c.kind === 'upper').forEach((c) => (c.color = upperHex));
      } else if (target === 'lower') {
        scene.materials.lowerColor = lowerHex;
        scene.cabinets.filter((c) => c.kind === 'base').forEach((c) => (c.color = lowerHex));
      } else if (target === 'specific' && op.componentId) {
        const comp = scene.cabinets.find((c) => c.id === op.componentId);
        if (comp) comp.color = op.color || lowerHex;
      } else {
        // 'all' or 'two_tone'
        scene.materials.upperColor = upperHex;
        scene.materials.lowerColor = lowerHex;
        if (finish) {
          scene.materials.cabinetFinishId = finish.id;
          scene.materials.cabinetSurfaceType = finish.id === 'old_oak_wood' || finish.id === 'natural_light_oak' ? 'oak_wood' : 'polyurethane_satin';
        } else {
          scene.materials.cabinetSurfaceType = 'polyurethane_satin';
        }
        scene.cabinets.forEach((c) => {
          c.color = c.kind === 'upper' ? upperHex : lowerHex;
        });
        (scene.islands || []).forEach((isl) => {
          isl.color = lowerHex;
        });
      }
      applied.push({ op: op.op, detail: op.label || `تغییر رنگ (${target})` });
      continue;
    }

    if (op.op === 'change_cabinet_material') {
      scene.materials.cabinetSurfaceType = op.surfaceType || 'polyurethane_satin';
      applied.push({ op: op.op, detail: `تغییر جنس به ${scene.materials.cabinetSurfaceType}` });
      continue;
    }

    if (op.op === 'change_handle') {
      const handleId = HANDLE_STYLES[op.handleId] ? op.handleId : 'matte_black';
      scene.materials.handleId = handleId;
      scene.cabinets.forEach((c) => {
        c.handleId = handleId;
      });
      (scene.islands || []).forEach((isl) => {
        isl.handleId = handleId;
      });
      applied.push({ op: op.op, detail: HANDLE_STYLES[handleId].nameFa });
      continue;
    }

    if (op.op === 'change_countertop') {
      const countertopId = COUNTERTOP_MATERIALS[op.countertopId] ? op.countertopId : 'quartz_white_veined';
      scene.materials.countertopId = countertopId;
      (scene.countertops || []).forEach((ct) => {
        ct.materialId = countertopId;
      });
      applied.push({ op: op.op, detail: COUNTERTOP_MATERIALS[countertopId].nameFa });
      continue;
    }

    if (op.op === 'change_backsplash') {
      const backsplashId = BACKSPLASH_MATERIALS[op.backsplashId] ? op.backsplashId : 'calacatta_slab';
      scene.materials.backsplashId = backsplashId;
      (scene.backsplashes || []).forEach((bs) => {
        bs.materialId = backsplashId;
      });
      applied.push({ op: op.op, detail: BACKSPLASH_MATERIALS[backsplashId].nameFa });
      continue;
    }

    if (op.op === 'add_lighting') {
      scene.lighting.underCabinetLed = op.underCabinetLed !== false;
      applied.push({ op: op.op, detail: 'نور مخفی گرم زیر کابینت‌های دیواری' });
      continue;
    }

    if (op.op === 'extend_upper_to_ceiling') {
      const ceilH = scene.dimensions.ceilingHeight || 2.8;
      const topGap = 0.02;
      scene.cabinets
        .filter((c) => c.kind === 'upper')
        .forEach((c) => {
          const newH = Number((ceilH - topGap - c.position[1]).toFixed(3));
          if (newH >= 0.45 && newH <= 1.45) {
            c.size.height = newH;
            c.doors = buildCabinetDoors(c.id, c.size.width, newH, c.doors?.length === 1 ? 'single' : 'double', 0);
          }
        });
      applied.push({ op: op.op, detail: 'افزایش ارتفاع کابینت‌های دیواری تا سقف' });
      continue;
    }

    if (op.op === 'add_coffee_bar') {
      // Remove old auto coffee bar if re-applying
      scene.coffeeBars = (scene.coffeeBars || []).filter((cb) => cb.id !== 'cb_main');
      const placement = findSpaceForCoffeeBar(scene, Number(op.width) || 0.78, op.placementHint || 'right_of_fridge');
      if (placement.fits) {
        scene.coffeeBars.push({
          id: 'cb_main',
          label: `استیشن کافی‌بار (${placement.locationLabel})`,
          position: placement.position,
          size: placement.size,
          rotationY: 0,
          woodColor: '#7a5230',
          counterColor: '#f4efe6',
          cabinetColor: scene.materials.lowerColor,
          hasEspressoMachine: true,
          hasFloatingShelves: true,
          confidence: 0.95,
        });
        applied.push({ op: op.op, detail: `افزودن کافی‌بار در ${placement.locationLabel}` });
      } else {
        rejected.push({ operation: op, reason: 'تداخل فضایی برای نصب کافی‌بار مستقل در این موقعیت.' });
        alternatives.push(placement.suggestion);
      }
      continue;
    }

    if (op.op === 'add_island') {
      const roomW = scene.dimensions.width;
      const roomD = scene.dimensions.depth;
      const islW = Number(op.width) || 1.45;
      const islD = Number(op.depth) || 0.76;
      const islH = 0.88;
      // Place island centered horizontally, pushed safely forward with >= 0.95m walkway from back row (0.60m + 0.95m = 1.55m minZ)
      const cx = Number(Math.min(roomW * 0.48, roomW - 0.60 - 0.90 - islW / 2).toFixed(3));
      const cz = Number(Math.max(1.58 + islD / 2, roomD * 0.62).toFixed(3));

      const testScene = cloneScene(scene);
      testScene.islands = [
        {
          id: 'island_main',
          label: 'جزیره مدرن هم‌رنگ کابینت',
          position: [cx, 0, cz],
          size: { width: islW, height: islH, depth: islD },
          rotationY: 0,
          color: scene.materials.lowerColor,
          countertopId: scene.materials.countertopId,
          handleId: scene.materials.handleId,
          confidence: 0.95,
        },
      ];
      const { report } = validateKitchenScene(testScene, { autoRepair: false });
      if (report.valid) {
        scene.islands = testScene.islands;
        applied.push({ op: op.op, detail: `افزودن جزیره (${islW}×${islD} متر)` });
      } else {
        rejected.push({ operation: op, reason: report.errors.join(' | ') });
        alternatives.push('فضای فعلی برای جزیره وسط کوچک است؛ می‌توانید کافی‌بار کنار دیوار یا میز بار تاشو اضافه کنید.');
      }
      continue;
    }

    if (op.op === 'resize_component' && op.componentId) {
      const targetComp = [...scene.cabinets, ...(scene.coffeeBars || []), ...(scene.islands || [])].find(
        (c) => c.id === op.componentId
      );
      if (!targetComp) {
        rejected.push({ operation: op, reason: `جزء «${op.componentId}» یافت نشد.` });
        continue;
      }
      if (op.width) targetComp.size.width = Number(op.width);
      if (op.height) targetComp.size.height = Number(op.height);
      if (op.depth) targetComp.size.depth = Number(op.depth);
      applied.push({ op: op.op, detail: `تغییر ابعاد جزء ${op.componentId}` });
      continue;
    }

    if (op.op === 'reposition_component' && op.componentId) {
      const targetComp = [
        ...scene.cabinets,
        ...scene.appliances,
        ...(scene.coffeeBars || []),
        ...(scene.islands || []),
      ].find((c) => c.id === op.componentId);
      if (!targetComp || !Array.isArray(op.position)) {
        rejected.push({ operation: op, reason: `جزء یا مختصات جدید نامعتبر است.` });
        continue;
      }
      targetComp.position = op.position.map(Number);
      applied.push({ op: op.op, detail: `جابه‌جایی جزء ${op.componentId}` });
      continue;
    }

    if (op.op === 'remove_component' && op.componentId) {
      const prevLen = scene.cabinets.length + scene.coffeeBars.length + scene.islands.length;
      scene.cabinets = scene.cabinets.filter((c) => c.id !== op.componentId);
      scene.coffeeBars = (scene.coffeeBars || []).filter((c) => c.id !== op.componentId);
      scene.islands = (scene.islands || []).filter((c) => c.id !== op.componentId);
      const nextLen = scene.cabinets.length + scene.coffeeBars.length + scene.islands.length;
      if (nextLen < prevLen) {
        applied.push({ op: op.op, detail: `حذف جزء ${op.componentId}` });
      } else {
        rejected.push({ operation: op, reason: `جزء «${op.componentId}» قابل حذف نیست یا وجود ندارد.` });
      }
    }
  }

  // Strict guarantee check for pure appearance mutations
  let layoutPreserved = true;
  if (isPureAppearanceChange) {
    const sameCabCount = beforeScene.cabinets.length === scene.cabinets.length;
    const sameDoorCount =
      beforeScene.cabinets.reduce((s, c) => s + (c.doors?.length || 0), 0) ===
      scene.cabinets.reduce((s, c) => s + (c.doors?.length || 0), 0);
    const sameDims = beforeScene.cabinets.every((bc, i) => {
      const ac = scene.cabinets[i];
      return (
        ac &&
        bc.size.width === ac.size.width &&
        bc.size.height === ac.size.height &&
        bc.position[0] === ac.position[0] &&
        bc.position[2] === ac.position[2]
      );
    });
    layoutPreserved = sameCabCount && sameDoorCount && sameDims;
  }

  scene.version = (scene.version || 1) + 1;
  scene.changeHistory = [...(scene.changeHistory || []), { at: new Date().toISOString(), applied, rejected }];

  const { scene: validated, report } = validateKitchenScene(scene);
  return {
    scene: validated,
    report,
    applied,
    rejected,
    alternatives,
    layoutPreserved,
  };
}

module.exports = {
  ALLOWED_OPERATIONS,
  parseNaturalLanguageToOperations,
  applyStructuredOperations,
  findSpaceForCoffeeBar,
};
