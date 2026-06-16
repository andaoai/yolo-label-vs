import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ErrorHandler, ErrorType } from '../ErrorHandler';

/**
 * YOLO 配置接口
 */
export interface YoloConfig {
    path: string;                  // 数据集根目录
    train: string | string[];      // 训练图片目录（相对于path）
    val: string | string[];        // 验证图片目录（相对于path）
    test: string | string[];       // 测试图片目录（相对于path）
    names: string[];               // 标签类别名称列表
    kpt_shape?: number[];          // 关键点形状，如 [17, 3]
}

/**
 * 原始 YOLO 配置（names 可能是对象格式）
 */
interface RawYoloConfig {
    path: string;
    train?: string | string[];
    val?: string | string[];
    test?: string | string[];
    names: string[] | Record<string | number, string>;
    kpt_shape?: number[];
}

/**
 * 验证路径是否为有效格式（字符串或字符串数组）
 */
function isValidPath(p: unknown): p is string | string[] {
    if (typeof p === 'string') return true;
    if (Array.isArray(p)) {
        return p.every(item => typeof item === 'string');
    }
    return false;
}

/**
 * 标准化 names 字段为数组格式
 * YOLO 格式中 names 可以是对象 {0: 'person', 1: 'bicycle'} 或数组
 */
function normalizeNames(names: string[] | Record<string | number, string>): string[] {
    if (Array.isArray(names)) {
        return names;
    }

    // 对象格式转换为有序数组
    return Object.entries(names)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([_, name]) => String(name));
}

/**
 * 验证并标准化 YOLO 配置
 * 返回标准化后的配置，不修改原始对象
 */
function validateAndNormalizeConfig(config: unknown): YoloConfig {
    if (!config || typeof config !== 'object') {
        throw new Error('无效的 YAML 配置格式');
    }

    const raw = config as Partial<RawYoloConfig>;

    // 验证必填字段
    if (!raw.path) {
        throw new Error(
            '缺少必填字段: path\n\n' +
            '请在 YAML 配置中添加数据集根目录路径，例如:\n' +
            '  path: ./datasets/coco128      # 相对于工作区根目录\n' +
            '  path: C:\\datasets\\coco128     # 绝对路径\n\n' +
            '相对路径会相对于工作区根目录解析。'
        );
    }

    if (!raw.names) {
        throw new Error('缺少必填字段: names');
    }

    // 标准化 names 字段
    const names = normalizeNames(raw.names);

    // 验证 names 数组
    if (names.length === 0) {
        throw new Error('names 数组不能为空');
    }

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (typeof name !== 'string' || name.trim() === '') {
            throw new Error(`索引 ${i} 处的标签名称无效: 必须为非空字符串`);
        }
    }

    // 验证 train, val, test 路径（可选字段）
    for (const key of ['train', 'val', 'test'] as const) {
        const value = raw[key];
        if (value !== undefined && value !== null && !isValidPath(value)) {
            throw new Error(
                `${key} 路径格式错误\n\n` +
                '应为字符串或字符串数组，例如:\n' +
                `  ${key}: images/${key}2017`
            );
        }
    }

    // 返回标准化后的配置
    return {
        path: raw.path,
        train: raw.train ?? '',
        val: raw.val ?? '',
        test: raw.test ?? '',
        names,
        kpt_shape: raw.kpt_shape
    };
}

/**
 * 加载并验证 YOLO 配置文件
 * @param yamlPath YAML 文件路径
 * @param silent 是否静默模式（不输出错误日志）
 * @returns 验证后的配置
 */
export function loadConfig(yamlPath: string, silent: boolean = false): YoloConfig {
    try {
        const yamlContent = fs.readFileSync(yamlPath, 'utf8');
        const rawConfig = yaml.load(yamlContent);

        return validateAndNormalizeConfig(rawConfig);
    } catch (error: any) {
        if (!silent) {
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
        }
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
}

/**
 * 尝试加载 YOLO 配置文件，失败时返回 null
 * 适用于扫描场景，避免抛出异常
 * @param yamlPath YAML 文件路径
 * @returns 配置对象或 null
 */
export function tryLoadConfig(yamlPath: string): YoloConfig | null {
    try {
        return loadConfig(yamlPath, true);
    } catch {
        return null;
    }
}

/**
 * 获取数据集的绝对路径
 * @param config YOLO 配置
 * @param yamlDir YAML 文件所在目录（用于解析相对路径）
 * @param workspaceRoot 工作区根目录（优先使用）
 * @returns 数据集根目录的绝对路径
 */
export function resolveDatasetPath(
    config: YoloConfig,
    yamlDir: string,
    workspaceRoot?: string
): string {
    if (path.isAbsolute(config.path)) {
        return config.path;
    }

    // 优先相对于工作区根目录解析
    if (workspaceRoot) {
        const workspaceResolved = path.resolve(workspaceRoot, config.path);
        if (fs.existsSync(workspaceResolved)) {
            return workspaceResolved;
        }
    }

    // 其次相对于 YAML 文件目录解析
    return path.resolve(yamlDir, config.path);
}
