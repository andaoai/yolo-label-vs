/**
 * 标注画布：图片适配显示 + box 绘制/选中/悬停（主线程 Canvas 2D）。
 * 坐标全部以 YOLO 归一化坐标（0-1）为业务单位，屏幕坐标在内部换算。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Label } from './api';

interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface Drag {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelingCanvasProps {
  image: ImageBitmap;
  labels: Label[];
  classNames: string[];
  selected: number | null;
  currentClass: number;
  onSelect: (index: number | null) => void;
  onAddBox: (label: Label) => void;
}

/** 类别调色板（HSL 均匀分布）。 */
export function classColor(index: number): string {
  return `hsl(${(index * 47) % 360} 70% 55%)`;
}

export function LabelingCanvas({
  image,
  labels,
  classNames,
  selected,
  currentClass,
  onSelect,
  onAddBox,
}: LabelingCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [cssSize, setCssSize] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // 容器尺寸监听
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const rect = wrap.getBoundingClientRect();
      setCssSize({ w: Math.max(50, rect.width), h: Math.max(50, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // 计算 fit 变换
  useEffect(() => {
    const scale = Math.min(cssSize.w / image.width, cssSize.h / image.height);
    setView({
      scale,
      offsetX: (cssSize.w - image.width * scale) / 2,
      offsetY: (cssSize.h - image.height * scale) / 2,
    });
  }, [image, cssSize]);

  const toNorm = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const ix = (sx - view.offsetX) / view.scale;
      const iy = (sy - view.offsetY) / view.scale;
      return {
        x: Math.min(1, Math.max(0, ix / image.width)),
        y: Math.min(1, Math.max(0, iy / image.height)),
      };
    },
    [view, image],
  );

  const hitTest = useCallback(
    (nx: number, ny: number): number | null => {
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i];
        if (l.visible === false) continue;
        if (
          nx >= l.x - l.width / 2 &&
          nx <= l.x + l.width / 2 &&
          ny >= l.y - l.height / 2 &&
          ny <= l.y + l.height / 2
        ) {
          return i;
        }
      }
      return null;
    },
    [labels],
  );

  // 绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssSize.w * dpr);
    canvas.height = Math.round(cssSize.h * dpr);
    canvas.style.width = `${cssSize.w}px`;
    canvas.style.height = `${cssSize.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize.w, cssSize.h);

    // 图片
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      image,
      view.offsetX,
      view.offsetY,
      image.width * view.scale,
      image.height * view.scale,
    );

    const toScreenX = (nx: number) => view.offsetX + nx * image.width * view.scale;
    const toScreenY = (ny: number) => view.offsetY + ny * image.height * view.scale;

    // 标签框
    labels.forEach((label, i) => {
      if (label.visible === false) return;
      const x = toScreenX(label.x - label.width / 2);
      const y = toScreenY(label.y - label.height / 2);
      const w = label.width * image.width * view.scale;
      const h = label.height * image.height * view.scale;
      const color = classColor(label.class);
      const isActive = i === selected || i === hover;

      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);

      if (isActive) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, y, w, h);
      }

      // 分割多边形
      if (label.isSegmentation && label.points && label.points.length >= 6) {
        ctx.beginPath();
        for (let p = 0; p < label.points.length; p += 2) {
          const px = toScreenX(label.points[p]);
          const py = toScreenY(label.points[p + 1]);
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      }

      // 标签文字
      const name = classNames[label.class] ?? `class ${label.class}`;
      ctx.font = '12px sans-serif';
      const text = name;
      const metrics = ctx.measureText(text);
      const tagH = 16;
      const tagW = metrics.width + 10;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - tagH), tagW, tagH);
      ctx.fillStyle = '#111';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 5, Math.max(tagH / 2, y - tagH / 2));
    });

    // 拖拽预览
    if (drag) {
      const x0 = toScreenX(Math.min(drag.x0, drag.x1));
      const y0 = toScreenY(Math.min(drag.y0, drag.y1));
      const x1 = toScreenX(Math.max(drag.x0, drag.x1));
      const y1 = toScreenY(Math.max(drag.y0, drag.y1));
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = classColor(currentClass);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }
  }, [image, labels, classNames, selected, hover, drag, view, cssSize, currentClass]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const n = toNorm(e.clientX, e.clientY);
    const hit = hitTest(n.x, n.y);
    if (hit !== null) {
      onSelect(hit);
      return;
    }
    onSelect(null);
    setDrag({ x0: n.x, y0: n.y, x1: n.x, y1: n.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const n = toNorm(e.clientX, e.clientY);
    if (drag) {
      setDrag({ ...drag, x1: n.x, y1: n.y });
      return;
    }
    setHover(hitTest(n.x, n.y));
  };

  const onPointerUp = () => {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    if (w < 0.005 || h < 0.005) return;
    onAddBox({
      class: currentClass,
      x: x + w / 2,
      y: y + h / 2,
      width: w,
      height: h,
      visible: true,
    });
  };

  return (
    <div ref={wrapRef} className="yl-canvas-wrap">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
