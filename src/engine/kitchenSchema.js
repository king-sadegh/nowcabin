const crypto = require('crypto');

const SCENE_SCHEMA_VERSION = '1.0.0';

function cloneScene(scene) {
  return JSON.parse(JSON.stringify(scene));
}

function hashScene(scene) {
  const canonical = {
    dimensions: scene.dimensions,
    walls: scene.walls,
    openings: scene.openings,
    cabinets: scene.cabinets,
    countertops: scene.countertops,
    backsplashes: scene.backsplashes,
    appliances: scene.appliances,
    coffeeBars: scene.coffeeBars,
    islands: scene.islands,
    materials: scene.materials,
    lighting: scene.lighting,
    cameras: scene.cameras,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

// Computes axis-aligned 3D bounding box [minX..maxX, minY..maxY, minZ..maxZ] in world space
// taking cabinet/appliance Y-axis rotation into account.
// Convention: `position: [cx, bottomY, cz]`
function getComponentAABB(comp) {
  const pos = comp.position || [0, 0, 0];
  const size = comp.size || { width: 0.6, height: 0.8, depth: 0.6 };
  const rotY = Number(comp.rotationY || 0);
  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));

  const worldW = size.width * cos + size.depth * sin;
  const worldD = size.width * sin + size.depth * cos;

  const cx = Number(pos[0]) || 0;
  const minY = Number(pos[1]) || 0;
  const cz = Number(pos[2]) || 0;

  return {
    minX: cx - worldW / 2,
    maxX: cx + worldW / 2,
    minY,
    maxY: minY + (Number(size.height) || 0),
    minZ: cz - worldD / 2,
    maxZ: cz + worldD / 2,
    worldW,
    worldD,
  };
}

function createDefaultCameras(width, depth, ceilingHeight) {
  const cx = Number((width / 2).toFixed(2));
  const camZFront = Number((Math.max(depth, 3.0) + 1.15).toFixed(2));
  const camZAngle = Number((Math.max(depth, 3.0) + 0.65).toFixed(2));
  const camY = Number(Math.min(1.56, ceilingHeight * 0.55).toFixed(2));
  const insetX = Math.min(0.45, width * 0.14);

  return [
    {
      id: 'cam_front',
      label: 'نمای کلی روبه‌رو',
      position: [cx, camY, camZFront],
      target: [cx, 1.15, 0.32],
      fov: 54,
    },
    {
      id: 'cam_right',
      label: 'نمای زاویه‌دار از راست',
      position: [Number((width - insetX).toFixed(2)), Number((camY + 0.06).toFixed(2)), camZAngle],
      target: [Number((width * 0.36).toFixed(2)), 1.12, 0.42],
      fov: 54,
    },
    {
      id: 'cam_left',
      label: 'نمای زاویه‌دار از چپ',
      position: [Number(insetX.toFixed(2)), Number((camY + 0.06).toFixed(2)), camZAngle],
      target: [Number((width * 0.64).toFixed(2)), 1.12, 0.52],
      fov: 54,
    },
  ];
}

function createEmptyScene({
  sceneId = `scene_${Date.now()}`,
  width = 3.8,
  depth = 3.2,
  ceilingHeight = 2.8,
  layoutType = 'l_shape',
} = {}) {
  const walls = [
    { id: 'wall_back', start: [0, 0], end: [width, 0], height: ceilingHeight, thickness: 0.15, color: '#f3efe7' },
    { id: 'wall_left', start: [0, 0], end: [0, depth], height: ceilingHeight, thickness: 0.15, color: '#efeadf' },
    { id: 'wall_right', start: [width, 0], end: [width, depth], height: ceilingHeight, thickness: 0.15, color: '#efeadf' },
  ];

  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    sceneId,
    version: 1,
    createdAt: new Date().toISOString(),
    dimensions: {
      width,
      depth,
      ceilingHeight,
      layoutType,
      unit: 'meters',
    },
    walls,
    openings: [],
    cabinets: [],
    countertops: [],
    backsplashes: [],
    appliances: [],
    coffeeBars: [],
    islands: [],
    materials: {
      cabinetFinishId: 'cashmere_beige',
      upperColor: '#d9cebf',
      lowerColor: '#d9cebf',
      cabinetSurfaceType: 'polyurethane_satin',
      countertopId: 'standard_beige_stone',
      backsplashId: 'warm_subway_tile',
      handleId: 'matte_black',
    },
    lighting: {
      underCabinetLed: false,
      warmthKelvin: 3500,
      ceilingSpots: [
        { position: [Number((width * 0.25).toFixed(2)), ceilingHeight - 0.02, Number((depth * 0.35).toFixed(2))] },
        { position: [Number((width * 0.55).toFixed(2)), ceilingHeight - 0.02, Number((depth * 0.35).toFixed(2))] },
        { position: [Number((width * 0.80).toFixed(2)), ceilingHeight - 0.02, Number((depth * 0.35).toFixed(2))] },
      ],
    },
    cameras: createDefaultCameras(width, depth, ceilingHeight),
    metadata: {
      source: 'parametric',
      averageConfidence: 1.0,
      photosCount: 0,
      condition: 'MDF / چوب سالم',
    },
    validation: {
      valid: false,
      approved: false,
      errors: [],
      warnings: [],
      autoRepairs: [],
      missingDimensions: [],
      clarificationQuestions: [],
    },
    changeHistory: [],
  };
}

// Helper to build standard doors for a cabinet module so every door & handle is an independent sub-component
function buildCabinetDoors(cabinetId, width, height, doorType = 'double', drawerCount = 0) {
  const doors = [];
  if (drawerCount > 0) {
    const gap = 0.006;
    const eachH = (height - gap * (drawerCount + 1)) / drawerCount;
    for (let i = 0; i < drawerCount; i++) {
      doors.push({
        id: `${cabinetId}_drawer_${i + 1}`,
        kind: 'drawer',
        width: Number((width - 0.012).toFixed(3)),
        height: Number(eachH.toFixed(3)),
        offsetY: Number((gap + i * (eachH + gap)).toFixed(3)),
        offsetX: 0,
      });
    }
    return doors;
  }

  if (doorType === 'single') {
    doors.push({
      id: `${cabinetId}_door_1`,
      kind: 'door',
      hinge: 'left',
      width: Number((width - 0.012).toFixed(3)),
      height: Number((height - 0.012).toFixed(3)),
      offsetY: 0.006,
      offsetX: 0,
    });
    return doors;
  }

  // Double door
  const singleW = Number(((width - 0.018) / 2).toFixed(3));
  doors.push({
    id: `${cabinetId}_door_1`,
    kind: 'door',
    hinge: 'left',
    width: singleW,
    height: Number((height - 0.012).toFixed(3)),
    offsetY: 0.006,
    offsetX: Number((-singleW / 2 - 0.003).toFixed(3)),
  });
  doors.push({
    id: `${cabinetId}_door_2`,
    kind: 'door',
    hinge: 'right',
    width: singleW,
    height: Number((height - 0.012).toFixed(3)),
    offsetY: 0.006,
    offsetX: Number((singleW / 2 + 0.003).toFixed(3)),
  });
  return doors;
}

module.exports = {
  SCENE_SCHEMA_VERSION,
  cloneScene,
  hashScene,
  getComponentAABB,
  createDefaultCameras,
  createEmptyScene,
  buildCabinetDoors,
};
