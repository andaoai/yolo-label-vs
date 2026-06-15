/**
 * 标签操作 — 纯函数，无副作用
 *
 * 所有标签的增删改查逻辑集中在此
 * 返回新数组，不修改原数组
 */
import type { Label, NormalizedPoint } from '../../shared/types';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 创建框选标签
 */
export function createBoxLabel(
  startX: number, startY: number,
  endX: number, endY: number,
  classIndex: number,
): Label | null {
  // 约束坐标到图片范围内 [0, 1]
  const sx = clamp(startX, 0, 1);
  const sy = clamp(startY, 0, 1);
  const ex = clamp(endX, 0, 1);
  const ey = clamp(endY, 0, 1);

  const x = (sx + ex) / 2;
  const y = (sy + ey) / 2;
  const width = Math.abs(ex - sx);
  const height = Math.abs(ey - sy);

  // 最小尺寸检查
  if (width < 0.01 || height < 0.01) return null;

  return {
    class: classIndex,
    x, y, width, height,
    visible: true,
  };
}

/**
 * 创建分割标签
 */
export function createSegLabel(
  points: number[],
  classIndex: number,
): Label | null {
  if (points.length < 6) return null; // 至少 3 个点

  // 约束所有点到图片范围内（不修改原数组）
  const clamped = [...points];
  for (let i = 0; i < clamped.length; i += 2) {
    clamped[i] = clamp(clamped[i], 0, 1);
    clamped[i + 1] = clamp(clamped[i + 1], 0, 1);
  }

  // 从多边形点计算边界框
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < clamped.length; i += 2) {
    minX = Math.min(minX, clamped[i]);
    minY = Math.min(minY, clamped[i + 1]);
    maxX = Math.max(maxX, clamped[i]);
    maxY = Math.max(maxY, clamped[i + 1]);
  }

  return {
    class: classIndex,
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    isSegmentation: true,
    points: clamped,
    visible: true,
  };
}

/**
 * 创建姿态标签
 */
export function createPoseLabel(
  boxX: number, boxY: number, boxW: number, boxH: number,
  keypoints: number[],
  keypointShape: number[],
  classIndex: number,
): Label | null {
  // 约束框坐标到图片范围内
  const halfW = boxW / 2;
  const halfH = boxH / 2;
  const cx = clamp(boxX, halfW, 1 - halfW);
  const cy = clamp(boxY, halfH, 1 - halfH);

  if (boxW < 0.01 || boxH < 0.01) return null;

  // 约束关键点
  const clampedKeypoints = keypoints.map((v, i) => {
    const posInPoint = i % (keypointShape[1] || 3);
    if (posInPoint === 0) return clamp(v, 0, 1);
    if (posInPoint === 1) return clamp(v, 0, 1);
    return v;
  });

  return {
    class: classIndex,
    x: cx, y: cy,
    width: boxW, height: boxH,
    isPose: true,
    keypoints: clampedKeypoints,
    keypointShape,
    visible: true,
  };
}

/**
 * 移动标签整体
 */
export function moveLabel(label: Label, dx: number, dy: number): Label {
  const updated = { ...label };

  if (label.isSegmentation && label.points) {
    // 分割标签：先移动点并 clamp，再从点重新计算边界框
    const points = label.points.map((v, i) => clamp(v + (i % 2 === 0 ? dx : dy), 0, 1));
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (let i = 0; i < points.length; i += 2) {
      minX = Math.min(minX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      maxX = Math.max(maxX, points[i]);
      maxY = Math.max(maxY, points[i + 1]);
    }
    updated.points = points;
    updated.x = (minX + maxX) / 2;
    updated.y = (minY + maxY) / 2;
    updated.width = maxX - minX;
    updated.height = maxY - minY;
    return updated;
  }

  // 普通框和姿态标签：约束中心使框不超出边界
  const halfW = label.width / 2;
  const halfH = label.height / 2;
  const clampedX = clamp(label.x + dx, halfW, 1 - halfW);
  const clampedY = clamp(label.y + dy, halfH, 1 - halfH);
  const actualDx = clampedX - label.x;
  const actualDy = clampedY - label.y;

  updated.x = clampedX;
  updated.y = clampedY;

  if (label.isPose && label.keypoints && label.keypointShape) {
    const [, vpp] = label.keypointShape;
    updated.keypoints = label.keypoints.map((v, i) => {
      const posInPoint = i % vpp;
      if (posInPoint === 0) return clamp(v + actualDx, 0, 1);
      if (posInPoint === 1) return clamp(v + actualDy, 0, 1);
      return v;
    });
  }

  return updated;
}

/**
 * 移动框选标签的角点
 * @param cornerIndex 角点索引：0=左上, 1=右上, 2=右下, 3=左下
 */
export function moveBoxCorner(
  label: Label, cornerIndex: number, newX: number, newY: number,
): Label {
  // 拖拽的角点约束到图片范围内
  const cx = clamp(newX, 0, 1);
  const cy = clamp(newY, 0, 1);

  // 对角点也约束到图片范围内（防止旧数据越界）
  const oppositeX = clamp(
    cornerIndex === 0 || cornerIndex === 3
      ? label.x + label.width / 2
      : label.x - label.width / 2,
    0, 1,
  );
  const oppositeY = clamp(
    cornerIndex === 0 || cornerIndex === 1
      ? label.y + label.height / 2
      : label.y - label.height / 2,
    0, 1,
  );

  const minX = Math.min(cx, oppositeX);
  const maxX = Math.max(cx, oppositeX);
  const minY = Math.min(cy, oppositeY);
  const maxY = Math.max(cy, oppositeY);

  return {
    ...label,
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 移动多边形顶点
 */
export function movePolygonPoint(
  label: Label, pointIndex: number, newX: number, newY: number,
): Label {
  if (!label.points) return label;
  const points = [...label.points];
  points[pointIndex * 2] = clamp(newX, 0, 1);
  points[pointIndex * 2 + 1] = clamp(newY, 0, 1);

  // 重新计算边界框
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxX = Math.max(maxX, points[i]);
    maxY = Math.max(maxY, points[i + 1]);
  }

  return {
    ...label,
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    points,
  };
}

/**
 * 移动关键点
 */
export function moveKeypoint(
  label: Label, keypointIndex: number, newX: number, newY: number,
): Label {
  if (!label.keypoints || !label.keypointShape) return label;
  const [, vpp] = label.keypointShape;
  const keypoints = [...label.keypoints];
  keypoints[keypointIndex * vpp] = clamp(newX, 0, 1);
  keypoints[keypointIndex * vpp + 1] = clamp(newY, 0, 1);
  return { ...label, keypoints };
}

/**
 * 深拷贝标签
 */
export function cloneLabel(label: Label): Label {
  const cloned: Label = { ...label };
  if (label.points) cloned.points = [...label.points];
  if (label.keypoints) cloned.keypoints = [...label.keypoints];
  if (label.keypointShape) cloned.keypointShape = [...label.keypointShape];
  return cloned;
}

/**
 * 切换标签可见性
 */
export function toggleVisibility(label: Label): Label {
  return { ...label, visible: label.visible === false ? true : false };
}

/**
 * 更改标签类别
 */
export function changeClass(label: Label, newClass: number): Label {
  return { ...label, class: newClass };
}
