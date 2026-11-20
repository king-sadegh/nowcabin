// Pure Node.js Binary glTF 2.0 (.glb) Exporter for KitchenScene
// Generates an actual binary 3D glTF model containing named mesh nodes for walls, floor, ceiling,
// every cabinet carcass, door/drawer, handle, countertop, backsplash, appliance, coffee bar, and island.

const {
  CABINET_FINISHES,
  COUNTERTOP_MATERIALS,
  BACKSPLASH_MATERIALS,
  HANDLE_STYLES,
} = require('./materials');

function hexToLinearRGBA(hex, alpha = 1) {
  const clean = String(hex || '#d7cec2').replace('#', '');
  const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  const num = parseInt(full, 16) || 0;
  const sr = ((num >> 16) & 255) / 255;
  const sg = ((num >> 8) & 255) / 255;
  const sb = (num & 255) / 255;
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [toLin(sr), toLin(sg), toLin(sb), alpha];
}

// Builds unit cube [-0.5..0.5]^3 geometry buffers once and instances/scales nodes in the glTF hierarchy!
function createUnitCubeBuffers() {
  // 24 vertices (4 per face for crisp flat normals)
  const positions = new Float32Array([
    // +Z front
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
    // -Z back
     0.5, -0.5, -0.5,  -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
    // +Y top
    -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
    // -Y bottom
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
    // +X right
     0.5, -0.5,  0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
    // -X left
    -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
  ]);

  const normals = new Float32Array([
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);

  const posBuf = Buffer.from(positions.buffer);
  const normBuf = Buffer.from(normals.buffer);
  const idxBuf = Buffer.from(indices.buffer);
  // Pad total BIN buffer to 4-byte boundary
  const binRaw = Buffer.concat([posBuf, normBuf, idxBuf]);
  const padLen = (4 - (binRaw.length % 4)) % 4;
  const binBuf = Buffer.concat([binRaw, Buffer.alloc(padLen)]);

  return {
    posByteOffset: 0,
    posByteLength: posBuf.length,
    normByteOffset: posBuf.length,
    normByteLength: normBuf.length,
    idxByteOffset: posBuf.length + normBuf.length,
    idxByteLength: idxBuf.length,
    binBuf,
  };
}

function yawToQuat(yawRad) {
  const half = (Number(yawRad) || 0) / 2;
  return [0, Number(Math.sin(half).toFixed(6)), 0, Number(Math.cos(half).toFixed(6))];
}

function exportKitchenSceneToGLB(scene) {
  const cube = createUnitCubeBuffers();

  const materials = [];
  const matCache = new Map();
  const meshes = [];
  const nodes = [];
  const rootChildren = [];

  function getOrCreateMaterial(name, hex, roughness = 0.35, metalness = 0.05) {
    const key = `${hex}|${roughness}|${metalness}`;
    if (matCache.has(key)) return matCache.get(key);
    const idx = materials.length;
    materials.push({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: hexToLinearRGBA(hex, 1),
        metallicFactor: metalness,
        roughnessFactor: roughness,
      },
    });
    const meshIdx = meshes.length;
    meshes.push({
      name: `mesh_${name}`,
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1 },
          indices: 2,
          material: idx,
        },
      ],
    });
    matCache.set(key, meshIdx);
    return meshIdx;
  }

  function addBoxNode(name, cx, bottomY, cz, w, h, d, rotY, hex, roughness, metalness) {
    const meshIdx = getOrCreateMaterial(name, hex, roughness, metalness);
    const nodeIdx = nodes.length;
    nodes.push({
      name,
      mesh: meshIdx,
      translation: [Number(cx.toFixed(4)), Number((bottomY + h / 2).toFixed(4)), Number(cz.toFixed(4))],
      rotation: yawToQuat(rotY),
      scale: [Number(w.toFixed(4)), Number(h.toFixed(4)), Number(d.toFixed(4))],
    });
    rootChildren.push(nodeIdx);
    return nodeIdx;
  }

  const dims = scene.dimensions;
  const W = dims.width;
  const D = dims.depth;
  const H = dims.ceilingHeight;

  // Floor & Ceiling & Walls
  addBoxNode('floor_slab', W / 2, -0.05, D / 2, W, 0.05, D, 0, '#d8d0c4', 0.55, 0.02);
  addBoxNode('ceiling_slab', W / 2, H, D / 2, W, 0.05, D, 0, '#faf8f3', 0.85, 0);
  addBoxNode('wall_back', W / 2, 0, -0.075, W, H, 0.15, 0, '#f2ede4', 0.85, 0);
  addBoxNode('wall_left', -0.075, 0, D / 2, D, H, 0.15, Math.PI / 2, '#eee8dd', 0.85, 0);
  addBoxNode('wall_right', W + 0.075, 0, D / 2, D, H, 0.15, Math.PI / 2, '#eee8dd', 0.85, 0);

  const handleStyle = HANDLE_STYLES[scene.materials?.handleId] || HANDLE_STYLES.matte_black;

  // Cabinets + Independent Doors + Handles
  for (const cab of scene.cabinets || []) {
    const [cx, minY, cz] = cab.position;
    const { width: cw, height: ch, depth: cd } = cab.size;
    const rotY = cab.rotationY || 0;
    const cabHex = cab.color || (cab.kind === 'upper' ? scene.materials.upperColor : scene.materials.lowerColor);

    addBoxNode(`${cab.id}_body`, cx, minY, cz, cw, ch, cd - 0.02, rotY, cabHex, 0.36, 0.02);

    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const frontOffset = cd / 2;

    for (const door of cab.doors || []) {
      const ox = door.offsetX || 0;
      const oy = minY + (door.offsetY || 0);
      const dx = cx + ox * cosR + frontOffset * sinR;
      const dz = cz - ox * sinR + frontOffset * cosR;
      addBoxNode(door.id, dx, oy, dz, door.width, door.height, 0.02, rotY, cabHex, 0.34, 0.02);

      // Independent Handle
      const handleFront = frontOffset + 0.018;
      const hxLocal = door.kind === 'drawer' ? ox : ox + (door.hinge === 'left' ? door.width * 0.36 : -door.width * 0.36);
      const hy = door.kind === 'drawer' ? oy + door.height * 0.55 : cab.kind === 'upper' ? oy + 0.06 : oy + door.height - 0.14;
      const hw = door.kind === 'drawer' ? 0.16 : 0.016;
      const hh = door.kind === 'drawer' ? 0.016 : 0.14;
      const hx = cx + hxLocal * cosR + handleFront * sinR;
      const hz = cz - hxLocal * sinR + handleFront * cosR;
      addBoxNode(`${door.id}_handle`, hx, hy, hz, hw, hh, 0.022, rotY, handleStyle.hex, handleStyle.roughness, handleStyle.metalness);
    }
  }

  // Countertops & Backsplashes
  for (const ct of scene.countertops || []) {
    const mat = COUNTERTOP_MATERIALS[ct.materialId] || COUNTERTOP_MATERIALS.quartz_white_veined;
    addBoxNode(ct.id, ct.position[0], ct.position[1], ct.position[2], ct.size.width, ct.size.height, ct.size.depth, ct.rotationY || 0, mat.hex, mat.roughness, mat.metalness);
  }
  for (const bs of scene.backsplashes || []) {
    const mat = BACKSPLASH_MATERIALS[bs.materialId] || BACKSPLASH_MATERIALS.calacatta_slab;
    addBoxNode(bs.id, bs.position[0], bs.position[1], bs.position[2], bs.size.width, bs.size.height, bs.size.depth, bs.rotationY || 0, mat.hex, mat.roughness, 0.04);
  }

  // Appliances
  for (const app of scene.appliances || []) {
    addBoxNode(app.id, app.position[0], app.position[1], app.position[2], app.size.width, app.size.height, app.size.depth, app.rotationY || 0, app.color || '#c8cdd2', 0.28, 0.72);
  }

  // Coffee Bars & Islands
  for (const cb of scene.coffeeBars || []) {
    addBoxNode(`${cb.id}_base`, cb.position[0], 0, cb.position[2], cb.size.width, 0.86, cb.size.depth, cb.rotationY || 0, cb.cabinetColor || scene.materials.lowerColor, 0.36, 0.02);
    addBoxNode(`${cb.id}_wood_panel`, cb.position[0], 0.90, 0.02, cb.size.width, 1.25, 0.03, cb.rotationY || 0, cb.woodColor || '#7a5230', 0.50, 0.02);
  }
  for (const isl of scene.islands || []) {
    const ctMat = COUNTERTOP_MATERIALS[isl.countertopId] || COUNTERTOP_MATERIALS.quartz_white_veined;
    addBoxNode(`${isl.id}_body`, isl.position[0], 0, isl.position[2], isl.size.width, isl.size.height - 0.04, isl.size.depth - 0.04, isl.rotationY || 0, isl.color || scene.materials.lowerColor, 0.35, 0.02);
    addBoxNode(`${isl.id}_top`, isl.position[0], isl.size.height - 0.04, isl.position[2], isl.size.width + 0.04, 0.04, isl.size.depth + 0.04, isl.rotationY || 0, ctMat.hex, ctMat.roughness, ctMat.metalness);
  }

  const rootNodeIdx = nodes.length;
  nodes.push({
    name: `KitchenScene_${scene.sceneId || 'v1'}`,
    children: rootChildren,
  });

  const gltf = {
    asset: { version: '2.0', generator: 'NoKabin Parametric KitchenScene Exporter' },
    scene: 0,
    scenes: [{ name: 'KitchenScene', nodes: [rootNodeIdx] }],
    nodes,
    meshes,
    materials,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: cube.posByteOffset, byteLength: cube.posByteLength, target: 34962 },
      { buffer: 0, byteOffset: cube.normByteOffset, byteLength: cube.normByteLength, target: 34962 },
      { buffer: 0, byteOffset: cube.idxByteOffset, byteLength: cube.idxByteLength, target: 34963 },
    ],
    buffers: [{ byteLength: cube.binBuf.length }],
  };

  const jsonStr = JSON.stringify(gltf);
  const jsonBufRaw = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBufRaw.length % 4)) % 4;
  const jsonBuf = Buffer.concat([jsonBufRaw, Buffer.alloc(jsonPad, 0x20)]); // space-padded

  const totalLength = 12 + 8 + jsonBuf.length + 8 + cube.binBuf.length;
  const glb = Buffer.alloc(totalLength);

  // GLB Header
  glb.writeUInt32LE(0x46546c67, 0); // 'glTF'
  glb.writeUInt32LE(2, 4); // version 2
  glb.writeUInt32LE(totalLength, 8);

  // Chunk 0: JSON
  let off = 12;
  glb.writeUInt32LE(jsonBuf.length, off);
  glb.writeUInt32LE(0x4e4f534a, off + 4); // 'JSON'
  jsonBuf.copy(glb, off + 8);
  off += 8 + jsonBuf.length;

  // Chunk 1: BIN
  glb.writeUInt32LE(cube.binBuf.length, off);
  glb.writeUInt32LE(0x004e4942, off + 4); // 'BIN\0'
  cube.binBuf.copy(glb, off + 8);

  return {
    glbBuffer: glb,
    stats: {
      nodesCount: nodes.length,
      meshesCount: meshes.length,
      materialsCount: materials.length,
      byteLength: totalLength,
    },
  };
}

module.exports = {
  exportKitchenSceneToGLB,
};
