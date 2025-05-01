# YOLO 标注工具

一个专门用于快速浏览和编辑 YOLO 数据集标注的 VS Code 扩展。通过 YAML 配置文件，您可以直接在 VS Code 中高效地查看和修改 YOLO 格式的标注数据，让数据集管理变得轻松简单。


## 演示

![YOLO Label VS 演示](./images/demo.gif)

## 相关文档

- 中文文档
  - [打包指南](./docs/PACKAGING_CN.md)
  - [发布指南](./docs/PUBLISHING_CN.md)
- English Documentation
  - [Packaging Guide](./docs/PACKAGING.md)
  - [Publishing Guide](./docs/PUBLISHING.md)
  - [README in English](./README.md)

## 核心功能

- **快速数据集浏览**：通过 YAML 配置文件即时查看 YOLO 标注的图像
- **高效标签管理**：在 VS Code 中直接修改已有标注
- **直观预览**：实时可视化边界框和标签
- **流畅导航**：使用快捷键快速切换图片
- **YAML 集成**：直接支持 YAML 配置文件
- **批量处理**：连续浏览和编辑多个图像

## 为什么选择本扩展？

- **简化工作流程**：无需在不同工具间切换 - 直接在 VS Code 中查看和编辑 YOLO 数据集
- **开发者友好**：完美适配需要快速验证或调整 YOLO 数据集的机器学习工程师
- **轻量级设计**：快速响应，专为处理大型数据集而设计
- **集成体验**：无缝融入您的开发环境

## 系统要求

- Visual Studio Code 1.85.0 或更高版本
- 工作区中的图片文件
- 用于 YOLO 标注的 YAML 配置文件

## 安装方法

1. 打开 VS Code
2. 按下 `Ctrl+P` 打开快速打开对话框
3. 输入 `ext install andaoai.yolo-labeling-vs`
4. 按回车键安装

或者您可以直接从 [VS Code 插件市场](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs) 安装。

## 使用方法

1. 打开包含 YAML 配置文件和对应图片的文件夹
2. 在资源管理器中右键点击 YAML 文件
3. 选择 "打开 YOLO 标注面板"
4. 浏览已标注的图片并根据需要进行调整

### 快捷键

- `Ctrl+Shift+Y`: 打开 YOLO 标注面板
- `Ctrl+Right`: 下一张图片
- `Ctrl+Left`: 上一张图片

## 扩展设置

此扩展提供以下命令：

* `yolo-labeling-vs.openLabelingPanel`: 打开 YOLO 标注面板

## 已知问题

如果您发现任何问题，请在我们的 [GitHub 仓库](https://github.com/andaoai/yolo-label-vs/issues) 上报告。

## 版本说明

### 0.0.3

YOLO 标注工具首次发布：
- 基础图像标注功能
- YOLO 格式支持
- 快捷键支持
- 配置文件支持

## 贡献代码

我们欢迎您的贡献！请随时提交 Pull Request。

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 支持

如果您遇到任何问题，请在我们的 [问题追踪器](https://github.com/andaoai/yolo-label-vs/issues) 上提交问题。 