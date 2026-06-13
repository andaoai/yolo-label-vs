/**
 * 消息协议 — 主线程 ↔ Worker 类型安全通信
 */
import type { Label, ToolType, DrawPreview, PointRef, HitTestResult, NormalizedPoint } from './types';

// ─── 渲染配置（初始化时一次性传入） ──────────────────────

export interface RenderConfig {
  colors: string[];
  crosshairColor: string;
  backgroundColor: string;
  lineWidth: number;
  pointRadius: number;
  highlightRadius: number;
  closeHighlightRadius: number;
  labelHeight: number;
  labelFontSize: number;
  labelPadding: number;
  closePointThreshold: number;
  hoverProximityThreshold: number;
  minBoxSize: number;
  classNames: string[];
  kptShape: number[];
  devicePixelRatio: number;
}

// ─── 主线程 → Worker ────────────────────────────────────

export type MainToWorkerMessage =
  /** 初始化：传入 OffscreenCanvas 和渲染配置 */
  | { type: 'init'; canvas: OffscreenCanvas; config: RenderConfig }
  /** 设置图片（ImageBitmap 可转移，零拷贝） */
  | { type: 'setImage'; image: ImageBitmap; width: number; height: number }
  /** 设置标签列表 */
  | { type: 'setLabels'; labels: Label[] }
  /** 设置视图变换 */
  | { type: 'setTransform'; scale: number; translateX: number; translateY: number }
  /** 更新鼠标光标位置（归一化坐标） */
  | { type: 'setCursor'; x: number; y: number }
  /** 设置悬停的标签索引 */
  | { type: 'setHoveredLabel'; index: number | null }
  /** 设置当前工具 */
  | { type: 'setTool'; tool: ToolType }
  /** 设置绘制预览 */
  | { type: 'setPreview'; preview: DrawPreview | null }
  /** 设置选中的点（拖拽中） */
  | { type: 'setSelectedPoint'; point: PointRef | null }
  /** 请求命中检测 */
  | { type: 'requestHitTest'; x: number; y: number; requestId: number }
  /** 设置标签可见性 */
  | { type: 'setVisibility'; index: number; visible: boolean }
  /** 更新渲染配置 */
  | { type: 'updateConfig'; config: Partial<RenderConfig> }
  /** 设置画布尺寸 */
  | { type: 'resize'; width: number; height: number }
  /** 重置视图（适应画布） */
  | { type: 'fitToCanvas' }
  /** 设置是否显示标签文字 */
  | { type: 'setShowLabels'; show: boolean };

// ─── Worker → 主线程 ────────────────────────────────────

export type WorkerToMainMessage =
  /** Worker 就绪 */
  | { type: 'ready' }
  /** 命中检测结果 */
  | { type: 'hitTestResult'; requestId: number; result: HitTestResult }
  /** 计算出的初始变换（fitToCanvas 响应） */
  | { type: 'transformComputed'; scale: number; translateX: number; translateY: number };
