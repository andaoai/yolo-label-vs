import * as vscode from 'vscode';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  CONFIG_ERROR = 'ConfigError',
  FILE_NOT_FOUND = 'FileNotFound',
  PERMISSION_ERROR = 'PermissionError',
  IMAGE_LOAD_ERROR = 'ImageLoadError',
  LABEL_PARSE_ERROR = 'LabelParseError',
  LABEL_SAVE_ERROR = 'LabelSaveError',
  WEBVIEW_ERROR = 'WebviewError',
  UNKNOWN_ERROR = 'UnknownError'
}

/**
 * 集中式错误处理
 */
export class ErrorHandler {
  /**
   * 处理错误并记录
   */
  public static handleError(
    error: Error | string,
    context: string,
    options?: {
      type?: ErrorType;
      filePath?: string;
      showNotification?: boolean;
      webview?: vscode.Webview;
      details?: string;
    }
  ): void {
    const opts = {
      showNotification: true,
      ...options
    };

    const errorObj = error instanceof Error ? error : new Error(error);
    const errorType = opts.type || ErrorType.UNKNOWN_ERROR;

    // 构建消息
    let message = `${context}: ${errorObj.message}`;
    if (opts.filePath) {
      message += `\n文件: ${opts.filePath}`;
    }
    if (opts.details) {
      message += `\n${opts.details}`;
    }

    // 记录到控制台
    console.error(`[${errorType}] ${message}`, error instanceof Error ? error.stack : '');

    // 显示通知
    if (opts.showNotification) {
      const actionItems: string[] = [];

      if (errorType === ErrorType.FILE_NOT_FOUND) {
        actionItems.push('检查文件路径');
      } else if (errorType === ErrorType.PERMISSION_ERROR) {
        actionItems.push('检查文件权限');
      } else if (errorType === ErrorType.CONFIG_ERROR && opts.filePath) {
        actionItems.push('查看配置文件');
      }

      if (actionItems.length > 0) {
        vscode.window.showErrorMessage(message, ...actionItems).then(selection => {
          if (selection === '查看配置文件' && opts.filePath) {
            vscode.workspace.openTextDocument(opts.filePath).then(doc => vscode.window.showTextDocument(doc));
          }
        });
      } else {
        vscode.window.showErrorMessage(message);
      }
    }

    // 发送到Webview
    if (opts.webview) {
      opts.webview.postMessage({
        command: 'error',
        error: message,
        type: errorType
      });
    }
  }
}
