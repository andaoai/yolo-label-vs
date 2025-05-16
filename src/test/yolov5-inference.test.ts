import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as ort from 'onnxruntime-node';
import { listSupportedBackends } from 'onnxruntime-node';

const Jimp = require('jimp');

// Print ONNX Runtime supported inference devices information
const supportedBackends = listSupportedBackends();
console.log('Available ONNX Runtime Backends:', supportedBackends);

// Print whether CUDA/GPU acceleration might be available
const hasCuda = supportedBackends.some(b => b.name.toLowerCase().includes('cuda'));
const hasGpu = supportedBackends.some(b => 
    b.name.toLowerCase().includes('gpu') || 
    b.name.toLowerCase().includes('cuda') || 
    b.name.toLowerCase().includes('dml'));
console.log('CUDA backend available:', hasCuda);
console.log('GPU acceleration might be available:', hasGpu);

// Define constants and utility functions
const TEST_ASSETS = {
    modelDir: path.join(__dirname, '..', '..', 'test_label', 'model'),
    imageDir: path.join(__dirname, '..', '..', 'test_label', 'train_box', 'train', 'images'),
    get yolov5Path() { return path.join(this.modelDir, 'yolov5s.onnx'); }
};

// YOLOv5 specific constants
const INPUT_WIDTH = 640;
const INPUT_HEIGHT = 640;
const SCORE_THRESHOLD = 0.45;
const NMS_THRESHOLD = 0.45;
const CONFIDENCE_THRESHOLD = 0.45;

// COCO dataset class names
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

// Float16 helper functions
// 将 JavaScript 中的 number 类型 (float32) 转换为 float16 格式
function float32ToFloat16(float32: number): number {
    // IEEE 754 float32 格式解析
    const buf = new ArrayBuffer(4);
    (new Float32Array(buf))[0] = float32;
    const bits = (new Uint32Array(buf))[0];

    // 提取各个部分
    const sign = bits >>> 31;
    let exponent = (bits >>> 23) & 0xff;
    let mantissa = bits & 0x7fffff;

    if (exponent === 0xff) {
        // 处理 NaN 和 Infinity
        if (mantissa !== 0) {
            // NaN
            return 0x7e00;
        } else {
            // Infinity
            return sign === 0 ? 0x7c00 : 0xfc00;
        }
    }

    exponent = exponent - 127 + 15;
    
    if (exponent >= 0x1f) {
        // overflow, 返回 Infinity
        return sign === 0 ? 0x7c00 : 0xfc00;
    }
    
    if (exponent <= 0) {
        // 非规格化数或 0
        mantissa = (mantissa | 0x800000) >> (1 - exponent);
        exponent = 0;
    } else {
        mantissa = mantissa >> 13;
    }

    return (sign << 15) | (exponent << 10) | mantissa;
}

// 将 float16 格式转换回 JavaScript 的 number 类型 (float32)
function float16ToFloat32(float16: number): number {
    const sign = (float16 >>> 15) & 0x1;
    let exponent = (float16 >>> 10) & 0x1f;
    let mantissa = float16 & 0x3ff;

    if (exponent === 0x1f) {
        // 处理 NaN 和 Infinity
        if (mantissa !== 0) {
            // NaN
            return NaN;
        } else {
            // Infinity
            return sign === 0 ? Infinity : -Infinity;
        }
    }

    let float32 = 0;
    if (exponent === 0) {
        // 非规格化数或 0
        if (mantissa === 0) {
            float32 = sign === 0 ? 0 : -0;
        } else {
            // 将非规格化数转换为规格化数
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
        // 规格化数
        exponent = exponent - 15 + 127;
        float32 = (sign << 31) | (exponent << 23) | (mantissa << 13);
    }

    const buf = new ArrayBuffer(4);
    (new Uint32Array(buf))[0] = float32;
    return (new Float32Array(buf))[0];
}

// 将 Float32Array 转换为 Uint16Array (以存储 float16 值)
function float32ArrayToFloat16Array(float32Array: Float32Array): Uint16Array {
    const float16Array = new Uint16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        float16Array[i] = float32ToFloat16(float32Array[i]);
    }
    return float16Array;
}

// 将 Uint16Array (存储的 float16 值) 转换为 Float32Array
function float16ArrayToFloat32Array(float16Array: Uint16Array): Float32Array {
    const float32Array = new Float32Array(float16Array.length);
    for (let i = 0; i < float16Array.length; i++) {
        float32Array[i] = float16ToFloat32(float16Array[i]);
    }
    return float32Array;
}

async function loadOnnxModel(modelPath: string, useDml: boolean = hasGpu): Promise<ort.InferenceSession> {
    if (!fs.existsSync(modelPath)) {
        throw new Error(`Model not found at: ${modelPath}`);
    }
    
    // Create session with specified execution providers
    const options: ort.InferenceSession.SessionOptions = {
        graphOptimizationLevel: 'all' as any,
        enableCpuMemArena: true,
        executionMode: 'sequential' as any,
        executionProviders: useDml ? ['dml', 'cpu'] : ['cpu']
    };

    console.log(`Loading model ${path.basename(modelPath)}...`);
    console.log(`Using execution providers: ${options.executionProviders?.join(', ') || 'default'}`);
    console.time('Model loading time');
    const session = await ort.InferenceSession.create(modelPath, options);
    console.timeEnd('Model loading time');
    
    console.log(`Model ${path.basename(modelPath)} loaded successfully`);
    console.log('- Input names:', session.inputNames);
    console.log('- Output names:', session.outputNames);
    
    return session;
}

async function preprocessImage(imagePath: string): Promise<{
    imageData: Uint16Array,  // 修改为 Uint16Array，用于存储 float16 值
    originalWidth: number,
    originalHeight: number,
    resizeRatio: { x: number, y: number }
}> {
    const image = await Jimp.read(imagePath);
    const originalWidth = image.bitmap.width;
    const originalHeight = image.bitmap.height;
    
    // Calculate resize ratio for mapping predictions back to original image
    const resizeRatio = {
        x: originalWidth / INPUT_WIDTH,
        y: originalHeight / INPUT_HEIGHT
    };
    
    // Resize the image to the input dimensions expected by YOLOv5
    const resized = image.resize(INPUT_WIDTH, INPUT_HEIGHT);
    
    // 首先创建 float32 数据
    const float32Data = new Float32Array(3 * INPUT_WIDTH * INPUT_HEIGHT);
    
    // Process the image data (normalize to 0-1)
    for (let y = 0; y < INPUT_HEIGHT; y++) {
        for (let x = 0; x < INPUT_WIDTH; x++) {
            const color = Jimp.intToRGBA(resized.getPixelColor(x, y));
            
            // Store in CHW format with normalization (0-255 -> 0-1)
            const r = color.r / 255.0;
            const g = color.g / 255.0;
            const b = color.b / 255.0;
            
            // Store in CHW format
            float32Data[0 * INPUT_HEIGHT * INPUT_WIDTH + y * INPUT_WIDTH + x] = r;
            float32Data[1 * INPUT_HEIGHT * INPUT_WIDTH + y * INPUT_WIDTH + x] = g;
            float32Data[2 * INPUT_HEIGHT * INPUT_WIDTH + y * INPUT_WIDTH + x] = b;
        }
    }
    
    // 将 float32 数据转换为 float16 格式
    const imageData = float32ArrayToFloat16Array(float32Data);
    
    return { imageData, originalWidth, originalHeight, resizeRatio };
}

// Non-maximum suppression to filter overlapping bounding boxes
function nonMaxSuppression(
    boxes: Array<[number, number, number, number]>, 
    scores: number[], 
    iouThreshold: number
): number[] {
    // Sort boxes by score
    const indexScorePairs = scores.map((score, index) => ({ score, index }));
    indexScorePairs.sort((a, b) => b.score - a.score);
    
    const selectedIndices: number[] = [];
    const picked: boolean[] = new Array(boxes.length).fill(false);
    
    for (let i = 0; i < indexScorePairs.length; i++) {
        const currentIndex = indexScorePairs[i].index;
        
        // Skip if this box was already picked
        if (picked[currentIndex]) continue;
        
        // Add this box to the selected indices
        selectedIndices.push(currentIndex);
        picked[currentIndex] = true;
        
        // Calculate IoU with remaining boxes
        const currentBox = boxes[currentIndex];
        
        for (let j = i + 1; j < indexScorePairs.length; j++) {
            const compareIndex = indexScorePairs[j].index;
            
            // Skip if this box was already picked
            if (picked[compareIndex]) continue;
            
            const compareBox = boxes[compareIndex];
            
            // Calculate intersection over union
            const intersection = calculateIntersection(currentBox, compareBox);
            const union = calculateUnion(currentBox, compareBox, intersection);
            const iou = intersection / union;
            
            // If IoU exceeds the threshold, remove the box
            if (iou > iouThreshold) {
                picked[compareIndex] = true;
            }
        }
    }
    
    return selectedIndices;
}

function calculateIntersection(
    boxA: [number, number, number, number],
    boxB: [number, number, number, number]
): number {
    const [aX1, aY1, aX2, aY2] = boxA;
    const [bX1, bY1, bX2, bY2] = boxB;
    
    const intersectionX1 = Math.max(aX1, bX1);
    const intersectionY1 = Math.max(aY1, bY1);
    const intersectionX2 = Math.min(aX2, bX2);
    const intersectionY2 = Math.min(aY2, bY2);
    
    // Return 0 if there is no intersection
    if (intersectionX2 < intersectionX1 || intersectionY2 < intersectionY1) {
        return 0;
    }
    
    return (intersectionX2 - intersectionX1) * (intersectionY2 - intersectionY1);
}

function calculateUnion(
    boxA: [number, number, number, number],
    boxB: [number, number, number, number],
    intersection: number
): number {
    const [aX1, aY1, aX2, aY2] = boxA;
    const [bX1, bY1, bX2, bY2] = boxB;
    
    const areaA = (aX2 - aX1) * (aY2 - aY1);
    const areaB = (bX2 - bX1) * (bY2 - bY1);
    
    return areaA + areaB - intersection;
}

// Process YOLOv5 output to get boxes, scores, and class IDs
function processOutput(
    output: Uint16Array,  // 修改为 Uint16Array
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
    
    // 将 Uint16Array (float16) 转换为 Float32Array
    const outputFloat32 = float16ArrayToFloat32Array(output);
    
    // Get dimensions from the output tensor
    // YOLOv5 output format: [batch, num_detections, 85] where 85 = 4 (bbox) + 1 (confidence) + 80 (class scores)
    const numDetections = outputFloat32.length / 85; // For COCO dataset with 80 classes
    
    for (let i = 0; i < numDetections; i++) {
        const offset = i * 85;
        
        // Get confidence score
        const confidence = outputFloat32[offset + 4];
        
        // Skip low confidence detections
        if (confidence < CONFIDENCE_THRESHOLD) continue;
        
        // Find class with highest score
        let maxClassScore = 0;
        let maxClassId = 0;
        
        for (let c = 0; c < 80; c++) {
            const classScore = outputFloat32[offset + 5 + c];
            if (classScore > maxClassScore) {
                maxClassScore = classScore;
                maxClassId = c;
            }
        }
        
        // Calculate final score
        const score = confidence * maxClassScore;
        
        // Skip low scoring detections
        if (score < SCORE_THRESHOLD) continue;
        
        // Get box coordinates
        // YOLOv5 outputs center_x, center_y, width, height (normalized to 0-1)
        let rawX = outputFloat32[offset];
        let rawY = outputFloat32[offset + 1];
        let rawWidth = outputFloat32[offset + 2];
        let rawHeight = outputFloat32[offset + 3];
        
        // Convert to corner coordinates (x1, y1, x2, y2) in original image space
        const x1 = (rawX - rawWidth / 2) * resizeRatio.x;
        const y1 = (rawY - rawHeight / 2) * resizeRatio.y;
        const x2 = (rawX + rawWidth / 2) * resizeRatio.x;
        const y2 = (rawY + rawHeight / 2) * resizeRatio.y;
        
        // Add to result arrays
        boxes.push([x1, y1, x2, y2]);
        scores.push(score);
        classIds.push(maxClassId);
    }
    
    return { boxes, scores, classIds };
}

async function drawDetectionsOnImage(
    imagePath: string,
    boxes: Array<[number, number, number, number]>,
    scores: number[],
    classIds: number[],
    indices: number[]
): Promise<void> {
    // Load the original image
    const image = await Jimp.read(imagePath);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    
    // Draw each detected object
    for (const idx of indices) {
        const [x1, y1, x2, y2] = boxes[idx];
        const classId = classIds[idx];
        const score = scores[idx];
        const className = CLASS_NAMES[classId];
        const label = `${className}: ${score.toFixed(2)}`;
        
        // Ensure coordinates are integers
        const ix1 = Math.max(0, Math.floor(x1));
        const iy1 = Math.max(0, Math.floor(y1));
        const ix2 = Math.min(image.bitmap.width - 1, Math.floor(x2));
        const iy2 = Math.min(image.bitmap.height - 1, Math.floor(y2));
        
        // Draw bounding box
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
        
        // Print label
        image.print(font, ix1, Math.max(0, iy1 - 16), label);
    }
    
    // Save the result
    const baseName = path.basename(imagePath, path.extname(imagePath));
    const outputPath = path.join(TEST_ASSETS.imageDir, `${baseName}_yolov5_detect.png`);
    await image.writeAsync(outputPath);
    console.log(`Detection result saved to: ${outputPath}`);
}

// Main test function
async function runTests() {
    console.log('Starting YOLOv5 ONNX Runtime inference tests');
    
    // Test 1: Model file should exist
    assert.strictEqual(fs.existsSync(TEST_ASSETS.yolov5Path), true, 'YOLOv5 model does not exist');
    console.log('✓ Model file exists');
    
    console.log('\n=== Testing with DML (GPU) execution provider if available ===');
    await runInferenceTest('1746128839460.jpg', true);
    
    console.log('\nYOLOv5 inference tests completed successfully');
}

// YOLOv5 inference test function
async function runInferenceTest(testImageName: string, useDml: boolean = hasGpu) {
    // Test 2: Should load YOLOv5 model
    const yoloSession = await loadOnnxModel(TEST_ASSETS.yolov5Path, useDml);
    
    assert.ok(yoloSession.inputNames.length > 0, 'YOLOv5 model should have inputs');
    assert.ok(yoloSession.outputNames.length > 0, 'YOLOv5 model should have outputs');
    console.log('✓ YOLOv5 model loaded successfully');
    
    // Test 3: Should run inference with YOLOv5 model
    const imagePath = path.join(TEST_ASSETS.imageDir, testImageName);
    assert.ok(fs.existsSync(imagePath), `Test image not found at path: ${imagePath}`);
    
    try {
        // Preprocess image
        console.time('Image preprocessing');
        const { imageData, originalWidth, originalHeight, resizeRatio } = await preprocessImage(imagePath);
        console.timeEnd('Image preprocessing');
        
        // Run inference
        console.time('YOLOv5 inference');
        const feeds: Record<string, ort.Tensor> = {};
        feeds[yoloSession.inputNames[0]] = new ort.Tensor('float16', imageData, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);
        
        const results = await yoloSession.run(feeds);
        console.timeEnd('YOLOv5 inference');
        
        // Get output
        const output = results[yoloSession.outputNames[0]];
        assert.ok(output, 'Inference should return results');
        
        // Process detections
        console.time('Post-processing');
        const outputData = output.data as Uint16Array;  // 修改为 Uint16Array
        const { boxes, scores, classIds } = processOutput(outputData, originalWidth, originalHeight, resizeRatio);
        
        // Apply NMS to filter overlapping boxes
        const selectedIndices = nonMaxSuppression(boxes, scores, NMS_THRESHOLD);
        console.log(`Found ${selectedIndices.length} objects after NMS filtering`);
        
        // Draw detections on the image
        await drawDetectionsOnImage(imagePath, boxes, scores, classIds, selectedIndices);
        
        // Print detected objects
        for (const idx of selectedIndices) {
            const classId = classIds[idx];
            const className = CLASS_NAMES[classId];
            const score = scores[idx];
            console.log(`Detected ${className} with confidence ${score.toFixed(3)}`);
        }
        
        console.timeEnd('Post-processing');
        console.log('✓ YOLOv5 inference completed successfully');
    } catch (error) {
        console.error('YOLOv5 model inference failed:', error);
        throw error;
    }
}

// Run the tests
runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
}); 