/**
 * conversation.view 标签页内容：标注工作台。
 * 与 VS Code 扩展一致的布局方向：顶部工具条 + 左侧（类别/图片）+ 中央画布 + 状态栏，
 * 填满会话中心列，不是弹窗。
 *
 * 状态保存在模块级 store：壳子只渲染活动视图（切到 Chat 会卸载本组件），
 * 提升到外部 store 后切走再回来标注状态不丢。
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  openDataset as apiOpenDataset,
  scanDatasets,
  fetchLabels,
  saveLabels as apiSaveLabels,
  loadImageBitmap,
  type Label,
  type DatasetSummary,
  type OpenDataset,
} from './api';
import { classColor, LabelingCanvas } from './LabelingCanvas';

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

// ─── 模块级持久状态（跨标签页切换保留） ─────────────────────────

interface WbState {
  // 选择页
  yamlInput: string;
  scanRoot: string;
  datasets: DatasetSummary[] | null;
  busy: boolean;
  error: string | null;
  // 标注状态
  dataset: OpenDataset | null;
  index: number;
  image: ImageBitmap | null;
  labels: Label[];
  currentClass: number;
  selected: number | null;
  dirty: boolean;
  dirtySet: number[];
  saving: boolean;
}

const initialState: WbState = {
  yamlInput: '',
  scanRoot: '',
  datasets: null,
  busy: false,
  error: null,
  dataset: null,
  index: 0,
  image: null,
  labels: [],
  currentClass: 0,
  selected: null,
  dirty: false,
  dirtySet: [],
  saving: false,
};

let state: WbState = { ...initialState };
const listeners = new Set<() => void>();

function setState(patch: Partial<WbState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function WorkbenchView() {
  const s = useSyncExternalStore(subscribe, () => state);
  const rootRef = useRef<HTMLDivElement>(null);
  // 右侧侧边栏面板宽度有限（280–640px）：窄容器切换为紧凑布局
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w > 0 && w < 720);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadIndex = useCallback(async (ds: OpenDataset, i: number) => {
    setState({ busy: true, error: null });
    try {
      const imagePath = ds.images[i];
      const [bmp, lbls] = await Promise.all([
        loadImageBitmap(imagePath),
        fetchLabels(ds.yamlPath, imagePath),
      ]);
      setState({ image: bmp, labels: lbls, selected: null, dirty: false, index: i, busy: false });
    } catch (e) {
      setState({
        error: e instanceof Error ? e.message : String(e),
        image: null,
        busy: false,
      });
    }
  }, []);

  const handleOpen = useCallback(
    async (yamlPath: string, workspaceRoot?: string) => {
      setState({ busy: true, error: null });
      try {
        const ds = await apiOpenDataset(yamlPath, workspaceRoot);
        setState({ dataset: ds, currentClass: 0, dirtySet: [] });
        await loadIndex(ds, 0);
      } catch (e) {
        setState({ error: e instanceof Error ? e.message : String(e), busy: false });
      }
    },
    [loadIndex],
  );

  const handleScan = useCallback(async () => {
    if (!state.scanRoot) return;
    setState({ busy: true, error: null });
    try {
      setState({ datasets: await scanDatasets(state.scanRoot), busy: false });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e), busy: false });
    }
  }, []);

  const save = useCallback(async () => {
    const ds = state.dataset;
    if (!ds || !state.image) return;
    setState({ saving: true, error: null });
    try {
      await apiSaveLabels(ds.yamlPath, ds.images[state.index], state.labels);
      setState({
        saving: false,
        dirty: false,
        dirtySet: state.dirtySet.filter((i) => i !== state.index),
      });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e), saving: false });
    }
  }, []);

  const navigate = useCallback(
    async (delta: number) => {
      const ds = state.dataset;
      if (!ds || ds.images.length === 0) return;
      if (state.dirty && !window.confirm('当前图片有未保存的修改，切换将丢弃。确定？')) return;
      const next = (state.index + delta + ds.images.length) % ds.images.length;
      await loadIndex(ds, next);
    },
    [loadIndex],
  );

  const navigateTo = useCallback(
    async (i: number) => {
      const ds = state.dataset;
      if (!ds || i === state.index) return;
      if (state.dirty && !window.confirm('当前图片有未保存的修改，切换将丢弃。确定？')) return;
      await loadIndex(ds, i);
    },
    [loadIndex],
  );

  const deleteSelected = useCallback(() => {
    if (state.selected === null) return;
    const selected = state.selected;
    setState({
      labels: state.labels.filter((_, i) => i !== selected),
      selected: null,
      dirty: true,
      dirtySet: [...new Set([...state.dirtySet, state.index])],
    });
  }, []);

  const addBox = useCallback((label: Label) => {
    setState({
      labels: [...state.labels, label],
      dirty: true,
      dirtySet: [...new Set([...state.dirtySet, state.index])],
    });
  }, []);

  useEffect(() => {
    rootRef.current?.focus();
  }, [state.dataset]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!state.dataset) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void save();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selected !== null) {
        e.preventDefault();
        deleteSelected();
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      e.preventDefault();
      void navigate(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
      e.preventDefault();
      void navigate(1);
    }
  };

  return (
    <div className="yl-view" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
      {/* ── 工具条 ── */}
      <div className="yl-topbar">
        <span className="yl-title">🏷️ YOLO Labeling</span>
        {state.dataset && (
          <>
            <span className="yl-dataset-name" title={state.dataset.yamlPath}>
              {basename(state.dataset.yamlPath)}
            </span>
            <span className="yl-counter">
              {state.index + 1}/{state.dataset.total}
            </span>
            {state.dirty && <span className="yl-badge">未保存</span>}
          </>
        )}
        <span className="yl-spacer" />
        {state.error && (
          <span className="yl-error" title={state.error}>
            {state.error}
          </span>
        )}
        {state.dataset && (
          <>
            <button className="yl-btn" onClick={() => void navigate(-1)} disabled={state.busy} title="上一张 (←)">
              ← 上一张
            </button>
            <button className="yl-btn" onClick={() => void navigate(1)} disabled={state.busy} title="下一张 (→)">
              下一张 →
            </button>
            <button
              className="yl-btn danger"
              onClick={deleteSelected}
              disabled={state.selected === null}
              title="删除选中 (Delete)"
            >
              删除
            </button>
            <button
              className="yl-btn primary"
              onClick={() => void save()}
              disabled={state.saving || !state.dirty}
              title="保存 (Ctrl+S)"
            >
              {state.saving ? '保存中…' : '保存'}
            </button>
          </>
        )}
      </div>

      {!state.dataset ? (
        /* ── 数据集选择页（填满视图） ── */
        <div className="yl-picker">
          <div className="yl-picker-row">
            <input
              className="yl-input"
              placeholder="数据集 data.yaml 的绝对路径，如 /datasets/coco128/data.yaml"
              value={state.yamlInput}
              onChange={(e) => setState({ yamlInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleOpen(state.yamlInput.trim());
              }}
            />
            <button
              className="yl-btn primary"
              onClick={() => void handleOpen(state.yamlInput.trim())}
              disabled={state.busy || !state.yamlInput.trim()}
            >
              {state.busy ? '打开中…' : '打开数据集'}
            </button>
          </div>
          <div className="yl-picker-hint">— 或 —</div>
          <div className="yl-picker-row">
            <input
              className="yl-input"
              placeholder="扫描目录（递归查找 YOLO 数据集），如 /home/andaoai/yolo-datasets"
              value={state.scanRoot}
              onChange={(e) => setState({ scanRoot: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleScan();
              }}
            />
            <button className="yl-btn" onClick={() => void handleScan()} disabled={state.busy}>
              扫描
            </button>
          </div>
          {state.datasets && (
            <div className="yl-picker-results">
              {state.datasets.length === 0 && (
                <div className="yl-picker-hint">该目录下未发现有效数据集。</div>
              )}
              {state.datasets.map((ds) => (
                <div
                  key={ds.yamlPath}
                  className="yl-image-item"
                  onClick={() => void handleOpen(ds.yamlPath, state.scanRoot)}
                  style={{ padding: '8px 12px' }}
                >
                  {ds.datasetRoot.split(/[\\/]/).pop()}
                  <span style={{ color: '#888' }}>
                    {' '}
                    — {ds.classCount} 类 · {ds.yamlPath}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="yl-picker-hint">
            数据由 host 插件的 /yolo-label/api/* 路由读写；标签保存为 YOLO txt 格式。
          </div>
        </div>
      ) : (
        /* ── 标注工作区 ── */
        <div className={`yl-body ${compact ? 'compact' : ''}`}>
          {compact ? (
            /* 窄面板（右侧侧边栏内）：图片下拉 + 类别横向 chips */
            <div className="yl-compactbars">
              <select
                className="yl-input yl-img-select"
                value={state.index}
                onChange={(e) => void navigateTo(Number(e.target.value))}
              >
                {state.dataset.images.map((p, i) => (
                  <option key={p} value={i}>
                    {i + 1}/{state.dataset!.total} {basename(p)}
                    {state.dirtySet.includes(i) ? ' ●' : ''}
                  </option>
                ))}
              </select>
              <div className="yl-chips">
                {state.dataset.classNames.map((name, i) => (
                  <div
                    key={i}
                    className={`yl-chip ${state.currentClass === i ? 'selected' : ''}`}
                    onClick={() => setState({ currentClass: i })}
                    title={`${i} ${name}`}
                  >
                    <span className="yl-class-swatch" style={{ background: classColor(i) }} />
                    {i} {name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* 宽布局（拖出为自由窗口/宽面板时）：左侧类别 + 图片双栏 */
            <div className="yl-side">
              <div className="yl-side-section">
                <div className="yl-side-header">类别 ({state.dataset.classNames.length})</div>
                <div className="yl-class-list">
                  {state.dataset.classNames.map((name, i) => (
                    <div
                      key={i}
                      className={`yl-class-item ${state.currentClass === i ? 'selected' : ''}`}
                      onClick={() => setState({ currentClass: i })}
                    >
                      <span className="yl-class-swatch" style={{ background: classColor(i) }} />
                      <span className="yl-class-index">{i}</span>
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="yl-side-section grow">
                <div className="yl-side-header">图片 ({state.dataset.images.length})</div>
                <div className="yl-image-list">
                  {state.dataset.images.map((p, i) => (
                    <div
                      key={p}
                      className={`yl-image-item ${i === state.index ? 'selected' : ''} ${
                        state.dirtySet.includes(i) ? 'dirty' : ''
                      }`}
                      onClick={() => void navigateTo(i)}
                    >
                      {basename(p)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="yl-main">
            {state.image ? (
              <LabelingCanvas
                image={state.image}
                labels={state.labels}
                classNames={state.dataset.classNames}
                selected={state.selected}
                currentClass={state.currentClass}
                onSelect={(idx) => setState({ selected: idx })}
                onAddBox={addBox}
              />
            ) : (
              <div className="yl-canvas-wrap" style={{ color: '#888' }}>
                {state.busy ? '加载中…' : '图片加载失败'}
              </div>
            )}
            <div className="yl-statusbar">
              <span>{basename(state.dataset.images[state.index] ?? '')}</span>
              <span>标签 {state.labels.length}</span>
              <span style={{ flex: 1 }} />
              <span>拖拽画框 · 点击选中 · Delete 删除 · ←/→ 翻页 · Ctrl+S 保存</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
