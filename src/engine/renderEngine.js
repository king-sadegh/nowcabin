const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const config = require('../config');
const { hashScene } = require('./kitchenSchema');
const { COUNTERTOP_MATERIALS, BACKSPLASH_MATERIALS, HANDLE_STYLES } = require('./materials');

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildRenderPageHtml(scene, { width = 960, height = 720, uploadEndpoint }) {
  const ctMat = COUNTERTOP_MATERIALS[scene.materials?.countertopId] || COUNTERTOP_MATERIALS.quartz_white_veined;
  const bsMat = BACKSPLASH_MATERIALS[scene.materials?.backsplashId] || BACKSPLASH_MATERIALS.calacatta_slab;
  const handleMat = HANDLE_STYLES[scene.materials?.handleId] || HANDLE_STYLES.matte_black;

  const renderData = {
    scene,
    ctMat,
    bsMat,
    handleMat,
    width,
    height,
    uploadEndpoint,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>body { margin: 0; overflow: hidden; background: #1a1612; }</style>
</head>
<body>
<script type="module">
import * as THREE from '/three/three.module.js';

const DATA = ${JSON.stringify(renderData)};
const { scene: KS, ctMat, bsMat, handleMat, width, height, uploadEndpoint } = DATA;

// Procedural PBR Canvas Texture Generators
function makeWoodTexture(baseHex, grainHex) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = grainHex;
  for (let i = 0; i < 220; i++) {
    ctx.globalAlpha = 0.08 + (i % 5) * 0.03;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    const x = (i * 512) / 220;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + Math.sin(i) * 14, 170, x - Math.cos(i) * 14, 340, x + (i % 7) - 3, 512);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeMarbleTexture(baseHex, veinHex) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);
  for (let v = 0; v < 26; v++) {
    ctx.strokeStyle = veinHex;
    ctx.globalAlpha = 0.14 + (v % 3) * 0.07;
    ctx.lineWidth = 0.8 + (v % 4) * 0.7;
    ctx.beginPath();
    let x = (v * 37) % 512;
    let y = 0;
    ctx.moveTo(x, y);
    for (let s = 1; s <= 6; s++) {
      x += Math.sin(v * 2.1 + s) * 48 + 18;
      y = (s * 512) / 6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeTileTexture(baseHex, groutHex) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = groutHex;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = baseHex;
  const rows = 8;
  const cols = 4;
  const rh = 512 / rows;
  const cw = 512 / cols;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cw / 2);
    for (let col = -1; col <= cols; col++) {
      ctx.fillRect(col * cw + offset + 3, r * rh + 3, cw - 6, rh - 6);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1.2);
  return tex;
}

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#bfb6a8';
  ctx.fillRect(0, 0, 512, 512);
  const tiles = 4;
  const step = 512 / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const shade = 212 + ((x * 7 + y * 13) % 10) - 5;
      ctx.fillStyle = \`rgb(\${shade}, \${shade - 6}, \${shade - 15})\`;
      ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

async function run() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  document.body.appendChild(renderer.domElement);

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color('#e8e2d7');

  const D = KS.dimensions;
  const W = D.width, Dep = D.depth, H = D.ceilingHeight;

  // Lighting Rig (Realistic Architectural Interior Lighting)
  const hemiLight = new THREE.HemisphereLight(0xfffaf0, 0x8f8272, 1.05);
  threeScene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.35);
  keyLight.position.set(W * 0.55, H - 0.15, Dep * 0.85);
  keyLight.target.position.set(W * 0.48, 0.8, 0.35);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.camera.near = 0.2;
  keyLight.shadow.camera.far = 12;
  keyLight.shadow.camera.left = -W;
  keyLight.shadow.camera.right = W;
  keyLight.shadow.camera.top = H;
  keyLight.shadow.camera.bottom = -H;
  threeScene.add(keyLight);
  threeScene.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight(0xf2f6ff, 0.55);
  fillLight.position.set(-1.5, H * 0.75, Dep + 1.0);
  threeScene.add(fillLight);

  // Materials
  const wallMat = new THREE.MeshStandardMaterial({ color: '#f3eee5', roughness: 0.86, metalness: 0.0 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#fbf9f5', roughness: 0.90, metalness: 0.0 });
  const floorMat = new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.42, metalness: 0.04 });

  const isWoodCab = KS.materials?.cabinetSurfaceType === 'oak_wood';
  const upperCabMat = new THREE.MeshPhysicalMaterial({
    color: isWoodCab ? '#ffffff' : (KS.materials?.upperColor || '#f4efe6'),
    map: isWoodCab ? makeWoodTexture(KS.materials?.upperColor || '#8c5d3b', '#52341d') : null,
    roughness: isWoodCab ? 0.52 : 0.32,
    metalness: 0.02,
    clearcoat: isWoodCab ? 0.05 : 0.28,
    clearcoatRoughness: 0.35,
  });
  const lowerCabMat = new THREE.MeshPhysicalMaterial({
    color: isWoodCab ? '#ffffff' : (KS.materials?.lowerColor || '#c4b7a6'),
    map: isWoodCab ? makeWoodTexture(KS.materials?.lowerColor || '#7d5233', '#472d18') : null,
    roughness: isWoodCab ? 0.52 : 0.32,
    metalness: 0.02,
    clearcoat: isWoodCab ? 0.05 : 0.28,
    clearcoatRoughness: 0.35,
  });

  const ctThreeMat = new THREE.MeshPhysicalMaterial({
    map: ctMat.textureType === 'oak_wood' ? makeWoodTexture(ctMat.hex, ctMat.veinHex) : makeMarbleTexture(ctMat.hex, ctMat.veinHex),
    roughness: ctMat.roughness ?? 0.18,
    metalness: ctMat.metalness ?? 0.04,
    clearcoat: ctMat.textureType === 'oak_wood' ? 0.12 : 0.55,
    clearcoatRoughness: 0.18,
  });

  const bsThreeMat = new THREE.MeshStandardMaterial({
    map: bsMat.textureType === 'subway_tile' ? makeTileTexture(bsMat.hex, bsMat.groutHex || '#c4b8a6') : makeMarbleTexture(bsMat.hex, bsMat.veinHex || '#bda583'),
    roughness: bsMat.roughness ?? 0.18,
    metalness: 0.03,
  });

  const handleThreeMat = new THREE.MeshStandardMaterial({
    color: handleMat.hex,
    roughness: handleMat.roughness ?? 0.35,
    metalness: handleMat.metalness ?? 0.80,
  });

  const steelMat = new THREE.MeshStandardMaterial({ color: '#cfd4d8', roughness: 0.24, metalness: 0.82 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#222427', roughness: 0.28, metalness: 0.65 });
  const woodOakMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture('#9b6c43', '#613f22'), roughness: 0.48, metalness: 0.02 });
  const ledStripMat = new THREE.MeshBasicMaterial({ color: '#ffe5a8' });

  function addMeshBox(cx, minY, cz, w, h, d, rotY, mat, cast = true, receive = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, minY + h / 2, cz);
    mesh.rotation.y = rotY || 0;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    threeScene.add(mesh);
    return mesh;
  }

  // Room Shell (Floor, Ceiling, Walls + Toe-kick Plinth)
  addMeshBox(W / 2, -0.05, Dep / 2, W + 2, 0.05, Dep + 2, 0, floorMat, false, true);
  addMeshBox(W / 2, H, Dep / 2, W + 2, 0.06, Dep + 2, 0, ceilMat, false, true);
  addMeshBox(W / 2, 0, -0.08, W + 0.4, H, 0.16, 0, wallMat, false, true);
  addMeshBox(-0.08, 0, Dep / 2, Dep + 0.4, H, 0.16, Math.PI / 2, wallMat, false, true);
  addMeshBox(W + 0.08, 0, Dep / 2, Dep + 0.4, H, 0.16, Math.PI / 2, wallMat, false, true);

  // Recessed Ceiling Spotlights
  (KS.lighting?.ceilingSpots || []).forEach((sp) => {
    const [sx, sy, sz] = sp.position;
    const spotRing = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 18), steelMat);
    spotRing.position.set(sx, H - 0.01, sz);
    threeScene.add(spotRing);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.022, 16), ledStripMat);
    bulb.position.set(sx, H - 0.012, sz);
    threeScene.add(bulb);
    const pLight = new THREE.PointLight(0xffe6ba, 0.75, 4.2, 1.5);
    pLight.position.set(sx, H - 0.14, sz);
    threeScene.add(pLight);
  });

  // Cabinets + Recessed 5-Piece Shaker Doors + Handles + Toe Kick
  for (const cab of KS.cabinets || []) {
    const [cx, minY, cz] = cab.position;
    const { width: cw, height: ch, depth: cd } = cab.size;
    const rotY = cab.rotationY || 0;
    const isUpper = cab.kind === 'upper';

    const cabMat = cab.color
      ? new THREE.MeshPhysicalMaterial({
          color: isWoodCab ? '#ffffff' : cab.color,
          map: isWoodCab ? makeWoodTexture(cab.color, '#472d18') : null,
          roughness: isWoodCab ? 0.52 : 0.32,
          metalness: 0.02,
          clearcoat: isWoodCab ? 0.05 : 0.28,
        })
      : (isUpper ? upperCabMat : lowerCabMat);

    const cabGroup = new THREE.Group();
    cabGroup.position.set(cx, minY, cz);
    cabGroup.rotation.y = rotY;

    // Carcass & Toe-kick for base units
    const kickH = isUpper ? 0 : 0.10;
    if (!isUpper) {
      const kick = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.004, kickH, cd - 0.06), darkMetalMat);
      kick.position.set(0, kickH / 2, -0.02);
      kick.castShadow = true; kick.receiveShadow = true;
      cabGroup.add(kick);
    }

    const bodyH = ch - kickH;
    const body = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.004, bodyH, cd - 0.022), cabMat);
    body.position.set(0, kickH + bodyH / 2, -0.011);
    body.castShadow = true; body.receiveShadow = true;
    cabGroup.add(body);

    // Shaker Doors & Independent Handles
    const frontZ = cd / 2 - 0.01;
    for (const door of cab.doors || []) {
      const dw = door.width;
      const dh = door.height;
      const dx = door.offsetX || 0;
      const dy = kickH + (door.offsetY || 0) + dh / 2;
      const frameT = Math.min(0.055, Math.min(dw, dh) * 0.18);

      // Recessed inner door panel
      const innerPanel = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.004, dh - 0.004, 0.012), cabMat);
      innerPanel.position.set(dx, dy, frontZ);
      innerPanel.castShadow = true; innerPanel.receiveShadow = true;
      cabGroup.add(innerPanel);

      // 4 Shaker Perimeter Rails/Stiles projecting 8mm forward for crisp photorealistic bevel shadows
      const addRail = (rw, rh, rx, ry) => {
        const rMesh = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, 0.018), cabMat);
        rMesh.position.set(dx + rx, dy + ry, frontZ + 0.004);
        rMesh.castShadow = true; rMesh.receiveShadow = true;
        cabGroup.add(rMesh);
      };
      addRail(frameT, dh, -dw / 2 + frameT / 2, 0);
      addRail(frameT, dh, dw / 2 - frameT / 2, 0);
      addRail(dw - frameT * 2, frameT, 0, dh / 2 - frameT / 2);
      addRail(dw - frameT * 2, frameT, 0, -dh / 2 + frameT / 2);

      // Independent Handle Bar
      if (door.kind === 'drawer') {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.22, dw * 0.36), 0.014, 0.024), handleThreeMat);
        bar.position.set(dx, dy, frontZ + 0.022);
        bar.castShadow = true;
        cabGroup.add(bar);
      } else {
        const hx = dx + (door.hinge === 'left' ? dw / 2 - 0.032 : -dw / 2 + 0.032);
        const hy = isUpper ? dy - dh / 2 + 0.095 : dy + dh / 2 - 0.095;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.15, 0.024), handleThreeMat);
        bar.position.set(hx, hy, frontZ + 0.022);
        bar.castShadow = true;
        cabGroup.add(bar);
      }
    }

    // Under-Cabinet Warm LED Glow Strip
    if (isUpper && KS.lighting?.underCabinetLed === true) {
      const ledBar = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.06, 0.008, 0.018), ledStripMat);
      ledBar.position.set(0, -0.004, -cd / 2 + 0.05);
      cabGroup.add(ledBar);
      const uLight = new THREE.PointLight(0xffd28c, 0.45, 1.5, 2);
      uLight.position.set(0, -0.10, 0.02);
      cabGroup.add(uLight);
    }

    threeScene.add(cabGroup);
  }

  // Countertops & Backsplashes
  for (const ct of KS.countertops || []) {
    addMeshBox(ct.position[0], ct.position[1], ct.position[2], ct.size.width, ct.size.height, ct.size.depth, ct.rotationY, ctThreeMat, true, true);
  }
  for (const bs of KS.backsplashes || []) {
    addMeshBox(bs.position[0], bs.position[1], bs.position[2], bs.size.width, bs.size.height, bs.size.depth, bs.rotationY, bsThreeMat, false, true);
  }

  // Realistic Appliances (Fridge, Sink + Gooseneck Faucet, Cooktop + Burners, Chimney Range Hood)
  for (const app of KS.appliances || []) {
    const [ax, ay, az] = app.position;
    const { width: aw, height: ah, depth: ad } = app.size;
    if (app.type === 'fridge') {
      addMeshBox(ax, ay, az, aw, ah, ad, app.rotationY, steelMat);
      // Center seam + dual tall stainless handles
      addMeshBox(ax, ay + 0.04, az + ad / 2 + 0.002, 0.008, ah - 0.08, 0.006, 0, darkMetalMat);
      addMeshBox(ax - 0.04, ay + 0.72, az + ad / 2 + 0.02, 0.016, 0.58, 0.026, 0, steelMat);
      addMeshBox(ax + 0.04, ay + 0.72, az + ad / 2 + 0.02, 0.016, 0.58, 0.026, 0, steelMat);
    } else if (app.type === 'sink') {
      // Sink Basin + Rim + Gooseneck Faucet
      addMeshBox(ax, 0.896, az, aw, 0.018, ad, 0, steelMat);
      addMeshBox(ax, 0.902, az, aw - 0.06, 0.015, ad - 0.06, 0, darkMetalMat);
      const faucetStem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.24, 16), steelMat);
      faucetStem.position.set(ax, 1.02, az - ad / 2 + 0.04);
      threeScene.add(faucetStem);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.013, 12, 24, Math.PI), steelMat);
      arch.position.set(ax, 1.14, az - ad / 2 + 0.125);
      arch.rotation.y = Math.PI / 2;
      threeScene.add(arch);
    } else if (app.type === 'stove' || app.type === 'cooktop') {
      addMeshBox(ax, 0.898, az, aw, 0.016, ad, 0, darkMetalMat);
      [[-0.18, -0.10], [0.18, -0.10], [-0.18, 0.10], [0.18, 0.10]].forEach(([bx, bz]) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 10, 24), handleThreeMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(ax + bx, 0.92, az + bz);
        threeScene.add(ring);
      });
    } else if (app.type === 'hood') {
      addMeshBox(ax, ay, az, aw, 0.08, ad, 0, darkMetalMat);
      addMeshBox(ax, ay + 0.08, az - 0.08, aw * 0.42, H - (ay + 0.08), ad * 0.52, 0, steelMat);
    }
  }

  // Coffee Bar Station (Wood Slats, Base Cabinet with Toe-kick & Handles, Shelves, LED, Espresso Machine & Mugs)
  for (const cb of KS.coffeeBars || []) {
    const [cx, cy, cz] = cb.position;
    const { width: cw, depth: cd } = cb.size;
    addMeshBox(cx, 0, cz - 0.02, cw - 0.02, 0.10, cd - 0.06, 0, darkMetalMat);
    addMeshBox(cx, 0.10, cz, cw - 0.01, 0.76, cd, 0, lowerCabMat);
    addMeshBox(cx - 0.04, 0.66, cz + cd / 2 + 0.014, 0.014, 0.15, 0.022, 0, handleThreeMat);
    addMeshBox(cx + 0.04, 0.66, cz + cd / 2 + 0.014, 0.014, 0.15, 0.022, 0, handleThreeMat);
    addMeshBox(cx, 0.86, cz, cw, 0.04, cd + 0.02, 0, ctThreeMat);
    // Vertical Oak Wood Slats Backdrop
    const slats = 14;
    for (let s = 0; s < slats; s++) {
      const sx = cx - cw / 2 + 0.03 + (s * (cw - 0.06)) / (slats - 1);
      addMeshBox(sx, 0.90, 0.025, 0.024, 1.38, 0.025, 0, woodOakMat);
    }
    // 2 Floating Shelves + Espresso Machine + Ceramic Mugs
    addMeshBox(cx, 1.48, 0.13, cw - 0.06, 0.03, 0.22, 0, woodOakMat);
    addMeshBox(cx, 1.84, 0.13, cw - 0.06, 0.03, 0.22, 0, woodOakMat);
    addMeshBox(cx - 0.14, 0.90, cz, 0.24, 0.30, 0.26, 0, darkMetalMat);
    addMeshBox(cx + 0.14, 0.90, cz, 0.07, 0.08, 0.07, 0, ceilMat);
    addMeshBox(cx + 0.23, 0.90, cz, 0.07, 0.08, 0.07, 0, ceilMat);
    const cbLight = new THREE.PointLight(0xffcf82, 0.7, 2.0, 2);
    cbLight.position.set(cx, 1.44, 0.18);
    threeScene.add(cbLight);
  }

  // Foreground Kitchen Island + Waterfall Quartz + Barstools
  for (const isl of KS.islands || []) {
    const [ix, iy, iz] = isl.position;
    const { width: iw, height: ih, depth: id } = isl.size;
    addMeshBox(ix, 0, iz, iw - 0.05, ih - 0.04, id - 0.04, 0, lowerCabMat);
    addMeshBox(ix, ih - 0.04, iz, iw, 0.04, id, 0, ctThreeMat);
    addMeshBox(ix - iw / 2 + 0.02, 0, iz, 0.04, ih - 0.04, id, 0, ctThreeMat);
    addMeshBox(ix + iw / 2 - 0.02, 0, iz, 0.04, ih - 0.04, id, 0, ctThreeMat);
    [-0.36, 0.36].forEach((bx) => {
      addMeshBox(ix + bx, 0.62, iz + id / 2 + 0.20, 0.34, 0.05, 0.28, 0, woodOakMat);
      addMeshBox(ix + bx - 0.12, 0, iz + id / 2 + 0.20, 0.024, 0.62, 0.024, 0, darkMetalMat);
      addMeshBox(ix + bx + 0.12, 0, iz + id / 2 + 0.20, 0.024, 0.62, 0.024, 0, darkMetalMat);
    });
  }

  // Render every camera strictly from this SAME shared 3D geometry
  const renders = [];
  for (const camSpec of KS.cameras || []) {
    const camera = new THREE.PerspectiveCamera(camSpec.fov || 48, width / height, 0.1, 40);
    camera.position.set(camSpec.position[0], camSpec.position[1], camSpec.position[2]);
    camera.lookAt(camSpec.target[0], camSpec.target[1], camSpec.target[2]);
    renderer.render(threeScene, camera);

    const dataUrl = renderer.domElement.toDataURL('image/png');
    renders.push({
      cameraId: camSpec.id,
      label: camSpec.label,
      dataUrl,
    });
  }

  await fetch(uploadEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, renders }),
  });
}

run().catch(async (err) => {
  await fetch(uploadEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error: err.message || String(err) }),
  });
});
</script>
</body>
</html>`;
}

/**
 * Renders a validated KitchenScene across all its defined cameras from ONE shared 3D geometry.
 * Returns { renders: [{ cameraId, label, filePath, url, byteLength }], sceneHash, engine }
 */
async function renderKitchenSceneMultiAngle(
  scene,
  { outputDir = path.join(config.UPLOADS_DIR, 'renders'), prefix = 'render', width = 960, height = 720 } = {}
) {
  const browser = findBrowserExecutable();
  if (!browser) {
    throw new Error('مرورگر Headless Chromium برای موتور رندر Three.js WebGL در این سیستم یافت نشد.');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const sceneHash = hashScene(scene);

  return new Promise((resolve, reject) => {
    let settled = false;
    let chromeProc = null;
    let server = null;

    const cleanup = () => {
      if (chromeProc && !chromeProc.killed) {
        try { chromeProc.kill('SIGKILL'); } catch {}
      }
      if (server) {
        try { server.close(); } catch {}
      }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new Error('زمان مجاز رندر سه‌بعدی به پایان رسید (Timeout 25s).'));
    }, 25000);

    server = http.createServer((req, res) => {
      if (req.url === '/three/three.module.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        return fs.createReadStream(path.join(config.ROOT_DIR, 'node_modules/three/build/three.module.js')).pipe(res);
      }
      if (req.url === '/three/three.core.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        return fs.createReadStream(path.join(config.ROOT_DIR, 'node_modules/three/build/three.core.js')).pipe(res);
      }
      if (req.url === '/render.html') {
        const addr = server.address();
        const html = buildRenderPageHtml(scene, {
          width,
          height,
          uploadEndpoint: `http://127.0.0.1:${addr.port}/upload-renders`,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (req.method === 'POST' && req.url === '/upload-renders') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          clearTimeout(timer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"received":true}');
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!payload.ok) {
              return fail(new Error(payload.error || 'خطای WebGL حین رندر صحنه سه‌بعدی.'));
            }
            const saved = [];
            for (const item of payload.renders || []) {
              const base64 = String(item.dataUrl || '').replace(/^data:image\/png;base64,/, '');
              const buf = Buffer.from(base64, 'base64');
              const filename = `${prefix}-${sceneHash}-${item.cameraId}.png`;
              const absPath = path.join(outputDir, filename);
              fs.writeFileSync(absPath, buf);
              saved.push({
                cameraId: item.cameraId,
                label: item.label,
                filename,
                filePath: absPath,
                url: absPath.startsWith(config.UPLOADS_DIR)
                  ? `/uploads/${path.relative(config.UPLOADS_DIR, absPath).replace(/\\/g, '/')}`
                  : `/renders/${filename}`,
                byteLength: buf.length,
              });
            }
            if (settled) return;
            settled = true;
            cleanup();
            resolve({
              renders: saved,
              sceneHash,
              engine: 'three_webgl_pbr_swiftshader',
              blenderWorkerReady: true,
            });
          } catch (err) {
            fail(err);
          }
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const args = [
        '--headless',
        '--disable-gpu',
        '--enable-webgl',
        '--use-angle=swiftshader-webgl',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1024,768',
        '--virtual-time-budget=8000',
        `http://127.0.0.1:${port}/render.html`,
      ];
      chromeProc = execFile(browser, args, { maxBuffer: 5 * 1024 * 1024 }, (err) => {
        if (err && !settled) {
          // Chrome normally gets killed right after POST arrives; ignore if settled
        }
      });
    });
  });
}

module.exports = {
  renderKitchenSceneMultiAngle,
  findBrowserExecutable,
};
