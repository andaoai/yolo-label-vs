import type { Label } from '../templates/shared/types';

// 基础消息接口
export interface WebviewMessage {
    command: string;
}

// 从 Webview 到扩展的消息命令类型
export type WebviewCommand =
    | 'reload'
    | 'getImageList'
    | 'loadImage'
    | 'save'
    | 'next'
    | 'previous'
    | 'openImageInNewTab'
    | 'openTxtInNewTab'
    | 'getImagePreviewRange'
    | 'openModelFile'
    | 'loadModelFile';

// 标签消息（用于保存和更新）
export interface SaveMessage extends WebviewMessage {
    command: 'save';
    labels: BoundingBox[];
}

// 加载图片消息
export interface LoadImageMessage extends WebviewMessage {
    command: 'loadImage';
    path: string;
}

// 带路径的消息（用于在新标签中打开图片/文本）
export interface PathMessage extends WebviewMessage {
    command: 'openImageInNewTab' | 'openTxtInNewTab';
    path: string;
}

// 预览范围消息
export interface PreviewRangeMessage extends WebviewMessage {
    command: 'getImagePreviewRange';
    paths: string[];
    startIndex: number;
}

// 加载模型文件消息
export interface LoadModelMessage extends WebviewMessage {
    command: 'loadModelFile';
    filePath: string;
}

// 扩展端标签类型，与 Webview 共享同一个结构
export type BoundingBox = Label;
