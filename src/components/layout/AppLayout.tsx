import LeftSidebar from './LeftSidebar'
import AssetLibrary from './AssetLibrary'
import StagePreview from './StagePreview'
import ScriptDrawer from './ScriptDrawer'
import Timeline from './Timeline'

export default function AppLayout() {
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
      </div>

      {/* 底部：多轨道时间轴 */}
      <Timeline />
    </div>
  )
}
