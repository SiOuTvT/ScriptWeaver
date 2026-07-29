import { useAppStore } from '@/stores/appStore'
import {
  BookOpen, FileText, Images, Users, Download, Sparkles, Wand2, Info, HelpCircle, Settings,
  ChevronLeft, ChevronRight, Stethoscope, FileDown, Globe, Cloud, History, Code, ScrollText,
  FilePlus2, FolderOpen,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

interface NavItem {
  id: string
  label: string
  icon: ReactNode
  code?: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: '创作工作区',
    items: [
      { id: 'chapters', label: '场景导航', code: '01', icon: <BookOpen size={18} strokeWidth={1.75} /> },
      { id: 'script-overview', label: '剧本总览', code: '02', icon: <FileText size={18} strokeWidth={1.75} /> },
      { id: 'script', label: '脚本编辑', code: '03', icon: <Code size={18} strokeWidth={1.75} /> },
      { id: 'ai', label: 'AI 功能', code: '04', icon: <Sparkles size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '内容资产',
    items: [
      { id: 'characters', label: '角色管理', code: '05', icon: <Users size={18} strokeWidth={1.75} /> },
      { id: 'assets', label: '素材管理', code: '06', icon: <Images size={18} strokeWidth={1.75} /> },
      { id: 'effects', label: '特效大本营', code: '07', icon: <Wand2 size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '导出与生态',
    items: [
      { id: 'export', label: '导出设置', code: '08', icon: <Download size={18} strokeWidth={1.75} /> },
      { id: 'exporter', label: '多格式导出', code: '09', icon: <FileDown size={18} strokeWidth={1.75} /> },
      { id: 'renpy-hub', label: 'Ren\'Py 生态', code: '10', icon: <Globe size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '工程与协作',
    items: [
      {
        id: 'templates', label: '从模板新建', code: '11', icon: <FilePlus2 size={18} strokeWidth={1.75} />,
      },
      {
        id: 'import-rpy', label: '导入 Ren\'Py 工程', code: '12', icon: <FolderOpen size={18} strokeWidth={1.75} />,
      },
      { id: 'diagnostics', label: '工程体检', code: '13', icon: <Stethoscope size={18} strokeWidth={1.75} /> },
      { id: 'history', label: '版本历史', code: '14', icon: <History size={18} strokeWidth={1.75} /> },
      { id: 'collab', label: 'P2P 协作', code: '15', icon: <Cloud size={18} strokeWidth={1.75} /> },
      { id: 'audit-log', label: '协作日志', code: '16', icon: <ScrollText size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '设置与帮助',
    items: [
      { id: 'settings', label: '设置中心', code: '17', icon: <Settings size={18} strokeWidth={1.75} /> },
      { id: 'help', label: '帮助与社区大厅', code: '18', icon: <HelpCircle size={18} strokeWidth={1.75} /> },
      { id: 'about', label: '关于', code: '19', icon: <Info size={18} strokeWidth={1.75} /> },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export default function LeftSidebar() {
  const collapsed = useAppStore((s) => s.leftSidebarCollapsed)
  const activeItem = useAppStore((s) => s.activeNavItem)
  const setActive = useAppStore((s) => s.setActiveNavItem)
  const toggle = useAppStore((s) => s.toggleLeftSidebar)

  const [appVersion, setAppVersion] = useState('1.0.0')

  useEffect(() => {
    window.electronAPI?.getVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  const width = collapsed ? 'w-12' : 'w-52'

  const handleClick = (item: NavItem) => {
    setActive(item.id as Parameters<typeof setActive>[0])
  }

  const renderItem = (item: NavItem) => {
    const isActive = activeItem === item.id
    return (
      <button
        key={item.id}
        onClick={() => handleClick(item)}
        title={collapsed ? item.label : undefined}
        className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-all ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'signal-bar bg-primary/[0.08] text-fg'
            : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
        }`}
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-[14px] text-left">{item.label}</span>
            {item.code && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-faint/40">
                {item.code}
              </span>
            )}
          </>
        )}
      </button>
    )
  }

  const renderGroupDivider = (title: string) => (
    <div
      key={`divider-${title}`}
      className="mb-1 mt-0.5 px-2.5 py-1 text-[11px] font-medium tracking-[0.06em] text-fg-faint/60 select-none"
    >
      — {title} —
    </div>
  )

  return (
    <aside
      className={`${width} flex shrink-0 flex-col border-r border-edge/12 bg-surface transition-all duration-200`}
    >
      {/* 折叠按钮 */}
      <button
        onClick={toggle}
        className="flex h-12 items-center justify-center border-b border-edge/10 text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg-muted"
        title={collapsed ? '展开侧栏' : '收起侧栏'}
      >
        {collapsed ? <ChevronRight size={16} strokeWidth={1.75} /> : <ChevronLeft size={16} strokeWidth={1.75} />}
      </button>

      {/* 导航项：折叠态全部直接列出，展开态按分组平铺 + 分组标题分隔 */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {collapsed
          ? ALL_ITEMS.map(renderItem)
          : NAV_GROUPS.map((group) => (
              <div key={group.title}>
                {renderGroupDivider(group.title)}
                {group.items.map(renderItem)}
              </div>
            ))
        }
      </nav>

      {/* 底部版本号 */}
      <div className="border-t border-edge/10 p-2 text-center font-mono text-[12px] text-fg-faint">
        {`v${appVersion}`}
      </div>
    </aside>
  )
}
