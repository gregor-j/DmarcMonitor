export function registerDashboardCharts(Alpine, Chart) {
    Alpine.data('dmarcTrendChart', () => {
        // Kept as a plain closure variable, NOT a returned property: Alpine deep-wraps
        // every property of an x-data object in a reactive Proxy, and Chart.js instances
        // are full of circular internal references (chart <-> scales <-> controllers),
        // which sends that Proxy into infinite recursion the moment anything touches it.
        let chart = null;

        // Days with far fewer messages than usual: a few failures there swing
        // the percentage a lot, so their points and line segments are faded.
        let lowVolume = [];

        const fade = (hex, alpha) => {
            const value = parseInt(hex.slice(1), 16);

            return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
        };

        const lowVolumeDays = (totals) => {
            if (!totals.length) return [];

            const sorted = [...totals].sort((a, b) => a - b);
            const middle = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

            return totals.map((total) => total < median * 0.2);
        };

        const lineStyle = (color) => ({
            borderColor: color,
            backgroundColor: color,
            pointBackgroundColor: (ctx) => lowVolume[ctx.dataIndex] ? fade(color, 0.35) : color,
            pointBorderColor: (ctx) => lowVolume[ctx.dataIndex] ? fade(color, 0.35) : color,
            pointRadius: (ctx) => lowVolume[ctx.dataIndex] ? 1.5 : 2,
            segment: {
                borderColor: (ctx) => lowVolume[ctx.p0DataIndex] || lowVolume[ctx.p1DataIndex] ? fade(color, 0.35) : undefined,
                borderDash: (ctx) => lowVolume[ctx.p0DataIndex] || lowVolume[ctx.p1DataIndex] ? [4, 3] : undefined,
            },
        });

        return {
            colors() {
                const dark = document.documentElement.classList.contains('dark');
                return {
                    dmarc: dark ? '#3987e5' : '#2a78d6',
                    spf: dark ? '#d95926' : '#eb6834',
                    dkim: dark ? '#199e70' : '#1baf7a',
                    volume: dark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.18)',
                    grid: dark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)',
                    ink: dark ? '#c3c2b7' : '#52514e',
                };
            },

            volumeAxisMax(data) {
                return Math.max(1, ...data.map((row) => row.total)) * 3;
            },

            init() {
                const initialData = JSON.parse(this.$el.dataset.trend);
                const c = this.colors();

                chart = new Chart(this.$el.querySelector('canvas'), {
                    type: 'line',
                    data: this.buildData(initialData, c),
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        onClick: (evt, elements) => {
                            if (!elements.length) return;

                            const date = chart.data.labels[elements[0].index];
                            this.$wire.call('selectDay', date);
                        },
                        onHover: (evt, elements) => {
                            evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                        },
                        scales: {
                            y: {
                                min: 0,
                                max: 100,
                                ticks: { color: c.ink, stepSize: 25, callback: (v) => v + '%' },
                                grid: { color: c.grid },
                                border: { display: false },
                            },
                            y1: {
                                position: 'right',
                                beginAtZero: true,
                                suggestedMax: this.volumeAxisMax(initialData),
                                ticks: { color: c.ink, precision: 0 },
                                grid: { drawOnChartArea: false },
                                border: { display: false },
                            },
                            x: {
                                ticks: { color: c.ink },
                                grid: { display: false },
                                border: { display: false },
                            },
                        },
                        plugins: {
                            legend: {
                                labels: {
                                    color: c.ink,
                                    usePointStyle: true,
                                    generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item) => ({
                                        ...item,
                                        pointStyle: chart.data.datasets[item.datasetIndex].type === 'bar' ? 'rect' : 'line',
                                    })),
                                },
                            },
                            tooltip: {
                                itemSort: (a, b) => (b.dataset.type === 'bar') - (a.dataset.type === 'bar'),
                                callbacks: {
                                    label: (ctx) => ctx.dataset.type === 'bar'
                                        ? `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`
                                        : `${ctx.dataset.label}: ${ctx.parsed.y}%`,
                                },
                            },
                        },
                    },
                });
            },

            destroy() {
                chart?.destroy();
            },

            buildData(data, c) {
                lowVolume = lowVolumeDays(data.map((row) => row.total));

                return {
                    labels: data.map((row) => row.date),
                    datasets: [
                        { label: 'DMARC', data: data.map((row) => row.dmarc_pass_pct), ...lineStyle(c.dmarc), tension: 0.25, borderWidth: 2, order: 0 },
                        { label: 'SPF', data: data.map((row) => row.spf_pass_pct), ...lineStyle(c.spf), tension: 0.25, borderWidth: 2, order: 0 },
                        { label: 'DKIM', data: data.map((row) => row.dkim_pass_pct), ...lineStyle(c.dkim), tension: 0.25, borderWidth: 2, order: 0 },
                        { type: 'bar', label: this.$root.dataset.messagesLabel, data: data.map((row) => row.total), yAxisID: 'y1', order: 1, backgroundColor: c.volume, borderWidth: 0, barPercentage: 0.9 },
                    ],
                };
            },

            update(data) {
                if (!chart) return;
                const c = this.colors();
                const fresh = this.buildData(data, c);
                chart.data.labels = fresh.labels;
                chart.data.datasets.forEach((ds, i) => { ds.data = fresh.datasets[i].data; });
                chart.options.scales.y1.suggestedMax = this.volumeAxisMax(data);
                chart.update();
            },

            restyle() {
                if (!chart) return;
                const c = this.colors();
                chart.options.scales.y.ticks.color = c.ink;
                chart.options.scales.y.grid.color = c.grid;
                chart.options.scales.y1.ticks.color = c.ink;
                chart.options.scales.x.ticks.color = c.ink;
                chart.options.plugins.legend.labels.color = c.ink;
                [c.dmarc, c.spf, c.dkim].forEach((color, i) => Object.assign(chart.data.datasets[i], lineStyle(color)));
                chart.data.datasets[3].backgroundColor = c.volume;
                chart.update();
            },
        };
    });

    Alpine.data('dmarcFailureChart', () => {
        // See dmarcTrendChart above for why this is a plain closure variable.
        let chart = null;

        // Slice order, matching buildData(); sent to selectFailureCategory() on click.
        const categories = ['both_pass', 'spf_fail_only', 'dkim_fail_only', 'both_fail'];

        return {
            isEmpty: true,
            selected: null,

            /**
             * Slice colours, with the slices other than the picked one faded
             * out so the active filter stands out.
             */
            sliceColors(c) {
                const colors = [c.bothPass, c.spfFailOnly, c.dkimFailOnly, c.bothFail];

                if (!this.selected) return colors;

                return colors.map((color, index) => categories[index] === this.selected ? color : `${color}40`);
            },

            sliceOffsets() {
                return categories.map((category) => category === this.selected ? 10 : 0);
            },

            colors() {
                const dark = document.documentElement.classList.contains('dark');
                return {
                    bothPass: dark ? '#199e70' : '#1baf7a',
                    spfFailOnly: dark ? '#d9a526' : '#eba834',
                    dkimFailOnly: dark ? '#d97726' : '#eb8a34',
                    bothFail: dark ? '#d94526' : '#eb5834',
                    ink: dark ? '#c3c2b7' : '#52514e',
                    border: dark ? '#1f2937' : '#ffffff',
                };
            },

            init() {
                const initialBreakdown = JSON.parse(this.$el.dataset.breakdown);
                this.isEmpty = initialBreakdown.total === 0;
                this.selected = this.$el.dataset.selected || null;
                const c = this.colors();

                chart = new Chart(this.$el.querySelector('canvas'), {
                    type: 'doughnut',
                    data: this.buildData(initialBreakdown, c),
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        // Room for the picked slice to pop out without being clipped.
                        layout: { padding: 10 },
                        onClick: (evt, elements) => {
                            if (!elements.length) return;

                            this.$wire.call('selectFailureCategory', categories[elements[0].index]);
                        },
                        onHover: (evt, elements) => {
                            evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                        },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: c.ink, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 12 },
                            },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => {
                                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                        const pct = total ? Math.round((ctx.parsed / total) * 1000) / 10 : 0;

                                        return `${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
                                    },
                                },
                            },
                        },
                    },
                });
            },

            destroy() {
                chart?.destroy();
            },

            buildData(breakdown, c) {
                return {
                    labels: ['Both pass', 'SPF fail only', 'DKIM fail only', 'Both fail'],
                    datasets: [{
                        data: categories.map((category) => breakdown[category]),
                        backgroundColor: this.sliceColors(c),
                        offset: this.sliceOffsets(),
                        borderColor: c.border,
                        borderWidth: 2,
                    }],
                };
            },

            update(breakdown, selected) {
                this.isEmpty = breakdown.total === 0;
                this.selected = selected ?? null;
                if (!chart) return;
                const c = this.colors();
                const fresh = this.buildData(breakdown, c);
                chart.data.datasets[0].data = fresh.datasets[0].data;
                chart.data.datasets[0].backgroundColor = fresh.datasets[0].backgroundColor;
                chart.data.datasets[0].offset = fresh.datasets[0].offset;
                chart.update();
            },

            restyle() {
                if (!chart) return;
                const c = this.colors();
                chart.options.plugins.legend.labels.color = c.ink;
                chart.data.datasets[0].backgroundColor = this.sliceColors(c);
                chart.data.datasets[0].borderColor = c.border;
                chart.update();
            },
        };
    });
}
