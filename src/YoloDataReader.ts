import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface YoloConfig {
    path: string;      // 数据集根目录
    train: string | string[];     // 训练图片目录（相对于path）
    val: string | string[];       // 验证图片目录（相对于path）
    names: string[];   // 标签类别名称列表
}

export interface BoundingBox {
    class: number;
    x: number;
    y: number;
    width: number;
    height: number;
    isSegmentation?: boolean;
    points?: number[];  // For segmentation format: [x1,y1,x2,y2,...]
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

        // Validate train and val paths
        if (config.train && !this._isValidPath(config.train)) {
            throw new Error('Train path must be a string or an array of strings');
        }

        if (config.val && !this._isValidPath(config.val)) {
            throw new Error('Val path must be a string or an array of strings');
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
                names: rawConfig.names
            };

            this.loadImageFiles();
        } catch (error: any) {
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

            this.imageFiles = [];

            // 处理训练集路径
            const trainPaths = Array.isArray(this.config.train) 
                ? this.config.train 
                : [this.config.train];

            // 遍历所有训练集路径
            for (const trainPath of trainPaths) {
                if (!trainPath) continue;

                const fullPath = path.join(imagesPath, trainPath);
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

                this.imageFiles.push(...files);
            }

            // 处理验证集路径
            const valPaths = Array.isArray(this.config.val)
                ? this.config.val
                : [this.config.val];

            // 遍历所有验证集路径
            for (const valPath of valPaths) {
                if (!valPath) continue;

                const fullPath = path.join(imagesPath, valPath);
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

                this.imageFiles.push(...files);
            }

            // 对文件进行排序以确保顺序一致
            this.imageFiles.sort();

            if (this.imageFiles.length === 0) {
                throw new Error('No supported image files found in any of the directories');
            }

            console.log(`Loaded ${this.imageFiles.length} images from ${trainPaths.length} train and ${valPaths.length} val directories`);
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
        const labelPath = this.getLabelFile(imagePath);
        if (!fs.existsSync(labelPath)) {
            return [];
        }

        try {
            const labelContent = fs.readFileSync(labelPath, 'utf8');
            return labelContent
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const values = line.split(' ').map(Number);
                    const classId = values[0];
                    
                    // Check if it's a segmentation format (more than 5 values)
                    if (values.length > 5) {
                        return {
                            class: classId,
                            x: 0,  // These will be calculated from points
                            y: 0,
                            width: 0,
                            height: 0,
                            isSegmentation: true,
                            points: values.slice(1)  // All values after classId are points
                        };
                    } else {
                        // Regular bounding box format
                        const [_, x, y, width, height] = values;
                        if (isNaN(classId) || isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
                            throw new Error(`Invalid label format in line: ${line}`);
                        }
                        return { class: classId, x, y, width, height, isSegmentation: false };
                    }
                });
        } catch (error: any) {
            console.error(`Error reading labels from ${labelPath}:`, error);
            return [];
        }
    }

    public saveLabels(imagePath: string, labels: BoundingBox[]) {
        try {
            const labelPath = this.getLabelFile(imagePath);
            const labelContent = labels
                .map(label => {
                    if (label.isSegmentation && label.points) {
                        return `${label.class} ${label.points.join(' ')}`;
                    } else {
                        return `${label.class} ${label.x} ${label.y} ${label.width} ${label.height}`;
                    }
                })
                .join('\n');
            
            // 确保标签目录存在
            const labelDir = path.dirname(labelPath);
            if (!fs.existsSync(labelDir)) {
                fs.mkdirSync(labelDir, { recursive: true });
            }
            
            fs.writeFileSync(labelPath, labelContent);
        } catch (error: any) {
            console.error(`Error saving labels to ${imagePath}:`, error);
            throw new Error(`Failed to save labels: ${error.message}`);
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
        return [...this.imageFiles];
    }

    public setCurrentImageByPath(imagePath: string): boolean {
        const index = this.imageFiles.findIndex(file => file === imagePath);
        if (index !== -1) {
            this.currentImageIndex = index;
            return true;
        }
        return false;
    }
} 