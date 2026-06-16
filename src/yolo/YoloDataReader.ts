import * as path from 'path';
import { BoundingBox } from '../model/types';
import { YoloConfig, loadConfig, resolveDatasetPath } from './ConfigLoader';
import { scanImageFiles } from './ImageFileScanner';
import { readLabels, saveLabels } from './LabelCodec';

export { BoundingBox, YoloConfig };
export { readLabels, saveLabels } from './LabelCodec';
export { loadConfig } from './ConfigLoader';
export { scanImageFiles } from './ImageFileScanner';

export class YoloDataReader {
    private config!: YoloConfig;
    private currentImageIndex: number = 0;
    private imageFiles: string[] = [];

    constructor(private yamlPath: string, workspaceRoot?: string) {
        this.config = loadConfig(yamlPath);

        // 计算数据集根目录（与 DatasetScanner 使用相同的路径解析逻辑）
        const yamlDir = path.dirname(yamlPath);
        const datasetRoot = resolveDatasetPath(this.config, yamlDir, workspaceRoot);

        this.imageFiles = scanImageFiles(datasetRoot, {
            train: this.config.train,
            val: this.config.val,
            test: this.config.test
        });
    }

    public getCurrentImage(): string | null {
        if (this.currentImageIndex >= this.imageFiles.length) {
            return null;
        }
        return this.imageFiles[this.currentImageIndex];
    }

    public getNextImage(): string | null {
        this.currentImageIndex++;
        if (this.currentImageIndex >= this.imageFiles.length) {
            this.currentImageIndex = 0;
        }
        return this.getCurrentImage();
    }

    public getPreviousImage(): string | null {
        this.currentImageIndex--;
        if (this.currentImageIndex < 0) {
            this.currentImageIndex = this.imageFiles.length - 1;
        }
        return this.getCurrentImage();
    }

    public readLabels(imagePath: string): BoundingBox[] {
        return readLabels(imagePath, this.config.kpt_shape);
    }

    public saveLabels(imagePath: string, labels: BoundingBox[]): void {
        saveLabels(imagePath, labels);
    }

    public getClassNames(): string[] {
        return this.config.names;
    }

    public getTotalImages(): number {
        return this.imageFiles.length;
    }

    public getCurrentImageIndex(): number {
        return this.currentImageIndex;
    }

    public getAllImages(): string[] {
        return [...this.imageFiles]; // Return a copy of the array
    }

    public setCurrentImageByPath(targetPath: string): boolean {
        // 1. 精确匹配
        let index = this.imageFiles.indexOf(targetPath);
        if (index !== -1) {
            this.currentImageIndex = index;
            return true;
        }

        // 2. 规范化路径后匹配（处理斜杠差异）
        const normalizedTarget = targetPath.replace(/\\/g, '/').toLowerCase();
        index = this.imageFiles.findIndex(f => f.replace(/\\/g, '/').toLowerCase() === normalizedTarget);
        if (index !== -1) {
            this.currentImageIndex = index;
            return true;
        }

        // 3. 仅匹配文件名（容错）
        const targetFilename = targetPath.split(/[\\/]/).pop()?.toLowerCase();
        if (targetFilename) {
            index = this.imageFiles.findIndex(f => {
                const filename = f.split(/[\\/]/).pop()?.toLowerCase();
                return filename === targetFilename;
            });
            if (index !== -1) {
                this.currentImageIndex = index;
                return true;
            }
        }

        console.warn('[YoloDataReader] 未找到图片:', targetPath, '总图片数:', this.imageFiles.length);
        return false;
    }

    public getKptShape(): number[] | undefined {
        return this.config.kpt_shape;
    }
}
