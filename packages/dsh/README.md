# @yolo-label/dsh

DeepSeek Harness（DSH）原生插件：在 DSH Web GUI 里标注 YOLO 数据集。

**Host 半侧**：
- 在 DSH 的 HTTP 载体上注册 `/yolo-label/api/*` 路由，供 Client 工作台读写数据；
- 注册 **7 个 agent 模型工具**（见下），让 agent 直接扫描/打开数据集、读写标签、
  统计、跑 ONNX 推理批量预标注，实现人机协同标注。

**Client 半侧**：原生 dsh.client bundle —— 标注工作台作为
[`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar)
（VSCode 风格右侧工作台）的一个**标签页**，通过其 `betterSidebar` 服务
`registerTab` 接入；侧边栏底部按钮（`sidebar.footer.action`）一键打开。
支持扫描/打开数据集、类别栏、图片列表、canvas 画框/选中/删除、翻页、保存
（Ctrl+S），窄面板自动切紧凑布局。数据全部走 `/yolo-label/api/*`。

## Agent 模型工具

| 工具 | 作用 |
| --- | --- |
| `yolo_scan_datasets` | 递归扫描目录，列出所有 YOLO 数据集（yaml 路径、类别数等） |
| `yolo_open_dataset` | 打开 data.yaml，返回类别名、图片总数与图片路径清单 |
| `yolo_read_labels` | 读取某图片的 YOLO 标签（框/分割多边形/关键点，归一化坐标） |
| `yolo_write_labels` | 写入（覆盖）某图片的标签文件 |
| `yolo_dataset_stats` | 数据集统计：类别分布、框大小、train/val/test 对比 |
| `yolo_infer_image` | 用 YOLO ONNX 模型对单图推理，返回检测/分割结果（只读） |
| `yolo_auto_label` | 批量推理并写入标签文件（默认跳过已标注图片），用于 AI 预标注 |

推理在 host 侧用 `onnxruntime-node` + `sharp` 完成（letterbox 到 640、
置信度过滤、类别内 NMS；分割模型按 ultralytics 流程还原多边形），兼容
YOLOv8/YOLO11 的 det 与 seg 导出。模型类别索引按数据集 `names` 对齐。

## Client 构建

```sh
pnpm --filter yolo-label-dsh build:client     # 产出 lib/client.js
pnpm --filter yolo-label-dsh watch:client     # watch 模式（DSH HMR 自动热更新）
```

构建脚本 `scripts/build-client.mjs` 用 esbuild 产出闭包工厂格式
（`window.__ModuleLoader__.load({id, factory})`），external 限定为壳子
模块表基线（react / react/jsx-runtime / @deepseek-ai/cordis 等），
其余代码全部内联。包通过 `package.json` 的 `dsh.client: { platform: 'web' }`
声明 + `exports["./client"]` 被 DSH clientModules 自动扫描并经 `/plugins` 提供。

## 开发运行（源码 patch 方式）

依赖：`@yolo-label/core`（monorepo workspace）。

```sh
# 在 yolo-label monorepo 内先装依赖、构建 core 与 client bundle
pnpm install
pnpm --filter @yolo-label/core build
pnpm --filter yolo-label-dsh build:client

# 在 deepseek-harness 源码目录启动一个带本插件的 dsh web 实例
cd /path/to/deepseek-harness
pnpm dsh --profile web \
  --patch /path/to/yolo-label-vs/packages/dsh/cordis.dev.patch.yml \
  --port 3180 --no-open
```

改 client 代码后跑 `watch:client`，DSH client HMR 会自动检测 bundle
变化并热更新；改 host 代码需要重启实例。

启动日志出现 `[yolo-label-dsh] host plugin active: /yolo-label/api/*` 即成功。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/yolo-label/api/health` | 健康检查 |
| GET | `/yolo-label/api/datasets?root=<absDir>` | 递归扫描目录下的 YOLO 数据集 |
| POST | `/yolo-label/api/dataset` | `{yamlPath, workspaceRoot?}` 打开数据集，返回图片清单与类别 |
| GET | `/yolo-label/api/labels?yaml=<abs>&image=<abs>` | 读取某图片的标签 |
| POST | `/yolo-label/api/labels` | `{yaml, image, labels}` 保存标签（YOLO txt，6 位小数） |
| GET | `/yolo-label/api/image?path=<abs>` | 原图字节（jpg/jpeg/png 白名单） |
| GET | `/yolo-label/api/stats?yaml=<abs>` | 数据集统计（类别分布、框统计、train/val/test 对比等） |

## 安全模型

- 路由不走 `/api` 认证桥；`dsh web` 仅绑定 `127.0.0.1` 且拒绝 `--host 0.0.0.0`。
- 所有路径参数必须为绝对路径；图片端点限定扩展名白名单。
- 插件以受信代码身份运行（与 VS Code extension host 同等权限）。

## 安装（dsh.bundle 打包）

发布产物为零运行时依赖的单包：host 半侧由 esbuild 打成自包含 ESM
（core + js-yaml 全内联，`lib/index.js`），client 半侧是 closure-factory
bundle（`lib/client.js`）；`package.json` 声明 `dsh.bundle.patch`
（`cordis.patch.yml`），安装时自动挂载，无需手工编辑 profile。

```bash
# 仓库根目录
pnpm pack:dsh            # 构建 core + dsh，产出 dist/yolo-label-dsh-<ver>.tgz

# 安装到某个 profile（web 等）
dsh plugin --profile web add /abs/path/to/yolo-label-dsh-0.1.0.tgz
# 或发布到 npm 后：dsh plugin --profile web add yolo-label-dsh
```

CLI 会在 profile 目录跑 pnpm 安装，并把声明了 `dsh.bundle` 的包自动对账进
`dsh.profile.bundles` 层栈，下次启动即生效。client 工作台作为
`dsh-better-sidebar` 的一个标签页接入（未安装该插件时底部按钮给出提示，
host 功能不受影响）。

开发时用源码挂载（不走打包）：

```bash
dsh --profile web --patch packages/dsh/cordis.dev.patch.yml --port 3180 --no-open
```

## 后续阶段

- ~~阶段 1：host HTTP API~~（已完成）
- ~~阶段 2：vendored `clientBundle` + Client 工作台~~（已完成，better-sidebar 标签页）
- ~~阶段 3：`dsh.bundle` 打包，`dsh plugin add` 安装~~（已完成）
- 阶段 4：注册 agent 模型工具（扫描/读写标签/统计/ONNX 推理预标），人机协同标注。
