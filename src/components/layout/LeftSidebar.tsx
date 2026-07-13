import { useAppStore, NavItemId } from '@/stores/appStore'
import { BookOpen, FileText, Images, Users, Download, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface NavItem {
  id: NavItemId
  label: string
  icon: ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chapters', label: '场景导航', icon: <BookOpen size={18} strokeWidth={1.75} /> },
  { id: 'script-overview', label: '剧本总览', icon: <FileText size={18} strokeWidth={1.75} /> },
  { id: 'assets', label: '素材管理', icon: <Images size={18} strokeWidth={1.75} /> },
  { id: 'characters', label: '角色管理', icon: <Users size={18} strokeWidth={1.75} /> },
  { id: 'export', label: '导出设置', icon: <Download size={18} strokeWidth={1.75} /> },
  { id: 'ai', label: 'AI 功能', icon: <Sparkles size={18} strokeWidth={1.75} /> },
]

export default function LeftSidebar() {
  const collapsed = useAppStore((s) => s.leftSidebarCollapsed)
  const activeItem = useAppStore((s) => s.activeNavItem)
  const setActive = useAppStore((s) => s.setActiveNavItem)
  const toggle = useAppStore((s) => s.toggleLeftSidebar)

  const width = collapsed ? 'w-12' : 'w-40'

  return (
    <aside
      className={`${width} flex shrink-0 flex-col border-r border-edge/10 bg-surface/70 backdrop-blur-md transition-all duration-200`}
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
      <nav className="flex flex-1 flex-col gap-1 p-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeItem === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-all ${
                collapsed ? 'justify-center' : ''
              } ${
              isActive
                ? 'border-l-2 border-l-primary bg-primary/15 text-primary'
                : 'border-l-2 border-l-transparent text-fg-faint hover:bg-surface-hover hover:text-fg-muted'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate text-xs">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* 底部版本号 */}
      <div className="border-t border-edge/10 p-2 text-center text-[10px] text-fg-faint">
        {collapsed ? 'v0.3' : 'v0.3.0'}
      </div>
    </aside>
  )
}
