# <img src="docs/images/icon.png" width="32" height="32" alt="YOLO Label Tool Icon"> YOLO Labeling

[![Publish to VS Code Marketplace](https://github.com/andaoai/yolo-label-vs/actions/workflows/main-publish.yml/badge.svg)](https://github.com/andaoai/yolo-label-vs/actions/workflows/main-publish.yml)
[![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/andaoai.yolo-labeling-vs)](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs)
[![VS Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/andaoai.yolo-labeling-vs)](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs)
[![VS Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/andaoai.yolo-labeling-vs)](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Contributors](https://img.shields.io/github/contributors/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs/graphs/contributors)
[![Repo Size](https://img.shields.io/github/repo-size/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs)
[![Last Commit](https://img.shields.io/github/last-commit/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs/commits)
[![Issues](https://img.shields.io/github/issues/andaoai/yolo-label-vs)](https://github.com/andaoai/yolo-label-vs/issues)
[![VS Code Engine](https://img.shields.io/badge/vscode-%5E1.85.0-blue)](https://code.visualstudio.com/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Sponsor](https://img.shields.io/badge/sponsor-donate-brightgreen)](https://github.com/andaoai/yolo-label-vs#sponsorship)

A VS Code extension for quickly browsing and editing YOLO dataset annotations. This extension allows you to efficiently view and modify YOLO-formatted labels through YAML configuration files, making it easy to manage your computer vision datasets directly within VS Code.

## Demo

![YOLO Label VS 演示](https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/demo.gif)

## Theme Support

Our extension seamlessly integrates with all VS Code themes for a consistent experience:

<table>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746183912332.jpg" width="100%" alt="Default Light Theme"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746183969990.jpg" width="100%" alt="Default Dark Theme"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746183996831.jpg" width="100%" alt="High Contrast Theme"></td>
  </tr>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746184077610.jpg" width="100%" alt="Monokai Theme"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746184138365.jpg" width="100%" alt="GitHub Light Theme"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/themes/1746184166688.jpg" width="100%" alt="Night Owl Theme"></td>
  </tr>
</table>

## Documentation

- English
  - [Packaging Guide](./docs/PACKAGING.md)
  - [Publishing Guide](./docs/PUBLISHING.md)
  - [Development Guide](./docs/DEVELOPMENT.md)
  - [CI/CD Workflow Guide](./docs/CI_CD_WORKFLOW.md)
  - [README in English](./README.md)
- 中文文档
  - [打包指南](./docs/PACKAGING_CN.md)
  - [发布指南](./docs/PUBLISHING_CN.md)
  - [开发指南](./docs/DEVELOPMENT_CN.md)
  - [CI/CD 工作流指南](./docs/CI_CD_WORKFLOW_CN.md)
  - [README 中文版](./docs/README_CN.md)

## Key Features

- **Quick Dataset Browsing**: Instantly view YOLO-labeled images through YAML configuration files
- **Efficient Label Management**: Easily modify existing labels without leaving VS Code
- **Intuitive Preview**: Real-time visualization of bounding boxes and labels
- **Streamlined Navigation**: Quick movement between images using keyboard shortcuts
- **YAML Integration**: Direct support for YAML configuration files
- **Batch Processing**: Browse and edit multiple images in sequence

## Supported Data Formats

<table>
  <tr>
    <th>Category</th>
    <th>Format</th>
    <th>Status</th>
    <th>Description</th>
  </tr>
  <tr>
    <td rowspan="2"><b>Detection</b></td>
    <td><b>COCO8</b></td>
    <td>✅ Supported</td>
    <td>A small dataset with 8 COCO images (4 train, 4 val) for object detection</td>
  </tr>
  <tr>
    <td><b>COCO128</b></td>
    <td>⏳ Planned</td>
    <td>First 128 images of COCO train2017 dataset for object detection testing</td>
  </tr>
  <tr>
    <td rowspan="2"><b>Segmentation</b></td>
    <td><b>COCO8-seg</b></td>
    <td>✅ Supported</td>
    <td>8 COCO images with instance segmentation annotations</td>
  </tr>
  <tr>
    <td><b>COCO128-seg</b></td>
    <td>⏳ Planned</td>
    <td>128 COCO images with segmentation masks for testing</td>
  </tr>
  <tr>
    <td rowspan="2"><b>Pose</b></td>
    <td><b>COCO8-pose</b></td>
    <td>🔜 Coming Soon</td>
    <td>8 COCO images with keypoints annotations for pose estimation</td>
  </tr>
  <tr>
    <td><b>Tiger-pose</b></td>
    <td>⏳ Planned</td>
    <td>263 tiger images with 12 keypoints per tiger</td>
  </tr>
  <tr>
    <td rowspan="2"><b>Classification</b></td>
    <td><b>MNIST160</b></td>
    <td>🔜 Coming Soon</td>
    <td>First 8 images of each MNIST category (160 images total)</td>
  </tr>
  <tr>
    <td><b>ImageNet-10</b></td>
    <td>⏳ Planned</td>
    <td>Smaller subset of ImageNet with 10 categories</td>
  </tr>
  <tr>
    <td rowspan="1"><b>OBB</b></td>
    <td><b>DOTA8</b></td>
    <td>⏳ Planned</td>
    <td>Small subset of 8 aerial images with oriented bounding boxes</td>
  </tr>
  <tr>
    <td rowspan="1"><b>Multi-Object Tracking</b></td>
    <td><b>VisDrone</b></td>
    <td>⏳ Planned</td>
    <td>Drone imagery for tracking multiple objects across frames</td>
  </tr>
</table>

<div align="center">

# 🌟 Explore More Dataset Formats 🌟

**Ultralytics supports a comprehensive range of datasets**  
Detection · Segmentation · Pose · Classification · Tracking

[![Explore Datasets](https://img.shields.io/badge/Ultralytics-Explore%20All%20Datasets-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTI0IDRDMTIuOTU0IDQgNCAxMi45NTQgNCAyNHM4Ljk1NCAyMCAyMCAyMCAyMC04Ljk1NCAyMC0yMFMzNS4wNDYgNCAyNCA0em0wIDM2Yy04LjgyMiAwLTE2LTcuMTc4LTE2LTE2UzE1LjE3OCA4IDI0IDhzMTYgNy4xNzggMTYgMTYtNy4xNzggMTYtMTYgMTZ6bTgtMTJhNCA0IDAgMTEtOCAwIDQgNCAwIDAxOCAweiIvPjwvc3ZnPg==)](https://docs.ultralytics.com/datasets/)

**COCO · VOC · ImageNet · DOTA · and many more**

</div>

## Why This Extension?

- **Simplified Workflow**: No need to switch between different tools - view and edit YOLO datasets directly in VS Code
- **Developer-Friendly**: Perfect for ML engineers who want to quickly verify or adjust their YOLO datasets
- **Lightweight**: Fast and responsive, designed for handling large datasets
- **Integrated Experience**: Seamlessly fits into your development environment

## Requirements

- Visual Studio Code 1.85.0 or higher
- Image files in your workspace
- YAML configuration files for YOLO annotations

## Installation

1. Open VS Code
2. Press `Ctrl+P` to open the Quick Open dialog
3. Type `ext install andaoai.yolo-labeling-vs`
4. Press Enter to install

Or you can install it directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=andaoai.yolo-labeling-vs).

## Usage

1. Open a folder containing your YAML configuration files and corresponding images
2. Right-click on a YAML file in the explorer
3. Select "Open YOLO Labeling Panel"
4. Browse through your labeled images and make adjustments as needed

### Interface Controls

- **Previous/Next Image**: Navigate through images in the dataset
- **Mode Selector**: Switch between Box and Segmentation labeling modes
- **Show Labels**: Toggle visibility of labels on the image
- **Save Labels**: Save current annotations to disk
- **Search Box**: Search for specific images in the dataset

### Keyboard Shortcuts

#### Global Shortcuts
- `Ctrl+Y`: Open YOLO Labeling Panel

#### In Labeling Panel
- `D`: Go to next image
- `A`: Go to previous image
- `Ctrl+S`: Save labels
- `Ctrl+Z`: Undo the last labeling action
- `Ctrl+Wheel`: Zoom in/out at mouse position
- `Alt+Drag`: Pan the image when zoomed in
- `Wheel`: Scroll vertically when zoomed in
- `Shift+Wheel`: Scroll horizontally when zoomed in
- `Right-click`: Cancel polygon drawing (in segmentation mode)

#### Search Functionality
- `Arrow Down`: Move down through search results
- `Arrow Up`: Move up through search results
- `Enter`: Select the highlighted search result
- `Escape`: Close search results panel

## Extension Settings

This extension contributes the following commands:

* `yolo-labeling-vs.openLabelingPanel`: Open YOLO Labeling Panel

## Known Issues

Please report issues on our [GitHub repository](https://github.com/andaoai/yolo-label-vs/issues).

## Release Notes

### 0.0.9

- Added visual feedback for unsaved changes with pulsing save button animation
- Added tooltip showing "Changes need saving" when hovering over save button
- Improved UI button states with better visual feedback
- Enhanced error handling with more detailed suggestions
- Added image dimensions and label counts to UI for better information display

### 0.0.8

- Fixed theme showcase display in GitHub readme (changed from grid to table layout)
- Improved documentation formatting for better platform compatibility

### 0.0.7

- Significantly reduced extension package size (from 51MB to 1.5MB)
- Updated documentation to use GitHub hosted images
- Improved extension loading performance

### 0.0.6

- Added seamless VSCode theme integration with proper button styling
- Added theme showcase with support for multiple VSCode themes
- Improved UI responsiveness across all theme variants
- Fixed button styling issues to properly follow VSCode theme changes
- Enhanced visual consistency across light and dark themes

### 0.0.5

- Removed redo functionality button to avoid conflicts with Ctrl+Y shortcut
- Improved error handling when YAML image paths fail to load
  - Added error tracking with recovery mechanisms
  - Implemented proper resource cleanup
  - Added reload button on error pages
  - Enhanced error messages with troubleshooting guidance
- Added tooltips for all toolbar buttons showing keyboard shortcuts
- Added better error messaging and recovery options

### 0.0.4

- Simplified keyboard shortcuts for better usability
- Changed main shortcut from `Ctrl+Shift+Y` to `Ctrl+Y` for easier access
- Removed `Ctrl+Right` and `Ctrl+Left` shortcuts
- Improved UI by hiding scrollbar in label list
- Reduced package size by excluding test data files

### 0.0.3

Initial release of YOLO Labeling:
- Basic image labeling functionality
- YOLO format support
- Keyboard shortcuts
- Configuration file support

## Contributing

We welcome contributions! Please feel free to submit a Pull Request.

## Sponsorship

If you find this extension helpful, consider supporting its development:

<table>
  <tr>
    <th>WeChat Pay</th>
    <th>Alipay</th>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/微信支付_20250503021350.jpg" width="300" alt="WeChat Pay"></td>
    <td><img src="https://raw.githubusercontent.com/andaoai/yolo-label-vs/main/docs/images/支付宝支付_20250503021444.jpg" width="300" alt="Alipay"></td>
  </tr>
</table>

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any problems, please file an issue at our [issue tracker](https://github.com/andaoai/yolo-label-vs/issues).