window.NoKabin = (() => {
  const STATUS_LABELS = {
    pending: 'در انتظار بررسی',
    contacted: 'هماهنگی تلفنی',
    inspected: 'کارشناسی شده',
    in_progress: 'در حال اجرا (۱۵ روزه)',
    completed: 'تحویل‌شده',
    cancelled: 'لغوشده',
    approved: 'تاییدشده',
    paid: 'تسویه‌شده',
    rejected: 'ردشده',
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toPersianDigits(value) {
    const digits = '۰۱۲۳۴۵۶۷۸۹';
    return String(value ?? '').replace(/\d/g, (d) => digits[Number(d)]);
  }

  function formatToman(amount) {
    const num = Number(amount) || 0;
    return `${toPersianDigits(num.toLocaleString('en-US'))} تومان`;
  }

  function formatMillions(amount) {
    const millions = Math.round((Number(amount) || 0) / 1000000);
    return `${toPersianDigits(millions.toLocaleString('en-US'))} میلیون تومان`;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 4200);
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.error || 'خطا در ارتباط با سرور');
    }
    return data;
  }

  function initBeforeAfterSliders(root = document) {
    const sliders = root.querySelectorAll('[data-ba-slider]');
    sliders.forEach((slider) => {
      slider.setAttribute('dir', 'ltr');
      slider.style.direction = 'ltr';

      const range = slider.querySelector('.ba-range');
      const afterLayer = slider.querySelector('.ba-after-layer');
      const divider = slider.querySelector('.ba-divider');
      const handle = slider.querySelector('.ba-handle');
      if (!range || !afterLayer || !divider || !handle) return;

      range.setAttribute('dir', 'ltr');
      range.style.direction = 'ltr';

      const update = (val) => {
        const pct = Math.max(0, Math.min(100, Number(val)));
        range.value = pct;
        afterLayer.style.clipPath = `inset(0 0 0 ${pct}%)`;
        divider.style.left = `${pct}%`;
        handle.style.left = `${pct}%`;
      };

      const updateFromClientX = (clientX) => {
        const rect = slider.getBoundingClientRect();
        if (!rect.width) return;
        const pct = ((clientX - rect.left) / rect.width) * 100;
        update(pct);
      };

      range.addEventListener('input', (e) => {
        e.stopPropagation();
        update(e.target.value);
      });

      let dragging = false;
      slider.addEventListener('pointerdown', (e) => {
        dragging = true;
        updateFromClientX(e.clientX);
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        updateFromClientX(e.clientX);
      });
      window.addEventListener('pointerup', () => {
        dragging = false;
      });
      window.addEventListener('pointercancel', () => {
        dragging = false;
      });

      update(range.value || 50);

      const wrapper = slider.closest('.ba-wrapper, .gallery-card');
      if (wrapper) {
        wrapper.querySelectorAll('[data-ba-set]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const targetVal = btn.getAttribute('data-ba-set');
            update(targetVal);
          });
        });
      }
    });
  }

  function initCommonUI() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const drawer = document.getElementById('mobileDrawer');
    if (menuBtn && drawer) {
      menuBtn.addEventListener('click', () => {
        drawer.classList.toggle('open');
      });
      drawer.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => drawer.classList.remove('open'));
      });
    }

    document.querySelectorAll('[data-bale-link]').forEach((link) => {
      link.addEventListener('click', () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText('+989225603574').catch(() => {});
        }
        showToast('شماره پیام‌رسان بله (+989225603574) کپی شد.', 'info');
      });
    });

    // Update header panel button if logged in
    apiFetch('/api/auth/me')
      .then((data) => {
        const btn = document.getElementById('headerPanelBtn');
        if (btn && data.authenticated && data.user) {
          const roleName =
            data.user.role === 'admin'
              ? 'پنل مدیریت'
              : data.user.role === 'agent'
                ? 'پنل مشاور'
                : 'پنل من';
          btn.textContent = roleName;
        }
        const maxHint = document.getElementById('maxPhotosHint');
        if (maxHint && data.config?.maxPhotosPerUser) {
          maxHint.textContent = toPersianDigits(data.config.maxPhotosPerUser);
        }
      })
      .catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', initCommonUI);

  return {
    STATUS_LABELS,
    escapeHtml,
    toPersianDigits,
    formatToman,
    formatMillions,
    showToast,
    apiFetch,
    initBeforeAfterSliders,
  };
})();
