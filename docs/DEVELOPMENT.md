# YOLO Label VS Development Guide

## Table of Contents
1. [Setup Environment](#setup-environment)
2. [Repository Structure](#repository-structure)
3. [Branch Management Strategy](#branch-management-strategy)
4. [Development Workflow](#development-workflow)
5. [Code Submission](#code-submission)
6. [Pull Request Process](#pull-request-process)
7. [Version Management](#version-management)
8. [Issue Reporting](#issue-reporting)
9. [Documentation Maintenance](#documentation-maintenance)
10. [FAQ](#faq)

## Setup Environment

### Prerequisites
- Node.js ≥ 20.0.0
- VSCode ≥ 1.85.0
- Git

### Steps
1. **Clone Repository**
   ```bash
   git clone https://github.com/andaoai/yolo-label-vs.git
   cd yolo-label-vs
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Prepare Development Environment**
   ```bash
   npm run prepare
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Debug in VSCode**
   - Press F5 to launch extension debugging
   - Or use the "Run and Debug" panel, select "Launch Extension"

## Repository Structure

```
yolo-label-vs/
├── .github/                  # GitHub related configurations
├── .vscode/                  # VSCode configurations
├── docs/                     # Documentation
│   ├── images/               # Images used in documentation
│   ├── README_CN.md          # Chinese documentation
│   └── ...                   # Other documentation files
├── node_modules/             # Dependencies (gitignore)
├── src/                      # Source code
│   ├── extension.ts          # VS Code extension entry point (registers all commands)
│   ├── LabelingPanel.ts      # WebView panel manager (multi-instance support)
│   ├── DatasetStatsPanel.ts  # Dataset statistics dashboard panel (Chart.js visualization)
│   ├── ErrorHandler.ts       # Unified error classification and reporting
│   ├── explorer/             # Dataset TreeView explorer
│   │   ├── DatasetScanner.ts # Workspace scanner for YOLO dataset detection
│   │   └── DatasetTreeViewProvider.ts # Tree data provider with subset/folder/image hierarchy
│   ├── model/                # Type definitions for Extension Host
│   │   └── types.ts          # BoundingBox = Label (type alignment with frontend)
│   ├── services/             # Extension service layer
│   │   ├── WebviewMessageHandler.ts  # WebView message bus (11 commands)
│   │   └── DatasetStatisticsService.ts # Dataset statistics calculation engine
│   ├── utils/                # Utility helpers
│   │   ├── imageLoader.ts    # Base64 LRU image cache + thumbnails
│   │   ├── pathUtils.ts      # Basename/truncate/imagePathToLabelPath
│   │   ├── webviewHtml.ts    # Generate WebView HTML for labeling panel
│   │   └── dashboardHtml.ts  # Generate statistics dashboard HTML with Chart.js
│   ├── yolo/                 # YOLO data layer
│   │   ├── ConfigLoader.ts   # Parse data.yaml (path/train/val/test/names/kpt_shape)
│   │   ├── ImageFileScanner.ts  # Scan images (flat + by folder for multi-folder subsets)
│   │   ├── LabelCodec.ts     # Encode/decode YOLO txt labels (det/seg/pose)
│   │   └── YoloDataReader.ts # Dataset session (current index, read/write labels)
│   └── templates/            # Frontend templates and source
│       ├── index.html        # WebView HTML template
│       ├── index.css         # Unified stylesheet
│       ├── ort-entry.ts      # ONNX Runtime loader (jsep.mjs interception)
│       ├── shared/           # Shared between main thread and Worker
│       │   ├── types.ts      # Shared type definitions (Label, Detection, etc.)
│       │   ├── messages.ts   # Message protocol (discriminated union)
│       │   ├── config.ts     # Configuration constants (colors, thresholds)
│       │   └── math.ts       # Math utilities
│       ├── worker/           # Worker thread (Canvas rendering)
│       │   ├── worker.ts             # Worker entry point
│       │   ├── RenderEngine.ts       # Render engine coordinator
│       │   ├── Renderer.ts           # Canvas drawing module
│       │   ├── HitTestEngine.ts      # Hit testing
│       │   ├── CoordinateTransform.ts # Coordinate transformation
│       │   └── AnimationController.ts # Animation control
│       ├── main/             # Main thread (input and UI)
│       │   ├── main.ts               # Entry point
│       │   ├── App.ts                # Application orchestrator
│       │   ├── state/                # State management
│       │   │   ├── Store.ts          # Proxy-based reactive state
│       │   │   ├── HistoryManager.ts # Undo/Redo (per-image LRU stack, max 50)
│       │   │   └── LabelOperations.ts # Pure label operations
│       │   ├── communication/        # Communication layer
│       │   │   ├── ExtensionBridge.ts # Extension communication wrapper
│       │   │   └── WorkerBridge.ts   # Worker communication wrapper
│       │   ├── input/                # Input handling
│       │   │   ├── InputManager.ts   # Input event management
│       │   │   └── tools/            # Annotation tools
│       │   │       ├── Tool.ts       # Tool interface
│       │   │       ├── BoxTool.ts    # Box drawing tool
│       │   │       ├── SegTool.ts    # Segmentation tool
│       │   │       ├── PoseTool.ts   # Pose tool
│       │   │       └── ToolManager.ts # Tool registry
│       │   └── ui/                   # DOM UI components
│       │       ├── DOMManager.ts     # UI orchestrator
│       │       ├── Toolbar.ts        # Toolbar
│       │       ├── Sidebar.ts        # Sidebar
│       │       ├── StatusBar.ts      # Status bar
│       │       ├── ProgressBar.ts    # Thumbnail bar (lazy load, debounced)
│       │       ├── ModelPanel.ts     # Model management panel
│       │       ├── ThemeManager.ts   # Theme management
│       │       └── collapsible.ts    # Collapsible section utilities
│       └── inference/        # AI inference module
│           └── inferenceRunner.ts    # ONNX model inference (YOLOv8/v11, det+seg)
├── test/                     # Test data and inference tests
│   ├── data/                 # Test datasets (coco8, etc.)
│   ├── setup.ts              # Test setup
│   ├── test-inference-all.ts  # All inference tests
│   ├── test-inference-sam.ts  # SAM encoder/decoder tests
│   └── test-inference-seg.ts  # Segmentation inference tests
├── models/                   # ONNX model storage (for testing)
├── scripts/                  # Build scripts
│   └── copy-templates.js     # Copy HTML/CSS templates after build
├── dist/                     # Build output
├── webpack.config.js         # Triple-config build (extension/main/worker)
├── .gitignore                # Git ignore configuration
├── package.json              # Project configuration
├── README.md                 # English documentation
└── tsconfig.json             # TypeScript configuration
```

### Extension Host Architecture (Backend)

The backend (VS Code Extension Host) uses a modular service-oriented architecture:

- **`extension.ts`**: Extension entry point registering all commands: `openLabelingPanel`, `openDatasetStats`, `refreshDatasets`. Handles keyboard shortcuts and YAML file auto-discovery in the workspace.
- **`LabelingPanel.ts`**: Manages WebView panels with multi-instance support (one panel per YAML file), cached in a static Map, with error page fallback supporting reload. Supports direct image navigation from TreeView clicks.
- **`DatasetStatsPanel.ts`**: Standalone dashboard panel powered by Chart.js for dataset analytics visualization. Renders class distribution, box statistics, labels-per-image histogram, and Train/Val/Test comparison charts.
- **`DatasetTreeViewProvider.ts`**: VS Code TreeView data provider implementing the dataset explorer hierarchy: Dataset Root → Subsets (Train/Val/Test) → Folders (for multi-folder datasets) → Images. Each node supports direct navigation to the labeling panel.
- **`DatasetScanner.ts`**: Workspace scanner detecting all YOLO YAML configuration files and computing basic dataset statistics for TreeView display.
- **`DatasetStatisticsService.ts`**: Comprehensive statistics engine computing: class distribution (global and per-subset), label count histogram, box dimension statistics, aspect ratios, keypoint metrics, and folder distribution.
- **`WebviewMessageHandler.ts`**: Central message bus receiving commands from WebView, including ONNX file reading and passing to WebView via structured cloning
- **Yolo Data Layer**: ConfigLoader (YAML parsing) → ImageFileScanner (directory scanning with multi-folder support) → LabelCodec (YOLO format encoding/decoding) → YoloDataReader (session management)
- **Utils Layer**: imageLoader (LRU cache), pathUtils, webviewHtml (template generation with resource injection)

### WebView Frontend Architecture

The frontend uses a **Main Thread + Worker dual-thread architecture**:

- **Main Thread**: Handles user input (mouse/keyboard), manages DOM UI, maintains reactive state Store, runs AI inference
- **Worker Thread**: Handles Canvas rendering, coordinate transformation, hit testing via zero-copy `OffscreenCanvas`
- **Communication**: TypeScript discriminated union typed messages, ImageBitmap zero-copy transfer

Key design patterns:
- **Proxy-based Reactive Store**: State changes auto-notify subscribers and sync to Worker
- **Tool Interface**: Each annotation type (Box/Seg/Pose) implements a common Tool interface; extending requires only adding a new implementation + registration
- **LRU HistoryManager**: Per-image undo/redo history stack (max 50 entries)
- **CoordinateTransform**: Unified coordinate system (normalized 0-1 ↔ image pixels ↔ canvas pixels)
- **InferenceRunner**: ONNX Runtime integration for AI-powered object detection with NMS and mask-to-polygon conversion
- **State Injection**: `webviewHtml.ts` injects classNames, initial image data, labels, kptShape, worker URL, and ORT WASM paths into window object

### JS to TypeScript Migration

The entire codebase has been migrated to TypeScript (completed). The `ort-entry.js` file has also been migrated to `ort-entry.ts` while maintaining UMD compatibility for ONNX Runtime loading.

### Webpack Build

The project uses webpack multi-compiler configuration, producing three separate bundles:

| Bundle | Target | Entry | Description |
|--------|--------|-------|-------------|
| extension.js | node | src/extension.ts | VS Code extension host process |
| main.js | web | src/templates/ort-entry.ts + src/templates/main/main.ts | WebView main thread (includes inference, ORT WASM initialization) |
| worker.js | webworker | src/templates/worker/worker.ts | Rendering Worker |

Build commands:
```bash
npm run build      # Production build
npm run build:dev  # Development build
npm run watch      # Development mode (watch)
```

## Branch Management Strategy

We follow this branch strategy:

- **main**: Stable version branch for releases
- **dev**: Development branch, all feature development is based on this branch
- **feature/xxx**: Feature development branches
- **bugfix/xxx**: Bug fix branches
- **docs/xxx**: Documentation update branches

## Development Workflow

1. **Create Feature Branch**
   - Create new feature branch from `dev` branch
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/your-feature-name
   ```

2. **Local Development**
   - Write code
   - Perform testing
   - Ensure code meets project standards

3. **Commit Changes**
   - Ensure code passes checks before committing
   ```bash
   npm run lint
   ```

4. **Push Branch**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request**
   - From feature branch to `dev` branch

## Code Submission

### Commit Message Standards

We use the following format:

```
<type>: <brief description>

<detailed description>
```

Types include:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code formatting changes
- **refactor**: Code refactoring
- **test**: Adding or modifying tests
- **chore**: Build process or auxiliary tool changes

Example:
```
feat: add COCO8-seg data format support

- Implement COCO8-seg format parsing
- Add related test cases
- Update documentation
```

## Pull Request Process

1. **Create PR**
   - Login to GitHub, go to the project repository
   - Click "Pull requests" > "New pull request"
   - Select base branch (`dev`) and your feature branch
   - Click "Create pull request"

2. **Fill PR Information**
   - Provide clear title and description
   - List major changes
   - Reference related issues (if any)

3. **Wait for Review**
   - At least one maintainer needs to review
   - Resolve issues raised during review

4. **Merge PR**
   - After passing all reviews, PR can be merged
   - Feature branch can be deleted after merging

## Version Management

We use [Semantic Versioning](https://semver.org/):

- **Major version**: Incompatible API changes
- **Minor version**: Backward-compatible functionality additions
- **Patch version**: Backward-compatible bug fixes

Version update process:
1. Complete feature development and testing in `dev` branch
2. Update version number in `package.json`
3. Update CHANGELOG or release notes
4. Merge to `main` branch
5. Tag release version
   ```bash
   git tag -a v0.0.x -m "Version 0.0.x"
   git push origin v0.0.x
   ```

## Issue Reporting

### Submitting Issues

1. Visit the [Issues page](https://github.com/andaoai/yolo-label-vs/issues)
2. Click "New issue"
3. Select appropriate issue template
4. Fill necessary information:
   - Environment details
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots or logs (if available)

### Issue Lifecycle

- **open**: Newly submitted or in-process issues
- **in progress**: Developer is working on the solution
- **need more info**: More information required from submitter
- **closed**: Resolved or invalid

## Documentation Maintenance

- All feature changes should update both English (README.md) and Chinese (docs/README_CN.md) documentation
- Documentation updates should maintain consistent formatting
- Image resources should be placed in the `docs/images/` directory
- Independent `docs/xxx` branches can be used for large documentation updates

## FAQ

### Q: How to debug the extension?
A: Press F5 to launch a new VSCode window that loads the extension under development.

### Q: Where should test data be placed?
A: Place test data in the `test/data/` directory, which has been configured with example datasets. Test ONNX models go in the `models/` directory.

### Q: How to handle conflicts?
A: 
```bash
git fetch origin
git merge origin/dev
# Resolve conflicts
git add .
git commit -m "resolve conflicts"
```

### Q: What if my local branch is out of sync with remote?
A:
```bash
git fetch origin
git reset --hard origin/dev  # Use with caution, will lose local changes
# Or
git stash
git pull origin dev
git stash pop  # May need to resolve conflicts
```

### Q: What is the CI/CD process?
A: The project uses GitHub Actions for CI/CD. Each commit to the `main` branch automatically publishes to the VS Code Marketplace. See configuration files in the `.github/workflows/` directory for details.

---

Contributions are welcome. If you have any questions, please submit them through [Issues](https://github.com/andaoai/yolo-label-vs/issues) or contact us via email. 