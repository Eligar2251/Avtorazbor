/**
 * Модуль бронирований
 */
const Reservations = {
    
    openCheckoutModal(items) {
        if (!Auth.isLoggedIn()) {
            Auth.showLoginModal();
            return;
        }

        const userData = Auth.getUserData();
        const parts = items.map(i => {
            const p = Catalog.getPart(i.partId);
            if (!p) return null;
            const available = Catalog.getAvailable(p);
            // Проверяем доступность
            if (available < i.qty) {
                Utils.toast(`${p.name}: доступно только ${available} шт.`, 'warning');
                return null;
            }
            return { ...p, qty: i.qty };
        }).filter(Boolean);

        if (parts.length === 0) {
            Utils.toast('Нет доступных товаров для бронирования', 'error');
            return;
        }

        const total = parts.reduce((s, p) => s + p.price * p.qty, 0);

        Modal.open({
            title: 'Оформление бронирования',
            size: 'lg',
            content: `
                <form id="checkout-form">
                    <div class="car-form-section">
                        <h3><i class="fas fa-box"></i> Ваш заказ</h3>
                        <div style="background:var(--gray-50);padding:12px;border-radius:var(--radius);max-height:200px;overflow-y:auto;">
                            ${parts.map(p => `
                                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-200);">
                                    <div>
                                        <strong>${p.name}</strong><br>
                                        <span style="font-size:12px;color:var(--gray-500)">${p.brand} ${p.model} ${p.year} • ${p.qty} шт.</span>
                                    </div>
                                    <div style="font-weight:600;color:var(--primary)">${Utils.formatPrice(p.price * p.qty)}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:16px;background:var(--gray-100);border-radius:var(--radius);margin-top:12px;">
                            <span style="font-size:18px;font-weight:600;">Итого:</span>
                            <span style="font-size:24px;font-weight:700;color:var(--primary)">${Utils.formatPrice(total)}</span>
                        </div>
                    </div>

                    <div class="car-form-section">
                        <h3><i class="fas fa-user"></i> Контактные данные</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label required">Ваше имя</label>
                                <input type="text" class="form-input" name="name" value="${userData?.name || ''}" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Телефон</label>
                                <input type="tel" class="form-input" name="phone" value="${userData?.phone || ''}" required placeholder="+7 (999) 999-99-99">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Комментарий</label>
                            <textarea class="form-input" name="comment" rows="2" placeholder="Дополнительная информация..."></textarea>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-check">
                            <input type="checkbox" required>
                            <span>Я согласен с условиями бронирования. Бронь действует 24 часа.</span>
                        </label>
                    </div>

                    <div id="checkout-error" class="form-error hidden"></div>
                </form>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.closeAll()">Отмена</button>
                <button class="btn btn-success" type="submit" form="checkout-form" id="checkout-btn">
                    <i class="fas fa-check"></i> Подтвердить бронь
                </button>
            `
        });

        document.getElementById('checkout-form').onsubmit = (e) => {
            e.preventDefault();
            this.processCheckout(e.target, items, total);
        };
    },

    async processCheckout(form, items, total) {
        const name = form.name.value.trim();
        const phone = form.phone.value.trim();
        const comment = form.comment.value.trim();
        const errEl = document.getElementById('checkout-error');
        const btn = document.getElementById('checkout-btn');

        if (!Utils.isValidPhone(phone)) {
            errEl.textContent = 'Введите корректный номер телефона';
            errEl.classList.remove('hidden');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Оформление...';
        errEl.classList.add('hidden');

        try {
            const orderNum = Utils.genOrderNum();

            // Подготовка данных бронирования
            const reservationItems = [];
            
            for (const i of items) {
                const p = Catalog.getPart(i.partId);
                if (!p) continue;
                
                const available = Catalog.getAvailable(p);
                if (available < i.qty) {
                    throw new Error(`${p.name}: недостаточно товара`);
                }
                
                reservationItems.push({
                    partId: i.partId,
                    name: p.name,
                    brand: p.brand,
                    model: p.model,
                    year: p.year,
                    price: p.price,
                    quantity: i.qty
                });
                
                // Увеличиваем reserved для товара
                await db.collection(DB.PARTS).doc(i.partId).update({
                    reserved: firebase.firestore.FieldValue.increment(i.qty)
                });
            }

            // Создаем бронирование
            const reservation = {
                orderNumber: orderNum,
                userId: Auth.getUser().uid,
                items: reservationItems,
                total,
                customerName: name,
                customerPhone: Utils.formatPhone(phone),
                comment,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            };

            await db.collection(DB.RESERVATIONS).add(reservation);

            // Обновляем профиль пользователя
            await Auth.updateProfile({ name, phone: Utils.formatPhone(phone) });

            // Очищаем корзину
            Cart.clear();

            // Обновляем каталог
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();

            Modal.closeAll();
            this.showSuccess(orderNum, total);

        } catch (e) {
            console.error('Checkout error:', e);
            errEl.textContent = e.message || 'Ошибка оформления. Попробуйте снова.';
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Подтвердить бронь';
        }
    },

    showSuccess(orderNum, total) {
        Modal.open({
            title: 'Бронирование оформлено!',
            size: 'sm',
            content: `
                <div class="text-center">
                    <div style="width:80px;height:80px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                        <i class="fas fa-check" style="font-size:36px;color:var(--success)"></i>
                    </div>
                    <p style="color:var(--gray-600);margin-bottom:20px;">Ваш заказ успешно забронирован</p>
                    <div style="background:var(--gray-100);padding:12px;border-radius:var(--radius);font-family:monospace;font-size:18px;font-weight:700;margin-bottom:20px;">
                        ${orderNum}
                    </div>
                    <div style="background:#fef3c7;padding:12px;border-radius:var(--radius);margin-bottom:20px;">
                        <i class="fas fa-clock" style="color:var(--warning)"></i>
                        <span style="font-size:14px;color:var(--gray-700);">Бронь действует 24 часа</span>
                    </div>
                    <p style="color:var(--gray-500);font-size:14px;">Сумма: <strong>${Utils.formatPrice(total)}</strong></p>
                </div>
            `,
            footer: `<button class="btn btn-primary" style="width:100%;" onclick="Modal.closeAll()">На главную</button>`
        });
    },

    quickReserve(partId) {
        if (!Auth.isLoggedIn()) {
            Auth.showLoginModal();
            Utils.toast('Войдите для оформления брони', 'info');
            return;
        }

        const part = Catalog.getPart(partId);
        if (!part || Catalog.getAvailable(part) <= 0) {
            Utils.toast('Товар недоступен', 'error');
            return;
        }

        Modal.closeAll();
        this.openCheckoutModal([{ partId, qty: 1 }]);
    },

    // Генерация чека (маленький, как кассовый)
    generateReceipt(res) {
        const date = Utils.formatDate(res.createdAt || res.completedAt, true);
        return `
            <div class="receipt">
                <div class="receipt-header">
                    <div class="receipt-logo">АвтоРазбор</div>
                    <div class="receipt-subtitle">Запчасти для авто</div>
                    <div class="receipt-subtitle">Тел: +7 (999) 999-99-99</div>
                </div>
                
                <div class="receipt-divider">--------------------------------</div>
                
                <div class="receipt-row">
                    <span>Чек №:</span>
                    <span>${res.orderNumber}</span>
                </div>
                <div class="receipt-row">
                    <span>Дата:</span>
                    <span>${date}</span>
                </div>
                <div class="receipt-row">
                    <span>Клиент:</span>
                    <span>${res.customerName}</span>
                </div>
                <div class="receipt-row">
                    <span>Тел:</span>
                    <span>${res.customerPhone}</span>
                </div>
                
                <div class="receipt-divider">--------------------------------</div>
                
                ${res.items.map(i => `
                    <div class="receipt-item">
                        <div class="receipt-item-name">${i.name}</div>
                        <div class="receipt-item-line">
                            <span>${i.quantity} x ${i.price}₽</span>
                            <span>${i.price * i.quantity}₽</span>
                        </div>
                    </div>
                `).join('')}
                
                <div class="receipt-divider">--------------------------------</div>
                
                <div class="receipt-total">
                    <span>ИТОГО:</span>
                    <span>${Utils.formatPrice(res.total)}</span>
                </div>
                
                <div class="receipt-divider">--------------------------------</div>
                
                <div class="receipt-footer">
                    <div class="receipt-barcode">||||| |||| ||||| ||||</div>
                    <div>Спасибо за покупку!</div>
                </div>
                
                <div class="receipt-sign">
                    <div class="receipt-sign-line"></div>
                    <div>Подпись продавца</div>
                </div>
            </div>
        `;
    },

    // Печать чека
    printReceipt(res) {
        const html = this.generateReceipt(res);
        const win = window.open('', '_blank', 'width=320,height=600');
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Чек ${res.orderNumber}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        padding: 10px;
                        background: #fff;
                        width: 280px;
                    }
                    .receipt {
                        width: 260px;
                    }
                    .receipt-header {
                        text-align: center;
                        margin-bottom: 8px;
                    }
                    .receipt-logo {
                        font-size: 16px;
                        font-weight: bold;
                    }
                    .receipt-subtitle {
                        font-size: 10px;
                        color: #666;
                    }
                    .receipt-divider {
                        text-align: center;
                        color: #999;
                        margin: 6px 0;
                        font-size: 10px;
                        letter-spacing: -1px;
                    }
                    .receipt-row {
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        margin: 3px 0;
                    }
                    .receipt-item {
                        margin: 6px 0;
                    }
                    .receipt-item-name {
                        font-size: 11px;
                        font-weight: bold;
                    }
                    .receipt-item-line {
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        color: #666;
                    }
                    .receipt-total {
                        display: flex;
                        justify-content: space-between;
                        font-size: 14px;
                        font-weight: bold;
                        margin: 8px 0;
                    }
                    .receipt-footer {
                        text-align: center;
                        margin-top: 10px;
                        font-size: 10px;
                        color: #666;
                    }
                    .receipt-barcode {
                        font-size: 20px;
                        letter-spacing: 2px;
                        margin: 6px 0;
                    }
                    .receipt-sign {
                        margin-top: 20px;
                        text-align: center;
                    }
                    .receipt-sign-line {
                        border-bottom: 1px solid #000;
                        width: 150px;
                        height: 25px;
                        margin: 0 auto 4px;
                    }
                    .receipt-sign div:last-child {
                        font-size: 9px;
                        color: #666;
                    }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                ${html}
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() { window.close(); }, 1000);
                    }
                </script>
            </body>
            </html>
        `);
        win.document.close();
    }
};