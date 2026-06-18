/**
 * DOM 管理器 — 协调所有 UI 组件
 *
 * 负责：
 * 1. 初始化和持有所有 UI 组件
 * 2. 提供统一的 DOM 更新接口
 * 3. 管理导航按钮状态
 */
import type { Store } from '../state/Store';
import type { ToolType } from '../../shared/types';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ProgressBar } from './ProgressBar';
import { ModelPanel } from './ModelPanel';
import { ThemeManager } from './ThemeManager';

export interface DOMCallbacks {
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onOpenImageTab: () => void;
  onOpenTxtTab: () => void;
  onToolChange: (tool: ToolType) => void;
  onToggleLabels: () => void;
  onUndo: () => void;
  onClearAllLabels: () => void;
  onSave: () => void;
  onLoadImage: (path: string) => void;
  onClassChange: (labelIndex: number, newClass: number) => void;
  onDeleteLabel: (labelIndex: number) => void;
  onToggleVisibility: (labelIndex: number) => void;
  onHoverLabel: (labelIndex: number | null) => void;
  onPreviewHover?: (startIndex: number, endIndex: number) => void;
  onLoadModel: () => void;
  onRunInference: () => void;
  onAcceptDetections: () => void;
  onRejectDetections: () => void;
  onConfThresholdChange: (value: number) => void;
  onIouThresholdChange: (value: number) => void;
}

export class DOMManager {
  readonly toolbar: Toolbar;
  readonly sidebar: Sidebar;
  readonly statusBar: StatusBar;
  readonly progressBar: ProgressBar;
  readonly modelPanel: ModelPanel;
  readonly themeManager: ThemeManager;

  constructor(store: Store, callbacks: DOMCallbacks, themeManager: ThemeManager) {
    this.themeManager = themeManager;

    this.toolbar = new Toolbar(store, {
      onNavigateNext: callbacks.onNavigateNext,
      onNavigatePrevious: callbacks.onNavigatePrevious,
      onOpenImageTab: callbacks.onOpenImageTab,
      onOpenTxtTab: callbacks.onOpenTxtTab,
      onToolChange: callbacks.onToolChange,
      onToggleLabels: callbacks.onToggleLabels,
      onUndo: callbacks.onUndo,
      onClearAllLabels: callbacks.onClearAllLabels,
      onSave: callbacks.onSave,
      onLoadImage: callbacks.onLoadImage,
    });

    this.sidebar = new Sidebar(store, {
      onClassChange: callbacks.onClassChange,
      onDeleteLabel: callbacks.onDeleteLabel,
      onToggleVisibility: callbacks.onToggleVisibility,
      onHoverLabel: callbacks.onHoverLabel,
    });

    this.statusBar = new StatusBar(store);
    this.progressBar = new ProgressBar(store, {
      onLoadImage: callbacks.onLoadImage,
      onPreviewHover: callbacks.onPreviewHover,
    });

    this.modelPanel = new ModelPanel(store, {
      onLoadModel: callbacks.onLoadModel,
      onRunInference: callbacks.onRunInference,
      onAcceptDetections: callbacks.onAcceptDetections,
      onRejectDetections: callbacks.onRejectDetections,
      onConfThresholdChange: callbacks.onConfThresholdChange,
      onIouThresholdChange: callbacks.onIouThresholdChange,
    });
  }

  /** 初始化所有 UI 组件 */
  init(): void {
    this.toolbar.init();
    this.sidebar.init();
    this.statusBar.init();
    this.progressBar.init();
    this.modelPanel.init();
    this.themeManager.startListening();
  }

  /** 更新导航按钮状态 */
  updateNavButtons(hasPrev: boolean, hasNext: boolean): void {
    const prevBtn = document.getElementById('prevImage') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextImage') as HTMLButtonElement;
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
  }

  /** 更新标签列表 */
  updateLabelList(): void {
    this.sidebar.render();
  }

  /** 销毁 */
  dispose(): void {
    this.themeManager.stopListening();
  }
}
