/**
 * 加载 onnxruntime-web 模块到 window.ort
 *
 * 此文件作为 webpack 入口，在 main.ts 之前执行。
 *
 * 关键：VS Code WebView 不支持动态 import()，但 ort.min.js 内部会通过
 * import() 加载 ort-wasm-simd-threaded.jsep.mjs。
 *
 * 解决方案：拦截 fetch 返回预加载的 jsep.mjs 内容，
 * 让 ort 的 fetch→blob→import(blob) 链正常工作。
 */
import * as ort from 'onnxruntime-web';

/**
 * 设置 fetch 拦截器，处理 VS Code WebView 的 import() 限制
 */
function setupFetchInterceptor(): void {
  const jsepBase64 = (window as any).__jsepMjsBase64 || '';
  if (!jsepBase64) {
    return;
  }

  try {
    // 解码 base64 数据
    const jsepBytes = Uint8Array.from(atob(jsepBase64), (c) => c.charCodeAt(0));
    const jsepBlob = new Blob([jsepBytes], { type: 'application/javascript' });

    // 保存原始 fetch
    const origFetch = window.fetch;

    // 拦截 fetch 请求
    window.fetch = function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const url = typeof input === 'string' ? input : (input as Request).url;

      // 检查是否是 jsep.mjs 请求
      if (url.includes('ort-wasm-simd-threaded.jsep.mjs')) {
        return Promise.resolve(
          new Response(jsepBlob, {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' },
          }),
        );
      }

      // 其他请求使用原始 fetch
      return origFetch.call(this, input, init);
    };

    console.log('[ort-entry] Fetch interceptor installed for jsep.mjs');
  } catch (error) {
    console.warn('[ort-entry] Failed to setup fetch interceptor:', error);
  }
}

/**
 * 初始化 ORT 并导出到全局
 */
function initOrt(): void {
  // 设置 fetch 拦截器
  setupFetchInterceptor();

  // 导出到全局对象
  (window as any).ort = ort;

  console.log('[ort-entry] ONNX Runtime loaded successfully');
}

// 执行初始化
initOrt();
