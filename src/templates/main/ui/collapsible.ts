/** 折叠区 UI 辅助函数 */

export function toggleCollapsibleSection(
  collapsed: boolean,
  bodyEl: HTMLElement | null,
  toggleEl: HTMLElement | null,
): boolean {
  const next = !collapsed;
  if (bodyEl) bodyEl.style.display = next ? 'none' : '';
  if (toggleEl) toggleEl.textContent = next ? '▶' : '▼';
  return next;
}
