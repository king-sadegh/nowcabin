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
  const studioSlotProfiles = [null, null, null];

  let activeUserSlotIdx = -1; // -1 means using site sample photo; 0..2 means using user's uploaded photo
  let activeColorOptionId = 'color_greige';
  let customPaletteSelection = null; // { name, upperHex, lowerHex } when chosen from کالیته رنگ
  const activeAddonIds = new Set();
  let focusedOptionId = 'color_greige';
  let showingBeforeInStudio = false;

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

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // Analyze dominant cabinet surface colors in a user-uploaded kitchen image
  function buildCabinetProfile(img) {
    const off = document.createElement('canvas');
    const w = 120;
    const h = 90;
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    // Quantize colors in upper & lower cabinet bands (y: 12%..40% and 55%..84%)
    const bins = new Map();
    for (let y = Math.floor(h * 0.12); y < Math.floor(h * 0.85); y++) {
      const ny = y / h;
      // Skip thin middle backsplash/counter slit during initial seed clustering
      if (ny > 0.42 && ny < 0.53) continue;
      for (let x = Math.floor(w * 0.08); x < Math.floor(w * 0.92); x++) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Ignore pure specular white lights or deep black appliance glass
        if (lum > 242 || lum < 20) continue;

        const qr = Math.round(r / 24) * 24;
        const qg = Math.round(g / 24) * 24;
        const qb = Math.round(b / 24) * 24;
        const key = `${qr},${qg},${qb}`;
        const prev = bins.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0, satSum: 0 };
        prev.count += 1;
        prev.rSum += r;
        prev.gSum += g;
        prev.bSum += b;
        prev.satSum += maxC - minC;
        bins.set(key, prev);
      }
    }

    const sorted = Array.from(bins.values()).sort((a, b) => b.count - a.count);
    const clusters = sorted.slice(0, 4).map((c) => {
      const r = c.rSum / c.count;
      const g = c.gSum / c.count;
      const b = c.bSum / c.count;
      return {
        r,
        g,
        b,
        lum: (0.299 * r + 0.587 * g + 0.114 * b) / 255,
        tolerance: 95,
      };
    });

    if (clusters.length === 0) {
      clusters.push({ r: 140, g: 105, b: 75, lum: 0.43, tolerance: 105 });
    }

    return {
      clusters,
      userSampled: [],
    };
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

  // Render user's uploaded kitchen photo with polyurethane cabinet recoloring & active addons
  function renderUserPhotoToCanvas() {
    if (!studioPreviewCanvas || activeUserSlotIdx < 0) return;
    const img = studioSlotImages[activeUserSlotIdx];
    const profile = studioSlotProfiles[activeUserSlotIdx];
    if (!img || !profile) return;

    const targetW = 760;
    const targetH = Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * targetW) || 570;
    studioPreviewCanvas.width = targetW;
    studioPreviewCanvas.height = targetH;

    const ctx = studioPreviewCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // If user clicked "Compare Before", show their original untouched photo
    if (showingBeforeInStudio) {
      return;
    }

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const d = imgData.data;

    const { upper: upperRGB, lower: lowerRGB } = getActivePaintColors();
    const upperTargetLum = (0.299 * upperRGB.r + 0.587 * upperRGB.g + 0.114 * upperRGB.b) / 255;
    const lowerTargetLum = (0.299 * lowerRGB.r + 0.587 * lowerRGB.g + 0.114 * lowerRGB.b) / 255;

    const allClusters = [...profile.userSampled, ...profile.clusters];

    for (let y = 0; y < targetH; y++) {
      const ny = y / targetH;
      // Vertical envelope: cabinets live primarily between 6% and 90% of height
      const topFade = smoothstep(0.03, 0.10, ny);
      const bottomFade = 1 - smoothstep(0.86, 0.96, ny);
      const zoneWeight = topFade * bottomFade;
      if (zoneWeight <= 0.01) continue;

      // Smooth transition between upper cabinets (ny < 0.44) and lower cabinets (ny > 0.50)
      const lowerMix = smoothstep(0.43, 0.51, ny);
      const tr = upperRGB.r * (1 - lowerMix) + lowerRGB.r * lowerMix;
      const tg = upperRGB.g * (1 - lowerMix) + lowerRGB.g * lowerMix;
      const tb = upperRGB.b * (1 - lowerMix) + lowerRGB.b * lowerMix;
      const tLum = upperTargetLum * (1 - lowerMix) + lowerTargetLum * lowerMix;

      for (let x = 0; x < targetW; x++) {
        const idx = (y * targetW + x) * 4;
        const r = d[idx];
        const g = d[idx + 1];
        const b = d[idx + 2];

        const lum255 = 0.299 * r + 0.587 * g + 0.114 * b;
        // Protect very dark appliance glass/screens & pure white lights
        if (lum255 < 18 || lum255 > 246) continue;

        // Find closest cabinet cluster
        let bestMask = 0;
        let refLum = 0.45;
        for (let cIdx = 0; cIdx < allClusters.length; cIdx++) {
          const cl = allClusters[cIdx];
          const dr = r - cl.r;
          const dg = g - cl.g;
          const db = b - cl.b;
          const dist = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
          const tol = cl.tolerance || 95;
          const m = 1 - smoothstep(tol * 0.55, tol * 1.35, dist);
          if (m > bestMask) {
            bestMask = m;
            refLum = cl.lum;
          }
        }

        const finalAlpha = bestMask * zoneWeight * 0.9;
        if (finalAlpha <= 0.03) continue;

        // Luminance-preserving polyurethane finish (keeps door grooves, bevels, and 3D shadows)
        const pixLum = lum255 / 255;
        const shadeDelta = (pixLum - refLum) * 0.82;
        const outLum = Math.max(0.05, Math.min(0.97, tLum + shadeDelta));
        const scale = outLum / Math.max(0.06, tLum);

        const paintedR = clampByte(tr * scale);
        const paintedG = clampByte(tg * scale);
        const paintedB = clampByte(tb * scale);

        d[idx] = clampByte(r * (1 - finalAlpha) + paintedR * finalAlpha);
        d[idx + 1] = clampByte(g * (1 - finalAlpha) + paintedG * finalAlpha);
        d[idx + 2] = clampByte(b * (1 - finalAlpha) + paintedB * finalAlpha);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Overlay visual previews for structural/surface addons on the user's photo
    if (activeAddonIds.has('change_backsplash')) {
      const bsTop = Math.round(targetH * 0.37);
      const bsHeight = Math.round(targetH * 0.12);
      ctx.save();
      const grad = ctx.createLinearGradient(0, bsTop, 0, bsTop + bsHeight);
      grad.addColorStop(0, 'rgba(246, 236, 218, 0.78)');
      grad.addColorStop(0.5, 'rgba(235, 224, 206, 0.72)');
      grad.addColorStop(1, 'rgba(225, 212, 192, 0.76)');
      ctx.fillStyle = grad;
      ctx.fillRect(Math.round(targetW * 0.08), bsTop, Math.round(targetW * 0.84), bsHeight);

      // Subtle warm LED strip glow under upper cabinets
      const ledGrad = ctx.createLinearGradient(0, bsTop, 0, bsTop + Math.round(bsHeight * 0.35));
      ledGrad.addColorStop(0, 'rgba(255, 214, 140, 0.75)');
      ledGrad.addColorStop(1, 'rgba(255, 214, 140, 0)');
      ctx.fillStyle = ledGrad;
      ctx.fillRect(Math.round(targetW * 0.08), bsTop, Math.round(targetW * 0.84), Math.round(bsHeight * 0.35));
      ctx.restore();
    }

    if (activeAddonIds.has('refinish_countertop')) {
      const ctY = Math.round(targetH * 0.49);
      const ctH = Math.round(targetH * 0.055);
      ctx.save();
      const ctGrad = ctx.createLinearGradient(0, ctY, 0, ctY + ctH);
      ctGrad.addColorStop(0, 'rgba(250, 247, 240, 0.88)');
      ctGrad.addColorStop(1, 'rgba(230, 222, 210, 0.88)');
      ctx.fillStyle = ctGrad;
      ctx.fillRect(Math.round(targetW * 0.07), ctY, Math.round(targetW * 0.86), ctH);
      ctx.restore();
    }

    if (activeAddonIds.has('add_coffeebar')) {
      const cbX = Math.round(targetW * 0.70);
      const cbY = Math.round(targetH * 0.34);
      const cbW = Math.round(targetW * 0.22);
      const cbH = Math.round(targetH * 0.20);
      ctx.save();
      // Warm backlight glow
      const glow = ctx.createRadialGradient(cbX + cbW / 2, cbY + cbH / 2, 6, cbX + cbW / 2, cbY + cbH / 2, cbW * 0.8);
      glow.addColorStop(0, 'rgba(255, 208, 132, 0.55)');
      glow.addColorStop(1, 'rgba(255, 208, 132, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cbX - 10, cbY - 10, cbW + 20, cbH + 20);

      // Two floating wood shelves
      ctx.fillStyle = '#7a542e';
      ctx.fillRect(cbX, cbY + Math.round(cbH * 0.22), cbW, 7);
      ctx.fillRect(cbX, cbY + Math.round(cbH * 0.52), cbW, 7);

      // Espresso machine & cups silhouette on counter
      ctx.fillStyle = '#26201b';
      ctx.fillRect(cbX + Math.round(cbW * 0.15), cbY + Math.round(cbH * 0.62), Math.round(cbW * 0.34), Math.round(cbH * 0.34));
      ctx.fillStyle = '#f5efe6';
      ctx.fillRect(cbX + Math.round(cbW * 0.60), cbY + Math.round(cbH * 0.36), 12, 12);
      ctx.fillRect(cbX + Math.round(cbW * 0.74), cbY + Math.round(cbH * 0.36), 12, 12);
      ctx.restore();
    }

    if (activeAddonIds.has('add_island')) {
      const islW = Math.round(targetW * 0.54);
      const islH = Math.round(targetH * 0.26);
      const islX = Math.round((targetW - islW) / 2);
      const islY = Math.round(targetH * 0.67);
      ctx.save();
      // Floor shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      ctx.ellipse(islX + islW / 2, islY + islH + 4, islW * 0.52, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Island cabinet body painted in selected lower cabinet polyurethane color
      ctx.fillStyle = `rgb(${lowerRGB.r}, ${lowerRGB.g}, ${lowerRGB.b})`;
      ctx.fillRect(islX, islY + 14, islW, islH - 14);

      // Recessed panel lines on island
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 2;
      const panelW = Math.floor((islW - 36) / 3);
      for (let p = 0; p < 3; p++) {
        ctx.strokeRect(islX + 12 + p * (panelW + 6), islY + 24, panelW, islH - 34);
      }

      // Quartz stone countertop overhang
      ctx.fillStyle = '#f5f0e6';
      ctx.fillRect(islX - 8, islY, islW + 16, 15);
      ctx.strokeStyle = '#d5cbbd';
      ctx.lineWidth = 1;
      ctx.strokeRect(islX - 8, islY, islW + 16, 15);
      ctx.restore();
    }
  }

  // Click on canvas to calibrate exact cabinet door color from user's photo
  if (studioPreviewCanvas) {
    studioPreviewCanvas.addEventListener('click', (e) => {
      if (activeUserSlotIdx < 0) return;
      const img = studioSlotImages[activeUserSlotIdx];
      const profile = studioSlotProfiles[activeUserSlotIdx];
      if (!img || !profile) return;

      const rect = studioPreviewCanvas.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      const relY = (e.clientY - rect.top) / Math.max(1, rect.height);

      const off = document.createElement('canvas');
      off.width = 160;
      off.height = 120;
      const octx = off.getContext('2d');
      octx.drawImage(img, 0, 0, 160, 120);
      const sx = Math.max(2, Math.min(157, Math.round(relX * 160)));
      const sy = Math.max(2, Math.min(117, Math.round(relY * 120)));
      const patch = octx.getImageData(sx - 2, sy - 2, 5, 5).data;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      const count = 25;
      for (let i = 0; i < patch.length; i += 4) {
        rSum += patch[i];
        gSum += patch[i + 1];
        bSum += patch[i + 2];
      }
      const r = rSum / count;
      const g = gSum / count;
      const b = bSum / count;

      profile.userSampled.unshift({
        r,
        g,
        b,
        lum: (0.299 * r + 0.587 * g + 0.114 * b) / 255,
        tolerance: 105,
      });
      if (profile.userSampled.length > 3) {
        profile.userSampled.pop();
      }

      showingBeforeInStudio = false;
      updateStudioPreviewUI();
      showToast('رنگ سطح انتخاب‌شده به الگوی کابینت عکس شما اضافه شد و رنگ جدید اعمال گردید.', 'success');
    });
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
            showingBeforeInStudio = false;
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
      showingBeforeInStudio = false;
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
          studioSlotProfiles[slotIdx] = buildCabinetProfile(img);
          activeUserSlotIdx = slotIdx;
          showingBeforeInStudio = false;
          updateStudioSlotsUI();
          updateStudioPreviewUI();
          syncStudioFilesToInspectionForm();
          showToast(`عکس ${toPersianDigits(slotIdx + 1)} شما بارگذاری شد! حالا روی رنگ‌های مختلف کلیک کنید تا روی عکس شما اعمال شود.`, 'success');
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
      studioSlotProfiles[idx] = null;
      if (activeUserSlotIdx === idx) {
        const nextAvailable = studioSlotImages.findIndex(Boolean);
        activeUserSlotIdx = nextAvailable; // either 0..2 or -1
      }
      updateStudioSlotsUI();
      updateStudioPreviewUI();
      syncStudioFilesToInspectionForm();
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

    const isUsingUserPhoto = activeUserSlotIdx >= 0 && Boolean(studioSlotImages[activeUserSlotIdx]);

    if (calibrationHint) {
      calibrationHint.classList.toggle('visible', isUsingUserPhoto);
    }

    if (isUsingUserPhoto) {
      // Show canvas with user's own uploaded photo + live color/addon rendering
      if (studioPreviewImg) studioPreviewImg.style.display = 'none';
      if (studioPreviewCanvas) studioPreviewCanvas.style.display = 'block';
      renderUserPhotoToCanvas();

      const paintInfo = getActivePaintColors();
      if (studioPreviewBadge) {
        studioPreviewBadge.textContent = showingBeforeInStudio
          ? `عکس اصلی آشپزخانه شما (قبل از بازسازی)`
          : `اعمال روی عکس شما: ${paintInfo.label}`;
      }
      if (studioPreviewTitle) {
        studioPreviewTitle.textContent = customPaletteSelection
          ? `رنگ انتخابی از کالیته: ${customPaletteSelection.name}`
          : focused.title;
      }
      if (studioPreviewDesc) {
        studioPreviewDesc.textContent = customPaletteSelection
          ? `پیش‌نمایش رنگ «${customPaletteSelection.name}» از کالیته پلی‌اورتان روی عکس آشپزخانه شما (برای کالیبره کردن دقیق‌تر، روی درب کابینت در عکس کلیک کنید).`
          : focused.desc;
      }
    } else {
      // Using site's default sample kitchen photos
      if (studioPreviewCanvas) studioPreviewCanvas.style.display = 'none';
      if (studioPreviewImg) {
        studioPreviewImg.style.display = 'block';
        studioPreviewImg.src = showingBeforeInStudio ? focused.beforeImage : focused.previewImage;
      }

      if ( customPaletteSelection && !showingBeforeInStudio && studioPreviewCanvas && studioPreviewImg ) {
        // If user selected a custom color from کالیته on the default sample image, render it on canvas using before-1.jpg!
        if (!window.__defaultBeforeImg) {
          const sampleImg = new Image();
          sampleImg.onload = () => {
            window.__defaultBeforeImg = sampleImg;
            window.__defaultBeforeProfile = buildCabinetProfile(sampleImg);
            updateStudioPreviewUI();
          };
          sampleImg.src = '/assets/before-1.jpg';
        } else {
          studioPreviewImg.style.display = 'none';
          studioPreviewCanvas.style.display = 'block';
          const prevSlot = activeUserSlotIdx;
          studioSlotImages[99] = window.__defaultBeforeImg;
          studioSlotProfiles[99] = window.__defaultBeforeProfile;
          activeUserSlotIdx = 99;
          renderUserPhotoToCanvas();
          activeUserSlotIdx = prevSlot;
        }
      }

      if (studioPreviewBadge) {
        studioPreviewBadge.textContent = showingBeforeInStudio
          ? 'نمای قبل از بازسازی (کابینت قهوه‌ای قدیمی)'
          : customPaletteSelection
            ? `پیش‌نمایش کالیته: ${customPaletteSelection.name}`
            : focused.badge;
      }
      if (studioPreviewTitle) {
        studioPreviewTitle.textContent = customPaletteSelection
          ? `رنگ انتخابی از کالیته: ${customPaletteSelection.name}`
          : focused.title;
      }
      if (studioPreviewDesc) {
        studioPreviewDesc.textContent = customPaletteSelection
          ? `اجرای رنگ پلی‌اورتان «${customPaletteSelection.name}» از کالیته تخصصی نوکابین.`
          : focused.desc;
      }
    }

    if (studioCompareToggleBtn) {
      studioCompareToggleBtn.innerHTML = showingBeforeInStudio
        ? '<i class="fa-solid fa-wand-magic-sparkles"></i> بازگشت به پیش‌نمایش بعد از بازسازی'
        : '<i class="fa-solid fa-eye"></i> نمایش عکس قبل از بازسازی';
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
      showingBeforeInStudio = false;
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
      showingBeforeInStudio = false;
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
      showingBeforeInStudio = false;
      updateStudioPreviewUI();
    });
  }

  // Click handlers for Addon Options (Island, Coffee Bar, Countertop, Backsplash)
  document.querySelectorAll('#studioAddonOptions .studio-option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const optId = btn.dataset.optionId;
      if (activeAddonIds.has(optId) && focusedOptionId === optId) {
        activeAddonIds.delete(optId);
        focusedOptionId = activeColorOptionId;
      } else {
        activeAddonIds.add(optId);
        focusedOptionId = optId;
      }
      showingBeforeInStudio = false;
      updateStudioPreviewUI();
    });
  });

  if (studioCompareToggleBtn) {
    studioCompareToggleBtn.addEventListener('click', () => {
      showingBeforeInStudio = !showingBeforeInStudio;
      updateStudioPreviewUI();
    });
  }

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
        showToast('لطفاً ۱ تا ۳ عکس از آشپزخانه خود در کادرهای بالا انتخاب کنید تا رنگ‌ها روی عکس خودتان نمایش داده شود.', 'info');
        return;
      }

      analyzeKitchenBtn.disabled = true;
      const origHtml = analyzeKitchenBtn.innerHTML;
      analyzeKitchenBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> در حال تحلیل تصاویر آشپزخانه شما...';

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

        // Ensure user's uploaded photo is active and rendered with the current color
        if (activeUserSlotIdx < 0) {
          activeUserSlotIdx = studioSlotImages.findIndex(Boolean);
        }
        showingBeforeInStudio = false;
        updateStudioPreviewUI();

        showToast('تحلیل آشپزخانه شما انجام شد! اکنون با کلیک روی هر رنگ یا کالیته، تغییر را روی عکس خودتان ببینید.', 'success');
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
