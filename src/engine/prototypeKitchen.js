const {
  createEmptyScene,
  buildCabinetDoors,
  createDefaultCameras,
} = require('./kitchenSchema');
const { validateKitchenScene } = require('./geometryValidator');

/**
 * Creates the Phase 2 Verified Parametric Reference Kitchen:
 * - Room: 4.2m (W) x 3.4m (D) x 2.8m (H)
 * - Two rows of base cabinets (Back Wall Row + Right Wall Return Row)
 * - Upper wall cabinets with independent doors & handles
 * - Countertops + Backsplashes
 * - Independent Fridge, Sink, Stove, and Range Hood
 * - Intentionally reserves a clean 0.80m wall alcove immediately right of the fridge (x: 0.92..1.72)
 *   so adding a Coffee Bar next to the fridge can be geometrically verified.
 */
function createPrototypeKitchenScene({ initialState = 'before' } = {}) {
  const width = 4.2;
  const depth = 3.4;
  const ceilingHeight = 2.8;
  const scene = createEmptyScene({
    sceneId: 'proto_kitchen_v1',
    width,
    depth,
    ceilingHeight,
    layoutType: 'l_shape',
  });

  const isBefore = initialState === 'before';
  const upperColor = isBefore ? '#7d5233' : '#e6dfd3';
  const lowerColor = isBefore ? '#6e4529' : '#c4b7a6';

  scene.materials = {
    cabinetFinishId: isBefore ? 'old_oak_wood' : 'cashmere_beige',
    upperColor,
    lowerColor,
    cabinetSurfaceType: isBefore ? 'oak_wood' : 'polyurethane_satin',
    countertopId: isBefore ? 'standard_beige_stone' : 'quartz_white_veined',
    backsplashId: isBefore ? 'warm_subway_tile' : 'calacatta_slab',
    handleId: isBefore ? 'dark_bronze' : 'matte_black',
  };

  scene.metadata = {
    source: 'prototype_reference',
    averageConfidence: 1.0,
    photosCount: 0,
    condition: isBefore ? 'چوب قدیمی قابل بازسازی' : 'بازسازی‌شده با رنگ پلی‌اورتان',
  };

  const baseH = 0.86;
  const baseD = 0.60;
  const upperY = 1.48;
  const upperH = 0.80;
  const upperD = 0.36;

  // Appliances: Fridge at back-left corner, Sink over cab_base_1, Stove & Hood at cab_base_2
  scene.appliances = [
    {
      id: 'app_fridge',
      type: 'fridge',
      label: 'یخچال سایدبای‌ساید',
      position: [0.47, 0, 0.35],
      size: { width: 0.86, height: 1.96, depth: 0.70 },
      rotationY: 0,
      color: '#cfd4d8',
      confidence: 1.0,
    },
    {
      id: 'app_sink',
      type: 'sink',
      label: 'سینک ظرفشویی',
      position: [2.13, 0.85, 0.31],
      size: { width: 0.74, height: 0.18, depth: 0.48 },
      rotationY: 0,
      color: '#b8bec4',
      confidence: 1.0,
    },
    {
      id: 'app_stove',
      type: 'stove',
      label: 'اجاق گاز صفحه‌ای',
      position: [2.95, 0.87, 0.31],
      size: { width: 0.72, height: 0.06, depth: 0.50 },
      rotationY: 0,
      color: '#1e1f22',
      confidence: 1.0,
    },
    {
      id: 'app_hood',
      type: 'hood',
      label: 'هود مخفی / شومینه‌ای',
      position: [2.95, 1.62, 0.22],
      size: { width: 0.76, height: 0.52, depth: 0.42 },
      rotationY: 0,
      color: '#2b2d30',
      confidence: 1.0,
    },
  ];

  // Back Row Base Cabinets (x: 1.72 .. 4.18) + Right Row Base Cabinets (z: 0.64 .. 2.34)
  scene.cabinets = [
    {
      id: 'cab_base_1',
      kind: 'base',
      row: 'row_back',
      label: 'کابینت زمینی زیر سینک',
      position: [2.13, 0, baseD / 2],
      size: { width: 0.82, height: baseH, depth: baseD },
      rotationY: 0,
      color: lowerColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_base_1', 0.82, baseH - 0.10, 'double', 0),
      confidence: 1.0,
    },
    {
      id: 'cab_base_2',
      kind: 'base',
      row: 'row_back',
      label: 'کابینت کشودار زیر اجاق',
      position: [2.95, 0, baseD / 2],
      size: { width: 0.82, height: baseH, depth: baseD },
      rotationY: 0,
      color: lowerColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_base_2', 0.82, baseH - 0.10, 'drawer', 3),
      confidence: 1.0,
    },
    {
      id: 'cab_base_3',
      kind: 'base',
      row: 'row_back',
      label: 'کابینت زمینی کنج راست',
      position: [3.77, 0, baseD / 2],
      size: { width: 0.82, height: baseH, depth: baseD },
      rotationY: 0,
      color: lowerColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_base_3', 0.82, baseH - 0.10, 'double', 0),
      confidence: 1.0,
    },
    // Second Row of Base Cabinets along Right Wall (rotationY = -PI/2, back at x = 4.2)
    {
      id: 'cab_base_4',
      kind: 'base',
      row: 'row_right',
      label: 'کابینت زمینی ردیف راست (کشودار)',
      position: [width - baseD / 2, 0, 1.09],
      size: { width: 0.88, height: baseH, depth: baseD },
      rotationY: -Math.PI / 2,
      color: lowerColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_base_4', 0.88, baseH - 0.10, 'drawer', 3),
      confidence: 1.0,
    },
    {
      id: 'cab_base_5',
      kind: 'base',
      row: 'row_right',
      label: 'کابینت زمینی ردیف راست (دودرب)',
      position: [width - baseD / 2, 0, 1.95],
      size: { width: 0.84, height: baseH, depth: baseD },
      rotationY: -Math.PI / 2,
      color: lowerColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_base_5', 0.84, baseH - 0.10, 'double', 0),
      confidence: 1.0,
    },
    // Upper Wall Cabinets
    {
      id: 'cab_upper_1',
      kind: 'upper',
      row: 'row_back',
      label: 'کابینت دیواری بالای سینک',
      position: [2.13, upperY, upperD / 2],
      size: { width: 0.82, height: upperH, depth: upperD },
      rotationY: 0,
      color: upperColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_upper_1', 0.82, upperH, 'double', 0),
      confidence: 1.0,
    },
    {
      id: 'cab_upper_2',
      kind: 'upper',
      row: 'row_back',
      label: 'کابینت دیواری سمت راست هود',
      position: [3.77, upperY, upperD / 2],
      size: { width: 0.82, height: upperH, depth: upperD },
      rotationY: 0,
      color: upperColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_upper_2', 0.82, upperH, 'double', 0),
      confidence: 1.0,
    },
    {
      id: 'cab_upper_3',
      kind: 'upper',
      row: 'row_right',
      label: 'کابینت دیواری ردیف راست',
      position: [width - upperD / 2, upperY, 1.09],
      size: { width: 0.88, height: upperH, depth: upperD },
      rotationY: -Math.PI / 2,
      color: upperColor,
      doorStyle: 'shaker',
      handleId: scene.materials.handleId,
      doors: buildCabinetDoors('cab_upper_3', 0.88, upperH, 'double', 0),
      confidence: 1.0,
    },
  ];

  // Countertop Slabs
  scene.countertops = [
    {
      id: 'ct_back',
      row: 'row_back',
      position: [2.95, baseH, 0.31],
      size: { width: 2.46, height: 0.04, depth: 0.62 },
      rotationY: 0,
      materialId: scene.materials.countertopId,
    },
    {
      id: 'ct_right',
      row: 'row_right',
      position: [width - 0.31, baseH, 1.51],
      size: { width: 1.74, height: 0.04, depth: 0.62 },
      rotationY: -Math.PI / 2,
      materialId: scene.materials.countertopId,
    },
  ];

  // Backsplashes
  scene.backsplashes = [
    {
      id: 'bs_back',
      row: 'row_back',
      position: [2.95, baseH + 0.04, 0.012],
      size: { width: 2.46, height: upperY - (baseH + 0.04), depth: 0.02 },
      rotationY: 0,
      materialId: scene.materials.backsplashId,
    },
    {
      id: 'bs_right',
      row: 'row_right',
      position: [width - 0.012, baseH + 0.04, 1.51],
      size: { width: 1.74, height: upperY - (baseH + 0.04), depth: 0.02 },
      rotationY: -Math.PI / 2,
      materialId: scene.materials.backsplashId,
    },
  ];

  scene.cameras = createDefaultCameras(width, depth, ceilingHeight);

  const { scene: validated } = validateKitchenScene(scene);
  return validated;
}

module.exports = {
  createPrototypeKitchenScene,
};
