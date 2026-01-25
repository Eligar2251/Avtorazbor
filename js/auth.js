/**
 * Модуль аутентификации
 */
const Auth = {
    user: null,
    userData: null,
    listeners: [],

    // Init auth state listener
    init() {
        auth.onAuthStateChanged(async (user) => {
            this.user = user;
            if(user) {
                await this.loadUserData();
            } else {
                this.userData = null;
            }
            this.notify();
        });
    },

    // Load user data from Firestore
    async loadUserData() {
        if(!this.user) return;
        try {
            const doc = await db.collection(DB.USERS).doc(this.user.uid).get();
            if(doc.exists) {
                this.userData = doc.data();
            } else {
                // Create user doc
                this.userData = {
                    email: this.user.email,
                    name: this.user.displayName || '',
                    phone: '',
                    role: 'user',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection(DB.USERS).doc(this.user.uid).set(this.userData);
            }
        } catch(e) {
            console.error('Error loading user data:', e);
        }
    },

    // Subscribe to auth changes
    subscribe(fn) {
        this.listeners.push(fn);
    },

    notify() {
        this.listeners.forEach(fn => fn(this.user, this.userData));
    },

    // Is logged in
    isLoggedIn() {
        return !!this.user;
    },

    // Is admin
    isAdmin() {
        return this.userData?.role === 'admin';
    },

    // Get current user
    getUser() {
        return this.user;
    },

    // Get user data
    getUserData() {
        return this.userData;
    },

    // Register
    async register(email, password, name, phone) {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        
        await db.collection(DB.USERS).doc(cred.user.uid).set({
            email,
            name,
            phone,
            role: 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await this.loadUserData();
        return cred.user;
    },

    // Login
    async login(email, password) {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        await this.loadUserData();
        return cred.user;
    },

    // Logout
    async logout() {
        await auth.signOut();
        this.user = null;
        this.userData = null;
    },

    // Update profile
    async updateProfile(data) {
        if(!this.user) return;
        await db.collection(DB.USERS).doc(this.user.uid).update(data);
        this.userData = {...this.userData, ...data};
    },

    // Show login modal
    showLoginModal() {
        Modal.open({
            title: 'Вход в аккаунт',
            size: 'sm',
            content: `
                <form id="login-form">
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" class="form-input" name="email" required placeholder="email@example.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Пароль</label>
                        <input type="password" class="form-input" name="password" required placeholder="••••••••">
                    </div>
                    <div id="login-error" class="form-error hidden"></div>
                    <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;">
                        Войти
                    </button>
                </form>
                <div class="text-center mt-4">
                    <span style="color:var(--gray-500);font-size:14px;">Нет аккаунта?</span>
                    <button class="btn btn-ghost btn-sm" onclick="Modal.closeAll();Auth.showRegisterModal();">
                        Зарегистрироваться
                    </button>
                </div>
            `
        });

        document.getElementById('login-form').onsubmit = async (e) => {
            e.preventDefault();
            const form = e.target;
            const email = form.email.value;
            const password = form.password.value;
            const errEl = document.getElementById('login-error');
            const btn = form.querySelector('button[type="submit"]');
            
            btn.disabled = true;
            btn.textContent = 'Вход...';
            errEl.classList.add('hidden');
            
            try {
                await this.login(email, password);
                Modal.closeAll();
                Utils.toast('Добро пожаловать!', 'success');
                App.render();
            } catch(e) {
                errEl.textContent = 'Неверный email или пароль';
                errEl.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Войти';
            }
        };
    },

    // Show register modal
    showRegisterModal() {
        Modal.open({
            title: 'Регистрация',
            size: 'sm',
            content: `
                <form id="register-form">
                    <div class="form-group">
                        <label class="form-label required">Имя</label>
                        <input type="text" class="form-input" name="name" required placeholder="Иван Иванов">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Телефон</label>
                        <input type="tel" class="form-input" name="phone" required placeholder="+7 (999) 999-99-99">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Email</label>
                        <input type="email" class="form-input" name="email" required placeholder="email@example.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Пароль</label>
                        <input type="password" class="form-input" name="password" required minlength="6" placeholder="Минимум 6 символов">
                    </div>
                    <div id="register-error" class="form-error hidden"></div>
                    <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;">
                        Зарегистрироваться
                    </button>
                </form>
                <div class="text-center mt-4">
                    <span style="color:var(--gray-500);font-size:14px;">Уже есть аккаунт?</span>
                    <button class="btn btn-ghost btn-sm" onclick="Modal.closeAll();Auth.showLoginModal();">
                        Войти
                    </button>
                </div>
            `
        });

        document.getElementById('register-form').onsubmit = async (e) => {
            e.preventDefault();
            const form = e.target;
            const name = form.name.value.trim();
            const phone = form.phone.value.trim();
            const email = form.email.value.trim();
            const password = form.password.value;
            const errEl = document.getElementById('register-error');
            const btn = form.querySelector('button[type="submit"]');
            
            if(!Utils.isValidPhone(phone)) {
                errEl.textContent = 'Введите корректный номер телефона';
                errEl.classList.remove('hidden');
                return;
            }
            
            btn.disabled = true;
            btn.textContent = 'Регистрация...';
            errEl.classList.add('hidden');
            
            try {
                await this.register(email, password, name, phone);
                Modal.closeAll();
                Utils.toast('Регистрация успешна!', 'success');
                App.render();
            } catch(e) {
                let msg = 'Ошибка регистрации';
                if(e.code === 'auth/email-already-in-use') msg = 'Email уже используется';
                if(e.code === 'auth/weak-password') msg = 'Пароль слишком простой';
                if(e.code === 'auth/invalid-email') msg = 'Некорректный email';
                errEl.textContent = msg;
                errEl.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Зарегистрироваться';
            }
        };
    }
};