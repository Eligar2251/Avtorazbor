/**
 * Reservations.js - Корзина и бронирование (QTY UPDATE)
 * - Корзина поддерживает qty (несколько штук одного productId)
 * - validateCart ограничивает qty по stock
 * - commitCheckout списывает stock на qty (транзакция)
 * - cancelUserOrder: возвращает stock на qty и удаляет документ orders/{id}
 * - чек пользователю НЕ печатается
 */

const Reservations = {
  cart: [],
  CART_STORAGE_KEY: 'autoparts_cart',

  _eventsBound: false,
  _checkoutInProgress: false,

  init() {
    this.loadCart();
    this.bindEvents();
    this.updateCartUI();
  },

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    document.getElementById('cartBtn')?.addEventListener('click', () => this.openCart());
    document.getElementById('checkoutBtn')?.addEventListener('click', () => this.checkout());
    document.getElementById('confirmCheckoutBtn')?.addEventListener('click', () => this.commitCheckout());
  },

  loadCart() {
    this.cart = Utils.loadFromStorage(this.CART_STORAGE_KEY, []);
    // нормализуем qty
    this.cart = (this.cart || []).map(i => ({ ...i, qty: Math.max(1, parseInt(i.qty, 10) || 1) }));
    this.validateCart();
  },

  saveCart() {
    Utils.saveToStorage(this.CART_STORAGE_KEY, this.cart);
    this.updateCartUI();
  },

  getCartCount() {
    // badge = общее кол-во штук
    return this.cart.reduce((s, i) => s + (parseInt(i.qty, 10) || 0), 0);
  },

  getCartTotal() {
    return this.cart.reduce((sum, item) => {
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      return sum + Utils.getPriceFinal(item) * qty;
    }, 0);
  },

  updateCartUI() {
    UI.updateCartCount(this.getCartCount());
  },

  /**
   * Подтягивает актуальные данные товаров из inventory
   * - удаляет то, чего нет или stock=0
   * - обновляет цены/скидки/картинки/названия
   * - qty ограничивает по stock
   */
  async validateCart() {
    if (!this.cart.length) return;

    try {
      const db = firebase.firestore();
      const validItems = [];

      let qtyReduced = 0;

      for (const item of this.cart) {
        const doc = await db.collection('inventory').doc(item.productId).get();
        if (!doc.exists) continue;

        const data = doc.data();
        const stock = Number(data.stock || 0);
        if (stock <= 0) continue;

        const priceOriginal = Number(data.price || 0);
        const discountPercent = Number(data.discountPercent || 0);
        const priceFinal = Utils.getPriceFinal({ priceOriginal, discountPercent });

        let qty = Math.max(1, parseInt(item.qty, 10) || 1);
        if (qty > stock) {
          qtyReduced += (qty - stock);
          qty = stock; // ограничили
        }
        if (qty <= 0) continue;

        validItems.push({
          ...item,

          // актуальные поля товара
          partName: data.partName ?? item.partName,
          customTitle: data.customTitle ?? item.customTitle ?? '',

          carId: data.carId ?? item.carId ?? null,
          carMake: data.carMake ?? item.carMake,
          carModel: data.carModel ?? item.carModel,
          year: data.year ?? item.year ?? null,
          bodyType: data.bodyType ?? item.bodyType,
          restyling: !!(data.restyling ?? item.restyling),

          condition: data.condition ?? item.condition,

          priceOriginal,
          discountPercent,
          priceFinal,

          stock,
          qty,

          imageUrl: data.imageUrl || item.imageUrl || ''
        });
      }

      if (validItems.length !== this.cart.length) {
        const removed = this.cart.length - validItems.length;
        UI.showToast(
          `${removed} ${Utils.pluralize(removed, ['товар удалён', 'товара удалено', 'товаров удалено'])} из корзины (нет в наличии)`,
          'warning'
        );
      }

      if (qtyReduced > 0) {
        UI.showToast(`Количество уменьшено по наличию: -${qtyReduced} шт.`, 'warning');
      }

      this.cart = validItems;
      this.saveCart();
    } catch (e) {
      console.error('validateCart error:', e);
    }
  },

  addToCart(product, addQty = 1) {
    if (!Auth.isAuthenticated()) {
      UI.openModal('authModal');
      UI.showToast('Войдите, чтобы добавить товар', 'info');
      return;
    }

    if (!product?.id) {
      UI.showToast('Ошибка: товар не найден', 'error');
      return;
    }

    const available = Number(product.stock || 0);
    if (available <= 0) {
      UI.showToast('Товар закончился', 'error');
      return;
    }

    const qtyToAdd = Math.max(1, parseInt(addQty, 10) || 1);

    const existing = this.cart.find(i => i.productId === product.id);
    if (existing) {
      const currentQty = Math.max(1, parseInt(existing.qty, 10) || 1);
      const newQty = currentQty + qtyToAdd;

      if (newQty > (existing.stock || available)) {
        UI.showToast('Недостаточно товара на складе', 'warning');
        return;
      }

      existing.qty = newQty;
      this.saveCart();
      UI.showToast('Количество увеличено', 'success');
      UI.closeModal('productModal');
      return;
    }

    const priceOriginal = Utils.getPriceOriginal(product);
    const discountPercent = Utils.getDiscountPercent(product);
    const priceFinal = Utils.getPriceFinal({ priceOriginal, discountPercent });

    const qty = Math.min(qtyToAdd, available);

    this.cart.push({
      productId: product.id,
      carId: product.carId || null,

      partName: product.partName,
      customTitle: product.customTitle || '',

      carMake: product.carMake,
      carModel: product.carModel,
      year: product.year ?? null,
      bodyType: product.bodyType,
      restyling: !!product.restyling,

      condition: product.condition,

      priceOriginal,
      discountPercent,
      priceFinal,

      stock: available,
      qty,

      imageUrl: product.imageUrl || '',
      addedAt: new Date().toISOString()
    });

    this.saveCart();
    UI.showToast('Товар добавлен в корзину', 'success');
    UI.closeModal('productModal');
  },

  changeQty(productId, newQty) {
    const item = this.cart.find(i => i.productId === productId);
    if (!item) return;

    const maxStock = Number(item.stock || 0);
    let qty = parseInt(newQty, 10);
    if (!Number.isFinite(qty)) qty = 1;

    if (qty <= 0) {
      this.removeFromCart(productId);
      return;
    }

    if (maxStock > 0 && qty > maxStock) {
      UI.showToast(`Максимум доступно: ${maxStock} шт.`, 'warning');
      qty = maxStock;
    }

    item.qty = qty;
    this.saveCart();
    this.renderCartItems();
  },

  removeFromCart(productId) {
    this.cart = this.cart.filter(i => i.productId !== productId);
    this.saveCart();
    this.renderCartItems();
    UI.showToast('Товар удален из корзины', 'info');
  },

  clearCart() {
    this.cart = [];
    this.saveCart();
    this.renderCartItems();
  },

  openCart() {
    this.renderCartItems();
    UI.openModal('cartModal');
  },

  renderCartItems() {
    const container = document.getElementById('cartItems');
    const emptyEl = document.getElementById('cartEmpty');
    const footerEl = document.getElementById('cartFooter');
    const totalEl = document.getElementById('cartTotal');
    if (!container) return;

    if (!this.cart.length) {
      container.innerHTML = '';
      emptyEl?.classList.remove('hidden');
      footerEl?.classList.add('hidden');
      totalEl && (totalEl.textContent = Utils.formatPrice(0));
      return;
    }

    emptyEl?.classList.add('hidden');
    footerEl?.classList.remove('hidden');

    container.innerHTML = this.cart.map(item => {
      const imageUrl = item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';

      const title = Utils.getProductTitle(item);

      const original = Utils.getPriceOriginal(item);
      const final = Utils.getPriceFinal(item);
      const disc = Utils.getDiscountPercent(item);

      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      const stock = Number(item.stock || 0);

      const priceHtml = (disc > 0 && final < original)
        ? `<span class="price-old">${Utils.formatPrice(original)}</span> <span class="price-new">${Utils.formatPrice(final)}</span>`
        : `<span class="price-new">${Utils.formatPrice(final)}</span>`;

      const lineTotal = final * qty;

      return `
        <div class="cart-item" data-product-id="${item.productId}">
          <img src="${imageUrl}" alt="" class="cart-item__image">

          <div class="cart-item__info">
            <div class="cart-item__name">${Utils.escapeHtml(title)}</div>
            <div class="cart-item__car muted">${Utils.escapeHtml(item.carMake)} ${Utils.escapeHtml(item.carModel)}</div>

            <div class="cart-item__price">
              ${priceHtml}
              <span class="muted" style="margin-left:8px;">× ${qty} = <strong>${Utils.formatPrice(lineTotal)}</strong></span>
            </div>

            <div class="cart-item__qty" style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <button class="btn btn--sm btn--secondary" type="button"
                onclick="Reservations.changeQty('${item.productId}', ${qty - 1})"
                ${qty <= 1 ? 'disabled' : ''}>−</button>

              <input class="form-input" type="number" min="1" ${stock > 0 ? `max="${stock}"` : ''} value="${qty}"
                style="width:90px;"
                onchange="Reservations.changeQty('${item.productId}', this.value)">

              <button class="btn btn--sm btn--secondary" type="button"
                onclick="Reservations.changeQty('${item.productId}', ${qty + 1})"
                ${stock > 0 && qty >= stock ? 'disabled' : ''}>+</button>

              ${stock > 0 ? `<span class="muted" style="font-size:12px;">Доступно: ${stock}</span>` : ''}
            </div>
          </div>

          <button class="cart-item__remove" type="button" onclick="Reservations.removeFromCart('${item.productId}')">✕</button>
        </div>
      `;
    }).join('');

    totalEl && (totalEl.textContent = Utils.formatPrice(this.getCartTotal()));
  },

  checkout() {
    if (!Auth.isAuthenticated()) {
      UI.closeModal('cartModal');
      UI.openModal('authModal');
      return;
    }

    if (!this.cart.length) {
      UI.showToast('Корзина пуста', 'warning');
      return;
    }

    const user = Auth.getUser();
    const userData = Auth.getUserData();
    const name = userData?.name || (user?.email ? user.email.split('@')[0] : '—');

    UI.renderCheckoutSummary(this.cart, name, user?.email);

    UI.closeModal('cartModal');
    UI.openModal('checkoutModal');
  },

  /**
   * Оформление брони:
   * - телефон обязателен
   * - списываем stock на qty (транзакция)
   */
  async commitCheckout() {
    if (this._checkoutInProgress) return;
    this._checkoutInProgress = true;

    const btn = document.getElementById('confirmCheckoutBtn');
    const oldText = btn?.textContent || 'Подтвердить бронь';

    try {
      if (!Auth.isAuthenticated()) {
        UI.openModal('authModal');
        return;
      }

      if (!this.cart.length) {
        UI.showToast('Корзина пуста', 'warning');
        UI.closeModal('checkoutModal');
        return;
      }

      const phoneRaw = document.getElementById('checkoutPhone')?.value || '';
      const userPhone = Utils.normalizePhone(phoneRaw);
      if (!userPhone) {
        UI.showToast('Введите корректный телефон (+7XXXXXXXXXX)', 'error');
        document.getElementById('checkoutPhone')?.focus();
        return;
      }

      btn && (btn.disabled = true);
      btn && (btn.textContent = 'Оформляем...');

      const user = Auth.getUser();
      const userData = Auth.getUserData();
      const userName = userData?.name || (user?.email ? user.email.split('@')[0] : '—');

      const db = firebase.firestore();
      const orderRef = db.collection('orders').doc();
      const orderNumber = Utils.generateOrderNumber();

      // уникальные позиции корзины: [{productId, qty}]
      const cartSnapshot = this.cart.map(i => ({
        productId: i.productId,
        qty: Math.max(1, parseInt(i.qty, 10) || 1)
      }));

      let itemsSnapshot = [];
      let total = 0;

      await db.runTransaction(async (tx) => {
        // reads
        const reads = [];
        for (const item of cartSnapshot) {
          const ref = db.collection('inventory').doc(item.productId);
          const snap = await tx.get(ref);
          reads.push({ item, ref, snap });
        }

        // validate
        for (const { item, snap } of reads) {
          if (!snap.exists) throw new Error('Один из товаров удалён');
          const stock = Number(snap.data().stock || 0);
          if (stock < item.qty) throw new Error('Недостаточно товара на складе для одной из позиций');
        }

        // snapshot items from DB + qty
        itemsSnapshot = reads.map(({ item, snap }) => {
          const data = snap.data() || {};
          const priceOriginal = Number(data.price || 0);
          const discountPercent = Number(data.discountPercent || 0);
          const priceFinal = Utils.getPriceFinal({ priceOriginal, discountPercent });

          const title = Utils.getProductTitle({
            partName: data.partName,
            customTitle: data.customTitle,
            carMake: data.carMake,
            carModel: data.carModel
          });

          return {
            productId: item.productId,
            qty: item.qty,

            title,
            partName: data.partName || '',
            customTitle: data.customTitle || '',

            carId: data.carId || null,
            carMake: data.carMake || '',
            carModel: data.carModel || '',
            year: data.year ?? null,
            bodyType: data.bodyType || '',
            restyling: !!data.restyling,
            condition: data.condition || 'used',

            priceOriginal,
            discountPercent,
            priceFinal
          };
        });

        total = itemsSnapshot.reduce((s, x) => s + (x.priceFinal || 0) * (x.qty || 1), 0);

        // write: stock -= qty
        for (const { item, ref, snap } of reads) {
          const currentStock = Number(snap.data().stock || 0);
          tx.update(ref, { stock: currentStock - item.qty });
        }

        // create order
        tx.set(orderRef, {
          orderNumber,
          userId: user.uid,
          userEmail: user.email,
          userName,
          userPhone,

          items: itemsSnapshot,
          total,

          status: 'active',
          date: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      this.clearCart();
      UI.closeModal('checkoutModal');

      UI.renderBookingResult({ orderNumber, userName, items: itemsSnapshot, total });
      UI.openModal('bookingResultModal');

      // чек пользователю не печатаем
      UI.showToast(`Бронь оформлена: #${orderNumber}`, 'success');

      if (!document.getElementById('profileSection')?.classList.contains('hidden')) {
        this.loadUserOrders();
      }

    } catch (e) {
      console.error('commitCheckout error:', e);
      UI.showToast(e?.message || 'Ошибка при оформлении брони', 'error');
      await this.validateCart();
      this.renderCartItems();
    } finally {
      btn && (btn.disabled = false);
      btn && (btn.textContent = oldText);
      this._checkoutInProgress = false;
    }
  },

  // -------------------------------
  // Orders (profile)
  // -------------------------------
  async loadUserOrders() {
    const container = document.getElementById('userOrders');
    if (!container) return;

    const user = Auth.getUser();
    if (!user) {
      container.innerHTML = '<p>Войдите, чтобы увидеть заказы</p>';
      return;
    }

    container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const snapshot = await firebase.firestore()
        .collection('orders')
        .where('userId', '==', user.uid)
        .limit(200)
        .get();

      let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // показываем только актуальные (остальные удаляются при отмене/продаже)
      orders = orders.filter(o => ['active', 'confirmed', 'ready'].includes(o.status));

      orders.sort((a, b) => {
        const aMs = (a.date?.toMillis?.() || a.createdAt?.toMillis?.() || 0);
        const bMs = (b.date?.toMillis?.() || b.createdAt?.toMillis?.() || 0);
        return bMs - aMs;
      });

      this.renderUserOrders(orders);

    } catch (error) {
      console.error('loadUserOrders error:', error);
      container.innerHTML = '<p>Ошибка загрузки заказов</p>';
      UI.showToast('Ошибка загрузки заказов', 'error');
    }
  },

  renderUserOrders(orders) {
    const container = document.getElementById('userOrders');
    if (!container) return;

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 2rem;">
          <p>У вас пока нет активных бронирований</p>
          <button class="btn btn--primary" type="button" data-navigate="catalog" style="margin-top: 1rem;">
            Перейти в каталог
          </button>
        </div>
      `;
      container.querySelector('[data-navigate]')?.addEventListener('click', (e) => {
        e.preventDefault();
        UI.navigate('catalog');
      });
      return;
    }

    container.innerHTML = orders.map(order => {
      const statusInfo = Config.orderStatuses[order.status] || { label: order.status, class: 'active' };
      const total = (order.items || []).reduce((sum, item) => sum + (item.priceFinal ?? item.price ?? 0) * (item.qty || 1), 0);

      return `
        <div class="order-card">
          <div class="order-card__header">
            <div>
              <span class="order-card__id">Заказ #${Utils.escapeHtml(order.orderNumber || order.id.slice(-8))}</span>
              <span class="order-card__date">${Utils.formatDate(order.date || order.createdAt, true)}</span>
            </div>
            <span class="order-card__status order-card__status--${statusInfo.class}">${statusInfo.label}</span>
          </div>

          <div class="order-card__items">
            ${(order.items || []).map(item => `
              <div class="order-item">
                <span>${Utils.escapeHtml(item.title || item.customTitle || item.partName)} <span class="muted">×${item.qty || 1}</span></span>
                <span>${Utils.formatPrice(item.priceFinal ?? item.price ?? 0)}</span>
              </div>
            `).join('')}
          </div>

          <div class="order-card__total">
            <span>Итого:</span>
            <span>${Utils.formatPrice(total)}</span>
          </div>

          ${order.status === 'active' ? `
            <div class="order-card__actions">
              <button class="btn btn--sm btn--danger" type="button" onclick="Reservations.cancelUserOrder('${order.id}')">
                Отменить бронирование
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  /**
   * Отмена пользователя:
   * - вернуть stock (на qty)
   * - удалить orders/{id}
   */
  async cancelUserOrder(orderId) {
    const confirmed = await UI.confirm('Отмена бронирования', 'Вы уверены, что хотите отменить бронирование?');
    if (!confirmed) return;

    try {
      const db = firebase.firestore();
      const orderDoc = await db.collection('orders').doc(orderId).get();

      if (!orderDoc.exists) {
        UI.showToast('Заказ не найден', 'error');
        return;
      }

      const order = orderDoc.data();

      if (order.userId !== Auth.getUser()?.uid) {
        UI.showToast('Нет доступа к этому заказу', 'error');
        return;
      }

      if (order.status !== 'active') {
        UI.showToast('Этот заказ нельзя отменить', 'error');
        return;
      }

      const batch = db.batch();

      for (const item of (order.items || [])) {
        if (item.productId) {
          const qty = Math.max(1, parseInt(item.qty, 10) || 1);
          batch.update(db.collection('inventory').doc(item.productId), {
            stock: firebase.firestore.FieldValue.increment(qty)
          });
        }
      }

      batch.delete(db.collection('orders').doc(orderId));
      await batch.commit();

      UI.showToast('Бронирование отменено', 'success');
      this.loadUserOrders();

    } catch (error) {
      console.error('cancelUserOrder error:', error);
      UI.showToast('Ошибка при отмене заказа', 'error');
    }
  }
};

window.Reservations = Reservations;