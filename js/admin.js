/**
 * Admin.js — Admin panel (FULL, with Order Edit Modal + qty)
 *
 * Features:
 * - Cars collection: cars/{carId}, inventory linked via inventory.carId
 * - Wizard add car -> add parts (Cloudinary)
 * - STRICT autoprice: only within same carId (no cross-car fallback)
 * - Inventory: edit + bulk edit + bulk delete
 * - Orders: view (with qty), EDIT in modal (qty/remove items), cancel -> return stock + delete order,
 *          complete -> move to sales + delete order + print receipt (admin-only)
 * - Sales: view + print receipt (no delete)
 * - Cars tab: based on cars collection + inventory by carId
 * - Fix: no interactive elements inside <summary> (a11y)
 */

const Admin = {
  _eventsBound: false,
  _carMakeSelectBound: false,
  _saving: false,

  // realtime unsubscribers
  _unsubInventory: null,
  _unsubCars: null,
  _unsubOrders: null,
  _unsubSales: null,

  // data
  inventoryData: [],
  carsData: [],
  ordersData: [],
  salesData: [],

  // wizard
  priceTouched: new Set(),
  wizardState: {
    step: 1,
    mode: 'newCar', // 'newCar' | 'addParts'
    carId: null,
    carData: {},
    selectedParts: [],
    partsDetails: {}
  },

  // inventory edit
  editingProduct: null,
  _editImageUrl: null,

  // inventory selection/bulk
  selectedInventoryIds: new Set(),
  bulkDrafts: new Map(), // id -> { price, discountPercent, stock, description, imageUrl }

  // order edit modal state
  orderEdit: {
    orderId: null,
    order: null,        // original order data
    items: []           // editable items [{productId, qty, ...}]
  },

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

    // Create order edit modal if not exists
    this.ensureOrderEditModal();

    // Start realtime listeners
    this.ensureRealtime();
  },

  ensureRealtime() {
    this.subscribeCarsRealtime();
    this.subscribeInventoryRealtime();
    this.subscribeOrdersRealtime();
    this.subscribeSalesRealtime();
  },

  // ==========================================================
  // Realtime listeners
  // ==========================================================
  subscribeCarsRealtime() {
    if (this._unsubCars) return;

    const db = firebase.firestore();
    this._unsubCars = db.collection('cars').onSnapshot((snap) => {
      this.carsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.carsData.sort((a, b) => this.getTsMillis(b) - this.getTsMillis(a));

      if (!document.getElementById('tabCars')?.classList.contains('hidden')) {
        this.refreshCarsTab();
      }
    }, (err) => {
      console.error('subscribeCarsRealtime error:', err);
      UI.showToast('Ошибка realtime авто', 'error');
    });
  },

  subscribeInventoryRealtime() {
    if (this._unsubInventory) return;

    const db = firebase.firestore();
    this._unsubInventory = db.collection('inventory').onSnapshot((snap) => {
      this.inventoryData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.inventoryData.sort((a, b) => this.getTsMillis(b) - this.getTsMillis(a));

      this.cleanupSelection();

      if (!document.getElementById('tabInventory')?.classList.contains('hidden')) {
        this.renderInventory(this.inventoryData);
      }

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

    // Sales report toolbar
    document.getElementById('salesTodayBtn')?.addEventListener('click', () => this.setSalesReportPreset('today'));
    document.getElementById('salesYesterdayBtn')?.addEventListener('click', () => this.setSalesReportPreset('yesterday'));
    document.getElementById('printSalesReportBtn')?.addEventListener('click', () => this.printSalesReport());

    // Cars tab actions delegation (buttons are in body, not in summary)
    document.getElementById('carsList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-car-action]');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const carId = btn.dataset.carId;
      const action = btn.dataset.carAction;
      if (!carId || !action) return;

      if (action === 'edit') this.editCarPrompt(carId);
      if (action === 'addParts') this.addPartsToCar(carId);
    });

    // Inventory selection (bulk)
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

    // ==========================================================
    // ✅ ORDER EDIT MODAL events (qty/remove + кнопки) — через делегирование
    // ==========================================================
    document.addEventListener('input', (e) => {
      const qtyInput = e.target.closest('.order-edit-qty');
      if (!qtyInput) return;

      const productId = qtyInput.dataset.productId;
      if (!productId) return;

      const val = parseInt(qtyInput.value, 10);
      const qty = Number.isFinite(val) ? val : 1;

      const item = this.orderEdit.items.find(x => x.productId === productId);
      if (!item) return;

      item.qty = Math.max(0, qty);
      this.renderOrderEditModalItems();
    });

    document.addEventListener('click', (e) => {
      // remove item from edit modal
      const rmBtn = e.target.closest('[data-order-edit-remove]');
      if (rmBtn) {
        const productId = rmBtn.dataset.orderEditRemove;
        if (!productId) return;

        this.orderEdit.items = this.orderEdit.items.filter(x => x.productId !== productId);
        this.renderOrderEditModalItems();
        return;
      }

      // ✅ modal action buttons (save / save+sell / cancel order)
      const actionBtn = e.target.closest('#orderEditSaveBtn, #orderEditSaveAndSellBtn, #orderEditCancelOrderBtn');
      if (!actionBtn) return;

      if (actionBtn.id === 'orderEditSaveBtn') {
        this.saveOrderEdits(false);
        return;
      }

      if (actionBtn.id === 'orderEditSaveAndSellBtn') {
        this.saveOrderEdits(true);
        return;
      }

      if (actionBtn.id === 'orderEditCancelOrderBtn') {
        const id = this.orderEdit.orderId;
        if (id) this.cancelOrder(id);
        return;
      }
    });
  },

  switchTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.admin-content').forEach(c => c.classList.add('hidden'));

    const id = `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
    document.getElementById(id)?.classList.remove('hidden');

    this.ensureRealtime();

    if (tabName === 'inventory') this.renderInventory(this.inventoryData);
    if (tabName === 'orders') this.renderOrders();
    if (tabName === 'sales') this.renderSales();
    if (tabName === 'cars') this.refreshCarsTab();

    if (tabName === 'sales') {
      // если поля пустые — выставим сегодня
      const fromEl = document.getElementById('salesReportFrom');
      const toEl = document.getElementById('salesReportTo');
      if (fromEl && toEl && (!fromEl.value || !toEl.value)) {
        this.setSalesReportPreset('today');
      }
      this.renderSales();
    }
  },

  // ==========================================================
  // Confirm helper (safe fallback)
  // ==========================================================
  async askConfirm(title, message) {
    if (window.UI && typeof UI.confirm === 'function') {
      return await UI.confirm(title, message);
    }
    return window.confirm(`${title}\n\n${message}`);
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
  getTsMillis(obj) {
    const ts = obj?.updatedAt || obj?.createdAt || obj?.date || null;
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    return 0;
  },

  /**
   * STRICT autoprice: only within same carId, no fallback
   */
  findSuggestedPrice(partName, condition = 'used') {
    const norm = (s) => String(s || '').trim().toLowerCase();

    const wantedPart = norm(partName);
    const wantedCond = String(condition || 'used');

    // 1) Prefer same carId (если уже выбран конкретный carId)
    const carId = this.wizardState?.carId;
    let candidates = [];

    if (carId) {
      candidates = (this.inventoryData || [])
        .filter(i => i.carId === carId)
        .filter(i => norm(i.partName) === wantedPart)
        .filter(i => (i.condition || 'used') === wantedCond)
        .map(i => Number(i.price || 0))
        .filter(p => Number.isFinite(p) && p > 0);
    }

    // 2) Fallback: по марке/модели (если carId нет или по carId ничего не нашли)
    if (!candidates.length) {
      const make = this.wizardState?.carData?.carMake;
      const model = this.wizardState?.carData?.carModel;

      if (make && model) {
        const wantedMake = norm(make);
        const wantedModel = norm(model);

        candidates = (this.inventoryData || [])
          .filter(i => norm(i.carMake) === wantedMake)
          .filter(i => norm(i.carModel) === wantedModel)
          .filter(i => norm(i.partName) === wantedPart)
          .filter(i => (i.condition || 'used') === wantedCond)
          .map(i => Number(i.price || 0))
          .filter(p => Number.isFinite(p) && p > 0);
      }
    }

    candidates.sort((a, b) => a - b);
    if (!candidates.length) return null;

    const mid = Math.floor(candidates.length / 2);
    const median = (candidates.length % 2)
      ? candidates[mid]
      : Math.round((candidates[mid - 1] + candidates[mid]) / 2);

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

  // ==========================================================
  // Bulk modal
  // ==========================================================
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
        discountPercent: item.discountPercent ?? 0,
        stock: item.stock || 0,
        description: item.description || '',
        imageUrl: item.imageUrl || ''
      });

      const img = item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';

      // IMPORTANT: your bulk modal HTML currently has NO discount column.
      // We still render discount input safely: if column doesn't exist, it will just not align.
      // If you want discount in bulk modal, add <th>Скидка %</th> after "Цена".
      const hasDiscountHeader = (document.querySelector('#bulkEditModal thead')?.textContent || '').toLowerCase().includes('скид');

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
          ${hasDiscountHeader ? `<td><input class="form-input bulk-discount" data-id="${id}" type="number" min="0" max="100" value="${item.discountPercent ?? 0}"></td>` : ``}
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

    const hasDiscountHeader = (document.querySelector('#bulkEditModal thead')?.textContent || '').toLowerCase().includes('скид');

    const btn = document.getElementById('bulkSaveBtn');
    const oldText = btn?.textContent || 'Сохранить изменения';
    if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем...'; }

    try {
      const db = firebase.firestore();

      let batch = db.batch();
      let ops = 0;

      const commitBatch = async () => {
        if (ops === 0) return;
        await batch.commit();
        batch = db.batch();
        ops = 0;
      };

      for (const id of ids) {
        const draft = this.bulkDrafts.get(id);
        if (!draft) continue;

        const patch = {
          price: parseInt(draft.price, 10) || 0,
          stock: parseInt(draft.stock, 10) || 0,
          description: String(draft.description || ''),
          imageUrl: String(draft.imageUrl || ''),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (hasDiscountHeader) {
          const discountRaw = parseInt(draft.discountPercent, 10);
          patch.discountPercent = Number.isFinite(discountRaw) ? Math.min(100, Math.max(0, discountRaw)) : 0;
        }

        batch.update(db.collection('inventory').doc(id), patch);
        ops++;

        if (ops >= 450) await commitBatch();
      }

      await commitBatch();

      UI.showToast('Изменения сохранены', 'success');
      UI.closeModal('bulkEditModal');
    } catch (err) {
      console.error(err);
      UI.showToast(err?.message || 'Ошибка сохранения', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  },

  async bulkDeleteSelected() {
    const ids = Array.from(this.selectedInventoryIds);
    if (!ids.length) return;

    const ok = await this.askConfirm('Массовое удаление', `Удалить выбранные товары (${ids.length})?`);
    if (!ok) return;

    const btn = document.getElementById('bulkDeleteBtn');
    const oldText = btn?.textContent || 'Удалить выбранные';
    if (btn) { btn.disabled = true; btn.textContent = 'Удаляем...'; }

    try {
      const db = firebase.firestore();

      let batch = db.batch();
      let ops = 0;

      const commitBatch = async () => {
        if (ops === 0) return;
        await batch.commit();
        batch = db.batch();
        ops = 0;
      };

      for (const id of ids) {
        batch.delete(db.collection('inventory').doc(id));
        ops++;
        if (ops >= 450) await commitBatch();
      }

      await commitBatch();

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
  // Inventory render
  // ==========================================================
  renderInventory(items) {
    const tbody = document.getElementById('inventoryBody');
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;padding:2rem;color:var(--color-text-muted);">
            Склад пуст
          </td>
        </tr>
      `;
      this.clearSelectionUI();
      return;
    }

    tbody.innerHTML = items.map(item => {
      const imageUrl = item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c0-1.1-.9-2-2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';
      const conditionText = item.condition === 'new' ? 'Новое' : 'Б/У';
      const stock = item.stock || 0;

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
          <td>${stock}</td>
          <td class="inventory-table__actions">
            <button class="btn btn--sm btn--secondary inv-edit" type="button" data-id="${item.id}">✎</button>
          </td>
        </tr>
      `;
    }).join('');

    this.syncSelectAllCheckbox();
    this.updateBulkBar();
  },

  filterInventory(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = this.inventoryData.filter(item =>
      (item.partName || '').toLowerCase().includes(q) ||
      (item.customTitle || '').toLowerCase().includes(q) ||
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
    if (sortBy === 'price_asc') sorted.sort((a, b) => Utils.getPriceFinal(a) - Utils.getPriceFinal(b));
    if (sortBy === 'price_desc') sorted.sort((a, b) => Utils.getPriceFinal(b) - Utils.getPriceFinal(a));

    this.renderInventory(sorted);
  },

  // ==========================================================
  // Single inventory edit
  // ==========================================================
  editProduct(productId) {
    const product = this.inventoryData.find(p => p.id === productId);
    if (!product) return;

    this.editingProduct = product;
    this._editImageUrl = null;

    document.getElementById('editProductId').value = product.id;
    document.getElementById('editCustomTitle').value = product.customTitle || '';
    document.getElementById('editDiscountPercent').value = product.discountPercent ?? 0;
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
      discountPercent,
      price: Number.isFinite(price) ? price : 0,
      stock: Number.isFinite(stock) ? stock : 0,
      description,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (this._editImageUrl) patch.imageUrl = this._editImageUrl;

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

    const confirmed = await this.askConfirm('Удаление товара', `Удалить "${this.editingProduct.partName}"?`);
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
  // ORDER EDIT MODAL
  // ==========================================================
  ensureOrderEditModal() {
    if (document.getElementById('orderEditModal')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal" id="orderEditModal">
        <div class="modal__overlay" data-close-modal></div>
        <div class="modal__content modal__content--lg">
          <button class="modal__close" data-close-modal type="button">&times;</button>

          <h3 class="modal__title">Редактирование брони</h3>

          <div class="muted" id="orderEditMeta" style="margin-top:-6px;"></div>

          <div class="bulk-table-wrap" style="max-height: min(60vh, 520px);">
            <table class="bulk-table" style="min-width: 860px;">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style="width:130px;">Цена</th>
                  <th style="width:160px;">Кол-во</th>
                  <th style="width:140px;">Сумма</th>
                  <th style="width:110px;">Удалить</th>
                </tr>
              </thead>
              <tbody id="orderEditBody"></tbody>
            </table>
          </div>

          <div class="order-card__total" style="margin-top: 10px;">
            <span>Итого:</span>
            <span id="orderEditTotal">0 ₽</span>
          </div>

          <div class="form-actions" style="justify-content: space-between;">
            <button class="btn btn--danger" type="button" id="orderEditCancelOrderBtn">Отменить бронь</button>

            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
              <button class="btn btn--secondary" data-close-modal type="button">Закрыть</button>
              <button class="btn btn--secondary" type="button" id="orderEditSaveBtn">Сохранить</button>
              <button class="btn btn--success" type="button" id="orderEditSaveAndSellBtn">Сохранить и продать</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap.firstElementChild);
  },

  async openOrderEditModal(orderId) {
    try {
      const db = firebase.firestore();
      const doc = await db.collection('orders').doc(orderId).get();
      if (!doc.exists) {
        UI.showToast('Заказ не найден', 'error');
        return;
      }

      const order = { id: doc.id, ...doc.data() };

      if (!['active', 'confirmed', 'ready'].includes(order.status)) {
        UI.showToast('Этот заказ нельзя редактировать', 'warning');
        return;
      }

      // normalize items with qty
      const items = (order.items || []).map(it => ({
        ...it,
        qty: Math.max(1, parseInt(it.qty, 10) || 1)
      }));

      this.orderEdit.orderId = orderId;
      this.orderEdit.order = order;
      this.orderEdit.items = items;

      const meta = document.getElementById('orderEditMeta');
      if (meta) {
        const phone = order.userPhone ? `, телефон: ${order.userPhone}` : '';
        meta.textContent = `Заказ #${order.orderNumber || orderId.slice(-8)} — ${order.userName || order.userEmail || 'Клиент'}${phone}`;
      }

      this.renderOrderEditModalItems();
      UI.openModal('orderEditModal');

    } catch (e) {
      console.error(e);
      UI.showToast('Ошибка открытия редактирования', 'error');
    }
  },

  renderOrderEditModalItems() {
    const body = document.getElementById('orderEditBody');
    const totalEl = document.getElementById('orderEditTotal');
    if (!body) return;

    const items = (this.orderEdit.items || []).filter(it => (it.qty || 0) > 0);

    if (!items.length) {
      body.innerHTML = `
        <tr>
          <td colspan="5" class="muted" style="padding:14px;text-align:center;">
            Нет позиций (удалите бронь)
          </td>
        </tr>
      `;
      if (totalEl) totalEl.textContent = Utils.formatPrice(0);
      return;
    }

    let total = 0;

    body.innerHTML = items.map(it => {
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const price = Number(it.priceFinal ?? it.price ?? 0);
      const line = price * qty;
      total += line;

      return `
        <tr>
          <td>
            <div style="font-weight:900;">${Utils.escapeHtml(it.title || it.customTitle || it.partName || 'Товар')}</div>
            <div class="muted" style="font-size:12px;">${Utils.escapeHtml(it.carMake || '')} ${Utils.escapeHtml(it.carModel || '')}</div>
          </td>
          <td>${Utils.formatPrice(price)}</td>
          <td>
            <input class="form-input order-edit-qty"
              data-product-id="${it.productId}"
              type="number" min="0" value="${qty}"
              style="width:120px;">
          </td>
          <td><strong>${Utils.formatPrice(line)}</strong></td>
          <td>
            <button class="btn btn--sm btn--danger" type="button"
              data-order-edit-remove="${it.productId}">
              Удалить
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (totalEl) totalEl.textContent = Utils.formatPrice(total);
  },

  /**
   * Save edits:
   * - transaction adjusts inventory stock based on delta qty per productId
   * - updates order.items + order.total
   * - if sellAfter=true => then completes order (move to sales + delete order)
   */
  async saveOrderEdits(sellAfter = false) {
    const orderId = this.orderEdit.orderId;
    if (!orderId) return;

    const db = firebase.firestore();

    // normalize & remove qty<=0
    const newItems = (this.orderEdit.items || [])
      .map(it => ({ ...it, qty: parseInt(it.qty, 10) || 0 }))
      .filter(it => it.qty > 0);

    // if empty -> just cancel order (return stock + delete)
    if (!newItems.length) {
      const ok = await this.askConfirm('Пустая бронь', 'Все позиции удалены. Отменить бронь и вернуть товар на склад?');
      if (!ok) return;
      await this.cancelOrder(orderId);
      UI.closeModal('orderEditModal');
      return;
    }

    try {
      // get fresh order from db for correct deltas
      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        UI.showToast('Бронь уже удалена', 'warning');
        UI.closeModal('orderEditModal');
        return;
      }
      const oldOrder = orderDoc.data();
      const oldItems = (oldOrder.items || []).map(it => ({ ...it, qty: Math.max(1, parseInt(it.qty, 10) || 1) }));

      await db.runTransaction(async (tx) => {
        const oldMap = new Map();
        for (const it of oldItems) oldMap.set(it.productId, it);

        const newMap = new Map();
        for (const it of newItems) newMap.set(it.productId, it);

        const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);

        // reads
        const reads = [];
        for (const productId of allIds) {
          const ref = db.collection('inventory').doc(productId);
          const snap = await tx.get(ref);
          reads.push({ productId, ref, snap });
        }

        // validate + write stock changes
        for (const { productId, ref, snap } of reads) {
          if (!snap.exists) throw new Error('Одна из позиций удалена со склада');

          const stock = Number(snap.data().stock || 0);
          const oldQty = oldMap.has(productId) ? Math.max(1, parseInt(oldMap.get(productId).qty, 10) || 1) : 0;
          const newQty = newMap.has(productId) ? Math.max(1, parseInt(newMap.get(productId).qty, 10) || 1) : 0;

          const delta = newQty - oldQty;

          if (delta > 0) {
            if (stock < delta) throw new Error('Недостаточно товара на складе для увеличения количества');
            tx.update(ref, { stock: stock - delta });
          } else if (delta < 0) {
            tx.update(ref, { stock: stock + Math.abs(delta) });
          }
        }

        // recompute total
        const total = newItems.reduce((s, it) => {
          const q = Math.max(1, parseInt(it.qty, 10) || 1);
          const p = Number(it.priceFinal ?? it.price ?? 0);
          return s + p * q;
        }, 0);

        tx.update(db.collection('orders').doc(orderId), {
          items: newItems.map(it => ({ ...it, qty: Math.max(1, parseInt(it.qty, 10) || 1) })),
          total,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      UI.showToast('Бронь обновлена', 'success');

      // update local modal state
      this.orderEdit.items = newItems.map(it => ({ ...it, qty: Math.max(1, parseInt(it.qty, 10) || 1) }));
      this.renderOrderEditModalItems();

      if (sellAfter) {
        UI.closeModal('orderEditModal');
        await this.completeOrder(orderId);
      }
    } catch (e) {
      console.error(e);
      UI.showToast(e?.message || 'Ошибка сохранения брони', 'error');
    }
  },

  // ==========================================================
  // Orders (render + actions)
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

      const items = (order.items || []).map(it => ({ ...it, qty: Math.max(1, parseInt(it.qty, 10) || 1) }));
      const total = items.reduce((s, i) => s + (Number(i.priceFinal ?? i.price ?? 0) * (i.qty || 1)), 0);
      const phone = order.userPhone ? String(order.userPhone) : '';

      const phoneHtml = phone
        ? `<div class="order-card__user" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <strong>Телефон:</strong>
            <a href="tel:${Utils.escapeHtml(phone)}">${Utils.escapeHtml(phone)}</a>
            <button class="btn btn--sm btn--secondary" type="button" onclick="Admin.copyPhone('${Utils.escapeHtml(phone)}')">Копировать</button>
          </div>`
        : `<div class="order-card__user"><strong>Телефон:</strong> <span class="muted">—</span></div>`;

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
            ${items.map(item => `
              <div class="order-item">
                <span>
                  ${Utils.escapeHtml(item.title || item.customTitle || item.partName)}
                  <span class="muted">×${item.qty || 1}</span>
                </span>
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

            <button class="btn btn--sm btn--secondary" type="button" onclick="Admin.openOrderEditModal('${order.id}')">
              Редактировать
            </button>

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

  /**
   * completeOrder:
   * - creates sales doc
   * - deletes orders doc
   * - prints receipt (admin-only in UI.printReceipt)
   */
  async completeOrder(orderId) {
    const ok = await this.askConfirm('Продажа', 'Подтвердить оплату? Бронь будет удалена и перенесена в продажи.');
    if (!ok) return;

    try {
      const db = firebase.firestore();
      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        UI.showToast('Бронь уже удалена', 'warning');
        return;
      }

      const order = { id: orderDoc.id, ...orderDoc.data() };
      const items = (order.items || []).map(it => ({ ...it, qty: Math.max(1, parseInt(it.qty, 10) || 1) }));

      const total = items.reduce((s, x) => s + (Number(x.priceFinal ?? x.price ?? 0) * (x.qty || 1)), 0);

      const batch = db.batch();

      const saleRef = db.collection('sales').doc();
      batch.set(saleRef, {
        ...order,
        orderId: orderId,
        status: 'completed',
        total,
        completedAt: firebase.firestore.FieldValue.serverTimestamp(),
        completedBy: 'admin'
      });

      batch.delete(db.collection('orders').doc(orderId));
      await batch.commit();

      // print receipt (admin only)
      UI.printReceipt({
        title: 'Товарный чек (продажа)',
        orderNumber: order.orderNumber || orderId.slice(-8),
        userName: order.userName || order.userEmail || '—',
        userPhone: order.userPhone || '',
        items: items.map(x => ({
          partName: x.title || x.customTitle || x.partName,
          qty: Math.max(1, parseInt(x.qty, 10) || 1),
          unitPrice: Number(x.priceFinal ?? x.price ?? 0)
        })),
        total,
        date: Utils.formatDate(new Date(), true),
        footerNote: (Config.receipt?.saleFooterNote || '')
      }, { paper: 'A4' }); // или { paper: '80mm' } под термопринтер

      UI.showToast('Продажа оформлена, бронь удалена', 'success');
    } catch (e) {
      console.error(e);
      UI.showToast(e?.message || 'Ошибка при продаже', 'error');
    }
  },

  /**
   * cancelOrder:
   * - return stock by qty
   * - delete order
   */
  async cancelOrder(orderId) {
    const ok = await this.askConfirm('Отмена брони', 'Отменить бронь, вернуть товары на склад и удалить бронь?');
    if (!ok) return;

    try {
      const db = firebase.firestore();
      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        UI.showToast('Бронь уже удалена', 'warning');
        return;
      }

      const order = orderDoc.data();
      const items = (order.items || []).map(it => ({ ...it, qty: Math.max(1, parseInt(it.qty, 10) || 1) }));

      const batch = db.batch();

      for (const item of items) {
        if (!item.productId) continue;
        const qty = Math.max(1, parseInt(item.qty, 10) || 1);
        batch.update(db.collection('inventory').doc(item.productId), {
          stock: firebase.firestore.FieldValue.increment(qty)
        });
      }

      batch.delete(db.collection('orders').doc(orderId));
      await batch.commit();

      UI.showToast('Бронь отменена и удалена', 'success');
      UI.closeModal('orderEditModal');
    } catch (e) {
      console.error(e);
      UI.showToast(e?.message || 'Ошибка при отмене', 'error');
    }
  },

  // ==========================================================
  // Sales (no delete)
  // ==========================================================
  renderSales() {
    const container = document.getElementById('salesList');
    if (!container) return;

    if (!this.salesData.length) {
      container.innerHTML = `<div class="empty-state"><p>Нет завершенных продаж</p></div>`;
      return;
    }

    container.innerHTML = this.salesData.map(sale => {
      const items = (sale.items || []).map(it => ({ ...it, qty: Math.max(1, parseInt(it.qty, 10) || 1) }));
      const total = items.reduce((s, i) => s + (Number(i.priceFinal ?? i.price ?? 0) * (i.qty || 1)), 0);
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
                <span>${Utils.escapeHtml(item.title || item.customTitle || item.partName)} <span class="muted">×${item.qty || 1}</span></span>
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

  getLocalDateInputValue(d = new Date()) {
    const dt = new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  setSalesReportPreset(preset = 'today') {
    const fromEl = document.getElementById('salesReportFrom');
    const toEl = document.getElementById('salesReportTo');
    if (!fromEl || !toEl) return;

    const now = new Date();

    if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const v = this.getLocalDateInputValue(y);
      fromEl.value = v;
      toEl.value = v;
      return;
    }

    // today
    const v = this.getLocalDateInputValue(now);
    fromEl.value = v;
    toEl.value = v;
  },

  printSalesReport() {
    if (!Auth.isAdmin()) {
      UI.showToast('Доступно только администратору', 'error');
      return;
    }

    const fromEl = document.getElementById('salesReportFrom');
    const toEl = document.getElementById('salesReportTo');

    // если даты не заполнены — ставим сегодня
    if (!fromEl?.value || !toEl?.value) {
      this.setSalesReportPreset('today');
    }

    const fromStr = fromEl?.value || this.getLocalDateInputValue(new Date());
    const toStr = toEl?.value || fromStr;

    // диапазон по локальному времени:
    // from: 00:00:00.000
    // to:   23:59:59.999
    const from = new Date(`${fromStr}T00:00:00`);
    const to = new Date(`${toStr}T23:59:59.999`);

    const sales = (this.salesData || []).filter(s => {
      const ts = s.completedAt || s.date || s.createdAt || null;
      const d = ts?.toDate?.() || (ts instanceof Date ? ts : null);
      if (!d) return false;
      return d >= from && d <= to;
    });

    // строки отчёта = каждая позиция (item) отдельной строкой
    const rows = [];
    for (const sale of sales) {
      const orderNumber = sale.orderNumber || sale.orderId?.slice(-8) || sale.id?.slice(-8) || '';
      const userName = sale.userName || sale.userEmail || '—';
      const userPhone = sale.userPhone || '';

      const completed = sale.completedAt || sale.date || sale.createdAt || null;
      const dateStr = Utils.formatDate(completed || new Date(), true);

      const items = (sale.items || []).map(it => ({
        ...it,
        qty: Math.max(1, parseInt(it.qty, 10) || 1)
      }));

      for (const it of items) {
        const unit = Number(it.priceFinal ?? it.price ?? 0);
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        const line = unit * qty;

        rows.push({
          date: dateStr,
          orderNumber,
          userName,
          userPhone,
          car: Utils.formatCarName(it),
          partName: (it.title || it.customTitle || it.partName || 'Товар'),
          condition: (it.condition === 'new' ? 'NEW' : 'USED'),
          unitPriceStr: Utils.formatPrice(unit),
          qtyStr: String(qty),
          lineTotalStr: Utils.formatPrice(line),
          _qty: qty,
          _line: line
        });
      }
    }

    // totals
    const totals = {
      totalSales: sales.length,
      totalPositions: rows.length,
      totalQty: rows.reduce((s, r) => s + (r._qty || 0), 0),
      totalSum: rows.reduce((s, r) => s + (r._line || 0), 0)
    };

    const rangeLabel = `Период: ${fromStr} — ${toStr}`;

    UI.printSalesReport({
      companyName: Config?.receipt?.companyName || 'AutoParts',
      title: 'Отчёт по продажам',
      rangeLabel,
      generatedAt: Utils.formatDate(new Date(), true),
      rows,
      totals
    });
  },

  printSaleReceipt(saleId) {
    const sale = this.salesData.find(s => s.id === saleId);
    if (!sale) return UI.showToast('Продажа не найдена', 'error');

    const items = (sale.items || []).map(x => ({
      ...x,
      qty: Math.max(1, parseInt(x.qty, 10) || 1)
    }));

    const total = items.reduce((s, x) => s + (Number(x.priceFinal ?? x.price ?? 0) * (x.qty || 1)), 0);

    UI.printReceipt({
      title: 'Товарный чек (продажа)',
      orderNumber: sale.orderNumber || sale.orderId?.slice(-8) || sale.id.slice(-8),
      userName: sale.userName || sale.userEmail || '—',
      userPhone: sale.userPhone || '',
      items: items.map(x => ({
        partName: x.title || x.customTitle || x.partName,
        qty: Math.max(1, parseInt(x.qty, 10) || 1),
        unitPrice: Number(x.priceFinal ?? x.price ?? 0)
      })),
      total,
      date: Utils.formatDate(sale.completedAt || new Date(), true),
      footerNote: (Config.receipt?.saleFooterNote || '')
    }, { paper: 'A4' });
  },

  // ==========================================================
  // Phone helper
  // ==========================================================
  async copyPhone(phone) {
    const p = String(phone || '').trim();
    if (!p) return;

    try {
      await navigator.clipboard.writeText(p);
      UI.showToast('Телефон скопирован', 'success');
    } catch (e) {
      try { window.prompt('Скопируйте телефон:', p); } catch (_) { }
    }
  },

  // ==========================================================
  // Cars tab (cars + inventory by carId)
  // ==========================================================
  buildCarsViewModel() {
    const inv = this.inventoryData || [];
    const cars = this.carsData || [];

    const byCarId = new Map();
    for (const item of inv) {
      if (!item.carId) continue;
      if (!byCarId.has(item.carId)) byCarId.set(item.carId, []);
      byCarId.get(item.carId).push(item);
    }

    return cars.map(car => {
      const items = byCarId.get(car.id) || [];
      const parts = items
        .filter(x => (x.stock || 0) > 0)
        .map(x => ({
          partName: x.partName,
          condition: x.condition,
          stock: x.stock || 0,
          price: x.price || 0,
          discountPercent: x.discountPercent || 0
        }))
        .sort((a, b) => (a.partName || '').localeCompare(b.partName || ''));

      const totalStock = parts.reduce((s, p) => s + (p.stock || 0), 0);

      return {
        ...car,
        parts,
        partsCount: parts.length,
        totalStock,
        updatedMs: this.getTsMillis(car)
      };
    });
  },

  refreshCarsTab() {
    const search = (document.getElementById('carsSearch')?.value || '').toLowerCase().trim();
    const sort = document.getElementById('carsSort')?.value || 'updated_desc';

    let cars = this.buildCarsViewModel();

    if (search) {
      cars = cars.filter(c => {
        const s = `${c.carMake} ${c.carModel} ${c.year || ''} ${c.bodyType || ''} ${c.restyling ? 'restyling' : ''}`.toLowerCase();
        return s.includes(search);
      });
    }

    if (sort === 'name_asc') {
      cars.sort((a, b) => `${a.carMake} ${a.carModel}`.localeCompare(`${b.carMake} ${b.carModel}`));
    } else if (sort === 'parts_desc') {
      cars.sort((a, b) => (b.partsCount - a.partsCount));
    } else {
      cars.sort((a, b) => (b.updatedMs - a.updatedMs));
    }

    this.renderCars(cars);
  },

  // IMPORTANT: no interactive elements in <summary>
  renderCars(cars) {
    const el = document.getElementById('carsList');
    if (!el) return;

    if (!cars.length) {
      el.innerHTML = `<div class="empty-state"><p>Нет добавленных авто</p></div>`;
      return;
    }

    el.innerHTML = cars.map(car => {
      const yearLabel = (car.year == null || car.year === '') ? '' : ` (${car.year})`;
      const title = `${car.carMake || ''} ${car.carModel || ''}${yearLabel}`.trim();
      const meta = `${Utils.getBodyTypeName(car.bodyType)}${car.restyling ? ' • рестайлинг' : ''}`;
      const updated = car.updatedAt ? Utils.formatDate(car.updatedAt, true) : (car.createdAt ? Utils.formatDate(car.createdAt, true) : '—');

      const partsHtml = car.partsCount
        ? `
          <div class="car-parts-grid">
            ${car.parts.map(p => {
          const priceOriginal = Number(p.price || 0);
          const disc = Number(p.discountPercent || 0);
          const priceFinal = Utils.getPriceFinal({ priceOriginal, discountPercent: disc });

          const priceHtml = (disc > 0 && priceFinal < priceOriginal)
            ? `<span class="price-old">${Utils.formatPrice(priceOriginal)}</span> <span class="price-new">${Utils.formatPrice(priceFinal)}</span>`
            : `<span class="price-new">${Utils.formatPrice(priceOriginal)}</span>`;

          return `
                <div class="car-part">
                  <div>
                    <div class="car-part__name">${Utils.escapeHtml(p.partName)}</div>
                    <div class="car-part__sub">${p.condition === 'new' ? 'Новое' : 'Б/У'} • Остаток: ${p.stock}</div>
                  </div>
                  <div class="car-part__chips">
                    <span class="chip ${p.condition === 'new' ? 'chip--ok' : 'chip--warn'}">${p.condition === 'new' ? 'NEW' : 'USED'}</span>
                    <span class="chip chip--accent">${priceHtml}</span>
                    <span class="chip">x${p.stock || 0}</span>
                  </div>
                </div>
              `;
        }).join('')}
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
                <div class="muted" style="font-size:12px;margin-top:4px;">Обновлено: ${Utils.escapeHtml(updated)}</div>
              </div>

              <div class="car-card__right">
                <span class="chip">Позиций: ${car.partsCount}</span>
                <span class="chip">Всего шт.: ${car.totalStock}</span>
                <span class="car-card__toggle" aria-hidden="true">⌄</span>
              </div>
            </div>
          </summary>

          <div class="car-card__body">
            <div class="car-card__actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
              <button class="btn btn--sm btn--secondary" type="button" data-car-action="addParts" data-car-id="${car.id}">
                + Запчасти
              </button>
              <button class="btn btn--sm btn--secondary" type="button" data-car-action="edit" data-car-id="${car.id}">
                ✎ Авто
              </button>
            </div>

            ${partsHtml}
          </div>
        </details>
      `;
    }).join('');
  },

  // ==========================================================
  // Car edit / add parts
  // ==========================================================
  async editCarPrompt(carId) {
    const car = this.carsData.find(c => c.id === carId);
    if (!car) return UI.showToast('Авто не найдено', 'error');

    const make = prompt('Марка:', car.carMake || '');
    if (make == null) return;

    const model = prompt('Модель:', car.carModel || '');
    if (model == null) return;

    const yearRaw = prompt('Год (можно пусто):', (car.year ?? '') === null ? '' : String(car.year ?? ''));
    if (yearRaw == null) return;
    const yearParsed = String(yearRaw).trim() ? parseInt(String(yearRaw).trim(), 10) : null;
    const year = Number.isFinite(yearParsed) ? yearParsed : null;

    const bodyType = prompt('Тип кузова (ключ, например: sedan, suv, hatchback):', car.bodyType || '');
    if (bodyType == null) return;

    const restyling = confirm('Рестайлинг? (OK = да, Cancel = нет)');

    const ok = await this.askConfirm('Сохранить авто', 'Сохранить изменения по авто и обновить связанные запчасти?');
    if (!ok) return;

    try {
      const db = firebase.firestore();
      await db.collection('cars').doc(carId).update({
        carMake: String(make).trim(),
        carModel: String(model).trim(),
        year: year ?? null,
        bodyType: String(bodyType).trim(),
        restyling: !!restyling,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await this.updateInventoryForCar(carId, {
        carMake: String(make).trim(),
        carModel: String(model).trim(),
        year: year ?? null,
        bodyType: String(bodyType).trim(),
        restyling: !!restyling
      });

      UI.showToast('Авто обновлено', 'success');
    } catch (e) {
      console.error(e);
      UI.showToast('Ошибка обновления авто', 'error');
    }
  },

  async updateInventoryForCar(carId, patch) {
    const db = firebase.firestore();
    const snap = await db.collection('inventory').where('carId', '==', carId).get();
    if (snap.empty) return;

    let batch = db.batch();
    let ops = 0;

    const commitBatch = async () => {
      if (ops === 0) return;
      await batch.commit();
      batch = db.batch();
      ops = 0;
    };

    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        ...patch,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      ops++;
      if (ops >= 450) await commitBatch();
    }
    await commitBatch();
  },

  addPartsToCar(carId) {
    const car = this.carsData.find(c => c.id === carId);
    if (!car) return UI.showToast('Авто не найдено', 'error');

    this.wizardState = {
      step: 2,
      mode: 'addParts',
      carId,
      carData: {
        carMake: car.carMake || '',
        carModel: car.carModel || '',
        year: car.year ?? null,
        bodyType: car.bodyType || '',
        restyling: !!car.restyling
      },
      selectedParts: [],
      partsDetails: {}
    };

    this.priceTouched = new Set();

    this.fillCarInfoForm(this.wizardState.carData, true);
    this.updateSelectedParts();

    this.switchTab('addCar');
    this.goToStep(2);

    UI.showToast('Добавление запчастей к выбранному авто', 'info');
  },

  fillCarInfoForm(carData, lock = false) {
    const makeEl = document.getElementById('carMake');
    const modelEl = document.getElementById('carModel');
    const yearEl = document.getElementById('carYear');
    const bodyEl = document.getElementById('carBody');
    const restEl = document.getElementById('carRestyling');

    if (makeEl) makeEl.value = carData.carMake || '';
    if (modelEl) modelEl.value = carData.carModel || '';
    if (yearEl) yearEl.value = carData.year ?? '';
    if (bodyEl) bodyEl.value = carData.bodyType || '';
    if (restEl) restEl.checked = !!carData.restyling;

    const disabled = !!lock;
    [makeEl, modelEl, yearEl, bodyEl, restEl].forEach(el => {
      if (!el) return;
      el.disabled = disabled;
    });
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

    if (this.wizardState.mode === 'addParts' && this.wizardState.carId) {
      this.goToStep(2);
      return;
    }

    const yearRaw = (document.getElementById('carYear')?.value || '').trim();
    const yearParsed = yearRaw ? parseInt(yearRaw, 10) : null;
    const year = Number.isFinite(yearParsed) ? yearParsed : null;

    this.wizardState.mode = 'newCar';
    this.wizardState.carId = null;

    this.wizardState.carData = {
      carMake: document.getElementById('carMake')?.value || '',
      carModel: (document.getElementById('carModel')?.value || '').trim(),
      year,
      bodyType: document.getElementById('carBody')?.value || '',
      restyling: !!document.getElementById('carRestyling')?.checked
    };

    const c = this.wizardState.carData;
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
              placeholder="Если заполнено — будет показано на сайте">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Цена (₽) *</label>
              <input type="number" class="form-input part-price"
                data-part="${Utils.escapeHtml(partName)}"
                value="${priceValue}"
                min="0" required>
              ${suggestedPrice != null ? `<div class="muted" style="font-size:12px;">Автоподставлено по этой машине</div>` : ''}
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

    document.querySelectorAll('.part-price').forEach(inp => {
      inp.addEventListener('input', () => this.priceTouched.add(inp.dataset.part));
    });

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

    document.querySelectorAll('.part-custom-title').forEach(input => {
      input.addEventListener('change', () => this.collectPartDetails());
      input.addEventListener('input', Utils.debounce(() => this.collectPartDetails(), 200));
    });

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
        imageUrl: prev.imageUrl || ''
      };
    });
  },

  async findExistingInventoryByKey(db, inventoryKey) {
    const q = await db.collection('inventory')
      .where('inventoryKey', '==', inventoryKey)
      .limit(1)
      .get();

    if (q.empty) return null;
    const doc = q.docs[0];
    return { ref: doc.ref, data: doc.data() };
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

      let carId = this.wizardState.carId;

      let batch = db.batch();
      let ops = 0;
      const commitBatch = async () => {
        if (ops === 0) return;
        await batch.commit();
        batch = db.batch();
        ops = 0;
      };

      if (!carId) {
        const carRef = db.collection('cars').doc();
        carId = carRef.id;

        const carData = {
          carMake: this.wizardState.carData.carMake,
          carModel: this.wizardState.carData.carModel,
          year: this.wizardState.carData.year ?? null,
          bodyType: this.wizardState.carData.bodyType,
          restyling: !!this.wizardState.carData.restyling,
          status: 'active',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        batch.set(carRef, carData);
        ops++;
        this.wizardState.carId = carId;
      }

      let addedCount = 0;
      let updatedCount = 0;

      for (const partName of uniqueParts) {
        const details = this.wizardState.partsDetails[partName];

        const productData = {
          carId,
          carMake: this.wizardState.carData.carMake,
          carModel: this.wizardState.carData.carModel,
          year: this.wizardState.carData.year ?? null,
          bodyType: this.wizardState.carData.bodyType,
          restyling: !!this.wizardState.carData.restyling,

          partName,
          customTitle: (details.customTitle || '').trim(),
          price: details.price,
          discountPercent: 0,
          condition: details.condition,
          description: details.description || '',
          imageUrl: details.imageUrl || ''
        };

        const inventoryKey = Utils.createInventoryKey({
          carId,
          partName,
          condition: productData.condition
        });

        const existing = await this.findExistingInventoryByKey(db, inventoryKey);

        if (existing) {
          const prev = existing.data || {};
          batch.update(existing.ref, {
            stock: firebase.firestore.FieldValue.increment(1),
            price: productData.price,
            customTitle: productData.customTitle || prev.customTitle || '',
            description: productData.description || prev.description || '',
            imageUrl: productData.imageUrl || prev.imageUrl || '',
            inventoryKey,
            carId,
            carMake: productData.carMake,
            carModel: productData.carModel,
            year: productData.year ?? null,
            bodyType: productData.bodyType,
            restyling: !!productData.restyling,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          ops++;
          updatedCount++;
        } else {
          const ref = db.collection('inventory').doc();
          batch.set(ref, {
            ...productData,
            inventoryKey,
            stock: 1,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          ops++;
          addedCount++;
        }

        if (ops >= 450) await commitBatch();
      }

      await commitBatch();

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
    this.wizardState = { step: 1, mode: 'newCar', carId: null, carData: {}, selectedParts: [], partsDetails: {} };
    this.priceTouched = new Set();

    this.fillCarInfoForm({ carMake: '', carModel: '', year: '', bodyType: '', restyling: false }, false);

    document.getElementById('carInfoForm')?.reset();
    document.querySelectorAll('#partsCategories input[type="checkbox"]').forEach(cb => cb.checked = false);

    this.updateSelectedParts();
    this.goToStep(1);
  }
};

window.Admin = Admin;