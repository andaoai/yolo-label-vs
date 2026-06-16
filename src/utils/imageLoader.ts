import * as fs from 'fs';
import * as path from 'path';
import { ErrorHandler, ErrorType } from '../ErrorHandler';

/**
 * 简单的 LRU 缓存用于 base64 图片数据
 * 只缓存字符串，不计算大小，不做 TTL 过期
 */
class ImageCache {
    private readonly cache = new Map<string, string>();

    constructor(private readonly maxItems = 20) {}

    get(key: string): string | undefined {
        const value = this.cache.get(key);
        if (value === undefined) {
            return undefined;
        }
        // LRU: 删除并重新添加到末尾
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key: string, value: string): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        this.cache.set(key, value);
        // 如果超过最大容量，删除最旧的（第一个元素）
        if (this.cache.size > this.maxItems) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
    }
}

// 全局单例缓存实例
const imageCache = new ImageCache();

/**
 * 获取 MIME 类型
 * @param filePath 文件路径
 * @returns MIME 类型
 */
function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.png': return 'image/png';
        case '.gif': return 'image/gif';
        case '.webp': return 'image/webp';
        case '.bmp': return 'image/bmp';
        case '.jpg':
        case '.jpeg':
        default: return 'image/jpeg';
    }
}

/**
 * 加载图片并返回 base64 数据 URL
 * @param imagePath 图片文件路径
 * @param useCache 是否使用缓存（默认 true）
 * @returns Promise<string> base64 编码的图像数据
 */
export async function loadImageAsDataUrl(imagePath: string, useCache = true): Promise<string> {
    if (useCache) {
        const cached = imageCache.get(imagePath);
        if (cached) {
            return cached;
        }
    }

    try {
        await fs.promises.access(imagePath, fs.constants.R_OK);
        const imageBuffer = await fs.promises.readFile(imagePath);
        const mimeType = getMimeType(imagePath);
        const imageData = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

        if (useCache) {
            imageCache.set(imagePath, imageData);
        }

        return imageData;
    } catch (error: any) {
        ErrorHandler.handleError(error, 'Image loading error', {
            filePath: imagePath,
            showNotification: false
        });

        if (error.code === 'ENOENT') {
            throw new Error(`Image file not found: ${imagePath}`);
        } else if (error.code === 'EACCES') {
            throw new Error(`Permission denied when reading image: ${imagePath}`);
        }
        throw new Error(`Failed to load image '${imagePath}': ${error.message}`);
    }
}

/**
 * 生成缩略图（复用 loadImage 逻辑并使用缓存）
 */
export async function generateThumbnail(imagePath: string): Promise<string> {
    return loadImageAsDataUrl(imagePath, true);
}
