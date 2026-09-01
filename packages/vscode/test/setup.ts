/**
 * 测试数据自动下载工具
 *
 * 读取 test/models.yaml 和 test/*.yaml（数据集配置），
 * 自动下载缺失的模型权重和数据集到 test/data/。
 *
 * 可独立运行: npx tsx test/setup.ts
 * 也可被测试脚本调用: import { ensureModels, ensureDatasets } from './setup'
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MODELS_DIR = path.join(ROOT, 'test/data/models');
const DATASETS_DIR = path.join(ROOT, 'test/data/datasets');

// ─── 接口定义 ─────────────────────────────────────────────

interface ModelEntry {
  url: string;
  task: 'det' | 'seg';
  type?: string;  // 'sam-encoder' | 'sam-decoder' 等
}

interface DatasetConfig {
  path: string;
  download: string;
  train?: string;
  val?: string;
  names?: Record<number, string>;
}

// ─── 工具函数 ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 带进度的下载 */
async function downloadFile(url: string, destPath: string, label: string): Promise<void> {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`  ⬇ 下载 ${label}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败: ${url} (${res.status} ${res.statusText})`);

  const total = Number(res.headers.get('content-length')) || 0;
  const body = res.body;
  if (!body) throw new Error('响应体为空');

  const fileStream = fs.createWriteStream(destPath);
  const reader = body.getReader();
  let downloaded = 0;
  let lastPrint = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
    downloaded += value.length;

    // 每 500ms 打印一次进度
    const now = Date.now();
    if (now - lastPrint > 500 || downloaded === total) {
      lastPrint = now;
      const pct = total > 0 ? ` (${Math.round(downloaded / total * 100)}%)` : '';
      process.stdout.write(`\r  ⬇ ${label}: ${formatBytes(downloaded)}${pct}    `);
    }
  }

  fileStream.end();
  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  process.stdout.write('\n');
  console.log(`  ✓ ${label} 下载完成 (${formatBytes(downloaded)})`);
}

/** 解压 zip 到目标目录 */
function extractZip(zipPath: string, destDir: string, label: string): void {
  console.log(`  📦 解压 ${label}...`);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  console.log(`  ✓ ${label} 解压完成`);
}

// ─── 模型下载 ─────────────────────────────────────────────

function loadModelsConfig(): Record<string, ModelEntry> {
  const configPath = path.join(__dirname, 'models.yaml');
  if (!fs.existsSync(configPath)) {
    console.warn(`  ⚠ 未找到 ${configPath}，跳过模型检查`);
    return {};
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.load(content) as Record<string, ModelEntry>;
}

/** 确保指定模型存在，缺失则下载。不传参数则确保所有模型 */
export async function ensureModels(names?: string[]): Promise<void> {
  const config = loadModelsConfig();
  const targets = names ? Object.fromEntries(Object.entries(config).filter(([k]) => names.includes(k))) : config;

  for (const [name, entry] of Object.entries(targets)) {
    const destPath = path.join(MODELS_DIR, `${name}.onnx`);
    if (fs.existsSync(destPath)) {
      console.log(`  ✓ ${name}.onnx 已存在`);
      continue;
    }
    await downloadFile(entry.url, destPath, `${name}.onnx`);
  }
}

// ─── 数据集下载 ────────────────────────────────────────────

/** 扫描 test/*.yaml 获取数据集配置 */
function loadDatasetConfigs(): DatasetConfig[] {
  const configs: DatasetConfig[] = [];
  const testDir = __dirname;

  const yamlFiles = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.yaml') && f !== 'models.yaml');

  for (const file of yamlFiles) {
    const filePath = path.join(testDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as any;
    if (parsed?.download) {
      configs.push(parsed as DatasetConfig);
    }
  }
  return configs;
}

/** 从 download URL 提取数据集名称 */
function datasetNameFromUrl(url: string): string {
  const filename = url.split('/').pop() || '';
  return filename.replace('.zip', '');
}

/** 确保指定数据集存在，缺失则下载。不传参数则确保所有数据集 */
export async function ensureDatasets(names?: string[]): Promise<void> {
  const configs = loadDatasetConfigs();
  const targets = names
    ? configs.filter(c => {
        const name = datasetNameFromUrl(c.download);
        return names.includes(name);
      })
    : configs;

  for (const config of targets) {
    const name = datasetNameFromUrl(config.download);
    const destDir = path.join(DATASETS_DIR, name);

    // 检查是否已存在（目录存在且非空）
    if (fs.existsSync(destDir) && fs.readdirSync(destDir).length > 0) {
      console.log(`  ✓ ${name} 已存在`);
      continue;
    }

    // 下载 zip
    const zipPath = path.join(DATASETS_DIR, `${name}.zip`);
    await downloadFile(config.download, zipPath, name);

    // 解压
    extractZip(zipPath, DATASETS_DIR, name);

    // 删除 zip
    fs.unlinkSync(zipPath);
  }
}

// ─── 独立运行入口 ──────────────────────────────────────────

async function main() {
  console.log('=== 测试数据检查 ===\n');

  console.log('📦 模型权重:');
  await ensureModels();

  console.log('\n📦 数据集:');
  await ensureDatasets();

  console.log('\n=== 检查完成 ===');
}

// 直接运行时执行
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch(err => {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  });
}
