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
    // Store multiple panel instances in a Map with the YAML path as key
    public static activePanels: Map<string, LabelingPanel> = new Map<string, LabelingPanel>();
    
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _yamlUri: vscode.Uri;
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

        const newPanel = new LabelingPanel(panel, extensionUri, yamlUri);
        LabelingPanel.activePanels.set(yamlUri.fsPath, newPanel);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, yamlUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._yamlUri = yamlUri;
        
        // 创建缓存管理器，使用更具描述性的配置参数
        const CACHE_CONFIG = {
            maxItems: 20,             // 最大缓存项数
            maxSize: 20 * 1024,       // 最大缓存大小（KB）
            ttl: 10 * 60 * 1000       // 缓存生存时间（毫秒）
        };
        
        this._imageCache = new CacheManager<string>(CACHE_CONFIG);
        
        // 初始化服务类
        this._imageService = new ImageService(this._imageCache);
        this._uiService = new UiService(this._extensionUri);
        
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