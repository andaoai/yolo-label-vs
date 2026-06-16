import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { tryLoadConfig, YoloConfig, resolveDatasetPath } from '../yolo/ConfigLoader';
import { scanImageFiles } from '../yolo/ImageFileScanner';

/**
 * Dataset statistics information
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
 * Dataset scanner - scans all valid YOLO dataset configurations in workspace
 */
export class DatasetScanner {
    private static readonly CACHE_DURATION = 5000; // 5 second cache
    private cache: Map<string, DatasetStats> = new Map();
    private lastScanTime: number = 0;

    /**
     * Scan all YAML files in workspace to identify valid YOLO datasets
     */
    async scanWorkspace(): Promise<DatasetStats[]> {
        const now = Date.now();
        if (now - this.lastScanTime < DatasetScanner.CACHE_DURATION && this.cache.size > 0) {
            return Array.from(this.cache.values());
        }

        const results: DatasetStats[] = [];

        // Find all YAML files
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
     * Try to load a single YAML file as YOLO dataset configuration
     */
    tryLoadDataset(yamlPath: string): DatasetStats | null {
        // 1. Quick pre-check: file contains required fields
        const content = fs.readFileSync(yamlPath, 'utf8');
        if (!content.includes('path:') || !content.includes('names:')) {
            return null;
        }

        // 2. Try to load configuration (silent mode)
        const config = tryLoadConfig(yamlPath);
        if (!config) {
            return null;
        }

        // 3. Resolve dataset root path
        const basePath = path.dirname(yamlPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const datasetRoot = resolveDatasetPath(config, basePath, workspaceRoot);

        // 4. Verify dataset directory exists
        if (!fs.existsSync(datasetRoot)) {
            console.log(`[DatasetScanner] Dataset path not found, skipping: ${yamlPath}`);
            console.log(`  Config path: ${config.path}`);
            console.log(`  Resolved absolute path: ${datasetRoot}`);
            return null;
        }

        // 5. Count images per subset (silent error handling)
        let trainFiles: string[] = [];
        let valFiles: string[] = [];
        let testFiles: string[] = [];

        try { trainFiles = scanImageFiles(datasetRoot, { train: config.train }); } catch { /* ignore */ }
        try { valFiles = scanImageFiles(datasetRoot, { val: config.val }); } catch { /* ignore */ }
        try { testFiles = scanImageFiles(datasetRoot, { test: config.test }); } catch { /* ignore */ }

        const totalCount = trainFiles.length + valFiles.length + testFiles.length;

        // 6. Verify there are images
        if (totalCount === 0) {
            console.log(`[DatasetScanner] No images found in dataset, skipping: ${yamlPath}`);
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
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
        this.lastScanTime = 0;
    }

    /**
     * Get cached dataset information
     */
    getCachedDataset(yamlPath: string): DatasetStats | undefined {
        return this.cache.get(yamlPath);
    }
}
