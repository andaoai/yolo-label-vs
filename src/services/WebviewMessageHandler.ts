import * as vscode from 'vscode';
import { YoloDataReader } from '../YoloDataReader';
import { 
    WebviewMessage, 
    WebviewToExtensionMessage, 
    LoadImageMessage, 
    SaveLabelsMessage,
    UpdateImageMessage,
    OpenImageInNewTabMessage,
    OpenTxtInNewTabMessage,
    InferenceResultsMessage
} from '../model/types';
import { ErrorHandler, ErrorType } from '../ErrorHandler';
import { ImageService } from './ImageService';
import { YoloInferenceService, YoloInferenceConfig } from './YoloInferenceService';
import { YoloConfigurationService } from './YoloConfigurationService';

/**
 * Webview消息处理器
 * 负责处理从Webview到扩展的所有消息
 */
export class WebviewMessageHandler {
    private _inferenceService: YoloInferenceService | null = null;
    
    /**
     * 构造函数
     * @param _webview Webview实例
     * @param _yoloReader YOLO数据读取器实例
     * @param _imageService 图像服务实例
     */
    constructor(
        private readonly _webview: vscode.Webview,
        private readonly _yoloReader: YoloDataReader,
        private readonly _imageService: ImageService
    ) {}
    
    /**
     * 处理从Webview收到的消息
     * @param message Webview消息对象
     */
    public async handleMessage(message: WebviewMessage): Promise<void> {
        const extMessage = message as WebviewToExtensionMessage;
        
        switch (extMessage.command) {
            case 'reload':
                await this.handleReloadCommand();
                break;
                
            case 'getImageList':
                await this.handleGetImageListCommand();
                break;
                
            case 'loadImage':
                const loadImageMessage = message as LoadImageMessage;
                await this.handleLoadImageCommand(loadImageMessage);
                break;
                
            case 'save':
                const saveMessage = message as SaveLabelsMessage;
                await this.handleSaveCommand(saveMessage);
                break;
                
            case 'next':
                await this.handleNextImageCommand();
                break;
                
            case 'previous':
                await this.handlePreviousImageCommand();
                break;
                
            case 'openImageInNewTab':
                const openImageMessage = message as OpenImageInNewTabMessage;
                await this.handleOpenImageInNewTabCommand(openImageMessage);
                break;
                
            case 'openTxtInNewTab':
                const openTxtMessage = message as OpenTxtInNewTabMessage;
                await this.handleOpenTxtInNewTabCommand(openTxtMessage);
                break;
                
            case 'getImagePreviews':
                await this.handleGetImagePreviewsCommand(message);
                break;
                
            case 'configureAI':
                await this.handleConfigureAICommand();
                break;
                
            case 'runInference':
                await this.handleRunInferenceCommand();
                break;
                
            default:
                console.warn(`Unknown command: ${extMessage.command}`);
        }
    }
    
    /**
     * 处理重新加载命令
     */
    private async handleReloadCommand(): Promise<void> {
        // 触发扩展重新启动
        vscode.commands.executeCommand('yolo-labeling-vs.openLabelingPanel');
    }
    
    /**
     * 处理获取图像列表命令
     */
    private async handleGetImageListCommand(): Promise<void> {
        this._webview.postMessage({
            command: 'imageList',
            paths: this._yoloReader.getAllImages()
        });
    }
    
    /**
     * 处理加载图像命令
     * @param message 加载图像消息
     */
    private async handleLoadImageCommand(message: LoadImageMessage): Promise<void> {
        if (!message.path) {
            return;
        }
        
        try {
            const imagePath = message.path;
            // 加载图像数据
            const imageData = await this._imageService.loadImage(imagePath);
            // 读取图像标签
            const labels = this._yoloReader.readLabels(imagePath);
            // 更新当前图像
            this._yoloReader.setCurrentImageByPath(imagePath);
            
            // 构建图像信息文本
            const imageInfoText = this.getImageInfoText();
            
            // 发送更新消息到Webview
            this._webview.postMessage({
                command: 'updateImage',
                imageData: imageData,
                labels: labels,
                currentPath: imagePath,
                imageInfo: imageInfoText
            } as UpdateImageMessage);
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Image loading failed',
                {
                    filePath: message.path,
                    webview: this._webview,
                    type: ErrorType.IMAGE_LOAD_ERROR
                }
            );
        }
    }
    
    /**
     * 处理保存标签命令
     * @param message 保存标签消息
     */
    private async handleSaveCommand(message: SaveLabelsMessage): Promise<void> {
        const currentImage = this._yoloReader.getCurrentImage();
        if (!currentImage) {
            return;
        }
        
        try {
            this._yoloReader.saveLabels(currentImage, message.labels);
            vscode.window.showInformationMessage('Labels saved successfully!');
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to save labels',
                {
                    filePath: currentImage,
                    webview: this._webview,
                    type: ErrorType.LABEL_SAVE_ERROR
                }
            );
        }
    }
    
    /**
     * 处理下一张图像命令
     */
    private async handleNextImageCommand(): Promise<void> {
        const nextImage = this._yoloReader.getNextImage();
        if (!nextImage) {
            return;
        }
        
        try {
            // 加载图像数据
            const imageData = await this._imageService.loadImage(nextImage);
            // 读取图像标签
            const labels = this._yoloReader.readLabels(nextImage);
            
            // 构建图像信息文本
            const imageInfoText = this.getImageInfoText();
            
            // 发送更新消息到Webview
            this._webview.postMessage({
                command: 'updateImage',
                imageData: imageData,
                labels: labels,
                currentPath: nextImage,
                imageInfo: imageInfoText
            } as UpdateImageMessage);
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to load next image',
                {
                    filePath: nextImage,
                    webview: this._webview,
                    type: ErrorType.IMAGE_LOAD_ERROR,
                    recoverable: true
                }
            );
        }
    }
    
    /**
     * 处理上一张图像命令
     */
    private async handlePreviousImageCommand(): Promise<void> {
        const prevImage = this._yoloReader.getPreviousImage();
        if (!prevImage) {
            return;
        }
        
        try {
            // 加载图像数据
            const imageData = await this._imageService.loadImage(prevImage);
            // 读取图像标签
            const labels = this._yoloReader.readLabels(prevImage);
            
            // 构建图像信息文本
            const imageInfoText = this.getImageInfoText();
            
            // 发送更新消息到Webview
            this._webview.postMessage({
                command: 'updateImage',
                imageData: imageData,
                labels: labels,
                currentPath: prevImage,
                imageInfo: imageInfoText
            } as UpdateImageMessage);
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to load previous image',
                {
                    filePath: prevImage,
                    webview: this._webview,
                    type: ErrorType.IMAGE_LOAD_ERROR,
                    recoverable: true
                }
            );
        }
    }
    
    /**
     * 获取图像信息文本
     * @returns 格式化的图像信息文本
     */
    private getImageInfoText(): string {
        const currentIndex = this._yoloReader.getCurrentImageIndex();
        const totalImages = this._yoloReader.getTotalImages();
        
        // 获取当前图片文件名（仅显示文件名，不包含路径）
        const currentImage = this._yoloReader.getCurrentImage();
        let filename = '';
        
        if (currentImage) {
            const pathParts = currentImage.split(/[\\\/]/); // 处理不同操作系统的路径分隔符
            filename = pathParts[pathParts.length - 1];
            
            if (filename.length > 20) {
                // 如果文件名太长，则截断显示
                filename = filename.substr(0, 17) + '...';
            }
        }
        
        return `图片 ${currentIndex + 1}/${totalImages} - ${filename}`;
    }
    
    /**
     * 处理在新标签中打开图片命令
     * @param message 打开图片消息
     */
    private async handleOpenImageInNewTabCommand(message: OpenImageInNewTabMessage): Promise<void> {
        if (!message.path) {
            return;
        }
        
        try {
            // 创建Uri并打开图片
            const uri = vscode.Uri.file(message.path);
            await vscode.commands.executeCommand('vscode.open', uri, {
                viewColumn: vscode.ViewColumn.Beside  // 在新标签中打开
            });
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to open image in new tab',
                {
                    filePath: message.path,
                    webview: this._webview,
                    type: ErrorType.UNKNOWN_ERROR
                }
            );
        }
    }
    
    /**
     * 处理在新标签中打开文本文件命令
     * @param message 打开文本文件消息
     */
    private async handleOpenTxtInNewTabCommand(message: OpenTxtInNewTabMessage): Promise<void> {
        if (!message.path) {
            return;
        }
        
        try {
            // 创建Uri并打开文本文件
            const uri = vscode.Uri.file(message.path);
            await vscode.commands.executeCommand('vscode.open', uri, {
                viewColumn: vscode.ViewColumn.Beside  // 在新标签中打开
            });
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to open text file in new tab',
                {
                    filePath: message.path,
                    webview: this._webview,
                    type: ErrorType.UNKNOWN_ERROR
                }
            );
        }
    }
    
    /**
     * 处理批量获取图片缩略图命令
     */
    private async handleGetImagePreviewsCommand(message: any): Promise<void> {
        const paths: string[] = message.paths || [];
        const previews: string[] = [];
        for (const p of paths) {
            try {
                const thumb = await this._imageService.generateThumbnail(p, 120, 80); // 120x80
                previews.push(thumb);
            } catch {
                previews.push(''); // 失败用空字符串
            }
        }
        this._webview.postMessage({ command: 'imagePreviews', previews });
    }
    
    /**
     * 处理配置AI命令
     */
    private async handleConfigureAICommand(): Promise<void> {
        // 获取当前类名列表
        const classNames = this._yoloReader.getClassNames();
        
        // 获取当前配置
        const currentConfig = YoloConfigurationService.getConfig(classNames);
        
        // 显示配置对话框
        const newConfig = await YoloConfigurationService.showConfigurationDialog(currentConfig);
        if (!newConfig) {
            return;
        }
        
        // 保存新配置
        await YoloConfigurationService.saveConfig(newConfig);
        
        try {
            // 初始化或更新推理服务
            if (!this._inferenceService) {
                this._inferenceService = new YoloInferenceService(newConfig);
                await this._inferenceService.initialize();
            } else {
                await this._inferenceService.updateConfig(newConfig);
            }
            
            // 如果配置成功，显示成功消息
            if (this._inferenceService.isReady()) {
                vscode.window.showInformationMessage('AI configuration successful! You can now use inference.');
                
                // 不再自动执行推理测试
                // 如果用户需要测试，可以手动点击Inference按钮
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to initialize AI: ${error.message}`);
            console.error('AI initialization error:', error);
        }
    }
    
    /**
     * 处理运行推理命令
     * @private
     */
    private async handleRunInferenceCommand(): Promise<void> {
        // 获取当前图片路径
        const imagePath = this._yoloReader.getCurrentImage();
        if (!imagePath) {
            ErrorHandler.handleError(
                new Error('No image loaded'),
                'No image loaded for inference',
                {
                    webview: this._webview,
                    type: ErrorType.UNKNOWN_ERROR
                }
            );
            return;
        }
        
        try {
            // 初始化推理服务
            if (!this._inferenceService || !await this.initializeInferenceService()) {
                // 如果推理服务未就绪，则打开配置
                await this.handleConfigureAICommand();
                return;
            }
            
            // 创建状态栏项目
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            statusBarItem.text = '$(sync~spin) Running YOLO inference...';
            statusBarItem.tooltip = 'Running YOLO inference on the current image';
            statusBarItem.show();
            
            // 运行推理
            const detections = await this._inferenceService.runInference(imagePath);
            
            // 向Webview发送推理结果
            this._webview.postMessage({
                command: 'inferenceResults',
                results: detections
            } as InferenceResultsMessage);
            
            // 更新状态栏并使用VS Code通知
            statusBarItem.dispose();
            vscode.window.showInformationMessage(`Detected ${detections.length} objects`);
            
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Inference failed',
                {
                    filePath: imagePath,
                    webview: this._webview,
                    type: ErrorType.UNKNOWN_ERROR
                }
            );
        }
    }
    
    /**
     * 初始化推理服务
     */
    private async initializeInferenceService(): Promise<boolean> {
        try {
            const classNames = this._yoloReader.getClassNames();
            const config = YoloConfigurationService.getConfig(classNames);
            
            // 如果模型路径为空，则需要配置
            if (!config.modelPath) {
                return false;
            }
            
            if (!this._inferenceService) {
                this._inferenceService = new YoloInferenceService(config);
            }
            
            return await this._inferenceService.initialize(config);
        } catch (error) {
            console.error('Failed to initialize inference service:', error);
            return false;
        }
    }
} 