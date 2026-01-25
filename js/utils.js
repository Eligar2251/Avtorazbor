/**
 * Утилиты
 */
const Utils = {
    
    // Генерация ID
    genId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // Генерация номера заказа
    genOrderNum() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `ORD-${year}${month}${day}-${rand}`;
    },

    // Форматирование цены
    formatPrice(n) {
        if (typeof n !== 'number') n = 0;
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0
        }).format(n);
    },

    // Форматирование даты
    formatDate(d, time = false) {
        if (!d) return '-';
        if (d.toDate) d = d.toDate();
        
        const opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
        if (time) {
            opts.hour = '2-digit';
            opts.minute = '2-digit';
        }
        return new Intl.DateTimeFormat('ru-RU', opts).format(new Date(d));
    },

    // Валидация телефона
    isValidPhone(p) {
        if (!p) return false;
        return /^[\d\s\-\+\(\)]{10,}$/.test(p);
    },

    // Форматирование телефона
    formatPhone(p) {
        if (!p) return '';
        const c = p.replace(/\D/g, '');
        if (c.length === 11) {
            return `+7 (${c.slice(1, 4)}) ${c.slice(4, 7)}-${c.slice(7, 9)}-${c.slice(9)}`;
        }
        return p;
    },

    // Debounce
    debounce(fn, ms) {
        let t;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    },

    // Toast уведомления
    toast(msg, type = 'info', duration = 3000) {
        const container = document.getElementById('toasts');
        if (!container) return;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info} toast-icon"></i>
            <span class="toast-text">${msg}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, duration);
    },

    // Загрузка изображения в Cloudinary
    async uploadImage(file) {
        if (!file) throw new Error('No file provided');
        
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', cloudinaryConfig.uploadPreset);
        
        const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;
        
        const res = await fetch(url, {
            method: 'POST',
            body: fd
        });
        
        if (!res.ok) {
            throw new Error('Upload failed');
        }
        
        const data = await res.json();
        return data.secure_url;
    },

    // Сохранение в localStorage
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('LocalStorage save error:', e);
            return false;
        }
    },

    // Загрузка из localStorage
    load(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            if (item === null) return defaultValue;
            return JSON.parse(item);
        } catch (e) {
            console.error('LocalStorage load error:', e);
            return defaultValue;
        }
    },

    // Удаление из localStorage
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('LocalStorage remove error:', e);
            return false;
        }
    },

    // Склонение слов
    plural(n, forms) {
        // forms = ['запчасть', 'запчасти', 'запчастей']
        const cases = [2, 0, 1, 1, 1, 2];
        const idx = (n % 100 > 4 && n % 100 < 20) ? 2 : cases[Math.min(n % 10, 5)];
        return forms[idx];
    }
};

console.log('Utils loaded');