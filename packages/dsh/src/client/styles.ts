/**
 * 包自有样式：factory 执行时注入一次 <style>，随 bundle 生命周期留在页面。
 * 工作台是会话中心列里的一个标签页（conversation.view），布局填满容器，
 * 对齐 VS Code 扩展：顶部工具条 + 左栏（类别/图片）+ 中央画布 + 状态栏。
 * MVP 使用固定深色配色；后续可改为读取壳子 theme token。
 */
const CSS = `
/* ── 侧边栏底部入口按钮 ─────────────────────────────── */
.yl-footer-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 8px 10px; margin: 4px 0;
  background: transparent; color: var(--vscode-foreground, #cccccc);
  border: 1px solid transparent; border-radius: 6px;
  cursor: pointer; font-size: 13px; font-family: inherit;
  transition: background .12s ease;
}
.yl-footer-btn:hover { background: rgba(255,255,255,0.08); }
.yl-footer-btn svg { flex: none; }

/* ── 紧凑布局（better-sidebar 窄面板内） ─────────────── */
.yl-body.compact { flex-direction: column; }
.yl-compactbars {
  flex: none; display: flex; flex-direction: column; gap: 6px;
  padding: 8px; border-bottom: 1px solid #3c3c3c; background: #252526;
}
.yl-img-select {
  width: 100%; min-width: 0; font-family: ui-monospace, monospace; font-size: 12px;
  padding: 4px 8px;
}
.yl-chips {
  display: flex; gap: 4px; overflow-x: auto; padding-bottom: 2px;
}
.yl-chip {
  flex: none; display: flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 12px; cursor: pointer;
  border: 1px solid #4a4a4d; font-size: 12px; white-space: nowrap;
  background: #2d2d30; color: #ccc;
}
.yl-chip:hover { background: #3a3d41; }
.yl-chip.selected { background: rgba(80,160,255,0.22); border-color: #1177bb; color: #fff; }
.yl-chip .yl-class-swatch { width: 10px; height: 10px; }

/* ── 标签页工作台容器 ───────────────────────────────── */
.yl-view {
  display: flex; flex-direction: column;
  height: 100%; min-height: 0; flex: 1;
  background: #1e1e1e; color: #cccccc;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  outline: none;
}
.yl-topbar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; background: #2d2d30; border-bottom: 1px solid #3c3c3c;
  flex: none;
}
.yl-topbar .yl-title { font-weight: 600; color: #e8e8e8; margin-right: 4px; white-space: nowrap; }
.yl-topbar .yl-dataset-name {
  color: #999; font-family: ui-monospace, monospace; font-size: 12px;
  max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.yl-topbar .yl-counter { color: #777; font-variant-numeric: tabular-nums; }
.yl-topbar .yl-spacer { flex: 1; }
.yl-body { flex: 1; display: flex; min-height: 0; }
.yl-side {
  width: 230px; flex: none; border-right: 1px solid #3c3c3c;
  display: flex; flex-direction: column; min-height: 0; background: #252526;
}
.yl-side-section { display: flex; flex-direction: column; min-height: 0; }
.yl-side-section.grow { flex: 1; }
.yl-side-header {
  padding: 8px 12px; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.08em; color: #888; flex: none;
}
.yl-class-list { overflow-y: auto; flex: none; max-height: 32%; }
.yl-class-item {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 12px; cursor: pointer; white-space: nowrap;
}
.yl-class-item:hover { background: rgba(255,255,255,0.06); }
.yl-class-item.selected { background: rgba(80,160,255,0.16); }
.yl-class-swatch { width: 12px; height: 12px; border-radius: 3px; flex: none; }
.yl-class-index { color: #888; font-variant-numeric: tabular-nums; min-width: 26px; }
.yl-image-list { overflow-y: auto; flex: 1; }
.yl-image-item {
  padding: 5px 12px; cursor: pointer; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; font-family: ui-monospace, monospace; font-size: 12px;
}
.yl-image-item:hover { background: rgba(255,255,255,0.06); }
.yl-image-item.selected { background: rgba(80,160,255,0.22); color: #fff; }
.yl-image-item.dirty::after { content: ' ●'; color: #e0c060; }

.yl-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.yl-canvas-wrap {
  flex: 1; overflow: hidden; position: relative; background: #1a1a1a;
  display: flex; align-items: center; justify-content: center; min-height: 0;
}
.yl-canvas-wrap canvas { cursor: crosshair; }
.yl-statusbar {
  flex: none; padding: 6px 12px; background: #2d2d30;
  border-top: 1px solid #3c3c3c; color: #999; font-size: 12px;
  display: flex; gap: 14px; align-items: center;
}

/* ── 通用控件 ───────────────────────────────────────── */
.yl-btn {
  padding: 5px 12px; border-radius: 6px; border: 1px solid #4a4a4d;
  background: #3a3d41; color: #ddd; cursor: pointer; font-size: 13px;
  font-family: inherit; white-space: nowrap;
}
.yl-btn:hover { background: #45494e; }
.yl-btn:disabled { opacity: 0.45; cursor: default; }
.yl-btn.primary { background: #0e639c; border-color: #1177bb; color: #fff; }
.yl-btn.primary:hover { background: #1177bb; }
.yl-btn.danger { background: #7a2f2f; border-color: #993a3a; color: #fff; }
.yl-input {
  padding: 6px 10px; border-radius: 6px; border: 1px solid #4a4a4d;
  background: #252526; color: #ddd; font-size: 13px; font-family: inherit;
  min-width: 320px;
}
.yl-input:focus { outline: none; border-color: #0e639c; }

/* ── 数据集选择页 ───────────────────────────────────── */
.yl-picker {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; padding: 24px;
}
.yl-picker-row { display: flex; gap: 8px; align-items: center; }
.yl-picker-results {
  width: 640px; max-width: 90%; max-height: 280px; overflow-y: auto;
  border: 1px solid #3c3c3c; border-radius: 8px; background: #252526;
}
.yl-picker-hint { color: #888; font-size: 12px; max-width: 620px; text-align: center; line-height: 1.6; }
.yl-error {
  color: #f48771; font-size: 12px; max-width: 32vw;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.yl-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: rgba(224,192,96,0.18); color: #e0c060; flex: none;
}
`;

let injected = false;

export function injectStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'yolo-label-dsh';
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
