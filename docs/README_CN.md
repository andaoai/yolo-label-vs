# <img src="./images/icon.png" width="32" height="32" alt="YOLO标注工具图标"> YOLO 标注工具

[![发布到VS Code插件市场](https://github.com/andaoai/yolo-label-vs/actions/workflows/main-publish.yml/badge.svg)](https://github.com/andaoai/yolo-label-vs/actions/workflows/main-publish.yml)
[![VS插件市场版本](https://img.shields.io/visual-studio-marketplace/v/andaoai.yolo-labeling-vs)](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs)
[![VS插件市场下载量](https://img.shields.io/visual-studio-marketplace/d/andaoai.yolo-labeling-vs)](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs)
[![VS插件市场评分](https://img.shields.io/visual-studio-marketplace/r/andaoai.yolo-labeling-vs)](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs)
[![许可证: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![贡献者数量](https://img.shields.io/github/contributors/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs/graphs/contributors)
[![仓库大小](https://img.shields.io/github/repo-size/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs)
[![最后更新](https://img.shields.io/github/last-commit/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs/commits)
[![问题数量](https://img.shields.io/github/issues/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs/issues)
[![VS Code引擎版本](https://img.shields.io/badge/vscode-%5E1.85.0-blue)](https://code.visualstudio.com/)
[![Node.js版本](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![赞助支持](https://img.shields.io/badge/赞助-支持-brightgreen)](https://github.com/andaoai/yolo-label-vs/blob/main/docs/README_CN.md#赞助支持)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/andaoai/yolo-label-vs)

一个专门用于快速浏览和编辑 YOLO 数据集标注的 VS Code 扩展。通过 YAML 配置文件，您可以直接在 VS Code 中高效地查看和修改 YOLO 格式的标注数据，让数据集管理变得轻松简单。

## 演示

![YOLO Label VS 演示](https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/demo.gif)

## 主题支持

我们的扩展无缝集成了所有 VS Code 主题，提供一致的用户体验：

<table>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746183912332.jpg" width="100%" alt="默认浅色主题"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746183969990.jpg" width="100%" alt="默认深色主题"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746183996831.jpg" width="100%" alt="高对比度主题"></td>
  </tr>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746184077610.jpg" width="100%" alt="Monokai主题"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746184138365.jpg" width="100%" alt="GitHub浅色主题"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746184166688.jpg" width="100%" alt="Night Owl主题"></td>
  </tr>
</table>

## 相关文档

- 中文文档
  - [打包指南](./PACKAGING_CN.md)
  - [发布指南](./PUBLISHING_CN.md)
  - [开发指南](./DEVELOPMENT_CN.md)
  - [CI/CD 工作流指南](./CI_CD_WORKFLOW_CN.md)
  - [README 中文版](./README_CN.md)
- English Documentation
  - [Packaging Guide](./PACKAGING.md)
  - [Publishing Guide](./PUBLISHING.md)
  - [Development Guide](./DEVELOPMENT.md)
  - [CI/CD Workflow Guide](./CI_CD_WORKFLOW.md)
  - [README in English](../README.md)

## 核心功能

- **快速数据集浏览**：通过 YAML 配置文件即时查看 YOLO 标注的图像
- **高效标签管理**：在 VS Code 中直接修改已有标注
- **直观预览**：实时可视化边界框和标签
- **流畅导航**：使用快捷键快速切换图片
- **YAML 集成**：直接支持 YAML 配置文件
- **批量处理**：连续浏览和编辑多个图像

## 支持的数据格式

<table>
  <tr>
    <th>类别</th>
    <th>格式</th>
    <th>状态</th>
    <th>描述</th>
  </tr>
  <tr>
    <td rowspan="2"><b>目标检测</b></td>
    <td><b>COCO8</b></td>
    <td>✅ 已支持</td>
    <td>包含8张COCO图像（4训练，4验证）的小型目标检测数据集</td>
  </tr>
  <tr>
    <td><b>COCO128</b></td>
    <td>✅ 已支持</td>
    <td>COCO train2017数据集的前128张图像，用于目标检测测试</td>
  </tr>
  <tr>
    <td rowspan="1"><b>分割</b></td>
    <td><b>COCO8-seg</b></td>
    <td>✅ 已支持</td>
    <td>带有实例分割标注的8张COCO图像</td>
  </tr>
  <tr>
    <td rowspan="2"><b>姿态关键点</b></td>
    <td><b>COCO8-pose</b></td>
    <td>✅ 已支持</td>
    <td>带有关键点标注的8张COCO图像，用于姿态估计</td>
  </tr>
  <tr>
    <td><b>Tiger-pose</b></td>
    <td>✅ 已支持</td>
    <td>263张老虎图像，每只老虎有12个关键点</td>
  </tr>
  <tr>
    <td rowspan="1"><b>旋转边界框</b></td>
    <td><b>DOTA8</b></td>
    <td>✅ 已支持</td>
    <td>带有旋转边界框的8张航拍图像小型子集（使用分割模式）</td>
  </tr>
  <tr>
    <td rowspan="2"><b>分类</b></td>
    <td><b>MNIST160</b></td>
    <td>❌ 未计划</td>
    <td>MNIST每个类别的前8张图像（共160张图像）</td>
  </tr>
  <tr>
    <td><b>ImageNet-10</b></td>
    <td>❌ 未计划</td>
    <td>包含10个类别的ImageNet子集</td>
  </tr>
  <tr>
    <td rowspan="1"><b>多目标跟踪</b></td>
    <td><b>VisDrone</b></td>
    <td>❌ 未计划</td>
    <td>用于跨帧跟踪多个目标的无人机图像</td>
  </tr>
</table>

<div align="center">

# 🌟 探索更多数据集格式 🌟

**Ultralytics支持全面的数据集类型**  
目标检测 · 实例分割 · 姿态估计 · 图像分类 · 目标跟踪

[![探索数据集](https://img.shields.io/badge/Ultralytics-探索所有数据集-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTI0IDRDMTIuOTU0IDQgNCAxMi45NTQgNCAyNHM4Ljk1NCAyMCAyMCAyMCAyMC04Ljk1NCAyMC0yMFMzNS4wNDYgNCAyNCA0em0wIDM2Yy04LjgyMiAwLTE2LTcuMTc4LTE2LTE2UzE1LjE3OCA4IDI0IDhzMTYgNy4xNzggMTYgMTYtNy4xNzggMTYtMTYgMTZ6bTgtMTJhNCA0IDAgMTEtOCAwIDQgNCAwIDAxOCAweiIvPjwvc3ZnPg==)](https://docs.ultralytics.com/datasets/)

**COCO · VOC · ImageNet · DOTA · 以及更多**

</div>

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

### 界面控件

- **上一张/下一张图片**：在数据集中导航浏览图片
- **模式选择器**：在边界框(Box)、分割(Segmentation)和姿态(Pose)标注模式之间切换
- **显示标签**：切换图像上标签的可见性
- **保存标签**：将当前标注保存到磁盘
- **搜索框**：在数据集中搜索特定图片

### 快捷键

#### 全局快捷键
- `Ctrl+Y`: 打开 YOLO 标注面板

#### 标注面板内快捷键
- `Tab`: 切换到下一个标签类型
- `Shift+Tab`: 切换到上一个标签类型
- `空格`：重置图像缩放和位置
- `Ctrl + 鼠标悬停`：高亮边界框、分割区域或姿态标注
- `Ctrl + 鼠标拖动`：移动高亮的标注对象
- `D`：下一张图片
- `A`：上一张图片
- `Ctrl+S`：保存标注
- `Ctrl+Z`：撤销最后的标注操作
- `Ctrl+滚轮`：以鼠标位置为中心缩放
- `Alt+拖动`：在放大状态下平移画布
- `滚轮`：在放大状态下垂直滚动
- `Shift+滚轮`：在放大状态下水平滚动
- `Esc`：取消当前绘制操作（分割模式或姿态模式）

#### 标注模式特定快捷键
- **分割模式**：
  - `鼠标左键点击`：添加多边形点
  - `右键点击`：取消多边形绘制
  
- **姿态模式**：
  - `鼠标左键点击`：标注完全可见的关键点（可见性=1）
  - `鼠标右键点击`：标注被遮挡的关键点（可见性=2）
  - `Esc`：取消当前姿态标注

#### 搜索功能
- `向下箭头`: 在搜索结果中向下移动
- `向上箭头`: 在搜索结果中向上移动
- `回车`: 选择高亮的搜索结果
- `Esc`: 关闭搜索结果面板

## 扩展设置

此扩展提供以下命令：

* `yolo-labeling-vs.openLabelingPanel`: 打开 YOLO 标注面板

## 已知问题

如果您发现任何问题，请在我们的 [GitHub 仓库](https://github.com/andaoai/yolo-label-vs/issues) 上报告。

## 版本说明

有关详细的版本说明和版本历史，请参阅 [CHANGELOG.md](../CHANGELOG.md) 文件。

## 贡献代码

我们欢迎您的贡献！请随时提交 Pull Request。

## 赞助支持

如果您觉得这个扩展有帮助，可以考虑赞助支持开发：

<table>
  <tr>
    <th>微信支付</th>
    <th>支付宝</th>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/微信支付_20250503021350.jpg" width="300" alt="微信支付"></td>
    <td><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/支付宝支付_20250503021444.jpg" width="300" alt="支付宝"></td>
  </tr>
</table>

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](../LICENSE) 文件。

## 支持

如果您遇到任何问题，请在我们的 [问题追踪器](https://github.com/andaoai/yolo-label-vs/issues) 上提交问题。 