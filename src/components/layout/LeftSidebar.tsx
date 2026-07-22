import { useAppStore, NavItemId } from '@/stores/appStore'
import { BookOpen, FileText, Images, Users, Download, Sparkles, Palette, Wand2, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

interface NavItem {
  id: NavItemId
  label: string
  icon: ReactNode
  code?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chapters', label: '场景导航', code: '01', icon: <BookOpen size={18} strokeWidth={1.75} /> },
  { id: 'script-overview', label: '剧本总览', code: '02', icon: <FileText size={18} strokeWidth={1.75} /> },
  { id: 'assets', label: '素材管理', code: '03', icon: <Images size={18} strokeWidth={1.75} /> },
  { id: 'characters', label: '角色管理', code: '04', icon: <Users size={18} strokeWidth={1.75} /> },
  { id: 'effects', label: '特效大本营', code: '05', icon: <Wand2 size={18} strokeWidth={1.75} /> },
  { id: 'export', label: '导出设置', code: '06', icon: <Download size={18} strokeWidth={1.75} /> },
  { id: 'ai', label: 'AI 功能', code: '07', icon: <Sparkles size={18} strokeWidth={1.75} /> },
  { id: 'theme', label: '外观主题', code: '08', icon: <Palette size={18} strokeWidth={1.75} /> },
  { id: 'about', label: '关于', code: '09', icon: <Info size={18} strokeWidth={1.75} /> },
]

export default function LeftSidebar() {
  const collapsed = useAppStore((s) => s.leftSidebarCollapsed)
  const activeItem = useAppStore((s) => s.activeNavItem)
  const setActive = useAppStore((s) => s.setActiveNavItem)
  const toggle = useAppStore((s) => s.toggleLeftSidebar)

  const [appVersion, setAppVersion] = useState('0.4.0')
  useEffect(() => {
    window.electronAPI?.getVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  const width = collapsed ? 'w-12' : 'w-44'

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
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeItem === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
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
                  <span className="ml-auto font-mono text-[12px] tabular-nums text-fg-faint/70">
                    {item.code}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </nav>

      {/* 底部版本号 */}
      <div className="border-t border-edge/10 p-2 text-center font-mono text-[12px] text-fg-faint">
        {`v${appVersion}`}
      </div>
    </aside>
  )
}
