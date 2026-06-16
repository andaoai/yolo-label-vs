/**
 * 历史管理器 — Undo/Redo
 *
 * 每张图片维护独立的历史栈
 * 纯逻辑，不依赖 DOM，可独立测试
 */
import type { Label } from '../../shared/types';

interface ImageHistory {
  states: Label[][];
  index: number;
}

export class HistoryManager {
  /** 图片路径 → 历史栈 */
  private histories = new Map<string, ImageHistory>();

  /** 最大历史记录数 */
  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /**
   * 初始化图片的历史记录
   * @param path 图片路径
   * @param labels 当前标签
   */
  initImage(path: string, labels: Label[]): void {
    this.histories.set(path, {
      states: [this.cloneLabels(labels)],
      index: 0,
    });
  }

  /**
   * 推入新的历史状态
   * @param path 当前图片路径
   * @param labels 当前标签快照
   */
  push(path: string, labels: Label[]): void {
    let history = this.histories.get(path);
    if (!history) {
      history = { states: [], index: -1 };
      this.histories.set(path, history);
    }

    // 截断当前位置之后的历史（分支覆盖）
    history.states = history.states.slice(0, history.index + 1);
    history.states.push(this.cloneLabels(labels));
    history.index = history.states.length - 1;

    // 限制历史大小
    if (history.states.length > this.maxSize) {
      history.states.shift();
      history.index--;
    }
  }

  /**
   * 撤销
   * @param path 当前图片路径
   * @returns 撤销后的标签，或 null（无法撤销）
   */
  undo(path: string): Label[] | null {
    const history = this.histories.get(path);
    if (!history || history.index <= 0) return null;

    history.index--;
    return this.cloneLabels(history.states[history.index]);
  }

  /**
   * 重做
   * @param path 当前图片路径
   * @returns 重做后的标签，或 null（无法重做）
   */
  redo(path: string): Label[] | null {
    const history = this.histories.get(path);
    if (!history || history.index >= history.states.length - 1) return null;

    history.index++;
    return this.cloneLabels(history.states[history.index]);
  }

  /**
   * 深拷贝标签数组
   */
  private cloneLabels(labels: Label[]): Label[] {
    return JSON.parse(JSON.stringify(labels));
  }
}
