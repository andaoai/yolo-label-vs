# <img src="./images/icon.svg" width="32" height="32" alt="YOLO标注工具图标"> 打包指南

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

2. 编译项目
   ```bash
   npm run compile
   ```

3. 打包插件
   ```bash
   vsce package
   ```
   执行成功后会在项目根目录生成 `yolo-labeling-vs-0.0.3.vsix` 文件

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

## 版本更新

如需更新版本，请修改 package.json 中的 version 字段，然后重新执行打包命令。 