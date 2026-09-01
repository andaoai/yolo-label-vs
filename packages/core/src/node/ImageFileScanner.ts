import * as fs from 'fs';
import * as path from 'path';

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

/**
 * 从单个文件夹加载图片文件
 * @param fullPath 文件夹绝对路径
 * @returns 找到的图片文件路径数组
 */
function loadImagesFromFolder(fullPath: string): string[] {
    if (!fs.existsSync(fullPath)) {
        return [];
    }

    // 读取当前目录下的所有文件
    return fs.readdirSync(fullPath)
        .filter(file => {
            const ext = path.extname(file).toLowerCase();
            return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
        })
        .map(file => path.join(fullPath, file));
}

/**
 * 从指定路径加载图片文件
 * @param basePath 数据集根目录绝对路径
 * @param pathConfig 路径配置（字符串或字符串数组）
 * @param label 路径类型标签（用于日志）
 * @returns 找到的图片文件路径数组
 */
function loadImagesFromPath(basePath: string, pathConfig: string | string[] | undefined, label: string): string[] {
    if (!pathConfig) return [];
    const paths = Array.isArray(pathConfig) ? pathConfig : [pathConfig];
    const imageFiles: string[] = [];

    for (const subPath of paths) {
        if (!subPath) continue;

        const fullPath = path.join(basePath, subPath);

        if (!fs.existsSync(fullPath)) {
            console.warn(`警告: 目录不存在: ${fullPath}`);
            console.warn(`  请检查 YAML 中的 ${label} 路径配置是否正确`);
            continue;
        }

        imageFiles.push(...loadImagesFromFolder(fullPath));
    }

    return imageFiles;
}

/**
 * 扫描数据集目录，加载所有图片文件
 * @param datasetRoot 数据集根目录绝对路径
 * @param config YOLO 配置
 * @returns 去重并排序后的图片文件路径数组
 */
export function scanImageFiles(datasetRoot: string, config: {
    train?: string | string[];
    val?: string | string[];
    test?: string | string[];
}): string[] {
    // 验证数据集路径是否存在
    if (!fs.existsSync(datasetRoot)) {
        throw new Error(`数据集路径不存在: "${datasetRoot}"`);
    }

    // 使用 Set 来存储唯一的文件路径
    const imageFilesSet = new Set<string>();

    // 处理训练集、验证集和测试集路径
    const trainImages = loadImagesFromPath(datasetRoot, config.train, 'train');
    const valImages = loadImagesFromPath(datasetRoot, config.val, 'val');
    const testImages = loadImagesFromPath(datasetRoot, config.test, 'test');

    // 添加到 Set 中以去重
    [...trainImages, ...valImages, ...testImages].forEach(file => {
        imageFilesSet.add(file);
    });

    // 转换 Set 为数组并排序
    const imageFiles = Array.from(imageFilesSet).sort();

    if (imageFiles.length === 0) {
        console.warn('No supported image files found in any of the directories.');
    } else {
        console.log(`Loaded ${imageFiles.length} unique images.`);
    }

    return imageFiles;
}

/**
 * 按文件夹分组扫描数据集目录
 * @param datasetRoot 数据集根目录绝对路径
 * @param pathConfig 路径配置（字符串或字符串数组）
 * @param label 路径类型标签（用于日志）
 * @returns 按文件夹分组的图片文件 { [folderRelativePath: string]: string[] }
 */
export function scanImageFilesByFolder(
    datasetRoot: string,
    pathConfig: string | string[] | undefined,
    label: string
): Record<string, string[]> {
    if (!pathConfig) return {};

    const paths = Array.isArray(pathConfig) ? pathConfig : [pathConfig];
    const result: Record<string, string[]> = {};

    for (const subPath of paths) {
        if (!subPath) continue;

        const fullPath = path.join(datasetRoot, subPath);

        if (!fs.existsSync(fullPath)) {
            console.warn(`警告: 目录不存在: ${fullPath}`);
            console.warn(`  请检查 YAML 中的 ${label} 路径配置是否正确`);
            continue;
        }

        const images = loadImagesFromFolder(fullPath);
        if (images.length > 0) {
            result[subPath] = images;
        }
    }

    return result;
}
