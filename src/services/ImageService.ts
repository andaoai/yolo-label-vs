import * as fs from 'fs';
import * as path from 'path';
import { CacheManager } from '../model/CacheManager';
import { ErrorHandler, ErrorType } from '../ErrorHandler';
import sharp from 'sharp';

/**
 * 图像服务类
 * 负责图像加载、缓存和基本的图像操作
 */
export class ImageService {
    
    /**
     * 构造函数
     * @param _imageCache 图像缓存管理器实例
     */
    constructor(private readonly _imageCache: CacheManager<string>) {}
    
    /**
     * 加载图像并返回base64数据URL
     * @param imagePath 图像文件路径
     * @returns Promise<string> 返回base64编码的图像数据
     */
    public async loadImage(imagePath: string): Promise<string> {
        // 检查缓存中是否存在
        const cachedImage = this._imageCache.get(imagePath);
        if (cachedImage) {
            return cachedImage;
        }

        try {
            // 验证文件可读
            await fs.promises.access(imagePath, fs.constants.R_OK);
            // 读取图像文件
            const imageBuffer = await fs.promises.readFile(imagePath);
            
            // 根据文件扩展名确定MIME类型
            const mimeType = this.getMimeType(imagePath);
            
            // 转换为base64数据URL
            const imageData = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
            
            // 存入缓存
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

    /**
     * 根据文件扩展名获取MIME类型
     * @param filePath 文件路径
     * @returns string MIME类型字符串
     */
    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        
        switch (ext) {
            case '.png':
                return 'image/png';
            case '.gif':
                return 'image/gif';
            case '.webp':
                return 'image/webp';
            case '.bmp':
                return 'image/bmp';
            case '.jpg':
            case '.jpeg':
            default:
                return 'image/jpeg';
        }
    }
    
    /**
     * 清除所有图像缓存
     */
    public clearCache(): void {
        this._imageCache.clear();
    }

    /**
     * 生成图片缩略图，返回base64字符串（不带data:image/png;base64,前缀）
     */
    public async generateThumbnail(imagePath: string, width: number, height: number): Promise<string> {
        // 检查文件是否存在
        await fs.promises.access(imagePath, fs.constants.R_OK);
        // 用 sharp 生成缩略图
        const buffer = await sharp(imagePath)
            .resize(width, height, { fit: 'cover' })
            .toFormat('png')
            .toBuffer();
        return buffer.toString('base64');
    }
} 