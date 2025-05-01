import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { YoloDataReader, BoundingBox } from './YoloDataReader';

export class LabelingPanel {
    public static currentPanel: LabelingPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _yoloReader!: YoloDataReader;

    public static createOrShow(extensionUri: vscode.Uri, yamlUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (LabelingPanel.currentPanel) {
            LabelingPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'yoloLabeling',
            'YOLO Labeling',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        LabelingPanel.currentPanel = new LabelingPanel(panel, extensionUri, yamlUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, yamlUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        
        try {
            this._yoloReader = new YoloDataReader(yamlUri.fsPath);
            if (this._yoloReader.getClassNames().length === 0 || !this._yoloReader.getCurrentImage()) {
                this._panel.webview.html = this._getErrorHtml('No images or classes found in dataset');
                return;
            }
        } catch (error) {
            console.error('Error initializing YoloDataReader:', error);
            this._panel.webview.html = this._getErrorHtml('Failed to load dataset configuration');
            return;
        }

        this._update();
        this._setupMessageListener();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Error</title>
            </head>
            <body>
                <h1>Error</h1>
                <p>${message}</p>
            </body>
            </html>`;
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const classNames = this._yoloReader.getClassNames();
        const currentImage = this._yoloReader.getCurrentImage();
        const labels = currentImage ? this._yoloReader.readLabels(currentImage) : [];
        const initialImageData = currentImage ? await this._loadImage(currentImage) : null;

        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>YOLO Labeling</title>
                <style>
                    :root {
                        --primary-color: #2196F3;
                        --secondary-color: #4CAF50;
                        --danger-color: #f44336;
                        --background-color: #f5f5f5;
                        --surface-color: #ffffff;
                        --text-color: #333333;
                    }

                    body {
                        margin: 0;
                        padding: 0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                        background-color: var(--background-color);
                        color: var(--text-color);
                    }

                    .container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        padding: 20px;
                        box-sizing: border-box;
                    }

                    .toolbar {
                        display: flex;
                        align-items: center;
                        background-color: var(--surface-color);
                        padding: 12px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        margin-bottom: 20px;
                    }

                    .main-content {
                        flex: 1;
                        display: flex;
                        gap: 20px;
                    }

                    .canvas-container {
                        flex: 1;
                        background-color: var(--surface-color);
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        padding: 12px;
                        position: relative;
                    }

                    .sidebar {
                        width: 250px;
                        background-color: var(--surface-color);
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        padding: 16px;
                    }

                    #imageCanvas {
                        max-width: 100%;
                        height: auto;
                        border-radius: 4px;
                    }

                    button {
                        background-color: var(--primary-color);
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: background-color 0.2s;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                    }

                    button:hover {
                        background-color: #1976D2;
                    }

                    button:active {
                        background-color: #1565C0;
                    }

                    button.secondary {
                        background-color: var(--secondary-color);
                    }

                    button.secondary:hover {
                        background-color: #43A047;
                    }

                    .nav-buttons {
                        display: flex;
                        gap: 8px;
                    }

                    select {
                        padding: 8px;
                        border-radius: 4px;
                        border: 1px solid #ddd;
                        font-size: 14px;
                        background-color: white;
                        margin: 0 12px;
                        min-width: 150px;
                    }

                    .label-list {
                        margin-top: 16px;
                    }

                    .label-item {
                        display: flex;
                        align-items: center;
                        padding: 8px;
                        background-color: #f8f9fa;
                        border-radius: 4px;
                        margin-bottom: 8px;
                    }

                    .label-color {
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        margin-right: 8px;
                    }

                    .status-bar {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px 16px;
                        background-color: var(--surface-color);
                        border-radius: 4px;
                        margin-top: 12px;
                        font-size: 12px;
                        color: #666;
                    }

                    .tooltip {
                        position: absolute;
                        background-color: rgba(0,0,0,0.8);
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        pointer-events: none;
                        z-index: 1000;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="toolbar">
                        <div class="nav-buttons">
                            <button id="prevImage">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M15 18l-6-6 6-6"/>
                                </svg>
                                Previous
                            </button>
                            <button id="nextImage">
                                Next
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 18l6-6-6-6"/>
                                </svg>
                            </button>
                        </div>
                        <select id="labelSelect" class="label-select">
                            ${classNames.map((name, index) => `<option value="${index}">${name}</option>`).join('')}
                        </select>
                        <button id="saveLabels" class="secondary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Save Labels
                        </button>
                    </div>
                    
                    <div class="main-content">
                        <div class="canvas-container">
                            <canvas id="imageCanvas"></canvas>
                        </div>
                        <div class="sidebar">
                            <h3>Labels</h3>
                            <div class="label-list" id="labelList"></div>
                        </div>
                    </div>

                    <div class="status-bar">
                        <span id="imageInfo">Image: 1 of 1</span>
                        <span id="coordinates"></span>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let currentImage = ${JSON.stringify(initialImageData)};
                    let labels = ${JSON.stringify(labels)};
                    let isDrawing = false;
                    let startX, startY;
                    let currentLabel = 0;

                    const canvas = document.getElementById('imageCanvas');
                    const ctx = canvas.getContext('2d');
                    const labelSelect = document.getElementById('labelSelect');
                    const coordinates = document.getElementById('coordinates');
                    const labelList = document.getElementById('labelList');

                    // Color palette for different classes
                    const colors = [
                        '#2196F3', '#4CAF50', '#F44336', '#FFC107', '#9C27B0',
                        '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63'
                    ];

                    function loadImage(imagePath) {
                        if (!imagePath) return;
                        
                        currentImage = new Image();
                        currentImage.onload = () => {
                            canvas.width = currentImage.width;
                            canvas.height = currentImage.height;
                            ctx.drawImage(currentImage, 0, 0);
                            drawLabels();
                            updateLabelList();
                        };
                        currentImage.src = imagePath;
                    }

                    function drawLabels() {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(currentImage, 0, 0);
                        
                        labels.forEach((label, index) => {
                            const x = label.x * canvas.width;
                            const y = label.y * canvas.height;
                            const width = label.width * canvas.width;
                            const height = label.height * canvas.height;
                            
                            ctx.strokeStyle = colors[label.class % colors.length];
                            ctx.lineWidth = 2;
                            ctx.strokeRect(x - width/2, y - height/2, width, height);
                            
                            // Draw label background
                            const text = labelSelect.options[label.class].text;
                            const textWidth = ctx.measureText(text).width;
                            ctx.fillStyle = colors[label.class % colors.length];
                            ctx.fillRect(x - width/2, y - height/2 - 20, textWidth + 10, 20);
                            
                            // Draw label text
                            ctx.fillStyle = '#ffffff';
                            ctx.font = '14px sans-serif';
                            ctx.fillText(text, x - width/2 + 5, y - height/2 - 5);
                        });
                    }

                    function updateLabelList() {
                        labelList.innerHTML = '';
                        labels.forEach((label, index) => {
                            const div = document.createElement('div');
                            div.className = 'label-item';
                            
                            const colorDiv = document.createElement('div');
                            colorDiv.className = 'label-color';
                            colorDiv.style.backgroundColor = colors[label.class % colors.length];
                            
                            const text = document.createElement('span');
                            text.textContent = labelSelect.options[label.class].text;
                            
                            const deleteBtn = document.createElement('button');
                            deleteBtn.innerHTML = '×';
                            deleteBtn.style.marginLeft = 'auto';
                            deleteBtn.onclick = () => {
                                labels.splice(index, 1);
                                drawLabels();
                                updateLabelList();
                            };
                            
                            div.appendChild(colorDiv);
                            div.appendChild(text);
                            div.appendChild(deleteBtn);
                            labelList.appendChild(div);
                        });
                    }

                    canvas.addEventListener('mousemove', (e) => {
                        const rect = canvas.getBoundingClientRect();
                        const x = (e.clientX - rect.left) / canvas.width;
                        const y = (e.clientY - rect.top) / canvas.height;
                        coordinates.textContent = \`X: \${Math.round(x * 100)}%, Y: \${Math.round(y * 100)}%\`;
                        
                        if (!isDrawing) return;
                        
                        const currentX = x;
                        const currentY = y;
                        
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(currentImage, 0, 0);
                        drawLabels();
                        
                        const width = Math.abs(currentX - startX);
                        const height = Math.abs(currentY - startY);
                        const boxX = Math.min(startX, currentX) + width/2;
                        const boxY = Math.min(startY, currentY) + height/2;
                        
                        ctx.strokeStyle = colors[currentLabel % colors.length];
                        ctx.lineWidth = 2;
                        ctx.strokeRect(boxX * canvas.width - width * canvas.width/2,
                                     boxY * canvas.height - height * canvas.height/2,
                                     width * canvas.width,
                                     height * canvas.height);
                    });

                    canvas.addEventListener('mousedown', (e) => {
                        isDrawing = true;
                        const rect = canvas.getBoundingClientRect();
                        startX = (e.clientX - rect.left) / canvas.width;
                        startY = (e.clientY - rect.top) / canvas.height;
                    });

                    canvas.addEventListener('mouseup', (e) => {
                        if (!isDrawing) return;
                        
                        const rect = canvas.getBoundingClientRect();
                        const currentX = (e.clientX - rect.left) / canvas.width;
                        const currentY = (e.clientY - rect.top) / canvas.height;
                        
                        const width = Math.abs(currentX - startX);
                        const height = Math.abs(currentY - startY);
                        
                        if (width > 0.01 && height > 0.01) {
                            const x = Math.min(startX, currentX) + width/2;
                            const y = Math.min(startY, currentY) + height/2;
                            
                            labels.push({
                                class: parseInt(labelSelect.value),
                                x: x,
                                y: y,
                                width: width,
                                height: height
                            });
                            
                            drawLabels();
                            updateLabelList();
                        }
                        
                        isDrawing = false;
                    });

                    canvas.addEventListener('mouseleave', () => {
                        isDrawing = false;
                        drawLabels();
                    });

                    document.getElementById('prevImage').addEventListener('click', () => {
                        vscode.postMessage({ command: 'previous' });
                    });

                    document.getElementById('nextImage').addEventListener('click', () => {
                        vscode.postMessage({ command: 'next' });
                    });

                    document.getElementById('saveLabels').addEventListener('click', () => {
                        vscode.postMessage({ command: 'save', labels: labels });
                    });

                    // Add message listener for image updates
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'updateImage':
                                loadImage(message.imageData);
                                labels = message.labels;
                                drawLabels();
                                updateLabelList();
                                break;
                        }
                    });

                    // Initialize with current image
                    if (currentImage) {
                        loadImage(currentImage);
                    }
                </script>
            </body>
            </html>`;
    }

    private _setupMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        const currentImage = this._yoloReader.getCurrentImage();
                        if (currentImage) {
                            this._yoloReader.saveLabels(currentImage, message.labels);
                            vscode.window.showInformationMessage('Labels saved successfully!');
                        }
                        return;
                    case 'next':
                        const nextImage = this._yoloReader.getNextImage();
                        if (nextImage) {
                            const imageData = await this._loadImage(nextImage);
                            const labels = this._yoloReader.readLabels(nextImage);
                            this._panel.webview.postMessage({ 
                                command: 'updateImage', 
                                imageData: imageData,
                                labels: labels
                            });
                        }
                        return;
                    case 'previous':
                        const prevImage = this._yoloReader.getPreviousImage();
                        if (prevImage) {
                            const imageData = await this._loadImage(prevImage);
                            const labels = this._yoloReader.readLabels(prevImage);
                            this._panel.webview.postMessage({ 
                                command: 'updateImage', 
                                imageData: imageData,
                                labels: labels
                            });
                        }
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _loadImage(imagePath: string): Promise<string> {
        const imageBuffer = await fs.promises.readFile(imagePath);
        return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    }

    public dispose() {
        LabelingPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
} 