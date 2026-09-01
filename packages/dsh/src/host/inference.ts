/**
 * Host 侧 ONNX 推理引擎（onnxruntime-node + sharp）。
 *
 * 逻辑移植自 VS Code 扩展的生产推理器（src/templates/inference/inferenceRunner.ts），
 * 把 onnxruntime-web/Canvas 换成 onnxruntime-node/sharp：
 *   - 预处理：sharp letterbox 到模型输入（640），RGB CHW float32 /255；
 *   - 后处理：YOLOv8/YOLO11 检测输出 [1,4+nc,8400]，置信度过滤 + 类别内 NMS；
 *   - 分割：[1,4+nc+32,8400] + proto [1,32,160,160]，mask 系数@proto → sigmoid
 *     → 裁剪 → 双线性上采样 → 阈值 → Marching Squares 提轮廓 → Douglas-Peucker 简化。
 * 原生依赖按需动态 import（仅推理时加载），session 按模型路径缓存。
 */
import type { Detection } from '@yolo-label/core/node';

type Ort = typeof import('onnxruntime-node');

interface SessionCache {
  session: import('onnxruntime-node').InferenceSession;
  ort: Ort;
  inputSize: number;
}
const sessions = new Map<string, Promise<SessionCache>>();

async function loadSession(modelPath: string): Promise<SessionCache> {
  const cached = sessions.get(modelPath);
  if (cached) return cached;
  const promise = (async (): Promise<SessionCache> => {
    const ort = await import('onnxruntime-node');
    const { readFile } = await import('node:fs/promises');
    const modelBuffer = await readFile(modelPath);
    const session = await ort.InferenceSession.create(modelBuffer.buffer.slice(
      modelBuffer.byteOffset, modelBuffer.byteOffset + modelBuffer.byteLength,
    ) as ArrayBuffer, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
    return { session, ort, inputSize: 640 };
  })();
  sessions.set(modelPath, promise);
  return promise;
}

interface PreprocessResult {
  tensor: import('onnxruntime-node').Tensor;
  origW: number;
  origH: number;
  newW: number;
  newH: number;
  padX: number;
  padY: number;
}

async function preprocess(
  ort: Ort,
  imagePath: string,
  inputSize: number,
): Promise<PreprocessResult> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(imagePath).rotate().metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;
  if (!origW || !origH) throw new Error(`cannot read image dimensions: ${imagePath}`);

  const scale = Math.min(inputSize / origW, inputSize / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = (inputSize - newW) / 2;
  const padY = (inputSize - newH) / 2;

  const { data } = await sharp(imagePath)
    .rotate()
    .resize(inputSize, inputSize, {
      fit: 'contain',
      position: 'center',
      background: { r: 114, g: 114, b: 114 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);
  const area = inputSize * inputSize;
  const float32 = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    const p = i * 3;
    float32[i] = pixels[p] / 255;
    float32[area + i] = pixels[p + 1] / 255;
    float32[2 * area + i] = pixels[p + 2] / 255;
  }
  const tensor = new ort.Tensor('float32', float32, [1, 3, inputSize, inputSize]);
  return { tensor, origW, origH, newW, newH, padX, padY };
}

interface Box { x1: number; y1: number; x2: number; y2: number; }
interface Candidate extends Box { score: number; classId: number; coeffs?: number[]; }

function calculateIoU(a: Box, b: Box): number {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return intersection / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection + 1e-6);
}

function nms(cands: Candidate[], iouThreshold: number): number[] {
  const sorted = cands.map((_, i) => i).sort((a, b) => cands[b].score - cands[a].score);
  const selected: number[] = [];
  const suppressed = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    const idx = sorted[i];
    if (suppressed.has(idx)) continue;
    selected.push(idx);
    for (let j = i + 1; j < sorted.length; j++) {
      const jdx = sorted[j];
      if (suppressed.has(jdx) || cands[idx].classId !== cands[jdx].classId) continue;
      if (calculateIoU(cands[idx], cands[jdx]) > iouThreshold) suppressed.add(jdx);
    }
  }
  return selected;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 对一张图跑检测/分割模型，返回归一化 Detection 列表。 */
export async function runInference(
  modelPath: string,
  imagePath: string,
  classNames: string[],
  confThreshold = 0.25,
  iouThreshold = 0.45,
): Promise<Detection[]> {
  const { session, ort, inputSize } = await loadSession(modelPath);
  const pre = await preprocess(ort, imagePath, inputSize);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: pre.tensor });
  const outputNames = session.outputNames;
  const isSeg = outputNames.length >= 2;

  if (isSeg) {
    return postprocessSeg(
      results[outputNames[0]], results[outputNames[1]],
      pre, classNames, confThreshold, iouThreshold,
    );
  }
  return postprocessDet(results[outputNames[0]], pre, classNames, confThreshold, iouThreshold);
}

function parseCandidates(
  tensor: any,
  numDetections: number,
  numFeatures: number,
  numClasses: number,
  confThreshold: number,
  extraMasks: number,
): Candidate[] {
  const data = tensor.data as Float32Array;
  const out: Candidate[] = [];
  for (let i = 0; i < numDetections; i++) {
    const cx = data[i];
    const cy = data[numDetections + i];
    const w = data[2 * numDetections + i];
    const h = data[3 * numDetections + i];
    let maxScore = 0, maxClass = 0;
    for (let j = 0; j < numClasses; j++) {
      const s = data[(4 + j) * numDetections + i];
      if (s > maxScore) { maxScore = s; maxClass = j; }
    }
    if (maxScore < confThreshold) continue;
    const cand: Candidate = {
      x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2,
      score: maxScore, classId: maxClass,
    };
    if (extraMasks > 0) {
      const coeffs: number[] = [];
      for (let m = 0; m < extraMasks; m++) {
        coeffs.push(data[(4 + numClasses + m) * numDetections + i]);
      }
      cand.coeffs = coeffs;
    }
    out.push(cand);
  }
  return out;
}

function dims(tensor: any): { features: number; detections: number } {
  const shape = tensor.dims as number[];
  return shape.length === 3
    ? { features: shape[1], detections: shape[2] }
    : { features: shape[0], detections: shape[1] };
}

function postprocessDet(
  output: any, pre: PreprocessResult, classNames: string[],
  confThreshold: number, iouThreshold: number,
): Detection[] {
  const { features, detections } = dims(output);
  const numClasses = features - 4;
  const cands = parseCandidates(output, detections, features, numClasses, confThreshold, 0);

  // 判定输出是归一化坐标还是像素坐标
  const data = output.data as Float32Array;
  let maxCoord = 0;
  for (let i = 0; i < Math.min(detections, 100); i++) {
    maxCoord = Math.max(maxCoord, data[i], data[detections + i]);
  }
  const normalized = maxCoord <= 1.5;

  const { newW, newH, padX, padY } = pre;
  const toNorm = (c: Candidate): Detection => {
    let x1: number, y1: number, x2: number, y2: number;
    if (normalized) {
      // 输出已是相对原图的 0-1 归一化坐标，直接使用
      x1 = c.x1; y1 = c.y1; x2 = c.x2; y2 = c.y2;
    } else {
      // 输出为 letterbox 输入像素坐标：去 padding 后缩回原图并归一化
      x1 = (c.x1 - padX) / newW; y1 = (c.y1 - padY) / newH;
      x2 = (c.x2 - padX) / newW; y2 = (c.y2 - padY) / newH;
    }
    return {
      class: c.classId,
      className: classNames[c.classId] ?? String(c.classId),
      confidence: c.score,
      x: clamp01(x1),
      y: clamp01(y1),
      width: clamp01(x2 - x1),
      height: clamp01(y2 - y1),
    };
  };

  return nms(cands, iouThreshold).map((i) => toNorm(cands[i]));
}

const NUM_MASKS = 32;

function postprocessSeg(
  detTensor: any, protoTensor: any, pre: PreprocessResult, classNames: string[],
  confThreshold: number, iouThreshold: number,
): Detection[] {
  const { features, detections } = dims(detTensor);
  const numClasses = features - 4 - NUM_MASKS;
  const cands = parseCandidates(detTensor, detections, features, numClasses, confThreshold, NUM_MASKS);

  const protoData = protoTensor.data as Float32Array;
  const protoShape = protoTensor.dims as number[];
  const maskH = protoShape.length === 4 ? protoShape[2] : 160;
  const maskW = protoShape.length === 4 ? protoShape[3] : 160;
  const protoArea = maskH * maskW;
  const { inputSize } = { inputSize: 640 };
  const gainMH = maskH / inputSize;
  const gainMW = maskW / inputSize;
  const { newW, newH, padX, padY, origW, origH } = pre;

  const selected = nms(cands, iouThreshold);
  const out: Detection[] = [];

  for (const idx of selected) {
    const det = cands[idx];
    const coeffs = det.coeffs ?? [];
    // mask 系数 @ proto → sigmoid
    const rawMask = new Float32Array(protoArea);
    for (let hw = 0; hw < protoArea; hw++) {
      let sum = 0;
      for (let m = 0; m < NUM_MASKS; m++) sum += coeffs[m] * protoData[m * protoArea + hw];
      rawMask[hw] = 1 / (1 + Math.exp(-sum));
    }
    // 裁到 bbox（proto 分辨率）
    const bx1 = Math.max(0, Math.floor(det.x1 * gainMW));
    const by1 = Math.max(0, Math.floor(det.y1 * gainMH));
    const bx2 = Math.min(maskW, Math.ceil(det.x2 * gainMW));
    const by2 = Math.min(maskH, Math.ceil(det.y2 * gainMH));
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        if (x < bx1 || x >= bx2 || y < by1 || y >= by2) rawMask[y * maskW + x] = 0;
      }
    }
    const points = maskToPolygon(rawMask, maskW, maskH, det, padX, padY, newW, newH, origW, origH, inputSize);
    const nx1 = clamp01((det.x1 - padX) / newW);
    const ny1 = clamp01((det.y1 - padY) / newH);
    const nx2 = clamp01((det.x2 - padX) / newW);
    const ny2 = clamp01((det.y2 - padY) / newH);
    out.push({
      class: det.classId,
      className: classNames[det.classId] ?? String(det.classId),
      confidence: det.score,
      x: nx1, y: ny1, width: nx2 - nx1, height: ny2 - ny1,
      ...(points.length >= 6 ? { points } : {}),
    });
  }
  return out;
}

// ─── 分割轮廓（Marching Squares + Douglas-Peucker），移植自生产推理器 ───

const MS_EDGES: [number, number][][] = [
  [], [[3, 2]], [[2, 1]], [[3, 1]], [[1, 0]], [[3, 0], [1, 2]], [[2, 0]], [[3, 0]],
  [[0, 3]], [[0, 2]], [[0, 3], [2, 1]], [[0, 1]], [[1, 3]], [[1, 2]], [[2, 3]], [],
];

function bilinearSample(data: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const v00 = data[y0 * w + x0] || 0;
  const v10 = data[y0 * w + x1] || 0;
  const v01 = data[y1 * w + x0] || 0;
  const v11 = data[y1 * w + x1] || 0;
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

function maskToPolygon(
  rawMask: Float32Array, maskW: number, maskH: number,
  det: Candidate, padX: number, padY: number, newW: number, newH: number,
  origW: number, origH: number, inputSize: number,
): number[] {
  // 双线性上采样到原图尺寸
  const upsampled = new Float32Array(origW * origH);
  for (let oy = 0; oy < origH; oy++) {
    for (let ox = 0; ox < origW; ox++) {
      const mx = (ox / origW * newW + padX) / inputSize * maskW;
      const my = (oy / origH * newH + padY) / inputSize * maskH;
      upsampled[oy * origW + ox] = bilinearSample(rawMask, maskW, maskH, mx, my);
    }
  }
  const bx1 = Math.max(0, Math.floor((det.x1 - padX) / newW * origW));
  const by1 = Math.max(0, Math.floor((det.y1 - padY) / newH * origH));
  const bx2 = Math.min(origW, Math.ceil((det.x2 - padX) / newW * origW));
  const by2 = Math.min(origH, Math.ceil((det.y2 - padY) / newH * origH));

  const binary = new Uint8Array(origW * origH);
  for (let y = by1; y < by2; y++) {
    for (let x = bx1; x < bx2; x++) {
      if (upsampled[y * origW + x] > 0.5) binary[y * origW + x] = 1;
    }
  }

  const contour = marchingSquares(binary, origW, origH);
  if (contour.length < 3) return [];
  let simplified = douglasPeucker(contour, 1.0);
  if (simplified.length < 3) simplified = contour;

  const points: number[] = [];
  for (const [x, y] of simplified) points.push(clamp01(x / origW), clamp01(y / origH));
  return points;
}

function msEdgePoint(edge: number, x: number, y: number): [number, number] {
  switch (edge) {
    case 0: return [x + 0.5, y];
    case 1: return [x + 1, y + 0.5];
    case 2: return [x + 0.5, y + 1];
    default: return [x, y + 0.5];
  }
}

function marchingSquares(mask: Uint8Array, w: number, h: number): [number, number][] {
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
  return connectSegments(segments);
}

function connectSegments(segments: [[number, number], [number, number]][]): [number, number][] {
  const key = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const adj = new Map<string, [number, number][]>();
  for (const [p1, p2] of segments) {
    const k1 = key(p1), k2 = key(p2);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(p2);
    adj.get(k2)!.push(p1);
  }
  const visitedGlobal = new Set<string>();
  let bestPath: [number, number][] = [];
  for (const [segStart] of segments) {
    const k = key(segStart);
    if (visitedGlobal.has(k)) continue;
    const path: [number, number][] = [segStart];
    let current = segStart;
    const localVisited = new Set<string>([k]);
    for (;;) {
      const neighbors = adj.get(key(current)) || [];
      let next: [number, number] | null = null;
      for (const n of neighbors) {
        if (!localVisited.has(key(n))) { next = n; break; }
      }
      if (!next) break;
      localVisited.add(key(next));
      path.push(next);
      current = next;
    }
    localVisited.forEach((v) => visitedGlobal.add(v));
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

function pointToLineDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const first = points[0], last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}
