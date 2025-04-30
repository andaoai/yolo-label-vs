import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface YoloConfig {
    path: string;      // 数据集根目录
    train: string;     // 训练图片目录（相对于path）
    val: string;       // 验证图片目录（相对于path）
    names: string[];   // 标签类别名称列表
}

export interface BoundingBox {
    class: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export class YoloDataReader {
    private config!: YoloConfig;
    private currentImageIndex: number = 0;
    private imageFiles: string[] = [];
    private basePath: string;

    constructor(private yamlPath: string) {
        this.basePath = path.dirname(yamlPath);
        this.loadConfig();
    }

    private loadConfig() {
        try {
            const yamlContent = fs.readFileSync(this.yamlPath, 'utf8');
            console.log('Raw YAML content:', yamlContent);
            
            const rawConfig = yaml.load(yamlContent) as any;
            console.log('Parsed YAML:', rawConfig);
            
            // 处理 names 字段，将对象转换为数组
            const namesObj = rawConfig.names || {};
            const namesArray = Object.entries(namesObj)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([_, name]) => String(name));

            this.config = {
                path: rawConfig.path,
                train: rawConfig.train,
                val: rawConfig.val,
                names: namesArray
            };

            console.log('Final config:', this.config);
            this.loadImageFiles();
        } catch (error) {
            console.error('Error loading config:', error);
            throw error;
        }
    }

    private loadImageFiles() {
        try {
            // 获取 YAML 文件所在目录的绝对路径
            const yamlDir = path.dirname(path.resolve(this.yamlPath));
            console.log('YAML directory:', yamlDir);

            // 解析图片目录的路径
            let imagesPath = this.config.path;
            if (!path.isAbsolute(imagesPath)) {
                imagesPath = path.resolve(yamlDir, imagesPath);
            }

            // 如果指定了 train 路径，则添加到路径中
            if (this.config.train) {
                imagesPath = path.join(imagesPath, this.config.train);
            }

            console.log('Final images path:', imagesPath);
            
            if (!fs.existsSync(imagesPath)) {
                console.error('Images directory does not exist:', imagesPath);
                return;
            }

            // 读取所有文件并过滤出图片文件
            const allFiles = fs.readdirSync(imagesPath);
            console.log('All files in directory:', allFiles);
            
            this.imageFiles = allFiles
                .filter(file => file.toLowerCase().match(/\.(jpg|jpeg|png)$/))
                .map(file => path.join(imagesPath, file));

            console.log('Found images:', this.imageFiles.length);
            if (this.imageFiles.length > 0) {
                console.log('Image files:', this.imageFiles);
            }
        } catch (error) {
            console.error('Error loading image files:', error);
            throw error;
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
        return imagePath.replace(/\.(jpg|jpeg|png)$/i, '.txt');
    }

    public readLabels(imagePath: string): BoundingBox[] {
        const labelPath = this.getLabelFile(imagePath);
        if (!fs.existsSync(labelPath)) {
            return [];
        }

        const labelContent = fs.readFileSync(labelPath, 'utf8');
        return labelContent
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [classId, x, y, width, height] = line.split(' ').map(Number);
                return { class: classId, x, y, width, height };
            });
    }

    public saveLabels(imagePath: string, labels: BoundingBox[]) {
        const labelPath = this.getLabelFile(imagePath);
        const labelContent = labels
            .map(label => `${label.class} ${label.x} ${label.y} ${label.width} ${label.height}`)
            .join('\n');
        fs.writeFileSync(labelPath, labelContent);
    }

    public getClassNames(): string[] {
        return this.config.names;
    }
} 