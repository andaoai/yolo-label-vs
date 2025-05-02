import * as vscode from 'vscode';

/**
 * 错误类型枚举，用于区分不同类型的错误
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
 * 错误详情接口
 */
export interface ErrorDetails {
  type: ErrorType;
  message: string;
  filePath?: string;
  originalError?: Error;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * 集中式错误处理类
 */
export class ErrorHandler {
  private static _errors: ErrorDetails[] = [];
  private static readonly MAX_ERROR_HISTORY = 50;

  /**
   * 根据Node.js错误创建适当的错误类型
   */
  public static classifyError(error: Error & { code?: string }, filePath?: string): ErrorType {
    if (error.code === 'ENOENT') {
      return ErrorType.FILE_NOT_FOUND;
    } else if (error.code === 'EACCES') {
      return ErrorType.PERMISSION_ERROR;
    } else if (error.message.includes('parse')) {
      return ErrorType.LABEL_PARSE_ERROR;
    } else if (error.message.includes('image')) {
      return ErrorType.IMAGE_LOAD_ERROR;
    } else if (error.message.includes('config')) {
      return ErrorType.CONFIG_ERROR;
    }
    return ErrorType.UNKNOWN_ERROR;
  }

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
      recoverable?: boolean;
      webview?: vscode.Webview;
      details?: string;
    }
  ): ErrorDetails {
    // 默认值
    const opts = {
      showNotification: true,
      recoverable: true,
      ...options
    };

    // 创建错误对象
    const errorObj = error instanceof Error ? error : new Error(error);
    
    // 分类错误类型
    const errorType = opts.type || 
      (error instanceof Error ? this.classifyError(error, opts.filePath) : ErrorType.UNKNOWN_ERROR);
    
    // 构建消息
    let message = `${context}: ${errorObj.message}`;
    if (opts.details) {
      message += `\n${opts.details}`;
    }
    
    // 记录错误
    const errorDetails: ErrorDetails = {
      type: errorType,
      message: message,
      filePath: opts.filePath,
      originalError: error instanceof Error ? error : undefined,
      timestamp: new Date(),
      recoverable: opts.recoverable
    };
    
    // 添加到历史记录
    this._errors.unshift(errorDetails);
    if (this._errors.length > this.MAX_ERROR_HISTORY) {
      this._errors.pop();
    }
    
    // 记录到控制台
    console.error(`[${errorType}] ${message}`, error instanceof Error ? error.stack : '');
    
    // 显示通知
    if (opts.showNotification) {
      vscode.window.showErrorMessage(message);
    }
    
    // 发送到Webview
    if (opts.webview) {
      opts.webview.postMessage({
        command: 'error',
        error: message,
        type: errorType,
        recoverable: opts.recoverable
      });
    }
    
    return errorDetails;
  }

  /**
   * 获取错误历史记录
   */
  public static getErrorHistory(): ReadonlyArray<ErrorDetails> {
    return [...this._errors];
  }

  /**
   * 清除错误历史记录
   */
  public static clearErrorHistory(): void {
    this._errors = [];
  }
  
  /**
   * 尝试恢复错误
   */
  public static getRecoveryAction(error: ErrorDetails): (() => Promise<boolean>) | null {
    if (!error.recoverable) {
      return null;
    }
    
    switch (error.type) {
      case ErrorType.FILE_NOT_FOUND:
      case ErrorType.PERMISSION_ERROR:
        // 对于文件错误，可以提供一个跳过当前文件的动作
        return async () => true;
        
      case ErrorType.CONFIG_ERROR:
        // 配置错误可能需要重新加载配置
        return async () => true;
        
      default:
        return null;
    }
  }
} 