import * as path from 'path';
import * as ort from 'onnxruntime-node';
const Jimp: any = require('jimp').default || require('jimp');
import * as fs from 'fs';

async function main() {
  try {
    const workspace = path.resolve(__dirname, '..', '..');
    const modelPath = path.join(workspace, 'src', 'test', 'sam_vit_b.onnx');
    const imagePath = path.join(workspace, 'test_label', 'train_box', 'test', 'images', '1746173974739.jpg');
    const outPath = path.join(workspace, 'test_label', 'train_box', 'test', 'images', '1746173974739_masked.png');

    if (!fs.existsSync(modelPath)) {
      throw new Error(`模型文件不存在: ${modelPath}`);
    }
    if (!fs.existsSync(imagePath)) {
      throw new Error(`图像文件不存在: ${imagePath}`);
    }
    console.log('Loading ONNX SAM model from', modelPath);
    const session = await ort.InferenceSession.create(modelPath);

    // 构造最小输入示例
    const feeds: Record<string, ort.Tensor> = {};
    // image_embeddings 随机填充 [1,256,64,64]
    const embDims = [1, 256, 64, 64];
    const embSize = embDims.reduce((a, b) => a * b, 1);
    feeds['image_embeddings'] = new ort.Tensor('float32', new Float32Array(embSize).fill(0.1), embDims);
    // point_coords 和 point_labels: 中心点 [0.5,0.5]
    feeds['point_coords'] = new ort.Tensor('float32', new Float32Array([0.5, 0.5]), [1, 1, 2]);
    feeds['point_labels'] = new ort.Tensor('float32', new Float32Array([1]), [1, 1]);
    // mask_input, has_mask_input, orig_im_size
    const maskDims = [1, 1, 256, 256];
    const maskSize = maskDims.reduce((a, b) => a * b, 1);
    feeds['mask_input'] = new ort.Tensor('float32', new Float32Array(maskSize).fill(0), maskDims);
    feeds['has_mask_input'] = new ort.Tensor('float32', new Float32Array([0]), [1]);
    // 原始图像尺寸
    // 使用 Jimp 读取图像获得尺寸
    const img = await Jimp.read(imagePath);
    const origSize = [img.bitmap.height, img.bitmap.width];
    feeds['orig_im_size'] = new ort.Tensor('float32', new Float32Array(origSize), [2]);

    console.log('Running inference...');
    const results = await session.run(feeds);
    if (!results['masks']) throw new Error('输出中未找到 masks');

    // 获取第一张 mask，低分辨率版
    const lowRes = results['low_res_masks'].data as Float32Array;
    const [b, n, h, w] = results['low_res_masks'].dims;

    // 放大到原始分辨率
    const maskImgData = Buffer.alloc(img.bitmap.width * img.bitmap.height * 4);
    for (let yy = 0; yy < img.bitmap.height; yy++) {
      for (let xx = 0; xx < img.bitmap.width; xx++) {
        const yy0 = Math.floor((yy / img.bitmap.height) * h);
        const xx0 = Math.floor((xx / img.bitmap.width) * w);
        const v = lowRes[yy0 * w + xx0] > 0 ? 255 : 0;
        const idx = (yy * img.bitmap.width + xx) * 4;
        maskImgData[idx] = 255;      // R
        maskImgData[idx + 1] = 0;    // G
        maskImgData[idx + 2] = 0;    // B
        maskImgData[idx + 3] = v;    // A
      }
    }

    // 创建 Jimp 图像并叠加
    const maskOverlay = await Jimp.read({ data: maskImgData, width: img.bitmap.width, height: img.bitmap.height });
    img.composite(maskOverlay, 0, 0);
    await img.writeAsync(outPath);
    console.log('Saved masked image to', outPath);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main(); 