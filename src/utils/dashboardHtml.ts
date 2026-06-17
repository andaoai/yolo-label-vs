import * as vscode from 'vscode';
import { DatasetStatistics } from '../services/DatasetStatisticsService';

/**
 * Generate HTML for dataset statistics dashboard with Chart.js
 */
export function generateDashboardHtml(
    extensionUri: vscode.Uri,
    webview: vscode.Webview,
    stats: DatasetStatistics
): string {
    // Serialize chart data for JavaScript
    const chartDataJson = JSON.stringify(stats.chartData);

    // Theme colors (VS Code dark theme compatible)
    const textColor = '#cccccc';
    const gridColor = '#444444';
    const bgColor = '#1e1e1e';
    const cardBgColor = '#252526';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dataset Statistics - ${stats.datasetName}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            padding: 24px;
            color: ${textColor};
            background-color: ${bgColor};
            line-height: 1.4;
        }

        /* ========== Hero Header ========== */
        .hero-header {
            background: linear-gradient(135deg, rgba(0, 152, 255, 0.1) 0%, rgba(54, 201, 184, 0.05) 100%);
            border: 1px solid rgba(0, 152, 255, 0.2);
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 20px;
        }

        .hero-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }

        .hero-left {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .hero-icon {
            width: 44px;
            height: 44px;
            background: linear-gradient(135deg, #0098ff 0%, #36c9b8 100%);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .hero-icon svg {
            width: 22px;
            height: 22px;
            color: #fff;
        }

        .hero-title h1 {
            margin: 0 0 4px 0;
            font-size: 22px;
            font-weight: 600;
            color: #ffffff;
        }

        .hero-title p {
            margin: 0;
            font-size: 12px;
            color: #888;
            font-family: 'SF Mono', 'Consolas', monospace;
        }

        .hero-badge {
            background: rgba(0, 152, 255, 0.1);
            border: 1px solid rgba(0, 152, 255, 0.3);
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            color: #0098ff;
        }

        /* ========== Quick Stats Grid ========== */
        .quick-stats {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }

        @media (max-width: 1200px) {
            .quick-stats {
                grid-template-columns: repeat(3, 1fr);
            }
        }

        @media (max-width: 700px) {
            .quick-stats {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        .stat-card {
            background: ${cardBgColor};
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            padding: 12px 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: border-color 0.15s;
        }

        .stat-card:hover {
            border-color: #0098ff;
        }

        .stat-icon {
            width: 32px;
            height: 32px;
            background: rgba(0, 152, 255, 0.1);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .stat-icon svg {
            width: 16px;
            height: 16px;
            color: #0098ff;
        }

        .stat-content {
            flex: 1;
            min-width: 0;
        }

        .stat-value {
            font-size: 17px;
            font-weight: 600;
            color: #ffffff;
            line-height: 1.2;
        }

        .stat-label {
            font-size: 10px;
            color: #777;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 2px;
        }

        /* ========== Progress Section ========== */
        .progress-section {
            background-color: ${cardBgColor};
            border-radius: 8px;
            padding: 15px;
            border: 1px solid #3c3c3c;
            margin-bottom: 20px;
        }

        .progress-section h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
        }

        .progress-row {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .progress-stats {
            min-width: 180px;
        }

        .progress-stats .stat {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            margin-bottom: 6px;
        }

        .progress-stats .stat-label {
            color: #888;
        }

        .progress-stats .stat-value {
            font-weight: 600;
            color: #fff;
        }

        .progress-bar-container {
            flex: 1;
            height: 24px;
            background-color: #333;
            border-radius: 6px;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #0098ff, #36c9b8);
            transition: width 0.5s ease;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 10px;
        }

        .progress-bar span {
            font-size: 12px;
            font-weight: 600;
            color: #fff;
            white-space: nowrap;
        }

        /* ========== Charts Grid ========== */
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);  /* 4列布局 */
            gap: 12px;
            margin-bottom: 20px;
        }

        /* 第二行是3列 */
        .charts-grid.row-3col {
            grid-template-columns: repeat(3, 1fr);
        }

        @media (max-width: 1200px) {
            .charts-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            .charts-grid.row-3col {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        @media (max-width: 700px) {
            .charts-grid {
                grid-template-columns: 1fr;
            }
            .charts-grid.row-3col {
                grid-template-columns: 1fr;
            }
        }

        .chart-card {
            background-color: ${cardBgColor};
            border-radius: 8px;
            padding: 15px;
            border: 1px solid #3c3c3c;
            overflow: hidden;
        }

        /* ========== 正方形卡片 - 用 padding-top 百分比技巧保证 1:1 ========== */
        .chart-card.square {
            position: relative;
            padding: 0;
        }

        .chart-card.square::before {
            content: '';
            display: block;
            padding-top: 100%;  /* 🔒 核心：宽高 1:1 */
        }

        .square-content {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            padding: 15px;
            display: flex;
            flex-direction: column;
        }

        /* 饼图和散点图的容器要居中 */
        .chart-card.square .chart-container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 0;
        }

        .chart-card.square canvas {
            max-height: 100%;
            max-width: 100%;
        }

        /* ========== 宽卡片（占满整行） ========== */
        .chart-card.wide {
            height: 450px;
            overflow: hidden;  /* 移除滚动 */
        }

        .chart-card h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
            flex-shrink: 0;
        }

        .chart-container {
            position: relative;
            width: 100%;
            overflow: hidden;  /* 彻底移除滚动 */
        }

        .chart-card.wide .chart-container {
            height: 390px;
        }

        .footer {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #3c3c3c;
            text-align: center;
            font-size: 12px;
            color: #666;
        }

        /* Legend styles for pie charts */
        .pie-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 10px;
            justify-content: center;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }

        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <!-- Hero Header -->
    <div class="hero-header">
        <div class="hero-content">
            <div class="hero-left">
                <div class="hero-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 3v18h18"/>
                        <path d="M18 17V9"/>
                        <path d="M13 17V5"/>
                        <path d="M8 17v-3"/>
                    </svg>
                </div>
                <div class="hero-title">
                    <h1>${stats.datasetName.toUpperCase()}</h1>
                    <p>${stats.datasetRoot.replace(/\\/g, '/')}</p>
                </div>
            </div>
            <div class="hero-badge">
                ${stats.datasetType.toUpperCase()}
            </div>
        </div>
    </div>

    <!-- Quick Stats Grid -->
    <div class="quick-stats">
        <div class="stat-card">
            <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${stats.totalImages.toLocaleString()}</div>
                <div class="stat-label">Images</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${stats.totalLabels.toLocaleString()}</div>
                <div class="stat-label">Labels</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="21" r="1"/>
                    <circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${stats.config.names.length}</div>
                <div class="stat-label">Classes</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${stats.averageLabelsPerImage.toFixed(1)}</div>
                <div class="stat-label">Avg/Image</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${((stats.boxStats.avgArea || 0) * 100).toFixed(1)}%</div>
                <div class="stat-label">Avg Area</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"/>
                    <rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${(stats.boxStats.avgAspectRatio || 0).toFixed(2)}</div>
                <div class="stat-label">Aspect Ratio</div>
            </div>
        </div>
    </div>

    <!-- Labeling Progress -->
    <div class="progress-section">
        <h3>Labeling Progress</h3>
        <div class="progress-row">
            <div class="progress-stats">
                <div class="stat">
                    <span class="stat-label">Labeled Images:</span>
                    <span class="stat-value" style="color: #47cf73">${stats.labeledImages.toLocaleString()}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Unlabeled Images:</span>
                    <span class="stat-value" style="color: #ffcb2f">${stats.unlabeledImages.toLocaleString()}</span>
                </div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${stats.totalImages > 0 ? stats.labeledImages / stats.totalImages * 100 : 0}%">
                    <span>${stats.totalImages > 0 ? (stats.labeledImages / stats.totalImages * 100).toFixed(1) : 0}%</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Charts Grid - Row 1: 4 SQUARES! -->
    <div class="charts-grid">
        <!-- Chart 1: Subset Distribution (train/val/test) -->
        <div class="chart-card square">
            <div class="square-content">
                <h3>Subset Distribution</h3>
                <div class="chart-container">
                    <canvas id="subsetDistributionChart"></canvas>
                </div>
                <div class="pie-legend" id="subsetLegend"></div>
            </div>
        </div>

        <!-- Chart 2: Folder Distribution -->
        <div class="chart-card square">
            <div class="square-content">
                <h3>Folder Distribution</h3>
                <div class="chart-container">
                    <canvas id="folderDistributionChart"></canvas>
                </div>
                <div class="pie-legend" id="folderLegend"></div>
            </div>
        </div>

        <!-- Chart 3: Box Width vs Height Scatter -->
        <div class="chart-card square">
            <div class="square-content">
                <h3>Box Size (W × H)</h3>
                <div class="chart-container">
                    <canvas id="boxSizeChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Chart 4: Box Center 2D Distribution -->
        <div class="chart-card square">
            <div class="square-content">
                <h3>Box Center 2D</h3>
                <div class="chart-container">
                    <canvas id="boxCenter2DChart"></canvas>
                </div>
            </div>
        </div>
    </div>

    <!-- Charts Grid - Row 2: Box Area + Center X + Center Y (3 columns) -->
    <div class="charts-grid row-3col">
        <!-- Chart 4: Box Area Distribution -->
        <div class="chart-card" style="height: 260px;">
            <h3>Box Area Distribution</h3>
            <div class="chart-container" style="height: 200px;">
                <canvas id="boxAreaChart"></canvas>
            </div>
        </div>

        <!-- Chart 5: Center X Distribution -->
        <div class="chart-card" style="height: 260px;">
            <h3>Box Center X</h3>
            <div class="chart-container" style="height: 200px;">
                <canvas id="centerXChart"></canvas>
            </div>
        </div>

        <!-- Chart 6: Center Y Distribution -->
        <div class="chart-card" style="height: 260px;">
            <h3>Box Center Y</h3>
            <div class="chart-container" style="height: 200px;">
                <canvas id="centerYChart"></canvas>
            </div>
        </div>
    </div>

    <!-- Charts Grid - Row 3: Labels Per Image (Full Width) -->
    <div class="charts-grid">
        <div class="chart-card wide" style="grid-column: 1 / -1;">
            <h3>Labels Per Image</h3>
            <div class="chart-container">
                <canvas id="labelsPerImageChart"></canvas>
            </div>
        </div>
    </div>

    <!-- Charts Grid - Row 4: Class Distribution (Full Width) -->
    <div class="charts-grid">
        <div class="chart-card wide" style="grid-column: 1 / -1;">
            <h3>Class Distribution</h3>
            <div class="chart-container">
                <canvas id="classDistributionChart"></canvas>
            </div>
        </div>
    </div>

    <!-- Charts Grid - Row 5: Class Distribution by Subset (Full Width) -->
    <div class="charts-grid">
        <div class="chart-card wide" style="grid-column: 1 / -1;">
            <h3>Class Distribution by Subset (Train vs Val vs Test)</h3>
            <div class="chart-container">
                <canvas id="classDistributionBySubsetChart"></canvas>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Processed in ${stats.processingTime}ms • ${new Date().toLocaleString()}</p>
    </div>

    <script>
        // Data from extension
        const chartData = ${chartDataJson};
        const trainImages = ${stats.trainImages};
        const valImages = ${stats.valImages};
        const testImages = ${stats.testImages};
        const folderDistribution = ${JSON.stringify(stats.folderDistribution)};
        const classCountsBySubset = ${JSON.stringify(stats.classCountsBySubset)};

        // Chart configuration defaults
        const chartDefaults = {
            responsive: true,
            maintainAspectRatio: false,  // 由容器控制高度
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: '${gridColor}'
                    },
                    ticks: {
                        color: '${textColor}'
                    }
                },
                y: {
                    grid: {
                        color: '${gridColor}'
                    },
                    ticks: {
                        color: '${textColor}'
                    }
                }
            }
        };

        // Color palette
        const colors = [
            '#0098ff', '#36c9b8', '#ff8c00', '#f14c4c', '#9d65c9',
            '#ffcb2f', '#47cf73', '#72b5f5', '#ff7675', '#a55eea',
            '#74b9ff', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7'
        ];

        // ========== Chart 1: Subset Distribution (Pie) ==========
        (function() {
            const ctx = document.getElementById('subsetDistributionChart').getContext('2d');
            const subsets = [];
            const data = [];
            const subsetColors = [];

            if (trainImages > 0) { subsets.push('Train'); data.push(trainImages); subsetColors.push(colors[0]); }
            if (valImages > 0) { subsets.push('Val'); data.push(valImages); subsetColors.push(colors[2]); }
            if (testImages > 0) { subsets.push('Test'); data.push(testImages); subsetColors.push(colors[5]); }

            if (data.length === 0) {
                subsets.push('All');
                data.push(${stats.totalImages});
                subsetColors.push(colors[1]);
            }

            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: subsets,
                    datasets: [{
                        data,
                        backgroundColor: subsetColors,
                        borderWidth: 2,
                        borderColor: '${cardBgColor}'
                    }]
                },
                options: {
                    ...chartDefaults,
                    aspectRatio: 1,  // 饼图必须正方形
                    cutout: '50%',
                    scales: undefined,  // 饼图不需要坐标轴
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.raw / total) * 100).toFixed(1);
                                    return context.label + ': ' + context.raw + ' (' + percentage + '%)';
                                }
                            }
                        }
                    }
                }
            });

            // Add legend with percentage
            const total = data.reduce((a, b) => a + b, 0);
            const legend = document.getElementById('subsetLegend');
            subsets.forEach((name, i) => {
                const pct = ((data[i] / total) * 100).toFixed(1);
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.innerHTML = \`<div class="legend-color" style="background-color: \${subsetColors[i]}"></div><span>\${name}: \${data[i]} (\${pct}%)</span>\`;
                legend.appendChild(item);
            });
        })();

        // ========== Chart 2: Folder Distribution (Pie) ==========
        (function() {
            const ctx = document.getElementById('folderDistributionChart').getContext('2d');
            const folderFullPaths = folderDistribution.map(f => f.folder);
            const folders = folderFullPaths.map(f => f.split('/').pop() || f);
            const data = folderDistribution.map(f => f.count);
            const folderColors = colors.slice(0, folders.length);

            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: folders,
                    datasets: [{
                        data,
                        backgroundColor: folderColors,
                        borderWidth: 2,
                        borderColor: '${cardBgColor}'
                    }]
                },
                options: {
                    ...chartDefaults,
                    aspectRatio: 1,  // 饼图必须正方形
                    cutout: '50%',
                    scales: undefined,  // 饼图不需要坐标轴
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.raw / total) * 100).toFixed(1);
                                    return folderFullPaths[context.dataIndex] + ': ' + context.raw + ' (' + percentage + '%)';
                                }
                            }
                        }
                    }
                }
            });

            // Show folder count
            const legend = document.getElementById('folderLegend');
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = \`<span>\${folders.length} folders</span>\`;
            legend.appendChild(item);
        })();

        // ========== Chart 3: Labels Per Image (Full Data) ==========
        (function() {
            const ctx = document.getElementById('labelsPerImageChart').getContext('2d');
            const labels = [];
            const data = [];

            // 显示完整数据，最多 30 个
            const maxLabels = Math.min(chartData.labelsPerImage.maxLabels, 30);
            for (let i = 0; i <= maxLabels; i++) {
                labels.push(i.toString());
                data.push(chartData.labelsPerImage.counts[i] || 0);
            }

            // 如果还有更多，添加 "+" 类别
            if (chartData.labelsPerImage.maxLabels > maxLabels) {
                let over = 0;
                for (let i = maxLabels + 1; i < chartData.labelsPerImage.counts.length; i++) {
                    over += chartData.labelsPerImage.counts[i] || 0;
                }
                if (over > 0) {
                    labels.push(maxLabels + 1 + '+');
                    data.push(over);
                }
            }

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors[0],
                        borderRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { color: '${gridColor}' },
                            ticks: { color: '${textColor}', maxTicksLimit: 31 },
                            title: { display: true, text: 'Labels per image', color: '${textColor}' }
                        },
                        y: {
                            grid: { color: '${gridColor}' },
                            ticks: { color: '${textColor}' },
                            title: { display: true, text: 'Number of images', color: '${textColor}' },
                            beginAtZero: true
                        }
                    }
                }
            });
        })();

        // ========== Chart 4: All Class Distribution (Horizontal Bar) ==========
        (function() {
            const ctx = document.getElementById('classDistributionChart').getContext('2d');

            // Show ALL classes sorted by count
            const classData = chartData.classNames
                .map((name, i) => ({ name, count: chartData.classCounts[i] || 0 }))
                .filter(c => c.count > 0)
                .sort((a, b) => b.count - a.count);

            // Generate color for each class
            const barColors = classData.map((_, i) => colors[i % colors.length]);

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: classData.map(c => c.name),
                    datasets: [{
                        data: classData.map(c => c.count),
                        backgroundColor: barColors,
                        borderRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    // indexAxis: 'x',  // 纵向柱状图，和 Labels Per Image 一样
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.raw / total) * 100).toFixed(1);
                                    return context.label + ': ' + context.raw + ' (' + percentage + '%)';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: '${gridColor}' },
                            ticks: { color: '${textColor}', autoSkip: false, maxRotation: 90, minRotation: 45 },
                            title: { display: true, text: 'Class', color: '${textColor}' }
                        },
                        y: {
                            grid: { color: '${gridColor}' },
                            ticks: { color: '${textColor}' },
                            title: { display: true, text: 'Number of labels', color: '${textColor}' },
                            beginAtZero: true
                        }
                    }
                }
            });
        })();

        // ========== Chart 4.5: Class Distribution by Subset (Grouped Bar) ==========
        (function() {
            const ctx = document.getElementById('classDistributionBySubsetChart').getContext('2d');

            // Sort classes by total count (same as Class Distribution chart)
            const classData = chartData.classNames
                .map((name, i) => ({
                    name,
                    total: chartData.classCounts[i] || 0,
                    train: classCountsBySubset.train[i] || 0,
                    val: classCountsBySubset.val[i] || 0,
                    test: classCountsBySubset.test[i] || 0
                }))
                .filter(c => c.total > 0)
                .sort((a, b) => b.total - a.total);

            // Calculate subset totals for percentage
            const trainTotal = classCountsBySubset.train.reduce((a, b) => a + b, 0);
            const valTotal = classCountsBySubset.val.reduce((a, b) => a + b, 0);
            const testTotal = classCountsBySubset.test.reduce((a, b) => a + b, 0);

            // Build datasets - use percentage for comparison
            const datasets = [];

            if (trainTotal > 0) {
                datasets.push({
                    label: 'Train',
                    data: classData.map(c => trainTotal > 0 ? (c.train / trainTotal * 100) : 0),
                    backgroundColor: colors[0],
                    borderRadius: 3
                });
            }

            if (valTotal > 0) {
                datasets.push({
                    label: 'Val',
                    data: classData.map(c => valTotal > 0 ? (c.val / valTotal * 100) : 0),
                    backgroundColor: colors[2],
                    borderRadius: 3
                });
            }

            if (testTotal > 0) {
                datasets.push({
                    label: 'Test',
                    data: classData.map(c => testTotal > 0 ? (c.test / testTotal * 100) : 0),
                    backgroundColor: colors[5],
                    borderRadius: 3
                });
            }

            // Only show chart if there are at least 2 subsets to compare
            if (datasets.length >= 2) {
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: classData.map(c => c.name),
                        datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: { color: '${textColor}' }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const classIdx = context.dataIndex;
                                        const subsetName = context.dataset.label;
                                        const subsetKey = subsetName.toLowerCase();
                                        const count = classData[classIdx][subsetKey];
                                        const total = subsetName === 'Train' ? trainTotal :
                                                     subsetName === 'Val' ? valTotal : testTotal;
                                        const percentage = total > 0 ? (count / total * 100).toFixed(1) : 0;
                                        return subsetName + ': ' + count + ' labels (' + percentage + '%)';
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: '${gridColor}' },
                                ticks: { color: '${textColor}', autoSkip: false, maxRotation: 90, minRotation: 45 },
                                title: { display: true, text: 'Class', color: '${textColor}' }
                            },
                            y: {
                                grid: { color: '${gridColor}' },
                                ticks: { color: '${textColor}' },
                                title: { display: true, text: 'Percentage within subset (%)', color: '${textColor}' },
                                beginAtZero: true
                            }
                        }
                    }
                });
            } else {
                // Hide chart if only one subset exists
                const container = document.getElementById('classDistributionBySubsetChart').parentElement.parentElement;
                container.style.display = 'none';
            }
        })();

        // ========== Chart 5: Box Size Scatter Plot (Square) ==========
        (function() {
            const ctx = document.getElementById('boxSizeChart').getContext('2d');

            // Sample data if too many points (for performance)
            const maxPoints = 2000;
            const sampleRate = Math.max(1, Math.floor(chartData.boxSizes.length / maxPoints));
            const sampledData = chartData.boxSizes
                .filter((_, i) => i % sampleRate === 0)
                .map(box => ({ x: box.w, y: box.h }));

            new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        data: sampledData,
                        backgroundColor: 'rgba(0, 152, 255, 0.4)',
                        borderColor: colors[0],
                        borderWidth: 1,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    }]
                },
                options: {
                    ...chartDefaults,
                    aspectRatio: 1,  // 散点图必须正方形
                    scales: {
                        x: {
                            ...chartDefaults.scales.x,
                            title: { display: true, text: 'Width (normalized)', color: '${textColor}' },
                            min: 0,
                            max: 1
                        },
                        y: {
                            ...chartDefaults.scales.y,
                            title: { display: true, text: 'Height (normalized)', color: '${textColor}' },
                            min: 0,
                            max: 1
                        }
                    }
                }
            });
        })();

        // ========== Chart 5.5: Box Center 2D Distribution (NEW!) ==========
        (function() {
            const ctx = document.getElementById('boxCenter2DChart').getContext('2d');

            // Sample data if too many points (for performance)
            const maxPoints = 2000;
            const sampleRate = Math.max(1, Math.floor(chartData.boxCenterX.length / maxPoints));
            const sampledCenters = [];

            for (let i = 0; i < chartData.boxCenterX.length; i++) {
                if (i % sampleRate === 0) {
                    sampledCenters.push({
                        x: chartData.boxCenterX[i],
                        y: chartData.boxCenterY[i]
                    });
                }
            }

            new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        data: sampledCenters,
                        backgroundColor: 'rgba(54, 201, 184, 0.5)',  // 青绿色半透明
                        borderColor: colors[1],
                        borderWidth: 1,
                        pointRadius: 2,
                        pointHoverRadius: 4
                    }]
                },
                options: {
                    ...chartDefaults,
                    aspectRatio: 1,  // 正方形
                    scales: {
                        x: {
                            ...chartDefaults.scales.x,
                            title: { display: true, text: 'Center X', color: '${textColor}' },
                            min: 0,
                            max: 1,
                            grid: {
                                color: '${gridColor}',
                                lineWidth: 1
                            }
                        },
                        y: {
                            ...chartDefaults.scales.y,
                            title: { display: true, text: 'Center Y', color: '${textColor}' },
                            min: 0,
                            max: 1,
                            reverse: true,  // 图片坐标系：Y=0 在顶部
                            grid: {
                                color: '${gridColor}',
                                lineWidth: 1
                            }
                        }
                    }
                }
            });
        })();

        // ========== Chart 6: Box Area Histogram ==========
        (function() {
            const ctx = document.getElementById('boxAreaChart').getContext('2d');

            // Create histogram bins
            const bins = 20;
            const histogram = new Array(bins).fill(0);
            const binWidth = 1 / bins;

            chartData.boxAreas.forEach(area => {
                const binIndex = Math.min(Math.floor(area / binWidth), bins - 1);
                histogram[binIndex]++;
            });

            const labels = histogram.map((_, i) => {
                const start = (i * binWidth * 100).toFixed(0);
                const end = ((i + 1) * binWidth * 100).toFixed(0);
                return \`\${start}-\${end}%\`;
            });

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        data: histogram,
                        backgroundColor: colors[1],
                        borderRadius: 3
                    }]
                },
                options: {
                    ...chartDefaults,
                    scales: {
                        x: {
                            ...chartDefaults.scales.x,
                            title: { display: true, text: 'Box area (% of image)', color: '${textColor}' }
                        },
                        y: {
                            ...chartDefaults.scales.y,
                            title: { display: true, text: 'Number of boxes', color: '${textColor}' },
                            beginAtZero: true
                        }
                    }
                }
            });
        })();

        // ========== Chart 7: Center X Distribution ==========
        (function() {
            const ctx = document.getElementById('centerXChart').getContext('2d');

            const bins = 20;
            const histogram = new Array(bins).fill(0);
            const binWidth = 1 / bins;

            chartData.boxCenterX.forEach(x => {
                const binIndex = Math.min(Math.floor(x / binWidth), bins - 1);
                histogram[binIndex]++;
            });

            const labels = histogram.map((_, i) => {
                const start = (i * binWidth).toFixed(2);
                const end = ((i + 1) * binWidth).toFixed(2);
                return \`\${start}-\${end}\`;
            });

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        data: histogram,
                        backgroundColor: colors[2],
                        borderRadius: 3
                    }]
                },
                options: {
                    ...chartDefaults,
                    scales: {
                        x: {
                            ...chartDefaults.scales.x,
                            title: { display: true, text: 'Center X position (normalized)', color: '${textColor}' }
                        },
                        y: {
                            ...chartDefaults.scales.y,
                            title: { display: true, text: 'Number of boxes', color: '${textColor}' },
                            beginAtZero: true
                        }
                    }
                }
            });
        })();

        // ========== Chart 8: Center Y Distribution ==========
        (function() {
            const ctx = document.getElementById('centerYChart').getContext('2d');

            const bins = 20;
            const histogram = new Array(bins).fill(0);
            const binWidth = 1 / bins;

            chartData.boxCenterY.forEach(y => {
                const binIndex = Math.min(Math.floor(y / binWidth), bins - 1);
                histogram[binIndex]++;
            });

            const labels = histogram.map((_, i) => {
                const start = (i * binWidth).toFixed(2);
                const end = ((i + 1) * binWidth).toFixed(2);
                return \`\${start}-\${end}\`;
            });

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        data: histogram,
                        backgroundColor: colors[4],
                        borderRadius: 3
                    }]
                },
                options: {
                    ...chartDefaults,
                    scales: {
                        x: {
                            ...chartDefaults.scales.x,
                            title: { display: true, text: 'Center Y position (normalized)', color: '${textColor}' }
                        },
                        y: {
                            ...chartDefaults.scales.y,
                            title: { display: true, text: 'Number of boxes', color: '${textColor}' },
                            beginAtZero: true
                        }
                    }
                }
            });
        })();
    </script>
</body>
</html>`;
}
