/**
 * 工具接口 — 所有标注工具必须实现此接口
 */
import type { Label, NormalizedPoint, DrawPreview, Modifiers, PointRef } from '../../../shared/types';
import type { Store } from '../../state/Store';
import type { WorkerBridge } from '../../communication/WorkerBridge';

/** 工具事件结果 */
export interface ToolResult {
  /** 是否需要推入历史 */
  pushHistory?: boolean;
  /** 新增的标签 */
  addedLabels?: Label[];
  /** 更新的标签（索引 + 新值） */
  updatedLabels?: { index: number; label: Label }[];
  /** 删除的标签索引 */
  removedIndices?: number[];
  /** 是否需要更新标签列表 UI */
  updateLabelList?: boolean;
  /** 是否已处理此事件（阻止后续处理） */
  handled?: boolean;
}

export interface Tool {
  /** 工具类型标识 */
  readonly type: string;

  /** 鼠标按下 */
  onMouseDown(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null;

  /** 鼠标移动 */
  onMouseMove(pos: NormalizedPoint, modifiers: Modifiers): ToolResult | null;

  /** 鼠标抬起 */
  onMouseUp(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null;

  /** 按键（返回 true 表示已处理） */
  onKeyDown(key: string, modifiers: Modifiers): ToolResult | null;

  /** 取消当前操作 */
  onCancel(): ToolResult | null;

  /** 获取当前绘制预览 */
  getPreview(): DrawPreview | null;

  /** 是否正在绘制中 */
  isDrawing(): boolean;

  /** 重置工具状态 */
  reset(): void;
}
