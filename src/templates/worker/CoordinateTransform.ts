/**
 * 坐标变换模块 — 纯数学，无副作用，可独立测试
 *
 * 三种坐标系：
 * 1. 归一化坐标 (0-1)：标签存储格式
 * 2. 图片像素坐标：归一化值 × 图片尺寸
 * 3. Canvas 像素坐标：图片像素 × scale + translate
 */
import type { NormalizedPoint, CanvasPoint } from '../shared/types';

export class CoordinateTransform {
  private _scale = 1;
  private _translateX = 0;
  private _translateY = 0;
  private _imageWidth = 1;
  private _imageHeight = 1;
  private _canvasWidth = 1;
  private _canvasHeight = 1;

  get scale(): number { return this._scale; }
  get translateX(): number { return this._translateX; }
  get translateY(): number { return this._translateY; }
  get imageWidth(): number { return this._imageWidth; }
  get imageHeight(): number { return this._imageHeight; }
  get canvasWidth(): number { return this._canvasWidth; }
  get canvasHeight(): number { return this._canvasHeight; }

  /** 更新视图变换 */
  setTransform(scale: number, translateX: number, translateY: number): void {
    this._scale = scale;
    this._translateX = translateX;
    this._translateY = translateY;
  }

  /** 更新图片尺寸 */
  setImageSize(width: number, height: number): void {
    this._imageWidth = width;
    this._imageHeight = height;
  }

  /** 更新画布尺寸 */
  setCanvasSize(width: number, height: number): void {
    this._canvasWidth = width;
    this._canvasHeight = height;
  }

  // ─── 归一化 → Canvas ─────────────────────────────────

  /** 归一化坐标 → Canvas 像素 */
  normalizedToCanvas(nx: number, ny: number): CanvasPoint {
    return {
      x: nx * this._imageWidth * this._scale + this._translateX,
      y: ny * this._imageHeight * this._scale + this._translateY,
    };
  }

  /** 归一化矩形 → Canvas 像素矩形 */
  normalizedRectToCanvas(
    cx: number, cy: number, w: number, h: number
  ): { x: number; y: number; w: number; h: number } {
    const pw = w * this._imageWidth * this._scale;
    const ph = h * this._imageHeight * this._scale;
    const px = cx * this._imageWidth * this._scale + this._translateX - pw / 2;
    const py = cy * this._imageHeight * this._scale + this._translateY - ph / 2;
    return { x: px, y: py, w: pw, h: ph };
  }

  // ─── Canvas → 归一化 ─────────────────────────────────

  /** Canvas 像素 → 归一化坐标 */
  canvasToNormalized(cx: number, cy: number): NormalizedPoint {
    return {
      x: (cx - this._translateX) / (this._imageWidth * this._scale),
      y: (cy - this._translateY) / (this._imageHeight * this._scale),
    };
  }

  // ─── 归一化距离 ───────────────────────────────────────

  /** 两点间归一化欧氏距离 */
  normalizedDistance(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 缩放后的阈值（屏幕像素距离 → 归一化距离） */
  scaledThreshold(baseThreshold: number): number {
    return baseThreshold / this._scale;
  }

  // ─── 缩放计算 ────────────────────────────────────────

  /** 计算适应画布的初始缩放和居中偏移 */
  computeFitTransform(): { scale: number; translateX: number; translateY: number } {
    const scaleX = this._canvasWidth / this._imageWidth;
    const scaleY = this._canvasHeight / this._imageHeight;
    const scale = Math.min(scaleX, scaleY, 1); // 不超过原始尺寸
    const translateX = (this._canvasWidth - this._imageWidth * scale) / 2;
    const translateY = (this._canvasHeight - this._imageHeight * scale) / 2;
    return { scale, translateX, translateY };
  }

  /** 缩放到指定点（返回新的 scale 和 translate） */
  zoomAtPoint(
    canvasX: number, canvasY: number,
    currentScale: number, delta: number,
    minZoom: number, maxZoom: number
  ): { scale: number; translateX: number; translateY: number } {
    const newScale = Math.min(Math.max(currentScale + delta, minZoom), maxZoom);
    const ratio = newScale / currentScale;
    const newTranslateX = canvasX - (canvasX - this._translateX) * ratio;
    const newTranslateY = canvasY - (canvasY - this._translateY) * ratio;
    return { scale: newScale, translateX: newTranslateX, translateY: newTranslateY };
  }
}
