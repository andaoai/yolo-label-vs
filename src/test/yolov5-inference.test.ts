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
    get yolov5Path() { return path.join(this.modelDir, 'yolov5s.onnx'); }
};

// YOLOv5 相关常量
const INPUT_WIDTH = 640;
const INPUT_HEIGHT = 640;
const SCORE_THRESHOLD = 0.45;
const NMS_THRESHOLD = 0.45;
const CONFIDENCE_THRESHOLD = 0.45;

// COCO 数据集类名
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
    
    const options: ort.InferenceSession.SessionOptions = {
        graphOptimizationLevel: 'all' as any,
        enableCpuMemArena: true,
        executionMode: 'sequential' as any,
        executionProviders: useDml ? ['dml', 'cpu'] : ['cpu']
    };

    console.log(`Loading model ${path.basename(modelPath)}...`);
    console.time('Model loading time');
    const session = await ort.InferenceSession.create(modelPath, options);
    console.timeEnd('Model loading time');
    
    return session;
}

// 预处理图像
async function preprocessImage(imagePath: string): Promise<{
    imageData: Uint16Array,
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
    
    // 转换为 float16 格式
    const imageData = float32ArrayToFloat16Array(float32Data);
    
    return { imageData, originalWidth, originalHeight, resizeRatio };
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

// 处理 YOLOv5 输出
function processOutput(
    output: Uint16Array,
    originalWidth: number,
    originalHeight: number,
    resizeRatio: { x: number, y: number }
): {
    boxes: Array<[number, number, number, number]>,
    scores: number[],
    classIds: number[]
} {
    const boxes: Array<[number, number, number, number]> = [];
    const scores: number[] = [];
    const classIds: number[] = [];
    
    // 转换为 float32
    const outputFloat32 = float16ArrayToFloat32Array(output);
    
    // YOLOv5 输出格式: [batch, num_detections, 85]
    const numDetections = outputFloat32.length / 85;
    
    for (let i = 0; i < numDetections; i++) {
        const offset = i * 85;
        
        // 获取置信度
        const confidence = outputFloat32[offset + 4];
        
        if (confidence < CONFIDENCE_THRESHOLD) continue;
        
        // 找出得分最高的类别
        let maxClassScore = 0;
        let maxClassId = 0;
        
        for (let c = 0; c < 80; c++) {
            const classScore = outputFloat32[offset + 5 + c];
            if (classScore > maxClassScore) {
                maxClassScore = classScore;
                maxClassId = c;
            }
        }
        
        // 计算最终得分
        const score = confidence * maxClassScore;
        
        if (score < SCORE_THRESHOLD) continue;
        
        // 获取边界框坐标 (center_x, center_y, width, height)
        let rawX = outputFloat32[offset];
        let rawY = outputFloat32[offset + 1];
        let rawWidth = outputFloat32[offset + 2];
        let rawHeight = outputFloat32[offset + 3];
        
        // 转换为左上右下坐标 (x1, y1, x2, y2)
        const x1 = (rawX - rawWidth / 2) * resizeRatio.x;
        const y1 = (rawY - rawHeight / 2) * resizeRatio.y;
        const x2 = (rawX + rawWidth / 2) * resizeRatio.x;
        const y2 = (rawY + rawHeight / 2) * resizeRatio.y;
        
        boxes.push([x1, y1, x2, y2]);
        scores.push(score);
        classIds.push(maxClassId);
    }
    
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
    const outputPath = path.join(TEST_ASSETS.imageDir, `${baseName}_yolov5_detect.png`);
    await image.writeAsync(outputPath);
    
    return outputPath;
}

// YOLOv5 推理测试
async function runYoloInference(imagePath: string, useDml: boolean = hasGpu): Promise<void> {
    console.log(`Running YOLOv5 inference on: ${path.basename(imagePath)}`);
    
    // 1. 加载模型
    const yoloSession = await loadOnnxModel(TEST_ASSETS.yolov5Path, useDml);
    console.log(`Model loaded with input: ${yoloSession.inputNames[0]}, output: ${yoloSession.outputNames[0]}`);
    
    // 2. 预处理图像
    console.time('Processing time');
    const { imageData, originalWidth, originalHeight, resizeRatio } = await preprocessImage(imagePath);
    
    // 3. 运行推理
    const feeds: Record<string, ort.Tensor> = {};
    feeds[yoloSession.inputNames[0]] = new ort.Tensor('float16', imageData, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);
    
    const results = await yoloSession.run(feeds);
    
    // 4. 处理检测结果
    const outputData = results[yoloSession.outputNames[0]].data as Uint16Array;
    const { boxes, scores, classIds } = processOutput(outputData, originalWidth, originalHeight, resizeRatio);
    
    // 5. 应用 NMS
    const selectedIndices = nonMaxSuppression(boxes, scores, NMS_THRESHOLD);
    console.log(`Found ${selectedIndices.length} objects`);
    
    // 6. 绘制结果
    const outputPath = await drawDetectionsOnImage(imagePath, boxes, scores, classIds, selectedIndices);
    console.log(`Results saved to: ${outputPath}`);
    
    // 7. 打印检测到的对象
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
    // 测试多个图像
    const testImages = ['1746128839460.jpg', '1746149830354.jpg'];
    
    console.log('Starting YOLOv5 inference tests');
    assert.strictEqual(fs.existsSync(TEST_ASSETS.yolov5Path), true, 'YOLOv5 model does not exist');
    
    // 依次测试每张图像
    for (const image of testImages) {
        const imagePath = path.join(TEST_ASSETS.imageDir, image);
        if (fs.existsSync(imagePath)) {
            console.log(`\n===== Testing image: ${image} =====`);
            await runYoloInference(imagePath, hasGpu);
        } else {
            console.warn(`Warning: Test image not found: ${imagePath}`);
        }
    }
    
    console.log('\nAll YOLOv5 inference tests completed successfully');
}

// 运行测试
runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
}); 