import { Passkeys } from '@laravel/passkeys';
import { searchableSelect } from './searchable-select';

export function registerAlpineComponents(Alpine) {
    Alpine.data('passkeySignIn', () => ({
        loading: false,
        error: null,
        supported: Passkeys.isSupported(),
        async signIn() {
            this.error = null;
            this.loading = true;
            try {
                const remember = document.getElementById('remember').checked;
                const response = await Passkeys.verify({ remember });
                window.location.href = response.redirect;
            } catch (error) {
                this.loading = false;
                if (error?.name !== 'UserCancelledError') {
                    this.error = error?.message ?? this.$root.dataset.errorMessage;
                }
            }
        },
    }));

    Alpine.data('passkeyRegistration', () => ({
        name: '',
        loading: false,
        error: null,
        supported: Passkeys.isSupported(),
        async register() {
            this.error = null;
            this.loading = true;
            try {
                await Passkeys.register({ name: this.name });
                this.name = '';
                this.$wire.$refresh();
            } catch (error) {
                if (error?.message === 'Password confirmation required.') {
                    const url = new URL(this.$root.dataset.confirmUrl);
                    url.searchParams.set('redirect', window.location.pathname);
                    window.location.href = url.href;
                } else if (error?.name !== 'UserCancelledError') {
                    this.error = error?.message ?? this.$root.dataset.errorMessage;
                }
            } finally {
                this.loading = false;
            }
        },
    }));

    Alpine.data('navigation', () => ({
        open: false,
        dark: document.documentElement.classList.contains('dark'),
        installable: window.pwaInstall.available(),
        name: '',
        init() {
            this.name = this.$el.dataset.userName;
        },
        toggleDark() {
            this.dark = !this.dark;
            localStorage.theme = this.dark ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', this.dark);
            window.dispatchEvent(new CustomEvent('theme-changed', { detail: { dark: this.dark } }));
        },
        installApp() {
            return window.pwaInstall.prompt();
        },
    }));

    Alpine.data('modal', () => ({
        show: false,
        init() {
            this.$watch('show', shown => this.syncVisibility(shown));
            this.show = this.$el.dataset.show === 'true';
        },
        syncVisibility(shown) {
            document.body.classList.toggle('overflow-y-hidden', shown);
            if (shown && this.$root.hasAttribute('data-focusable')) {
                this.$nextTick(() => this.focusables()[0]?.focus());
            }
        },
        matches(event) {
            const name = Array.isArray(event.detail) ? event.detail[0] : event.detail;

            return name === this.$root.dataset.modal;
        },
        openModal(event) {
            if (this.matches(event)) this.show = true;
        },
        closeModal(event) {
            if (this.matches(event)) this.show = false;
        },
        focusables() {
            return [...this.$root.querySelectorAll('a, button, input:not([type="hidden"]), textarea, select, details, [tabindex]:not([tabindex="-1"])')]
                .filter(el => !el.hasAttribute('disabled'));
        },
        focusNext(event) {
            const elements = this.focusables();
            const index = elements.indexOf(document.activeElement);
            const offset = event.shiftKey ? -1 : 1;
            elements[(index + offset + elements.length) % elements.length]?.focus();
        },
        destroy() {
            if (this.show) document.body.classList.remove('overflow-y-hidden');
        },
    }));

    Alpine.data('spfEditor', () => ({
        init() {
            this.$watch('show', shown => {
                if (!shown) this.$wire.closeSpfEditor();
            });
        },
    }));

    Alpine.data('copyToClipboard', () => {
        let timeout;

        return {
            copied: false,
            async copy() {
                await navigator.clipboard.writeText(this.$root.dataset.copyText);
                clearTimeout(timeout);
                this.copied = true;
                timeout = setTimeout(() => { this.copied = false; }, 1500);
            },
            destroy() {
                clearTimeout(timeout);
            },
        };
    });

    Alpine.data('actionMessage', () => {
        let timeout;
        let stopListening;

        return {
            shown: false,
            init() {
                const target = this.$wire.$el;
                const event = this.$el.dataset.event;
                const reveal = () => {
                    clearTimeout(timeout);
                    this.shown = true;
                    timeout = setTimeout(() => { this.shown = false; }, 2000);
                };
                target.addEventListener(event, reveal);
                stopListening = () => target.removeEventListener(event, reveal);
            },
            destroy() {
                stopListening?.();
                clearTimeout(timeout);
            },
        };
    });

    Alpine.data('helpSearch', () => ({
        query: '',
        entries: [],
        init() {
            this.entries = JSON.parse(this.$el.dataset.entries);
        },
        get results() {
            const query = this.query.trim().toLowerCase();
            if (!query) return [];

            return this.entries.filter(entry =>
                entry.heading.toLowerCase().includes(query) ||
                entry.topic.toLowerCase().includes(query) ||
                entry.excerpt.toLowerCase().includes(query)
            );
        },
    }));

    Alpine.data('searchableSelect', searchableSelect);
}
