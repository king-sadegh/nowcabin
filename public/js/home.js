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

  // 3. Interactive Sample Kitchen Visual Catalog (Fast Pre-Generated Iranian Kitchen Variants)
  const catalogPreviewImg = document.getElementById('catalogPreviewImg');
  const catalogPreviewBadge = document.getElementById('catalogPreviewBadge');
  const catalogPreviewTitle = document.getElementById('catalogPreviewTitle');
  const catalogPreviewDesc = document.getElementById('catalogPreviewDesc');
  const catalogFinishTag = document.getElementById('catalogFinishTag');
  const catalogResetBeforeBtn = document.getElementById('catalogResetBeforeBtn');
  const applyStudioToFormBtn = document.getElementById('applyStudioToFormBtn');
  const inspNotes = document.getElementById('inspNotes');

  const BASE_BEFORE_IMAGE = '/uploads/sample-kitchen/base/iranian_kitchen_before.jpg';

  const catalogState = {
    isBeforeMode: false,
    activeCategory: 'colors',
    activeColorTitle: 'بژ کشمیری',
    activeHandleTitle: 'دستگیره میله‌ای نقره‌ای',
    activeCountertopTitle: 'صفحه گرم فابریک',
    activeFinishId: 'satin',
    activeFinishLabel: 'ساتن نیمه‌براق ابریشمی',
    activeImageUrl: '/uploads/sample-kitchen/colors/cashmere_beige.jpg',
    activeDesc: 'رنگ پلی‌اورتان بژ کشمیری گرم و خنثی — پرطرفدارترین انتخاب آپارتمانی',
  };

  // Preload all catalog images in background for instant zero-lag switching
  const preloadedUrls = new Set([BASE_BEFORE_IMAGE]);
  document.querySelectorAll('#catalogOptionsPanel .catalog-chip').forEach((chip) => {
    const url = chip.dataset.img;
    if (url && !preloadedUrls.has(url)) {
      preloadedUrls.add(url);
      const preImg = new Image();
      preImg.src = url;
    }
  });
  const preBase = new Image();
  preBase.src = BASE_BEFORE_IMAGE;

  function renderCatalogPreview() {
    if (!catalogPreviewImg) return;

    if (catalogState.isBeforeMode) {
      catalogPreviewImg.src = BASE_BEFORE_IMAGE;
      catalogPreviewImg.classList.remove('is-matte');
      if (catalogPreviewBadge) {
        catalogPreviewBadge.textContent = 'آشپزخانه نمونه ایرانی — وضعیت اولیه (قبل از بازسازی)';
      }
      if (catalogPreviewTitle) {
        catalogPreviewTitle.textContent = 'وضعیت اولیه آشپزخانه (پیش از بازسازی)';
      }
      if (catalogPreviewDesc) {
        catalogPreviewDesc.textContent = 'کابینت ملامینه طرح چوب قدیمی — برای مشاهده تغییرات، یکی از گزینه‌ها را انتخاب کنید.';
      }
      if (catalogResetBeforeBtn) {
        catalogResetBeforeBtn.classList.add('active');
        catalogResetBeforeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span>بازگشت به حالت بازسازی‌شده</span>';
      }
      return;
    }

    catalogPreviewImg.src = catalogState.activeImageUrl;
    catalogPreviewImg.classList.toggle('is-matte', catalogState.activeFinishId === 'matte');

    const activeHeadline =
      catalogState.activeCategory === 'handles'
        ? catalogState.activeHandleTitle
        : catalogState.activeCategory === 'countertops'
          ? catalogState.activeCountertopTitle
          : catalogState.activeColorTitle;

    if (catalogPreviewBadge) {
      catalogPreviewBadge.textContent = `آشپزخانه نمونه ایرانی — ${activeHeadline}`;
    }
    if (catalogPreviewTitle) {
      catalogPreviewTitle.textContent = `${activeHeadline} — رنگ پلی‌اورتان`;
    }
    if (catalogPreviewDesc) {
      catalogPreviewDesc.textContent = catalogState.activeDesc;
    }
    if (catalogFinishTag) {
      catalogFinishTag.textContent = `پرداخت: ${catalogState.activeFinishLabel}`;
    }
    if (catalogResetBeforeBtn) {
      catalogResetBeforeBtn.classList.remove('active');
      catalogResetBeforeBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i><span>بازگشت به تصویر اولیه</span>';
    }
  }

  document.querySelectorAll('#catalogOptionsPanel .catalog-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.category || 'colors';
      const parentList = chip.closest('.palette-swatches');
      if (parentList) {
        parentList.querySelectorAll('.catalog-chip').forEach((c) => c.classList.remove('active'));
      }
      chip.classList.add('active');

      catalogState.isBeforeMode = false;
      catalogState.activeCategory = cat;
      catalogState.activeImageUrl = chip.dataset.img || BASE_BEFORE_IMAGE;
      catalogState.activeDesc = chip.dataset.desc || '';

      if (cat === 'colors') catalogState.activeColorTitle = chip.dataset.title || '';
      else if (cat === 'handles') catalogState.activeHandleTitle = chip.dataset.title || '';
      else if (cat === 'countertops') catalogState.activeCountertopTitle = chip.dataset.title || '';

      renderCatalogPreview();
    });
  });

  document.querySelectorAll('#catalogFinishesList .finish-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalogFinishesList .finish-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      catalogState.isBeforeMode = false;
      catalogState.activeFinishId = chip.dataset.finishId || 'satin';
      catalogState.activeFinishLabel = chip.dataset.finishLabel || 'ساتن نیمه‌براق ابریشمی';
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
        inspNotes.value = `انتخاب از کاتالوگ نوکابین: رنگ ${catalogState.activeColorTitle} | ${catalogState.activeHandleTitle} | ${catalogState.activeCountertopTitle} | پرداخت ${catalogState.activeFinishLabel}`;
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
