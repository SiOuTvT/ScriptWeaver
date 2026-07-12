import { useState, useEffect, useRef, useCallback } from 'react'
import LeftSidebar from './LeftSidebar'
import AssetLibrary from './AssetLibrary'
import StagePreview from './StagePreview'
import ScriptDrawer from './ScriptDrawer'
import Timeline from './Timeline'
import { useAppStore } from '@/stores/appStore'
import { downloadRpy } from '@/utils/rpyExporter'
import { saveDraft, loadDraft, clearDraft } from '@/utils/draftStorage'
import type { ProjectFile, LineDelta } from '@/core/types'

/** 序列化项目数据为 JSON */
function serializeProject(deltas: LineDelta[]): string {
  const project: ProjectFile = {
    version: 1,
    draftDeltas: deltas,
    savedAt: new Date().toISOString(),
  }
  return JSON.stringify(project, null, 2)
}

/** 反序列化项目 JSON，校验基本结构 */
function deserializeProject(json: string): LineDelta[] | null {
  try {
    const data = JSON.parse(json) as ProjectFile
    if (!data.draftDeltas || !Array.isArray(data.draftDeltas)) return null
    return data.draftDeltas
  } catch {
    return null
  }
}

const DEBOUNCE_MS = 800

export default function AppLayout() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)
  const newProject = useAppStore((s) => s.newProject)

  // ---- 对话框状态 ----
  const [showNewConfirm, setShowNewConfirm] = useState(false)
  const [showDraftRecovery, setShowDraftRecovery] = useState(false)
  const [draftInfo, setDraftInfo] = useState<{ deltas: LineDelta[]; savedAt: string } | null>(null)

  // ---- auto-save refs ----
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deltasRef = useRef(draftDeltas)
  deltasRef.current = draftDeltas

  /** 防抖写入 localStorage */
  const debouncedSaveDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      saveDraft(deltasRef.current)
    }, DEBOUNCE_MS)
  }, [])

  // 监听 deltas 变化 → 自动存草稿
  useEffect(() => {
    debouncedSaveDraft()
  }, [draftDeltas, debouncedSaveDraft])

  // 组件挂载时检查草稿
  useEffect(() => {
    const draft = loadDraft()
    if (!draft || draft.deltas.length === 0) return
    // 仅在当前是默认 mock 数据时弹恢复提示
    // （如果用户已经打开了一个项目，不弹）
    setDraftInfo(draft)
    setShowDraftRecovery(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 操作 ----

  const handleExport = () => {
    downloadRpy(draftDeltas, resolvedStates, 'script.rpy')
  }

  const handleNewClick = () => {
    if (draftDeltas.length === 0) {
      newProject()
      clearDraft()
      return
    }
    setShowNewConfirm(true)
  }

  const handleNewConfirm = () => {
    newProject()
    clearDraft()
    setShowNewConfirm(false)
  }

  const handleSave = async () => {
    const api = window.electronAPI
    if (!api) {
      // 降级：浏览器环境下用 Blob 下载
      const json = serializeProject(draftDeltas)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'untitled.swproj'
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    const result = await api.saveFile({
      content: serializeProject(draftDeltas),
      defaultName: 'untitled.swproj',
    })
    if (result.success) {
      // 保存成功后同步更新草稿
      saveDraft(draftDeltas)
    } else if (result.error) {
      alert(`保存失败：${result.error}`)
    }
    // canceled 静默忽略
  }

  const handleOpen = async () => {
    const api = window.electronAPI
    if (!api) {
      // 降级：浏览器环境下用 file input
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.swproj,.json'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          const deltas = deserializeProject(reader.result as string)
          if (deltas) {
            setDraftDeltas(deltas)
            saveDraft(deltas)
          } else {
            alert('文件格式错误，无法打开')
          }
        }
        reader.readAsText(file)
      }
      input.click()
      return
    }
    const result = await api.openFile()
    if (!result.success || !result.content) {
      if (result.error) alert(`打开失败：${result.error}`)
      return
    }
    const deltas = deserializeProject(result.content)
    if (!deltas) {
      alert('文件格式错误，无法打开')
      return
    }
    setDraftDeltas(deltas)
    saveDraft(deltas)
    setShowDraftRecovery(false) // 已加载项目，不弹恢复
  }

  const handleDraftRecover = () => {
    if (draftInfo) {
      setDraftDeltas(draftInfo.deltas)
    }
    setShowDraftRecovery(false)
  }

  const handleDraftDiscard = () => {
    clearDraft()
    setShowDraftRecovery(false)
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
            onClick={handleOpen}
            title="打开项目文件"
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <span className="text-sm leading-none">📂</span>
            <span>打开</span>
          </button>
          <button
            onClick={handleSave}
            title="保存项目到文件"
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <span className="text-sm leading-none">💾</span>
            <span>保存</span>
          </button>
          <span className="mx-0.5 h-4 w-px bg-gray-700" />
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
        <LeftSidebar />
        <AssetLibrary />
        <StagePreview />
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

      {/* 草稿恢复对话框 */}
      {showDraftRecovery && draftInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold text-gray-200">
              发现未保存的草稿
            </h3>
            <p className="mb-5 text-xs leading-relaxed text-gray-400">
              检测到上次编辑的草稿数据（
              {draftInfo.deltas.length} 行，
              {new Date(draftInfo.savedAt).toLocaleString('zh-CN')}
              ），是否恢复？
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleDraftDiscard}
                className="rounded-lg px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-400"
              >
                丢弃草稿
              </button>
              <button
                onClick={handleDraftRecover}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500"
              >
                恢复草稿
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
