import { useAppStore } from '@/stores/appStore'
import {
  BookOpen, FileText, Images, Users, Download, Sparkles, Wand2, Info, HelpCircle, Settings,
  ChevronLeft, ChevronRight, Stethoscope, FileDown, Globe, Cloud, History, Code, ScrollText,
  ChevronDown,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

interface NavItem {
  id: string
  label: string
  icon: ReactNode
  code?: string
  action?: () => void
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
      { id: 'diagnostics', label: '工程体检', code: '11', icon: <Stethoscope size={18} strokeWidth={1.75} /> },
      {
        id: 'history', label: '版本历史', code: '12', icon: <History size={18} strokeWidth={1.75} />,
        action: () => window.dispatchEvent(new Event('sw:open-history')),
      },
      {
        id: 'collab', label: 'P2P 协作', code: '13', icon: <Cloud size={18} strokeWidth={1.75} />,
        action: () => window.dispatchEvent(new Event('sw:open-collab')),
      },
      { id: 'audit-log', label: '协作日志', code: '14', icon: <ScrollText size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '设置与帮助',
    items: [
      { id: 'settings', label: '设置中心', code: '15', icon: <Settings size={18} strokeWidth={1.75} /> },
      { id: 'help', label: '帮助与社区大厅', code: '16', icon: <HelpCircle size={18} strokeWidth={1.75} /> },
      { id: 'about', label: '关于', code: '17', icon: <Info size={18} strokeWidth={1.75} /> },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export default function LeftSidebar() {
  const collapsed = useAppStore((s) => s.leftSidebarCollapsed)
  const activeItem = useAppStore((s) => s.activeNavItem)
  const setActive = useAppStore((s) => s.setActiveNavItem)
  const toggle = useAppStore((s) => s.toggleLeftSidebar)

  const [appVersion, setAppVersion] = useState('0.4.0')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.electronAPI?.getVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  const toggleGroup = (title: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [title]: !prev[title] }))

  const width = collapsed ? 'w-12' : 'w-44'

  const handleClick = (item: NavItem) => {
    if (item.action) {
      item.action()
      return
    }
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
            <span className="truncate text-[14px]">{item.label}</span>
            {item.code && (
              <span className="ml-auto font-mono text-[12px] tabular-nums text-fg-faint/70">
                {item.code}
              </span>
            )}
          </>
        )}
      </button>
    )
  }

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

      {/* 导航项 */}
      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {collapsed ? (
          ALL_ITEMS.map(renderItem)
        ) : (
          NAV_GROUPS.map((group) => {
            const isGroupCollapsed = collapsedGroups[group.title]
            return (
              <div key={group.title} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] font-medium tracking-wide text-fg-faint transition-colors hover:text-fg-muted"
                  title={isGroupCollapsed ? '展开分组' : '收起分组'}
                >
                  <span>{group.title}</span>
                  {isGroupCollapsed ? (
                    <ChevronRight size={13} strokeWidth={1.75} />
                  ) : (
                    <ChevronDown size={13} strokeWidth={1.75} />
                  )}
                </button>
                {!isGroupCollapsed && (
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {group.items.map(renderItem)}
                  </div>
                )}
              </div>
            )
          })
        )}
      </nav>

      {/* 底部版本号 */}
      <div className="border-t border-edge/10 p-2 text-center font-mono text-[12px] text-fg-faint">
        {`v${appVersion}`}
      </div>
    </aside>
  )
}
