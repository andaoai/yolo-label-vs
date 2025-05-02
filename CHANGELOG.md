# Change Log

All notable changes to the "yolo-labeling-vs" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/),
and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.0.8] - 2024-09-01

### Fixed
- Fixed theme showcase display in GitHub readme (changed from grid to table layout)
- Improved documentation formatting for better platform compatibility

## [0.0.7] - 2024-09-01

### Changed
- Significantly reduced extension package size (from 51MB to 1.5MB)
- Updated documentation to use GitHub hosted images
- Improved extension loading performance

## [0.0.6] - 2024-09-01

### Added
- Seamless VSCode theme integration with proper button styling
- Theme showcase with support for multiple VSCode themes
- Visual consistency across light and dark themes

### Fixed
- Button styling issues to properly follow VSCode theme changes
- UI responsiveness across all theme variants

## [0.0.5] - 2024-05-17

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

## [0.0.4] - 2024-05-10

### Changed
- Simplified keyboard shortcuts for better usability
- Changed main shortcut from `Ctrl+Shift+Y` to `Ctrl+Y` for easier access
- Removed `Ctrl+Right` and `Ctrl+Left` shortcuts, relying solely on `A` and `D` keys for navigation
- Updated documentation with comprehensive list of keyboard shortcuts and interface controls
- Improved UI by hiding scrollbar in label list while maintaining scrolling functionality
- Added `test_label/` to `.vscodeignore` to reduce extension package size

## [0.0.3] - 2024-05-01

### Added
- Demo GIF showing extension functionality
- Chinese documentation (README_CN.md)
- Detailed packaging and publishing guides in both English and Chinese

### Changed
- Moved documentation files to `docs` folder for better organization
- Updated documentation links in README files
- Lowered VS Code engine version requirement for better compatibility

## [0.0.1] - 2024-04-30

### Added
- Initial release
- Basic image labeling functionality
- YOLO format support
- Keyboard shortcuts
- Configuration file support