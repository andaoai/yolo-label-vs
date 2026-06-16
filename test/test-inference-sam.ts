/**
 * SAM (Segment Anything Model) 推理测试
 *
 * 使用 SAM ViT-B 的 encoder + decoder 两阶段 ONNX 模型，
 * 对测试图片进行 point prompt 分割推理，输出可视化结果到 test/output/。
 *
 * 模型签名:
 *   Encoder — input: input_image [1,3,1024,1024]  → output: image_embeddings [1,256,64,64]
 *   Decoder — inputs: image_embeddings, point_coords, point_labels, mask_input, has_mask_input, orig_im_size
 *            → outputs: masks, iou_predictions, low_res_masks
 *
 * 运行: npx tsx test/test-inference-sam.ts
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ensureModels, ensureDatasets } from './setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─── 常量 ─────────────────────────────────────────────────

const ENCODER_SIZE = 1024;

// SAM 预处理归一化参数 (ImageNet mean/std)
const PIXEL_MEAN = [123.675, 116.28, 103.53];
const PIXEL_STD = [58.395, 57.12, 57.375];

const MASK_THRESHOLD = 0.0;  // logits > 0 → mask=1

// ─── float32 ↔ float16 工具 ────────────────────────────────

function float32ToFloat16(f32: Float32Array): Uint16Array {
  const f16 = new Uint16Array(f32.length);
  const view = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < f32.length; i++) {
    view.setFloat32(0, f32[i], true);
    const bits = view.getUint32(0, true);
    const sign = (bits >> 16) & 0x8000;
    let exp = ((bits >> 23) & 0xff) - 127 + 15;
    let mantissa = (bits >> 13) & 0x3ff;
    if (exp <= 0) {
      mantissa = (mantissa | 0x400) >> (1 - exp);
      exp = 0;
    } else if (exp >= 31) {
      exp = 31;
      mantissa = 0;
    }
    f16[i] = sign | (exp << 10) | mantissa;
  }
  return f16;
}

function float16ToFloat32(f16: Uint16Array): Float32Array {
  const f32 = new Float32Array(f16.length);
  const view = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < f16.length; i++) {
    const h = f16[i];
    const sign = (h & 0x8000) << 16;
    let exp = (h >> 10) & 0x1f;
    let mantissa = h & 0x3ff;
    if (exp === 0) {
      if (mantissa !== 0) {
        exp = 127 - 15 + 1;
        while ((mantissa & 0x400) === 0) { mantissa <<= 1; exp--; }
        mantissa &= 0x3ff;
      }
    } else if (exp === 31) {
      exp = 255;
    } else {
      exp = exp - 15 + 127;
    }
    view.setUint32(0, sign | (exp << 23) | (mantissa << 13), true);
    f32[i] = view.getFloat32(0, true);
  }
  return f32;
}

function getOutputData(output: ort.Tensor): Float32Array {
  const data = output.data;
  if (data instanceof Uint16Array) {
    return float16ToFloat32(data);
  }
  return data as Float32Array;
}

// ─── SAM Encoder 预处理 ────────────────────────────────────

interface PreprocessResult {
  tensor: ort.Tensor;
  origW: number;
  origH: number;
  newW: number;
  newH: number;
  padX: number;
  padY: number;
}

/**
 * SAM 预处理:
 *  1. 将图片缩放到最长边 = 1024，保持宽高比
 *  2. 右下角 padding 到 1024×1024
 *  3. 归一化 (pixel - mean) / std
 *  4. 转为 NCHW float16 tensor（fp16 encoder 需要）
 */
async function preprocessForEncoder(
  imagePath: string,
  inputType: 'float32' | 'float16' = 'float32',
): Promise<PreprocessResult> {
  const image = sharp(imagePath);
  const meta = await image.metadata();
  const origW = meta.width!;
  const origH = meta.height!;

  // 缩放到最长边 1024，保持宽高比
  const scale = ENCODER_SIZE / Math.max(origW, origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = 0;  // SAM 官方实现不做居中 padding，只在右下角 pad
  const padY = 0;

  // resize 并转为 RGB raw buffer
  const resized = await image.resize(newW, newH, { fit: 'fill' }).removeAlpha().raw().toBuffer();

  // 创建 1024×1024 的 buffer，padding 区域填 0（归一化后接近 -mean/std）
  const buf = Buffer.alloc(ENCODER_SIZE * ENCODER_SIZE * 3, 0);
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const src = (y * newW + x) * 3;
      const dst = (y * ENCODER_SIZE + x) * 3;
      buf[dst] = resized[src];
      buf[dst + 1] = resized[src + 1];
      buf[dst + 2] = resized[src + 2];
    }
  }

  // NCHW + 归一化
  const float32 = new Float32Array(3 * ENCODER_SIZE * ENCODER_SIZE);
  const area = ENCODER_SIZE * ENCODER_SIZE;
  for (let i = 0; i < area; i++) {
    float32[i]         = (buf[i * 3]     - PIXEL_MEAN[0]) / PIXEL_STD[0];
    float32[area + i]  = (buf[i * 3 + 1] - PIXEL_MEAN[1]) / PIXEL_STD[1];
    float32[2 * area + i] = (buf[i * 3 + 2] - PIXEL_MEAN[2]) / PIXEL_STD[2];
  }

  const tensor = inputType === 'float16'
    ? new ort.Tensor('float16', float32ToFloat16(float32), [1, 3, ENCODER_SIZE, ENCODER_SIZE])
    : new ort.Tensor('float32', float32, [1, 3, ENCODER_SIZE, ENCODER_SIZE]);

  return { tensor, origW, origH, newW, newH, padX, padY };
}

// ─── SAM Decoder 推理 ──────────────────────────────────────

interface PointPrompt {
  x: number;  // 原始图像坐标 x
  y: number;  // 原始图像坐标 y
  label: number;  // 1=前景, 0=背景
}

interface SamMaskResult {
  mask: Uint8Array;       // 二值 mask (origW × origH)
  iou: number;            // IoU 置信度
  promptIndex: number;    // 对应的 prompt 序号
}

/**
 * 运行 SAM decoder
 *
 * @param embeddings  encoder 输出的 image embeddings
 * @param prompts     点提示列表
 * @param origW       原始图像宽度
 * @param origH       原始图像高度
 */
async function runDecoder(
  decoderSession: ort.InferenceSession,
  embeddings: ort.Tensor,
  prompts: PointPrompt[],
  origW: number,
  origH: number,
): Promise<SamMaskResult[]> {
  const numPoints = prompts.length;

  // point_coords: [1, K, 2] — 原始图像坐标
  const pointCoords = new Float32Array(numPoints * 2);
  // point_labels: [1, K]
  const pointLabels = new Float32Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    pointCoords[i * 2] = prompts[i].x;
    pointCoords[i * 2 + 1] = prompts[i].y;
    pointLabels[i] = prompts[i].label;
  }

  // mask_input: [1, 1, 256, 256] — 全零（无前一轮 mask）
  const maskInput = new Float32Array(1 * 1 * 256 * 256);

  // has_mask_input: [1] — 0 表示没有前一轮 mask
  const hasMaskInput = new Float32Array([0]);

  // orig_im_size: [2] — 原始图像尺寸 [H, W]
  const origImSize = new Float32Array([origH, origW]);

  const feeds: Record<string, ort.Tensor> = {
    image_embeddings: embeddings,
    point_coords: new ort.Tensor('float32', pointCoords, [1, numPoints, 2]),
    point_labels: new ort.Tensor('float32', pointLabels, [1, numPoints]),
    mask_input: new ort.Tensor('float32', maskInput, [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', hasMaskInput, [1]),
    orig_im_size: new ort.Tensor('float32', origImSize, [2]),
  };

  const results = await decoderSession.run(feeds);

  const masksTensor = results['masks'];
  const iouTensor = results['iou_predictions'];

  const masksData = getOutputData(masksTensor);
  const iouData = getOutputData(iouTensor);
  const masksShape = masksTensor.dims;

  // masks shape: [1, 4, H, W] — 4 个候选 mask
  const numMasks = masksShape[1];
  const maskH = masksShape[2];
  const maskW = masksShape[3];

  const maskResults: SamMaskResult[] = [];

  for (let m = 0; m < numMasks; m++) {
    const maskSize = maskH * maskW;
    const mask = new Uint8Array(origW * origH);

    // decoder 输出的 mask 已经 resize 到原始尺寸
    for (let y = 0; y < Math.min(maskH, origH); y++) {
      for (let x = 0; x < Math.min(maskW, origW); x++) {
        const logit = masksData[m * maskSize + y * maskW + x];
        if (logit > MASK_THRESHOLD) {
          mask[y * origW + x] = 1;
        }
      }
    }

    // IoU 置信度取 sigmoid
    const iouLogit = iouData[m];
    const iou = 1 / (1 + Math.exp(-iouLogit));

    maskResults.push({ mask, iou, promptIndex: 0 });
  }

  // 只返回 IoU 最高的 mask
  maskResults.sort((a, b) => b.iou - a.iou);
  return maskResults.slice(0, 1);
}

// ─── Mask → 多边形轮廓 ─────────────────────────────────────

const MS_EDGES: [number, number][][] = [
  [], [[3, 2]], [[2, 1]], [[3, 1]], [[1, 0]], [[3, 0], [1, 2]],
  [[2, 0]], [[3, 0]], [[0, 3]], [[0, 2]], [[0, 3], [2, 1]], [[0, 1]],
  [[1, 3]], [[1, 2]], [[2, 3]], [],
];

function msEdgePoint(edge: number, x: number, y: number): [number, number] {
  switch (edge) {
    case 0: return [x + 0.5, y];
    case 1: return [x + 1, y + 0.5];
    case 2: return [x + 0.5, y + 1];
    case 3: return [x, y + 0.5];
  }
  return [x, y];
}

function marchingSquaresContour(mask: Uint8Array, w: number, h: number): [number, number][] {
  const segments: [[number, number], [number, number]][] = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const nw = mask[y * w + x] ? 1 : 0;
      const ne = mask[y * w + x + 1] ? 1 : 0;
      const se = mask[(y + 1) * w + x + 1] ? 1 : 0;
      const sw = mask[(y + 1) * w + x] ? 1 : 0;
      const code = (nw << 3) | (ne << 2) | (se << 1) | sw;
      for (const [e1, e2] of MS_EDGES[code]) {
        segments.push([msEdgePoint(e1, x, y), msEdgePoint(e2, x, y)]);
      }
    }
  }
  if (segments.length === 0) return [];

  const ptKey = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const adj = new Map<string, [number, number][]>();
  for (const [p1, p2] of segments) {
    const k1 = ptKey(p1), k2 = ptKey(p2);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(p2);
    adj.get(k2)!.push(p1);
  }

  const visitedGlobal = new Set<string>();
  let bestPath: [number, number][] = [];

  for (const [segStart] of segments) {
    const k = ptKey(segStart);
    if (visitedGlobal.has(k)) continue;
    const path: [number, number][] = [segStart];
    let current = segStart;
    const localVisited = new Set<string>([k]);
    while (true) {
      const neighbors = adj.get(ptKey(current)) || [];
      let next: [number, number] | null = null;
      for (const n of neighbors) {
        if (!localVisited.has(ptKey(n))) { next = n; break; }
      }
      if (!next) break;
      localVisited.add(ptKey(next));
      path.push(next);
      current = next;
    }
    localVisited.forEach(v => visitedGlobal.add(v));
    if (path.length > bestPath.length) bestPath = path;
  }

  if (bestPath.length >= 3) {
    const first = bestPath[0], last = bestPath[bestPath.length - 1];
    if (Math.abs(first[0] - last[0]) > 1.5 || Math.abs(first[1] - last[1]) > 1.5) {
      bestPath.push(first);
    }
  }
  return bestPath;
}

function douglasPeucker(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const first = points[0], last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDist(points[i], first, last);
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointToLineDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const ex = p[0] - (a[0] + t * dx), ey = p[1] - (a[1] + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

function maskToPolygon(mask: Uint8Array, w: number, h: number): number[] {
  const contour = marchingSquaresContour(mask, w, h);
  if (contour.length < 3) return [];

  let simplified = douglasPeucker(contour, 1.5);
  if (simplified.length < 3) simplified = contour;

  const points: number[] = [];
  for (const [x, y] of simplified) {
    points.push(Math.max(0, Math.min(1, x / w)), Math.max(0, Math.min(1, y / h)));
  }
  return points;
}

// ─── 可视化 ────────────────────────────────────────────────

const COLORS = [
  [255, 77, 77], [77, 255, 77], [77, 77, 255], [255, 255, 77],
  [255, 77, 255], [77, 255, 255], [255, 165, 0], [148, 103, 189],
];

async function drawSamResult(
  imagePath: string,
  maskResults: Array<{ mask: Uint8Array; iou: number; points: PointPrompt[]; polygon: number[] }>,
  outputPath: string,
): Promise<void> {
  const image = sharp(imagePath);
  const meta = await image.metadata();
  const w = meta.width!, h = meta.height!;

  // 绘制 mask 叠加 + 点提示 + 轮廓
  const overlays: string[] = [];

  for (let i = 0; i < maskResults.length; i++) {
    const r = maskResults[i];
    const color = COLORS[i % COLORS.length];

    // 绘制半透明 mask 区域
    const maskBuf = Buffer.alloc(w * h * 4, 0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (r.mask[y * w + x]) {
          const off = (y * w + x) * 4;
          maskBuf[off] = color[0];
          maskBuf[off + 1] = color[1];
          maskBuf[off + 2] = color[2];
          maskBuf[off + 3] = 100; // 半透明
        }
      }
    }

    // 绘制点提示
    let pointsSvg = '';
    for (const p of r.points) {
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      const fill = p.label === 1 ? 'green' : 'red';
      pointsSvg += `<circle cx="${px}" cy="${py}" r="6" fill="${fill}" stroke="white" stroke-width="2"/>`;
    }

    // 绘制多边形轮廓
    let polygonSvg = '';
    if (r.polygon.length >= 6) {
      const pairs: string[] = [];
      for (let j = 0; j < r.polygon.length; j += 2) {
        pairs.push(`${Math.round(r.polygon[j] * w)},${Math.round(r.polygon[j + 1] * h)}`);
      }
      polygonSvg = `<polygon points="${pairs.join(' ')}" fill="none" stroke="rgb(${color})" stroke-width="2"/>`;
    }

    overlays.push(pointsSvg + polygonSvg);

    // 用 sharp composite 叠加 mask
    const maskPng = await sharp(maskBuf, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();

    if (i === 0) {
      await image.composite([{ input: maskPng, top: 0, left: 0 }]).png().toFile(outputPath);
    } else {
      await sharp(outputPath)
        .composite([{ input: maskPng, top: 0, left: 0 }])
        .png()
        .toFile(outputPath + '.tmp.png');
      fs.renameSync(outputPath + '.tmp.png', outputPath);
    }
  }

  // 叠加 SVG (点 + 轮廓 + 标签)
  const svgContent = overlays.join('\n');
  // IoU 标签
  const labelSvg = maskResults.map((r, i) => {
    const color = COLORS[i % COLORS.length];
    const px = Math.round(r.points[0].x);
    const py = Math.round(r.points[0].y);
    const iouLabel = `IoU: ${(r.iou * 100).toFixed(1)}%`;
    return `<text x="${px + 10}" y="${py - 10}" font-size="14" font-family="monospace" fill="rgb(${color})" font-weight="bold">SAM ${iouLabel}</text>`;
  }).join('\n');

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${svgContent}${labelSvg}</svg>`;

  await sharp(outputPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath + '.tmp.png');
  fs.renameSync(outputPath + '.tmp.png', outputPath);
}

// ─── 自动生成点提示 ────────────────────────────────────────

/**
 * 从图像中心区域生成点提示
 * 对于测试来说，使用图像中心附近的多个点
 */
function generateDefaultPrompts(origW: number, origH: number): PointPrompt[][] {
  const cx = origW / 2;
  const cy = origH / 2;

  return [
    // 单点 — 图像中心
    [{ x: cx, y: cy, label: 1 }],
    // 单点 — 偏左上
    [{ x: cx * 0.5, y: cy * 0.5, label: 1 }],
    // 单点 — 偏右下
    [{ x: cx * 1.5, y: cy * 1.5, label: 1 }],
    // 两点 — 前景 + 背景
    [
      { x: cx, y: cy, label: 1 },
      { x: cx * 0.3, y: cy * 0.3, label: 0 },
    ],
  ];
}

// ─── 主流程 ────────────────────────────────────────────────

async function main() {
  console.log('=== SAM (Segment Anything Model) 推理测试 ===\n');

  // 1. 确保模型和数据存在
  console.log('📦 检查测试数据...');
  await ensureModels(['sam-vit-b-encoder', 'sam-vit-b-decoder']);
  await ensureDatasets(['coco128']);
  console.log('');

  const encPath = path.join(ROOT, 'test/data/models/sam-vit-b-encoder.onnx');
  const decPath = path.join(ROOT, 'test/data/models/sam-vit-b-decoder.onnx');
  const imgDir = path.join(ROOT, 'test/data/datasets/coco128/images/train2017');
  const outDir = path.join(ROOT, 'test/output/sam-vit-b');

  if (!fs.existsSync(encPath)) {
    console.error(`❌ Encoder 模型不存在: ${encPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(decPath)) {
    console.error(`❌ Decoder 模型不存在: ${decPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  // 2. 加载模型
  console.log('🔧 加载 SAM Encoder...');
  const encoderSession = await ort.InferenceSession.create(fs.readFileSync(encPath));
  console.log(`   输入: [${encoderSession.inputNames.join(', ')}]`);
  console.log(`   输出: [${encoderSession.outputNames.join(', ')}]`);

  console.log('🔧 加载 SAM Decoder...');
  const decoderSession = await ort.InferenceSession.create(fs.readFileSync(decPath));
  console.log(`   输入: [${decoderSession.inputNames.join(', ')}]`);
  console.log(`   输出: [${decoderSession.outputNames.join(', ')}]`);

  // 3. 获取测试图片
  const images = fs.readdirSync(imgDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()
    .slice(0, 5);

  console.log(`\n📷 测试图片: ${images.length} 张\n`);

  const allResults: Array<{
    image: string;
    prompts: PointPrompt[][];
    encTimeMs: number;
    decTimeMs: number[];
    maskAreas: number[];
    iouScores: number[];
  }> = [];

  // 4. 逐张推理
  for (const imgFile of images) {
    const imgPath = path.join(imgDir, imgFile);
    const baseName = path.parse(imgFile).name;

    console.log(`${'─'.repeat(50)}`);
    console.log(`  📷 ${imgFile}`);

    // Encoder 预处理
    const { tensor, origW, origH, newW, newH } = await preprocessForEncoder(imgPath);
    console.log(`  尺寸: ${origW}×${origH} → ${newW}×${newH} (pad to ${ENCODER_SIZE})`);

    // Encoder 推理
    const encT0 = Date.now();
    const encResults = await encoderSession.run({ input_image: tensor });
    const encTimeMs = Date.now() - encT0;

    const embeddings = encResults['image_embeddings'];
    console.log(`  Encoder: ${encTimeMs}ms, embeddings shape: [${embeddings.dims.join(', ')}]`);

    // 生成点提示
    const promptSets = generateDefaultPrompts(origW, origH);

    const decTimeMs: number[] = [];
    const maskAreas: number[] = [];
    const iouScores: number[] = [];
    const visResults: Array<{ mask: Uint8Array; iou: number; points: PointPrompt[]; polygon: number[] }> = [];

    for (let pi = 0; pi < promptSets.length; pi++) {
      const prompts = promptSets[pi];

      // Decoder 推理
      const decT0 = Date.now();
      const maskResults = await runDecoder(decoderSession, embeddings, prompts, origW, origH);
      const decMs = Date.now() - decT0;
      decTimeMs.push(decMs);

      if (maskResults.length > 0) {
        const best = maskResults[0];
        const area = best.mask.reduce((s, v) => s + v, 0);
        maskAreas.push(area);
        iouScores.push(best.iou);

        const polygon = maskToPolygon(best.mask, origW, origH);

        visResults.push({
          mask: best.mask,
          iou: best.iou,
          points: prompts,
          polygon,
        });

        const ptsDesc = prompts.map(p => `(${Math.round(p.x)},${Math.round(p.y)})${p.label === 1 ? '+' : '-'}`).join(' ');
        console.log(`  Prompt ${pi + 1} [${ptsDesc}]: IoU=${(best.iou * 100).toFixed(1)}%, area=${area}px, dec=${decMs}ms, polygon=${polygon.length / 2}pts`);
      } else {
        maskAreas.push(0);
        iouScores.push(0);
        console.log(`  Prompt ${pi + 1}: 无有效 mask`);
      }
    }

    // 可视化
    const visPath = path.join(outDir, `${baseName}.png`);
    await drawSamResult(imgPath, visResults, visPath);

    allResults.push({
      image: imgFile,
      prompts: promptSets,
      encTimeMs,
      decTimeMs,
      maskAreas,
      iouScores,
    });
  }

  // 5. 保存结果
  const summary = {
    model: 'sam-vit-b',
    encoderInputSize: ENCODER_SIZE,
    maskThreshold: MASK_THRESHOLD,
    totalImages: images.length,
    promptsPerImage: generateDefaultPrompts(0, 0).length,
    results: allResults.map(r => ({
      image: r.image,
      encoderTimeMs: r.encTimeMs,
      avgDecoderTimeMs: Math.round(r.decTimeMs.reduce((a, b) => a + b, 0) / r.decTimeMs.length),
      prompts: r.prompts.map((ps, i) => ({
        points: ps.map(p => ({ x: +p.x.toFixed(0), y: +p.y.toFixed(0), label: p.label })),
        iou: +(r.iouScores[i] || 0).toFixed(4),
        maskArea: r.maskAreas[i] || 0,
        decoderTimeMs: r.decTimeMs[i],
      })),
    })),
  };

  const jsonPath = path.join(outDir, 'results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  // 6. 统计输出
  console.log(`\n${'='.repeat(50)}`);
  console.log('=== 测试完成 ===');
  console.log(`输出目录: ${outDir}/`);

  const totalEnc = allResults.reduce((s, r) => s + r.encTimeMs, 0);
  const totalDec = allResults.reduce((s, r) => s + r.decTimeMs.reduce((a, b) => a + b, 0), 0);
  const avgEnc = Math.round(totalEnc / allResults.length);
  const avgDec = Math.round(totalDec / (allResults.length * generateDefaultPrompts(0, 0).length));

  console.log(`平均 Encoder 耗时: ${avgEnc}ms`);
  console.log(`平均 Decoder 耗时: ${avgDec}ms`);
  console.log(`总耗时: ${totalEnc + totalDec}ms`);

  const validMasks = allResults.flatMap(r => r.iouScores).filter(s => s > 0.5);
  console.log(`IoU > 0.5 的 mask: ${validMasks.length} / ${allResults.flatMap(r => r.iouScores).length}`);
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
