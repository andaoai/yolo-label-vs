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

        // Read the HTML template
        const templatePath = path.join(this._extensionUri.fsPath, 'src', 'templates', 'labeling-panel.html');
        let html = await fs.promises.readFile(templatePath, 'utf8');

        // Replace placeholders with actual data
        html = html.replace('{{classNames}}', classNames.map((name, index) => `<option value="${index}">${name}</option>`).join(''));
        html = html.replace('`{{initialImageData}}`', JSON.stringify(initialImageData));
        html = html.replace('`{{labels}}`', JSON.stringify(labels));

        return html;
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