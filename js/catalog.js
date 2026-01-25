/**
 * Модуль каталога
 */
const Catalog = {
    parts: [],
    filtered: [],
    page: 1,
    perPage: 12,
    filters: { brand: '', model: '', category: '', condition: '', search: '' },
    sort: 'newest',

    async init() {
        await this.load();
    },

    async load() {
        try {
            // Загружаем все товары
            const snap = await db.collection(DB.PARTS).get();
            this.parts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.applyFilters();
        } catch (e) {
            console.error('Error loading parts:', e);
            Utils.toast('Ошибка загрузки каталога', 'error');
        }
    },

    getPart(id) {
        return this.parts.find(p => p.id === id);
    },

    // Получить доступное количество (всего минус зарезервированные)
    getAvailable(part) {
        if (!part) return 0;
        const reserved = part.reserved || 0;
        const quantity = part.quantity || 0;
        return Math.max(0, quantity - reserved);
    },

    applyFilters() {
        this.filtered = this.parts.filter(p => {
            // Показываем только если есть доступные (не зарезервированные)
            if (this.getAvailable(p) <= 0) return false;

            if (this.filters.search) {
                const s = this.filters.search.toLowerCase();
                if (!`${p.name} ${p.brand} ${p.model}`.toLowerCase().includes(s)) return false;
            }
            if (this.filters.brand && p.brand !== this.filters.brand) return false;
            if (this.filters.model && p.model !== this.filters.model) return false;
            if (this.filters.category && p.category !== this.filters.category) return false;
            if (this.filters.condition && p.condition !== this.filters.condition) return false;
            return true;
        });

        // Сортировка
        switch (this.sort) {
            case 'price-asc': this.filtered.sort((a, b) => a.price - b.price); break;
            case 'price-desc': this.filtered.sort((a, b) => b.price - a.price); break;
            case 'name': this.filtered.sort((a, b) => a.name.localeCompare(b.name, 'ru')); break;
            default: this.filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        }

        this.page = 1;
    },

    search(q) {
        this.filters.search = q;
        this.applyFilters();
        this.renderParts();
    },

    render() {
        const el = document.getElementById('catalog');

        el.innerHTML = `
            <div class="catalog">
                <h2 class="section-title">Каталог запчастей</h2>
                <p class="section-desc">Найдите нужную запчасть по марке, модели или категории</p>
                
                <div class="filters">
                    <div class="filters-row">
                        <div class="filter-group">
                            <label>Марка</label>
                            <select id="f-brand">
                                <option value="">Все марки</option>
                                ${Object.keys(CAR_BRANDS).map(b => `<option value="${b}">${b}</option>`).join('')}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label>Модель</label>
                            <select id="f-model" disabled>
                                <option value="">Выберите марку</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label>Категория</label>
                            <select id="f-category">
                                ${CATEGORIES.map(c => `<option value="${c === 'Все' ? '' : c}">${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label>Состояние</label>
                            <select id="f-condition">
                                <option value="">Любое</option>
                                ${CONDITIONS.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="filter-group" style="display:flex;gap:8px;align-items:flex-end;">
                            <button class="btn btn-primary" onclick="Catalog.doFilter()">
                                <i class="fas fa-filter"></i> Фильтр
                            </button>
                            <button class="btn btn-secondary" onclick="Catalog.resetFilters()">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="toolbar">
                    <div class="results-count">
                        Найдено: <strong id="parts-count">${this.filtered.length}</strong> 
                        ${Utils.plural(this.filtered.length, ['запчасть', 'запчасти', 'запчастей'])}
                    </div>
                    <div class="sort-box">
                        <label>Сортировка:</label>
                        <select id="sort-select">
                            <option value="newest">Сначала новые</option>
                            <option value="price-asc">Дешевле</option>
                            <option value="price-desc">Дороже</option>
                            <option value="name">По названию</option>
                        </select>
                    </div>
                </div>
                
                <div class="parts-grid" id="parts-grid"></div>
                <div class="pagination" id="pagination"></div>
            </div>
        `;

        this.bindFilterEvents();
        this.renderParts();
    },

    bindFilterEvents() {
        const brandEl = document.getElementById('f-brand');
        const modelEl = document.getElementById('f-model');
        const catEl = document.getElementById('f-category');
        const condEl = document.getElementById('f-condition');
        const sortEl = document.getElementById('sort-select');

        if (brandEl) {
            brandEl.onchange = () => {
                const brand = brandEl.value;
                this.filters.brand = brand;
                if (brand && CAR_BRANDS[brand]) {
                    modelEl.disabled = false;
                    modelEl.innerHTML = `<option value="">Все модели</option>` +
                        CAR_BRANDS[brand].map(m => `<option value="${m}">${m}</option>`).join('');
                } else {
                    modelEl.disabled = true;
                    modelEl.innerHTML = '<option value="">Выберите марку</option>';
                }
                this.filters.model = '';
            };
        }

        if (modelEl) modelEl.onchange = () => { this.filters.model = modelEl.value; };
        if (catEl) catEl.onchange = () => { this.filters.category = catEl.value; };
        if (condEl) condEl.onchange = () => { this.filters.condition = condEl.value; };

        if (sortEl) {
            sortEl.onchange = () => {
                this.sort = sortEl.value;
                this.applyFilters();
                this.renderParts();
            };
        }
    },

    doFilter() {
        this.applyFilters();
        this.renderParts();
    },

    resetFilters() {
        this.filters = { brand: '', model: '', category: '', condition: '', search: '' };
        document.getElementById('f-brand').value = '';
        document.getElementById('f-model').value = '';
        document.getElementById('f-model').disabled = true;
        document.getElementById('f-category').value = '';
        document.getElementById('f-condition').value = '';
        const searchInput = document.querySelector('.search-box input');
        if (searchInput) searchInput.value = '';
        this.applyFilters();
        this.renderParts();
    },

    renderParts() {
        const grid = document.getElementById('parts-grid');
        const pag = document.getElementById('pagination');
        document.getElementById('parts-count').textContent = this.filtered.length;

        const start = (this.page - 1) * this.perPage;
        const pageParts = this.filtered.slice(start, start + this.perPage);

        if (!pageParts.length) {
            grid.innerHTML = `
                <div class="empty" style="grid-column:1/-1;">
                    <div class="empty-icon"><i class="fas fa-search"></i></div>
                    <h3 class="empty-title">Ничего не найдено</h3>
                    <p class="empty-text">Попробуйте изменить фильтры</p>
                    <button class="btn btn-primary" onclick="Catalog.resetFilters()">Сбросить</button>
                </div>
            `;
            pag.innerHTML = '';
            return;
        }

        grid.innerHTML = pageParts.map(p => this.renderCard(p)).join('');
        pag.innerHTML = this.renderPagination();
    },

    renderCard(p) {
        const cond = CONDITIONS.find(c => c.id === p.condition);
        const inCart = Cart.has(p.id);
        const available = this.getAvailable(p);

        return `
            <div class="part-card">
                <div class="part-img">
                    ${p.images?.[0]
                        ? `<img src="${p.images[0]}" alt="${p.name}" loading="lazy">`
                        : '<i class="fas fa-image no-img"></i>'}
                </div>
                <div class="part-body">
                    <div class="part-category">${p.category || 'Запчасть'}</div>
                    <div class="part-name">${p.name}</div>
                    <div class="part-car"><i class="fas fa-car"></i> ${p.brand} ${p.model} ${p.year}</div>
                    <div class="part-meta">
                        <span style="color:${cond?.color || 'inherit'}">● ${cond?.name || 'Б/У'}</span>
                        <span><i class="fas fa-box"></i> ${available} шт.</span>
                    </div>
                    <div class="part-footer">
                        <div class="part-price">${Utils.formatPrice(p.price)}</div>
                        <div class="part-actions">
                            <button class="btn btn-secondary btn-sm" onclick="Catalog.openDetail('${p.id}')">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="Cart.add('${p.id}')" ${available <= 0 ? 'disabled' : ''}>
                                <i class="fas fa-${inCart ? 'check' : 'cart-plus'}"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderPagination() {
        const total = Math.ceil(this.filtered.length / this.perPage);
        if (total <= 1) return '';

        let html = '';
        html += `<button class="page-btn" onclick="Catalog.goPage(${this.page - 1})" ${this.page === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

        for (let i = 1; i <= total; i++) {
            if (i === 1 || i === total || (i >= this.page - 1 && i <= this.page + 1)) {
                html += `<button class="page-btn ${i === this.page ? 'active' : ''}" onclick="Catalog.goPage(${i})">${i}</button>`;
            } else if (i === this.page - 2 || i === this.page + 2) {
                html += '<span style="padding:0 8px">...</span>';
            }
        }

        html += `<button class="page-btn" onclick="Catalog.goPage(${this.page + 1})" ${this.page === total ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        return html;
    },

    goPage(n) {
        const total = Math.ceil(this.filtered.length / this.perPage);
        if (n < 1 || n > total) return;
        this.page = n;
        this.renderParts();
        document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
    },

    openDetail(id) {
        const p = this.getPart(id);
        if (!p) return;

        const cond = CONDITIONS.find(c => c.id === p.condition);
        const available = this.getAvailable(p);

        Modal.open({
            title: p.name,
            size: 'lg',
            content: `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
                    <div>
                        <div style="background:var(--gray-100);border-radius:var(--radius);overflow:hidden;aspect-ratio:4/3;">
                            ${p.images?.[0]
                                ? `<img src="${p.images[0]}" style="width:100%;height:100%;object-fit:cover;" id="main-img">`
                                : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--gray-400);font-size:64px;"><i class="fas fa-image"></i></div>'}
                        </div>
                        ${p.images?.length > 1 ? `
                            <div style="display:flex;gap:8px;margin-top:12px;overflow-x:auto;">
                                ${p.images.map((img, i) => `
                                    <img src="${img}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;cursor:pointer;opacity:${i === 0 ? 1 : 0.6}"
                                         onclick="document.getElementById('main-img').src='${img}';this.parentElement.querySelectorAll('img').forEach(i=>i.style.opacity=0.6);this.style.opacity=1;">
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                    <div>
                        <div class="part-category">${p.category}</div>
                        <h2 style="margin:8px 0;">${p.name}</h2>
                        <div class="part-price" style="font-size:28px;color:var(--primary);margin:16px 0;">${Utils.formatPrice(p.price)}</div>
                        
                        <div style="background:var(--gray-50);padding:16px;border-radius:var(--radius);margin-bottom:16px;">
                            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-200);">
                                <span style="color:var(--gray-500)">Автомобиль</span>
                                <span style="font-weight:500">${p.brand} ${p.model}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-200);">
                                <span style="color:var(--gray-500)">Год</span>
                                <span style="font-weight:500">${p.year}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-200);">
                                <span style="color:var(--gray-500)">Состояние</span>
                                <span style="font-weight:500;color:${cond?.color}">${cond?.name || 'Б/У'}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:8px 0;">
                                <span style="color:var(--gray-500)">Кузов</span>
                                <span style="font-weight:500">${p.bodyType || '-'}</span>
                            </div>
                        </div>
                        
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;color:${available > 3 ? 'var(--success)' : available > 0 ? 'var(--warning)' : 'var(--danger)'}">
                            <i class="fas fa-${available > 0 ? 'check' : 'times'}-circle"></i>
                            <span>${available > 3 ? 'В наличии' : available > 0 ? `Осталось ${available} шт.` : 'Нет в наличии'}</span>
                        </div>
                        
                        <div style="display:flex;gap:12px;">
                            <button class="btn btn-primary btn-lg" style="flex:1" onclick="Cart.add('${p.id}');Modal.closeAll();" ${available <= 0 ? 'disabled' : ''}>
                                <i class="fas fa-cart-plus"></i> В корзину
                            </button>
                            <button class="btn btn-success btn-lg" style="flex:1" onclick="Reservations.quickReserve('${p.id}')" ${available <= 0 ? 'disabled' : ''}>
                                <i class="fas fa-bookmark"></i> Забронировать
                            </button>
                        </div>
                    </div>
                </div>
            `
        });
    }
};