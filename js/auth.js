const Auth = {
  currentUser: null,
  userData: null,
  onAuthStateChangedCallbacks: [],

  init() {
    this.bindEvents();
    this.listenAuthState();
  },

  bindEvents() {
    document.querySelectorAll('[data-auth-tab]').forEach(tab => {
      tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.authTab));
    });

    document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('registerForm')?.addEventListener('submit', (e) => this.handleRegister(e));

    // Профиль: всегда профиль
    document.getElementById('profileBtn')?.addEventListener('click', () => {
      if (!this.currentUser) return UI.openModal('authModal');
      UI.navigate('profile');
      this.renderProfile();
      Reservations.loadUserOrders();
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
  },

  listenAuthState() {
    firebase.auth().onAuthStateChanged(async (user) => {
      this.currentUser = user;

      if (user) {
        await this.loadUserData(user.uid);
        UI.updateProfileButton(user);

        // Показ/скрытие кнопки админки
        UI.setAdminButtonVisible(this.isAdmin());

        // Закроем auth modal если открыт
        UI.closeModal('authModal');

        // Если пользователь сейчас в профиле — обновим данные
        if (!document.getElementById('profileSection')?.classList.contains('hidden')) {
          this.renderProfile();
          Reservations.loadUserOrders();
        }
      } else {
        this.userData = null;
        UI.updateProfileButton(null);
        UI.setAdminButtonVisible(false);
      }

      this.onAuthStateChangedCallbacks.forEach(cb => cb(user, this.userData));
    });
  },

  async loadUserData(uid) {
    try {
      const doc = await firebase.firestore().collection('users').doc(uid).get();
      if (doc.exists) {
        this.userData = { id: doc.id, ...doc.data() };
      } else {
        // создаём документ пользователя
        await this.createUserDocument(this.currentUser, { name: '' });
      }
    } catch (e) {
      console.error('loadUserData error:', e);
    }
  },

  async createUserDocument(user, extra = {}) {
    const userData = {
      uid: user.uid,
      email: user.email,
      name: (extra.name || '').trim(),
      role: 'user', // админа назначай вручную в Firestore
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await firebase.firestore().collection('users').doc(user.uid).set(userData);
    this.userData = { id: user.uid, ...userData };
  },

  switchAuthTab(tab) {
    document.querySelectorAll('[data-auth-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.authTab === tab);
    });

    document.getElementById('loginForm')?.classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm')?.classList.toggle('hidden', tab !== 'register');

    this.clearErrors();
  },

  async handleLogin(e) {
    e.preventDefault();
    this.clearErrors();

    const form = e.target;
    const email = form.email.value.trim();
    const password = form.password.value;
    const errorEl = document.getElementById('loginError');
    const btn = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      errorEl.textContent = 'Заполните все поля';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Вход...';

    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      form.reset();
      UI.showToast('Добро пожаловать!', 'success');
    } catch (err) {
      console.error(err);
      errorEl.textContent = this.getErrorMessage(err.code);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    this.clearErrors();

    const form = e.target;
    const name = (form.name.value || '').trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;

    const errorEl = document.getElementById('registerError');
    const btn = form.querySelector('button[type="submit"]');

    if (!name || name.length < 2) {
      errorEl.textContent = 'Введите имя (минимум 2 символа)';
      return;
    }

    if (!email || !password || !confirmPassword) {
      errorEl.textContent = 'Заполните все поля';
      return;
    }

    if (!Utils.isValidEmail(email)) {
      errorEl.textContent = 'Некорректный email';
      return;
    }

    if (password.length < 6) {
      errorEl.textContent = 'Пароль должен быть не менее 6 символов';
      return;
    }

    if (password !== confirmPassword) {
      errorEl.textContent = 'Пароли не совпадают';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Регистрация...';

    try {
      const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await this.createUserDocument(result.user, { name });
      form.reset();
      UI.showToast('Регистрация успешна!', 'success');
    } catch (err) {
      console.error(err);
      errorEl.textContent = this.getErrorMessage(err.code);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Зарегистрироваться';
    }
  },

  async logout() {
    try {
      await firebase.auth().signOut();
      UI.navigate('home');
      UI.showToast('Вы вышли из аккаунта', 'info');
    } catch (e) {
      console.error(e);
      UI.showToast('Ошибка при выходе', 'error');
    }
  },

  renderProfile() {
    const emailEl = document.getElementById('profileEmail');
    const nameEl = document.getElementById('profileName');
    const roleEl = document.getElementById('profileRole');

    if (emailEl && this.currentUser) emailEl.textContent = this.currentUser.email;

    const name = this.userData?.name || (this.currentUser?.email ? this.currentUser.email.split('@')[0] : '—');
    if (nameEl) nameEl.textContent = name;

    if (roleEl) {
      roleEl.textContent = this.isAdmin() ? 'Администратор' : 'Клиент';
      roleEl.style.background = this.isAdmin() ? 'var(--color-success-light)' : 'var(--color-accent-light)';
      roleEl.style.color = this.isAdmin() ? 'var(--color-success)' : 'var(--color-accent)';
      roleEl.style.border = this.isAdmin()
        ? '1px solid rgba(22,163,74,0.25)'
        : '1px solid rgba(255,90,31,0.25)';
    }
  },

  isAdmin() {
    return this.userData?.role === 'admin';
  },

  isAuthenticated() {
    return !!this.currentUser;
  },

  getUser() {
    return this.currentUser;
  },

  getUserData() {
    return this.userData;
  },

  clearErrors() {
    const loginError = document.getElementById('loginError');
    const registerError = document.getElementById('registerError');
    if (loginError) loginError.textContent = '';
    if (registerError) registerError.textContent = '';
  },

  getErrorMessage(code) {
    const messages = {
      'auth/user-not-found': 'Пользователь не найден',
      'auth/wrong-password': 'Неверный пароль',
      'auth/email-already-in-use': 'Email уже используется',
      'auth/weak-password': 'Слишком слабый пароль',
      'auth/invalid-email': 'Некорректный email',
      'auth/user-disabled': 'Аккаунт заблокирован',
      'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
      'auth/network-request-failed': 'Ошибка сети. Проверьте подключение'
    };
    return messages[code] || 'Произошла ошибка. Попробуйте снова';
  },

  onAuthChanged(callback) {
    this.onAuthStateChangedCallbacks.push(callback);
  }
};

window.Auth = Auth;