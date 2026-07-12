import { useAppStore } from '@/stores/appStore'
import AssetManager from './AssetManager'
import CharacterManager from './CharacterManager'

export default function ManagementPanel() {
  const activeNavItem = useAppStore((s) => s.activeNavItem)

  if (!activeNavItem) return null

  switch (activeNavItem) {
    case 'assets':
      return <AssetManager />
    case 'characters':
      return <CharacterManager />
    case 'chapters':
      return <PlaceholderPanel icon="📖" title="场景导航" desc="场景/章节树状列表（待实现）" />
    case 'export':
      return <PlaceholderPanel icon="📤" title="导出设置" desc="Ren'Py 导出配置（请使用顶部工具栏导出按钮）" />
    case 'ai':
      return <PlaceholderPanel icon="🤖" title="AI 功能" desc="AI 辅助写作（待实现）" />
    default:
      return null
  }
}

function PlaceholderPanel({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-950/80">
      <div className="border-b border-gray-800 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
        <span className="text-3xl opacity-40">{icon}</span>
        <span className="text-xs text-gray-600 text-center">{desc}</span>
      </div>
    </aside>
  )
}
