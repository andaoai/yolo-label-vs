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
    private _imageCache: Map<string, string> = new Map();
    private readonly _maxCacheSize = 10;

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
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
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
        } catch (error: any) {
            console.error('Error initializing YoloDataReader:', error);
            this._panel.webview.html = this._getErrorHtml(`Failed to load dataset configuration: ${error.message}`);
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
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                        padding: 20px;
                        color: #cccccc;
                        background-color: #1e1e1e;
                    }
                    h1 { color: #f14c4c; }
                </style>
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

        // Read the HTML template
        const templatePath = path.join(this._extensionUri.fsPath, 'src', 'templates', 'labeling-panel.html');
        let html = await fs.promises.readFile(templatePath, 'utf8');

        // Replace placeholders with actual data
        html = html.replace('{{classNames}}', classNames.map((name, index) => `<option value="${index}">${name}</option>`).join(''));
        html = html.replace('`{{initialImageData}}`', JSON.stringify(initialImageData));
        html = html.replace('`{{labels}}`', JSON.stringify(labels));

        // Add image count information
        const totalImages = this._yoloReader.getTotalImages();
        const currentIndex = this._yoloReader.getCurrentImageIndex();
        html = html.replace('{{imageInfo}}', `Image: ${currentIndex + 1} of ${totalImages}`);

        return html;
    }

    private _setupMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async message => {
                try {
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
                                    labels: labels,
                                    imageInfo: `Image: ${this._yoloReader.getCurrentImageIndex() + 1} of ${this._yoloReader.getTotalImages()}`
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
                                    labels: labels,
                                    imageInfo: `Image: ${this._yoloReader.getCurrentImageIndex() + 1} of ${this._yoloReader.getTotalImages()}`
                                });
                            }
                            return;
                        case 'getImageList':
                            // Send the list of all images to the webview
                            this._panel.webview.postMessage({
                                command: 'imageList',
                                files: this._yoloReader.getAllImages()
                            });
                            return;
                        case 'loadImage':
                            // Load specific image by path
                            const imagePath = message.file;
                            if (imagePath && this._yoloReader.setCurrentImageByPath(imagePath)) {
                                const imageData = await this._loadImage(imagePath);
                                const labels = this._yoloReader.readLabels(imagePath);
                                this._panel.webview.postMessage({ 
                                    command: 'updateImage', 
                                    imageData: imageData,
                                    labels: labels,
                                    imageInfo: `Image: ${this._yoloReader.getCurrentImageIndex() + 1} of ${this._yoloReader.getTotalImages()}`
                                });
                            }
                            return;
                    }
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Error: ${error.message}`);
                }
            },
            null,
            this._disposables
        );
    }

    private async _loadImage(imagePath: string): Promise<string> {
        // Check cache first
        const cachedImage = this._imageCache.get(imagePath);
        if (cachedImage) {
            return cachedImage;
        }

        try {
            const imageBuffer = await fs.promises.readFile(imagePath);
            const imageData = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            
            // Update cache
            this._imageCache.set(imagePath, imageData);
            
            // Maintain cache size
            if (this._imageCache.size > this._maxCacheSize) {
                const firstKey = this._imageCache.keys().next().value;
                if (firstKey) {
                    this._imageCache.delete(firstKey);
                }
            }
            
            return imageData;
        } catch (error: any) {
            throw new Error(`Failed to load image: ${error.message}`);
        }
    }

    public dispose() {
        LabelingPanel.currentPanel = undefined;
        this._panel.dispose();
        this._imageCache.clear();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
} 