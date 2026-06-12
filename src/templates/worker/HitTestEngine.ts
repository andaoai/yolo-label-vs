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
