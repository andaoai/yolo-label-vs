import * as fs from 'fs';
import * as path from 'path';
import * as ort from 'onnxruntime-node';
import { listSupportedBackends } from 'onnxruntime-node';
import * as vscode from 'vscode';
import Jimp from 'jimp';
import { BoundingBox } from '../model/types';

// 检查 GPU 加速是否可用
const supportedBackends = listSupportedBackends();
const hasGpu = supportedBackends.some(b => 
    b.name.toLowerCase().includes('gpu') || 
    b.name.toLowerCase().includes('cuda') || 
    b.name.toLowerCase().includes('dml'));

/**
 * AI 推理服务类
 * 用于 YOLOv5 模型的加载和推理
 */
export class AiInferenceService {
    private _session: ort.InferenceSession | null = null;
    private _modelPath: string = '';
    private _classNames: string[] = [];
    private _scoreThreshold: number = 0.45;
    private _nmsThreshold: number = 0.45;
    private _confidenceThreshold: number = 0.45;

    // 常量
    private readonly _INPUT_WIDTH = 640;
    private readonly _INPUT_HEIGHT = 640;

    /**
     * 构造函数
     */
    constructor() {}

    /**
     * 设置模型配置
     * @param modelPath ONNX 模型路径
     * @param classNames 类别名称
     * @param scoreThreshold 分数阈值
     * @param nmsThreshold NMS阈值
     * @param confidenceThreshold 置信度阈值
     */
    public async configure(
        modelPath: string, 
        classNames: string[], 
        scoreThreshold?: number, 
        nmsThreshold?: number, 
        confidenceThreshold?: number
    ): Promise<boolean> {
        try {
            if (!fs.existsSync(modelPath)) {
                throw new Error(`Model not found at: ${modelPath}`);
            }

            this._modelPath = modelPath;
            this._classNames = classNames;
            
            if (scoreThreshold !== undefined) this._scoreThreshold = scoreThreshold;
            if (nmsThreshold !== undefined) this._nmsThreshold = nmsThreshold;
            if (confidenceThreshold !== undefined) this._confidenceThreshold = confidenceThreshold;

            // 加载模型
            await this._loadModel();
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage(`AI模型配置失败: ${error.message}`);
            console.error('AI模型配置失败:', error);
            return false;
        }
    }

    /**
     * 加载ONNX模型
     */
    private async _loadModel(): Promise<void> {
        const options: ort.InferenceSession.SessionOptions = {
            graphOptimizationLevel: 'all' as any,
            enableCpuMemArena: true,
            executionMode: 'sequential' as any,
            executionProviders: hasGpu ? ['dml', 'cpu'] : ['cpu']
        };
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `加载AI模型: ${path.basename(this._modelPath)}`,
            cancellable: false
        }, async () => {
            try {
                // 释放先前的模型资源
                if (this._session) {
                    // TODO: Check if there's a proper way to dispose the session
                    this._session = null;
                }
                
                // 创建新的会话
                this._session = await ort.InferenceSession.create(this._modelPath, options);
                vscode.window.showInformationMessage(`AI模型加载成功: ${path.basename(this._modelPath)}`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`AI模型加载失败: ${error.message}`);
                console.error('AI模型加载失败:', error);
                throw error;
            }
        });
    }

    /**
     * 在图像上运行推理
     * @param imagePath 图像路径
     * @returns 检测到的对象（边界框）
     */
    public async runInference(imagePath: string): Promise<BoundingBox[]> {
        if (!this._session) {
            throw new Error('模型未加载，请先配置AI模型');
        }

        try {
            // 预处理图像
            const { imageData, originalWidth, originalHeight, resizeRatio } = await this._preprocessImage(imagePath);
            
            // 准备输入
            const feeds: Record<string, ort.Tensor> = {};
            feeds[this._session.inputNames[0]] = new ort.Tensor('float16', imageData, [1, 3, this._INPUT_HEIGHT, this._INPUT_WIDTH]);
            
            // 运行推理
            const results = await this._session.run(feeds);
            
            // 处理输出
            const outputData = results[this._session.outputNames[0]].data as Uint16Array;
            const { boxes, scores, classIds } = this._processOutput(outputData, originalWidth, originalHeight, resizeRatio);
            
            // 应用非极大值抑制
            const selectedIndices = this._nonMaxSuppression(boxes, scores, this._nmsThreshold);
            
            // 转换为BoundingBox格式
            const detections: BoundingBox[] = selectedIndices.map(idx => {
                const [x1, y1, x2, y2] = boxes[idx];
                const width = x2 - x1;
                const height = y2 - y1;
                
                return {
                    class: classIds[idx],
                    x: x1 / originalWidth,  // 转为相对坐标 (0-1)
                    y: y1 / originalHeight, // 转为相对坐标 (0-1)
                    width: width / originalWidth, // 转为相对宽度 (0-1)
                    height: height / originalHeight, // 转为相对高度 (0-1)
                    visible: true
                };
            });
            
            return detections;
        } catch (error: any) {
            vscode.window.showErrorMessage(`AI推理失败: ${error.message}`);
            console.error('AI推理失败:', error);
            throw error;
        }
    }

    /**
     * 预处理图像
     */
    private async _preprocessImage(imagePath: string): Promise<{
        imageData: Uint16Array,
        originalWidth: number,
        originalHeight: number,
        resizeRatio: { x: number, y: number }
    }> {
        const image = await Jimp.read(imagePath);
        const originalWidth = image.bitmap.width;
        const originalHeight = image.bitmap.height;
        
        const resizeRatio = {
            x: originalWidth / this._INPUT_WIDTH,
            y: originalHeight / this._INPUT_HEIGHT
        };
        
        const resized = image.resize(this._INPUT_WIDTH, this._INPUT_HEIGHT);
        const float32Data = new Float32Array(3 * this._INPUT_WIDTH * this._INPUT_HEIGHT);
        
        for (let y = 0; y < this._INPUT_HEIGHT; y++) {
            for (let x = 0; x < this._INPUT_WIDTH; x++) {
                const color = Jimp.intToRGBA(resized.getPixelColor(x, y));
                
                // 归一化并存储为 CHW 格式
                const r = color.r / 255.0;
                const g = color.g / 255.0;
                const b = color.b / 255.0;
                
                float32Data[0 * this._INPUT_HEIGHT * this._INPUT_WIDTH + y * this._INPUT_WIDTH + x] = r;
                float32Data[1 * this._INPUT_HEIGHT * this._INPUT_WIDTH + y * this._INPUT_WIDTH + x] = g;
                float32Data[2 * this._INPUT_HEIGHT * this._INPUT_WIDTH + y * this._INPUT_WIDTH + x] = b;
            }
        }
        
        // 转换为 float16 格式
        const imageData = this._float32ArrayToFloat16Array(float32Data);
        
        return { imageData, originalWidth, originalHeight, resizeRatio };
    }

    /**
     * 处理YOLOv5输出
     */
    private _processOutput(
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
        const outputFloat32 = this._float16ArrayToFloat32Array(output);
        
        // YOLOv5 输出格式: [batch, num_detections, 85]
        const numDetections = outputFloat32.length / 85;
        
        for (let i = 0; i < numDetections; i++) {
            const offset = i * 85;
            
            // 获取置信度
            const confidence = outputFloat32[offset + 4];
            
            if (confidence < this._confidenceThreshold) continue;
            
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
            
            if (score < this._scoreThreshold) continue;
            
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

    /**
     * 非极大值抑制
     */
    private _nonMaxSuppression(
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
                const iou = this._calculateIoU(currentBox, compareBox);
                
                if (iou > iouThreshold) {
                    picked[compareIndex] = true;
                }
            }
        }
        
        return selectedIndices;
    }

    /**
     * 计算IoU
     */
    private _calculateIoU(boxA: [number, number, number, number], boxB: [number, number, number, number]): number {
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
     * Float16/Float32 转换函数
     */
    private _float32ToFloat16(float32: number): number {
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
    
    private _float16ToFloat32(float16: number): number {
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
    
    private _float32ArrayToFloat16Array(float32Array: Float32Array): Uint16Array {
        const float16Array = new Uint16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            float16Array[i] = this._float32ToFloat16(float32Array[i]);
        }
        return float16Array;
    }
    
    private _float16ArrayToFloat32Array(float16Array: Uint16Array): Float32Array {
        const float32Array = new Float32Array(float16Array.length);
        for (let i = 0; i < float16Array.length; i++) {
            float32Array[i] = this._float16ToFloat32(float16Array[i]);
        }
        return float32Array;
    }
} 