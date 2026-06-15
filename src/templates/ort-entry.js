/**
 * 加载 onnxruntime-web UMD 模块到 window.ort
 * 此文件作为 webpack 入口，在 main.ts 之前执行。
 *
 * 关键：ort.min.js 内部会通过 import() 加载 ort-wasm-simd-threaded.jsep.mjs，
 * 但 VSCode webview 不支持从 vscode-resource URL 动态 import()。
 * 解决方案：拦截 fetch 返回预加载的 jsep.mjs 内容，让 ort 的 fetch→blob→import(blob) 链正常工作。
 */
(function() {
  var jsepBase64 = (typeof window !== 'undefined' && window.__jsepMjsBase64) || '';
  if (jsepBase64) {
    var jsepBytes = Uint8Array.from(atob(jsepBase64), function(c) { return c.charCodeAt(0); });
    var jsepBlob = new Blob([jsepBytes], { type: 'application/javascript' });
    var jsepBlobUrl = URL.createObjectURL(jsepBlob);

    var origFetch = window.fetch;
    window.fetch = function(input) {
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (url.indexOf('ort-wasm-simd-threaded.jsep.mjs') !== -1) {
        return Promise.resolve(new Response(jsepBlob, {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
        }));
      }
      return origFetch.apply(this, arguments);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  var ort = require('../../node_modules/onnxruntime-web/dist/ort.min.js');
  window.ort = ort;
})();
