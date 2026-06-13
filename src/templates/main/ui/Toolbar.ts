/**
 * 工具栏 — 导航、搜索、模式切换、保存
 */
import type { Store } from '../state/Store';
import type { ToolType } from '../../shared/types';
import { DEBOUNCE_DELAY, MAX_SEARCH_RESULTS } from '../../shared/config';

export class Toolbar {
  private searchInput: HTMLInputElement | null = null;
  private searchResults: HTMLElement | null = null;
  private searchTimeout: number | null = null;
  private selectedSearchIndex = -1;

  constructor(
    private store: Store,
    private callbacks: {
      onNavigateNext: () => void;
      onNavigatePrevious: () => void;
      onOpenImageTab: () => void;
      onOpenTxtTab: () => void;
      onToolChange: (tool: ToolType) => void;
      onToggleLabels: () => void;
      onUndo: () => void;
      onSave: () => void;
      onLoadImage: (path: string) => void;
    },
  ) {}

  /** 初始化所有工具栏元素 */
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

  // ─── 导航按钮 ─────────────────────────────────────────

  private setupNavigation(): void {
    document.getElementById('prevImage')?.addEventListener('click', () => {
      this.callbacks.onNavigatePrevious();
    });
    document.getElementById('nextImage')?.addEventListener('click', () => {
      this.callbacks.onNavigateNext();
    });
  }

  // ─── 文件操作按钮 ─────────────────────────────────────

  private setupFileActions(): void {
    document.getElementById('openImageTab')?.addEventListener('click', () => {
      this.callbacks.onOpenImageTab();
    });
    document.getElementById('openTxtTab')?.addEventListener('click', () => {
      this.callbacks.onOpenTxtTab();
    });
  }

  // ─── 搜索 ─────────────────────────────────────────────

  private setupSearch(): void {
    this.searchInput = document.getElementById('imageSearch') as HTMLInputElement;
    this.searchResults = document.getElementById('searchResults') as HTMLElement;

    if (!this.searchInput || !this.searchResults) return;

    this.searchInput.addEventListener('input', () => {
      if (this.searchTimeout) clearTimeout(this.searchTimeout);
      this.searchTimeout = window.setTimeout(() => {
        this.handleSearch(this.searchInput!.value);
      }, DEBOUNCE_DELAY);
    });

    this.searchInput.addEventListener('keydown', (e) => {
      this.handleSearchKeydown(e);
    });

    // 点击外部关闭搜索结果
    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.search-box')) {
        this.hideSearchResults();
      }
    });
  }

  private handleSearch(query: string): void {
    if (!query.trim() || !this.searchResults) {
      this.hideSearchResults();
      return;
    }

    const paths = this.store.get('allPaths');
    const lowerQuery = query.toLowerCase();
    const matches = paths
      .filter(p => {
        const filename = p.split(/[/\\]/).pop() || '';
        return p.toLowerCase().includes(lowerQuery) || filename.toLowerCase().includes(lowerQuery);
      })
      .slice(0, MAX_SEARCH_RESULTS);

    if (matches.length === 0) {
      this.hideSearchResults();
      return;
    }

    this.searchResults.innerHTML = '';
    this.selectedSearchIndex = -1;

    matches.forEach((path, index) => {
      const filename = path.split(/[/\\]/).pop() || path;
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `<span class="filename">${this.escapeHtml(filename)}</span><span class="filepath">${this.escapeHtml(path)}</span>`;
      item.addEventListener('click', () => {
        this.callbacks.onLoadImage(path);
        this.hideSearchResults();
      });
      item.dataset.index = String(index);
      this.searchResults!.appendChild(item);
    });

    this.searchResults.style.display = 'block';
  }

  private handleSearchKeydown(e: KeyboardEvent): void {
    if (!this.searchResults) return;
    const items = this.searchResults.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedSearchIndex = Math.min(this.selectedSearchIndex + 1, items.length - 1);
        this.highlightSearchResult(items);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedSearchIndex = Math.max(this.selectedSearchIndex - 1, 0);
        this.highlightSearchResult(items);
        break;
      case 'Enter':
        e.preventDefault();
        if (this.selectedSearchIndex >= 0 && this.selectedSearchIndex < items.length) {
          (items[this.selectedSearchIndex] as HTMLElement).click();
        }
        break;
      case 'Escape':
        this.hideSearchResults();
        break;
    }
  }

  private highlightSearchResult(items: NodeListOf<Element>): void {
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === this.selectedSearchIndex);
    });
    if (this.selectedSearchIndex >= 0) {
      (items[this.selectedSearchIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }

  private hideSearchResults(): void {
    if (this.searchResults) {
      this.searchResults.style.display = 'none';
    }
    this.selectedSearchIndex = -1;
  }

  private updateSearchInput(): void {
    if (this.searchInput) {
      const path = this.store.get('currentPath');
      this.searchInput.value = path ? (path.split(/[/\\]/).pop() || path) : '';
    }
  }

  // ─── 模式选择器 ───────────────────────────────────────

  private setupModeSelector(): void {
    const modes: { id: string; tool: ToolType }[] = [
      { id: 'boxMode', tool: 'box' },
      { id: 'segMode', tool: 'seg' },
      { id: 'poseMode', tool: 'pose' },
    ];

    // 姿态模式需要 kptShape
    const kptShape = this.store.get('kptShape');
    if (!kptShape || kptShape.length === 0) {
      document.getElementById('poseMode')?.classList.add('hidden');
    }

    modes.forEach(({ id, tool }) => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.callbacks.onToolChange(tool);
        this.updateModeButtons(tool);
      });
    });

    // 初始状态
    this.updateModeButtons(this.store.get('activeTool'));

    // 订阅 activeTool 变更，自动更新按钮状态
    this.store.on('activeTool', (tool) => this.updateModeButtons(tool));
  }

  private updateModeButtons(active: ToolType): void {
    document.querySelectorAll('.segmented-button').forEach(btn => {
      btn.classList.toggle('active', btn.id === `${active}Mode`);
    });
  }

  // ─── 操作按钮 ─────────────────────────────────────────

  private setupActions(): void {
    document.getElementById('toggleLabels')?.addEventListener('click', () => {
      this.callbacks.onToggleLabels();
      document.getElementById('toggleLabels')?.classList.toggle('active');
    });

    // 保存按钮
    document.getElementById('saveLabels')?.addEventListener('click', () => {
      this.callbacks.onSave();
    });

    // 撤销按钮
    document.getElementById('undoButton')?.addEventListener('click', () => {
      this.callbacks.onUndo();
    });

    this.updateSaveButton();
  }

  private updateSaveButton(): void {
    const btn = document.getElementById('saveLabels') as HTMLButtonElement;
    if (btn) {
      btn.disabled = !this.store.get('hasUnsavedChanges');
    }
  }

  // ─── 辅助 ─────────────────────────────────────────────

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
