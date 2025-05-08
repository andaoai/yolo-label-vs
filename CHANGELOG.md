# Change Log

All notable changes to the "yolo-labeling-vs" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/),
and this project adheres to [Semantic Versioning](http://semver.org/).

Here's the English translation of your changelog entry:  

---

## [0.0.49] - 2024-06-XX

### Added
- Added Tab/Shift+Tab shortcuts for quick label class switching
- Added current label class display in status bar
- Added dropdown menu for label class selection

### Changed
- Simplified label class selection UI to match VSCode's aesthetic
- Updated documentation with new keyboard shortcuts

## [0.0.48] - 2024-06-XX  

### **Added**  
- Flowing dashed border animation for highlighted Box and Seg objects, improving visual clarity.  
- Ctrl-key requirement: Box/Seg highlighting and movement now require holding the `Ctrl` key to prevent accidental interactions.  
- Updated documentation (Chinese & English) with detailed explanations of new interactions and shortcuts.  

### Changed
- Optimized performance of the highlight animation for smoother rendering.  
- Revised documentation to reflect updated shortcuts and interaction behaviors.  



## [0.0.9] - 2024-09-05

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