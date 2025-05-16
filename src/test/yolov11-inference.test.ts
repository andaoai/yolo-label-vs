import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as ort from 'onnxruntime-node';
import { listSupportedBackends } from 'onnxruntime-node';

const Jimp = require('jimp');

// 打印 ONNX Runtime 支持的后端信息
const supportedBackends = listSupportedBackends();
console.log('Available ONNX Runtime Backends:', supportedBackends);

// 检查 GPU 加速是否可用
const hasGpu = supportedBackends.some(b => 
    b.name.toLowerCase().includes('gpu') || 
    b.name.toLowerCase().includes('cuda') || 
    b.name.toLowerCase().includes('dml'));
console.log('GPU acceleration might be available:', hasGpu);

// 定义常量和资源路径
const TEST_ASSETS = {
    modelDir: path.join(__dirname, '..', '..', 'test_label', 'model'),
    imageDir: path.join(__dirname, '..', '..', 'test_label', 'train_box', 'train', 'images'),
    get yolov11Path() { return path.join(this.modelDir, 'yolo11s.onnx'); }
};

// YOLOv11 相关常量
// YOLOv11可能使用不同的默认值，根据需要调整
const INPUT_WIDTH = 640;
const INPUT_HEIGHT = 640;
const SCORE_THRESHOLD = 0.45;
const NMS_THRESHOLD = 0.45;
const CONFIDENCE_THRESHOLD = 0.45;

// COCO 数据集类名
// YOLOv11可能使用相同的COCO类名
const CLASS_NAMES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
    'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
    'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
    'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
    'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
    'hair drier', 'toothbrush'
];

// Float16 转换工具函数
function float32ToFloat16(float32: number): number {
    const buf = new ArrayBuffer(4);
    (new Float32Array(buf))[0] = float32;
    const bits = (new Uint32Array(buf))[0];

    const sign = bits >>> 31;
    let exponent = (bits >>> 23) & 0xff;
    let mantissa = bits & 0x7fffff;

    if (exponent === 0xff) {
        return mantissa !== 0 ? 0x7e00 : (sign === 0 ? 0x7c00 : 0xfc00);
    }

    exponent = exponent - 127 + 15;
    
    if (exponent >= 0x1f) {
        return sign === 0 ? 0x7c00 : 0xfc00;
    }
    
    if (exponent <= 0) {
        mantissa = (mantissa | 0x800000) >> (1 - exponent);
        exponent = 0;
    } else {
        mantissa = mantissa >> 13;
    }

    return (sign << 15) | (exponent << 10) | mantissa;
}

function float16ToFloat32(float16: number): number {
    const sign = (float16 >>> 15) & 0x1;
    let exponent = (float16 >>> 10) & 0x1f;
    let mantissa = float16 & 0x3ff;

    if (exponent === 0x1f) {
        return mantissa !== 0 ? NaN : (sign === 0 ? Infinity : -Infinity);
    }

    let float32 = 0;
    if (exponent === 0) {
        if (mantissa === 0) {
            float32 = sign === 0 ? 0 : -0;
        } else {
            exponent = -14;
            while (!(mantissa & 0x400)) {
                mantissa <<= 1;
                exponent--;
            }
            mantissa &= 0x3ff;
            exponent += 127;
            float32 = (sign << 31) | (exponent << 23) | (mantissa << 13);
        }
    } else {
        exponent = exponent - 15 + 127;
        float32 = (sign << 31) | (exponent << 23) | (mantissa << 13);
    }

    const buf = new ArrayBuffer(4);
    (new Uint32Array(buf))[0] = float32;
    return (new Float32Array(buf))[0];
}

// 批量转换数组
function float32ArrayToFloat16Array(float32Array: Float32Array): Uint16Array {
    const float16Array = new Uint16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        float16Array[i] = float32ToFloat16(float32Array[i]);
    }
    return float16Array;
}

function float16ArrayToFloat32Array(float16Array: Uint16Array): Float32Array {
    const float32Array = new Float32Array(float16Array.length);
    for (let i = 0; i < float16Array.length; i++) {
        float32Array[i] = float16ToFloat32(float16Array[i]);
    }
    return float32Array;
}

// 加载 ONNX 模型
async function loadOnnxModel(modelPath: string, useDml: boolean = hasGpu): Promise<ort.InferenceSession> {
    if (!fs.existsSync(modelPath)) {
        throw new Error(`Model not found at: ${modelPath}`);
    }

    // 获取模型文件大小
    const stats = fs.statSync(modelPath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    console.log(`模型文件大小: ${fileSizeInMB.toFixed(2)} MB`);
    
    console.log(`使用执行提供程序: ${useDml ? 'DirectML (GPU) + CPU' : '仅CPU'}`);
    
    const options: ort.InferenceSession.SessionOptions = {
        graphOptimizationLevel: 'all' as any,
        enableCpuMemArena: true,
        executionMode: 'sequential' as any,
        executionProviders: useDml ? ['dml', 'cpu'] : ['cpu']
    };

    console.log(`Loading model ${path.basename(modelPath)}...`);
    console.log('首次加载大型模型可能需要几十秒，请耐心等待...');
    
    try {
        console.time('Model loading time');
        const session = await ort.InferenceSession.create(modelPath, options);
        console.timeEnd('Model loading time');
        
        // 打印模型的输入和输出信息
        console.log(`模型加载完成! 输入: ${session.inputNames.join(', ')}, 输出: ${session.outputNames.join(', ')}`);
        
        return session;
    } catch (error) {
        console.error('模型加载失败:', error);
        throw new Error(`模型加载失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// 预处理图像
async function preprocessImage(imagePath: string): Promise<{
    imageData: Float32Array,
    originalWidth: number,
    originalHeight: number,
    resizeRatio: { x: number, y: number }
}> {
    const image = await Jimp.read(imagePath);
    const originalWidth = image.bitmap.width;
    const originalHeight = image.bitmap.height;
    
    const resizeRatio = {
        x: originalWidth / INPUT_WIDTH,
        y: originalHeight / INPUT_HEIGHT
    };
    
    const resized = image.resize(INPUT_WIDTH, INPUT_HEIGHT);
    const float32Data = new Float32Array(3 * INPUT_WIDTH * INPUT_HEIGHT);
    
    for (let y = 0; y < INPUT_HEIGHT; y++) {
        for (let x = 0; x < INPUT_WIDTH; x++) {
            const color = Jimp.intToRGBA(resized.getPixelColor(x, y));
            
            // 归一化并存储为 CHW 格式
            const r = color.r / 255.0;
            const g = color.g / 255.0;
            const b = color.b / 255.0;
            
            float32Data[0 * INPUT_HEIGHT * INPUT_WIDTH + y * INPUT_WIDTH + x] = r;
            float32Data[1 * INPUT_HEIGHT * INPUT_WIDTH + y * INPUT_WIDTH + x] = g;
            float32Data[2 * INPUT_HEIGHT * INPUT_WIDTH + y * INPUT_WIDTH + x] = b;
        }
    }
    
    // 不再转换为 float16 格式，直接返回float32Data
    return { imageData: float32Data, originalWidth, originalHeight, resizeRatio };
}

// 计算 IoU
function calculateIoU(boxA: [number, number, number, number], boxB: [number, number, number, number]): number {
    const [aX1, aY1, aX2, aY2] = boxA;
    const [bX1, bY1, bX2, bY2] = boxB;
    
    const intersectionX1 = Math.max(aX1, bX1);
    const intersectionY1 = Math.max(aY1, bY1);
    const intersectionX2 = Math.min(aX2, bX2);
    const intersectionY2 = Math.min(aY2, bY2);
    
    if (intersectionX2 < intersectionX1 || intersectionY2 < intersectionY1) {
        return 0;
    }
    
    const intersection = (intersectionX2 - intersectionX1) * (intersectionY2 - intersectionY1);
    const areaA = (aX2 - aX1) * (aY2 - aY1);
    const areaB = (bX2 - bX1) * (bY2 - bY1);
    
    return intersection / (areaA + areaB - intersection);
}

// 非极大值抑制
function nonMaxSuppression(
    boxes: Array<[number, number, number, number]>, 
    scores: number[], 
    iouThreshold: number
): number[] {
    const indexScorePairs = scores.map((score, index) => ({ score, index }));
    indexScorePairs.sort((a, b) => b.score - a.score);
    
    const selectedIndices: number[] = [];
    const picked: boolean[] = new Array(boxes.length).fill(false);
    
    for (let i = 0; i < indexScorePairs.length; i++) {
        const currentIndex = indexScorePairs[i].index;
        
        if (picked[currentIndex]) continue;
        
        selectedIndices.push(currentIndex);
        picked[currentIndex] = true;
        
        const currentBox = boxes[currentIndex];
        
        for (let j = i + 1; j < indexScorePairs.length; j++) {
            const compareIndex = indexScorePairs[j].index;
            
            if (picked[compareIndex]) continue;
            
            const compareBox = boxes[compareIndex];
            const iou = calculateIoU(currentBox, compareBox);
            
            if (iou > iouThreshold) {
                picked[compareIndex] = true;
            }
        }
    }
    
    return selectedIndices;
}

// 处理 YOLOv11 输出 (Float32 版本)
function processOutputFloat32(
    output: Float32Array,
    originalWidth: number,
    originalHeight: number,
    resizeRatio: { x: number, y: number },
    outputShape: readonly number[]
): {
    boxes: Array<[number, number, number, number]>,
    scores: number[],
    classIds: number[]
} {
    const boxes: Array<[number, number, number, number]> = [];
    const scores: number[] = [];
    const classIds: number[] = [];
    
    // YOLOv11输出形状为 [1, 84, 8400]
    // 格式为 [batch, 4+80(classes), anchors]
    // 4 = 中心点坐标(x,y)和宽高(w,h), 80 = COCO类别数
    console.log(`处理输出，形状: ${outputShape}`);
    
    // 确定维度
    const numClasses = outputShape[1] - 4; // 减去边界框的坐标和尺寸
    const numAnchors = outputShape[2] || 8400;
    
    console.log(`检测到 ${numClasses} 个类别和 ${numAnchors} 个锚点`);
    
    // YOLOv11的输出是 [1, 84, 8400] 格式
    // 前4行是边界框坐标 (cx, cy, w, h)，接下来的80行是类别置信度
    for (let i = 0; i < numAnchors; i++) {
        // 找出得分最高的类别
        let maxClassScore = 0;
        let maxClassId = 0;
        
        // 从第5个元素开始（索引4）是类别置信度
        for (let c = 0; c < numClasses; c++) {
            // 输出布局为 [batch, 类别+坐标, 锚点]
            // 正确索引: (4+c) * numAnchors + i
            const classScore = output[(4 + c) * numAnchors + i];
            if (classScore > maxClassScore) {
                maxClassScore = classScore;
                maxClassId = c;
            }
        }
        
        // 仅处理置信度大于阈值的检测
        if (maxClassScore < CONFIDENCE_THRESHOLD) continue;
        
        // 获取边界框坐标 (cx, cy, w, h)
        // 正确索引: c * numAnchors + i
        let cx = output[0 * numAnchors + i];
        let cy = output[1 * numAnchors + i];
        let width = output[2 * numAnchors + i];
        let height = output[3 * numAnchors + i];
        
        // 确保值合理（修复可能的异常值）
        if (!isFinite(maxClassScore) || maxClassScore > 1.0) {
            maxClassScore = Math.min(1.0, Math.max(0, maxClassScore / 100)); // 归一化异常高的置信度
        }
        
        // 跳过置信度过低的检测
        if (maxClassScore < SCORE_THRESHOLD) continue;
        
        // 检查边界框值是否有效
        if (!isFinite(cx) || !isFinite(cy) || !isFinite(width) || !isFinite(height)) {
            console.warn(`跳过无效边界框: cx=${cx}, cy=${cy}, width=${width}, height=${height}`);
            continue;
        }
        
        // 限制值的范围到0-1
        cx = Math.max(0, Math.min(INPUT_WIDTH, cx)) / INPUT_WIDTH;
        cy = Math.max(0, Math.min(INPUT_HEIGHT, cy)) / INPUT_HEIGHT;
        width = Math.max(0.001, Math.min(INPUT_WIDTH, width)) / INPUT_WIDTH;
        height = Math.max(0.001, Math.min(INPUT_HEIGHT, height)) / INPUT_HEIGHT;
        
        // 转换为左上右下坐标 (x1, y1, x2, y2)
        const x1 = (cx - width / 2) * originalWidth;
        const y1 = (cy - height / 2) * originalHeight;
        const x2 = (cx + width / 2) * originalWidth;
        const y2 = (cy + height / 2) * originalHeight;
        
        boxes.push([x1, y1, x2, y2]);
        scores.push(maxClassScore);
        classIds.push(maxClassId);
    }
    
    console.log(`在阈值 ${SCORE_THRESHOLD} 上检测到 ${boxes.length} 个对象`);
    
    return { boxes, scores, classIds };
}

// 在图像上绘制检测结果
async function drawDetectionsOnImage(
    imagePath: string,
    boxes: Array<[number, number, number, number]>,
    scores: number[],
    classIds: number[],
    indices: number[]
): Promise<string> {
    const image = await Jimp.read(imagePath);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    
    for (const idx of indices) {
        const [x1, y1, x2, y2] = boxes[idx];
        const classId = classIds[idx];
        const score = scores[idx];
        const className = CLASS_NAMES[classId];
        const label = `${className}: ${score.toFixed(2)}`;
        
        const ix1 = Math.max(0, Math.floor(x1));
        const iy1 = Math.max(0, Math.floor(y1));
        const ix2 = Math.min(image.bitmap.width - 1, Math.floor(x2));
        const iy2 = Math.min(image.bitmap.height - 1, Math.floor(y2));
        
        // 绘制边界框
        image.scan(ix1, iy1, ix2 - ix1, 1, function(this: any, x: number, y: number, idx: number) {
            this.bitmap.data[idx + 0] = 255; // R
            this.bitmap.data[idx + 1] = 0;   // G
            this.bitmap.data[idx + 2] = 0;   // B
        });
        
        image.scan(ix1, iy2, ix2 - ix1, 1, function(this: any, x: number, y: number, idx: number) {
            this.bitmap.data[idx + 0] = 255; // R
            this.bitmap.data[idx + 1] = 0;   // G
            this.bitmap.data[idx + 2] = 0;   // B
        });
        
        image.scan(ix1, iy1, 1, iy2 - iy1, function(this: any, x: number, y: number, idx: number) {
            this.bitmap.data[idx + 0] = 255; // R
            this.bitmap.data[idx + 1] = 0;   // G
            this.bitmap.data[idx + 2] = 0;   // B
        });
        
        image.scan(ix2, iy1, 1, iy2 - iy1, function(this: any, x: number, y: number, idx: number) {
            this.bitmap.data[idx + 0] = 255; // R
            this.bitmap.data[idx + 1] = 0;   // G
            this.bitmap.data[idx + 2] = 0;   // B
        });
        
        // 打印标签
        image.print(font, ix1, Math.max(0, iy1 - 16), label);
    }
    
    // 保存结果
    const baseName = path.basename(imagePath, path.extname(imagePath));
    const outputPath = path.join(TEST_ASSETS.imageDir, `${baseName}_yolov11_detect.png`);
    await image.writeAsync(outputPath);
    
    return outputPath;
}

// YOLOv11 推理测试
async function runYolov11Inference(imagePath: string, useDml: boolean = hasGpu): Promise<void> {
    console.log(`Running YOLOv11 inference on: ${path.basename(imagePath)}`);
    
    // 1. 加载模型
    console.log('开始加载模型，首次加载可能需要较长时间...');
    const yoloSession = await loadOnnxModel(TEST_ASSETS.yolov11Path, useDml);
    console.log(`Model loaded with input: ${yoloSession.inputNames[0]}, output: ${yoloSession.outputNames[0]}`);
    
    // 2. 预处理图像
    console.time('Processing time');
    const { imageData, originalWidth, originalHeight, resizeRatio } = await preprocessImage(imagePath);
    
    // 3. 运行推理 - 使用float32而不是float16
    const feeds: Record<string, ort.Tensor> = {};
    
    // 使用float32数据创建tensor
    feeds[yoloSession.inputNames[0]] = new ort.Tensor(
        'float32', 
        imageData, 
        [1, 3, INPUT_HEIGHT, INPUT_WIDTH]
    );
    
    const results = await yoloSession.run(feeds);
    
    // 4. 提取输出张量和形状
    const outputName = yoloSession.outputNames[0];
    const outputTensor = results[outputName];
    const outputData = outputTensor.data as Float32Array;
    const outputShape = outputTensor.dims;
    
    console.log(`Output tensor shape: ${outputShape}`);
    
    // 5. 处理检测结果 - 修改processOutput函数调用，传入float32数据
    const { boxes, scores, classIds } = processOutputFloat32(
        outputData, 
        originalWidth, 
        originalHeight, 
        resizeRatio, 
        outputShape
    );
    
    // 6. 应用 NMS
    const selectedIndices = nonMaxSuppression(boxes, scores, NMS_THRESHOLD);
    console.log(`Found ${selectedIndices.length} objects`);
    
    // 7. 绘制结果
    const outputPath = await drawDetectionsOnImage(imagePath, boxes, scores, classIds, selectedIndices);
    console.log(`Results saved to: ${outputPath}`);
    
    // 8. 打印检测到的对象
    for (const idx of selectedIndices) {
        const classId = classIds[idx];
        const className = CLASS_NAMES[classId];
        const score = scores[idx];
        console.log(`Detected ${className} with confidence ${score.toFixed(3)}`);
    }
    
    console.timeEnd('Processing time');
}

// 主测试函数
async function runTests() {
    // 测试多个图像 - 使用通配的名称，任何.jpg文件都可以
    const testImages = ['*.jpg']; // 会找到该目录下任何jpg文件
    
    console.log('Starting YOLOv11 inference tests');
    
    // 检查模型是否存在
    if (!fs.existsSync(TEST_ASSETS.yolov11Path)) {
        console.error(`YOLO模型不存在: ${TEST_ASSETS.yolov11Path}`);
        throw new Error('YOLOv11 model does not exist');
    }
    
    console.log(`将使用模型: ${TEST_ASSETS.yolov11Path}`);
    
    // 检查图像目录是否存在
    if (!fs.existsSync(TEST_ASSETS.imageDir)) {
        console.error(`图像目录不存在: ${TEST_ASSETS.imageDir}`);
        throw new Error('Image directory does not exist');
    }
    
    // 查找所有jpg图像
    let imagesToTest: string[] = [];
    const files = fs.readdirSync(TEST_ASSETS.imageDir);
    
    for (const pattern of testImages) {
        if (pattern.includes('*')) {
            // 匹配通配符模式
            const regex = new RegExp(pattern.replace('*', '.*'), 'i');
            const matchingFiles = files.filter(file => regex.test(file));
            
            if (matchingFiles.length > 0) {
                imagesToTest = imagesToTest.concat(matchingFiles.slice(0, 2)); // 最多测试2张图片
            }
        } else {
            // 直接使用指定文件名
            if (files.includes(pattern)) {
                imagesToTest.push(pattern);
            }
        }
    }
    
    if (imagesToTest.length === 0) {
        console.warn(`Warning: No test images found in ${TEST_ASSETS.imageDir}`);
        console.warn('Trying to list available images:');
        console.warn(files.join(', '));
        throw new Error('No test images found');
    }
    
    console.log(`将测试 ${imagesToTest.length} 张图片: ${imagesToTest.join(', ')}`);
    
    // 依次测试每张图像
    for (const image of imagesToTest) {
        const imagePath = path.join(TEST_ASSETS.imageDir, image);
        try {
            console.log(`\n===== Testing image: ${image} =====`);
            await runYolov11Inference(imagePath, hasGpu);
        } catch (error) {
            console.error(`测试图片 ${image} 时出错:`, error);
            throw error; // 重新抛出错误以终止测试
        }
    }
    
    console.log('\nAll YOLOv11 inference tests completed successfully');
}

// 运行测试
runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
}); 