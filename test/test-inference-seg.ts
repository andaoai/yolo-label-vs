/**
 * YOLO11-seg 推理测试 — 严格按照 ultralytics 官方后处理
 *
 * 官方流程：
 * 1. 解析 output0: [1, 4+nc+32, 8400] -> bbox + class scores + mask coefficients
 * 2. 置信度过滤 + NMS
 * 3. 对每个检测: coeffs @ protos -> sigmoid -> crop to bbox -> upsample -> threshold
 * 4. 将二值 mask 转换为多边形轮廓点
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_PATH = path.resolve(__dirname, '../test_label/model/yolo11n-seg.onnx');
const IMAGE_PATH = path.resolve(__dirname, '../test_label/coco8-seg/images/val/000000000049.jpg');
const LABEL_PATH = path.resolve(__dirname, '../test_label/coco8-seg/labels/val/000000000049.txt');
const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const NUM_MASKS = 32;
const MASK_THRESHOLD = 0.5;
const MASK_W = 160;  // proto mask width (from model output)
const MASK_H = 160;  // proto mask height

const COCO_CLASSES = [
  'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat',
  'traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat',
  'dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack',
  'umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball',
  'kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
  'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple',
  'sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair',
  'couch','potted plant','bed','dining table','toilet','tv','laptop','mouse',
  'remote','keyboard','cell phone','microwave','oven','toaster','sink',
  'refrigerator','book','clock','vase','scissors','teddy bear','hair drier',
  'toothbrush',
];

// ─── 预处理 ──────────────────────────────────────────────

async function preprocess(imagePath: string, targetSize: number) {
  const image = sharp(imagePath);
  const meta = await image.metadata();
  const origW = meta.width!;
  const origH = meta.height!;

  const scale = Math.min(targetSize / origW, targetSize / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.floor((targetSize - newW) / 2);
  const padY = Math.floor((targetSize - newH) / 2);

  const resized = await image.resize(newW, newH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const buf = Buffer.alloc(targetSize * targetSize * 3, 114); // 灰色填充
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const src = (y * newW + x) * 3;
      const dst = ((y + padY) * targetSize + (x + padX)) * 3;
      buf[dst] = resized[src]; buf[dst + 1] = resized[src + 1]; buf[dst + 2] = resized[src + 2];
    }
  }

  const float32 = new Float32Array(3 * targetSize * targetSize);
  const area = targetSize * targetSize;
  for (let i = 0; i < area; i++) {
    float32[i] = buf[i * 3] / 255;
    float32[area + i] = buf[i * 3 + 1] / 255;
    float32[2 * area + i] = buf[i * 3 + 2] / 255;
  }

  return {
    tensor: new ort.Tensor('float32', float32, [1, 3, targetSize, targetSize]),
    origW, origH, newW, newH, padX, padY,
  };
}

// ─── 后处理（官方流程） ──────────────────────────────────

interface Detection {
  class: number;
  className: string;
  confidence: number;
  x1: number; y1: number; x2: number; y2: number; // 输入图像坐标系 (0~640)
  maskCoeffs: number[];
}

function postprocess(
  detData: Float32Array, detShape: readonly number[],
  protoData: Float32Array, protoShape: readonly number[],
  origW: number, origH: number,
  newW: number, newH: number, padX: number, padY: number,
): { detections: Detection[]; rawMasks: Float32Array[] } {
  // detShape: [1, 116, 8400]
  const numFeatures = detShape[1];
  const numDetections = detShape[2];
  const numClasses = numFeatures - 4 - NUM_MASKS; // 116 - 4 - 32 = 80

  // protoShape: [1, 32, 160, 160]
  const maskH = protoShape[2];
  const maskW = protoShape[3];

  console.log(`  numDetections=${numDetections}, numClasses=${numClasses}, maskH=${maskH}, maskW=${maskW}`);

  // Step 1: 解析所有候选，过滤低置信度
  const candidates: Array<{
    x1: number; y1: number; x2: number; y2: number;
    score: number; classId: number; coeffs: number[];
  }> = [];

  for (let i = 0; i < numDetections; i++) {
    const cx = detData[0 * numDetections + i];
    const cy = detData[1 * numDetections + i];
    const w = detData[2 * numDetections + i];
    const h = detData[3 * numDetections + i];

    // 找最高类别分数
    let maxScore = 0, maxClass = 0;
    for (let j = 0; j < numClasses; j++) {
      const s = detData[(4 + j) * numDetections + i];
      if (s > maxScore) { maxScore = s; maxClass = j; }
    }

    if (maxScore < CONF_THRESHOLD) continue;

    // bbox: cx,cy,w,h -> x1,y1,x2,y2（输入图像坐标系 0~640）
    const x1 = cx - w / 2, y1 = cy - h / 2;
    const x2 = cx + w / 2, y2 = cy + h / 2;

    // 提取 32 个 mask coefficients
    const coeffs: number[] = [];
    for (let m = 0; m < NUM_MASKS; m++) {
      coeffs.push(detData[(4 + numClasses + m) * numDetections + i]);
    }

    candidates.push({ x1, y1, x2, y2, score: maxScore, classId: maxClass, coeffs });
  }

  console.log(`  置信度过滤后: ${candidates.length} 个候选`);

  // Step 2: NMS
  const selected = nms(candidates, IOU_THRESHOLD);
  console.log(`  NMS 后: ${selected.length} 个检测`);

  // Step 3: 对每个检测生成 mask
  const detections: Detection[] = [];
  const rawMasks: Float32Array[] = [];

  // 将 protoData reshape 为 [32, maskH*maskW]
  const protoFlat = new Float32Array(NUM_MASKS * maskH * maskW);
  for (let m = 0; m < NUM_MASKS; m++) {
    for (let hw = 0; hw < maskH * maskW; hw++) {
      protoFlat[m * maskH * maskW + hw] = protoData[m * maskH * maskW + hw];
    }
  }

  let detIdx = 0;
  for (const idx of selected) {
    const det = candidates[idx];

    // 3a. 矩阵乘法: coeffs [32] @ protoFlat [32, maskH*maskW] -> [maskH*maskW]
    const rawMask = new Float32Array(maskH * maskW);
    for (let hw = 0; hw < maskH * maskW; hw++) {
      let sum = 0;
      for (let m = 0; m < NUM_MASKS; m++) {
        sum += det.coeffs[m] * protoFlat[m * maskH * maskW + hw];
      }
      rawMask[hw] = 1 / (1 + Math.exp(-sum)); // sigmoid
    }

    // 3b. crop to bbox（将 bbox 缩放到 proto 分辨率）
    const scaleMX = maskW / INPUT_SIZE;
    const scaleMY = maskH / INPUT_SIZE;
    const bx1 = Math.max(0, Math.floor(det.x1 * scaleMX));
    const by1 = Math.max(0, Math.floor(det.y1 * scaleMY));
    const bx2 = Math.min(maskW, Math.ceil(det.x2 * scaleMX));
    const by2 = Math.min(maskH, Math.ceil(det.y2 * scaleMY));

    if (detIdx < 3) {
      let beforeOnes = 0;
      for (let j = 0; j < rawMask.length; j++) if (rawMask[j] > 0.5) beforeOnes++;
      console.log(`  [${detIdx}] crop 前 mask 填充率: ${(beforeOnes / rawMask.length * 100).toFixed(2)}%`);
      console.log(`  [${detIdx}] det bbox(input space): (${det.x1.toFixed(1)}, ${det.y1.toFixed(1)}) - (${det.x2.toFixed(1)}, ${det.y2.toFixed(1)})`);
      console.log(`  [${detIdx}] bbox in proto: (${bx1},${by1})-(${bx2},${by2}), size=${bx2-bx1}x${by2-by1}`);
    }

    // bbox 外置零
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        if (x < bx1 || x >= bx2 || y < by1 || y >= by2) {
          rawMask[y * maskW + x] = 0;
        }
      }
    }

    if (detIdx < 3) {
      let afterOnes = 0;
      for (let j = 0; j < rawMask.length; j++) if (rawMask[j] > 0.5) afterOnes++;
      console.log(`  [${detIdx}] crop 后 mask 填充率: ${(afterOnes / rawMask.length * 100).toFixed(2)}%`);
    }
    detIdx++;

    // 3c. 保存 rawMask 用于后续轮廓提取
    const rawMaskCopy = new Float32Array(rawMask);

    // bbox 归一化到原图坐标
    const normX1 = Math.max(0, (det.x1 - padX) / newW);
    const normY1 = Math.max(0, (det.y1 - padY) / newH);
    const normX2 = Math.min(1, (det.x2 - padX) / newW);
    const normY2 = Math.min(1, (det.y2 - padY) / newH);

    detections.push({
      class: det.classId,
      className: COCO_CLASSES[det.classId] || String(det.classId),
      confidence: det.score,
      x1: normX1, y1: normY1, x2: normX2, y2: normY2,
      maskCoeffs: det.coeffs,
    });
    rawMasks.push(rawMaskCopy);
  }

  // 导出 mask 可视化（从 rawMasks 上采样到原图尺寸）
  const maskVis = Buffer.alloc(origW * origH * 3, 0);
  const colors = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
    [255, 0, 255], [0, 255, 255], [128, 0, 0], [0, 128, 0],
  ];
  for (let i = 0; i < detections.length; i++) {
    const rm = rawMasks[i];
    const color = colors[i % 8];
    // bilinear upsample rawMask 到原图尺寸
    for (let oy = 0; oy < origH; oy++) {
      for (let ox = 0; ox < origW; ox++) {
        const mx = (ox / origW * newW + padX) / INPUT_SIZE * maskW;
        const my = (oy / origH * newH + padY) / INPUT_SIZE * maskH;
        const x0 = Math.floor(mx), y0 = Math.floor(my);
        const x1v = Math.min(x0 + 1, maskW - 1), y1v = Math.min(y0 + 1, maskH - 1);
        const fx = mx - x0, fy = my - y0;
        const val = rm[y0 * maskW + x0] * (1 - fx) * (1 - fy) +
                    rm[y0 * maskW + x1v] * fx * (1 - fy) +
                    rm[y1v * maskW + x0] * (1 - fx) * fy +
                    rm[y1v * maskW + x1v] * fx * fy;
        if (val > MASK_THRESHOLD) {
          const idx = (oy * origW + ox) * 3;
          maskVis[idx] = Math.min(255, maskVis[idx] + color[0]);
          maskVis[idx + 1] = Math.min(255, maskVis[idx + 1] + color[1]);
          maskVis[idx + 2] = Math.min(255, maskVis[idx + 2] + color[2]);
        }
      }
    }
  }
  const outPath = path.resolve(__dirname, 'mask_output.png');
  sharp(maskVis, { raw: { width: origW, height: origH, channels: 3 } }).png().toFile(outPath);
  console.log(`  mask 可视化已保存: ${outPath}`);

  return { detections, rawMasks };
}

function nms(candidates: Array<{ x1: number; y1: number; x2: number; y2: number; score: number; classId: number }>, iouThreshold: number): number[] {
  const sorted = candidates.map((_, i) => i).sort((a, b) => candidates[b].score - candidates[a].score);
  const selected: number[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    const idx = sorted[i];
    if (suppressed.has(idx)) continue;
    selected.push(idx);
    const a = candidates[idx];
    for (let j = i + 1; j < sorted.length; j++) {
      const jdx = sorted[j];
      if (suppressed.has(jdx)) continue;
      const b = candidates[jdx];
      if (a.classId !== b.classId) continue;
      const ix1 = Math.max(a.x1, b.x1), iy1 = Math.max(a.y1, b.y1);
      const ix2 = Math.min(a.x2, b.x2), iy2 = Math.min(a.y2, b.y2);
      const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
      const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
      if (inter / (union + 1e-6) > iouThreshold) suppressed.add(jdx);
    }
  }
  return selected;
}

// ─── mask -> 多边形轮廓（Marching Squares） ──────────────────

// Marching Squares 边表: 4角 NW(bit3) NE(bit2) SE(bit1) SW(bit0) -> 边对
// 边: 0=top, 1=right, 2=bottom, 3=left
const MS_EDGES: [number, number][][] = [
  [],                       // 0000
  [[3, 2]],                 // 0001 SW
  [[2, 1]],                 // 0010 SE
  [[3, 1]],                 // 0011 S
  [[1, 0]],                 // 0100 NE
  [[3, 0], [1, 2]],         // 0101 鞍点
  [[2, 0]],                 // 0110 E
  [[3, 0]],                 // 0111
  [[0, 3]],                 // 1000 NW
  [[0, 2]],                 // 1001 W
  [[0, 3], [2, 1]],         // 1010 鞍点
  [[0, 1]],                 // 1011
  [[1, 3]],                 // 1100 N
  [[1, 2]],                 // 1101
  [[2, 3]],                 // 1110
  [],                       // 1111
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

/**
 * Marching Squares 轮廓提取
 * 等价于 cv2.findContours(mask, RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)
 */
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

  // 建立邻接表
  const ptKey = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const adj = new Map<string, [number, number][]>();
  for (const [p1, p2] of segments) {
    const k1 = ptKey(p1), k2 = ptKey(p2);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(p2);
    adj.get(k2)!.push(p1);
  }

  // 找最长连通分量（可能有多个分离的 mask 区域）
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

  // 强制闭合轮廓：marching squares 产生的路径首尾应相邻
  if (bestPath.length >= 3) {
    const first = bestPath[0];
    const last = bestPath[bestPath.length - 1];
    const dx = Math.abs(first[0] - last[0]);
    const dy = Math.abs(first[1] - last[1]);
    if (dx > 1.5 || dy > 1.5) {
      // 未闭合，连接首尾
      bestPath.push(first);
    }
  }

  return bestPath;
}

/** Douglas-Peucker 线简化 */
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

/**
 * 从 rawMask 提取归一化多边形点
 *
 * 严格按照 ultralytics 官方流程:
 * 1. Bilinear upsample rawMask 到原图尺寸
 * 2. Crop to bbox（原图坐标系）
 * 3. Threshold 0.5 → binary
 * 4. Marching Squares 提取轮廓（原图分辨率，保留细节）
 * 5. 归一化坐标
 */
function maskToPolygon(
  rawMask: Float32Array,
  detX1: number, detY1: number, detX2: number, detY2: number,
  padX: number, padY: number, newW: number, newH: number,
  origW: number, origH: number,
): number[] {
  // Step 1: Bilinear upsample 到原图尺寸
  const upsampled = new Float32Array(origW * origH);
  for (let oy = 0; oy < origH; oy++) {
    for (let ox = 0; ox < origW; ox++) {
      const mx = (ox / origW * newW + padX) / INPUT_SIZE * MASK_W;
      const my = (oy / origH * newH + padY) / INPUT_SIZE * MASK_H;
      upsampled[oy * origW + ox] = bilinearSample(rawMask, MASK_W, MASK_H, mx, my);
    }
  }

  // Step 2: bbox 从归一化坐标转到原图坐标，crop + threshold
  const bx1 = Math.max(0, Math.floor(detX1 * origW));
  const by1 = Math.max(0, Math.floor(detY1 * origH));
  const bx2 = Math.min(origW, Math.ceil(detX2 * origW));
  const by2 = Math.min(origH, Math.ceil(detY2 * origH));

  const binaryMask = new Uint8Array(origW * origH);
  for (let y = by1; y < by2; y++) {
    for (let x = bx1; x < bx2; x++) {
      if (upsampled[y * origW + x] > MASK_THRESHOLD) {
        binaryMask[y * origW + x] = 1;
      }
    }
  }

  // Step 3: Marching Squares 在原图分辨率提取轮廓
  const contour = marchingSquaresContour(binaryMask, origW, origH);
  if (contour.length < 3) return [];

  // Step 4: Douglas-Peucker 简化
  let simplified = douglasPeucker(contour, 1.0);
  if (simplified.length < 3) simplified = contour;

  // Step 5: 归一化坐标
  const points: number[] = [];
  for (const [x, y] of simplified) {
    points.push(Math.max(0, Math.min(1, x / origW)), Math.max(0, Math.min(1, y / origH)));
  }
  return points;
}

/** 双线性插值采样 */
function bilinearSample(data: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  return data[y0 * w + x0] * (1 - fx) * (1 - fy) +
         data[y0 * w + x1] * fx * (1 - fy) +
         data[y1 * w + x0] * (1 - fx) * fy +
         data[y1 * w + x1] * fx * fy;
}

// ─── 读取标签 ────────────────────────────────────────────

function readLabels(p: string): number[][] {
  return fs.readFileSync(p, 'utf-8').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
}

// ─── 主函数 ──────────────────────────────────────────────

async function main() {
  console.log('=== YOLO11-seg 推理测试（官方后处理） ===\n');

  // 1. 加载模型
  console.log('1. 加载模型...');
  const session = await ort.InferenceSession.create(fs.readFileSync(MODEL_PATH));
  console.log(`   输出: ${session.outputNames}`);

  // 2. 预处理
  console.log('\n2. 预处理...');
  const { tensor, origW, origH, newW, newH, padX, padY } = await preprocess(IMAGE_PATH, INPUT_SIZE);
  console.log(`   原图: ${origW}x${origH}, 缩放: ${newW}x${newH}, padding: (${padX}, ${padY})`);

  // 3. 推理
  console.log('\n3. 推理...');
  const t0 = Date.now();
  const results = await session.run({ [session.inputNames[0]]: tensor });
  console.log(`   耗时: ${Date.now() - t0}ms`);

  // 4. 后处理
  console.log('\n4. 后处理...');
  const detTensor = results[session.outputNames[0]];
  const protoTensor = results[session.outputNames[1]];

  const { detections, rawMasks } = postprocess(
    detTensor.data as Float32Array, detTensor.dims,
    protoTensor.data as Float32Array, protoTensor.dims,
    origW, origH, newW, newH, padX, padY,
  );

  // 5. 输出结果
  console.log('\n=== 推理结果 ===');
  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    const rm = rawMasks[i];

    // 从 rawMask 提取归一化多边形点（upsample 到原图 → crop → threshold → findContours）
    const points = maskToPolygon(
      rm, d.x1, d.y1, d.x2, d.y2,
      padX, padY, newW, newH, origW, origH,
    );

    // 统计 mask 填充率（在原图尺寸上采样后统计）
    let ones = 0;
    for (let oy = 0; oy < origH; oy++) {
      for (let ox = 0; ox < origW; ox++) {
        const mx = (ox / origW * newW + padX) / INPUT_SIZE * MASK_W;
        const my = (oy / origH * newH + padY) / INPUT_SIZE * MASK_H;
        const x0 = Math.floor(mx), y0 = Math.floor(my);
        const x1v = Math.min(x0 + 1, MASK_W - 1), y1v = Math.min(y0 + 1, MASK_H - 1);
        const fx = mx - x0, fy = my - y0;
        const val = rm[y0 * MASK_W + x0] * (1 - fx) * (1 - fy) +
                    rm[y0 * MASK_W + x1v] * fx * (1 - fy) +
                    rm[y1v * MASK_W + x0] * (1 - fx) * fy +
                    rm[y1v * MASK_W + x1v] * fx * fy;
        if (val > MASK_THRESHOLD) ones++;
      }
    }

    console.log(`\n[${i}] ${d.className} ${(d.confidence * 100).toFixed(1)}%`);
    console.log(`    bbox(归一化): (${d.x1.toFixed(4)}, ${d.y1.toFixed(4)}) - (${d.x2.toFixed(4)}, ${d.y2.toFixed(4)})`);
    console.log(`    mask 填充率: ${(ones / (origW * origH) * 100).toFixed(2)}%`);
    console.log(`    多边形点数: ${points.length / 2}`);
    if (points.length >= 6) {
      console.log(`    YOLO格式前6值: ${points.slice(0, 6).map(v => v.toFixed(6)).join(' ')}`);
    }
  }

  // 6. 标签对比
  console.log('\n=== 标签文件 ===');
  const labels = readLabels(LABEL_PATH);
  for (let i = 0; i < labels.length; i++) {
    const [cls, ...pts] = labels[i];
    let px1 = 1, py1 = 1, px2 = 0, py2 = 0;
    for (let j = 0; j < pts.length; j += 2) {
      px1 = Math.min(px1, pts[j]); py1 = Math.min(py1, pts[j + 1]);
      px2 = Math.max(px2, pts[j]); py2 = Math.max(py2, pts[j + 1]);
    }
    console.log(`\n[${i}] ${COCO_CLASSES[cls] || cls}`);
    console.log(`    bbox(归一化): (${px1.toFixed(4)}, ${py1.toFixed(4)}) - (${px2.toFixed(4)}, ${py2.toFixed(4)})`);
    console.log(`    多边形点数: ${pts.length / 2}`);
    console.log(`    YOLO格式前6值: ${pts.slice(0, 6).map((v: number) => v.toFixed(6)).join(' ')}`);
  }

  // 7. IoU 匹配
  console.log('\n=== IoU 匹配 ===');
  for (const d of detections) {
    let bestIoU = 0, bestIdx = -1;
    for (let j = 0; j < labels.length; j++) {
      const [cls, ...pts] = labels[j];
      if (cls !== d.class) continue;
      let px1 = 1, py1 = 1, px2 = 0, py2 = 0;
      for (let k = 0; k < pts.length; k += 2) {
        px1 = Math.min(px1, pts[k]); py1 = Math.min(py1, pts[k + 1]);
        px2 = Math.max(px2, pts[k]); py2 = Math.max(py2, pts[k + 1]);
      }
      const ix1 = Math.max(d.x1, px1), iy1 = Math.max(d.y1, py1);
      const ix2 = Math.min(d.x2, px2), iy2 = Math.min(d.y2, py2);
      const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
      const union = (d.x2 - d.x1) * (d.y2 - d.y1) + (px2 - px1) * (py2 - py1) - inter;
      const iou = inter / (union + 1e-6);
      if (iou > bestIoU) { bestIoU = iou; bestIdx = j; }
    }
    console.log(`${d.className} ${(d.confidence * 100).toFixed(1)}% -> 匹配标签[${bestIdx}], IoU=${(bestIoU * 100).toFixed(1)}%`);
  }
}

main().catch(console.error);
