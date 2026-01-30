/**
 * App.js - Главный контроллер приложения (Realtime Catalog + Cars stats)
 * Обновляет каталог моментально при изменениях inventory:
 * - добавление/обновление/удаление
 * - изменение stock после брони/отмены
 *
 * NEW:
 * - realtime cars: статистика "Авто в разборе" (totalCars)
 */

const App = {
  catalog: {
    products: [],
    filteredProducts: [],
    currentPage: 1,
    totalPages: 1,
    filters: {
      make: '',
      model: '',
      part: '',
      condition: '',
      search: ''
    },
    sort: 'newest'
  },

  initialized: false,
  _eventsBound: false,

  // realtime unsubscribers
  _unsubInventory: null,
  _unsubCars: null,

  // cars stats cache
  carsData: [],

  async init() {
    if (this.initialized) return;

    try {
      this.initFirebase();

      UI.init();
      Auth.init();
      Reservations.init();

      this.bindEvents();
      this.populateFilters();

      // realtime listeners
      this.subscribeInventoryRealtime();
      this.subscribeCarsRealtime();

      Auth.onAuthChanged((user, userData) => this.handleAuthChange(user, userData));

      this.initialized = true;
      console.log('✅ AutoParts инициализирован (Realtime + Cars)');
    } catch (error) {
      console.error('❌ Ошибка инициализации:', error);
      UI.showToast('Ошибка загрузки приложения', 'error');
    }
  },

  initFirebase() {
    if (!firebase.apps.length) {
      firebase.initializeApp(Config.firebase);
      console.log('Firebase инициализирован');
    }
  },

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch) {
      globalSearch.addEventListener('input', Utils.debounce((e) => {
        this.catalog.filters.search = e.target.value.trim();
        this.applyFilters();
      }, 250));

      globalSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.catalog.filters.search = e.target.value.trim();
          this.applyFilters();
          UI.navigate('catalog');
        }
      });
    }

    document.getElementById('searchBtn')?.addEventListener('click', () => {
      const query = document.getElementById('globalSearch')?.value.trim();
      this.catalog.filters.search = query || '';
      this.applyFilters();
      UI.navigate('catalog');
    });

    document.getElementById('filterMake')?.addEventListener('change', (e) => {
      this.catalog.filters.make = e.target.value;
      this.catalog.filters.model = '';
      this.updateModelFilterFromCache();
      this.applyFilters();
    });

    document.getElementById('filterModel')?.addEventListener('change', (e) => {
      this.catalog.filters.model = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filterPart')?.addEventListener('change', (e) => {
      this.catalog.filters.part = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filterCondition')?.addEventListener('change', (e) => {
      this.catalog.filters.condition = e.target.value;
      this.applyFilters();
    });

    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
      this.catalog.sort = e.target.value;
      this.applyFilters();
    });

    document.getElementById('resetFilters')?.addEventListener('click', () => {
      this.resetFilters();
    });
  },

  populateFilters() {
    UI.populateMakesSelect(document.getElementById('filterMake'), true);
    UI.populatePartsSelect(document.getElementById('filterPart'));

    // модели будут заполнены после прихода realtime данных
    this.updateModelFilterFromCache();
  },

  /**
   * Модели без запросов к Firestore
   * Берём уникальные модели из текущего каталога products
   */
  updateModelFilterFromCache() {
    const modelSelect = document.getElementById('filterModel');
    if (!modelSelect) return;

    const make = this.catalog.filters.make;

    if (!make) {
      modelSelect.innerHTML = '<option value="">Выберите марку</option>';
      modelSelect.disabled = true;
      return;
    }

    const models = [...new Set(
      this.catalog.products
        .filter(p => p.carMake === make && (p.stock || 0) > 0)
        .map(p => p.carModel)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    let html = '<option value="">Все модели</option>';
    models.forEach(model => {
      const safe = Utils.escapeHtml(String(model));
      html += `<option value="${safe}">${safe}</option>`;
    });

    modelSelect.innerHTML = html;
    modelSelect.disabled = false;
  },

  /**
   * Realtime подписка на inventory
   * Слушаем только то, что реально в наличии (stock>0)
   */
  subscribeInventoryRealtime() {
    if (this._unsubInventory) return;

    UI.showLoading();

    const db = firebase.firestore();

    this._unsubInventory = db.collection('inventory')
      .where('stock', '>', 0)
      .onSnapshot((snapshot) => {
        this.catalog.products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // обновим фильтр моделей
        this.updateModelFilterFromCache();

        // перерисуем каталог
        this.applyFilters();

        // stats: totalParts
        let totalParts = 0;
        this.catalog.products.forEach(p => totalParts += (p.stock || 0));

        UI.updateStats({
          totalParts,
          totalCars: this.getActiveCarsCount()
        });

      }, (error) => {
        console.error('subscribeInventoryRealtime error:', error);
        UI.showToast('Ошибка realtime каталога', 'error');
        document.getElementById('loadingState')?.classList.add('hidden');
        document.getElementById('emptyState')?.classList.remove('hidden');
      });
  },

  /**
   * NEW: Realtime подписка на cars
   * Нужна для статистики "Авто в разборе"
   *
   * Важно: чтобы не требовать индексы — без orderBy и без сложных where-комбо.
   */
  subscribeCarsRealtime() {
    if (this._unsubCars) return;

    const db = firebase.firestore();

    this._unsubCars = db.collection('cars')
      .onSnapshot((snap) => {
        this.carsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // обновим stats (parts уже может быть посчитан по inventory)
        let totalParts = 0;
        this.catalog.products.forEach(p => totalParts += (p.stock || 0));

        UI.updateStats({
          totalParts,
          totalCars: this.getActiveCarsCount()
        });

      }, (err) => {
        console.error('subscribeCarsRealtime error:', err);
        UI.showToast('Ошибка realtime авто', 'error');
      });
  },

  /**
   * Авто "в разборе" считаем по статусу:
   * - если status не задан => считаем active
   * - если задан => active
   */
  getActiveCarsCount() {
    const cars = this.carsData || [];
    return cars.filter(c => {
      const s = String(c.status || 'active').toLowerCase();
      return s === 'active';
    }).length;
  },

  applyFilters() {
    let filtered = [...this.catalog.products];
    const f = this.catalog.filters;

    if (f.make) filtered = filtered.filter(p => p.carMake === f.make);
    if (f.model) filtered = filtered.filter(p => p.carModel === f.model);
    if (f.part) filtered = filtered.filter(p => p.partName === f.part);
    if (f.condition) filtered = filtered.filter(p => p.condition === f.condition);

    if (f.search) {
      const q = f.search.toLowerCase();
      filtered = filtered.filter(p =>
        (p.partName || '').toLowerCase().includes(q) ||
        (p.customTitle || '').toLowerCase().includes(q) || // NEW
        (p.carMake || '').toLowerCase().includes(q) ||
        (p.carModel || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }

    this.sortProducts(filtered);

    this.catalog.filteredProducts = filtered;
    this.catalog.totalPages = Math.max(1, Math.ceil(filtered.length / Config.itemsPerPage));
    this.catalog.currentPage = 1;

    this.renderPage();
  },

  /**
   * NEW: сортировка по цене учитывает скидку (priceFinal)
   */
  sortProducts(products) {
    switch (this.catalog.sort) {
      case 'price_asc':
        products.sort((a, b) => Utils.getPriceFinal(a) - Utils.getPriceFinal(b));
        break;

      case 'price_desc':
        products.sort((a, b) => Utils.getPriceFinal(b) - Utils.getPriceFinal(a));
        break;

      case 'name_asc':
        products.sort((a, b) => (a.partName || '').localeCompare(b.partName || ''));
        break;

      case 'newest':
      default:
        products.sort((a, b) => {
          const da = a.createdAt?.toDate?.() || new Date(0);
          const db = b.createdAt?.toDate?.() || new Date(0);
          return db - da;
        });
    }
  },

  renderPage() {
    const start = (this.catalog.currentPage - 1) * Config.itemsPerPage;
    const end = start + Config.itemsPerPage;
    const pageProducts = this.catalog.filteredProducts.slice(start, end);

    UI.renderProducts(pageProducts);
    UI.renderPagination(this.catalog.currentPage, this.catalog.totalPages, (page) => this.goToPage(page));
  },

  goToPage(page) {
    this.catalog.currentPage = page;
    this.renderPage();
    document.getElementById('catalogSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  resetFilters() {
    this.catalog.filters = { make: '', model: '', part: '', condition: '', search: '' };
    this.catalog.sort = 'newest';

    document.getElementById('filterMake').value = '';
    document.getElementById('filterModel').value = '';
    document.getElementById('filterModel').disabled = true;
    document.getElementById('filterPart').value = '';
    document.getElementById('filterCondition').value = '';
    document.getElementById('sortSelect').value = 'newest';
    document.getElementById('globalSearch').value = '';

    this.applyFilters();
  },

  showProductDetail(productId) {
    const product = this.catalog.products.find(p => p.id === productId);
    if (!product) {
      UI.showToast('Товар не найден', 'error');
      return;
    }

    // (опционально) title страницы
    try {
      document.title = `${Utils.getProductTitle(product)} — AutoParts`;
    } catch (_) {}

    UI.renderProductDetail(product);
    UI.openModal('productModal');
  },

  handleAuthChange(user, userData) {
    if (user && userData) {
      Reservations.validateCart();

      // если админ секция открыта
      if (userData.role === 'admin' && !document.getElementById('adminSection')?.classList.contains('hidden')) {
        window.Admin?.init?.();
      }
    }
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.addEventListener('error', (e) => console.error('Глобальная ошибка:', e.error));
window.addEventListener('unhandledrejection', (e) => console.error('Unhandled rejection:', e.reason));