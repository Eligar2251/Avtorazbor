/**
 * UI.js - Управление интерфейсом
 * Совместим с App.js / Admin.js / Auth.js / Reservations.js из последних версий.
 */

const UI = {
  elements: {},
  _bound: false,

  init() {
    this.cacheElements();
    this.bindEvents();
  },

  cacheElements() {
    // Header
    this.elements.globalSearch = document.getElementById('globalSearch');
    this.elements.searchBtn = document.getElementById('searchBtn');
    this.elements.cartBtn = document.getElementById('cartBtn');
    this.elements.cartCount = document.getElementById('cartCount');
    this.elements.profileBtn = document.getElementById('profileBtn');
    this.elements.profileText = document.getElementById('profileText');
    this.elements.adminBtn = document.getElementById('adminBtn');

    // Sections
    this.elements.heroSection = document.getElementById('heroSection');
    this.elements.catalogSection = document.getElementById('catalogSection');
    this.elements.adminSection = document.getElementById('adminSection');
    this.elements.profileSection = document.getElementById('profileSection');

    // Stats
    this.elements.statParts = document.getElementById('statParts');
    this.elements.statOrders = document.getElementById('statOrders');

    // Catalog
    this.elements.productsGrid = document.getElementById('productsGrid');
    this.elements.loadingState = document.getElementById('loadingState');
    this.elements.emptyState = document.getElementById('emptyState');
    this.elements.pagination = document.getElementById('pagination');

    // Toast
    this.elements.toastContainer = document.getElementById('toastContainer');
  },

  bindEvents() {
    if (this._bound) return;
    this._bound = true;

    // Закрываем только текущую модалку
    document.addEventListener('click', (e) => {
      const closeEl = e.target.closest('[data-close-modal]');
      if (!closeEl) return;

      const modal = closeEl.closest('.modal');
      if (modal?.id) this.closeModal(modal.id);
      else this.closeAllModals();
    });

    // Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAllModals();
    });

    // data-navigate
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-navigate]');
      if (!nav) return;
      e.preventDefault();
      this.navigate(nav.dataset.navigate);
    });

    // Админка кнопка
    this.elements.adminBtn?.addEventListener('click', () => {
      this.navigate('admin');
      window.Admin?.init?.();
    });

    // Делегация клика по карточкам товара (оптимизация)
    this.elements.productsGrid?.addEventListener('click', (e) => {
      const card = e.target.closest('.product-card');
      if (!card) return;
      const id = card.dataset.productId;
      if (id) window.App?.showProductDetail?.(id);
    });
  },

  // ==========================================
  // Навигация
  // ==========================================
  navigate(section) {
    this.closeAllModals();

    this.elements.heroSection?.classList.add('hidden');
    this.elements.catalogSection?.classList.add('hidden');
    this.elements.adminSection?.classList.add('hidden');
    this.elements.profileSection?.classList.add('hidden');

    switch (section) {
      case 'home':
        this.elements.heroSection?.classList.remove('hidden');
        this.elements.catalogSection?.classList.remove('hidden');
        break;
      case 'catalog':
        this.elements.catalogSection?.classList.remove('hidden');
        this.elements.catalogSection?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'admin':
        this.elements.adminSection?.classList.remove('hidden');
        break;
      case 'profile':
        this.elements.profileSection?.classList.remove('hidden');
        break;
      default:
        this.elements.heroSection?.classList.remove('hidden');
        this.elements.catalogSection?.classList.remove('hidden');
    }
  },

  showSection(sectionId) {
    document.getElementById(sectionId)?.classList.remove('hidden');
  },

  hideSection(sectionId) {
    document.getElementById(sectionId)?.classList.add('hidden');
  },

  // ==========================================
  // Modals
  // ==========================================
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');

    if (document.querySelectorAll('.modal.active').length === 0) {
      document.body.style.overflow = '';
    }
  },

  closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';
  },

  // ==========================================
  // Header helpers
  // ==========================================
  setAdminButtonVisible(isVisible) {
    if (!this.elements.adminBtn) return;
    this.elements.adminBtn.classList.toggle('hidden', !isVisible);
  },

  updateCartCount(count) {
    if (!this.elements.cartCount) return;
    this.elements.cartCount.textContent = String(count);
    this.elements.cartCount.style.display = count > 0 ? 'flex' : 'none';
  },

  updateProfileButton(user) {
    if (!this.elements.profileText) return;
    if (user?.email) {
      this.elements.profileText.textContent = Utils.truncate(user.email.split('@')[0], 10);
    } else {
      this.elements.profileText.textContent = 'Войти';
    }
  },

  // ==========================================
  // Toast
  // ==========================================
  showToast(message, type = 'info', duration = 3500) {
    if (!this.elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

    toast.innerHTML = `
      <span class="toast__icon">${icons[type] || icons.info}</span>
      <span class="toast__message">${Utils.escapeHtml(String(message))}</span>
      <button class="toast__close" type="button" aria-label="Закрыть">&times;</button>
    `;

    toast.querySelector('.toast__close')?.addEventListener('click', () => this.removeToast(toast));
    this.elements.toastContainer.appendChild(toast);

    setTimeout(() => this.removeToast(toast), duration);
  },

  removeToast(toast) {
    if (!toast) return;
    toast.style.animation = 'toastOut 180ms ease forwards';
    setTimeout(() => toast.remove(), 180);
  },

  // ==========================================
  // Filters helpers (ВОТ ЭТОГО У ТЕБЯ НЕ ХВАТАЛО)
  // ==========================================
  populateMakesSelect(select, includeEmpty = true) {
    if (!select) return;

    let html = includeEmpty ? '<option value="">Все марки</option>' : '';
    (Config.carMakes || []).forEach(make => {
      // value не экранируем через innerHTML (в make нет html), но безопаснее:
      const safe = Utils.escapeHtml(String(make));
      html += `<option value="${safe}">${safe}</option>`;
    });

    select.innerHTML = html;
  },

  populatePartsSelect(select) {
    if (!select) return;

    let html = '<option value="">Все запчасти</option>';

    const cats = Config.partsCategories || {};
    Object.entries(cats).forEach(([category, parts]) => {
      const catSafe = Utils.escapeHtml(String(category));
      html += `<optgroup label="${catSafe}">`;

      (parts || []).forEach(part => {
        const partSafe = Utils.escapeHtml(String(part));
        html += `<option value="${partSafe}">${partSafe}</option>`;
      });

      html += `</optgroup>`;
    });

    select.innerHTML = html;
  },

  // ==========================================
  // Catalog rendering
  // ==========================================
  showLoading() {
    if (this.elements.productsGrid) this.elements.productsGrid.innerHTML = '';
    this.elements.loadingState?.classList.remove('hidden');
    this.elements.emptyState?.classList.add('hidden');
  },

  renderProductCard(product) {
    const conditionClass = product.condition === 'used' ? 'product-card__badge--used' : '';
    const conditionText = product.condition === 'new' ? 'Новое' : 'Б/У';

    const stock = product.stock || 0;
    const stockClass = stock <= 2 ? 'product-card__stock--low' : '';
    const stockText = stock <= 2 ? `Осталось: ${stock}` : `В наличии: ${stock}`;

    const imageUrl = product.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';

    return `
      <article class="product-card" data-product-id="${product.id}">
        <div class="product-card__image">
          <img src="${imageUrl}" alt="${Utils.escapeHtml(product.partName)}" loading="lazy">
          <span class="product-card__badge ${conditionClass}">${conditionText}</span>
        </div>
        <div class="product-card__content">
          <h3 class="product-card__title">${Utils.escapeHtml(product.partName)}</h3>
          <p class="product-card__car">${Utils.escapeHtml(Utils.formatCarName(product))}</p>
          <div class="product-card__footer">
            <span class="product-card__price">${Utils.formatPrice(product.price || 0)}</span>
            <span class="product-card__stock ${stockClass}">${stockText}</span>
          </div>
        </div>
      </article>
    `;
  },

  renderProducts(products) {
    if (!this.elements.productsGrid) return;

    this.elements.loadingState?.classList.add('hidden');

    if (!products.length) {
      this.elements.productsGrid.innerHTML = '';
      this.elements.emptyState?.classList.remove('hidden');
      return;
    }

    this.elements.emptyState?.classList.add('hidden');
    this.elements.productsGrid.innerHTML = products.map(p => this.renderProductCard(p)).join('');
  },

  renderPagination(currentPage, totalPages, onPageChange) {
    if (!this.elements.pagination || totalPages <= 1) {
      if (this.elements.pagination) this.elements.pagination.innerHTML = '';
      return;
    }

    let html = '';
    html += `<button class="pagination__btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">←</button>`;

    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

    if (startPage > 1) {
      html += `<button class="pagination__btn" data-page="1">1</button>`;
      if (startPage > 2) html += `<span class="pagination__dots">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="pagination__btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="pagination__dots">...</span>`;
      html += `<button class="pagination__btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button class="pagination__btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">→</button>`;

    this.elements.pagination.innerHTML = html;

    this.elements.pagination.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page, 10);
        if (Number.isFinite(page) && page >= 1 && page <= totalPages && page !== currentPage) {
          onPageChange(page);
        }
      });
    });
  },

  renderProductDetail(product) {
    const container = document.getElementById('productDetail');
    if (!container) return;

    const conditionText = product.condition === 'new' ? 'Новое' : 'Б/У';
    const imageUrl = product.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';

    container.innerHTML = `
      <div class="product-detail__image">
        <img src="${imageUrl}" alt="${Utils.escapeHtml(product.partName)}">
      </div>
      <div class="product-detail__info">
        <h2 class="product-detail__title">${Utils.escapeHtml(product.partName)}</h2>
        <p class="product-detail__car">${Utils.escapeHtml(Utils.formatCarName(product))}</p>
        <div class="product-detail__price">${Utils.formatPrice(product.price || 0)}</div>

        <div class="product-detail__meta">
          <span class="product-detail__tag">${conditionText}</span>
          <span class="product-detail__tag">${Utils.getBodyTypeName(product.bodyType)}</span>
          ${product.restyling ? '<span class="product-detail__tag">Рестайлинг</span>' : ''}
          <span class="product-detail__tag">В наличии: ${product.stock || 0} шт.</span>
        </div>

        ${product.description ? `<p class="product-detail__description">${Utils.escapeHtml(product.description)}</p>` : ''}

        <button class="btn btn--primary btn--lg btn--full" id="addToCartBtn" type="button"
          ${(!product.stock || product.stock === 0) ? 'disabled' : ''}>
          ${(!product.stock || product.stock === 0) ? 'Нет в наличии' : 'Забронировать'}
        </button>
      </div>
    `;

    container.querySelector('#addToCartBtn')?.addEventListener('click', () => {
      window.Reservations?.addToCart?.(product);
    });
  },

  // ==========================================
  // Checkout rendering
  // ==========================================
  renderCheckoutSummary(cart, userName, userEmail) {
    const el = document.getElementById('checkoutSummary');
    if (!el) return;

    const total = cart.reduce((s, i) => s + (i.price || 0), 0);

    el.innerHTML = `
      <div class="checkout-box">
        <div class="checkout-row">
          <span class="muted">Покупатель</span>
          <strong>${Utils.escapeHtml(userName || '—')}</strong>
        </div>
        <div class="checkout-row">
          <span class="muted">Email</span>
          <strong>${Utils.escapeHtml(userEmail || '—')}</strong>
        </div>

        <div class="checkout-items">
          ${cart.map((i) => `
            <div class="checkout-item">
              <div class="checkout-item__name">${Utils.escapeHtml(i.partName)}</div>
              <div class="checkout-item__price">${Utils.formatPrice(i.price || 0)}</div>
            </div>
          `).join('')}
        </div>

        <div class="checkout-total">
          <span>Итого</span>
          <strong>${Utils.formatPrice(total)}</strong>
        </div>

        <p class="checkout-note">
          После подтверждения бронь получит статус <strong>“Ожидает”</strong>.
        </p>
      </div>
    `;
  },

  renderBookingResult({ orderNumber, userName, items, total }) {
    const el = document.getElementById('bookingResultContent');
    if (!el) return;

    el.innerHTML = `
      <div class="booking-result">
        <div class="booking-result__box">
          <div class="booking-result__row">
            <span class="muted">Номер брони</span>
            <strong>#${Utils.escapeHtml(orderNumber || '—')}</strong>
          </div>
          <div class="booking-result__row">
            <span class="muted">Покупатель</span>
            <strong>${Utils.escapeHtml(userName || '—')}</strong>
          </div>

          <div class="booking-result__items">
            ${(items || []).map((it, idx) => `
              <div class="booking-result__item">
                <div>${idx + 1}. ${Utils.escapeHtml(it.partName)}</div>
                <div><strong>${Utils.formatPrice(it.price || 0)}</strong></div>
              </div>
            `).join('')}
          </div>

          <div class="booking-result__total">
            <span>Итого</span>
            <span>${Utils.formatPrice(total || 0)}</span>
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // Confirm modal
  // ==========================================
  async confirm(title, message) {
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmAction');
    const modal = document.getElementById('confirmModal');

    if (!modal || !confirmBtn) return false;

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;

    return new Promise((resolve) => {
      const cleanup = () => {
        confirmBtn.removeEventListener('click', onConfirm);
        modal.querySelectorAll('[data-close-modal]').forEach(el => el.removeEventListener('click', onCancel));
        document.removeEventListener('keydown', onEsc);
      };

      const onConfirm = () => {
        cleanup();
        this.closeModal('confirmModal');
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        this.closeModal('confirmModal');
        resolve(false);
      };

      const onEsc = (e) => {
        if (e.key === 'Escape') onCancel();
      };

      confirmBtn.addEventListener('click', onConfirm);
      modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', onCancel));
      document.addEventListener('keydown', onEsc);

      this.openModal('confirmModal');
    });
  },

  // ==========================================
  // Print receipt 80mm
  // ==========================================
  buildReceiptHtml({ title, orderNumber, userName, items, total, date }) {
    const safeTitle = Utils.escapeHtml(title || 'Чек');
    const safeNum = Utils.escapeHtml(orderNumber || '—');
    const safeName = Utils.escapeHtml(userName || '—');
    const safeDate = Utils.escapeHtml(date || Utils.formatDate(new Date(), true));

    const list = (items || []).map((it, idx) => `
      <div class="row">
        <div class="left">${idx + 1}. ${Utils.escapeHtml(it.partName)}</div>
        <div class="right">${Utils.formatPrice(it.price || 0)}</div>
      </div>
    `).join('');

    return `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${safeTitle}</title>
  <style>
    @page { size: 80mm auto; margin: 6mm; }
    html, body { width: 80mm; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      line-height: 1.35;
      color: #000;
      margin: 0;
    }
    .center { text-align:center; }
    .muted { color:#333; }
    .dash { border-top:1px dashed #000; margin: 8px 0; }
    .row { display:flex; justify-content:space-between; gap:10px; margin: 4px 0; }
    .left { flex: 1 1 auto; }
    .right { flex: 0 0 auto; white-space:nowrap; }
    .total { font-weight: 800; font-size: 14px; }
  </style>
</head>
<body>
  <div class="center">
    <div style="font-weight:800;font-size:16px;">AutoParts</div>
    <div class="muted">${safeTitle}</div>
  </div>

  <div class="dash"></div>

  <div class="row"><div class="left">Дата</div><div class="right">${safeDate}</div></div>
  <div class="row"><div class="left">№</div><div class="right">${safeNum}</div></div>
  <div class="row"><div class="left">Клиент</div><div class="right">${safeName}</div></div>

  <div class="dash"></div>

  ${list}

  <div class="dash"></div>

  <div class="row total"><div class="left">ИТОГО</div><div class="right">${Utils.formatPrice(total || 0)}</div></div>

  <div class="dash"></div>
  <div>Подпись продавца: ____________</div>
</body>
</html>`;
  },

  printReceipt(data) {
    const html = this.buildReceiptHtml(data);
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) {
      this.showToast('Разрешите всплывающие окна для печати', 'warning');
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();

    w.onload = () => {
      w.focus();
      w.print();
      w.onafterprint = () => w.close();
    };
  },

  // ==========================================
  // Stats
  // ==========================================
  updateStats(stats) {
    this.elements.statParts && this.animateNumber(this.elements.statParts, stats.totalParts || 0);
    this.elements.statOrders && this.animateNumber(this.elements.statOrders, stats.completedOrders || 0);
  },

  animateNumber(element, target) {
    const duration = 900;
    const start = parseInt(element.textContent, 10) || 0;
    const diff = target - start;
    const startTime = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      element.textContent = String(Math.round(start + diff * t));
      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }
};

window.UI = UI;