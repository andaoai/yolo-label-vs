import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as ort from 'onnxruntime-node';

const Jimp = require('jimp');


// 定义常量和工具函数
const TEST_ASSETS = {
    modelDir: path.join(__dirname, '..', '..', 'test_label', 'model'),
    imageDir: path.join(__dirname, '..', '..', 'test_label', 'train_box', 'train', 'images'),
    get encoderPath() { return path.join(this.modelDir, 'vit_b.onnx'); },
    get decoderPath() { return path.join(this.modelDir, 'sam_vit_b.onnx'); }
};

async function loadOnnxModel(modelPath: string): Promise<ort.InferenceSession> {
    if (!fs.existsSync(modelPath)) {
        throw new Error(`Model not found at: ${modelPath}`);
    }
    const session = await ort.InferenceSession.create(modelPath);
    return session;
}

async function preprocessImage(imagePath: string): Promise<{
    imageData: Float32Array,
    originalWidth: number,
    originalHeight: number
}> {
    const image = await Jimp.read(imagePath);
    const originalWidth = image.bitmap.width;
    const originalHeight = image.bitmap.height;
    
    // SAM model specific mean and std values
    const mean = [123.675, 116.28, 103.53];
    const std = [58.395, 57.12, 57.375];
    
    // First pad the image to square
    const size = Math.max(originalHeight, originalWidth);
    const paddedImage = new Jimp(size, size);
    paddedImage.composite(image, 0, 0);
    
    // Then resize to 1024x1024
    const resized = paddedImage.resize(1024, 1024);
    
    // Create buffer for the standardized image data [1, 3, 1024, 1024]
    const imageData = new Float32Array(3 * 1024 * 1024);
    
    // Process the image data with correct standardization
    for (let y = 0; y < 1024; y++) {
        for (let x = 0; x < 1024; x++) {
            const color = Jimp.intToRGBA(resized.getPixelColor(x, y));
            
            // Store in CHW format (transpose while storing)
            // For each pixel, we store its RGB values in channel-first format
            const r = (color.r - mean[0]) / std[0];
            const g = (color.g - mean[1]) / std[1];
            const b = (color.b - mean[2]) / std[2];
            
            // Store in CHW format
            imageData[0 * 1024 * 1024 + y * 1024 + x] = r;
            imageData[1 * 1024 * 1024 + y * 1024 + x] = g;
            imageData[2 * 1024 * 1024 + y * 1024 + x] = b;
        }
    }
    
    return { imageData, originalWidth, originalHeight };
}

async function saveMask(maskData: Float32Array, dims: readonly number[], maskIndex: number, baseName: string) {
    const [_, __, height, width] = dims;
    const rgba = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const maskOffset = maskIndex * width * height;
            const pixelIndex = y * width + x;
            const sourceIndex = maskOffset + pixelIndex;
            const rgbaIndex = pixelIndex * 4;
            
            const alpha = maskData[sourceIndex] > 0 ? 255 : 0;
            rgba[rgbaIndex + 0] = 255;  // R
            rgba[rgbaIndex + 1] = 0;    // G
            rgba[rgbaIndex + 2] = 0;    // B
            rgba[rgbaIndex + 3] = alpha;// A
        }
    }
    
    const maskOutPath = path.join(TEST_ASSETS.imageDir, `${baseName}_mask_${maskIndex}.png`);
    const maskImage = await Jimp.read({ data: rgba, width, height });
    await maskImage.writeAsync(maskOutPath);
}

async function saveHighlightedImage(originalImage: typeof Jimp.prototype, maskData: Float32Array, dims: readonly number[], maskIndex: number, baseName: string) {
    const [_, __, height, width] = dims;
    
    // 创建一个新的图像副本
    const highlightedImage = originalImage.clone();
    
    // 遍历每个像素
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const maskOffset = maskIndex * width * height;
            const pixelIndex = y * width + x;
            const sourceIndex = maskOffset + pixelIndex;
            
            // 如果在mask区域外，将像素变暗
            if (maskData[sourceIndex] <= 0) {
                const color = Jimp.intToRGBA(highlightedImage.getPixelColor(x, y));
                // 将背景区域的像素变暗（减少70%亮度）
                color.r = Math.floor(color.r * 0.3);
                color.g = Math.floor(color.g * 0.3);
                color.b = Math.floor(color.b * 0.3);
                highlightedImage.setPixelColor(
                    Jimp.rgbaToInt(color.r, color.g, color.b, color.a),
                    x,
                    y
                );
            }
        }
    }
    
    const highlightOutPath = path.join(TEST_ASSETS.imageDir, `${baseName}_highlighted_${maskIndex}.png`);
    await highlightedImage.writeAsync(highlightOutPath);
}

// 使用VSCode测试框架的suite和test语法
suite('ONNX Model Inference Test', () => {
    test('Model files should exist', () => {
        assert.strictEqual(fs.existsSync(TEST_ASSETS.encoderPath), true, '编码器模型不存在');
        assert.strictEqual(fs.existsSync(TEST_ASSETS.decoderPath), true, '解码器模型不存在');
    });

    test('Should load encoder and decoder models', async () => {
        const encoderSession = await loadOnnxModel(TEST_ASSETS.encoderPath);
        const decoderSession = await loadOnnxModel(TEST_ASSETS.decoderPath);
        
        assert.ok(encoderSession.inputNames.length > 0, '编码器应该有输入');
        assert.ok(encoderSession.outputNames.length > 0, '编码器应该有输出');
        assert.ok(decoderSession.inputNames.length > 0, '解码器应该有输入');
        assert.ok(decoderSession.outputNames.length > 0, '解码器应该有输出');
    });

    test('Should run inference with SAM model', async function() {
        this.timeout(30000);
        const testImage = '1746149830354.jpg';
        const imagePath = path.join(TEST_ASSETS.imageDir, testImage);
        assert.ok(fs.existsSync(imagePath), `Test image not found at path: ${imagePath}`);
        
        try {
            // 预处理图像
            const { imageData, originalHeight, originalWidth } = await preprocessImage(imagePath);
            
            // 保存原始图像实例以供后续使用
            const originalImage = await Jimp.read(imagePath);
            
            // 运行编码器
            const encoderSession = await loadOnnxModel(TEST_ASSETS.encoderPath);
            const encoderResults = await encoderSession.run({
                'input_image': new ort.Tensor('float32', imageData, [1, 3, 1024, 1024])
            });
            
            // 运行解码器
            const decoderSession = await loadOnnxModel(TEST_ASSETS.decoderPath);
            const decoderFeeds = {
                'image_embeddings': encoderResults['image_embeddings'],
                'point_coords': new ort.Tensor('float32', new Float32Array([originalWidth / 2, originalHeight / 2]), [1, 1, 2]),
                'point_labels': new ort.Tensor('float32', new Float32Array([1]), [1, 1]),
                'mask_input': new ort.Tensor('float32', new Float32Array(256 * 256).fill(0), [1, 1, 256, 256]),
                'has_mask_input': new ort.Tensor('float32', new Float32Array([0]), [1]),
                'orig_im_size': new ort.Tensor('float32', new Float32Array([originalHeight, originalWidth]), [2]),
                'multimask_output': new ort.Tensor('bool', new Uint8Array([0]), [1])  // false = 只返回一个mask
            };
            
            const results = await decoderSession.run(decoderFeeds);
            assert.ok(results, '推理应返回结果');
            
            // 保存 masks 和高亮图像
            const maskInfo = results['masks'];
            const maskData = maskInfo.data as Float32Array;
            
            await saveMask(maskData, maskInfo.dims, 0, testImage.replace('.png', ''));
            await saveHighlightedImage(originalImage, maskData, maskInfo.dims, 0, testImage.replace('.png', ''));
        } catch (error) {
            console.error('SAM模型推理失败:', error);
            throw error;
        }
    });
}); 