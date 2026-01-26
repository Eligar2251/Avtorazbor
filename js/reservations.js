/**
 * Reservations.js - Корзина и бронирование
 * Исправления:
 * - loadUserOrders() больше не использует orderBy (не требует индекса)
 * - сортировка заказов делается на клиенте
 * - защита от двойных обработчиков и повторного checkout
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
    this.validateCart();
  },

  saveCart() {
    Utils.saveToStorage(this.CART_STORAGE_KEY, this.cart);
    this.updateCartUI();
  },

  async validateCart() {
    if (!this.cart.length) return;

    try {
      const db = firebase.firestore();
      const validItems = [];

      for (const item of this.cart) {
        const doc = await db.collection('inventory').doc(item.productId).get();
        if (!doc.exists) continue;

        const data = doc.data();
        if ((data.stock || 0) <= 0) continue;

        validItems.push({
          ...item,
          price: data.price,
          stock: data.stock,
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

      this.cart = validItems;
      this.saveCart();
    } catch (e) {
      console.error('validateCart error:', e);
    }
  },

  addToCart(product) {
    if (!Auth.isAuthenticated()) {
      UI.openModal('authModal');
      UI.showToast('Войдите, чтобы добавить товар', 'info');
      return;
    }

    if (!product?.id) {
      UI.showToast('Ошибка: товар не найден', 'error');
      return;
    }

    if ((product.stock || 0) <= 0) {
      UI.showToast('Товар закончился', 'error');
      return;
    }

    if (this.cart.some(i => i.productId === product.id)) {
      UI.showToast('Товар уже в корзине', 'warning');
      return;
    }

    this.cart.push({
      productId: product.id,
      partName: product.partName,
      carMake: product.carMake,
      carModel: product.carModel,
      year: product.year,
      bodyType: product.bodyType,
      restyling: !!product.restyling,
      condition: product.condition,
      price: product.price,
      imageUrl: product.imageUrl || '',
      addedAt: new Date().toISOString()
    });

    this.saveCart();
    UI.showToast('Товар добавлен в корзину', 'success');
    UI.closeModal('productModal');
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

  getCartCount() {
    return this.cart.length;
  },

  getCartTotal() {
    return this.cart.reduce((sum, item) => sum + (item.price || 0), 0);
  },

  updateCartUI() {
    UI.updateCartCount(this.getCartCount());
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

      return `
        <div class="cart-item" data-product-id="${item.productId}">
          <img src="${imageUrl}" alt="" class="cart-item__image">
          <div class="cart-item__info">
            <div class="cart-item__name">${Utils.escapeHtml(item.partName)}</div>
            <div class="cart-item__car muted">${Utils.escapeHtml(item.carMake)} ${Utils.escapeHtml(item.carModel)}</div>
            <div class="cart-item__price">${Utils.formatPrice(item.price || 0)}</div>
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

    btn && (btn.disabled = true);
    btn && (btn.textContent = 'Оформляем...');

    const user = Auth.getUser();
    const userData = Auth.getUserData();
    const userName = userData?.name || (user?.email ? user.email.split('@')[0] : '—');

    const db = firebase.firestore();
    const orderRef = db.collection('orders').doc();
    const orderNumber = Utils.generateOrderNumber();

    const itemsSnapshot = this.cart.map(i => ({
      productId: i.productId,
      partName: i.partName,
      carMake: i.carMake,
      carModel: i.carModel,
      year: i.year,
      bodyType: i.bodyType,
      restyling: !!i.restyling,
      condition: i.condition,
      price: i.price
    }));

    const total = itemsSnapshot.reduce((s, x) => s + (x.price || 0), 0);

      // ✅ ИСПРАВЛЕННАЯ ТРАНЗАКЦИЯ
    await db.runTransaction(async (tx) => {
      // ───────────────────────────────────────────
      // ШАГ 1: Сначала ВСЕ чтения
      // ───────────────────────────────────────────
      const reads = [];
      
      for (const item of itemsSnapshot) {
        const ref = db.collection('inventory').doc(item.productId);
        const snap = await tx.get(ref);
        reads.push({ item, ref, snap });
      }

      // ───────────────────────────────────────────
      // ШАГ 2: Валидация данных (без обращения к БД)
      // ───────────────────────────────────────────
      for (const { item, snap } of reads) {
        if (!snap.exists) {
          throw new Error(`Товар не найден: ${item.partName}`);
        }
        const stock = snap.data().stock || 0;
        if (stock <= 0) {
          throw new Error(`Товар закончился: ${item.partName}`);
        }
      }

      // ───────────────────────────────────────────
      // ШАГ 3: Потом ВСЕ записи
      // ───────────────────────────────────────────
      for (const { ref, snap } of reads) {
        const currentStock = snap.data().stock || 0;
        tx.update(ref, { stock: currentStock - 1 });
      }

      // Создаём заказ
      tx.set(orderRef, {
        orderNumber,
        userId: user.uid,
        userEmail: user.email,
        userName,
        items: itemsSnapshot,
        total,
        status: 'active',
        date: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    // ✅ Успех
    this.clearCart();
    UI.closeModal('checkoutModal');

    UI.renderBookingResult({
      orderNumber,
      userName,
      items: itemsSnapshot.map(x => ({ partName: x.partName, price: x.price })),
      total
    });
    UI.openModal('bookingResultModal');

    // Печать чека
    UI.printReceipt({
      title: 'Чек бронирования',
      orderNumber,
      userName,
      items: itemsSnapshot.map(x => ({ partName: x.partName, price: x.price })),
      total,
      date: Utils.formatDate(new Date(), true)
    });

    UI.showToast(`Бронь оформлена: #${orderNumber}`, 'success');

    // Обновляем список заказов если открыт профиль
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
  // FIX: без orderBy -> без индекса
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
      // ВАЖНО: без orderBy, иначе нужен индекс
      const snapshot = await firebase.firestore()
        .collection('orders')
        .where('userId', '==', user.uid)
        .limit(200)
        .get();

      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // сортируем на клиенте по date/createdAt
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
          <p>У вас пока нет заказов</p>
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
      const total = (order.items || []).reduce((sum, item) => sum + (item.price || 0), 0);

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
                <span>${Utils.escapeHtml(item.partName)}</span>
                <span>${Utils.formatPrice(item.price || 0)}</span>
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

      batch.update(db.collection('orders').doc(orderId), {
        status: 'cancelled',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
        cancelledBy: 'user',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      for (const item of (order.items || [])) {
        if (item.productId) {
          batch.update(db.collection('inventory').doc(item.productId), {
            stock: firebase.firestore.FieldValue.increment(1)
          });
        }
      }

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