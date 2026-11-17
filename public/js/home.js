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

  // 3. AI Kitchen Studio — 3-Photo Uploader + Real-Time User Photo Recoloring & Preview Engine
  const STUDIO_OPTIONS_MAP = {
    color_greige: {
      id: 'color_greige',
      type: 'color',
      title: 'گریژ گرم دو رنگ (کد نیپون NP N 1864T + 3026P)',
      badge: 'پیش‌نمایش: گریژ گرم دو رنگ (NP N 1864T + 3026P)',
      desc: 'کابینت بالا گریژ روشن گرم + کابینت پایین گریژ متوسط — بهترین هماهنگی با صفحه و کاشی کرم/بژ و کف سنگ خاکستری بدون کوچک‌ترین تخریب.',
      previewImage: '/assets/studio-color-greige.jpg',
      beforeImage: '/assets/before-1.jpg',
      upperHex: '#d7cec2',
      lowerHex: '#9f9284',
      extraMillions: 0,
    },
    color_nordic: {
      id: 'color_nordic',
      type: 'color',
      title: 'سفید گرم نوردیک (Ivory / Alabaster)',
      badge: 'پیش‌نمایش: سفید گرم نوردیک (رنگ پلی‌اورتان)',
      desc: 'روشن‌ترین انتخاب برای بزرگ‌تر و دلبازتر دیده شدن فضای آشپزخانه با پوشش ابریشمی سوپرمات رنگ پلی‌اورتان.',
      previewImage: '/assets/studio-color-nordic.jpg',
      beforeImage: '/assets/before-1.jpg',
      upperHex: '#f5f2eb',
      lowerHex: '#eae5dc',
      extraMillions: 0,
    },
    color_sage: {
      id: 'color_sage',
      type: 'color',
      title: 'سبز زیتونی / سیج مات + بالا کرم گرم',
      badge: 'پیش‌نمایش: سبز زیتونی / سیج مات + بالا کرم گرم',
      desc: 'ترکیب خاص و اروپایی، فوق‌العاده هماهنگ با صفحه و کاشی‌های گرم که هویت طراحی داخلی لوکس به فضا می‌دهد.',
      previewImage: '/assets/studio-color-sage.jpg',
      beforeImage: '/assets/before-1.jpg',
      upperHex: '#f0ece1',
      lowerHex: '#55644b',
      extraMillions: 2,
    },
    color_smoky: {
      id: 'color_smoky',
      type: 'color',
      title: 'طوسی اسموکی / زغالی مدرن + بالا گریژ روشن',
      badge: 'پیش‌نمایش: طوسی اسموکی مدرن + بالا گریژ روشن',
      desc: 'ایجاد کنتراست مدرن و شیک با صفحه روشن و کف خاکستری بدون تاریک شدن نیمه بالایی آشپزخانه.',
      previewImage: '/assets/studio-color-smoky.jpg',
      beforeImage: '/assets/before-1.jpg',
      upperHex: '#dbd4c8',
      lowerHex: '#565b61',
      extraMillions: 2,
    },
    add_island: {
      id: 'add_island',
      type: 'addon',
      title: 'ساخت جزیره مدرن هم‌رنگ کابینت',
      badge: 'پیش‌نمایش: افزودن جزیره آشپزخانه با صفحه سنگی',
      desc: 'ساخت کانتر جزیره کاربردی در مرکز آشپزخانه دقیقاً هم‌رنگ کابینت‌های پلی‌اورتان جدید به همراه صفحه سنگی و نشیمن.',
      previewImage: '/assets/studio-island.jpg',
      beforeImage: '/assets/before-1.jpg',
      extraMillions: 24,
    },
    add_coffeebar: {
      id: 'add_coffeebar',
      type: 'addon',
      title: 'ساخت کافی‌بار اختصاصی (Coffee Bar)',
      badge: 'پیش‌نمایش: ساخت استیشن کافی‌بار با شلف چوبی و نور مخفی',
      desc: 'تبدیل کنج روی صفحه کابینت به کافی‌بار لوکس با شلف‌های چوب طبیعی، نور مخفی گرم و جایگاه ویژه اسپرسوساز و ماگ‌ها.',
      previewImage: '/assets/studio-coffeebar.jpg',
      beforeImage: '/assets/before-1.jpg',
      extraMillions: 12,
    },
    refinish_countertop: {
      id: 'refinish_countertop',
      type: 'addon',
      title: 'رنگ کردن / نوسازی صفحه کابینت',
      badge: 'پیش‌نمایش: نوسازی صفحه کابینت به طرح کوارتز سفید رگه‌دار',
      desc: 'تبدیل صفحه کابینت قدیمی به سطح مدرن طرح سنگ کوارتز سفید رگه‌دار گرم، کاملاً هماهنگ با رنگ پلی‌اورتان جدید.',
      previewImage: '/assets/studio-countertop.jpg',
      beforeImage: '/assets/before-1.jpg',
      extraMillions: 14,
    },
    change_backsplash: {
      id: 'change_backsplash',
      type: 'addon',
      title: 'تغییر کاشی بین‌کابینتی به اسلب مدرن + نور مخفی',
      badge: 'پیش‌نمایش: تغییر کاشی بین‌کابینتی به اسلب ماربل گرم',
      desc: 'جایگزینی کاشی‌های قدیمی بین‌کابینتی با اسلب یکپارچه طرح ماربل گرم و لاین نوری زیرکابینتی که جلوه رنگ کابینت را دوچندان می‌کند.',
      previewImage: '/assets/studio-backsplash.jpg',
      beforeImage: '/assets/before-1.jpg',
      extraMillions: 16,
    },
  };

  // State for 3 uploaded photos & image objects
  const studioSlotFiles = [null, null, null];
  const studioSlotImages = [null, null, null];

  let activeUserSlotIdx = -1; // -1 means no user photo selected yet; 0..2 means user's uploaded photo
  let activeColorOptionId = 'color_greige';
  let customPaletteSelection = null; // { name, upperHex, lowerHex } when chosen from کالیته رنگ
  const activeAddonIds = new Set();
  let focusedOptionId = 'color_greige';
  let studioViewMode = 'render'; // 'render' | 'sketch' | 'before'

  const studioPreviewImg = document.getElementById('studioPreviewImg');
  const studioPreviewCanvas = document.getElementById('studioPreviewCanvas');
  const studioPreviewBadge = document.getElementById('studioPreviewBadge');
  const studioPreviewTitle = document.getElementById('studioPreviewTitle');
  const studioPreviewDesc = document.getElementById('studioPreviewDesc');
  const studioCompareToggleBtn = document.getElementById('studioCompareToggleBtn');
  const selectedOptionsCountEl = document.getElementById('selectedOptionsCount');
  const studioTotalEstimateEl = document.getElementById('studioTotalEstimate');
  const uploadedCountBadge = document.getElementById('uploadedCountBadge');
  const userUploadedStrip = document.getElementById('userUploadedStrip');
  const userUploadedThumbs = document.getElementById('userUploadedThumbs');
  const calibrationHint = document.getElementById('calibrationHint');
  const switchToSampleBtn = document.getElementById('switchToSampleBtn');

  // Preload default before-1.jpg so 'sketch' and 'before' modes work even before user uploads a photo
  let defaultSampleBeforeImg = null;
  const preloadDefaultImg = new Image();
  preloadDefaultImg.onload = () => {
    defaultSampleBeforeImg = preloadDefaultImg;
    updateStudioPreviewUI();
  };
  preloadDefaultImg.src = '/assets/before-1.jpg';

  function hexToRgb(hex) {
    const clean = String(hex || '#d7cec2').replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  function clampByte(v) {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }

  function rgbCss(c, alpha = 1) {
    return alpha < 1
      ? `rgba(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)}, ${alpha})`
      : `rgb(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)})`;
  }

  function shadeColor(c, delta) {
    return {
      r: clampByte(c.r + delta),
      g: clampByte(c.g + delta),
      b: clampByte(c.b + delta),
    };
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function getActivePaintColors() {
    if (customPaletteSelection) {
      return {
        upper: hexToRgb(customPaletteSelection.upperHex),
        lower: hexToRgb(customPaletteSelection.lowerHex),
        label: customPaletteSelection.name,
      };
    }
    const opt = STUDIO_OPTIONS_MAP[activeColorOptionId] || STUDIO_OPTIONS_MAP.color_greige;
    return {
      upper: hexToRgb(opt.upperHex || '#d7cec2'),
      lower: hexToRgb(opt.lowerHex || '#9f9284'),
      label: opt.title,
    };
  }

  // Helper: Draw a 3D Shaker cabinet door with polyurethane satin sheen & architectural ink lines
  function drawShakerCabinetDoor(ctx, x, y, w, h, baseRgb, handlePos = 'bottom-right') {
    const lightRgb = shadeColor(baseRgb, 16);
    const darkRgb = shadeColor(baseRgb, -18);
    const recessRgb = shadeColor(baseRgb, -7);

    // Outer door fill with subtle vertical polyurethane satin sheen
    const grad = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
    grad.addColorStop(0, rgbCss(lightRgb));
    grad.addColorStop(0.55, rgbCss(baseRgb));
    grad.addColorStop(1, rgbCss(darkRgb));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Outer architectural ink border
    ctx.strokeStyle = 'rgba(42, 33, 27, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, y, w, h);

    // Inner Shaker recessed panel
    const frame = Math.max(10, Math.min(18, Math.round(Math.min(w, h) * 0.14)));
    if (w > frame * 2.4 && h > frame * 2.4) {
      const ix = x + frame;
      const iy = y + frame;
      const iw = w - frame * 2;
      const ih = h - frame * 2;

      const innerGrad = ctx.createLinearGradient(ix, iy, ix, iy + ih);
      innerGrad.addColorStop(0, rgbCss(recessRgb));
      innerGrad.addColorStop(1, rgbCss(baseRgb));
      ctx.fillStyle = innerGrad;
      ctx.fillRect(ix, iy, iw, ih);

      // Top/left inner bevel shadow
      ctx.strokeStyle = 'rgba(30, 22, 16, 0.38)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ix, iy + ih);
      ctx.lineTo(ix, iy);
      ctx.lineTo(ix + iw, iy);
      ctx.stroke();

      // Bottom/right inner bevel highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ix, iy + ih);
      ctx.lineTo(ix + iw, iy + ih);
      ctx.lineTo(ix + iw, iy);
      ctx.stroke();
    }

    // Minimalist architectural handle (dark bronze / brushed gold)
    ctx.fillStyle = '#3a2e25';
    ctx.strokeStyle = '#c59b57';
    ctx.lineWidth = 1;
    if (handlePos === 'center-top') {
      const hw = Math.min(42, w * 0.34);
      const hx = x + (w - hw) / 2;
      const hy = y + Math.min(18, h * 0.28);
      ctx.fillRect(hx, hy, hw, 4);
    } else if (handlePos === 'bottom-left' || handlePos === 'bottom-right') {
      const hx = handlePos === 'bottom-left' ? x + 8 : x + w - 12;
      const hy = y + h - 34;
      ctx.fillRect(hx, hy, 4, 22);
    } else if (handlePos === 'top-left' || handlePos === 'top-right') {
      const hx = handlePos === 'top-left' ? x + 8 : x + w - 12;
      const hy = y + 14;
      ctx.fillRect(hx, hy, 4, 22);
    }
  }

  // Generate a small Sobel ink line-sketch thumbnail from an image for the blueprint corner card
  function createMiniInkSketchCanvas(img, tw, th) {
    const off = document.createElement('canvas');
    off.width = tw;
    off.height = th;
    const octx = off.getContext('2d');
    octx.drawImage(img, 0, 0, tw, th);
    const src = octx.getImageData(0, 0, tw, th);
    const sd = src.data;
    const out = octx.createImageData(tw, th);
    const od = out.data;

    const lum = new Float32Array(tw * th);
    for (let i = 0; i < tw * th; i++) {
      const p = i * 4;
      lum[i] = 0.299 * sd[p] + 0.587 * sd[p + 1] + 0.114 * sd[p + 2];
    }

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const idx = y * tw + x;
        let edge = 0;
        if (x > 0 && x < tw - 1 && y > 0 && y < th - 1) {
          const gx =
            -lum[(y - 1) * tw + (x - 1)] +
            lum[(y - 1) * tw + (x + 1)] -
            2 * lum[y * tw + (x - 1)] +
            2 * lum[y * tw + (x + 1)] -
            lum[(y + 1) * tw + (x - 1)] +
            lum[(y + 1) * tw + (x + 1)];
          const gy =
            -lum[(y - 1) * tw + (x - 1)] -
            2 * lum[(y - 1) * tw + x] -
            lum[(y - 1) * tw + (x + 1)] +
            lum[(y + 1) * tw + (x - 1)] +
            2 * lum[(y + 1) * tw + x] +
            lum[(y + 1) * tw + (x + 1)];
          edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 210);
        }
        const ink = Math.pow(edge, 0.85);
        const p = idx * 4;
        od[p] = clampByte(250 * (1 - ink) + 42 * ink);
        od[p + 1] = clampByte(245 * (1 - ink) + 33 * ink);
        od[p + 2] = clampByte(236 * (1 - ink) + 25 * ink);
        od[p + 3] = 255;
      }
    }
    octx.putImageData(out, 0, 0);
    return off;
  }

  // MODE 1: Clean Parametric 3D Architectural Sketch & Interior Render
  function renderArchitectural3DSketch(ctx, w, h, userImg) {
    const { upper: upperRGB, lower: lowerRGB, label: paintLabel } = getActivePaintColors();
    const hasBacksplash = activeAddonIds.has('change_backsplash');
    const hasCountertop = activeAddonIds.has('refinish_countertop');
    const hasCoffeeBar = activeAddonIds.has('add_coffeebar');
    const hasIsland = activeAddonIds.has('add_island');

    ctx.save();
    // 1. Warm Architectural Paper Background & Ceiling/Walls
    const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
    wallGrad.addColorStop(0, '#f7f2e9');
    wallGrad.addColorStop(0.5, '#efe7da');
    wallGrad.addColorStop(1, '#e4d9c8');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle CAD Architectural Construction Grid Lines
    ctx.strokeStyle = 'rgba(92, 74, 56, 0.08)';
    ctx.lineWidth = 1;
    for (let gx = 48; gx < w; gx += 48) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 48; gy < h; gy += 48) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // 2. Ceiling Plane & Warm Recessed Spotlights
    const ceilH = Math.round(h * 0.11);
    ctx.fillStyle = '#fbf8f3';
    ctx.fillRect(0, 0, w, ceilH);
    ctx.strokeStyle = 'rgba(42, 33, 27, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, ceilH);
    ctx.lineTo(w * 0.94, ceilH);
    ctx.stroke();
    // Perspective corner lines
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.06, ceilH);
    ctx.moveTo(w, 0);
    ctx.lineTo(w * 0.94, ceilH);
    ctx.stroke();

    // Ceiling Spotlights + Warm Light Cones
    [0.24, 0.5, 0.76].forEach((rx) => {
      const lx = Math.round(w * rx);
      const ly = Math.round(ceilH * 0.55);
      const cone = ctx.createRadialGradient(lx, ly + 20, 6, lx, ly + 90, 140);
      cone.addColorStop(0, 'rgba(255, 223, 158, 0.36)');
      cone.addColorStop(1, 'rgba(255, 223, 158, 0)');
      ctx.fillStyle = cone;
      ctx.fillRect(lx - 140, 0, 280, 220);

      ctx.fillStyle = '#fff9eb';
      ctx.strokeStyle = '#8b6d3b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // 3. Perspective Stone Tile Flooring (y: 75%..100%)
    const floorY = Math.round(h * 0.75);
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
    floorGrad.addColorStop(0, '#dad2c6');
    floorGrad.addColorStop(1, '#c5bbb0');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, w, h - floorY);

    // Perspective floor tile lines
    ctx.strokeStyle = 'rgba(65, 55, 45, 0.22)';
    ctx.lineWidth = 1.2;
    for (let i = -4; i <= 4; i++) {
      const topX = w * 0.5 + i * (w * 0.11);
      const botX = w * 0.5 + i * (w * 0.22);
      ctx.beginPath();
      ctx.moveTo(topX, floorY);
      ctx.lineTo(botX, h);
      ctx.stroke();
    }
    [0.81, 0.88, 0.96].forEach((fy) => {
      ctx.beginPath();
      ctx.moveTo(0, h * fy);
      ctx.lineTo(w, h * fy);
      ctx.stroke();
    });

    // Main Kitchen Bounds
    const cabLeft = Math.round(w * 0.08);
    const cabRight = Math.round(w * 0.92);
    const cabW = cabRight - cabLeft;

    const upperTop = Math.round(h * 0.14);
    const upperH = Math.round(h * 0.23);
    const upperBot = upperTop + upperH;

    const bsTop = upperBot;
    const bsH = Math.round(h * 0.14);
    const bsBot = bsTop + bsH;

    const ctTop = bsBot;
    const ctH = Math.round(h * 0.032);
    const ctBot = ctTop + ctH;

    const lowerTop = ctBot;
    const lowerH = Math.round(h * 0.205);
    const lowerBot = lowerTop + lowerH;

    // 4. Backsplash (بین‌کابینتی) — Standard Tile Grid vs Luxury Veined Marble Slab + LED
    if (hasBacksplash) {
      const mGrad = ctx.createLinearGradient(cabLeft, bsTop, cabRight, bsBot);
      mGrad.addColorStop(0, '#f9f5ee');
      mGrad.addColorStop(0.5, '#f1e9dc');
      mGrad.addColorStop(1, '#e8decb');
      ctx.fillStyle = mGrad;
      ctx.fillRect(cabLeft, bsTop, cabW, bsH);

      // Delicate Calacatta marble veins
      ctx.strokeStyle = 'rgba(175, 145, 98, 0.36)';
      ctx.lineWidth = 1.8;
      for (let v = 0; v < 6; v++) {
        const vx = cabLeft + (cabW / 6) * v + 25;
        ctx.beginPath();
        ctx.moveTo(vx, bsTop + 4);
        ctx.bezierCurveTo(vx + 35, bsTop + bsH * 0.4, vx - 20, bsTop + bsH * 0.7, vx + 45, bsBot - 4);
        ctx.stroke();
      }

      // Warm Under-Cabinet Hidden LED Light Line
      const ledGlow = ctx.createLinearGradient(0, bsTop, 0, bsTop + bsH * 0.55);
      ledGlow.addColorStop(0, 'rgba(255, 210, 125, 0.75)');
      ledGlow.addColorStop(1, 'rgba(255, 210, 125, 0)');
      ctx.fillStyle = ledGlow;
      ctx.fillRect(cabLeft, bsTop, cabW, bsH * 0.55);

      ctx.fillStyle = '#fff5d6';
      ctx.fillRect(cabLeft + 4, bsTop, cabW - 8, 3);
    } else {
      ctx.fillStyle = '#e7dfd2';
      ctx.fillRect(cabLeft, bsTop, cabW, bsH);
      // Classic subway tile grid
      ctx.strokeStyle = 'rgba(110, 96, 82, 0.25)';
      ctx.lineWidth = 1;
      const tileH = Math.round(bsH / 4);
      const tileW = 44;
      for (let ty = bsTop; ty <= bsBot; ty += tileH) {
        ctx.beginPath();
        ctx.moveTo(cabLeft, ty);
        ctx.lineTo(cabRight, ty);
        ctx.stroke();
      }
      for (let row = 0; row < 4; row++) {
        const offset = (row % 2) * (tileW / 2);
        for (let tx = cabLeft + offset; tx < cabRight; tx += tileW) {
          ctx.beginPath();
          ctx.moveTo(tx, bsTop + row * tileH);
          ctx.lineTo(tx, Math.min(bsBot, bsTop + (row + 1) * tileH));
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = 'rgba(42, 33, 27, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cabLeft, bsTop, cabW, bsH);

    // 5. Upper Cabinets (یونیت‌های هوایی) + Crown Molding (painted in upperRGB)
    const numCols = 5;
    const colW = cabW / numCols;
    const upperColsToDraw = hasCoffeeBar ? 4 : 5; // If Coffee Bar is active, rightmost column becomes open oak shelves

    // Crown Molding (تاج کابینت)
    const crownW = colW * upperColsToDraw;
    ctx.fillStyle = rgbCss(shadeColor(upperRGB, 12));
    ctx.fillRect(cabLeft - 4, upperTop - 10, crownW + 8, 10);
    ctx.strokeStyle = 'rgba(42, 33, 27, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cabLeft - 4, upperTop - 10, crownW + 8, 10);

    // Soft shadow cast by upper cabinets onto backsplash
    const dropShadow = ctx.createLinearGradient(0, upperBot, 0, upperBot + 14);
    dropShadow.addColorStop(0, 'rgba(30, 22, 16, 0.28)');
    dropShadow.addColorStop(1, 'rgba(30, 22, 16, 0)');
    ctx.fillStyle = dropShadow;
    ctx.fillRect(cabLeft, upperBot, crownW, 14);

    for (let c = 0; c < upperColsToDraw; c++) {
      const ux = Math.round(cabLeft + c * colW);
      const uw = Math.round(colW);
      // Double doors per module
      const halfW = Math.floor(uw / 2);
      drawShakerCabinetDoor(ctx, ux, upperTop, halfW, upperH, upperRGB, 'bottom-right');
      drawShakerCabinetDoor(ctx, ux + halfW, upperTop, uw - halfW, upperH, upperRGB, 'bottom-left');
    }

    // 6. Coffee Bar Station (استیشن کافی‌بار اختصاصی در سمت راست) if active
    if (hasCoffeeBar) {
      const cbX = Math.round(cabLeft + 4 * colW);
      const cbW = Math.round(colW);
      const cbTop = upperTop - 10;
      const cbTotalH = upperH + bsH + 10;

      // Warm oak vertical wood slat background
      ctx.fillStyle = '#8b5e34';
      ctx.fillRect(cbX, cbTop, cbW, cbTotalH);
      ctx.strokeStyle = 'rgba(48, 30, 14, 0.55)';
      ctx.lineWidth = 1.2;
      for (let sx = cbX + 8; sx < cbX + cbW; sx += 9) {
        ctx.beginPath();
        ctx.moveTo(sx, cbTop);
        ctx.lineTo(sx, cbTop + cbTotalH);
        ctx.stroke();
      }
      ctx.strokeRect(cbX, cbTop, cbW, cbTotalH);

      // Warm LED radial glow inside Coffee Bar
      const cbGlow = ctx.createRadialGradient(
        cbX + cbW / 2,
        cbTop + cbTotalH * 0.48,
        8,
        cbX + cbW / 2,
        cbTop + cbTotalH * 0.48,
        cbW * 0.75
      );
      cbGlow.addColorStop(0, 'rgba(255, 216, 140, 0.65)');
      cbGlow.addColorStop(1, 'rgba(255, 216, 140, 0)');
      ctx.fillStyle = cbGlow;
      ctx.fillRect(cbX, cbTop, cbW, cbTotalH);

      // Two floating natural wood shelves + LED strip
      [0.32, 0.58].forEach((syRatio, sIdx) => {
        const sy = Math.round(cbTop + cbTotalH * syRatio);
        ctx.fillStyle = '#5c3b1e';
        ctx.fillRect(cbX + 8, sy, cbW - 16, 9);
        ctx.strokeStyle = '#2a1b0e';
        ctx.strokeRect(cbX + 8, sy, cbW - 16, 9);
        // LED line under shelf
        ctx.fillStyle = '#ffe599';
        ctx.fillRect(cbX + 12, sy + 9, cbW - 24, 2);

        // Coffee canisters & ceramic mugs on shelves
        ctx.fillStyle = '#f7f3ec';
        ctx.strokeStyle = '#3a2e25';
        ctx.lineWidth = 1.2;
        if (sIdx === 0) {
          ctx.fillRect(cbX + 22, sy - 22, 18, 22);
          ctx.strokeRect(cbX + 22, sy - 22, 18, 22);
          ctx.fillRect(cbX + 46, sy - 18, 16, 18);
          ctx.strokeRect(cbX + 46, sy - 18, 16, 18);
        } else {
          for (let m = 0; m < 3; m++) {
            const mx = cbX + 20 + m * 26;
            ctx.fillRect(mx, sy - 14, 14, 14);
            ctx.strokeRect(mx, sy - 14, 14, 14);
          }
        }
      });

      // Espresso Machine on the counter
      const emW = Math.round(cbW * 0.46);
      const emH = Math.round(bsH * 0.52);
      const emX = cbX + Math.round((cbW - emW) / 2);
      const emY = ctTop - emH;
      ctx.fillStyle = '#2b2623';
      ctx.fillRect(emX, emY, emW, emH);
      ctx.strokeStyle = '#c59b57';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(emX, emY, emW, emH);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(emX + 6, emY + 8, emW - 12, 6);
      // White espresso cup
      ctx.fillStyle = '#fff';
      ctx.fillRect(emX + Math.round(emW * 0.35), emY + emH - 12, 14, 10);
    }

    // 7. Lower Base Cabinets & Drawer Stack (painted in lowerRGB)
    // Dark recessed toe-kick (پاخور کابینت)
    ctx.fillStyle = '#2b241f';
    ctx.fillRect(cabLeft + 4, lowerBot, cabW - 8, Math.round(h * 0.03));

    for (let c = 0; c < numCols; c++) {
      const lx = Math.round(cabLeft + c * colW);
      const lw = Math.round(colW);
      if (c === 1 || c === 3) {
        // 3-Drawer bank module
        const dH1 = Math.round(lowerH * 0.26);
        const dH2 = Math.round(lowerH * 0.35);
        const dH3 = lowerH - dH1 - dH2;
        drawShakerCabinetDoor(ctx, lx, lowerTop, lw, dH1, lowerRGB, 'center-top');
        drawShakerCabinetDoor(ctx, lx, lowerTop + dH1, lw, dH2, lowerRGB, 'center-top');
        drawShakerCabinetDoor(ctx, lx, lowerTop + dH1 + dH2, lw, dH3, lowerRGB, 'center-top');
      } else {
        const halfW = Math.floor(lw / 2);
        drawShakerCabinetDoor(ctx, lx, lowerTop, halfW, lowerH, lowerRGB, 'top-right');
        drawShakerCabinetDoor(ctx, lx + halfW, lowerTop, lw - halfW, lowerH, lowerRGB, 'top-left');
      }
    }

    // 8. Countertop Slab (صفحه کابینت) + Sink & Faucet + Cooktop
    const ctX = cabLeft - 6;
    const ctW = cabW + 12;
    if (hasCountertop) {
      // Luxury White Veined Quartz Countertop
      const qGrad = ctx.createLinearGradient(ctX, ctTop, ctX + ctW, ctBot);
      qGrad.addColorStop(0, '#fcfaf7');
      qGrad.addColorStop(0.5, '#f3eee6');
      qGrad.addColorStop(1, '#e8e0d4');
      ctx.fillStyle = qGrad;
      ctx.fillRect(ctX, ctTop, ctW, ctH);

      // Subtle quartz veins along countertop edge
      ctx.strokeStyle = 'rgba(165, 140, 105, 0.45)';
      ctx.lineWidth = 1.3;
      for (let qv = 0; qv < 8; qv++) {
        const vx = ctX + 40 + qv * (ctW / 8);
        ctx.beginPath();
        ctx.moveTo(vx, ctTop + 2);
        ctx.lineTo(vx + 22, ctBot - 2);
        ctx.stroke();
      }
    } else {
      // Standard warm stone/wood-tone countertop
      const sGrad = ctx.createLinearGradient(ctX, ctTop, ctX, ctBot);
      sGrad.addColorStop(0, '#c8b8a4');
      sGrad.addColorStop(1, '#a89680');
      ctx.fillStyle = sGrad;
      ctx.fillRect(ctX, ctTop, ctW, ctH);
    }
    ctx.strokeStyle = 'rgba(42, 33, 27, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(ctX, ctTop, ctW, ctH);

    // Architectural Faucet & Sink on column 2
    const sinkX = Math.round(cabLeft + 2.5 * colW);
    ctx.strokeStyle = '#3a2e25';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sinkX, ctTop);
    ctx.lineTo(sinkX, ctTop - 34);
    ctx.arc(sinkX - 12, ctTop - 34, 12, 0, Math.PI, true);
    ctx.lineTo(sinkX - 24, ctTop - 22);
    ctx.stroke();

    // Induction Cooktop on column 1
    const cookX = Math.round(cabLeft + 1.15 * colW);
    const cookW = Math.round(colW * 0.7);
    ctx.fillStyle = '#231f1d';
    ctx.fillRect(cookX, ctTop + 2, cookW, 6);

    // 9. Foreground 3D Kitchen Island (ساخت جزیره آشپزخانه) if active
    if (hasIsland) {
      const islW = Math.round(w * 0.56);
      const islH = Math.round(h * 0.24);
      const islX = Math.round((w - islW) / 2);
      const islY = Math.round(h * 0.66);

      // Soft floor shadow under island
      ctx.fillStyle = 'rgba(28, 22, 17, 0.28)';
      ctx.beginPath();
      ctx.ellipse(islX + islW / 2, islY + islH + 6, islW * 0.53, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Island cabinet body painted in lowerRGB with 3 Shaker panels
      const islTopH = 18;
      const islBodyY = islY + islTopH;
      const islBodyH = islH - islTopH;
      const islCols = 3;
      const islColW = islW / islCols;
      for (let ic = 0; ic < islCols; ic++) {
        drawShakerCabinetDoor(
          ctx,
          Math.round(islX + ic * islColW),
          islBodyY,
          Math.round(islColW),
          islBodyH,
          lowerRGB,
          'center-top'
        );
      }

      // Overhanging Waterfall Quartz Stone Countertop on Island
      const iqGrad = ctx.createLinearGradient(islX - 14, islY, islX + islW + 14, islY + islTopH);
      iqGrad.addColorStop(0, '#fcfaf6');
      iqGrad.addColorStop(0.5, '#f2ece2');
      iqGrad.addColorStop(1, '#e4dcd0');
      ctx.fillStyle = iqGrad;
      ctx.fillRect(islX - 14, islY, islW + 28, islTopH);
      ctx.strokeStyle = 'rgba(42, 33, 27, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(islX - 14, islY, islW + 28, islTopH);

      // Waterfall side legs in quartz
      ctx.fillStyle = '#ebe4d8';
      ctx.fillRect(islX - 12, islY + islTopH, 12, islBodyH);
      ctx.strokeRect(islX - 12, islY + islTopH, 12, islBodyH);
      ctx.fillRect(islX + islW, islY + islTopH, 12, islBodyH);
      ctx.strokeRect(islX + islW, islY + islTopH, 12, islBodyH);

      // Two Minimalist Architectural Barstools in front of Island
      [0.34, 0.66].forEach((bxRatio) => {
        const bx = Math.round(islX + islW * bxRatio);
        const by = islY + Math.round(islH * 0.42);
        // Seat
        ctx.fillStyle = '#7a542e';
        ctx.strokeStyle = '#2a1e17';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(bx, by, 26, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Slender metal legs
        ctx.strokeStyle = '#2a221c';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(bx - 16, by + 6);
        ctx.lineTo(bx - 22, islY + islH + 8);
        ctx.moveTo(bx + 16, by + 6);
        ctx.lineTo(bx + 22, islY + islH + 8);
        ctx.moveTo(bx - 19, by + 42);
        ctx.lineTo(bx + 19, by + 42);
        ctx.stroke();
      });
    }

    // 10. If User Uploaded a Kitchen Photo, Draw Blueprint Sketch Inset Card in Top-Left Corner
    if (userImg) {
      const cardW = 196;
      const cardH = 148;
      const cardX = 16;
      const cardY = 16;

      ctx.fillStyle = 'rgba(34, 27, 22, 0.9)';
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1.8;
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeRect(cardX, cardY, cardW, cardH);

      const miniCanvas = createMiniInkSketchCanvas(userImg, cardW - 16, cardH - 38);
      ctx.drawImage(miniCanvas, cardX + 8, cardY + 28);

      ctx.fillStyle = '#f3d49c';
      ctx.font = 'bold 12px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('اسکیچ استخراج‌شده از عکس شما', cardX + cardW - 10, cardY + 19);
    }

    // 11. Architectural Legend Footer Bar inside Canvas
    const barH = 40;
    ctx.fillStyle = 'rgba(34, 27, 22, 0.88)';
    ctx.fillRect(0, h - barH, w, barH);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - barH);
    ctx.lineTo(w, h - barH);
    ctx.stroke();

    // Swatch circles for Upper & Lower paint
    ctx.fillStyle = rgbCss(upperRGB);
    ctx.fillRect(w - 34, h - 29, 18, 18);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(w - 34, h - 29, 18, 18);

    ctx.fillStyle = rgbCss(lowerRGB);
    ctx.fillRect(w - 58, h - 29, 18, 18);
    ctx.strokeRect(w - 58, h - 29, 18, 18);

    const activeAddonsList = [];
    if (hasIsland) activeAddonsList.push('ساخت جزیره');
    if (hasCoffeeBar) activeAddonsList.push('کافی‌بار');
    if (hasCountertop) activeAddonsList.push('صفحه کوارتز');
    if (hasBacksplash) activeAddonsList.push('اسلب بین‌کابینتی');

    const summaryLine =
      activeAddonsList.length > 0
        ? `رندر معماری: ${paintLabel} + ${activeAddonsList.join(' + ')}`
        : `رندر و اسکیچ معماری نوکابین: ${paintLabel}`;

    ctx.fillStyle = '#f7f3ec';
    ctx.font = 'bold 14px Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(summaryLine, w - 70, h - 15);

    ctx.restore();
  }

  // MODE 2: Architectural Sobel Ink Line Sketch Directly from User's Uploaded Photo + Smooth Color Wash
  function renderSobelLineSketchFromUserPhoto(ctx, w, h, srcImg) {
    const { upper: upperRGB, lower: lowerRGB, label: paintLabel } = getActivePaintColors();
    ctx.save();

    // Draw scaled source image to extract luminance & smooth Sobel edges
    ctx.drawImage(srcImg, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }

    for (let y = 0; y < h; y++) {
      const ny = y / h;
      // Smooth architectural marker wash bands (no pixel color thresholding -> zero blotches!)
      const upperBand = smoothstep(0.08, 0.16, ny) * (1 - smoothstep(0.36, 0.44, ny));
      const lowerBand = smoothstep(0.50, 0.57, ny) * (1 - smoothstep(0.84, 0.92, ny));

      for (let x = 0; x < w; x++) {
        const nx = x / w;
        const horizMask = smoothstep(0.04, 0.10, nx) * (1 - smoothstep(0.90, 0.96, nx));
        const idx = y * w + x;

        let edgeMag = 0;
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
          const gx =
            -lum[(y - 1) * w + (x - 1)] +
            lum[(y - 1) * w + (x + 1)] -
            2 * lum[y * w + (x - 1)] +
            2 * lum[y * w + (x + 1)] -
            lum[(y + 1) * w + (x - 1)] +
            lum[(y + 1) * w + (x + 1)];
          const gy =
            -lum[(y - 1) * w + (x - 1)] -
            2 * lum[(y - 1) * w + x] -
            lum[(y - 1) * w + (x + 1)] +
            lum[(y + 1) * w + (x - 1)] +
            2 * lum[(y + 1) * w + x] +
            lum[(y + 1) * w + (x + 1)];
          edgeMag = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 195);
        }

        // Warm architectural parchment paper base + soft tonal shading from original luminance
        const normLum = lum[idx] / 255;
        const softTone = 0.82 + normLum * 0.18;
        let pr = 250 * softTone;
        let pg = 245 * softTone;
        let pb = 236 * softTone;

        // Blend smooth architectural marker wash of selected polyurethane color
        const uWash = upperBand * horizMask * 0.62;
        const lWash = lowerBand * horizMask * 0.68;
        if (uWash > 0.01) {
          pr = pr * (1 - uWash) + upperRGB.r * softTone * uWash;
          pg = pg * (1 - uWash) + upperRGB.g * softTone * uWash;
          pb = pb * (1 - uWash) + upperRGB.b * softTone * uWash;
        }
        if (lWash > 0.01) {
          pr = pr * (1 - lWash) + lowerRGB.r * softTone * lWash;
          pg = pg * (1 - lWash) + lowerRGB.g * softTone * lWash;
          pb = pb * (1 - lWash) + lowerRGB.b * softTone * lWash;
        }

        // Overlay crisp architectural espresso ink lines
        const ink = Math.pow(edgeMag, 0.85) * 0.88;
        const p = idx * 4;
        d[p] = clampByte(pr * (1 - ink) + 38 * ink);
        d[p + 1] = clampByte(pg * (1 - ink) + 29 * ink);
        d[p + 2] = clampByte(pb * (1 - ink) + 22 * ink);
        d[p + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Footer caption on sketch
    ctx.fillStyle = 'rgba(34, 27, 22, 0.88)';
    ctx.fillRect(0, h - 38, w, 38);
    ctx.fillStyle = '#f3d49c';
    ctx.font = 'bold 14px Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`اسکیچ خطی معماری از عکس شما — رنگ: ${paintLabel}`, w - 18, h - 14);
    ctx.restore();
  }

  // Master Canvas Renderer for AI Studio
  function renderStudioCanvas() {
    if (!studioPreviewCanvas) return;
    const targetW = 960;
    const targetH = 720;
    studioPreviewCanvas.width = targetW;
    studioPreviewCanvas.height = targetH;
    const ctx = studioPreviewCanvas.getContext('2d');

    const userImg = activeUserSlotIdx >= 0 ? studioSlotImages[activeUserSlotIdx] : null;
    const baseImg = userImg || defaultSampleBeforeImg;

    if (studioViewMode === 'before') {
      if (baseImg) {
        ctx.drawImage(baseImg, 0, 0, targetW, targetH);
      }
      return;
    }

    if (studioViewMode === 'sketch') {
      if (baseImg) {
        renderSobelLineSketchFromUserPhoto(ctx, targetW, targetH, baseImg);
      } else {
        renderArchitectural3DSketch(ctx, targetW, targetH, null);
      }
      return;
    }

    // Default: studioViewMode === 'render' (Clean 3D Architectural Sketch & Render)
    renderArchitectural3DSketch(ctx, targetW, targetH, userImg);
  }

  function getUploadedStudioFiles() {
    return studioSlotFiles.filter(Boolean);
  }

  function updateStudioSlotsUI() {
    const count = getUploadedStudioFiles().length;
    if (uploadedCountBadge) {
      uploadedCountBadge.textContent = toPersianDigits(count);
    }

    document.querySelectorAll('.studio-slot').forEach((slotEl) => {
      const idx = Number(slotEl.dataset.slotIndex);
      const file = studioSlotFiles[idx];
      const removeBtn = slotEl.querySelector('[data-remove-slot]');
      const subEl = slotEl.querySelector('.slot-sub');
      let thumbImg = slotEl.querySelector('img.slot-thumb');

      if (file) {
        slotEl.classList.add('has-file');
        if (removeBtn) removeBtn.style.display = 'flex';
        if (subEl) subEl.textContent = file.name.slice(0, 18);
        if (!thumbImg) {
          thumbImg = document.createElement('img');
          thumbImg.className = 'slot-thumb';
          thumbImg.alt = `عکس ${idx + 1}`;
          slotEl.insertBefore(thumbImg, slotEl.firstChild);
        }
        if (studioSlotImages[idx]) {
          thumbImg.src = studioSlotImages[idx].src;
        }
      } else {
        slotEl.classList.remove('has-file');
        if (removeBtn) removeBtn.style.display = 'none';
        if (subEl) subEl.textContent = 'کلیک برای انتخاب عکس';
        if (thumbImg) thumbImg.remove();
      }
    });

    // Update thumbnail strip inside preview card
    if (userUploadedStrip && userUploadedThumbs) {
      const hasAny = studioSlotFiles.some(Boolean);
      if (!hasAny) {
        userUploadedStrip.style.display = 'none';
        userUploadedThumbs.innerHTML = '';
      } else {
        userUploadedStrip.style.display = 'block';
        userUploadedThumbs.innerHTML = '';
        studioSlotFiles.forEach((f, slotIdx) => {
          if (!f || !studioSlotImages[slotIdx]) return;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `user-photo-pill ${activeUserSlotIdx === slotIdx ? 'active' : ''}`;
          btn.innerHTML = `<i class="fa-solid fa-camera"></i> عکس ${toPersianDigits(slotIdx + 1)} شما`;
          btn.addEventListener('click', () => {
            activeUserSlotIdx = slotIdx;
            if (studioViewMode === 'before') studioViewMode = 'render';
            updateStudioSlotsUI();
            updateStudioPreviewUI();
          });
          userUploadedThumbs.appendChild(btn);
        });
      }
      if (switchToSampleBtn) {
        switchToSampleBtn.classList.toggle('active', activeUserSlotIdx === -1);
      }
    }
  }

  if (switchToSampleBtn) {
    switchToSampleBtn.addEventListener('click', () => {
      activeUserSlotIdx = -1;
      updateStudioSlotsUI();
      updateStudioPreviewUI();
    });
  }

  document.querySelectorAll('.studio-slot-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const slotIdx = Number(input.dataset.slot);
      const file = (e.target.files || [])[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          studioSlotFiles[slotIdx] = file;
          studioSlotImages[slotIdx] = img;
          activeUserSlotIdx = slotIdx;
          studioViewMode = 'render';
          updateStudioSlotsUI();
          updateStudioPreviewUI();
          syncStudioFilesToInspectionForm();
          showToast(
            `عکس ${toPersianDigits(slotIdx + 1)} شما دریافت شد و اسکیچ و رندر هوشمند آشپزخانه ساخته شد!`,
            'success'
          );
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      input.value = '';
    });
  });

  document.querySelectorAll('[data-remove-slot]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(btn.dataset.removeSlot);
      studioSlotFiles[idx] = null;
      studioSlotImages[idx] = null;
      if (activeUserSlotIdx === idx) {
        const nextAvailable = studioSlotImages.findIndex(Boolean);
        activeUserSlotIdx = nextAvailable; // either 0..2 or -1
      }
      updateStudioSlotsUI();
      updateStudioPreviewUI();
      syncStudioFilesToInspectionForm();
    });
  });

  // Mode Tabs (Render 3D / Line Sketch / Original Photo)
  document.querySelectorAll('#studioModeTabs .studio-mode-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      studioViewMode = tabBtn.dataset.studioMode || 'render';
      updateStudioPreviewUI();
    });
  });

  function updateStudioPreviewUI() {
    const focused = STUDIO_OPTIONS_MAP[focusedOptionId] || STUDIO_OPTIONS_MAP[activeColorOptionId];
    if (!focused) return;

    // Highlight active buttons
    document.querySelectorAll('#studioColorOptions .studio-option-btn').forEach((btn) => {
      btn.classList.toggle('active', !customPaletteSelection && btn.dataset.optionId === activeColorOptionId);
    });
    document.querySelectorAll('#studioAddonOptions .studio-option-btn').forEach((btn) => {
      btn.classList.toggle('active', activeAddonIds.has(btn.dataset.optionId));
    });
    document.querySelectorAll('#studioModeTabs .studio-mode-tab').forEach((tabBtn) => {
      tabBtn.classList.toggle('active', tabBtn.dataset.studioMode === studioViewMode);
    });

    const isUsingUserPhoto = activeUserSlotIdx >= 0 && Boolean(studioSlotImages[activeUserSlotIdx]);
    if (calibrationHint) {
      calibrationHint.classList.toggle('visible', isUsingUserPhoto);
    }

    // Always render via the clean Architectural Sketch & 3D Render Canvas when:
    // - user uploaded a photo, OR
    // - custom palette swatch is selected, OR
    // - multiple addons are combined, OR
    // - user is in 'sketch' or 'render' mode
    const useCanvasEngine =
      isUsingUserPhoto ||
      Boolean(customPaletteSelection) ||
      activeAddonIds.size > 0 ||
      studioViewMode === 'sketch' ||
      studioViewMode === 'render';

    if (useCanvasEngine && studioPreviewCanvas) {
      if (studioPreviewImg) studioPreviewImg.style.display = 'none';
      studioPreviewCanvas.style.display = 'block';
      renderStudioCanvas();
    } else if (studioPreviewImg) {
      if (studioPreviewCanvas) studioPreviewCanvas.style.display = 'none';
      studioPreviewImg.style.display = 'block';
      studioPreviewImg.src = studioViewMode === 'before' ? focused.beforeImage : focused.previewImage;
    }

    const paintInfo = getActivePaintColors();
    if (studioPreviewBadge) {
      if (studioViewMode === 'before') {
        studioPreviewBadge.textContent = isUsingUserPhoto
          ? 'نمای عکس اصلی آپلودشده شما (قبل از بازسازی)'
          : 'نمای عکس اصلی قبل از بازسازی';
      } else if (studioViewMode === 'sketch') {
        studioPreviewBadge.textContent = `اسکیچ خطی معماری: ${paintInfo.label}`;
      } else {
        studioPreviewBadge.textContent = `رندر و اسکیچ سه‌بعدی: ${paintInfo.label}`;
      }
    }

    if (studioPreviewTitle) {
      studioPreviewTitle.textContent = customPaletteSelection
        ? `رنگ انتخابی از کالیته: ${customPaletteSelection.name}`
        : focused.title;
    }
    if (studioPreviewDesc) {
      studioPreviewDesc.textContent = customPaletteSelection
        ? `اجرای رنگ پلی‌اورتان «${customPaletteSelection.name}» از کالیته تخصصی نوکابین روی رندر و اسکیچ معماری آشپزخانه.`
        : focused.desc;
    }

    if (studioCompareToggleBtn) {
      if (studioViewMode === 'render') {
        studioCompareToggleBtn.innerHTML =
          '<i class="fa-solid fa-pen-ruler"></i> مشاهده اسکیچ خطی مستقیم از عکس شما';
      } else if (studioViewMode === 'sketch') {
        studioCompareToggleBtn.innerHTML = '<i class="fa-solid fa-image"></i> مشاهده عکس اصلی (قبل از بازسازی)';
      } else {
        studioCompareToggleBtn.innerHTML =
          '<i class="fa-solid fa-cubes"></i> بازگشت به رندر و اسکیچ سه‌بعدی بازسازی';
      }
    }

    // Calculate total estimate based on base 70M + selected color + selected addons
    let totalMillions = 70;
    const colorOpt = STUDIO_OPTIONS_MAP[activeColorOptionId];
    if (colorOpt && !customPaletteSelection) totalMillions += colorOpt.extraMillions;
    activeAddonIds.forEach((id) => {
      const addon = STUDIO_OPTIONS_MAP[id];
      if (addon) totalMillions += addon.extraMillions;
    });

    const totalSelectedCount = 1 + activeAddonIds.size;
    if (selectedOptionsCountEl) {
      selectedOptionsCountEl.textContent = toPersianDigits(totalSelectedCount);
    }
    if (studioTotalEstimateEl) {
      studioTotalEstimateEl.textContent = `حدود ${toPersianDigits(totalMillions)} میلیون تومان`;
    }
  }

  // Click handlers for 4 Main Cabinet Color Presets
  document.querySelectorAll('#studioColorOptions .studio-option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const optId = btn.dataset.optionId;
      activeColorOptionId = optId;
      focusedOptionId = optId;
      customPaletteSelection = null;
      if (studioViewMode === 'before') studioViewMode = 'render';
      document.querySelectorAll('#paletteSwatchesList .palette-chip').forEach((c) => c.classList.remove('active'));
      updateStudioPreviewUI();
    });
  });

  // Click handlers for Color Swatch Palette (کالیته رنگ دلخواه)
  document.querySelectorAll('#paletteSwatchesList .palette-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#paletteSwatchesList .palette-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      customPaletteSelection = {
        name: chip.dataset.paletteName || 'رنگ انتخابی از کالیته',
        upperHex: chip.dataset.paletteHex || '#e6dfd3',
        lowerHex: chip.dataset.paletteLower || chip.dataset.paletteHex || '#c4b7a6',
      };
      if (studioViewMode === 'before') studioViewMode = 'render';
      updateStudioPreviewUI();
    });
  });

  const customPaletteColorInput = document.getElementById('customPaletteColorInput');
  if (customPaletteColorInput) {
    customPaletteColorInput.addEventListener('input', (e) => {
      const hex = e.target.value;
      document.querySelectorAll('#paletteSwatchesList .palette-chip').forEach((c) => c.classList.remove('active'));
      customPaletteSelection = {
        name: `رنگ سفارشی کالیته (${hex.toUpperCase()})`,
        upperHex: hex,
        lowerHex: hex,
      };
      if (studioViewMode === 'before') studioViewMode = 'render';
      updateStudioPreviewUI();
    });
  }

  // Click handlers for Addon Options (Island, Coffee Bar, Countertop, Backsplash)
  document.querySelectorAll('#studioAddonOptions .studio-option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const optId = btn.dataset.optionId;
      if (activeAddonIds.has(optId)) {
        activeAddonIds.delete(optId);
        focusedOptionId = activeColorOptionId;
      } else {
        activeAddonIds.add(optId);
        focusedOptionId = optId;
      }
      if (studioViewMode === 'before') studioViewMode = 'render';
      updateStudioPreviewUI();
    });
  });

  if (studioCompareToggleBtn) {
    studioCompareToggleBtn.addEventListener('click', () => {
      if (studioViewMode === 'render') {
        studioViewMode = 'sketch';
      } else if (studioViewMode === 'sketch') {
        studioViewMode = 'before';
      } else {
        studioViewMode = 'render';
      }
      updateStudioPreviewUI();
    });
  }

  // Initial render on page load
  updateStudioPreviewUI();

  // AI Analyze Button
  const analyzeKitchenBtn = document.getElementById('analyzeKitchenBtn');
  const aiAnalysisBox = document.getElementById('aiAnalysisBox');
  const aiLayoutText = document.getElementById('aiLayoutText');
  const aiColorText = document.getElementById('aiColorText');
  const aiScoreBadge = document.getElementById('aiScoreBadge');

  if (analyzeKitchenBtn) {
    analyzeKitchenBtn.addEventListener('click', async () => {
      const files = getUploadedStudioFiles();
      if (files.length === 0) {
        if (aiAnalysisBox) {
          aiAnalysisBox.classList.add('visible');
        }
        studioViewMode = 'render';
        updateStudioPreviewUI();
        showToast('اسکیچ و رندر نمونه آماده است! می‌توانید ۱ تا ۳ عکس از آشپزخانه خود نیز آپلود کنید.', 'info');
        return;
      }

      analyzeKitchenBtn.disabled = true;
      const origHtml = analyzeKitchenBtn.innerHTML;
      analyzeKitchenBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> در حال ساخت اسکیچ و رندر هوشمند...';

      try {
        const fd = new FormData();
        files.forEach((f) => fd.append('photos', f));

        const data = await apiFetch('/api/ai-studio/analyze', {
          method: 'POST',
          body: fd,
        });

        if (aiAnalysisBox) {
          aiAnalysisBox.classList.add('visible');
        }
        if (aiLayoutText && data.analysis) {
          aiLayoutText.textContent = `${data.analysis.detectedLayout} (${toPersianDigits(data.analysis.photosCount)} تصویر بررسی شد)`;
        }
        if (aiColorText && data.analysis) {
          aiColorText.textContent = data.analysis.recommendedPrimaryColor;
        }
        if (aiScoreBadge && data.analysis) {
          aiScoreBadge.textContent = `امتیاز صرفه اقتصادی بازسازی: ${toPersianDigits(data.analysis.feasibilityScore)}٪`;
        }

        if (activeUserSlotIdx < 0) {
          activeUserSlotIdx = studioSlotImages.findIndex(Boolean);
        }
        studioViewMode = 'render';
        updateStudioPreviewUI();

        showToast('اسکیچ و رندر معماری آشپزخانه شما ساخته شد! اکنون رنگ‌ها و گزینه‌ها را روی رندر امتحان کنید.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        analyzeKitchenBtn.disabled = false;
        analyzeKitchenBtn.innerHTML = origHtml;
        updateStudioSlotsUI();
      }
    });
  }

  // Transfer selected AI Studio options + photos to Inspection Form
  const applyStudioToFormBtn = document.getElementById('applyStudioToFormBtn');
  const inspNotes = document.getElementById('inspNotes');

  function getSelectedStudioSummaryText() {
    const colorLabel = customPaletteSelection
      ? customPaletteSelection.name
      : STUDIO_OPTIONS_MAP[activeColorOptionId]?.title || '';
    const addonTitles = Array.from(activeAddonIds)
      .map((id) => STUDIO_OPTIONS_MAP[id]?.title)
      .filter(Boolean);
    const parts = [`رنگ انتخابی از کالیته / استودیو: ${colorLabel}`];
    if (addonTitles.length > 0) {
      parts.push(`تغییرات جانبی انتخابی: ${addonTitles.join(' + ')}`);
    }
    return parts.join(' | ');
  }

  if (applyStudioToFormBtn) {
    applyStudioToFormBtn.addEventListener('click', () => {
      if (inspNotes) {
        inspNotes.value = getSelectedStudioSummaryText();
      }
      syncStudioFilesToInspectionForm();
      const inspectionSection = document.getElementById('inspection');
      if (inspectionSection) {
        inspectionSection.scrollIntoView({ behavior: 'smooth' });
      }
      showToast('رنگ انتخابی و عکس‌های شما به فرم درخواست بازدید رایگان منتقل شد.', 'success');
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

  // Initialize Studio default view
  updateStudioSlotsUI();
  updateStudioPreviewUI();
});
