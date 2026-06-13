/**
 * Webview 主线程入口
 *
 * 初始化应用，处理全局错误
 */
import { App } from './App';

// 全局错误处理
window.addEventListener('error', (e) => {
  console.error('[YOLO Label] Uncaught error:', e.error);
  showCriticalError(e.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[YOLO Label] Unhandled rejection:', e.reason);
  showCriticalError(String(e.reason) || 'Unknown error');
});

function showCriticalError(message: string): void {
  const existing = document.getElementById('criticalError');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = 'criticalError';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;';
  overlay.innerHTML = `
    <div style="background:#1e1e1e;padding:32px;border-radius:8px;max-width:500px;text-align:center;">
      <h3 style="color:#f44336;margin:0 0 16px;">Critical Error</h3>
      <p style="color:#cccccc;margin:0 0 24px;">${message}</p>
      <button onclick="location.reload()" style="padding:10px 24px;background:#007acc;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;">Reload Panel</button>
    </div>`;
  document.body.appendChild(overlay);
}

// 启动应用
async function main(): Promise<void> {
  const app = new App();
  await app.start();
  console.log('[YOLO Label] Application started');
}

main().catch((err) => {
  console.error('[YOLO Label] Failed to start:', err);
  showCriticalError(String(err));
});
