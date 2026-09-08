// js/comparisonView.js

const ComparisonView = (function() {
    const selectedPlayerIds = new Set();
    let absChartInstance = null;
    let deltaChartInstance = null;

    async function init() {
        const statSelect = document.getElementById('compareStatSelect');

        // Populate stat select
        Object.keys(STAT_METADATA).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = STAT_METADATA[key].label;
            statSelect.appendChild(opt);
        });

        statSelect.addEventListener('change', render);
    }
    
    async function addPlayer(id, name) {
        if (selectedPlayerIds.size >= 5) {
            alert('Maximum 5 players can be compared.');
            return;
        }
        if (selectedPlayerIds.has(id)) {
            alert(name + ' is already added for comparison.');
            return;
        }
        
        UI.showLoader('Loading player...');
        await DataLoader.loadPlayer(id);
        UI.hideLoader();
        
        selectedPlayerIds.add(id);
        renderBadges();
        render();
    }

    function renderBadges() {
        const container = document.getElementById('compareSelectedPlayers');
        container.innerHTML = '';
        
        let colorIdx = 0;
        selectedPlayerIds.forEach(id => {
            const p = DataLoader.getPlayerFromCache(id);
            if (!p) return;
            
            const badge = document.createElement('div');
            badge.className = 'player-badge';
            badge.style.borderColor = ChartManager.COLORS[colorIdx % ChartManager.COLORS.length];
            
            badge.innerHTML = `
                <span style="color:${ChartManager.COLORS[colorIdx % ChartManager.COLORS.length]}">●</span>
                ${escapeHTML(p.name)}
                <span class="remove" data-id="${id}">×</span>
            `;
            
            badge.querySelector('.remove').addEventListener('click', (e) => {
                selectedPlayerIds.delete(Number(e.target.dataset.id));
                renderBadges();
                render();
            });
            
            container.appendChild(badge);
            colorIdx++;
        });
    }

    function refresh() {
        render();
    }

    function render() {
        const placeholder = document.getElementById('comparisonPlaceholder');
        const chartsSection = document.getElementById('comparisonCharts');
        
        if (selectedPlayerIds.size < 2) {
            placeholder.classList.remove('hidden');
            chartsSection.classList.add('hidden');
            return;
        }

        placeholder.classList.add('hidden');
        chartsSection.classList.remove('hidden');

        const statKey = document.getElementById('compareStatSelect').value;
        const statLabel = STAT_METADATA[statKey].label;

        const absDatasets = [];
        const deltaDatasets = [];
        const summaryData = [];

        let colorIdx = 0;

        selectedPlayerIds.forEach(id => {
            const p = DataLoader.getPlayerFromCache(id);
            if (!p) return;

            const entries = filterHistory(p.history, AppState.dateFrom, AppState.dateTo);
            if (entries.length === 0) return;

            const color = ChartManager.COLORS[colorIdx % ChartManager.COLORS.length];
            colorIdx++;

            const absData = entries.map(e => ({ x: getDatetime(e.date, e.stats.time), y: e.stats[statKey] || 0 }));
            absDatasets.push({
                label: p.name,
                data: absData,
                borderColor: color,
                backgroundColor: 'transparent',
                tension: 0.1
            });

            const deltas = calculateDeltas(entries, statKey);
            deltaDatasets.push({
                label: p.name,
                data: deltas.map(d => ({ x: d.date, y: d.delta })),
                backgroundColor: color
            });

            // Summary math
            const startVal = absData[0].y;
            const endVal = absData[absData.length - 1].y;
            const change = endVal - startVal;
            const days = Math.max(1, entries.length - 1);
            
            summaryData.push({
                name: p.name,
                startVal,
                endVal,
                change,
                avg: Math.round(change / days)
            });
        });

        if (absChartInstance) absChartInstance.destroy();
        if (deltaChartInstance) deltaChartInstance.destroy();

        absChartInstance = ChartManager.createAbsoluteChart('compareAbsoluteChart', absDatasets, `${statLabel} Comparison`);
        deltaChartInstance = ChartManager.createDeltaChart('compareDeltaChart', deltaDatasets, `${statLabel} Daily Change`);

        renderSummary(summaryData);
    }

    function renderSummary(data) {
        const tbody = document.getElementById('compareSummaryBody');
        tbody.innerHTML = '';
        
        data.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHTML(d.name)}</td>
                <td>${formatNumber(d.startVal)}</td>
                <td>${formatNumber(d.endVal)}</td>
                <td style="color: ${d.change >= 0 ? 'var(--green)' : 'var(--red)'}">${d.change > 0 ? '+' : ''}${formatNumber(d.change)}</td>
                <td>${d.avg > 0 ? '+' : ''}${formatNumber(d.avg)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Init on script load
    document.addEventListener('DOMContentLoaded', init);

    return { refresh, addPlayer };
})();
