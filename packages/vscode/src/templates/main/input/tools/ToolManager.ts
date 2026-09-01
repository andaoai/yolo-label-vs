/**
 * 工具管理器 — 工具注册、切换、事件路由
 */
import type { ToolType, NormalizedPoint, Modifiers } from '../../../shared/types';
import type { Store } from '../../state/Store';
import type { WorkerBridge } from '../../communication/WorkerBridge';
import type { Tool, ToolResult } from './Tool';
import { BoxTool } from './BoxTool';
import { SegTool } from './SegTool';
import { PoseTool } from './PoseTool';

export class ToolManager {
  private tools = new Map<string, Tool>();
  private activeTool: Tool | null = null;

  constructor(private store: Store, private worker: WorkerBridge) {
    // 注册内置工具
    this.register(new BoxTool(store));
    this.register(new SegTool(store));
    this.register(new PoseTool(store));

    // 默认激活框选工具
    this.setActive('box');
  }

  /** 注册工具 */
  register(tool: Tool): void {
    this.tools.set(tool.type, tool);
  }

  /** 切换活动工具 */
  setActive(type: ToolType): void {
    if (this.activeTool) {
      this.activeTool.reset();
    }
    this.activeTool = this.tools.get(type) || null;
    this.store.set('activeTool', type);
    this.worker.setPreview(null);
  }

  // ─── 事件路由 ─────────────────────────────────────────

  onMouseDown(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null {
    return this.activeTool?.onMouseDown(pos, button, modifiers) ?? null;
  }

  onMouseMove(pos: NormalizedPoint, modifiers: Modifiers): ToolResult | null {
    const result = this.activeTool?.onMouseMove(pos, modifiers) ?? null;
    // 更新预览
    this.worker.setPreview(this.activeTool?.getPreview() ?? null);
    return result;
  }

  onMouseUp(pos: NormalizedPoint, button: number, modifiers: Modifiers): ToolResult | null {
    const result = this.activeTool?.onMouseUp(pos, button, modifiers) ?? null;
    // 清除预览
    this.worker.setPreview(this.activeTool?.getPreview() ?? null);
    return result;
  }

  onKeyDown(key: string, modifiers: Modifiers): ToolResult | null {
    return this.activeTool?.onKeyDown(key, modifiers) ?? null;
  }

  onCancel(): ToolResult | null {
    return this.activeTool?.onCancel() ?? null;
  }

  /** 工具是否正在绘制中 */
  isDrawing(): boolean {
    return this.activeTool?.isDrawing() ?? false;
  }
}
