const { cloneScene, getComponentAABB } = require('./kitchenSchema');

const TOLERANCE = 0.015; // 1.5 cm tolerance for minor numerical contact

function boxesOverlap3D(a, b, tol = TOLERANCE) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return ox > tol && oy > tol && oz > tol;
}

function overlapVolumeInfo(a, b) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return { ox, oy, oz };
}

function getOpeningAABB(opening, roomDims) {
  const w = Number(opening.width) || 1.0;
  const h = Number(opening.height) || 1.1;
  const sill = Number(opening.sillHeight ?? (opening.type === 'door' ? 0 : 1.1));
  const offset = Number(opening.offset) || 0;
  const depthClear = 0.25;

  if (opening.wallId === 'wall_right') {
    return {
      minX: roomDims.width - depthClear,
      maxX: roomDims.width + 0.05,
      minY: sill,
      maxY: sill + h,
      minZ: offset,
      maxZ: offset + w,
    };
  }
  if (opening.wallId === 'wall_left') {
    return {
      minX: -0.05,
      maxX: depthClear,
      minY: sill,
      maxY: sill + h,
      minZ: offset,
      maxZ: offset + w,
    };
  }
  // wall_back default
  return {
    minX: offset,
    maxX: offset + w,
    minY: sill,
    maxY: sill + h,
    minZ: -0.05,
    maxZ: depthClear,
  };
}

/**
 * Validates and auto-repairs minor geometry tolerances on a KitchenScene.
 * Returns { scene, report } where report.approved = true only if all geometry checks pass
 * AND confidence + required dimensions are sufficient.
 */
function validateKitchenScene(inputScene, { autoRepair = true, minConfidence = 0.65 } = {}) {
  const scene = cloneScene(inputScene);
  const errors = [];
  const warnings = [];
  const autoRepairs = [];
  const missingDimensions = [];
  const clarificationQuestions = [];

  const dims = scene.dimensions || {};
  const roomW = Number(dims.width);
  const roomD = Number(dims.depth);
  const ceilH = Number(dims.ceilingHeight);

  // Check mandatory customer dimensions
  if (!roomW || roomW < 1.6 || roomW > 12) {
    missingDimensions.push({
      field: 'width',
      label: 'طول دیوار اصلی آشپزخانه (بین ۱.۶ تا ۱۲ متر)',
    });
    clarificationQuestions.push('طول دیوار اصلی آشپزخانه دقیقاً چند متر است؟');
  }
  if (!roomD || roomD < 1.6 || roomD > 12) {
    missingDimensions.push({
      field: 'depth',
      label: 'عمق / طول دیوار جانبی آشپزخانه (بین ۱.۶ تا ۱۲ متر)',
    });
    clarificationQuestions.push('عرض یا عمق فضای آشپزخانه چند متر است؟');
  }
  if (!ceilH || ceilH < 2.1 || ceilH > 4.5) {
    missingDimensions.push({
      field: 'ceilingHeight',
      label: 'ارتفاع کف تا سقف (بین ۲.۱ تا ۴.۵ متر)',
    });
    clarificationQuestions.push('ارتفاع کف تا سقف آشپزخانه چند متر است؟');
  }

  if (missingDimensions.length > 0) {
    errors.push('ابعاد پایه اتاق (طول دیوار، عمق یا ارتفاع سقف) ناقص یا خارج از بازه منطقی است.');
    scene.validation = {
      valid: false,
      approved: false,
      errors,
      warnings,
      autoRepairs,
      missingDimensions,
      clarificationQuestions,
    };
    return { scene, report: scene.validation };
  }

  // Gather primary physical volumes
  const allBoxes = [];

  const registerGroup = (list, category) => {
    for (const item of list || []) {
      // Auto-repair small floor/wall/ceiling boundary protrusions <= 4cm
      if (autoRepair) {
        const boxPre = getComponentAABB(item);
        if (boxPre.minY < 0 && boxPre.minY >= -0.04) {
          item.position[1] = 0;
          autoRepairs.push(`اصلاح خودکار تراز کف برای جزء ${item.id}`);
        }
        if (boxPre.maxY > ceilH && boxPre.maxY <= ceilH + 0.04) {
          item.size.height = Number((item.size.height - (boxPre.maxY - ceilH)).toFixed(3));
          autoRepairs.push(`کاهش جزئی ارتفاع جزء ${item.id} جهت عدم برخورد با سقف`);
        }
        if (boxPre.minX < 0 && boxPre.minX >= -0.04) {
          item.position[0] = Number((item.position[0] - boxPre.minX).toFixed(3));
          autoRepairs.push(`تراز خودکار جزء ${item.id} با دیوار چپ`);
        }
        if (boxPre.maxX > roomW && boxPre.maxX <= roomW + 0.04) {
          item.position[0] = Number((item.position[0] - (boxPre.maxX - roomW)).toFixed(3));
          autoRepairs.push(`تراز خودکار جزء ${item.id} با دیوار راست`);
        }
        if (boxPre.minZ < 0 && boxPre.minZ >= -0.04) {
          item.position[2] = Number((item.position[2] - boxPre.minZ).toFixed(3));
          autoRepairs.push(`تراز خودکار جزء ${item.id} با دیوار پشت`);
        }
      }

      const box = getComponentAABB(item);

      // 1. Bounds check against room walls & ceiling
      if (
        box.minX < -TOLERANCE ||
        box.maxX > roomW + TOLERANCE ||
        box.minZ < -TOLERANCE ||
        box.maxZ > roomD + TOLERANCE ||
        box.minY < -TOLERANCE ||
        box.maxY > ceilH + TOLERANCE
      ) {
        errors.push(
          `خروج از محدوده مجاز فضا: جزء «${item.id}» از دیوارها یا ارتفاع سقف (${ceilH}m) بیرون زده است.`
        );
      }

      // 2. Confidence check
      const conf = item.confidence !== undefined ? Number(item.confidence) : 1.0;
      if (conf < minConfidence) {
        missingDimensions.push({
          field: `component_${item.id}`,
          label: `اطلاعات ابعاد/موقعیت جزء «${item.id}» (اطمینان ${Math.round(conf * 100)}٪)`,
        });
        clarificationQuestions.push(
          `موقعیت یا عرض دقیق «${item.label || item.id}» از روی عکس کاملاً قطعی نیست؛ لطفاً اندازه آن را مشخص کنید.`
        );
      }

      allBoxes.push({ id: item.id, category, item, box });
    }
  };

  registerGroup(scene.cabinets, 'cabinet');
  registerGroup(scene.appliances, 'appliance');
  registerGroup(scene.coffeeBars, 'coffeeBar');
  registerGroup(scene.islands, 'island');

  // 3. Pairwise collision check across solid architectural volumes
  // Allowed legitimate overlaps:
  // - sink/stove sits inside countertop or slightly above a base cabinet top (handled separately)
  // - hood hangs above stove (different Y)
  for (let i = 0; i < allBoxes.length; i++) {
    for (let j = i + 1; j < allBoxes.length; j++) {
      const A = allBoxes[i];
      const B = allBoxes[j];

      // Allow countertop/appliance inset ONLY for sink or cooktop on top of a base cabinet if Y overlap <= 0.12m
      const isSurfaceInset =
        ((A.category === 'appliance' && ['sink', 'stove', 'cooktop'].includes(A.item.type) && B.category === 'cabinet' && B.item.kind === 'base') ||
          (B.category === 'appliance' && ['sink', 'stove', 'cooktop'].includes(B.item.type) && A.category === 'cabinet' && A.item.kind === 'base'));

      if (boxesOverlap3D(A.box, B.box, TOLERANCE)) {
        const vol = overlapVolumeInfo(A.box, B.box);
        if (isSurfaceInset && vol.oy <= 0.16) {
          continue; // sink bowl or recessed cooktop inside base unit top is normal
        }
        // Check if auto-repair can resolve small <= 3cm cabinet-to-cabinet horizontal touch
        if (autoRepair && A.category === 'cabinet' && B.category === 'cabinet' && A.item.kind === B.item.kind && vol.ox > 0 && vol.ox <= 0.03) {
          warnings.push(`تماس لبه‌به‌لبه جزئی بین ${A.id} و ${B.id} (${Math.round(vol.ox * 100)}cm) قابل چشم‌پوشی است.`);
          continue;
        }
        errors.push(
          `تداخل هندسی بین «${A.id}» و «${B.id}» (همپوشانی ${Math.round(vol.ox * 100)}×${Math.round(vol.oy * 100)}×${Math.round(vol.oz * 100)} سانتی‌متر).`
        );
      }
    }
  }

  // 4. Upper vs Base clearance & Countertop vs Upper clearance
  const upperCabs = (scene.cabinets || []).filter((c) => c.kind === 'upper');
  const baseCabs = (scene.cabinets || []).filter((c) => c.kind === 'base');
  for (const uc of upperCabs) {
    const uBox = getComponentAABB(uc);
    if (uBox.minY < 1.32) {
      errors.push(`ارتفاع نصب کابینت دیواری «${uc.id}» (${uBox.minY.toFixed(2)}m) پایین‌تر از حداقل فاصله استاندارد روی صفحه (۱.۳۲ متر) است.`);
    }
    for (const bc of baseCabs) {
      const bBox = getComponentAABB(bc);
      const xOverlap = Math.min(uBox.maxX, bBox.maxX) - Math.max(uBox.minX, bBox.minX);
      const zOverlap = Math.min(uBox.maxZ, bBox.maxZ) - Math.max(uBox.minZ, bBox.minZ);
      if (xOverlap > 0.05 && zOverlap > 0.05) {
        const gapY = uBox.minY - (bBox.maxY + 0.04); // accounting 4cm countertop
        if (gapY < 0.40) {
          errors.push(`فاصله بین‌کابینتی زیر «${uc.id}» (${Math.round(gapY * 100)}cm) کمتر از حداقل استاندارد (۴۰ سانتی‌متر) است.`);
        }
      }
    }
  }

  // 5. Island walkway clearance (>= 0.85m from base cabinets/appliances)
  for (const isl of scene.islands || []) {
    const iBox = getComponentAABB(isl);
    let minClearance = Infinity;
    for (const other of [...baseCabs, ...(scene.appliances || [])]) {
      const oBox = getComponentAABB(other);
      const dx = Math.max(0, Math.max(iBox.minX - oBox.maxX, oBox.minX - iBox.maxX));
      const dz = Math.max(0, Math.max(iBox.minZ - oBox.maxZ, oBox.minZ - iBox.maxZ));
      const dist = Math.hypot(dx, dz);
      if (dist < minClearance) minClearance = dist;
    }
    if (minClearance < 0.85) {
      errors.push(
        `فاصله عبور اطراف جزیره «${isl.id}» (${Math.round(minClearance * 100)} سانتی‌متر) کمتر از حداقل مسیر استاندارد (۸۵ سانتی‌متر) است.`
      );
    }
  }

  // 6. Openings collision check (windows / doors)
  for (const op of scene.openings || []) {
    const opBox = getOpeningAABB(op, { width: roomW, depth: roomD });
    for (const entry of allBoxes) {
      if (boxesOverlap3D(opBox, entry.box, 0.04)) {
        if (op.type === 'window' && entry.category === 'cabinet' && entry.item.kind === 'upper') {
          errors.push(`کابینت دیواری «${entry.id}» روی پنجره «${op.id}» قرار گرفته است.`);
        } else if (op.type === 'door') {
          errors.push(`جزء «${entry.id}» مسیر بازشوی در «${op.id}» را مسدود کرده است.`);
        }
      }
    }
  }

  // 7. Appliances consistency checks (must have reasonable kitchen footprint)
  for (const app of scene.appliances || []) {
    const box = getComponentAABB(app);
    if (app.type === 'fridge' && box.minY > 0.05) {
      errors.push(`یخچال «${app.id}» باید روی کف قرار بگیرد.`);
    }
    if (app.type === 'hood') {
      const stove = (scene.appliances || []).find((a) => a.type === 'stove' || a.type === 'cooktop');
      if (stove) {
        const sBox = getComponentAABB(stove);
        const horizDist = Math.abs((box.minX + box.maxX) / 2 - (sBox.minX + sBox.maxX) / 2);
        if (horizDist > 0.35) {
          warnings.push(`هود «${app.id}» نسبت به محور اجاق گاز (${Math.round(horizDist * 100)}cm) کمی انحراف دارد.`);
        }
      }
    }
  }

  // Photo cross-check warning when multiple photos exist
  const photoCabCount = Number(scene.metadata?.cvDetectedCabinetCount || 0);
  if (photoCabCount > 0 && scene.cabinets.length > 0) {
    const ratio = scene.cabinets.length / photoCabCount;
    if (ratio < 0.4 || ratio > 3.0) {
      warnings.push(
        `تعداد کابینت‌های مدل (${scene.cabinets.length}) با تخمین اولیه تصویر (${photoCabCount}) اختلاف معنادار دارد؛ بررسی چیدمان توصیه می‌شود.`
      );
    }
  }

  const valid = errors.length === 0;
  const approved = valid && missingDimensions.length === 0;

  scene.validation = {
    valid,
    approved,
    errors,
    warnings,
    autoRepairs,
    missingDimensions,
    clarificationQuestions,
    checkedAt: new Date().toISOString(),
  };

  return { scene, report: scene.validation };
}

module.exports = {
  validateKitchenScene,
  boxesOverlap3D,
  getOpeningAABB,
};
