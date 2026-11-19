// js/playerView.js

const PlayerView = (function() {
    let currentPlayer = null;
    let chartInstances = [];
    let currentTownSpans = [];
    let townLogSortOrder = 'desc'; // 'desc' = Newest first, 'asc' = Oldest first
    let townLogHideHomeless = false;
    let townLogFilterByDateRange = false;
    let isTownLogInitialized = false;

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
        const townSpan = document.getElementById('playerTownDisplay');
        if (latestStats.town && latestStats.town_id) {
            townSpan.innerHTML = `<a href="#" class="town-link" data-id="${latestStats.town_id}">${escapeHTML(latestStats.town)}</a>`;
            townSpan.querySelector('.town-link').addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelector('.nav-tab[data-target="groupStatsView"]').click();
                if (typeof GroupStatsView !== 'undefined') {
                    GroupStatsView.loadGroupProfile(latestStats.town_id, 'townsStats');
                }
            });
        } else {
            townSpan.textContent = 'None';
        }

        const allianceSpan = document.getElementById('playerAllianceDisplay');
        if (latestStats.alliance && latestStats.alliance_id) {
            allianceSpan.innerHTML = `<a href="#" class="alliance-link" data-id="${latestStats.alliance_id}">${escapeHTML(latestStats.alliance)}</a>`;
            allianceSpan.querySelector('.alliance-link').addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelector('.nav-tab[data-target="groupStatsView"]').click();
                if (typeof GroupStatsView !== 'undefined') {
                    GroupStatsView.loadGroupProfile(latestStats.alliance_id, 'alliancesStats');
                }
            });
        } else {
            allianceSpan.textContent = 'None';
        }
        
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
        renderTownLog();
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

    function initTownLogListeners() {
        if (isTownLogInitialized) return;
        isTownLogInitialized = true;

        const sortBtn = document.getElementById('townLogSortBtn');
        const sortIcon = document.getElementById('townLogSortIcon');
        if (sortBtn) {
            sortBtn.addEventListener('click', () => {
                townLogSortOrder = (townLogSortOrder === 'desc' ? 'asc' : 'desc');
                if (sortIcon) {
                    sortIcon.textContent = townLogSortOrder === 'desc' ? '⬇ Newest First' : '⬆ Oldest First';
                }
                renderTownLogTable();
            });
        }

        const hideHomelessCheck = document.getElementById('townLogHideHomeless');
        if (hideHomelessCheck) {
            hideHomelessCheck.addEventListener('change', (e) => {
                townLogHideHomeless = e.target.checked;
                renderTownLogTable();
            });
        }

        const container = document.getElementById('townAllianceLogContainer');
        if (container) {
            container.addEventListener('click', (e) => {
                const townLink = e.target.closest('.town-link');
                if (townLink && townLink.dataset.id) {
                    e.preventDefault();
                    document.querySelector('.nav-tab[data-target="groupStatsView"]').click();
                    if (typeof GroupStatsView !== 'undefined') {
                        GroupStatsView.loadGroupProfile(Number(townLink.dataset.id), 'townsStats');
                    }
                    return;
                }
                const allianceLink = e.target.closest('.alliance-link');
                if (allianceLink && allianceLink.dataset.id) {
                    e.preventDefault();
                    document.querySelector('.nav-tab[data-target="groupStatsView"]').click();
                    if (typeof GroupStatsView !== 'undefined') {
                        GroupStatsView.loadGroupProfile(Number(allianceLink.dataset.id), 'alliancesStats');
                    }
                    return;
                }
            });
        }
    }

    function getCalendarDays(startDateStr, endDateStr) {
        const d1 = new Date(startDateStr);
        const d2 = new Date(endDateStr);
        const diffMs = Math.abs(d2 - d1);
        return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    }

    function computeTownSpans(history) {
        if (!history) return [];
        const dates = Object.keys(history).sort();
        if (dates.length === 0) return [];
        
        const spans = [];
        let currentSpan = null;
        
        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            const h = history[date];
            const townId = (h.town_id && h.town_id !== 0 && h.town_id !== '0') ? Number(h.town_id) : null;
            const townName = (h.town && h.town !== 'None' && h.town !== 'null') ? h.town.trim() : null;
            const allianceId = (h.alliance_id && h.alliance_id !== 0 && h.alliance_id !== '0') ? Number(h.alliance_id) : null;
            const allianceName = (h.alliance && h.alliance !== 'None' && h.alliance !== 'null') ? h.alliance.trim() : null;
            
            const isSameAffiliation = currentSpan &&
                currentSpan.townId === townId &&
                currentSpan.townName === townName &&
                currentSpan.allianceId === allianceId &&
                currentSpan.allianceName === allianceName;
                
            if (isSameAffiliation) {
                currentSpan.endDate = date;
                currentSpan.dates.push(date);
            } else {
                if (currentSpan) {
                    currentSpan.daysCount = getCalendarDays(currentSpan.startDate, currentSpan.endDate);
                    spans.push(currentSpan);
                }
                currentSpan = {
                    townId,
                    townName,
                    allianceId,
                    allianceName,
                    startDate: date,
                    endDate: date,
                    dates: [date],
                    daysCount: 1,
                    isCurrent: false,
                    sameTownAsPrev: currentSpan ? (currentSpan.townId === townId && townId !== null) : false
                };
            }
        }
        
        if (currentSpan) {
            currentSpan.daysCount = getCalendarDays(currentSpan.startDate, currentSpan.endDate);
            currentSpan.isCurrent = true;
            spans.push(currentSpan);
        }
        
        return spans;
    }

    function renderTownLogSummary(spans) {
        const summaryElem = document.getElementById('townLogSummary');
        if (!summaryElem) return;

        if (!spans || spans.length === 0) {
            summaryElem.innerHTML = '';
            return;
        }

        const latestSpan = spans[spans.length - 1];
        const townSpans = spans.filter(s => s.townId || s.townName);
        const uniqueTowns = new Set(townSpans.map(s => s.townId || s.townName));
        
        let longestSpan = null;
        townSpans.forEach(s => {
            if (!longestSpan || s.daysCount > longestSpan.daysCount) {
                longestSpan = s;
            }
        });

        const totalTrackedDays = getCalendarDays(spans[0].startDate, latestSpan.endDate);

        let currentAffilHtml = '';
        if (latestSpan && (latestSpan.townId || latestSpan.townName)) {
            currentAffilHtml = `
                <div class="summary-card-value">
                    <span>🏛️</span>
                    <a href="#" class="town-link" data-id="${latestSpan.townId}">${escapeHTML(latestSpan.townName)}</a>
                </div>
                <div class="summary-card-subtext">
                    ${latestSpan.allianceName 
                        ? `🛡️ <a href="#" class="alliance-link" data-id="${latestSpan.allianceId}">${escapeHTML(latestSpan.allianceName)}</a>` 
                        : '<span style="color: var(--text-muted);">No Alliance</span>'}
                </div>
            `;
        } else {
            currentAffilHtml = `
                <div class="summary-card-value" style="color: var(--text-muted);">
                    <span>🏕️</span> Townless / Wanderer
                </div>
                <div class="summary-card-subtext">No active town affiliation</div>
            `;
        }

        summaryElem.innerHTML = `
            <div class="town-log-summary-card">
                <span class="summary-card-label">Current Status</span>
                ${currentAffilHtml}
            </div>
            <div class="town-log-summary-card">
                <span class="summary-card-label">Towns Joined</span>
                <div class="summary-card-value">${uniqueTowns.size} ${uniqueTowns.size === 1 ? 'Town' : 'Towns'}</div>
                <div class="summary-card-subtext">${townSpans.length} total town stay${townSpans.length === 1 ? '' : 's'}</div>
            </div>
            <div class="town-log-summary-card">
                <span class="summary-card-label">Longest Stay</span>
                <div class="summary-card-value">${longestSpan ? longestSpan.daysCount + ' days' : '—'}</div>
                <div class="summary-card-subtext">${longestSpan ? escapeHTML(longestSpan.townName) : 'No town recorded'}</div>
            </div>
            <div class="town-log-summary-card">
                <span class="summary-card-label">Total History</span>
                <div class="summary-card-value">${totalTrackedDays} days</div>
                <div class="summary-card-subtext">${escapeHTML(spans[0].startDate)} ➔ ${escapeHTML(latestSpan.endDate)}</div>
            </div>
        `;
    }

    function renderTownLogTable() {
        const tbody = document.getElementById('townLogBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!currentTownSpans || currentTownSpans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">No town history available.</td></tr>';
            return;
        }

        let displaySpans = [...currentTownSpans];

        if (townLogFilterByDateRange) {
            const from = AppState.dateFrom || '0000-00-00';
            const to = AppState.dateTo || '9999-99-99';
            displaySpans = displaySpans.filter(s => s.startDate <= to && s.endDate >= from);
        }

        if (townLogHideHomeless) {
            displaySpans = displaySpans.filter(s => s.townId || s.townName);
        }

        if (townLogSortOrder === 'desc') {
            displaySpans.reverse();
        }

        if (displaySpans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">No records match the current filter settings.</td></tr>';
            return;
        }

        displaySpans.forEach(span => {
            const tr = document.createElement('tr');
            if (span.isCurrent) tr.className = 'row-current';

            const statusBadge = span.isCurrent
                ? '<span class="badge badge-current"><span class="status-dot"></span> Current</span>'
                : '<span class="badge badge-past">Past</span>';

            const periodHtml = `
                <div class="period-display">
                    <span class="period-start">${escapeHTML(span.startDate)}</span>
                    <span class="period-arrow">➔</span>
                    <span class="period-end ${span.isCurrent ? 'present-text' : ''}">
                        ${span.isCurrent ? 'Present' : escapeHTML(span.endDate)}
                    </span>
                </div>
                ${span.isCurrent ? `<span class="period-subtext">Latest: ${escapeHTML(span.endDate)}</span>` : ''}
            `;

            const durationHtml = `
                <span class="duration-pill ${span.daysCount >= 30 ? 'duration-long' : ''}">
                    ${span.daysCount} ${span.daysCount === 1 ? 'day' : 'days'}
                </span>
            `;

            let townHtml = '';
            if (span.townName) {
                townHtml = `
                    <div class="affiliation-cell">
                        <span class="affil-icon">🏛️</span>
                        <a href="#" class="town-link link-prominent" data-id="${span.townId}">${escapeHTML(span.townName)}</a>
                        ${span.sameTownAsPrev ? '<span class="badge badge-notice" title="Remained in town during alliance change">Alliance Change</span>' : ''}
                    </div>
                `;
            } else {
                townHtml = `
                    <div class="affiliation-cell homeless-cell">
                        <span class="affil-icon">🏕️</span>
                        <span class="homeless-text">Townless / Wanderer</span>
                    </div>
                `;
            }

            let allianceHtml = '';
            if (span.allianceName) {
                allianceHtml = `
                    <div class="affiliation-cell">
                        <span class="affil-icon">🛡️</span>
                        <a href="#" class="alliance-link" data-id="${span.allianceId}">${escapeHTML(span.allianceName)}</a>
                    </div>
                `;
            } else {
                allianceHtml = '<span class="text-muted">—</span>';
            }

            tr.innerHTML = `
                <td>${statusBadge}</td>
                <td>${periodHtml}</td>
                <td>${durationHtml}</td>
                <td>${townHtml}</td>
                <td>${allianceHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderTownLog() {
        initTownLogListeners();

        const dateFilterLabel = document.getElementById('townLogDateFilterLabel');
        const hasDateFilter = Boolean(AppState.dateFrom || AppState.dateTo);
        if (dateFilterLabel) {
            if (hasDateFilter) {
                dateFilterLabel.style.display = 'inline-flex';
                const fromText = AppState.dateFrom || 'Start';
                const toText = AppState.dateTo || 'End';
                dateFilterLabel.innerHTML = `<input type="checkbox" id="townLogDateFilterCheck" ${townLogFilterByDateRange ? 'checked' : ''}> In Range (${escapeHTML(fromText)} - ${escapeHTML(toText)})`;
                const check = document.getElementById('townLogDateFilterCheck');
                if (check) {
                    check.addEventListener('change', (e) => {
                        townLogFilterByDateRange = e.target.checked;
                        renderTownLogTable();
                    });
                }
            } else {
                dateFilterLabel.style.display = 'none';
                townLogFilterByDateRange = false;
            }
        }

        if (!currentPlayer || !currentPlayer.history) {
            currentTownSpans = [];
            renderTownLogSummary([]);
            renderTownLogTable();
            return;
        }

        currentTownSpans = computeTownSpans(currentPlayer.history);
        renderTownLogSummary(currentTownSpans);
        renderTownLogTable();
    }

    return {
        loadAndRender,
        refresh
    };
})();
