// js/app.js

const AppState = {
    dateFrom: null,
    dateTo: null,
    currentTab: 'playerView' // playerView, comparisonView, rankingView, activityView
};

document.addEventListener('DOMContentLoaded', async () => {
    initDateControls();
    initNavigation();
    await initSearch();
    
    // Trigger default view render
    renderCurrentView();
});

function initDateControls() {
    const fromInput = document.getElementById('dateFrom');
    const toInput = document.getElementById('dateTo');
    const presetBtns = document.querySelectorAll('.preset-btn');

    // Global Chart.js defaults for modern theme
    Chart.defaults.color = '#d6d3d1'; // text-muted (warm gray)
    Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(25, 18, 12, 0.9)'; // panel-bg
    Chart.defaults.plugins.tooltip.titleColor = '#fbbf24'; // accent
    Chart.defaults.plugins.tooltip.bodyColor = '#fef3c7'; // text-main
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(212, 168, 83, 0.3)'; // panel-border
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.legend.labels.color = '#d6d3d1';

    // Default to 'All Time'
    const todayStr = new Date().toISOString().split('T')[0];
    fromInput.value = '2026-08-22';
    toInput.value = todayStr;

    function updateDateState() {
        AppState.dateFrom = fromInput.value || null;
        AppState.dateTo = toInput.value || null;
        
        // Remove active class from presets if manual date selected
        presetBtns.forEach(btn => btn.classList.remove('active'));
        
        renderCurrentView();
    }

    fromInput.addEventListener('change', updateDateState);
    toInput.addEventListener('change', updateDateState);

    presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = e.target.dataset.days;
            presetBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const today = new Date().toISOString().split('T')[0];
            if (days === 'all') {
                fromInput.value = '2026-08-22';
                toInput.value = today;
            } else {
                fromInput.value = getDateOffset(-parseInt(days));
                toInput.value = today;
            }
            
            AppState.dateFrom = fromInput.value || null;
            AppState.dateTo = toInput.value || null;
            renderCurrentView();
        });
    });
}

function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const sections = document.querySelectorAll('.view-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.dataset.target;
            AppState.currentTab = target;

            sections.forEach(sec => {
                if (sec.id === target) {
                    sec.classList.add('active');
                } else {
                    sec.classList.remove('active');
                }
            });

            renderCurrentView();
        });
    });
}

async function initSearch() {
    const searchInput = document.getElementById('playerSearch');
    const dropdown = document.getElementById('searchDropdown');
    
    // Load index
    const index = await DataLoader.loadIndex();
    
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        dropdown.innerHTML = '';
        
        if (val.length < 2) {
            dropdown.classList.add('hidden');
            return;
        }

        const matches = index.filter(p => p.name.toLowerCase().includes(val)).slice(0, 15);
        
        if (matches.length > 0) {
            dropdown.classList.remove('hidden');
            matches.forEach(match => {
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                div.textContent = `${match.name} (ID: ${match.id})`;
                div.addEventListener('click', () => {
                    searchInput.value = '';
                    dropdown.classList.add('hidden');
                    
                    if (AppState.currentTab === 'comparisonView' && typeof ComparisonView !== 'undefined') {
                        ComparisonView.addPlayer(match.id, match.name);
                    } else {
                        searchInput.value = match.name;
                        // Switch to player view automatically
                        document.querySelector('.nav-tab[data-target="playerView"]').click();
                        
                        // Render player profile
                        if (typeof PlayerView !== 'undefined') {
                            PlayerView.loadAndRender(match.id);
                        }
                    }
                });
                dropdown.appendChild(div);
            });
        } else {
            dropdown.classList.add('hidden');
        }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
        
        // Handle chart expansion toggling
        if (e.target.matches('.expand-chart-btn')) {
            const card = e.target.closest('.chart-card');
            if (card) {
                const overlay = document.getElementById('fullscreenOverlay');
                const isExpanding = !card.classList.contains('chart-fullscreen');
                const btn = card.querySelector('.expand-chart-btn');
                
                // If another card is already full, close it first
                document.querySelectorAll('.chart-card.chart-fullscreen').forEach(c => {
                    if (c._parent) {
                        c._parent.insertBefore(c, c._nextSibling);
                    }
                    c.classList.remove('chart-fullscreen');
                    const cBtn = c.querySelector('.expand-chart-btn');
                    if (cBtn) {
                        cBtn.innerHTML = '⛶';
                        cBtn.title = 'Expand Chart';
                    }
                });
                
                if (isExpanding) {
                    // Save position
                    card._parent = card.parentNode;
                    card._nextSibling = card.nextSibling;
                    
                    // Move to body to escape backdrop-filter stacking contexts
                    document.body.appendChild(card);
                    card.classList.add('chart-fullscreen');
                    overlay.classList.add('active');
                    
                    if (btn) {
                        btn.innerHTML = '×';
                        btn.title = 'Close Chart';
                        btn.style.fontSize = '1.8rem'; // Make the X slightly larger
                    }
                } else {
                    if (card._parent) {
                        card._parent.insertBefore(card, card._nextSibling);
                    }
                    card.classList.remove('chart-fullscreen');
                    overlay.classList.remove('active');
                    
                    if (btn) {
                        btn.innerHTML = '⛶';
                        btn.title = 'Expand Chart';
                        btn.style.fontSize = ''; // Reset
                    }
                }
                
                // Trigger chart resize
                setTimeout(() => window.dispatchEvent(new Event('resize')), 10);
                setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
            }
        }
        
        // Handle clicking the overlay to close fullscreen chart
        if (e.target.id === 'fullscreenOverlay') {
            document.querySelectorAll('.chart-card.chart-fullscreen').forEach(c => {
                if (c._parent) {
                    c._parent.insertBefore(c, c._nextSibling);
                }
                c.classList.remove('chart-fullscreen');
                const cBtn = c.querySelector('.expand-chart-btn');
                if (cBtn) {
                    cBtn.innerHTML = '⛶';
                    cBtn.title = 'Expand Chart';
                    cBtn.style.fontSize = '';
                }
            });
            e.target.classList.remove('active');
            setTimeout(() => window.dispatchEvent(new Event('resize')), 10);
        }
    });
}

function renderCurrentView() {
    if (AppState.currentTab === 'playerView' && typeof PlayerView !== 'undefined') {
        PlayerView.refresh();
    } else if (AppState.currentTab === 'comparisonView' && typeof ComparisonView !== 'undefined') {
        ComparisonView.refresh();
    } else if (AppState.currentTab === 'rankingView' && typeof RankingView !== 'undefined') {
        RankingView.refresh();
    } else if (AppState.currentTab === 'activityView' && typeof ActivityView !== 'undefined') {
        ActivityView.refresh();
    } else if (AppState.currentTab === 'groupStatsView' && typeof GroupStatsView !== 'undefined') {
        GroupStatsView.refresh();
    }
}

// Global Loader Utility
const UI = {
    showLoader: (msg = 'Loading...') => {
        document.getElementById('globalLoader').classList.remove('hidden');
        document.getElementById('loaderMessage').textContent = msg;
        document.getElementById('loaderProgress').style.width = '0%';
    },
    updateLoader: (loaded, total) => {
        const pct = (loaded / total) * 100;
        document.getElementById('loaderProgress').style.width = pct + '%';
        document.getElementById('loaderMessage').textContent = `Loading: ${loaded} / ${total}`;
    },
    hideLoader: () => {
        document.getElementById('globalLoader').classList.add('hidden');
    }
};

// Scroll to top functionality
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('scrollTopBtn');
    if(btn) {
        document.addEventListener('scroll', () => {
            if (window.scrollY > 300) btn.classList.remove('hidden');
            else btn.classList.add('hidden');
        });
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
});
