# YOLO Labeling

A VS Code extension for quickly browsing and editing YOLO dataset annotations. This extension allows you to efficiently view and modify YOLO-formatted labels through YAML configuration files, making it easy to manage your computer vision datasets directly within VS Code.

## Demo

![YOLO Label VS 演示](./docs/images/demo.gif)

## Documentation

- English
  - [Packaging Guide](./docs/PACKAGING.md)
  - [Publishing Guide](./docs/PUBLISHING.md)
- 中文文档
  - [打包指南](./docs/PACKAGING_CN.md)
  - [发布指南](./docs/PUBLISHING_CN.md)
  - [README 中文版](./README_CN.md)

## Key Features

- **Quick Dataset Browsing**: Instantly view YOLO-labeled images through YAML configuration files
- **Efficient Label Management**: Easily modify existing labels without leaving VS Code
- **Intuitive Preview**: Real-time visualization of bounding boxes and labels
- **Streamlined Navigation**: Quick movement between images using keyboard shortcuts
- **YAML Integration**: Direct support for YAML configuration files
- **Batch Processing**: Browse and edit multiple images in sequence

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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any problems, please file an issue at our [issue tracker](https://github.com/andaoai/yolo-label-vs/issues).
