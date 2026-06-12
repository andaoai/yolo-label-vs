/**
 * Worker 通信桥 — 主线程 ↔ Worker 渲染线程
 *
 * 类型安全的消息收发
 * 支持 ImageBitmap 零拷贝传输
 */
import type { MainToWorkerMessage, WorkerToMainMessage, RenderConfig } from '../../shared/messages';
import type { Label, ToolType, DrawPreview, PointRef, HitTestResult } from '../../shared/types';

type MessageHandler = (msg: WorkerToMainMessage) => void;

export class WorkerBridge {
  private worker: Worker | null = null;
  private handlers = new Set<MessageHandler>();
  private hitTestCallbacks = new Map<number, (result: HitTestResult) => void>();
  private hitTestId = 0;
  private ready: Promise<void>;

  constructor(workerScriptUrl: string) {
    this.ready = this.initWorker(workerScriptUrl);
  }

  /** 通过 fetch + blob URL 加载 Worker（绕过 VS Code WebView CSP） */
  private async initWorker(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const scriptText = await response.text();
      const blob = new Blob([scriptText], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      this.worker = new Worker(blobUrl);

      this.worker.onmessage = (e: MessageEvent<WorkerToMainMessage>) => {
        const msg = e.data;

        // 命中检测结果走专用回调
        if (msg.type === 'hitTestResult') {
          const callback = this.hitTestCallbacks.get(msg.requestId);
          if (callback) {
            callback(msg.result);
            this.hitTestCallbacks.delete(msg.requestId);
          }
        }

        // 广播给所有处理器
        for (const handler of this.handlers) {
          handler(msg);
        }
      };

      this.worker.onerror = (e) => {
        console.error('[WorkerBridge] Worker error:', e);
      };
    } catch (err) {
      console.error('[WorkerBridge] Failed to load Worker:', err);
      throw err;
    }
  }

  /** 等待 Worker 加载完成 */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** 注册消息处理器 */
  onMessage(handler: MessageHandler): { unsubscribe(): void } {
    this.handlers.add(handler);
    return { unsubscribe: () => this.handlers.delete(handler) };
  }

  /** 发送消息到 Worker */
  send(msg: MainToWorkerMessage, transfer?: Transferable[]): void {
    if (!this.worker) {
      console.warn('[WorkerBridge] Worker not ready, message dropped:', msg.type);
      return;
    }
    if (transfer) {
      this.worker.postMessage(msg, transfer);
    } else {
      this.worker.postMessage(msg);
    }
  }

  // ─── 便捷方法 ─────────────────────────────────────────

  /** 初始化 Worker */
  init(canvas: OffscreenCanvas, config: RenderConfig): void {
    this.send({ type: 'init', canvas, config }, [canvas]);
  }

  /** 设置图片（使用 ImageBitmap 零拷贝传输） */
  setImage(image: ImageBitmap, width: number, height: number): void {
    this.send({ type: 'setImage', image, width, height }, [image]);
  }

  /** 设置标签列表 */
  setLabels(labels: Label[]): void {
    this.send({ type: 'setLabels', labels });
  }

  /** 设置视图变换 */
  setTransform(scale: number, translateX: number, translateY: number): void {
    this.send({ type: 'setTransform', scale, translateX, translateY });
  }

  /** 更新鼠标位置 */
  setCursor(x: number, y: number): void {
    this.send({ type: 'setCursor', x, y });
  }

  /** 设置悬停标签 */
  setHoveredLabel(index: number | null): void {
    this.send({ type: 'setHoveredLabel', index });
  }

  /** 设置当前工具 */
  setTool(tool: ToolType): void {
    this.send({ type: 'setTool', tool });
  }

  /** 设置绘制预览 */
  setPreview(preview: DrawPreview | null): void {
    this.send({ type: 'setPreview', preview });
  }

  /** 设置选中的点 */
  setSelectedPoint(point: PointRef | null): void {
    this.send({ type: 'setSelectedPoint', point });
  }

  /** 设置标签可见性 */
  setVisibility(index: number, visible: boolean): void {
    this.send({ type: 'setVisibility', index, visible });
  }

  /** 更新渲染配置 */
  updateConfig(config: Partial<RenderConfig>): void {
    this.send({ type: 'updateConfig', config });
  }

  /** 调整画布尺寸 */
  resize(width: number, height: number): void {
    this.send({ type: 'resize', width, height });
  }

  /** 重置视图（适应画布） */
  fitToCanvas(): void {
    this.send({ type: 'fitToCanvas' });
  }

  /** 设置是否显示标签文字 */
  setShowLabels(show: boolean): void {
    this.send({ type: 'setShowLabels', show });
  }

  /**
   * 请求命中检测（异步返回）
   * @returns Promise，resolve 时返回命中结果
   */
  requestHitTest(x: number, y: number): Promise<HitTestResult> {
    const requestId = ++this.hitTestId;
    return new Promise((resolve) => {
      this.hitTestCallbacks.set(requestId, resolve);
      this.send({ type: 'requestHitTest', x, y, requestId });
    });
  }

  /** 销毁 Worker */
  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.handlers.clear();
    this.hitTestCallbacks.clear();
  }
}
