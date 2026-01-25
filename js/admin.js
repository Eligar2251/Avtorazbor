/**
 * Модуль админ-панели
 */
const Admin = {
    tab: 'reservations',
    reservations: [],
    inventory: [],
    sales: [],
    selectedParts: {},

    async open() {
        if (!Auth.isAdmin()) {
            Utils.toast('Нет доступа', 'error');
            return;
        }

        await this.loadData();
        const pending = this.reservations.filter(r => r.status === 'pending').length;

        Modal.open({
            title: 'Панель управления',
            size: 'xl',
            content: `
                <div class="admin-panel">
                    <div class="admin-tabs">
                        <button class="admin-tab ${this.tab === 'reservations' ? 'active' : ''}" data-tab="reservations">
                            <i class="fas fa-bookmark"></i> Брони
                            ${pending ? `<span class="count">${pending}</span>` : ''}
                        </button>
                        <button class="admin-tab ${this.tab === 'inventory' ? 'active' : ''}" data-tab="inventory">
                            <i class="fas fa-warehouse"></i> Склад
                        </button>
                        <button class="admin-tab ${this.tab === 'add-car' ? 'active' : ''}" data-tab="add-car">
                            <i class="fas fa-car"></i> Добавить авто
                        </button>
                        <button class="admin-tab ${this.tab === 'sales' ? 'active' : ''}" data-tab="sales">
                            <i class="fas fa-chart-line"></i> Продажи
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
                    <div class="admin-section ${this.tab === 'sales' ? 'active' : ''}" id="sec-sales">
                        ${this.renderSales()}
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.closeAll()">Закрыть</button>
            `
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

    // ==================== RESERVATIONS ====================
    renderReservations() {
        if (!this.reservations.length) {
            return '<div class="empty"><div class="empty-icon"><i class="fas fa-inbox"></i></div><h3 class="empty-title">Нет бронирований</h3></div>';
        }

        const stats = {
            pending: this.reservations.filter(r => r.status === 'pending').length,
            confirmed: this.reservations.filter(r => r.status === 'confirmed').length,
            completed: this.reservations.filter(r => r.status === 'completed').length,
            cancelled: this.reservations.filter(r => r.status === 'cancelled').length
        };

        return `
            <div class="admin-stats">
                <div class="admin-stat"><div class="admin-stat-value" style="color:var(--warning)">${stats.pending}</div><div class="admin-stat-label">Ожидают</div></div>
                <div class="admin-stat"><div class="admin-stat-value" style="color:var(--primary)">${stats.confirmed}</div><div class="admin-stat-label">Подтверждены</div></div>
                <div class="admin-stat"><div class="admin-stat-value" style="color:var(--success)">${stats.completed}</div><div class="admin-stat-label">Завершены</div></div>
                <div class="admin-stat"><div class="admin-stat-value" style="color:var(--danger)">${stats.cancelled}</div><div class="admin-stat-label">Отменены</div></div>
            </div>
            <div class="reservation-list">
                ${this.reservations.map(r => this.renderResCard(r)).join('')}
            </div>
        `;
    },

    renderResCard(r) {
        const statusColors = { pending: 'var(--warning)', confirmed: 'var(--primary)', completed: 'var(--success)', cancelled: 'var(--danger)' };
        const statusNames = { pending: 'Ожидает', confirmed: 'Подтверждено', completed: 'Завершено', cancelled: 'Отменено' };

        return `
            <div class="reservation-card">
                <div class="reservation-header">
                    <span class="reservation-order">${r.orderNumber}</span>
                    <span class="badge" style="background:${statusColors[r.status]}20;color:${statusColors[r.status]}">${statusNames[r.status]}</span>
                </div>
                <div class="reservation-body">
                    <div class="reservation-info">
                        <p><i class="fas fa-user"></i> ${r.customerName}</p>
                        <p><i class="fas fa-phone"></i> ${r.customerPhone}</p>
                        <p><i class="fas fa-calendar"></i> ${Utils.formatDate(r.createdAt, true)}</p>
                        ${r.comment ? `<p><i class="fas fa-comment"></i> ${r.comment}</p>` : ''}
                    </div>
                    <div class="reservation-items">
                        ${r.items.map(i => `<div class="reservation-item"><strong>${i.name}</strong> — ${i.quantity} шт. × ${Utils.formatPrice(i.price)}</div>`).join('')}
                    </div>
                </div>
                <div class="reservation-footer">
                    <div class="reservation-total">${Utils.formatPrice(r.total)}</div>
                    <div class="reservation-actions">
                        ${r.status === 'pending' ? `
                            <button class="btn btn-success btn-sm" onclick="Admin.confirmRes('${r.id}')"><i class="fas fa-check"></i> Подтвердить</button>
                            <button class="btn btn-danger btn-sm" onclick="Admin.cancelRes('${r.id}')"><i class="fas fa-times"></i> Отменить</button>
                        ` : ''}
                        ${r.status === 'confirmed' ? `
                            <button class="btn btn-success btn-sm" onclick="Admin.completeRes('${r.id}')"><i class="fas fa-shopping-bag"></i> Продать</button>
                            <button class="btn btn-danger btn-sm" onclick="Admin.cancelRes('${r.id}')"><i class="fas fa-times"></i> Отменить</button>
                        ` : ''}
                        ${r.status === 'completed' ? `
                            <button class="btn btn-primary btn-sm" onclick="Admin.printRes('${r.id}')"><i class="fas fa-print"></i> Чек</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    // Подтверждение брони
    async confirmRes(id) {
        try {
            await db.collection(DB.RESERVATIONS).doc(id).update({
                status: 'confirmed',
                confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            Utils.toast('Бронирование подтверждено', 'success');
            await this.refreshRes();
        } catch (e) {
            console.error(e);
            Utils.toast('Ошибка', 'error');
        }
    },

    // Отмена брони - возвращаем товары (уменьшаем reserved)
    async cancelRes(id) {
        if (!await Modal.confirm({
            title: 'Отменить бронь?',
            message: 'Товары снова станут доступны для бронирования',
            type: 'danger',
            confirmText: 'Отменить'
        })) return;

        try {
            const res = this.reservations.find(r => r.id === id);
            if (!res) throw new Error('Бронирование не найдено');

            // Возвращаем товары (уменьшаем reserved)
            for (const item of res.items) {
                await db.collection(DB.PARTS).doc(item.partId).update({
                    reserved: firebase.firestore.FieldValue.increment(-item.quantity)
                });
            }

            // Обновляем статус бронирования
            await db.collection(DB.RESERVATIONS).doc(id).update({
                status: 'cancelled',
                cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            Utils.toast('Бронирование отменено, товары возвращены', 'info');
            
            // Обновляем каталог
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            
            await this.refreshRes();
        } catch (e) {
            console.error(e);
            Utils.toast('Ошибка: ' + e.message, 'error');
        }
    },

    // Завершение продажи - списываем товары (уменьшаем quantity и reserved)
    async completeRes(id) {
        const res = this.reservations.find(r => r.id === id);
        if (!res) return;

        if (!await Modal.confirm({
            title: 'Завершить продажу?',
            message: 'Товары будут списаны со склада',
            type: 'success',
            confirmText: 'Продать'
        })) return;

        try {
            // Списываем товары со склада
            for (const item of res.items) {
                const partRef = db.collection(DB.PARTS).doc(item.partId);
                const partDoc = await partRef.get();
                
                if (partDoc.exists) {
                    const partData = partDoc.data();
                    const newQuantity = (partData.quantity || 0) - item.quantity;
                    const newReserved = Math.max(0, (partData.reserved || 0) - item.quantity);
                    
                    if (newQuantity <= 0) {
                        // Удаляем товар если quantity = 0
                        await partRef.delete();
                    } else {
                        // Уменьшаем quantity и reserved
                        await partRef.update({
                            quantity: newQuantity,
                            reserved: newReserved
                        });
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
            this.printRes(id);
            
            // Обновляем каталог
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            App.updateStats();
            
            await this.loadData();
            this.refreshRes();
        } catch (e) {
            console.error(e);
            Utils.toast('Ошибка: ' + e.message, 'error');
        }
    },

    printRes(id) {
        const res = this.reservations.find(r => r.id === id) || this.sales.find(s => s.id === id || s.reservationId === id);
        if (res) Reservations.printReceipt(res);
    },

    async refreshRes() {
        await this.loadData();
        document.getElementById('sec-reservations').innerHTML = this.renderReservations();
    },

    // ==================== INVENTORY ====================
    renderInventory() {
        if (!this.inventory.length) {
            return '<div class="empty"><div class="empty-icon"><i class="fas fa-box-open"></i></div><h3 class="empty-title">Склад пуст</h3></div>';
        }

        return `
            <div class="mb-4" style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Название</th>
                            <th>Авто</th>
                            <th>Категория</th>
                            <th>Цена</th>
                            <th>Всего</th>
                            <th>Забронир.</th>
                            <th>Доступно</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.inventory.map(p => {
                            const reserved = p.reserved || 0;
                            const available = Math.max(0, (p.quantity || 0) - reserved);
                            return `
                                <tr>
                                    <td><strong>${p.name}</strong></td>
                                    <td>${p.brand} ${p.model} ${p.year}</td>
                                    <td>${p.category || '-'}</td>
                                    <td>${Utils.formatPrice(p.price)}</td>
                                    <td>${p.quantity || 0}</td>
                                    <td>${reserved > 0 ? `<span class="badge badge-warning">${reserved}</span>` : '-'}</td>
                                    <td><span class="badge ${available > 0 ? 'badge-success' : 'badge-danger'}">${available}</span></td>
                                    <td>
                                        <div class="table-actions">
                                            <button class="table-btn edit" onclick="Admin.editPart('${p.id}')"><i class="fas fa-edit"></i></button>
                                            <button class="table-btn delete" onclick="Admin.deletePart('${p.id}')"><i class="fas fa-trash"></i></button>
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
                            <input type="number" class="form-input" name="price" value="${p.price}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Количество</label>
                            <input type="number" class="form-input" name="quantity" value="${p.quantity}" required min="${p.reserved || 0}">
                            <span class="form-hint">Мин: ${p.reserved || 0} (забронировано)</span>
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
            const reserved = p.reserved || 0;
            
            if (newQty < reserved) {
                Utils.toast(`Количество не может быть меньше забронированного (${reserved})`, 'error');
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
                await this.loadData();
                this.open();
            } catch (e) {
                Utils.toast('Ошибка', 'error');
            }
        };
    },

    async deletePart(id) {
        const p = this.inventory.find(x => x.id === id);
        if (!p) return;
        
        if ((p.reserved || 0) > 0) {
            Utils.toast('Нельзя удалить товар с активными бронированиями', 'error');
            return;
        }
        
        if (!await Modal.confirm({ title: 'Удалить?', message: 'Это действие нельзя отменить', type: 'danger', confirmText: 'Удалить' })) return;
        
        try {
            await db.collection(DB.PARTS).doc(id).delete();
            Utils.toast('Удалено', 'success');
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            await this.loadData();
            this.open();
        } catch (e) {
            Utils.toast('Ошибка', 'error');
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
                <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Отметьте запчасти, которые есть на этом автомобиле</p>
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
            
            <button class="btn btn-primary btn-lg" style="width:100%;" onclick="Admin.saveCar()" id="save-car-btn">
                <i class="fas fa-save"></i> Сохранить автомобиль и запчасти
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
                    model.innerHTML = `<option value="">Выберите</option>` + CAR_BRANDS[b].map(m => `<option value="${m}">${m}</option>`).join('');
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
                    <button class="btn btn-ghost btn-sm" onclick="Admin.removePartForm('${pid}')"><i class="fas fa-times"></i></button>
                </div>
                ${existing ? `
                    <div style="background:#dbeafe;padding:10px;border-radius:var(--radius);margin-bottom:12px;font-size:13px;">
                        <i class="fas fa-info-circle" style="color:var(--primary)"></i>
                        <strong>Товар найден:</strong> ${Utils.formatPrice(existing.price)} | ${existing.quantity} шт.
                        <br><span style="color:var(--gray-500)">При сохранении кол-во увеличится на 1</span>
                    </div>
                ` : ''}
                <div class="part-form-grid">
                    <div class="form-group">
                        <label class="form-label required">Цена</label>
                        <input type="number" class="form-input" id="pp-${pid}" value="${existing?.price || ''}" placeholder="0" required>
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
            const carRef = await db.collection(DB.CARS).add({
                brand, model, year, bodyType: body, restyling: restyle,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

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
                    await db.collection(DB.PARTS).doc(part.existingId).update({
                        quantity: firebase.firestore.FieldValue.increment(1),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
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

            Utils.toast('Автомобиль и запчасти добавлены!', 'success');
            await Catalog.load();
            Catalog.applyFilters();
            Catalog.renderParts();
            App.updateStats();

            this.selectedParts = {};
            document.getElementById('sec-add-car').innerHTML = this.renderAddCar();
            this.bindAddCarEvents();

        } catch (e) {
            console.error(e);
            Utils.toast('Ошибка сохранения', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
        }
    },

    // ==================== SALES ====================
    renderSales() {
        const total = this.sales.reduce((s, x) => s + x.total, 0);

        if (!this.sales.length) {
            return '<div class="empty"><div class="empty-icon"><i class="fas fa-chart-line"></i></div><h3 class="empty-title">Нет продаж</h3></div>';
        }

        return `
            <div class="admin-stats">
                <div class="admin-stat"><div class="admin-stat-value" style="color:var(--success)">${Utils.formatPrice(total)}</div><div class="admin-stat-label">Общая сумма</div></div>
                <div class="admin-stat"><div class="admin-stat-value">${this.sales.length}</div><div class="admin-stat-label">Всего продаж</div></div>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr><th>Заказ</th><th>Клиент</th><th>Дата</th><th>Сумма</th><th></th></tr>
                    </thead>
                    <tbody>
                        ${this.sales.map(s => `
                            <tr>
                                <td><strong>${s.orderNumber}</strong></td>
                                <td>${s.customerName}</td>
                                <td>${Utils.formatDate(s.completedAt, true)}</td>
                                <td><strong>${Utils.formatPrice(s.total)}</strong></td>
                                <td>
                                    <button class="table-btn print" onclick="Reservations.printReceipt(Admin.sales.find(x=>x.id==='${s.id}'))"><i class="fas fa-print"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
};