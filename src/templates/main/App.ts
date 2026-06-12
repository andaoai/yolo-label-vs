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
    });
  }

  private loadInitialData(): void {
    // 从 HTML 注入的全局变量读取初始数据
    const w = window as any;
    if (w.classNames) {
      this.store.set('classNames', w.classNames);
    }
    if (w.kptShape) {
      this.store.set('kptShape', w.kptShape);
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
    }
  }

  private handleImageList(paths: string[]): void {
    this.store.set('allPaths', paths);

    // 请求缩略图
    if (paths.length > 0) {
      this.extension.getImagePreviews(paths);
    }

    // 如果没有当前图片，加载第一张
    if (!this.store.get('currentPath') && paths.length > 0) {
      this.extension.loadImage(paths[0]);
    }
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

    // 更新 UI
    this.dom.updateLabelList();
    this.updateNavButtons();
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
