/**
 * 坐标变换模块 — 纯数学，无副作用，可独立测试
 *
 * 三种坐标系：
 * 1. 归一化坐标 (0-1)：标签存储格式
 * 2. 图片像素坐标：归一化值 × 图片尺寸
 * 3. Canvas 像素坐标：图片像素 × scale + translate
 */

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

  /** 两点间归一化欧氏距离 */
  normalizedDistance(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 计算适应画布的初始缩放和居中偏移 */
  computeFitTransform(): { scale: number; translateX: number; translateY: number } {
    const scaleX = this._canvasWidth / this._imageWidth;
    const scaleY = this._canvasHeight / this._imageHeight;
    const scale = Math.min(scaleX, scaleY, 1); // 不超过原始尺寸
    const translateX = (this._canvasWidth - this._imageWidth * scale) / 2;
    const translateY = (this._canvasHeight - this._imageHeight * scale) / 2;
    return { scale, translateX, translateY };
  }
}
