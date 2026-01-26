/**
 * Admin.js - Модуль административной панели
 * - Добавление авто (wizard)
 * - Склад (inventory)
 * - Брони (orders)
 * - Продажи (sales)
 * - Вкладка "Авто" (группировка из inventory)
 *
 * Важные фиксы:
 * 1) bindEvents() вешается 1 раз
 * 2) защита от повторного сохранения (_saving)
 * 3) дедуп выбранных запчастей (Set)
 * 4) removePart снимает ВСЕ чекбоксы с одинаковым value
 * 5) upload: клик всегда ищет актуальный input
 * 6) сохранение: inventoryKey -> fallback по полям, при update проставляем inventoryKey + carKey
 * 7) sales: печать чека по id (без JSON.stringify)
 * 8) orders: загрузка без where(in)+orderBy (чтобы не упираться в индексы)
 * 9) автоподстановка цены (если такая запчасть от этого авто уже есть на складе)
 * 10) вкладка авто рендерится красиво (карточки <details> + сетка запчастей)
 */

const Admin = {
  _eventsBound: false,
  _saving: false,
  _carMakeSelectBound: false,
  

  // если админ изменил цену руками — больше не перезатираем автоподстановкой
  priceTouched: new Set(),

  wizardState: {
    step: 1,
    carData: {},
    selectedParts: [],
    partsDetails: {}
  },

  editingProduct: null,

  inventoryData: [],
  ordersData: [],
  salesData: [],

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

    // грузим данные
    this.loadInventory();
    this.loadOrders();
    this.loadSales();
  },

  bindEvents() {
    // Tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        await this.switchTab(tab.dataset.tab);
      });
    });

    // Wizard step1 submit
    document.getElementById('carInfoForm')?.addEventListener('submit', (e) => this.handleCarInfoSubmit(e));

    // Wizard nav
    document.getElementById('wizardBack1')?.addEventListener('click', () => this.goToStep(1));
    document.getElementById('wizardNext2')?.addEventListener('click', () => this.goToStep(3));
    document.getElementById('wizardBack2')?.addEventListener('click', () => this.goToStep(2));

    // Save parts
    document.getElementById('saveParts')?.addEventListener('click', () => this.saveAllParts());

    // Search parts
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

    // Edit product
    document.getElementById('editProductForm')?.addEventListener('submit', (e) => this.handleEditSubmit(e));
    document.getElementById('deleteProductBtn')?.addEventListener('click', () => this.deleteProduct());

    // Print old modal receipt (если используешь receiptModal)
    document.getElementById('printReceipt')?.addEventListener('click', () => window.print());
  },

  async switchTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.admin-content').forEach(content => content.classList.add('hidden'));

    const id = `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
    document.getElementById(id)?.classList.remove('hidden');

    if (tabName === 'inventory') await this.loadInventory();
    if (tabName === 'orders') await this.loadOrders();
    if (tabName === 'sales') await this.loadSales();
    if (tabName === 'cars') {
      if (!this.inventoryData.length) await this.loadInventory();
      this.refreshCarsTab();
    }
  },

  // =====================================================
  // Helpers
  // =====================================================
  createCarKey(car) {
    const make = car?.carMake || '';
    const model = car?.carModel || '';
    const year = car?.year || '';
    const body = car?.bodyType || '';
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

  findSuggestedPrice(partName, condition) {
    const car = this.wizardState.carData;
    if (!car?.carMake) return null;

    const carKey = this.createCarKey(car);

    const candidates = this.inventoryData.filter(x => {
      const xCarKey = x.carKey || this.createCarKey(x);
      return xCarKey === carKey && x.partName === partName;
    });

    if (!candidates.length) return null;

    const exact = candidates.filter(x => x.condition === condition);
    const list = exact.length ? exact : candidates;

    list.sort((a, b) => this.getTsMillis(b) - this.getTsMillis(a));
    return list[0]?.price ?? null;
  },

  // =====================================================
  // Wizard
  // =====================================================
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

    this.wizardState.carData = {
      carMake: document.getElementById('carMake')?.value || '',
      carModel: (document.getElementById('carModel')?.value || '').trim(),
      year: parseInt(document.getElementById('carYear')?.value, 10),
      bodyType: document.getElementById('carBody')?.value || '',
      restyling: !!document.getElementById('carRestyling')?.checked
    };

    const c = this.wizardState.carData;
    if (!c.carMake || !c.carModel || !c.year || !c.bodyType) {
      UI.showToast('Заполните все обязательные поля', 'error');
      return;
    }

    this.goToStep(2);
  },

  async goToStep(step) {
    this.wizardState.step = step;

    document.querySelectorAll('.wizard-step').forEach(stepEl => {
      const stepNum = parseInt(stepEl.dataset.step, 10);
      stepEl.classList.remove('active', 'completed');
      if (stepNum === step) stepEl.classList.add('active');
      if (stepNum < step) stepEl.classList.add('completed');
    });

    document.querySelectorAll('.wizard-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById(`wizardStep${step}`)?.classList.add('active');

    if (step === 3) {
      if (!this.inventoryData.length) await this.loadInventory();
      this.renderPartsDetails();
    }
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

      return `
        <div class="part-detail-card" data-part="${Utils.escapeHtml(partName)}">
          <div class="part-detail-card__header">
            <h4 class="part-detail-card__title">${Utils.escapeHtml(partName)}</h4>
            <button type="button" class="part-detail-card__remove" data-remove="${Utils.escapeHtml(partName)}">✕</button>
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
    this.collectPartDetails(); // фиксируем автоподставленную цену в state
  },

  bindPartDetailEvents() {
    // remove part
    document.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const partName = e.currentTarget.dataset.remove;
        this.removePart(partName);
      });
    });

    // uploads
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
          this.handleImageUpload(partName, file, uploadEl);
        }
      });

      uploadEl.querySelector('input[type="file"]')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.handleImageUpload(partName, file, uploadEl);
      });
    });

    // mark price touched
    document.querySelectorAll('.part-price').forEach(inp => {
      inp.addEventListener('input', () => {
        this.priceTouched.add(inp.dataset.part);
      });
    });

    // condition change -> autoprice (if not touched)
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

    // collect on changes
    document.querySelectorAll('.part-price, .part-description').forEach(input => {
      input.addEventListener('change', () => this.collectPartDetails());
      input.addEventListener('input', Utils.debounce(() => this.collectPartDetails(), 200));
    });
  },

  removePart(partName) {
    this.wizardState.selectedParts = this.wizardState.selectedParts.filter(p => p !== partName);

    // снимаем все одинаковые чекбоксы (если деталь в двух категориях)
    document.querySelectorAll(`#partsCategories input[type="checkbox"][value="${CSS.escape(partName)}"]`)
      .forEach(cb => { cb.checked = false; });

    document.querySelector(`.part-detail-card[data-part="${CSS.escape(partName)}"]`)?.remove();

    delete this.wizardState.partsDetails[partName];

    this.updateSelectedParts();

    if (this.wizardState.selectedParts.length === 0) {
      this.goToStep(2);
    }
  },

  async handleImageUpload(partName, file, uploadEl) {
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
        if (f) this.handleImageUpload(partName, f, uploadEl);
      });

      UI.showToast('Фото загружено', 'success');
    } catch (err) {
      console.error('upload error:', err);
      uploadEl.querySelector('.image-upload__text')?.replaceChildren(document.createTextNode('Ошибка загрузки'));
      UI.showToast('Ошибка загрузки фото', 'error');
    }
  },

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

  collectPartDetails() {
    document.querySelectorAll('.part-detail-card').forEach(card => {
      const partName = card.dataset.part;
      this.wizardState.partsDetails[partName] = {
        price: parseInt(card.querySelector('.part-price')?.value, 10) || 0,
        condition: card.querySelector('.part-condition')?.value || 'used',
        description: (card.querySelector('.part-description')?.value || '').trim(),
        imageUrl: this.wizardState.partsDetails[partName]?.imageUrl || ''
      };
    });
  },

  async findExistingInventoryDoc(db, productData, inventoryKey) {
    // 1) inventoryKey
    let q = await db.collection('inventory')
      .where('inventoryKey', '==', inventoryKey)
      .limit(1)
      .get();

    if (!q.empty) {
      const doc = q.docs[0];
      return { ref: doc.ref, data: doc.data(), id: doc.id };
    }

    // 2) fallback by fields
    q = await db.collection('inventory')
      .where('partName', '==', productData.partName)
      .where('carMake', '==', productData.carMake)
      .where('carModel', '==', productData.carModel)
      .where('year', '==', productData.year)
      .where('bodyType', '==', productData.bodyType)
      .where('condition', '==', productData.condition)
      .limit(1)
      .get();

    if (!q.empty) {
      const doc = q.docs[0];
      return { ref: doc.ref, data: doc.data(), id: doc.id, legacy: true };
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
          carMake: this.wizardState.carData.carMake,
          carModel: this.wizardState.carData.carModel,
          year: this.wizardState.carData.year,
          bodyType: this.wizardState.carData.bodyType,
          restyling: this.wizardState.carData.restyling,
          price: details.price,
          condition: details.condition,
          description: details.description || '',
          imageUrl: details.imageUrl || ''
        };

        const inventoryKey = Utils.createInventoryKey(productData);

        const existing = await this.findExistingInventoryDoc(db, productData, inventoryKey);

        if (existing) {
          const prev = existing.data || {};
          batch.update(existing.ref, {
            stock: firebase.firestore.FieldValue.increment(1),
            price: productData.price,
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

      await this.loadInventory();
      this.resetWizard();
      await this.switchTab('inventory');

    } catch (err) {
      console.error('saveAllParts error:', err);
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
  },

  // =====================================================
  // INVENTORY
  // =====================================================
  async loadInventory() {
    try {
      const snapshot = await firebase.firestore().collection('inventory').get();
      this.inventoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // сортировка по updatedAt/createdAt
      this.inventoryData.sort((a, b) => this.getTsMillis(b) - this.getTsMillis(a));

      this.renderInventory(this.inventoryData);

      // если открыта вкладка авто — обновим
      if (!document.getElementById('tabCars')?.classList.contains('hidden')) {
        this.refreshCarsTab();
      }

    } catch (err) {
      console.error('loadInventory error:', err);
      UI.showToast('Ошибка загрузки склада', 'error');
    }
  },

  renderInventory(items) {
    const tbody = document.getElementById('inventoryBody');
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:2rem;color:var(--color-text-secondary);">
            Склад пуст
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items.map(item => {
      const imageUrl = item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c6c80"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';
      const conditionText = item.condition === 'new' ? 'Новое' : 'Б/У';
      const stock = item.stock || 0;
      const stockStyle = stock <= 2 ? 'style="color: var(--color-warning)"' : '';

      return `
        <tr data-id="${item.id}">
          <td><img src="${imageUrl}" alt="" class="inventory-table__image"></td>
          <td>${Utils.escapeHtml(item.partName || '')}</td>
          <td>${Utils.escapeHtml(Utils.formatCarName(item))}</td>
          <td>${conditionText}</td>
          <td>${Utils.formatPrice(item.price || 0)}</td>
          <td ${stockStyle}>${stock}</td>
          <td class="inventory-table__actions">
            <button class="btn btn--sm btn--secondary" onclick="Admin.editProduct('${item.id}')">✎</button>
          </td>
        </tr>
      `;
    }).join('');
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

  editProduct(productId) {
    const product = this.inventoryData.find(p => p.id === productId);
    if (!product) return;

    this.editingProduct = product;

    document.getElementById('editProductId').value = product.id;
    document.getElementById('editPrice').value = product.price ?? 0;
    document.getElementById('editStock').value = product.stock ?? 0;
    document.getElementById('editDescription').value = product.description || '';

    UI.openModal('editProductModal');
  },

  async handleEditSubmit(e) {
    e.preventDefault();

    const productId = document.getElementById('editProductId').value;
    const price = parseInt(document.getElementById('editPrice').value, 10);
    const stock = parseInt(document.getElementById('editStock').value, 10);
    const description = (document.getElementById('editDescription').value || '').trim();

    try {
      await firebase.firestore().collection('inventory').doc(productId).update({
        price,
        stock,
        description,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      UI.showToast('Товар обновлен', 'success');
      UI.closeModal('editProductModal');
      await this.loadInventory();
    } catch (err) {
      console.error('handleEditSubmit error:', err);
      UI.showToast('Ошибка при обновлении', 'error');
    }
  },

  async deleteProduct() {
    if (!this.editingProduct) return;

    const confirmed = await UI.confirm(
      'Удаление товара',
      `Вы уверены, что хотите удалить "${this.editingProduct.partName}"?`
    );
    if (!confirmed) return;

    try {
      await firebase.firestore().collection('inventory').doc(this.editingProduct.id).delete();
      UI.showToast('Товар удален', 'success');
      UI.closeModal('editProductModal');
      await this.loadInventory();
    } catch (err) {
      console.error('deleteProduct error:', err);
      UI.showToast('Ошибка при удалении', 'error');
    }
  },

  // =====================================================
  // ORDERS (без where-in + orderBy)
  // =====================================================
  async loadOrders() {
    try {
      const snapshot = await firebase.firestore().collection('orders').get();
      const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      all.sort((a, b) => this.getTsMillis(b) - this.getTsMillis(a));
      this.ordersData = all.filter(o => ['active', 'confirmed', 'ready'].includes(o.status));

      this.renderOrders();
    } catch (err) {
      console.error('loadOrders error:', err);
      UI.showToast('Не удалось загрузить бронирования', 'error');
    }
  },

  renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;

    if (!this.ordersData.length) {
      container.innerHTML = `<div class="empty-state"><p>Нет активных бронирований</p></div>`;
      return;
    }

    container.innerHTML = this.ordersData.map(order => {
      const statusInfo = Config.orderStatuses[order.status] || { label: order.status, class: 'active' };
      const total = (order.items || []).reduce((sum, item) => sum + (item.price || 0), 0);

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

          <div class="order-card__actions">
            ${order.status === 'active' ? `
              <button class="btn btn--sm btn--secondary" onclick="Admin.updateOrderStatus('${order.id}', 'ready')">
                Готов к выдаче
              </button>
            ` : ''}

            <button class="btn btn--sm btn--success" onclick="Admin.completeOrder('${order.id}')">
              Продать
            </button>

            <button class="btn btn--sm btn--danger" onclick="Admin.cancelOrder('${order.id}')">
              Отменить
            </button>
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
      await this.loadOrders();
    } catch (err) {
      console.error('updateOrderStatus error:', err);
      UI.showToast('Ошибка', 'error');
    }
  },

  async completeOrder(orderId) {
    const order = this.ordersData.find(o => o.id === orderId);
    if (!order) return;

    const confirmed = await UI.confirm('Подтверждение продажи', 'Подтвердить продажу и распечатать чек?');
    if (!confirmed) return;

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

      // Автопечать чека 80mm (через UI.printReceipt)
      const items = (order.items || []).map(x => ({ partName: x.partName, price: x.price || 0 }));
      const total = items.reduce((s, x) => s + (x.price || 0), 0);

      UI.printReceipt({
        title: 'Чек продажи',
        orderNumber: order.orderNumber || order.id.slice(-8),
        userName: order.userName || order.userEmail || '—',
        items,
        total,
        date: Utils.formatDate(new Date(), true)
      });

      UI.showToast('Продажа оформлена', 'success');

      await this.loadOrders();
      await this.loadSales();
    } catch (err) {
      console.error('completeOrder error:', err);
      UI.showToast('Ошибка при продаже', 'error');
    }
  },

  async cancelOrder(orderId) {
    const order = this.ordersData.find(o => o.id === orderId);
    if (!order) return;

    const confirmed = await UI.confirm(
      'Отмена бронирования',
      'Отменить бронирование? Товары вернутся на склад.'
    );
    if (!confirmed) return;

    try {
      const db = firebase.firestore();
      const batch = db.batch();

      batch.update(db.collection('orders').doc(orderId), {
        status: 'cancelled',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // возвращаем stock
      for (const item of (order.items || [])) {
        if (item.productId) {
          batch.update(db.collection('inventory').doc(item.productId), {
            stock: firebase.firestore.FieldValue.increment(1)
          });
        }
      }

      await batch.commit();

      UI.showToast('Бронирование отменено', 'success');
      await this.loadOrders();
      await this.loadInventory();
    } catch (err) {
      console.error('cancelOrder error:', err);
      UI.showToast('Ошибка', 'error');
    }
  },

  // =====================================================
  // SALES
  // =====================================================
  async loadSales() {
    try {
      const snapshot = await firebase.firestore().collection('sales').get();
      this.salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.salesData.sort((a, b) => (b.completedAt?.toMillis?.() || 0) - (a.completedAt?.toMillis?.() || 0));
      this.renderSales();
    } catch (err) {
      console.error('loadSales error:', err);
      UI.showToast('Не удалось загрузить продажи', 'error');
    }
  },

  renderSales() {
    const container = document.getElementById('salesList');
    if (!container) return;

    if (!this.salesData.length) {
      container.innerHTML = `<div class="empty-state"><p>Нет завершенных продаж</p></div>`;
      return;
    }

    container.innerHTML = this.salesData.map(sale => {
      const items = sale.items || [];
      const total = items.reduce((sum, item) => sum + (item.price || 0), 0);
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
                <span>${Utils.escapeHtml(item.partName)}</span>
                <span>${Utils.formatPrice(item.price || 0)}</span>
              </div>
            `).join('')}
          </div>

          <div class="order-card__total">
            <span>Итого:</span>
            <span>${Utils.formatPrice(total)}</span>
          </div>

          <div class="order-card__actions">
            <button class="btn btn--sm btn--secondary" onclick="Admin.printSaleReceipt('${sale.id}')">
              Печать чека
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  printSaleReceipt(saleId) {
    const sale = this.salesData.find(s => s.id === saleId);
    if (!sale) {
      UI.showToast('Продажа не найдена', 'error');
      return;
    }

    const items = (sale.items || []).map(x => ({ partName: x.partName, price: x.price || 0 }));
    const total = items.reduce((s, x) => s + (x.price || 0), 0);

    UI.printReceipt({
      title: 'Чек продажи',
      orderNumber: sale.orderNumber || sale.orderId?.slice(-8) || sale.id.slice(-8),
      userName: sale.userName || sale.userEmail || '—',
      items,
      total,
      date: Utils.formatDate(sale.completedAt || new Date(), true)
    });
  },

  // =====================================================
  // CARS TAB (красиво)
  // =====================================================
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
      const title = `${car.carMake} ${car.carModel} (${car.year})`;
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
  }
};

window.Admin = Admin;