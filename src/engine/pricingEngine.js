const { getComponentAABB } = require('./kitchenSchema');

/**
 * Computes geometry-driven renovation price range from an approved KitchenScene.
 * Strictly avoids guessing price solely from a raw photo.
 */
function calculateKitchenPricing(scene) {
  const cabinets = scene.cabinets || [];
  const baseCabs = cabinets.filter((c) => c.kind === 'base');
  const upperCabs = cabinets.filter((c) => c.kind === 'upper');

  let baseLinearMeters = 0;
  let upperLinearMeters = 0;
  let totalFrontAreaSqM = 0;
  let totalDoors = 0;
  let totalDrawers = 0;

  for (const c of baseCabs) {
    baseLinearMeters += Number(c.size?.width) || 0;
    totalFrontAreaSqM += (Number(c.size?.width) || 0) * (Number(c.size?.height) || 0);
    for (const d of c.doors || []) {
      if (d.kind === 'drawer') totalDrawers += 1;
      else totalDoors += 1;
    }
  }

  for (const c of upperCabs) {
    upperLinearMeters += Number(c.size?.width) || 0;
    totalFrontAreaSqM += (Number(c.size?.width) || 0) * (Number(c.size?.height) || 0);
    for (const d of c.doors || []) {
      if (d.kind === 'drawer') totalDrawers += 1;
      else totalDoors += 1;
    }
  }

  const effectiveLinearMeters = Number(Math.max(baseLinearMeters, (baseLinearMeters + upperLinearMeters) * 0.55).toFixed(2));
  const handlesCount = totalDoors + totalDrawers;

  // Condition multiplier
  const conditionText = String(scene.metadata?.condition || 'MDF / چوب سالم');
  let conditionMultiplier = 1.0;
  if (/وکیوم|ممبران/.test(conditionText)) conditionMultiplier = 1.14;
  else if (/کلاسیک|منبت|پرکار/.test(conditionText)) conditionMultiplier = 1.20;

  // Cost breakdown (in Toman)
  // Paint & surface finish scaled by actual front surface area + door/drawer count
  const paintAndFinishToman = Math.round((totalFrontAreaSqM * 5200000 + handlesCount * 650000) * conditionMultiplier);
  const repairAndPrepToman = Math.round(totalFrontAreaSqM * 1450000 * conditionMultiplier);
  const disassemblyAndInstallToman = Math.round(4500000 + handlesCount * 220000);
  const transportToman = 3200000;

  // Handle upgrade cost (450,000 Toman avg per bar handle)
  const handleUnitPrice = scene.materials?.handleId === 'brushed_brass' ? 520000 : 380000;
  const handlesToman = handlesCount * handleUnitPrice;

  // Structural, surface & lighting upgrades
  let addonsToman = 0;
  const addonItems = [];

  if ((scene.islands || []).length > 0) {
    const islCost = 200000000;
    addonsToman += islCost;
    addonItems.push({ label: 'ساخت جزیره مدرن هم‌رنگ کابینت', amountToman: islCost });
  }
  if ((scene.coffeeBars || []).length > 0) {
    const cbCost = 180000000;
    addonsToman += cbCost;
    addonItems.push({ label: 'ساخت استیشن کافی‌بار', amountToman: cbCost });
  }
  if (scene.materials?.countertopId && scene.materials.countertopId !== 'standard_beige_stone') {
    const ctCost = 22000000;
    addonsToman += ctCost;
    addonItems.push({ label: 'نوسازی صفحه کابینت', amountToman: ctCost });
  }
  if (scene.materials?.backsplashId && scene.materials.backsplashId !== 'warm_subway_tile') {
    const bsCost = 20000000;
    addonsToman += bsCost;
    addonItems.push({ label: 'اجرای سرامیک بین‌کابینتی', amountToman: bsCost });
  }
  if (scene.lighting?.underCabinetLed === true) {
    const ledCost = 13000000;
    addonsToman += ledCost;
    addonItems.push({ label: 'اجرای نور مخفی زیرکابینتی', amountToman: ledCost });
  }

  const baseRenovationSubtotal = paintAndFinishToman + repairAndPrepToman + disassemblyAndInstallToman + transportToman + handlesToman;
  const centerTotalToman = baseRenovationSubtotal + addonsToman;

  // Output calibrated range (+/- 8% around calculated center, rounded to 1M Toman)
  const roundToMillion = (val) => Math.max(35000000, Math.round(val / 1000000) * 1000000);
  const minToman = roundToMillion(centerTotalToman * 0.92);
  const maxToman = roundToMillion(centerTotalToman * 1.08);
  const marketReplacementCenterToman = centerTotalToman * 10; // Strict ~1/10 replacement ratio anchor

  return {
    metrics: {
      baseLinearMeters: Number(baseLinearMeters.toFixed(2)),
      upperLinearMeters: Number(upperLinearMeters.toFixed(2)),
      effectiveLinearMeters,
      totalFrontAreaSqM: Number(totalFrontAreaSqM.toFixed(2)),
      doorsCount: totalDoors,
      drawersCount: totalDrawers,
      handlesCount,
      condition: conditionText,
    },
    breakdown: [
      { label: 'زیرسازی و پاشش رنگ پلی‌اورتان در کارگاه ایزوله', amountToman: paintAndFinishToman },
      { label: 'ترمیم، سمباده‌زنی و بتونه‌کاری صنعتی', amountToman: repairAndPrepToman },
      { label: `تعویض دستگیره‌ها (${handlesCount} عدد)`, amountToman: handlesToman },
      { label: 'باز و نصب تخصصی و رگلاژ لولاها', amountToman: disassemblyAndInstallToman },
      { label: 'حمل و بسته‌بندی ایزوله قطعات', amountToman: transportToman },
      ...addonItems,
    ],
    range: {
      minToman,
      maxToman,
      minMillions: Math.round(minToman / 1000000),
      maxMillions: Math.round(maxToman / 1000000),
      centerToman: roundToMillion(centerTotalToman),
      marketReplacementApproxMillions: Math.round(marketReplacementCenterToman / 1000000),
    },
    deliveryDays: 15,
    disclaimer:
      'این برآورد بر اساس ابعاد، متراژ سطوح و تعداد درب‌ها و کشوهای مدل سه‌بعدی محاسبه شده است و قیمت قطعی پس از بازدید حضوری رایگان و اندازه‌گیری دقیق تایید می‌شود.',
  };
}

module.exports = {
  calculateKitchenPricing,
};
