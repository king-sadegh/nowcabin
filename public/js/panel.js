document.addEventListener('DOMContentLoaded', () => {
  const {
    STATUS_LABELS,
    escapeHtml,
    toPersianDigits,
    formatToman,
    formatMillions,
    showToast,
    apiFetch,
  } = window.NoKabin;

  const authSection = document.getElementById('authSection');
  const customerPanel = document.getElementById('customerPanel');
  const agentPanel = document.getElementById('agentPanel');
  const adminPanel = document.getElementById('adminPanel');
  const logoutBtn = document.getElementById('logoutBtn');

  let selectedAuthRole = 'customer';
  let pendingPhone = '';

  const urlRole = new URLSearchParams(window.location.search).get('role');
  if (['customer', 'agent', 'admin'].includes(urlRole)) {
    selectedAuthRole = urlRole;
  }

  function hideAllPanels() {
    authSection.style.display = 'none';
    customerPanel.style.display = 'none';
    agentPanel.style.display = 'none';
    adminPanel.style.display = 'none';
  }

  // ---------- Auth UI ----------
  const roleTabs = document.querySelectorAll('#authRoleTabs .role-tab');
  const extraFields = document.getElementById('extraRegisterFields');
  const agentExtraFields = document.getElementById('agentExtraFields');
  const otpRequestForm = document.getElementById('otpRequestForm');
  const otpVerifyForm = document.getElementById('otpVerifyForm');
  const authPhoneInput = document.getElementById('authPhone');
  const testOtpBanner = document.getElementById('testOtpBanner');
  const otpCodeInput = document.getElementById('otpCodeInput');

  function syncRoleTabsUI() {
    roleTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.role === selectedAuthRole);
    });
    if (selectedAuthRole === 'admin') {
      extraFields.style.display = 'none';
    } else if (selectedAuthRole === 'agent') {
      extraFields.style.display = 'block';
      agentExtraFields.style.display = 'block';
    } else {
      extraFields.style.display = 'block';
      agentExtraFields.style.display = 'none';
    }
  }

  roleTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedAuthRole = btn.dataset.role;
      syncRoleTabsUI();
    });
  });

  document.querySelectorAll('[data-demo-phone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedAuthRole = btn.dataset.demoRole;
      syncRoleTabsUI();
      authPhoneInput.value = btn.dataset.demoPhone;
      otpRequestForm.requestSubmit();
    });
  });

  otpRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: authPhoneInput.value,
          role: selectedAuthRole,
        }),
      });
      pendingPhone = data.phone;
      otpRequestForm.style.display = 'none';
      otpVerifyForm.style.display = 'block';

      if (data.testMode && data.testOtp) {
        testOtpBanner.innerHTML = `
          <div><strong>حالت تستی OTP فعال است:</strong></div>
          <div style="margin-top: 6px;">کد تایید شما: <strong class="ltr" style="font-size: 1.15rem;">${escapeHtml(data.testOtp)}</strong></div>
        `;
        otpCodeInput.value = data.testOtp;
      } else {
        testOtpBanner.textContent = data.message;
      }
      showToast(data.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('backToPhoneBtn').addEventListener('click', () => {
    otpVerifyForm.style.display = 'none';
    otpRequestForm.style.display = 'block';
  });

  otpVerifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const messengerEl = document.querySelector('input[name="authMessenger"]:checked');
      await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: pendingPhone || authPhoneInput.value,
          code: otpCodeInput.value,
          role: selectedAuthRole,
          fullName: document.getElementById('authFullName').value,
          agencyName: document.getElementById('authAgencyName').value,
          messenger: messengerEl ? messengerEl.value : 'whatsapp',
        }),
      });
      showToast('ورود با موفقیت انجام شد.', 'success');
      await loadAppState();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    showToast('از حساب کاربری خارج شدید.', 'info');
    await loadAppState();
  });

  // ---------- Customer Panel ----------
  async function renderCustomerPanel(meData) {
    customerPanel.style.display = 'block';
    const data = await apiFetch('/api/inspections/my');
    const quota = data.quota;
    const pct = Math.min(100, Math.round((quota.usedPhotos / Math.max(1, quota.maxPhotos)) * 100));
    const requests = data.requests || [];

    customerPanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 900;">پنل کاربری مشتری</h1>
          <p style="color: var(--text-secondary);">خوش آمدید ${escapeHtml(meData.user.full_name || meData.user.phone)} (<span class="ltr">${escapeHtml(meData.user.phone)}</span>)</p>
        </div>
        <a href="/#inspection" class="btn btn-primary btn-sm">ثبت درخواست بازدید جدید</a>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <small>تعداد درخواست‌های من</small>
          <strong>${toPersianDigits(requests.length)}</strong>
        </div>
        <div class="kpi-card">
          <small>سهمیه آپلود عکس</small>
          <strong>${toPersianDigits(quota.usedPhotos)} از ${toPersianDigits(quota.maxPhotos)} عکس</strong>
          <div class="quota-bar"><div style="width: ${pct}%"></div></div>
          <small>ظرفیت باقی‌مانده: ${toPersianDigits(quota.remainingPhotos)} عکس</small>
        </div>
        <div class="kpi-card">
          <small>تلفن هماهنگی نوکابین</small>
          <strong class="ltr" style="font-size: 1.05rem;">+989225603574</strong>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <h2 style="font-size: 1.15rem; font-weight: 900; margin-bottom: 14px;">درخواست‌های بازدید و بازسازی شما</h2>
        ${
          requests.length === 0
            ? `<div class="info-banner gold">هنوز درخواستی با این شماره ثبت نکرده‌اید. از دکمه «ثبت درخواست بازدید جدید» استفاده کنید.</div>`
            : `<div style="display: flex; flex-direction: column; gap: 16px;">
                ${requests
                  .map(
                    (r) => `
                  <div style="border: 1px solid var(--border-medium); border-radius: var(--radius-md); padding: 18px; background: var(--bg-canvas);">
                    <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
                      <div>
                        <strong>درخواست #${toPersianDigits(r.id)} — ${escapeHtml(r.district)}</strong>
                        <div style="font-size: 0.84rem; color: var(--text-secondary);">
                          ${escapeHtml(r.cabinet_type)} | متراژ حدودی: ${toPersianDigits(r.estimated_meters)} متر
                        </div>
                      </div>
                      <span class="status-pill status-${escapeHtml(r.status)}">${STATUS_LABELS[r.status] || r.status}</span>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.86rem; margin-bottom: 10px;">
                      <span>برآورد قرارداد: <strong>${formatMillions(r.contract_amount_toman)}</strong></span>
                      ${
                        r.discount_toman > 0
                          ? `<span class="tag olive">تخفیف معرف لحاظ‌شده: ${formatMillions(r.discount_toman)} (معرف: <span class="ltr">${escapeHtml(r.referrer_phone)}</span>)</span>`
                          : ''
                      }
                    </div>

                    ${r.admin_notes ? `<div class="info-banner gold" style="margin-bottom: 10px; font-size: 0.84rem;">پیام کارشناس: ${escapeHtml(r.admin_notes)}</div>` : ''}

                    <div>
                      <strong style="font-size: 0.85rem;">تصاویر پیوست‌شده (${toPersianDigits(r.photos.length)}):</strong>
                      <div class="preview-grid">
                        ${r.photos
                          .map(
                            (ph) => `
                          <div class="preview-item">
                            <a href="${escapeHtml(ph.file_path)}" target="_blank"><img src="${escapeHtml(ph.file_path)}" alt="عکس کابینت" /></a>
                            <button type="button" class="preview-remove" data-delete-photo="${ph.id}" title="حذف تصویر">×</button>
                          </div>
                        `
                          )
                          .join('')}
                      </div>

                      ${
                        quota.remainingPhotos > 0
                          ? `<form class="customer-upload-form" data-req-id="${r.id}" style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                              <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required style="font-size: 0.82rem;" />
                              <button type="submit" class="btn btn-outline btn-sm">افزودن عکس (${toPersianDigits(quota.remainingPhotos)} ظرفیت باقی‌مانده)</button>
                            </form>`
                          : `<div style="font-size: 0.82rem; color: var(--accent-danger); margin-top: 8px;">سهمیه آپلود عکس شما تکمیل شده است (برای آپلود جدید، یک عکس قبلی را حذف کنید).</div>`
                      }
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>`
        }
      </div>
    `;

    customerPanel.querySelectorAll('[data-delete-photo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/inspections/photos/${btn.dataset.deletePhoto}`, { method: 'DELETE' });
          showToast('تصویر حذف شد و به سهمیه آپلود شما اضافه گردید.', 'success');
          await renderCustomerPanel(meData);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    customerPanel.querySelectorAll('.customer-upload-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          const res = await apiFetch(`/api/inspections/${form.dataset.reqId}/photos`, {
            method: 'POST',
            body: fd,
          });
          showToast(res.message, 'success');
          await renderCustomerPanel(meData);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  // ---------- Real Estate Agent Panel ----------
  async function renderAgentPanel() {
    agentPanel.style.display = 'block';
    const data = await apiFetch('/api/agents/dashboard');
    const { agent, stats, referrals } = data;
    const refUrl = `${window.location.origin}/?ref=${encodeURIComponent(agent.referralParam)}`;

    agentPanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 900;">پنل اختصاصی مشاورین املاک</h1>
          <p style="color: var(--text-secondary);">
            ${escapeHtml(agent.fullName || 'مشاور همکار')} — ${escapeHtml(agent.agencyName || 'دفتر املاک')} | نرخ پورسانت شما: <strong>${toPersianDigits(agent.commissionPercent)}٪</strong>
          </p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="/#inspection" class="btn btn-outline btn-sm">ثبت فایل جدید برای مشتری</a>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px; background: linear-gradient(135deg, #fff 0%, #f5ecdc 100%);">
        <div style="display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 20px; align-items: center;">
          <div>
            <h2 style="font-size: 1.15rem; font-weight: 900; margin-bottom: 6px;">لینک دعوت و شماره معرف اختصاصی شما</h2>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 10px;">
              هر مالکی که با این لینک ثبت‌نام کند یا شماره همراه <strong class="ltr">${escapeHtml(agent.phone)}</strong> را به عنوان «شماره همراه مشاور املاک معرفی‌کننده» وارد کند، <strong>۲ میلیون تومان تخفیف</strong> می‌گیرد و پورسانت آن به حساب شما ثبت می‌شود.
            </p>
            <div class="ltr" style="background: #fff; border: 1px solid var(--border-medium); padding: 10px 14px; border-radius: var(--radius-sm); word-break: break-all; font-weight: 700; margin-bottom: 10px;">
              ${escapeHtml(refUrl)}
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <button type="button" class="btn btn-primary btn-sm" id="copyAgentLink">کپی لینک دعوت</button>
              <a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`بازسازی کابینت بدون تعویض با یک‌دهم هزینه در ۱۵ روز (با ۲ میلیون تومان تخفیف معرف): ${refUrl}`)}">ارسال در واتس‌اپ</a>
            </div>
          </div>

          <div style="background: #fff; padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
            <label style="display: block; font-weight: 800; font-size: 0.88rem; margin-bottom: 8px;">پیام‌رسان ترجیحی برای هماهنگی با شما:</label>
            <div class="messenger-choices">
              <label class="messenger-option">
                <input type="radio" name="panelAgentMessenger" value="bale" ${agent.messenger === 'bale' ? 'checked' : ''} />
                <span class="messenger-card bale">بله</span>
              </label>
              <label class="messenger-option">
                <input type="radio" name="panelAgentMessenger" value="whatsapp" ${agent.messenger !== 'bale' ? 'checked' : ''} />
                <span class="messenger-card wa">واتس‌اپ</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <small>تعداد کل فایل‌های معرفی‌شده</small>
          <strong>${toPersianDigits(stats.totalReferred)} فایل</strong>
        </div>
        <div class="kpi-card">
          <small>پروژه‌های فعال / در حال اجرا</small>
          <strong>${toPersianDigits(stats.activeProjects)} پروژه</strong>
        </div>
        <div class="kpi-card">
          <small>کل پورسانت محاسبه‌شده</small>
          <strong style="color: var(--accent-olive);">${formatToman(stats.totalCommissionToman)}</strong>
        </div>
        <div class="kpi-card">
          <small>در انتظار تسویه / پرداخت‌شده</small>
          <strong style="font-size: 1.05rem;">${formatToman(stats.pendingCommissionToman)} / ${formatToman(stats.paidCommissionToman)}</strong>
        </div>
      </div>

      <div class="card">
        <h2 style="font-size: 1.15rem; font-weight: 900; margin-bottom: 14px;">لیست معرفی‌ها و محاسبه پورسانت</h2>
        ${
          referrals.length === 0
            ? `<div class="info-banner gold">هنوز مشتری یا فایلی با شماره معرف شما ثبت نشده است. لینک دعوت خود را برای مالکان فایل‌های قدیمی ارسال کنید.</div>`
            : `<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>شناسه</th>
                      <th>نام مشتری</th>
                      <th>محدوده</th>
                      <th>مبلغ برآوردی قرارداد</th>
                      <th>تخفیف مشتری</th>
                      <th>وضعیت پروژه</th>
                      <th>پورسانت شما (${toPersianDigits(agent.commissionPercent)}٪)</th>
                      <th>وضعیت تسویه</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${referrals
                      .map(
                        (r) => `
                      <tr>
                        <td>#${toPersianDigits(r.id)}</td>
                        <td>
                          <strong>${escapeHtml(r.full_name)}</strong>
                          <div class="ltr" style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(r.masked_phone)}</div>
                        </td>
                        <td>${escapeHtml(r.district)}</td>
                        <td>${formatMillions(r.contract_amount_toman)}</td>
                        <td><span class="tag olive">${formatMillions(r.discount_toman)}</span></td>
                        <td><span class="status-pill status-${escapeHtml(r.status)}">${STATUS_LABELS[r.status] || r.status}</span></td>
                        <td><strong>${formatToman(r.commission_toman)}</strong></td>
                        <td><span class="status-pill status-${escapeHtml(r.commission_status)}">${STATUS_LABELS[r.commission_status] || r.commission_status}</span></td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
      </div>
    `;

    document.getElementById('copyAgentLink')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(refUrl);
      showToast('لینک دعوت اختصاصی کپی شد!', 'success');
    });

    agentPanel.querySelectorAll('input[name="panelAgentMessenger"]').forEach((radio) => {
      radio.addEventListener('change', async () => {
        try {
          await apiFetch('/api/auth/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messenger: radio.value }),
          });
          showToast('پیام‌رسان ترجیحی شما به‌روزرسانی شد.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  // ---------- Admin Panel ----------
  let activeAdminTab = 'requests';

  async function renderAdminPanel() {
    adminPanel.style.display = 'block';
    const data = await apiFetch('/api/admin/overview');
    const { stats, requests, agents, commissions, gallery, settings } = data;

    adminPanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 900;">پنل مدیریت نوکابین</h1>
          <p style="color: var(--text-secondary);">مدیریت درخواست‌ها، مشاورین املاک، پورسانت‌ها، گالری تغییرات واقعی و محدودیت‌های سیستم</p>
        </div>
        <a href="/changes.html" class="btn btn-outline btn-sm">مشاهده صفحه تغییرات واقعی</a>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><small>کل درخواست‌های بازدید</small><strong>${toPersianDigits(stats.totalRequests)}</strong></div>
        <div class="kpi-card"><small>در انتظار بررسی</small><strong style="color: var(--accent-gold-dark);">${toPersianDigits(stats.pendingRequests)}</strong></div>
        <div class="kpi-card"><small>مشاورین املاک فعال</small><strong>${toPersianDigits(stats.totalAgents)}</strong></div>
        <div class="kpi-card"><small>پورسانت در انتظار تسویه</small><strong style="color: var(--accent-olive);">${formatToman(stats.totalPendingCommissionToman)}</strong></div>
        <div class="kpi-card"><small>عکس‌های آپلودشده کاربران</small><strong>${toPersianDigits(stats.totalPhotos)}</strong></div>
      </div>

      <div class="panel-tabs" id="adminTabs">
        <button type="button" class="panel-tab ${activeAdminTab === 'requests' ? 'active' : ''}" data-tab="requests">درخواست‌های بازدید (${toPersianDigits(requests.length)})</button>
        <button type="button" class="panel-tab ${activeAdminTab === 'agents' ? 'active' : ''}" data-tab="agents">مشاورین و پورسانت‌ها (${toPersianDigits(agents.length)})</button>
        <button type="button" class="panel-tab ${activeAdminTab === 'gallery' ? 'active' : ''}" data-tab="gallery">گالری تغییرات واقعی (${toPersianDigits(gallery.length)})</button>
        <button type="button" class="panel-tab ${activeAdminTab === 'settings' ? 'active' : ''}" data-tab="settings">تنظیمات سیستم</button>
      </div>

      <div id="adminTabContent"></div>
    `;

    adminPanel.querySelectorAll('#adminTabs .panel-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeAdminTab = btn.dataset.tab;
        renderAdminPanel();
      });
    });

    const tabContent = document.getElementById('adminTabContent');

    if (activeAdminTab === 'requests') {
      tabContent.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>مشتری / منطقه</th>
                <th>معرف و تخفیف</th>
                <th>عکس‌ها</th>
                <th>مبلغ قرارداد (تومان)</th>
                <th>وضعیت</th>
                <th>یادداشت و ذخیره</th>
              </tr>
            </thead>
            <tbody>
              ${requests
                .map(
                  (r) => `
                <tr data-admin-req="${r.id}">
                  <td>#${toPersianDigits(r.id)}</td>
                  <td>
                    <strong>${escapeHtml(r.full_name)}</strong>
                    <div class="ltr" style="font-size: 0.82rem;">${escapeHtml(r.phone)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(r.district)} — ${escapeHtml(r.address || '')}</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(r.cabinet_type)} (${toPersianDigits(r.estimated_meters)} متر)</div>
                  </td>
                  <td>
                    ${
                      r.referrer_phone
                        ? `<div class="ltr" style="font-weight: 700;">${escapeHtml(r.referrer_phone)}</div>
                           <span class="tag olive">تخفیف: ${formatMillions(r.discount_toman)}</span>`
                        : '<span style="color: var(--text-muted);">بدون معرف</span>'
                    }
                  </td>
                  <td>
                    ${
                      r.photos.length
                        ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; max-width: 150px;">
                            ${r.photos
                              .map(
                                (p) => `<a href="${escapeHtml(p.file_path)}" target="_blank"><img src="${escapeHtml(p.file_path)}" style="width: 42px; height: 42px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-medium);" /></a>`
                              )
                              .join('')}
                          </div>`
                        : '<span style="color: var(--text-muted); font-size: 0.8rem;">ندارد</span>'
                    }
                  </td>
                  <td>
                    <input type="number" class="req-contract ltr" value="${r.contract_amount_toman}" style="width: 130px; padding: 6px; border: 1px solid var(--border-medium); border-radius: 6px;" />
                  </td>
                  <td>
                    <select class="req-status" style="padding: 6px; border: 1px solid var(--border-medium); border-radius: 6px;">
                      ${['pending', 'contacted', 'inspected', 'in_progress', 'completed', 'cancelled']
                        .map((st) => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${STATUS_LABELS[st]}</option>`)
                        .join('')}
                    </select>
                  </td>
                  <td>
                    <input type="text" class="req-notes" value="${escapeHtml(r.admin_notes || '')}" placeholder="پیام برای مشتری..." style="width: 150px; padding: 6px; border: 1px solid var(--border-medium); border-radius: 6px; margin-bottom: 6px; display: block;" />
                    <button type="button" class="btn btn-primary btn-sm save-req-btn">ذخیره</button>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;

      tabContent.querySelectorAll('.save-req-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('tr');
          const id = row.dataset.adminReq;
          try {
            await apiFetch(`/api/admin/requests/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: row.querySelector('.req-status').value,
                contractAmountToman: Number(row.querySelector('.req-contract').value),
                adminNotes: row.querySelector('.req-notes').value,
              }),
            });
            showToast('درخواست با موفقیت به‌روزرسانی شد.', 'success');
            await renderAdminPanel();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } else if (activeAdminTab === 'agents') {
      tabContent.innerHTML = `
        <div class="card" style="margin-bottom: 20px;">
          <h2 style="font-size: 1.1rem; font-weight: 900; margin-bottom: 12px;">لیست مشاورین املاک همکار</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نام / دفتر املاک</th>
                  <th>شماره (کد معرف)</th>
                  <th>پیام‌رسان</th>
                  <th>معرفی‌ها</th>
                  <th>درصد پورسانت</th>
                  <th>ذخیره</th>
                </tr>
              </thead>
              <tbody>
                ${agents
                  .map(
                    (a) => `
                  <tr data-agent-id="${a.id}">
                    <td><strong>${escapeHtml(a.full_name || 'مشاور')}</strong><div>${escapeHtml(a.agency_name || '-')}</div></td>
                    <td class="ltr">${escapeHtml(a.phone)}</td>
                    <td>${a.messenger === 'bale' ? '<span class="tag" style="background: var(--accent-bale-soft); color: var(--accent-bale);">بله</span>' : '<span class="tag" style="background: var(--accent-wa-soft); color: var(--accent-wa);">واتس‌اپ</span>'}</td>
                    <td>${toPersianDigits(a.referrals_count)}</td>
                    <td><input type="number" class="agent-pct ltr" min="1" max="30" value="${a.commission_percent}" style="width: 72px; padding: 6px; border: 1px solid var(--border-medium); border-radius: 6px;" /> ٪</td>
                    <td><button type="button" class="btn btn-primary btn-sm save-agent-btn">ذخیره</button></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h2 style="font-size: 1.1rem; font-weight: 900; margin-bottom: 12px;">پورسانت‌های محاسبه‌شده مشاورین</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>مشاور</th>
                  <th>مشتری معرفی‌شده</th>
                  <th>مبلغ قرارداد</th>
                  <th>مبلغ پورسانت</th>
                  <th>وضعیت تسویه</th>
                  <th>تغییر وضعیت</th>
                </tr>
              </thead>
              <tbody>
                ${commissions
                  .map(
                    (c) => `
                  <tr data-comm-id="${c.id}">
                    <td><strong>${escapeHtml(c.agent_name)}</strong><div class="ltr">${escapeHtml(c.agent_phone)}</div></td>
                    <td>${escapeHtml(c.customer_name)} (${escapeHtml(c.district)})</td>
                    <td>${formatMillions(c.contract_amount_toman)}</td>
                    <td><strong>${formatToman(c.amount_toman)}</strong></td>
                    <td><span class="status-pill status-${escapeHtml(c.status)}">${STATUS_LABELS[c.status] || c.status}</span></td>
                    <td>
                      <select class="comm-status" style="padding: 6px; border: 1px solid var(--border-medium); border-radius: 6px;">
                        <option value="pending" ${c.status === 'pending' ? 'selected' : ''}>در انتظار بررسی</option>
                        <option value="approved" ${c.status === 'approved' ? 'selected' : ''}>تاییدشده</option>
                        <option value="paid" ${c.status === 'paid' ? 'selected' : ''}>تسویه‌شده</option>
                      </select>
                      <button type="button" class="btn btn-gold btn-sm save-comm-btn">اعمال</button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      tabContent.querySelectorAll('.save-agent-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('tr');
          try {
            await apiFetch(`/api/admin/agents/${row.dataset.agentId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ commissionPercent: Number(row.querySelector('.agent-pct').value) }),
            });
            showToast('نرخ پورسانت مشاور ذخیره شد.', 'success');
            await renderAdminPanel();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });

      tabContent.querySelectorAll('.save-comm-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('tr');
          try {
            await apiFetch(`/api/admin/commissions/${row.dataset.commId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: row.querySelector('.comm-status').value }),
            });
            showToast('وضعیت پورسانت به‌روزرسانی شد.', 'success');
            await renderAdminPanel();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } else if (activeAdminTab === 'gallery') {
      tabContent.innerHTML = `
        <div class="form-section-grid">
          <form class="card" id="adminGalleryForm">
            <h2 style="font-size: 1.15rem; font-weight: 900; margin-bottom: 14px;">افزودن عکس واقعی جدید به صفحه «تغییرات واقعی»</h2>
            <div class="form-grid">
              <div class="field full">
                <label>عنوان پروژه *</label>
                <input type="text" name="title" required placeholder="مثال: بازسازی کابینت آشپزخانه — پروژه فرمانیه" />
              </div>
              <div class="field">
                <label>منطقه تهران *</label>
                <select name="district">
                  <option value="شمال و شرق تهران">شمال و شرق تهران</option>
                  <option value="مرکز و غرب تهران">مرکز و غرب تهران</option>
                  <option value="جنوب و سایر مناطق تهران">جنوب و سایر مناطق تهران</option>
                </select>
              </div>
              <div class="field">
                <label>رنگ پلی‌اورتان اجراشده *</label>
                <input type="text" name="paintColor" required value="پلی‌اورتان غیرکوره‌ای کرم و طوسی گرم" />
              </div>
              <div class="field">
                <label>مدت تحویل (روز)</label>
                <input type="number" name="durationDays" value="15" min="1" max="60" />
              </div>
              <div class="field">
                <label>هزینه کل (تومان)</label>
                <input type="number" name="costToman" value="70000000" />
              </div>
              <div class="field">
                <label>عکس قبل از بازسازی *</label>
                <input type="file" name="beforeImage" accept="image/jpeg,image/png,image/webp" required />
              </div>
              <div class="field">
                <label>عکس بعد از بازسازی *</label>
                <input type="file" name="afterImage" accept="image/jpeg,image/png,image/webp" required />
              </div>
              <div class="field full">
                <label>توضیحات پروژه</label>
                <textarea name="description" rows="2" placeholder="توضیح درباره حفظ چیدمان و اجرای رنگ..."></textarea>
              </div>
              <div class="field full">
                <button type="submit" class="btn btn-primary" style="width: 100%;">ثبت در صفحه تغییرات واقعی</button>
              </div>
            </div>
          </form>

          <div class="card">
            <h2 style="font-size: 1.15rem; font-weight: 900; margin-bottom: 14px;">پروژه‌های فعلی گالری (${toPersianDigits(gallery.length)})</h2>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${gallery
                .map(
                  (g) => `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px; border: 1px solid var(--border-light); border-radius: var(--radius-sm);">
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <img src="${escapeHtml(g.before_image)}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px;" />
                    <img src="${escapeHtml(g.after_image)}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px;" />
                    <div>
                      <strong style="font-size: 0.9rem;">${escapeHtml(g.title)}</strong>
                      <div style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(g.district)} — ${formatMillions(g.cost_toman)}</div>
                    </div>
                  </div>
                  <button type="button" class="btn btn-danger btn-sm del-gallery-btn" data-id="${g.id}">حذف</button>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      `;

      document.getElementById('adminGalleryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          const res = await apiFetch('/api/admin/gallery', { method: 'POST', body: fd });
          showToast(res.message, 'success');
          await renderAdminPanel();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      tabContent.querySelectorAll('.del-gallery-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/api/admin/gallery/${btn.dataset.id}`, { method: 'DELETE' });
            showToast('پروژه از گالری حذف شد.', 'info');
            await renderAdminPanel();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } else if (activeAdminTab === 'settings') {
      tabContent.innerHTML = `
        <form class="card" id="adminSettingsForm" style="max-width: 580px;">
          <h2 style="font-size: 1.15rem; font-weight: 900; margin-bottom: 14px;">تنظیمات محدودیت‌ها و تعرفه سیستم</h2>
          <div class="form-grid">
            <div class="field">
              <label>حداکثر تعداد عکس مجاز برای هر کاربر</label>
              <input type="number" name="max_photos_per_user" min="1" max="30" value="${settings.max_photos_per_user}" />
            </div>
            <div class="field">
              <label>درصد پورسانت پیش‌فرض مشاورین املاک</label>
              <input type="number" name="default_commission_percent" min="1" max="30" value="${settings.default_commission_percent}" />
            </div>
            <div class="field full">
              <label>مبلغ تخفیف مشتری با معرفی مشاور (تومان)</label>
              <input type="number" name="referral_discount_toman" value="${settings.referral_discount_toman}" />
            </div>
            <div class="field full">
              <div class="info-banner gold">
                وضعیت OTP پیامکی: <strong>${settings.otp_test_mode ? 'حالت تستی فعال (کد روی صفحه نمایش داده می‌شود)' : 'حالت عملیاتی'}</strong>
              </div>
            </div>
            <div class="field full">
              <button type="submit" class="btn btn-primary">ذخیره تنظیمات</button>
            </div>
          </div>
        </form>
      `;

      document.getElementById('adminSettingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
        try {
          await apiFetch('/api/admin/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          showToast('تنظیمات با موفقیت ذخیره شد.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  }

  // ---------- App Loader ----------
  async function loadAppState() {
    hideAllPanels();
    try {
      const me = await apiFetch('/api/auth/me');
      if (!me.authenticated || !me.user) {
        logoutBtn.style.display = 'none';
        authSection.style.display = 'block';
        otpRequestForm.style.display = 'block';
        otpVerifyForm.style.display = 'none';
        syncRoleTabsUI();
        return;
      }

      logoutBtn.style.display = 'inline-flex';
      if (me.user.role === 'admin') {
        await renderAdminPanel();
      } else if (me.user.role === 'agent') {
        await renderAgentPanel();
      } else {
        await renderCustomerPanel(me);
      }
    } catch (err) {
      showToast(err.message, 'error');
      authSection.style.display = 'block';
    }
  }

  loadAppState();
});
