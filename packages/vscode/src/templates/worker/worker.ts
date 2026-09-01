/**
 * Worker 渲染线程入口
 *
 * 接收主线程消息，转发给 RenderEngine 处理
 * 将 RenderEngine 的响应发送回主线程
 */
import type { MainToWorkerMessage } from '../shared/messages';
import { RenderEngine } from './RenderEngine';
import { DEFAULT_RENDER_CONFIG } from '../shared/config';

let engine: RenderEngine | null = null;

function postMessage(msg: unknown): void {
  (self as unknown as { postMessage: (msg: unknown) => void }).postMessage(msg);
}

self.onmessage = (e: MessageEvent<MainToWorkerMessage>) => {
  const msg = e.data;

  // init 消息创建引擎
  if (msg.type === 'init') {
    engine = new RenderEngine({ ...DEFAULT_RENDER_CONFIG, ...msg.config });
    const response = engine.handleMessage(msg);
    if (response) postMessage(response);
    return;
  }

  if (!engine) {
    console.warn('[Worker] Received message before init:', msg.type);
    return;
  }

  const response = engine.handleMessage(msg);
  if (response) {
    postMessage(response);
  }
};

// 通知主线程 Worker 已加载
postMessage({ type: 'ready' });
