/**
 * 模型面板 — 侧边栏第三个折叠区域
 *
 * 风格与 Class、Labels 区域保持一致
 */
import type { Store } from '../state/Store';
import { basename, truncate } from '../../../utils/pathUtils';
import { toggleCollapsibleSection } from './collapsible';

export class ModelPanel {
  private sectionEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private toggleEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private collapsed = false;

  private modelInfoEl: HTMLElement | null = null;
  private loadBtn: HTMLButtonElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private previewActionsEl: HTMLElement | null = null;

  constructor(
    private store: Store,
    private callbacks: {
      onLoadModel: () => void;
      onRunInference: () => void;
      onAcceptDetections: () => void;
      onRejectDetections: () => void;
      onConfThresholdChange: (value: number) => void;
      onIouThresholdChange: (value: number) => void;
    },
  ) {}

  init(): void {
    this.sectionEl = document.getElementById('modelSection');
    this.headerEl = document.getElementById('modelHeader');
    this.bodyEl = document.getElementById('modelBody');
    this.toggleEl = this.headerEl?.querySelector('.section-toggle') ?? null;
    this.badgeEl = document.getElementById('modelBadge');

    if (!this.bodyEl) return;

    this.renderBody();

    this.headerEl?.addEventListener('click', () => this.toggleSection());

    this.store.on('modelLoaded', () => this.updateModelStatus());
    this.store.on('modelPath', () => this.updateModelStatus());
    this.store.on('inferenceRunning', () => this.updateRunningState());
    this.store.on('previewDetections', () => this.updatePreviewActions());
    this.store.on('showPreview', () => this.updatePreviewActions());

    this.updateModelStatus();
    this.updateRunningState();
    this.updatePreviewActions();
  }

  private renderBody(): void {
    if (!this.bodyEl) return;
    this.bodyEl.innerHTML = '';

    // ── 模型行：状态 + 加载按钮 ──
    const modelRow = document.createElement('div');
    modelRow.className = 'model-row';

    this.modelInfoEl = document.createElement('span');
    this.modelInfoEl.className = 'model-info';
    this.modelInfoEl.textContent = 'No model loaded';

    this.loadBtn = document.createElement('button');
    this.loadBtn.className = 'model-btn';
    this.loadBtn.textContent = 'Load';
    this.loadBtn.title = 'Select .onnx model file';
    this.loadBtn.addEventListener('click', () => this.callbacks.onLoadModel());

    modelRow.append(this.modelInfoEl, this.loadBtn);
    this.bodyEl.appendChild(modelRow);

    // ── 参数区 ──
    const paramsGroup = document.createElement('div');
    paramsGroup.className = 'model-params';

    const confRow = this.createSliderRow('Conf', 'conf', 0.05, 0.95, 0.05,
      this.store.get('confThreshold'),
      (v) => { this.store.set('confThreshold', v); this.callbacks.onConfThresholdChange(v); },
    );
    paramsGroup.appendChild(confRow);

    const iouRow = this.createSliderRow('IoU', 'iou', 0.1, 0.9, 0.05,
      this.store.get('iouThreshold'),
      (v) => { this.store.set('iouThreshold', v); this.callbacks.onIouThresholdChange(v); },
    );
    paramsGroup.appendChild(iouRow);

    this.bodyEl.appendChild(paramsGroup);

    // ── 推理按钮 ──
    this.runBtn = document.createElement('button');
    this.runBtn.className = 'model-run-btn';
    this.runBtn.textContent = 'Run Inference';
    this.runBtn.title = 'Detect objects in current image';
    this.runBtn.disabled = true;
    this.runBtn.addEventListener('click', () => this.callbacks.onRunInference());
    this.bodyEl.appendChild(this.runBtn);

    // ── 状态文本 ──
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'model-status';
    this.bodyEl.appendChild(this.statusEl);

    // ── 预览确认区 ──
    this.previewActionsEl = document.createElement('div');
    this.previewActionsEl.className = 'model-preview-actions';
    this.previewActionsEl.style.display = 'none';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'model-accept-btn';
    acceptBtn.textContent = 'Accept';
    acceptBtn.title = 'Add detections as labels';
    acceptBtn.addEventListener('click', () => this.callbacks.onAcceptDetections());

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'model-reject-btn';
    rejectBtn.textContent = 'Reject';
    rejectBtn.title = 'Discard detections';
    rejectBtn.addEventListener('click', () => this.callbacks.onRejectDetections());

    this.previewActionsEl.append(acceptBtn, rejectBtn);
    this.bodyEl.appendChild(this.previewActionsEl);
  }

  private createSliderRow(
    label: string, id: string,
    min: number, max: number, step: number, value: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'model-slider-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.htmlFor = `model-${id}`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `model-${id}`;
    slider.className = 'model-slider';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);

    const valueEl = document.createElement('span');
    valueEl.className = 'model-slider-value';
    valueEl.textContent = value.toFixed(2);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valueEl.textContent = v.toFixed(2);
      onChange(v);
    });

    row.append(labelEl, slider, valueEl);
    return row;
  }

  // ─── 状态更新 ────────────────────────────────────────

  private toggleSection(): void {
    this.collapsed = toggleCollapsibleSection(
      this.collapsed,
      this.bodyEl,
      this.toggleEl,
    );
  }

  private updateModelStatus(): void {
    const loaded = this.store.get('modelLoaded');
    const modelPath = this.store.get('modelPath');

    if (this.modelInfoEl) {
      if (loaded && modelPath) {
        const name = basename(modelPath);
        this.modelInfoEl.textContent = truncate(name, 18);
        this.modelInfoEl.title = modelPath;
      } else {
        this.modelInfoEl.textContent = 'No model loaded';
        this.modelInfoEl.title = '';
      }
    }

    if (this.badgeEl) this.badgeEl.textContent = loaded ? 'ON' : '-';
    if (this.runBtn) this.runBtn.disabled = !loaded;
    if (this.loadBtn) this.loadBtn.textContent = loaded ? 'Change' : 'Load';
  }

  private updateRunningState(): void {
    const running = this.store.get('inferenceRunning');
    if (this.runBtn) {
      this.runBtn.disabled = running || !this.store.get('modelLoaded');
      this.runBtn.textContent = running ? 'Running...' : 'Run Inference';
    }
    if (this.statusEl) this.statusEl.textContent = running ? 'Inference in progress...' : '';
  }

  private updatePreviewActions(): void {
    const detections = this.store.get('previewDetections');
    const hasDetections = detections.length > 0;

    if (this.previewActionsEl) {
      this.previewActionsEl.style.display = hasDetections ? 'flex' : 'none';
    }

    if (this.statusEl && !this.store.get('inferenceRunning')) {
      if (hasDetections) {
        this.statusEl.textContent = `${detections.length} objects detected`;
      } else if (this.store.get('modelLoaded')) {
        this.statusEl.textContent = '';
      }
    }
  }

  setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }
}
