/**
 * Host 半侧构建：把 src/host/index.ts 连同 @yolo-label/core、js-yaml 一起
 * 打成单个自包含 ESM（lib/index.js），node: 内置模块保持 external。
 * 发布产物零运行时依赖，profile 用原生 Node 直接加载（不走 tsx）。
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  entryPoints: [path.join(root, 'src/host/index.ts')],
  outfile: path.join(root, 'lib/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  // 原生依赖（含 .node 二进制，无法打包）外置，由 pnpm 作为 runtime 依赖安装；
  // node: 内置模块默认外置；其余（core、js-yaml）内联保持自包含。
  external: ['onnxruntime-node', 'sharp'],
});

console.log('[yolo-label-dsh] host bundle built: lib/index.js');
