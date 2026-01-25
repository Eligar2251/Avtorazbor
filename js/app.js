/**
 * Главный модуль приложения
 */
const App = {
    async init() {
        this.showLoading();

        try {
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK not loaded');
            }

            if (typeof auth === 'undefined' || typeof db === 'undefined') {
                throw new Error('Firebase not initialized');
            }

            Auth.init();
            Cart.init();
            await Catalog.init();

            Auth.subscribe(() => this.render());

            this.render();
            this.hideLoading();

            console.log('App initialized');
        } catch (e) {
            console.error('Init error:', e);
            this.showError(e.message);
        }
    },

    render() {
        this.renderHeader();
        this.renderMobileNav();
        this.renderHero();
        Catalog.render();
        this.renderAbout();
        this.renderContacts();
        this.renderFooter();
    },

    renderHeader() {
        const el = document.getElementById('header');
        const user = Auth.getUser();
        const userData = Auth.getUserData();
        const isAdmin = Auth.isAdmin();
        const cartCount = Cart.getCount();

        el.innerHTML = `
            <header class="header">
                <div class="header-inner">
                    <a href="#" class="logo" onclick="window.scrollTo({top:0,behavior:'smooth'});return false;">
                        <div class="logo-icon"><i class="fas fa-car"></i></div>
                        <span class="logo-text">АвтоРазбор</span>
                    </a>
                    
                    <div class="search-box" id="search-box">
                        <input type="text" placeholder="Поиск запчастей..." id="search-input">
                        <button onclick="App.doSearch()"><i class="fas fa-search"></i></button>
                    </div>
                    
                    <nav class="nav">
                        <a href="#catalog" class="nav-link">Каталог</a>
                        <a href="#about" class="nav-link">О нас</a>
                        <a href="#contacts" class="nav-link">Контакты</a>
                        
                        <button class="btn btn-primary cart-btn" onclick="Cart.openModal()">
                            <i class="fas fa-shopping-cart"></i>
                            ${cartCount > 0 ? `<span class="cart-badge">${cartCount}</span>` : ''}
                        </button>
                        
                        ${user ? `
                            <div class="user-menu">
                                <span class="user-name">${userData?.name || ''}</span>
                                ${isAdmin ? `
                                    <button class="btn btn-secondary btn-sm" onclick="Admin.open()">
                                        <i class="fas fa-cogs"></i>
                                    </button>
                                ` : ''}
                                <button class="btn btn-ghost btn-sm" onclick="App.logout()">
                                    <i class="fas fa-sign-out-alt"></i>
                                </button>
                            </div>
                        ` : `
                            <button class="btn btn-secondary" onclick="Auth.showLoginModal()">
                                <i class="fas fa-user"></i>
                                <span>Войти</span>
                            </button>
                        `}
                    </nav>
                    
                    <!-- Mobile buttons -->
                    <button class="search-toggle" onclick="App.toggleSearch()">
                        <i class="fas fa-search"></i>
                    </button>
                    
                    <button class="btn btn-primary cart-btn menu-btn-cart" onclick="Cart.openModal()" style="display:none;">
                        <i class="fas fa-shopping-cart"></i>
                        ${cartCount > 0 ? `<span class="cart-badge">${cartCount}</span>` : ''}
                    </button>
                    
                    <button class="menu-btn" onclick="App.toggleMobileNav()">
                        <i class="fas fa-bars"></i>
                    </button>
                </div>
            </header>
        `;

        // Search event
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    this.doSearch();
                    this.toggleSearch();
                }
            };
        }

        // Update mobile cart button visibility
        this.updateMobileUI();
    },

    renderMobileNav() {
        const user = Auth.getUser();
        const userData = Auth.getUserData();
        const isAdmin = Auth.isAdmin();

        let mobileNav = document.getElementById('mobile-nav');
        if (!mobileNav) {
            mobileNav = document.createElement('div');
            mobileNav.id = 'mobile-nav';
            mobileNav.className = 'mobile-nav';
            document.body.appendChild(mobileNav);
        }

        mobileNav.innerHTML = `
            <div class="mobile-nav-content">
                <div class="mobile-nav-header">
                    <span style="font-weight:600;font-size:16px;">Меню</span>
                    <button class="mobile-nav-close" onclick="App.toggleMobileNav()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                ${user ? `
                    <div class="mobile-nav-user">
                        <div class="mobile-nav-user-name">${userData?.name || 'Пользователь'}</div>
                        <div class="mobile-nav-user-email">${user.email}</div>
                    </div>
                ` : ''}
                
                <div class="mobile-nav-links">
                    <a href="#catalog" class="mobile-nav-link" onclick="App.toggleMobileNav()">
                        <i class="fas fa-th-large"></i>
                        Каталог
                    </a>
                    <a href="#about" class="mobile-nav-link" onclick="App.toggleMobileNav()">
                        <i class="fas fa-info-circle"></i>
                        О нас
                    </a>
                    <a href="#contacts" class="mobile-nav-link" onclick="App.toggleMobileNav()">
                        <i class="fas fa-phone"></i>
                        Контакты
                    </a>
                    
                    <div class="mobile-nav-divider"></div>
                    
                    <a href="#" class="mobile-nav-link" onclick="App.toggleMobileNav();Cart.openModal();">
                        <i class="fas fa-shopping-cart"></i>
                        Корзина
                        ${Cart.getCount() > 0 ? `<span class="badge badge-danger" style="margin-left:auto;">${Cart.getCount()}</span>` : ''}
                    </a>
                    
                    ${user ? `
                        ${isAdmin ? `
                            <a href="#" class="mobile-nav-link" onclick="App.toggleMobileNav();Admin.open();">
                                <i class="fas fa-cogs"></i>
                                Админ-панель
                            </a>
                        ` : ''}
                        <div class="mobile-nav-divider"></div>
                        <a href="#" class="mobile-nav-link" onclick="App.toggleMobileNav();App.logout();">
                            <i class="fas fa-sign-out-alt"></i>
                            Выйти
                        </a>
                    ` : `
                        <div class="mobile-nav-divider"></div>
                        <a href="#" class="mobile-nav-link" onclick="App.toggleMobileNav();Auth.showLoginModal();">
                            <i class="fas fa-sign-in-alt"></i>
                            Войти
                        </a>
                        <a href="#" class="mobile-nav-link" onclick="App.toggleMobileNav();Auth.showRegisterModal();">
                            <i class="fas fa-user-plus"></i>
                            Регистрация
                        </a>
                    `}
                </div>
            </div>
        `;

        // Close on backdrop click
        mobileNav.onclick = (e) => {
            if (e.target === mobileNav) {
                this.toggleMobileNav();
            }
        };
    },

    toggleMobileNav() {
        const nav = document.getElementById('mobile-nav');
        if (nav) {
            nav.classList.toggle('active');
            document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
        }
    },

    toggleSearch() {
        const searchBox = document.getElementById('search-box');
        if (searchBox) {
            searchBox.classList.toggle('active');
            if (searchBox.classList.contains('active')) {
                searchBox.querySelector('input').focus();
            }
        }
    },

    updateMobileUI() {
        // Show/hide mobile cart button based on screen size
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 767px) {
                .menu-btn-cart { display: flex !important; }
                .nav .cart-btn { display: none !important; }
            }
        `;
        document.head.appendChild(style);
    },

    doSearch() {
        const input = document.getElementById('search-input');
        const q = input ? input.value.trim() : '';
        if (q) {
            Catalog.search(q);
            document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
        }
    },

    updateCartBadge() {
        document.querySelectorAll('.cart-btn').forEach(btn => {
            const count = Cart.getCount();
            let badge = btn.querySelector('.cart-badge');

            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'cart-badge';
                    btn.appendChild(badge);
                }
                badge.textContent = count;
            } else if (badge) {
                badge.remove();
            }
        });

        // Update mobile nav
        this.renderMobileNav();
    },

    async logout() {
        await Auth.logout();
        Utils.toast('Вы вышли из аккаунта', 'info');
        this.render();
    },

    renderHero() {
        const el = document.getElementById('hero');
        el.innerHTML = `
            <section class="hero">
                <div class="hero-inner">
                    <div class="hero-content">
                        <h1 class="hero-title">Качественные <span>запчасти</span> для вашего авто</h1>
                        <p class="hero-text">Широкий выбор б/у и новых запчастей для ВАЗ и Toyota. Гарантия качества, честные цены.</p>
                        <div class="hero-btns">
                            <button class="btn btn-primary btn-lg" onclick="document.getElementById('catalog').scrollIntoView({behavior:'smooth'})">
                                <i class="fas fa-search"></i> Найти запчасть
                            </button>
                            <button class="btn btn-secondary btn-lg" onclick="document.getElementById('contacts').scrollIntoView({behavior:'smooth'})">
                                <i class="fas fa-phone"></i> Контакты
                            </button>
                        </div>
                        <div class="hero-stats">
                            <div class="stat">
                                <div class="stat-value" id="stat-parts">0</div>
                                <div class="stat-label">Запчастей</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value" id="stat-cars">0</div>
                                <div class="stat-label">Авто на разборе</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">100%</div>
                                <div class="stat-label">Гарантия</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        `;

        this.updateStats();
    },

    async updateStats() {
        try {
            const partsCount = Catalog.parts.reduce((s, p) => s + (p.quantity || 0), 0);
            const partsEl = document.getElementById('stat-parts');
            if (partsEl) partsEl.textContent = partsCount;

            const carsSnap = await db.collection(DB.CARS).get();
            const carsEl = document.getElementById('stat-cars');
            if (carsEl) carsEl.textContent = carsSnap.size;
        } catch (e) {
            console.error('Stats error:', e);
        }
    },

    renderAbout() {
        const el = document.getElementById('about');
        el.innerHTML = `
            <section class="about">
                <div class="about-inner">
                    <h2 class="section-title">О нашей компании</h2>
                    <p class="section-desc">Мы специализируемся на продаже качественных запчастей для автомобилей</p>
                    
                    <div class="features">
                        <div class="feature">
                            <div class="feature-icon"><i class="fas fa-check-circle"></i></div>
                            <h3 class="feature-title">Гарантия качества</h3>
                            <p class="feature-text">Все запчасти проверяются перед продажей</p>
                        </div>
                        <div class="feature">
                            <div class="feature-icon"><i class="fas fa-ruble-sign"></i></div>
                            <h3 class="feature-title">Честные цены</h3>
                            <p class="feature-text">Без скрытых платежей и накруток</p>
                        </div>
                        <div class="feature">
                            <div class="feature-icon"><i class="fas fa-truck"></i></div>
                            <h3 class="feature-title">Быстрая выдача</h3>
                            <p class="feature-text">Забронируйте и заберите в удобное время</p>
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    renderContacts() {
        const el = document.getElementById('contacts');
        el.innerHTML = `
            <section class="contacts">
                <div class="contacts-inner">
                    <h2 class="section-title">Контакты</h2>
                    <p class="section-desc">Свяжитесь с нами любым удобным способом</p>
                    
                    <div class="contacts-grid">
                        <div class="contact-card">
                            <h3><i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> Адрес</h3>
                            <div class="contact-row"><i class="fas fa-building"></i> г. Москва, ул. Примерная, 123</div>
                            <div class="contact-row"><i class="fas fa-clock"></i> Пн-Сб: 9:00 - 20:00</div>
                            <div class="contact-row"><i class="fas fa-clock"></i> Вс: 10:00 - 18:00</div>
                        </div>
                        <div class="contact-card">
                            <h3><i class="fas fa-phone" style="color:var(--primary)"></i> Связь</h3>
                            <div class="contact-row"><i class="fas fa-phone"></i> +7 (999) 999-99-99</div>
                            <div class="contact-row"><i class="fas fa-envelope"></i> info@autorazbor.ru</div>
                            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                                <a href="#" class="btn btn-ghost btn-sm"><i class="fab fa-whatsapp"></i> WhatsApp</a>
                                <a href="#" class="btn btn-ghost btn-sm"><i class="fab fa-telegram"></i> Telegram</a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    renderFooter() {
        const el = document.getElementById('footer');
        el.innerHTML = `
            <footer class="footer">
                <div class="footer-inner">
                    <div class="footer-copy">© 2024 АвтоРазбор. Все права защищены.</div>
                    <div class="footer-links">
                        <a href="#about">О нас</a>
                        <a href="#contacts">Контакты</a>
                    </div>
                </div>
            </footer>
        `;
    },

    showLoading() {
        const loading = document.createElement('div');
        loading.id = 'loading';
        loading.className = 'loading';
        loading.innerHTML = `
            <div class="spinner"></div>
            <div>Загрузка...</div>
        `;
        document.body.appendChild(loading);
    },

    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) loading.remove();
    },

    showError(message = 'Попробуйте обновить страницу') {
        this.hideLoading();
        document.body.innerHTML = `
            <div class="loading">
                <i class="fas fa-exclamation-triangle" style="font-size:48px;color:var(--danger);margin-bottom:16px;"></i>
                <h2>Ошибка загрузки</h2>
                <p style="color:var(--gray-500);margin:16px 0;text-align:center;padding:0 20px;">${message}</p>
                <button class="btn btn-primary" onclick="location.reload()">Обновить</button>
            </div>
        `;
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});