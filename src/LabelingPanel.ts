import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { YoloDataReader, BoundingBox } from './YoloDataReader';
import { ErrorHandler, ErrorType } from './ErrorHandler';
import { CacheManager } from './model/CacheManager';
import { 
    WebviewMessage, 
    WebviewToExtensionMessage, 
    LoadImageMessage, 
    SaveLabelsMessage,
    UpdateImageMessage 
} from './model/types';
import { ImageService } from './services/ImageService';
import { UiService } from './services/UiService';
import { WebviewMessageHandler } from './services/WebviewMessageHandler';

export class LabelingPanel {
    public static currentPanel: LabelingPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _yoloReader?: YoloDataReader;
    private _imageCache: CacheManager<string>;
    private _hasError: boolean = false;
    private _imageService: ImageService;
    private _uiService: UiService;
    private _messageHandler!: WebviewMessageHandler;

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
        
        // 创建缓存管理器，使用更具描述性的配置参数
        const CACHE_CONFIG = {
            maxItems: 20,             // 最大缓存项数
            maxSize: 20 * 1024,       // 最大缓存大小（KB）
            ttl: 10 * 60 * 1000       // 缓存生存时间（毫秒）
        };
        
        this._imageCache = new CacheManager<string>(CACHE_CONFIG);
        
        // 初始化服务类
        this._imageService = new ImageService(this._imageCache);
        this._uiService = new UiService(extensionUri);
        
        try {
            this._yoloReader = new YoloDataReader(yamlUri.fsPath);
            this._validateYoloReader();
        } catch (error: any) {
            this._handleInitializationError(error, yamlUri);
            return;
        }

        this._messageHandler = new WebviewMessageHandler(
            this._panel.webview, 
            this._yoloReader,
            this._imageService
        );
        
        this._update();
        this._setupMessageListener();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        if (this._hasError) {
            this._addReloadButton();
        }
    }

    /**
     * 验证YOLO读取器是否正确初始化
     */
    private _validateYoloReader(): void {
        if (!this._yoloReader?.getClassNames().length || !this._yoloReader?.getCurrentImage()) {
            this._hasError = true;
            this._panel.webview.html = this._uiService.getErrorHtml('No images or classes found in dataset');
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
        
        this._panel.webview.html = this._uiService.getErrorHtml(`Failed to load dataset configuration: ${error.message}`);
    }

    private _addReloadButton() {
        this._panel.webview.html = this._uiService.addReloadButtonToHtml(this._panel.webview.html);
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        if (!this._yoloReader) {
            return this._uiService.getErrorHtml('YoloDataReader is not initialized');
        }
        
        const classNames = this._yoloReader.getClassNames();
        const currentImage = this._yoloReader.getCurrentImage();
        const labels = currentImage ? this._yoloReader.readLabels(currentImage) : [];
        let initialImageData = null;
        
        try {
            initialImageData = currentImage ? await this._loadImage(currentImage) : null;
        } catch (error: any) {
            this._hasError = true;
            return this._uiService.getErrorHtml(`Failed to load image: ${error.message}`);
        }

        // 获取图像计数信息
        const totalImages = this._yoloReader.getTotalImages();
        const currentIndex = this._yoloReader.getCurrentImageIndex();
        const imageInfoText = `Image: ${currentIndex + 1} of ${totalImages}`;

        return this._uiService.generateWebviewHtml({
            classNames,
            initialImageData,
            initialLabels: labels,
            imageInfoText,
            webview,
            currentPath: currentImage || undefined
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
        return this._imageService.loadImage(imagePath);
    }

    public dispose() {
        // 清理面板资源
        if (this._panel) {
            this._panel.dispose();
        }

        // 清理订阅
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];

        // 重置静态引用
        LabelingPanel.currentPanel = undefined;
    }
} 