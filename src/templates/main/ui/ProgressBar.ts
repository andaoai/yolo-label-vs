/**
 * 进度条 — 图片导航、缩略图预览
 */
import type { Store } from '../state/Store';

export class ProgressBar {
  private container: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private preview: HTMLElement | null = null;
  private previewImg: HTMLImageElement | null = null;
  private previewText: HTMLElement | null = null;

  constructor(
    private store: Store,
    private callbacks: {
      onLoadImage: (path: string) => void;
    },
  ) {}

  init(): void {
    this.container = document.querySelector('.progress-container') as HTMLElement;
    this.bar = document.getElementById('imageProgressBar') as HTMLElement;
    this.preview = document.getElementById('progressPreview') as HTMLElement;
    this.previewImg = document.getElementById('progressPreviewImg') as HTMLImageElement;
    this.previewText = document.getElementById('progressPreviewText') as HTMLElement;

    if (!this.container) return;

    this.container.addEventListener('mousemove', (e) => this.onHover(e));
    this.container.addEventListener('click', (e) => this.onClick(e));
    this.container.addEventListener('mouseleave', () => this.hidePreview());
    this.container.addEventListener('mouseenter', () => this.showPreview());

    this.store.on('currentPath', () => this.update());
    this.store.on('allPaths', () => this.update());
  }

  private update(): void {
    const paths = this.store.get('allPaths');
    const currentPath = this.store.get('currentPath');
    const index = paths.indexOf(currentPath);

    if (this.bar) {
      const percent = paths.length > 0 ? ((index + 1) / paths.length) * 100 : 0;
      this.bar.style.width = `${percent}%`;
    }
  }

  private onHover(e: MouseEvent): void {
    const paths = this.store.get('allPaths');
    if (paths.length === 0 || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const index = Math.min(Math.floor(ratio * paths.length), paths.length - 1);

    if (this.bar) {
      this.bar.style.width = `${((index + 1) / paths.length) * 100}%`;
    }

    if (this.preview) {
      this.preview.style.left = `${e.clientX - rect.left}px`;
    }

    if (this.previewText) {
      this.previewText.textContent = `Image ${index + 1} of ${paths.length}`;
    }

    if (this.previewImg) {
      const previews = this.store.get('imagePreviews');
      if (previews[index]) {
        this.previewImg.src = previews[index];
        this.previewImg.style.display = 'block';
      } else {
        this.previewImg.style.display = 'none';
      }
    }
  }

  private onClick(e: MouseEvent): void {
    const paths = this.store.get('allPaths');
    if (paths.length === 0 || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const index = Math.min(Math.floor(ratio * paths.length), paths.length - 1);

    this.callbacks.onLoadImage(paths[index]);
  }

  private showPreview(): void {
    if (this.preview) this.preview.style.display = 'block';
  }

  private hidePreview(): void {
    if (this.preview) this.preview.style.display = 'none';
    this.update();
  }
}
