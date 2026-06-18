/**
 * 输入管理器 — 鼠标/键盘事件捕获与分发
 *
 * 职责：
 * 1. 捕获 DOM 事件
 * 2. 坐标转换（屏幕 → 归一化）
 * 3. 修饰键状态跟踪
 * 4. 路由到 ToolManager / PanZoom / 快捷键
 */
import type { NormalizedPoint, Modifiers, PointRef, HitTestResult } from '../../shared/types';
import type { Store } from '../state/Store';
import type { WorkerBridge } from '../communication/WorkerBridge';
import type { ToolManager } from './tools/ToolManager';
import type { ToolResult } from './tools/Tool';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_SPEED, SCROLL_SPEED } from '../../shared/config';
import { clamp01 } from '../../shared/math';
import * as LabelOps from '../state/LabelOperations';

/** 输入事件回调 */
export interface InputCallbacks {
  onPushHistory: () => void;
  onUpdateLabelList: () => void;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetView: () => void;
  onCycleClass: (direction: 1 | -1) => void;
  onCopyLabel: () => void;
  onPasteLabel: () => void;
  onDeleteLabel: (index: number) => void;
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private store: Store;
  private worker: WorkerBridge;
  private toolManager: ToolManager;
  private callbacks: InputCallbacks;

  private modifiers: Modifiers = { ctrl: false, alt: false, shift: false };

  // 平移状态
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  // 拖拽状态（Ctrl + 拖拽点/标签）
  private isDraggingPoint = false;
  private selectedPoint: PointRef | null = null;
  private isDraggingLabel = false;
  private draggedLabelIndex = -1;
  private dragStartX = 0;
  private dragStartY = 0;

  // 节流
  private mouseMoveThrottled = false;

  constructor(
    canvas: HTMLCanvasElement,
    store: Store,
    worker: WorkerBridge,
    toolManager: ToolManager,
    callbacks: InputCallbacks,
  ) {
    this.canvas = canvas;
    this.store = store;
    this.worker = worker;
    this.toolManager = toolManager;
    this.callbacks = callbacks;

    this.setupListeners();
  }

  // ─── 事件监听 ─────────────────────────────────────────

  private setupListeners(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  /** 移除所有监听器 */
  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);

    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
  }

  // ─── 鼠标事件 ─────────────────────────────────────────

  private onMouseDown = (e: MouseEvent): void => {
    this.updateModifiers(e);
    const pos = this.getNormalizedPos(e);
    if (!pos) return;

    // Alt + 点击：平移
    if (this.modifiers.alt) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.canvas.classList.add('grabbing');
      return;
    }

    // Ctrl + 点击：拖拽点或标签
    if (this.modifiers.ctrl && e.button === 0) {
      this.handleCtrlClick(pos);
      return;
    }

    // 普通点击：交给当前工具
    const result = this.toolManager.onMouseDown(pos, e.button, this.modifiers);
    this.processToolResult(result);
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.updateModifiers(e);
    const pos = this.getNormalizedPos(e);
    if (!pos) return;

    // 更新光标位置
    this.store.set('cursor', pos);
    this.worker.setCursor(pos.x, pos.y);

    // 平移
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      const scale = this.store.get('scale');
      const tx = this.store.get('translateX') + dx;
      const ty = this.store.get('translateY') + dy;
      this.store.batch({ translateX: tx, translateY: ty });
      this.worker.setTransform(scale, tx, ty);
      return;
    }

    // 拖拽点
    if (this.isDraggingPoint && this.selectedPoint) {
      this.handlePointDrag(pos);
      return;
    }

    // 拖拽标签
    if (this.isDraggingLabel && this.draggedLabelIndex >= 0) {
      this.handleLabelDrag(pos);
      return;
    }

    // 节流鼠标移动（每帧最多处理一次）
    if (this.mouseMoveThrottled) return;
    this.mouseMoveThrottled = true;
    requestAnimationFrame(() => { this.mouseMoveThrottled = false; });

    // 工具绘制中
    if (this.toolManager.isDrawing()) {
      const result = this.toolManager.onMouseMove(pos, this.modifiers);
      this.processToolResult(result);
      return;
    }

    // 空闲时：悬停检测
    this.updateHoverState(pos);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.updateModifiers(e);
    const pos = this.getNormalizedPos(e);
    if (!pos) return;

    // 平移结束
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.classList.remove('grabbing');
      return;
    }

    // 拖拽结束
    if (this.isDraggingPoint) {
      this.isDraggingPoint = false;
      this.selectedPoint = null;
      this.callbacks.onPushHistory();
      return;
    }

    if (this.isDraggingLabel) {
      this.isDraggingLabel = false;
      this.draggedLabelIndex = -1;
      this.callbacks.onPushHistory();
      return;
    }

    // 工具 mouseup
    const result = this.toolManager.onMouseUp(pos, e.button, this.modifiers);
    this.processToolResult(result);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.updateModifiers(e);

    // Ctrl + 滚轮：缩放
    if (this.modifiers.ctrl) {
      const pos = this.getCanvasPos(e);
      if (!pos) return;

      const delta = -e.deltaY * ZOOM_SPEED / 100;
      const scale = this.store.get('scale');
      const tx = this.store.get('translateX');
      const ty = this.store.get('translateY');

      const newScale = Math.min(Math.max(scale + delta, MIN_ZOOM), MAX_ZOOM);
      const ratio = newScale / scale;
      const newTx = pos.x - (pos.x - tx) * ratio;
      const newTy = pos.y - (pos.y - ty) * ratio;

      this.store.batch({ scale: newScale, translateX: newTx, translateY: newTy });
      this.worker.setTransform(newScale, newTx, newTy);
      return;
    }

    // 滚动（缩放后）
    const scale = this.store.get('scale');
    if (scale > 1) {
      const tx = this.store.get('translateX');
      const ty = this.store.get('translateY');
      if (this.modifiers.shift) {
        this.store.set('translateX', tx - e.deltaY * SCROLL_SPEED / 100);
      } else {
        this.store.set('translateY', ty - e.deltaY * SCROLL_SPEED / 100);
      }
      this.worker.setTransform(scale, this.store.get('translateX'), this.store.get('translateY'));
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    // 右键：取消当前工具操作
    const result = this.toolManager.onCancel();
    this.processToolResult(result);
  };

  private onMouseLeave = (): void => {
    // 离开画布时取消所有交互
    this.isPanning = false;
    this.isDraggingPoint = false;
    this.isDraggingLabel = false;
    this.canvas.classList.remove('grabbing', 'grabable');
    this.toolManager.onCancel();
  };

  // ─── 键盘事件 ─────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    // 跳过输入框中的按键
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

    this.updateModifiersFromKey(e, true);

    const modifiers = { ...this.modifiers };
    let result: ToolResult | null = null;

    // 统一转为小写，支持大写字母快捷键（Caps Lock 或 Shift 时）
    const key = e.key.toLowerCase();

    // 全局快捷键
    if (e.key === ' ') {
      e.preventDefault();
      this.callbacks.onResetView();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      this.callbacks.onCycleClass(modifiers.shift ? -1 : 1);
      return;
    }

    if (key === 'z' && modifiers.ctrl && !modifiers.shift) {
      e.preventDefault();
      this.callbacks.onUndo();
      return;
    }

    if (key === 'z' && modifiers.ctrl && modifiers.shift) {
      e.preventDefault();
      this.callbacks.onRedo();
      return;
    }

    if (key === 's' && modifiers.ctrl) {
      e.preventDefault();
      this.callbacks.onSave();
      return;
    }

    if (key === 'c' && modifiers.ctrl) {
      e.preventDefault();
      this.callbacks.onCopyLabel();
      return;
    }

    if (key === 'v' && modifiers.ctrl) {
      e.preventDefault();
      this.callbacks.onPasteLabel();
      return;
    }

    if (key === 'a' && !modifiers.ctrl && !modifiers.alt) {
      this.callbacks.onNavigatePrevious();
      return;
    }

    if (key === 'd' && !modifiers.ctrl && !modifiers.alt) {
      this.callbacks.onNavigateNext();
      return;
    }

    // Delete / Backspace：删除悬停的标签
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const hoveredIndex = this.store.get('hoveredLabelIndex');
      if (hoveredIndex !== null) {
        e.preventDefault();
        this.callbacks.onDeleteLabel(hoveredIndex);
        return;
      }
    }

    // 工具按键（也转为小写）
    result = this.toolManager.onKeyDown(key, modifiers);
    this.processToolResult(result);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.updateModifiersFromKey(e, false);
  };

  // ─── 拖拽处理 ─────────────────────────────────────────

  private async handleCtrlClick(pos: NormalizedPoint): Promise<void> {
    // 请求 Worker 做命中检测
    const result = await this.worker.requestHitTest(pos.x, pos.y);

    if (result.hitType === 'point' && result.point) {
      this.isDraggingPoint = true;
      this.selectedPoint = result.point;
    } else if (result.hitType === 'label' && result.labelIndex !== null) {
      this.isDraggingLabel = true;
      this.draggedLabelIndex = result.labelIndex;
      this.dragStartX = pos.x;
      this.dragStartY = pos.y;
    }
  }

  private handlePointDrag(pos: NormalizedPoint): void {
    const point = this.selectedPoint;
    if (!point) return;

    const labels = [...this.store.get('labels')];
    const label = { ...labels[point.labelIndex] };

    if (point.pointType === 'corner') {
      // 拖拽框角点
      labels[point.labelIndex] = LabelOps.moveBoxCorner(label, point.pointIndex, pos.x, pos.y);
    } else if (point.pointType === 'polygon' && label.points) {
      // 拖拽多边形顶点
      const points = [...label.points];
      points[point.pointIndex * 2] = pos.x;
      points[point.pointIndex * 2 + 1] = pos.y;
      label.points = points;
      labels[point.labelIndex] = label;
    } else if (point.pointType === 'keypoint' && label.keypoints && label.keypointShape) {
      // 拖拽关键点
      const [, vpp] = label.keypointShape;
      const keypoints = [...label.keypoints];
      keypoints[point.pointIndex * vpp] = pos.x;
      keypoints[point.pointIndex * vpp + 1] = pos.y;
      label.keypoints = keypoints;
      labels[point.labelIndex] = label;
    }

    this.store.set('labels', labels);
    this.worker.setLabels(labels);
  }

  private handleLabelDrag(pos: NormalizedPoint): void {
    const dx = pos.x - this.dragStartX;
    const dy = pos.y - this.dragStartY;
    this.dragStartX = pos.x;
    this.dragStartY = pos.y;

    const labels = [...this.store.get('labels')];
    labels[this.draggedLabelIndex] = LabelOps.moveLabel(labels[this.draggedLabelIndex], dx, dy);

    this.store.set('labels', labels);
    this.worker.setLabels(labels);
  }

  // ─── 悬停检测 ─────────────────────────────────────────

  private async updateHoverState(pos: NormalizedPoint): Promise<void> {
    const result = await this.worker.requestHitTest(pos.x, pos.y);

    if (result.hitType !== 'none') {
      this.store.batch({
        hoveredLabelIndex: result.labelIndex,
        hoveredPoint: result.point,
      });
      this.worker.setHoveredLabel(result.labelIndex);
    } else {
      if (this.store.get('hoveredLabelIndex') !== null) {
        this.store.batch({ hoveredLabelIndex: null, hoveredPoint: null });
        this.worker.setHoveredLabel(null);
      }
    }

    // 更新光标样式
    this.updateCursor(result);
  }

  private updateCursor(hitResult: HitTestResult): void {
    this.canvas.classList.remove('grabable', 'grabbing', 'move');

    if (this.modifiers.alt) {
      this.canvas.classList.add('grabable');
    } else if (this.modifiers.ctrl && hitResult.hitType !== 'none') {
      this.canvas.classList.add('move');
    }
  }

  // ─── 工具结果处理 ─────────────────────────────────────

  private processToolResult(result: ToolResult | null): void {
    if (!result) return;

    if (result.addedLabels) {
      const labels = [...this.store.get('labels'), ...result.addedLabels];
      this.store.set('labels', labels);
      this.worker.setLabels(labels);
    }

    if (result.updatedLabels) {
      const labels = [...this.store.get('labels')];
      for (const update of result.updatedLabels) {
        labels[update.index] = update.label;
      }
      this.store.set('labels', labels);
      this.worker.setLabels(labels);
    }

    if (result.removedIndices) {
      const labels = this.store.get('labels').filter((_, i) => !result.removedIndices!.includes(i));
      this.store.set('labels', labels);
      this.worker.setLabels(labels);
    }

    if (result.pushHistory) {
      this.callbacks.onPushHistory();
    }

    if (result.updateLabelList) {
      this.callbacks.onUpdateLabelList();
    }
  }

  // ─── 辅助方法 ─────────────────────────────────────────

  private getNormalizedPos(e: MouseEvent): NormalizedPoint | null {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const scale = this.store.get('scale');
    const tx = this.store.get('translateX');
    const ty = this.store.get('translateY');
    const imgW = this.store.get('imageWidth');
    const imgH = this.store.get('imageHeight');

    if (imgW === 0 || imgH === 0 || scale === 0) return null;

    return {
      x: clamp01((canvasX - tx) / (imgW * scale)),
      y: clamp01((canvasY - ty) / (imgH * scale)),
    };
  }

  private getCanvasPos(e: MouseEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private updateModifiers(e: MouseEvent): void {
    this.modifiers.ctrl = e.ctrlKey || e.metaKey;
    this.modifiers.alt = e.altKey;
    this.modifiers.shift = e.shiftKey;
  }

  private updateModifiersFromKey(e: KeyboardEvent, down: boolean): void {
    if (e.key === 'Control' || e.key === 'Meta') this.modifiers.ctrl = down;
    if (e.key === 'Alt') this.modifiers.alt = down;
    if (e.key === 'Shift') this.modifiers.shift = down;
  }
}
