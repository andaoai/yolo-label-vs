/**
 * Host HTTP API 封装 — 同源调用 host 半侧注册的 /yolo-label/api/* 路由。
 * 这些端点不经 /api 认证桥（127.0.0.1 loopback）。
 */

const API_BASE = '/yolo-label/api';

/** 平台无关标签结构（与 @yolo-label/core 的 Label 一致，类型仅本地声明）。 */
export interface Label {
  class: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isSegmentation?: boolean;
  isPose?: boolean;
  points?: number[];
  keypoints?: number[];
  keypointShape?: number[];
  visible?: boolean;
}

export interface DatasetSummary {
  yamlPath: string;
  datasetRoot: string;
  name: string;
  classNames: string[];
  classCount: number;
  kptShape: number[] | null;
}

export interface OpenDataset {
  yamlPath: string;
  classNames: string[];
  kptShape: number[] | null;
  total: number;
  images: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchHealth(): Promise<void> {
  await request<{ ok: boolean }>('/health');
}

export async function scanDatasets(root: string): Promise<DatasetSummary[]> {
  const data = await request<{ datasets: DatasetSummary[] }>(
    `/datasets?root=${encodeURIComponent(root)}`,
  );
  return data.datasets;
}

export async function openDataset(
  yamlPath: string,
  workspaceRoot?: string,
): Promise<OpenDataset> {
  return request<OpenDataset>('/dataset', {
    method: 'POST',
    body: JSON.stringify({ yamlPath, workspaceRoot }),
  });
}

export async function fetchLabels(
  yamlPath: string,
  imagePath: string,
): Promise<Label[]> {
  const data = await request<{ image: string; labels: Label[] }>(
    `/labels?yaml=${encodeURIComponent(yamlPath)}&image=${encodeURIComponent(imagePath)}`,
  );
  return data.labels;
}

export async function saveLabels(
  yamlPath: string,
  imagePath: string,
  labels: Label[],
): Promise<void> {
  await request<{ ok: boolean }>('/labels', {
    method: 'POST',
    body: JSON.stringify({ yaml: yamlPath, image: imagePath, labels }),
  });
}

/** 原图字节 URL（<img>/fetch 直接使用）。 */
export function imageUrl(imagePath: string): string {
  return `${API_BASE}/image?path=${encodeURIComponent(imagePath)}`;
}

export async function loadImageBitmap(imagePath: string): Promise<ImageBitmap> {
  const res = await fetch(imageUrl(imagePath));
  if (!res.ok) throw new Error(`image load failed: HTTP ${res.status}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}
