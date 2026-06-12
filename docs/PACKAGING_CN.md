# <img src="./images/icon.png" width="32" height="32" alt="YOLO标注工具图标"> 打包指南

## 环境准备
1. 确保已安装 Node.js (>= 20.0.0)
2. 安装必要的开发工具：
   ```bash
   npm install -g @vscode/vsce
   ```

## 打包步骤

1. 安装项目依赖
   ```bash
   npm install
   ```

2. 使用 webpack 构建项目
   ```bash
   npm run build
   ```
   这一步会：
   - 使用 webpack 多编译器配置打包源代码，输出三个 bundle：
     - `dist/extension.js` — VS Code 扩展主进程（Node.js target）
     - `dist/templates/main.js` — WebView 主线程（Web target）
     - `dist/templates/worker.js` — 渲染 Worker（WebWorker target）
   - 通过 CopyPlugin 将 HTML/CSS 模板文件复制到 `dist/templates/` 目录
   - TypeScript 文件（`.ts`）不会被复制，只通过 ts-loader 编译输出

   > **注意：**
   > 前端源码位于 `src/templates/` 目录，分为 `shared/`、`main/`、`worker/` 三个子目录。TypeScript 文件由 webpack 的 ts-loader 编译，HTML/CSS 文件由 CopyPlugin 复制。`.ts` 和旧的 `.js` 文件会被 CopyPlugin 排除（ignore 规则）。

3. 打包插件
   ```bash
   vsce package
   ```
   执行成功后会在项目根目录生成 `yolo-labeling-vs-x.x.x.vsix` 文件（其中x.x.x为版本号）

## 本地测试安装

1. 在 VS Code 中按 `Ctrl+Shift+X` 打开扩展面板
2. 点击扩展面板右上角的 `...` 按钮
3. 选择 "Install from VSIX..."
4. 选择生成的 .vsix 文件

## 常见问题

1. 如果打包时报错 "Missing publisher"，请检查 package.json 中是否设置了 publisher 字段
2. 如果编译报错，请检查 TypeScript 版本是否正确
3. 如果打包时提示缺少某些字段，请检查 package.json 中的必要字段是否都已填写：
   - name
   - displayName
   - description
   - version
   - publisher
   - engines
   - main
   - activationEvents
4. Webpack构建错误：确保 webpack.config.js 配置正确且已安装所有依赖：
   ```bash
   npm install --save-dev webpack webpack-cli ts-loader
   ```

## 版本更新

如需更新版本，请修改 package.json 中的 version 字段，然后重新执行打包命令。 