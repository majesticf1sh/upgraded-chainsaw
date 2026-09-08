// js/rankingView.js

const RankingView = (function() {
    let allPlayersData = [];
    let currentRanking = [];
    let sortCol = 'change';
    let sortDesc = true;
    let currentPage = 1;
    const PAGE_SIZE = 50;

    async function init() {
        const statSelect = document.getElementById('rankingStatSelect');
        Object.keys(STAT_METADATA).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            if (key === 'exp') opt.selected = true;
            opt.textContent = STAT_METADATA[key].label;
            statSelect.appendChild(opt);
        });

        document.getElementById('loadRankingsBtn').addEventListener('click', loadAllData);
        statSelect.addEventListener('change', () => {
            if (allPlayersData.length > 0) processRankings();
        });
        
        document.getElementById('rankingSearch').addEventListener('input', () => {
            currentPage = 1;
            renderTable();
        });

        document.querySelectorAll('.sort-header').forEach(th => {
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

        document.getElementById('rankPrevBtn').addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; renderTable(); }
        });
        document.getElementById('rankNextBtn').addEventListener('click', () => {
            const maxPage = Math.ceil(getFilteredData().length / PAGE_SIZE);
            if (currentPage < maxPage) { currentPage++; renderTable(); }
        });
    }

    async function loadAllData() {
        if (allPlayersData.length === 0) {
            UI.showLoader('Fetching all players...');
            document.getElementById('rankingPlaceholder').classList.add('hidden');
            
            allPlayersData = await DataLoader.loadAllPlayers((loaded, total) => {
                UI.updateLoader(loaded, total);
            });
            UI.hideLoader();
        }
        
        document.getElementById('loadRankingsBtn').classList.add('hidden');
        document.getElementById('rankingPlaceholder').classList.add('hidden');
        document.getElementById('rankingTableContainer').classList.remove('hidden');
        processRankings();
    }

    function processRankings() {
        try {
            const statKey = document.getElementById('rankingStatSelect').value;
            currentRanking = [];

            allPlayersData.forEach(p => {
                if (!p || !p.history) return;
                const entries = filterHistory(p.history, AppState.dateFrom, AppState.dateTo);
                if (entries.length < 2) return; // Need at least 2 data points for a change
                
                let startVal = entries[0].stats[statKey] || 0;
                const endVal = entries[entries.length - 1].stats[statKey] || 0;
                
                // 1st Day Exclusion Rule for new/reactivated players
                const globalDates = Object.keys(p.history).sort();
                const firstGlobalDate = globalDates[0];
                let isNewOrReactivatedInRange = false;

                if (firstGlobalDate === entries[0].date && entries.length > 1 && firstGlobalDate !== '2026-08-22') {
                    isNewOrReactivatedInRange = true;
                    startVal = entries[1].stats[statKey] || 0;
                }

                const change = endVal - startVal;
                const percent = startVal > 0 ? (change / startVal) * 100 : 0;
                const bantype = entries[entries.length - 1].stats.bantype || 'no';

                currentRanking.push({
                    id: p.id,
                    name: p.name,
                    start: startVal,
                    end: endVal,
                    change: change,
                    percent: percent,
                    badge: isNewOrReactivatedInRange,
                    bantype: bantype
                });
            });

            sortData();
            updateSortUI();
            currentPage = 1;
            renderTable();
        } catch (err) {
            console.error('Error processing rankings:', err);
            alert('Error processing rankings: ' + err.message);
        }
    }

    function sortData() {
        currentRanking.sort((a, b) => {
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
        document.querySelectorAll('.sort-header').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === sortCol) {
                th.classList.add(sortDesc ? 'desc' : 'asc');
            }
        });
    }

    function getFilteredData() {
        const query = document.getElementById('rankingSearch').value.toLowerCase();
        if (!query) return currentRanking;
        return currentRanking.filter(item => item.name.toLowerCase().includes(query));
    }

    function renderTable() {
        const tbody = document.getElementById('rankingBody');
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
            
            const badgeHtml = item.badge ? `<span class="badge" title="First day excluded from delta to prevent skewing">1st Day Exc.</span>` : '';
            const banBadgeHtml = (item.bantype && item.bantype !== 'no') 
                ? `<span class="badge ban-badge" title="Ban type: ${item.bantype}">🚫</span>` 
                : '';
                
            const pctText = (item.percent > 0 ? '+' : '') + item.percent.toFixed(2) + '%';
            
            tr.innerHTML = `
                <td>#${realRank}</td>
                <td><a href="#" class="player-link" data-id="${item.id}">${escapeHTML(item.name)}</a> ${banBadgeHtml} ${badgeHtml}</td>
                <td>${formatNumber(item.start)}</td>
                <td>${formatNumber(item.end)}</td>
                <td style="color: ${item.change >= 0 ? 'var(--gold)' : 'var(--red)'}">${item.change > 0 ? '+' : ''}${formatNumber(item.change)}</td>
                <td>${pctText}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('rankPageInfo').textContent = `Page ${currentPage} of ${maxPage} (${filtered.length} players)`;
        
        // Attach click handlers to links
        document.querySelectorAll('.player-link').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = Number(e.target.dataset.id);
                document.getElementById('playerSearch').value = e.target.textContent;
                document.querySelector('.nav-tab[data-target="playerView"]').click();
                if (typeof PlayerView !== 'undefined') PlayerView.loadAndRender(id);
            });
        });
    }

    function refresh() {
        if (allPlayersData.length === 0 && DataLoader.isFullyLoaded()) {
            loadAllData();
        } else if (allPlayersData.length > 0) {
            processRankings();
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return { refresh };
})();
