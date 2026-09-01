/**
 * yolo-label-dsh — Host 半侧
 *
 * 两块能力：
 *   1. HTTP 路由（ctx.webServer 前缀 /yolo-label）：为原生 Client 工作台提供
 *      YOLO 数据集 JSON/二进制 API（见 operations.ts）。
 *   2. 模型工具（ctx.tools）：让 agent 直接扫描/打开数据集、读写标签、统计
 *      （见 tools.ts）。
 *
 * 安全说明：路由不经 /api 认证桥（仅 127.0.0.1 loopback，dsh web 默认拒绝
 * 0.0.0.0 暴露）；路径只接受绝对路径，图片端点限定扩展名白名单。
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  scanDatasets,
  openDataset,
  readLabels,
  writeLabels,
  getStats,
} from './operations.js';
import { registerTools } from './tools.js';

export const name = 'yolo-label-dsh';
export const inject = ['webServer', 'tools'];

const IMAGE_EXTS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function sendJson(res: any, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(text);
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req: any, res: any, url: URL): Promise<void> {
  const route = url.pathname;

  // ── health ─────────────────────────────────────────────
  if (route === '/yolo-label/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, service: 'yolo-label-dsh' });
    return;
  }

  // ── 扫描数据集 ─────────────────────────────────────────
  if (route === '/yolo-label/api/datasets' && req.method === 'GET') {
    const root = url.searchParams.get('root') ?? '';
    sendJson(res, 200, { datasets: scanDatasets(root) });
    return;
  }

  // ── 打开数据集（图片清单 + 类别） ────────────────────────
  if (route === '/yolo-label/api/dataset' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as {
      yamlPath?: string;
      workspaceRoot?: string;
    };
    if (!body.yamlPath || !path.isAbsolute(body.yamlPath)) {
      sendJson(res, 400, { error: 'body.yamlPath must be an absolute path' });
      return;
    }
    sendJson(res, 200, openDataset(body.yamlPath, body.workspaceRoot));
    return;
  }

  // ── 读取标签 ───────────────────────────────────────────
  if (route === '/yolo-label/api/labels' && req.method === 'GET') {
    const yamlPath = url.searchParams.get('yaml') ?? '';
    const imagePath = url.searchParams.get('image') ?? '';
    if (!path.isAbsolute(yamlPath) || !path.isAbsolute(imagePath)) {
      sendJson(res, 400, { error: 'query params "yaml" and "image" must be absolute paths' });
      return;
    }
    sendJson(res, 200, readLabels(yamlPath, imagePath));
    return;
  }

  // ── 保存标签 ───────────────────────────────────────────
  if (route === '/yolo-label/api/labels' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as {
      yaml?: string;
      image?: string;
      labels?: never[];
    };
    if (!body.yaml || !body.image || !Array.isArray(body.labels)) {
      sendJson(res, 400, { error: 'body needs {yaml, image, labels: []}' });
      return;
    }
    const result = writeLabels(body.yaml, body.image, body.labels);
    sendJson(res, 200, result);
    return;
  }

  // ── 原图字节 ───────────────────────────────────────────
  if (route === '/yolo-label/api/image' && (req.method === 'GET' || req.method === 'HEAD')) {
    const imagePath = url.searchParams.get('path') ?? '';
    if (!path.isAbsolute(imagePath)) {
      sendJson(res, 400, { error: 'query param "path" must be an absolute path' });
      return;
    }
    const ext = path.extname(imagePath).toLowerCase();
    const contentType = IMAGE_EXTS[ext];
    if (!contentType) {
      sendJson(res, 400, { error: `unsupported image extension: ${ext}` });
      return;
    }
    const data = await fsp.readFile(imagePath);
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': data.length,
      'cache-control': 'private, max-age=60',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
    return;
  }

  // ── 数据集统计 ─────────────────────────────────────────
  if (route === '/yolo-label/api/stats' && req.method === 'GET') {
    const yamlPath = url.searchParams.get('yaml') ?? '';
    if (!path.isAbsolute(yamlPath)) {
      sendJson(res, 400, { error: 'query param "yaml" must be an absolute path' });
      return;
    }
    sendJson(res, 200, await getStats(yamlPath));
    return;
  }

  sendJson(res, 404, { error: `not found: ${req.method} ${route}` });
}

export function apply(ctx: any): void {
  // ── 模型工具（agent 可调用） ──
  registerTools(ctx);

  // ── HTTP 路由（client 工作台） ──
  const webServer = ctx.webServer;
  const handler = async (req: any, res: any): Promise<void> => {
    try {
      const base = `http://${req.headers.host ?? '127.0.0.1'}`;
      const url = new URL(req.url ?? '/', base);
      await handleApi(req, res, url);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      console.error('[yolo-label-dsh] route error:', message);
      if (!res.headersSent) sendJson(res, 500, { error: message });
    }
  };

  ctx.effect(() =>
    webServer.register({
      kind: 'prefix',
      path: '/yolo-label',
      handler,
    }),
  );

  console.log('[yolo-label-dsh] host plugin active: /yolo-label/api/* + model tools');
}
