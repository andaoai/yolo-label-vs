/**
 * 共享配置常量 — 主线程与 Worker 共用
 */
import type { RenderConfig } from './messages';

/** 默认类名列表 */
export const DEFAULT_CLASS_NAMES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane',
  'bus', 'train', 'truck', 'boat'
];

/** 10 色调色板 */
export const COLORS = [
  '#ff3b30', // 红
  '#4cd964', // 绿
  '#007aff', // 蓝
  '#ff9500', // 橙
  '#5856d6', // 紫
  '#ffcc00', // 黄
  '#34c759', // 草绿
  '#ff2d55', // 粉红
  '#5ac8fa', // 浅蓝
  '#af52de', // 紫红
];

/** 默认渲染配置 */
export const DEFAULT_RENDER_CONFIG: RenderConfig = {
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
  hoverProximityThreshold: 0.05,
  minBoxSize: 0.01,
  classNames: DEFAULT_CLASS_NAMES,
  kptShape: [],
  devicePixelRatio: 1,
};

/** 缩放范围 */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;
export const ZOOM_SPEED = 0.1;
export const SCROLL_SPEED = 20;

/** 搜索 */
export const DEBOUNCE_DELAY = 300;
export const MAX_SEARCH_RESULTS = 10;

/** 高亮虚线动画 */
export const HIGHLIGHT_DASH_PATTERN = [10, 6];
export const DASH_OFFSET_STEP = 1.5;
export const DASH_OFFSET_RESET = 100;

/** 点脉冲动画 */
export const PULSE_SPEED = 0.01;
export const HOVER_SCALE = 1.8;
