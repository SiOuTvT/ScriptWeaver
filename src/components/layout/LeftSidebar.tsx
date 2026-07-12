import { useAppStore, NavItemId } from '@/stores/appStore'

interface NavItem {
  id: NavItemId
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chapters', label: '场景导航', icon: '📖' },
  { id: 'script-overview', label: '剧本总览', icon: '📝' },
  { id: 'assets', label: '素材管理', icon: '📦' },
  { id: 'characters', label: '角色管理', icon: '👤' },
  { id: 'export', label: '导出设置', icon: '📤' },
  { id: 'ai', label: 'AI 功能', icon: '🤖' },
]

export default function LeftSidebar() {
  const collapsed = useAppStore((s) => s.leftSidebarCollapsed)
  const activeItem = useAppStore((s) => s.activeNavItem)
  const setActive = useAppStore((s) => s.setActiveNavItem)
  const toggle = useAppStore((s) => s.toggleLeftSidebar)

  const width = collapsed ? 'w-12' : 'w-40'

  return (
    <aside
      className={`${width} flex shrink-0 flex-col border-r border-gray-800 bg-gray-950 transition-all duration-200`}
    >
      {/* 折叠按钮 */}
      <button
        onClick={toggle}
        className="flex h-12 items-center justify-center border-b border-gray-800 text-gray-500 transition-colors hover:bg-gray-900 hover:text-gray-300"
      >
        <span className="text-sm">{collapsed ? '▶' : '◀'}</span>
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
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {!collapsed && (
                <span className="truncate text-xs">{item.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* 底部版本号 */}
      <div className="border-t border-gray-800 p-2 text-center text-[10px] text-gray-700">
        {collapsed ? 'v0.3' : 'v0.3.0'}
      </div>
    </aside>
  )
}
