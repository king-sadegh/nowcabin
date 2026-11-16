document.addEventListener('DOMContentLoaded', async () => {
  const {
    apiFetch,
    escapeHtml,
    formatMillions,
    toPersianDigits,
    initBeforeAfterSliders,
  } = window.NoKabin;

  const grid = document.getElementById('galleryGrid');
  const filterBtns = document.querySelectorAll('#galleryFilters [data-filter]');
  let allProjects = [];

  function renderGallery(filter = 'all') {
    const items =
      filter === 'all'
        ? allProjects
        : allProjects.filter((p) => p.district.includes(filter) || filter.includes(p.district));

    if (!items.length) {
      grid.innerHTML = `<div class="card" style="text-align:center;">پروژه‌ای در این دسته‌بندی یافت نشد.</div>`;
      return;
    }

    grid.innerHTML = items
      .map(
        (p) => `
        <article class="gallery-card">
          <div class="ba-slider" data-ba-slider>
            <img src="${escapeHtml(p.before_image)}" alt="قبل از بازسازی ${escapeHtml(p.title)}" loading="lazy" />
            <div class="ba-after-layer">
              <img src="${escapeHtml(p.after_image)}" alt="بعد از بازسازی ${escapeHtml(p.title)}" loading="lazy" />
            </div>
            <span class="ba-badge before">قبل</span>
            <span class="ba-badge after">بعد</span>
            <div class="ba-divider"></div>
            <div class="ba-handle" aria-hidden="true">⇄</div>
            <input type="range" min="0" max="100" value="50" class="ba-range" aria-label="اسلایدر مقایسه ${escapeHtml(p.title)}" />
          </div>

          <div class="ba-controls" style="margin-top: 2px;">
            <span class="ba-caption">اسلایدر را بکشید</span>
            <div class="ba-quick-btns">
              <button type="button" data-ba-set="0">بعد</button>
              <button type="button" data-ba-set="50">۵۰٪</button>
              <button type="button" data-ba-set="100">قبل</button>
            </div>
          </div>

          <h2 style="font-size: 1.08rem; font-weight: 900;">${escapeHtml(p.title)}</h2>
          <p style="font-size: 0.88rem; color: var(--text-secondary);">${escapeHtml(p.description || '')}</p>

          <div class="gallery-meta">
            <span class="tag">${escapeHtml(p.district)}</span>
            <span class="tag gold">تحویل ${toPersianDigits(p.duration_days)} روزه</span>
            <span class="tag olive">${formatMillions(p.cost_toman)}</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); font-weight: 700;">
            رنگ اجراشده: ${escapeHtml(p.paint_color)}
          </div>
        </article>
      `
      )
      .join('');

    initBeforeAfterSliders(grid);
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderGallery(btn.getAttribute('data-filter'));
    });
  });

  try {
    const data = await apiFetch('/api/gallery');
    allProjects = data.projects || [];
    renderGallery('all');
  } catch (err) {
    grid.innerHTML = `<div class="info-banner danger">${escapeHtml(err.message)}</div>`;
  }
});
