/**
 * 构建 dsh.client bundle：闭包工厂格式（closure-factory）。
 *
 * 产物形如：
 *   window.__ModuleLoader__.load({
 *     id: 'yolo-label-dsh',
 *     factory: (require) => {
 *       var module = { exports: {} };
 *       var exports = module.exports;
 *       ... CJS bundle，external 通过工厂参数 require 解析 ...
 *       return module.exports;
 *     }
 *   });
 *
 * external 基线（PLATFORM_MODULES，壳子播种的冻结模块表）中的 specifier
 * 保持 require() 不打包；其余一切（我们自己的代码）内联。
 * 与 DSH 仓库 packages/client/tsdown.client.ts 的 clientConfig 输出格式对齐。
 */
import * as esbuild from 'esbuild';

const PLUGIN_ID = 'yolo-label-dsh';

/** 壳子共享模块基线（见 dsh packages/client/web/src/platform.ts）。 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
];

const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2022',
  external: PLATFORM_MODULES,
  sourcemap: true,
  sourcesContent: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
  banner: {
    js:
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\n` +
      'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: {
    js: 'return module.exports; } });',
  },
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('[yolo-label-dsh] client bundle watching...');
} else {
  await esbuild.build(config);
  console.log('[yolo-label-dsh] client bundle built: lib/client.js');
}
