document.addEventListener('DOMContentLoaded', () => {
  const {
    initBeforeAfterSliders,
    toPersianDigits,
    apiFetch,
    showToast,
    escapeHtml,
  } = window.NoKabin;

  // 1. Initialize Hero Before/After Slider (LTR synced with mouse movement)
  initBeforeAfterSliders(document);

  // 2. Referral Link Detection (?ref=09...) & Top Banner
  const params = new URLSearchParams(window.location.search);
  const urlRef = params.get('ref');
  if (urlRef) {
    localStorage.setItem('nokabin_ref', urlRef.trim());
  }
  const savedRef = (urlRef || localStorage.getItem('nokabin_ref') || '').trim();
  const agentBanner = document.getElementById('agentBanner');
  const agentCodeDisplay = document.getElementById('agentCodeDisplay');
  const referrerInput = document.getElementById('inspReferrerPhone');

  if (savedRef) {
    if (agentBanner && agentCodeDisplay) {
      agentCodeDisplay.textContent = savedRef;
      agentBanner.style.display = 'block';
    }
    if (referrerInput) {
      referrerInput.value = savedRef;
    }
  }

  // 3. Interactive Sample Kitchen Visual Catalog (Canvas Compositor on Iranian Kitchen)
  const catalogPreviewCanvas = document.getElementById('catalogPreviewCanvas');
  const catalogCtx = catalogPreviewCanvas ? catalogPreviewCanvas.getContext('2d') : null;
  const catalogPreviewBadge = document.getElementById('catalogPreviewBadge');
  const catalogPreviewTitle = document.getElementById('catalogPreviewTitle');
  const catalogPreviewDesc = document.getElementById('catalogPreviewDesc');
  const catalogFinishTag = document.getElementById('catalogFinishTag');
  const catalogResetBeforeBtn = document.getElementById('catalogResetBeforeBtn');
  const catalogUpperMatchDot = document.getElementById('catalogUpperMatchDot');
  const applyStudioToFormBtn = document.getElementById('applyStudioToFormBtn');
  const inspNotes = document.getElementById('inspNotes');

  const BASE_BEFORE_IMAGE = '/uploads/sample-kitchen/base/iranian_kitchen_before.jpg';
  const OVERLAY_URLS = {
    light_marble: '/uploads/sample-kitchen/countertops/overlay_light_marble.png',
    dark_marble: '/uploads/sample-kitchen/countertops/overlay_dark_marble.png',
    handle_black: '/uploads/sample-kitchen/handles/overlay_black.png',
    handle_gold: '/uploads/sample-kitchen/handles/overlay_gold.png',
    subway_white: '/uploads/sample-kitchen/backsplash/overlay_subway_white.png',
    panel_base: '/uploads/sample-kitchen/textures/cabinet_panel_base.jpg',
    marble_light_tex: '/uploads/sample-kitchen/textures/marble_light_tex.jpg',
    marble_dark_tex: '/uploads/sample-kitchen/textures/marble_dark_tex.jpg',
  };

  const catalogState = {
    isBeforeMode: true,
    lowerId: 'before',
    lowerTitle: 'ملامینه فابریک',
    lowerHex: '#c8b396',
    lowerImageUrl: BASE_BEFORE_IMAGE,
    upperId: 'match',
    upperTitle: 'هم‌رنگ کابینت زمینی',
    upperImageUrl: '',
    cncId: 'none',
    cncTitle: 'ساده (بدون ابزار)',
    handleId: 'silver',
    handleTitle: 'دستگیره میله‌ای نقره‌ای',
    countertopId: 'standard',
    countertopTitle: 'صفحه فابریک',
    backsplashId: 'standard',
    backsplashTitle: 'سرامیک فابریک',
    finishId: 'matte',
    finishLabel: 'مات',
    extras: new Set(),
  };

  const imageCache = new Map();
  function loadCatalogImage(url) {
    if (!url) return null;
    if (imageCache.has(url)) return imageCache.get(url);
    const img = new Image();
    img.onload = () => renderCatalogPreview();
    img.src = url;
    imageCache.set(url, img);
    return img;
  }

  // Preload base, overlays, textures, and all chip images
  loadCatalogImage(BASE_BEFORE_IMAGE);
  Object.values(OVERLAY_URLS).forEach((url) => loadCatalogImage(url));
  document.querySelectorAll('#catalogOptionsPanel [data-img]').forEach((el) => {
    if (el.dataset.img) loadCatalogImage(el.dataset.img);
  });

  function drawCncDoorGrooves(ctx, x, y, w, h, pattern) {
    if (pattern === 'none' || w < 26 || h < 26) return;
    const shadow = 'rgba(18, 16, 14, 0.28)';
    const highlight = 'rgba(255, 255, 255, 0.26)';

    function strokeBevelRect(rx, ry, rw, rh, radius = 0) {
      ctx.save();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = shadow;
      ctx.beginPath();
      if (radius > 0 && ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, radius);
      else ctx.rect(rx, ry, rw, rh);
      ctx.stroke();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = highlight;
      ctx.beginPath();
      if (radius > 0 && ctx.roundRect) ctx.roundRect(rx + 1.5, ry + 1.5, rw - 1.5, rh - 1.5, radius);
      else ctx.rect(rx + 1.5, ry + 1.5, rw - 1.5, rh - 1.5);
      ctx.stroke();
      ctx.restore();
    }

    if (pattern === 'shaker') {
      const p = Math.min(12, Math.floor(Math.min(w, h) * 0.14));
      strokeBevelRect(x + p, y + p, w - p * 2, h - p * 2, 1);
    } else if (pattern === 'beveled') {
      const p1 = Math.min(10, Math.floor(Math.min(w, h) * 0.12));
      const p2 = p1 + 7;
      strokeBevelRect(x + p1, y + p1, w - p1 * 2, h - p1 * 2, 1);
      if (w > p2 * 2 + 12 && h > p2 * 2 + 12) {
        strokeBevelRect(x + p2, y + p2, w - p2 * 2, h - p2 * 2, 1);
      }
    } else if (pattern === 'fluted') {
      const p = 9;
      strokeBevelRect(x + p, y + p, w - p * 2, h - p * 2, 1);
      ctx.save();
      for (let gx = x + p + 8; gx < x + w - p - 4; gx += 9) {
        ctx.strokeStyle = 'rgba(18, 16, 14, 0.20)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(gx, y + p + 3);
        ctx.lineTo(gx, y + h - p - 3);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
        ctx.beginPath();
        ctx.moveTo(gx + 1.4, y + p + 3);
        ctx.lineTo(gx + 1.4, y + h - p - 3);
        ctx.stroke();
      }
      ctx.restore();
    } else if (pattern === 'arch') {
      const p = Math.min(11, Math.floor(Math.min(w, h) * 0.13));
      const ix = x + p;
      const iy = y + p;
      const iw = w - p * 2;
      const ih = h - p * 2;
      const archDrop = Math.min(26, Math.floor(iw * 0.34), Math.floor(ih * 0.35));

      ctx.save();
      const traceArch = (ox, oy) => {
        ctx.beginPath();
        ctx.moveTo(ix + ox, iy + ih + oy);
        ctx.lineTo(ix + ox, iy + archDrop + oy);
        ctx.quadraticCurveTo(ix + iw / 2 + ox, iy - archDrop * 0.35 + oy, ix + iw + ox, iy + archDrop + oy);
        ctx.lineTo(ix + iw + ox, iy + ih + oy);
        ctx.closePath();
      };
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = shadow;
      traceArch(0, 0);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = highlight;
      traceArch(1.4, 1.4);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Photorealistic cabinet face using actual kitchen cabinet texture + luminance-preserving color tint + 3D shading
  function drawPhotorealCabinetBox(ctx, x, y, w, h, hexColor, doorCount, cncPattern, finishId, handleId) {
    ctx.save();
    // Base color fill
    ctx.fillStyle = hexColor || '#c8b396';
    ctx.fillRect(x, y, w, h);

    // Overlay real photographic cabinet surface grain/lighting
    const panelTex = loadCatalogImage(OVERLAY_URLS.panel_base);
    if (panelTex && panelTex.complete && panelTex.naturalWidth > 0) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.72;
      ctx.drawImage(panelTex, x, y, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Natural directional studio lighting gradient (left window light -> right warm shadow)
    const dirShade = ctx.createLinearGradient(x, y, x + w, y + h);
    dirShade.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    dirShade.addColorStop(0.5, 'rgba(0, 0, 0, 0.02)');
    dirShade.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
    ctx.fillStyle = dirShade;
    ctx.fillRect(x, y, w, h);

    // Top shadow under countertop overhang
    const overhangShadow = ctx.createLinearGradient(0, y, 0, y + 18);
    overhangShadow.addColorStop(0, 'rgba(15, 12, 10, 0.45)');
    overhangShadow.addColorStop(1, 'rgba(15, 12, 10, 0)');
    ctx.fillStyle = overhangShadow;
    ctx.fillRect(x, y, w, 18);

    // Recessed toe-kick plinth at bottom
    const kickH = Math.max(14, Math.floor(h * 0.1));
    ctx.fillStyle = 'rgba(18, 16, 14, 0.72)';
    ctx.fillRect(x + 4, y + h - kickH, w - 8, kickH);

    // Individual realistic cabinet doors + CNC + handles
    const doorsH = h - kickH - 4;
    const gap = 3;
    const doorW = (w - gap * (doorCount + 1)) / doorCount;
    const handleCol = handleId === 'black' ? '#222427' : handleId === 'gold' ? '#c9a156' : '#cfd4da';

    for (let i = 0; i < doorCount; i++) {
      const dx = x + gap + i * (doorW + gap);
      const dy = y + 3;
      // Door shadow seam
      ctx.strokeStyle = 'rgba(15, 12, 10, 0.38)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(dx, dy, doorW, doorsH);
      // Subtle highlight edge on left/top of door
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx + 1, dy + doorsH - 1);
      ctx.lineTo(dx + 1, dy + 1);
      ctx.lineTo(dx + doorW - 1, dy + 1);
      ctx.stroke();

      // CNC pattern on each door
      drawCncDoorGrooves(ctx, dx, dy, doorW, doorsH, cncPattern);

      // Minimalist bar handle
      const hx = i % 2 === 0 ? dx + doorW - 12 : dx + 9;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(hx + 1.5, dy + 14, 3, 28);
      ctx.fillStyle = handleCol;
      ctx.fillRect(hx, dy + 13, 3, 28);
    }

    if (finishId === 'glossy') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.42, y);
      ctx.lineTo(x + w * 0.18, y + doorsH);
      ctx.lineTo(x, y + doorsH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPhotorealCountertopSlab(ctx, x, y, w, h, countertopId) {
    ctx.save();
    if (countertopId === 'light_marble') {
      const tex = loadCatalogImage(OVERLAY_URLS.marble_light_tex);
      if (tex && tex.complete && tex.naturalWidth > 0) {
        ctx.drawImage(tex, 80, 180, w, h * 1.4, x, y, w, h);
      } else {
        ctx.fillStyle = '#f2efe9';
        ctx.fillRect(x, y, w, h);
      }
    } else if (countertopId === 'dark_marble') {
      const tex = loadCatalogImage(OVERLAY_URLS.marble_dark_tex);
      if (tex && tex.complete && tex.naturalWidth > 0) {
        ctx.drawImage(tex, 80, 180, w, h * 1.4, x, y, w, h);
      } else {
        ctx.fillStyle = '#1e2024';
        ctx.fillRect(x, y, w, h);
      }
    } else {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#c69e72');
      grad.addColorStop(0.5, '#b88f64');
      grad.addColorStop(1, '#9d754d');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    }

    // 3D top bevel highlight & front edge thickness
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(x, y, w, 2.5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fillRect(x, y + h - 5, w, 5);
    ctx.restore();
  }

  function drawCoffeeBarRight(ctx, state) {
    ctx.save();
    // Ambient shadow on left wall & floor
    const wallShadow = ctx.createLinearGradient(914, 150, 944, 150);
    wallShadow.addColorStop(0, 'rgba(15, 12, 10, 0)');
    wallShadow.addColorStop(1, 'rgba(15, 12, 10, 0.32)');
    ctx.fillStyle = wallShadow;
    ctx.fillRect(914, 150, 30, 610);

    const floorShadow = ctx.createRadialGradient(1065, 764, 30, 1065, 764, 150);
    floorShadow.addColorStop(0, 'rgba(15, 12, 10, 0.42)');
    floorShadow.addColorStop(1, 'rgba(15, 12, 10, 0)');
    ctx.fillStyle = floorShadow;
    ctx.fillRect(910, 740, 290, 48);

    // Tall natural walnut/oak slatted backdrop
    const woodGrad = ctx.createLinearGradient(942, 155, 1194, 495);
    woodGrad.addColorStop(0, '#8b633f');
    woodGrad.addColorStop(0.5, '#785433');
    woodGrad.addColorStop(1, '#5a3c22');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(942, 155, 252, 340);

    for (let sx = 952; sx < 1192; sx += 13) {
      ctx.fillStyle = 'rgba(24, 14, 6, 0.44)';
      ctx.fillRect(sx, 157, 3, 336);
      ctx.fillStyle = 'rgba(255, 232, 200, 0.09)';
      ctx.fillRect(sx + 3, 157, 2, 336);
    }

    // Round Dome Pendant Light (نور گنبدی گرد) hanging above Coffee Bar
    const domeX = 1068;
    const domeY = 122;
    ctx.strokeStyle = '#1f2022';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(domeX, 0);
    ctx.lineTo(domeX, domeY - 24);
    ctx.stroke();

    const coneGlow = ctx.createRadialGradient(domeX, domeY + 10, 10, domeX, domeY + 150, 180);
    coneGlow.addColorStop(0, 'rgba(255, 232, 175, 0.65)');
    coneGlow.addColorStop(0.45, 'rgba(255, 214, 130, 0.24)');
    coneGlow.addColorStop(1, 'rgba(255, 214, 130, 0)');
    ctx.fillStyle = coneGlow;
    ctx.beginPath();
    ctx.moveTo(domeX - 28, domeY + 6);
    ctx.lineTo(domeX + 28, domeY + 6);
    ctx.lineTo(domeX + 125, 490);
    ctx.lineTo(domeX - 125, 490);
    ctx.closePath();
    ctx.fill();

    const domeGrad = ctx.createLinearGradient(domeX - 34, domeY - 26, domeX + 34, domeY + 6);
    domeGrad.addColorStop(0, '#3a3d42');
    domeGrad.addColorStop(0.6, '#1f2124');
    domeGrad.addColorStop(1, '#121315');
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.arc(domeX, domeY + 4, 34, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f5d28c';
    ctx.beginPath();
    ctx.ellipse(domeX, domeY + 4, 32, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff9e6';
    ctx.beginPath();
    ctx.arc(domeX, domeY + 5, 7, 0, Math.PI * 2);
    ctx.fill();

    // Two floating oak shelves with warm LED glow
    [232, 330].forEach((sy) => {
      ctx.fillStyle = '#5a3d24';
      ctx.fillRect(956, sy, 224, 11);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(956, sy, 224, 2);
      const glow = ctx.createLinearGradient(0, sy + 11, 0, sy + 52);
      glow.addColorStop(0, 'rgba(255, 218, 135, 0.44)');
      glow.addColorStop(1, 'rgba(255, 218, 135, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(956, sy + 11, 224, 41);
    });

    // Realistic shaded ceramic canisters & mugs
    [
      [974, 200, 20, 32, '#ebe5da'],
      [1000, 207, 17, 25, '#dcd3c4'],
      [1040, 300, 22, 30, '#2a2e33'],
      [1068, 305, 18, 25, '#c9ab86'],
    ].forEach(([jx, jy, jw, jh, jcol]) => {
      const jg = ctx.createLinearGradient(jx, jy, jx + jw, jy);
      jg.addColorStop(0, jcol);
      jg.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = jcol;
      ctx.fillRect(jx, jy, jw, jh);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(jx + jw * 0.6, jy, jw * 0.4, jh);
      ctx.fillStyle = '#705136';
      ctx.fillRect(jx - 1, jy - 3, jw + 2, 4);
    });

    // Metallic Espresso Machine with chrome group head & cup
    const espGrad = ctx.createLinearGradient(988, 414, 1070, 492);
    espGrad.addColorStop(0, '#555b63');
    espGrad.addColorStop(0.5, '#2b2f35');
    espGrad.addColorStop(1, '#191b1e');
    ctx.fillStyle = espGrad;
    ctx.fillRect(988, 414, 82, 78);
    ctx.fillStyle = '#cfd4da';
    ctx.fillRect(994, 424, 70, 12);
    ctx.fillStyle = '#181a1d';
    ctx.fillRect(998, 444, 62, 38);
    ctx.fillStyle = '#d4d8dd';
    ctx.fillRect(1022, 444, 14, 12);
    ctx.fillStyle = '#f5f1e8';
    ctx.fillRect(1023, 468, 12, 13);

    // Coffee Bar LOWER CABINETS grounded to floor (y=514..760) — dynamically matches main cabinet color, material texture, CNC & finish!
    drawPhotorealCabinetBox(
      ctx,
      942,
      514,
      250,
      246,
      state.lowerHex,
      2,
      state.cncId,
      state.finishId,
      state.handleId
    );

    // Countertop slab matching active countertop
    drawPhotorealCountertopSlab(ctx, 936, 492, 260, 24, state.countertopId);
    ctx.restore();
  }

  function drawKitchenIsland(ctx, state) {
    ctx.save();
    // Realistic floor contact shadow
    const floorShadow = ctx.createRadialGradient(600, 868, 70, 600, 868, 340);
    floorShadow.addColorStop(0, 'rgba(15, 12, 10, 0.48)');
    floorShadow.addColorStop(1, 'rgba(15, 12, 10, 0)');
    ctx.fillStyle = floorShadow;
    ctx.fillRect(260, 822, 680, 74);

    // Island cabinet body — photorealistic cabinet texture, active color, CNC & finish!
    drawPhotorealCabinetBox(
      ctx,
      348,
      652,
      504,
      198,
      state.lowerHex,
      4,
      state.cncId,
      state.finishId,
      state.handleId
    );

    // Countertop slab matching active countertop
    drawPhotorealCountertopSlab(ctx, 328, 622, 544, 32, state.countertopId);

    // Two modern curved bar stools with footrests & shadows
    [465, 735].forEach((cx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.beginPath();
      ctx.ellipse(cx, 872, 32, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#232528';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 18, 756);
      ctx.lineTo(cx - 24, 870);
      ctx.moveTo(cx + 18, 756);
      ctx.lineTo(cx + 24, 870);
      ctx.moveTo(cx - 21, 826);
      ctx.lineTo(cx + 21, 826);
      ctx.stroke();

      const seatGrad = ctx.createLinearGradient(cx - 32, 734, cx + 32, 758);
      seatGrad.addColorStop(0, '#a67f58');
      seatGrad.addColorStop(0.5, '#8c6642');
      seatGrad.addColorStop(1, '#694a2d');
      ctx.fillStyle = seatGrad;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(cx - 32, 738, 64, 20, [8, 8, 4, 4]);
        ctx.fill();
      } else {
        ctx.fillRect(cx - 32, 738, 64, 20);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(cx - 26, 740, 52, 2);
    });
    ctx.restore();
  }

  function renderCatalogPreview() {
    if (!catalogCtx || !catalogPreviewCanvas) return;
    const W = 1200;
    const H = 896;
    catalogCtx.clearRect(0, 0, W, H);

    if (catalogState.isBeforeMode) {
      const beforeImg = loadCatalogImage(BASE_BEFORE_IMAGE);
      if (beforeImg && beforeImg.complete && beforeImg.naturalWidth > 0) {
        catalogCtx.drawImage(beforeImg, 0, 0, W, H);
      }
      if (catalogPreviewBadge) {
        catalogPreviewBadge.textContent = 'آشپزخانه نمونه ایرانی — وضعیت اولیه (قبل از بازسازی)';
      }
      if (catalogPreviewTitle) {
        catalogPreviewTitle.textContent = 'وضعیت اولیه آشپزخانه (پیش از بازسازی)';
      }
      if (catalogPreviewDesc) {
        catalogPreviewDesc.textContent = 'کابینت ملامینه قدیمی — برای مشاهده تغییرات، گزینه‌های بازسازی را انتخاب کنید.';
      }
      if (catalogResetBeforeBtn) {
        catalogResetBeforeBtn.classList.add('active');
        catalogResetBeforeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span>بازگشت به حالت بازسازی‌شده</span>';
      }
      return;
    }

    const hasPullback = catalogState.extras.has('island') || catalogState.extras.has('coffeebar');

    if (hasPullback) {
      catalogCtx.fillStyle = '#ebe8e2';
      catalogCtx.fillRect(0, 0, W, 120);
      catalogCtx.fillStyle = '#dedbd4';
      catalogCtx.fillRect(0, 120, W, 580);
      const floorGrad = catalogCtx.createLinearGradient(0, 690, 0, H);
      floorGrad.addColorStop(0, '#cbbba7');
      floorGrad.addColorStop(1, '#b7a48e');
      catalogCtx.fillStyle = floorGrad;
      catalogCtx.fillRect(0, 690, W, H - 690);

      catalogCtx.save();
      const scale = 0.8;
      const offsetX = catalogState.extras.has('coffeebar') ? 22 : 120;
      const offsetY = 44;
      catalogCtx.translate(offsetX, offsetY);
      catalogCtx.scale(scale, scale);
    }

    // 1. Base / lower cabinet color
    const lowerImg = loadCatalogImage(catalogState.lowerImageUrl);
    if (lowerImg && lowerImg.complete && lowerImg.naturalWidth > 0) {
      catalogCtx.drawImage(lowerImg, 0, 0, W, H);
    } else {
      const fallbackBase = loadCatalogImage(BASE_BEFORE_IMAGE);
      if (fallbackBase && fallbackBase.complete) catalogCtx.drawImage(fallbackBase, 0, 0, W, H);
    }

    // 2. Separate upper cabinet color (two-tone)
    if (catalogState.upperId !== 'match' && catalogState.upperImageUrl) {
      const upperImg = loadCatalogImage(catalogState.upperImageUrl);
      if (upperImg && upperImg.complete && upperImg.naturalWidth > 0) {
        catalogCtx.save();
        catalogCtx.beginPath();
        catalogCtx.rect(0, 0, W, 414);
        catalogCtx.clip();
        catalogCtx.drawImage(upperImg, 0, 0, W, H);
        catalogCtx.restore();
      }
    }

    // 3. Backsplash ceramic tiles (before countertop & LED so lighting illuminates them)
    if (catalogState.backsplashId === 'subway_white') {
      const bsImg = loadCatalogImage(OVERLAY_URLS.subway_white);
      if (bsImg && bsImg.complete && bsImg.naturalWidth > 0) catalogCtx.drawImage(bsImg, 0, 0, W, H);
    }

    // 4. Countertop overlay (Light Marble / Dark Marble)
    if (catalogState.countertopId === 'light_marble') {
      const ctImg = loadCatalogImage(OVERLAY_URLS.light_marble);
      if (ctImg && ctImg.complete && ctImg.naturalWidth > 0) catalogCtx.drawImage(ctImg, 0, 0, W, H);
    } else if (catalogState.countertopId === 'dark_marble') {
      const ctImg = loadCatalogImage(OVERLAY_URLS.dark_marble);
      if (ctImg && ctImg.complete && ctImg.naturalWidth > 0) catalogCtx.drawImage(ctImg, 0, 0, W, H);
    }

    // 5. Handle overlay
    if (catalogState.handleId === 'black') {
      const hImg = loadCatalogImage(OVERLAY_URLS.handle_black);
      if (hImg && hImg.complete && hImg.naturalWidth > 0) catalogCtx.drawImage(hImg, 0, 0, W, H);
    } else if (catalogState.handleId === 'gold') {
      const hImg = loadCatalogImage(OVERLAY_URLS.handle_gold);
      if (hImg && hImg.complete && hImg.naturalWidth > 0) catalogCtx.drawImage(hImg, 0, 0, W, H);
    }

    // 6. CNC door pattern grooves
    if (catalogState.cncId !== 'none') {
      const doorBoxes = [
        [462, 227, 94, 175],
        [570, 227, 205, 87],
        [570, 316, 205, 86],
        [789, 227, 72, 175],
        [446, 562, 107, 180],
        [566, 562, 108, 180],
        [687, 562, 117, 180],
      ];
      doorBoxes.forEach(([dx, dy, dw, dh]) => drawCncDoorGrooves(catalogCtx, dx, dy, dw, dh, catalogState.cncId));
    }

    // 7. Hidden LED under-cabinet lighting (exact back-wall x=460..864 + right-wall upper cabinets)
    if (catalogState.extras.has('lighting')) {
      catalogCtx.save();
      // Back wall upper cabinets LED strip (starts strictly at x=460 so it doesn't stick out left!)
      catalogCtx.fillStyle = 'rgba(255, 228, 165, 0.94)';
      catalogCtx.fillRect(460, 403, 404, 3.5);
      const backGlow = catalogCtx.createLinearGradient(0, 405, 0, 535);
      backGlow.addColorStop(0, 'rgba(255, 214, 130, 0.44)');
      backGlow.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = backGlow;
      catalogCtx.fillRect(460, 405, 404, 130);

      // Right-wall upper cabinet section 1 (x=868..936)
      catalogCtx.strokeStyle = 'rgba(255, 228, 165, 0.92)';
      catalogCtx.lineWidth = 3.5;
      catalogCtx.beginPath();
      catalogCtx.moveTo(868, 404);
      catalogCtx.lineTo(936, 397);
      catalogCtx.stroke();
      const rightGlow1 = catalogCtx.createLinearGradient(0, 398, 0, 525);
      rightGlow1.addColorStop(0, 'rgba(255, 214, 130, 0.38)');
      rightGlow1.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = rightGlow1;
      catalogCtx.beginPath();
      catalogCtx.moveTo(868, 404);
      catalogCtx.lineTo(936, 397);
      catalogCtx.lineTo(936, 525);
      catalogCtx.lineTo(868, 530);
      catalogCtx.closePath();
      catalogCtx.fill();

      // Right-wall foreground upper cabinet section 2 (x=1054..1200, skipping range hood)
      catalogCtx.beginPath();
      catalogCtx.moveTo(1054, 385);
      catalogCtx.lineTo(1200, 395);
      catalogCtx.stroke();
      const rightGlow2 = catalogCtx.createLinearGradient(0, 386, 0, 530);
      rightGlow2.addColorStop(0, 'rgba(255, 214, 130, 0.40)');
      rightGlow2.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = rightGlow2;
      catalogCtx.beginPath();
      catalogCtx.moveTo(1054, 385);
      catalogCtx.lineTo(1200, 395);
      catalogCtx.lineTo(1200, 535);
      catalogCtx.lineTo(1054, 525);
      catalogCtx.closePath();
      catalogCtx.fill();
      catalogCtx.restore();
    }

    // 8. Glossy finish sheen
    if (catalogState.finishId === 'glossy') {
      catalogCtx.save();
      catalogCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      [
        [458, 220, 410, 188],
        [444, 558, 370, 192],
      ].forEach(([sx, sy, sw, sh]) => {
        catalogCtx.beginPath();
        catalogCtx.moveTo(sx, sy);
        catalogCtx.lineTo(sx + sw * 0.45, sy);
        catalogCtx.lineTo(sx + sw * 0.22, sy + sh);
        catalogCtx.lineTo(sx, sy + sh);
        catalogCtx.closePath();
        catalogCtx.fill();
      });
      catalogCtx.restore();
    }

    if (hasPullback) {
      catalogCtx.restore();
    }

    // 9. Right-side Coffee Bar & Foreground Island (photorealistic + dynamic color & CNC)
    if (catalogState.extras.has('coffeebar')) {
      drawCoffeeBarRight(catalogCtx, catalogState);
    }
    if (catalogState.extras.has('island')) {
      drawKitchenIsland(catalogCtx, catalogState);
    }

    const colorSummary =
      catalogState.upperId === 'match'
        ? catalogState.lowerTitle
        : `زمینی ${catalogState.lowerTitle} + هوایی ${catalogState.upperTitle}`;
    const extrasNames = [];
    if (catalogState.extras.has('island')) extrasNames.push('جزیره');
    if (catalogState.extras.has('coffeebar')) extrasNames.push('کافی‌بار');
    if (catalogState.extras.has('lighting')) extrasNames.push('نور مخفی');

    if (catalogPreviewBadge) {
      catalogPreviewBadge.textContent = `آشپزخانه نمونه ایرانی — ${colorSummary}`;
    }
    if (catalogPreviewTitle) {
      catalogPreviewTitle.textContent = `${colorSummary} — رنگ پلی‌اورتان`;
    }
    if (catalogPreviewDesc) {
      const parts = [
        catalogState.cncId !== 'none' ? `ابزار CNC: ${catalogState.cncTitle}` : null,
        catalogState.handleTitle,
        catalogState.countertopTitle,
        catalogState.backsplashId !== 'standard' ? catalogState.backsplashTitle : null,
        extrasNames.length ? extrasNames.join(' + ') : null,
      ].filter(Boolean);
      catalogPreviewDesc.textContent = parts.join(' | ');
    }
    if (catalogFinishTag) {
      catalogFinishTag.textContent = `براقیت: ${catalogState.finishLabel}`;
    }
    if (catalogResetBeforeBtn) {
      catalogResetBeforeBtn.classList.remove('active');
      catalogResetBeforeBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i><span>بازگشت به تصویر اولیه</span>';
    }
  }

  document.querySelectorAll('#catalogColorsList .catalog-color-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogColorsList .catalog-color-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');

      catalogState.isBeforeMode = false;
      catalogState.lowerId = chip.dataset.colorId || chip.dataset.id || 'cashmere_beige';
      catalogState.lowerTitle = chip.dataset.title || '';
      catalogState.lowerHex = chip.dataset.hex || '#d5c7b4';
      catalogState.lowerImageUrl = chip.dataset.img || BASE_BEFORE_IMAGE;

      catalogState.upperId = 'match';
      catalogState.upperTitle = 'هم‌رنگ کابینت زمینی';
      catalogState.upperImageUrl = '';
      document.querySelectorAll('#catalogUpperColorsList .upper-color-chip').forEach((u) => {
        u.classList.toggle('active', (u.dataset.upperId || u.dataset.id) === 'match');
      });
      if (catalogUpperMatchDot) {
        catalogUpperMatchDot.style.background = catalogState.lowerHex;
      }
      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogUpperColorsList .upper-color-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogUpperColorsList .upper-color-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.upperId = chip.dataset.upperId || chip.dataset.id || 'match';
      catalogState.upperTitle = chip.dataset.title || 'هم‌رنگ کابینت زمینی';
      catalogState.upperImageUrl = chip.dataset.img || '';
      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogCncList .cnc-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogCncList .cnc-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.cncId = chip.dataset.cncId || chip.dataset.cnc || 'none';
      catalogState.cncTitle = chip.dataset.title || 'ساده (بدون ابزار)';
      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogHandlesList .handle-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogHandlesList .handle-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.handleId = chip.dataset.handleId || chip.dataset.handle || 'silver';
      catalogState.handleTitle = chip.dataset.title || '';
      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogCountertopsList .countertop-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogCountertopsList .countertop-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.countertopId = chip.dataset.countertopId || chip.dataset.countertop || 'standard';
      catalogState.countertopTitle = chip.dataset.title || '';
      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogBacksplashList .backsplash-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogBacksplashList .backsplash-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.backsplashId = chip.dataset.backsplashId || 'standard';
      catalogState.backsplashTitle = chip.dataset.title || '';
      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogFinishesList .finish-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogFinishesList .finish-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.finishId = chip.dataset.finishId || 'matte';
      catalogState.finishLabel = chip.dataset.finishLabel || 'مات';
      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogExtrasList .extra-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const extraId = chip.dataset.extraId || chip.dataset.extra;
      if (!extraId) return;
      catalogState.isBeforeMode = false;
      if (catalogState.extras.has(extraId)) {
        catalogState.extras.delete(extraId);
        chip.classList.remove('active');
      } else {
        catalogState.extras.add(extraId);
        chip.classList.add('active');
      }
      renderCatalogPreview();
    });
  });

  if (catalogResetBeforeBtn) {
    catalogResetBeforeBtn.addEventListener('click', () => {
      catalogState.isBeforeMode = !catalogState.isBeforeMode;
      renderCatalogPreview();
    });
  }

  renderCatalogPreview();

  if (applyStudioToFormBtn) {
    applyStudioToFormBtn.addEventListener('click', () => {
      if (inspNotes) {
        const colorText =
          catalogState.upperId === 'match'
            ? catalogState.lowerTitle
            : `زمینی ${catalogState.lowerTitle} و هوایی ${catalogState.upperTitle}`;
        const extrasList = [];
        if (catalogState.extras.has('island')) extrasList.push('ساخت جزیره');
        if (catalogState.extras.has('coffeebar')) extrasList.push('ساخت کافی‌بار');
        if (catalogState.extras.has('lighting')) extrasList.push('نور مخفی');
        const extrasText = extrasList.length ? ` | امکانات: ${extrasList.join('، ')}` : '';
        inspNotes.value = `انتخاب از کاتالوگ نوکابین: رنگ ${colorText} | ابزار CNC: ${catalogState.cncTitle} | ${catalogState.handleTitle} | ${catalogState.countertopTitle} | ${catalogState.backsplashTitle} | براقیت: ${catalogState.finishLabel}${extrasText}`;
      }
      const inspectionSection = document.getElementById('inspection');
      if (inspectionSection) {
        inspectionSection.scrollIntoView({ behavior: 'smooth' });
      }
      showToast('ترکیب انتخابی شما به فرم درخواست بازدید رایگان منتقل شد.', 'success');
    });
  }

  // 4. Online Cost Estimator (1/10 ratio: 10m -> 70M vs 700M)
  const kitchenSizeSlider = document.getElementById('kitchenSizeSlider');
  const sizeValueDisplay = document.getElementById('sizeValueDisplay');
  const replaceCostDisplay = document.getElementById('replaceCostDisplay');
  const renovateCostDisplay = document.getElementById('renovateCostDisplay');
  const savingsDisplay = document.getElementById('savingsDisplay');
  const conditionCards = document.querySelectorAll('#conditionCards .cond-card');
  const lockEstimateBtn = document.getElementById('lockEstimateBtn');

  let currentCondMultiplier = 1;
  let currentCondLabel = 'MDF یا چوب سالم';

  function updateEstimator() {
    if (!kitchenSizeSlider) return;
    const meters = Number(kitchenSizeSlider.value) || 10;
    const baseRenoMillions = Math.round(meters * 7 * currentCondMultiplier);
    const replaceMillions = baseRenoMillions * 10; // Strict 1/10 ratio
    const savedMillions = replaceMillions - baseRenoMillions;

    if (sizeValueDisplay) sizeValueDisplay.textContent = toPersianDigits(meters);
    if (renovateCostDisplay) renovateCostDisplay.textContent = `${toPersianDigits(baseRenoMillions)} میلیون تومان`;
    if (replaceCostDisplay) replaceCostDisplay.textContent = `${toPersianDigits(replaceMillions)} میلیون تومان`;
    if (savingsDisplay) savingsDisplay.textContent = `${toPersianDigits(savedMillions)} میلیون تومان`;
  }

  if (kitchenSizeSlider) {
    kitchenSizeSlider.addEventListener('input', updateEstimator);
    updateEstimator();
  }

  conditionCards.forEach((card) => {
    card.addEventListener('click', () => {
      conditionCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      currentCondMultiplier = Number(card.dataset.mult) || 1;
      currentCondLabel = card.dataset.label || 'MDF یا چوب سالم';
      updateEstimator();
    });
  });

  if (lockEstimateBtn) {
    lockEstimateBtn.addEventListener('click', () => {
      const meters = kitchenSizeSlider ? kitchenSizeSlider.value : 10;
      const inspMeters = document.getElementById('inspMeters');
      if (inspMeters) inspMeters.value = meters;
      if (inspNotes) {
        const estNote = `برآورد آنلاین: متراژ ${toPersianDigits(meters)} متر (${currentCondLabel}) — برآورد نوکابین: ${renovateCostDisplay ? renovateCostDisplay.textContent : ''}`;
        inspNotes.value = inspNotes.value ? `${inspNotes.value}\n${estNote}` : estNote;
      }
      const inspectionSection = document.getElementById('inspection');
      if (inspectionSection) {
        inspectionSection.scrollIntoView({ behavior: 'smooth' });
      }
      showToast('متراژ و برآورد شما به فرم درخواست بازدید منتقل شد.', 'success');
    });
  }

  // 5. Inspection Form Photo Upload (Strictly Max 3 Photos)
  const inspPhotosInput = document.getElementById('inspPhotos');
  const inspPhotoPreview = document.getElementById('inspPhotoPreview');
  let selectedInspectionFiles = [];

  function syncStudioFilesToInspectionForm() {
    const studioFiles = getUploadedStudioFiles();
    if (studioFiles.length > 0) {
      selectedInspectionFiles = studioFiles.slice(0, 3);
      renderInspectionPreviews();
    }
  }

  function renderInspectionPreviews() {
    if (!inspPhotoPreview) return;
    inspPhotoPreview.innerHTML = '';
    selectedInspectionFiles.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      const img = document.createElement('img');
      img.alt = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'preview-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        selectedInspectionFiles.splice(idx, 1);
        renderInspectionPreviews();
      });

      item.appendChild(img);
      item.appendChild(removeBtn);
      inspPhotoPreview.appendChild(item);
    });
  }

  if (inspPhotosInput) {
    inspPhotosInput.addEventListener('change', (e) => {
      const incoming = Array.from(e.target.files || []);
      for (const f of incoming) {
        if (selectedInspectionFiles.length >= 3) {
          showToast('حداکثر ۳ عکس از آشپزخانه می‌توانید انتخاب کنید.', 'error');
          break;
        }
        selectedInspectionFiles.push(f);
      }
      inspPhotosInput.value = '';
      renderInspectionPreviews();
    });
  }

  // 6. Submit Free Inspection Form
  const inspectionForm = document.getElementById('inspectionForm');
  const inspectionSuccessBox = document.getElementById('inspectionSuccessBox');
  const inspSubmitBtn = document.getElementById('inspSubmitBtn');

  if (inspectionForm) {
    inspectionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (inspectionSuccessBox) inspectionSuccessBox.style.display = 'none';
      if (inspSubmitBtn) {
        inspSubmitBtn.disabled = true;
        inspSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> در حال ثبت درخواست...';
      }

      try {
        const fd = new FormData();
        fd.append('fullName', document.getElementById('inspFullName').value);
        fd.append('phone', document.getElementById('inspPhone').value);
        fd.append('district', document.getElementById('inspDistrict').value);
        fd.append('cabinetType', document.getElementById('inspCabinetType').value);
        fd.append('estimatedMeters', document.getElementById('inspMeters').value);
        fd.append('referrerPhone', document.getElementById('inspReferrerPhone').value);

        const notesVal = document.getElementById('inspNotes').value || getSelectedStudioSummaryText();
        fd.append('notes', notesVal);

        selectedInspectionFiles.slice(0, 3).forEach((f) => fd.append('photos', f));

        const data = await apiFetch('/api/inspections', {
          method: 'POST',
          body: fd,
        });

        showToast(data.message, 'success');
        if (inspectionSuccessBox) {
          inspectionSuccessBox.style.display = 'block';
          inspectionSuccessBox.innerHTML = `
            <div><strong>${escapeHtml(data.message)}</strong></div>
            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px;">
              <a href="/panel.html?role=customer" class="btn btn-outline btn-sm">مشاهده وضعیت در پنل مشتری</a>
              <a href="https://wa.me/989225603574" target="_blank" rel="noopener" class="btn btn-whatsapp btn-sm">پیگیری در واتس‌اپ</a>
            </div>
          `;
        }
        inspectionForm.reset();
        if (savedRef && referrerInput) referrerInput.value = savedRef;
        selectedInspectionFiles = [];
        renderInspectionPreviews();
      } catch (err) {
        showToast(err.message, 'error');
        if (inspectionSuccessBox) {
          inspectionSuccessBox.style.display = 'block';
          inspectionSuccessBox.innerHTML = `<span style="color: var(--accent-danger);">${escapeHtml(err.message)}</span>`;
        }
      } finally {
        if (inspSubmitBtn) {
          inspSubmitBtn.disabled = false;
          inspSubmitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ثبت درخواست بازدید رایگان (تحویل ۱۵ روزه)';
        }
      }
    });
  }

  // 7. Submit Real Estate Agent Form
  const agentApplyForm = document.getElementById('agentApplyForm');
  const agentApplyResult = document.getElementById('agentApplyResult');
  const agentSubmitBtn = document.getElementById('agentSubmitBtn');

  if (agentApplyForm) {
    agentApplyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (agentApplyResult) agentApplyResult.style.display = 'none';
      if (agentSubmitBtn) {
        agentSubmitBtn.disabled = true;
        agentSubmitBtn.textContent = 'در حال ثبت اطلاعات...';
      }

      try {
        const fd = new FormData(agentApplyForm);
        const payload = Object.fromEntries(fd.entries());
        const data = await apiFetch('/api/agents/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const refUrl = `${window.location.origin}/?ref=${encodeURIComponent(data.referralPhone)}`;
        showToast(data.message, 'success');
        if (agentApplyResult) {
          agentApplyResult.style.display = 'block';
          agentApplyResult.innerHTML = `
            <div><strong>${escapeHtml(data.message)}</strong></div>
            <div style="margin-top: 8px; font-size: 0.85rem;">لینک دعوت اختصاصی شما (با ۲ میلیون تومان تخفیف برای مشتری):</div>
            <div class="ltr" style="background: #fff; padding: 8px 10px; border-radius: 8px; margin: 6px 0; word-break: break-all; border: 1px solid var(--border-medium); font-weight: 700;">
              ${escapeHtml(refUrl)}
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
              <button type="button" class="btn btn-outline btn-sm" id="copyAgentRefBtn">کپی لینک دعوت</button>
              <a href="/panel.html?role=agent" class="btn btn-primary btn-sm">ورود به پنل مشاورین املاک</a>
            </div>
          `;
          const copyBtn = document.getElementById('copyAgentRefBtn');
          if (copyBtn) {
            copyBtn.addEventListener('click', () => {
              navigator.clipboard?.writeText(refUrl);
              showToast('لینک دعوت اختصاصی شما کپی شد!', 'success');
            });
          }
        }
        agentApplyForm.reset();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (agentSubmitBtn) {
          agentSubmitBtn.disabled = false;
          agentSubmitBtn.textContent = 'ثبت همکاری و دریافت لینک اختصاصی مشاور';
        }
      }
    });
  }

  // 8. FAQ Accordion Toggle
  document.querySelectorAll('#faqList .faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('active');
      document.querySelectorAll('#faqList .faq-item').forEach((el) => el.classList.remove('active'));
      if (!isOpen) item.classList.add('active');
    });
  });
});
