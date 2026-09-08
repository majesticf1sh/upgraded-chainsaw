// js/playerView.js

const PlayerView = (function() {
    let currentPlayer = null;
    let chartInstances = [];

    async function loadAndRender(playerId) {
        document.getElementById('playerPlaceholder').classList.add('hidden');
        document.getElementById('playerContent').classList.add('hidden');
        UI.showLoader('Loading player data...');
        
        currentPlayer = await DataLoader.loadPlayer(playerId);
        
        UI.hideLoader();
        
        if (currentPlayer) {
            document.getElementById('playerContent').classList.remove('hidden');
            render();
        } else {
            document.getElementById('playerPlaceholder').classList.remove('hidden');
            document.getElementById('playerPlaceholder').textContent = 'Failed to load player data.';
        }
    }

    function refresh() {
        if (currentPlayer) {
            render();
        }
    }

    function render() {
        if (!currentPlayer) return;

        // Render Header
        const historyKeys = Object.keys(currentPlayer.history).sort();
        const latestDate = historyKeys[historyKeys.length - 1];
        const latestStats = currentPlayer.history[latestDate];

        document.getElementById('playerNameHeader').textContent = currentPlayer.name;
        document.getElementById('playerLevelDisplay').textContent = getLevelFromExp(latestStats.exp || 0);
        document.getElementById('playerIdDisplay').textContent = currentPlayer.id;
        document.getElementById('playerTownDisplay').textContent = latestStats.town || 'None';
        document.getElementById('playerAllianceDisplay').textContent = latestStats.alliance || 'None';
        
        const banDisplay = document.getElementById('playerBanDisplay');
        if (latestStats.bantype && latestStats.bantype !== 'no') {
            banDisplay.textContent = `🚫 Banned: ${latestStats.bantype}`;
            banDisplay.classList.remove('hidden');
        } else {
            banDisplay.classList.add('hidden');
        }

        // Filter dates
        const filteredEntries = filterHistory(currentPlayer.history, AppState.dateFrom, AppState.dateTo);
        
        renderOverview(filteredEntries);
        renderCharts(filteredEntries);
        renderTownLog(filteredEntries);
    }

    function renderOverview(entries) {
        const container = document.getElementById('playerStatsOverview');
        container.innerHTML = '';
        
        if (entries.length === 0) return;
        
        const startStats = entries[0].stats;
        const endStats = entries[entries.length - 1].stats;
        
        // Requested grouping
        const groups = [
            {
                title: "General Progress",
                stats: ['exp', 'tasksFinished', 'jobsFinished', 'completedQuests', 'buffsUsed']
            },
            {
                title: "Economy & Crafting",
                stats: ['craftedItems', 'amountDeposited', 'highestAmountDeposited', 'usedConstructionPoints', 'bountyOffered']
            },
            {
                title: "Combat",
                stats: ['duelExp', 'duelsWon', 'duelsLost', 'duelsAsChallenger', 'banditDuelsWon', 'banditDuelsExp', 'banditMaxDifficulty']
            }
        ];
        
        groups.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'dash-group';
            
            const title = document.createElement('h4');
            title.textContent = group.title;
            groupDiv.appendChild(title);
            
            group.stats.forEach(key => {
                const meta = STAT_METADATA[key];
                if (!meta) return;
                
                const startVal = startStats[key] || 0;
                const endVal = endStats[key] || 0;
                const delta = endVal - startVal;
                
                let deltaClass = 'delta-zero';
                let deltaSign = '';
                if (entries.length > 1) {
                    if (delta > 0) { deltaClass = 'delta-pos'; deltaSign = '+'; }
                    else if (delta < 0) { deltaClass = 'delta-neg'; }
                }
                
                const item = document.createElement('div');
                item.className = 'dash-stat';
                item.innerHTML = `
                    <span class="dash-stat-name">${meta.label}</span>
                    <div class="dash-stat-values">
                        <span class="dash-stat-total">${formatNumber(endVal)}</span>
                        <span class="dash-stat-delta ${deltaClass}">${deltaSign}${formatNumber(entries.length > 1 ? delta : 0)}</span>
                    </div>
                `;
                groupDiv.appendChild(item);
            });
            
            container.appendChild(groupDiv);
        });
    }

    function renderCharts(entries) {
        const container = document.getElementById('playerChartsContainer');
        container.innerHTML = ''; // clear existing
        
        // Destroy old chart instances
        chartInstances.forEach(c => c.destroy());
        chartInstances = [];

        if (entries.length === 0) {
            container.innerHTML = '<div class="placeholder-msg">No data available for the selected date range.</div>';
            return;
        }

        const dates = entries.map(e => e.date);

        CATEGORIES.forEach(category => {
            // Find stats for this category
            const statKeys = Object.keys(STAT_METADATA).filter(k => STAT_METADATA[k].category === category);
            
            // Build UI for category
            const catDiv = document.createElement('div');
            catDiv.className = 'category-group';
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'category-header';
            headerDiv.innerHTML = `<span>${category}</span> <span>▼</span>`;
            
            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'category-body';
            
            // Toggle logic
            headerDiv.addEventListener('click', () => {
                bodyDiv.classList.toggle('hidden');
                headerDiv.querySelector('span:last-child').textContent = bodyDiv.classList.contains('hidden') ? '▶' : '▼';
            });

            catDiv.appendChild(headerDiv);
            catDiv.appendChild(bodyDiv);

            statKeys.forEach(statKey => {
                const statMeta = STAT_METADATA[statKey];
                
                const rowDiv = document.createElement('div');
                rowDiv.className = 'chart-row';

                // Absolute Chart Container
                const absCard = document.createElement('div');
                absCard.className = 'chart-card';
                absCard.innerHTML = `
                    <button class="expand-chart-btn" title="Expand Chart">⛶</button>
                    <h4>${statMeta.label} (Absolute)</h4>
                    <div class="chart-wrapper"><canvas id="chart-abs-${statKey}"></canvas></div>
                `;
                rowDiv.appendChild(absCard);

                // Delta Chart Container
                const deltaCard = document.createElement('div');
                deltaCard.className = 'chart-card';
                deltaCard.innerHTML = `
                    <button class="expand-chart-btn" title="Expand Chart">⛶</button>
                    <h4>${statMeta.label} (Daily Progress)</h4>
                    <div class="chart-wrapper"><canvas id="chart-delta-${statKey}"></canvas></div>
                `;
                rowDiv.appendChild(deltaCard);

                bodyDiv.appendChild(rowDiv);
            });

            container.appendChild(catDiv);

            // Now render charts (must be attached to DOM)
            statKeys.forEach(statKey => {
                const statMeta = STAT_METADATA[statKey];
                
                const absData = entries.map(e => ({ x: getDatetime(e.date, e.stats.time), y: e.stats[statKey] || 0 }));
                const deltas = calculateDeltas(entries, statKey).map(d => ({ x: getDatetime(d.date, d.time), y: d.delta }));

                const absCtx = document.getElementById(`chart-abs-${statKey}`);
                const deltaCtx = document.getElementById(`chart-delta-${statKey}`);

                const absChart = ChartManager.createAbsoluteChart(`chart-abs-${statKey}`, [{
                    label: statMeta.label,
                    data: absData,
                    borderColor: ChartManager.DEFAULT_LINE_COLOR,
                    backgroundColor: ChartManager.DEFAULT_BG_COLOR,
                    fill: true
                }]);
                
                const deltaChart = ChartManager.createDeltaChart(`chart-delta-${statKey}`, [{
                    label: 'Change',
                    data: deltas,
                    backgroundColor: deltas.map(d => d.y >= 0 ? '#D4A853' : '#8B3A3A')
                }]);

                if (absChart) chartInstances.push(absChart);
                if (deltaChart) chartInstances.push(deltaChart);
            });
        });
    }

    function renderTownLog(entries) {
        const tbody = document.getElementById('townLogBody');
        tbody.innerHTML = '';

        if (entries.length === 0) return;

        let prevTown = null;
        let prevAlliance = null;
        let hasChanges = false;

        entries.forEach(entry => {
            const currTown = entry.stats.town || 'None';
            const currAlliance = entry.stats.alliance || 'None';

            // Check if there's a change (ignore first day as a change if we want just deltas, 
            // but usually we want to see the baseline if it's within range, let's show the first day state, 
            // then only changes)
            if (prevTown === null || currTown !== prevTown || currAlliance !== prevAlliance) {
                
                const tr = document.createElement('tr');
                
                const displayTown = (prevTown !== null && currTown === prevTown) ? '—' : escapeHTML(currTown);
                const displayAlliance = (prevAlliance !== null && currAlliance === prevAlliance) ? '—' : escapeHTML(currAlliance);

                tr.innerHTML = `
                    <td>${escapeHTML(entry.date)}</td>
                    <td>${displayTown}</td>
                    <td>${displayAlliance}</td>
                `;
                tbody.appendChild(tr);
                hasChanges = true;
            }

            prevTown = currTown;
            prevAlliance = currAlliance;
        });

        if (!hasChanges) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No changes recorded in this period.</td></tr>';
        }
    }

    return {
        loadAndRender,
        refresh
    };
})();
