import * as vscode from 'vscode';
import * as fs from 'fs';
import { YoloDataReader } from '../yolo/YoloDataReader';
import {
    WebviewMessage,
    LoadImageMessage,
    SaveMessage,
    BoundingBox
} from '../model/types';
import { ErrorHandler, ErrorType } from '../ErrorHandler';
import { basename, truncate } from '../utils/pathUtils';
import { loadImageAsDataUrl, generateThumbnail } from '../utils/imageLoader';

/**
 * Webview消息处理器
 * 负责处理从Webview到扩展的所有消息
 */
export class WebviewMessageHandler {

    /**
     * 构造函数
     * @param _webview Webview实例
     * @param _yoloReader YOLO数据读取器实例
     */
    constructor(
        private readonly _webview: vscode.Webview,
        private readonly _yoloReader: YoloDataReader
    ) {}
    
    /**
     * 处理从Webview收到的消息
     * @param message Webview消息对象
     */
    public async handleMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
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
                const saveMessage = message as SaveMessage;
                await this.handleSaveCommand(saveMessage);
                break;
                
            case 'next':
                await this.navigate(1);
                break;

            case 'previous':
                await this.navigate(-1);
                break;
                
            case 'openImageInNewTab':
            case 'openTxtInNewTab':
                await this.handleOpenInNewTab((message as any).path, message.command);
                break;

            case 'getImagePreviewRange':
                await this.handleGetImagePreviewRangeCommand(message);
                break;

            case 'openModelFile':
                await this.handleOpenModelFileCommand();
                break;

            case 'loadModelFile':
                await this.handleLoadModelFileCommand(message as any);
                break;

            default:
                console.warn(`Unknown command: ${message.command}`);
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

        this._yoloReader.setCurrentImageByPath(message.path);
        await this.sendImageUpdate(message.path, 'Image loading failed');
    }
    
    /**
     * 处理保存标签命令
     * @param message 保存标签消息
     */
    private async handleSaveCommand(message: SaveMessage): Promise<void> {
        const currentImage = this._yoloReader.getCurrentImage();
        if (!currentImage) {
            return;
        }
        
        try {
            this._yoloReader.saveLabels(currentImage, message.labels);
            vscode.window.showInformationMessage('Labels saved successfully!');
            this._webview.postMessage({ command: 'saveSuccess' });
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
     * 导航到下一张或上一张图像
     * @param direction 方向：1=下一张, -1=上一张
     */
    private async navigate(direction: 1 | -1): Promise<void> {
        const image = direction === 1
            ? this._yoloReader.getNextImage()
            : this._yoloReader.getPreviousImage();

        if (!image) {
            return;
        }

        const context = direction === 1 ? 'Failed to load next image' : 'Failed to load previous image';
        await this.sendImageUpdate(image, context);
    }

    /**
     * 加载图片数据、读取标签，并发送到 Webview。
     */
    private async sendImageUpdate(imagePath: string, errorContext: string): Promise<void> {
        try {
            const imageData = await loadImageAsDataUrl(imagePath);
            const labels = this._yoloReader.readLabels(imagePath);
            const imageInfoText = this.getImageInfoText();

            this._webview.postMessage({
                command: 'updateImage',
                imageData,
                labels,
                currentPath: imagePath,
                imageInfo: imageInfoText
            });
        } catch (error: any) {
            ErrorHandler.handleError(error, errorContext, {
                filePath: imagePath,
                webview: this._webview,
                type: ErrorType.IMAGE_LOAD_ERROR
            });
        }
    }

    /**
     * 获取图像信息文本
     * @returns 格式化的图像信息文本
     */
    private getImageInfoText(): string {
        const currentIndex = this._yoloReader.getCurrentImageIndex();
        const totalImages = this._yoloReader.getTotalImages();
        
        const currentImage = this._yoloReader.getCurrentImage();
        const filename = currentImage ? truncate(basename(currentImage), 20) : '';

        return `图片 ${currentIndex + 1}/${totalImages} - ${filename}`;
    }
    
    /**
     * 在新标签中打开文件
     * @param filePath 文件路径
     * @param command 命令类型（用于错误上下文）
     */
    private async handleOpenInNewTab(filePath: string, command: string): Promise<void> {
        if (!filePath) {
            return;
        }

        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.commands.executeCommand('vscode.open', uri, {
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (error: any) {
            const context = command === 'openImageInNewTab'
                ? 'Failed to open image in new tab'
                : 'Failed to open text file in new tab';

            ErrorHandler.handleError(error, context, {
                filePath,
                webview: this._webview,
                type: ErrorType.UNKNOWN_ERROR
            });
        }
    }
    
    /**
     * 处理范围获取缩略图命令 — 按需懒加载
     * 并发生成缩略图，避免逐个串行等待
     */
    private async handleGetImagePreviewRangeCommand(message: any): Promise<void> {
        const { paths, startIndex } = message as { paths: string[]; startIndex: number };
        if (!paths || paths.length === 0) return;

        const CONCURRENCY = 4;
        const results: (string | null)[] = new Array(paths.length).fill(null);

        // 并发处理，每批 CONCURRENCY 个
        for (let i = 0; i < paths.length; i += CONCURRENCY) {
            const batch = paths.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(async (p, j) => {
                    try {
                        const thumb = await generateThumbnail(p);
                        return { index: i + j, data: thumb };
                    } catch {
                        return { index: i + j, data: '' };
                    }
                })
            );
            for (const r of batchResults) {
                results[r.index] = r.data;
            }
        }

        this._webview.postMessage({
            command: 'imagePreviewRange',
            startIndex,
            previews: results as string[],
        });
    }

    /**
     * 处理打开模型文件对话框命令
     * 弹出文件选择器让用户选择 .onnx 文件
     */
    private async handleOpenModelFileCommand(): Promise<void> {
        try {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'ONNX Model': ['onnx'],
                },
                title: 'Select YOLO ONNX Model',
            });

            if (!uris || uris.length === 0) {
                return;
            }

            const filePath = uris[0].fsPath;
            await this.handleLoadModelFileCommand({ command: 'loadModelFile', filePath } as any);
        } catch (error: any) {
            this._webview.postMessage({
                command: 'modelFileError',
                error: `Failed to open file dialog: ${error.message}`,
            });
        }
    }

    /**
     * 处理加载模型文件命令
     * 读取 .onnx 文件并通过 transferable ArrayBuffer 发送给 webview
     */
    private async handleLoadModelFileCommand(message: { filePath: string }): Promise<void> {
        try {
            const filePath = message.filePath;

            // 验证文件存在
            if (!fs.existsSync(filePath)) {
                this._webview.postMessage({
                    command: 'modelFileError',
                    error: `Model file not found: ${filePath}`,
                });
                return;
            }

            // 验证文件扩展名
            if (!filePath.toLowerCase().endsWith('.onnx')) {
                this._webview.postMessage({
                    command: 'modelFileError',
                    error: 'Invalid file type. Please select an .onnx file.',
                });
                return;
            }

            // 读取文件
            const buffer = await fs.promises.readFile(filePath);
            const arrayBuffer = buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
            );

            // 获取文件名
            const fileName = basename(filePath);

            // 发送回 webview（VS Code postMessage 不支持 transferable，使用结构化克隆）
            this._webview.postMessage({
                command: 'modelFileData',
                data: arrayBuffer,
                fileName,
            });
        } catch (error: any) {
            // 注意：不使用 ErrorHandler，因为它发送通用 'error' 事件，而前端需要 'modelFileError'
            this._webview.postMessage({
                command: 'modelFileError',
                error: `Failed to load model: ${error.message}`,
            });
        }
    }
}