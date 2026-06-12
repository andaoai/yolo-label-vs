/**
 * 主题管理器 — VS Code 主题集成
 *
 * 监听主题变化，提供背景色读取
 */
import type { Store } from '../state/Store';
import type { WorkerBridge } from '../communication/WorkerBridge';

export class ThemeManager {
  private observer: MutationObserver | null = null;

  constructor(private store: Store, private worker: WorkerBridge) {}

  /** 获取当前编辑器背景色 */
  getBackgroundColor(): string {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-editor-background')
      .trim() || '#1e1e1e';
  }

  /** 开始监听主题变化 */
  startListening(): void {
    this.observer = new MutationObserver(() => {
      this.syncTheme();
    });
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    // 初始同步
    this.syncTheme();
  }

  /** 停止监听 */
  stopListening(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private syncTheme(): void {
    const bg = this.getBackgroundColor();
    this.worker.updateConfig({ backgroundColor: bg });
  }
}
