/**
 * Utils.js - утилиты
 */

const Utils = {
  formatPrice(price) {
    const n = Number(price);
    if (!Number.isFinite(n)) return '0 ₽';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n);
  },

  getProductTitle(product) {
    const custom = String(product?.customTitle || '').trim();
    if (custom) return custom;

    const part = String(product?.partName || '').trim();
    const make = String(product?.carMake || '').trim();
    const model = String(product?.carModel || '').trim();

    // ✅ ГОД НЕ ИСПОЛЬЗУЕМ
    return [part, make, model].filter(Boolean).join(' ').trim();
  },

  // скидка
  clampDiscountPercent(percent) {
    const n = Number(percent);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  },

  getDiscountPercent(obj) {
    return this.clampDiscountPercent(obj?.discountPercent ?? 0);
  },

  getPriceOriginal(obj) {
    const n = Number(obj?.priceOriginal ?? obj?.price ?? 0);
    return Number.isFinite(n) ? n : 0;
  },

  getPriceFinal(obj) {
    // если уже есть priceFinal (например, в корзине/заказе) — используем
    const pf = Number(obj?.priceFinal);
    if (Number.isFinite(pf) && pf >= 0) return Math.round(pf);

    const price = this.getPriceOriginal(obj);
    const d = this.getDiscountPercent(obj);

    if (price <= 0) return 0;
    if (d <= 0) return Math.round(price);

    const final = price * (1 - d / 100);
    return Math.max(0, Math.round(final));
  },

  maskPhoneInput(inputEl) {
    if (!inputEl) return;

    let digits = String(inputEl.value || '').replace(/\D/g, '');

    // Разрешаем ввод 10-11 цифр, но приводим к формату РФ
    // Если ввели 8XXXXXXXXXX -> заменяем на 7XXXXXXXXXX
    if (digits.startsWith('8')) digits = '7' + digits.slice(1);

    // Если ввели 9XXXXXXXXX (10 цифр без кода) -> добавим 7 в начало
    if (digits.length === 10) digits = '7' + digits;

    // Если совсем пусто — очищаем
    if (!digits.length) {
      inputEl.value = '';
      return;
    }

    // Если первая цифра не 7 — принудительно делаем 7
    if (!digits.startsWith('7')) digits = '7' + digits.replace(/^7+/, '').slice(0);

    digits = digits.slice(0, 11); // 7 + 10 цифр

    const p = digits.slice(1); // 10 цифр после 7

    let out = '+7';
    if (p.length > 0) out += ' (' + p.slice(0, 3);
    if (p.length >= 3) out += ') ' + p.slice(3, 6);
    if (p.length >= 6) out += '-' + p.slice(6, 8);
    if (p.length >= 8) out += '-' + p.slice(8, 10);

    inputEl.value = out;
  },

  // телефон
  normalizePhone(input) {
    const digits = String(input || '').replace(/\D/g, '');
    if (!digits) return null;

    let d = digits;

    // 8XXXXXXXXXX -> 7XXXXXXXXXX
    if (d.startsWith('8') && d.length === 11) d = '7' + d.slice(1);

    // 10 цифр без кода -> добавим 7
    if (d.length === 10) d = '7' + d;

    // Должно быть 11 цифр и начинаться с 7
    if (d.length !== 11) return null;
    if (!d.startsWith('7')) return null;

    // +7XXXXXXXXXX
    return '+' + d;
  },

  formatDate(date, includeTime = false) {
    if (!date) return '';
    const dateObj = date.toDate ? date.toDate() : new Date(date);
    if (Number.isNaN(dateObj.getTime())) return '';

    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }

    return new Intl.DateTimeFormat('ru-RU', options).format(dateObj);
  },

  generateOrderNumber() {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${yy}${mm}${dd}-${rnd}`;
  },

  debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  throttle(func, limit = 300) {
    let inThrottle = false;
    return function (...args) {
      if (inThrottle) return;
      inThrottle = true;
      func.apply(this, args);
      setTimeout(() => (inThrottle = false), limit);
    };
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  pluralize(number, words) {
    const n = Math.abs(Number(number)) || 0;
    const cases = [2, 0, 1, 1, 1, 2];
    const index = (n % 100 > 4 && n % 100 < 20) ? 2 : cases[Math.min(n % 10, 5)];
    return `${n} ${words[index]}`;
  },

  truncate(text, maxLength = 100) {
    const s = String(text || '');
    if (s.length <= maxLength) return s;
    return s.slice(0, maxLength).trim() + '...';
  },

  saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage недоступен:', e);
    }
  },

  loadFromStorage(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.warn('Ошибка чтения из LocalStorage:', e);
      return defaultValue;
    }
  },

  removeFromStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('Ошибка удаления из LocalStorage:', e);
    }
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async retry(fn, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await this.wait(delay * attempt);
      }
    }
  },

  isMobile() {
    return window.innerWidth < 768;
  },

  getBodyTypeName(bodyType) {
    return Config.bodyTypes?.[bodyType] || bodyType;
  },

  getConditionName(condition) {
    return { new: 'Новое', used: 'Б/У' }[condition] || condition;
  },

  formatCarName(car) {
    const parts = [car.carMake, car.carModel].filter(Boolean);
    if (car.year) parts.push(`(${car.year})`);
    if (car.restyling) parts.push('рестайлинг');
    return parts.join(' ');
  },

  createInventoryKey(item) {
    const norm = (v) => (v == null ? '' : String(v).trim());
    return [
      norm(item.carMake),
      norm(item.carModel),
      norm(item.year),
      norm(item.bodyType),
      norm(item.partName),
      norm(item.condition)
    ].join('|').toLowerCase();
  }
};

Object.freeze(Utils);
window.Utils = Utils;