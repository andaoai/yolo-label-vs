import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as ort from 'onnxruntime-node';

// Import Jimp using require with type casting
const Jimp = require('jimp') as any;

// 使用VSCode测试框架的suite和test语法
suite('ONNX Model Inference Test', () => {
    // 定义模型文件路径
    const encoderPath = path.join(__dirname, '..', '..', 'test_label', 'model', 'vit_b.onnx');
    const decoderPath = path.join(__dirname, '..', '..', 'test_label', 'model', 'sam_vit_b.onnx');

    test('Model files should exist', () => {
        // 验证模型文件存在
        assert.strictEqual(fs.existsSync(encoderPath), true, `编码器模型不存在: ${encoderPath}`);
        assert.strictEqual(fs.existsSync(decoderPath), true, `解码器模型不存在: ${decoderPath}`);
    });

    test('Should load encoder model', async () => {
        try {
            // 尝试创建编码器会话对象
            const session = await ort.InferenceSession.create(encoderPath);
            
            // 验证会话创建成功
            assert.ok(session, '编码器会话创建失败');
            
            // 获取并检查模型的输入
            const inputNames = session.inputNames;
            console.log('编码器输入名称:', inputNames);
            assert.ok(inputNames.length > 0, '编码器应该有输入');

            // 获取并检查模型的输出
            const outputNames = session.outputNames;
            console.log('编码器输出名称:', outputNames);
            assert.ok(outputNames.length > 0, '编码器应该有输出');
            
            // 尝试获取输入信息
            try {
                for (const name of inputNames) {
                    const metadata = (session as any).inputMetadata;
                    if (metadata && metadata[name]) {
                        console.log(`编码器输入 ${name}:`, metadata[name]);
                    } else {
                        console.log(`编码器输入 ${name}: 无法获取元数据`);
                    }
                }
            } catch (e) {
                console.log('无法获取编码器输入元数据:', e);
            }
            
            console.log('编码器模型加载测试成功');
        } catch (error) {
            console.error('编码器模型加载失败:', error);
            throw error;
        }
    });

    test('Should load decoder model', async () => {
        try {
            // 尝试创建解码器会话对象
            const session = await ort.InferenceSession.create(decoderPath);
            
            // 验证会话创建成功
            assert.ok(session, '解码器会话创建失败');
            
            // 获取并检查模型的输入
            const inputNames = session.inputNames;
            console.log('解码器输入名称:', inputNames);
            assert.ok(inputNames.length > 0, '解码器应该有输入');

            // 获取并检查模型的输出
            const outputNames = session.outputNames;
            console.log('解码器输出名称:', outputNames);
            assert.ok(outputNames.length > 0, '解码器应该有输出');
            
            // 尝试获取输入信息
            try {
                for (const name of inputNames) {
                    const metadata = (session as any).inputMetadata;
                    if (metadata && metadata[name]) {
                        console.log(`解码器输入 ${name}:`, metadata[name]);
                    } else {
                        console.log(`解码器输入 ${name}: 无法获取元数据`);
                    }
                }
            } catch (e) {
                console.log('无法获取解码器输入元数据:', e);
            }
            
            console.log('解码器模型加载测试成功');
        } catch (error) {
            console.error('解码器模型加载失败:', error);
            throw error;
        }
    });

    // 实际运行SAM模型推理的测试
    test('Should run inference with SAM model', async function() {
        // 我们将使用这张真实图像保存输出结果
        const imagePath = path.join(__dirname, '..', '..', 'test_label', 'train_box', 'test', 'images', '1746173974739.jpg');
        const outPath = path.join(__dirname, '..', '..', 'test_label', 'train_box', 'test', 'images', '1746173974739_masked.png');
        this.timeout(30000); // 增加超时时间，推理可能需要较长时间

        // Verify test image exists
        assert.ok(fs.existsSync(imagePath), `Test image not found at path: ${imagePath}`);
        
        try {
            // 首先读取图像获取尺寸
            const image = await Jimp.read(imagePath);
            const imageWidth = image.bitmap.width;
            const imageHeight = image.bitmap.height;
            console.log(`Image dimensions: ${imageWidth}x${imageHeight}`);

            // 加载编码器模型
            const encoderPath = path.join(__dirname, '..', '..', 'test_label', 'model', 'vit_b.onnx');
            if (!fs.existsSync(encoderPath)) {
                throw new Error(`Encoder model not found at: ${encoderPath}`);
            }
            const encoderSession = await ort.InferenceSession.create(encoderPath);

            // 预处理图像
            // 1. 调整图像大小到 1024x1024
            const resized = image.resize(1024, 1024);
            // 2. 转换为 RGB float32 数组，并进行归一化
            const imageData = new Float32Array(3 * 1024 * 1024);
            for (let y = 0; y < 1024; y++) {
                for (let x = 0; x < 1024; x++) {
                    const idx = (y * 1024 + x) * 3;
                    const color = Jimp.intToRGBA(resized.getPixelColor(x, y));
                    // 归一化到 [0,1] 范围
                    imageData[idx] = color.r / 255.0;
                    imageData[idx + 1] = color.g / 255.0;
                    imageData[idx + 2] = color.b / 255.0;
                }
            }

            // 运行编码器获取 embeddings
            const encoderFeeds = {
                'input_image': new ort.Tensor('float32', imageData, [1, 3, 1024, 1024])
            };
            console.log('Running encoder...');
            const encoderResults = await encoderSession.run(encoderFeeds);
            const imageEmbeddings = encoderResults['image_embeddings'];

            // 加载解码器模型并运行推理
            const decoderPath = path.join(__dirname, '..', '..', 'test_label', 'model', 'sam_vit_b.onnx');
            if (!fs.existsSync(decoderPath)) {
                throw new Error(`Decoder model not found at: ${decoderPath}`);
            }
            const decoderSession = await ort.InferenceSession.create(decoderPath);
            
            // 准备解码器输入
            const feeds: Record<string, ort.Tensor> = {};
            
            // 1. image_embeddings - 使用编码器的输出
            feeds['image_embeddings'] = imageEmbeddings;
            
            // 2. point_coords - 点坐标 [1, 1, 2]
            const pointX = 0.5;  // 图像中心 X
            const pointY = 0.5;  // 图像中心 Y
            feeds['point_coords'] = new ort.Tensor('float32', new Float32Array([pointX, pointY]), [1, 1, 2]);
            
            // 3. point_labels - 点标签 [1, 1]
            feeds['point_labels'] = new ort.Tensor('float32', new Float32Array([1]), [1, 1]);
            
            // 4. mask_input - 蒙版输入 [1, 1, 256, 256]
            const maskDims = [1, 1, 256, 256];
            const maskSize = maskDims.reduce((a, b) => a * b, 1);
            const maskInputData = new Float32Array(maskSize).fill(0);
            feeds['mask_input'] = new ort.Tensor('float32', maskInputData, maskDims);
            
            // 5. has_mask_input - 是否有蒙版输入 [1]
            feeds['has_mask_input'] = new ort.Tensor('float32', new Float32Array([0]), [1]);
            
            // 6. orig_im_size - 使用实际图像尺寸 [2]
            feeds['orig_im_size'] = new ort.Tensor('float32', new Float32Array([imageHeight, imageWidth]), [2]);
            
            // 执行推理
            console.log('开始执行SAM模型推理...');
            console.log('Input feeds:', feeds);
            const results = await decoderSession.run(feeds);
            
            // 检查结果
            assert.ok(results, '推理应返回结果');
            
            // 验证是否有期望的输出
            const expectedOutputs = ['masks', 'iou_predictions', 'low_res_masks'];
            for (const output of expectedOutputs) {
                assert.ok(results[output], `输出应包含 ${output}`);
                console.log(`输出 ${output} 形状:`, results[output].dims);
                if (output === 'iou_predictions') {
                    console.log(`IOU predictions:`, results[output].data);
                }
            }
            
            // 保存每个 mask 为单独的图片
            const maskInfo = results['masks'];
            const [batchSize, maskCount, height, width] = maskInfo.dims;
            const maskData = maskInfo.data as Float32Array;
            
            console.log(`Found ${maskCount} masks with dimensions ${width}x${height}`);
            
            // 检查 mask 数据
            let hasValidMask = false;
            for (let i = 0; i < maskData.length; i++) {
                if (maskData[i] !== 0) {
                    hasValidMask = true;
                    console.log(`Found non-zero mask value at index ${i}: ${maskData[i]}`);
                    break;
                }
            }
            if (!hasValidMask) {
                console.log('Warning: All mask values are zero!');
            }

            // 遍历每个 mask
            for (let maskIndex = 0; maskIndex < maskCount; maskIndex++) {
                // 为每个 mask 创建一个 RGBA buffer
                const rgba = Buffer.alloc(width * height * 4);
                
                // 填充 mask 数据
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        // 计算当前 mask 的索引位置
                        const maskOffset = maskIndex * width * height;
                        const pixelIndex = y * width + x;
                        const sourceIndex = maskOffset + pixelIndex;
                        
                        // 如果 mask 值 > 0，设置为红色半透明
                        const maskValue = maskData[sourceIndex];
                        const alpha = maskValue > 0 ? 255 : 0;  // 使用完全不透明以便更清楚地看到 mask
                        
                        // 设置 RGBA 值
                        const rgbaIndex = pixelIndex * 4;
                        rgba[rgbaIndex + 0] = 255;  // R
                        rgba[rgbaIndex + 1] = 0;    // G
                        rgba[rgbaIndex + 2] = 0;    // B
                        rgba[rgbaIndex + 3] = alpha;// A
                    }
                }
                
                // 构造输出文件名
                const maskOutPath = path.join(
                    __dirname, '..', '..', 
                    'test_label', 'train_box', 'test', 'images', 
                    `1746173974739_mask_${maskIndex}.png`
                );
                
                // 创建 Jimp 图像并保存
                const maskImage = await Jimp.read({ data: rgba, width, height });
                await maskImage.writeAsync(maskOutPath);
                console.log(`Saved mask ${maskIndex} to ${maskOutPath}`);
            }
            
            console.log('SAM模型推理测试成功');
        } catch (error) {
            console.error('SAM模型推理失败:', error);
            throw error;
        }
    });
}); 