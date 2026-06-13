/**
 * 扩展通信桥 — VS Code Webview ↔ Extension Host
 *
 * 类型安全的消息收发，唯一与 VS Code API 交互的点
 */

/** VS Code Webview API 类型（运行时通过 acquireVsCodeApi 获取） */
interface WebviewApi {
  postMessage(msg: unknown): void;
}

/** 扩展 → Webview 消息 */
export type ExtensionMessage =
  | { command: 'imageList'; paths: string[] }
  | { command: 'updateImage'; imageData: string; labels: any[]; currentPath: string; imageInfo: string }
  | { command: 'error'; error: string; type?: string; recoverable?: boolean }
  | { command: 'saveSuccess' }
  | { command: 'imagePreviews'; previews: string[] }
  | { command: 'imagePreviewRange'; startIndex: number; previews: string[] }
  | { command: 'modelFileData'; data: ArrayBuffer; fileName: string }
  | { command: 'modelFileError'; error: string };

/** Webview → 扩展 消息 */
export type WebviewMessage =
  | { command: 'getImageList' }
  | { command: 'loadImage'; path: string }
  | { command: 'save'; labels: any[] }
  | { command: 'next' }
  | { command: 'previous' }
  | { command: 'reload' }
  | { command: 'openImageInNewTab'; path: string }
  | { command: 'openTxtInNewTab'; path: string }
  | { command: 'getImagePreviews'; paths: string[] }
  | { command: 'getImagePreviewRange'; paths: string[]; startIndex: number }
  | { command: 'openModelFile' }
  | { command: 'loadModelFile'; filePath: string };

type MessageHandler = (msg: ExtensionMessage) => void;

export class ExtensionBridge {
  private vscode: WebviewApi;
  private handlers = new Set<MessageHandler>();

  constructor() {
    // acquireVsCodeApi 只能调用一次，结果挂在 window 上
    this.vscode = (window as any).__vscodeApi;
    if (!this.vscode) {
      this.vscode = (window as any).acquireVsCodeApi();
      (window as any).__vscodeApi = this.vscode;
    }

    window.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as ExtensionMessage;
      if (msg && typeof msg.command === 'string') {
        for (const handler of this.handlers) {
          handler(msg);
        }
      }
    });
  }

  /** 注册消息处理器 */
  onMessage(handler: MessageHandler): { unsubscribe(): void } {
    this.handlers.add(handler);
    return { unsubscribe: () => this.handlers.delete(handler) };
  }

  /** 发送消息到扩展 */
  send(msg: WebviewMessage): void {
    this.vscode.postMessage(msg);
  }

  // ─── 便捷方法 ─────────────────────────────────────────

  getImageList(): void {
    this.send({ command: 'getImageList' });
  }

  loadImage(path: string): void {
    this.send({ command: 'loadImage', path });
  }

  save(labels: any[]): void {
    this.send({ command: 'save', labels });
  }

  next(): void {
    this.send({ command: 'next' });
  }

  previous(): void {
    this.send({ command: 'previous' });
  }

  reload(): void {
    this.send({ command: 'reload' });
  }

  openImageInNewTab(path: string): void {
    this.send({ command: 'openImageInNewTab', path });
  }

  openTxtInNewTab(path: string): void {
    this.send({ command: 'openTxtInNewTab', path });
  }

  getImagePreviews(paths: string[]): void {
    this.send({ command: 'getImagePreviews', paths });
  }

  getImagePreviewRange(paths: string[], startIndex: number): void {
    this.send({ command: 'getImagePreviewRange', paths, startIndex });
  }

  openModelFile(): void {
    this.send({ command: 'openModelFile' });
  }

  loadModelFile(filePath: string): void {
    this.send({ command: 'loadModelFile', filePath });
  }
}
