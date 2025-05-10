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
                names: rawConfig.names
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
            let detectedType: 'box' | 'seg' | 'pose' | 'obb' | null = null;
            
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                
                // Skip empty lines
                if (parts.length === 0) continue;
                
                // Validate class index
                const classIndex = parseInt(parts[0], 10);
                if (isNaN(classIndex)) {
                    console.warn(`Invalid class index in line: ${line}`);
                    continue;
                }

                // Detect data type based on the number of values and their format
                if (parts.length === 5) {
                    // Standard YOLO format: class x y width height
                    const [x, y, width, height] = parts.slice(1).map(p => parseFloat(p));
                    
                    if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
                        if (detectedType && detectedType !== 'box') {
                            console.warn(`Mixed data types detected in file ${labelPath}. Expected ${detectedType} but found box format.`);
                        }
                        detectedType = 'box';
                        labels.push({
                            class: classIndex,
                            x, y, width, height,
                            labelType: 'box',
                            visible: true
                        });
                    }
                } 
                else if (parts.length === 6) {
                    // OBB format: class x y width height angle
                    const [x, y, width, height, angle] = parts.slice(1).map(p => parseFloat(p));
                    
                    if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height) && !isNaN(angle)) {
                        if (detectedType && detectedType !== 'obb') {
                            console.warn(`Mixed data types detected in file ${labelPath}. Expected ${detectedType} but found OBB format.`);
                        }
                        detectedType = 'obb';
                        labels.push({
                            class: classIndex,
                            x, y, width, height,
                            labelType: 'obb',
                            angle: angle,
                            visible: true
                        });
                    }
                }
                else if (parts.length > 5 && parts.length % 2 === 1) {
                    // YOLO-Segmentation format: class [points...]
                    const points = parts.slice(1).map(p => parseFloat(p));
                    
                    if (points.every(p => !isNaN(p))) {
                        if (detectedType && detectedType !== 'seg') {
                            console.warn(`Mixed data types detected in file ${labelPath}. Expected ${detectedType} but found segmentation format.`);
                        }
                        detectedType = 'seg';
                        labels.push({
                            class: classIndex,
                            x: 0, y: 0, width: 0, height: 0,
                            labelType: 'seg',
                            points: points,
                            visible: true
                        });
                    }
                }
                else if (parts.length > 5 && parts.length % 3 === 2) {
                    // YOLO-Pose format: class x y width height [keypoints...]
                    const [x, y, width, height] = parts.slice(1, 5).map(p => parseFloat(p));
                    const keypoints = parts.slice(5).map(p => parseFloat(p));
                    
                    // Validate keypoints format (should be multiple of 3)
                    if (keypoints.length % 3 !== 0) {
                        console.warn(`Invalid keypoints format in line: ${line}. Keypoints should be in groups of 3 (x, y, visibility).`);
                        continue;
                    }
                    
                    if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height) && 
                        keypoints.every(p => !isNaN(p))) {
                        if (detectedType && detectedType !== 'pose') {
                            console.warn(`Mixed data types detected in file ${labelPath}. Expected ${detectedType} but found pose format.`);
                        }
                        detectedType = 'pose';
                        labels.push({
                            class: classIndex,
                            x, y, width, height,
                            labelType: 'pose',
                            keypoints: keypoints,
                            visible: true
                        });
                    }
                }
                else {
                    console.warn(`Invalid format in line: ${line}`);
                }
            }

            // Log the detected data type
            if (detectedType) {
                console.log(`Detected YOLO data type: ${detectedType} in file ${labelPath}`);
            } else {
                console.warn(`Could not determine YOLO data type in file ${labelPath}`);
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
                if (label.labelType === 'seg' && label.points && label.points.length > 0) {
                    // Segmentation format: class [points...]
                    const formattedPoints = label.points.map(p => p.toFixed(6));
                    content += `${label.class} ${formattedPoints.join(' ')}\n`;
                } else if (label.labelType === 'pose' && label.keypoints && label.keypoints.length > 0) {
                    // Pose format: class x y width height [keypoints...]
                    const formattedKeypoints = label.keypoints.map(k => k.toFixed(6));
                    content += `${label.class} ${label.x.toFixed(6)} ${label.y.toFixed(6)} ${label.width.toFixed(6)} ${label.height.toFixed(6)} ${formattedKeypoints.join(' ')}\n`;
                } else if (label.labelType === 'obb' && label.angle !== undefined) {
                    // OBB format: class x y width height angle
                    content += `${label.class} ${label.x.toFixed(6)} ${label.y.toFixed(6)} ${label.width.toFixed(6)} ${label.height.toFixed(6)} ${label.angle.toFixed(6)}\n`;
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
} 