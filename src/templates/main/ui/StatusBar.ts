/**
 * 状态栏 — 坐标、缩放、尺寸、标签数
 */
import type { Store } from '../state/Store';

export class StatusBar {
  constructor(private store: Store) {}

  init(): void {
    this.store.on('cursor', () => this.updateCoordinates());
    this.store.on('scale', () => this.updateZoom());
    this.store.on('imageWidth', () => this.updateDimensions());
    this.store.on('imageHeight', () => this.updateDimensions());
    this.store.on('labels', () => this.updateLabelsCount());
    this.store.on('imageInfo', () => this.updateImageInfo());
  }

  private updateCoordinates(): void {
    const el = document.getElementById('coordinates');
    if (!el) return;

    const cursor = this.store.get('cursor');
    const imgW = this.store.get('imageWidth');
    const imgH = this.store.get('imageHeight');

    if (imgW === 0 || imgH === 0) {
      el.textContent = 'Position: -';
      return;
    }

    const pxX = Math.round(cursor.x * imgW);
    const pxY = Math.round(cursor.y * imgH);
    el.textContent = `Position: ${cursor.x.toFixed(4)}, ${cursor.y.toFixed(4)} (${pxX}px, ${pxY}px)`;
  }

  private updateZoom(): void {
    const el = document.getElementById('zoom-info');
    if (el) {
      el.textContent = `Zoom: ${Math.round(this.store.get('scale') * 100)}%`;
    }
  }

  private updateDimensions(): void {
    const el = document.getElementById('image-dimension');
    if (el) {
      const w = this.store.get('imageWidth');
      const h = this.store.get('imageHeight');
      el.textContent = w && h ? `Size: ${w} × ${h}` : 'Size: -';
    }
  }

  private updateLabelsCount(): void {
    const el = document.getElementById('labels-count');
    if (el) {
      el.textContent = `Labels: ${this.store.get('labels').length}`;
    }
  }

  private updateImageInfo(): void {
    const el = document.getElementById('imageInfo');
    if (el) {
      el.textContent = this.store.get('imageInfo') || 'No image loaded';
    }
  }
}
