document.addEventListener('DOMContentLoaded', () => {
  const {
    initBeforeAfterSliders,
    toPersianDigits,
    formatMillions,
    apiFetch,
    showToast,
    escapeHtml,
  } = window.NoKabin;

  // 1. Initialize Hero Before/After Slider
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

  // 3. AI Kitchen Studio — 3-Photo Uploader + Interactive Preview Options
  const STUDIO_OPTIONS_MAP = {
    color_greige: {
      id: 'color_greige',
      type: 'color',
      title: 'گریژ گرم دو رنگ (کد نیپون NP N 1864T + 3026P)',
      badge: 'پیش‌نمایش: گریژ گرم دو رنگ (NP N 1864T + 3026P)',
      desc: 'کابینت بالا گریژ روشن گرم + کابینت پایین گریژ متوسط — بهترین هماهنگی با صفحه و کاشی کرم/بژ و کف سنگ خاکستری بدون کوچک‌ترین تخریب.',
      previewImage: '/assets/studio-color-greige.jpg',
      beforeImage: '/assets/before-1.jpg',
      extraMillions: 0,
    },
    color_nordic: {
      id: 'color_nordic',
      type: 'color',
      title: 'سفید گرم نوردیک (Ivory / Alabaster)',
      badge: 'پیش‌نمایش: سفید گرم نوردیک (پلی‌اورتان غیرکوره‌ای)',
      desc: 'روشن‌ترین انتخاب برای بزرگ‌تر و دلبازتر دیده شدن فضای آشپزخانه با پوشش ابریشمی سوپرمات پلی‌اورتان غیرکوره‌ای.',
      previewImage: '/assets/studio-color-nordic.jpg',
      beforeImage: '/assets/before-1.jpg',
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

  const studioSlotFiles = [null, null, null];
  let activeColorOptionId = 'color_greige';
  const activeAddonIds = new Set();
  let focusedOptionId = 'color_greige';
  let showingBeforeInStudio = false;

  const studioPreviewImg = document.getElementById('studioPreviewImg');
  const studioPreviewBadge = document.getElementById('studioPreviewBadge');
  const studioPreviewTitle = document.getElementById('studioPreviewTitle');
  const studioPreviewDesc = document.getElementById('studioPreviewDesc');
  const studioCompareToggleBtn = document.getElementById('studioCompareToggleBtn');
  const selectedOptionsCountEl = document.getElementById('selectedOptionsCount');
  const studioTotalEstimateEl = document.getElementById('studioTotalEstimate');
  const uploadedCountBadge = document.getElementById('uploadedCountBadge');
  const userUploadedStrip = document.getElementById('userUploadedStrip');
  const userUploadedThumbs = document.getElementById('userUploadedThumbs');

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
        const reader = new FileReader();
        reader.onload = (ev) => {
          thumbImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        slotEl.classList.remove('has-file');
        if (removeBtn) removeBtn.style.display = 'none';
        if (subEl) subEl.textContent = 'کلیک برای انتخاب عکس';
        if (thumbImg) thumbImg.remove();
      }
    });

    // Update thumbnail strip inside preview card
    if (userUploadedStrip && userUploadedThumbs) {
      const files = getUploadedStudioFiles();
      if (files.length === 0) {
        userUploadedStrip.style.display = 'none';
        userUploadedThumbs.innerHTML = '';
      } else {
        userUploadedStrip.style.display = 'block';
        userUploadedThumbs.innerHTML = '';
        files.forEach((f, i) => {
          const thumb = document.createElement('img');
          thumb.style.cssText = 'width:58px;height:44px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid rgba(181,137,70,0.7);';
          thumb.title = `مشاهده عکس آپلودشده ${i + 1}`;
          const reader = new FileReader();
          reader.onload = (ev) => {
            thumb.src = ev.target.result;
            thumb.addEventListener('click', () => {
              if (studioPreviewImg) studioPreviewImg.src = ev.target.result;
              if (studioPreviewBadge) {
                studioPreviewBadge.textContent = `عکس آپلودشده شماره ${toPersianDigits(i + 1)} آشپزخانه شما`;
              }
            });
          };
          reader.readAsDataURL(f);
          userUploadedThumbs.appendChild(thumb);
        });
      }
    }
  }

  document.querySelectorAll('.studio-slot-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const slotIdx = Number(input.dataset.slot);
      const file = (e.target.files || [])[0];
      if (!file) return;
      studioSlotFiles[slotIdx] = file;
      input.value = '';
      updateStudioSlotsUI();
      syncStudioFilesToInspectionForm();
    });
  });

  document.querySelectorAll('[data-remove-slot]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(btn.dataset.removeSlot);
      studioSlotFiles[idx] = null;
      updateStudioSlotsUI();
      syncStudioFilesToInspectionForm();
    });
  });

  function updateStudioPreviewUI() {
    const focused = STUDIO_OPTIONS_MAP[focusedOptionId] || STUDIO_OPTIONS_MAP[activeColorOptionId];
    if (!focused) return;

    // Highlight active buttons
    document.querySelectorAll('#studioColorOptions .studio-option-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.optionId === activeColorOptionId);
    });
    document.querySelectorAll('#studioAddonOptions .studio-option-btn').forEach((btn) => {
      btn.classList.toggle('active', activeAddonIds.has(btn.dataset.optionId));
    });

    // Update image & text
    if (studioPreviewImg) {
      studioPreviewImg.src = showingBeforeInStudio ? focused.beforeImage : focused.previewImage;
    }
    if (studioPreviewBadge) {
      studioPreviewBadge.textContent = showingBeforeInStudio
        ? 'نمای قبل از بازسازی (کابینت قهوه‌ای قدیمی)'
        : focused.badge;
    }
    if (studioPreviewTitle) {
      studioPreviewTitle.textContent = focused.title;
    }
    if (studioPreviewDesc) {
      studioPreviewDesc.textContent = focused.desc;
    }
    if (studioCompareToggleBtn) {
      studioCompareToggleBtn.innerHTML = showingBeforeInStudio
        ? '<i class="fa-solid fa-wand-magic-sparkles"></i> بازگشت به پیش‌نمایش بعد از بازسازی'
        : '<i class="fa-solid fa-eye"></i> نمایش عکس قبل از بازسازی';
    }

    // Calculate total estimate based on base 70M + selected color + selected addons
    let totalMillions = 70;
    const colorOpt = STUDIO_OPTIONS_MAP[activeColorOptionId];
    if (colorOpt) totalMillions += colorOpt.extraMillions;
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

  // Click handlers for Cabinet Color Options
  document.querySelectorAll('#studioColorOptions .studio-option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const optId = btn.dataset.optionId;
      activeColorOptionId = optId;
      focusedOptionId = optId;
      showingBeforeInStudio = false;
      updateStudioPreviewUI();
    });
  });

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
        showToast('تحلیل نمونه استاندارد فعال شد. برای تحلیل آشپزخانه خودتان، ۱ تا ۳ عکس بالا آپلود کنید.', 'info');
        return;
      }

      analyzeKitchenBtn.disabled = true;
      const origHtml = analyzeKitchenBtn.innerHTML;
      analyzeKitchenBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> در حال تحلیل تصاویر با هوش مصنوعی...';

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

        showToast('تحلیل هوش مصنوعی آشپزخانه شما انجام شد! اکنون روی گزینه‌ها کلیک کنید.', 'success');
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
    const colorOpt = STUDIO_OPTIONS_MAP[activeColorOptionId];
    const addonTitles = Array.from(activeAddonIds)
      .map((id) => STUDIO_OPTIONS_MAP[id]?.title)
      .filter(Boolean);
    const parts = [`رنگ انتخابی در استودیو هوش مصنوعی: ${colorOpt ? colorOpt.title : ''}`];
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
      showToast('گزینه‌های انتخابی شما در فرم درخواست بازدید رایگان درج شد.', 'success');
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
