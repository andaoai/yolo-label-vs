import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { tryLoadConfig, YoloConfig, resolveDatasetPath } from '../yolo/ConfigLoader';
import { scanImageFiles } from '../yolo/ImageFileScanner';

/**
 * 数据集统计信息
 */
export interface DatasetStats {
    yamlPath: string;
    config: YoloConfig;
    datasetRoot: string;
    trainCount: number;
    valCount: number;
    testCount: number;
    totalCount: number;
    labels: string[];
    labelsCount: number;
}

/**
 * 数据集扫描器 - 扫描工作区中所有有效的 YOLO 数据集配置
 */
export class DatasetScanner {
    private static readonly CACHE_DURATION = 5000; // 5秒缓存
    private cache: Map<string, DatasetStats> = new Map();
    private lastScanTime: number = 0;

    /**
     * 扫描工作区中所有的 YAML 文件，识别有效的 YOLO 数据集
     */
    async scanWorkspace(): Promise<DatasetStats[]> {
        const now = Date.now();
        if (now - this.lastScanTime < DatasetScanner.CACHE_DURATION && this.cache.size > 0) {
            return Array.from(this.cache.values());
        }

        const results: DatasetStats[] = [];

        // 查找所有 YAML 文件
        const yamlFiles = await vscode.workspace.findFiles('**/*.{yaml,yml}', '**/node_modules/**');

        for (const uri of yamlFiles) {
            const yamlPath = uri.fsPath;
            const stats = this.tryLoadDataset(yamlPath);
            if (stats) {
                results.push(stats);
                this.cache.set(yamlPath, stats);
            }
        }

        this.lastScanTime = Date.now();
        return results;
    }

    /**
     * 尝试加载单个 YAML 文件作为 YOLO 数据集配置
     */
    tryLoadDataset(yamlPath: string): DatasetStats | null {
        // 1. 快速预检查：文件内容是否包含必要字段
        const content = fs.readFileSync(yamlPath, 'utf8');
        if (!content.includes('path:') || !content.includes('names:')) {
            return null;
        }

        // 2. 尝试加载配置（静默模式）
        const config = tryLoadConfig(yamlPath);
        if (!config) {
            return null;
        }

        // 3. 解析数据集根目录路径
        const basePath = path.dirname(yamlPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const datasetRoot = resolveDatasetPath(config, basePath, workspaceRoot);

        // 4. 验证数据集目录是否存在
        if (!fs.existsSync(datasetRoot)) {
            console.log(`[DatasetScanner] 数据集路径不存在，跳过: ${yamlPath}`);
            console.log(`  配置的 path: ${config.path}`);
            console.log(`  解析的绝对路径: ${datasetRoot}`);
            return null;
        }

        // 5. 统计各子集数量（静默处理错误）
        let trainFiles: string[] = [];
        let valFiles: string[] = [];
        let testFiles: string[] = [];

        try { trainFiles = scanImageFiles(datasetRoot, { train: config.train }); } catch { /* ignore */ }
        try { valFiles = scanImageFiles(datasetRoot, { val: config.val }); } catch { /* ignore */ }
        try { testFiles = scanImageFiles(datasetRoot, { test: config.test }); } catch { /* ignore */ }

        const totalCount = trainFiles.length + valFiles.length + testFiles.length;

        // 6. 验证是否有图片
        if (totalCount === 0) {
            console.log(`[DatasetScanner] 数据集无图片，跳过: ${yamlPath}`);
            return null;
        }

        return {
            yamlPath,
            config,
            datasetRoot,
            trainCount: trainFiles.length,
            valCount: valFiles.length,
            testCount: testFiles.length,
            totalCount,
            labels: config.names,
            labelsCount: config.names.length
        };
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
        this.lastScanTime = 0;
    }

    /**
     * 获取缓存的数据集信息
     */
    getCachedDataset(yamlPath: string): DatasetStats | undefined {
        return this.cache.get(yamlPath);
    }
}
