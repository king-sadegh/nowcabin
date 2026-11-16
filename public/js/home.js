document.addEventListener('DOMContentLoaded', () => {
  const {
    initBeforeAfterSliders,
    toPersianDigits,
    formatMillions,
    apiFetch,
    showToast,
    escapeHtml,
  } = window.NoKabin;

  // 1. Before/After Hero Slider
  initBeforeAfterSliders(document);

  // 2. Interactive 1/10 Cost Calculator (70M vs 700M at 10m standard)
  const metersRange = document.getElementById('metersRange');
  const metersDisplay = document.getElementById('metersDisplay');
  const calcReno = document.getElementById('calcReno');
  const calcReplace = document.getElementById('calcReplace');
  const calcSavings = document.getElementById('calcSavings');

  function updateCalculator() {
    if (!metersRange) return;
    const m = Number(metersRange.value) || 10;
    const renoCost = m * 7000000; // 10m -> 70,000,000
    const replaceCost = renoCost * 10; // 10m -> 700,000,000 (exact 1/10 ratio)
    const savings = replaceCost - renoCost;

    metersDisplay.textContent = `${toPersianDigits(m)} متر`;
    calcReno.textContent = formatMillions(renoCost);
    calcReplace.textContent = formatMillions(replaceCost);
    calcSavings.textContent = `${formatMillions(savings)} صرفه‌جویی`;
  }

  if (metersRange) {
    metersRange.addEventListener('input', updateCalculator);
    updateCalculator();
  }

  // 3. Referral link auto-fill (?ref=09...)
  const params = new URLSearchParams(window.location.search);
  const urlRef = params.get('ref');
  if (urlRef) {
    localStorage.setItem('nokabin_ref', urlRef);
  }
  const savedRef = urlRef || localStorage.getItem('nokabin_ref') || '';
  const referrerInput = document.getElementById('inspReferrer');
  if (referrerInput && savedRef) {
    referrerInput.value = savedRef;
  }

  // 4. Multi-photo upload preview with removal
  const photoInput = document.getElementById('inspPhotos');
  const previewContainer = document.getElementById('inspPhotoPreviews');
  let selectedFiles = [];

  function renderPreviews() {
    if (!previewContainer) return;
    previewContainer.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
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
        selectedFiles.splice(idx, 1);
        renderPreviews();
      });

      item.appendChild(img);
      item.appendChild(removeBtn);
      previewContainer.appendChild(item);
    });
  }

  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const incoming = Array.from(e.target.files || []);
      for (const f of incoming) {
        if (selectedFiles.length >= 5) {
          showToast('حداکثر ۵ عکس می‌توانید همزمان انتخاب کنید.', 'error');
          break;
        }
        selectedFiles.push(f);
      }
      photoInput.value = '';
      renderPreviews();
    });
  }

  // 5. Free Inspection Form Submission
  const inspectionForm = document.getElementById('inspectionForm');
  const inspMsg = document.getElementById('inspFormMessage');
  const inspBtn = document.getElementById('inspSubmitBtn');

  if (inspectionForm) {
    inspectionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      inspMsg.innerHTML = '';
      inspBtn.disabled = true;
      inspBtn.textContent = 'در حال ثبت درخواست...';

      try {
        const fd = new FormData(inspectionForm);
        selectedFiles.forEach((f) => fd.append('photos', f));

        const data = await apiFetch('/api/inspections', {
          method: 'POST',
          body: fd,
        });

        showToast(data.message, 'success');
        inspMsg.innerHTML = `
          <div class="info-banner olive">
            ${escapeHtml(data.message)}
            <div style="margin-top: 8px;">
              <a href="/panel.html?role=customer" class="btn btn-outline btn-sm">مشاهده وضعیت در پنل مشتری</a>
            </div>
          </div>
        `;
        inspectionForm.reset();
        if (savedRef && referrerInput) referrerInput.value = savedRef;
        selectedFiles = [];
        renderPreviews();
      } catch (err) {
        showToast(err.message, 'error');
        inspMsg.innerHTML = `<div class="info-banner danger">${escapeHtml(err.message)}</div>`;
      } finally {
        inspBtn.disabled = false;
        inspBtn.textContent = 'ثبت درخواست بازدید و کارشناسی رایگان';
      }
    });
  }

  // 6. Real Estate Agent Collaboration Form Submission
  const agentForm = document.getElementById('agentForm');
  const agentMsg = document.getElementById('agentFormMessage');
  const agentBtn = document.getElementById('agentSubmitBtn');

  if (agentForm) {
    agentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      agentMsg.innerHTML = '';
      agentBtn.disabled = true;
      agentBtn.textContent = 'در حال ثبت اطلاعات...';

      try {
        const formData = new FormData(agentForm);
        const payload = Object.fromEntries(formData.entries());
        const data = await apiFetch('/api/agents/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const refUrl = `${window.location.origin}/?ref=${encodeURIComponent(data.referralPhone)}`;
        showToast(data.message, 'success');
        agentMsg.innerHTML = `
          <div class="info-banner olive">
            <p>${escapeHtml(data.message)}</p>
            <p style="margin-top: 8px; font-size: 0.85rem;">لینک دعوت اختصاصی شما:</p>
            <div class="ltr" style="background: #fff; padding: 8px 10px; border-radius: 8px; margin: 6px 0; word-break: break-all; width: 100%; border: 1px solid #b7dcc5;">
              ${escapeHtml(refUrl)}
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
              <button type="button" class="btn btn-outline btn-sm" id="copyAgentRefBtn">کپی لینک دعوت</button>
              <a href="/panel.html?role=agent" class="btn btn-primary btn-sm">ورود به پنل مشاورین املاک</a>
            </div>
          </div>
        `;
        const copyBtn = document.getElementById('copyAgentRefBtn');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            navigator.clipboard?.writeText(refUrl);
            showToast('لینک دعوت کپی شد!', 'success');
          });
        }
        agentForm.reset();
      } catch (err) {
        showToast(err.message, 'error');
        agentMsg.innerHTML = `<div class="info-banner danger">${escapeHtml(err.message)}</div>`;
      } finally {
        agentBtn.disabled = false;
        agentBtn.textContent = 'ثبت‌نام همکاری و دریافت لینک دعوت اختصاصی';
      }
    });
  }
});
