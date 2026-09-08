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
            document.querySelector('.ranking-controls').classList.remove('hidden');
        });
        
        const profileTabs = document.querySelectorAll('#groupProfileContent .group-tab');
        profileTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                profileTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('groupChartsPane').classList.add('hidden');
                document.getElementById('groupMemberLogPane').classList.add('hidden');
                document.getElementById(tab.dataset.target).classList.remove('hidden');
            });
        });

        document.querySelectorAll('.group-sort-header').forEach(th => {
            th.addEventListener('click', (e) => {
                const col = e.target.dataset.sort;
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
                loadGroupProfile(Number(e.target.dataset.id), currentMode);
            });
        });
    }

    let groupAbsChartInst = null;
    let groupMemChartInst = null;
    let groupDeltaChartInst = null;

    function loadGroupProfile(groupId, mode) {
        currentProfileId = groupId;
        currentProfileMode = mode;
        const groupInfo = currentData.find(g => g.id === groupId);
        if (!groupInfo) return;

        // Make container visible BEFORE drawing charts so Chart.js can calculate dimensions
        document.getElementById('groupTableContainer').classList.add('hidden');
        document.querySelector('.ranking-controls').classList.add('hidden');
        document.getElementById('groupProfileContent').classList.remove('hidden');

        document.getElementById('groupProfileName').textContent = groupInfo.name;
        document.getElementById('groupProfileTypeDisplay').textContent = mode === 'townsStats' ? 'Town' : 'Alliance';
        document.getElementById('groupProfileIdDisplay').textContent = groupId;

        const statKey = document.getElementById('groupStatSelect').value;
        const allDatesSet = new Set();
        const playersInGroup = []; 
        
        allPlayersData.forEach(p => {
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

        if (sortedDates.length === 0) return;

        const timelineLabels = [];
        const statData = [];
        const membersData = [];
        const memberLog = [];
        
        let previousMembers = new Map(); 

        sortedDates.forEach((date, idx) => {
            timelineLabels.push(date);
            let dayStatTotal = 0;
            let currentMembers = new Map();

            playersInGroup.forEach(p => {
                const s = p.history[date];
                if (s) {
                    const gId = mode === 'townsStats' ? s.town_id : s.alliance_id;
                    if (gId === groupId) {
                        dayStatTotal += s[statKey] || 0;
                        currentMembers.set(p.id, p.name);
                    }
                }
            });

            statData.push(dayStatTotal);
            membersData.push(currentMembers.size);

            if (idx > 0) {
                currentMembers.forEach((name, id) => {
                    if (!previousMembers.has(id)) {
                        memberLog.push({ date, action: 'Joined', name, id });
                    }
                });
                previousMembers.forEach((name, id) => {
                    if (!currentMembers.has(id)) {
                        memberLog.push({ date, action: 'Left', name, id });
                    }
                });
            }

            previousMembers = currentMembers;
        });

        const deltaData = [0];
        for (let i = 1; i < statData.length; i++) {
            deltaData.push(statData[i] - statData[i - 1]);
        }

        if (groupAbsChartInst) groupAbsChartInst.destroy();
        if (groupMemChartInst) groupMemChartInst.destroy();
        if (groupDeltaChartInst) groupDeltaChartInst.destroy();

        const statLabel = STAT_METADATA[statKey] ? STAT_METADATA[statKey].label : 'Stat';

        groupAbsChartInst = ChartManager.createAbsoluteChart('groupAbsoluteChart', [
            {
                label: `Total ${statLabel}`,
                data: timelineLabels.map((d, i) => ({ x: d, y: statData[i] })),
                borderColor: ChartManager.COLORS[0],
                backgroundColor: ChartManager.COLORS[0] + '33',
                fill: true
            }
        ], `Total ${statLabel} Over Time`);

        groupMemChartInst = ChartManager.createAbsoluteChart('groupMembersChart', [
            {
                label: 'Active Members',
                data: timelineLabels.map((d, i) => ({ x: d, y: membersData[i] })),
                borderColor: ChartManager.COLORS[1],
                backgroundColor: ChartManager.COLORS[1] + '33',
                fill: true
            }
        ], 'Active Members Over Time');

        groupDeltaChartInst = ChartManager.createDeltaChart('groupDeltaChart', [
            {
                label: `Daily ${statLabel} Change`,
                data: timelineLabels.map((d, i) => ({ x: d, y: deltaData[i] })),
                backgroundColor: deltaData.map(val => val >= 0 ? 'rgba(74, 222, 128, 0.7)' : 'rgba(248, 113, 113, 0.7)')
            }
        ], `Daily ${statLabel} Change`);

        const logBody = document.getElementById('groupMemberLogBody');
        logBody.innerHTML = '';
        
        memberLog.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (memberLog.length === 0) {
            logBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted)">No member changes during this period.</td></tr>`;
        } else {
            memberLog.forEach(log => {
                const tr = document.createElement('tr');
                const color = log.action === 'Joined' ? 'var(--green)' : 'var(--red)';
                tr.innerHTML = `
                    <td>${log.date}</td>
                    <td style="color: ${color}; font-weight: bold;">${log.action}</td>
                    <td>${escapeHTML(log.name)}</td>
                `;
                logBody.appendChild(tr);
            });
        }


    }

    function refresh() {
        if (allPlayersData.length === 0 && DataLoader.isFullyLoaded()) {
            loadAllData();
        } else if (allPlayersData.length > 0) {
            processStats();
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return { refresh };
})();
