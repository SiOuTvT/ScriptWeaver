import { useState } from 'react'
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
  const newProject = useAppStore((s) => s.newProject)

  const [showNewConfirm, setShowNewConfirm] = useState(false)

  const handleExport = () => {
    downloadRpy(draftDeltas, resolvedStates, 'script.rpy')
  }

  const handleNewClick = () => {
    if (draftDeltas.length === 0) {
      // 已经是空白项目，直接重置
      newProject()
      return
    }
    setShowNewConfirm(true)
  }

  const handleNewConfirm = () => {
    newProject()
    setShowNewConfirm(false)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-950">
      {/* 顶部工具栏 */}
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900/60 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300 tracking-wide">
            ScriptWeaver
          </span>
          {draftDeltas.length > 0 && (
            <span className="text-[10px] text-gray-600">
              {draftDeltas.length} 行
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleNewClick}
            title="新建空白项目"
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <span className="text-sm leading-none">📄</span>
            <span>新建</span>
          </button>
          <button
            onClick={handleExport}
            title="导出 Ren'Py 脚本"
            className="flex items-center gap-1 rounded-md bg-brand-600/80 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-brand-500"
          >
            <span className="text-sm leading-none">📥</span>
            <span>导出 RPY</span>
          </button>
        </div>
      </header>

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

      {/* 新建确认对话框 */}
      {showNewConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold text-gray-200">
              新建空白项目
            </h3>
            <p className="mb-5 text-xs leading-relaxed text-gray-400">
              当前项目中有 {draftDeltas.length} 行内容。
              新建后当前数据将丢失，此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleNewConfirm}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500"
              >
                确认新建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
