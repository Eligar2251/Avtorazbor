/**
 * Index/Home Page Module
 */
const Index = {
    /**
     * Render home page
     */
    render() {
        return `
            <!-- Hero Section -->
            <section class="hero">
                <div class="hero-bg">
                    <div class="hero-overlay"></div>
                </div>
                <div class="container">
                    <div class="hero-content">
                        <h1 class="hero-title">
                            Качественные <span class="highlight">автозапчасти</span><br>
                            по доступным ценам
                        </h1>
                        <p class="hero-subtitle">
                            Б/У и новые запчасти для отечественных и импортных автомобилей. 
                            Гарантия качества на все товары.
                        </p>
                        <div class="hero-actions">
                            <button class="btn btn-primary btn-lg" data-action="go-catalog">
                                <i class="fas fa-search"></i>
                                Найти запчасть
                            </button>
                            <a href="tel:+79991234567" class="btn btn-outline btn-lg">
                                <i class="fas fa-phone"></i>
                                Позвонить
                            </a>
                        </div>
                        <div class="hero-stats">
                            <div class="hero-stat">
                                <span class="stat-value">10000+</span>
                                <span class="stat-text">Запчастей</span>
                            </div>
                            <div class="hero-stat">
                                <span class="stat-value">5000+</span>
                                <span class="stat-text">Клиентов</span>
                            </div>
                            <div class="hero-stat">
                                <span class="stat-value">10 лет</span>
                                <span class="stat-text">Опыта</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Quick Search Section -->
            <section class="quick-search">
                <div class="container">
                    <div class="search-box">
                        <h2>Быстрый поиск запчастей</h2>
                        <form id="quickSearchForm" class="search-form">
                            <div class="search-row">
                                <div class="form-group">
                                    <label>Марка</label>
                                    <select id="qsBrand" class="form-control" required>
                                        <option value="">Выберите марку</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Модель</label>
                                    <select id="qsModel" class="form-control" required disabled>
                                        <option value="">Сначала выберите марку</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Категория</label>
                                    <select id="qsCategory" class="form-control">
                                        <option value="">Все категории</option>
                                    </select>
                                </div>
                                <button type="submit" class="btn btn-primary btn-search">
                                    <i class="fas fa-search"></i>
                                    Найти
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </section>

            <!-- Brands Section -->
            <section class="brands-section">
                <div class="container">
                    <div class="section-header">
                        <h2>Популярные марки</h2>
                        <p>Запчасти для самых распространённых автомобилей</p>
                    </div>
                    <div class="brands-grid" id="brandsGrid">
                        <!-- Brands will be loaded here -->
                    </div>
                </div>
            </section>

            <!-- Featured Parts Section -->
            <section class="featured-section">
                <div class="container">
                    <div class="section-header">
                        <h2>Новые поступления</h2>
                        <a href="#" class="view-all-link" data-action="go-catalog">
                            Смотреть все <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                    <div class="parts-grid" id="featuredParts">
                        <div class="loading-placeholder">
                            <div class="loader-spinner"></div>
                            <p>Загрузка...</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Categories Section -->
            <section class="categories-section">
                <div class="container">
                    <div class="section-header">
                        <h2>Категории запчастей</h2>
                        <p>Удобная навигация по типам деталей</p>
                    </div>
                    <div class="categories-grid" id="categoriesGrid">
                        <!-- Categories will be loaded here -->
                    </div>
                </div>
            </section>

            <!-- Advantages Section -->
            <section class="advantages-section">
                <div class="container">
                    <div class="section-header">
                        <h2>Наши преимущества</h2>
                    </div>
                    <div class="advantages-grid">
                        <div class="advantage-card">
                            <div class="advantage-icon">
                                <i class="fas fa-shield-alt"></i>
                            </div>
                            <h3>Гарантия качества</h3>
                            <p>Проверяем каждую деталь перед продажей. Даём гарантию на все товары.</p>
                        </div>
                        <div class="advantage-card">
                            <div class="advantage-icon">
                                <i class="fas fa-ruble-sign"></i>
                            </div>
                            <h3>Честные цены</h3>
                            <p>Цены ниже рыночных на 30-50%. Без скрытых наценок и комиссий.</p>
                        </div>
                        <div class="advantage-card">
                            <div class="advantage-icon">
                                <i class="fas fa-clock"></i>
                            </div>
                            <h3>Бронирование</h3>
                            <p>Забронируйте товар онлайн и заберите в удобное время.</p>
                        </div>
                        <div class="advantage-card">
                            <div class="advantage-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <h3>Консультации</h3>
                            <p>Опытные специалисты помогут подобрать нужную запчасть.</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- CTA Section -->
            <section class="cta-section">
                <div class="container">
                    <div class="cta-content">
                        <h2>Не нашли нужную запчасть?</h2>
                        <p>Позвоните нам, и мы поможем найти любую деталь для вашего автомобиля</p>
                        <div class="cta-actions">
                            <a href="tel:+79991234567" class="btn btn-white btn-lg">
                                <i class="fas fa-phone"></i>
                                +7 (999) 123-45-67
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    /**
     * Initialize home page
     */
    async init() {
        this.loadBrands();
        this.loadCategories();
        this.loadFeaturedParts();
        this.setupEventListeners();
        this.initQuickSearch();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Go to catalog buttons
        document.querySelectorAll('[data-action="go-catalog"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                App.navigate('catalog');
            });
        });
    },

    /**
     * Load brands
     */
    loadBrands() {
        const grid = document.getElementById('brandsGrid');
        if (!grid) return;

        const icons = {
            'vaz': 'fas fa-car',
            'toyota': 'fas fa-car-side'
        };

        grid.innerHTML = App.brands.map(brand => `
            <div class="brand-card" data-brand="${brand.id}">
                <div class="brand-icon">
                    <i class="${icons[brand.id] || 'fas fa-car'}"></i>
                </div>
                <h3>${brand.name}</h3>
                <p>${brand.models.length} моделей</p>
            </div>
        `).join('');

        // Add click handlers
        grid.querySelectorAll('.brand-card').forEach(card => {
            card.addEventListener('click', () => {
                const brandId = card.dataset.brand;
                Catalog.setFilter('brandId', brandId);
                App.navigate('catalog');
            });
        });
    },

    /**
     * Load categories
     */
    loadCategories() {
        const grid = document.getElementById('categoriesGrid');
        if (!grid) return;

        const icons = {
            'exterior': 'fas fa-car',
            'engine': 'fas fa-cogs',
            'suspension': 'fas fa-truck-monster',
            'interior': 'fas fa-chair'
        };

        grid.innerHTML = App.partCategories.map(category => `
            <div class="category-card" data-category="${category.id}">
                <div class="category-icon">
                    <i class="${icons[category.id] || 'fas fa-wrench'}"></i>
                </div>
                <h3>${category.name}</h3>
                <p>${category.parts.length} типов деталей</p>
            </div>
        `).join('');

        // Add click handlers
        grid.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                const categoryId = card.dataset.category;
                Catalog.setFilter('categoryId', categoryId);
                App.navigate('catalog');
            });
        });
    },

    /**
     * Load featured parts
     */
    async loadFeaturedParts() {
        const container = document.getElementById('featuredParts');
        if (!container) return;

        try {
            const parts = await Database.getParts({ inStock: true });
            const featured = parts.slice(0, 8);

            if (featured.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-box-open"></i>
                        <p>Пока нет товаров</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = featured.map(part => Catalog.renderPartCard(part)).join('');
            Catalog.attachCardListeners(container);
        } catch (error) {
            console.error('Error loading featured parts:', error);
            container.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Ошибка загрузки</p>
                </div>
            `;
        }
    },

    /**
     * Initialize quick search form
     */
    initQuickSearch() {
        const brandSelect = document.getElementById('qsBrand');
        const modelSelect = document.getElementById('qsModel');
        const categorySelect = document.getElementById('qsCategory');
        const form = document.getElementById('quickSearchForm');

        if (!brandSelect || !modelSelect || !categorySelect || !form) return;

        // Populate brands
        brandSelect.innerHTML = '<option value="">Выберите марку</option>' +
            App.brands.map(brand => `<option value="${brand.id}">${brand.name}</option>`).join('');

        // Populate categories
        categorySelect.innerHTML = '<option value="">Все категории</option>' +
            App.partCategories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

        // Brand change handler
        brandSelect.addEventListener('change', () => {
            const brandId = brandSelect.value;
            const brand = App.brands.find(b => b.id === brandId);

            if (brand) {
                modelSelect.disabled = false;
                modelSelect.innerHTML = '<option value="">Выберите модель</option>' +
                    brand.models.map(model => `<option value="${model.id}">${model.name}</option>`).join('');
            } else {
                modelSelect.disabled = true;
                modelSelect.innerHTML = '<option value="">Сначала выберите марку</option>';
            }
        });

        // Form submit handler
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const filters = {};
            if (brandSelect.value) filters.brandId = brandSelect.value;
            if (modelSelect.value) filters.modelId = modelSelect.value;
            if (categorySelect.value) filters.categoryId = categorySelect.value;

            Object.keys(filters).forEach(key => {
                Catalog.setFilter(key, filters[key]);
            });

            App.navigate('catalog');
        });
    }
};

window.Index = Index;