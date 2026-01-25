/**
 * Модуль корзины
 */
const Cart = {
    items: [],
    modalId: null,

    init() {
        this.items = Utils.load('cart', []);
    },

    getCount() {
        return this.items.reduce((s, i) => s + i.qty, 0);
    },

    getTotal() {
        return this.items.reduce((s, i) => {
            const part = Catalog.getPart(i.partId);
            return s + (part?.price || 0) * i.qty;
        }, 0);
    },

    has(partId) {
        return this.items.some(i => i.partId === partId);
    },

    add(partId) {
        const part = Catalog.getPart(partId);
        if(!part) return;

        const existing = this.items.find(i => i.partId === partId);
        if(existing) {
            if(existing.qty < part.quantity) {
                existing.qty++;
                Utils.toast('Количество увеличено', 'success');
            } else {
                Utils.toast('Достигнут максимум', 'warning');
                return;
            }
        } else {
            this.items.push({partId, qty: 1});
            Utils.toast('Добавлено в корзину', 'success');
        }

        this.save();
        App.updateCartBadge();
        if(this.modalId) this.updateModal();
    },

    remove(partId) {
        this.items = this.items.filter(i => i.partId !== partId);
        this.save();
        App.updateCartBadge();
        if(this.modalId) this.updateModal();
        Utils.toast('Удалено из корзины', 'info');
    },

    updateQty(partId, delta) {
        const item = this.items.find(i => i.partId === partId);
        const part = Catalog.getPart(partId);
        if(!item || !part) return;

        const newQty = item.qty + delta;
        if(newQty <= 0) {
            this.remove(partId);
            return;
        }
        if(newQty > part.quantity) {
            Utils.toast('Недостаточно на складе', 'warning');
            return;
        }

        item.qty = newQty;
        this.save();
        App.updateCartBadge();
        if(this.modalId) this.updateModal();
    },

    clear() {
        this.items = [];
        this.save();
        App.updateCartBadge();
        if(this.modalId) this.updateModal();
    },

    save() {
        Utils.save('cart', this.items);
    },

    openModal() {
        this.modalId = Modal.open({
            title: 'Корзина',
            sidebar: true,
            content: this.renderContent(),
            footer: this.items.length ? this.renderFooter() : '',
            onClose: () => { this.modalId = null; }
        });
    },

    updateModal() {
        Modal.update(this.modalId, this.renderContent());
        Modal.updateFooter(this.modalId, this.items.length ? this.renderFooter() : '');
    },

    renderContent() {
        if(!this.items.length) {
            return `
                <div class="cart-empty">
                    <div class="empty-icon"><i class="fas fa-shopping-cart"></i></div>
                    <h3 class="empty-title">Корзина пуста</h3>
                    <p class="empty-text">Добавьте товары из каталога</p>
                    <button class="btn btn-primary" onclick="Modal.closeAll()">В каталог</button>
                </div>
            `;
        }

        let html = '<div class="cart-items">';
        this.items.forEach(item => {
            const part = Catalog.getPart(item.partId);
            if(!part) return;
            html += `
                <div class="cart-item">
                    <div class="cart-item-img">
                        ${part.images?.[0] ? `<img src="${part.images[0]}" alt="">` : '<i class="fas fa-image no-img"></i>'}
                    </div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${part.name}</div>
                        <div class="cart-item-meta">${part.brand} ${part.model} ${part.year}</div>
                        <div class="cart-item-price">${Utils.formatPrice(part.price)}</div>
                    </div>
                    <div class="cart-item-actions">
                        <button class="btn btn-ghost btn-sm" onclick="Cart.remove('${item.partId}')">
                            <i class="fas fa-trash"></i>
                        </button>
                        <div class="qty-control">
                            <button class="qty-btn" onclick="Cart.updateQty('${item.partId}',-1)">-</button>
                            <span class="qty-value">${item.qty}</span>
                            <button class="qty-btn" onclick="Cart.updateQty('${item.partId}',1)">+</button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        html += `
            <div class="cart-summary">
                <div class="cart-total">
                    <span>Итого:</span>
                    <span>${Utils.formatPrice(this.getTotal())}</span>
                </div>
            </div>
        `;

        return html;
    },

    renderFooter() {
        return `
            <button class="btn btn-secondary" onclick="Cart.clear()">Очистить</button>
            <button class="btn btn-success" onclick="Cart.checkout()">Оформить бронь</button>
        `;
    },

    checkout() {
        if(!this.items.length) {
            Utils.toast('Корзина пуста', 'warning');
            return;
        }

        if(!Auth.isLoggedIn()) {
            Modal.closeAll();
            Auth.showLoginModal();
            Utils.toast('Войдите для оформления брони', 'info');
            return;
        }

        Modal.closeAll();
        Reservations.openCheckoutModal(this.items);
    }
};