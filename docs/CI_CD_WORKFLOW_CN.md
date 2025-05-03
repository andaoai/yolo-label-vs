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
- 自动发布到 Visual Studio Code 插件市场
- 减少发布过程中的手动干预

## GitHub Actions 工作流

我们使用 GitHub Actions 实现 CI/CD 流水线。工作流由存储库中的特定事件触发。

### 工作流触发器

CI/CD 工作流由以下事件触发：
- 推送到 `main` 分支
- 创建新标签（用于发布）
- 针对 `main` 分支的拉取请求（用于测试）

### 工作流文件

工作流配置存储在 `.github/workflows/` 目录中：

- `main-publish.yml`：用于构建和发布扩展的主要工作流
- `pr-validation.yml`：用于验证拉取请求的工作流

## 工作流配置

### 主发布工作流

`main-publish.yml` 工作流执行以下步骤：

1. **检出**：从存储库获取最新代码
2. **设置 Node.js**：配置 Node.js 环境
3. **安装依赖**：安装必要的 npm 包
4. **代码检查**：检查代码质量
5. **构建**：编译 TypeScript 代码
6. **打包**：为扩展创建 VSIX 包
7. **发布**：将扩展发布到 VS Code 插件市场

```yaml
name: Publish to VS Code Marketplace

on:
  push:
    branches: [main]
  release:
    types: [created]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: '20.x'
      - run: npm install
      - run: npm run lint
      - run: npm run build
      - run: npm run package
      
  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: '20.x'
      - run: npm install
      - run: npm run build
      - run: npm run package
      - name: Publish to VS Code Marketplace
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

### PR 验证工作流

`pr-validation.yml` 工作流在创建或更新拉取请求时运行：

1. **检出**：获取拉取请求中的代码
2. **设置 Node.js**：配置 Node.js 环境
3. **安装依赖**：安装必要的 npm 包
4. **代码检查**：检查代码质量
5. **构建**：确保代码正确编译
6. **测试打包**：验证扩展可以正确打包

## 发布流程

发布流程遵循以下步骤：

1. **开发**：在功能分支中开发功能
2. **拉取请求**：通过拉取请求将更改提交到 `dev` 分支
3. **代码审核**：PR 被审核并批准
4. **合并到 Dev**：批准的更改被合并到 `dev` 分支
5. **测试**：在 `dev` 分支中测试更改
6. **版本更新**：根据语义化版本控制更新 `package.json` 中的版本
7. **合并到 Main**：`dev` 分支合并到 `main`
8. **创建标签**：使用版本号创建新标签
9. **自动发布**：CI/CD 工作流自动将扩展发布到 VS Code 插件市场

### 版本标记

版本标签遵循语义化版本控制（`vX.Y.Z`）：

```bash
git tag -a v0.0.x -m "版本0.0.x"
git push origin v0.0.x
```

## 自动化任务

CI/CD 工作流自动化以下任务：

1. **代码验证**：通过代码检查确保代码质量
2. **构建**：将 TypeScript 代码编译为 JavaScript
3. **打包**：为扩展创建 VSIX 包
4. **发布**：将扩展上传到 VS Code 插件市场

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
   - 验证代码通过代码检查和类型检查

2. **发布失败**
   - 验证个人访问令牌 (PAT) 有效并具有正确的权限
   - 检查 `package.json` 中的版本是否已增加
   - 确保 `package.json` 中的 `publisher` 字段正确

3. **版本冲突**
   - 确保每个发布版本都有唯一的版本号
   - 检查版本是否遵循语义化版本控制规则

### 获取帮助

如果您遇到 CI/CD 工作流问题：

1. 检查 GitHub Actions 日志以获取详细错误消息
2. 查看 [VS Code 扩展发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
3. 通过我们的[问题跟踪器](https://github.com/andaoai/yolo-label-vs/issues)提交问题

---

本文档由 YOLO Label VS 开发团队维护。如有问题或建议，请在存储库中创建问题。 