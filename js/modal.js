/**
 * Модуль модальных окон
 */
const Modal = {
    stack: [],

    open(opts) {
        const {
            title = '',
            content = '',
            size = 'md',
            footer = null,
            onClose = null,
            sidebar = false
        } = opts;

        const id = Utils.genId();
        const container = document.getElementById('modals');

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.dataset.id = id;
        
        if(sidebar) {
            overlay.innerHTML = `
                <div class="modal-sidebar" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close" data-close><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">${content}</div>
                    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
                </div>
            `;
        } else {
            overlay.innerHTML = `
                <div class="modal modal-${size}" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close" data-close><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">${content}</div>
                    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
                </div>
            `;
        }

        container.appendChild(overlay);
        this.stack.push({id, onClose, overlay});

        // Close events
        overlay.onclick = () => this.close(id);
        overlay.querySelector('[data-close]').onclick = () => this.close(id);

        // ESC
        const escHandler = (e) => {
            if(e.key === 'Escape') {
                this.close(id);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.style.overflow = 'hidden';
        return id;
    },

    close(id) {
        const idx = this.stack.findIndex(m => m.id === id);
        if(idx === -1) return;

        const {overlay, onClose} = this.stack[idx];
        overlay.remove();
        this.stack.splice(idx, 1);

        if(onClose) onClose();
        if(this.stack.length === 0) document.body.style.overflow = '';
    },

    closeAll() {
        [...this.stack].forEach(m => this.close(m.id));
    },

    update(id, content) {
        const modal = document.querySelector(`[data-id="${id}"] .modal-body`);
        if(modal) modal.innerHTML = content;
    },

    updateFooter(id, footer) {
        const modal = document.querySelector(`[data-id="${id}"] .modal-footer`);
        if(modal) modal.innerHTML = footer;
    },

    async confirm(opts) {
        const {
            title = 'Подтверждение',
            message = 'Вы уверены?',
            confirmText = 'Подтвердить',
            cancelText = 'Отмена',
            type = 'warning'
        } = opts;

        return new Promise(resolve => {
            const colors = {warning:'var(--warning)',danger:'var(--danger)',success:'var(--success)'};
            const icons = {warning:'fa-exclamation-triangle',danger:'fa-trash',success:'fa-check-circle'};
            
            const id = this.open({
                title,
                size: 'sm',
                content: `
                    <div class="text-center">
                        <div style="width:64px;height:64px;border-radius:50%;background:${colors[type]}20;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                            <i class="fas ${icons[type]}" style="font-size:28px;color:${colors[type]}"></i>
                        </div>
                        <p style="color:var(--gray-600)">${message}</p>
                    </div>
                `,
                footer: `
                    <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
                    <button class="btn btn-${type === 'danger' ? 'danger' : 'primary'}" data-action="confirm">${confirmText}</button>
                `,
                onClose: () => resolve(false)
            });

            document.querySelector(`[data-id="${id}"] [data-action="cancel"]`).onclick = () => {
                this.close(id);
                resolve(false);
            };
            document.querySelector(`[data-id="${id}"] [data-action="confirm"]`).onclick = () => {
                this.close(id);
                resolve(true);
            };
        });
    }
};