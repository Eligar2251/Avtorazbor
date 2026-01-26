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
    return [
      item.carMake,
      item.carModel,
      item.year,
      item.bodyType,
      item.partName,
      item.condition
    ].join('|').toLowerCase();
  }
};

Object.freeze(Utils);
window.Utils = Utils;