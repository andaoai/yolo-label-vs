# <img src="./images/icon.png" width="32" height="32" alt="YOLO标注工具图标"> 打包指南

## 环境准备
1. 确保已安装 Node.js (建议版本 >= 14.0.0)
2. 安装必要的开发工具：
   ```bash
   npm install -g @vscode/vsce
   ```

## 打包步骤

1. 安装项目依赖
   ```bash
   npm install
   ```

2. 使用webpack构建项目并复制模板文件
   ```bash
   npm run build
   ```
   这一步会：
   - 使用webpack打包所有源代码
   - 将打包后的文件输出到 `dist` 目录
   - **通过自定义 Node.js 脚本将模板文件从 `src/templates` 复制到 `dist/templates` 目录**

   > **注意：**
   > 插件界面所需的模板文件（如 HTML、CSS、JS 及其子目录）都存放在 `src/templates` 目录下。这些文件不会被 webpack 直接打包，必须通过 `scripts/copy-templates.js` 脚本手动复制到输出目录。该脚本会递归复制 `src/templates` 下的所有文件和文件夹到 `dist/templates`。
   >
   > 如果你新增或修改了模板文件，请确保它们放在 `src/templates` 下，这样才能被正确打包进最终的插件包中。

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