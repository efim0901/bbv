 // ── State ──
  const state = {
    categories: [],
    listings: [],
    total: 0,
    limit: 12,
    offset: 0,
    favorites: new Set(),
    theme: localStorage.getItem('theme') || 'light'
  };

  // ── Elements ──
  const el = {
    listingGrid: document.querySelector('#listingGrid'),
    resultCount: document.querySelector('#resultCount'),
    categorySelect: document.querySelector('#categorySelect'),
    formCategorySelect: document.querySelector('#formCategorySelect'),
    searchInput: document.querySelector('#searchInput'),
    minPriceInput: document.querySelector('#minPriceInput'),
    maxPriceInput: document.querySelector('#maxPriceInput'),
    sortSelect: document.querySelector('#sortSelect'),
    refreshButton: document.querySelector('#refreshButton'),
    openCreate: document.querySelector('#openCreate'),
    createDialog: document.querySelector('#createDialog'),
    listingForm: document.querySelector('#listingForm'),
    detailPanel: document.querySelector('#detailPanel'),
    detailDialog: document.querySelector('#detailDialog'),
    detailContent: document.querySelector('#detailContent'),
    closeDetail: document.querySelector('#closeDetail'),
    pagination: document.querySelector('#pagination'),
    filtersToggle: document.querySelector('#filtersToggle'),
    filtersPanel: document.querySelector('#filtersPanel'),
    themeToggle: document.querySelector('#themeToggle'),
    imagePreview: document.querySelector('#imagePreview'),
    toastContainer: document.querySelector('#toastContainer')
  };

  // ── Utils ──
  const fmt = new Intl.NumberFormat('ru-RU');

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function debounce(fn, wait = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  // ── API ──
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка API');
    return data;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result.split(',')[1]));
      reader.addEventListener('error', () => reject(reader.error));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file) {
    if (!file || !file.size) return null;
    if (file.size > 6 * 1024 * 1024) throw new Error('Фото должно быть не больше 6 MB.');
    const data = await api('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, data: await fileToBase64(file) })
    });
    return data.file.url;
  }

  // ── Theme ──
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    el.themeToggle.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', state.theme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme();
  }

  // ── Render ──
  function imageFor(listing) {
    return listing.images?.[0]?.url || '/assets/no-photo.svg';
  }

  function priceFor(listing) {
    return `${fmt.format(listing.price)} ${listing.currency}`;
  }

  function renderCategories() {
    const opts = state.categories.map(c => {
      const prefix = c.parentId ? '  — ' : '';
      return `<option value="${c.id}">${prefix}${esc(c.name)}</option>`;
    }).join('');
    el.categorySelect.innerHTML = `<option value="">Все категории</option>${opts}`;
    el.formCategorySelect.innerHTML = state.categories
      .filter(c => c.parentId)
      .map(c => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join('');
  }

  function renderListings() {
    if (!state.listings.length) {
      el.resultCount.textContent = 'Объявлений не найдено';
      el.listingGrid.innerHTML = '<div class="empty-state">😕 По этим фильтрам ничего не найдено. Попробуйте изменить
  параметры.</div>';
      el.pagination.innerHTML = '';
      return;
    }

    el.resultCount.textContent = `Найдено: ${state.total}`;

    el.listingGrid.innerHTML = state.listings.map((l, i) => `
      <button class="listing-card" data-id="${l.id}" style="animation-delay: ${i * 0.05}s">
        <img src="${imageFor(l)}" alt="" loading="lazy">
        <span class="card-body">
          <span class="card-title">${esc(l.title)}</span>
          <span class="price-row">
            <span class="price">${priceFor(l)}</span>
            <span class="chip">${esc(l.category?.name || 'Без категории')}</span>
          </span>
          <span class="meta">${esc([l.city, l.seller?.name].filter(Boolean).join(' · '))}</span>
        </span>
      </button>
    `).join('');

    renderPagination();
  }

  function renderPagination() {
    const totalPages = Math.ceil(state.total / state.limit);
    const currentPage = Math.floor(state.offset / state.limit) + 1;
    if (totalPages <= 1) { el.pagination.innerHTML = ''; return; }

    let html = '';
    if (currentPage > 1) html += `<button data-page="${currentPage - 2}">←</button>`;
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
      html += `<button class="${p === currentPage ? 'active' : ''}" data-page="${p - 1}">${p}</button>`;
    }
    if (currentPage < totalPages) html += `<button data-page="${currentPage}">→</button>`;
    el.pagination.innerHTML = html;
  }

  function renderDetail(listing) {
    const isFav = state.favorites.has(listing.id);
    const html = `
      <img src="${imageFor(listing)}" alt="">
      <div class="detail-body">
        <h2>${esc(listing.title)}</h2>
        <strong class="price" style="font-size:24px">${priceFor(listing)}</strong>
        <p>${esc(listing.description).replace(/\n/g, '<br>')}</p>
        <div class="detail-facts">
          <span>📂 ${esc(listing.category?.name || 'Без категории')}</span>
          <span>📍 ${esc(listing.city || 'Не указан')}</span>
          <span>👤 ${esc(listing.seller?.name || 'Не указан')}</span>
          <span>📞 ${esc(listing.seller?.phone || 'Не указан')}</span>
          <span>👁 ${listing.views || 0} просмотров</span>
        </div>
        <button class="favorite-btn ${isFav ? 'active' : ''}" id="favBtn" data-id="${listing.id}">
          ${isFav ? '❤️ В избранном' : '🤍 В избранное'}
        </button>
      </div>
    `;

    el.detailPanel.innerHTML = html;
    el.detailContent.innerHTML = html;

    // Fav button in both panels
    document.querySelectorAll('#favBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        try {
          if (state.favorites.has(id)) {
            await api('/api/favorites', {
              method: 'DELETE',
              headers: {},
              body: null
            });
            // Use query params for DELETE
            await fetch(`/api/favorites?userId=1&listingId=${id}`, { method: 'DELETE' });
            state.favorites.delete(id);
            showToast('Удалено из избранного', 'info');
          } else {
            await fetch(`/api/favorites?userId=1&listingId=${id}`, { method: 'DELETE' });
            state.favorites.add(id);
            showToast('Добавлено в избранное!', 'success');
          }
          renderDetail(listing);
        } catch {
          showToast('Ошибка. Попробуйте позже.', 'error');
        }
      });
    });
  }

  // ── Data loading ──
  function currentFilters() {
    const params = new URLSearchParams();
    const v = el.searchInput.value.trim();
    if (v) params.set('q', v);
    if (el.categorySelect.value) params.set('categoryId', el.categorySelect.value);
    if (el.minPriceInput.value) params.set('minPrice', el.minPriceInput.value);
    if (el.maxPriceInput.value) params.set('maxPrice', el.maxPriceInput.value);
    params.set('sort', el.sortSelect.value);
    params.set('limit', state.limit);
    params.set('offset', state.offset);
    return params;
  }

  async function loadCategories() {
    const data = await api('/api/categories');
    state.categories = data.categories;
    renderCategories();
  }

  async function loadListings() {
    el.listingGrid.innerHTML = '<div class="skeleton-card"></div>'.repeat(4);
    try {
      const data = await api(`/api/listings?${currentFilters()}`);
      state.listings = data.items;
      state.total = data.total;
      renderListings();
      if (state.listings[0]) renderDetail(state.listings[0]);
    } catch (error) {
      showToast(error.message, 'error');
      el.listingGrid.innerHTML = '<div class="empty-state">Ошибка загрузки. Попробуйте обновить.</div>';
    }
  }

  // ── Create listing ──
  async function createListing(event) {
    event.preventDefault();
    const formData = new FormData(el.listingForm);
    const files = formData.getAll('imageFiles').filter(f => f.size > 0);

    try {
      const imageUrls = [];
      for (const file of files.slice(0, 10)) {
        const url = await uploadImage(file);
        if (url) imageUrls.push(url);
      }

      await api('/api/listings', {
        method: 'POST',
        body: JSON.stringify({
          sellerName: formData.get('sellerName'),
          sellerPhone: formData.get('sellerPhone'),
          title: formData.get('title'),
          price: formData.get('price'),
          categoryId: formData.get('categoryId'),
          city: formData.get('city'),
          description: formData.get('description'),
          imageUrls
        })
      });

      el.listingForm.reset();
      el.imagePreview.innerHTML = '';
      el.createDialog.close();
      state.offset = 0;
      await loadListings();
      showToast('✅ Объявление опубликовано!', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  // ── Image preview ──
  function handleImagePreview(event) {
    const files = [...event.target.files].slice(0, 10);
    el.imagePreview.innerHTML = '';
    for (const file of files) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      el.imagePreview.appendChild(img);
    }
  }

  // ── Event listeners ──
  el.listingGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.listing-card');
    if (!card) return;
    const listing = state.listings.find(l => l.id === Number(card.dataset.id));
    if (!listing) return;
    renderDetail(listing);
    if (window.innerWidth <= 980) {
      el.detailDialog.showModal();
    }
  });

  el.openCreate.addEventListener('click', () => el.createDialog.showModal());
  el.refreshButton.addEventListener('click', () => { state.offset = 0; loadListings(); });
  el.listingForm.addEventListener('submit', createListing);
  el.closeDetail.addEventListener('click', () => el.detailDialog.close());
  el.themeToggle.addEventListener('click', toggleTheme);

  // Filters
  for (const control of [el.categorySelect, el.minPriceInput, el.maxPriceInput, el.sortSelect]) {
    control.addEventListener('input', () => { state.offset = 0; loadListings(); });
  }
  el.searchInput.addEventListener('input', debounce(() => { state.offset = 0; loadListings(); }));

  // Pagination
  el.pagination.addEventListener('click', (e) => {
    if (!e.target.dataset.page) return;
    state.offset = Number(e.target.dataset.page) * state.limit;
    loadListings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Mobile filters toggle
  el.filtersToggle?.addEventListener('click', () => {
    el.filtersPanel.classList.toggle('open');
  });

  // Image preview
  el.listingForm?.querySelector('input[name="imageFiles"]')?.addEventListener('change', handleImagePreview);

  // ── Init ──
  applyTheme();
  await loadCategories();
  await loadListings();