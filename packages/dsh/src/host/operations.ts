/**
 * Host 业务操作层：扫描 / 打开数据集、读写标签、统计。
 * HTTP 路由（index.ts）与模型工具（tools.ts）共用同一实现；
 * 全部返回纯 JSON（无 live 对象），可安全跨 JSON-RPC 与工具边界。
 */
import * as fssync from 'node:fs';
import * as path from 'node:path';
import {
  YoloDataReader,
  tryLoadConfig,
  resolveDatasetPath,
  DatasetStatisticsService,
  type Label,
} from '@yolo-label/core/node';

export interface DatasetSummary {
  yamlPath: string;
  datasetRoot: string;
  name: string;
  classCount: number;
  kptShape: number[] | null;
}

export interface OpenedDataset {
  yamlPath: string;
  classNames: string[];
  kptShape: number[] | null;
  total: number;
  images: string[];
}

/** 已打开数据集的 reader 缓存（key = yamlPath | workspaceRoot） */
const readers = new Map<string, YoloDataReader>();

function readerKey(yamlPath: string, workspaceRoot?: string): string {
  return `${yamlPath}|${workspaceRoot ?? ''}`;
}

export function getReader(yamlPath: string, workspaceRoot?: string): YoloDataReader {
  const key = readerKey(yamlPath, workspaceRoot);
  let reader = readers.get(key);
  if (!reader) {
    reader = new YoloDataReader(yamlPath, workspaceRoot);
    readers.set(key, reader);
  }
  return reader;
}

/** 断言为绝对路径（host 只接受显式的绝对文件路径）。 */
export function assertAbsolute(p: unknown, field: string): asserts p is string {
  if (typeof p !== 'string' || p.length === 0 || !path.isAbsolute(p)) {
    throw new Error(`${field} must be a non-empty absolute path (got ${JSON.stringify(p)})`);
  }
}

/** 递归收集目录下的 yaml/yml（跳过隐藏目录与 node_modules，限深度）。 */
function collectYamlFiles(dir: string, depth: number, acc: string[]): void {
  if (depth < 0) return;
  let entries: fssync.Dirent[];
  try {
    entries = fssync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectYamlFiles(full, depth - 1, acc);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') acc.push(full);
    }
  }
}

/** 扫描目录，返回所有合法 YOLO 数据集的摘要。 */
export function scanDatasets(root: string): DatasetSummary[] {
  assertAbsolute(root, 'root');
  if (!fssync.existsSync(root)) throw new Error(`root not found: ${root}`);

  const yamlFiles: string[] = [];
  collectYamlFiles(root, 6, yamlFiles);

  const results: DatasetSummary[] = [];
  for (const yamlPath of yamlFiles) {
    try {
      let content: string;
      try {
        content = fssync.readFileSync(yamlPath, 'utf8');
      } catch {
        continue;
      }
      if (!content.includes('path:') || !content.includes('names:')) continue;

      const config = tryLoadConfig(yamlPath);
      if (!config) continue;

      const datasetRoot = resolveDatasetPath(config, path.dirname(yamlPath), root);
      if (!fssync.existsSync(datasetRoot)) continue;

      results.push({
        yamlPath,
        datasetRoot,
        name: path.basename(yamlPath).replace(/\.(ya?ml)$/i, ''),
        classCount: config.names.length,
        kptShape: config.kpt_shape ?? null,
      });
    } catch {
      // 单个文件失败不影响整体扫描
    }
  }
  return results;
}

/** 打开数据集：类别、关键点形状、图片总数与清单。 */
export function openDataset(yamlPath: string, workspaceRoot?: string, imageLimit?: number): OpenedDataset {
  assertAbsolute(yamlPath, 'yamlPath');
  const reader = getReader(yamlPath, workspaceRoot);
  const images = reader.getAllImages();
  return {
    yamlPath,
    classNames: reader.getClassNames(),
    kptShape: reader.getKptShape() ?? null,
    total: images.length,
    images: typeof imageLimit === 'number' && imageLimit > 0 ? images.slice(0, imageLimit) : images,
  };
}

/** 读取某图片的标签（YOLO 归一化坐标）。 */
export function readLabels(yamlPath: string, imagePath: string): { image: string; labels: Label[] } {
  assertAbsolute(yamlPath, 'yamlPath');
  assertAbsolute(imagePath, 'imagePath');
  const reader = getReader(yamlPath, undefined);
  return { image: imagePath, labels: reader.readLabels(imagePath) };
}

/** 保存标签（YOLO txt，6 位小数）。labels 为 Label 结构数组。 */
export function writeLabels(
  yamlPath: string,
  imagePath: string,
  labels: Label[],
): { ok: true; image: string; count: number } {
  assertAbsolute(yamlPath, 'yamlPath');
  assertAbsolute(imagePath, 'imagePath');
  if (!Array.isArray(labels)) throw new Error('labels must be an array');
  const reader = getReader(yamlPath, undefined);
  reader.saveLabels(imagePath, labels);
  return { ok: true, image: imagePath, count: labels.length };
}

/** 数据集统计（类别分布、框统计、train/val/test 对比等）。 */
export async function getStats(yamlPath: string): Promise<unknown> {
  assertAbsolute(yamlPath, 'yamlPath');
  return DatasetStatisticsService.calculateStatistics(yamlPath, undefined);
}
