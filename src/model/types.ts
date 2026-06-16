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
  command: 'save' | 'next' | 'previous' | 'loadImage' | 'getImageList' | 'reload' | 'openImageInNewTab' | 'openTxtInNewTab' | 'getImagePreviewRange' | 'openModelFile' | 'loadModelFile';
}

// 打开模型文件消息
export interface OpenModelFileMessage extends WebviewToExtensionMessage {
  command: 'openModelFile';
}

// 加载模型文件消息
export interface LoadModelFileMessage extends WebviewToExtensionMessage {
  command: 'loadModelFile';
  filePath: string;
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
}

// 图片缓存项
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  size: number;
}

// 可缓存的数据类型（仅用于 CacheManager 的类型约束）
export type CacheableData = string | BoundingBox[] | object;
