/**
 * WebView消息类型定义
 */
import type { Label } from '../templates/shared/types';

// 基础消息接口
export interface WebviewMessage {
  command: string;
}

// 图片更新消息
export interface UpdateImageMessage extends WebviewMessage {
  command: 'updateImage';
  imageData: string;
  labels: BoundingBox[];
  currentPath: string;
  imageInfo: string;
}

// 从Webview到扩展的消息
export interface WebviewToExtensionMessage extends WebviewMessage {
  command: 'save' | 'next' | 'previous' | 'loadImage' | 'getImageList' | 'reload' | 'openImageInNewTab' | 'openTxtInNewTab' | 'getImagePreviewRange' | 'openModelFile' | 'loadModelFile';
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

// 扩展端标签类型，与 Webview 共享同一个结构
export type BoundingBox = Label;

// 图片缓存项
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  size: number;
}

// 可缓存的数据类型（仅用于 CacheManager 的类型约束）
export type CacheableData = string | BoundingBox[] | object;
