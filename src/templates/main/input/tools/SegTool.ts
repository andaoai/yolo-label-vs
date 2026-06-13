/**
 * 分割工具 — 点击放置多边形顶点，闭合完成标注
 */
import type { NormalizedPoint, DrawPreview, Modifiers } from '../../../shared/types';
import type { Tool, ToolResult } from './Tool';
import type { Store } from '../../state/Store';
import * as LabelOps from '../../state/LabelOperations';

export class SegTool implements Tool {
  readonly type = 'seg';

  private drawing = false;
  private points: number[] = []; // [x1,y1,x2,y2,...]
  private mouseX = 0;
  private mouseY = 0;
  private closeThreshold: number;

  constructor(private store: Store, closeThreshold = 0.02) {
    this.closeThreshold = closeThreshold;
  }

  onMouseDown(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null {
    // 右键取消
    if (button === 2) {
      return this.onCancel();
    }
    if (button !== 0 || modifiers.ctrl || modifiers.alt) return null;

    // 检查是否闭合多边形
    if (this.points.length >= 6) {
      const threshold = this.closeThreshold / (this.store.get('scale') || 1);
      const dx = pos.x - this.points[0];
      const dy = pos.y - this.points[1];
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        return this.completePolygon();
      }
    }

    // 开始或继续绘制
    this.drawing = true;
    this.points.push(pos.x, pos.y);
    return { handled: true };
  }

  onMouseMove(pos: NormalizedPoint, modifiers: Modifiers): ToolResult | null {
    if (!this.drawing) return null;
    this.mouseX = pos.x;
    this.mouseY = pos.y;
    return { handled: true };
  }

  onMouseUp(_pos: NormalizedPoint, _button: number, _modifiers: Modifiers): ToolResult | null {
    // 多边形绘制不需要 mouseup 逻辑
    return null;
  }

  onKeyDown(key: string, _modifiers: Modifiers): ToolResult | null {
    if (key === 'Escape') {
      return this.onCancel();
    }
    return null;
  }

  onCancel(): ToolResult | null {
    if (!this.drawing) return null;
    this.drawing = false;
    this.points = [];
    return { handled: true };
  }

  getPreview(): DrawPreview | null {
    if (!this.drawing || this.points.length < 2) return null;

    // 检查是否靠近第一个点
    let nearFirst = false;
    if (this.points.length >= 6) {
      const threshold = this.closeThreshold / (this.store.get('scale') || 1);
      const dx = this.mouseX - this.points[0];
      const dy = this.mouseY - this.points[1];
      nearFirst = Math.sqrt(dx * dx + dy * dy) < threshold;
    }

    return {
      tool: 'seg',
      points: [...this.points],
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      nearFirst,
    };
  }

  isDrawing(): boolean {
    return this.drawing;
  }

  reset(): void {
    this.drawing = false;
    this.points = [];
  }

  private completePolygon(): ToolResult | null {
    const label = LabelOps.createSegLabel(
      [...this.points],
      this.store.get('currentClass'),
    );

    this.drawing = false;
    this.points = [];

    if (label) {
      return {
        handled: true,
        pushHistory: true,
        addedLabels: [label],
        updateLabelList: true,
      };
    }

    return { handled: true };
  }
}
