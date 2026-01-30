/**
 * UI.js - Управление интерфейсом (FIXED)
 * Важно:
 * - Добавлен UI.renderBookingResult() (чинит бронирование)
 * - Есть UI.confirm() (нужен Admin/Reservations)
 * - Есть рендер каталога/деталки/checkout
 * - printReceipt: admin-only (по умолчанию)
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

    // close modal by [data-close-modal]
    document.addEventListener('click', (e) => {
      const closeEl = e.target.closest('[data-close-modal]');
      if (!closeEl) return;

      const modal = closeEl.closest('.modal');
      if (modal?.id) this.closeModal(modal.id);
      else this.closeAllModals();
    });

    // escape closes modals
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

    // admin btn
    this.elements.adminBtn?.addEventListener('click', () => {
      this.navigate('admin');
      window.Admin?.init?.();
    });

    // click on product cards (delegation)
    this.elements.productsGrid?.addEventListener('click', (e) => {
      const card = e.target.closest('.product-card');
      if (!card) return;
      const id = card.dataset.productId;
      if (id) window.App?.showProductDetail?.(id);
    });
  },

  // ==========================================
  // Navigation
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
    this.elements.cartCount.style.display = count > 0 ? 'grid' : 'none';
  },

  updateProfileButton(user) {
    if (!this.elements.profileText) return;
    if (user?.email) this.elements.profileText.textContent = Utils.truncate(user.email.split('@')[0], 10);
    else this.elements.profileText.textContent = 'Войти';
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
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
    setTimeout(() => toast.remove(), 180);
  },

  // ==========================================
  // Select helpers
  // ==========================================
  populateMakesSelect(select, includeEmpty = true) {
    if (!select) return;

    let html = includeEmpty ? '<option value="">Все марки</option>' : '';
    (Config.carMakes || []).forEach(make => {
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

    const title = Utils.getProductTitle(product);

    const priceOriginal = Utils.getPriceOriginal(product);
    const disc = Utils.getDiscountPercent(product);
    const priceFinal = Utils.getPriceFinal({ priceOriginal, discountPercent: disc });

    const priceHtml = (disc > 0 && priceFinal < priceOriginal)
      ? `<span class="price-old">${Utils.formatPrice(priceOriginal)}</span>
         <span class="price-new">${Utils.formatPrice(priceFinal)}</span>`
      : `<span class="price-new">${Utils.formatPrice(priceOriginal)}</span>`;

    return `
      <article class="product-card" data-product-id="${product.id}">
        <div class="product-card__image">
          <img src="${imageUrl}" alt="${Utils.escapeHtml(title)}" loading="lazy">
          <span class="product-card__badge ${conditionClass}">${conditionText}</span>
        </div>
        <div class="product-card__content">
          <h3 class="product-card__title">${Utils.escapeHtml(title)}</h3>
          <p class="product-card__car">${Utils.escapeHtml(Utils.formatCarName(product))}</p>
          <div class="product-card__footer">
            <span class="product-card__price">${priceHtml}</span>
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
    const imageUrl = product.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c0-1.1-.9-2-2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';

    const title = Utils.getProductTitle(product);

    const priceOriginal = Utils.getPriceOriginal(product);
    const disc = Utils.getDiscountPercent(product);
    const priceFinal = Utils.getPriceFinal({ priceOriginal, discountPercent: disc });

    const priceHtml = (disc > 0 && priceFinal < priceOriginal)
      ? `<div class="product-detail__price">
          <span class="price-old">${Utils.formatPrice(priceOriginal)}</span>
          <span class="price-new">${Utils.formatPrice(priceFinal)}</span>
        </div>`
      : `<div class="product-detail__price"><span class="price-new">${Utils.formatPrice(priceOriginal)}</span></div>`;

    container.innerHTML = `
      <div class="product-detail__image">
        <img src="${imageUrl}" alt="${Utils.escapeHtml(title)}">
      </div>
      <div class="product-detail__info">
        <h2 class="product-detail__title">${Utils.escapeHtml(title)}</h2>
        <p class="product-detail__car">${Utils.escapeHtml(Utils.formatCarName(product))}</p>

        ${priceHtml}

        <div class="product-detail__meta">
          <span class="product-detail__tag">${conditionText}</span>
          <span class="product-detail__tag">${Utils.getBodyTypeName(product.bodyType)}</span>
          ${product.restyling ? '<span class="product-detail__tag">Рестайлинг</span>' : ''}
          <span class="product-detail__tag">В наличии: ${product.stock || 0} шт.</span>
        </div>

        ${product.description ? `<p class="product-detail__description">${Utils.escapeHtml(product.description)}</p>` : ''}

        <button class="btn btn--primary btn--lg btn--full" id="addToCartBtn" type="button"
          ${(!product.stock || product.stock === 0) ? 'disabled' : ''}>
          ${(!product.stock || product.stock === 0) ? 'Нет в наличии' : 'В корзину'}
        </button>
      </div>
    `;

    container.querySelector('#addToCartBtn')?.addEventListener('click', () => {
      window.Reservations?.addToCart?.(product);
    });
  },

  // ==========================================
  // Checkout summary
  // ==========================================
  renderCheckoutSummary(cart, userName, userEmail) {
    const el = document.getElementById('checkoutSummary');
    if (!el) return;

    const total = (cart || []).reduce((s, i) => {
      const qty = Math.max(1, parseInt(i.qty, 10) || 1);
      return s + Utils.getPriceFinal(i) * qty;
    }, 0);

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

      <div class="checkout-row" style="align-items:flex-start;">
        <span class="muted">Телефон *</span>
        <div style="flex:1;">
          <input
            id="checkoutPhone"
            class="form-input"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="+7 (999) 000-00-00"
            required
          >
          <div class="muted" style="font-size:12px;margin-top:6px;">
            Нужен для связи по брони.
          </div>
        </div>
      </div>

      <div class="checkout-items">
        ${(cart || []).map((i) => {
      const title = Utils.getProductTitle(i);

      const qty = Math.max(1, parseInt(i.qty, 10) || 1);

      const original = Utils.getPriceOriginal(i);
      const final = Utils.getPriceFinal(i);
      const disc = Utils.getDiscountPercent(i);

      const priceHtml = (disc > 0 && final < original)
        ? `<span class="price-old">${Utils.formatPrice(original)}</span> <span class="price-new">${Utils.formatPrice(final)}</span>`
        : `<span class="price-new">${Utils.formatPrice(final)}</span>`;

      const lineTotal = final * qty;

      return `
            <div class="checkout-item" style="display:flex;justify-content:space-between;gap:12px;">
              <div>
                <div class="checkout-item__name">${Utils.escapeHtml(title)}</div>
                <div class="muted" style="font-size:12px;margin-top:4px;">
                  ${priceHtml}
                  <span class="muted"> × ${qty} = <strong>${Utils.formatPrice(lineTotal)}</strong></span>
                </div>
              </div>
              <div style="white-space:nowrap;font-weight:800;">
                ${Utils.formatPrice(lineTotal)}
              </div>
            </div>
          `;
    }).join('')}
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

    const phoneInput = document.getElementById('checkoutPhone');
    if (phoneInput) {
      phoneInput.addEventListener('input', () => Utils.maskPhoneInput(phoneInput));
      phoneInput.addEventListener('blur', () => Utils.maskPhoneInput(phoneInput));
    }
  },

  // ==========================================
  // ✅ Booking result (FIXED)
  // ==========================================
  renderBookingResult({ orderNumber, userName, items, total }) {
    const el = document.getElementById('bookingResultContent');
    if (!el) return;

    const safeItems = (items || []).map(it => ({
      ...it,
      qty: Math.max(1, parseInt(it.qty, 10) || 1)
    }));

    const computedTotal = safeItems.reduce((s, it) => {
      const price = Number(it.priceFinal ?? it.price ?? 0);
      return s + price * (it.qty || 1);
    }, 0);

    const finalTotal = Number.isFinite(Number(total)) ? Number(total) : computedTotal;

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
          ${safeItems.map((it, idx) => {
      const price = Number(it.priceFinal ?? it.price ?? 0);
      const qty = it.qty || 1;
      const line = price * qty;

      const title = it.title || it.customTitle || it.partName || 'Товар';

      return `
              <div class="booking-result__item" style="display:flex;justify-content:space-between;gap:12px;">
                <div>
                  <div>${idx + 1}. ${Utils.escapeHtml(title)}</div>
                  <div class="muted" style="font-size:12px;margin-top:4px;">
                    ${Utils.formatPrice(price)} × ${qty} = <strong>${Utils.formatPrice(line)}</strong>
                  </div>
                </div>
                <div style="white-space:nowrap;font-weight:800;">
                  ${Utils.formatPrice(line)}
                </div>
              </div>
            `;
    }).join('')}
        </div>

        <div class="booking-result__total">
          <span>Итого</span>
          <span>${Utils.formatPrice(finalTotal)}</span>
        </div>
      </div>
    </div>
  `;
  },

  // ==========================================
  // Confirm modal (used by Admin/Reservations)
  // ==========================================
  async confirm(title, message) {
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmAction');
    const modal = document.getElementById('confirmModal');

    // fallback if confirm modal not present
    if (!modal || !confirmBtn) {
      return window.confirm(`${title}\n\n${message}`);
    }

    if (titleEl) titleEl.textContent = title || '';
    if (messageEl) messageEl.textContent = message || '';

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
  // Receipt (admin-only)
  // ==========================================
  buildReceiptHtml(data = {}, options = {}) {
    const receiptCfg = (window.Config?.receipt || {});

    const companyName = String(data.companyName || receiptCfg.companyName || 'AutoParts').trim();
    const logoUrl = String(data.logoUrl || receiptCfg.logoUrl || '').trim();

    const title = String(data.title || 'Товарный чек').trim();

    const orderNumber = String(data.orderNumber || '—').trim();
    const userName = String(data.userName || '—').trim();
    const userPhone = String(data.userPhone || '').trim();

    const dateStr = String(
      data.date || Utils.formatDate(new Date(), true)
    ).trim();

    const footerNote = String(data.footerNote || '').trim();

    // paper:
    // - 'A4' (default): печать на лист A4, чек центрируется, ширина чека ~80мм
    // - '80mm': под термопринтер, @page 80mm auto
    const paper = (options.paper || 'A4').toLowerCase();
    const is80 = paper === '80mm' || paper === '80' || paper === 'receipt80';

    // Нормализация позиций
    const normalizedItems = (data.items || []).map((it) => {
      const name = String(it.partName || it.title || it.name || 'Товар').trim();

      let qty = parseInt(it.qty, 10);
      if (!Number.isFinite(qty) || qty <= 0) qty = 1;

      // unitPrice: предпочитаем unitPrice, затем priceFinal, затем price
      let unitPrice = Number(it.unitPrice ?? it.priceFinal ?? it.price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) unitPrice = 0;

      // Если раньше передавали price как "сумма строки" (unit*qty) и qty не передавали,
      // то qty станет 1 и это ок. Но если qty передали, а price передали как lineTotal,
      // то можно ошибиться. Поэтому даём возможность передавать lineTotal явно.
      let lineTotal = Number(it.lineTotal);
      if (Number.isFinite(lineTotal) && lineTotal >= 0) {
        // ok
      } else {
        lineTotal = unitPrice * qty;
      }

      return { name, qty, unitPrice, lineTotal };
    });

    const computedTotal = normalizedItems.reduce((s, x) => s + (Number(x.lineTotal) || 0), 0);
    const total = Number.isFinite(Number(data.total)) ? Number(data.total) : computedTotal;

    const safe = (v) => Utils.escapeHtml(String(v ?? ''));

    const itemsRows = normalizedItems.map((it, idx) => `
    <tr>
      <td class="c-num">${idx + 1}</td>
      <td class="c-name">${safe(it.name)}</td>
      <td class="c-qty">${it.qty}</td>
      <td class="c-unit">${Utils.formatPrice(it.unitPrice)}</td>
      <td class="c-sum">${Utils.formatPrice(it.lineTotal)}</td>
    </tr>
  `).join('');

    // CSS: A4 с центром и ограничением ширины; либо термочек 80mm.
    const pageCss = is80
      ? `@page { size: 80mm auto; margin: 6mm; }`
      : `@page { size: A4; margin: 12mm; }`;

    const wrapperCss = is80
      ? `width: 80mm; margin: 0;`
      : `width: 80mm; margin: 0 auto;`; // центрируем “чек” на A4

    const logoHtml = logoUrl
      ? `<div class="logo"><img src="${safe(logoUrl)}" alt="${safe(companyName)}"></div>`
      : '';

    return `<!doctype html>
      <html lang="ru">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>${safe(title)} — ${safe(orderNumber)}</title>
        <style>
          ${pageCss}

          html, body {
            padding: 0;
            margin: 0;
            background: #fff;
            color: #111;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* На экране показываем как лист с центром */
          .sheet {
            min-height: 100vh;
            padding: 16px 0;
            box-sizing: border-box;
            background: #f6f7fb;
          }

          /* В печати фон не нужен */
          @media print {
            .sheet { background: #fff; padding: 0; }
            .no-print { display: none !important; }
          }

          .receipt {
            ${wrapperCss}
            background: #fff;
            box-sizing: border-box;
            padding: 10mm 8mm;
            border: 1px solid rgba(0,0,0,0.08);
            border-radius: 10px;
          }

          @media print {
            .receipt {
              border: none;
              border-radius: 0;
              padding: 0;
            }
          }

          .head {
            text-align: center;
            margin-bottom: 10px;
          }

          .logo img {
            max-width: 46mm;
            max-height: 22mm;
            object-fit: contain;
            display: inline-block;
            margin: 0 auto 6px;
          }

          .company {
            font: 800 16px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
            letter-spacing: 0.2px;
          }

          .title {
            font: 700 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
            margin-top: 4px;
          }

          .muted {
            color: #555;
            font: 500 11px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          }

          .hr {
            border-top: 1px dashed rgba(0,0,0,0.35);
            margin: 10px 0;
          }

          .meta {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 6px 10px;
            align-items: baseline;
            font: 500 11px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          }

          .meta .k { color: #555; }
          .meta .v { font-weight: 700; text-align: right; white-space: nowrap; }

          table {
            width: 100%;
            border-collapse: collapse;
            font: 500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          }

          thead th {
            text-align: left;
            font-weight: 800;
            padding: 6px 0;
            border-bottom: 1px solid rgba(0,0,0,0.18);
          }

          tbody td {
            padding: 6px 0;
            vertical-align: top;
            border-bottom: 1px dashed rgba(0,0,0,0.12);
          }

          .c-num { width: 6mm; }
          .c-qty { width: 10mm; text-align: right; white-space: nowrap; }
          .c-unit { width: 20mm; text-align: right; white-space: nowrap; }
          .c-sum { width: 22mm; text-align: right; white-space: nowrap; font-weight: 800; }
          .c-name { padding-right: 6px; }

          .total {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 10px;
            align-items: baseline;
            margin-top: 10px;
            font: 900 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          }

          .sign {
            margin-top: 14px;
            font: 500 11px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
            color: #222;
            display: grid;
            gap: 8px;
          }

          .sign .line {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 8px;
            align-items: center;
          }

          .sign .blank {
            border-bottom: 1px solid rgba(0,0,0,0.35);
            height: 0;
          }

          .footnote {
            margin-top: 10px;
            font: 500 10px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
            color: #555;
            text-align: center;
          }

          .printbar {
            display:flex;
            justify-content:center;
            gap:10px;
            margin-top: 14px;
          }
          .btn {
            border: 1px solid rgba(0,0,0,0.18);
            background: #fff;
            padding: 10px 14px;
            border-radius: 10px;
            cursor: pointer;
            font: 700 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          }
        </style>
      </head>

      <body>
        <div class="sheet">
          <div class="receipt">
            <div class="head">
              ${logoHtml}
              <div class="company">${safe(companyName)}</div>
              <div class="title">${safe(title)}</div>
              <div class="muted">${safe(dateStr)}</div>
            </div>

            <div class="hr"></div>

            <div class="meta">
              <div class="k">Номер</div><div class="v">#${safe(orderNumber)}</div>
              <div class="k">Клиент</div><div class="v">${safe(userName)}</div>
              ${userPhone ? `<div class="k">Телефон</div><div class="v">${safe(userPhone)}</div>` : ``}
            </div>

            <div class="hr"></div>

            <table>
              <thead>
                <tr>
                  <th class="c-num">№</th>
                  <th>Наименование</th>
                  <th class="c-qty">Кол</th>
                  <th class="c-unit">Цена</th>
                  <th class="c-sum">Сумма</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows || `<tr><td colspan="5" class="muted">Нет позиций</td></tr>`}
              </tbody>
            </table>

            <div class="total">
              <div>ИТОГО</div>
              <div>${Utils.formatPrice(total)}</div>
            </div>

            <div class="sign">
              <div class="line"><div>Подпись продавца</div><div class="blank"></div></div>
            </div>

            ${footerNote ? `<div class="footnote">${safe(footerNote)}</div>` : ``}

            <div class="printbar no-print">
              <button class="btn" type="button" onclick="window.print()">Печать</button>
              <button class="btn" type="button" onclick="window.close()">Закрыть</button>
            </div>
          </div>
        </div>
      </body>
      </html>`;
  },

  printReceipt(data, options = {}) {
    const adminOnly = (options.adminOnly ?? true);

    if (adminOnly) {
      const isAdmin = !!window.Auth?.isAdmin?.();
      if (!isAdmin) {
        this.showToast('Печать чека доступна только администратору', 'info');
        return;
      }
    }

    // По умолчанию печатаем на A4 (чек 80мм по центру)
    const paper = (options.paper || 'A4');

    const html = this.buildReceiptHtml(data, { paper });

    // Окно делаем нормального размера (а не 520x760)
    const w = window.open('', '_blank', 'width=980,height=920,menubar=0,toolbar=0,location=0,status=0,scrollbars=1');
    if (!w) {
      this.showToast('Разрешите всплывающие окна для печати', 'warning');
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();

    const doPrint = () => {
      try {
        w.focus();
        w.print();
        w.onafterprint = () => w.close();
      } catch (e) {
        // если что-то пошло не так — оставим окно открытым
        console.error('printReceipt print error:', e);
      }
    };

    // Даем чуть времени на рендер (особенно если есть logoUrl)
    w.onload = () => setTimeout(doPrint, 250);
  },

  // ==========================================
  // Stats
  // ==========================================
  updateStats(stats) {
    if (this.elements.statParts) this.animateNumber(this.elements.statParts, stats.totalParts || 0);

    if (this.elements.statOrders) {
      const cars = stats.totalCars ?? 0;
      this.animateNumber(this.elements.statOrders, cars);

      const card = this.elements.statOrders.closest('.stat-card');
      const label = card?.querySelector('.stat-card__label');
      if (label && label.textContent !== 'Авто в разборе') label.textContent = 'Авто в разборе';
    }
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