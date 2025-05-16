/**
 * WebView消息类型定义
 */

// 基础消息接口
export interface WebviewMessage {
  command: string;
}

// 从扩展到Webview的消息
export interface ExtensionToWebviewMessage extends WebviewMessage {
  command: 'updateImage' | 'imageList' | 'error' | 'aiConfigured' | 'aiInferenceResult' | 'fileBrowseResult';
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

// AI配置结果消息
export interface AiConfiguredMessage extends ExtensionToWebviewMessage {
  command: 'aiConfigured';
  success: boolean;
  modelPath: string;
  message?: string;
}

// AI推理结果消息
export interface AiInferenceResultMessage extends ExtensionToWebviewMessage {
  command: 'aiInferenceResult';
  labels: BoundingBox[];
  message?: string;
}

// 文件浏览结果消息
export interface FileBrowseResultMessage extends ExtensionToWebviewMessage {
  command: 'fileBrowseResult';
  path: string;
}

// 从Webview到扩展的消息
export interface WebviewToExtensionMessage extends WebviewMessage {
  command: 'save' | 'next' | 'previous' | 'loadImage' | 'getImageList' | 'reload' | 
           'openImageInNewTab' | 'openTxtInNewTab' | 'getImagePreviews' | 
           'configureAi' | 'runAiInference' | 'browseFile';
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

// 在新标签中打开图片消息
export interface OpenImageInNewTabMessage extends WebviewToExtensionMessage {
  command: 'openImageInNewTab';
  path: string;
}

// 在新标签中打开文本文件消息
export interface OpenTxtInNewTabMessage extends WebviewToExtensionMessage {
  command: 'openTxtInNewTab';
  path: string;
}

// 配置AI消息
export interface ConfigureAiMessage extends WebviewToExtensionMessage {
  command: 'configureAi';
  modelPath: string;
  scoreThreshold: number;
  nmsThreshold: number;
  confidenceThreshold: number;
}

// 运行AI推理消息
export interface RunAiInferenceMessage extends WebviewToExtensionMessage {
  command: 'runAiInference';
}

// 浏览文件消息
export interface BrowseFileMessage extends WebviewToExtensionMessage {
  command: 'browseFile';
  filter?: string;
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

export function isConfigureAiMessage(message: WebviewMessage): message is ConfigureAiMessage {
  return message.command === 'configureAi';
}

export function isRunAiInferenceMessage(message: WebviewMessage): message is RunAiInferenceMessage {
  return message.command === 'runAiInference';
}

export function isBrowseFileMessage(message: WebviewMessage): message is BrowseFileMessage {
  return message.command === 'browseFile';
}

export function isFileBrowseResultMessage(message: WebviewMessage): message is FileBrowseResultMessage {
  return message.command === 'fileBrowseResult';
}

/**
 * 配置类型定义
 */

// YOLO配置接口
export interface YoloConfig {
  path: string;
  train: string | string[];
  val: string | string[];
  test: string | string[];
  names: string[] | Record<string, string>;
}

// AI配置接口
export interface AiConfig {
  modelPath: string;
  scoreThreshold: number;
  nmsThreshold: number;
  confidenceThreshold: number;
  enabled: boolean;
}

// 标签框接口
export interface BoundingBox {
  class: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isSegmentation?: boolean;
  isPose?: boolean;
  points?: number[];
  keypoints?: number[];
  keypointShape?: number[];
  visible?: boolean;
  aiDetected?: boolean; // 标记是否为AI检测的结果
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