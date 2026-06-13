/**
 * 动画控制器 — 管理虚线偏移和点脉冲动画
 */
import { DASH_OFFSET_STEP, DASH_OFFSET_RESET, PULSE_SPEED } from '../shared/config';

export class AnimationController {
  private dashOffset = 0;
  private animating = false;
  private frameId: number | null = null;
  private onFrame: (() => void) | null = null;

  /** 注册动画帧回调 */
  setFrameCallback(callback: () => void): void {
    this.onFrame = callback;
  }

  /** 开始动画循环 */
  start(): void {
    if (this.animating) return;
    this.animating = true;
    this.tick();
  }

  /** 停止动画循环 */
  stop(): void {
    this.animating = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  /** 获取当前虚线偏移量 */
  getDashOffset(): number {
    return this.dashOffset;
  }

  /** 获取当前脉冲缩放因子 */
  getPulseScale(): number {
    return Math.sin(Date.now() * PULSE_SPEED) * 0.3 + 1;
  }

  private tick = (): void => {
    if (!this.animating) return;

    this.dashOffset -= DASH_OFFSET_STEP;
    if (this.dashOffset < -DASH_OFFSET_RESET) {
      this.dashOffset = 0;
    }

    this.onFrame?.();
    this.frameId = requestAnimationFrame(this.tick);
  };
}
