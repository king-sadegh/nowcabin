// NoKabin Outreach Bot Admin Module (WhatsApp + Bale Web + Smart Rule Responder + 2000 Contacts CRM)
(function () {
  const OUTREACH_STATUS_LABELS = {
    queued: 'در صف ارسال',
    sent: 'ارسال‌شده',
    replied: 'پاسخ داده',
    registered: 'ثبت‌شده (همکار)',
    opted_out: 'لغو / عدم تمایل',
    failed: 'خطا در ارسال',
    skipped: 'فاقد حساب',
  };

  let activeSubTab = 'inbox'; // inbox | connections | import | settings
  let activeContactFilter = 'all';
  let contactSearchQuery = '';
  let selectedContactId = null;
  let activeChatChannel = 'whatsapp';

  window.renderOutreachAdminTab = async function renderOutreachAdminTab(container) {
    const { escapeHtml, toPersianDigits, showToast, apiFetch } = window.NoKabin;

    container.innerHTML = `<div class="card" style="text-align:center; padding:28px;">در حال بارگذاری مرکز مدیریت ربات بله و واتس‌اپ...</div>`;

    try {
      const overview = await apiFetch('/api/outreach/overview');
      const { connections, campaigns, stats, settings } = overview;

      const waConn = connections.whatsapp;
      const baleConn = connections.bale;

      const waBadgeColor =
        waConn.status === 'connected'
          ? 'background:#dcfce7; color:#166534;'
          : waConn.status === 'qr_ready'
          ? 'background:#fef9c3; color:#854d0e;'
          : 'background:#fee2e2; color:#991b1b;';

      const baleBadgeColor =
        baleConn.status === 'connected'
          ? 'background:#dcfce7; color:#166534;'
          : baleConn.status === 'otp_required' || baleConn.status === 'login_required'
          ? 'background:#fef9c3; color:#854d0e;'
          : 'background:#fee2e2; color:#991b1b;';

      const waStatusText =
        waConn.status === 'connected'
          ? `متصل (${waConn.connectedPhone || 'خط واتس‌اپ'})`
          : waConn.status === 'qr_ready'
          ? 'آماده اسکن QR Code'
          : waConn.status === 'connecting'
          ? 'در حال اتصال...'
          : 'قطع';

      const baleStatusText =
        baleConn.status === 'connected'
          ? 'متصل به بله وب'
          : baleConn.status === 'otp_required'
          ? 'منتظر کد تایید بله'
          : baleConn.status === 'login_required'
          ? 'منتظر ورود شماره بله'
          : baleConn.status === 'launching'
          ? 'در حال باز کردن مرورگر...'
          : 'قطع';

      container.innerHTML = `
        <!-- Top Status Bar for Dual Independent Campaigns -->
        <div class="kpi-grid" style="margin-bottom: 18px;">
          <div class="kpi-card" style="border-right: 4px solid #16a34a;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <small>کمپین مستقل واتس‌اپ</small>
              <span class="tag" style="${waBadgeColor} font-size:0.74rem;">${escapeHtml(waStatusText)}</span>
            </div>
            <strong style="font-size:1.1rem; margin-top:6px;">
              امروز: ${toPersianDigits(campaigns.whatsapp.sentToday)} / ${toPersianDigits(campaigns.whatsapp.effectiveDailyCap)} پیام
            </strong>
            <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">
              در صف: ${toPersianDigits(stats.whatsapp.queued)} | ارسال‌شده: ${toPersianDigits(stats.whatsapp.sent + stats.whatsapp.replied + stats.whatsapp.registered)} | پاسخ‌داده: ${toPersianDigits(stats.whatsapp.replied + stats.whatsapp.registered)}
            </div>
            <div style="margin-top:10px; display:flex; gap:6px;">
              <button type="button" class="btn btn-sm ${campaigns.whatsapp.enabled ? 'btn-danger' : 'btn-primary'}" id="toggleWaCampaignBtn">
                ${campaigns.whatsapp.enabled ? '⏸ توقف کمپین واتس‌اپ' : '▶ شروع کمپین واتس‌اپ'}
              </button>
            </div>
          </div>

          <div class="kpi-card" style="border-right: 4px solid #0284c7;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <small>کمپین مستقل پیام‌رسان بله</small>
              <span class="tag" style="${baleBadgeColor} font-size:0.74rem;">${escapeHtml(baleStatusText)}</span>
            </div>
            <strong style="font-size:1.1rem; margin-top:6px;">
              امروز: ${toPersianDigits(campaigns.bale.sentToday)} / ${toPersianDigits(campaigns.bale.effectiveDailyCap)} پیام
            </strong>
            <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">
              در صف: ${toPersianDigits(stats.bale.queued)} | ارسال‌شده: ${toPersianDigits(stats.bale.sent + stats.bale.replied + stats.bale.registered)} | پاسخ‌داده: ${toPersianDigits(stats.bale.replied + stats.bale.registered)}
            </div>
            <div style="margin-top:10px; display:flex; gap:6px;">
              <button type="button" class="btn btn-sm ${campaigns.bale.enabled ? 'btn-danger' : 'btn-primary'}" id="toggleBaleCampaignBtn">
                ${campaigns.bale.enabled ? '⏸ توقف کمپین بله' : '▶ شروع کمپین بله'}
              </button>
            </div>
          </div>

          <div class="kpi-card" style="border-right: 4px solid #dc2626;">
            <small>موارد جدی (نیازمند ورود شما 🔴)</small>
            <strong style="color:#dc2626; font-size:1.45rem;">${toPersianDigits(stats.seriousCount)} مشاور</strong>
            <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">
              هشدار خودکار به: <span class="ltr">${escapeHtml(settings.adminAlertPhone)}</span>
            </div>
            <div style="margin-top:8px;">
              <button type="button" class="btn btn-outline btn-sm" id="filterSeriousQuickBtn">نمایش موارد جدی</button>
            </div>
          </div>

          <div class="kpi-card">
            <small>کل بانک شماره مشاورین املاک</small>
            <strong style="font-size:1.35rem;">${toPersianDigits(stats.totalContacts)} شماره</strong>
            <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">
              همکاران ثبت‌شده: ${toPersianDigits(Math.max(stats.whatsapp.registered, stats.bale.registered))} | پاسخ خودکار: ${settings.autoReplyEnabled ? 'فعال ✅' : 'غیرفعال'}
            </div>
          </div>
        </div>

        <!-- Sub-Navigation Tabs -->
        <div class="panel-tabs" style="margin-bottom: 16px;">
          <button type="button" class="panel-tab ${activeSubTab === 'inbox' ? 'active' : ''}" data-outreach-sub="inbox">
            💬 صندوق گفتگوها و لیست مشاورین (${toPersianDigits(stats.totalContacts)})
            ${stats.seriousCount > 0 ? `<span class="tag" style="background:#fee2e2; color:#b91c1c; margin-right:6px;">${toPersianDigits(stats.seriousCount)} جدی</span>` : ''}
          </button>
          <button type="button" class="panel-tab ${activeSubTab === 'connections' ? 'active' : ''}" data-outreach-sub="connections">
            🔌 اتصال واتس‌اپ (QR) و بله وب
          </button>
          <button type="button" class="panel-tab ${activeSubTab === 'import' ? 'active' : ''}" data-outreach-sub="import">
            📥 ورود لیست ۲۰۰۰ شماره (اکسل / CSV)
          </button>
          <button type="button" class="panel-tab ${activeSubTab === 'settings' ? 'active' : ''}" data-outreach-sub="settings">
            ⚙️ تنظیمات ضد مسدودی، متن دعوت و قوانین پاسخ‌گو
          </button>
        </div>

        <div id="outreachSubContent"></div>
      `;

      container.querySelectorAll('[data-outreach-sub]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeSubTab = btn.dataset.outreachSub;
          renderOutreachAdminTab(container);
        });
      });

      document.getElementById('toggleWaCampaignBtn')?.addEventListener('click', async () => {
        try {
          const next = !campaigns.whatsapp.enabled;
          await apiFetch('/api/outreach/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ waCampaignEnabled: next }),
          });
          showToast(next ? 'کمپین ارسال واتس‌اپ فعال شد.' : 'کمپین ارسال واتس‌اپ متوقف شد.', 'success');
          renderOutreachAdminTab(container);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('toggleBaleCampaignBtn')?.addEventListener('click', async () => {
        try {
          const next = !campaigns.bale.enabled;
          await apiFetch('/api/outreach/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baleCampaignEnabled: next }),
          });
          showToast(next ? 'کمپین ارسال بله فعال شد.' : 'کمپین ارسال بله متوقف شد.', 'success');
          renderOutreachAdminTab(container);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('filterSeriousQuickBtn')?.addEventListener('click', () => {
        activeSubTab = 'inbox';
        activeContactFilter = 'serious';
        renderOutreachAdminTab(container);
      });

      const subContainer = document.getElementById('outreachSubContent');
      if (activeSubTab === 'inbox') {
        await renderInboxSubTab(subContainer, container, overview);
      } else if (activeSubTab === 'connections') {
        renderConnectionsSubTab(subContainer, container, overview);
      } else if (activeSubTab === 'import') {
        renderImportSubTab(subContainer, container, overview);
      } else if (activeSubTab === 'settings') {
        renderSettingsSubTab(subContainer, container, overview);
      }
    } catch (err) {
      container.innerHTML = `<div class="card"><div class="info-banner" style="color:var(--accent-danger);">خطا در بارگذاری بخش ربات: ${escapeHtml(err.message)}</div></div>`;
    }
  };

  // ---------------- 1. INBOX & CONTACTS CRM SUB-TAB ----------------
  async function renderInboxSubTab(subContainer, rootContainer, overview) {
    const { escapeHtml, toPersianDigits, showToast, apiFetch } = window.NoKabin;

    const query = new URLSearchParams({
      filter: activeContactFilter,
      search: contactSearchQuery,
      limit: '150',
    });
    const listData = await apiFetch(`/api/outreach/contacts?${query.toString()}`);
    const contacts = listData.contacts || [];

    if (!selectedContactId && contacts.length > 0) {
      selectedContactId = contacts[0].id;
    }

    subContainer.innerHTML = `
      <div class="card" style="margin-bottom: 16px; padding: 14px;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center;">
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${[
              ['all', 'همه مخاطبین'],
              ['serious', '🔴 موارد جدی'],
              ['unread', 'پیام خوانده‌نشده'],
              ['replied', 'پاسخ‌داده‌ها'],
              ['registered', 'همکاران ثبت‌شده'],
              ['wa_queued', 'در صف واتس‌اپ'],
              ['bale_queued', 'در صف بله'],
              ['failed', 'خطاها'],
            ]
              .map(
                ([key, label]) => `
              <button type="button" class="btn btn-sm ${activeContactFilter === key ? 'btn-primary' : 'btn-outline'}" data-filter-btn="${key}">
                ${label}
              </button>
            `
              )
              .join('')}
          </div>

          <form id="outreachSearchForm" style="display:flex; gap:6px; align-items:center;">
            <input type="text" id="outreachSearchInput" value="${escapeHtml(contactSearchQuery)}" placeholder="جستجوی شماره، نام یا منطقه..." style="padding:6px 10px; border:1px solid var(--border-medium); border-radius:8px; width:220px;" />
            <button type="submit" class="btn btn-outline btn-sm">جستجو</button>
          </form>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: minmax(300px, 380px) 1fr; gap:16px; align-items:start;">
        <!-- Contacts List Sidebar -->
        <div class="card" style="padding:12px; max-height:660px; overflow-y:auto;">
          <div style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:10px; display:flex; justify-content:space-between;">
            <span>نتایج: <strong>${toPersianDigits(listData.total)}</strong> مشاور</span>
            ${
              activeContactFilter === 'failed'
                ? `<button type="button" class="btn btn-outline btn-sm" id="resetFailedContactsBtn" style="padding:2px 8px; font-size:0.75rem;">تلاش مجدد همه</button>`
                : ''
            }
          </div>

          ${
            contacts.length === 0
              ? `<div class="info-banner gold" style="font-size:0.85rem;">
                  هیچ مشاوری در این فیلتر یافت نشد. از تب «ورود لیست ۲۰۰۰ شماره» مخاطبین را اضافه کنید.
                 </div>`
              : `<div style="display:flex; flex-direction:column; gap:8px;">
                  ${contacts
                    .map((c) => {
                      const isSel = c.id === selectedContactId;
                      return `
                        <div data-select-contact="${c.id}" style="cursor:pointer; padding:10px 12px; border-radius:10px; border:1px solid ${
                        isSel ? 'var(--accent-gold-dark)' : c.is_serious ? '#fca5a5' : 'var(--border-light)'
                      }; background:${isSel ? '#fef9c333' : c.is_serious ? '#fef2f2' : 'var(--bg-canvas)'};">
                          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                            <strong style="font-size:0.9rem;">${escapeHtml(c.full_name || 'مشاور املاک')}</strong>
                            <span class="ltr" style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(c.phone)}</span>
                          </div>
                          <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">
                            ${escapeHtml(c.agency_name || 'دفتر املاک')} — ${escapeHtml(c.district || '')}
                          </div>
                          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">
                            <span class="tag" style="background:var(--accent-wa-soft); color:var(--accent-wa); font-size:0.7rem;">
                              واتس‌اپ: ${OUTREACH_STATUS_LABELS[c.wa_status] || c.wa_status}
                            </span>
                            <span class="tag" style="background:var(--accent-bale-soft); color:var(--accent-bale); font-size:0.7rem;">
                              بله: ${OUTREACH_STATUS_LABELS[c.bale_status] || c.bale_status}
                            </span>
                            ${
                              c.is_serious
                                ? `<span class="tag" style="background:#dc2626; color:#fff; font-size:0.7rem;">🔴 مورد جدی</span>`
                                : ''
                            }
                            ${
                              c.bot_paused
                                ? `<span class="tag" style="background:#e5e7eb; color:#374151; font-size:0.7rem;">ربات متوقف (مدیریت)</span>`
                                : ''
                            }
                            ${
                              c.unread_count > 0
                                ? `<span class="tag" style="background:#2563eb; color:#fff; font-size:0.7rem;">${toPersianDigits(c.unread_count)} جدید</span>`
                                : ''
                            }
                          </div>
                          ${
                            c.last_message_body
                              ? `<div style="font-size:0.76rem; color:var(--text-muted); margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                  ${c.last_message_direction === 'inbound' ? '📩 ' : '📤 '}${escapeHtml(c.last_message_body)}
                                 </div>`
                              : ''
                          }
                        </div>
                      `;
                    })
                    .join('')}
                 </div>`
          }
        </div>

        <!-- Active Conversation View -->
        <div class="card" id="outreachThreadPane" style="min-height: 520px;">
          <div style="text-align:center; color:var(--text-secondary); padding:40px;">یک مشاور را از لیست سمت راست انتخاب کنید.</div>
        </div>
      </div>
    `;

    subContainer.querySelectorAll('[data-filter-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeContactFilter = btn.dataset.filterBtn;
        selectedContactId = null;
        renderInboxSubTab(subContainer, rootContainer, overview);
      });
    });

    document.getElementById('outreachSearchForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      contactSearchQuery = document.getElementById('outreachSearchInput').value.trim();
      selectedContactId = null;
      renderInboxSubTab(subContainer, rootContainer, overview);
    });

    document.getElementById('resetFailedContactsBtn')?.addEventListener('click', async () => {
      try {
        await apiFetch('/api/outreach/contacts/reset-failed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'both' }),
        });
        showToast('تمام شماره‌های ناموفق دوباره در صف قرار گرفتند.', 'success');
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    subContainer.querySelectorAll('[data-select-contact]').forEach((el) => {
      el.addEventListener('click', () => {
        selectedContactId = Number(el.dataset.selectContact);
        renderInboxSubTab(subContainer, rootContainer, overview);
      });
    });

    if (selectedContactId) {
      await renderContactThreadPane(
        document.getElementById('outreachThreadPane'),
        selectedContactId,
        subContainer,
        rootContainer,
        overview
      );
    }
  }

  async function renderContactThreadPane(pane, contactId, subContainer, rootContainer, overview) {
    const { escapeHtml, toPersianDigits, showToast, apiFetch } = window.NoKabin;
    try {
      const data = await apiFetch(`/api/outreach/contacts/${contactId}/messages`);
      const { contact, messages } = data;
      const refUrl = `${window.location.origin}/?ref=${encodeURIComponent(contact.phone)}`;

      pane.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-start; gap:12px; padding-bottom:14px; border-bottom:1px solid var(--border-light);">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h3 style="font-size:1.12rem; font-weight:900;">${escapeHtml(contact.full_name || 'مشاور املاک')}</h3>
              <span class="ltr" style="font-weight:700; color:var(--accent-gold-dark);">${escapeHtml(contact.phone)}</span>
              ${
                contact.is_serious
                  ? `<span class="tag" style="background:#dc2626; color:#fff;">🔴 مورد جدی (${escapeHtml(contact.serious_reason || 'نیازمند پیگیری')})</span>`
                  : ''
              }
            </div>
            <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px;">
              دفتر: <strong>${escapeHtml(contact.agency_name || '-')}</strong> | منطقه: <strong>${escapeHtml(contact.district || '-')}</strong> |
              لینک دعوت اختصاصی: <a href="${escapeHtml(refUrl)}" target="_blank" class="ltr" style="color:var(--accent-olive); text-decoration:underline;">${escapeHtml(refUrl)}</a>
            </div>
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <button type="button" class="btn btn-outline btn-sm" id="toggleBotPauseBtn">
              ${contact.bot_paused ? '🤖 فعال‌سازی مجدد پاسخ‌گوی خودکار' : '⏸ توقف ربات (ورود مستقیم شما)'}
            </button>
            <button type="button" class="btn btn-outline btn-sm" id="toggleSeriousBtn">
              ${contact.is_serious ? 'خروج از حالت جدی' : '🔴 علامت به عنوان مورد جدی'}
            </button>
            <button type="button" class="btn btn-gold btn-sm" id="registerAgentNowBtn">
              ✅ ثبت در پنل مشاورین همکار
            </button>
          </div>
        </div>

        <!-- Messages History -->
        <div id="threadMessagesScroll" style="height: 330px; overflow-y:auto; padding: 14px 6px; display:flex; flex-direction:column; gap:10px; background:var(--bg-canvas); border-radius:10px; margin:14px 0;">
          ${
            messages.length === 0
              ? `<div style="text-align:center; color:var(--text-muted); margin:auto;">
                  هنوز پیامی برای این مشاور ارسال یا دریافت نشده است. می‌توانید همین الان پیام دعوت یا پیام دلخواه را ارسال کنید.
                 </div>`
              : messages
                  .map((m) => {
                    const isOut = m.direction === 'outbound';
                    const chBadge =
                      m.channel === 'bale'
                        ? `<span class="tag" style="background:var(--accent-bale-soft); color:var(--accent-bale); font-size:0.68rem;">بله</span>`
                        : `<span class="tag" style="background:var(--accent-wa-soft); color:var(--accent-wa); font-size:0.68rem;">واتس‌اپ</span>`;
                    const senderLabel =
                      m.sender_type === 'campaign'
                        ? 'ارسال کمپین دعوت'
                        : m.sender_type === 'bot'
                        ? `پاسخ خودکار هوشمند (${m.matched_rule || 'قانون'})`
                        : m.sender_type === 'admin'
                        ? 'پاسخ مستقیم مدیریت'
                        : 'پیام مشاور املاک';
                    return `
                      <div style="align-self:${isOut ? 'flex-start' : 'flex-end'}; max-width:82%; background:${
                      isOut ? '#f0fdf4' : '#ffffff'
                    }; border:1px solid ${isOut ? '#bbf7d0' : 'var(--border-medium)'}; border-radius:12px; padding:10px 14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:4px; font-size:0.73rem; color:var(--text-secondary);">
                          <span>${chBadge} <strong>${escapeHtml(senderLabel)}</strong></span>
                          <span class="ltr">${escapeHtml(m.created_at || '')}</span>
                        </div>
                        <div style="white-space:pre-wrap; font-size:0.88rem; line-height:1.65;">${escapeHtml(m.body)}</div>
                      </div>
                    `;
                  })
                  .join('')
          }
        </div>

        <!-- Direct Reply Composer -->
        <form id="adminDirectSendForm" style="border-top:1px solid var(--border-light); padding-top:12px;">
          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px; font-size:0.84rem;">
              <strong>ارسال پیام در:</strong>
              <label style="cursor:pointer;">
                <input type="radio" name="sendChannel" value="whatsapp" ${activeChatChannel === 'whatsapp' ? 'checked' : ''} /> واتس‌اپ
              </label>
              <label style="cursor:pointer;">
                <input type="radio" name="sendChannel" value="bale" ${activeChatChannel === 'bale' ? 'checked' : ''} /> پیام‌رسان بله
              </label>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-outline btn-sm" id="insertInviteTemplateBtn">درج متن دعوت همکاری</button>
              <button type="button" class="btn btn-outline btn-sm" id="insertRefLinkBtn">درج لینک اختصاصی مشاور</button>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <textarea id="directSendTextarea" rows="3" placeholder="متن پیام خود را برای ارسال مستقیم در واتس‌اپ یا بله بنویسید..." style="flex:1; padding:10px; border:1px solid var(--border-medium); border-radius:8px;"></textarea>
            <button type="submit" class="btn btn-primary" style="align-self:stretch; padding:0 22px;">ارسال پیام</button>
          </div>
        </form>

        <!-- Built-in Simulator to test smart auto-responder on this contact -->
        <details style="margin-top:14px; padding-top:10px; border-top:1px dashed var(--border-medium); font-size:0.83rem;">
          <summary style="cursor:pointer; color:var(--text-secondary); font-weight:700;">
            🧪 شبیه‌ساز پاسخ مشاور (تست عملکرد پاسخ‌گوی خودکار و تشخیص موارد جدی بدون نیاز به گوشی)
          </summary>
          <form id="simulateInboundForm" style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <input type="text" id="simulateInboundInput" placeholder="مثال: «شرایط پورسانت چنده؟» یا «یه مشتری دارم برای بازدید نیاوران»..." style="flex:1; min-width:240px; padding:8px; border:1px solid var(--border-medium); border-radius:8px;" />
            <button type="submit" class="btn btn-outline btn-sm">شبیه‌سازی دریافت پیام از این مشاور</button>
          </form>
        </details>
      `;

      const scrollEl = document.getElementById('threadMessagesScroll');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;

      pane.querySelectorAll('input[name="sendChannel"]').forEach((r) => {
        r.addEventListener('change', () => {
          activeChatChannel = r.value;
        });
      });

      document.getElementById('insertRefLinkBtn')?.addEventListener('click', () => {
        const ta = document.getElementById('directSendTextarea');
        ta.value =
          (ta.value ? ta.value + '\n' : '') +
          `سلام ${contact.full_name || 'همکار'} عزیز 🌹\nلینک دعوت اختصاصی شما در نوکابین (۲ میلیون تخفیف مشتری + ۵٪ پورسانت شما):\n${refUrl}\nمشاهده نمونه‌کارهای واقعی:\n${window.location.origin}/changes.html`;
      });

      document.getElementById('insertInviteTemplateBtn')?.addEventListener('click', () => {
        const ta = document.getElementById('directSendTextarea');
        const tpl = (overview.settings.templates && overview.settings.templates[0]) || '';
        ta.value = tpl
          .replace(/\{\{\s*name\s*\}\}/gi, contact.full_name || 'مشاور محترم املاک')
          .replace(/\{\{\s*district\s*\}\}/gi, contact.district || 'تهران')
          .replace(/\{\{\s*agency\s*\}\}/gi, contact.agency_name || 'دفتر املاک')
          .replace(/\{\{\s*link\s*\}\}/gi, refUrl);
      });

      document.getElementById('toggleBotPauseBtn')?.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/outreach/contacts/${contact.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botPaused: !contact.bot_paused }),
          });
          showToast(
            !contact.bot_paused ? 'پاسخ‌گوی خودکار برای این مشاور متوقف شد.' : 'پاسخ‌گوی خودکار مجدداً فعال شد.',
            'info'
          );
          renderInboxSubTab(subContainer, rootContainer, overview);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('toggleSeriousBtn')?.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/outreach/contacts/${contact.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isSerious: !contact.is_serious,
              seriousReason: !contact.is_serious ? 'علامت‌گذاری دستی توسط مدیریت' : '',
            }),
          });
          showToast('وضعیت مورد جدی به‌روزرسانی شد.', 'success');
          renderOutreachAdminTab(rootContainer);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('registerAgentNowBtn')?.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/outreach/contacts/${contact.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              registerAsAgent: true,
              preferredMessenger: activeChatChannel,
              waStatus: activeChatChannel === 'whatsapp' ? 'registered' : contact.wa_status,
              baleStatus: activeChatChannel === 'bale' ? 'registered' : contact.bale_status,
            }),
          });
          showToast(`مشاور (${contact.phone}) در سیستم مشاورین همکار نوکابین ثبت شد!`, 'success');
          renderInboxSubTab(subContainer, rootContainer, overview);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('adminDirectSendForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('directSendTextarea').value.trim();
        const ch = pane.querySelector('input[name="sendChannel"]:checked')?.value || 'whatsapp';
        if (!text) return;
        try {
          const res = await apiFetch(`/api/outreach/contacts/${contact.id}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: ch, text }),
          });
          showToast(res.message, 'success');
          document.getElementById('directSendTextarea').value = '';
          await renderContactThreadPane(pane, contact.id, subContainer, rootContainer, overview);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('simulateInboundForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('simulateInboundInput').value.trim();
        const ch = pane.querySelector('input[name="sendChannel"]:checked')?.value || 'whatsapp';
        if (!text) return;
        try {
          const res = await apiFetch(`/api/outreach/contacts/${contact.id}/simulate-inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: ch, text }),
          });
          showToast(
            res.decision.isSerious
              ? `🔴 مورد جدی تشخیص داده شد (${res.decision.seriousReason}) و ربات متوقف گردید!`
              : `پاسخ خودکار قانون (${res.decision.category}) ثبت شد.`,
            res.decision.isSerious ? 'info' : 'success'
          );
          renderOutreachAdminTab(rootContainer);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    } catch (err) {
      pane.innerHTML = `<div class="info-banner" style="color:var(--accent-danger);">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------------- 2. CONNECTIONS SUB-TAB (WHATSAPP QR + BALE WEB LIVE BROWSER) ----------------
  function renderConnectionsSubTab(subContainer, rootContainer, overview) {
    const { escapeHtml, showToast, apiFetch } = window.NoKabin;
    const wa = overview.connections.whatsapp;
    const bale = overview.connections.bale;

    subContainer.innerHTML = `
      <div class="form-section-grid">
        <!-- WhatsApp Unofficial Line Card -->
        <div class="card">
          <h2 style="font-size:1.15rem; font-weight:900; margin-bottom:8px;">
            ۱. اتصال خط جداگانه واتس‌اپ (روش غیررسمی Baileys با QR Code)
          </h2>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:14px;">
            سیم‌کارت مجزای ارسال پیام را در گوشی باز کنید، از بخش <strong>Linked Devices (دستگاه‌های متصل)</strong> کد زیر را اسکن نمایید. اگر خودتان از گوشی در چتی پیام بنویسید، ربات برای آن شخص خودکار متوقف می‌شود.
          </p>

          <div class="field" style="margin-bottom:12px;">
            <label>پروکسی واتس‌اپ (مخصوص سرور ایران — لینک مستقیم <code>vless://...</code> یا <code>socks5://</code> / <code>http://</code>)</label>
            <input type="text" id="waProxyInput" class="ltr" value="${escapeHtml(wa.proxyUrl || '')}" placeholder="vless://uuid@server:port?security=reality&... یا socks5://127.0.0.1:10808" />
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
            <button type="button" class="btn btn-primary btn-sm" id="waStartConnectBtn">
              📷 اتصال / دریافت QR Code واتس‌اپ
            </button>
            <button type="button" class="btn btn-gold btn-sm" id="waCheckStatusBtn">
              🔄 بررسی وضعیت اتصال
            </button>
            <button type="button" class="btn btn-outline btn-sm" id="waRefreshQrBtn">تولید QR جدید</button>
            <button type="button" class="btn btn-danger btn-sm" id="waLogoutBtn">خروج و پاک کردن نشست</button>
          </div>

          <div id="waStatusBox" style="padding:16px; border:1px solid var(--border-medium); border-radius:12px; background:var(--bg-canvas); text-align:center;">
          </div>
        </div>

        <!-- Bale Web Personal Account Browser Automation Card -->
        <div class="card">
          <h2 style="font-size:1.15rem; font-weight:900; margin-bottom:8px;">
            ۲. اتصال به حساب شخصی در نسخه وب بله (web.bale.ai)
          </h2>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:14px;">
            مرورگر Chromium روی سرور باز شده و نشست حساب بله شما را ذخیره می‌کند. ابتدا مرورگر را روشن کنید، سپس شماره بله و کد تایید ۵ رقمی را وارد نمایید.
          </p>

          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
            <button type="button" class="btn btn-primary btn-sm" id="baleStartBrowserBtn">🚀 روشن کردن / بروزرسانی مرورگر بله وب</button>
            <button type="button" class="btn btn-outline btn-sm" id="baleSelectIranBtn">🇮🇷 انتخاب خودکار ایران (+98)</button>
            <button type="button" class="btn btn-outline btn-sm" id="baleRefreshShotBtn">📸 تصویر لحظه‌ای صفحه بله</button>
            <button type="button" class="btn btn-danger btn-sm" id="baleLogoutBtn">خروج از حساب بله</button>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:14px;">
            <form id="balePhoneForm" style="display:flex; gap:6px;">
              <input type="tel" id="baleLoginPhoneInput" class="ltr" value="09365603574" placeholder="شماره بله: 09365603574" style="flex:1; padding:8px; border:1px solid var(--border-medium); border-radius:8px;" />
              <button type="submit" class="btn btn-outline btn-sm">ارسال شماره</button>
            </form>
            <form id="baleOtpForm" style="display:flex; gap:6px;">
              <input type="text" id="baleLoginOtpInput" class="ltr" placeholder="کد تایید بله..." style="flex:1; padding:8px; border:1px solid var(--border-medium); border-radius:8px;" />
              <button type="submit" class="btn btn-gold btn-sm">ثبت کد تایید</button>
            </form>
          </div>

          <div style="padding:12px; border:1px solid var(--border-medium); border-radius:12px; background:var(--bg-canvas); text-align:center;">
            <div style="margin-bottom:8px; font-size:0.85rem;">
              وضعیت مرورگر بله: <strong>${escapeHtml(bale.status)}</strong>
              ${bale.lastError ? `<div style="color:var(--accent-danger); font-size:0.8rem;">${escapeHtml(bale.lastError)}</div>` : ''}
            </div>
            ${
              bale.lastScreenshotDataUrl
                ? `<div>
                    <img src="${bale.lastScreenshotDataUrl}" id="baleLiveScreenshotImg" alt="Bale Web Live Preview" style="width:100%; max-height:320px; object-fit:contain; border-radius:8px; border:1px solid var(--border-medium); cursor:crosshair;" title="برای کلیک در آن نقطه از صفحه بله، روی تصویر کلیک کنید" />
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:6px;">نمای زنده مرورگر سرور (با کلیک روی هر بخش تصویر، کلیک به مرورگر بله ارسال می‌شود)</div>
                   </div>`
                : `<div style="font-size:0.84rem; color:var(--text-muted); padding:24px;">روی «روشن کردن / بروزرسانی مرورگر بله وب» کلیک کنید تا صفحه web.bale.ai بارگذاری شود.</div>`
            }
          </div>
        </div>
      </div>
    `;

    function paintWaStatusBox(waState) {
      const box = document.getElementById('waStatusBox');
      if (!box) return;
      box.innerHTML = `
        <div style="margin-bottom:8px;">
          وضعیت فعلی: <strong>${escapeHtml(waState.status)}</strong>
          ${waState.connectedPhone ? ` — خط متصل: <strong class="ltr">${escapeHtml(waState.connectedPhone)}</strong>` : ''}
        </div>
        ${
          waState.vlessTunnel && waState.vlessTunnel.status === 'running'
            ? `<div class="tag olive" style="margin-bottom:8px; display:inline-block;">🛡 تونل VLESS فعال (${escapeHtml(waState.vlessTunnel.serverAddress)}:${escapeHtml(String(waState.vlessTunnel.serverPort || ''))})</div>`
            : waState.vlessTunnel && waState.vlessTunnel.status === 'error'
            ? `<div style="color:var(--accent-danger); font-size:0.8rem; margin-bottom:8px;">خطای تونل VLESS: ${escapeHtml(waState.vlessTunnel.lastError || '')}</div>`
            : ''
        }
        ${
          waState.lastError
            ? `<div style="color:var(--accent-danger); font-size:0.82rem; margin-bottom:10px;">${escapeHtml(waState.lastError)}</div>`
            : ''
        }
        ${
          waState.qrDataUrl
            ? `<div>
                <img src="${waState.qrDataUrl}" alt="WhatsApp QR Code" style="width:240px; height:240px; margin:0 auto; border-radius:10px; border:4px solid #fff;" />
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:8px;">کد را با واتس‌اپ گوشی اسکن کنید و سپس دکمه «بررسی وضعیت اتصال» را بزنید.</div>
               </div>`
            : waState.status === 'connected'
            ? `<div class="info-banner olive">✅ واتس‌اپ متصل و آماده ارسال و دریافت پیام است.</div>`
            : `<div style="font-size:0.84rem; color:var(--text-muted);">روی «اتصال / دریافت QR Code واتس‌اپ» کلیک کنید تا بارکد تولید شود.</div>`
        }
        ${
          Array.isArray(waState.debugLog) && waState.debugLog.length > 0
            ? `<div class="ltr" style="margin-top:10px; text-align:left; font-size:0.72rem; color:var(--text-muted); background:#fff; padding:8px; border-radius:8px; border:1px solid var(--border-light); max-height:110px; overflow-y:auto; white-space:pre-wrap;">${escapeHtml(waState.debugLog.join('\n'))}</div>`
            : ''
        }
      `;
    }

    paintWaStatusBox(wa);

    if (window._waConnPollTimer) {
      clearInterval(window._waConnPollTimer);
      window._waConnPollTimer = null;
    }

    async function refreshWaStatusInPlace(showSuccessToast = false) {
      try {
        const latest = await apiFetch('/api/outreach/overview');
        const nextWa = latest?.connections?.whatsapp;
        if (nextWa) {
          paintWaStatusBox(nextWa);
          if (showSuccessToast) {
            showToast(`وضعیت واتس‌اپ: ${nextWa.status}`, 'info');
          }
          if (nextWa.status === 'connected' && window._waConnPollTimer) {
            clearInterval(window._waConnPollTimer);
            window._waConnPollTimer = null;
          }
        }
      } catch {}
    }

    if (activeSubTab === 'connections' && (wa.status === 'qr_ready' || wa.status === 'connecting')) {
      window._waConnPollTimer = setInterval(() => {
        if (activeSubTab !== 'connections' || !document.getElementById('waStatusBox')) {
          clearInterval(window._waConnPollTimer);
          window._waConnPollTimer = null;
          return;
        }
        refreshWaStatusInPlace(false);
      }, 5000);
    }

    document.getElementById('waCheckStatusBtn')?.addEventListener('click', () => {
      refreshWaStatusInPlace(true);
    });

    document.getElementById('waStartConnectBtn')?.addEventListener('click', async () => {
      try {
        const proxyUrl = document.getElementById('waProxyInput').value.trim();
        await apiFetch('/api/outreach/whatsapp/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxyUrl, forceNewQr: false }),
        });
        showToast('درخواست اتصال واتس‌اپ ارسال شد. ۳ ثانیه صبر کنید...', 'info');
        setTimeout(() => renderOutreachAdminTab(rootContainer), 3200);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('waRefreshQrBtn')?.addEventListener('click', async () => {
      try {
        const proxyUrl = document.getElementById('waProxyInput').value.trim();
        await apiFetch('/api/outreach/whatsapp/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxyUrl, forceNewQr: true }),
        });
        showToast('در حال تولید QR Code جدید...', 'info');
        setTimeout(() => renderOutreachAdminTab(rootContainer), 3500);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    function paintProxyTestResult(res) {
      const box = document.getElementById('proxyTestResultBox');
      if (!box) return;
      if (!res) {
        box.innerHTML = '';
        return;
      }
      if (res.whatsappReachable) {
        box.innerHTML = `
          <div class="info-banner olive" style="padding:10px; font-size:0.82rem;">
            <div><strong>✅ پروکسی متصل و سالم است!</strong> (دسترسی به واتس‌اپ برقرار — پینگ: ${toPersianDigits(res.latencyMs || 0)} میلی‌ثانیه)</div>
            <div style="margin-top:4px;">
              🌍 کشور: <strong>${escapeHtml(res.country || 'نامشخص')}${res.countryCode ? ` (${escapeHtml(res.countryCode)})` : ''}</strong>
              ${res.city ? ` — شهر: <strong>${escapeHtml(res.city)}</strong>` : ''}
              | آی‌پی خروجی: <strong class="ltr">${escapeHtml(res.exitIp || '-')}</strong>
              ${res.isp ? ` | ارائه‌دهنده: <span class="ltr">${escapeHtml(res.isp)}</span>` : ''}
            </div>
          </div>
        `;
      } else {
        box.innerHTML = `
          <div class="info-banner" style="padding:10px; font-size:0.82rem; border-color:#fca5a5; background:#fef2f2; color:#991b1b;">
            <div><strong>❌ پروکسی به واتس‌اپ متصل نشد</strong></div>
            ${res.exitIp ? `<div>🌍 کشور: ${escapeHtml(res.country || '-')} | آی‌پی: <span class="ltr">${escapeHtml(res.exitIp)}</span></div>` : ''}
            ${res.error ? `<div class="ltr" style="margin-top:4px;">${escapeHtml(res.error)}</div>` : ''}
          </div>
        `;
      }
    }

    if (wa.vlessTunnel?.lastTestResult) {
      paintProxyTestResult(wa.vlessTunnel.lastTestResult);
    }

    document.getElementById('applyProxyBtn')?.addEventListener('click', async () => {
      const proxyUrl = document.getElementById('waProxyInput').value.trim();
      const box = document.getElementById('proxyTestResultBox');
      if (box) box.innerHTML = `<div style="color:var(--text-secondary);">⏳ در حال اعمال پروکسی، بررسی آی‌پی/کشور و تست اتصال به واتس‌اپ...</div>`;
      try {
        const res = await apiFetch('/api/outreach/proxy/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxyUrl }),
        });
        paintProxyTestResult(res.testResult);
        if (res.whatsapp) paintWaStatusBox(res.whatsapp);
        showToast(res.message, res.testResult?.whatsappReachable ? 'success' : 'error');
      } catch (err) {
        if (box) box.innerHTML = `<div style="color:var(--accent-danger);">${escapeHtml(err.message)}</div>`;
        showToast(err.message, 'error');
      }
    });

    document.getElementById('testProxyBtn')?.addEventListener('click', async () => {
      const proxyUrl = document.getElementById('waProxyInput').value.trim();
      const box = document.getElementById('proxyTestResultBox');
      if (box) box.innerHTML = `<div style="color:var(--text-secondary);">⏳ در حال تست پروکسی و دریافت کشور و آی‌پی...</div>`;
      try {
        const res = await apiFetch('/api/outreach/proxy/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxyUrl }),
        });
        paintProxyTestResult(res.testResult);
      } catch (err) {
        if (box) box.innerHTML = `<div style="color:var(--accent-danger);">${escapeHtml(err.message)}</div>`;
        showToast(err.message, 'error');
      }
    });

    document.getElementById('waLogoutBtn')?.addEventListener('click', async () => {
      try {
        await apiFetch('/api/outreach/whatsapp/logout', { method: 'POST' });
        showToast('نشست واتس‌اپ پاک شد.', 'info');
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('baleStartBrowserBtn')?.addEventListener('click', async () => {
      try {
        showToast('در حال راه‌اندازی مرورگر بله وب...', 'info');
        await apiFetch('/api/outreach/bale/start', { method: 'POST' });
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('baleSelectIranBtn')?.addEventListener('click', async () => {
      try {
        showToast('در حال انتخاب ایران (+98) در صفحه بله وب...', 'info');
        await apiFetch('/api/outreach/bale/select-iran', { method: 'POST' });
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('baleRefreshShotBtn')?.addEventListener('click', async () => {
      try {
        await apiFetch('/api/outreach/bale/screenshot', { method: 'POST' });
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('baleLogoutBtn')?.addEventListener('click', async () => {
      try {
        await apiFetch('/api/outreach/bale/logout', { method: 'POST' });
        showToast('نشست بله وب بسته و پاک شد.', 'info');
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('balePhoneForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('baleLoginPhoneInput').value.trim();
      if (!phone) return;
      try {
        showToast('در حال وارد کردن شماره در بله وب...', 'info');
        await apiFetch('/api/outreach/bale/login-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('baleOtpForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('baleLoginOtpInput').value.trim();
      if (!code) return;
      try {
        showToast('در حال ثبت کد تایید در بله وب...', 'info');
        await apiFetch('/api/outreach/bale/login-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const shotImg = document.getElementById('baleLiveScreenshotImg');
    if (shotImg) {
      shotImg.addEventListener('click', async (e) => {
        const rect = shotImg.getBoundingClientRect();
        const scaleX = 1280 / rect.width;
        const scaleY = 820 / rect.height;
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);
        try {
          await apiFetch('/api/outreach/bale/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'click', x, y }),
          });
          renderOutreachAdminTab(rootContainer);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  }

  // ---------------- 3. BULK IMPORT 2000 CONTACTS SUB-TAB ----------------
  function renderImportSubTab(subContainer, rootContainer) {
    const { showToast, apiFetch } = window.NoKabin;

    subContainer.innerHTML = `
      <div class="form-section-grid">
        <form class="card" id="outreachImportForm">
          <h2 style="font-size:1.15rem; font-weight:900; margin-bottom:10px;">
            ورود انبوه لیست شماره‌های مشاورین املاک (تا ۲۰۰۰+ شماره هم‌زمان)
          </h2>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:14px;">
            می‌توانید فایل CSV/TXT خروجی اکسل را انتخاب کنید یا لیست شماره‌ها را مستقیماً در کادر زیر بچسبانید. سیستم به‌صورت هوشمند شماره‌های فارسی/انگلیسی را استانداردسازی (` +
      '`0912...`' +
      `) و موارد تکراری را حذف می‌کند.
          </p>

          <div class="form-grid">
            <div class="field">
              <label>آپلود فایل CSV یا TXT (خروجی اکسل)</label>
              <input type="file" id="csvFileInput" accept=".csv,.txt,.tsv" />
            </div>
            <div class="field">
              <label>منطقه پیش‌فرض (اگر در فایل ستون منطقه نباشد)</label>
              <select id="importDefaultDistrict">
                <option value="شمال و شرق تهران">شمال و شرق تهران</option>
                <option value="مرکز و غرب تهران">مرکز و غرب تهران</option>
                <option value="تهران">سایر مناطق تهران</option>
              </select>
            </div>
            <div class="field full">
              <label>متن لیست شماره‌ها (هر خط یک مشاور — فرمت: <code>شماره، نام مشاور، نام دفتر املاک، منطقه</code> یا فقط <code>شماره</code>)</label>
              <textarea id="importRawTextarea" rows="10" placeholder="09121112233, مهندس رضایی, املاک نیاوران, شمال و شرق تهران&#10;09124445566, علی محمدی, مسکن پاسداران, شمال و شرق تهران&#10;09127778899"></textarea>
            </div>
            <div class="field full">
              <button type="submit" class="btn btn-primary" style="width:100%;">
                📥 ثبت و افزودن شماره‌ها به صف کمپین واتس‌اپ و بله
              </button>
            </div>
          </div>
        </form>

        <div class="card">
          <h2 style="font-size:1.1rem; font-weight:900; margin-bottom:10px;">راهنمای فرمت اکسل / CSV برای ۲۰۰۰ مخاطب</h2>
          <ul style="font-size:0.86rem; line-height:1.9; color:var(--text-secondary); padding-right:18px;">
            <li>اگر فقط لیست شماره‌ها را دارید، کافی است در هر خط یک شماره باشد (حتی با پیش‌شماره <code>+98</code> یا <code>98</code> یا اعداد فارسی).</li>
            <li>اگر نام مشاور و دفتر املاک را هم وارد کنید، در متن دعوت به‌جای <code>{{name}}</code> و <code>{{district}}</code> نام واقعی مشاور قرار می‌گیرد که نرخ پاسخ‌گویی را تا ۳ برابر افزایش می‌دهد.</li>
            <li>شماره‌های جدید هم‌زمان در صف هر <strong>دو کمپین مستقل واتس‌اپ و بله</strong> قرار می‌گیرند تا هر کدام را که روشن کردید طبق سقف روزانه ارسال کند.</li>
            <li>اگر شماره‌ای قبلاً در سیستم باشد، دوباره تکراری ثبت نمی‌شود و وضعیت ارسال قبلی‌اش حفظ می‌گردد.</li>
          </ul>
        </div>
      </div>
    `;

    const fileInput = document.getElementById('csvFileInput');
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const ta = document.getElementById('importRawTextarea');
      ta.value = (ta.value ? ta.value + '\n' : '') + text;
      showToast('محتوای فایل در کادر قرار گرفت. روی دکمه ثبت کلیک کنید.', 'info');
    });

    document.getElementById('outreachImportForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawText = document.getElementById('importRawTextarea').value;
      const defaultDistrict = document.getElementById('importDefaultDistrict').value;
      try {
        const res = await apiFetch('/api/outreach/contacts/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText, defaultDistrict }),
        });
        showToast(res.message, 'success');
        activeSubTab = 'inbox';
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // ---------------- 4. SETTINGS, TEMPLATES & RULE TESTER SUB-TAB ----------------
  function renderSettingsSubTab(subContainer, rootContainer, overview) {
    const { escapeHtml, showToast, apiFetch } = window.NoKabin;
    const s = overview.settings;
    const templates = s.templates || [];

    subContainer.innerHTML = `
      <div class="form-section-grid">
        <form class="card" id="outreachSettingsForm">
          <h2 style="font-size:1.15rem; font-weight:900; margin-bottom:12px;">
            تنظیمات ضد مسدودی (۲۰،۰۰ شماره)، اعلان موارد جدی و قالب‌های دعوت
          </h2>

          <div class="form-grid">
            <div class="field">
              <label>سقف ارسال روزانه واتس‌اپ (پیشنهاد: ۳۵ تا ۵۰)</label>
              <input type="number" name="waDailyLimit" min="5" max="250" value="${s.waDailyLimit}" />
            </div>
            <div class="field">
              <label>سقف ارسال روزانه بله (پیشنهاد: ۳۰ تا ۴۵)</label>
              <input type="number" name="baleDailyLimit" min="5" max="250" value="${s.baleDailyLimit}" />
            </div>

            <div class="field">
              <label>حداقل فاصله بین دو پیام (ثانیه)</label>
              <input type="number" name="minDelaySec" min="20" max="600" value="${s.minDelaySec}" />
            </div>
            <div class="field">
              <label>حداکثر فاصله تصادفی بین دو پیام (ثانیه)</label>
              <input type="number" name="maxDelaySec" min="30" max="1200" value="${s.maxDelaySec}" />
            </div>

            <div class="field">
              <label>ساعت شروع ارسال روزانه (به وقت تهران)</label>
              <input type="number" name="workHourStart" min="0" max="23" value="${s.workHourStart}" />
            </div>
            <div class="field">
              <label>ساعت پایان ارسال روزانه (به وقت تهران)</label>
              <input type="number" name="workHourEnd" min="1" max="24" value="${s.workHourEnd}" />
            </div>

            <div class="field">
              <label>شماره اصلی مدیریت جهت دریافت هشدار موارد جدی</label>
              <input type="tel" name="adminAlertPhone" class="ltr" value="${escapeHtml(s.adminAlertPhone)}" />
            </div>
            <div class="field">
              <label>ارسال خلاصه موارد جدی در کدام پیام‌رسان؟</label>
              <select name="adminAlertChannel">
                <option value="both" ${s.adminAlertChannel === 'both' ? 'selected' : ''}>هر دو (بله و واتس‌اپ در صورت اتصال)</option>
                <option value="whatsapp" ${s.adminAlertChannel === 'whatsapp' ? 'selected' : ''}>فقط واتس‌اپ</option>
                <option value="bale" ${s.adminAlertChannel === 'bale' ? 'selected' : ''}>فقط بله</option>
              </select>
            </div>

            <div class="field full" style="display:flex; flex-wrap:wrap; gap:18px; padding:8px 0;">
              <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                <input type="checkbox" name="warmupEnabled" ${s.warmupEnabled ? 'checked' : ''} />
                <span><strong>گرم‌کردن تدریجی خط (Warm-up):</strong> شروع از ۱۵ پیام در روزهای اول و افزایش پله‌ای تا سقف روزانه</span>
              </label>
              <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                <input type="checkbox" name="autoReplyEnabled" ${s.autoReplyEnabled ? 'checked' : ''} />
                <span><strong>پاسخ‌گوی هوشمند مبتنی بر قوانین:</strong> پاسخ خودکار به سوالات اولیه و توقف روی موارد جدی</span>
              </label>
            </div>

            <div class="field full">
              <label>الگوی دعوت شماره ۱ (متغیرها: <code>{{name}}</code>، <code>{{district}}</code>، <code>{{agency}}</code>، <code>{{link}}</code>)</label>
              <textarea name="tpl1" rows="4">${escapeHtml(templates[0] || '')}</textarea>
            </div>
            <div class="field full">
              <label>الگوی دعوت شماره ۲ (چرخش خودکار برای جلوگیری از تشخیص اسپم)</label>
              <textarea name="tpl2" rows="4">${escapeHtml(templates[1] || '')}</textarea>
            </div>
            <div class="field full">
              <label>الگوی دعوت شماره ۳</label>
              <textarea name="tpl3" rows="4">${escapeHtml(templates[2] || '')}</textarea>
            </div>

            <div class="field full">
              <button type="submit" class="btn btn-primary" style="width:100%;">ذخیره تنظیمات و قالب‌های پیام</button>
            </div>
          </div>
        </form>

        <div class="card">
          <h2 style="font-size:1.1rem; font-weight:900; margin-bottom:10px;">
            🧠 تست زنده موتور قوانین و کلمات کلیدی (بدون هزینه API)
          </h2>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:12px;">
            هر جمله‌ای که فکر می‌کنید مشاور املاک ممکن است در جواب بنویسد را اینجا تست کنید تا پاسخ ربات و تشخیص «مورد جدی» را ببینید:
          </p>
          <form id="rulePreviewForm" style="display:flex; gap:8px; margin-bottom:14px;">
            <input type="text" id="rulePreviewInput" value="سلام وقت بخیر، شرایط پورسانت و نمونه کارهاتون رو میفرستید؟" style="flex:1; padding:8px; border:1px solid var(--border-medium); border-radius:8px;" />
            <button type="submit" class="btn btn-gold btn-sm">تست پاسخ ربات</button>
          </form>
          <div id="rulePreviewResult" style="padding:12px; border-radius:10px; background:var(--bg-canvas); border:1px solid var(--border-light); font-size:0.85rem;">
            روی «تست پاسخ ربات» کلیک کنید.
          </div>
        </div>
      </div>
    `;

    document.getElementById('outreachSettingsForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        waDailyLimit: Number(fd.get('waDailyLimit')),
        baleDailyLimit: Number(fd.get('baleDailyLimit')),
        minDelaySec: Number(fd.get('minDelaySec')),
        maxDelaySec: Number(fd.get('maxDelaySec')),
        workHourStart: Number(fd.get('workHourStart')),
        workHourEnd: Number(fd.get('workHourEnd')),
        adminAlertPhone: fd.get('adminAlertPhone'),
        adminAlertChannel: fd.get('adminAlertChannel'),
        warmupEnabled: fd.get('warmupEnabled') === 'on',
        autoReplyEnabled: fd.get('autoReplyEnabled') === 'on',
        templates: [fd.get('tpl1'), fd.get('tpl2'), fd.get('tpl3')].map((t) => String(t || '').trim()).filter(Boolean),
      };

      try {
        const res = await apiFetch('/api/outreach/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast(res.message, 'success');
        renderOutreachAdminTab(rootContainer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('rulePreviewForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('rulePreviewInput').value;
      const box = document.getElementById('rulePreviewResult');
      try {
        const res = await apiFetch('/api/outreach/preview-rule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const d = res.decision;
        box.innerHTML = `
          <div style="margin-bottom:8px; display:flex; flex-wrap:wrap; gap:6px;">
            <span class="tag olive">دسته تشخیص‌داده‌شده: ${escapeHtml(d.category)}</span>
            ${
              d.isSerious
                ? `<span class="tag" style="background:#dc2626; color:#fff;">🔴 مورد جدی: ${escapeHtml(d.seriousReason)} (ارسال هشدار به 09225603574 + توقف ربات)</span>`
                : `<span class="tag">پاسخ خودکار عادی (ربات ادامه می‌دهد)</span>`
            }
            ${d.autoRegisterAgent ? `<span class="tag" style="background:#fef9c3; color:#854d0e;">✅ ثبت خودکار در پنل مشاورین</span>` : ''}
          </div>
          <div style="white-space:pre-wrap; background:#fff; padding:10px; border-radius:8px; border:1px solid var(--border-medium); line-height:1.65;">${escapeHtml(d.replyText || '-')}</div>
        `;
      } catch (err) {
        box.textContent = err.message;
      }
    });
  }
})();
