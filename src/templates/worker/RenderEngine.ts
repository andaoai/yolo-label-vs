/**
 * 渲染引擎 — Worker 线程主控
 *
 * 协调 Renderer、HitTestEngine、AnimationController
 * 接收主线程消息，驱动渲染循环
 */
import type { Label, DrawPreview, PointRef, HitTestResult } from '../shared/types';
import type { RenderConfig, MainToWorkerMessage, WorkerToMainMessage } from '../shared/messages';
import { CoordinateTransform } from './CoordinateTransform';
import { HitTestEngine } from './HitTestEngine';
import { Renderer } from './Renderer';
import { AnimationController } from './AnimationController';

export class RenderEngine {
  readonly transform = new CoordinateTransform();
  readonly hitTest = new HitTestEngine(this.transform);
  readonly animation = new AnimationController();
  readonly renderer = new Renderer(this.transform, this.animation);

  private config: RenderConfig;
  private image: ImageBitmap | null = null;
  private labels: Label[] = [];
  private cursor: { x: number; y: number } | null = null;
  private hoveredLabelIndex: number | null = null;
  private selectedPoint: PointRef | null = null;
  private preview: DrawPreview | null = null;
  private showLabels = true;
  private dirty = true;

  constructor(config: RenderConfig) {
    this.config = config;
    this.animation.setFrameCallback(() => {
      this.dirty = true;
      this.renderIfNeeded();
    });
  }

  /** 初始化画布 */
  init(canvas: OffscreenCanvas, config: RenderConfig): void {
    this.config = config;
    this.renderer.bind(canvas);
    this.transform.setCanvasSize(canvas.width / config.devicePixelRatio, canvas.height / config.devicePixelRatio);
    this.renderer.resize(
      canvas.width / config.devicePixelRatio,
      canvas.height / config.devicePixelRatio,
      config.devicePixelRatio
    );
    this.dirty = true;
    this.renderIfNeeded();
  }

  /** 处理主线程消息 */
  handleMessage(msg: MainToWorkerMessage): WorkerToMainMessage | null {
    switch (msg.type) {
      case 'init':
        this.init(msg.canvas, msg.config);
        return { type: 'ready' };

      case 'setImage': {
        this.image = msg.image;
        this.transform.setImageSize(msg.width, msg.height);
        this.dirty = true;
        this.renderIfNeeded();
        return null;
      }

      case 'setLabels':
        this.labels = msg.labels;
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'setTransform':
        this.transform.setTransform(msg.scale, msg.translateX, msg.translateY);
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'setCursor':
        this.cursor = { x: msg.x, y: msg.y };
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'setHoveredLabel':
        this.hoveredLabelIndex = msg.index;
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'setTool':
        // 工具切换不影响渲染，但可能影响动画
        return null;

      case 'setPreview':
        this.preview = msg.preview;
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'setSelectedPoint':
        this.selectedPoint = msg.point;
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'requestHitTest': {
        const result = this.hitTest.hitTest(
          this.labels,
          { x: msg.x, y: msg.y },
          this.config,
        );
        return { type: 'hitTestResult', requestId: msg.requestId, result };
      }

      case 'setVisibility':
        if (msg.index >= 0 && msg.index < this.labels.length) {
          this.labels[msg.index].visible = msg.visible;
          this.dirty = true;
          this.renderIfNeeded();
        }
        return null;

      case 'updateConfig':
        this.config = { ...this.config, ...msg.config };
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'resize':
        this.transform.setCanvasSize(msg.width, msg.height);
        this.renderer.resize(msg.width, msg.height, this.config.devicePixelRatio);
        this.dirty = true;
        this.renderIfNeeded();
        return null;

      case 'fitToCanvas': {
        const t = this.transform.computeFitTransform();
        this.transform.setTransform(t.scale, t.translateX, t.translateY);
        this.dirty = true;
        this.renderIfNeeded();
        return { type: 'transformComputed', ...t };
      }

      case 'setShowLabels':
        this.showLabels = msg.show;
        this.dirty = true;
        this.renderIfNeeded();
        return null;
    }
  }

  /** 有脏标记时才渲染 */
  private renderIfNeeded(): void {
    if (!this.dirty) return;
    this.dirty = false;

    // 基于鼠标距离计算悬停强度（0~1），用于渐变动画
    let hoverStrength = 0;
    if (this.cursor && this.labels.length > 0) {
      const nearest = this.hitTest.findNearest(this.labels, this.cursor, this.config);
      if (nearest) {
        const threshold = this.config.hoverProximityThreshold / this.transform.scale;
        hoverStrength = 1 - nearest.distance / threshold;
      }
    }

    this.renderer.render(
      this.image,
      this.labels,
      this.config,
      this.cursor,
      this.hoveredLabelIndex,
      this.selectedPoint,
      this.preview,
      this.showLabels,
      hoverStrength,
    );

    // 如果有动画（悬停强度 > 0 或工具绘制中），保持动画循环
    const needsAnimation = hoverStrength > 0 || this.preview !== null;
    if (needsAnimation) {
      this.animation.start();
    } else {
      this.animation.stop();
    }
  }
}
