/**
 * 多模型统一推理测试
 *
 * 自动识别 YOLO 版本（v5/v8/v11）和模型类型（det/seg），
 * 对所有模型跑推理，输出可视化结果到 test/output/。
 *
 * 运行: npx tsx test/test-inference-all.ts
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

const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const NUM_MASKS = 32;
const MASK_THRESHOLD = 0.5;

// ─── float32 → float16 转换 ──────────────────────────────

/** 将 float32 转为 float16 的 Uint16Array（IEEE 754 half-precision 二进制） */
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

/** 将 float16 Uint16Array 转为 Float32Array */
function float16ToFloat32(f16: Uint16Array): Float32Array {
  const f32 = new Float32Array(f16.length);
  const view = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < f16.length; i++) {
    const h = f16[i];
    const sign = (h & 0x8000) << 16;
    let exp = (h >> 10) & 0x1f;
    let mantissa = h & 0x3ff;
    if (exp === 0) {
      // 非规格化 → float32
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

/** 获取输出数据为 Float32Array（自动处理 float16 输出） */
function getOutputData(output: any): Float32Array {
  const data = output.data;
  if (data instanceof Uint16Array) {
    return float16ToFloat32(data);
  }
  return data as Float32Array;
}

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

// ─── 模型配置 ────────────────────────────────────────────

interface ModelConfig {
  name: string;
  modelPath: string;
  datasetDir: string;   // 图片目录
  labelDir: string;     // 标签目录
  maxImages: number;
  task: 'det' | 'seg';
}

const MODELS: ModelConfig[] = [
  // ─── Det 模型 ─────────────────────────────────────────
  {
    name: 'yolov5s',
    modelPath: path.join(ROOT, 'test/data/models/yolov5s.onnx'),
    datasetDir: path.join(ROOT, 'test/data/datasets/coco128/images/train2017'),
    labelDir: path.join(ROOT, 'test/data/datasets/coco128/labels/train2017'),
    maxImages: 10,
    task: 'det',
  },
  {
    name: 'yolov8n',
    modelPath: path.join(ROOT, 'test/data/models/yolov8n.onnx'),
    datasetDir: path.join(ROOT, 'test/data/datasets/coco128/images/train2017'),
    labelDir: path.join(ROOT, 'test/data/datasets/coco128/labels/train2017'),
    maxImages: 10,
    task: 'det',
  },
  {
    name: 'yolo11n',
    modelPath: path.join(ROOT, 'test/data/models/yolo11n.onnx'),
    datasetDir: path.join(ROOT, 'test/data/datasets/coco128/images/train2017'),
    labelDir: path.join(ROOT, 'test/data/datasets/coco128/labels/train2017'),
    maxImages: 10,
    task: 'det',
  },
  {
    name: 'yolo11s',
    modelPath: path.join(ROOT, 'test/data/models/yolo11s.onnx'),
    datasetDir: path.join(ROOT, 'test/data/datasets/coco128/images/train2017'),
    labelDir: path.join(ROOT, 'test/data/datasets/coco128/labels/train2017'),
    maxImages: 10,
    task: 'det',
  },
  // ─── Seg 模型 ─────────────────────────────────────────
  {
    name: 'yolov8n-seg',
    modelPath: path.join(ROOT, 'test/data/models/yolov8n-seg.onnx'),
    datasetDir: path.join(ROOT, 'test/data/datasets/coco8-seg/images/val'),
    labelDir: path.join(ROOT, 'test/data/datasets/coco8-seg/labels/val'),
    maxImages: 4,
    task: 'seg',
  },
  {
    name: 'yolo11n-seg',
    modelPath: path.join(ROOT, 'test/data/models/yolo11n-seg.onnx'),
    datasetDir: path.join(ROOT, 'test/data/datasets/coco8-seg/images/val'),
    labelDir: path.join(ROOT, 'test/data/datasets/coco8-seg/labels/val'),
    maxImages: 4,
    task: 'seg',
  },
];

// ─── 类型定义 ────────────────────────────────────────────

interface Detection {
  class: number;
  className: string;
  confidence: number;
  x: number; y: number; width: number; height: number; // 归一化 bbox
  points?: number[];  // seg 多边形点 [x1,y1,x2,y2,...]
}

type YOLOVersion = 'v5' | 'v8+';
type ModelType = 'det' | 'seg';

interface ModelInfo {
  version: YOLOVersion;
  type: ModelType;
  outputNames: readonly string[];
  outputShapes: readonly (readonly number[])[];
}

// ─── 模型类型自动识别 ─────────────────────────────────────

function detectModelInfo(session: ort.InferenceSession): ModelInfo {
  const outputNames = session.outputNames;
  const isSeg = outputNames.length >= 2;

  // 获取第一个输出的 shape
  const firstOutput = session.outputNames[0];
  // onnxruntime-node 的 getOutputMetadata 不一定可用，
  // 通过 run 一个 dummy input 来获取 shape 信息太浪费，
  // 所以我们在实际推理时再判断 v5 vs v8+
  // 这里先标记为 unknown，推理时再确认
  return {
    version: 'v8+', // 默认，推理时根据 shape 确认
    type: isSeg ? 'seg' as const : 'det' as const,
    outputNames,
    outputShapes: [], // 推理时填充
  };
}

/**
 * 根据输出 tensor shape 判断 YOLO 版本
 * YOLOv5: [1, N, 5+cls] — N 很大（如 25200），特征维度 = 5 + numClasses
 * YOLOv8+: [1, 4+cls, N] — N 很大（如 8400），特征维度 = 4 + numClasses
 */
function detectVersionFromShape(shape: readonly number[], numClasses: number): YOLOVersion {
  const dim1 = shape[1];
  const dim2 = shape[2];

  // 谁大谁就是检测数量 N
  // YOLOv5: [1, 25200, 85] → dim1 > dim2
  // YOLOv8+: [1, 84, 8400] → dim1 < dim2
  if (dim1 > dim2) {
    return 'v5';
  }
  return 'v8+';
}

// ─── 预处理 ──────────────────────────────────────────────

async function preprocess(imagePath: string, targetSize: number, inputType: 'float32' | 'float16' = 'float32') {
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
  const buf = Buffer.alloc(targetSize * targetSize * 3, 114);
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

  const tensor = inputType === 'float16'
    ? new ort.Tensor('float16', float32ToFloat16(float32), [1, 3, targetSize, targetSize])
    : new ort.Tensor('float32', float32, [1, 3, targetSize, targetSize]);

  return { tensor, origW, origH, newW, newH, padX, padY };
}

// ─── YOLOv5 后处理（有 objectness，布局 [1, N, 5+cls]） ───

function postprocessV5(
  data: Float32Array, shape: readonly number[],
  origW: number, origH: number,
  newW: number, newH: number, padX: number, padY: number,
): Detection[] {
  const numDetections = shape[1]; // N = 25200
  const numFeatures = shape[2];   // 5 + numClasses
  const numClasses = numFeatures - 5;

  interface Candidate { x1: number; y1: number; x2: number; y2: number; score: number; classId: number; }
  const candidates: Candidate[] = [];

  for (let i = 0; i < numDetections; i++) {
    const offset = i * numFeatures;
    const cx = data[offset];
    const cy = data[offset + 1];
    const w = data[offset + 2];
    const h = data[offset + 3];
    const objConf = data[offset + 4];

    let maxScore = 0, maxClass = 0;
    for (let j = 0; j < numClasses; j++) {
      const score = data[offset + 5 + j];
      if (score > maxScore) { maxScore = score; maxClass = j; }
    }

    const finalScore = objConf * maxScore;
    if (finalScore < CONF_THRESHOLD) continue;

    // v5 输出可能是归一化的（0~1）或像素坐标（0~640）
    // 检查: 如果 cx > 1.5 说明是像素坐标，需要去 letterbox
    let x1: number, y1: number, x2: number, y2: number;
    if (cx <= 1.5 && cy <= 1.5) {
      // 已经是归一化坐标
      x1 = cx - w / 2;
      y1 = cy - h / 2;
      x2 = cx + w / 2;
      y2 = cy + h / 2;
    } else {
      // 像素坐标，去 letterbox
      x1 = ((cx - w / 2) - padX) / newW;
      y1 = ((cy - h / 2) - padY) / newH;
      x2 = ((cx + w / 2) - padX) / newW;
      y2 = ((cy + h / 2) - padY) / newH;
    }

    candidates.push({
      x1: Math.max(0, x1), y1: Math.max(0, y1),
      x2: Math.min(1, x2), y2: Math.min(1, y2),
      score: finalScore, classId: maxClass,
    });
  }

  const selected = nms(candidates, IOU_THRESHOLD);
  return selected.map(idx => {
    const c = candidates[idx];
    return {
      class: c.classId,
      className: COCO_CLASSES[c.classId] || String(c.classId),
      confidence: c.score,
      x: c.x1, y: c.y1,
      width: c.x2 - c.x1, height: c.y2 - c.y1,
    };
  });
}

// ─── YOLOv8/v11 后处理（无 objectness，布局 [1, 4+cls, N]） ───

function postprocessV8(
  data: Float32Array, shape: readonly number[],
  origW: number, origH: number,
  newW: number, newH: number, padX: number, padY: number,
): Detection[] {
  const numFeatures = shape[1]; // 4 + numClasses
  const numDetections = shape[2]; // N = 8400
  const numClasses = numFeatures - 4;

  interface Candidate { x1: number; y1: number; x2: number; y2: number; score: number; classId: number; }
  const candidates: Candidate[] = [];

  for (let i = 0; i < numDetections; i++) {
    const cx = data[0 * numDetections + i];
    const cy = data[1 * numDetections + i];
    const w = data[2 * numDetections + i];
    const h = data[3 * numDetections + i];

    let maxScore = 0, maxClass = 0;
    for (let j = 0; j < numClasses; j++) {
      const score = data[(4 + j) * numDetections + i];
      if (score > maxScore) { maxScore = score; maxClass = j; }
    }

    if (maxScore < CONF_THRESHOLD) continue;

    // 检查是否归一化
    let x1: number, y1: number, x2: number, y2: number;
    if (cx <= 1.5 && cy <= 1.5) {
      x1 = cx - w / 2;
      y1 = cy - h / 2;
      x2 = cx + w / 2;
      y2 = cy + h / 2;
    } else {
      x1 = ((cx - w / 2) - padX) / newW;
      y1 = ((cy - h / 2) - padY) / newH;
      x2 = ((cx + w / 2) - padX) / newW;
      y2 = ((cy + h / 2) - padY) / newH;
    }

    candidates.push({
      x1: Math.max(0, x1), y1: Math.max(0, y1),
      x2: Math.min(1, x2), y2: Math.min(1, y2),
      score: maxScore, classId: maxClass,
    });
  }

  const selected = nms(candidates, IOU_THRESHOLD);
  return selected.map(idx => {
    const c = candidates[idx];
    return {
      class: c.classId,
      className: COCO_CLASSES[c.classId] || String(c.classId),
      confidence: c.score,
      x: c.x1, y: c.y1,
      width: c.x2 - c.x1, height: c.y2 - c.y1,
    };
  });
}

// ─── Seg 后处理（两个输出张量） ──────────────────────────

function postprocessSeg(
  detData: Float32Array, detShape: readonly number[],
  protoData: Float32Array, protoShape: readonly number[],
  version: YOLOVersion,
  origW: number, origH: number,
  newW: number, newH: number, padX: number, padY: number,
): Detection[] {
  let numFeatures: number, numDetections: number;

  if (version === 'v5') {
    // YOLOv5-seg: [1, N, 5+cls+32] — 罕见，但防御性处理
    numDetections = detShape[1];
    numFeatures = detShape[2];
  } else {
    // YOLOv8/v11-seg: [1, 4+cls+32, N]
    numFeatures = detShape[1];
    numDetections = detShape[2];
  }

  const numClasses = numFeatures - 4 - NUM_MASKS;
  const maskH = protoShape.length === 4 ? protoShape[2] : 160;
  const maskW = protoShape.length === 4 ? protoShape[3] : 160;

  interface Candidate {
    x1: number; y1: number; x2: number; y2: number;
    score: number; classId: number; coeffs: number[];
  }
  const candidates: Candidate[] = [];

  for (let i = 0; i < numDetections; i++) {
    let cx: number, cy: number, w: number, h: number;

    if (version === 'v5') {
      const off = i * numFeatures;
      cx = detData[off]; cy = detData[off + 1]; w = detData[off + 2]; h = detData[off + 3];
    } else {
      cx = detData[0 * numDetections + i];
      cy = detData[1 * numDetections + i];
      w = detData[2 * numDetections + i];
      h = detData[3 * numDetections + i];
    }

    let maxScore = 0, maxClass = 0;
    if (version === 'v5') {
      const off = i * numFeatures;
      const objConf = detData[off + 4];
      for (let j = 0; j < numClasses; j++) {
        const s = detData[off + 5 + j];
        if (s > maxScore) { maxScore = s; maxClass = j; }
      }
      maxScore *= objConf;
    } else {
      for (let j = 0; j < numClasses; j++) {
        const s = detData[(4 + j) * numDetections + i];
        if (s > maxScore) { maxScore = s; maxClass = j; }
      }
    }

    if (maxScore < CONF_THRESHOLD) continue;

    const coeffs: number[] = [];
    if (version === 'v5') {
      const off = i * numFeatures;
      for (let m = 0; m < NUM_MASKS; m++) {
        coeffs.push(detData[off + 5 + numClasses + m]);
      }
    } else {
      for (let m = 0; m < NUM_MASKS; m++) {
        coeffs.push(detData[(4 + numClasses + m) * numDetections + i]);
      }
    }

    candidates.push({
      x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2,
      score: maxScore, classId: maxClass, coeffs,
    });
  }

  const selected = nmsCandidates(candidates, IOU_THRESHOLD);
  const scaleMX = maskW / INPUT_SIZE;
  const scaleMY = maskH / INPUT_SIZE;

  return selected.map(idx => {
    const det = candidates[idx];

    // coeffs @ protos → sigmoid → crop → polygon
    const rawMask = new Float32Array(maskH * maskW);
    for (let hw = 0; hw < maskH * maskW; hw++) {
      let sum = 0;
      for (let m = 0; m < NUM_MASKS; m++) {
        sum += det.coeffs[m] * protoData[m * maskH * maskW + hw];
      }
      rawMask[hw] = 1 / (1 + Math.exp(-sum));
    }

    // crop to bbox
    const bx1 = Math.max(0, Math.floor(det.x1 * scaleMX));
    const by1 = Math.max(0, Math.floor(det.y1 * scaleMY));
    const bx2 = Math.min(maskW, Math.ceil(det.x2 * scaleMX));
    const by2 = Math.min(maskH, Math.ceil(det.y2 * scaleMY));
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        if (x < bx1 || x >= bx2 || y < by1 || y >= by2) {
          rawMask[y * maskW + x] = 0;
        }
      }
    }

    // bilinear upsample → threshold → marching squares → polygon
    const points = maskToPolygon(rawMask, maskW, maskH, det.x1, det.y1, det.x2, det.y2, padX, padY, newW, newH, origW, origH);

    const normX1 = Math.max(0, (det.x1 - padX) / newW);
    const normY1 = Math.max(0, (det.y1 - padY) / newH);
    const normX2 = Math.min(1, (det.x2 - padX) / newW);
    const normY2 = Math.min(1, (det.y2 - padY) / newH);

    return {
      class: det.classId,
      className: COCO_CLASSES[det.classId] || String(det.classId),
      confidence: det.score,
      x: normX1, y: normY1,
      width: normX2 - normX1, height: normY2 - normY1,
      points,
    };
  });
}

// ─── NMS ─────────────────────────────────────────────────

function nms(
  candidates: Array<{ x1: number; y1: number; x2: number; y2: number; score: number; classId: number }>,
  iouThreshold: number,
): number[] {
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

function nmsCandidates(
  candidates: Array<{ x1: number; y1: number; x2: number; y2: number; score: number; classId: number; coeffs: number[] }>,
  iouThreshold: number,
): number[] {
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

// ─── Marching Squares 轮廓提取 ──────────────────────────

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

function bilinearSample(data: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  return data[y0 * w + x0] * (1 - fx) * (1 - fy) +
         data[y0 * w + x1] * fx * (1 - fy) +
         data[y1 * w + x0] * (1 - fx) * fy +
         data[y1 * w + x1] * fx * fy;
}

function maskToPolygon(
  rawMask: Float32Array, maskW: number, maskH: number,
  detX1: number, detY1: number, detX2: number, detY2: number,
  padX: number, padY: number, newW: number, newH: number,
  origW: number, origH: number,
): number[] {
  const upsampled = new Float32Array(origW * origH);
  for (let oy = 0; oy < origH; oy++) {
    for (let ox = 0; ox < origW; ox++) {
      const mx = (ox / origW * newW + padX) / INPUT_SIZE * maskW;
      const my = (oy / origH * newH + padY) / INPUT_SIZE * maskH;
      upsampled[oy * origW + ox] = bilinearSample(rawMask, maskW, maskH, mx, my);
    }
  }

  const bx1 = Math.max(0, Math.floor((detX1 - padX) / newW * origW));
  const by1 = Math.max(0, Math.floor((detY1 - padY) / newH * origH));
  const bx2 = Math.min(origW, Math.ceil((detX2 - padX) / newW * origW));
  const by2 = Math.min(origH, Math.ceil((detY2 - padY) / newH * origH));

  const binaryMask = new Uint8Array(origW * origH);
  for (let y = by1; y < by2; y++) {
    for (let x = bx1; x < bx2; x++) {
      if (upsampled[y * origW + x] > MASK_THRESHOLD) {
        binaryMask[y * origW + x] = 1;
      }
    }
  }

  const contour = marchingSquaresContour(binaryMask, origW, origH);
  if (contour.length < 3) return [];

  let simplified = douglasPeucker(contour, 1.0);
  if (simplified.length < 3) simplified = contour;

  const points: number[] = [];
  for (const [x, y] of simplified) {
    points.push(Math.max(0, Math.min(1, x / origW)), Math.max(0, Math.min(1, y / origH)));
  }
  return points;
}

// ─── 可视化绘制 ──────────────────────────────────────────

const COLORS = [
  [255, 77, 77], [77, 255, 77], [77, 77, 255], [255, 255, 77],
  [255, 77, 255], [77, 255, 255], [255, 165, 0], [148, 103, 189],
];

async function drawDetections(
  imagePath: string, detections: Detection[],
  outputPath: string,
): Promise<void> {
  const image = sharp(imagePath);
  const meta = await image.metadata();
  const w = meta.width!, h = meta.height!;

  // 创建 SVG overlay
  const rects = detections.map((d, i) => {
    const color = COLORS[i % COLORS.length];
    const x1 = Math.round(d.x * w), y1 = Math.round(d.y * h);
    const dw = Math.round(d.width * w), dh = Math.round(d.height * h);
    const label = `${d.className} ${(d.confidence * 100).toFixed(0)}%`;
    return `<rect x="${x1}" y="${y1}" width="${dw}" height="${dh}" fill="none" stroke="rgb(${color})" stroke-width="2"/>
    <text x="${x1}" y="${y1 - 4}" font-size="14" font-family="monospace" fill="rgb(${color})" font-weight="bold">${label}</text>`;
  }).join('\n');

  const polygons = detections.filter(d => d.points && d.points.length >= 6).map((d, i) => {
    const color = COLORS[i % COLORS.length];
    const pts = d.points!;
    const pairs: string[] = [];
    for (let j = 0; j < pts.length; j += 2) {
      pairs.push(`${Math.round(pts[j] * w)},${Math.round(pts[j + 1] * h)}`);
    }
    return `<polygon points="${pairs.join(' ')}" fill="rgba(${color},0.3)" stroke="rgb(${color})" stroke-width="2"/>`;
  }).join('\n');

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}${polygons}</svg>`;

  await image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
}

// ─── 主流程 ──────────────────────────────────────────────

async function runModel(config: ModelConfig): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`模型: ${config.name}`);
  console.log(`${'='.repeat(60)}`);

  const outDir = path.join(ROOT, 'test/output', config.name);
  fs.mkdirSync(outDir, { recursive: true });

  // 1. 加载模型
  console.log('  加载模型...');
  const session = await ort.InferenceSession.create(fs.readFileSync(config.modelPath));
  const outputNames = session.outputNames;
  const isSeg = outputNames.length >= 2;
  console.log(`  输出数量: ${outputNames.length}, 类型: ${isSeg ? 'SEG' : 'DET'}`);

  // 2. 获取测试图片
  const images = fs.readdirSync(config.datasetDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()
    .slice(0, config.maxImages);

  console.log(`  测试图片: ${images.length} 张`);

  const allResults: Array<{ image: string; detections: Detection[]; timeMs: number }> = [];
  let versionDetected = false;
  let detectedVersion: YOLOVersion = 'v8+';
  let inputType: 'float32' | 'float16' = 'float32';
  let inputTypeDetected = false;

  for (const imgFile of images) {
    const imgPath = path.join(config.datasetDir, imgFile);
    const baseName = path.parse(imgFile).name;

    // 预处理
    const { tensor, origW, origH, newW, newH, padX, padY } = await preprocess(imgPath, INPUT_SIZE, inputType);

    // 推理（首次自动检测输入类型）
    let results: ort.InferenceSession.OnnxValueMapType;
    let timeMs: number;
    if (!inputTypeDetected) {
      try {
        const t0 = Date.now();
        results = await session.run({ [session.inputNames[0]]: tensor });
        timeMs = Date.now() - t0;
      } catch (e: any) {
        if (e.message?.includes('float16')) {
          console.log('  模型需要 float16 输入，切换中...');
          inputType = 'float16';
          const { tensor: t16 } = await preprocess(imgPath, INPUT_SIZE, 'float16');
          const t0 = Date.now();
          results = await session.run({ [session.inputNames[0]]: t16 });
          timeMs = Date.now() - t0;
        } else {
          throw e;
        }
      }
      inputTypeDetected = true;
      if (inputType === 'float16') console.log('  输入类型: float16');
    } else {
      const t0 = Date.now();
      results = await session.run({ [session.inputNames[0]]: tensor });
      timeMs = Date.now() - t0;
    }

    // 获取输出 shape 并识别版本（只做一次）
    if (!versionDetected) {
      const firstOutput = results[outputNames[0]];
      const shape = firstOutput.dims;
      if (!isSeg) {
        detectedVersion = detectVersionFromShape(shape, 80);
      } else {
        // seg 模型：从 det tensor shape 判断
        detectedVersion = detectVersionFromShape(shape, 80);
      }
      versionDetected = true;
      console.log(`  输出 shape: [${shape.join(', ')}]`);
      console.log(`  识别版本: YOLO${detectedVersion === 'v5' ? 'v5' : 'v8/v11'}`);
    }

    // 后处理（根据 task 类型分发）
    let detections: Detection[];
    const task = config.task;
    if (task === 'seg') {
      const detTensor = results[outputNames[0]];
      const protoTensor = results[outputNames[1]];
      detections = postprocessSeg(
        getOutputData(detTensor), detTensor.dims,
        getOutputData(protoTensor), protoTensor.dims,
        detectedVersion,
        origW, origH, newW, newH, padX, padY,
      );
    } else if (detectedVersion === 'v5') {
      const output = results[outputNames[0]];
      detections = postprocessV5(
        getOutputData(output), output.dims,
        origW, origH, newW, newH, padX, padY,
      );
    } else {
      const output = results[outputNames[0]];
      detections = postprocessV8(
        getOutputData(output), output.dims,
        origW, origH, newW, newH, padX, padY,
      );
    }

    console.log(`  ${imgFile}: ${detections.length} 个检测 (${timeMs}ms)`);

    // 可视化
    const visPath = path.join(outDir, `${baseName}.png`);
    await drawDetections(imgPath, detections, visPath);

    allResults.push({ image: imgFile, detections, timeMs });
  }

  // 保存 results.json
  const summary = {
    model: config.name,
    version: detectedVersion,
    type: config.task,
    inputSize: INPUT_SIZE,
    iouThreshold: IOU_THRESHOLD,
    totalImages: images.length,
    totalDetections: allResults.reduce((s, r) => s + r.detections.length, 0),
    avgTimeMs: Math.round(allResults.reduce((s, r) => s + r.timeMs, 0) / allResults.length),
    results: allResults.map(r => ({
      image: r.image,
      timeMs: r.timeMs,
      detections: r.detections.map(d => ({
        class: d.class,
        className: d.className,
        confidence: +d.confidence.toFixed(4),
        bbox: [+d.x.toFixed(4), +d.y.toFixed(4), +d.width.toFixed(4), +d.height.toFixed(4)],
        polygonPoints: d.points ? d.points.length / 2 : 0,
      })),
    })),
  };

  const jsonPath = path.join(outDir, 'results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`  结果保存: ${outDir}/`);
  console.log(`  总检测数: ${summary.totalDetections}, 平均耗时: ${summary.avgTimeMs}ms`);
}

async function main() {
  console.log('=== YOLO 多模型推理测试 ===');
  console.log(`模型数量: ${MODELS.length}`);
  console.log(`输出目录: ${path.join(ROOT, 'test/output')}\n`);

  // 自动下载缺失的模型和数据集
  console.log('📦 检查测试数据...');
  await ensureModels();
  await ensureDatasets(['coco128', 'coco8-seg']);
  console.log('');

  for (const config of MODELS) {
    try {
      await runModel(config);
    } catch (err: any) {
      console.error(`\n!!! 模型 ${config.name} 失败: ${err.message}`);
    }
  }

  console.log('\n=== 全部完成 ===');
  console.log(`查看结果: ${path.join(ROOT, 'test/output')}`);
}

main().catch(console.error);
