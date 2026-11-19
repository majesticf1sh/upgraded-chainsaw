// js/groupStatsView.js

const GroupStatsView = (function() {
    let allPlayersData = [];
    let currentMode = 'townsStats'; // 'townsStats' or 'alliancesStats'
    let currentData = [];
    let sortCol = 'change';
    let sortDesc = true;
    let currentPage = 1;
    let currentProfileId = null;
    let currentProfileMode = null;
    const PAGE_SIZE = 50;

    // Roster state
    let rosterData = [];
    let rosterSortCol = 'change';
    let rosterSortDesc = true;
    let rosterFilter = 'current'; // 'current', 'departed', 'all'
    let rosterSearchQuery = '';

    // Waterfall state
    let waterfallData = [];
    let waterfallSearchQuery = '';
    let waterfallSortMode = 'activeDesc'; // 'activeDesc', 'idleDesc', 'rateDesc', 'name'
    let waterfallDatesInfo = { minTime: 0, totalTime: 1, sortedDates: [] };

    // Chart instances
    let groupAbsChartInst = null;
    let groupMemChartInst = null;
    let groupDeltaChartInst = null;
    let groupContributionChartInst = null;
    let groupLevelDistChartInst = null;

    async function loadAllData() {
        if (allPlayersData.length === 0) {
            UI.showLoader('Aggregating group stats...');
            document.getElementById('groupPlaceholder').classList.add('hidden');
            
            allPlayersData = await DataLoader.loadAllPlayers((loaded, total) => {
                UI.updateLoader(loaded, total);
            });
            UI.hideLoader();
        }
        
        document.getElementById('loadGroupStatsBtn').classList.add('hidden');
        document.getElementById('groupPlaceholder').classList.add('hidden');
        document.getElementById('groupTableContainer').classList.remove('hidden');
        processStats();
    }

    function init() {
        const statSelect = document.getElementById('groupStatSelect');
        Object.keys(STAT_METADATA).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            if (key === 'exp') opt.selected = true;
            opt.textContent = STAT_METADATA[key].label;
            statSelect.appendChild(opt);
        });

        document.getElementById('loadGroupStatsBtn').addEventListener('click', loadAllData);
        statSelect.addEventListener('change', () => {
            if (allPlayersData.length > 0) {
                processStats();
                if (currentProfileId) {
                    loadGroupProfile(currentProfileId, currentProfileMode);
                }
            }
        });
        
        document.getElementById('groupSearch').addEventListener('input', () => {
            currentPage = 1;
            renderTable();
        });

        const tabs = document.querySelectorAll('#groupTableContainer .group-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentMode = tab.dataset.target;
                if (allPlayersData.length > 0) {
                    currentPage = 1;
                    processStats();
                }
            });
        });

        document.getElementById('backToGroupListBtn').addEventListener('click', () => {
            currentProfileId = null;
            currentProfileMode = null;
            document.getElementById('groupProfileContent').classList.add('hidden');
            document.getElementById('groupTableContainer').classList.remove('hidden');
            document.querySelector('#groupStatsView .ranking-controls').classList.remove('hidden');
        });
        
        // Profile Sub-Tabs
        const profileTabs = document.querySelectorAll('#groupProfileTabs .group-tab');
        profileTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                profileTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                document.querySelectorAll('#groupProfileContent .activity-pane').forEach(p => p.classList.add('hidden'));
                const target = document.getElementById(tab.dataset.target);
                if (target) {
                    target.classList.remove('hidden');
                    // Trigger resize for charts if switching to charts tab
                    if (tab.dataset.target === 'groupChartsPane') {
                        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                    }
                }
            });
        });

        // Main table sorting
        document.querySelectorAll('.group-sort-header').forEach(th => {
            th.addEventListener('click', (e) => {
                const col = e.currentTarget.dataset.sort;
                if (sortCol === col) {
                    sortDesc = !sortDesc;
                } else {
                    sortCol = col;
                    sortDesc = true;
                }
                updateSortUI();
                sortData();
                renderTable();
            });
        });

        // Roster table sorting
        document.querySelectorAll('.roster-sort-header').forEach(th => {
            th.addEventListener('click', (e) => {
                const col = e.currentTarget.dataset.sort;
                if (rosterSortCol === col) {
                    rosterSortDesc = !rosterSortDesc;
                } else {
                    rosterSortCol = col;
                    rosterSortDesc = col !== 'name' && col !== 'rank';
                }
                updateRosterSortUI();
                sortRosterData();
                renderRosterTable();
            });
        });

        // Roster search filter
        const rosterSearchInput = document.getElementById('rosterSearch');
        if (rosterSearchInput) {
            rosterSearchInput.addEventListener('input', (e) => {
                rosterSearchQuery = e.target.value.toLowerCase().trim();
                renderRosterTable();
            });
        }

        // Roster filter buttons (Current / Departed / All)
        document.querySelectorAll('.roster-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.roster-filter-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                rosterFilter = e.currentTarget.dataset.filter;
                renderRosterTable();
            });
        });

        // Waterfall search filter
        const wfSearchInput = document.getElementById('waterfallSearch');
        if (wfSearchInput) {
            wfSearchInput.addEventListener('input', (e) => {
                waterfallSearchQuery = e.target.value.toLowerCase().trim();
                renderActivityWaterfall();
            });
        }

        // Waterfall sort select
        const wfSortSelect = document.getElementById('waterfallSortSelect');
        if (wfSortSelect) {
            wfSortSelect.addEventListener('change', (e) => {
                waterfallSortMode = e.target.value;
                renderActivityWaterfall();
            });
        }

        document.getElementById('groupPrevBtn').addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; renderTable(); }
        });
        document.getElementById('groupNextBtn').addEventListener('click', () => {
            const maxPage = Math.ceil(getFilteredData().length / PAGE_SIZE);
            if (currentPage < maxPage) { currentPage++; renderTable(); }
        });
    }

    function processStats() {
        const statKey = document.getElementById('groupStatSelect').value;
        const groupTotals = {}; // key: id -> { id, name, change, membersSet }

        allPlayersData.forEach(p => {
            if (!p || !p.history) return;
            const entries = filterHistory(p.history, AppState.dateFrom, AppState.dateTo);
            if (entries.length < 2) return;

            const globalDates = Object.keys(p.history).sort();
            const firstGlobalDate = globalDates[0];

            const deltas = calculateDeltas(entries, statKey);
            
            for (let i = 0; i < deltas.length; i++) {
                const d = deltas[i];
                const entry = entries[i + 1]; 
                
                if (firstGlobalDate === entries[0].date && i === 0 && firstGlobalDate !== '2026-08-22') {
                    continue; 
                }

                let groupId = currentMode === 'townsStats' ? entry.stats.town_id : entry.stats.alliance_id;
                let groupName = currentMode === 'townsStats' ? entry.stats.town : entry.stats.alliance;
                
                if (!groupId || !groupName) continue; 

                if (!groupTotals[groupId]) {
                    groupTotals[groupId] = { id: groupId, name: groupName, change: 0, membersSet: new Set() };
                } else {
                    groupTotals[groupId].name = groupName; // update to latest name
                }
                
                groupTotals[groupId].change += d.delta;
                groupTotals[groupId].membersSet.add(p.id);
            }
        });

        currentData = Object.values(groupTotals).map(g => ({
            id: g.id,
            name: g.name,
            change: g.change,
            members: g.membersSet.size
        }));

        sortData();
        updateSortUI();
        currentPage = 1;
        renderTable();
    }

    function sortData() {
        currentData.sort((a, b) => {
            let valA = a[sortCol];
            let valB = b[sortCol];
            
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    }

    function updateSortUI() {
        document.querySelectorAll('.group-sort-header').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === sortCol) {
                th.classList.add(sortDesc ? 'desc' : 'asc');
            }
        });
    }

    function getFilteredData() {
        const query = document.getElementById('groupSearch').value.toLowerCase();
        if (!query) return currentData;
        return currentData.filter(item => item.name.toLowerCase().includes(query));
    }

    function renderTable() {
        const tbody = document.getElementById('groupBody');
        tbody.innerHTML = '';
        
        const filtered = getFilteredData();
        const maxPage = Math.ceil(filtered.length / PAGE_SIZE) || 1;
        if (currentPage > maxPage) currentPage = maxPage;

        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        const pageData = filtered.slice(startIdx, endIdx);

        pageData.forEach((item, index) => {
            const tr = document.createElement('tr');
            const realRank = startIdx + index + 1;
            
            tr.innerHTML = `
                <td>#${realRank}</td>
                <td><a href="#" class="group-link" data-id="${item.id}">${escapeHTML(item.name)}</a></td>
                <td>${formatNumber(item.members)}</td>
                <td style="color: ${item.change >= 0 ? 'var(--gold)' : 'var(--red)'}">${item.change > 0 ? '+' : ''}${formatNumber(item.change)}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('groupPageInfo').textContent = `Page ${currentPage} of ${maxPage} (${filtered.length} ${currentMode === 'townsStats' ? 'Towns' : 'Alliances'})`;

        document.querySelectorAll('.group-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                loadGroupProfile(Number(e.currentTarget.dataset.id), currentMode);
            });
        });
    }

    // ==========================================
    // DETAILED GROUP PROFILE VIEW
    // ==========================================

    async function loadGroupProfile(groupId, mode) {
        if (allPlayersData.length === 0) {
            await loadAllData();
        }

        currentProfileId = groupId;
        currentProfileMode = mode;

        let groupInfo = currentData.find(g => g.id === groupId);
        if (!groupInfo) {
            // Find name from players history
            let foundName = null;
            for (const p of allPlayersData) {
                if (!p || !p.history) continue;
                for (const d in p.history) {
                    const s = p.history[d];
                    if (mode === 'townsStats' && s.town_id === groupId && s.town) {
                        foundName = s.town;
                        break;
                    } else if (mode === 'alliancesStats' && s.alliance_id === groupId && s.alliance) {
                        foundName = s.alliance;
                        break;
                    }
                }
                if (foundName) break;
            }
            if (!foundName) foundName = `${mode === 'townsStats' ? 'Town' : 'Alliance'} #${groupId}`;
            groupInfo = { id: groupId, name: foundName, change: 0, members: 0 };
        }

        // Show group profile view container
        document.getElementById('groupTableContainer').classList.add('hidden');
        document.querySelector('#groupStatsView .ranking-controls').classList.add('hidden');
        document.getElementById('groupProfileContent').classList.remove('hidden');

        // Header info
        document.getElementById('groupProfileName').textContent = groupInfo.name;
        document.getElementById('groupProfileTypeDisplay').textContent = mode === 'townsStats' ? 'Town' : 'Alliance';
        document.getElementById('groupProfileIdDisplay').textContent = groupId;

        const statKey = document.getElementById('groupStatSelect').value;
        const statLabel = STAT_METADATA[statKey] ? STAT_METADATA[statKey].label : 'Stat';
        document.getElementById('rosterStatHeader').textContent = `Current ${statLabel}`;

        // Find all player history entries relevant to this group
        const allDatesSet = new Set();
        const playersInGroup = []; 
        
        allPlayersData.forEach(p => {
            if (!p || !p.history) return;
            let wasInGroup = false;
            for (const date in p.history) {
                const s = p.history[date];
                if ((mode === 'townsStats' && s.town_id === groupId) || 
                    (mode === 'alliancesStats' && s.alliance_id === groupId)) {
                    wasInGroup = true;
                    allDatesSet.add(date);
                }
            }
            if (wasInGroup) playersInGroup.push(p);
        });

        let sortedDates = Array.from(allDatesSet).sort();
        if (AppState.dateFrom) sortedDates = sortedDates.filter(d => d >= AppState.dateFrom);
        if (AppState.dateTo) sortedDates = sortedDates.filter(d => d <= AppState.dateTo);

        if (sortedDates.length === 0) {
            sortedDates = Array.from(allDatesSet).sort();
        }

        // Timeline for charts with smooth carry-forward for missing scrape days
        const timelineLabels = [];
        const statData = [];
        const membersData = [];

        sortedDates.forEach(date => {
            timelineLabels.push(date);
            let dayStatTotal = 0;
            let memberCount = 0;

            playersInGroup.forEach(p => {
                // Find latest record on or before this date
                const pDatesBefore = Object.keys(p.history).filter(d => d <= date).sort();
                if (pDatesBefore.length === 0) return;
                const lastD = pDatesBefore[pDatesBefore.length - 1];
                const lastStats = p.history[lastD];

                const gId = mode === 'townsStats' ? lastStats.town_id : lastStats.alliance_id;
                if (gId === groupId) {
                    dayStatTotal += lastStats[statKey] || 0;
                    memberCount++;
                }
            });

            statData.push(dayStatTotal);
            membersData.push(memberCount);
        });

        // ==========================================
        // ACCURATE TRANSITION-BASED MEMBER LOG
        // ==========================================
        const memberLog = [];
        const fromDate = AppState.dateFrom || '0000-00-00';
        const toDate = AppState.dateTo || '9999-99-99';

        playersInGroup.forEach(p => {
            const pDates = Object.keys(p.history).sort();
            for (let i = 0; i < pDates.length; i++) {
                const d = pDates[i];
                const currStats = p.history[d];
                const prevStats = i > 0 ? p.history[pDates[i - 1]] : null;

                const currGId = mode === 'townsStats' ? currStats.town_id : currStats.alliance_id;
                const prevGId = prevStats ? (mode === 'townsStats' ? prevStats.town_id : prevStats.alliance_id) : null;

                // Joined transition:
                if (currGId === groupId && prevGId !== groupId) {
                    // Do not mark existing players as "Joined" on the very first day of recording
                    if (i > 0 || d !== '2026-08-22') {
                        if (d >= fromDate && d <= toDate) {
                            memberLog.push({ date: d, action: 'Joined', name: p.name, id: p.id });
                        }
                    }
                }
                // Left transition:
                else if (prevGId === groupId && currGId !== groupId) {
                    if (d >= fromDate && d <= toDate) {
                        memberLog.push({ date: d, action: 'Left', name: p.name, id: p.id });
                    }
                }
            }
        });

        // ==========================================
        // BUILD CITIZEN ROSTER
        // ==========================================
        rosterData = [];
        let latestAllianceName = null;
        let latestAllianceId = null;

        playersInGroup.forEach(p => {
            const globalDates = Object.keys(p.history).sort();
            const firstGlobalDate = globalDates[0];
            const pDates = globalDates.filter(d => sortedDates.includes(d));
            if (pDates.length === 0) return;

            const groupEntries = [];
            pDates.forEach(d => {
                const s = p.history[d];
                const gId = mode === 'townsStats' ? s.town_id : s.alliance_id;
                if (gId === groupId) {
                    groupEntries.push({ date: d, stats: s });
                }
            });

            if (groupEntries.length === 0) return;

            const lastRecordedEntry = groupEntries[groupEntries.length - 1];
            const firstRecordedEntry = groupEntries[0];

            // Is the player currently in town on their latest recorded date in range?
            const playerLatestDateInRange = pDates[pDates.length - 1];
            const playerLatestStatsInRange = p.history[playerLatestDateInRange];
            const currentGId = mode === 'townsStats' ? playerLatestStatsInRange.town_id : playerLatestStatsInRange.alliance_id;
            const isCurrent = currentGId === groupId;

            if (isCurrent && mode === 'townsStats' && playerLatestStatsInRange.alliance && playerLatestStatsInRange.alliance_id) {
                latestAllianceName = playerLatestStatsInRange.alliance;
                latestAllianceId = playerLatestStatsInRange.alliance_id;
            }

            let startVal = firstRecordedEntry.stats[statKey] || 0;
            const endVal = lastRecordedEntry.stats[statKey] || 0;

            // 1st Day exclusion rule
            if (firstGlobalDate === firstRecordedEntry.date && groupEntries.length > 1 && firstGlobalDate !== '2026-08-22') {
                startVal = groupEntries[1].stats[statKey] || 0;
            }

            const change = endVal - startVal;
            const percent = startVal > 0 ? (change / startVal) * 100 : 0;

            const level = getLevelFromExp(lastRecordedEntry.stats.exp || 0);
            const constrEnd = lastRecordedEntry.stats.usedConstructionPoints || 0;
            const constrStart = firstRecordedEntry.stats.usedConstructionPoints || 0;
            const constrDelta = constrEnd - constrStart;

            const duelsWon = lastRecordedEntry.stats.duelsWon || 0;
            const duelsLost = lastRecordedEntry.stats.duelsLost || 0;
            const duelsTotal = duelsWon + duelsLost;
            const duelWinRate = duelsTotal > 0 ? ((duelsWon / duelsTotal) * 100).toFixed(1) + '%' : '-';

            const bantype = lastRecordedEntry.stats.bantype || 'no';

            let status = 'active';
            if (bantype && bantype !== 'no') {
                status = 'banned';
            } else if (!isCurrent) {
                status = 'departed';
            } else if (change === 0) {
                status = 'idle';
            }

            rosterData.push({
                id: p.id,
                name: p.name,
                level,
                startVal,
                endVal,
                change,
                percent,
                construction: constrEnd,
                constructionDelta: constrDelta,
                duelsWon,
                duelsLost,
                duelWinRate,
                amountDeposited: lastRecordedEntry.stats.amountDeposited || 0,
                bantype,
                isCurrent,
                status
            });
        });

        // Set Alliance Meta info
        const allianceMetaElem = document.getElementById('groupProfileAllianceMeta');
        const allianceDisplayElem = document.getElementById('groupProfileAllianceDisplay');
        if (mode === 'townsStats') {
            allianceMetaElem.classList.remove('hidden');
            if (latestAllianceName && latestAllianceId) {
                allianceDisplayElem.innerHTML = `<a href="#" class="alliance-link" data-id="${latestAllianceId}">${escapeHTML(latestAllianceName)}</a>`;
                allianceDisplayElem.querySelector('.alliance-link').addEventListener('click', (e) => {
                    e.preventDefault();
                    loadGroupProfile(latestAllianceId, 'alliancesStats');
                });
            } else {
                allianceDisplayElem.textContent = 'None';
            }
            document.getElementById('allianceTownsTabBtn').classList.add('hidden');
        } else {
            allianceMetaElem.classList.add('hidden');
            document.getElementById('allianceTownsTabBtn').classList.remove('hidden');
        }

        // Summary Counts
        const currentCitizens = rosterData.filter(m => m.isCurrent);
        const currentCount = currentCitizens.length;
        const totalLevels = currentCitizens.reduce((acc, m) => acc + m.level, 0);
        const avgLevel = currentCount > 0 ? (totalLevels / currentCount) : 0;
        const minLevel = currentCount > 0 ? Math.min(...currentCitizens.map(m => m.level)) : 0;
        const maxLevel = currentCount > 0 ? Math.max(...currentCitizens.map(m => m.level)) : 0;

        document.getElementById('groupProfileCitizenCountDisplay').textContent = currentCount;
        document.getElementById('groupProfileAvgLevelDisplay').textContent = avgLevel.toFixed(1);
        document.getElementById('rosterTabCount').textContent = currentCount;

        // Render Dashboard Overview Cards
        renderOverviewDashboard({
            mode,
            statLabel,
            currentCount,
            avgLevel,
            minLevel,
            maxLevel,
            activeCount: currentCitizens.filter(m => m.status === 'active').length,
            idleCount: currentCitizens.filter(m => m.status === 'idle').length,
            bannedCount: currentCitizens.filter(m => m.status === 'banned').length,
            memberLog,
            rosterData,
            currentCitizens,
            sortedDates
        });

        // Render Citizens Roster Table
        sortRosterData();
        updateRosterSortUI();
        renderRosterTable();

        // Build Activity Waterfall Data
        buildActivityWaterfallData(playersInGroup, sortedDates);
        renderActivityWaterfall();

        // Render Charts
        renderGroupCharts({
            statLabel,
            timelineLabels,
            statData,
            membersData,
            rosterData: currentCitizens
        });

        // Render Member Log
        renderMemberLog(memberLog);

        // If Alliance, render Member Towns Tab
        if (mode === 'alliancesStats') {
            renderAllianceTowns(groupId, statKey, statLabel, sortedDates);
        }

        // Reset to first tab (Citizens Roster)
        document.querySelectorAll('#groupProfileTabs .group-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('#groupProfileTabs .group-tab[data-target="groupRosterPane"]').classList.add('active');
        document.querySelectorAll('#groupProfileContent .activity-pane').forEach(p => p.classList.add('hidden'));
        document.getElementById('groupRosterPane').classList.remove('hidden');
    }

    // ==========================================
    // TOP OVERVIEW DASHBOARD
    // ==========================================

    function renderOverviewDashboard(data) {
        const container = document.getElementById('groupProfileOverviewDashboard');
        container.innerHTML = '';

        const totalDelta = data.rosterData.reduce((acc, m) => acc + m.change, 0);
        const totalConstr = data.currentCitizens.reduce((acc, m) => acc + m.construction, 0);
        const totalConstrDelta = data.rosterData.reduce((acc, m) => acc + m.constructionDelta, 0);
        const totalDeposits = data.currentCitizens.reduce((acc, m) => acc + m.amountDeposited, 0);
        const totalDuelsWon = data.currentCitizens.reduce((acc, m) => acc + m.duelsWon, 0);
        const totalDuelsLost = data.currentCitizens.reduce((acc, m) => acc + m.duelsLost, 0);
        const totalDuels = totalDuelsWon + totalDuelsLost;
        const combinedWinRate = totalDuels > 0 ? ((totalDuelsWon / totalDuels) * 100).toFixed(1) + '%' : '-';

        const joinsCount = data.memberLog.filter(l => l.action === 'Joined').length;
        const leavesCount = data.memberLog.filter(l => l.action === 'Left').length;

        // Top contributor
        const sortedGainers = [...data.rosterData].sort((a, b) => b.change - a.change);
        const topContributor = sortedGainers.length > 0 && sortedGainers[0].change > 0 ? sortedGainers[0] : null;

        // Card 1: Population & Demographics
        const card1 = document.createElement('div');
        card1.className = 'dash-group';
        card1.innerHTML = `
            <h4>👥 Population & Demographics</h4>
            <div class="dash-stat">
                <span class="dash-stat-name">Active Citizens</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total">${data.currentCount}</span>
                    <span class="dash-stat-delta delta-pos">+${joinsCount} / -${leavesCount} in period</span>
                </div>
            </div>
            <div class="dash-stat">
                <span class="dash-stat-name">Average Citizen Level</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total">Lvl ${data.avgLevel.toFixed(1)}</span>
                    <span class="dash-stat-delta" style="color:var(--text-muted)">Range: Lvl ${data.minLevel} - ${data.maxLevel}</span>
                </div>
            </div>
            <div class="dash-stat">
                <span class="dash-stat-name">Citizen Activity</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total">${data.activeCount} Active</span>
                    <span class="dash-stat-delta" style="color:var(--text-muted)">${data.idleCount} Idle${data.bannedCount > 0 ? ` · <span style="color:var(--red)">${data.bannedCount} Banned</span>` : ''}</span>
                </div>
            </div>
        `;
        container.appendChild(card1);

        // Card 2: Period Growth
        const card2 = document.createElement('div');
        card2.className = 'dash-group';
        const avgDelta = data.currentCount > 0 ? Math.round(totalDelta / data.currentCount) : 0;
        card2.innerHTML = `
            <h4>📈 Period Growth (${data.statLabel})</h4>
            <div class="dash-stat">
                <span class="dash-stat-name">Total ${data.statLabel} Gained</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total" style="color:${totalDelta >= 0 ? 'var(--gold)' : 'var(--red)'}">${totalDelta > 0 ? '+' : ''}${formatNumber(totalDelta)}</span>
                    <span class="dash-stat-delta" style="color:var(--text-muted)">${data.sortedDates.length} days tracked</span>
                </div>
            </div>
            <div class="dash-stat">
                <span class="dash-stat-name">Avg Gain / Citizen</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total" style="color:${avgDelta >= 0 ? 'var(--gold)' : 'var(--red)'}">${avgDelta > 0 ? '+' : ''}${formatNumber(avgDelta)}</span>
                    <span class="dash-stat-delta" style="color:var(--text-muted)">per citizen</span>
                </div>
            </div>
            <div class="dash-stat">
                <span class="dash-stat-name">Top Contributor</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total">${topContributor ? escapeHTML(topContributor.name) : 'None'}</span>
                    <span class="dash-stat-delta delta-pos">${topContributor ? `+${formatNumber(topContributor.change)}` : '-'}</span>
                </div>
            </div>
        `;
        container.appendChild(card2);

        // Card 3: Town Legacy & Combat
        const card3 = document.createElement('div');
        card3.className = 'dash-group';
        card3.innerHTML = `
            <h4>🏛️ Town Legacy & Combat</h4>
            <div class="dash-stat">
                <span class="dash-stat-name">Construction Points</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total">${formatNumber(totalConstr)}</span>
                    <span class="dash-stat-delta delta-pos">${totalConstrDelta > 0 ? `+${formatNumber(totalConstrDelta)} in period` : '+0 in period'}</span>
                </div>
            </div>
            <div class="dash-stat">
                <span class="dash-stat-name">Duels Record</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total">${formatNumber(totalDuelsWon)} W / ${formatNumber(totalDuelsLost)} L</span>
                    <span class="dash-stat-delta" style="color:var(--accent)">${combinedWinRate} Win Rate</span>
                </div>
            </div>
            <div class="dash-stat">
                <span class="dash-stat-name">Bank Deposits Recorded</span>
                <div class="dash-stat-values">
                    <span class="dash-stat-total">$${formatNumber(totalDeposits)}</span>
                    <span class="dash-stat-delta" style="color:var(--text-muted)">cumulative</span>
                </div>
            </div>
        `;
        container.appendChild(card3);
    }

    // ==========================================
    // CITIZEN ROSTER TABLE
    // ==========================================

    function sortRosterData() {
        rosterData.sort((a, b) => {
            let valA = a[rosterSortCol];
            let valB = b[rosterSortCol];

            if (rosterSortCol === 'duels') {
                valA = a.duelsWon;
                valB = b.duelsWon;
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return rosterSortDesc ? 1 : -1;
            if (valA > valB) return rosterSortDesc ? -1 : 1;
            return 0;
        });
    }

    function updateRosterSortUI() {
        document.querySelectorAll('.roster-sort-header').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === rosterSortCol) {
                th.classList.add(rosterSortDesc ? 'desc' : 'asc');
            }
        });
    }

    function getFilteredRoster() {
        return rosterData.filter(m => {
            if (rosterFilter === 'current' && !m.isCurrent) return false;
            if (rosterFilter === 'departed' && m.isCurrent) return false;
            if (rosterSearchQuery && !m.name.toLowerCase().includes(rosterSearchQuery)) return false;
            return true;
        });
    }

    function renderRosterTable() {
        const tbody = document.getElementById('groupRosterBody');
        tbody.innerHTML = '';

        const filtered = getFilteredRoster();
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No citizens match the current filters.</td></tr>`;
            return;
        }

        filtered.forEach((m, idx) => {
            const tr = document.createElement('tr');
            
            let statusBadge = '';
            if (m.status === 'banned') {
                statusBadge = `<span class="badge ban-badge" title="Banned: ${m.bantype}">🚫 Banned</span>`;
            } else if (m.status === 'active') {
                statusBadge = `<span class="badge status-active">🟢 Active</span>`;
            } else if (m.status === 'departed') {
                statusBadge = `<span class="badge status-departed">🚪 Departed</span>`;
            } else {
                statusBadge = `<span class="badge status-idle">💤 Idle</span>`;
            }

            const pctText = (m.percent > 0 ? '+' : '') + m.percent.toFixed(1) + '%';
            const changeHtml = `<span style="color: ${m.change >= 0 ? 'var(--gold)' : 'var(--red)'}">${m.change > 0 ? '+' : ''}${formatNumber(m.change)}</span> <span style="font-size:0.8rem; color:var(--text-muted);">(${pctText})</span>`;
            const constrHtml = `${formatNumber(m.construction)} ${m.constructionDelta > 0 ? `<span style="color:var(--green); font-size:0.8rem;">(+${formatNumber(m.constructionDelta)})</span>` : ''}`;

            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td>
                    <a href="#" class="player-link" data-id="${m.id}">${escapeHTML(m.name)}</a>
                </td>
                <td><span style="font-weight:600; color:var(--gold);">Lvl ${m.level}</span></td>
                <td>${formatNumber(m.endVal)}</td>
                <td>${changeHtml}</td>
                <td>${constrHtml}</td>
                <td>${formatNumber(m.duelsWon)} / ${formatNumber(m.duelsLost)} <span style="font-size:0.8rem; color:var(--text-muted);">(${m.duelWinRate})</span></td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });

        // Attach click handler to player links to navigate directly to their Player View
        tbody.querySelectorAll('.player-link').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = Number(e.currentTarget.dataset.id);
                document.getElementById('playerSearch').value = e.currentTarget.textContent.trim();
                document.querySelector('.nav-tab[data-target="playerView"]').click();
                if (typeof PlayerView !== 'undefined') {
                    PlayerView.loadAndRender(id);
                }
            });
        });
    }

    // ==========================================
    // ACTIVITY WATERFALL (TOWN VIEW)
    // ==========================================

    function buildActivityWaterfallData(playersInGroup, sortedDates) {
        if (sortedDates.length === 0) {
            waterfallData = [];
            return;
        }

        const minTime = new Date(sortedDates[0]).getTime();
        const maxTime = new Date(sortedDates[sortedDates.length - 1]).getTime() + 86400000;
        const totalTime = maxTime - minTime || 86400000;
        waterfallDatesInfo = { minTime, totalTime, sortedDates };

        waterfallData = [];

        playersInGroup.forEach(p => {
            const allPDates = Object.keys(p.history).sort();
            if (allPDates.length === 0) return;

            const firstPlayerDate = allPDates[0];
            const lastPlayerDate = allPDates[allPDates.length - 1];

            // Build daily status for each date in sortedDates
            let segments = [];
            let currentSegment = null;
            let activeDays = 0;
            let idleDays = 0;
            let bannedDays = 0;

            sortedDates.forEach((d) => {
                // If this date is outside player's lifetime
                if (d < firstPlayerDate || d > lastPlayerDate) {
                    if (currentSegment) {
                        segments.push(currentSegment);
                        currentSegment = null;
                    }
                    return;
                }

                const s = p.history[d];
                let type = 'idle';
                let bantype = null;
                let dayExpGain = 0;

                if (s) {
                    if (s.bantype && s.bantype !== 'no') {
                        type = 'banned';
                        bantype = s.bantype;
                    } else {
                        // Compare against previous available day
                        const dIdx = allPDates.indexOf(d);
                        const prevStats = dIdx > 0 ? p.history[allPDates[dIdx - 1]] : null;
                        if (prevStats) {
                            const deltaExp = (s.exp || 0) - (prevStats.exp || 0);
                            const deltaTasks = (s.tasksFinished || 0) - (prevStats.tasksFinished || 0);
                            const deltaDuels = ((s.duelsWon || 0) + (s.duelsLost || 0)) - ((prevStats.duelsWon || 0) + (prevStats.duelsLost || 0));
                            const deltaConstr = (s.usedConstructionPoints || 0) - (prevStats.usedConstructionPoints || 0);
                            const deltaJobs = (s.jobsFinished || 0) - (prevStats.jobsFinished || 0);
                            const deltaCraft = (s.craftedItems || 0) - (prevStats.craftedItems || 0);

                            if (deltaExp > 0 || deltaTasks > 0 || deltaDuels > 0 || deltaConstr > 0 || deltaJobs > 0 || deltaCraft > 0) {
                                type = 'active';
                                dayExpGain = Math.max(0, deltaExp);
                            } else {
                                type = 'idle';
                            }
                        } else {
                            // First day of tracking
                            type = 'active';
                        }
                    }
                } else {
                    // Missing scrape between first and last date -> treated as idle
                    type = 'idle';
                }

                if (type === 'active') activeDays++;
                else if (type === 'idle') idleDays++;
                else if (type === 'banned') bannedDays++;

                // Merge into continuous segments
                if (!currentSegment) {
                    currentSegment = { start: d, end: d, type, bantype, expGain: dayExpGain };
                } else if (currentSegment.type === type && currentSegment.bantype === bantype) {
                    currentSegment.end = d;
                    currentSegment.expGain = (currentSegment.expGain || 0) + dayExpGain;
                } else {
                    segments.push(currentSegment);
                    currentSegment = { start: d, end: d, type, bantype, expGain: dayExpGain };
                }
            });

            if (currentSegment) {
                segments.push(currentSegment);
            }

            const totalTracked = activeDays + idleDays;
            const activityRate = totalTracked > 0 ? (activeDays / totalTracked) * 100 : 0;

            waterfallData.push({
                id: p.id,
                name: p.name,
                segments,
                activeDays,
                idleDays,
                bannedDays,
                activityRate
            });
        });
    }

    function renderActivityWaterfall() {
        const container = document.getElementById('groupWaterfallContainer');
        if (!container) return;
        container.innerHTML = '';

        if (waterfallData.length === 0 || waterfallDatesInfo.sortedDates.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No activity data available for this range.</div>';
            return;
        }

        const { minTime, totalTime, sortedDates } = waterfallDatesInfo;

        // Filter by search query
        let list = waterfallData;
        if (waterfallSearchQuery) {
            list = list.filter(p => p.name.toLowerCase().includes(waterfallSearchQuery));
        }

        // Sort list
        list = [...list].sort((a, b) => {
            if (waterfallSortMode === 'activeDesc') return b.activeDays - a.activeDays;
            if (waterfallSortMode === 'idleDesc') return b.idleDays - a.idleDays;
            if (waterfallSortMode === 'rateDesc') return b.activityRate - a.activityRate;
            if (waterfallSortMode === 'name') return a.name.localeCompare(b.name);
            return 0;
        });

        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No players match the search filter.</div>';
            return;
        }

        // Axis Header
        let html = '<div class="wf-header" style="position: relative; height: 32px;"><div class="wf-name" style="font-weight:600; color:var(--accent);">Player / Activity</div><div style="position: relative; flex-grow: 1;">';
        const numTicks = 4;
        for (let i = 0; i <= numTicks; i++) {
            const perc = (i / numTicks);
            const t = minTime + totalTime * perc;
            const label = new Date(t).toISOString().split('T')[0];
            let transform = 'translateX(-50%)';
            if (i === 0) transform = 'translateX(0)';
            if (i === numTicks) transform = 'translateX(-100%)';
            html += `<div class="wf-axis-label" style="left: ${perc * 100}%; transform: ${transform}; font-weight:500;">${label}</div>`;
        }
        html += '</div></div>';

        // Rows
        list.forEach(p => {
            html += '<div class="wf-row">';
            html += `<div class="wf-name">
                <a href="#" class="player-link" data-id="${p.id}" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</a>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    <span style="color:var(--green); font-weight:600;">${p.activeDays}d</span> active · <span>${p.idleDays}d</span> idle (${p.activityRate.toFixed(0)}%)
                </div>
            </div>`;
            html += '<div class="wf-timeline">';

            p.segments.forEach(seg => {
                const sTime = new Date(seg.start).getTime();
                const eTime = new Date(seg.end).getTime() + 86400000;

                const left = Math.max(0, (sTime - minTime) / totalTime * 100);
                const right = Math.min(100, (eTime - minTime) / totalTime * 100);
                const width = Math.max(0.6, right - left);
                const days = Math.round((eTime - sTime) / 86400000);

                let cssClass = 'wf-idle';
                let tooltip = `Idle (${days} days)\n${seg.start} to ${seg.end}\nNo progress recorded`;

                if (seg.type === 'active') {
                    cssClass = 'wf-active';
                    tooltip = `Active (${days} days)\n${seg.start} to ${seg.end}\nExp gained: +${formatNumber(seg.expGain || 0)}`;
                } else if (seg.type === 'banned') {
                    cssClass = 'wf-banned';
                    tooltip = `Banned: ${seg.bantype || 'banned'} (${days} days)\n${seg.start} to ${seg.end}`;
                }

                const label = width > 4 ? `${days}d` : '';
                html += `<div class="wf-bar ${cssClass}" style="left: ${left}%; width: ${width}%; min-width: 0;" title="${tooltip}">${label}</div>`;
            });

            html += '</div></div>';
        });

        container.innerHTML = html;

        // Attach click handlers to links
        container.querySelectorAll('.player-link').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = Number(e.currentTarget.dataset.id);
                document.getElementById('playerSearch').value = e.currentTarget.textContent.trim();
                document.querySelector('.nav-tab[data-target="playerView"]').click();
                if (typeof PlayerView !== 'undefined') {
                    PlayerView.loadAndRender(id);
                }
            });
        });
    }

    // ==========================================
    // CHARTS RENDERING
    // ==========================================

    function renderGroupCharts(options) {
        const deltaData = [0];
        for (let i = 1; i < options.statData.length; i++) {
            deltaData.push(options.statData[i] - options.statData[i - 1]);
        }

        if (groupAbsChartInst) groupAbsChartInst.destroy();
        if (groupMemChartInst) groupMemChartInst.destroy();
        if (groupDeltaChartInst) groupDeltaChartInst.destroy();
        if (groupContributionChartInst) groupContributionChartInst.destroy();
        if (groupLevelDistChartInst) groupLevelDistChartInst.destroy();

        // 1. Total Stat Over Time
        groupAbsChartInst = ChartManager.createAbsoluteChart('groupAbsoluteChart', [
            {
                label: `Total ${options.statLabel}`,
                data: options.timelineLabels.map((d, i) => ({ x: d, y: options.statData[i] })),
                borderColor: ChartManager.COLORS[0],
                backgroundColor: ChartManager.COLORS[0] + '33',
                fill: true
            }
        ], `Total ${options.statLabel} Over Time`);

        // 2. Active Members Over Time
        groupMemChartInst = ChartManager.createAbsoluteChart('groupMembersChart', [
            {
                label: 'Active Citizens',
                data: options.timelineLabels.map((d, i) => ({ x: d, y: options.membersData[i] })),
                borderColor: ChartManager.COLORS[1],
                backgroundColor: ChartManager.COLORS[1] + '33',
                fill: true
            }
        ], 'Active Citizens Over Time');

        // 3. Daily Change
        groupDeltaChartInst = ChartManager.createDeltaChart('groupDeltaChart', [
            {
                label: `Daily ${options.statLabel} Change`,
                data: options.timelineLabels.map((d, i) => ({ x: d, y: deltaData[i] })),
                backgroundColor: deltaData.map(val => val >= 0 ? 'rgba(74, 222, 128, 0.7)' : 'rgba(248, 113, 113, 0.7)')
            }
        ], `Daily ${options.statLabel} Change`);

        // 4. Top 10 Contributors in Period
        const topContributors = options.rosterData
            .filter(m => m.change > 0)
            .sort((a, b) => b.change - a.change)
            .slice(0, 10);

        const contribCtx = document.getElementById('groupContributionChart');
        if (contribCtx && topContributors.length > 0) {
            groupContributionChartInst = new Chart(contribCtx, {
                type: 'bar',
                data: {
                    labels: topContributors.map(m => m.name),
                    datasets: [{
                        label: `${options.statLabel} Gained`,
                        data: topContributors.map(m => m.change),
                        backgroundColor: 'rgba(212, 168, 83, 0.7)',
                        borderColor: 'rgba(212, 168, 83, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: `Top ${topContributors.length} Contributors (${options.statLabel} Gain)`,
                            color: '#D4A853',
                            font: { family: "'Rye', cursive", size: 16 }
                        },
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(212, 168, 83, 0.1)' },
                            ticks: {
                                color: '#F5E6C8',
                                callback: val => formatNumber(val)
                            }
                        },
                        y: {
                            grid: { color: 'rgba(212, 168, 83, 0.1)' },
                            ticks: { color: '#F5E6C8' }
                        }
                    }
                }
            });
        }

        // 5. Citizen Level Distribution
        const levelBrackets = {
            '< 50': 0,
            '50 - 99': 0,
            '100 - 119': 0,
            '120 - 139': 0,
            '140 - 149': 0,
            '150+': 0
        };

        options.rosterData.forEach(m => {
            if (m.level < 50) levelBrackets['< 50']++;
            else if (m.level < 100) levelBrackets['50 - 99']++;
            else if (m.level < 120) levelBrackets['100 - 119']++;
            else if (m.level < 140) levelBrackets['120 - 139']++;
            else if (m.level < 150) levelBrackets['140 - 149']++;
            else levelBrackets['150+']++;
        });

        const distCtx = document.getElementById('groupLevelDistChart');
        if (distCtx) {
            groupLevelDistChartInst = new Chart(distCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(levelBrackets),
                    datasets: [{
                        label: 'Citizens',
                        data: Object.values(levelBrackets),
                        backgroundColor: [
                            'rgba(168, 162, 158, 0.7)',
                            'rgba(90, 125, 154, 0.7)',
                            'rgba(74, 124, 89, 0.7)',
                            'rgba(212, 168, 83, 0.7)',
                            'rgba(245, 158, 11, 0.7)',
                            'rgba(239, 68, 68, 0.7)'
                        ],
                        borderColor: 'rgba(212, 168, 83, 0.8)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Citizen Level Distribution',
                            color: '#D4A853',
                            font: { family: "'Rye', cursive", size: 16 }
                        },
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(212, 168, 83, 0.1)' },
                            ticks: { color: '#F5E6C8' }
                        },
                        y: {
                            grid: { color: 'rgba(212, 168, 83, 0.1)' },
                            ticks: {
                                color: '#F5E6C8',
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        }
    }

    // ==========================================
    // MEMBER LOG
    // ==========================================

    function renderMemberLog(memberLog) {
        const logBody = document.getElementById('groupMemberLogBody');
        logBody.innerHTML = '';
        
        memberLog.sort((a, b) => b.date.localeCompare(a.date));
        
        const joins = memberLog.filter(l => l.action === 'Joined').length;
        const leaves = memberLog.filter(l => l.action === 'Left').length;
        document.getElementById('memberLogSummary').textContent = 
            `${joins} citizens joined and ${leaves} departed during the selected date range.`;

        if (memberLog.length === 0) {
            logBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 2rem;">No member changes recorded during this period.</td></tr>`;
        } else {
            memberLog.forEach(log => {
                const tr = document.createElement('tr');
                const color = log.action === 'Joined' ? 'var(--green)' : 'var(--red)';
                tr.innerHTML = `
                    <td>${log.date}</td>
                    <td style="color: ${color}; font-weight: bold;">${log.action}</td>
                    <td><a href="#" class="player-link" data-id="${log.id}">${escapeHTML(log.name)}</a></td>
                `;
                logBody.appendChild(tr);
            });

            logBody.querySelectorAll('.player-link').forEach(a => {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    const id = Number(e.currentTarget.dataset.id);
                    document.getElementById('playerSearch').value = e.currentTarget.textContent.trim();
                    document.querySelector('.nav-tab[data-target="playerView"]').click();
                    if (typeof PlayerView !== 'undefined') {
                        PlayerView.loadAndRender(id);
                    }
                });
            });
        }
    }

    // ==========================================
    // ALLIANCE MEMBER TOWNS
    // ==========================================

    function renderAllianceTowns(allianceId, statKey, statLabel, sortedDates) {
        const townMap = {}; // town_id -> { id, name, members: Set, startVal: 0, endVal: 0, levels: [] }

        allPlayersData.forEach(p => {
            if (!p || !p.history) return;
            const pDates = sortedDates.filter(d => p.history[d]);
            if (pDates.length === 0) return;

            const latestD = pDates[pDates.length - 1];
            const latestS = p.history[latestD];

            // Is the player currently in this alliance?
            if (latestS.alliance_id === allianceId && latestS.town_id && latestS.town) {
                const tId = latestS.town_id;
                if (!townMap[tId]) {
                    townMap[tId] = {
                        id: tId,
                        name: latestS.town,
                        members: new Set(),
                        startVal: 0,
                        endVal: 0,
                        levels: []
                    };
                }

                townMap[tId].members.add(p.id);
                townMap[tId].levels.push(getLevelFromExp(latestS.exp || 0));

                const firstD = pDates[0];
                const firstS = p.history[firstD];
                townMap[tId].startVal += (firstS[statKey] || 0);
                townMap[tId].endVal += (latestS[statKey] || 0);
            }
        });

        const townList = Object.values(townMap).map(t => {
            const change = t.endVal - t.startVal;
            const avgLvl = t.levels.length > 0 ? (t.levels.reduce((a, b) => a + b, 0) / t.levels.length) : 0;
            return {
                id: t.id,
                name: t.name,
                count: t.members.size,
                totalStat: t.endVal,
                change: change,
                avgLevel: avgLvl
            };
        }).sort((a, b) => b.count - a.count);

        document.getElementById('allianceTownCount').textContent = townList.length;
        document.getElementById('allianceTownsStatHeader').textContent = `Total ${statLabel}`;

        const tbody = document.getElementById('groupAllianceTownsBody');
        tbody.innerHTML = '';

        if (townList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No towns found in this alliance.</td></tr>`;
            return;
        }

        townList.forEach((t, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td><a href="#" class="town-link" data-id="${t.id}">${escapeHTML(t.name)}</a></td>
                <td>${formatNumber(t.count)}</td>
                <td>${formatNumber(t.totalStat)}</td>
                <td style="color: ${t.change >= 0 ? 'var(--gold)' : 'var(--red)'}">${t.change > 0 ? '+' : ''}${formatNumber(t.change)}</td>
                <td>Lvl ${t.avgLevel.toFixed(1)}</td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.town-link').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                loadGroupProfile(Number(e.currentTarget.dataset.id), 'townsStats');
            });
        });
    }

    function refresh() {
        if (allPlayersData.length === 0 && DataLoader.isFullyLoaded()) {
            loadAllData();
        } else if (allPlayersData.length > 0) {
            processStats();
            if (currentProfileId) {
                loadGroupProfile(currentProfileId, currentProfileMode);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        refresh,
        loadGroupProfile
    };
})();
