import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { BoundingBox, ImageInfo } from './model/types';
import { ErrorHandler, ErrorType } from './ErrorHandler';

export { BoundingBox } from './model/types';

// 本地定义YoloConfig，确保类型安全
export interface YoloConfig {
    path: string;      // 数据集根目录
    train: string | string[];     // 训练图片目录（相对于path）
    val: string | string[];       // 验证图片目录（相对于path）
    test: string | string[];      // 测试图片目录（相对于path）
    names: string[];   // 标签类别名称列表，始终保存为数组形式
    kpt_shape?: number[];  // 关键点形状，如 [17, 3] 表示17个关键点，每个有3个值（x,y,visible）
    flip_idx?: number[];  // 关键点翻转索引，用于水平翻转时映射关键点
}

export class YoloDataReader {
    private config!: YoloConfig;
    private currentImageIndex: number = 0;
    private imageFiles: string[] = [];
    private basePath: string;
    private readonly SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

    constructor(private yamlPath: string) {
        this.basePath = path.dirname(yamlPath);
        this.loadConfig();
    }

    private validateConfig(config: any): config is YoloConfig {
        if (!config.path) {
            throw new Error('Missing required field: path');
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
        if (config.train && !this._isValidPath(config.train)) {
            throw new Error('Train path must be a string or an array of strings');
        }

        if (config.val && !this._isValidPath(config.val)) {
            throw new Error('Val path must be a string or an array of strings');
        }

        if (config.test && !this._isValidPath(config.test)) {
            throw new Error('Test path must be a string or an array of strings');
        }

        return true;
    }

    private _isValidPath(path: any): boolean {
        if (typeof path === 'string') return true;
        if (Array.isArray(path)) {
            return path.every(p => typeof p === 'string');
        }
        return false;
    }

    private loadConfig() {
        try {
            const yamlContent = fs.readFileSync(this.yamlPath, 'utf8');
            
            const rawConfig = yaml.load(yamlContent) as any;
            if (!this.validateConfig(rawConfig)) {
                throw new Error('Invalid configuration format');
            }
            
            this.config = {
                path: rawConfig.path,
                train: rawConfig.train || '',
                val: rawConfig.val || '',
                test: rawConfig.test || '',
                names: rawConfig.names,
                kpt_shape: rawConfig.kpt_shape,
                flip_idx: rawConfig.flip_idx
            };

            this.loadImageFiles();
        } catch (error: any) {
            const errorDetails = ErrorHandler.handleError(
                error,
                'Failed to load YOLO configuration',
                {
                    type: ErrorType.CONFIG_ERROR,
                    filePath: this.yamlPath,
                    showNotification: false
                }
            );
            console.error('Error loading config:', error);
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    private loadImageFiles() {
        try {
            const yamlDir = path.dirname(path.resolve(this.yamlPath));
            let imagesPath = this.config.path;
            
            if (!path.isAbsolute(imagesPath)) {
                imagesPath = path.resolve(yamlDir, imagesPath);
            }

            // 使用 Set 来存储唯一的文件路径
            const imageFilesSet = new Set<string>();
            let directoriesChecked = 0;

            // 辅助函数，负责从指定路径加载图片
            const loadImagesFromPath = (pathConfig: string | string[], label: string) => {
                const paths = Array.isArray(pathConfig) ? pathConfig : [pathConfig];
                
                for (const subPath of paths) {
                    if (!subPath) continue;
                    
                    const fullPath = path.join(imagesPath, subPath);
                    directoriesChecked++;
                    
                    if (!fs.existsSync(fullPath)) {
                        console.warn(`Warning: Directory does not exist: ${fullPath}`);
                        continue;
                    }
                    
                    // 读取当前目录下的所有文件
                    const files = fs.readdirSync(fullPath)
                        .filter(file => {
                            const ext = path.extname(file).toLowerCase();
                            return this.SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
                        })
                        .map(file => path.join(fullPath, file));
                    
                    // 添加到 Set 中以去重
                    files.forEach(file => imageFilesSet.add(file));
                }
                
                return paths.length;
            };
            
            // 处理训练集、验证集和测试集路径
            const trainPathsCount = loadImagesFromPath(this.config.train, 'train');
            const valPathsCount = loadImagesFromPath(this.config.val, 'val');
            const testPathsCount = loadImagesFromPath(this.config.test, 'test');

            // 转换 Set 为数组并排序
            this.imageFiles = Array.from(imageFilesSet).sort();

            if (this.imageFiles.length === 0) {
                console.warn(`No supported image files found in any of the ${directoriesChecked} directories checked.`);
                // 不立即抛出错误，允许初始化继续
            } else {
                console.log(`Loaded ${this.imageFiles.length} unique images from ${trainPathsCount} train, ${valPathsCount} val, and ${testPathsCount} test directories`);
            }
        } catch (error: any) {
            console.error('Error loading image files:', error);
            throw new Error(`Failed to load image files: ${error.message}`);
        }
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

    public getLabelFile(imagePath: string): string {
        const labelPath = imagePath.replace(/images/g, 'labels');
        return labelPath.replace(/\.(jpg|jpeg|png)$/i, '.txt');
    }

    public readLabels(imagePath: string): BoundingBox[] {
        try {
            const labelPath = this.getLabelFile(imagePath);
            if (!fs.existsSync(labelPath)) {
                return [];
            }
            
            const content = fs.readFileSync(labelPath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            
            const labels: BoundingBox[] = [];
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                
                // Standard YOLO format: class x y width height
                if (parts.length === 5) {
                    const classIndex = parseInt(parts[0], 10);
                    const x = parseFloat(parts[1]);
                    const y = parseFloat(parts[2]);
                    const width = parseFloat(parts[3]);
                    const height = parseFloat(parts[4]);
                    
                    if (!isNaN(classIndex) && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
                        labels.push({
                            class: classIndex,
                            x, y, width, height,
                            visible: true
                        });
                    }
                }
                // YOLO-Pose format: class x y width height [keypoints...]
                // keypoints format: [x1, y1, v1, x2, y2, v2, ...] where v is visibility
                else if (parts.length > 5 && this.config.kpt_shape && parts.length === 5 + (this.config.kpt_shape[0] * this.config.kpt_shape[1])) {
                    const classIndex = parseInt(parts[0], 10);
                    const x = parseFloat(parts[1]);
                    const y = parseFloat(parts[2]);
                    const width = parseFloat(parts[3]);
                    const height = parseFloat(parts[4]);
                    
                    // Parse keypoints
                    const keypoints = parts.slice(5).map(p => parseFloat(p));
                    
                    if (!isNaN(classIndex) && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height) && 
                        keypoints.every(p => !isNaN(p))) {
                        labels.push({
                            class: classIndex,
                            x, y, width, height,
                            isPose: true,
                            keypoints: keypoints,
                            keypointShape: this.config.kpt_shape,
                            visible: true
                        });
                    }
                }
                // YOLO-Segmentation format: class [points...]
                else if (parts.length > 5) {
                    const classIndex = parseInt(parts[0], 10);
                    
                    // Parse points as floats - all the remaining points after class index
                    const points = parts.slice(1).map(p => parseFloat(p));
                    
                    if (!isNaN(classIndex) && points.every(p => !isNaN(p))) {
                        // For segmentation, we don't need x,y,w,h as they'll be derived from points
                        labels.push({
                            class: classIndex,
                            x: 0, y: 0, width: 0, height: 0, // Placeholder values
                            isSegmentation: true,
                            points: points,
                            visible: true
                        });
                    }
                }
            }
            
            return labels;
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to read label file',
                {
                    type: ErrorType.LABEL_PARSE_ERROR,
                    filePath: imagePath
                }
            );
            return [];
        }
    }

    public saveLabels(imagePath: string, labels: BoundingBox[]) {
        try {
            const labelPath = this.getLabelFile(imagePath);
            
            // Format the labels according to YOLO format
            let content = '';
            for (const label of labels) {
                if (label.isSegmentation && label.points && label.points.length > 0) {
                    // Segmentation format: class [points...]
                    const formattedPoints = label.points.map(p => p.toFixed(6));
                    content += `${label.class} ${formattedPoints.join(' ')}\n`;
                } else if (label.isPose && label.keypoints && label.keypoints.length > 0) {
                    // Pose format: class x y width height [keypoints...]
                    content += `${label.class} ${label.x.toFixed(6)} ${label.y.toFixed(6)} ${label.width.toFixed(6)} ${label.height.toFixed(6)}`;
                    
                    // Add keypoints
                    for (const kp of label.keypoints) {
                        content += ` ${kp.toFixed(6)}`;
                    }
                    content += '\n';
                } else {
                    // Standard format: class x y width height
                    content += `${label.class} ${label.x.toFixed(6)} ${label.y.toFixed(6)} ${label.width.toFixed(6)} ${label.height.toFixed(6)}\n`;
                }
            }
            
            // Ensure the directory exists
            const labelDir = path.dirname(labelPath);
            if (!fs.existsSync(labelDir)) {
                fs.mkdirSync(labelDir, { recursive: true });
            }
            
            fs.writeFileSync(labelPath, content);
        } catch (error: any) {
            ErrorHandler.handleError(
                error,
                'Failed to save label file',
                {
                    type: ErrorType.LABEL_SAVE_ERROR,
                    filePath: imagePath
                }
            );
            throw error;
        }
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

    public getFlipIdx(): number[] | undefined {
        return this.config.flip_idx;
    }
} 