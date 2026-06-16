# JS 到 TS 迁移计划 (保留 WebView + CSS)

## 迁移目标

去掉 JS 代码，使用 TS 代码进行替代，保留 WebView 架构和 CSS 样式。

## 当前问题分析

### JS 代码来源

1. **Legacy 文件** (旧架构)
   - `src/templates/config.js` - 旧配置
   - `src/templates/LabelingState.js` - 旧状态
   - `src/templates/labeling-panel.js` - 旧入口
   - `src/templates/managers/CanvasManager.js` - 旧画布管理
   - `src/templates/managers/UIManager.js` - 旧 UI 管理
   - `src/templates/handlers/MessageHandler.js` - 旧消息处理

2. **ORT 入口**
   - `src/templates/ort-entry.js` - ONNX Runtime 加载器

### TS 代码分布 (新架构)

```
src/templates/
├── main/                    # 主线程 (TS)
│   ├── main.ts             # 入口
│   ├── App.ts              # 应用编排器
│   ├── state/              # 状态管理
│   ├── communication/      # 通信
│   ├── input/              # 输入处理
│   └── ui/                 # UI 组件
├── worker/                  # Worker 线程 (TS)
├── shared/                  # 共享类型 (TS)
└── inference/               # 推理 (TS)
```

---

## 迁移计划

### Phase 1: 清理 Legacy JS 文件 (1 天)

#### 1.1 删除旧 JS 文件

```bash
# 删除旧架构的 JS 文件
rm src/templates/config.js
rm src/templates/LabelingState.js
rm src/templates/labeling-panel.js
rm src/templates/managers/CanvasManager.js
rm src/templates/managers/UIManager.js
rm src/templates/handlers/MessageHandler.js
```

#### 1.2 保留 ORT 入口

`ort-entry.js` 必须保留，因为:
- ONNX Runtime 需要在 WebView 中加载
- 使用 `require()` 加载 UMD 模块
- 拦截 `fetch` 处理 jsep.mjs

**优化**: 可以用 TS 重写，但需要保持 UMD 兼容性。

---

### Phase 2: 重构 UI 组件为 TS (3-4 天)

#### 2.1 创建类型定义

```typescript
// src/templates/main/ui/types.ts
export interface UIComponent {
  init(): void;
  dispose(): void;
  update(): void;
}

export interface ToolbarCallbacks {
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onOpenImageTab: () => void;
  onOpenTxtTab: () => void;
  onToolChange: (tool: ToolType) => void;
  onToggleLabels: () => void;
  onUndo: () => void;
  onSave: () => void;
  onLoadImage: (path: string) => void;
}

export interface SidebarCallbacks {
  onClassChange: (labelIndex: number, newClass: number) => void;
  onDeleteLabel: (labelIndex: number) => void;
  onToggleVisibility: (labelIndex: number) => void;
  onHoverLabel: (labelIndex: number | null) => void;
}

export interface ModelPanelCallbacks {
  onLoadModel: () => void;
  onRunInference: () => void;
  onAcceptDetections: () => void;
  onRejectDetections: () => void;
  onConfThresholdChange: (value: number) => void;
  onIouThresholdChange: (value: number) => void;
}
```

#### 2.2 重构 Toolbar 为 TS

```typescript
// src/templates/main/ui/Toolbar.ts (改进版)
import type { Store } from '../state/Store';
import type { ToolType } from '../../shared/types';
import type { ToolbarCallbacks } from './types';
import { DEBOUNCE_DELAY, MAX_SEARCH_RESULTS } from '../../shared/config';

export class Toolbar implements UIComponent {
  private searchInput: HTMLInputElement | null = null;
  private searchResults: HTMLElement | null = null;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private selectedSearchIndex = -1;

  constructor(
    private store: Store,
    private callbacks: ToolbarCallbacks,
  ) {}

  init(): void {
    this.setupNavigation();
    this.setupFileActions();
    this.setupSearch();
    this.setupModeSelector();
    this.setupActions();

    // 订阅状态变更
    this.store.on('hasUnsavedChanges', () => this.updateSaveButton());
    this.store.on('currentPath', () => this.updateSearchInput());
  }

  dispose(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  update(): void {
    this.updateSaveButton();
    this.updateSearchInput();
  }

  // ... 其他方法保持不变
}
```

#### 2.3 重构 Sidebar 为 TS

```typescript
// src/templates/main/ui/Sidebar.ts (改进版)
import type { Store } from '../state/Store';
import type { Label } from '../../shared/types';
import type { SidebarCallbacks } from './types';
import { COLORS } from '../../shared/config';

export class Sidebar implements UIComponent {
  // Class 区域
  private classHeaderEl: HTMLElement | null = null;
  private classBodyEl: HTMLElement | null = null;
  private classToggleEl: HTMLElement | null = null;
  private classNameEl: HTMLElement | null = null;
  private classBadgeEl: HTMLElement | null = null;
  private classSearchEl: HTMLInputElement | null = null;
  private classGridEl: HTMLElement | null = null;
  private classCollapsed = false;

  // Labels 区域
  private labelHeaderEl: HTMLElement | null = null;
  private labelBodyEl: HTMLElement | null = null;
  private labelToggleEl: HTMLElement | null = null;
  private labelCountEl: HTMLElement | null = null;
  private labelListEl: HTMLElement | null = null;
  private labelCollapsed = false;

  constructor(
    private store: Store,
    private callbacks: SidebarCallbacks,
  ) {}

  init(): void {
    // 初始化元素
    this.classHeaderEl = document.getElementById('classHeader');
    this.classBodyEl = document.getElementById('classBody');
    this.classToggleEl = this.classHeaderEl?.querySelector('.section-toggle') ?? null;
    this.classNameEl = document.getElementById('className');
    this.classBadgeEl = document.getElementById('classBadge');
    this.classSearchEl = document.getElementById('classSearch') as HTMLInputElement;
    this.classGridEl = document.getElementById('classGrid');

    this.labelHeaderEl = document.getElementById('labelHeader');
    this.labelBodyEl = document.getElementById('labelBody');
    this.labelToggleEl = this.labelHeaderEl?.querySelector('.section-toggle') ?? null;
    this.labelCountEl = document.getElementById('labelCount');
    this.labelListEl = document.getElementById('labelList');

    // 绑定事件
    this.classHeaderEl?.addEventListener('click', () => this.toggleClassSection());
    this.labelHeaderEl?.addEventListener('click', () => this.toggleLabelSection());
    this.classSearchEl?.addEventListener('input', () => this.renderClassGrid());

    // 订阅 Store
    this.store.on('labels', () => {
      this.renderLabelList();
      this.updateLabelCount();
    });
    this.store.on('currentClass', () => {
      this.renderClassGrid();
      this.renderClassStatus();
    });
    this.store.on('classNames', () => {
      this.renderClassGrid();
      this.renderClassStatus();
    });
    this.store.on('hoveredLabelIndex', (idx) => this.highlightLabel(idx));

    // 初始渲染
    this.renderClassGrid();
    this.renderClassStatus();
    this.renderLabelList();
    this.updateLabelCount();
  }

  dispose(): void {
    // 清理事件监听器
  }

  update(): void {
    this.renderLabelList();
    this.updateLabelCount();
  }

  // ... 其他方法保持不变
}
```

#### 2.4 重构 ModelPanel 为 TS

```typescript
// src/templates/main/ui/ModelPanel.ts (改进版)
import type { Store } from '../state/Store';
import type { ModelPanelCallbacks } from './types';

export class ModelPanel implements UIComponent {
  private sectionEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private toggleEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private collapsed = false;

  private modelInfoEl: HTMLElement | null = null;
  private loadBtn: HTMLButtonElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private previewActionsEl: HTMLElement | null = null;

  constructor(
    private store: Store,
    private callbacks: ModelPanelCallbacks,
  ) {}

  init(): void {
    // ... 初始化代码
  }

  dispose(): void {
    // 清理
  }

  update(): void {
    this.updateModelStatus();
    this.updateRunningState();
    this.updatePreviewActions();
  }

  // ... 其他方法保持不变
}
```

---

### Phase 3: 优化构建配置 (1 天)

#### 3.1 更新 webpack.config.js

```javascript
// webpack.config.js
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // ... extensionConfig 保持不变

    // ─── Webview 主线程（浏览器） ────────────────────────
    const webviewConfig = {
        target: 'web',
        mode: isProduction ? 'production' : 'development',
        devtool: isProduction ? false : 'source-map',
        entry: {
            'templates/main': ['./src/templates/ort-entry.js', './src/templates/main/main.ts'],
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            clean: false,
        },
        resolve: {
            extensions: ['.ts', '.js'],  // 保留 .js 支持 ORT
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [{
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                module: 'ES2022',
                            }
                        }
                    }],
                },
                // 保留 .js 规则用于 ORT
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env']
                        }
                    }
                }
            ],
            exprContextCritical: false,
        },
        optimization: {
            minimize: isProduction,
        },
        performance: {
            maxAssetSize: 512 * 1024,
            maxEntrypointSize: 512 * 1024,
        },
        ignoreWarnings: [
            { module: /ort\.min\.js/, message: /Critical dependency/ },
        ],
    };

    // ... workerConfig 保持不变

    return [extensionConfig, webviewConfig, workerConfig];
};
```

#### 3.2 更新 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "src/**/*.js"  // 排除 JS 文件
  ]
}
```

---

### Phase 4: 重构 DOMManager (1 天)

```typescript
// src/templates/main/ui/DOMManager.ts (改进版)
import type { Store } from '../state/Store';
import type { ToolType } from '../../shared/types';
import type { ToolbarCallbacks, SidebarCallbacks, ModelPanelCallbacks } from './types';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ProgressBar } from './ProgressBar';
import { ModelPanel } from './ModelPanel';
import { ThemeManager } from './ThemeManager';

export interface DOMCallbacks extends ToolbarCallbacks, SidebarCallbacks, ModelPanelCallbacks {
  onPreviewHover?: (startIndex: number, endIndex: number) => void;
}

export class DOMManager implements UIComponent {
  readonly toolbar: Toolbar;
  readonly sidebar: Sidebar;
  readonly statusBar: StatusBar;
  readonly progressBar: ProgressBar;
  readonly modelPanel: ModelPanel;
  readonly themeManager: ThemeManager;

  constructor(store: Store, callbacks: DOMCallbacks, themeManager: ThemeManager) {
    this.themeManager = themeManager;

    this.toolbar = new Toolbar(store, {
      onNavigateNext: callbacks.onNavigateNext,
      onNavigatePrevious: callbacks.onNavigatePrevious,
      onOpenImageTab: callbacks.onOpenImageTab,
      onOpenTxtTab: callbacks.onOpenTxtTab,
      onToolChange: callbacks.onToolChange,
      onToggleLabels: callbacks.onToggleLabels,
      onUndo: callbacks.onUndo,
      onSave: callbacks.onSave,
      onLoadImage: callbacks.onLoadImage,
    });

    this.sidebar = new Sidebar(store, {
      onClassChange: callbacks.onClassChange,
      onDeleteLabel: callbacks.onDeleteLabel,
      onToggleVisibility: callbacks.onToggleVisibility,
      onHoverLabel: callbacks.onHoverLabel,
    });

    this.statusBar = new StatusBar(store);
    this.progressBar = new ProgressBar(store, {
      onLoadImage: callbacks.onLoadImage,
      onPreviewHover: callbacks.onPreviewHover,
    });

    this.modelPanel = new ModelPanel(store, {
      onLoadModel: callbacks.onLoadModel,
      onRunInference: callbacks.onRunInference,
      onAcceptDetections: callbacks.onAcceptDetections,
      onRejectDetections: callbacks.onRejectDetections,
      onConfThresholdChange: callbacks.onConfThresholdChange,
      onIouThresholdChange: callbacks.onIouThresholdChange,
    });
  }

  init(): void {
    this.toolbar.init();
    this.sidebar.init();
    this.statusBar.init();
    this.progressBar.init();
    this.modelPanel.init();
    this.themeManager.startListening();
  }

  dispose(): void {
    this.toolbar.dispose();
    this.sidebar.dispose();
    this.statusBar.dispose();
    this.progressBar.dispose();
    this.modelPanel.dispose();
    this.themeManager.stopListening();
  }

  update(): void {
    this.toolbar.update();
    this.sidebar.update();
    this.statusBar.update();
    this.progressBar.update();
    this.modelPanel.update();
  }

  updateNavButtons(hasPrev: boolean, hasNext: boolean): void {
    const prevBtn = document.getElementById('prevImage') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextImage') as HTMLButtonElement;
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
  }

  updateLabelList(): void {
    this.sidebar.render();
  }
}
```

---

### Phase 5: 优化 App.ts (1 天)

```typescript
// src/templates/main/App.ts (改进版)
import type { Label } from '../shared/types';
import type { ExtensionMessage } from './communication/ExtensionBridge';
import type { WorkerToMainMessage } from '../shared/messages';
import { Store } from './state/Store';
import { HistoryManager } from './state/HistoryManager';
import * as LabelOps from './state/LabelOperations';
import { ExtensionBridge } from './communication/ExtensionBridge';
import { WorkerBridge } from './communication/WorkerBridge';
import { InferenceRunner } from '../inference/inferenceRunner';
import { ToolManager } from './input/tools/ToolManager';
import { InputManager } from './input/InputManager';
import { DOMManager, type DOMCallbacks } from './ui/DOMManager';
import { ThemeManager } from './ui/ThemeManager';
import { COLORS } from '../shared/config';

export class App {
  readonly store: Store;
  readonly history: HistoryManager;
  readonly extension: ExtensionBridge;
  readonly worker: WorkerBridge;
  readonly inferenceRunner: InferenceRunner;
  readonly toolManager: ToolManager;
  readonly dom: DOMManager;

  private inputManager: InputManager | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private savedState: string = '';
  private currentImageData: string = '';
  private previewCache: Map<number, string> = new Map();
  private pendingPreviewRange: { startIndex: number; endIndex: number } | null = null;
  private previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // 1. Store
    this.store = new Store();

    // 2. Worker
    const workerUrl = this.resolveWorkerUrl();
    this.worker = new WorkerBridge(workerUrl);

    // 3. Extension
    this.extension = new ExtensionBridge();

    // 4. Inference
    this.inferenceRunner = new InferenceRunner();

    // 5. History
    this.history = new HistoryManager();

    // 6. Tools
    this.toolManager = new ToolManager(this.store, this.worker);

    // 7. DOM
    const themeManager = new ThemeManager(this.store, this.worker);
    this.dom = new DOMManager(this.store, this.createDOMCallbacks(), themeManager);
  }

  async start(): Promise<void> {
    await this.waitForWorker();
    this.worker.onMessage((msg) => this.handleWorkerMessage(msg));
    this.initCanvas();
    this.initInput();
    this.dom.init();
    this.loadInitialData();
    this.extension.onMessage((msg) => this.handleExtensionMessage(msg));
    this.extension.getImageList();
    this.initInference().catch((err) => {
      console.warn('[App] Inference init failed (non-critical):', err);
    });
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('keydown', (e) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.save();
      }
    });
  }

  // ... 其他方法保持不变
}
```

---

### Phase 6: 测试和优化 (1-2 天)

#### 6.1 功能测试

- [ ] Canvas 渲染正常
- [ ] 工具栏功能正常
- [ ] 侧边栏功能正常
- [ ] 状态栏更新正常
- [ ] 进度条功能正常
- [ ] 模型面板功能正常
- [ ] 快捷键正常
- [ ] 保存和加载正常

#### 6.2 性能测试

- [ ] 内存占用
- [ ] CPU 使用率
- [ ] 渲染性能
- [ ] 通信延迟

---

## 文件结构对比

### 迁移前

```
src/templates/
├── config.js                    # ❌ 旧 JS
├── LabelingState.js             # ❌ 旧 JS
├── labeling-panel.js            # ❌ 旧 JS
├── labeling-panel.html
├── labeling-panel.css
├── index.html
├── ort-entry.js                 # ❌ JS (保留)
├── managers/                    # ❌ 旧 JS
│   ├── CanvasManager.js
│   └── UIManager.js
├── handlers/                    # ❌ 旧 JS
│   └── MessageHandler.js
├── main/                        # ✅ TS
├── worker/                      # ✅ TS
├── shared/                      # ✅ TS
└── inference/                   # ✅ TS
```

### 迁移后

```
src/templates/
├── labeling-panel.html
├── labeling-panel.css
├── index.html
├── ort-entry.js                 # 保留 (ORT 需要)
├── main/                        # ✅ TS (全部)
│   ├── main.ts
│   ├── App.ts
│   ├── state/
│   ├── communication/
│   ├── input/
│   └── ui/
│       ├── types.ts             # 新增
│       ├── DOMManager.ts
│       ├── Toolbar.ts
│       ├── Sidebar.ts
│       ├── StatusBar.ts
│       ├── ProgressBar.ts
│       ├── ModelPanel.ts
│       └── ThemeManager.ts
├── worker/                      # ✅ TS (全部)
├── shared/                      # ✅ TS (全部)
└── inference/                   # ✅ TS (全部)
```

---

## 预期收益

1. **代码质量**: 全部使用 TypeScript，类型安全
2. **可维护性**: 更好的代码组织和类型定义
3. **开发体验**: 更好的 IDE 支持和错误检查
4. **性能**: 移除旧代码，减少包大小
5. **兼容性**: 保留 WebView 和 CSS，功能不变

---

## 时间估算

| 阶段 | 任务 | 时间 |
|------|------|------|
| Phase 1 | 清理 Legacy JS 文件 | 1 天 |
| Phase 2 | 重构 UI 组件为 TS | 3-4 天 |
| Phase 3 | 优化构建配置 | 1 天 |
| Phase 4 | 重构 DOMManager | 1 天 |
| Phase 5 | 优化 App.ts | 1 天 |
| Phase 6 | 测试和优化 | 1-2 天 |
| **总计** | | **8-10 天** |

---

## 注意事项

1. **保留 ORT 入口**: `ort-entry.js` 必须保留，因为 ONNX Runtime 需要
2. **CSS 保留**: 所有样式保持不变
3. **功能不变**: 所有现有功能必须正常工作
4. **渐进式迁移**: 可以分阶段实施，逐步替换
5. **回退机制**: 如果有问题，可以快速回退
