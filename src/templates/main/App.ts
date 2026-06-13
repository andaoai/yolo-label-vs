/**
 * 应用编排器 — 连接所有子系统
 *
 * 初始化顺序：
 * 1. Store（状态）
 * 2. WorkerBridge（渲染线程）
 * 3. ExtensionBridge（扩展通信）
 * 4. HistoryManager（历史）
 * 5. ToolManager（工具）
 * 6. InputManager（输入）
 * 7. DOMManager（UI）
 */
import type { Label } from '../shared/types';
import type { ExtensionMessage } from './communication/ExtensionBridge';
import type { WorkerToMainMessage } from '../shared/messages';
import { Store } from './state/Store';
import { HistoryManager } from './state/HistoryManager';
import * as LabelOps from './state/LabelOperations';
import { ExtensionBridge } from './communication/ExtensionBridge';
import { WorkerBridge } from './communication/WorkerBridge';
import { ToolManager } from './input/tools/ToolManager';
import { InputManager } from './input/InputManager';
import { DOMManager, type DOMCallbacks } from './ui/DOMManager';
import { ThemeManager } from './ui/ThemeManager';
import { COLORS } from '../shared/config';

export class App {
  readonly store: Store;
  readonly history: HistoryManager;
  readonly extension: ExtensionBridge;
  readonly worker: WorkerBridge;
  readonly toolManager: ToolManager;
  readonly dom: DOMManager;

  private inputManager: InputManager | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private savedState: string = ''; // JSON.stringify of labels for unsaved check
  private previewCache: Map<number, string> = new Map(); // index → base64
  private pendingPreviewRange: { startIndex: number; endIndex: number } | null = null;
  private previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // 1. Store
    this.store = new Store();

    // 2. Worker
    const workerUrl = this.resolveWorkerUrl();
    this.worker = new WorkerBridge(workerUrl);

    // 3. Extension
    this.extension = new ExtensionBridge();

    // 4. History
    this.history = new HistoryManager();

    // 5. Tools
    this.toolManager = new ToolManager(this.store, this.worker);

    // 6. DOM
    const themeManager = new ThemeManager(this.store, this.worker);
    this.dom = new DOMManager(this.store, this.createDOMCallbacks(), themeManager);
  }

  /** 启动应用 */
  async start(): Promise<void> {
    // 等待 Worker 就绪
    await this.waitForWorker();

    // 监听 Worker 后续消息（transformComputed 等）
    this.worker.onMessage((msg) => this.handleWorkerMessage(msg));

    // 初始化 Canvas
    this.initCanvas();

    // 初始化输入
    this.initInput();

    // 初始化 DOM
    this.dom.init();

    // 加载初始数据
    this.loadInitialData();

    // 监听扩展消息
    this.extension.onMessage((msg) => this.handleExtensionMessage(msg));

    // 请求图片列表
    this.extension.getImageList();

    // 监听窗口大小变化
    window.addEventListener('resize', this.handleResize);

    // 全局 Ctrl+S
    document.addEventListener('keydown', (e) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.save();
      }
    });
  }

  // ─── 初始化 ───────────────────────────────────────────

  private initCanvas(): void {
    this.canvas = document.getElementById('imageCanvas') as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error('Canvas element not found');
    }

    // 创建 OffscreenCanvas 并传输给 Worker
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const offscreen = this.canvas.transferControlToOffscreen();

    this.worker.init(offscreen, this.store.toRenderConfig(dpr));
    this.worker.resize(rect.width, rect.height);
  }

  private initInput(): void {
    if (!this.canvas) return;

    this.inputManager = new InputManager(this.canvas, this.store, this.worker, this.toolManager, {
      onLabelAdded: () => {},
      onLabelUpdated: () => {},
      onLabelRemoved: () => {},
      onPushHistory: () => this.pushHistory(),
      onUpdateLabelList: () => this.dom.updateLabelList(),
      onNavigateNext: () => this.navigateNext(),
      onNavigatePrevious: () => this.navigatePrevious(),
      onSave: () => this.save(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onResetView: () => this.resetView(),
      onCycleClass: (dir) => this.cycleClass(dir),
      onCopyLabel: () => this.copyLabel(),
      onPasteLabel: () => this.pasteLabel(),
    });
  }

  private loadInitialData(): void {
    // 从 HTML 注入的全局变量读取初始数据
    const w = window as any;
    if (w.classNames) {
      this.store.set('classNames', w.classNames);
      // 同步到 Worker（Worker 初始化时用的是默认值）
      this.worker.updateConfig({ classNames: w.classNames });
    }
    if (w.kptShape) {
      this.store.set('kptShape', w.kptShape);
      this.worker.updateConfig({ kptShape: w.kptShape });
      // 有 kptShape 说明是 pose 模型，自动切换到 pose 模式
      this.toolManager.setActive('pose');
    }
    if (w.initialImageData) {
      // 有初始图片数据
      const imageInfo = `图片 1/1`;
      this.handleImageData(w.initialImageData, w.initialLabels || [], w.currentPath || '', imageInfo);
    }
  }

  // ─── 扩展消息处理 ─────────────────────────────────────

  private handleExtensionMessage(msg: ExtensionMessage): void {
    switch (msg.command) {
      case 'imageList':
        this.handleImageList(msg.paths);
        break;
      case 'updateImage':
        this.handleImageData(msg.imageData, msg.labels, msg.currentPath, msg.imageInfo);
        break;
      case 'error':
        this.showError(msg.error);
        break;
      case 'saveSuccess':
        this.onSaveSuccess();
        break;
      case 'imagePreviews':
        this.store.set('imagePreviews', msg.previews);
        break;
      case 'imagePreviewRange':
        this.handleImagePreviewRange(msg.startIndex, msg.previews);
        break;
    }
  }

  private handleImageList(paths: string[]): void {
    this.store.set('allPaths', paths);
    // 不再一次性请求所有缩略图，改为按需懒加载

    // 如果没有当前图片，加载第一张
    if (!this.store.get('currentPath') && paths.length > 0) {
      this.extension.loadImage(paths[0]);
    }
  }

  /**
   * 按需请求缩略图范围 — 防抖 + 缓存
   * 由 ProgressBar 在 hover 时调用
   */
  requestPreviewRange(startIndex: number, endIndex: number): void {
    const paths = this.store.get('allPaths');
    if (paths.length === 0) return;

    // 限制范围
    const clampedStart = Math.max(0, startIndex);
    const clampedEnd = Math.min(paths.length - 1, endIndex);

    // 找出未缓存的索引
    const missing: number[] = [];
    for (let i = clampedStart; i <= clampedEnd; i++) {
      if (!this.previewCache.has(i)) {
        missing.push(i);
      }
    }
    if (missing.length === 0) return;

    // 合并到待请求范围
    const minIdx = missing[0];
    const maxIdx = missing[missing.length - 1];

    if (this.pendingPreviewRange) {
      // 扩展已有待请求范围
      this.pendingPreviewRange.startIndex = Math.min(this.pendingPreviewRange.startIndex, minIdx);
      this.pendingPreviewRange.endIndex = Math.max(this.pendingPreviewRange.endIndex, maxIdx);
    } else {
      this.pendingPreviewRange = { startIndex: minIdx, endIndex: maxIdx };
    }

    // 防抖 200ms
    if (this.previewDebounceTimer) clearTimeout(this.previewDebounceTimer);
    this.previewDebounceTimer = setTimeout(() => this.flushPreviewRequest(), 200);
  }

  private flushPreviewRequest(): void {
    if (!this.pendingPreviewRange) return;
    const { startIndex, endIndex } = this.pendingPreviewRange;
    this.pendingPreviewRange = null;

    const paths = this.store.get('allPaths');
    const slice = paths.slice(startIndex, endIndex + 1);
    if (slice.length > 0) {
      this.extension.getImagePreviewRange(slice, startIndex);
    }
  }

  private handleImagePreviewRange(startIndex: number, previews: string[]): void {
    // 写入缓存
    for (let i = 0; i < previews.length; i++) {
      if (previews[i]) {
        this.previewCache.set(startIndex + i, previews[i]);
      }
    }
    // 同步到 Store（用于 ProgressBar 读取）
    this.syncPreviewCacheToStore();
  }

  private syncPreviewCacheToStore(): void {
    const paths = this.store.get('allPaths');
    const arr: string[] = new Array(paths.length).fill('');
    for (const [idx, data] of this.previewCache) {
      arr[idx] = data;
    }
    this.store.set('imagePreviews', arr);
  }

  private async handleImageData(
    imageData: string, labels: any[], currentPath: string, imageInfo: string,
  ): Promise<void> {
    // 解码图片为 ImageBitmap
    const response = await fetch(imageData);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    this.store.batch({
      currentPath,
      image: bitmap,
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
      labels: labels as Label[],
      imageInfo,
      hasUnsavedChanges: false,
      hoveredLabelIndex: null,
      hoveredPoint: null,
    });

    // 同步到 Worker
    this.worker.setImage(bitmap, bitmap.width, bitmap.height);
    this.worker.setLabels(labels as Label[]);

    // 初始化历史
    this.history.initImage(currentPath, labels as Label[]);
    this.savedState = JSON.stringify(labels);

    // 适应画布
    this.resetView();

    // 根据标签类型自动切换工具模式
    this.autoSwitchTool(labels as Label[]);

    // 更新 UI
    this.dom.updateLabelList();
    this.updateNavButtons();
  }

  // ─── 工具自动切换 ──────────────────────────────────────

  /**
   * 根据标签类型自动切换工具模式
   * - 有 isPose 标签 → pose 模式
   * - 有 isSegmentation 标签 → seg 模式
   * - 否则保持当前模式（通常为 box）
   */
  private autoSwitchTool(labels: Label[]): void {
    if (labels.length === 0) return;

    // 优先检测 pose（因为 pose 标签也有 bbox）
    const hasPose = labels.some(l => l.isPose);
    if (hasPose) {
      this.toolManager.setActive('pose');
      return;
    }

    // 检测分割
    const hasSeg = labels.some(l => l.isSegmentation);
    if (hasSeg) {
      this.toolManager.setActive('seg');
      return;
    }

    // 普通检测标签，切换到 box 模式
    this.toolManager.setActive('box');
  }

  // ─── 导航 ─────────────────────────────────────────────

  private navigateNext(): void {
    this.autoSaveBeforeNav();
    this.extension.next();
  }

  private navigatePrevious(): void {
    this.autoSaveBeforeNav();
    this.extension.previous();
  }

  private autoSaveBeforeNav(): void {
    if (this.store.get('hasUnsavedChanges')) {
      this.save();
    }
  }

  private updateNavButtons(): void {
    const paths = this.store.get('allPaths');
    const current = this.store.get('currentPath');
    const index = paths.indexOf(current);
    this.dom.updateNavButtons(index > 0, index < paths.length - 1);
  }

  // ─── 保存 ─────────────────────────────────────────────

  save(): void {
    if (!this.store.get('hasUnsavedChanges')) return;
    this.extension.save(this.store.get('labels'));
  }

  private onSaveSuccess(): void {
    this.store.set('hasUnsavedChanges', false);
    this.savedState = JSON.stringify(this.store.get('labels'));
  }

  // ─── 历史 ─────────────────────────────────────────────

  pushHistory(): void {
    const path = this.store.get('currentPath');
    if (!path) return;
    this.history.push(path, this.store.get('labels'));
    this.store.set('hasUnsavedChanges', true);
  }

  undo(): void {
    const path = this.store.get('currentPath');
    if (!path) return;
    const labels = this.history.undo(path);
    if (labels) {
      this.store.set('labels', labels);
      this.worker.setLabels(labels);
      this.dom.updateLabelList();
      this.checkUnsavedChanges();
    }
  }

  redo(): void {
    const path = this.store.get('currentPath');
    if (!path) return;
    const labels = this.history.redo(path);
    if (labels) {
      this.store.set('labels', labels);
      this.worker.setLabels(labels);
      this.dom.updateLabelList();
      this.checkUnsavedChanges();
    }
  }

  private checkUnsavedChanges(): void {
    const current = JSON.stringify(this.store.get('labels'));
    this.store.set('hasUnsavedChanges', current !== this.savedState);
  }

  // ─── 视图 ─────────────────────────────────────────────

  private resetView(): void {
    this.worker.fitToCanvas();
  }

  private handleResize = (): void => {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.worker.resize(rect.width, rect.height);
    // 不自动重置视图，只调整画布尺寸
  };

  // ─── 类别 ─────────────────────────────────────────────

  copyLabel(): void {
    const hoveredIndex = this.store.get('hoveredLabelIndex');
    if (hoveredIndex === null) return;

    const labels = this.store.get('labels');
    if (hoveredIndex >= 0 && hoveredIndex < labels.length) {
      const cloned = LabelOps.cloneLabel(labels[hoveredIndex]);
      this.store.set('clipboard', cloned);
    }
  }

  pasteLabel(): void {
    const clipboard = this.store.get('clipboard');
    if (!clipboard) return;

    // 直接粘贴，不偏移
    const pasted: Label = {
      ...clipboard,
      visible: true,
    };

    // 深拷贝 points/keypoints
    if (pasted.points) pasted.points = [...pasted.points];
    if (pasted.keypoints) pasted.keypoints = [...pasted.keypoints];
    if (pasted.keypointShape) pasted.keypointShape = [...pasted.keypointShape];

    // 添加到标签列表
    const labels = [...this.store.get('labels'), pasted];
    this.store.set('labels', labels);
    this.worker.setLabels(labels);
    this.pushHistory();
    this.dom.updateLabelList();
  }

  cycleClass(direction: 1 | -1): void {
    const classNames = this.store.get('classNames');
    const current = this.store.get('currentClass');
    const next = (current + direction + classNames.length) % classNames.length;
    this.store.set('currentClass', next);
  }

  // ─── 标签操作 ─────────────────────────────────────────

  deleteLabel(index: number): void {
    this.store.removeLabel(index);
    this.worker.setLabels(this.store.get('labels'));
    this.pushHistory();
    this.dom.updateLabelList();
  }

  changeLabelClass(index: number, newClass: number): void {
    const labels = this.store.get('labels');
    const updated = LabelOps.changeClass(labels[index], newClass);
    this.store.updateLabel(index, updated);
    this.worker.setLabels(this.store.get('labels'));
    this.pushHistory();
    this.dom.updateLabelList();
  }

  toggleLabelVisibility(index: number): void {
    const labels = this.store.get('labels');
    const updated = LabelOps.toggleVisibility(labels[index]);
    this.store.updateLabel(index, updated);
    this.worker.setVisibility(index, updated.visible !== false);
    // 可见性切换不推入历史
  }

  // ─── Worker ───────────────────────────────────────────

  private handleWorkerMessage(msg: WorkerToMainMessage): void {
    switch (msg.type) {
      case 'transformComputed':
        this.store.batch({
          scale: msg.scale,
          translateX: msg.translateX,
          translateY: msg.translateY,
        });
        break;
    }
  }

  private async waitForWorker(): Promise<void> {
    // 先等待 Worker 脚本加载完成（blob URL 创建 + Worker 启动）
    await this.worker.whenReady();

    // 再等待 Worker 发送 'ready' 消息（确认 RenderEngine 已初始化）
    return new Promise((resolve) => {
      const sub = this.worker.onMessage((msg) => {
        if (msg.type === 'ready') {
          sub.unsubscribe();
          resolve();
        }
      });
    });
  }

  // ─── DOM 回调 ─────────────────────────────────────────

  private createDOMCallbacks(): DOMCallbacks {
    return {
      onNavigateNext: () => this.navigateNext(),
      onNavigatePrevious: () => this.navigatePrevious(),
      onOpenImageTab: () => this.extension.openImageInNewTab(this.store.get('currentPath')),
      onOpenTxtTab: () => {
        const path = this.store.get('currentPath');
        const txtPath = this.convertToTxtPath(path);
        this.extension.openTxtInNewTab(txtPath);
      },
      onToolChange: (tool) => this.toolManager.setActive(tool),
      onToggleLabels: () => {
        const show = !this.store.get('showLabels');
        this.store.set('showLabels', show);
        this.worker.setShowLabels(show);
      },
      onUndo: () => this.undo(),
      onSave: () => this.save(),
      onLoadImage: (path) => this.extension.loadImage(path),
      onClassChange: (idx, cls) => this.changeLabelClass(idx, cls),
      onDeleteLabel: (idx) => this.deleteLabel(idx),
      onToggleVisibility: (idx) => this.toggleLabelVisibility(idx),
      onHoverLabel: (idx) => {
        this.store.set('hoveredLabelIndex', idx);
        this.worker.setHoveredLabel(idx);
      },
      onPreviewHover: (start, end) => this.requestPreviewRange(start, end),
    };
  }

  // ─── 辅助 ─────────────────────────────────────────────

  private convertToTxtPath(imagePath: string): string {
    // /images/ → /labels/, .jpg → .txt
    return imagePath
      .replace(/\/images\//gi, '/labels/')
      .replace(/\.[^.\\/]+$/, '.txt');
  }

  private showError(message: string): void {
    // 简单的错误显示
    const existing = document.getElementById('errorOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'errorOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div style="background:#1e1e1e;padding:24px;border-radius:8px;max-width:500px;color:#f44336;">
        <h3 style="margin:0 0 12px;">Error</h3>
        <p style="margin:0 0 16px;">${message}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="errorClose" style="padding:8px 16px;cursor:pointer;">Close</button>
          <button id="errorReload" style="padding:8px 16px;cursor:pointer;background:#007acc;color:white;border:none;">Reload Panel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('errorClose')?.addEventListener('click', () => overlay.remove());
    document.getElementById('errorReload')?.addEventListener('click', () => this.extension.reload());
  }

  private resolveWorkerUrl(): string {
    // 优先使用扩展注入的 Worker URL
    const w = window as any;
    if (w.__workerUrl) {
      return w.__workerUrl;
    }
    // 回退：相对路径
    return 'worker.js';
  }
}
