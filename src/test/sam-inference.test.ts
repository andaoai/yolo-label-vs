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
    get encoderPath() { return path.join(this.modelDir, 'vit_b.onnx'); },
    get decoderPath() { return path.join(this.modelDir, 'sam_vit_b.onnx'); }
};

async function loadOnnxModel(modelPath: string, useDml: boolean = hasGpu): Promise<ort.InferenceSession> {
    if (!fs.existsSync(modelPath)) {
        throw new Error(`Model not found at: ${modelPath}`);
    }
    
    // Create session with specified execution providers
    // Try to use optimized options to accelerate inference
    const options: ort.InferenceSession.SessionOptions = {
        // Try to configure optimization level
        graphOptimizationLevel: 'all' as any,  // Cast to any to avoid type errors
        enableCpuMemArena: true,
        executionMode: 'sequential' as any,    // Cast to any to avoid type errors
        executionProviders: useDml ? ['dml', 'cpu'] : ['cpu']  // DML can only be used with CPU
    };

    // Print model loading start info
    console.log(`Loading model ${path.basename(modelPath)}...`);
    console.log(`Using execution providers: ${options.executionProviders?.join(', ') || 'default'}`);
    console.time('Model loading time');
    const session = await ort.InferenceSession.create(modelPath, options);
    console.timeEnd('Model loading time');
    
    // Print model info
    console.log(`Model ${path.basename(modelPath)} loaded successfully`);
    console.log('- Input names:', session.inputNames);
    console.log('- Output names:', session.outputNames);
    
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

// Main test function
async function runTests() {
    console.log('Starting ONNX Runtime inference tests');
    
    // Test 1: Model files should exist
    assert.strictEqual(fs.existsSync(TEST_ASSETS.encoderPath), true, 'Encoder model does not exist');
    assert.strictEqual(fs.existsSync(TEST_ASSETS.decoderPath), true, 'Decoder model does not exist');
    console.log('✓ Model files exist');
    
    // Test different execution providers
    // console.log('\n=== Testing with CPU-only execution provider ===');
    // await runInferenceTest('1746149830354.jpg', false);
    
    console.log('\n=== Testing with DML (GPU) execution provider ===');
    await runInferenceTest('1746149830354.jpg', true);
    
    console.log('\nInference tests completed successfully');
}

// Separate inference test function to allow comparing different execution providers
async function runInferenceTest(testImageName: string, useDml: boolean = hasGpu) {
    // Test 2: Should load encoder and decoder models
    const encoderSession = await loadOnnxModel(TEST_ASSETS.encoderPath, useDml);
    const decoderSession = await loadOnnxModel(TEST_ASSETS.decoderPath, useDml);
    
    assert.ok(encoderSession.inputNames.length > 0, 'Encoder should have inputs');
    assert.ok(encoderSession.outputNames.length > 0, 'Encoder should have outputs');
    assert.ok(decoderSession.inputNames.length > 0, 'Decoder should have inputs');
    assert.ok(decoderSession.outputNames.length > 0, 'Decoder should have outputs');
    console.log('✓ Models loaded successfully');
    
    // Test 3: Should run inference with SAM model
    const testImage = testImageName;
    const imagePath = path.join(TEST_ASSETS.imageDir, testImage);
    assert.ok(fs.existsSync(imagePath), `Test image not found at path: ${imagePath}`);
    
    try {
        // Preprocess image
        console.time('Image preprocessing');
        const { imageData, originalHeight, originalWidth } = await preprocessImage(imagePath);
        console.timeEnd('Image preprocessing');
        
        // Save original image instance for later use
        const originalImage = await Jimp.read(imagePath);
        
        // Run encoder
        console.time('Encoder inference');
        const encoderResults = await encoderSession.run({
            'input_image': new ort.Tensor('float32', imageData, [1, 3, 1024, 1024])
        });
        console.timeEnd('Encoder inference');
        
        // Run decoder
        console.time('Decoder inference');
        const decoderFeeds = {
            'image_embeddings': encoderResults['image_embeddings'],
            'point_coords': new ort.Tensor('float32', new Float32Array([
                Math.floor(Math.random() * originalWidth),
                Math.floor(Math.random() * originalHeight)
            ]), [1, 1, 2]),
            'point_labels': new ort.Tensor('float32', new Float32Array([1]), [1, 1]),
            'mask_input': new ort.Tensor('float32', new Float32Array(256 * 256).fill(0), [1, 1, 256, 256]),
            'has_mask_input': new ort.Tensor('float32', new Float32Array([0]), [1]),
            'orig_im_size': new ort.Tensor('float32', new Float32Array([originalHeight, originalWidth]), [2]),
            'multimask_output': new ort.Tensor('bool', new Uint8Array([0]), [1])  // false = only return one mask
        };
        
        const results = await decoderSession.run(decoderFeeds);
        console.timeEnd('Decoder inference');
        assert.ok(results, 'Inference should return results');
        
        // Save masks and highlighted images
        console.time('Post-processing');
        const maskInfo = results['masks'];
        const maskData = maskInfo.data as Float32Array;
        
        await saveMask(maskData, maskInfo.dims, 0, testImage.replace('.png', ''));
        await saveHighlightedImage(originalImage, maskData, maskInfo.dims, 0, testImage.replace('.png', ''));
        console.timeEnd('Post-processing');
        console.log('✓ SAM inference completed successfully');
    } catch (error) {
        console.error('SAM model inference failed:', error);
        throw error;
    }
}

// Run the tests
runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
}); 