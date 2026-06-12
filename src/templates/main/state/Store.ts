/**
 * 响应式状态管理 — Proxy-based Store
 *
 * 状态变更自动通知订阅者，支持选择性订阅
 */
import type { AppState, Label, ToolType, PointRef, NormalizedPoint } from '../../shared/types';
import type { RenderConfig } from '../../shared/messages';
import { DEFAULT_CLASS_NAMES, COLORS } from '../../shared/config';

/** 状态变更监听器 */
type Listener<T> = (value: T, oldValue: T) => void;

/** 订阅句柄，用于取消订阅 */
export interface Subscription {
  unsubscribe(): void;
}

export class Store {
  private _state: AppState;
  private _listeners = new Map<keyof AppState, Set<Listener<any>>>();
  private _anyListeners = new Set<(key: keyof AppState) => void>();
  private _batching = false;
  private _pendingKeys = new Set<keyof AppState>();

  constructor(initialState?: Partial<AppState>) {
    this._state = {
      currentPath: '',
      image: null,
      imageWidth: 0,
      imageHeight: 0,
      labels: [],
      currentClass: 0,
      classNames: DEFAULT_CLASS_NAMES,
      kptShape: [],
      activeTool: 'box',
      showLabels: true,
      scale: 1,
      translateX: 0,
      translateY: 0,
      hoveredLabelIndex: null,
      hoveredPoint: null,
      cursor: { x: 0, y: 0 },
      allPaths: [],
      imagePreviews: [],
      imageInfo: '',
      hasUnsavedChanges: false,
      ...initialState,
    };
  }

  // ─── 读取 ─────────────────────────────────────────────

  get state(): Readonly<AppState> {
    return this._state;
  }

  get<K extends keyof AppState>(key: K): AppState[K] {
    return this._state[key];
  }

  // ─── 写入 ─────────────────────────────────────────────

  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    const oldValue = this._state[key];
    if (oldValue === value) return;

    this._state[key] = value;

    if (this._batching) {
      this._pendingKeys.add(key);
    } else {
      this.notify(key);
    }
  }

  /** 批量更新：合并多次 set 为一次通知 */
  batch(updates: Partial<AppState>): void {
    this._batching = true;
    for (const [key, value] of Object.entries(updates) as [keyof AppState, any][]) {
      this.set(key, value);
    }
    this._batching = false;

    for (const key of this._pendingKeys) {
      this.notify(key);
    }
    this._pendingKeys.clear();
  }

  // ─── 标签操作（便捷方法） ─────────────────────────────

  addLabel(label: Label): void {
    this._state.labels = [...this._state.labels, label];
    if (!this._batching) this.notify('labels');
  }

  removeLabel(index: number): void {
    this._state.labels = this._state.labels.filter((_, i) => i !== index);
    if (!this._batching) this.notify('labels');
  }

  updateLabel(index: number, updates: Partial<Label>): void {
    this._state.labels = this._state.labels.map((label, i) =>
      i === index ? { ...label, ...updates } : label
    );
    if (!this._batching) this.notify('labels');
  }

  setLabels(labels: Label[]): void {
    this.set('labels', labels);
  }

  // ─── 订阅 ─────────────────────────────────────────────

  /** 订阅特定状态键的变更 */
  on<K extends keyof AppState>(key: K, listener: Listener<AppState[K]>): Subscription {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key)!.add(listener);

    return {
      unsubscribe: () => {
        this._listeners.get(key)?.delete(listener);
      },
    };
  }

  /** 订阅任意状态变更 */
  onAny(listener: (key: keyof AppState) => void): Subscription {
    this._anyListeners.add(listener);
    return {
      unsubscribe: () => {
        this._anyListeners.delete(listener);
      },
    };
  }

  // ─── 生成渲染配置 ─────────────────────────────────────

  toRenderConfig(devicePixelRatio: number): RenderConfig {
    return {
      colors: COLORS,
      crosshairColor: 'rgba(76, 217, 100, 0.8)',
      backgroundColor: '#1e1e1e',
      lineWidth: 2,
      pointRadius: 5,
      highlightRadius: 8,
      closeHighlightRadius: 12,
      labelHeight: 20,
      labelFontSize: 14,
      labelPadding: 5,
      closePointThreshold: 0.02,
      minBoxSize: 0.01,
      classNames: this._state.classNames,
      kptShape: this._state.kptShape,
      devicePixelRatio,
    };
  }

  // ─── 内部 ─────────────────────────────────────────────

  private notify(key: keyof AppState): void {
    const listeners = this._listeners.get(key);
    if (listeners) {
      const value = this._state[key];
      for (const listener of listeners) {
        listener(value, value); // TODO: 传递 oldValue
      }
    }
    for (const listener of this._anyListeners) {
      listener(key);
    }
  }
}
