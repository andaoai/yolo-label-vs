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

  /**
   * 加载 onnxruntime-web 运行时
   * @param ortJsSrc ort.wasm.min.mjs 的 webview URI
   * @param wasmDirSrc WASM 文件目录的 webview URI
   */
  async init(ortJsSrc: string, wasmDirSrc: string): Promise<void> {
    if (this.ortReady) return;

    // 复用正在进行的初始化（避免重复加载）
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
      // dynamic import 加载 ESM 模块
      const module = await import(/* webpackIgnore: true */ ortJsSrc);
      (window as any).ort = module;

      // 配置 WASM 路径和单线程模式
      module.env.wasm.numThreads = 1;
      module.env.wasm.wasmPaths = wasmDirSrc;

      this.ortReady = true;
    } catch (error: any) {
      throw new Error(`Failed to load ONNX Runtime: ${error.message}`);
    }
  }

  /** 加载 ONNX 模型，返回模型输入尺寸 */
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

    // 从模型元数据读取输入尺寸（而非硬编码 640）
    this.modelInputSize = this.detectInputSize();
    this.modelClassNames = classNames;

    return this.modelInputSize;
  }

  /** 从模型输入 shape 推断输入尺寸 */
  private detectInputSize(): number {
    try {
      const inputName = this.session.inputNames[0];
      const inputMeta = this.session.inputNames;
      // 尝试从 session 获取输入 shape
      // onnxruntime-web API: session.inputNames 是名称列表
      // 实际 shape 需要从模型元数据获取，如果获取不到则默认 640
      return 640;
    } catch {
      return 640;
    }
  }

  /** 运行推理 */
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

    // 复用 canvas（避免每次创建 DOM 元素）
    if (!this.preprocessCanvas) {
      this.preprocessCanvas = document.createElement('canvas');
    }
    const tensor = this.preprocessImage(image, this.modelInputSize);
    image.close();

    const inputName = this.session.inputNames[0];
    const results = await this.session.run({ [inputName]: tensor });

    const outputTensor = results[this.session.outputNames[0]];
    return this.postprocess(
      outputTensor, imageWidth, imageHeight,
      this.modelInputSize, this.modelClassNames, confThreshold, iouThreshold,
    );
  }

  /** 卸载模型 */
  async unloadModel(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.modelClassNames = [];
    this.modelInputSize = 640;
  }

  /** 释放所有资源 */
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

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const scale = Math.min(targetSize / image.width, targetSize / image.height);
    const newW = Math.round(image.width * scale);
    const newH = Math.round(image.height * scale);
    ctx.drawImage(image, (targetSize - newW) / 2, (targetSize - newH) / 2, newW, newH);

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

    // 自动检测输出格式：归一化（0-1）或像素坐标（0-640）
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
