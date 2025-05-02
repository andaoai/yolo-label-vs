/**
 * WebView消息类型定义
 */

// 基础消息接口
export interface WebviewMessage {
  command: string;
}

// 从扩展到Webview的消息
export interface ExtensionToWebviewMessage extends WebviewMessage {
  command: 'updateImage' | 'imageList' | 'error';
}

// 图片更新消息
export interface UpdateImageMessage extends ExtensionToWebviewMessage {
  command: 'updateImage';
  imageData: string;
  labels: BoundingBox[];
  currentPath: string;
  imageInfo: string;
}

// 图片列表消息
export interface ImageListMessage extends ExtensionToWebviewMessage {
  command: 'imageList';
  paths: string[];
}

// 错误消息
export interface ErrorMessage extends ExtensionToWebviewMessage {
  command: 'error';
  error: string;
  type?: string;
  recoverable?: boolean;
}

// 从Webview到扩展的消息
export interface WebviewToExtensionMessage extends WebviewMessage {
  command: 'save' | 'next' | 'previous' | 'loadImage' | 'getImageList' | 'reload';
}

// 保存标签消息
export interface SaveLabelsMessage extends WebviewToExtensionMessage {
  command: 'save';
  labels: BoundingBox[];
}

// 加载图片消息
export interface LoadImageMessage extends WebviewToExtensionMessage {
  command: 'loadImage';
  path: string;
}

// 消息类型守卫
export function isUpdateImageMessage(message: WebviewMessage): message is UpdateImageMessage {
  return message.command === 'updateImage';
}

export function isImageListMessage(message: WebviewMessage): message is ImageListMessage {
  return message.command === 'imageList';
}

export function isErrorMessage(message: WebviewMessage): message is ErrorMessage {
  return message.command === 'error';
}

export function isSaveLabelsMessage(message: WebviewMessage): message is SaveLabelsMessage {
  return message.command === 'save';
}

export function isLoadImageMessage(message: WebviewMessage): message is LoadImageMessage {
  return message.command === 'loadImage';
}

/**
 * 配置类型定义
 */

// YOLO配置接口
export interface YoloConfig {
  path: string;
  train: string | string[];
  val: string | string[];
  names: string[] | Record<string, string>;
}

// 标签框接口
export interface BoundingBox {
  class: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isSegmentation?: boolean;
  points?: number[];
}

// 图片信息接口
export interface ImageInfo {
  path: string;
  width: number;
  height: number;
  format: string;
  hasLabels: boolean;
}

/**
 * 设置类型定义
 */

// 标注设置
export interface LabelingSettings {
  highlightColor: string;
  boxLineWidth: number;
  fontSize: number;
  showLabels: boolean;
  snapToGrid: boolean;
  gridSize: number;
  autoSave: boolean;
}

/**
 * 状态类型定义
 */

// 面板状态
export type PanelState = 'loading' | 'ready' | 'error';

// 编辑模式
export type EditMode = 'create' | 'edit' | 'delete' | 'pan';

// 历史操作类型
export type HistoryActionType = 'add' | 'edit' | 'delete' | 'bulk';

// 历史操作记录
export interface HistoryAction {
  type: HistoryActionType;
  boxes: BoundingBox[];
  previousBoxes?: BoundingBox[];
  timestamp: number;
}

// 图片缓存项
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  size: number;
}

// 可缓存的数据类型
export type CacheableData = string | BoundingBox[] | ImageInfo; 