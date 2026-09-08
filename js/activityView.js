// js/activityView.js

const ActivityView = (function() {
    let allPlayersData = [];

    async function loadAllData() {
        if (allPlayersData.length === 0) {
            UI.showLoader('Scanning player histories...');
            document.getElementById('activityPlaceholder').classList.add('hidden');
            
            allPlayersData = await DataLoader.loadAllPlayers((loaded, total) => {
                UI.updateLoader(loaded, total);
            });
            UI.hideLoader();
        }
        
        document.getElementById('loadActivityBtn').classList.add('hidden');
        document.getElementById('activityPlaceholder').classList.add('hidden');
        document.getElementById('activityContent').classList.remove('hidden');
        analyzeActivity();
    }

    function init() {
        document.getElementById('loadActivityBtn').addEventListener('click', loadAllData);

        // Tab switching logic for activity sub-tabs
        const tabs = document.querySelectorAll('.activity-tab');
        const panes = document.querySelectorAll('.activity-pane');
        const activityControls = document.querySelector('.activity-controls');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const target = tab.dataset.target;
                panes.forEach(p => {
                    if (p.id === target) p.classList.remove('hidden', 'active');
                    else p.classList.add('hidden');
                });
                document.getElementById(target).classList.add('active');
                
                if (allPlayersData.length > 0) {
                    if (target === 'actBanned') {
                        activityControls.classList.remove('hidden');
                    } else {
                        activityControls.classList.add('hidden');
                    }
                }
            });
        });
    }

    function analyzeActivity() {
        const from = AppState.dateFrom || '0000-00-00';
        const to = AppState.dateTo || '9999-99-99';
        
        const newPlayers = [];
        const inactivePlayers = [];
        const reactivatedPlayers = [];
        const townChanges = [];
        const allianceChanges = [];
        const nameChanges = [];
        const bannedPlayers = [];
        
        const allianceChangeSet = new Set(); // to prevent dups per town

        // Determine the "global latest date" across all files to detect true inactivity
        let globalLatestDate = '0000-00-00';
        allPlayersData.forEach(p => {
            const dates = Object.keys(p.history).sort();
            if (dates.length > 0 && dates[dates.length - 1] > globalLatestDate) {
                globalLatestDate = dates[dates.length - 1];
            }
        });

        allPlayersData.forEach(p => {
            const dates = Object.keys(p.history).filter(d => d >= from && d <= to).sort();
            if (dates.length === 0) return;
            
            const firstDate = dates[0];
            const lastDate = dates[dates.length - 1];
            
            // Ban Tracking (Check the latest date in range for ban status)
            const latestStats = p.history[lastDate];
            if (latestStats.bantype && latestStats.bantype !== 'no') {
                bannedPlayers.push({
                    id: p.id,
                    name: p.name,
                    date: lastDate,
                    bantype: latestStats.bantype,
                    exp: latestStats.exp || 0,
                    town: latestStats.town || '&mdash;'
                });
            }

            // 1. New Players vs Returning Veterans
            if (firstDate >= from && firstDate <= to && firstDate !== '2026-08-22') {
                const initialExp = p.history[firstDate].exp || 0;
                
                // If a player appears for the first time but already has significant EXP (> 300,000),
                // they are a returning player who was inactive when tracking started.
                if (initialExp > 300000) {
                    const startOfTracking = new Date('2026-08-22');
                    const returnDate = new Date(firstDate);
                    const gapDays = Math.ceil(Math.abs(returnDate - startOfTracking) / (1000 * 60 * 60 * 24));
                    
                    reactivatedPlayers.push({
                        id: p.id,
                        name: p.name,
                        date: firstDate,
                        gap: `> ${gapDays}`, // Denotes they were inactive before tracking began
                        exp: initialExp,
                        town: p.history[firstDate].town
                    });
                } else {
                    newPlayers.push({
                        id: p.id,
                        name: p.name,
                        date: firstDate,
                        exp: initialExp,
                        town: p.history[firstDate].town
                    });
                }
            }

            // 2. Inactive Players (last date is in range, but older than global latest date)
            if (lastDate >= from && lastDate <= to && lastDate < globalLatestDate) {
                const d1 = new Date(lastDate);
                const d2 = new Date(globalLatestDate);
                const diffTime = Math.abs(d2 - d1);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays >= 3) {
                    inactivePlayers.push({
                        id: p.id,
                        name: p.name,
                        date: lastDate,
                        gap: diffDays,
                        exp: p.history[lastDate].exp,
                        town: p.history[lastDate].town
                    });
                }
            }

            // 3. Reactivated & Town/Alliance Changes
            let prevTown = null;
            let prevTownId = null;
            let prevAlliance = null;
            let prevAllianceId = null;
            let lastSeenDate = null;
            
            // For reactivation, we must look at ALL history, not just filtered dates
            const allDates = Object.keys(p.history).sort();
            
            allDates.forEach(d => {
                const stats = p.history[d];
                
                if (lastSeenDate) {
                    const d1 = new Date(lastSeenDate);
                    const d2 = new Date(d);
                    const diffTime = Math.abs(d2 - d1);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays >= 3 && d >= from && d <= to) {
                        reactivatedPlayers.push({
                            id: p.id,
                            name: p.name,
                            date: d,
                            gap: diffDays - 1,
                            exp: stats.exp,
                            town: stats.town
                        });
                    }
                }
                
                if (d >= from && d <= to) {
                    // Player moved towns
                    if (prevTownId !== null && stats.town_id && stats.town_id !== prevTownId) {
                        townChanges.push({
                            id: p.id,
                            name: p.name,
                            date: d,
                            oldTown: prevTown,
                            newTown: stats.town
                        });
                    }

                    // Town changed name
                    if (prevTownId !== null && stats.town_id && stats.town_id === prevTownId && prevTown && stats.town && stats.town !== prevTown) {
                        const key = `townName|${stats.town_id}|${d}`;
                        if (!allianceChangeSet.has(key)) {
                            allianceChangeSet.add(key);
                            nameChanges.push({
                                date: d,
                                type: 'Town',
                                oldName: prevTown,
                                newName: stats.town
                            });
                        }
                    }

                    // Town changed Alliance
                    if (prevTownId !== null && stats.town_id && stats.town_id === prevTownId && prevAllianceId !== null && stats.alliance_id !== undefined && stats.alliance_id !== prevAllianceId) {
                        const changeKey = `allianceChange|${stats.town_id}|${d}`;
                        if (!allianceChangeSet.has(changeKey)) {
                            allianceChangeSet.add(changeKey);
                            allianceChanges.push({
                                date: d,
                                town: stats.town,
                                oldAlliance: prevAlliance,
                                newAlliance: stats.alliance
                            });
                        }
                    }

                    // Alliance changed name
                    if (prevAllianceId !== null && stats.alliance_id && stats.alliance_id === prevAllianceId && prevAlliance && stats.alliance && stats.alliance !== prevAlliance) {
                        const key = `allianceName|${stats.alliance_id}|${d}`;
                        if (!allianceChangeSet.has(key)) {
                            allianceChangeSet.add(key);
                            nameChanges.push({
                                date: d,
                                type: 'Alliance',
                                oldName: prevAlliance,
                                newName: stats.alliance
                            });
                        }
                    }
                }
                
                if (stats.town_id) prevTownId = stats.town_id;
                if (stats.town) prevTown = stats.town;
                
                if (stats.alliance_id !== undefined) prevAllianceId = stats.alliance_id;
                if (stats.alliance !== undefined) prevAlliance = stats.alliance;
                
                lastSeenDate = d;
            });
        });

        // Sort descending by date
        newPlayers.sort((a, b) => b.date.localeCompare(a.date));
        inactivePlayers.sort((a, b) => b.date.localeCompare(a.date));
        reactivatedPlayers.sort((a, b) => b.date.localeCompare(a.date));
        townChanges.sort((a, b) => b.date.localeCompare(a.date));
        allianceChanges.sort((a, b) => b.date.localeCompare(a.date));
        nameChanges.sort((a, b) => b.date.localeCompare(a.date));
        bannedPlayers.sort((a, b) => b.date.localeCompare(a.date));

        renderTable('actNewBody', newPlayers, (item) => `
            <td>${item.date}</td>
            <td><a href="#" class="player-link" data-id="${item.id}">${escapeHTML(item.name)}</a></td>
            <td>${formatNumber(item.exp)}</td>
            <td></td>
        `);

        renderTable('actReactivatedBody', reactivatedPlayers, (item) => `
            <td>${item.date}</td>
            <td><a href="#" class="player-link" data-id="${item.id}">${escapeHTML(item.name)}</a></td>
            <td>${item.gap} days</td>
            <td>${formatNumber(item.exp)}</td>
            <td></td>
        `);

        renderTable('actInactiveBody', inactivePlayers, (item) => `
            <td>${item.date}</td>
            <td><a href="#" class="player-link" data-id="${item.id}">${escapeHTML(item.name)}</a></td>
            <td>${item.gap} days</td>
            <td>${formatNumber(item.exp)}</td>
            <td></td>
        `);
        
        const formatLeft = (name) => name ? `<span class="badge" style="background:rgba(239, 68, 68, 0.2); color:#fca5a5; border-color:rgba(239, 68, 68, 0.5)">Left</span> ${escapeHTML(name)}` : `<span style="color:var(--text-muted)">&mdash;</span>`;
        const formatJoined = (name) => name ? `<span class="badge" style="background:rgba(74, 222, 128, 0.2); color:#86efac; border-color:rgba(74, 222, 128, 0.5)">Joined</span> ${escapeHTML(name)}` : `<span style="color:var(--text-muted)">&mdash;</span>`;

        renderTable('actTownChangesBody', townChanges, (item) => `
            <td>${item.date}</td>
            <td><a href="#" class="player-link" data-id="${item.id}">${escapeHTML(item.name)}</a></td>
            <td>${formatLeft(item.oldTown)}</td>
            <td>${formatJoined(item.newTown)}</td>
        `);
        
        renderTable('actAllianceChangesBody', allianceChanges, (item) => `
            <td>${item.date}</td>
            <td>${escapeHTML(item.town || '&mdash;')}</td>
            <td>${formatLeft(item.oldAlliance)}</td>
            <td>${formatJoined(item.newAlliance)}</td>
        `);

        renderTable('actNameChangesBody', nameChanges, (item) => `
            <td>${item.date}</td>
            <td><span class="badge" style="background:rgba(255, 255, 255, 0.1); border-color:rgba(255, 255, 255, 0.2)">${escapeHTML(item.type)}</span></td>
            <td>${escapeHTML(item.oldName)}</td>
            <td>${escapeHTML(item.newName)}</td>
        `);

        renderTable('actBannedBody', bannedPlayers, (item) => `
            <td>${item.date}</td>
            <td><a href="#" class="player-link" data-id="${item.id}">${escapeHTML(item.name)}</a></td>
            <td style="text-transform: capitalize; color: #fca5a5; font-weight: bold;">&#128683; </td>
            <td>${formatNumber(item.exp)}</td>
            <td></td>
        `);
        
        renderBanVisualization(bannedPlayers);
        renderBanWaterfall();
        
        // Ensure the controls are hidden if we are not on the banned tab
        const activeTab = document.querySelector('.activity-tab.active');
        if (activeTab && activeTab.dataset.target !== 'actBanned') {
            document.querySelector('.activity-controls').classList.add('hidden');
        } else {
            document.querySelector('.activity-controls').classList.remove('hidden');
        }
    }
    
    let banPieChartInstance = null;
    
    function renderBanVisualization(bannedPlayers) {
        const container = document.getElementById('banVisualizationContainer');
        const textContainer = document.getElementById('banStatsText');
        
        let total = 0;
        let active = 0;
        let bans = {};
        
        const from = AppState.dateFrom || '0000-00-00';
        const to = AppState.dateTo || '9999-99-99';
        
        allPlayersData.forEach(p => {
            const dates = Object.keys(p.history).filter(d => d >= from && d <= to).sort();
            if (dates.length > 0) {
                total++;
                const latestStats = p.history[dates[dates.length - 1]];
                if (!latestStats.bantype || latestStats.bantype === 'no') {
                    active++;
                } else {
                    bans[latestStats.bantype] = (bans[latestStats.bantype] || 0) + 1;
                }
            }
        });
        
        const totalBanned = total - active;
        if (totalBanned === 0) {
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        
        const labels = ['Active'];
        const data = [active];
        const bgColors = ['rgba(74, 222, 128, 0.7)']; // green for active
        const borderColors = ['rgba(74, 222, 128, 1)'];
        
        const banColors = [
            'rgba(239, 68, 68, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(168, 85, 247, 0.8)'
        ];
        
        let detailsHtml = `<strong>Total Tracked:</strong> ${total}<br/>`;
        detailsHtml += `<strong>Active:</strong> ${active} (${((active/total)*100).toFixed(1)}%)<br/>`;
        detailsHtml += `<strong>Banned:</strong> <span style="color:var(--red)">${totalBanned}</span> (${((totalBanned/total)*100).toFixed(1)}%)<br/><br/>`;
        
        for (const [btype, count] of Object.entries(bans)) {
            labels.push(`Banned: ${btype}`);
            data.push(count);
            
            let color = 'rgba(168, 85, 247, 0.8)'; // default purple for delayed or unknown
            const lowerType = btype.toLowerCase();
            
            if (lowerType.includes('permanent')) {
                color = 'rgba(239, 68, 68, 0.8)'; // red
            } else if (lowerType.includes('temporar') || lowerType.includes('temp')) {
                color = 'rgba(245, 158, 11, 0.8)'; // amber
            }
            
            bgColors.push(color);
            borderColors.push(color.replace('0.8', '1'));
            
            detailsHtml += `&bull; <span style="text-transform:capitalize;">${btype}</span>: ${count}<br/>`;
        }
        
        textContainer.innerHTML = detailsHtml;

        const ctx = document.getElementById('banPieChart').getContext('2d');
        if (banPieChartInstance) banPieChartInstance.destroy();
        
        banPieChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: { 
                            color: 'rgba(254, 243, 199, 0.8)',
                            padding: 20
                        }
                    }
                }
            }
        });
    }
    function renderBanWaterfall() {
        const container = document.getElementById('banWaterfallContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        const from = AppState.dateFrom || '0000-00-00';
        const to = AppState.dateTo || '9999-99-99';
        
        let globalDatesSet = new Set();
        allPlayersData.forEach(p => {
            Object.keys(p.history).forEach(d => {
                if (d >= from && d <= to) globalDatesSet.add(d);
            });
        });
        const globalDates = Array.from(globalDatesSet).sort();
        if (globalDates.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No dates in range.</div>';
            return;
        }
        
        const minTime = new Date(globalDates[0]).getTime();
        const maxTime = new Date(globalDates[globalDates.length - 1]).getTime() + 86400000;
        const totalTime = maxTime - minTime || 86400000;
        
        let waterfallData = [];
        
        allPlayersData.forEach(p => {
            let segments = [];
            let currentSegment = null;
            
            const playerDates = Object.keys(p.history).filter(d => d >= from && d <= to).sort();
            
            playerDates.forEach(d => {
                const stats = p.history[d];
                const bantype = stats.bantype && stats.bantype !== 'no' ? stats.bantype : null;
                
                if (bantype) {
                    if (!currentSegment) {
                        currentSegment = { start: d, end: d, type: bantype };
                    } else if (currentSegment.type === bantype) {
                        currentSegment.end = d;
                    } else {
                        segments.push(currentSegment);
                        currentSegment = { start: d, end: d, type: bantype };
                    }
                } else {
                    if (currentSegment) {
                        segments.push(currentSegment);
                        currentSegment = null;
                    }
                }
            });
            if (currentSegment) segments.push(currentSegment);
            
            if (segments.length > 0) {
                waterfallData.push({ id: p.id, name: p.name, segments });
            }
        });
        
        if (waterfallData.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No banned players found in this period.</div>';
            return;
        }
        
        let html = '<div class="wf-header" style="position: relative; height: 30px;"><div class="wf-name">Player</div><div style="position: relative; flex-grow: 1;">';
        for(let i=0; i<=4; i++) {
            const perc = (i / 4);
            const t = minTime + totalTime * perc;
            const label = new Date(t).toISOString().split('T')[0];
            
            let transform = 'translateX(-50%)';
            if (i === 0) transform = 'translateX(0)';
            if (i === 4) transform = 'translateX(-100%)';
            
            html += '<div class="wf-axis-label" style="left: ' + (perc * 100) + '%; transform: ' + transform + ';">' + label + '</div>';
        }
        html += '</div></div>';
        
        waterfallData.sort((a, b) => a.segments[0].start.localeCompare(b.segments[0].start));
        
        waterfallData.forEach(p => {
            html += '<div class="wf-row">';
            html += '<div class="wf-name" title="' + escapeHTML(p.name) + '"><a href="#" class="player-link" data-id="' + p.id + '">' + escapeHTML(p.name) + '</a></div>';
            html += '<div class="wf-timeline">';
            
            p.segments.forEach(seg => {
                const sTime = new Date(seg.start).getTime();
                const eTime = new Date(seg.end).getTime() + 86400000;
                
                const left = Math.max(0, (sTime - minTime) / totalTime * 100);
                const right = Math.min(100, (eTime - minTime) / totalTime * 100);
                const width = right - left;
                
                const days = Math.round((eTime - sTime) / 86400000);
                
                let cssClass = 'delayed';
                if (seg.type.toLowerCase().includes('permanent')) cssClass = 'permanent';
                else if (seg.type.toLowerCase().includes('temporar') || seg.type.toLowerCase().includes('temp')) cssClass = 'temporary';
                
                html += '<div class="wf-bar ' + cssClass + '" style="left: ' + left + '%; width: ' + width + '%; min-width: 0; padding: 0;" title="' + seg.type + ' (' + days + ' days)\nFrom ' + seg.start + ' to ' + seg.end + '">' + days + 'd</div>';
                
                const lastGlobalDate = globalDates[globalDates.length - 1];
                if (seg === p.segments[p.segments.length - 1] && cssClass === 'permanent' && seg.end < lastGlobalDate) {
                    html += '<div style="position: absolute; left: ' + right + '%; top: 50%; transform: translateY(-50%); margin-left: 6px; font-size: 0.9rem; cursor: help; z-index: 5;" title="Account Deleted (permanent ban ended in deletion)">&#10060;</div>';
                }
            });
            
            html += '</div></div>';
        });
        
        container.innerHTML = html;
        
        container.querySelectorAll('.player-link').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = Number(e.target.dataset.id);
                document.getElementById('playerSearch').value = e.target.textContent;
                document.querySelector('.nav-tab[data-target="playerView"]').click();
                if (typeof PlayerView !== 'undefined') PlayerView.loadAndRender(id);
            });
        });
    }



    function renderTable(tbodyId, data, rowGenerator) {
        const tbody = document.getElementById(tbodyId);
        tbody.innerHTML = '';
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No players found for this period.</td></tr>`;
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = rowGenerator(item);
            tbody.appendChild(tr);
        });

        // Attach clicks
        tbody.querySelectorAll('.player-link').forEach(a => {
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
            analyzeActivity();
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return { refresh };
})();

