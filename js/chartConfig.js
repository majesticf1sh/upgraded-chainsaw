// js/chartConfig.js

Chart.defaults.color = '#F5E6C8';
Chart.defaults.font.family = "'Open Sans', sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(30, 17, 10, 0.9)';
Chart.defaults.plugins.tooltip.titleColor = '#D4A853';
Chart.defaults.plugins.tooltip.bodyColor = '#F5E6C8';
Chart.defaults.plugins.tooltip.borderColor = '#D4A853';
Chart.defaults.plugins.tooltip.borderWidth = 1;

const DEFAULT_LINE_COLOR = '#D4A853';
const DEFAULT_BG_COLOR = 'rgba(212, 168, 83, 0.2)';
const GRID_COLOR = 'rgba(212, 168, 83, 0.1)';

// Colors for multi-player comparison
const COMPARE_COLORS = [
    '#D4A853', // Gold
    '#8B3A3A', // Dusty Red
    '#4a7c59', // Green
    '#5a7d9a', // Blueish
    '#c47c3c'  // Orange
];

const ChartManager = (function() {
    
    function createAbsoluteChart(canvasId, datasets, title) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        return new Chart(ctx, {
            type: 'line',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: !!title,
                        text: title,
                        font: { family: "'Rye', cursive", size: 16 },
                        color: '#D4A853'
                    },
                    legend: {
                        display: datasets.length > 1
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day' },
                        grid: { color: GRID_COLOR },
                        ticks: { color: '#F5E6C8' }
                    },
                    y: {
                        grid: { color: GRID_COLOR },
                        ticks: {
                            color: '#F5E6C8',
                            callback: function(value) {
                                return formatNumber(value);
                            }
                        }
                    }
                }
            }
        });
    }

    function createDeltaChart(canvasId, datasets, title) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'bar',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: !!title,
                        text: title,
                        font: { family: "'Rye', cursive", size: 16 },
                        color: '#D4A853'
                    },
                    legend: {
                        display: datasets.length > 1
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day' },
                        offset: true,
                        grid: { color: GRID_COLOR },
                        ticks: { color: '#F5E6C8' }
                    },
                    y: {
                        grid: { color: GRID_COLOR },
                        ticks: {
                            color: '#F5E6C8',
                            callback: function(value) {
                                return formatNumber(value);
                            }
                        }
                    }
                }
            }
        });
    }

    return {
        createAbsoluteChart,
        createDeltaChart,
        COLORS: COMPARE_COLORS,
        DEFAULT_LINE_COLOR,
        DEFAULT_BG_COLOR
    };
})();
