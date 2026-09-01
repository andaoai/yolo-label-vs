/**
 * 框选工具 — 拖拽绘制矩形边界框
 */
import type { NormalizedPoint, DrawPreview, Modifiers } from '../../../shared/types';
import type { Tool, ToolResult } from './Tool';
import type { Store } from '../../state/Store';
import * as LabelOps from '../../state/LabelOperations';

export class BoxTool implements Tool {
  readonly type = 'box';

  private drawing = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;

  constructor(private store: Store) {}

  onMouseDown(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null {
    if (button !== 0 || modifiers.ctrl || modifiers.alt) return null;

    this.drawing = true;
    this.startX = pos.x;
    this.startY = pos.y;
    this.currentX = pos.x;
    this.currentY = pos.y;
    return {};
  }

  onMouseMove(pos: NormalizedPoint, modifiers: Modifiers): ToolResult | null {
    if (!this.drawing) return null;
    this.currentX = pos.x;
    this.currentY = pos.y;
    return {};
  }

  onMouseUp(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null {
    if (!this.drawing || button !== 0) return null;
    this.drawing = false;

    const label = LabelOps.createBoxLabel(
      this.startX, this.startY,
      pos.x, pos.y,
      this.store.get('currentClass'),
    );

    if (label) {
      return {
        pushHistory: true,
        addedLabels: [label],
        updateLabelList: true,
      };
    }

    return {};
  }

  onKeyDown(key: string, modifiers: Modifiers): ToolResult | null {
    if (key === 'Escape' && this.drawing) {
      return this.onCancel();
    }
    return null;
  }

  onCancel(): ToolResult | null {
    if (!this.drawing) return null;
    this.drawing = false;
    return {};
  }

  getPreview(): DrawPreview | null {
    if (!this.drawing) return null;
    return {
      tool: 'box',
      startX: this.startX,
      startY: this.startY,
      endX: this.currentX,
      endY: this.currentY,
    };
  }

  isDrawing(): boolean {
    return this.drawing;
  }

  reset(): void {
    this.drawing = false;
  }
}
