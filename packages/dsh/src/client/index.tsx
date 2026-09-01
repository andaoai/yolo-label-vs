/**
 * yolo-label-dsh — Client 半侧入口。
 *
 * 交互对齐 VS Code：标注工作台作为「右侧工作台侧边栏」（dsh-better-sidebar
 * 插件，VSCode 风格的 explorer/editor/terminal 侧栏）的一个**标签页**注册——
 * 通过它公开的 `betterSidebar` 服务 registerTab 接入，随侧栏标签条开合，
 * 不占用 shell.overlay，不与任何浮层冲突。
 *
 * 侧边栏底部按钮（sidebar.footer.action）作为快捷入口：点击即打开/聚焦
 * YOLO Labeling 标签页。
 */
import { WorkbenchView } from './WorkbenchView';
import { injectStyles } from './styles';

export const inject = ['slots'];

const TAB_ID = 'yolo-label';
const TAB_TITLE = 'YOLO Labeling';

/** 标签图标（与底部入口按钮同款标签 SVG）。 */
function TabIcon(size: number) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 侧边栏底部入口按钮；rail 模式只显图标，展开模式图标+文字。 */
function FooterButton(props: { ctx: any; wide: boolean }) {
  return (
    <button
      className="yl-footer-btn"
      onClick={() => {
        const betterSidebar = props.ctx.get('betterSidebar');
        if (!betterSidebar) {
          console.warn('[yolo-label-dsh] betterSidebar service unavailable — is dsh-better-sidebar installed?');
          return;
        }
        // single 标签：已打开则聚焦，否则新建；并显式激活
        betterSidebar.openTab({ type: TAB_ID });
      }}
      title="在右侧工作台打开 YOLO Labeling 标签页"
    >
      {TabIcon(20)}
      {props.wide && <span>YOLO Label</span>}
    </button>
  );
}

export function apply(ctx: any): void {
  injectStyles();

  const slots = ctx.get('slots');
  if (!slots) {
    console.error('[yolo-label-dsh] slots service unavailable');
    return;
  }

  // 侧边栏底部快捷入口
  slots.inject('sidebar.footer.action', () =>
    slots.register(
      { name: 'sidebar.footer.action', id: 'yolo-label-action' },
      (props: { wide: boolean }) => <FooterButton ctx={ctx} wide={props.wide} />,
    ),
  );

  // 向 dsh-better-sidebar 注册工作台标签页。
  // betterSidebar 是可选服务（用户未安装该插件时不注册、不报错）；
  // ctx.inject 会在服务出现后再执行回调，fiber 销毁时自动回收。
  ctx.inject?.(['betterSidebar'], (derived: any) => {
    const betterSidebar = derived.get('betterSidebar');
    if (!betterSidebar || typeof betterSidebar.registerTab !== 'function') return;
    const dispose = betterSidebar.registerTab({
      id: TAB_ID,
      title: TAB_TITLE,
      icon: (size: number) => <TabIcon size={size} />,
      order: 50,
      single: true,
      component: () => <WorkbenchView />,
    });
    derived.effect?.(() => dispose, 'yolo-label: better-sidebar tab');
    console.log('[yolo-label-dsh] registered as better-sidebar tab');
  });

  console.log('[yolo-label-dsh] client plugin active (better-sidebar tab)');
}
