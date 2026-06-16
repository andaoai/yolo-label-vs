/**
 * 姿态工具 — 先画边界框，再逐个放置关键点
 */
import type { Label, NormalizedPoint, DrawPreview, Modifiers } from '../../../shared/types';
import type { Tool, ToolResult } from './Tool';
import type { Store } from '../../state/Store';
import * as LabelOps from '../../state/LabelOperations';

type PoseStep = 'idle' | 'box' | 'keypoints';

export class PoseTool implements Tool {
  readonly type = 'pose';

  private step: PoseStep = 'idle';
  // 框选阶段
  private boxStartX = 0;
  private boxStartY = 0;
  private boxEndX = 0;
  private boxEndY = 0;
  // 关键点阶段
  private currentLabel: Label | null = null;
  private keypointIndex = 0;
  private keypointCount = 0;
  private keypointValueCount = 3;
  private mouseX = 0;
  private mouseY = 0;

  constructor(private store: Store) {}

  onMouseDown(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null {
    // 右键：关键点阶段添加遮挡关键点
    if (button === 2 && this.step === 'keypoints') {
      return this.addKeypoint(pos, 2); // visibility=2 (occluded)
    }

    if (button !== 0 || modifiers.ctrl || modifiers.alt) return null;

    switch (this.step) {
      case 'idle':
        return this.startBox(pos);
      case 'box':
        return this.completeBox(pos);
      case 'keypoints':
        return this.addKeypoint(pos, 1); // visibility=1 (visible)
    }
  }

  onMouseMove(pos: NormalizedPoint, _modifiers: Modifiers): ToolResult | null {
    this.mouseX = pos.x;
    this.mouseY = pos.y;

    if (this.step === 'box') {
      this.boxEndX = pos.x;
      this.boxEndY = pos.y;
      return {};
    }
    return this.step === 'keypoints' ? {} : null;
  }

  onMouseUp(_pos: NormalizedPoint, _button: number, _modifiers: Modifiers): ToolResult | null {
    // 框选阶段不需要 mouseup（点击完成，不是拖拽）
    return null;
  }

  onKeyDown(key: string, _modifiers: Modifiers): ToolResult | null {
    if (key === 'Escape') {
      return this.onCancel();
    }
    return null;
  }

  onCancel(): ToolResult | null {
    if (this.step === 'idle') return null;
    this.step = 'idle';
    this.currentLabel = null;
    return {};
  }

  getPreview(): DrawPreview | null {
    switch (this.step) {
      case 'box':
        return {
          tool: 'pose',
          step: 'box',
          startX: this.boxStartX,
          startY: this.boxStartY,
          endX: this.boxEndX,
          endY: this.boxEndY,
        };
      case 'keypoints':
        if (!this.currentLabel) return null;
        return {
          tool: 'pose',
          step: 'keypoints',
          label: this.currentLabel,
          currentStep: this.keypointIndex,
          totalSteps: this.keypointCount,
          mouseX: this.mouseX,
          mouseY: this.mouseY,
        };
      default:
        return null;
    }
  }

  isDrawing(): boolean {
    return this.step !== 'idle';
  }

  reset(): void {
    this.step = 'idle';
    this.currentLabel = null;
  }

  // ─── 内部逻辑 ─────────────────────────────────────────

  private startBox(pos: NormalizedPoint): ToolResult {
    this.step = 'box';
    this.boxStartX = pos.x;
    this.boxStartY = pos.y;
    this.boxEndX = pos.x;
    this.boxEndY = pos.y;
    return {};
  }

  private completeBox(pos: NormalizedPoint): ToolResult | null {
    const cx = (this.boxStartX + pos.x) / 2;
    const cy = (this.boxStartY + pos.y) / 2;
    const w = Math.abs(pos.x - this.boxStartX);
    const h = Math.abs(pos.y - this.boxStartY);

    if (w < 0.01 || h < 0.01) {
      this.step = 'idle';
      return {};
    }

    // 读取关键点配置
    const kptShape = this.store.get('kptShape');
    this.keypointCount = kptShape[0] || 17;
    this.keypointValueCount = kptShape[1] || 3;

    // 创建临时标签（关键点逐个填充）
    const keypoints = new Array(this.keypointCount * this.keypointValueCount).fill(0);
    this.currentLabel = {
      class: this.store.get('currentClass'),
      x: cx, y: cy, width: w, height: h,
      isPose: true,
      keypoints,
      keypointShape: [this.keypointCount, this.keypointValueCount],
      visible: true,
    };

    this.step = 'keypoints';
    this.keypointIndex = 0;
    return {};
  }

  private addKeypoint(pos: NormalizedPoint, visibility: number): ToolResult | null {
    if (!this.currentLabel || !this.currentLabel.keypoints) return null;

    // 设置关键点
    const ki = this.keypointIndex * this.keypointValueCount;
    this.currentLabel.keypoints[ki] = pos.x;
    this.currentLabel.keypoints[ki + 1] = pos.y;
    this.currentLabel.keypoints[ki + 2] = visibility;

    this.keypointIndex++;

    // 所有关键点放置完成
    if (this.keypointIndex >= this.keypointCount) {
      const label = { ...this.currentLabel };
      this.step = 'idle';
      this.currentLabel = null;

      return {
        pushHistory: true,
        addedLabels: [label],
        updateLabelList: true,
      };
    }

    return {};
  }
}
