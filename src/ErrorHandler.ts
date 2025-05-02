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
  contextInfo?: Record<string, any>;
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
      contextInfo?: Record<string, any>;
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
    
    // 构建消息，添加更多上下文信息
    let message = `${context}: ${errorObj.message}`;
    
    // 添加文件路径信息（如果有）
    if (opts.filePath) {
      message += `\nFile: ${opts.filePath}`;
    }
    
    // 添加额外详情（如果有）
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
      recoverable: opts.recoverable,
      contextInfo: opts.contextInfo
    };
    
    // 添加到历史记录
    this._errors.unshift(errorDetails);
    if (this._errors.length > this.MAX_ERROR_HISTORY) {
      this._errors.pop();
    }
    
    // 记录到控制台，增加更多信息
    console.error(`[${errorType}] ${message}`, 
      error instanceof Error ? error.stack : '',
      opts.contextInfo ? `\nContext: ${JSON.stringify(opts.contextInfo)}` : '');
    
    // 显示通知，提供更具体的建议
    if (opts.showNotification) {
      const actionItems: string[] = [];
      
      // 根据错误类型添加建议操作
      if (errorType === ErrorType.FILE_NOT_FOUND) {
        actionItems.push('检查文件路径');
      } else if (errorType === ErrorType.PERMISSION_ERROR) {
        actionItems.push('检查文件权限');
      } else if (errorType === ErrorType.CONFIG_ERROR) {
        actionItems.push('查看配置文件');
      }
      
      // 如果错误可恢复，添加重试选项
      if (opts.recoverable) {
        actionItems.push('重试');
      }
      
      // 显示带操作的错误消息
      if (actionItems.length > 0) {
        vscode.window.showErrorMessage(message, ...actionItems)
          .then(selection => {
            if (selection === '重试') {
              this.attemptRecovery(errorDetails);
            } else if (selection === '查看配置文件' && opts.filePath) {
              vscode.workspace.openTextDocument(opts.filePath)
                .then(doc => vscode.window.showTextDocument(doc));
            }
          });
      } else {
        vscode.window.showErrorMessage(message);
      }
    }
    
    // 发送到Webview，包含更多错误上下文
    if (opts.webview) {
      opts.webview.postMessage({
        command: 'error',
        error: message,
        type: errorType,
        recoverable: opts.recoverable,
        contextInfo: opts.contextInfo
      });
    }
    
    return errorDetails;
  }

  /**
   * 尝试自动恢复错误
   * @param error 错误详情
   */
  private static async attemptRecovery(error: ErrorDetails): Promise<boolean> {
    const recoveryAction = this.getRecoveryAction(error);
    if (recoveryAction) {
      return await recoveryAction();
    }
    return false;
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
   * 获取错误恢复操作
   */
  public static getRecoveryAction(error: ErrorDetails): (() => Promise<boolean>) | null {
    if (!error.recoverable) {
      return null;
    }
    
    switch (error.type) {
      case ErrorType.FILE_NOT_FOUND:
        // 对于文件不存在错误，可以提供跳过当前文件的动作
        return async () => {
          vscode.commands.executeCommand('yolo-labeling-vs.openLabelingPanelKeyboard');
          return true;
        };
        
      case ErrorType.PERMISSION_ERROR:
        // 权限错误可能需要用户手动处理
        return async () => {
          const action = await vscode.window.showInformationMessage(
            '请检查文件权限后重试', 
            '已修复，重试',
            '取消'
          );
          if (action === '已修复，重试') {
            vscode.commands.executeCommand('yolo-labeling-vs.openLabelingPanelKeyboard');
            return true;
          }
          return false;
        };
        
      case ErrorType.CONFIG_ERROR:
        // 配置错误可能需要重新加载配置
        return async () => {
          const action = await vscode.window.showInformationMessage(
            '配置文件存在问题，是否修复后重试？', 
            '已修复，重试',
            '取消'
          );
          if (action === '已修复，重试') {
            vscode.commands.executeCommand('yolo-labeling-vs.openLabelingPanelKeyboard');
            return true;
          }
          return false;
        };
        
      case ErrorType.IMAGE_LOAD_ERROR:
        // 图像加载错误，可以尝试下一张图片
        return async () => {
          const action = await vscode.window.showInformationMessage(
            '无法加载图片，是否跳过这张图片？', 
            '跳过',
            '取消'
          );
          if (action === '跳过') {
            vscode.commands.executeCommand('yolo-labeling-vs.nextImage');
            return true;
          }
          return false;
        };
        
      default:
        return null;
    }
  }
} 