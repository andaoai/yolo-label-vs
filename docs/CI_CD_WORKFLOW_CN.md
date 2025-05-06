# CI/CD 工作流指南

本文档描述了 YOLO Label VS 扩展项目使用的 CI/CD（持续集成/持续部署）工作流程。

## 目录
1. [概述](#概述)
2. [GitHub Actions 工作流](#github-actions-工作流)
3. [工作流配置](#工作流配置)
4. [发布流程](#发布流程)
5. [自动化任务](#自动化任务)
6. [故障排除](#故障排除)

## 概述

我们的 CI/CD 流水线自动化了 YOLO Label VS 扩展的测试、构建和发布过程。这有助于确保代码质量并简化发布流程。

**主要优势：**
- 自动验证代码更改
- 一致的构建和打包
- 自动版本管理
- 自动发布到 Visual Studio Code 插件市场
- 减少发布过程中的手动干预

## GitHub Actions 工作流

我们使用 GitHub Actions 实现 CI/CD 流水线。工作流由存储库中的特定事件触发。

### 工作流触发器

CI/CD 工作流由以下事件触发：
- **main-publish.yml**：手动触发或推送到 `main` 分支
- **version-updater.yml**：手动触发或推送到 `dev` 分支（忽略对 package.json 的更改）

### 工作流文件

工作流配置存储在 `.github/workflows/` 目录中：

- `main-publish.yml`：用于构建、创建发布和发布扩展的主要工作流
- `version-updater.yml`：用于自动递增开发分支中的补丁版本号的工作流

## 工作流配置

### 主发布工作流

`main-publish.yml` 工作流执行以下步骤：

1. **检出**：从存储库获取最新代码
2. **设置 Node.js**：配置 Node.js 环境（版本 20.x）
3. **获取当前版本**：从 package.json 中提取版本号
4. **安装依赖**：删除 package-lock.json 并安装必要的 npm 包
5. **编译**：编译 TypeScript 代码
6. **打包**：为扩展创建 VSIX 包
7. **创建 GitHub 发布**：使用当前版本号创建新的发布
8. **将 VSIX 上传到发布**：将 VSIX 包附加到 GitHub 发布
9. **发布**：将扩展发布到 VS Code 插件市场

```yaml
name: Publish to VS Code Marketplace

on:
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  publish-to-marketplace:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && !contains(github.event.head_commit.message, '[skip ci]')
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.PAT_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20.x'
      
      - name: Get current version
        id: current_version
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
        
      - name: Delete package-lock.json and install dependencies
        run: |
          rm -f package-lock.json
          npm install --no-package-lock --ignore-scripts
        
      - name: Compile extension
        run: npm run compile
        
      - name: Package extension
        run: |
          npm install -g @vscode/vsce
          vsce package
          
      - name: Create GitHub Release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
        with:
          tag_name: v${{ steps.current_version.outputs.version }}
          release_name: Release v${{ steps.current_version.outputs.version }}
          draft: false
          prerelease: false
          body: |
            New version released to VS Code Marketplace.
            Version: ${{ steps.current_version.outputs.version }}
      
      - name: Upload VSIX to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./yolo-labeling-vs-${{ steps.current_version.outputs.version }}.vsix
          asset_name: yolo-labeling-vs-${{ steps.current_version.outputs.version }}.vsix
          asset_content_type: application/octet-stream
      
      - name: Publish to Visual Studio Marketplace
        uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.VSCE_TOKEN }}
          registryUrl: https://marketplace.visualstudio.com
```

### 版本更新工作流

`version-updater.yml` 工作流会自动递增 `dev` 分支中的补丁版本号：

1. **检出**：从存储库获取代码
2. **设置 Node.js**：配置 Node.js 环境（版本 20.x）
3. **获取当前版本**：从 package.json 中提取当前版本号
4. **递增补丁版本**：递增补丁版本号（第三个数字）
5. **更新 Package.json**：更新 package.json 中的版本号
6. **提交并推送**：将更改提交并推送回存储库
7. **安装依赖**：删除 package-lock.json 并安装必要的包
8. **编译和打包**：构建和打包扩展进行测试

```yaml
name: Update Version for Dev Branch

on:
  workflow_dispatch:
  push:
    branches: [dev]
    paths-ignore:
      - 'package.json'

permissions:
  contents: write

jobs:
  update-version:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/dev' && !contains(github.event.head_commit.message, '[skip ci]')
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.PAT_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20.x'
      
      - name: Get current version
        id: current_version
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
        
      - name: Bump patch version (third number)
        id: new_version
        run: |
          CURRENT=${{ steps.current_version.outputs.version }}
          MAJOR=$(echo $CURRENT | cut -d. -f1)
          MINOR=$(echo $CURRENT | cut -d. -f2)
          PATCH=$(echo $CURRENT | cut -d. -f3)
          NEWPATCH=$((PATCH + 1))
          NEWVERSION="$MAJOR.$MINOR.$NEWPATCH"
          echo "version=$NEWVERSION" >> $GITHUB_OUTPUT
          
      - name: Update package.json version
        run: |
          npm version ${{ steps.new_version.outputs.version }} --no-git-tag-version
          
      - name: Commit and push changes
        run: |
          git config --global user.name "GitHub Action"
          git config --global user.email "action@github.com"
          git add package.json
          git commit -m "Bump patch version to ${{ steps.new_version.outputs.version }} for dev release [skip ci]"
          git push
```

## 发布流程

发布流程遵循以下步骤：

1. **开发**：在功能分支中开发功能
2. **拉取请求**：通过拉取请求将更改提交到 `dev` 分支
3. **代码审核**：PR 被审核并批准
4. **合并到 Dev**：批准的更改被合并到 `dev` 分支
   - `version-updater.yml` 工作流自动递增补丁版本号
5. **测试**：在 `dev` 分支中测试更改
6. **合并到 Main**：准备发布时，将 `dev` 分支合并到 `main`
7. **自动发布与发布**：`main-publish.yml` 工作流自动：
   - 使用版本标签创建 GitHub 发布
   - 将扩展发布到 VS Code 插件市场

### 版本管理

项目使用语义化版本控制（`vX.Y.Z`）：
- **主版本号 (X)**：不兼容的 API 更改
- **次版本号 (Y)**：向后兼容的功能添加
- **补丁版本号 (Z)**：向后兼容的错误修复

对于开发工作，补丁版本号由 version-updater 工作流自动递增。

## 自动化任务

CI/CD 工作流自动化以下任务：

1. **版本管理**：自动递增 `dev` 分支上的补丁版本号
2. **构建**：将 TypeScript 代码编译为 JavaScript
3. **打包**：为扩展创建 VSIX 包
4. **发布创建**：使用适当的版本号创建 GitHub 发布
5. **发布**：将扩展上传到 VS Code 插件市场

### 配置文件

关键配置文件：

- `package.json`：包含扩展元数据和脚本
- `.github/workflows/*.yml`：GitHub Actions 工作流配置
- `.vscodeignore`：指定从扩展包中排除的文件

## 故障排除

### 常见问题

1. **构建失败**
   - 检查 GitHub Actions 日志以获取特定错误
   - 确保在 `package.json` 中正确指定所有依赖项
   - 验证代码通过编译

2. **发布失败**
   - 验证个人访问令牌 (PAT_TOKEN) 和 VSCE 令牌 (VSCE_TOKEN) 有效并具有正确的权限
   - 检查 `package.json` 中的版本是否符合语义化版本控制
   - 确保 `package.json` 中的 `publisher` 字段正确

3. **版本冲突**
   - 如果进行手动版本更改，确保它们不会与自动版本控制冲突
   - 避免在 `dev` 分支上直接编辑 `package.json` 版本

### 获取帮助

如果您遇到 CI/CD 工作流问题：

1. 检查 GitHub Actions 日志以获取详细错误消息
2. 查看 [VS Code 扩展发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
3. 通过我们的[问题跟踪器](https://github.com/andaoai/yolo-label-vs/issues)提交问题

---

本文档由 YOLO Label VS 开发团队维护。如有问题或建议，请在存储库中创建问题。 