/**
 * 侧边栏 — 标签列表、当前类状态
 */
import type { Store } from '../state/Store';
import type { Label } from '../../shared/types';
import { COLORS } from '../../shared/config';

export class Sidebar {
  private labelListEl: HTMLElement | null = null;
  private classStatusEl: HTMLElement | null = null;

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
    this.labelListEl = document.getElementById('labelList');
    this.classStatusEl = document.getElementById('currentClassStatus');

    this.store.on('labels', () => this.render());
    this.store.on('currentClass', () => this.updateClassStatus());
    this.store.on('classNames', () => this.updateClassStatus());
    this.store.on('hoveredLabelIndex', (idx) => this.highlightLabel(idx));

    this.render();
  }

  /** 重新渲染标签列表 */
  render(): void {
    if (!this.labelListEl) return;

    const labels = this.store.get('labels');
    const classNames = this.store.get('classNames');

    if (labels.length === 0) {
      this.labelListEl.innerHTML = '<div class="empty-state">No labels - click and drag to add</div>';
      this.updateClassStatus();
      return;
    }

    this.labelListEl.innerHTML = '';

    labels.forEach((label, index) => {
      const item = this.createLabelItem(label, index, classNames);
      this.labelListEl!.appendChild(item);
    });

    this.updateClassStatus();
  }

  /** 高亮指定标签 */
  highlightLabel(index: number | null): void {
    if (!this.labelListEl) return;
    this.labelListEl.querySelectorAll('.label-item').forEach((item, i) => {
      item.classList.toggle('highlighted', i === index);
    });
  }

  // ─── 内部 ─────────────────────────────────────────────

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

  private updateClassStatus(): void {
    if (!this.classStatusEl) return;
    const classNames = this.store.get('classNames');
    const current = this.store.get('currentClass');
    const total = classNames.length;
    const name = classNames[current] || String(current);
    this.classStatusEl.textContent = `Current: ${name} (${current + 1}/${total})`;
  }

  private eyeOpenIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  private eyeClosedIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  }
}
