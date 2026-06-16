/** 数学工具函数 */

/** 将数值限制在指定范围内 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 将数值限制在归一化坐标范围 [0, 1] */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
