/**
 * 推理运行器 — 在主线程中执行 ONNX 推理
 *
 * 通过 dynamic import() 加载 onnxruntime-web ESM 模块，
 * 避免 Web Worker 中 import.meta.url 被 webpack 清空的问题。
 */
import type { Detection } from '../shared/types';

/** onnxruntime-web 全局对象 */
declare const ort: any;

export class InferenceRunner {
  private session: any = null;
  private modelInputSize = 640;
  private modelClassNames: string[] = [];
  private ortReady = false;
  private initPromise: Promise<void> | null = null;
  private preprocessCanvas: HTMLCanvasElement | null = null;

  async init(ortJsSrc: string, wasmDirSrc: string): Promise<void> {
    if (this.ortReady) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit(ortJsSrc, wasmDirSrc);
    try {
      await this.initPromise;
    } catch (e) {
      this.initPromise = null;
      throw e;
    }
  }

  private async doInit(ortJsSrc: string, wasmDirSrc: string): Promise<void> {
    try {
      const module = await import(/* webpackIgnore: true */ ortJsSrc);
      (window as any).ort = module;
      module.env.wasm.numThreads = 1;
      module.env.wasm.wasmPaths = wasmDirSrc;
      this.ortReady = true;
    } catch (error: any) {
      throw new Error(`Failed to load ONNX Runtime: ${error.message}`);
    }
  }

  async loadModel(modelData: ArrayBuffer, classNames: string[]): Promise<number> {
    if (!this.ortReady) {
      throw new Error('Runtime not initialized. Call init first.');
    }
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.session = await ort.InferenceSession.create(modelData, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    this.modelInputSize = this.detectInputSize();
    this.modelClassNames = classNames;
    return this.modelInputSize;
  }

  private detectInputSize(): number {
    try {
      const inputName = this.session.inputNames[0];
      const inputMeta = this.session.inputNames;
      return 640;
    } catch {
      return 640;
    }
  }

  async runInference(
    image: ImageBitmap,
    imageWidth: number,
    imageHeight: number,
    confThreshold: number,
    iouThreshold: number,
  ): Promise<Detection[]> {
    if (!this.session) {
      throw new Error('No model loaded');
    }

    if (!this.preprocessCanvas) {
      this.preprocessCanvas = document.createElement('canvas');
    }
    const tensor = this.preprocessImage(image, this.modelInputSize);
    image.close();

    const inputName = this.session.inputNames[0];
    const results = await this.session.run({ [inputName]: tensor });

    const outputNames = this.session.outputNames;
    const isSegModel = outputNames.length >= 2;

    if (isSegModel) {
      const detTensor = results[outputNames[0]];
      const protoTensor = results[outputNames[1]];
      return this.postprocessSeg(
        detTensor, protoTensor, imageWidth, imageHeight,
        this.modelInputSize, this.modelClassNames, confThreshold, iouThreshold,
      );
    } else {
      const outputTensor = results[outputNames[0]];
      return this.postprocess(
        outputTensor, imageWidth, imageHeight,
        this.modelInputSize, this.modelClassNames, confThreshold, iouThreshold,
      );
    }
  }

  async unloadModel(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.modelClassNames = [];
    this.modelInputSize = 640;
  }

  async dispose(): Promise<void> {
    await this.unloadModel();
    this.preprocessCanvas = null;
    this.ortReady = false;
    this.initPromise = null;
  }

  get isReady(): boolean { return this.ortReady; }
  get isModelLoaded(): boolean { return this.session !== null; }

  // ─── 内部方法 ────────────────────────────────────────

  private preprocessImage(image: ImageBitmap, targetSize: number): any {
    const canvas = this.preprocessCanvas!;
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#7F7F7F';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const scale = Math.min(targetSize / image.width, targetSize / image.height);
    const newW = Math.round(image.width * scale);
    const newH = Math.round(image.height * scale);
    const padX = (targetSize - newW) / 2;
    const padY = (targetSize - newH) / 2;
    ctx.drawImage(image, padX, padY, newW, newH);

    const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
    const pixels = imageData.data;
    const float32 = new Float32Array(3 * targetSize * targetSize);
    const area = targetSize * targetSize;

    for (let i = 0; i < area; i++) {
      const pIdx = i * 4;
      float32[i] = pixels[pIdx] / 255.0;
      float32[area + i] = pixels[pIdx + 1] / 255.0;
      float32[2 * area + i] = pixels[pIdx + 2] / 255.0;
    }

    return new ort.Tensor('float32', float32, [1, 3, targetSize, targetSize]);
  }

  // ─── 标准检测后处理 ──────────────────────────────────

  private postprocess(
    output: any, origWidth: number, origHeight: number,
    inputSize: number, classNames: string[],
    confThreshold: number, iouThreshold: number,
  ): Detection[] {
    const data = output.data as Float32Array;
    const shape = output.dims;
    const numFeatures = shape.length === 3 ? shape[1] : shape[0];
    const numDetections = shape.length === 3 ? shape[2] : shape[1];
    const numClasses = numFeatures - 4;

    let maxCoord = 0;
    for (let i = 0; i < Math.min(numDetections, 100); i++) {
      maxCoord = Math.max(maxCoord, data[i], data[numDetections + i]);
    }
    const isNormalized = maxCoord <= 1.5;

    const scale = Math.min(inputSize / origWidth, inputSize / origHeight);
    const newW = origWidth * scale;
    const newH = origHeight * scale;
    const offsetX = (inputSize - newW) / 2;
    const offsetY = (inputSize - newH) / 2;

    const boxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const scores: number[] = [];
    const classIds: number[] = [];

    for (let i = 0; i < numDetections; i++) {
      const cx = data[i];
      const cy = data[numDetections + i];
      const w = data[2 * numDetections + i];
      const h = data[3 * numDetections + i];

      let maxScore = 0;
      let maxClassId = 0;
      for (let j = 0; j < numClasses; j++) {
        const score = data[(4 + j) * numDetections + i];
        if (score > maxScore) { maxScore = score; maxClassId = j; }
      }

      if (maxScore > confThreshold) {
        let x1: number, y1: number, x2: number, y2: number;

        if (isNormalized) {
          x1 = cx - w / 2;
          y1 = cy - h / 2;
          x2 = cx + w / 2;
          y2 = cy + h / 2;
        } else {
          x1 = ((cx - w / 2) - offsetX) / newW;
          y1 = ((cy - h / 2) - offsetY) / newH;
          x2 = ((cx + w / 2) - offsetX) / newW;
          y2 = ((cy + h / 2) - offsetY) / newH;
        }

        boxes.push({ x1, y1, x2, y2 });
        scores.push(maxScore);
        classIds.push(maxClassId);
      }
    }

    return this.nms(boxes, scores, classIds, iouThreshold).map(idx => ({
      class: classIds[idx],
      className: classNames[classIds[idx]] || String(classIds[idx]),
      confidence: scores[idx],
      x: Math.max(0, Math.min(1, boxes[idx].x1)),
      y: Math.max(0, Math.min(1, boxes[idx].y1)),
      width: Math.max(0, Math.min(1, boxes[idx].x2 - boxes[idx].x1)),
      height: Math.max(0, Math.min(1, boxes[idx].y2 - boxes[idx].y1)),
    }));
  }

  // ─── YOLO-seg 后处理（严格按照 ultralytics 官方流程） ────

  /**
   * 官方流程：
   * 1. 解析 output0: [1, 4+nc+32, 8400] -> bbox + class scores + mask coefficients
   * 2. 置信度过滤 + NMS
   * 3. 对每个检测: coeffs @ protos -> sigmoid -> crop to bbox -> 裁剪 padding -> resize 到原图 -> threshold
   * 4. 将二值 mask 转换为多边形轮廓点
   */
  private postprocessSeg(
    detTensor: any, protoTensor: any,
    origWidth: number, origHeight: number,
    inputSize: number, classNames: string[],
    confThreshold: number, iouThreshold: number,
  ): Detection[] {
    const detData = detTensor.data as Float32Array;
    const detShape = detTensor.dims;
    const numFeatures = detShape.length === 3 ? detShape[1] : detShape[0];
    const numDetections = detShape.length === 3 ? detShape[2] : detShape[1];

    const numMasks = 32;
    const numClasses = numFeatures - 4 - numMasks;

    const protoData = protoTensor.data as Float32Array;
    const protoShape = protoTensor.dims;
    const maskH = protoShape.length === 4 ? protoShape[2] : 160;
    const maskW = protoShape.length === 4 ? protoShape[3] : 160;

    // 计算 letterbox 参数
    const scale = Math.min(inputSize / origWidth, inputSize / origHeight);
    const newW = origWidth * scale;
    const newH = origHeight * scale;
    const padX = (inputSize - newW) / 2;
    const padY = (inputSize - newH) / 2;

    // Step 1: 解析所有候选，过滤低置信度
    interface Candidate {
      x1: number; y1: number; x2: number; y2: number; // 输入图像坐标系 (0~inputSize)
      score: number; classId: number; coeffs: number[];
    }
    const candidates: Candidate[] = [];

    for (let i = 0; i < numDetections; i++) {
      const cx = detData[0 * numDetections + i];
      const cy = detData[1 * numDetections + i];
      const w = detData[2 * numDetections + i];
      const h = detData[3 * numDetections + i];

      let maxScore = 0, maxClass = 0;
      for (let j = 0; j < numClasses; j++) {
        const s = detData[(4 + j) * numDetections + i];
        if (s > maxScore) { maxScore = s; maxClass = j; }
      }

      if (maxScore < confThreshold) continue;

      const x1 = cx - w / 2, y1 = cy - h / 2;
      const x2 = cx + w / 2, y2 = cy + h / 2;

      const coeffs: number[] = [];
      for (let m = 0; m < numMasks; m++) {
        coeffs.push(detData[(4 + numClasses + m) * numDetections + i]);
      }

      candidates.push({ x1, y1, x2, y2, score: maxScore, classId: maxClass, coeffs });
    }

    // Step 2: NMS
    const selected = this.nmsCandidates(candidates, iouThreshold);

    // Step 3: 对每个检测生成 mask
    const protoArea = maskH * maskW;
    const gainMH = maskH / inputSize;
    const gainMW = maskW / inputSize;

    // 从 proto 裁剪 padding 区域
    const cropL = Math.floor(padX * gainMW);
    const cropT = Math.floor(padY * gainMH);
    const cropR = maskW - Math.ceil(padX * gainMW);
    const cropB = maskH - Math.ceil(padY * gainMH);
    const effW = cropR - cropL;
    const effH = cropB - cropT;

    return selected.map(idx => {
      const det = candidates[idx];

      // 3a. 矩阵乘法: coeffs [32] @ protoData [32, maskH*maskW] -> [maskH*maskW]
      //     然后 sigmoid
      const rawMask = new Float32Array(protoArea);
      for (let hw = 0; hw < protoArea; hw++) {
        let sum = 0;
        for (let m = 0; m < numMasks; m++) {
          sum += det.coeffs[m] * protoData[m * protoArea + hw];
        }
        rawMask[hw] = 1 / (1 + Math.exp(-sum)); // sigmoid
      }

      // 3b. crop to bbox（bbox 缩放到 proto 分辨率）
      const bx1 = Math.max(0, Math.floor(det.x1 * gainMW));
      const by1 = Math.max(0, Math.floor(det.y1 * gainMH));
      const bx2 = Math.min(maskW, Math.ceil(det.x2 * gainMW));
      const by2 = Math.min(maskH, Math.ceil(det.y2 * gainMH));

      for (let y = 0; y < maskH; y++) {
        for (let x = 0; x < maskW; x++) {
          if (x < bx1 || x >= bx2 || y < by1 || y >= by2) {
            rawMask[y * maskW + x] = 0;
          }
        }
      }

      // 3c. Bilinear upsample 到原图尺寸（与 ultralytics 官方一致）
      //     然后 crop to bbox → threshold → 提取轮廓
      const points = this.maskToPolygon(
        rawMask, maskW, maskH,
        det.x1, det.y1, det.x2, det.y2,
        padX, padY, newW, newH, origWidth, origHeight,
      );

      // bbox 归一化到原图坐标
      const normX1 = Math.max(0, (det.x1 - padX) / newW);
      const normY1 = Math.max(0, (det.y1 - padY) / newH);
      const normX2 = Math.min(1, (det.x2 - padX) / newW);
      const normY2 = Math.min(1, (det.y2 - padY) / newH);

      return {
        class: det.classId,
        className: classNames[det.classId] || String(det.classId),
        confidence: det.score,
        x: normX1,
        y: normY1,
        width: normX2 - normX1,
        height: normY2 - normY1,
        points,
      };
    });
  }

  // ─── Marching Squares 轮廓提取 ──────────────────────────────
  // 4 角编码: NW(bit3) NE(bit2) SE(bit1) SW(bit0)
  // 每种情况产生 0-2 条边, 边: 0=top, 1=right, 2=bottom, 3=left
  private static readonly MS_EDGES: [number, number][][] = [
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

  /**
   * 从 proto mask 提取归一化多边形点
   *
   * 严格按照 ultralytics 官方流程:
   * 1. Bilinear upsample rawMask 到原图尺寸
   * 2. Crop to bbox（原图坐标系）
   * 3. Threshold 0.5 → binary
   * 4. Marching Squares 提取轮廓（原图分辨率，保留细节）
   * 5. 归一化坐标（直接 /origW, /origH）
   */
  private maskToPolygon(
    rawMask: Float32Array, maskW: number, maskH: number,
    detX1: number, detY1: number, detX2: number, detY2: number,
    padX: number, padY: number, newW: number, newH: number,
    origW: number, origH: number,
  ): number[] {
    // Step 1: Bilinear upsample 到原图尺寸
    const upsampled = new Float32Array(origW * origH);
    for (let oy = 0; oy < origH; oy++) {
      for (let ox = 0; ox < origW; ox++) {
        // 原图像素 → proto 坐标
        // 原图 → input: ix = ox/origW * newW + padX
        // input → proto: px = ix / inputSize * maskW
        const mx = (ox / origW * newW + padX) / this.modelInputSize * maskW;
        const my = (oy / origH * newH + padY) / this.modelInputSize * maskH;
        upsampled[oy * origW + ox] = this.bilinearSample(rawMask, maskW, maskH, mx, my);
      }
    }

    // Step 2: bbox 从输入图像坐标转到原图坐标，crop + threshold
    // det 坐标在输入图像空间(0~inputSize)，先去掉 letterbox padding，再缩放到原图
    const bx1 = Math.max(0, Math.floor((detX1 - padX) / newW * origW));
    const by1 = Math.max(0, Math.floor((detY1 - padY) / newH * origH));
    const bx2 = Math.min(origW, Math.ceil((detX2 - padX) / newW * origW));
    const by2 = Math.min(origH, Math.ceil((detY2 - padY) / newH * origH));

    const binaryMask = new Uint8Array(origW * origH);
    for (let y = by1; y < by2; y++) {
      for (let x = bx1; x < bx2; x++) {
        if (upsampled[y * origW + x] > 0.5) {
          binaryMask[y * origW + x] = 1;
        }
      }
    }

    // Step 3: Marching Squares 在原图分辨率提取轮廓
    const contour = this.marchingSquaresContour(binaryMask, origW, origH);
    if (contour.length < 3) return [];

    // Step 4: Douglas-Peucker 简化（tolerance=1 原图像素）
    let simplified = this.douglasPeucker(contour, 1.0);
    if (simplified.length < 3) simplified = contour;

    // Step 5: 归一化坐标（原图坐标 / 原图尺寸）
    const points: number[] = [];
    for (const [x, y] of simplified) {
      points.push(
        Math.max(0, Math.min(1, x / origW)),
        Math.max(0, Math.min(1, y / origH)),
      );
    }
    return points;
  }

  /**
   * Marching Squares 轮廓提取
   *
   * 对每个 2x2 像素格子，根据 4 角的 0/1 编码生成边界线段，
   * 然后将线段连接为闭合路径。提取的是前景/背景之间的 iso-contour。
   */
  private marchingSquaresContour(
    mask: Uint8Array, w: number, h: number,
  ): [number, number][] {
    const edges = InferenceRunner.MS_EDGES;

    // 生成线段
    const segments: [[number, number], [number, number]][] = [];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const nw = mask[y * w + x] ? 1 : 0;
        const ne = mask[y * w + x + 1] ? 1 : 0;
        const se = mask[(y + 1) * w + x + 1] ? 1 : 0;
        const sw = mask[(y + 1) * w + x] ? 1 : 0;
        const code = (nw << 3) | (ne << 2) | (se << 1) | sw;

        for (const [e1, e2] of edges[code]) {
          segments.push([
            this.msEdgePoint(e1, x, y),
            this.msEdgePoint(e2, x, y),
          ]);
        }
      }
    }

    if (segments.length === 0) return [];

    // 连接线段为路径
    return this.connectSegments(segments);
  }

  /** 边中点坐标 */
  private msEdgePoint(edge: number, x: number, y: number): [number, number] {
    switch (edge) {
      case 0: return [x + 0.5, y];
      case 1: return [x + 1, y + 0.5];
      case 2: return [x + 0.5, y + 1];
      case 3: return [x, y + 0.5];
    }
    return [x, y];
  }

  /** 连接线段为闭合路径 */
  private connectSegments(
    segments: [[number, number], [number, number]][],
  ): [number, number][] {
    const key = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

    // 建立邻接表
    const adj = new Map<string, [number, number][]>();
    for (const [p1, p2] of segments) {
      const k1 = key(p1), k2 = key(p2);
      if (!adj.has(k1)) adj.set(k1, []);
      if (!adj.has(k2)) adj.set(k2, []);
      adj.get(k1)!.push(p2);
      adj.get(k2)!.push(p1);
    }

    // 找最长连通分量（可能有多个分离的 mask 区域）
    const visitedGlobal = new Set<string>();
    let bestPath: [number, number][] = [];

    for (const [segStart] of segments) {
      const k = key(segStart);
      if (visitedGlobal.has(k)) continue;

      const path: [number, number][] = [segStart];
      let current = segStart;
      const localVisited = new Set<string>([k]);

      while (true) {
        const neighbors = adj.get(key(current)) || [];
        let next: [number, number] | null = null;
        for (const n of neighbors) {
          if (!localVisited.has(key(n))) {
            next = n;
            break;
          }
        }
        if (!next) break;
        localVisited.add(key(next));
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
        bestPath.push(first);
      }
    }

    return bestPath;
  }

  /**
   * Douglas-Peucker 线简化算法
   * 等价于 cv2.approxPolyDP(contour, epsilon, closed=True)
   *
   * @param points 轮廓点数组
   * @param tolerance 最大允许偏差（像素）
   */
  private douglasPeucker(
    points: [number, number][], tolerance: number,
  ): [number, number][] {
    if (points.length <= 2) return points;

    // 找距离首尾连线最远的点
    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.pointToLineDistance(points[i], first, last);
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }

    // 如果最远点超过阈值，递归简化
    if (maxDist > tolerance) {
      const left = this.douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
      const right = this.douglasPeucker(points.slice(maxIdx), tolerance);
      return left.slice(0, -1).concat(right);
    }

    // 否则，只保留首尾
    return [first, last];
  }

  /** 点到线段的距离 */
  private pointToLineDistance(
    point: [number, number],
    lineStart: [number, number],
    lineEnd: [number, number],
  ): number {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const px = point[0] - lineStart[0];
      const py = point[1] - lineStart[1];
      return Math.sqrt(px * px + py * py);
    }
    const t = Math.max(0, Math.min(1,
      ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq,
    ));
    const projX = lineStart[0] + t * dx;
    const projY = lineStart[1] + t * dy;
    const ex = point[0] - projX;
    const ey = point[1] - projY;
    return Math.sqrt(ex * ex + ey * ey);
  }

  /** 双线性插值采样 */
  private bilinearSample(
    data: Float32Array, w: number, h: number, x: number, y: number,
  ): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = x - x0, fy = y - y0;
    const v00 = data[y0 * w + x0] || 0;
    const v10 = data[y0 * w + x1] || 0;
    const v01 = data[y1 * w + x0] || 0;
    const v11 = data[y1 * w + x1] || 0;
    return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
           v01 * (1 - fx) * fy + v11 * fx * fy;
  }

  /** NMS for candidates */
  private nmsCandidates(
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

  private nms(
    boxes: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    scores: number[], classIds: number[], iouThreshold: number,
  ): number[] {
    const indices = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const selected: number[] = [];
    const suppressed = new Set<number>();

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (suppressed.has(idx)) continue;
      selected.push(idx);
      for (let j = i + 1; j < indices.length; j++) {
        const jdx = indices[j];
        if (suppressed.has(jdx) || classIds[idx] !== classIds[jdx]) continue;
        if (this.calculateIoU(boxes[idx], boxes[jdx]) > iouThreshold) suppressed.add(jdx);
      }
    }
    return selected;
  }

  private calculateIoU(
    a: { x1: number; y1: number; x2: number; y2: number },
    b: { x1: number; y1: number; x2: number; y2: number },
  ): number {
    const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return intersection / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection + 1e-6);
  }
}
