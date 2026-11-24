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

  // 3. Interactive Sample Kitchen Visual Catalog (100% Photorealistic Close-up + Wide AI-Composited Layers)
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
  const kitchenSizeSlider = document.getElementById('kitchenSizeSlider');
  const sizeValueDisplay = document.getElementById('sizeValueDisplay');
  const catalogTotalMeters = document.getElementById('catalogTotalMeters');
  const catalogTotalPriceValue = document.getElementById('catalogTotalPriceValue');
  const catalogPriceBreakdown = document.getElementById('catalogPriceBreakdown');

  const BASE_BEFORE_IMAGE = '/uploads/sample-kitchen/base/iranian_kitchen_before.jpg';
  const OVERLAY_URLS = {
    light_marble: '/uploads/sample-kitchen/countertops/overlay_light_marble.png',
    dark_marble: '/uploads/sample-kitchen/countertops/overlay_dark_marble.png',
    handle_black: '/uploads/sample-kitchen/handles/overlay_black.png',
    handle_gold: '/uploads/sample-kitchen/handles/overlay_gold.png',
    subway_white: '/uploads/sample-kitchen/backsplash/overlay_subway_white.png',
    wide_light_marble: '/uploads/sample-kitchen/wide/overlay_light_marble.png',
    wide_dark_marble: '/uploads/sample-kitchen/wide/overlay_dark_marble.png',
    wide_subway_white: '/uploads/sample-kitchen/wide/overlay_subway_white.png',
    wide_island_lm: '/uploads/sample-kitchen/wide/island/ct_light_marble.png',
    wide_island_dm: '/uploads/sample-kitchen/wide/island/ct_dark_marble.png',
  };

  // Exact crop offsets used when generating cropped photorealistic island & tall arched coffee bar cutouts
  const ISLAND_POS = { x: 90, y: 500 };
  const COFFEEBAR_POS = { x: 845, y: 105 };

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

  function getWideColorUrl(colorId) {
    return `/uploads/sample-kitchen/wide/colors/${colorId || 'before'}.jpg`;
  }
  function getWideIslandUrl(colorId) {
    return `/uploads/sample-kitchen/wide/island/${colorId || 'before'}.png`;
  }
  function getWideCoffeeBarUrl(colorId) {
    return `/uploads/sample-kitchen/wide/coffeebar/${colorId || 'before'}.png`;
  }

  // Preload core images immediately for zero-lag switching
  loadCatalogImage(BASE_BEFORE_IMAGE);
  Object.values(OVERLAY_URLS).forEach((url) => loadCatalogImage(url));
  document.querySelectorAll('#catalogOptionsPanel [data-img]').forEach((el) => {
    if (el.dataset.img) loadCatalogImage(el.dataset.img);
  });

  function drawCncDoorGrooves(ctx, x, y, w, h, pattern) {
    if (pattern === 'none' || w < 26 || h < 26) return;
    const shadow = 'rgba(18, 16, 14, 0.30)';
    const highlight = 'rgba(255, 255, 255, 0.28)';

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
      const p = Math.min(13, Math.floor(Math.min(w, h) * 0.14));
      strokeBevelRect(x + p, y + p, w - p * 2, h - p * 2, 1);
    } else if (pattern === 'beveled') {
      const p1 = Math.min(10, Math.floor(Math.min(w, h) * 0.12));
      const p2 = p1 + 7;
      strokeBevelRect(x + p1, y + p1, w - p1 * 2, h - p1 * 2, 1);
      if (w > p2 * 2 + 12 && h > p2 * 2 + 12) {
        strokeBevelRect(x + p2, y + p2, w - p2 * 2, h - p2 * 2, 1);
      }
    } else if (pattern === 'fluted') {
      const p = Math.min(10, Math.floor(Math.min(w, h) * 0.12));
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

  // Bilinear perspective CNC groove renderer for right-wall angled cabinets (tl, tr, br, bl = [x, y])
  function drawPerspectiveCncQuad(ctx, tl, tr, br, bl, pattern) {
    if (pattern === 'none') return;
    const pt = (u, v) => [
      (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + u * v * br[0] + (1 - u) * v * bl[0],
      (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + u * v * br[1] + (1 - u) * v * bl[1],
    ];
    const strokeQuad = (u0, v0, u1, v1) => {
      const p0 = pt(u0, v0), p1 = pt(u1, v0), p2 = pt(u1, v1), p3 = pt(u0, v1);
      ctx.save();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = 'rgba(18, 16, 14, 0.28)';
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
      ctx.stroke();

      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.beginPath();
      ctx.moveTo(p0[0] + 1.2, p0[1] + 1.2);
      ctx.lineTo(p1[0] + 1.2, p1[1] + 1.2);
      ctx.lineTo(p2[0] + 1.2, p2[1] + 1.2);
      ctx.lineTo(p3[0] + 1.2, p3[1] + 1.2);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };

    if (pattern === 'shaker') {
      strokeQuad(0.14, 0.10, 0.86, 0.90);
    } else if (pattern === 'beveled') {
      strokeQuad(0.11, 0.08, 0.89, 0.92);
      strokeQuad(0.20, 0.14, 0.80, 0.86);
    } else if (pattern === 'fluted') {
      strokeQuad(0.11, 0.08, 0.89, 0.92);
      ctx.save();
      for (let u = 0.20; u < 0.86; u += 0.11) {
        const a = pt(u, 0.10), b = pt(u, 0.90);
        ctx.strokeStyle = 'rgba(18, 16, 14, 0.20)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.moveTo(a[0] + 1.2, a[1]);
        ctx.lineTo(b[0] + 1.2, b[1]);
        ctx.stroke();
      }
      ctx.restore();
    } else if (pattern === 'arch') {
      const p0 = pt(0.14, 0.90), p1 = pt(0.14, 0.28), pMid = pt(0.50, 0.06), p2 = pt(0.86, 0.28), p3 = pt(0.86, 0.90);
      ctx.save();
      const trace = (ox, oy) => {
        ctx.beginPath();
        ctx.moveTo(p0[0] + ox, p0[1] + oy);
        ctx.lineTo(p1[0] + ox, p1[1] + oy);
        ctx.quadraticCurveTo(pMid[0] + ox, pMid[1] + oy, p2[0] + ox, p2[1] + oy);
        ctx.lineTo(p3[0] + ox, p3[1] + oy);
        ctx.closePath();
      };
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = 'rgba(18, 16, 14, 0.28)';
      trace(0, 0);
      ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      trace(1.2, 1.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMetallicBarHandle(ctx, x, y, w, h, handleId) {
    if (handleId === 'silver') return;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(x + 1.5, y + 1.5, w, h);
    if (handleId === 'black') {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, '#3a3d42');
      g.addColorStop(0.5, '#1b1d20');
      g.addColorStop(1, '#111214');
      ctx.fillStyle = g;
    } else {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#e3c47a');
      g.addColorStop(0.5, '#c2994c');
      g.addColorStop(1, '#99722c');
      ctx.fillStyle = g;
    }
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function renderWidePhotorealScene(W, H) {
    const colorId = catalogState.lowerId || 'before';
    const hasIsland = catalogState.extras.has('island');
    const hasCoffeeBar = catalogState.extras.has('coffeebar');

    // 1. Wide base kitchen painted in active lower cabinet color
    const baseImg = loadCatalogImage(getWideColorUrl(colorId));
    if (baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
      catalogCtx.drawImage(baseImg, 0, 0, W, H);
    }

    // 2. Separate upper cabinet color (clipped cleanly above countertop y <= 442)
    if (catalogState.upperId !== 'match') {
      const upperImg = loadCatalogImage(getWideColorUrl(catalogState.upperId));
      if (upperImg && upperImg.complete && upperImg.naturalWidth > 0) {
        catalogCtx.save();
        catalogCtx.beginPath();
        catalogCtx.rect(0, 0, W, 442);
        catalogCtx.clip();
        catalogCtx.drawImage(upperImg, 0, 0, W, H);
        catalogCtx.restore();
      }
    }

    // 3. Zero-bleed photorealistic white beveled subway backsplash
    if (catalogState.backsplashId === 'subway_white') {
      const bsImg = loadCatalogImage(OVERLAY_URLS.wide_subway_white);
      if (bsImg && bsImg.complete && bsImg.naturalWidth > 0) catalogCtx.drawImage(bsImg, 0, 0, W, H);
    }

    // 4. Zero-bleed photorealistic marble countertop on main L-kitchen
    if (catalogState.countertopId === 'light_marble') {
      const ctImg = loadCatalogImage(OVERLAY_URLS.wide_light_marble);
      if (ctImg && ctImg.complete && ctImg.naturalWidth > 0) catalogCtx.drawImage(ctImg, 0, 0, W, H);
    } else if (catalogState.countertopId === 'dark_marble') {
      const ctImg = loadCatalogImage(OVERLAY_URLS.wide_dark_marble);
      if (ctImg && ctImg.complete && ctImg.naturalWidth > 0) catalogCtx.drawImage(ctImg, 0, 0, W, H);
    }

    // 5. CNC door grooves on wide main kitchen doors (back wall + right-wall perspective doors)
    if (catalogState.cncId !== 'none') {
      const wideMainDoors = [
        [480, 264, 82, 135],
        [566, 264, 160, 66],
        [566, 333, 160, 66],
        [731, 264, 65, 135],
        [469, 524, 90, 142],
        [563, 524, 91, 142],
        [658, 524, 90, 142],
      ];
      wideMainDoors.forEach(([dx, dy, dw, dh]) => drawCncDoorGrooves(catalogCtx, dx, dy, dw, dh, catalogState.cncId));

      // Right-wall upper & lower perspective doors (strictly inside measured door edges)
      drawPerspectiveCncQuad(catalogCtx, [806, 255], [833, 229], [833, 400], [806, 403], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [760, 530], [802, 554], [802, 718], [760, 678], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [809, 556], [858, 583], [858, 756], [809, 720], catalogState.cncId);
      if (!hasCoffeeBar) {
        drawPerspectiveCncQuad(catalogCtx, [898, 174], [950, 132], [950, 392], [898, 398], catalogState.cncId);
        drawPerspectiveCncQuad(catalogCtx, [957, 130], [1030, 130], [1030, 386], [957, 391], catalogState.cncId);
        drawPerspectiveCncQuad(catalogCtx, [866, 588], [935, 625], [935, 680], [866, 641], catalogState.cncId);
        drawPerspectiveCncQuad(catalogCtx, [866, 646], [935, 685], [935, 744], [866, 703], catalogState.cncId);
        drawPerspectiveCncQuad(catalogCtx, [866, 708], [935, 749], [935, 811], [866, 766], catalogState.cncId);
      }
    }

    // 6. Main wide handles recolor (exact measured silver handle bounds)
    if (catalogState.handleId !== 'silver') {
      [
        [554, 353, 5, 42],
        [621, 320, 52, 4.5],
        [621, 390, 52, 4.5],
        [736, 353, 5, 42],
        [551, 529, 5, 46],
        [645, 529, 5, 46],
        [662, 529, 5, 46],
      ].forEach(([hx, hy, hw, hh]) => drawMetallicBarHandle(catalogCtx, hx, hy, hw, hh, catalogState.handleId));
    }

    // 7. Hidden LED under-cabinet lighting (strictly under back-wall + right-wall upper cabinets, zero overhang)
    if (catalogState.extras.has('lighting')) {
      catalogCtx.save();
      catalogCtx.fillStyle = 'rgba(255, 228, 165, 0.94)';
      catalogCtx.fillRect(479, 405, 318, 3);
      const backGlow = catalogCtx.createLinearGradient(0, 406, 0, 505);
      backGlow.addColorStop(0, 'rgba(255, 214, 130, 0.44)');
      backGlow.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = backGlow;
      catalogCtx.fillRect(479, 406, 318, 99);

      // Right-wall upper cabinet section 1 (805..835)
      catalogCtx.strokeStyle = 'rgba(255, 228, 165, 0.92)';
      catalogCtx.lineWidth = 3;
      catalogCtx.beginPath();
      catalogCtx.moveTo(805, 409);
      catalogCtx.lineTo(835, 405);
      catalogCtx.stroke();
      const rg1 = catalogCtx.createLinearGradient(0, 405, 0, 500);
      rg1.addColorStop(0, 'rgba(255, 214, 130, 0.36)');
      rg1.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = rg1;
      catalogCtx.beginPath();
      catalogCtx.moveTo(805, 409);
      catalogCtx.lineTo(835, 405);
      catalogCtx.lineTo(835, 500);
      catalogCtx.lineTo(805, 505);
      catalogCtx.closePath();
      catalogCtx.fill();

      // Right-wall upper cabinet section 2 (strictly 898..1033, zero overhang past x=1034!)
      if (!hasCoffeeBar) {
        catalogCtx.beginPath();
        catalogCtx.moveTo(898, 405);
        catalogCtx.lineTo(1033, 393);
        catalogCtx.stroke();
        const rg2 = catalogCtx.createLinearGradient(0, 393, 0, 505);
        rg2.addColorStop(0, 'rgba(255, 214, 130, 0.38)');
        rg2.addColorStop(1, 'rgba(255, 214, 130, 0)');
        catalogCtx.fillStyle = rg2;
        catalogCtx.beginPath();
        catalogCtx.moveTo(898, 405);
        catalogCtx.lineTo(1033, 393);
        catalogCtx.lineTo(1033, 505);
        catalogCtx.lineTo(898, 502);
        catalogCtx.closePath();
        catalogCtx.fill();
      }
      catalogCtx.restore();
    }

    // 8. Photorealistic Tall Arched Coffee Bar on Right Side (exact arched design + dynamic cabinet color + dynamic CNC!)
    if (hasCoffeeBar) {
      const cbImg = loadCatalogImage(getWideCoffeeBarUrl(colorId));
      if (cbImg && cbImg.complete && cbImg.naturalWidth > 0) {
        catalogCtx.drawImage(cbImg, COFFEEBAR_POS.x, COFFEEBAR_POS.y);
      }
      if (catalogState.cncId !== 'none') {
        [
          [943, 622, 95, 192],
          [1042, 622, 94, 192],
        ].forEach(([dx, dy, dw, dh]) => drawCncDoorGrooves(catalogCtx, dx, dy, dw, dh, catalogState.cncId));
      }
      if (catalogState.handleId !== 'silver') {
        drawMetallicBarHandle(catalogCtx, 1031, 634, 6, 66, catalogState.handleId);
        drawMetallicBarHandle(catalogCtx, 1051, 634, 6, 66, catalogState.handleId);
      }
    }

    // 9. Photorealistic Kitchen Island in Center-Left Foreground (dynamic cabinet color + real marble top + dynamic CNC!)
    if (hasIsland) {
      const islImg = loadCatalogImage(getWideIslandUrl(colorId));
      if (islImg && islImg.complete && islImg.naturalWidth > 0) {
        catalogCtx.drawImage(islImg, ISLAND_POS.x, ISLAND_POS.y);
      }
      if (catalogState.countertopId === 'light_marble') {
        const ict = loadCatalogImage(OVERLAY_URLS.wide_island_lm);
        if (ict && ict.complete && ict.naturalWidth > 0) catalogCtx.drawImage(ict, ISLAND_POS.x, ISLAND_POS.y);
      } else if (catalogState.countertopId === 'dark_marble') {
        const ict = loadCatalogImage(OVERLAY_URLS.wide_island_dm);
        if (ict && ict.complete && ict.naturalWidth > 0) catalogCtx.drawImage(ict, ISLAND_POS.x, ISLAND_POS.y);
      }
      if (catalogState.cncId !== 'none') {
        [
          [151, 599, 155, 219],
          [308, 599, 155, 219],
          [465, 599, 154, 219],
        ].forEach(([dx, dy, dw, dh]) => drawCncDoorGrooves(catalogCtx, dx, dy, dw, dh, catalogState.cncId));
      }
      if (catalogState.handleId !== 'silver') {
        drawMetallicBarHandle(catalogCtx, 287, 609, 6, 73, catalogState.handleId);
        drawMetallicBarHandle(catalogCtx, 445, 609, 6, 73, catalogState.handleId);
        drawMetallicBarHandle(catalogCtx, 472, 609, 6, 73, catalogState.handleId);
      }
    }

    // 10. Subtle Glossy finish architectural sheen
    if (catalogState.finishId === 'glossy') {
      catalogCtx.save();
      catalogCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      const sheenBoxes = [[478, 262, 320, 140]];
      if (hasIsland) sheenBoxes.push([148, 598, 472, 222]);
      if (hasCoffeeBar) sheenBoxes.push([940, 620, 200, 198]);
      sheenBoxes.forEach(([sx, sy, sw, sh]) => {
        catalogCtx.beginPath();
        catalogCtx.moveTo(sx, sy);
        catalogCtx.lineTo(sx + sw * 0.44, sy);
        catalogCtx.lineTo(sx + sw * 0.22, sy + sh);
        catalogCtx.lineTo(sx, sy + sh);
        catalogCtx.closePath();
        catalogCtx.fill();
      });
      catalogCtx.restore();
    }
  }

  function renderCloseupPhotorealScene(W, H) {
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

    // 3. Zero-bleed photorealistic white beveled subway backsplash
    if (catalogState.backsplashId === 'subway_white') {
      const bsImg = loadCatalogImage(OVERLAY_URLS.subway_white);
      if (bsImg && bsImg.complete && bsImg.naturalWidth > 0) catalogCtx.drawImage(bsImg, 0, 0, W, H);
    }

    // 4. Zero-bleed photorealistic marble countertop (Light Marble / Dark Marble)
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

    // 6. CNC door pattern grooves (back wall + right-wall perspective doors & drawers)
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

      // Right-wall upper doors (strictly inside measured door edges)
      drawPerspectiveCncQuad(catalogCtx, [875, 219], [914, 183], [914, 405], [875, 408], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [920, 181], [952, 152], [952, 402], [920, 405], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [1060, 62], [1136, 4], [1136, 392], [1060, 386], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [1143, 4], [1194, 4], [1194, 388], [1143, 392], catalogState.cncId);

      // Right-wall lower doors & 3 drawers
      drawPerspectiveCncQuad(catalogCtx, [818, 565], [853, 586], [853, 778], [818, 744], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [858, 588], [921, 624], [921, 833], [858, 780], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [929, 628], [1052, 698], [1052, 754], [929, 682], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [929, 686], [1052, 759], [1052, 821], [929, 745], catalogState.cncId);
      drawPerspectiveCncQuad(catalogCtx, [929, 749], [1052, 826], [1052, 884], [929, 808], catalogState.cncId);
    }

    // 7. Hidden LED under-cabinet lighting (strictly under back-wall + right-wall upper cabinets, zero overhang)
    if (catalogState.extras.has('lighting')) {
      catalogCtx.save();
      catalogCtx.fillStyle = 'rgba(255, 228, 165, 0.94)';
      catalogCtx.fillRect(460, 403, 404, 3.5);
      const backGlow = catalogCtx.createLinearGradient(0, 405, 0, 535);
      backGlow.addColorStop(0, 'rgba(255, 214, 130, 0.44)');
      backGlow.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = backGlow;
      catalogCtx.fillRect(460, 405, 404, 130);

      catalogCtx.strokeStyle = 'rgba(255, 228, 165, 0.92)';
      catalogCtx.lineWidth = 3.5;
      catalogCtx.beginPath();
      catalogCtx.moveTo(872, 414);
      catalogCtx.lineTo(954, 410);
      catalogCtx.stroke();
      const rightGlow1 = catalogCtx.createLinearGradient(0, 410, 0, 528);
      rightGlow1.addColorStop(0, 'rgba(255, 214, 130, 0.38)');
      rightGlow1.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = rightGlow1;
      catalogCtx.beginPath();
      catalogCtx.moveTo(872, 414);
      catalogCtx.lineTo(954, 410);
      catalogCtx.lineTo(954, 528);
      catalogCtx.lineTo(872, 532);
      catalogCtx.closePath();
      catalogCtx.fill();

      catalogCtx.beginPath();
      catalogCtx.moveTo(1060, 392);
      catalogCtx.lineTo(1195, 395);
      catalogCtx.stroke();
      const rightGlow2 = catalogCtx.createLinearGradient(0, 392, 0, 530);
      rightGlow2.addColorStop(0, 'rgba(255, 214, 130, 0.40)');
      rightGlow2.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = rightGlow2;
      catalogCtx.beginPath();
      catalogCtx.moveTo(1060, 392);
      catalogCtx.lineTo(1195, 395);
      catalogCtx.lineTo(1195, 530);
      catalogCtx.lineTo(1060, 526);
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
        catalogPreviewBadge.textContent = 'آشپزخانه نمونه — وضعیت اولیه (قبل از بازسازی)';
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
      if (typeof updateCatalogPricing === 'function') updateCatalogPricing();
      return;
    }

    const useWideScene = catalogState.extras.has('island') || catalogState.extras.has('coffeebar');
    if (useWideScene) {
      renderWidePhotorealScene(W, H);
    } else {
      renderCloseupPhotorealScene(W, H);
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
      catalogPreviewBadge.textContent = `آشپزخانه نمونه — ${colorSummary}`;
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
    if (typeof updateCatalogPricing === 'function') updateCatalogPricing();
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
      const meters = kitchenSizeSlider ? Number(kitchenSizeSlider.value) || 10 : 10;
      const inspMeters = document.getElementById('inspMeters');
      if (inspMeters) inspMeters.value = meters;
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
        const priceText = catalogTotalPriceValue ? ` | برآورد قیمت: ${catalogTotalPriceValue.textContent}` : '';
        inspNotes.value = `انتخاب از کاتالوگ نوکابین (${toPersianDigits(meters)} متر): رنگ ${colorText} | ابزار CNC: ${catalogState.cncTitle} | ${catalogState.handleTitle} | ${catalogState.countertopTitle} | ${catalogState.backsplashTitle} | براقیت: ${catalogState.finishLabel}${extrasText}${priceText}`;
      }
      const inspectionSection = document.getElementById('inspection');
      if (inspectionSection) {
        inspectionSection.scrollIntoView({ behavior: 'smooth' });
      }
      showToast('ترکیب و برآورد قیمت شما به فرم درخواست بازدید رایگان منتقل شد.', 'success');
    });
  }

  // 4. Integrated Catalog Meterage & Live Price Calculator
  function updateCatalogPricing() {
    const meters = kitchenSizeSlider ? Number(kitchenSizeSlider.value) || 10 : 10;
    if (sizeValueDisplay) sizeValueDisplay.textContent = toPersianDigits(meters);
    if (catalogTotalMeters) catalogTotalMeters.textContent = toPersianDigits(meters);

    let minTotal = 0;
    let maxTotal = 0;
    const items = [];

    if (!catalogState.isBeforeMode) {
      if (catalogState.lowerId !== 'before') {
        const paintCost = meters * 5;
        minTotal += paintCost;
        maxTotal += paintCost;
        items.push(`رنگ (${toPersianDigits(paintCost)}م)`);
      }
      if (catalogState.cncId !== 'none') {
        const cncCost = meters * 3;
        minTotal += cncCost;
        maxTotal += cncCost;
        items.push(`ابزار (${toPersianDigits(cncCost)}م)`);
      }
      if (catalogState.handleId !== 'silver') {
        minTotal += 6;
        maxTotal += 15;
        items.push('دستگیره (۶ تا ۱۵م)');
      }
      if (catalogState.countertopId !== 'standard') {
        minTotal += 20;
        maxTotal += 20;
        items.push('صفحه (۲۰م)');
      }
      if (catalogState.backsplashId !== 'standard') {
        minTotal += 15;
        maxTotal += 15;
        items.push('سرامیک (۱۵م)');
      }
      if (catalogState.extras.has('island')) {
        minTotal += 150;
        maxTotal += 150;
        items.push('جزیره (۱۵۰م)');
      }
      if (catalogState.extras.has('coffeebar')) {
        minTotal += 110;
        maxTotal += 110;
        items.push('کافی‌بار (۱۱۰م)');
      }
      if (catalogState.extras.has('lighting')) {
        minTotal += 10;
        maxTotal += 10;
        items.push('نور مخفی (۱۰م)');
      }
    }

    if (catalogTotalPriceValue) {
      if (minTotal === 0 && maxTotal === 0) {
        catalogTotalPriceValue.textContent = '۰ تومان';
      } else if (minTotal === maxTotal) {
        catalogTotalPriceValue.textContent = `${toPersianDigits(minTotal)} میلیون تومان`;
      } else {
        catalogTotalPriceValue.textContent = `${toPersianDigits(minTotal)} تا ${toPersianDigits(maxTotal)} میلیون تومان`;
      }
    }
    if (catalogPriceBreakdown) {
      catalogPriceBreakdown.textContent = items.length ? items.join(' + ') : 'رنگ یا خدمات موردنظر را انتخاب کنید';
    }
  }

  if (kitchenSizeSlider) {
    kitchenSizeSlider.addEventListener('input', updateCatalogPricing);
    updateCatalogPricing();
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
            <div style="margin-top: 8px; font-size: 0.85rem;">لینک دعوت اختصاصی شما:</div>
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
