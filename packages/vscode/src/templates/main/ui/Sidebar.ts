/**
 * 侧边栏 — 可折叠的 Class 选择器 + Labels 列表
 */
import type { Store } from '../state/Store';
import type { Label } from '../../shared/types';
import { COLORS } from '../../shared/config';
import { toggleCollapsibleSection } from './collapsible';

export class Sidebar {
  // Class 区域
  private classHeaderEl: HTMLElement | null = null;
  private classBodyEl: HTMLElement | null = null;
  private classToggleEl: HTMLElement | null = null;
  private classNameEl: HTMLElement | null = null;
  private classBadgeEl: HTMLElement | null = null;
  private classSearchEl: HTMLInputElement | null = null;
  private classGridEl: HTMLElement | null = null;
  private classCollapsed = true; // 默认关闭

  // Labels 区域
  private labelHeaderEl: HTMLElement | null = null;
  private labelBodyEl: HTMLElement | null = null;
  private labelToggleEl: HTMLElement | null = null;
  private labelCountEl: HTMLElement | null = null;
  private labelListEl: HTMLElement | null = null;
  private labelCollapsed = false;

  constructor(
    private store: Store,
    private callbacks: {
      onClassChange: (labelIndex: number, newClass: number) => void;
      onDeleteLabel: (labelIndex: number) => void;
      onToggleVisibility: (labelIndex: number) => void;
      onHoverLabel: (labelIndex: number | null) => void;
    },
  ) {}

  init(): void {
    // Class 区域元素
    this.classHeaderEl = document.getElementById('classHeader');
    this.classBodyEl = document.getElementById('classBody');
    this.classToggleEl = this.classHeaderEl?.querySelector('.section-toggle') ?? null;
    this.classNameEl = document.getElementById('className');
    this.classBadgeEl = document.getElementById('classBadge');
    this.classSearchEl = document.getElementById('classSearch') as HTMLInputElement;
    this.classGridEl = document.getElementById('classGrid');

    // Labels 区域元素
    this.labelHeaderEl = document.getElementById('labelHeader');
    this.labelBodyEl = document.getElementById('labelBody');
    this.labelToggleEl = this.labelHeaderEl?.querySelector('.section-toggle') ?? null;
    this.labelCountEl = document.getElementById('labelCount');
    this.labelListEl = document.getElementById('labelList');

    // 折叠/展开事件
    this.classHeaderEl?.addEventListener('click', () => this.toggleClassSection());
    this.labelHeaderEl?.addEventListener('click', () => this.toggleLabelSection());

    // 搜索过滤
    this.classSearchEl?.addEventListener('input', () => this.renderClassGrid());

    // Store 订阅
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

  /** 重新渲染标签列表（由 DOMManager.updateLabelList 调用） */
  render(): void {
    this.renderLabelList();
    this.updateLabelCount();
  }

  /** 高亮指定标签 */
  highlightLabel(index: number | null): void {
    if (!this.labelListEl) return;
    this.labelListEl.querySelectorAll('.label-item').forEach((item, i) => {
      item.classList.toggle('highlighted', i === index);
    });
  }

  // ─── Class 区域 ───────────────────────────────────────

  private toggleClassSection(): void {
    this.classCollapsed = toggleCollapsibleSection(
      this.classCollapsed,
      this.classBodyEl,
      this.classToggleEl,
    );
  }

  private renderClassStatus(): void {
    const classNames = this.store.get('classNames');
    const current = this.store.get('currentClass');
    const total = classNames.length;
    const name = classNames[current] || String(current);
    if (this.classNameEl) this.classNameEl.textContent = name;
    if (this.classBadgeEl) this.classBadgeEl.textContent = `${current + 1}/${total}`;
  }

  private renderClassGrid(): void {
    if (!this.classGridEl) return;

    const classNames = this.store.get('classNames');
    const current = this.store.get('currentClass');
    const filter = this.classSearchEl?.value?.toLowerCase() || '';

    this.classGridEl.innerHTML = '';

    classNames.forEach((name, i) => {
      if (filter && !name.toLowerCase().includes(filter)) return;

      const chip = document.createElement('div');
      chip.className = 'class-chip' + (i === current ? ' active' : '');

      const dot = document.createElement('span');
      dot.className = 'class-dot';
      dot.style.backgroundColor = COLORS[i % COLORS.length];

      const label = document.createElement('span');
      label.className = 'class-name';
      label.textContent = name;

      chip.append(dot, label);
      chip.addEventListener('click', () => {
        this.store.set('currentClass', i);
      });
      this.classGridEl!.appendChild(chip);
    });
  }

  // ─── Labels 区域 ──────────────────────────────────────

  private toggleLabelSection(): void {
    this.labelCollapsed = toggleCollapsibleSection(
      this.labelCollapsed,
      this.labelBodyEl,
      this.labelToggleEl,
    );
  }

  private updateLabelCount(): void {
    if (!this.labelCountEl) return;
    const labels = this.store.get('labels');
    this.labelCountEl.textContent = String(labels.length);
  }

  private renderLabelList(): void {
    if (!this.labelListEl) return;

    const labels = this.store.get('labels');
    const classNames = this.store.get('classNames');

    if (labels.length === 0) {
      this.labelListEl.innerHTML = '<div class="empty-state">No labels - click and drag to add</div>';
      return;
    }

    this.labelListEl.innerHTML = '';

    labels.forEach((label, index) => {
      const item = this.createLabelItem(label, index, classNames);
      this.labelListEl!.appendChild(item);
    });
  }

  // ─── 标签项 ───────────────────────────────────────────

  private createLabelItem(label: Label, index: number, classNames: string[]): HTMLElement {
    const item = document.createElement('div');
    item.className = 'label-item';
    item.dataset.index = String(index);

    const color = COLORS[label.class % COLORS.length];
    const typeName = label.isSegmentation ? 'SEG' : label.isPose ? 'POSE' : 'BOX';

    // 颜色指示器
    const colorEl = document.createElement('div');
    colorEl.className = 'label-color';
    colorEl.style.backgroundColor = color;

    // 类别选择器
    const select = document.createElement('select');
    select.className = 'label-class-select';
    classNames.forEach((name, ci) => {
      const option = document.createElement('option');
      option.value = String(ci);
      option.textContent = name;
      if (ci === label.class) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      this.callbacks.onClassChange(index, parseInt(select.value));
    });

    // 类型标签
    const typeBadge = document.createElement('span');
    typeBadge.className = 'label-type';
    typeBadge.textContent = typeName;

    // 可见性切换
    const visBtn = document.createElement('button');
    visBtn.className = 'visibility-button';
    visBtn.innerHTML = label.visible === false ? this.eyeClosedIcon() : this.eyeOpenIcon();
    visBtn.title = label.visible === false ? 'Show' : 'Hide';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleVisibility(index);
    });

    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-button';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDeleteLabel(index);
    });

    // 悬停事件
    item.addEventListener('mouseenter', () => this.callbacks.onHoverLabel(index));
    item.addEventListener('mouseleave', () => this.callbacks.onHoverLabel(null));

    item.append(colorEl, select, typeBadge, visBtn, deleteBtn);
    return item;
  }

  // ─── SVG 图标 ─────────────────────────────────────────

  private eyeOpenIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  private eyeClosedIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  }
}
