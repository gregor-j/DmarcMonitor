export function searchableSelect() {
    return {
        open: false,
        search: '',
        value: '',
        highlighted: 0,
        options: [],
        placeholder: '',
        init() {
            this.options = JSON.parse(this.$el.dataset.options);
            this.placeholder = this.$el.dataset.placeholder;
            this.$watch('search', () => { this.highlighted = 0; });
        },
        get filtered() {
            const term = this.search.trim().toLowerCase();

            return term === '' ? this.options : this.options.filter(option => option.label.toLowerCase().includes(term));
        },
        get selectedLabel() {
            return this.options.find(option => this.isSelected(option))?.label ?? this.placeholder;
        },
        isSelected(option) {
            return option.value === String(this.value ?? '');
        },
        toggle() {
            this.open ? this.close() : this.show();
        },
        show() {
            this.open = true;
            this.search = '';
            this.highlighted = Math.max(0, this.filtered.findIndex(option => this.isSelected(option)));
            this.$nextTick(() => {
                this.$refs.search.focus();
                this.scrollToHighlighted();
            });
        },
        close(refocus = false) {
            this.open = false;
            if (refocus) {
                this.$refs.button.focus();
            }
        },
        escape(event) {
            if (this.open) {
                event.stopPropagation();
                this.close(true);
            }
        },
        choose(option) {
            this.value = option.value;
            this.close(true);
        },
        chooseHighlighted() {
            const option = this.filtered[this.highlighted];
            if (option) {
                this.choose(option);
            }
        },
        move(step) {
            const count = this.filtered.length;
            if (count === 0) {
                return;
            }
            this.highlighted = (this.highlighted + step + count) % count;
            this.scrollToHighlighted();
        },
        scrollToHighlighted() {
            this.$nextTick(() => this.$refs.list.children[this.highlighted + 1]?.scrollIntoView({ block: 'nearest' }));
        },
    };
}
