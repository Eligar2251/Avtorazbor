/**
 * Модуль админ-панели
 */
const Admin = {
    tab: 'reservations',
    reservations: [],
    inventory: [],
    sales: [],
    history: [],
    selectedParts: {},

    async open() {
        if (!Auth.isAdmin()) {
            Utils.toast('Нет доступа', 'error');
            return;
        }

        await this.loadData();
        
        // Активные брони (pending, confirmed)
        const activeReservations = this.reservations.filter(r => 
            r.status === 'pending' || r.status === 'confirmed'
        );
        const pendingCount = this.reservations.filter(r => r.status === 'pending').length;

        Modal.open({
            title: 'Панель управления',
            size: 'xl',
            content: `
                <div class="admin-panel">
                    <div class="admin-tabs">
                        <button class="admin-tab ${this.tab === 'reservations' ? 'active' : ''}" data-tab="reservations">
                            <i class="fas fa-bookmark"></i>
                            <span>Брони</span>
                            ${pendingCount ? `<span class="count">${pendingCount}</span>` : ''}
                        </button>
                        <button class="admin-tab ${this.tab === 'inventory' ? 'active' : ''}" data-tab="inventory">
                            <i class="fas fa-warehouse"></i>
                            <span>Склад</span>
                        </button>
                        <button class="admin-tab ${this.tab === 'add-car' ? 'active' : ''}" data-tab="add-car">
                            <i class="fas fa-car"></i>
                            <span>Добавить</span>
                        </button>
                        <button class="admin-tab ${this.tab === 'history' ? 'active' : ''}" data-tab="history">
                            <i class="fas fa-history"></i>
                            <span>История</span>
                        </button>
                    </div>
                    
                    <div class="admin-section ${this.tab === 'reservations' ? 'active' : ''}" id="sec-reservations">
                        ${this.renderReservations()}
                    </div>
                    <div class="admin-section ${this.tab === 'inventory' ? 'active' : ''}" id="sec-inventory">
                        ${this.renderInventory()}
                    </div>
                    <div class="admin-section ${this.tab === 'add-car' ? 'active' : ''}" id="sec-add-car">
                        ${this.renderAddCar()}
                    </div>
                    <div class="admin-section ${this.tab === 'history' ? 'active' : ''}" id="sec-history">
                        ${this.renderHistory()}
                    </div>
                </div>
            `,
            footer: `<button class="btn btn-secondary" onclick="Modal.closeAll()">Закрыть</button>`
        });

        this.bindEvents();
    },

    async loadData() {
        try {
            const [resSnap, invSnap, salesSnap] = await Promise.all([
                db.collection(DB.RESERVATIONS).orderBy('createdAt', 'desc').get(),
                db.collection(DB.PARTS).get(),
                db.collection(DB.SALES).orderBy('completedAt', 'desc').get()
            ]);

            this.reservations = resSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.inventory = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // История = завершенные + отмененные брони
            this.history = this.reservations.filter(r => 
                r.status === 'completed' || r.status === 'cancelled'
            );
        } catch (e) {
            console.error('Admin load error:', e);
            Utils.toast('Ошибка загрузки данных', 'error');
        }
    },

    bindEvents() {
        document.querySelectorAll('.admin-tab').forEach(t => {
            t.onclick = () => {
                this.tab = t.dataset.tab;
                document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
                document.querySelectorAll('.admin-section').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                document.getElementById(`sec-${this.tab}`).classList.add('active');

                if (this.tab === 'add-car') this.bindAddCarEvents();
            };
        });

        if (this.tab === 'add-car') this.bindAddCarEvents();
    },

    // ==================== RESERVATIONS (только активные) ====================
    renderReservations() {
        // Только pending и confirmed
        const activeRes = this.reservations.filter(r => 
            r.status === 'pending' || r.status === 'confirmed'
        );

        if (!activeRes.length) {
            return `
                <div class="empty">
                    <div class="empty-icon"><i class="fas fa-inbox"></i></div>
                    <h3 class="empty-title">Нет активных бронирований</h3>
                    <p class="empty-text">Новые брони появятся здесь</p>
                </div>
            `;
        }

        const stats = {
            pending: this.reservations.filter(r => r.status === 'pending').length,
            confirmed: this.reservations.filter(r => r.status === 'confirmed').length
        };

        return `
            <div class="admin-stats">
                <div class="admin-stat">
                    <div class="admin-stat-value" style="color:var(--warning)">${stats.pending}</div>
                    <div class="admin-stat-label">Ожидают</div>
                </div>
                <div class="admin-stat">
                    <div class="admin-stat-value" style="color:var(--primary)">${stats.confirmed}</div>
                    <div class="admin-stat-label">Подтверждены</div>
                </div>
            </div>
            <div class="reservation-list">
                ${activeRes.map(r => this.renderResCard(r)).join('')}
            </div>
        `;
    },

    renderResCard(r) {
        const statusColors = { 
            pending: 'var(--warning)', 
            confirmed: 'var(--primary)', 
            completed: 'var(--success)', 
            cancelled: 'var(--danger)' 
        };
        const statusNames = { 
            pending: 'Ожидает', 
            confirmed: 'Подтверждено', 
            completed: 'Завершено', 
            cancelled: 'Отменено' 
        };

        return `
            <div class="reservation-card">
                <div class="reservation-header">
                    <span class="reservation-order">${r.orderNumber}</span>
                    <span class="badge" style="background:${statusColors[r.status]}20;color:${statusColors[r.status]}">
                        ${statusNames[r.status]}
                    </span>
                </div>
                <div class="reservation-body">
                    <div class="reservation-info">
                        <p><i class="fas fa-user"></i> ${r.customerName}</p>
                        <p><i class="fas fa-phone"></i> ${r.customerPhone}</p>
                        <p><i class="fas fa-calendar"></i> ${Utils.formatDate(r.createdAt, true)}</p>
                        ${r.comment ? `<p><i class="fas fa-comment"></i> ${r.comment}</p>` : ''}
                    </div>
                    <div class="reservation-items">
                        ${r.items.map(i => `
                            <div class="reservation-item">
                                <strong>${i.name}</strong> — ${i.quantity} шт. × ${Utils.formatPrice(i.price)}
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="reservation-footer">
                    <div class="reservation-total">${Utils.formatPrice(r.total)}</div>
                    <div class="reservation-actions">
                        ${r.status === 'pending' ? `
                            <button class="btn btn-success btn-sm" onclick="Admin.confirmRes('${r.id}')">
                                <i class="fas fa-check"></i> Подтвердить
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="Admin.cancelRes('${r.id}')">
                                <i class="fas fa-times"></i> Отменить
                            </button>
                        ` : ''}
                        ${r.status === 'confirmed' ? `
                            <button class="btn btn-success btn-sm" onclick="Admin.completeRes('${r.id}')">
                                <i class="fas fa-shopping-bag"></i> Продать
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="Admin.cancelRes('${r.id}')">
                                <i class="fas fa-times"></i> Отменить
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    // Подтверждение брони
    async confirmRes(id) {
        const btn = event.target.closest('button');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            await db.collection(DB.RESERVATIONS).doc(id).update({
                status: 'confirmed',
                confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            Utils.toast('Бронирование подтверждено', 'success');
            await this.refresh();
        } catch (e) {
            console.error('Confirm error:', e);
            Utils.toast('Ошибка: ' + e.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Подтвердить';
        }
    },

    // Отмена брони - возвращаем reserved
    async cancelRes(id) {
        if (!await Modal.confirm({
            title: 'Отменить бронь?',
            message: 'Товары снова станут доступны для покупки',
            type: 'danger',
            confirmText: 'Отменить бронь'
        })) return;

        try {
            const res = this.reservations.find(r => r.id === id);
            if (!res) throw new Error('Бронирование не найдено');

            // Возвращаем товары (уменьшаем reserved)
            for (const item of res.items) {
                const partRef = db.collection(DB.PARTS).doc(item.partId);
                const partDoc = await partRef.get();
                
                if (partDoc.exists) {
                    const currentReserved = partDoc.data().reserved || 0;
                    const newReserved = Math.max(0, currentReserved - item.quantity);
                    
                    await partRef.update({
                        reserved: newReserved
                    });
                }
            }

            // Обновляем статус
            await db.collection(DB.RESERVATIONS).doc(id).update({
                status: 'cancelled',
                cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            Utils.toast('Бронирование отменено, товары возвращены', 'info');
            
            // Обновляем каталог
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            
            await this.refresh();
        } catch (e) {
            console.error('Cancel error:', e);
            Utils.toast('Ошибка: ' + e.message, 'error');
        }
    },

    // Завершение продажи - списываем товары
    async completeRes(id) {
        const res = this.reservations.find(r => r.id === id);
        if (!res) return;

        if (!await Modal.confirm({
            title: 'Завершить продажу?',
            message: 'Товары будут списаны со склада и добавлены в историю продаж',
            type: 'success',
            confirmText: 'Продать'
        })) return;

        try {
            // Списываем товары
            for (const item of res.items) {
                const partRef = db.collection(DB.PARTS).doc(item.partId);
                const partDoc = await partRef.get();

                if (partDoc.exists) {
                    const data = partDoc.data();
                    const newQuantity = Math.max(0, (data.quantity || 0) - item.quantity);
                    const newReserved = Math.max(0, (data.reserved || 0) - item.quantity);

                    if (newQuantity <= 0) {
                        // Удаляем товар если quantity = 0
                        await partRef.delete();
                        console.log(`Deleted part ${item.partId} (quantity = 0)`);
                    } else {
                        await partRef.update({
                            quantity: newQuantity,
                            reserved: newReserved
                        });
                        console.log(`Updated part ${item.partId}: qty=${newQuantity}, res=${newReserved}`);
                    }
                }
            }

            // Обновляем статус бронирования
            await db.collection(DB.RESERVATIONS).doc(id).update({
                status: 'completed',
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Добавляем в продажи
            await db.collection(DB.SALES).add({
                ...res,
                reservationId: id,
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            Utils.toast('Продажа завершена!', 'success');

            // Печатаем чек
            Reservations.printReceipt({
                ...res,
                completedAt: new Date()
            });

            // Обновляем каталог
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            App.updateStats();

            await this.refresh();
        } catch (e) {
            console.error('Complete error:', e);
            Utils.toast('Ошибка: ' + e.message, 'error');
        }
    },

    // ==================== HISTORY (завершенные и отмененные) ====================
    renderHistory() {
        // Объединяем продажи и отмененные брони
        const completed = this.reservations.filter(r => r.status === 'completed');
        const cancelled = this.reservations.filter(r => r.status === 'cancelled');
        
        const totalSales = this.sales.reduce((s, x) => s + (x.total || 0), 0);

        if (!completed.length && !cancelled.length) {
            return `
                <div class="empty">
                    <div class="empty-icon"><i class="fas fa-history"></i></div>
                    <h3 class="empty-title">История пуста</h3>
                    <p class="empty-text">Завершенные и отмененные заказы появятся здесь</p>
                </div>
            `;
        }

        return `
            <div class="admin-stats">
                <div class="admin-stat">
                    <div class="admin-stat-value" style="color:var(--success)">${Utils.formatPrice(totalSales)}</div>
                    <div class="admin-stat-label">Сумма продаж</div>
                </div>
                <div class="admin-stat">
                    <div class="admin-stat-value" style="color:var(--success)">${completed.length}</div>
                    <div class="admin-stat-label">Продано</div>
                </div>
                <div class="admin-stat">
                    <div class="admin-stat-value" style="color:var(--danger)">${cancelled.length}</div>
                    <div class="admin-stat-label">Отменено</div>
                </div>
            </div>
            
            <div class="reservation-list">
                ${this.history.map(r => this.renderHistoryCard(r)).join('')}
            </div>
        `;
    },

    renderHistoryCard(r) {
        const isCompleted = r.status === 'completed';
        const statusColor = isCompleted ? 'var(--success)' : 'var(--danger)';
        const statusName = isCompleted ? 'Продано' : 'Отменено';
        const date = Utils.formatDate(r.completedAt || r.cancelledAt || r.createdAt, true);

        return `
            <div class="reservation-card">
                <div class="reservation-header">
                    <span class="reservation-order">${r.orderNumber}</span>
                    <span class="badge" style="background:${statusColor}20;color:${statusColor}">
                        ${statusName}
                    </span>
                </div>
                <div class="reservation-body">
                    <div class="reservation-info">
                        <p><i class="fas fa-user"></i> ${r.customerName}</p>
                        <p><i class="fas fa-phone"></i> ${r.customerPhone}</p>
                        <p><i class="fas fa-calendar"></i> ${date}</p>
                    </div>
                    <div class="reservation-items">
                        ${r.items.map(i => `
                            <div class="reservation-item">
                                <strong>${i.name}</strong> — ${i.quantity} шт. × ${Utils.formatPrice(i.price)}
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="reservation-footer">
                    <div class="reservation-total">${Utils.formatPrice(r.total)}</div>
                    <div class="reservation-actions">
                        <button class="btn btn-secondary btn-sm" onclick="Admin.showOrderDetails('${r.id}')">
                            <i class="fas fa-eye"></i> Детали
                        </button>
                        ${isCompleted ? `
                            <button class="btn btn-primary btn-sm" onclick="Admin.printOrderReceipt('${r.id}')">
                                <i class="fas fa-print"></i> Чек
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    showOrderDetails(id) {
        const order = this.reservations.find(r => r.id === id) || this.sales.find(s => s.id === id);
        if (!order) return;

        const isCompleted = order.status === 'completed';
        const date = Utils.formatDate(order.completedAt || order.cancelledAt || order.createdAt, true);

        Modal.open({
            title: `Заказ ${order.orderNumber}`,
            size: 'md',
            content: `
                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <span class="badge ${isCompleted ? 'badge-success' : 'badge-danger'}" style="font-size:13px;padding:6px 12px;">
                            ${isCompleted ? 'Продано' : 'Отменено'}
                        </span>
                        <span style="color:var(--gray-500);font-size:14px;">${date}</span>
                    </div>
                    
                    <div style="background:var(--gray-50);padding:16px;border-radius:var(--radius);margin-bottom:16px;">
                        <h4 style="margin-bottom:12px;font-size:14px;color:var(--gray-600);">Клиент</h4>
                        <p style="margin-bottom:4px;"><strong>${order.customerName}</strong></p>
                        <p style="color:var(--gray-600);font-size:14px;">${order.customerPhone}</p>
                        ${order.comment ? `<p style="color:var(--gray-500);font-size:13px;margin-top:8px;"><i class="fas fa-comment"></i> ${order.comment}</p>` : ''}
                    </div>
                    
                    <div style="background:var(--gray-50);padding:16px;border-radius:var(--radius);margin-bottom:16px;">
                        <h4 style="margin-bottom:12px;font-size:14px;color:var(--gray-600);">Товары</h4>
                        ${order.items.map(i => `
                            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-200);">
                                <div>
                                    <strong>${i.name}</strong><br>
                                    <span style="font-size:12px;color:var(--gray-500);">${i.brand} ${i.model} ${i.year}</span>
                                </div>
                                <div style="text-align:right;">
                                    <div>${i.quantity} × ${Utils.formatPrice(i.price)}</div>
                                    <div style="font-weight:600;color:var(--primary);">${Utils.formatPrice(i.price * i.quantity)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="display:flex;justify-content:space-between;padding:16px;background:var(--primary);color:white;border-radius:var(--radius);">
                        <span style="font-size:18px;font-weight:600;">Итого:</span>
                        <span style="font-size:24px;font-weight:700;">${Utils.formatPrice(order.total)}</span>
                    </div>
                </div>
            `,
            footer: `
                ${isCompleted ? `
                    <button class="btn btn-primary" onclick="Admin.printOrderReceipt('${id}')">
                        <i class="fas fa-print"></i> Печать чека
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="Modal.closeAll()">Закрыть</button>
            `
        });
    },

    printOrderReceipt(id) {
        const order = this.reservations.find(r => r.id === id) || this.sales.find(s => s.id === id || s.reservationId === id);
        if (order) {
            Reservations.printReceipt(order);
        }
    },

    // ==================== INVENTORY ====================
    renderInventory() {
        if (!this.inventory.length) {
            return `
                <div class="empty">
                    <div class="empty-icon"><i class="fas fa-box-open"></i></div>
                    <h3 class="empty-title">Склад пуст</h3>
                    <p class="empty-text">Добавьте автомобиль с запчастями</p>
                </div>
            `;
        }

        return `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Название</th>
                            <th>Авто</th>
                            <th>Цена</th>
                            <th>Всего</th>
                            <th>Брон.</th>
                            <th>Дост.</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.inventory.map(p => {
                            const reserved = p.reserved || 0;
                            const available = Math.max(0, (p.quantity || 0) - reserved);
                            return `
                                <tr>
                                    <td><strong>${p.name}</strong></td>
                                    <td style="font-size:12px;">${p.brand} ${p.model} ${p.year}</td>
                                    <td>${Utils.formatPrice(p.price)}</td>
                                    <td>${p.quantity || 0}</td>
                                    <td>${reserved > 0 ? `<span class="badge badge-warning">${reserved}</span>` : '-'}</td>
                                    <td><span class="badge ${available > 0 ? 'badge-success' : 'badge-danger'}">${available}</span></td>
                                    <td>
                                        <div class="table-actions">
                                            <button class="table-btn edit" onclick="Admin.editPart('${p.id}')" title="Редактировать">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="table-btn delete" onclick="Admin.deletePart('${p.id}')" title="Удалить">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async editPart(id) {
        const p = this.inventory.find(x => x.id === id);
        if (!p) return;

        const reserved = p.reserved || 0;

        Modal.open({
            title: 'Редактирование',
            size: 'sm',
            content: `
                <form id="edit-form">
                    <div class="form-group">
                        <label class="form-label">Название</label>
                        <input type="text" class="form-input" name="name" value="${p.name}" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Цена</label>
                            <input type="number" class="form-input" name="price" value="${p.price}" required min="0">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Количество</label>
                            <input type="number" class="form-input" name="quantity" value="${p.quantity}" required min="${reserved}">
                            ${reserved > 0 ? `<span class="form-hint">Мин: ${reserved} (забронировано)</span>` : ''}
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Состояние</label>
                        <select class="form-input" name="condition">
                            ${CONDITIONS.map(c => `<option value="${c.id}" ${c.id === p.condition ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.closeAll()">Отмена</button>
                <button class="btn btn-primary" type="submit" form="edit-form">Сохранить</button>
            `
        });

        document.getElementById('edit-form').onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const newQty = parseInt(fd.get('quantity'));

            if (newQty < reserved) {
                Utils.toast(`Нельзя уменьшить ниже ${reserved} (забронировано)`, 'error');
                return;
            }

            try {
                await db.collection(DB.PARTS).doc(id).update({
                    name: fd.get('name'),
                    price: parseFloat(fd.get('price')),
                    quantity: newQty,
                    condition: fd.get('condition'),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                Modal.closeAll();
                Utils.toast('Сохранено', 'success');
                
                await Catalog.load();
                Catalog.applyFilters();
                Catalog.renderParts();
                
                await this.refresh();
            } catch (e) {
                Utils.toast('Ошибка: ' + e.message, 'error');
            }
        };
    },

    async deletePart(id) {
        const p = this.inventory.find(x => x.id === id);
        if (!p) return;

        const reserved = p.reserved || 0;
        if (reserved > 0) {
            Utils.toast('Нельзя удалить товар с активными бронями', 'error');
            return;
        }

        if (!await Modal.confirm({
            title: 'Удалить товар?',
            message: `${p.name} будет удален со склада`,
            type: 'danger',
            confirmText: 'Удалить'
        })) return;

        try {
            await db.collection(DB.PARTS).doc(id).delete();
            Utils.toast('Товар удален', 'success');
            
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            
            await this.refresh();
        } catch (e) {
            Utils.toast('Ошибка: ' + e.message, 'error');
        }
    },

    // ==================== ADD CAR ====================
    renderAddCar() {
        this.selectedParts = {};
        return `
            <div class="car-form-section">
                <h3><i class="fas fa-car"></i> Информация об автомобиле</h3>
                <div class="car-form-grid">
                    <div class="form-group">
                        <label class="form-label required">Марка</label>
                        <select class="form-input" id="car-brand">
                            <option value="">Выберите</option>
                            ${Object.keys(CAR_BRANDS).map(b => `<option value="${b}">${b}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Модель</label>
                        <select class="form-input" id="car-model" disabled>
                            <option value="">Сначала марку</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Год</label>
                        <select class="form-input" id="car-year">
                            <option value="">Выберите</option>
                            ${Array.from({ length: 30 }, (_, i) => 2024 - i).map(y => `<option value="${y}">${y}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Кузов</label>
                        <select class="form-input" id="car-body">
                            <option value="">Выберите</option>
                            ${BODY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Рестайлинг</label>
                        <select class="form-input" id="car-restyle">
                            <option value="no">Нет</option>
                            <option value="yes">Да</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="car-form-section">
                <h3><i class="fas fa-cogs"></i> Запчасти</h3>
                <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Отметьте имеющиеся запчасти</p>
                <div class="parts-list" id="parts-list">
                    ${PARTS_LIST.map(p => `
                        <label class="part-check" data-pid="${p.id}">
                            <input type="checkbox" onchange="Admin.togglePart('${p.id}',this.checked)">
                            <div>
                                <div class="part-check-name">${p.name}</div>
                                <div class="part-check-cat">${p.cat}</div>
                            </div>
                        </label>
                    `).join('')}
                </div>
                <div id="part-forms"></div>
            </div>
            
            <button class="btn btn-primary btn-lg btn-block" onclick="Admin.saveCar()" id="save-car-btn">
                <i class="fas fa-save"></i> Сохранить
            </button>
        `;
    },

    bindAddCarEvents() {
        const brand = document.getElementById('car-brand');
        const model = document.getElementById('car-model');

        if (brand) {
            brand.onchange = () => {
                const b = brand.value;
                if (b && CAR_BRANDS[b]) {
                    model.disabled = false;
                    model.innerHTML = `<option value="">Выберите</option>` + 
                        CAR_BRANDS[b].map(m => `<option value="${m}">${m}</option>`).join('');
                } else {
                    model.disabled = true;
                    model.innerHTML = '<option value="">Сначала марку</option>';
                }
            };
        }
    },

    async togglePart(pid, checked) {
        const pDef = PARTS_LIST.find(p => p.id === pid);
        if (!pDef) return;

        const el = document.querySelector(`.part-check[data-pid="${pid}"]`);

        if (checked) {
            el.classList.add('selected');
            this.selectedParts[pid] = { ...pDef, price: 0, condition: 'good', isAssembly: false, images: [] };
            await this.renderPartForm(pid);
        } else {
            el.classList.remove('selected');
            delete this.selectedParts[pid];
            document.getElementById(`pf-${pid}`)?.remove();
        }
    },

    async renderPartForm(pid) {
        const part = this.selectedParts[pid];
        const container = document.getElementById('part-forms');

        const brand = document.getElementById('car-brand').value;
        const model = document.getElementById('car-model').value;
        const year = document.getElementById('car-year').value;

        let existing = null;
        if (brand && model && year) {
            const snap = await db.collection(DB.PARTS)
                .where('brand', '==', brand)
                .where('model', '==', model)
                .where('year', '==', year)
                .where('partType', '==', pid)
                .limit(1).get();
            if (!snap.empty) existing = { id: snap.docs[0].id, ...snap.docs[0].data() };
        }

        const html = `
            <div class="part-form" id="pf-${pid}">
                <div class="part-form-header">
                    <span class="part-form-title"><i class="fas fa-cog"></i> ${part.name}</span>
                    <button class="btn btn-ghost btn-sm" onclick="Admin.removePartForm('${pid}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                ${existing ? `
                    <div style="background:#dbeafe;padding:10px;border-radius:var(--radius);margin-bottom:12px;font-size:13px;">
                        <i class="fas fa-info-circle" style="color:var(--primary)"></i>
                        <strong>Найден на складе:</strong> ${Utils.formatPrice(existing.price)} | ${existing.quantity} шт.
                        <br><span style="color:var(--gray-500)">Количество увеличится на 1</span>
                    </div>
                ` : ''}
                <div class="part-form-grid">
                    <div class="form-group">
                        <label class="form-label required">Цена</label>
                        <input type="number" class="form-input" id="pp-${pid}" value="${existing?.price || ''}" placeholder="0" required min="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Состояние</label>
                        <select class="form-input" id="pc-${pid}">
                            ${CONDITIONS.map(c => `<option value="${c.id}" ${c.id === (existing?.condition || 'good') ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                    </div>
                    ${part.assembly ? `
                        <div class="form-group">
                            <label class="form-label">В сборе</label>
                            <select class="form-input" id="pa-${pid}">
                                <option value="no">Нет</option>
                                <option value="yes">Да</option>
                            </select>
                        </div>
                    ` : ''}
                </div>
                <div class="form-group">
                    <label class="form-label">Фото</label>
                    <div class="image-upload" onclick="document.getElementById('pi-${pid}').click()">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <p>Нажмите для загрузки</p>
                    </div>
                    <input type="file" id="pi-${pid}" multiple accept="image/*" style="display:none" onchange="Admin.uploadImages('${pid}',this.files)">
                    <div class="image-previews" id="ipv-${pid}"></div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', html);

        if (existing) {
            this.selectedParts[pid].existingId = existing.id;
            this.selectedParts[pid].existingQty = existing.quantity;
        }
    },

    removePartForm(pid) {
        const cb = document.querySelector(`.part-check[data-pid="${pid}"] input`);
        if (cb) cb.checked = false;
        document.querySelector(`.part-check[data-pid="${pid}"]`)?.classList.remove('selected');
        delete this.selectedParts[pid];
        document.getElementById(`pf-${pid}`)?.remove();
    },

    async uploadImages(pid, files) {
        const preview = document.getElementById(`ipv-${pid}`);
        for (const f of files) {
            try {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.innerHTML += `
                        <div class="img-preview">
                            <img src="${e.target.result}">
                            <button onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
                        </div>
                    `;
                };
                reader.readAsDataURL(f);

                const url = await Utils.uploadImage(f);
                this.selectedParts[pid].images.push(url);
            } catch (e) {
                Utils.toast('Ошибка загрузки фото', 'error');
            }
        }
    },

    async saveCar() {
        const brand = document.getElementById('car-brand').value;
        const model = document.getElementById('car-model').value;
        const year = document.getElementById('car-year').value;
        const body = document.getElementById('car-body').value;
        const restyle = document.getElementById('car-restyle').value === 'yes';

        if (!brand || !model || !year || !body) {
            Utils.toast('Заполните все поля автомобиля', 'error');
            return;
        }

        if (!Object.keys(this.selectedParts).length) {
            Utils.toast('Выберите хотя бы одну запчасть', 'error');
            return;
        }

        const btn = document.getElementById('save-car-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';

        try {
            // Сохраняем авто
            const carRef = await db.collection(DB.CARS).add({
                brand, model, year, bodyType: body, restyling: restyle,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Сохраняем запчасти
            for (const [pid, part] of Object.entries(this.selectedParts)) {
                const price = parseFloat(document.getElementById(`pp-${pid}`).value);
                const condition = document.getElementById(`pc-${pid}`).value;
                const isAssembly = document.getElementById(`pa-${pid}`)?.value === 'yes';

                if (!price || price <= 0) {
                    Utils.toast(`Укажите цену для ${part.name}`, 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
                    return;
                }

                if (part.existingId) {
                    // Увеличиваем количество существующего
                    const partRef = db.collection(DB.PARTS).doc(part.existingId);
                    const partDoc = await partRef.get();
                    if (partDoc.exists) {
                        await partRef.update({
                            quantity: (partDoc.data().quantity || 0) + 1,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                } else {
                    // Создаем новый товар
                    await db.collection(DB.PARTS).add({
                        partType: pid,
                        name: part.name,
                        category: part.cat,
                        brand, model, year, bodyType: body, restyling: restyle,
                        price, condition, isAssembly,
                        quantity: 1,
                        reserved: 0,
                        images: part.images,
                        carId: carRef.id,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            Utils.toast('Сохранено!', 'success');
            
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            App.updateStats();

            // Сбрасываем форму
            this.selectedParts = {};
            document.getElementById('sec-add-car').innerHTML = this.renderAddCar();
            this.bindAddCarEvents();

        } catch (e) {
            console.error('Save error:', e);
            Utils.toast('Ошибка: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
        }
    },

    // ==================== REFRESH ====================
    async refresh() {
        await this.loadData();
        document.getElementById('sec-reservations').innerHTML = this.renderReservations();
        document.getElementById('sec-inventory').innerHTML = this.renderInventory();
        document.getElementById('sec-history').innerHTML = this.renderHistory();
    }
};