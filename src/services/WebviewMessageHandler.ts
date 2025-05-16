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
    ConfigureAiMessage,
    RunAiInferenceMessage
} from '../model/types';
import { ErrorHandler, ErrorType } from '../ErrorHandler';
import { ImageService } from './ImageService';
import { AiInferenceService } from './AiInferenceService';

/**
 * Webview消息处理器
 * 负责处理从Webview到扩展的所有消息
 */
export class WebviewMessageHandler {
    private _aiService: AiInferenceService;
    
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
    ) {
        this._aiService = new AiInferenceService();
    }
    
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
            
            case 'configureAi':
                const configAiMessage = message as ConfigureAiMessage;
                await this.handleConfigureAiCommand(configAiMessage);
                break;
                
            case 'runAiInference':
                const runAiMessage = message as RunAiInferenceMessage;
                await this.handleRunAiInferenceCommand();
                break;
                
            case 'browseFile':
                await this.handleBrowseFileCommand(message);
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
     * 处理AI配置命令
     * @param message AI配置消息
     */
    private async handleConfigureAiCommand(message: ConfigureAiMessage): Promise<void> {
        try {
            const classNames = this._yoloReader.getClassNames();
            
            const success = await this._aiService.configure(
                message.modelPath,
                classNames,
                message.scoreThreshold,
                message.nmsThreshold,
                message.confidenceThreshold
            );
            
            // 发送配置结果到Webview
            this._webview.postMessage({
                command: 'aiConfigured',
                success: success,
                modelPath: message.modelPath,
                message: success ? 'AI模型配置成功' : '模型配置失败，请检查路径和参数'
            });
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to configure AI model',
                {
                    webview: this._webview,
                    type: ErrorType.UNKNOWN_ERROR,
                    recoverable: true
                }
            );
            
            this._webview.postMessage({
                command: 'aiConfigured',
                success: false,
                modelPath: message.modelPath,
                message: `模型配置失败: ${error.message}`
            });
        }
    }
    
    /**
     * 处理AI推理命令
     */
    private async handleRunAiInferenceCommand(): Promise<void> {
        const currentImage = this._yoloReader.getCurrentImage();
        if (!currentImage) {
            this._webview.postMessage({
                command: 'aiInferenceResult',
                labels: [],
                message: '无法获取当前图像'
            });
            return;
        }
        
        try {
            // 运行推理
            const detections = await this._aiService.runInference(currentImage);
            
            // 标记为AI检测的结果
            detections.forEach(box => {
                box.aiDetected = true;
            });
            
            // 发送推理结果到Webview
            this._webview.postMessage({
                command: 'aiInferenceResult',
                labels: detections,
                message: `AI检测完成，发现 ${detections.length} 个对象`
            });
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'AI inference failed',
                {
                    filePath: currentImage,
                    webview: this._webview,
                    type: ErrorType.UNKNOWN_ERROR,
                    recoverable: true
                }
            );
            
            this._webview.postMessage({
                command: 'aiInferenceResult',
                labels: [],
                message: `AI推理失败: ${error.message}`
            });
        }
    }
    
    /**
     * 处理浏览文件命令
     * @param message 浏览文件消息
     */
    private async handleBrowseFileCommand(message: any): Promise<void> {
        const filters: { [name: string]: string[] } = {};
        
        // 根据消息中的过滤器设置文件类型筛选
        if (message.filter) {
            if (message.filter === '*.onnx') {
                filters['ONNX Models'] = ['onnx'];
            } else if (message.filter === '*.pt') {
                filters['PyTorch Models'] = ['pt'];
            } else {
                filters['All Files'] = ['*'];
            }
        } else {
            filters['All Files'] = ['*'];
        }
        
        // 打开文件对话框
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: '选择',
            filters: filters
        });
        
        if (uris && uris.length > 0) {
            // 将选择的文件路径发送回Webview
            this._webview.postMessage({
                command: 'fileBrowseResult',
                path: uris[0].fsPath
            });
        }
    }
} 