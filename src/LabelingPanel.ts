import * as vscode from 'vscode';
import * as path from 'path';
import { YoloDataReader } from './yolo/YoloDataReader';
import { ErrorHandler, ErrorType } from './ErrorHandler';
import { WebviewMessage } from './model/types';
import { WebviewMessageHandler } from './services/WebviewMessageHandler';
import { getErrorHtml, generateWebviewHtml } from './utils/webviewHtml';
import { loadImageAsDataUrl } from './utils/imageLoader';

export class LabelingPanel {
    // Store multiple panel instances in a Map with the YAML path as key
    public static activePanels: Map<string, LabelingPanel> = new Map<string, LabelingPanel>();
    
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _yamlUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _yoloReader?: YoloDataReader;
    private _hasError: boolean = false;
    private _messageHandler!: WebviewMessageHandler;

    public static createOrShow(extensionUri: vscode.Uri, yamlUri: vscode.Uri, imagePath?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Get the YAML file name for the panel title
        const yamlFileName = path.basename(yamlUri.fsPath);

        // Check if a panel for this YAML file already exists
        const existingPanel = LabelingPanel.activePanels.get(yamlUri.fsPath);

        if (existingPanel) {
            if (existingPanel._hasError) {
                existingPanel.dispose();
                LabelingPanel.activePanels.delete(yamlUri.fsPath);
            } else {
                existingPanel._panel.reveal(column);
                // 如果指定了图片路径，跳转到该图片
                if (imagePath) {
                    console.log('[LabelingPanel] 跳转到图片:', imagePath);
                    existingPanel._jumpToImage(imagePath);
                }
                return;
            }
        }

        // 创建自定义SVG图标URI
        const iconPath = vscode.Uri.joinPath(extensionUri, 'docs', 'images', 'icon.svg');

        const panel = vscode.window.createWebviewPanel(
            'yoloLabeling',
            `YOLO Labeling - ${yamlFileName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        // 设置自定义SVG图标
        panel.iconPath = iconPath;

        const newPanel = new LabelingPanel(panel, extensionUri, yamlUri, imagePath);
        LabelingPanel.activePanels.set(yamlUri.fsPath, newPanel);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, yamlUri: vscode.Uri, initialImagePath?: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._yamlUri = yamlUri;

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            this._yoloReader = new YoloDataReader(yamlUri.fsPath, workspaceFolder);

            // 如果指定了初始图片路径，跳转到该图片
            if (initialImagePath && this._yoloReader) {
                const success = this._yoloReader.setCurrentImageByPath(initialImagePath);
                console.log('[LabelingPanel] 初始图片跳转:', success ? '成功' : '失败', initialImagePath);
            }

            this._validateYoloReader();
        } catch (error: any) {
            this._handleInitializationError(error, yamlUri);
            return;
        }

        this._messageHandler = new WebviewMessageHandler(
            this._panel.webview,
            this._yoloReader
        );
        
        this._update();
        this._setupMessageListener();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    /**
     * 验证YOLO读取器是否正确初始化
     */
    private _validateYoloReader(): void {
        if (!this._yoloReader?.getClassNames().length || !this._yoloReader?.getCurrentImage()) {
            this._hasError = true;
            this._panel.webview.html = getErrorHtml('No images or classes found in dataset');
        }
    }

    /**
     * 跳转到指定图片
     */
    private _jumpToImage(imagePath: string): void {
        if (!this._yoloReader || this._hasError) {
            console.warn('[LabelingPanel] 无法跳转：yoloReader 未初始化或有错误');
            return;
        }

        const success = this._yoloReader.setCurrentImageByPath(imagePath);
        console.log('[LabelingPanel] setCurrentImageByPath 结果:', success, '当前图片:', this._yoloReader.getCurrentImage());
        if (success) {
            // 通知前端更新图片
            this._messageHandler.refreshImage();
        }
    }

    /**
     * 处理初始化过程中的错误
     */
    private _handleInitializationError(error: any, yamlUri: vscode.Uri): void {
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
        
        this._panel.webview.html = getErrorHtml(`Failed to load dataset configuration: ${error.message}`);
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        if (!this._yoloReader) {
            return getErrorHtml('YoloDataReader is not initialized');
        }
        
        const classNames = this._yoloReader.getClassNames();
        const currentImage = this._yoloReader.getCurrentImage();
        const labels = currentImage ? this._yoloReader.readLabels(currentImage) : [];
        let initialImageData = null;
        
        try {
            initialImageData = currentImage ? await this._loadImage(currentImage) : null;
        } catch (error: any) {
            this._hasError = true;
            return getErrorHtml(`Failed to load image: ${error.message}`);
        }

        // 获取图像计数信息，与 WebviewMessageHandler.getImageInfoText 保持格式一致
        const totalImages = this._yoloReader.getTotalImages();
        const currentIndex = this._yoloReader.getCurrentImageIndex();
        const filename = this._yoloReader.getCurrentImage()
            ? path.basename(this._yoloReader.getCurrentImage()!)
            : '';
        const imageInfoText = `图片 ${currentIndex + 1}/${totalImages} - ${filename}`;

        // 获取关键点配置
        const kptShape = this._yoloReader.getKptShape();

        return generateWebviewHtml(this._extensionUri, {
            classNames,
            initialImageData,
            initialLabels: labels,
            imageInfoText,
            webview,
            currentPath: currentImage || undefined,
            kptShape
        });
    }

    private _setupMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => {
                if (!this._yoloReader) {
                    ErrorHandler.handleError(
                        new Error('YoloDataReader is not initialized'),
                        'Failed to process message',
                        { webview: this._panel.webview }
                    );
                    return;
                }
                
                try {
                    await this._messageHandler.handleMessage(message);
                } catch (error: any) {
                    ErrorHandler.handleError(
                        error,
                        'Error processing webview message', 
                        { webview: this._panel.webview }
                    );
                }
            },
            null,
            this._disposables
        );
    }

    private async _loadImage(imagePath: string): Promise<string> {
        return loadImageAsDataUrl(imagePath);
    }

    public dispose() {
        // Remove from active panels map
        if (this._yamlUri) {
            LabelingPanel.activePanels.delete(this._yamlUri.fsPath);
        }
        
        // 清理面板资源
        if (this._panel) {
            this._panel.dispose();
        }

        // 清理订阅
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
} 