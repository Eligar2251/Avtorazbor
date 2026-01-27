/**
 * Admin.js — Admin panel
 * Features:
 * - Wizard add car -> add parts (with Cloudinary images, autoprice from stock)
 * - Inventory table: edit price/stock/description + edit image
 * - Inventory bulk: select many -> bulk delete / bulk edit (table modal + per-row image upload)
 * - Orders: view, cancel (return stock), complete (move to sales + print receipt)
 * - Sales: view, print receipt
 * - Cars tab: grouped from inventory by carKey
 *
 * Notes:
 * - Uses onSnapshot for instant updates in admin UI (inventory/orders/sales).
 * - Avoids composite-index queries (no where+orderBy combos).
 */

const Admin = {
  _eventsBound: false,
  _carMakeSelectBound: false,
  _saving: false,

  // realtime unsubscribers
  _unsubInventory: null,
  _unsubOrders: null,
  _unsubSales: null,

  // data
  inventoryData: [],
  ordersData: [],
  salesData: [],

  // wizard
  priceTouched: new Set(),
  wizardState: {
    step: 1,
    carData: {},
    selectedParts: [],
    partsDetails: {}
  },

  // inventory edit
  editingProduct: null,
  _editImageUrl: null,

  // inventory selection/bulk
  selectedInventoryIds: new Set(),
  bulkDrafts: new Map(), // id -> { price, stock, description, imageUrl }

  init() {
    if (!Auth.isAdmin()) {
      UI.showToast('Доступ запрещен', 'error');
      UI.navigate('home');
      return;
    }

    if (!this._eventsBound) {
      this.bindEvents();
      this._eventsBound = true;
    }

    this.initCarMakesSelect();
    this.renderPartsCategories();

    // Start realtime listeners (loads initial data too)
    this.ensureRealtime();
  },

  ensureRealtime() {
    this.subscribeInventoryRealtime();
    this.subscribeOrdersRealtime();
    this.subscribeSalesRealtime();
  },

  // ==========================================================
  // Realtime listeners
  // ==========================================================
  subscribeInventoryRealtime() {
    if (this._unsubInventory) return;

    const db = firebase.firestore();
    this._unsubInventory = db.collection('inventory').onSnapshot((snap) => {
      this.inventoryData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.inventoryData.sort((a, b) => this.getTsMillis(b) - this.getTsMillis(a));

      // keep selection only for existing docs
      this.cleanupSelection();

      // rerender inventory tab if visible
      if (!document.getElementById('tabInventory')?.classList.contains('hidden')) {
        this.renderInventory(this.inventoryData);
      }

      // rerender cars tab if visible
      if (!document.getElementById('tabCars')?.classList.contains('hidden')) {
        this.refreshCarsTab();
      }
    }, (err) => {
      console.error('subscribeInventoryRealtime error:', err);
      UI.showToast('Ошибка realtime склада', 'error');
    });
  },

  subscribeOrdersRealtime() {
    if (this._unsubOrders) return;

    const db = firebase.firestore();
    this._unsubOrders = db.collection('orders').onSnapshot((snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      all.sort((a, b) => (b.date?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.date?.toMillis?.() || a.createdAt?.toMillis?.() || 0));

      this.ordersData = all.filter(o => ['active', 'confirmed', 'ready'].includes(o.status));

      if (!document.getElementById('tabOrders')?.classList.contains('hidden')) {
        this.renderOrders();
      }
    }, (err) => {
      console.error('subscribeOrdersRealtime error:', err);
      UI.showToast('Ошибка realtime броней', 'error');
    });
  },

  subscribeSalesRealtime() {
    if (this._unsubSales) return;

    const db = firebase.firestore();
    this._unsubSales = db.collection('sales').onSnapshot((snap) => {
      this.salesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.salesData.sort((a, b) => (b.completedAt?.toMillis?.() || 0) - (a.completedAt?.toMillis?.() || 0));

      if (!document.getElementById('tabSales')?.classList.contains('hidden')) {
        this.renderSales();
      }
    }, (err) => {
      console.error('subscribeSalesRealtime error:', err);
      UI.showToast('Ошибка realtime продаж', 'error');
    });
  },

  // ==========================================================
  // Events / Tabs
  // ==========================================================
  bindEvents() {
    // Tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Wizard
    document.getElementById('carInfoForm')?.addEventListener('submit', (e) => this.handleCarInfoSubmit(e));
    document.getElementById('wizardBack1')?.addEventListener('click', () => this.goToStep(1));
    document.getElementById('wizardNext2')?.addEventListener('click', () => this.goToStep(3));
    document.getElementById('wizardBack2')?.addEventListener('click', () => this.goToStep(2));
    document.getElementById('saveParts')?.addEventListener('click', () => this.saveAllParts());

    document.getElementById('partsSearch')?.addEventListener('input', Utils.debounce((e) => {
      this.filterParts(e.target.value);
    }, 200));

    // Inventory search/sort
    document.getElementById('inventorySearch')?.addEventListener('input', Utils.debounce((e) => {
      this.filterInventory(e.target.value);
    }, 200));

    document.getElementById('inventorySort')?.addEventListener('change', (e) => {
      this.sortInventory(e.target.value);
    });

    // Cars tab search/sort
    document.getElementById('carsSearch')?.addEventListener('input', Utils.debounce(() => {
      this.refreshCarsTab();
    }, 200));
    document.getElementById('carsSort')?.addEventListener('change', () => this.refreshCarsTab());

    // Inventory selection (bulk) — only if html elements exist
    const tbody = document.getElementById('inventoryBody');
    const selectAll = document.getElementById('inventorySelectAll');

    tbody?.addEventListener('change', (e) => {
      const cb = e.target.closest('.inv-select');
      if (!cb) return;
      const id = cb.dataset.id;
      if (!id) return;

      if (cb.checked) this.selectedInventoryIds.add(id);
      else this.selectedInventoryIds.delete(id);

      this.syncSelectAllCheckbox();
      this.updateBulkBar();
    });

    tbody?.addEventListener('click', (e) => {
      const btn = e.target.closest('.inv-edit');
      if (!btn) return;
      const id = btn.dataset.id;
      if (id) this.editProduct(id);
    });

    selectAll?.addEventListener('change', () => {
      const checked = selectAll.checked;
      document.querySelectorAll('#inventoryBody .inv-select').forEach(cb => {
        cb.checked = checked;
        const id = cb.dataset.id;
        if (!id) return;
        if (checked) this.selectedInventoryIds.add(id);
        else this.selectedInventoryIds.delete(id);
      });
      this.syncSelectAllCheckbox();
      this.updateBulkBar();
    });

    document.getElementById('bulkEditBtn')?.addEventListener('click', () => this.openBulkEditModal());
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => this.bulkDeleteSelected());
    document.getElementById('bulkSaveBtn')?.addEventListener('click', () => this.saveBulkChanges());

    // Bulk modal delegation
    const bulkBody = document.getElementById('bulkEditBody');

    bulkBody?.addEventListener('input', (e) => {
      const el = e.target.closest('input, textarea');
      if (!el) return;

      const id = el.dataset.id;
      if (!id) return;

      const draft = this.bulkDrafts.get(id) || {};

      if (el.classList.contains('bulk-price')) draft.price = parseInt(el.value, 10) || 0;

      if (el.classList.contains('bulk-discount')) {
        const v = parseInt(el.value, 10);
        draft.discountPercent = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
      }

      if (el.classList.contains('bulk-stock')) draft.stock = parseInt(el.value, 10) || 0;
      if (el.classList.contains('bulk-desc')) draft.description = el.value || '';

      this.bulkDrafts.set(id, draft);
    });

    bulkBody?.addEventListener('change', async (e) => {
      const fileInput = e.target.closest('.bulk-image-input');
      if (!fileInput) return;

      const id = fileInput.dataset.id;
      const file = fileInput.files?.[0];
      if (!id || !file) return;

      const row = fileInput.closest('tr');
      const preview = row?.querySelector('.bulk-image-preview');
      const status = row?.querySelector('.bulk-image-status');
      if (status) status.textContent = 'Загрузка...';

      try {
        const url = await this.uploadToCloudinary(file);
        if (preview) preview.src = url;
        if (status) status.textContent = '✓ Загружено';

        const draft = this.bulkDrafts.get(id) || {};
        draft.imageUrl = url;
        this.bulkDrafts.set(id, draft);

      } catch (err) {
        console.error(err);
        if (status) status.textContent = 'Ошибка';
        UI.showToast('Ошибка загрузки фото', 'error');
      } finally {
        fileInput.value = '';
      }
    });

    // Single edit modal
    document.getElementById('editProductForm')?.addEventListener('submit', (e) => this.handleEditSubmit(e));
    document.getElementById('deleteProductBtn')?.addEventListener('click', () => this.deleteProduct());

    // Edit image upload
    const editUpload = document.getElementById('editImageUpload');
    const editFile = document.getElementById('editImageFile');

    editUpload?.addEventListener('click', () => editFile?.click());

    editFile?.addEventListener('change', async () => {
      const file = editFile.files?.[0];
      if (!file) return;

      const text = document.getElementById('editImageText');
      const preview = document.getElementById('editImagePreview');
      const wrap = document.getElementById('editImagePreviewWrap');

      if (text) text.textContent = 'Загрузка...';

      try {
        const url = await this.uploadToCloudinary(file);
        this._editImageUrl = url;

        if (preview) preview.src = url;
        wrap?.classList.remove('hidden');
        if (text) text.textContent = '✓ Загружено (нажмите, чтобы заменить)';

        UI.showToast('Фото загружено', 'success');
      } catch (err) {
        console.error(err);
        if (text) text.textContent = 'Ошибка загрузки';
        UI.showToast('Ошибка загрузки фото', 'error');
      } finally {
        editFile.value = '';
      }
    });

    // Print (optional)
    document.getElementById('printReceipt')?.addEventListener('click', () => window.print());
  },

  switchTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.admin-content').forEach(c => c.classList.add('hidden'));

    const id = `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
    document.getElementById(id)?.classList.remove('hidden');

    // ensure listeners and render current data
    this.ensureRealtime();

    if (tabName === 'inventory') this.renderInventory(this.inventoryData);
    if (tabName === 'orders') this.renderOrders();
    if (tabName === 'sales') this.renderSales();
    if (tabName === 'cars') this.refreshCarsTab();
  },

  // ==========================================================
  // Cloudinary
  // ==========================================================
  async uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', Config.cloudinary.uploadPreset);
    formData.append('folder', Config.cloudinary.folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${Config.cloudinary.cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Ошибка загрузки в Cloudinary');

    const data = await response.json();
    return data.secure_url;
  },

  // ==========================================================
  // Helpers
  // ==========================================================
  createCarKey(car) {
    const make = String(car?.carMake || '').trim();
    const model = String(car?.carModel || '').trim();

    // ✅ null/undefined => пусто, чтобы не было "null" в ключе
    const year = (car?.year == null || car?.year === '') ? '' : String(car.year).trim();

    const body = String(car?.bodyType || '').trim();
    const rest = car?.restyling ? '1' : '0';

    return [make, model, year, body, rest].join('|').toLowerCase();
  },

  getTsMillis(obj) {
    const ts = obj?.updatedAt || obj?.createdAt || obj?.date || null;
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    return 0;
  },

  // ==========================================================
  // FIX: Suggested price (wizard)
  // ==========================================================
  findSuggestedPrice(partName, condition = 'used') {
    const car = this.wizardState?.carData || {};

    // 1) Try the most accurate way: inventoryKey
    let key = '';
    try {
      key = Utils.createInventoryKey({
        partName,
        condition,
        carMake: car.carMake,
        carModel: car.carModel,
        year: car.year,
        bodyType: car.bodyType,
        restyling: !!car.restyling
      });
    } catch (e) {
      key = '';
    }

    const norm = (s) => String(s || '').trim().toLowerCase();

    const sameExact = this.inventoryData.filter(i => {
      const price = Number(i.price || 0);
      if (!(price > 0)) return false;

      // new docs: inventoryKey match
      if (key && i.inventoryKey && i.inventoryKey === key) return true;

      // legacy fallback for old docs without inventoryKey
      return (
        norm(i.partName) === norm(partName) &&
        (i.condition || 'used') === condition &&
        norm(i.carMake) === norm(car.carMake) &&
        norm(i.carModel) === norm(car.carModel) &&
        Number(i.year || 0) === Number(car.year || 0) &&
        norm(i.bodyType) === norm(car.bodyType) &&
        !!i.restyling === !!car.restyling
      );
    });

    // 2) If not found for this car — fallback to any car (same part+condition)
    const fallbackAnyCar = this.inventoryData.filter(i => {
      const price = Number(i.price || 0);
      if (!(price > 0)) return false;
      return norm(i.partName) === norm(partName) && (i.condition || 'used') === condition;
    });

    const candidates = (sameExact.length ? sameExact : fallbackAnyCar)
      .map(x => Number(x.price || 0))
      .filter(p => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);

    if (!candidates.length) return null;

    // 3) Median is more stable than average
    const mid = Math.floor(candidates.length / 2);
    const median = (candidates.length % 2)
      ? candidates[mid]
      : Math.round((candidates[mid - 1] + candidates[mid]) / 2);

    // 4) Round to "nice" step
    const step = 50;
    return Math.max(0, Math.round(median / step) * step);
  },

  // ==========================================================
  // Inventory selection/bulk
  // ==========================================================
  cleanupSelection() {
    const set = new Set(this.inventoryData.map(i => i.id));
    for (const id of Array.from(this.selectedInventoryIds)) {
      if (!set.has(id)) this.selectedInventoryIds.delete(id);
    }
    this.syncSelectAllCheckbox();
    this.updateBulkBar();
  },

  syncSelectAllCheckbox() {
    const selectAll = document.getElementById('inventorySelectAll');
    if (!selectAll) return;

    const rowCbs = Array.from(document.querySelectorAll('#inventoryBody .inv-select'));
    if (!rowCbs.length) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }

    const checkedCount = rowCbs.filter(cb => cb.checked).length;
    selectAll.checked = checkedCount === rowCbs.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < rowCbs.length;
  },

  updateBulkBar() {
    const bar = document.getElementById('inventoryBulkBar');
    const countEl = document.getElementById('bulkSelectedCount');
    if (!bar || !countEl) return;

    const n = this.selectedInventoryIds.size;
    countEl.textContent = String(n);
    bar.classList.toggle('hidden', n === 0);
  },

  clearSelectionUI() {
    this.selectedInventoryIds.clear();
    document.querySelectorAll('#inventoryBody .inv-select').forEach(cb => cb.checked = false);

    const selectAll = document.getElementById('inventorySelectAll');
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }

    this.updateBulkBar();
  },

  openBulkEditModal() {
    const ids = Array.from(this.selectedInventoryIds);
    if (!ids.length) {
      UI.showToast('Не выбрано ни одного товара', 'warning');
      return;
    }

    const body = document.getElementById('bulkEditBody');
    const count = document.getElementById('bulkEditSelectedCount');
    if (count) count.textContent = String(ids.length);

    this.bulkDrafts = new Map();

    const rows = ids.map((id) => {
      const item = this.inventoryData.find(x => x.id === id);
      if (!item) return '';

      this.bulkDrafts.set(id, {
        price: item.price || 0,
        discountPercent: item.discountPercent ?? 0, // ✅
        stock: item.stock || 0,
        description: item.description || '',
        imageUrl: item.imageUrl || ''
      });

      const img = item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';

      return `
        <tr>
          <td class="bulk-td-id">${Utils.escapeHtml(id.slice(-8))}</td>
          <td class="bulk-td-name">
            <div class="bulk-name">${Utils.escapeHtml(item.partName || '')}</div>
            <div class="bulk-sub muted">${Utils.escapeHtml(Utils.formatCarName(item))} • ${item.condition === 'new' ? 'Новое' : 'Б/У'}</div>
          </td>
          <td class="bulk-td-img">
            <img class="bulk-image-preview" src="${img}" alt="">
            <div class="bulk-image-actions">
              <input class="bulk-image-input" data-id="${id}" type="file" accept="image/*">
              <div class="bulk-image-status muted">—</div>
            </div>
          </td>
          <td><input class="form-input bulk-price" data-id="${id}" type="number" min="0" value="${item.price || 0}"></td>
          <td><input class="form-input bulk-discount" data-id="${id}" type="number" min="0" max="100" value="${item.discountPercent ?? 0}"></td>
          <td><input class="form-input bulk-stock" data-id="${id}" type="number" min="0" value="${item.stock || 0}"></td>
          <td><textarea class="form-textarea bulk-desc" data-id="${id}" rows="2">${Utils.escapeHtml(item.description || '')}</textarea></td>
        </tr>
      `;
    }).join('');

    if (body) body.innerHTML = rows;

    UI.openModal('bulkEditModal');
  },

  async saveBulkChanges() {
    const ids = Array.from(this.selectedInventoryIds);
    if (!ids.length) return;

    const btn = document.getElementById('bulkSaveBtn');
    const oldText = btn?.textContent || 'Сохранить изменения';
    if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем...'; }

    try {
      const db = firebase.firestore();
      const batch = db.batch();

      for (const id of ids) {
        const draft = this.bulkDrafts.get(id);
        if (!draft) continue;

        const discountRaw = parseInt(draft.discountPercent, 10);
        const discountPercent = Number.isFinite(discountRaw) ? Math.min(100, Math.max(0, discountRaw)) : 0;

        batch.update(db.collection('inventory').doc(id), {
          price: parseInt(draft.price, 10) || 0,
          discountPercent, // ✅
          stock: parseInt(draft.stock, 10) || 0,
          description: String(draft.description || ''),
          imageUrl: String(draft.imageUrl || ''),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      await batch.commit();

      UI.showToast('Изменения сохранены', 'success');
      UI.closeModal('bulkEditModal');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка сохранения', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  },

  async bulkDeleteSelected() {
    const ids = Array.from(this.selectedInventoryIds);
    if (!ids.length) return;

    const ok = await UI.confirm('Массовое удаление', `Удалить выбранные товары (${ids.length})?`);
    if (!ok) return;

    const btn = document.getElementById('bulkDeleteBtn');
    const oldText = btn?.textContent || 'Удалить выбранные';
    if (btn) { btn.disabled = true; btn.textContent = 'Удаляем...'; }

    try {
      const db = firebase.firestore();
      const batch = db.batch();

      ids.forEach(id => batch.delete(db.collection('inventory').doc(id)));

      await batch.commit();

      UI.showToast(`Удалено: ${ids.length}`, 'success');
      this.clearSelectionUI();
      UI.closeModal('bulkEditModal');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка удаления', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  },

  // ==========================================================
  // Inventory render (with selection checkbox column)
  // ==========================================================
  renderInventory(items) {
    const tbody = document.getElementById('inventoryBody');
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;padding:2rem;color:var(--color-text-secondary);">
            Склад пуст
          </td>
        </tr>
      `;
      this.clearSelectionUI();
      return;
    }

    tbody.innerHTML = items.map(item => {
      const imageUrl = item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';
      const conditionText = item.condition === 'new' ? 'Новое' : 'Б/У';
      const stock = item.stock || 0;

      const stockStyle = stock <= 2 ? 'style="color: var(--warn)"' : '';
      const checked = this.selectedInventoryIds.has(item.id) ? 'checked' : '';

      const priceOriginal = Utils.getPriceOriginal(item);
      const disc = Utils.getDiscountPercent(item);
      const priceFinal = Utils.getPriceFinal({ priceOriginal, discountPercent: disc });

      const priceHtml = (disc > 0 && priceFinal < priceOriginal)
        ? `<span class="price-old">${Utils.formatPrice(priceOriginal)}</span> <span class="price-new">${Utils.formatPrice(priceFinal)}</span><div class="muted" style="font-size:12px;">-${disc}%</div>`
        : `<span class="price-new">${Utils.formatPrice(priceOriginal)}</span>`;

      return `
        <tr data-id="${item.id}">
          <td class="inv-td-select">
            <input class="inv-select" type="checkbox" data-id="${item.id}" ${checked}>
          </td>
          <td><img src="${imageUrl}" alt="" class="inventory-table__image"></td>
          <td>${Utils.escapeHtml(item.partName || '')}</td>
          <td>${Utils.escapeHtml(Utils.formatCarName(item))}</td>
          <td>${conditionText}</td>
          <td>${priceHtml}</td>
          <td ${stockStyle}>${stock}</td>
          <td class="inventory-table__actions">
            <button class="btn btn--sm btn--secondary inv-edit" type="button" data-id="${item.id}">✎</button>
          </td>
        </tr>
      `;
    }).join('');

    this.syncSelectAllCheckbox();
    this.updateBulkBar();
  },

  async copyPhone(phone) {
    const p = String(phone || '').trim();
    if (!p) return;

    try {
      await navigator.clipboard.writeText(p);
      UI.showToast('Телефон скопирован', 'success');
    } catch (e) {
      // fallback
      try {
        window.prompt('Скопируйте телефон:', p);
      } catch (_) { }
    }
  },

  filterInventory(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = this.inventoryData.filter(item =>
      (item.partName || '').toLowerCase().includes(q) ||
      (item.carMake || '').toLowerCase().includes(q) ||
      (item.carModel || '').toLowerCase().includes(q)
    );
    this.renderInventory(filtered);
  },

  sortInventory(sortBy) {
    const sorted = [...this.inventoryData];

    if (sortBy === 'stock_asc') sorted.sort((a, b) => (a.stock || 0) - (b.stock || 0));
    if (sortBy === 'stock_desc') sorted.sort((a, b) => (b.stock || 0) - (a.stock || 0));
    if (sortBy === 'name_asc') sorted.sort((a, b) => (a.partName || '').localeCompare(b.partName || ''));
    if (sortBy === 'price_asc') sorted.sort((a, b) => (a.price || 0) - (b.price || 0));

    this.renderInventory(sorted);
  },

  // ==========================================================
  // Single inventory edit (with photo)
  // ==========================================================
  editProduct(productId) {
    const product = this.inventoryData.find(p => p.id === productId);
    if (!product) return;

    this.editingProduct = product;
    this._editImageUrl = null;

    document.getElementById('editProductId').value = product.id;
    document.getElementById('editCustomTitle').value = product.customTitle || '';
    document.getElementById('editDiscountPercent').value = product.discountPercent ?? 0; // ✅
    document.getElementById('editPrice').value = product.price ?? 0;
    document.getElementById('editStock').value = product.stock ?? 0;
    document.getElementById('editDescription').value = product.description || '';

    const preview = document.getElementById('editImagePreview');
    const wrap = document.getElementById('editImagePreviewWrap');
    const text = document.getElementById('editImageText');

    if (product.imageUrl) {
      if (preview) preview.src = product.imageUrl;
      wrap?.classList.remove('hidden');
      if (text) text.textContent = 'Нажмите, чтобы заменить';
    } else {
      if (preview) preview.src = '';
      wrap?.classList.add('hidden');
      if (text) text.textContent = 'Нажмите, чтобы загрузить';
    }

    UI.openModal('editProductModal');
  },

  async handleEditSubmit(e) {
    e.preventDefault();

    const productId = document.getElementById('editProductId').value;

    const customTitle = (document.getElementById('editCustomTitle')?.value || '').trim();

    const discountRaw = parseInt(document.getElementById('editDiscountPercent')?.value, 10);
    const discountPercent = Number.isFinite(discountRaw) ? Math.min(100, Math.max(0, discountRaw)) : 0;

    const price = parseInt(document.getElementById('editPrice').value, 10);
    const stock = parseInt(document.getElementById('editStock').value, 10);
    const description = (document.getElementById('editDescription').value || '').trim();

    const patch = {
      customTitle,
      discountPercent, // ✅
      price: Number.isFinite(price) ? price : 0,
      stock: Number.isFinite(stock) ? stock : 0,
      description,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (this._editImageUrl) {
      patch.imageUrl = this._editImageUrl;
    }

    try {
      await firebase.firestore().collection('inventory').doc(productId).update(patch);
      UI.showToast('Товар обновлен', 'success');
      UI.closeModal('editProductModal');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка при обновлении', 'error');
    }
  },

  async deleteProduct() {
    if (!this.editingProduct) return;

    const confirmed = await UI.confirm('Удаление товара', `Удалить "${this.editingProduct.partName}"?`);
    if (!confirmed) return;

    try {
      await firebase.firestore().collection('inventory').doc(this.editingProduct.id).delete();
      UI.showToast('Товар удален', 'success');
      UI.closeModal('editProductModal');

      this.selectedInventoryIds.delete(this.editingProduct.id);
      this.cleanupSelection();
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка при удалении', 'error');
    }
  },

  // ==========================================================
  // Orders
  // ==========================================================
  renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;

    if (!this.ordersData.length) {
      container.innerHTML = `<div class="empty-state"><p>Нет активных бронирований</p></div>`;
      return;
    }

    container.innerHTML = this.ordersData.map(order => {
      const statusInfo = Config.orderStatuses?.[order.status] || { label: order.status, class: 'active' };
      const total = (order.items || []).reduce((s, i) => s + (i.priceFinal ?? i.price ?? 0), 0);

      const phone = order.userPhone ? String(order.userPhone) : '';

      const phoneHtml = phone
        ? `
        <div class="order-card__user" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <strong>Телефон:</strong>
          <a href="tel:${Utils.escapeHtml(phone)}">${Utils.escapeHtml(phone)}</a>
          <button class="btn btn--sm btn--secondary" type="button" onclick="Admin.copyPhone('${Utils.escapeHtml(phone)}')">
            Копировать
          </button>
        </div>
      `
        : `
        <div class="order-card__user">
          <strong>Телефон:</strong> <span class="muted">—</span>
        </div>
      `;

      return `
      <div class="order-card" data-order-id="${order.id}">
        <div class="order-card__header">
          <div>
            <span class="order-card__id">Заказ #${Utils.escapeHtml(order.orderNumber || order.id.slice(-8))}</span>
            <span class="order-card__date">${Utils.formatDate(order.date || order.createdAt || null, true)}</span>
          </div>
          <span class="order-card__status order-card__status--${statusInfo.class}">${statusInfo.label}</span>
        </div>

        <div class="order-card__user">
          <strong>Клиент:</strong> ${Utils.escapeHtml(order.userName || order.userEmail || 'Неизвестно')}
        </div>

        ${phoneHtml}

        <div class="order-card__items">
          ${(order.items || []).map(item => `
            <div class="order-item">
              <span>${Utils.escapeHtml(item.title || item.customTitle || item.partName)}</span>
              <span>${Utils.formatPrice(item.priceFinal ?? item.price ?? 0)}</span>
            </div>
          `).join('')}
        </div>

        <div class="order-card__total">
          <span>Итого:</span>
          <span>${Utils.formatPrice(total)}</span>
        </div>

        <div class="order-card__actions">
          ${order.status === 'active' ? `
            <button class="btn btn--sm btn--secondary" type="button" onclick="Admin.updateOrderStatus('${order.id}','ready')">
              Готов к выдаче
            </button>
          ` : ''}

          <button class="btn btn--sm btn--success" type="button" onclick="Admin.completeOrder('${order.id}')">Продать</button>
          <button class="btn btn--sm btn--danger" type="button" onclick="Admin.cancelOrder('${order.id}')">Отменить</button>
        </div>
      </div>
    `;
    }).join('');
  },

  async updateOrderStatus(orderId, newStatus) {
    try {
      await firebase.firestore().collection('orders').doc(orderId).update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      UI.showToast('Статус обновлен', 'success');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка', 'error');
    }
  },

  async completeOrder(orderId) {
    const order = this.ordersData.find(o => o.id === orderId);
    if (!order) return;

    const ok = await UI.confirm('Продажа', 'Подтвердить продажу и распечатать чек?');
    if (!ok) return;

    try {
      const db = firebase.firestore();
      const batch = db.batch();

      batch.update(db.collection('orders').doc(orderId), {
        status: 'completed',
        completedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      const saleRef = db.collection('sales').doc();
      batch.set(saleRef, {
        ...order,
        orderId,
        status: 'completed',
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();

      const items = (order.items || []).map(x => ({
        partName: x.title || x.customTitle || x.partName,
        price: x.priceFinal ?? x.price ?? 0
      }));
      const total = items.reduce((s, x) => s + (x.price || 0), 0);

      if (typeof UI.printReceipt === 'function') {
        UI.printReceipt({
          title: 'Чек продажи',
          orderNumber: order.orderNumber || orderId.slice(-8),
          userName: order.userName || order.userEmail || '—',
          userPhone: order.userPhone || '', // ✅

          items: (order.items || []).map(x => ({
            partName: x.title || x.customTitle || x.partName,
            qty: 1,
            priceFinal: x.priceFinal ?? x.price ?? 0,
            priceOriginal: x.priceOriginal ?? x.priceFinal ?? x.price ?? 0,
            discountPercent: x.discountPercent ?? 0
          })),

          total: (order.items || []).reduce((s, x) => s + (x.priceFinal ?? x.price ?? 0), 0),
          date: Utils.formatDate(new Date(), true),

          companyName: 'AutoParts',
          footerNote: 'Спасибо за покупку!'
        });
      }

      UI.showToast('Продажа оформлена', 'success');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка при продаже', 'error');
    }
  },

  async cancelOrder(orderId) {
    const order = this.ordersData.find(o => o.id === orderId);
    if (!order) return;

    const ok = await UI.confirm('Отмена брони', 'Отменить бронь и вернуть товары на склад?');
    if (!ok) return;

    try {
      const db = firebase.firestore();
      const batch = db.batch();

      batch.update(db.collection('orders').doc(orderId), {
        status: 'cancelled',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
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
      UI.showToast('Бронь отменена', 'success');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка', 'error');
    }
  },

  // ==========================================================
  // Sales
  // ==========================================================
  renderSales() {
    const container = document.getElementById('salesList');
    if (!container) return;

    if (!this.salesData.length) {
      container.innerHTML = `<div class="empty-state"><p>Нет завершенных продаж</p></div>`;
      return;
    }

    container.innerHTML = this.salesData.map(sale => {
      const items = sale.items || [];
      const total = items.reduce((s, i) => s + (i.priceFinal ?? i.price ?? 0), 0);
      const orderNo = sale.orderNumber || sale.orderId?.slice(-8) || sale.id.slice(-8);

      return `
        <div class="order-card" data-sale-id="${sale.id}">
          <div class="order-card__header">
            <div>
              <span class="order-card__id">Заказ #${Utils.escapeHtml(orderNo)}</span>
              <span class="order-card__date">${Utils.formatDate(sale.completedAt, true)}</span>
            </div>
            <span class="order-card__status order-card__status--completed">Завершён</span>
          </div>

          <div class="order-card__user">
            <strong>Клиент:</strong> ${Utils.escapeHtml(sale.userName || sale.userEmail || 'Неизвестно')}
          </div>

          <div class="order-card__items">
            ${items.map(item => `
              <div class="order-item">
                <span>${Utils.escapeHtml(item.title || item.customTitle || item.partName)}</span>
                <span>${Utils.formatPrice(item.priceFinal ?? item.price ?? 0)}</span>
              </div>
            `).join('')}
          </div>

          <div class="order-card__total">
            <span>Итого:</span>
            <span>${Utils.formatPrice(total)}</span>
          </div>

          <div class="order-card__actions">
            <button class="btn btn--sm btn--secondary" type="button" onclick="Admin.printSaleReceipt('${sale.id}')">Печать чека</button>
          </div>
        </div>
      `;
    }).join('');
  },

  printSaleReceipt(saleId) {
    const sale = this.salesData.find(s => s.id === saleId);
    if (!sale) return UI.showToast('Продажа не найдена', 'error');

    const items = (sale.items || []).map(x => ({
      partName: x.title || x.customTitle || x.partName,
      price: x.priceFinal ?? x.price ?? 0
    }));
    const total = items.reduce((s, x) => s + (x.price || 0), 0);

    if (typeof UI.printReceipt === 'function') {
      UI.printReceipt({
        title: 'Чек продажи',
        orderNumber: sale.orderNumber || sale.orderId?.slice(-8) || sale.id.slice(-8),
        userName: sale.userName || sale.userEmail || '—',
        userPhone: sale.userPhone || '',

        items: (sale.items || []).map(x => ({
          partName: x.title || x.customTitle || x.partName,
          qty: 1,
          priceFinal: x.priceFinal ?? x.price ?? 0,
          priceOriginal: x.priceOriginal ?? x.priceFinal ?? x.price ?? 0,
          discountPercent: x.discountPercent ?? 0
        })),

        total: (sale.items || []).reduce((s, x) => s + (x.priceFinal ?? x.price ?? 0), 0),
        date: Utils.formatDate(sale.completedAt || new Date(), true),

        companyName: 'AutoParts',
        footerNote: 'Спасибо за покупку!'
      });
    }
  },

  // ==========================================================
  // Cars tab
  // ==========================================================
  buildCarsFromInventory() {
    const map = new Map();

    for (const item of this.inventoryData) {
      const carKey = item.carKey || this.createCarKey(item);

      if (!map.has(carKey)) {
        map.set(carKey, {
          carKey,
          carMake: item.carMake,
          carModel: item.carModel,
          year: item.year,
          bodyType: item.bodyType,
          restyling: !!item.restyling,
          updatedAt: item.updatedAt || item.createdAt || null,
          parts: []
        });
      }

      const car = map.get(carKey);

      const itemTs = this.getTsMillis(item);
      const carTs = car.updatedAt?.toMillis?.() ? car.updatedAt.toMillis() : 0;
      if (itemTs > carTs) car.updatedAt = item.updatedAt || item.createdAt;

      if ((item.stock || 0) > 0) {
        car.parts.push({
          partName: item.partName,
          condition: item.condition,
          stock: item.stock,
          price: item.price
        });
      }
    }

    for (const car of map.values()) {
      car.parts.sort((a, b) => (a.partName || '').localeCompare(b.partName || ''));
    }

    return Array.from(map.values());
  },

  refreshCarsTab() {
    const search = (document.getElementById('carsSearch')?.value || '').toLowerCase().trim();
    const sort = document.getElementById('carsSort')?.value || 'updated_desc';

    let cars = this.buildCarsFromInventory();

    if (search) {
      cars = cars.filter(c => {
        const s = `${c.carMake} ${c.carModel} ${c.year} ${c.bodyType} ${c.restyling ? 'restyling' : ''}`.toLowerCase();
        return s.includes(search);
      });
    }

    if (sort === 'name_asc') {
      cars.sort((a, b) => `${a.carMake} ${a.carModel}`.localeCompare(`${b.carMake} ${b.carModel}`));
    } else if (sort === 'parts_desc') {
      cars.sort((a, b) => (b.parts.length - a.parts.length));
    } else {
      cars.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    }

    this.renderCars(cars);
  },

  renderCars(cars) {
    const el = document.getElementById('carsList');
    if (!el) return;

    if (!cars.length) {
      el.innerHTML = `<div class="empty-state"><p>Нет добавленных авто</p></div>`;
      return;
    }

    el.innerHTML = cars.map(car => {
      const yearLabel = (car.year == null || car.year === '') ? '' : ` (${car.year})`;
      const title = `${car.carMake} ${car.carModel}${yearLabel}`;
      const meta = `${Utils.getBodyTypeName(car.bodyType)}${car.restyling ? ' • рестайлинг' : ''}`;

      const totalStock = car.parts.reduce((s, p) => s + (p.stock || 0), 0);
      const partsCount = car.parts.length;
      const updated = car.updatedAt ? Utils.formatDate(car.updatedAt, true) : '—';

      const partsHtml = partsCount
        ? `
          <div class="car-parts-grid">
            ${car.parts.map(p => `
              <div class="car-part">
                <div>
                  <div class="car-part__name">${Utils.escapeHtml(p.partName)}</div>
                  <div class="car-part__sub">${p.condition === 'new' ? 'Новое' : 'Б/У'} • Остаток: ${p.stock}</div>
                </div>
                <div class="car-part__chips">
                  <span class="chip ${p.condition === 'new' ? 'chip--ok' : 'chip--warn'}">${p.condition === 'new' ? 'NEW' : 'USED'}</span>
                  <span class="chip chip--accent">${Utils.formatPrice(p.price || 0)}</span>
                  <span class="chip">x${p.stock || 0}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `
        : `<div class="muted">Нет запчастей в наличии</div>`;

      return `
        <details class="car-card">
          <summary>
            <div class="car-card__summary">
              <div class="car-card__left">
                <div class="car-card__title">${Utils.escapeHtml(title)}</div>
                <div class="car-card__meta">${Utils.escapeHtml(meta)}</div>
                <div class="muted" style="font-size:12px;margin-top:4px;">Обновление склада: ${Utils.escapeHtml(updated)}</div>
              </div>

              <div class="car-card__right">
                <span class="chip">Позиций: ${partsCount}</span>
                <span class="chip">Всего шт.: ${totalStock}</span>
                <span class="car-card__toggle">⌄</span>
              </div>
            </div>
          </summary>

          <div class="car-card__body">
            ${partsHtml}
          </div>
        </details>
      `;
    }).join('');
  },

  // ==========================================================
  // Wizard add car
  // ==========================================================
  initCarMakesSelect() {
    const select = document.getElementById('carMake');
    if (!select) return;

    if (!this._carMakeSelectBound) {
      select.addEventListener('change', (e) => {
        if (e.target.value === '__custom__') {
          const customMake = prompt('Введите название марки:');
          if (customMake && customMake.trim()) {
            const option = document.createElement('option');
            option.value = customMake.trim();
            option.textContent = customMake.trim();
            option.selected = true;
            select.insertBefore(option, select.lastElementChild);
          } else {
            select.value = '';
          }
        }
      });
      this._carMakeSelectBound = true;
    }

    UI.populateMakesSelect(select, false);
    select.innerHTML = '<option value="">Выберите марку</option>' + select.innerHTML;

    const hasCustom = Array.from(select.options).some(o => o.value === '__custom__');
    if (!hasCustom) {
      const custom = document.createElement('option');
      custom.value = '__custom__';
      custom.textContent = '+ Добавить свою марку';
      select.appendChild(custom);
    }
  },

  renderPartsCategories() {
    const container = document.getElementById('partsCategories');
    if (!container) return;

    container.innerHTML = Object.entries(Config.partsCategories).map(([category, parts]) => {
      return `
        <div class="parts-category" data-category="${Utils.escapeHtml(category)}">
          <h4 class="parts-category__title">${Utils.escapeHtml(category)}</h4>
          <div class="parts-list">
            ${parts.map(part => `
              <label class="part-item" data-part="${Utils.escapeHtml(part)}">
                <input type="checkbox" value="${Utils.escapeHtml(part)}">
                <span class="checkbox-custom"></span>
                <span class="part-name">${Utils.escapeHtml(part)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => this.updateSelectedParts());
    });
  },

  filterParts(query) {
    const q = (query || '').toLowerCase().trim();

    document.querySelectorAll('.part-item').forEach(item => {
      const name = (item.dataset.part || '').toLowerCase();
      item.style.display = name.includes(q) ? '' : 'none';
    });

    document.querySelectorAll('.parts-category').forEach(categoryEl => {
      const items = Array.from(categoryEl.querySelectorAll('.part-item'));
      const anyVisible = items.some(i => i.style.display !== 'none');
      categoryEl.style.display = anyVisible ? '' : 'none';
    });
  },

  updateSelectedParts() {
    const set = new Set();
    document.querySelectorAll('#partsCategories input[type="checkbox"]:checked')
      .forEach(cb => set.add(cb.value));

    this.wizardState.selectedParts = Array.from(set);

    const countEl = document.getElementById('selectedPartsCount');
    if (countEl) countEl.textContent = this.wizardState.selectedParts.length;

    const nextBtn = document.getElementById('wizardNext2');
    if (nextBtn) nextBtn.disabled = this.wizardState.selectedParts.length === 0;
  },

  handleCarInfoSubmit(e) {
    e.preventDefault();

    const yearRaw = (document.getElementById('carYear')?.value || '').trim();
    const yearParsed = yearRaw ? parseInt(yearRaw, 10) : null;
    const year = Number.isFinite(yearParsed) ? yearParsed : null;

    this.wizardState.carData = {
      carMake: document.getElementById('carMake')?.value || '',
      carModel: (document.getElementById('carModel')?.value || '').trim(),
      year, // ✅ теперь может быть null
      bodyType: document.getElementById('carBody')?.value || '',
      restyling: !!document.getElementById('carRestyling')?.checked
    };

    const c = this.wizardState.carData;

    // ✅ Year больше НЕ обязательный
    if (!c.carMake || !c.carModel || !c.bodyType) {
      UI.showToast('Заполните все обязательные поля', 'error');
      return;
    }

    this.goToStep(2);
  },

  goToStep(step) {
    this.wizardState.step = step;

    document.querySelectorAll('.wizard-step').forEach(stepEl => {
      const stepNum = parseInt(stepEl.dataset.step, 10);
      stepEl.classList.remove('active', 'completed');
      if (stepNum === step) stepEl.classList.add('active');
      if (stepNum < step) stepEl.classList.add('completed');
    });

    document.querySelectorAll('.wizard-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById(`wizardStep${step}`)?.classList.add('active');

    if (step === 3) this.renderPartsDetails();
  },

  renderPartsDetails() {
    const container = document.getElementById('partsDetails');
    if (!container) return;

    this.priceTouched = new Set();

    const uniqueParts = Array.from(new Set(this.wizardState.selectedParts));

    container.innerHTML = uniqueParts.map((partName) => {
      const existing = this.wizardState.partsDetails[partName] || {};
      const condition = existing.condition || 'used';

      const suggestedPrice = (existing.price && existing.price > 0)
        ? null
        : this.findSuggestedPrice(partName, condition);

      const priceValue = (existing.price && existing.price > 0)
        ? existing.price
        : (suggestedPrice ?? '');

      const imageUrl = existing.imageUrl || '';
      const customTitle = existing.customTitle || '';

      return `
        <div class="part-detail-card" data-part="${Utils.escapeHtml(partName)}">
          <div class="part-detail-card__header">
            <h4 class="part-detail-card__title">${Utils.escapeHtml(partName)}</h4>
            <button type="button" class="part-detail-card__remove" data-remove="${Utils.escapeHtml(partName)}">✕</button>
          </div>

          <div class="form-group">
            <label class="form-label">Кастомное название (опционально)</label>
            <input type="text" class="form-input part-custom-title"
              data-part="${Utils.escapeHtml(partName)}"
              value="${Utils.escapeHtml(customTitle)}"
              placeholder="Например: Двигатель Toyota Camry 2.4 (контрактный)">
            <div class="muted" style="font-size:12px;">
              Если заполнено — на сайте будет показано оно. Если пусто — заголовок соберётся автоматически: “${Utils.escapeHtml(partName)} + Марка + Модель”.
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Цена (₽) *</label>
              <input type="number" class="form-input part-price"
                data-part="${Utils.escapeHtml(partName)}"
                value="${priceValue}"
                min="0" required>
              ${suggestedPrice != null ? `<div class="muted" style="font-size:12px;">Автоподставлено по складу</div>` : ''}
            </div>

            <div class="form-group">
              <label class="form-label">Состояние *</label>
              <select class="form-select part-condition" data-part="${Utils.escapeHtml(partName)}">
                <option value="used" ${condition === 'used' ? 'selected' : ''}>Б/У</option>
                <option value="new" ${condition === 'new' ? 'selected' : ''}>Новое</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Описание (опционально)</label>
            <textarea class="form-textarea part-description"
              data-part="${Utils.escapeHtml(partName)}"
              rows="2"
              placeholder="Дополнительная информация о состоянии...">${Utils.escapeHtml(existing.description || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Фото</label>
            <div class="image-upload" data-part="${Utils.escapeHtml(partName)}">
              ${imageUrl
          ? `<div class="image-upload__preview"><img src="${imageUrl}" alt="${Utils.escapeHtml(partName)}"></div>
                   <div class="image-upload__text">Нажмите, чтобы заменить</div>`
          : `<div class="image-upload__icon">📷</div>
                   <div class="image-upload__text">Перетащите фото или кликните для выбора</div>`
        }
              <input type="file" accept="image/*" class="part-image" data-part="${Utils.escapeHtml(partName)}">
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.bindPartDetailEvents();
    this.collectPartDetails();
  },

  bindPartDetailEvents() {
    document.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const partName = e.currentTarget.dataset.remove;
        this.removePart(partName);
      });
    });

    document.querySelectorAll('.image-upload').forEach(uploadEl => {
      const partName = uploadEl.dataset.part;

      uploadEl.addEventListener('click', () => {
        const input = uploadEl.querySelector('input[type="file"]');
        input?.click();
      });

      uploadEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadEl.classList.add('dragover');
      });

      uploadEl.addEventListener('dragleave', () => uploadEl.classList.remove('dragover'));

      uploadEl.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadEl.classList.remove('dragover');
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
          this.handleWizardImageUpload(partName, file, uploadEl);
        }
      });

      uploadEl.querySelector('input[type="file"]')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.handleWizardImageUpload(partName, file, uploadEl);
      });
    });

    // ✅ Цена: помечаем как "трогали руками" (чтобы автоподстановка не перетёрла)
    document.querySelectorAll('.part-price').forEach(inp => {
      inp.addEventListener('input', () => {
        this.priceTouched.add(inp.dataset.part);
      });
    });

    // ✅ Смена состояния: если цену не трогали, можно автоподставить
    document.querySelectorAll('.part-condition').forEach(sel => {
      sel.addEventListener('change', () => {
        const partName = sel.dataset.part;

        if (!this.priceTouched.has(partName)) {
          const suggested = this.findSuggestedPrice(partName, sel.value);
          if (suggested != null) {
            const card = sel.closest('.part-detail-card');
            const priceInput = card?.querySelector('.part-price');
            if (priceInput) priceInput.value = suggested;
          }
        }

        this.collectPartDetails();
      });
    });

    // ✅ Кастомное название
    document.querySelectorAll('.part-custom-title').forEach(input => {
      input.addEventListener('change', () => this.collectPartDetails());
      input.addEventListener('input', Utils.debounce(() => this.collectPartDetails(), 200));
    });

    // ✅ Описание и цена (как было)
    document.querySelectorAll('.part-price, .part-description').forEach(input => {
      input.addEventListener('change', () => this.collectPartDetails());
      input.addEventListener('input', Utils.debounce(() => this.collectPartDetails(), 200));
    });
  },

  removePart(partName) {
    this.wizardState.selectedParts = this.wizardState.selectedParts.filter(p => p !== partName);

    document.querySelectorAll(`#partsCategories input[type="checkbox"][value="${CSS.escape(partName)}"]`)
      .forEach(cb => { cb.checked = false; });

    document.querySelector(`.part-detail-card[data-part="${CSS.escape(partName)}"]`)?.remove();
    delete this.wizardState.partsDetails[partName];

    this.updateSelectedParts();

    if (this.wizardState.selectedParts.length === 0) {
      this.goToStep(2);
    }
  },

  async handleWizardImageUpload(partName, file, uploadEl) {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadEl.innerHTML = `
        <div class="image-upload__preview">
          <img src="${e.target.result}" alt="${Utils.escapeHtml(partName)}">
        </div>
        <div class="image-upload__text">Загрузка...</div>
        <input type="file" accept="image/*" class="part-image" data-part="${Utils.escapeHtml(partName)}">
      `;
    };
    reader.readAsDataURL(file);

    try {
      const imageUrl = await this.uploadToCloudinary(file);

      if (!this.wizardState.partsDetails[partName]) this.wizardState.partsDetails[partName] = {};
      this.wizardState.partsDetails[partName].imageUrl = imageUrl;

      uploadEl.innerHTML = `
        <div class="image-upload__preview">
          <img src="${imageUrl}" alt="${Utils.escapeHtml(partName)}">
        </div>
        <div class="image-upload__text">✓ Загружено (нажмите, чтобы заменить)</div>
        <input type="file" accept="image/*" class="part-image" data-part="${Utils.escapeHtml(partName)}">
      `;

      uploadEl.querySelector('input[type="file"]')?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) this.handleWizardImageUpload(partName, f, uploadEl);
      });

      UI.showToast('Фото загружено', 'success');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка загрузки фото', 'error');
    }
  },

  collectPartDetails() {
    document.querySelectorAll('.part-detail-card').forEach(card => {
      const partName = card.dataset.part;

      const prev = this.wizardState.partsDetails[partName] || {};

      this.wizardState.partsDetails[partName] = {
        customTitle: (card.querySelector('.part-custom-title')?.value || '').trim(),
        price: parseInt(card.querySelector('.part-price')?.value, 10) || 0,
        condition: card.querySelector('.part-condition')?.value || 'used',
        description: (card.querySelector('.part-description')?.value || '').trim(),
        imageUrl: prev.imageUrl || '' // ✅ не теряем, если уже загружено
      };
    });
  },

  async findByInventoryKeyOrCarKey(db, inventoryKey, carKey, productData) {
    // 1) New docs by inventoryKey
    const q = await db.collection('inventory')
      .where('inventoryKey', '==', inventoryKey)
      .limit(1)
      .get();

    if (!q.empty) {
      const doc = q.docs[0];
      return { ref: doc.ref, data: doc.data() };
    }

    // 2) Legacy fallback: single-field query by carKey (no composite index), then filter in client
    // carKey may not exist in old docs -> if empty, fallback to carMake only (still single where)
    if (carKey) {
      const q2 = await db.collection('inventory').where('carKey', '==', carKey).get();
      const found = q2.docs.find(d => {
        const x = d.data();
        return x.partName === productData.partName
          && x.condition === productData.condition
          && x.carMake === productData.carMake
          && x.carModel === productData.carModel
          && x.year === productData.year
          && x.bodyType === productData.bodyType
          && !!x.restyling === !!productData.restyling;
      });

      if (found) return { ref: found.ref, data: found.data(), legacy: true };
    }

    return null;
  },

  async saveAllParts() {
    if (this._saving) return;
    this._saving = true;

    const saveBtn = document.getElementById('saveParts');
    const btnText = saveBtn?.querySelector('.btn__text');
    const btnLoader = saveBtn?.querySelector('.btn__loader');

    try {
      this.collectPartDetails();
      const uniqueParts = Array.from(new Set(this.wizardState.selectedParts));

      for (const partName of uniqueParts) {
        const d = this.wizardState.partsDetails[partName];
        if (!d || !d.price || d.price <= 0) {
          UI.showToast(`Укажите цену для: ${partName}`, 'error');
          return;
        }
      }

      if (saveBtn) saveBtn.disabled = true;
      if (btnText) btnText.textContent = 'Сохранение...';
      btnLoader?.classList.remove('hidden');

      const db = firebase.firestore();
      const batch = db.batch();

      let addedCount = 0;
      let updatedCount = 0;

      const carKey = this.createCarKey(this.wizardState.carData);

      for (const partName of uniqueParts) {
        const details = this.wizardState.partsDetails[partName];

        const productData = {
          partName,
          customTitle: (details.customTitle || '').trim(), // ✅ добавили
          carMake: this.wizardState.carData.carMake,
          carModel: this.wizardState.carData.carModel,
          year: this.wizardState.carData.year ?? null,
          bodyType: this.wizardState.carData.bodyType,
          restyling: this.wizardState.carData.restyling,
          price: details.price,
          condition: details.condition,
          description: details.description || '',
          imageUrl: details.imageUrl || ''
        };

        const inventoryKey = Utils.createInventoryKey(productData);

        const existing = await this.findByInventoryKeyOrCarKey(db, inventoryKey, carKey, productData);

        if (existing) {
          const prev = existing.data || {};
          batch.update(existing.ref, {
            stock: firebase.firestore.FieldValue.increment(1),
            price: productData.price,
            customTitle: productData.customTitle || prev.customTitle || '', // ✅
            description: productData.description || prev.description || '',
            imageUrl: productData.imageUrl || prev.imageUrl || '',
            inventoryKey,
            carKey,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          updatedCount++;
        } else {
          const ref = db.collection('inventory').doc();
          batch.set(ref, {
            ...productData,
            inventoryKey,
            carKey,
            stock: 1,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          addedCount++;
        }
      }

      await batch.commit();

      UI.showToast(`Сохранено! Добавлено: ${addedCount}, Обновлено: ${updatedCount}`, 'success');

      this.resetWizard();
      this.switchTab('inventory');
    } catch (err) {
      console.error(err);
      UI.showToast('Ошибка при сохранении', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (btnText) btnText.textContent = 'Сохранить всё';
      btnLoader?.classList.add('hidden');
      this._saving = false;
    }
  },

  resetWizard() {
    this.wizardState = { step: 1, carData: {}, selectedParts: [], partsDetails: {} };
    this.priceTouched = new Set();

    document.getElementById('carInfoForm')?.reset();
    document.querySelectorAll('#partsCategories input[type="checkbox"]').forEach(cb => cb.checked = false);

    this.updateSelectedParts();
    this.goToStep(1);
  }
};

window.Admin = Admin;