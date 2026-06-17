# Change Log

All notable changes to the "yolo-labeling-vs" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/),
and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.0.89] - 2026-06

### Added
- Train/Val/Test category distribution comparison charts
- CI/CD workflow for skipping releases on pure documentation updates

### Changed
- Improved sidebar layout with default collapsed state
- Updated dataset statistics dashboard and TreeView documentation
- Updated CI/CD process documentation

### Fixed
- Fixed datasetName retrieval method to use YAML filename

## [0.0.88] - 2026-06

### Changed
- Removed limit of maximum 10 folders in Folder Distribution
- Optimized Folder Distribution display, legend only shows folder count

## [0.0.87] - 2026-06

### Added
- Dataset statistics visualization panel

### Changed
- Excluded development files from VSIX package

## [0.0.86] - 2026-06

### Added
- Dataset management TreeView with subset grouping and image navigation
- Support for multi-folder subset grouping display and subset labels

### Changed
- Unified UI text to English
- Removed checkmark symbol from label status for simplified display
- Renamed labeling-panel.css to index.css for consistent naming convention
- Cleaned up CSS and removed duplicate HTML files
- Updated development and packaging documentation

### Refactored
- Migrated JavaScript to TypeScript for VSCode frontend
- Restructured Extension Host backend architecture
- Extracted shared utility helpers
- Cleaned up unused code and type definitions

## [0.0.85] - 2026-05

### Fixed
- Updated README badges and auto-update workflow

### Documentation
- Added supported YOLO models section
- Updated demo gif
- Replaced theme screenshots with new Chinese-named images

## [0.0.84] - 2025-12

### Added
- test:sam script to package.json

## [0.0.83] - 2025-12

### Fixed
- Seg tool preview flashing to top-left corner on first click
- Constrain label bounding boxes within image boundaries

## [0.0.82] - 2025-12

### Fixed
- Resolved ONNX Runtime loading failures in packaged VSCode extension

## [0.0.81] - 2025-12

### Documentation
- Updated VS Marketplace badges in Chinese README

## [0.0.80] - 2025-11

## [0.0.79] - 2025-11

### Added
- /pr skill for creating PRs with auto-generated descriptions

## [0.0.78] - 2025-11

### Fixed
- Excluded src/test from tsconfig to fix webpack build error

## [0.0.77] - 2025-11

### Documentation
- Updated documentation to reflect new features and v0.0.75

## [0.0.76] - 2025-06

## [0.0.75] - 2025-06

### Added
- Support workspace-relative paths in YAML configuration files
- Helpful error messages when image paths cannot be resolved

### Changed
- Improved path resolution for YAML directory-based image loading

## [0.0.74] - 2025-06

### Added
- AI inference runner with ONNX Runtime integration
- Model panel in sidebar for loading and managing ONNX models
- Confidence and IoU threshold sliders for inference tuning
- Accept/Reject buttons for adding detected objects as labels
- Support for YOLO detection and segmentation models
- Automatic mask-to-polygon conversion using Marching Squares algorithm

### Changed
- Enhanced sidebar with collapsible model section

## [0.0.73] - 2025-06

### Added
- Worker-based rendering architecture with OffscreenCanvas
- Zero-copy ImageBitmap transfer for better performance
- Proxy-based reactive state management
- Copy/paste label functionality (Ctrl+C/Ctrl+V)
- Auto tool switching based on label type
- Hover animation for highlighted labels

### Changed
- Complete frontend architecture rewrite
- Improved coordinate transformation system
- Enhanced hit testing with Worker thread

## [0.0.72] - 2025-06

### Fixed
- Thumbnail lazy loading issues
- Class name synchronization to Worker
- Save button state after undo operation

## [0.0.71] - 2025-06

### Added
- DeepWiki sponsorship link in README
- DevContainer configuration
- Dependabot update configuration

## [0.0.70] - 2025-06

### Added
- Webpack build system with triple configuration
- Template copying functionality for build process
- Keyboard shortcut to reset image position and scale

### Changed
- Refactored build scripts for webpack integration
- Updated packaging documentation

## [0.0.56] - 2025-05

### Added
- Implemented pose labeling functionality with support for keypoint annotations
- Added visual indicators showing which keypoint is being annotated
- Added support for different keypoint visibility states (visible, occluded)
- Added dashed line visualization for pose bounding boxes during keypoint annotation

### Changed
- Refactored mode selection handling in labeling panel and UIManager
- Enhanced CanvasManager to support pose label dragging
- Improved drawing logic for all annotation types
- Enhanced unsaved changes handling in CanvasManager

### Fixed
- Fixed issue where both box and pose mode buttons could be active simultaneously
- Fixed keypoints not moving with bounding box when dragged
- Fixed duplicate labels showing both BOX and POSE for the same object
- Fixed labels in sidebar showing incorrect type for keypoint annotations

## [0.0.49] - 2025-05

### Added
- Added Tab/Shift+Tab shortcuts for quick label class switching
- Added current label class display in status bar
- Added dropdown menu for label class selection

### Changed
- Simplified label class selection UI to match VSCode's aesthetic
- Updated documentation with new keyboard shortcuts

## [0.0.48] - 2025-05

### Added
- Flowing dashed border animation for highlighted Box and Seg objects, improving visual clarity
- Ctrl-key requirement: Box/Seg highlighting and movement now require holding the `Ctrl` key to prevent accidental interactions
- Updated documentation (Chinese & English) with detailed explanations of new interactions and shortcuts

### Changed
- Optimized performance of the highlight animation for smoother rendering
- Revised documentation to reflect updated shortcuts and interaction behaviors

## [0.0.9] - 2025-05-05

### Added
- Save button status tracking with visual feedback for unsaved changes
- Pulsing animation on save button when changes need to be saved
- Tooltip displaying "Changes need saving" when hovering over active save button
- Improved UI feedback with disabled state when no changes are present

### Changed
- Enhanced button styles with improved opacity and transition effects
- Updated active and hover states for toggle and segmented buttons 
- Improved error handling with actionable suggestions
- Added image dimensions and label counts to UI

## [0.0.8] - 2025-05-03

### Fixed
- Fixed theme showcase display in GitHub readme (changed from grid to table layout)
- Improved documentation formatting for better platform compatibility

## [0.0.7] - 2025-05-02

### Changed
- Significantly reduced extension package size (from 51MB to 1.5MB)
- Updated documentation to use GitHub hosted images
- Improved extension loading performance

## [0.0.6] - 2025-05-02

### Added
- Seamless VSCode theme integration with proper button styling
- Theme showcase with support for multiple VSCode themes
- Visual consistency across light and dark themes

### Fixed
- Button styling issues to properly follow VSCode theme changes
- UI responsiveness across all theme variants

## [0.0.5] - 2025-05-17

### Changed
- Removed redo functionality button to fix conflict with Ctrl+Y shortcut
- Improved error handling when YAML image paths fail to load
- Added error tracking with a `_hasError` flag
- Implemented proper cleanup in the `dispose()` method
- Added a reload button on error pages
- Added more detailed error messages
- Created a recovery mechanism to reset the panel state

### Added
- Tooltips for toolbar buttons to show keyboard shortcuts
- Better error messaging and recovery options

## [0.0.4] - 2025-05-10

### Changed
- Simplified keyboard shortcuts for better usability
- Changed main shortcut from `Ctrl+Shift+Y` to `Ctrl+Y` for easier access
- Removed `Ctrl+Right` and `Ctrl+Left` shortcuts, relying solely on `A` and `D` keys for navigation
- Updated documentation with comprehensive list of keyboard shortcuts and interface controls
- Improved UI by hiding scrollbar in label list while maintaining scrolling functionality
- Added `test_label/` to `.vscodeignore` to reduce extension package size

## [0.0.3] - 2025-05-01

### Added
- Demo GIF showing extension functionality
- Chinese documentation (README_CN.md)
- Detailed packaging and publishing guides in both English and Chinese

### Changed
- Moved documentation files to `docs` folder for better organization
- Updated documentation links in README files
- Lowered VS Code engine version requirement for better compatibility

## [0.0.1] - 2025-04-30

### Added
- Initial release
- Basic image labeling functionality
- YOLO format support
- Keyboard shortcuts
- Configuration file support