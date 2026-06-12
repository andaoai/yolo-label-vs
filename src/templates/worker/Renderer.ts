/**
 * Canvas 渲染器 — 负责所有绘制操作
 *
 * 绘制流程：
 * 1. 清除画布 + 填充背景
 * 2. 应用视图变换 (translate + scale)
 * 3. 绘制图片
 * 4. 绘制标签
 * 5. 绘制预览（工具绘制中）
 * 6. 恢复变换
 * 7. 绘制十字准线（屏幕坐标）
 */
import type { Label, DrawPreview, PointRef } from '../shared/types';
import type { RenderConfig } from '../shared/messages';
import { CoordinateTransform } from './CoordinateTransform';
import { AnimationController } from './AnimationController';
import { HIGHLIGHT_DASH_PATTERN } from '../shared/config';

// OffscreenCanvasRenderingContext2D 在 Worker 中可用，包含所有 2D 绘图方法
type RenderContext = OffscreenCanvasRenderingContext2D;

export class Renderer {
  private ctx: RenderContext | null = null;
  private canvas: OffscreenCanvas | null = null;

  constructor(
    private transform: CoordinateTransform,
    private animation: AnimationController,
  ) {}

  /** 绑定画布 */
  bind(canvas: OffscreenCanvas): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** 调整画布尺寸 */
  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /**
   * 主渲染入口
   */
  render(
    image: ImageBitmap | null,
    labels: Label[],
    config: RenderConfig,
    cursor: { x: number; y: number } | null,
    hoveredLabelIndex: number | null,
    selectedPoint: PointRef | null,
    preview: DrawPreview | null,
    showLabels: boolean,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;

    const cw = this.canvas.width / (this.canvas.width / this.transform.canvasWidth);
    const ch = this.canvas.height / (this.canvas.height / this.transform.canvasHeight);

    // 1. 清除 + 背景
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, cw, ch);

    if (!image) return;

    // 2. 应用视图变换
    ctx.save();
    ctx.translate(this.transform.translateX, this.transform.translateY);
    ctx.scale(this.transform.scale, this.transform.scale);

    // 3. 绘制图片
    ctx.drawImage(image, 0, 0);

    // 4. 绘制标签
    this.drawLabels(ctx, labels, hoveredLabelIndex, selectedPoint, config, showLabels);

    // 5. 绘制预览
    if (preview) {
      this.drawPreview(ctx, preview, config);
    }

    // 恢复变换
    ctx.restore();

    // 6. 十字准线（屏幕坐标）
    if (cursor) {
      this.drawCrosshairs(ctx, cursor, config, cw, ch);
    }
  }

  // ─── 标签绘制 ─────────────────────────────────────────

  private drawLabels(
    ctx: RenderContext,
    labels: Label[],
    hoveredIndex: number | null,
    selectedPoint: PointRef | null,
    config: RenderConfig,
    showLabels: boolean,
  ): void {
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label.visible === false) continue;

      const color = config.colors[label.class % config.colors.length];
      const highlighted = i === hoveredIndex;

      if (label.isSegmentation && label.points) {
        this.drawSegmentation(ctx, label, color, highlighted, config, showLabels);
      } else if (label.isPose) {
        this.drawPose(ctx, label, color, highlighted, config, showLabels);
      } else {
        this.drawBox(ctx, label, color, highlighted, config, showLabels);
      }
    }
  }

  // ─── 框选标签 ─────────────────────────────────────────

  private drawBox(
    ctx: RenderContext, label: Label, color: string,
    highlighted: boolean, config: RenderConfig, showLabels: boolean,
  ): void {
    const { x, y, w, h } = this.transform.normalizedRectToCanvas(
      label.x, label.y, label.width, label.height
    );
    // 转回图片像素空间（因为已经在 transform 内）
    const ix = (x - this.transform.translateX) / this.transform.scale;
    const iy = (y - this.transform.translateY) / this.transform.scale;
    const iw = w / this.transform.scale;
    const ih = h / this.transform.scale;

    ctx.strokeStyle = color;
    ctx.lineWidth = (highlighted ? 3 : config.lineWidth) / this.transform.scale;

    if (highlighted) {
      ctx.setLineDash(HIGHLIGHT_DASH_PATTERN.map(d => d / this.transform.scale));
      ctx.lineDashOffset = this.animation.getDashOffset() / this.transform.scale;
    } else {
      ctx.setLineDash([]);
    }

    ctx.strokeRect(ix, iy, iw, ih);
    ctx.setLineDash([]);

    // 角点
    this.drawBoxPoints(ctx, label, config);

    // 标签文字
    if (showLabels) {
      const className = config.classNames?.[label.class] || String(label.class);
      this.drawLabelText(ctx, ix, iy - 4 / this.transform.scale, `${className} (BOX)`, color, config);
    }
  }

  // ─── 分割标签 ─────────────────────────────────────────

  private drawSegmentation(
    ctx: RenderContext, label: Label, color: string,
    highlighted: boolean, config: RenderConfig, showLabels: boolean,
  ): void {
    const points = label.points!;
    if (points.length < 6) return;

    const s = this.transform.scale;

    // 填充
    ctx.beginPath();
    ctx.moveTo(points[0] * this.transform.imageWidth, points[1] * this.transform.imageHeight);
    for (let i = 2; i < points.length; i += 2) {
      ctx.lineTo(points[i] * this.transform.imageWidth, points[i + 1] * this.transform.imageHeight);
    }
    ctx.closePath();
    ctx.fillStyle = `${color}33`; // 20% 透明度
    ctx.fill();

    // 边框
    ctx.strokeStyle = color;
    ctx.lineWidth = (highlighted ? 3 : config.lineWidth) / s;
    if (highlighted) {
      ctx.setLineDash(HIGHLIGHT_DASH_PATTERN.map(d => d / s));
      ctx.lineDashOffset = this.animation.getDashOffset() / s;
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 顶点
    this.drawPolygonPoints(ctx, points, config);

    // 标签文字
    if (showLabels && points.length >= 2) {
      const className = config.classNames?.[label.class] || String(label.class);
      this.drawLabelText(
        ctx,
        points[0] * this.transform.imageWidth,
        points[1] * this.transform.imageHeight - 4 / s,
        `${className} (SEG)`, color, config
      );
    }
  }

  // ─── 姿态标签 ─────────────────────────────────────────

  private drawPose(
    ctx: RenderContext, label: Label, color: string,
    highlighted: boolean, config: RenderConfig, showLabels: boolean,
  ): void {
    const s = this.transform.scale;

    // 绘制边界框
    const ix = (label.x - label.width / 2) * this.transform.imageWidth;
    const iy = (label.y - label.height / 2) * this.transform.imageHeight;
    const iw = label.width * this.transform.imageWidth;
    const ih = label.height * this.transform.imageHeight;

    ctx.strokeStyle = color;
    ctx.lineWidth = (highlighted ? 3 : config.lineWidth) / s;
    if (highlighted) {
      ctx.setLineDash(HIGHLIGHT_DASH_PATTERN.map(d => d / s));
      ctx.lineDashOffset = this.animation.getDashOffset() / s;
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeRect(ix, iy, iw, ih);
    ctx.setLineDash([]);

    // 关键点
    if (label.keypoints) {
      const [numKeypoints, valuesPerPoint] = label.keypointShape || [label.keypoints.length / 3, 3];
      for (let k = 0; k < numKeypoints; k++) {
        const ki = k * valuesPerPoint;
        const vis = label.keypoints[ki + 2] as number;
        if (vis === 0) continue;

        const kx = label.keypoints[ki] * this.transform.imageWidth;
        const ky = label.keypoints[ki + 1] * this.transform.imageHeight;
        const radius = config.pointRadius / s;
        const pulseScale = this.animation.getPulseScale();

        ctx.beginPath();
        ctx.arc(kx, ky, radius * pulseScale, 0, Math.PI * 2);

        if (vis === 2) {
          // 遮挡：半透明
          ctx.fillStyle = `${color}b3`; // 70%
        } else {
          ctx.fillStyle = color;
        }
        ctx.fill();

        // 白色边框
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / s;
        ctx.stroke();
      }
    }

    // 标签文字
    if (showLabels) {
      const className = config.classNames?.[label.class] || String(label.class);
      this.drawLabelText(ctx, ix, iy - 4 / s, `${className} (POSE)`, color, config);
    }
  }

  // ─── 点绘制 ───────────────────────────────────────────

  private drawBoxPoints(ctx: RenderContext, label: Label, config: RenderConfig): void {
    const s = this.transform.scale;
    const radius = config.pointRadius / s;
    const pulseScale = this.animation.getPulseScale();
    const corners = [
      { x: (label.x - label.width / 2) * this.transform.imageWidth, y: (label.y - label.height / 2) * this.transform.imageHeight },
      { x: (label.x + label.width / 2) * this.transform.imageWidth, y: (label.y - label.height / 2) * this.transform.imageHeight },
      { x: (label.x + label.width / 2) * this.transform.imageWidth, y: (label.y + label.height / 2) * this.transform.imageHeight },
      { x: (label.x - label.width / 2) * this.transform.imageWidth, y: (label.y + label.height / 2) * this.transform.imageHeight },
    ];

    for (const corner of corners) {
      this.drawPoint(ctx, corner.x, corner.y, radius * pulseScale, config.colors[label.class % config.colors.length], s);
    }
  }

  private drawPolygonPoints(ctx: RenderContext, points: number[], config: RenderConfig): void {
    const s = this.transform.scale;
    const radius = config.pointRadius / s;
    const pulseScale = this.animation.getPulseScale();

    for (let i = 0; i < points.length; i += 2) {
      const px = points[i] * this.transform.imageWidth;
      const py = points[i + 1] * this.transform.imageHeight;

      if (i === 0) {
        // 第一个点：高亮环
        ctx.beginPath();
        ctx.arc(px, py, config.highlightRadius / s, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / s;
        ctx.stroke();
      }

      this.drawPoint(ctx, px, py, radius * pulseScale, '#4cd964', s);
    }
  }

  private drawPoint(
    ctx: RenderContext, x: number, y: number,
    radius: number, color: string, scale: number,
  ): void {
    // 白色外圈
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5 / scale, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 彩色内圈
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ─── 预览绘制 ─────────────────────────────────────────

  private drawPreview(ctx: RenderContext, preview: DrawPreview, config: RenderConfig): void {
    const color = config.colors[0]; // 使用当前类颜色
    const s = this.transform.scale;
    const iw = this.transform.imageWidth;
    const ih = this.transform.imageHeight;

    switch (preview.tool) {
      case 'box': {
        const x = Math.min(preview.startX, preview.endX) * iw;
        const y = Math.min(preview.startY, preview.endY) * ih;
        const w = Math.abs(preview.endX - preview.startX) * iw;
        const h = Math.abs(preview.endY - preview.startY) * ih;
        ctx.strokeStyle = color;
        ctx.lineWidth = config.lineWidth / s;
        ctx.setLineDash([6 / s, 4 / s]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        break;
      }
      case 'seg': {
        if (preview.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(preview.points[0] * iw, preview.points[1] * ih);
        for (let i = 2; i < preview.points.length; i += 2) {
          ctx.lineTo(preview.points[i] * iw, preview.points[i + 1] * ih);
        }
        // 预览线到鼠标
        ctx.lineTo(preview.mouseX * iw, preview.mouseY * ih);
        ctx.strokeStyle = color;
        ctx.lineWidth = config.lineWidth / s;
        ctx.stroke();

        // 闭合指示
        if (preview.nearFirst && preview.points.length >= 6) {
          ctx.beginPath();
          ctx.arc(preview.points[0] * iw, preview.points[1] * ih, config.closeHighlightRadius / s, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / s;
          ctx.stroke();
        }
        break;
      }
      case 'pose': {
        if (preview.step === 'box') {
          const x = Math.min(preview.startX, preview.endX) * iw;
          const y = Math.min(preview.startY, preview.endY) * ih;
          const w = Math.abs(preview.endX - preview.startX) * iw;
          const h = Math.abs(preview.endY - preview.startY) * ih;
          ctx.strokeStyle = color;
          ctx.lineWidth = config.lineWidth / s;
          ctx.setLineDash([6 / s, 4 / s]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        } else {
          // 关键点阶段：绘制已有框
          const label = preview.label;
          const ix = (label.x - label.width / 2) * iw;
          const iy = (label.y - label.height / 2) * ih;
          const iw2 = label.width * iw;
          const ih2 = label.height * ih;
          ctx.strokeStyle = color;
          ctx.lineWidth = config.lineWidth / s;
          ctx.setLineDash([6 / s, 4 / s]);
          ctx.strokeRect(ix, iy, iw2, ih2);
          ctx.setLineDash([]);

          // 已放置的关键点
          if (label.keypoints) {
            const [, vpp] = label.keypointShape || [label.keypoints.length / 3, 3];
            for (let k = 0; k < preview.currentStep; k++) {
              const ki = k * vpp;
              const vis = label.keypoints[ki + 2] as number;
              if (vis === 0) continue;
              const kx = label.keypoints[ki] * iw;
              const ky = label.keypoints[ki + 1] * ih;
              ctx.beginPath();
              ctx.arc(kx, ky, config.pointRadius / s, 0, Math.PI * 2);
              ctx.fillStyle = vis === 2 ? `${color}b3` : color;
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5 / s;
              ctx.stroke();
            }
          }

          // 鼠标位置预览
          ctx.beginPath();
          ctx.arc(preview.mouseX * iw, preview.mouseY * ih, config.pointRadius / s, 0, Math.PI * 2);
          ctx.fillStyle = `${color}80`;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 / s;
          ctx.stroke();

          // 步骤指示文字
          this.drawStepIndicator(ctx, `Point ${preview.currentStep + 1}/${preview.totalSteps}`, s);
        }
        break;
      }
    }
  }

  private drawStepIndicator(ctx: RenderContext, text: string, scale: number): void {
    const fontSize = 14 / scale;
    ctx.font = `${fontSize}px sans-serif`;
    const metrics = ctx.measureText(text);
    const padding = 8 / scale;
    const height = fontSize + padding * 2;

    const x = 10 / scale;
    const y = 10 / scale;

    ctx.fillStyle = '#4285f4';
    ctx.fillRect(x, y, metrics.width + padding * 2, height);

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + padding, y + padding);
  }

  // ─── 十字准线 ─────────────────────────────────────────

  private drawCrosshairs(
    ctx: RenderContext,
    cursor: { x: number; y: number },
    config: RenderConfig,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    // cursor 是归一化坐标，转换为 canvas 像素
    const cx = cursor.x * this.transform.imageWidth * this.transform.scale + this.transform.translateX;
    const cy = cursor.y * this.transform.imageHeight * this.transform.scale + this.transform.translateY;

    ctx.save();
    ctx.strokeStyle = config.crosshairColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);

    // 水平线
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(canvasWidth, cy);
    ctx.stroke();

    // 垂直线
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, canvasHeight);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  // ─── 文字绘制 ─────────────────────────────────────────

  private drawLabelText(
    ctx: RenderContext,
    x: number, y: number,
    text: string, color: string,
    config: RenderConfig,
  ): void {
    const s = this.transform.scale;
    const fontSize = config.labelFontSize / s;
    const padding = config.labelPadding / s;

    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    // 背景
    ctx.fillStyle = color;
    ctx.fillRect(x, y - textHeight - padding, textWidth + padding * 2, textHeight + padding * 2);

    // 文字
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, x + padding, y - padding);
  }
}
