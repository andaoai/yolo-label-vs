import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { YoloDataReader, BoundingBox } from './YoloDataReader';
import { ErrorHandler, ErrorType } from './ErrorHandler';
import { CacheManager } from './model/CacheManager';
import { WebviewMessage, WebviewToExtensionMessage, LoadImageMessage, SaveLabelsMessage } from './model/types';

export class LabelingPanel {
    public static currentPanel: LabelingPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _yoloReader?: YoloDataReader;
    private _imageCache: CacheManager<string>;
    private _hasError: boolean = false;

    public static createOrShow(extensionUri: vscode.Uri, yamlUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (LabelingPanel.currentPanel) {
            if (LabelingPanel.currentPanel._hasError) {
                LabelingPanel.currentPanel.dispose();
                LabelingPanel.currentPanel = undefined;
            } else {
                LabelingPanel.currentPanel._panel.reveal(column);
                return;
            }
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
        
        this._imageCache = new CacheManager<string>({
            maxItems: 20,
            maxSize: 20 * 1024,
            ttl: 10 * 60 * 1000
        });
        
        try {
            this._yoloReader = new YoloDataReader(yamlUri.fsPath);
            if (!this._yoloReader.getClassNames().length || !this._yoloReader.getCurrentImage()) {
                this._hasError = true;
                this._panel.webview.html = this._getErrorHtml('No images or classes found in dataset');
                return;
            }
        } catch (error: any) {
            this._hasError = true;
            console.error('Error initializing YoloDataReader:', error);
            
            ErrorHandler.handleError(
                error, 
                'Failed to initialize YoloDataReader',
                {
                    type: ErrorType.CONFIG_ERROR,
                    filePath: yamlUri.fsPath,
                    webview: this._panel.webview
                }
            );
            
            this._panel.webview.html = this._getErrorHtml(`Failed to load dataset configuration: ${error.message}`);
            return;
        }

        this._update();
        this._setupMessageListener();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        if (this._hasError) {
            this._addReloadButton();
        }
    }

    private _addReloadButton() {
        this._panel.webview.html = this._panel.webview.html.replace('</body>',
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

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        if (!this._yoloReader) {
            return this._getErrorHtml('YoloDataReader is not initialized');
        }
        
        const classNames = this._yoloReader.getClassNames();
        const currentImage = this._yoloReader.getCurrentImage();
        const labels = currentImage ? this._yoloReader.readLabels(currentImage) : [];
        let initialImageData = null;
        
        try {
            initialImageData = currentImage ? await this._loadImage(currentImage) : null;
        } catch (error: any) {
            this._hasError = true;
            return this._getErrorHtml(`Failed to load image: ${error.message}`);
        }

        // Get path to CSS and JS files
        const cssPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'templates', 'labeling-panel.css');
        const jsPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'templates', 'labeling-panel.js');
        const cssSrc = webview.asWebviewUri(cssPath);
        const jsSrc = webview.asWebviewUri(jsPath);

        // Read the HTML template
        const templatePath = path.join(this._extensionUri.fsPath, 'src', 'templates', 'labeling-panel.html');
        let html = await fs.promises.readFile(templatePath, 'utf8');

        // Inject data into window object
        const dataScript = `
            <script>
                window.initialImageData = ${JSON.stringify(initialImageData)};
                window.initialLabels = ${JSON.stringify(labels)};
                window.classNames = ${JSON.stringify(classNames)};
            </script>
        `;

        // Replace placeholders with actual data
        html = html.replace('{{classNames}}', classNames.map((name, index) => `<option value="${index}">${name}</option>`).join(''));
        html = html.replace('labeling-panel.css', cssSrc.toString());
        html = html.replace('labeling-panel.js', jsSrc.toString());

        // Add image count information
        const totalImages = this._yoloReader.getTotalImages();
        const currentIndex = this._yoloReader.getCurrentImageIndex();
        html = html.replace('{{imageInfo}}', `Image: ${currentIndex + 1} of ${totalImages}`);

        // Insert the data script before the closing head tag
        html = html.replace('</head>', `${dataScript}</head>`);

        return html;
    }

    private _setupMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => {
                try {
                    const extMessage = message as WebviewToExtensionMessage;
                    
                    switch (extMessage.command) {
                        case 'reload':
                            this.dispose();
                            vscode.commands.executeCommand('yolo-labeling-vs.openLabelingPanel');
                            return;
                            
                        case 'getImageList':
                            if (!this._yoloReader) {
                                throw new Error('YoloDataReader is not initialized');
                            }
                            this._panel.webview.postMessage({
                                command: 'imageList',
                                paths: this._yoloReader.getAllImages()
                            });
                            return;
                            
                        case 'loadImage':
                            if (!this._yoloReader) {
                                throw new Error('YoloDataReader is not initialized');
                            }
                            
                            const loadImageMessage = message as LoadImageMessage;
                            if (loadImageMessage.path) {
                                try {
                                    const imageData = await this._loadImage(loadImageMessage.path);
                                    const labels = this._yoloReader.readLabels(loadImageMessage.path);
                                    this._yoloReader.setCurrentImageByPath(loadImageMessage.path);
                                    this._panel.webview.postMessage({ 
                                        command: 'updateImage', 
                                        imageData: imageData,
                                        labels: labels,
                                        currentPath: loadImageMessage.path,
                                        imageInfo: `Image: ${this._yoloReader.getCurrentImageIndex() + 1} of ${this._yoloReader.getTotalImages()}`
                                    });
                                } catch (error: any) {
                                    ErrorHandler.handleError(
                                        error,
                                        'Image loading failed',
                                        {
                                            filePath: loadImageMessage.path,
                                            webview: this._panel.webview,
                                            type: ErrorType.IMAGE_LOAD_ERROR
                                        }
                                    );
                                }
                            }
                            return;
                            
                        case 'save':
                            if (!this._yoloReader) {
                                throw new Error('YoloDataReader is not initialized');
                            }
                            const currentImage = this._yoloReader.getCurrentImage();
                            if (currentImage) {
                                try {
                                    const saveMessage = message as SaveLabelsMessage;
                                    this._yoloReader.saveLabels(currentImage, saveMessage.labels);
                                    vscode.window.showInformationMessage('Labels saved successfully!');
                                } catch (error: any) {
                                    ErrorHandler.handleError(
                                        error,
                                        'Failed to save labels',
                                        {
                                            filePath: currentImage,
                                            webview: this._panel.webview,
                                            type: ErrorType.LABEL_SAVE_ERROR
                                        }
                                    );
                                }
                            }
                            return;
                            
                        case 'next':
                            if (!this._yoloReader) {
                                throw new Error('YoloDataReader is not initialized');
                            }
                            const nextImage = this._yoloReader.getNextImage();
                            if (nextImage) {
                                try {
                                    const imageData = await this._loadImage(nextImage);
                                    const labels = this._yoloReader.readLabels(nextImage);
                                    this._panel.webview.postMessage({ 
                                        command: 'updateImage', 
                                        imageData: imageData,
                                        labels: labels,
                                        currentPath: nextImage,
                                        imageInfo: `Image: ${this._yoloReader.getCurrentImageIndex() + 1} of ${this._yoloReader.getTotalImages()}`
                                    });
                                } catch (error: any) {
                                    ErrorHandler.handleError(
                                        error,
                                        'Failed to load next image',
                                        {
                                            filePath: nextImage,
                                            webview: this._panel.webview,
                                            type: ErrorType.IMAGE_LOAD_ERROR,
                                            recoverable: true
                                        }
                                    );
                                }
                            }
                            return;
                            
                        case 'previous':
                            if (!this._yoloReader) {
                                throw new Error('YoloDataReader is not initialized');
                            }
                            const prevImage = this._yoloReader.getPreviousImage();
                            if (prevImage) {
                                try {
                                    const imageData = await this._loadImage(prevImage);
                                    const labels = this._yoloReader.readLabels(prevImage);
                                    this._panel.webview.postMessage({ 
                                        command: 'updateImage', 
                                        imageData: imageData,
                                        labels: labels,
                                        currentPath: prevImage,
                                        imageInfo: `Image: ${this._yoloReader.getCurrentImageIndex() + 1} of ${this._yoloReader.getTotalImages()}`
                                    });
                                } catch (error: any) {
                                    ErrorHandler.handleError(
                                        error,
                                        'Failed to load previous image',
                                        {
                                            filePath: prevImage,
                                            webview: this._panel.webview,
                                            type: ErrorType.IMAGE_LOAD_ERROR,
                                            recoverable: true
                                        }
                                    );
                                }
                            }
                            return;
                    }
                } catch (error: any) {
                    ErrorHandler.handleError(
                        error,
                        'Command handling error',
                        {
                            webview: this._panel.webview
                        }
                    );
                }
            },
            null,
            this._disposables
        );
    }

    private async _loadImage(imagePath: string): Promise<string> {
        const cachedImage = this._imageCache.get(imagePath);
        if (cachedImage) {
            return cachedImage;
        }

        try {
            await fs.promises.access(imagePath, fs.constants.R_OK);
            const imageBuffer = await fs.promises.readFile(imagePath);
            
            const ext = path.extname(imagePath).toLowerCase();
            let mimeType = 'image/jpeg';
            
            if (ext === '.png') {
                mimeType = 'image/png';
            } else if (ext === '.gif') {
                mimeType = 'image/gif';
            } else if (ext === '.webp') {
                mimeType = 'image/webp';
            } else if (ext === '.bmp') {
                mimeType = 'image/bmp';
            }
            
            const imageData = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
            
            this._imageCache.set(imagePath, imageData);
            
            return imageData;
        } catch (error: any) {
            const errorDetails = ErrorHandler.handleError(
                error,
                'Image loading error',
                {
                    filePath: imagePath,
                    showNotification: false
                }
            );
            
            if (error.code === 'ENOENT') {
                throw new Error(`Image file not found: ${imagePath}`);
            } else if (error.code === 'EACCES') {
                throw new Error(`Permission denied when reading image: ${imagePath}`);
            }
            throw new Error(`Failed to load image '${imagePath}': ${error.message}`);
        }
    }

    public dispose() {
        LabelingPanel.currentPanel = undefined;
        this._hasError = false;
        this._yoloReader = undefined;
        this._imageCache.clear();
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
} 