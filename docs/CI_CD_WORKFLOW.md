# <img src="./images/icon.png" width="32" height="32" alt="YOLO标注工具图标"> 自动化工作流指南

本文档说明了项目中配置的 GitHub Actions 自动化工作流的功能和使用方法。

## 工作流概述

项目配置了两个主要的自动化工作流：

1. **Dev 分支工作流** (`.github/workflows/version-updater.yml`)
   - 监听 dev 分支变更
   - 自动更新第三位版本号（补丁版本）
   - 自动创建 GitHub Release 预发布版本

2. **Main 分支工作流** (`.github/workflows/main-publish.yml`)
   - 监听 main 分支变更
   - 自动更新第二位版本号（次版本）
   - 自动发布到 VS Code Marketplace

## 版本号管理规则

版本号遵循语义化版本规范 (SemVer)，格式为：`X.Y.Z`

- **X** (第一位)：主版本号，需要手动更新
- **Y** (第二位)：次版本号，main 分支自动更新
- **Z** (第三位)：补丁版本号，dev 分支自动更新

## Dev 分支工作流详情

**触发条件**：
- 当 dev 分支的 `src` 目录或 `package.json` 文件有变更时
- 手动触发（通过 GitHub Actions 的 workflow_dispatch）

**执行操作**：
1. 获取当前版本号
2. 将第三位版本号加 1（例如：`1.2.3` → `1.2.4`）
3. 更新 package.json 中的版本号
4. 提交并推送更改
5. 创建 GitHub Release 作为预发布版本

**用途**：
- 用于开发过程中的频繁迭代
- 创建预发布版本供内部测试

## Main 分支工作流详情

**触发条件**：
- 当 main 分支的 `src` 目录或 `package.json` 文件有变更时
- 手动触发（通过 GitHub Actions 的 workflow_dispatch）

**执行操作**：
1. 获取当前版本号
2. 将第二位版本号加 1，第三位重置为 0（例如：`1.2.3` → `1.3.0`）
3. 更新 package.json 中的版本号
4. 提交并推送更改
5. 安装依赖并编译扩展
6. 发布到 VS Code Marketplace

**用途**：
- 用于正式发布稳定版本
- 将扩展推送到 VS Code Marketplace 供用户下载

## 设置步骤

1. **创建 Personal Access Token**
   - 访问 [Azure DevOps Personal Access Tokens](https://dev.azure.com/_usersSettings/tokens)
   - 点击 "New Token"
   - 设置名称、组织访问权限
   - 在 Scopes 部分，确保选择 Marketplace 的 "Manage" 权限
   - 创建并保存令牌

2. **添加 GitHub Secret**
   - 在 GitHub 仓库中，进入 Settings > Secrets and variables > Actions
   - 创建新的 repository secret
   - 名称：`VSCE_TOKEN`
   - 值：复制上一步创建的 PAT

## 推荐工作流程

1. **日常开发**
   - 在 dev 分支上进行所有开发工作
   - 每次提交后会自动更新补丁版本号并创建 GitHub Release

2. **准备正式发布**
   - 测试 dev 分支的功能确认稳定后
   - 通过 Pull Request 将 dev 分支合并到 main 分支
   - 合并后自动触发版本更新和 VS Code Marketplace 发布

3. **主版本更新**
   - 当有重大功能变更时
   - 手动编辑 package.json 增加主版本号
   - 提交到相应分支并走正常工作流

## 故障排除

如果工作流执行失败，请检查以下几点：

1. **权限问题**
   - 确保 `VSCE_TOKEN` 有效且具有发布权限
   - 检查 GitHub Actions 的权限设置

2. **版本号问题**
   - 确保 package.json 中的版本号格式正确
   - 检查是否有手动编辑导致的版本号异常

3. **构建错误**
   - 检查日志中的编译错误
   - 确保所有依赖都正确安装 