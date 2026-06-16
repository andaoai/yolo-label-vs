import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ErrorHandler, ErrorType } from '../ErrorHandler';

/**
 * YOLO 配置接口
 */
export interface YoloConfig {
    path: string;      // 数据集根目录
    train: string | string[];     // 训练图片目录（相对于path）
    val: string | string[];       // 验证图片目录（相对于path）
    test: string | string[];      // 测试图片目录（相对于path）
    names: string[];   // 标签类别名称列表
    kpt_shape?: number[];  // 关键点形状，如 [17, 3]
}

/**
 * 验证路径是否为有效格式（字符串或字符串数组）
 */
function isValidPath(p: any): boolean {
    if (typeof p === 'string') return true;
    if (Array.isArray(p)) {
        return p.every(item => typeof item === 'string');
    }
    return false;
}

/**
 * 验证 YOLO 配置
 */
function validateConfig(config: any): config is YoloConfig {
    if (!config.path) {
        throw new Error(
            '缺少必填字段: path\n\n' +
            '请在 YAML 配置中添加数据集根目录路径，例如:\n' +
            '  path: ./datasets/coco128      # 相对于工作区根目录\n' +
            '  path: C:\\datasets\\coco128     # 绝对路径\n\n' +
            '相对路径会相对于工作区根目录解析。'
        );
    }

    // Handle different names formats
    if (!config.names) {
        throw new Error('Missing required field: names');
    }

    // If names is an object (YOLO format), convert it to array
    if (typeof config.names === 'object' && !Array.isArray(config.names)) {
        const namesObj = config.names;
        config.names = Object.entries(namesObj)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([_, name]) => String(name));
    }

    // Validate names array
    if (!Array.isArray(config.names)) {
        throw new Error('Names must be an array or an object with numeric keys');
    }

    if (config.names.length === 0) {
        throw new Error('Names array cannot be empty');
    }

    // Validate each name
    config.names.forEach((name: any, index: number) => {
        if (typeof name !== 'string' || name.trim() === '') {
            throw new Error(`Invalid name at index ${index}: must be a non-empty string`);
        }
    });

    // Validate train, val and test paths
    for (const key of ['train', 'val', 'test'] as const) {
        if (config[key] && !isValidPath(config[key])) {
            throw new Error(
                `${key} 路径格式错误\n\n` +
                '应为字符串或字符串数组，例如:\n' +
                `  ${key}: images/${key}2017`
            );
        }
    }

    return true;
}

/**
 * 加载并验证 YOLO 配置文件
 * @param yamlPath YAML 文件路径
 * @returns 验证后的配置
 */
export function loadConfig(yamlPath: string): YoloConfig {
    try {
        const yamlContent = fs.readFileSync(yamlPath, 'utf8');
        const rawConfig = yaml.load(yamlContent) as any;

        if (!validateConfig(rawConfig)) {
            throw new Error('Invalid configuration format');
        }

        return {
            path: rawConfig.path,
            train: rawConfig.train || '',
            val: rawConfig.val || '',
            test: rawConfig.test || '',
            names: rawConfig.names,
            kpt_shape: rawConfig.kpt_shape
        };
    } catch (error: any) {
        ErrorHandler.handleError(
            error,
            'Failed to load YOLO configuration',
            {
                type: ErrorType.CONFIG_ERROR,
                filePath: yamlPath,
                showNotification: false
            }
        );
        console.error('Error loading config:', error);
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
}
