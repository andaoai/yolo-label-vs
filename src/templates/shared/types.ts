/**
 * 共享类型定义 — 主线程与 Worker 共用
 */

// ─── 标签类型 ────────────────────────────────────────────

/** 标注工具类型 */
export type ToolType = 'box' | 'seg' | 'pose';

/** 关键点可见性：0=不可见, 1=可见, 2=遮挡 */
export type KeypointVisibility = 0 | 1 | 2;

/** 标签（与扩展端 BoundingBox 兼容） */
export interface Label {
  class: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isSegmentation?: boolean;
  isPose?: boolean;
  points?: number[];       // 分割多边形点 [x1,y1,x2,y2,...]，归一化坐标
  keypoints?: number[];    // 关键点 [x1,y1,v1,x2,y2,v2,...]，归一化坐标
  keypointShape?: number[]; // [关键点数量, 每个关键点值数]
  visible?: boolean;
}

// ─── 坐标类型 ────────────────────────────────────────────

/** 归一化坐标点 (0-1) */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** Canvas 像素坐标 */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** 屏幕/CSS 像素坐标 */
export interface ScreenPoint {
  clientX: number;
  clientY: number;
}

/** 点引用：标签索引 + 点类型 + 点索引 */
export interface PointRef {
  labelIndex: number;
  pointType: 'corner' | 'polygon' | 'keypoint';
  pointIndex: number;
}

// ─── 命中检测结果 ────────────────────────────────────────

export interface HitTestResult {
  /** 命中的标签索引，null 表示未命中 */
  labelIndex: number | null;
  /** 命中的点引用，null 表示命中的是标签区域而非具体点 */
  point: PointRef | null;
  /** 命中类型 */
  hitType: 'point' | 'label' | 'none';
  /** 鼠标与最近标签/点的距离（归一化坐标），-1 表示超出检测范围 */
  nearestDistance: number;
}

// ─── 绘制预览 ────────────────────────────────────────────

export type DrawPreview =
  | { tool: 'box'; startX: number; startY: number; endX: number; endY: number }
  | { tool: 'seg'; points: number[]; mouseX: number; mouseY: number; nearFirst: boolean }
  | { tool: 'pose'; step: 'box'; startX: number; startY: number; endX: number; endY: number }
  | { tool: 'pose'; step: 'keypoints'; label: Label; currentStep: number; totalSteps: number; mouseX: number; mouseY: number };

// ─── 应用状态 ────────────────────────────────────────────

/** 主线程应用状态 */
export interface AppState {
  // 图片
  currentPath: string;
  image: ImageBitmap | null;
  imageWidth: number;
  imageHeight: number;

  // 标签
  labels: Label[];
  currentClass: number;
  classNames: string[];
  kptShape: number[];       // [关键点数量, 值数]，空数组表示无姿态

  // 工具
  activeTool: ToolType;
  showLabels: boolean;

  // 视图变换
  scale: number;
  translateX: number;
  translateY: number;

  // 交互（不发送给 Worker）
  hoveredLabelIndex: number | null;
  hoveredPoint: PointRef | null;
  cursor: NormalizedPoint;
  clipboard: Label | null;  // 复制的标签

  // 导航
  allPaths: string[];
  imagePreviews: string[];
  imageInfo: string;

  // 脏标记
  hasUnsavedChanges: boolean;

  // 推理
  modelLoaded: boolean;
  modelPath: string;
  modelInputSize: number;
  inferenceRunning: boolean;
  previewDetections: Detection[];
  showPreview: boolean;
  confThreshold: number;
  iouThreshold: number;
}

// ─── 推理检测结果 ────────────────────────────────────────

/** 单个检测结果（归一化坐标 0-1） */
export interface Detection {
  class: number;
  className: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 分割多边形点 [x1,y1,x2,y2,...]，归一化坐标，仅 seg 模型有 */
  points?: number[];
}

// ─── 修饰键 ──────────────────────────────────────────────

export interface Modifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
