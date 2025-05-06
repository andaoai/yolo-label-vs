# YOLO Label VS 开发指南

## 目录
1. [环境搭建](#环境搭建)
2. [代码仓库结构](#代码仓库结构)
3. [分支管理策略](#分支管理策略)
4. [开发流程](#开发流程)
5. [提交代码](#提交代码)
6. [Pull Request 流程](#pull-request-流程)
7. [版本管理](#版本管理)
8. [问题报告](#问题报告)
9. [文档维护](#文档维护)
10. [常见问题](#常见问题)

## 环境搭建

### 前提条件
- Node.js ≥ 20.0.0
- VSCode ≥ 1.85.0
- Git

### 步骤
1. **克隆仓库**
   ```bash
   git clone https://github.com/andaoai/yolo-label-vs.git
   cd yolo-label-vs
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **准备开发环境**
   ```bash
   npm run prepare
   ```

4. **启动开发服务器**
   ```bash
   npm run dev
   ```

5. **在VSCode中调试**
   - 按F5启动扩展调试
   - 或者使用"运行和调试"面板，选择"Launch Extension"

## 代码仓库结构

```
yolo-label-vs/
├── .github/                  # GitHub相关配置
├── .vscode/                  # VSCode配置
├── docs/                     # 文档
│   ├── images/               # 文档使用的图片资源
│   ├── README_CN.md          # 中文文档
│   └── ...                   # 其他文档文件
├── node_modules/             # 依赖项 (gitignore)
├── src/                      # 源代码
│   ├── YoloDataReader.ts     # YOLO数据读取器
│   └── ...                   # 其他源文件
├── test_label/               # 测试数据
├── .gitignore                # Git忽略配置
├── package.json              # 项目配置
├── README.md                 # 英文文档
└── tsconfig.json             # TypeScript配置
```

## 分支管理策略

我们采用以下分支策略:

- **main**: 稳定版本分支，用于发布
- **dev**: 开发分支，所有功能开发都基于此分支
- **feature/xxx**: 功能开发分支
- **bugfix/xxx**: 错误修复分支
- **docs/xxx**: 文档更新分支

## 开发流程

1. **创建功能分支**
   - 从`dev`分支创建新的功能分支
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/your-feature-name
   ```

2. **本地开发**
   - 编写代码
   - 进行测试
   - 确保代码符合项目规范

3. **提交更改**
   - 提交前确保代码通过检查
   ```bash
   npm run lint
   ```

4. **推送分支**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **创建Pull Request**
   - 从功能分支到`dev`分支

## 提交代码

### 提交消息规范

我们使用以下格式:

```
<类型>: <简短描述>

<详细描述>
```

类型包括:
- **feat**: 新功能
- **fix**: 修复bug
- **docs**: 文档更改
- **style**: 代码格式修改
- **refactor**: 代码重构
- **test**: 添加或修改测试
- **chore**: 构建过程或辅助工具更改

示例:
```
feat: 添加COCO8-seg数据格式支持

- 实现COCO8-seg格式解析功能
- 添加相关测试用例
- 更新文档
```

## Pull Request 流程

1. **创建PR**
   - 登录GitHub，进入项目仓库
   - 点击"Pull requests" > "New pull request"
   - 选择基础分支(`dev`)和你的功能分支
   - 点击"Create pull request"

2. **填写PR信息**
   - 提供清晰的标题和描述
   - 列出主要更改
   - 引用相关问题（如有）

3. **等待审核**
   - 至少一名维护者需要审核
   - 解决审核中提出的问题

4. **合并PR**
   - 通过所有审核后，PR可被合并
   - 合并后，功能分支可以删除

## 版本管理

我们使用[语义化版本控制](https://semver.org/):

- **主版本号**: 不兼容API变更
- **次版本号**: 向后兼容的功能性新增
- **修订号**: 向后兼容的问题修正

版本更新流程:
1. 在`dev`分支完成功能开发和测试
2. 更新`package.json`中的版本号
3. 更新CHANGELOG或发布说明
4. 合并到`main`分支
5. 标记发布版本
   ```bash
   git tag -a v0.0.x -m "版本0.0.x"
   git push origin v0.0.x
   ```

## 问题报告

### 提交问题

1. 访问[Issues页面](https://github.com/andaoai/yolo-label-vs/issues)
2. 点击"New issue"
3. 选择适当的问题模板
4. 填写必要信息:
   - 环境细节
   - 复现步骤
   - 预期行为
   - 实际行为
   - 截图或日志(如有)

### 问题生命周期

- **open**: 新提交或正在处理的问题
- **in progress**: 开发者正在解决
- **need more info**: 需要提交者提供更多信息
- **closed**: 已解决或无效

## 文档维护

- 所有功能更改应同时更新英文(README.md)和中文(docs/README_CN.md)文档
- 文档更新应保持格式一致
- 图片资源存放在`docs/images/`目录下
- 可以使用独立的`docs/xxx`分支进行大型文档更新

## 常见问题

### Q: 如何调试扩展?
A: 按F5启动新的VSCode窗口，该窗口加载了当前开发中的扩展。

### Q: 测试数据应该放在哪里?
A: 将测试数据放在`test_label/`目录下，该目录已配置好示例数据。

### Q: 如何处理冲突?
A: 
```bash
git fetch origin
git merge origin/dev
# 解决冲突
git add .
git commit -m "resolve conflicts"
```

### Q: 本地分支与远程不同步怎么办?
A:
```bash
git fetch origin
git reset --hard origin/dev  # 谨慎使用，会丢失本地更改
# 或
git stash
git pull origin dev
git stash pop  # 可能需要解决冲突
```

### Q: CI/CD流程是什么?
A: 项目使用GitHub Actions进行CI/CD。每次提交到`main`分支后会自动发布到VS Code插件市场。详情请参阅`.github/workflows/`目录下的配置文件。

---

欢迎贡献代码，如有任何问题，请通过[Issues](https://github.com/andaoai/yolo-label-vs/issues)或邮件联系我们。 