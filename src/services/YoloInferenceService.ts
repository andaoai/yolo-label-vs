import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ort from 'onnxruntime-node';
import { BoundingBox } from '../model/types';
import { ErrorHandler, ErrorType } from '../ErrorHandler';

const Jimp = require('jimp');

/**
 * YOLOv5 Inference configuration
 */
export interface YoloInferenceConfig {
    modelPath: string;      // ONNX model path
    inputWidth: number;     // Input width for the model (typically 640)
    inputHeight: number;    // Input height for the model (typically 640)
    scoreThreshold: number; // Score threshold for detections
    nmsThreshold: number;   // NMS threshold for filtering overlapping boxes
    confidenceThreshold: number; // Confidence threshold for box confidence
    classNames: string[];   // Class names for the model
}

/**
 * YOLOv5 Inference Service
 * Handles inference using ONNX Runtime
 */
export class YoloInferenceService {
    private readonly DEFAULT_CONFIG: YoloInferenceConfig = {
        modelPath: '',
        inputWidth: 640,
        inputHeight: 640,
        scoreThreshold: 0.45,
        nmsThreshold: 0.45, 
        confidenceThreshold: 0.45,
        classNames: []
    };

    private config: YoloInferenceConfig;
    private session: ort.InferenceSession | null = null;
    private isInitialized = false;
    private lastError: string | null = null;

    constructor(config?: Partial<YoloInferenceConfig>) {
        this.config = { ...this.DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialize the inference service with a new configuration
     */
    public async initialize(config?: Partial<YoloInferenceConfig>): Promise<boolean> {
        try {
            // Update config if provided
            if (config) {
                this.config = { ...this.config, ...config };
            }

            // Validate configuration
            this.validateConfig();

            // Load the model
            await this.loadModel();
            
            this.isInitialized = true;
            this.lastError = null;
            return true;
        } catch (error: any) {
            this.isInitialized = false;
            this.lastError = error.message;
            console.error('Failed to initialize YOLOv5 inference service:', error);
            return false;
        }
    }

    /**
     * Get the current configuration
     */
    public getConfig(): YoloInferenceConfig {
        return { ...this.config };
    }

    /**
     * Update the configuration
     */
    public async updateConfig(config: Partial<YoloInferenceConfig>): Promise<boolean> {
        // Save the current config in case we need to rollback
        const prevConfig = { ...this.config };
        
        try {
            return await this.initialize(config);
        } catch (error) {
            // Rollback to previous config
            this.config = prevConfig;
            throw error;
        }
    }

    /**
     * Check if the service is initialized
     */
    public isReady(): boolean {
        return this.isInitialized && this.session !== null;
    }

    /**
     * Get the last error message
     */
    public getLastError(): string | null {
        return this.lastError;
    }

    /**
     * Run inference on an image
     * @param imagePath Path to the image file
     * @returns Array of BoundingBox objects
     */
    public async runInference(imagePath: string): Promise<BoundingBox[]> {
        if (!this.isReady()) {
            throw new Error('YOLOv5 inference service is not initialized');
        }

        try {
            // 1. Preprocess the image
            const { imageData, originalWidth, originalHeight, resizeRatio } = 
                await this.preprocessImage(imagePath);
            
            // 2. Run inference
            const feeds: Record<string, ort.Tensor> = {};
            if (!this.session) {
                throw new Error('ONNX session is not initialized');
            }
            
            feeds[this.session.inputNames[0]] = new ort.Tensor(
                'float16', 
                imageData, 
                [1, 3, this.config.inputHeight, this.config.inputWidth]
            );
            
            const results = await this.session.run(feeds);
            
            // 3. Process detections
            const outputData = results[this.session.outputNames[0]].data as Uint16Array;
            const { boxes, scores, classIds } = this.processOutput(
                outputData, 
                originalWidth, 
                originalHeight, 
                resizeRatio
            );
            
            // 4. Apply NMS
            const selectedIndices = this.nonMaxSuppression(boxes, scores, this.config.nmsThreshold);
            
            // 5. Convert to BoundingBox format
            const detections: BoundingBox[] = [];
            for (const idx of selectedIndices) {
                const [x1, y1, x2, y2] = boxes[idx];
                const classId = classIds[idx];
                
                // Convert to YOLO format (center_x, center_y, width, height - normalized)
                const centerX = (x1 + x2) / 2 / originalWidth;  // 归一化到 0-1 范围
                const centerY = (y1 + y2) / 2 / originalHeight; // 归一化到 0-1 范围
                const width = (x2 - x1) / originalWidth;        // 归一化到 0-1 范围
                const height = (y2 - y1) / originalHeight;      // 归一化到 0-1 范围
                
                console.log(`Detection: class=${classId}, centerX=${centerX}, centerY=${centerY}, width=${width}, height=${height}`);
                
                detections.push({
                    class: classId,
                    x: centerX,
                    y: centerY,
                    width: width,
                    height: height,
                    visible: true
                });
            }
            
            return detections;
        } catch (error: any) {
            this.lastError = error.message;
            console.error('YOLOv5 inference failed:', error);
            throw new Error(`Inference failed: ${error.message}`);
        }
    }

    /**
     * Validate the configuration
     */
    private validateConfig(): void {
        if (!this.config.modelPath) {
            throw new Error('Model path is required');
        }

        if (!fs.existsSync(this.config.modelPath)) {
            throw new Error(`Model not found at: ${this.config.modelPath}`);
        }

        if (this.config.classNames.length === 0) {
            throw new Error('Class names are required');
        }
    }

    /**
     * Load the ONNX model
     */
    private async loadModel(): Promise<void> {
        // Check if GPU acceleration is available
        const supportedBackends = ort.listSupportedBackends();
        const hasGpu = supportedBackends.some(b => 
            b.name.toLowerCase().includes('gpu') || 
            b.name.toLowerCase().includes('cuda') || 
            b.name.toLowerCase().includes('dml'));
        
        const options: ort.InferenceSession.SessionOptions = {
            graphOptimizationLevel: 'all' as any,
            enableCpuMemArena: true,
            executionMode: 'sequential' as any,
            executionProviders: hasGpu ? ['dml', 'cpu'] : ['cpu']
        };

        this.session = await ort.InferenceSession.create(this.config.modelPath, options);
    }

    /**
     * Preprocess image for YOLOv5 inference
     */
    private async preprocessImage(imagePath: string): Promise<{
        imageData: Uint16Array,
        originalWidth: number,
        originalHeight: number,
        resizeRatio: { x: number, y: number }
    }> {
        const image = await Jimp.read(imagePath);
        const originalWidth = image.bitmap.width;
        const originalHeight = image.bitmap.height;
        
        const resizeRatio = {
            x: originalWidth / this.config.inputWidth,
            y: originalHeight / this.config.inputHeight
        };
        
        const resized = image.resize(this.config.inputWidth, this.config.inputHeight);
        const float32Data = new Float32Array(3 * this.config.inputWidth * this.config.inputHeight);
        
        for (let y = 0; y < this.config.inputHeight; y++) {
            for (let x = 0; x < this.config.inputWidth; x++) {
                const color = Jimp.intToRGBA(resized.getPixelColor(x, y));
                
                // Normalize and store in CHW format
                const r = color.r / 255.0;
                const g = color.g / 255.0;
                const b = color.b / 255.0;
                
                float32Data[0 * this.config.inputHeight * this.config.inputWidth + y * this.config.inputWidth + x] = r;
                float32Data[1 * this.config.inputHeight * this.config.inputWidth + y * this.config.inputWidth + x] = g;
                float32Data[2 * this.config.inputHeight * this.config.inputWidth + y * this.config.inputWidth + x] = b;
            }
        }
        
        // Convert to float16
        const imageData = this.float32ArrayToFloat16Array(float32Data);
        
        return { imageData, originalWidth, originalHeight, resizeRatio };
    }

    /**
     * Process YOLOv5 output
     */
    private processOutput(
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
        
        // Convert to float32
        const outputFloat32 = this.float16ArrayToFloat32Array(output);
        
        // YOLOv5 output format: [batch, num_detections, 85]
        const numDetections = outputFloat32.length / 85;
        
        for (let i = 0; i < numDetections; i++) {
            const offset = i * 85;
            
            // Get confidence
            const confidence = outputFloat32[offset + 4];
            
            if (confidence < this.config.confidenceThreshold) continue;
            
            // Find the class with the highest score
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
            
            if (score < this.config.scoreThreshold) continue;
            
            // Get bounding box coordinates (center_x, center_y, width, height)
            let rawX = outputFloat32[offset];
            let rawY = outputFloat32[offset + 1];
            let rawWidth = outputFloat32[offset + 2];
            let rawHeight = outputFloat32[offset + 3];
            
            // Convert to top-left, bottom-right coordinates (x1, y1, x2, y2)
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

    /**
     * Calculate IoU between two boxes
     */
    private calculateIoU(boxA: [number, number, number, number], boxB: [number, number, number, number]): number {
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

    /**
     * Apply non-max suppression to remove overlapping boxes
     */
    private nonMaxSuppression(
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
                const iou = this.calculateIoU(currentBox, compareBox);
                
                if (iou > iouThreshold) {
                    picked[compareIndex] = true;
                }
            }
        }
        
        return selectedIndices;
    }

    /**
     * Convert a float32 value to float16
     */
    private float32ToFloat16(float32: number): number {
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

    /**
     * Convert a float16 value to float32
     */
    private float16ToFloat32(float16: number): number {
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

    /**
     * Convert a float32 array to float16 array
     */
    private float32ArrayToFloat16Array(float32Array: Float32Array): Uint16Array {
        const float16Array = new Uint16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            float16Array[i] = this.float32ToFloat16(float32Array[i]);
        }
        return float16Array;
    }

    /**
     * Convert a float16 array to float32 array
     */
    private float16ArrayToFloat32Array(float16Array: Uint16Array): Float32Array {
        const float32Array = new Float32Array(float16Array.length);
        for (let i = 0; i < float16Array.length; i++) {
            float32Array[i] = this.float16ToFloat32(float16Array[i]);
        }
        return float32Array;
    }
} 