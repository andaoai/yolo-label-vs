import * as vscode from 'vscode';
import * as path from 'path';
import { DatasetStatisticsService, DatasetStatistics } from './services/DatasetStatisticsService';
import { generateDashboardHtml } from './utils/dashboardHtml';

/**
 * Dataset Statistics Dashboard Panel
 */
export class DatasetStatsPanel {
    public static activePanels: Map<string, DatasetStatsPanel> = new Map<string, DatasetStatsPanel>();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _yamlUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _statistics?: DatasetStatistics;

    public static createOrShow(extensionUri: vscode.Uri, yamlUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const yamlFileName = path.basename(yamlUri.fsPath);
        const existingPanel = DatasetStatsPanel.activePanels.get(yamlUri.fsPath);

        if (existingPanel) {
            existingPanel._panel.reveal(column);
            return;
        }

        const iconPath = vscode.Uri.joinPath(extensionUri, 'docs', 'images', 'icon.svg');

        const panel = vscode.window.createWebviewPanel(
            'yoloDatasetStats',
            `Dataset Stats - ${yamlFileName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        panel.iconPath = iconPath;

        const newPanel = new DatasetStatsPanel(panel, extensionUri, yamlUri);
        DatasetStatsPanel.activePanels.set(yamlUri.fsPath, newPanel);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, yamlUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._yamlUri = yamlUri;

        this._loadStatistics();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    private async _loadStatistics(): Promise<void> {
        try {
            // Show loading state
            this._panel.webview.html = this._getLoadingHtml();

            // Get workspace folder for path resolution
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            // Calculate statistics
            this._statistics = await DatasetStatisticsService.calculateStatistics(this._yamlUri.fsPath, workspaceFolder);

            // Generate and show dashboard
            this._panel.webview.html = generateDashboardHtml(
                this._extensionUri,
                this._panel.webview,
                this._statistics
            );
        } catch (error: any) {
            console.error('Error loading dataset statistics:', error);
            this._panel.webview.html = this._getErrorHtml(error.message);
        }
    }

    private _getLoadingHtml(): string {
        const yamlFileName = path.basename(this._yamlUri.fsPath);
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Loading...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            padding: 60px 20px;
            color: #cccccc;
            background-color: #1e1e1e;
            text-align: center;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #444;
            border-top-color: #0098ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        h2 {
            color: #fff;
            margin-bottom: 10px;
        }
        p {
            color: #888;
        }
    </style>
</head>
<body>
    <div class="spinner"></div>
    <h2>Calculating Statistics...</h2>
    <p>Analyzing ${yamlFileName} dataset, this may take a moment for large datasets.</p>
</body>
</html>`;
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            padding: 40px 20px;
            color: #cccccc;
            background-color: #1e1e1e;
            text-align: center;
        }
        h2 {
            color: #f14c4c;
            margin-bottom: 15px;
        }
        .error-box {
            background-color: #252526;
            padding: 15px;
            border-radius: 6px;
            margin: 20px auto;
            max-width: 500px;
            text-align: left;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <h2>❌ Error Loading Statistics</h2>
    <div class="error-box">${message}</div>
</body>
</html>`;
    }

    public dispose(): void {
        DatasetStatsPanel.activePanels.delete(this._yamlUri.fsPath);

        if (this._panel) {
            this._panel.dispose();
        }

        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
