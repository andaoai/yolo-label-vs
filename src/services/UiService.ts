import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * UI服务类
 * 负责生成HTML、错误页面和其他UI相关功能
 */
export class UiService {
    
    /**
     * 构造函数
     * @param _extensionUri 扩展URI，用于解析资源路径
     */
    constructor(private readonly _extensionUri: vscode.Uri) {}
    
    /**
     * 生成错误HTML页面
     * @param message 错误信息
     * @returns 格式化的HTML字符串
     */
    public getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Error</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                        padding: 20px;
                        color: #cccccc;
                        background-color: #1e1e1e;
                    }
                    h1 { color: #f14c4c; }
                    .error-details {
                        background-color: #252526;
                        padding: 12px;
                        border-radius: 4px;
                        margin-top: 10px;
                    }
                    button {
                        margin-top: 20px;
                        padding: 8px 16px;
                        background-color: #0098ff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                </style>
                <script>
                    const vscode = acquireVsCodeApi();
                </script>
            </head>
            <body>
                <h1>Error</h1>
                <p>${message}</p>
                <div class="error-details">
                    <p>Try the following:</p>
                    <ul>
                        <li>Check if the YAML file exists and has correct permissions</li>
                        <li>Verify that image paths in the YAML file are correct</li>
                        <li>Make sure the image files exist in the specified locations</li>
                    </ul>
                </div>
                <button onclick="vscode.postMessage({ command: 'reload' })">Reload Panel</button>
            </body>
            </html>`;
    }
    
    /**
     * 向HTML添加重载按钮
     * @param html 原始HTML
     * @returns 添加了重载按钮的HTML
     */
    public addReloadButtonToHtml(html: string): string {
        return html.replace('</body>',
            `<button id="reloadButton" style="margin-top: 20px; padding: 8px 16px; background-color: #0098ff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Reload Panel
            </button>
            <script>
                document.getElementById('reloadButton').addEventListener('click', () => {
                    const vscode = acquireVsCodeApi();
                    vscode.postMessage({ command: 'reload' });
                });
            </script>
            </body>`
        );
    }
    
    /**
     * 生成WebView HTML
     * @param options 生成HTML所需的参数
     * @returns Promise<string> 生成的HTML字符串
     */
    public async generateWebviewHtml(options: {
        classNames: string[];
        initialImageData: string | null;
        initialLabels: any[];
        imageInfoText: string;
        webview: vscode.Webview;
        currentPath?: string;
        kptShape?: number[];
        flipIdx?: number[];
    }): Promise<string> {
        const { classNames, initialImageData, initialLabels, webview, currentPath, kptShape, flipIdx } = options;

        // 获取资源文件的路径
        const cssPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'templates', 'labeling-panel.css');
        const mainJsPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'templates', 'main.js');
        const workerJsPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'templates', 'worker.js');
        const cssSrc = webview.asWebviewUri(cssPath);
        const mainJsSrc = webview.asWebviewUri(mainJsPath);
        const workerJsSrc = webview.asWebviewUri(workerJsPath);

        // 读取HTML模板（新架构使用 index.html）
        const templatePath = path.join(this._extensionUri.fsPath, 'dist', 'templates', 'index.html');
        let html = await fs.promises.readFile(templatePath, 'utf8');

        // 注入数据到window对象（新架构的 App.ts 会读取这些全局变量）
        const dataScript = `
            <script>
                window.initialImageData = ${JSON.stringify(initialImageData)};
                window.initialLabels = ${JSON.stringify(initialLabels)};
                window.classNames = ${JSON.stringify(classNames)};
                window.currentPath = ${JSON.stringify(currentPath || '')};
                window.kptShape = ${JSON.stringify(kptShape || null)};
                window.flipIdx = ${JSON.stringify(flipIdx || null)};
                // Worker 脚本 URL（App.ts 会使用这个）
                window.__workerUrl = ${JSON.stringify(workerJsSrc.toString())};
            </script>
        `;

        // 替换资源路径
        html = html.replace('href="labeling-panel.css"', `href="${cssSrc.toString()}"`);
        html = html.replace('src="main.js"', `src="${mainJsSrc.toString()}"`);

        // 在</head>标签前插入数据脚本
        html = html.replace('</head>', `${dataScript}</head>`);

        return html;
    }
}