/**
 * 标签操作 — 纯函数，无副作用
 *
 * 所有标签的增删改查逻辑集中在此
 * 返回新数组，不修改原数组
 */
import type { Label, NormalizedPoint } from '../../shared/types';

/**
 * 创建框选标签
 */
export function createBoxLabel(
  startX: number, startY: number,
  endX: number, endY: number,
  classIndex: number,
): Label | null {
  const x = (startX + endX) / 2;
  const y = (startY + endY) / 2;
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

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

  // 从多边形点计算边界框
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxX = Math.max(maxX, points[i]);
    maxY = Math.max(maxY, points[i + 1]);
  }

  return {
    class: classIndex,
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    isSegmentation: true,
    points: [...points],
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
  if (boxW < 0.01 || boxH < 0.01) return null;

  return {
    class: classIndex,
    x: boxX, y: boxY,
    width: boxW, height: boxH,
    isPose: true,
    keypoints,
    keypointShape,
    visible: true,
  };
}

/**
 * 移动标签整体
 */
export function moveLabel(label: Label, dx: number, dy: number): Label {
  const updated = { ...label, x: label.x + dx, y: label.y + dy };

  if (label.isSegmentation && label.points) {
    updated.points = label.points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
  }

  if (label.isPose && label.keypoints && label.keypointShape) {
    const [, vpp] = label.keypointShape;
    updated.keypoints = label.keypoints.map((v, i) => {
      const posInPoint = i % vpp;
      return v + (posInPoint === 0 ? dx : posInPoint === 1 ? dy : 0);
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
  // 对角点保持不变
  const oppositeX = cornerIndex === 0 || cornerIndex === 3
    ? label.x + label.width / 2
    : label.x - label.width / 2;
  const oppositeY = cornerIndex === 0 || cornerIndex === 1
    ? label.y + label.height / 2
    : label.y - label.height / 2;

  const minX = Math.min(newX, oppositeX);
  const maxX = Math.max(newX, oppositeX);
  const minY = Math.min(newY, oppositeY);
  const maxY = Math.max(newY, oppositeY);

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
  points[pointIndex * 2] = newX;
  points[pointIndex * 2 + 1] = newY;

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
  keypoints[keypointIndex * vpp] = newX;
  keypoints[keypointIndex * vpp + 1] = newY;
  return { ...label, keypoints };
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
