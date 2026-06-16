import * as path from 'path';
import { BoundingBox } from '../model/types';
import { YoloConfig, loadConfig } from './ConfigLoader';
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
    private basePath: string;

    constructor(private yamlPath: string, workspaceRoot?: string) {
        this.basePath = workspaceRoot || path.dirname(yamlPath);
        this.config = loadConfig(yamlPath);

        // 计算数据集根目录
        const datasetRoot = path.isAbsolute(this.config.path)
            ? this.config.path
            : path.resolve(this.basePath, this.config.path);

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

    public setCurrentImageByPath(path: string): boolean {
        const index = this.imageFiles.indexOf(path);
        if (index !== -1) {
            this.currentImageIndex = index;
            return true;
        }
        return false;
    }

    public getKptShape(): number[] | undefined {
        return this.config.kpt_shape;
    }
}
