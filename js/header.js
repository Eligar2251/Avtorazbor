/**
 * Модуль Header
 * Управление шапкой сайта
 */

const Header = {
    /**
     * Инициализация
     */
    init() {
        this.render();
        this.bindEvents();
    },

    /**
     * Рендер шапки
     */
    render() {
        const header = document.getElementById('header');
        const isAdmin = Utils.isAdminLoggedIn();
        const cartCount = Cart.getCount();
        
        header.innerHTML = `
            <div class="header">
                <div class="header-container">
                    <!-- Logo -->
                    <a href="#" class="header-logo" onclick="App.navigateTo('home'); return false;">
                        <div class="header-logo-icon">
                            <i class="fas fa-car"></i>
                        </div>
                        <div class="header-logo-text">
                            <span class="header-logo-title">АвтоРазбор</span>
                            <span class="header-logo-subtitle">Запчасти с гарантией</span>
                        </div>
                    </a>
                    
                    <!-- Search -->
                    <div class="header-search">
                        <input 
                            type="text" 
                            class="header-search-input" 
                            placeholder="Поиск запчастей..." 
                            id="header-search-input"
                        >
                        <button class="header-search-btn" id="header-search-btn">
                            <i class="fas fa-search"></i>
                        </button>
                    </div>
                    
                    <!-- Navigation -->
                    <nav class="header-nav" id="header-nav">
                        <a href="#catalog" class="header-nav-link" data-section="catalog">
                            <i class="fas fa-th-large"></i>
                            <span>Каталог</span>
                        </a>
                        <a href="#about" class="header-nav-link" data-section="about">
                            <i class="fas fa-info-circle"></i>
                            <span>О нас</span>
                        </a>
                        <a href="#contact" class="header-nav-link" data-section="contact">
                            <i class="fas fa-phone"></i>
                            <span>Контакты</span>
                        </a>
                        
                        <button class="header-cart-btn" id="header-cart-btn">
                            <i class="fas fa-shopping-cart"></i>
                            <span>Корзина</span>
                            ${cartCount > 0 ? `<span class="header-cart-badge">${cartCount}</span>` : ''}
                        </button>
                        
                        <button class="header-admin-btn" id="header-admin-btn">
                            <i class="fas ${isAdmin ? 'fa-user-shield' : 'fa-lock'}"></i>
                            <span>${isAdmin ? 'Админ' : 'Вход'}</span>
                        </button>
                    </nav>
                    
                    <!-- Mobile Toggle -->
                    <button class="header-mobile-toggle" id="header-mobile-toggle">
                        <i class="fas fa-bars"></i>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Привязка событий
     */
    bindEvents() {
        // Поиск
        const searchInput = document.getElementById('header-search-input');
        const searchBtn = document.getElementById('header-search-btn');
        
        if (searchInput && searchBtn) {
            searchBtn.addEventListener('click', () => this.handleSearch());
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSearch();
            });
        }
        
        // Навигация
        document.querySelectorAll('.header-nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                if (section) {
                    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
        
        // Корзина
        const cartBtn = document.getElementById('header-cart-btn');
        if (cartBtn) {
            cartBtn.addEventListener('click', () => Cart.openModal());
        }
        
        // Админ
        const adminBtn = document.getElementById('header-admin-btn');
        if (adminBtn) {
            adminBtn.addEventListener('click', () => {
                if (Utils.isAdminLoggedIn()) {
                    Admin.openPanel();
                } else {
                    Admin.showLoginModal();
                }
            });
        }
        
        // Мобильное меню
        const mobileToggle = document.getElementById('header-mobile-toggle');
        const nav = document.getElementById('header-nav');
        
        if (mobileToggle && nav) {
            mobileToggle.addEventListener('click', () => {
                nav.classList.toggle('open');
                const icon = mobileToggle.querySelector('i');
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-times');
            });
        }
    },

    /**
     * Обработка поиска
     */
    handleSearch() {
        const input = document.getElementById('header-search-input');
        const query = input.value.trim();
        
        if (query) {
            Catalog.search(query);
            document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
        }
    },

    /**
     * Обновление счетчика корзины
     */
    updateCartBadge() {
        const cartBtn = document.getElementById('header-cart-btn');
        if (!cartBtn) return;
        
        const count = Cart.getCount();
        let badge = cartBtn.querySelector('.header-cart-badge');
        
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'header-cart-badge';
                cartBtn.appendChild(badge);
            }
            badge.textContent = count;
        } else if (badge) {
            badge.remove();
        }
    }
};

console.log('Header module loaded');