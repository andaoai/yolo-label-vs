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
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const classNames = this._yoloReader.getClassNames();
        const currentImage = this._yoloReader.getCurrentImage();
        const labels = currentImage ? this._yoloReader.readLabels(currentImage) : [];

        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>YOLO Labeling</title>
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        font-family: Arial, sans-serif;
                    }
                    .controls {
                        margin-bottom: 20px;
                    }
                    #imageCanvas {
                        border: 1px solid #ccc;
                        max-width: 100%;
                    }
                    .label-select {
                        margin-right: 10px;
                    }
                    button {
                        padding: 5px 10px;
                        margin-right: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="controls">
                    <button id="prevImage">Previous</button>
                    <button id="nextImage">Next</button>
                    <select id="labelSelect" class="label-select">
                        ${classNames.map((name, index) => `<option value="${index}">${name}</option>`).join('')}
                    </select>
                    <button id="saveLabels">Save Labels</button>
                </div>
                <canvas id="imageCanvas"></canvas>
                <script>
                    const vscode = acquireVsCodeApi();
                    let currentImage = null;
                    let labels = ${JSON.stringify(labels)};
                    let isDrawing = false;
                    let startX, startY;
                    let currentLabel = 0;

                    const canvas = document.getElementById('imageCanvas');
                    const ctx = canvas.getContext('2d');
                    const labelSelect = document.getElementById('labelSelect');

                    function loadImage(imagePath) {
                        currentImage = new Image();
                        currentImage.onload = () => {
                            canvas.width = currentImage.width;
                            canvas.height = currentImage.height;
                            ctx.drawImage(currentImage, 0, 0);
                            drawLabels();
                        };
                        currentImage.src = imagePath;
                    }

                    function drawLabels() {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(currentImage, 0, 0);
                        
                        labels.forEach(label => {
                            const x = label.x * canvas.width;
                            const y = label.y * canvas.height;
                            const width = label.width * canvas.width;
                            const height = label.height * canvas.height;
                            
                            ctx.strokeStyle = '#00ff00';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(x - width/2, y - height/2, width, height);
                            
                            ctx.fillStyle = '#00ff00';
                            ctx.fillText(labelSelect.options[label.class].text, x - width/2, y - height/2 - 5);
                        });
                    }

                    canvas.addEventListener('mousedown', (e) => {
                        isDrawing = true;
                        const rect = canvas.getBoundingClientRect();
                        startX = (e.clientX - rect.left) / canvas.width;
                        startY = (e.clientY - rect.top) / canvas.height;
                    });

                    canvas.addEventListener('mousemove', (e) => {
                        if (!isDrawing) return;
                        
                        const rect = canvas.getBoundingClientRect();
                        const currentX = (e.clientX - rect.left) / canvas.width;
                        const currentY = (e.clientY - rect.top) / canvas.height;
                        
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(currentImage, 0, 0);
                        drawLabels();
                        
                        const width = Math.abs(currentX - startX);
                        const height = Math.abs(currentY - startY);
                        const x = Math.min(startX, currentX) + width/2;
                        const y = Math.min(startY, currentY) + height/2;
                        
                        ctx.strokeStyle = '#ff0000';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x * canvas.width - width * canvas.width/2, 
                                     y * canvas.height - height * canvas.height/2, 
                                     width * canvas.width, 
                                     height * canvas.height);
                    });

                    canvas.addEventListener('mouseup', (e) => {
                        if (!isDrawing) return;
                        
                        const rect = canvas.getBoundingClientRect();
                        const currentX = (e.clientX - rect.left) / canvas.width;
                        const currentY = (e.clientY - rect.top) / canvas.height;
                        
                        const width = Math.abs(currentX - startX);
                        const height = Math.abs(currentY - startY);
                        const x = Math.min(startX, currentX) + width/2;
                        const y = Math.min(startY, currentY) + height/2;
                        
                        labels.push({
                            class: parseInt(labelSelect.value),
                            x: x,
                            y: y,
                            width: width,
                            height: height
                        });
                        
                        isDrawing = false;
                        drawLabels();
                    });

                    document.getElementById('prevImage').addEventListener('click', () => {
                        vscode.postMessage({ command: 'previousImage' });
                    });

                    document.getElementById('nextImage').addEventListener('click', () => {
                        vscode.postMessage({ command: 'nextImage' });
                    });

                    document.getElementById('saveLabels').addEventListener('click', () => {
                        vscode.postMessage({ 
                            command: 'saveLabels',
                            labels: labels
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'updateImage':
                                loadImage(message.imageData);
                                labels = message.labels;
                                drawLabels();
                                break;
                        }
                    });

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
                    case 'saveLabels':
                        const currentImage = this._yoloReader.getCurrentImage();
                        if (currentImage) {
                            this._yoloReader.saveLabels(currentImage, message.labels);
                            vscode.window.showInformationMessage('Labels saved successfully!');
                        }
                        return;
                    case 'nextImage':
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
                    case 'previousImage':
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