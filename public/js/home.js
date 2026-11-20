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
  };

  const catalogState = {
    isBeforeMode: false,
    lowerId: 'cashmere_beige',
    lowerTitle: 'بژ کشمیری',
    lowerHex: '#d5c7b4',
    lowerImageUrl: '/uploads/sample-kitchen/colors/cashmere_beige.jpg',
    upperId: 'match',
    upperTitle: 'هم‌رنگ کابینت زمینی',
    upperImageUrl: '',
    cncId: 'none',
    cncTitle: 'ساده (بدون ابزار)',
    handleId: 'silver',
    handleTitle: 'دستگیره میله‌ای نقره‌ای',
    countertopId: 'standard',
    countertopTitle: 'صفحه فابریک',
    finishId: 'matte',
    finishLabel: 'مات مخملی',
    extras: new Set(),
    activeDesc: 'رنگ پلی‌اورتان بژ کشمیری گرم و خنثی — پرطرفدارترین انتخاب آپارتمانی',
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

  // Preload base, overlays, and all chip images
  loadCatalogImage(BASE_BEFORE_IMAGE);
  Object.values(OVERLAY_URLS).forEach((url) => loadCatalogImage(url));
  document.querySelectorAll('#catalogOptionsPanel [data-img]').forEach((el) => {
    if (el.dataset.img) loadCatalogImage(el.dataset.img);
  });

  function drawCncDoorGrooves(ctx, x, y, w, h, pattern) {
    if (pattern === 'none' || w < 30 || h < 30) return;
    const shadow = 'rgba(20, 18, 16, 0.24)';
    const highlight = 'rgba(255, 255, 255, 0.24)';

    function strokeBevelRect(rx, ry, rw, rh, radius = 0) {
      ctx.save();
      ctx.lineWidth = 1.8;
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
        ctx.strokeStyle = 'rgba(20, 18, 16, 0.18)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(gx, y + p + 3);
        ctx.lineTo(gx, y + h - p - 3);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
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
      ctx.lineWidth = 1.8;
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

  function drawKitchenCountertopFill(ctx, x, y, w, h, countertopId) {
    ctx.save();
    if (countertopId === 'dark_marble') {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#1e2024');
      grad.addColorStop(1, '#2b2e33');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(245, 245, 248, 0.38)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const sx = x + (w * (i + 0.3)) / 6;
        ctx.moveTo(sx, y + 2);
        ctx.bezierCurveTo(sx + 25, y + h * 0.35, sx - 20, y + h * 0.7, sx + 15, y + h - 2);
        ctx.stroke();
      }
    } else if (countertopId === 'light_marble') {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#f4f2ee');
      grad.addColorStop(1, '#e7e4de');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(45, 48, 55, 0.28)';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const sx = x + (w * (i + 0.4)) / 6;
        ctx.moveTo(sx, y + 2);
        ctx.bezierCurveTo(sx - 20, y + h * 0.4, sx + 22, y + h * 0.7, sx - 10, y + h - 2);
        ctx.stroke();
      }
    } else {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#dfd6c7');
      grad.addColorStop(1, '#c8bba8');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawCoffeeBarRight(ctx, countertopId) {
    ctx.save();
    ctx.fillStyle = 'rgba(20, 16, 12, 0.18)';
    ctx.fillRect(932, 152, 14, 490);

    const woodGrad = ctx.createLinearGradient(944, 150, 1188, 640);
    woodGrad.addColorStop(0, '#9b744d');
    woodGrad.addColorStop(1, '#7a5838');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(944, 150, 244, 295);

    ctx.strokeStyle = 'rgba(42, 26, 14, 0.35)';
    ctx.lineWidth = 2;
    for (let sx = 954; sx < 1185; sx += 14) {
      ctx.beginPath();
      ctx.moveTo(sx, 152);
      ctx.lineTo(sx, 442);
      ctx.stroke();
    }

    [225, 312].forEach((sy) => {
      ctx.fillStyle = '#5c3f26';
      ctx.fillRect(956, sy, 218, 12);
      const glow = ctx.createLinearGradient(0, sy + 12, 0, sy + 52);
      glow.addColorStop(0, 'rgba(255, 212, 125, 0.48)');
      glow.addColorStop(1, 'rgba(255, 212, 125, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(956, sy + 12, 218, 40);
    });

    ctx.fillStyle = '#f2ede4';
    ctx.fillRect(975, 198, 20, 27);
    ctx.fillRect(1002, 203, 18, 22);
    ctx.fillStyle = '#2d3136';
    ctx.fillRect(1042, 286, 22, 26);
    ctx.fillStyle = '#d4b895';
    ctx.fillRect(1072, 290, 18, 22);

    ctx.fillStyle = '#24272c';
    ctx.fillRect(992, 378, 74, 66);
    ctx.fillStyle = '#b9935a';
    ctx.fillRect(1002, 390, 54, 10);
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(1022, 422, 18, 18);

    ctx.fillStyle = '#3b322b';
    ctx.fillRect(942, 462, 246, 188);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(948, 470, 114, 170);
    ctx.strokeRect(1068, 470, 114, 170);

    drawKitchenCountertopFill(ctx, 936, 444, 256, 20, countertopId);
    ctx.restore();
  }

  function drawKitchenIsland(ctx, lowerHex, countertopId) {
    ctx.save();
    const floorShadow = ctx.createRadialGradient(600, 868, 60, 600, 868, 320);
    floorShadow.addColorStop(0, 'rgba(18, 15, 12, 0.38)');
    floorShadow.addColorStop(1, 'rgba(18, 15, 12, 0)');
    ctx.fillStyle = floorShadow;
    ctx.fillRect(280, 820, 640, 76);

    ctx.fillStyle = lowerHex || '#d5c7b4';
    ctx.fillRect(348, 650, 504, 198);
    const bodyShade = ctx.createLinearGradient(348, 650, 852, 848);
    bodyShade.addColorStop(0, 'rgba(255,255,255,0.10)');
    bodyShade.addColorStop(0.6, 'rgba(0,0,0,0.04)');
    bodyShade.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = bodyShade;
    ctx.fillRect(348, 650, 504, 198);

    ctx.strokeStyle = 'rgba(0,0,0,0.24)';
    ctx.lineWidth = 1.5;
    [474, 600, 726].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx, 658);
      ctx.lineTo(sx, 824);
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(20, 18, 16, 0.45)';
    ctx.fillRect(356, 828, 488, 20);

    drawKitchenCountertopFill(ctx, 328, 622, 544, 30, countertopId);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(328, 622, 544, 30);

    [465, 735].forEach((cx) => {
      ctx.fillStyle = '#2b2d30';
      ctx.fillRect(cx - 24, 756, 6, 114);
      ctx.fillRect(cx + 18, 756, 6, 114);
      ctx.fillRect(cx - 20, 824, 40, 4);
      ctx.fillStyle = '#8b6a4b';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(cx - 32, 740, 64, 18, 6);
        ctx.fill();
      } else {
        ctx.fillRect(cx - 32, 740, 64, 18);
      }
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
        catalogPreviewDesc.textContent = 'کابینت ملامینه طرح چوب قدیمی — برای مشاهده تغییرات، گزینه‌های بازسازی را انتخاب کنید.';
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

    const lowerImg = loadCatalogImage(catalogState.lowerImageUrl);
    if (lowerImg && lowerImg.complete && lowerImg.naturalWidth > 0) {
      catalogCtx.drawImage(lowerImg, 0, 0, W, H);
    } else {
      const fallbackBase = loadCatalogImage(BASE_BEFORE_IMAGE);
      if (fallbackBase && fallbackBase.complete) catalogCtx.drawImage(fallbackBase, 0, 0, W, H);
    }

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

    if (catalogState.countertopId === 'light_marble') {
      const ctImg = loadCatalogImage(OVERLAY_URLS.light_marble);
      if (ctImg && ctImg.complete && ctImg.naturalWidth > 0) catalogCtx.drawImage(ctImg, 0, 0, W, H);
    } else if (catalogState.countertopId === 'dark_marble') {
      const ctImg = loadCatalogImage(OVERLAY_URLS.dark_marble);
      if (ctImg && ctImg.complete && ctImg.naturalWidth > 0) catalogCtx.drawImage(ctImg, 0, 0, W, H);
    }

    if (catalogState.handleId === 'black') {
      const hImg = loadCatalogImage(OVERLAY_URLS.handle_black);
      if (hImg && hImg.complete && hImg.naturalWidth > 0) catalogCtx.drawImage(hImg, 0, 0, W, H);
    } else if (catalogState.handleId === 'gold') {
      const hImg = loadCatalogImage(OVERLAY_URLS.handle_gold);
      if (hImg && hImg.complete && hImg.naturalWidth > 0) catalogCtx.drawImage(hImg, 0, 0, W, H);
    }

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

    if (catalogState.extras.has('lighting')) {
      catalogCtx.save();
      catalogCtx.fillStyle = 'rgba(255, 226, 158, 0.94)';
      catalogCtx.fillRect(435, 412, 438, 4);
      const ledGlow = catalogCtx.createLinearGradient(0, 414, 0, 550);
      ledGlow.addColorStop(0, 'rgba(255, 214, 130, 0.42)');
      ledGlow.addColorStop(1, 'rgba(255, 214, 130, 0)');
      catalogCtx.fillStyle = ledGlow;
      catalogCtx.fillRect(430, 414, 448, 136);
      catalogCtx.restore();
    }

    if (catalogState.finishId === 'glossy') {
      catalogCtx.save();
      catalogCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      [
        [455, 220, 415, 190],
        [440, 558, 375, 195],
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

    if (catalogState.extras.has('coffeebar')) {
      drawCoffeeBarRight(catalogCtx, catalogState.countertopId);
    }
    if (catalogState.extras.has('island')) {
      drawKitchenIsland(catalogCtx, catalogState.lowerHex, catalogState.countertopId);
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

  document.querySelectorAll('#catalogFinishesList .finish-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogFinishesList .finish-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.finishId = chip.dataset.finishId || 'matte';
      catalogState.finishLabel = chip.dataset.finishLabel || 'مات مخملی';
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
        inspNotes.value = `انتخاب از کاتالوگ نوکابین: رنگ ${colorText} | ابزار CNC: ${catalogState.cncTitle} | ${catalogState.handleTitle} | ${catalogState.countertopTitle} | براقیت: ${catalogState.finishLabel}${extrasText}`;
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
