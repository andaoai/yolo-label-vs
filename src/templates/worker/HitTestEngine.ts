/**
 * 命中检测引擎 — 判断鼠标位置下的标签/点
 * 纯几何计算，无副作用
 */
import type { Label, NormalizedPoint, HitTestResult, PointRef } from '../shared/types';
import type { RenderConfig } from '../shared/messages';
import { CoordinateTransform } from './CoordinateTransform';

export class HitTestEngine {
  constructor(private transform: CoordinateTransform) {}

  /**
   * 执行命中检测
   * @param labels 标签列表
   * @param mouse 归一化鼠标坐标
   * @param config 渲染配置
   * @returns 命中结果
   */
  hitTest(labels: Label[], mouse: NormalizedPoint, config: RenderConfig): HitTestResult {
    // 1. 先检测点（优先级最高，因为点很小需要精确点击）
    const pointResult = this.findPointUnderCursor(labels, mouse, config);
    if (pointResult) {
      return { labelIndex: pointResult.labelIndex, point: pointResult, hitType: 'point' };
    }

    // 2. 再检测标签区域
    const labelIndex = this.findLabelUnderCursor(labels, mouse);
    if (labelIndex !== null) {
      return { labelIndex, point: null, hitType: 'label' };
    }

    return { labelIndex: null, point: null, hitType: 'none' };
  }

  /**
   * 查找鼠标最近的点或标签（用于基于距离的悬停动画）
   * 优先检测点，再检测标签区域，返回最近的结果和距离
   */
  findNearest(
    labels: Label[], mouse: NormalizedPoint, config: RenderConfig,
  ): { labelIndex: number; distance: number } | null {
    const pointThreshold = config.closePointThreshold / this.transform.scale;
    const hoverThreshold = config.hoverProximityThreshold / this.transform.scale;
    let bestDist = Infinity;
    let bestIndex = -1;

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label.visible === false) continue;

      // 1. 检测该标签上的所有点
      let nearestPtDist = Infinity;
      if (label.isPose && label.keypoints) {
        const [numKeypoints, valuesPerPoint] = label.keypointShape || [label.keypoints.length / 3, 3];
        for (let k = 0; k < numKeypoints; k++) {
          const ki = k * valuesPerPoint;
          if ((label.keypoints[ki + 2] as number) === 0) continue;
          const d = this.transform.normalizedDistance(mouse.x, mouse.y, label.keypoints[ki], label.keypoints[ki + 1]);
          if (d < nearestPtDist) nearestPtDist = d;
        }
      } else if (label.isSegmentation && label.points) {
        for (let p = 0; p < label.points.length; p += 2) {
          const d = this.transform.normalizedDistance(mouse.x, mouse.y, label.points[p], label.points[p + 1]);
          if (d < nearestPtDist) nearestPtDist = d;
        }
      } else {
        const corners = this.getBoxCorners(label);
        for (const c of corners) {
          const d = this.transform.normalizedDistance(mouse.x, mouse.y, c.x, c.y);
          if (d < nearestPtDist) nearestPtDist = d;
        }
      }

      // 点在精确阈值内：直接命中（最高优先级）
      if (nearestPtDist < pointThreshold) {
        return { labelIndex: i, distance: nearestPtDist };
      }

      // 点在悬停范围内：作为候选
      if (nearestPtDist < hoverThreshold && nearestPtDist < bestDist) {
        bestDist = nearestPtDist;
        bestIndex = i;
      }

      // 2. 检测鼠标到标签边缘的距离
      let edgeDist: number;
      if (label.isSegmentation && label.points) {
        edgeDist = this.distanceToPolygonEdge(mouse, label.points);
      } else {
        edgeDist = this.distanceToBoxEdge(mouse, label);
      }

      if (edgeDist < hoverThreshold && edgeDist < bestDist) {
        bestDist = edgeDist;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      return { labelIndex: bestIndex, distance: bestDist };
    }
    return null;
  }

  /**
   * 计算点到多边形最近边的距离
   * 点在多边形内部时返回 0
   */
  private distanceToPolygonEdge(point: NormalizedPoint, polygon: number[]): number {
    if (this.isPointInPolygon(point, polygon)) return 0;

    let minDist = Infinity;
    const n = polygon.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const d = this.distanceToSegment(
        point,
        { x: polygon[j], y: polygon[j + 1] },
        { x: polygon[i], y: polygon[i + 1] },
      );
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  /**
   * 计算点到边界框边缘的距离
   * 点在框内部时返回 0
   */
  private distanceToBoxEdge(point: NormalizedPoint, label: Label): number {
    const halfW = label.width / 2;
    const halfH = label.height / 2;
    const dx = Math.max(Math.abs(point.x - label.x) - halfW, 0);
    const dy = Math.max(Math.abs(point.y - label.y) - halfH, 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 计算点到线段的最短距离
   */
  private distanceToSegment(
    point: NormalizedPoint, a: NormalizedPoint, b: NormalizedPoint,
  ): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return this.transform.normalizedDistance(point.x, point.y, a.x, a.y);
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return this.transform.normalizedDistance(point.x, point.y, a.x + t * dx, a.y + t * dy);
  }

  /**
   * 查找鼠标下的点（框角点、多边形顶点、关键点）
   */
  findPointUnderCursor(
    labels: Label[], mouse: NormalizedPoint, config: RenderConfig
  ): (PointRef & { distance: number }) | null {
    const threshold = config.closePointThreshold / this.transform.scale;
    let closest: (PointRef & { distance: number }) | null = null;

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label.visible === false) continue;

      if (label.isPose && label.keypoints) {
        // 姿态关键点
        const [numKeypoints, valuesPerPoint] = label.keypointShape || [label.keypoints.length / 3, 3];
        for (let k = 0; k < numKeypoints; k++) {
          const ki = k * valuesPerPoint;
          const vis = label.keypoints[ki + 2] as number;
          if (vis === 0) continue; // 不可见点跳过
          const kx = label.keypoints[ki];
          const ky = label.keypoints[ki + 1];
          const dist = this.transform.normalizedDistance(mouse.x, mouse.y, kx, ky);
          if (dist < threshold && (!closest || dist < closest.distance)) {
            closest = { labelIndex: i, pointType: 'keypoint', pointIndex: k, distance: dist };
          }
        }
      } else if (label.isSegmentation && label.points) {
        // 分割多边形顶点
        for (let p = 0; p < label.points.length; p += 2) {
          const px = label.points[p];
          const py = label.points[p + 1];
          const dist = this.transform.normalizedDistance(mouse.x, mouse.y, px, py);
          if (dist < threshold && (!closest || dist < closest.distance)) {
            closest = { labelIndex: i, pointType: 'polygon', pointIndex: p / 2, distance: dist };
          }
        }
      } else {
        // 框选四个角点
        const corners = this.getBoxCorners(label);
        for (let c = 0; c < corners.length; c++) {
          const dist = this.transform.normalizedDistance(mouse.x, mouse.y, corners[c].x, corners[c].y);
          if (dist < threshold && (!closest || dist < closest.distance)) {
            closest = { labelIndex: i, pointType: 'corner', pointIndex: c, distance: dist };
          }
        }
      }
    }

    return closest;
  }

  /**
   * 查找鼠标下的标签区域
   */
  findLabelUnderCursor(labels: Label[], mouse: NormalizedPoint): number | null {
    // 倒序遍历，后绘制的（顶层）优先
    for (let i = labels.length - 1; i >= 0; i--) {
      const label = labels[i];
      if (label.visible === false) continue;

      if (label.isSegmentation && label.points) {
        if (this.isPointInPolygon(mouse, label.points)) {
          return i;
        }
      } else {
        if (this.isPointInBox(mouse, label)) {
          return i;
        }
      }
    }
    return null;
  }

  /**
   * 判断点是否在边界框内
   */
  isPointInBox(point: NormalizedPoint, label: Label): boolean {
    const halfW = label.width / 2;
    const halfH = label.height / 2;
    return (
      point.x >= label.x - halfW &&
      point.x <= label.x + halfW &&
      point.y >= label.y - halfH &&
      point.y <= label.y + halfH
    );
  }

  /**
   * 判断点是否在多边形内（射线法）
   */
  isPointInPolygon(point: NormalizedPoint, polygon: number[]): boolean {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = polygon[i], yi = polygon[i + 1];
      const xj = polygon[j], yj = polygon[j + 1];
      if ((yi > point.y) !== (yj > point.y) &&
          point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * 获取边界框的四个角点（归一化坐标）
   * 返回顺序：左上、右上、右下、左下
   */
  getBoxCorners(label: Label): NormalizedPoint[] {
    const halfW = label.width / 2;
    const halfH = label.height / 2;
    return [
      { x: label.x - halfW, y: label.y - halfH }, // 左上
      { x: label.x + halfW, y: label.y - halfH }, // 右上
      { x: label.x + halfW, y: label.y + halfH }, // 右下
      { x: label.x - halfW, y: label.y + halfH }, // 左下
    ];
  }
}
