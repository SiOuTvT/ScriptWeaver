import LeftSidebar from './LeftSidebar'
import AssetLibrary from './AssetLibrary'
import StagePreview from './StagePreview'
import ScriptDrawer from './ScriptDrawer'
import Timeline from './Timeline'
import { useAppStore } from '@/stores/appStore'
import { downloadRpy } from '@/utils/rpyExporter'

export default function AppLayout() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)

  const handleExport = () => {
    downloadRpy(draftDeltas, resolvedStates, 'script.rpy')
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-950">
      {/* 主内容区：横向四层 */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 第 1 层：最左侧边栏 */}
        <LeftSidebar />

        {/* 第 2 层：素材库 */}
        <AssetLibrary />

        {/* 第 3 层：舞台预览（核心） */}
        <StagePreview />

        {/* 第 4 层：剧本流（抽屉） */}
        <ScriptDrawer />

        {/* 导出按钮（浮动） */}
        <button
          onClick={handleExport}
          title="导出 .rpy 脚本"
          className="absolute right-4 top-3 z-30 flex items-center gap-1.5 rounded-lg bg-brand-600/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500 shadow-lg backdrop-blur-sm"
        >
          <span className="text-base leading-none">📥</span>
          <span>导出 RPY</span>
        </button>
      </div>

      {/* 底部：多轨道时间轴 */}
      <Timeline />
    </div>
  )
}
