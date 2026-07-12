import { useState, useEffect, useRef, useCallback } from 'react'
import LeftSidebar from './LeftSidebar'
import ManagementPanel from './ManagementPanel'
import StagePreview from './StagePreview'
import ScriptDrawer from './ScriptDrawer'
import Timeline from './Timeline'
import ScriptOverview from './ScriptOverview'
import AssetManager from './AssetManager'
import CharacterManager from './CharacterManager'
import { useAppStore } from '@/stores/appStore'
import { downloadRpy } from '@/utils/rpyExporter'
import { saveDraft, loadDraft, clearDraft } from '@/utils/draftStorage'
import type { ProjectFile, LineDelta, CharacterConfig, AssetItem } from '@/core/types'

/** 剥离 assets 中的 dataUrl —— 仅内存渲染使用，不入 .swproj / localStorage */
function stripDataUrls(assets: AssetItem[]): AssetItem[] {
  return assets.map(({ dataUrl: _, ...rest }) => rest)
}

/** 序列化完整项目数据为 JSON（不含 dataUrl） */
function serializeProject(
  deltas: LineDelta[],
  characterConfigs: CharacterConfig[],
  assets: AssetItem[],
): string {
  const project: ProjectFile = {
    version: 1,
    draftDeltas: deltas,
    characterConfigs,
    assets: stripDataUrls(assets),
    savedAt: new Date().toISOString(),
  }
  return JSON.stringify(project, null, 2)
}

/** 反序列化项目 JSON，校验基本结构 */
function deserializeProject(json: string): {
  deltas: LineDelta[]
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
} | null {
  try {
    const data = JSON.parse(json) as ProjectFile
    if (!data.draftDeltas || !Array.isArray(data.draftDeltas)) return null
    return {
      deltas: data.draftDeltas,
      characterConfigs: data.characterConfigs ?? [],
      assets: data.assets ?? [],
    }
  } catch {
    return null
  }
}

/**
 * 根据相对路径从磁盘重新读取素材文件，生成 dataUrl（仅内存，不入库）。
 * 在浏览器模式下（无 Electron API）直接返回原数组。
 */
async function refreshAssetDataUrls(
  assets: AssetItem[],
  projectRoot: string | null,
): Promise<AssetItem[]> {
  const api = window.electronAPI
  if (!api || !projectRoot) return assets

  const refreshed = await Promise.all(
    assets.map(async (asset) => {
      // 已有 dataUrl 或缺少 relativePath → 跳过
      if (asset.dataUrl || !asset.relativePath) return asset
      const result = await api.readAssetFile(asset.relativePath, projectRoot)
      if (result.success && result.dataUrl) {
        return { ...asset, dataUrl: result.dataUrl }
      }
      return asset
    }),
  )
  return refreshed
}

const DEBOUNCE_MS = 800

export default function AppLayout() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const projectRoot = useAppStore((s) => s.projectRoot)
  const activeNavItem = useAppStore((s) => s.activeNavItem)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)
  const loadProjectData = useAppStore((s) => s.loadProjectData)
  const newProject = useAppStore((s) => s.newProject)
  const setProjectRoot = useAppStore((s) => s.setProjectRoot)

  // ---- 对话框状态 ----
  const [showNewConfirm, setShowNewConfirm] = useState(false)
  const [showDraftRecovery, setShowDraftRecovery] = useState(false)
  const [draftInfo, setDraftInfo] = useState<Awaited<ReturnType<typeof loadDraft>> | null>(null)

  // ---- auto-save refs ----
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef({ deltas: draftDeltas, characterConfigs, assets })
  snapshotRef.current = { deltas: draftDeltas, characterConfigs, assets }

  /** 防抖写入 localStorage */
  const debouncedSaveDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const { deltas, characterConfigs: chars, assets: asts } = snapshotRef.current
      saveDraft(deltas, chars, asts)
    }, DEBOUNCE_MS)
  }, [])

  // 监听变化 → 自动存草稿
  useEffect(() => {
    debouncedSaveDraft()
  }, [draftDeltas, characterConfigs, assets, debouncedSaveDraft])

  // 组件挂载时检查草稿
  useEffect(() => {
    const draft = loadDraft()
    if (!draft || draft.deltas.length === 0) return
    setDraftInfo(draft)
    setShowDraftRecovery(true)
  }, [])

  // ---- 操作 ----

  const handleExport = () => {
    downloadRpy(draftDeltas, resolvedStates, characterConfigs, assets, 'script.rpy')
  }

  const handleNewClick = () => {
    if (draftDeltas.length === 0 && characterConfigs.length === 0 && assets.length === 0) {
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
      const json = serializeProject(draftDeltas, characterConfigs, assets)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'untitled.swproj'
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    const result = await api.saveProject({
      projectJson: serializeProject(draftDeltas, characterConfigs, assets),
      projectName: 'untitled',
    })

    if (result.success && result.projectDir) {
      setProjectRoot(result.projectDir)
      saveDraft(draftDeltas, characterConfigs, assets)
    } else if (result.error) {
      alert(`保存失败：${result.error}`)
    }
  }

  const handleOpen = async () => {
    const api = window.electronAPI
    if (!api) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.swproj,.json'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          const parsed = deserializeProject(reader.result as string)
          if (parsed) {
            loadProjectData({ ...parsed, projectRoot: null })
            saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets)
          } else {
            alert('文件格式错误，无法打开')
          }
        }
        reader.readAsText(file)
      }
      input.click()
      return
    }

    const result = await api.openProject()
    if (!result.success || !result.content) {
      if (result.error) alert(`打开失败：${result.error}`)
      return
    }

    const parsed = deserializeProject(result.content)
    if (!parsed) {
      alert('文件格式错误，无法打开')
      return
    }

    const root = result.projectDir ?? null
    loadProjectData({
      ...parsed,
      projectRoot: root,
    })
    saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets)
    setShowDraftRecovery(false)

    // 从磁盘重新读取素材 dataUrl（不依赖 .swproj 中可能残留的旧 base64）
    refreshAssetDataUrls(parsed.assets, root).then((refreshed) => {
      useAppStore.getState().setAssets(refreshed)
    })
  }

  const handleDraftRecover = () => {
    if (draftInfo) {
      loadProjectData({ ...draftInfo, projectRoot })
      // 如果有 projectRoot，从磁盘重新读取素材 dataUrl
      if (projectRoot) {
        refreshAssetDataUrls(draftInfo.assets ?? [], projectRoot).then((refreshed) => {
          useAppStore.getState().setAssets(refreshed)
        })
      }
    }
    setShowDraftRecovery(false)
  }

  const handleDraftDiscard = () => {
    clearDraft()
    setShowDraftRecovery(false)
  }

  const totalLines = draftDeltas.length
  const isChapters = activeNavItem === 'chapters'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-950">
      {/* ===== 顶部工具栏（所有页面通用） ===== */}
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900/60 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300 tracking-wide">
            ScriptWeaver
          </span>
          {totalLines > 0 && (
            <span className="text-[10px] text-gray-600">
              {totalLines} 行
            </span>
          )}
          {projectRoot && (
            <span className="text-[10px] text-gray-600" title={projectRoot}>
              已保存
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

      {/* ===== 主内容区 ===== */}
      <div className="relative flex flex-1 overflow-hidden">
        <LeftSidebar />

        {/* --- 场景导航：完整创作工作区 --- */}
        {isChapters && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="relative flex flex-1 overflow-hidden">
              <ManagementPanel />
              <StagePreview />
              <ScriptDrawer />
            </div>
            <Timeline />
          </div>
        )}

        {/* --- 其他页面：独立全屏视图 --- */}
        {activeNavItem === 'script-overview' && <ScriptOverview />}
        {activeNavItem === 'assets' && <AssetManager />}
        {activeNavItem === 'characters' && <CharacterManager />}
        {activeNavItem === 'export' && <ExportPlaceholder />}
        {activeNavItem === 'ai' && <AIPlaceholder />}
      </div>

      {/* ===== 新建确认对话框 ===== */}
      {showNewConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold text-gray-200">
              新建空白项目
            </h3>
            <p className="mb-5 text-xs leading-relaxed text-gray-400">
              当前项目中有 {totalLines} 行内容、{characterConfigs.length} 个角色、
              {assets.length} 个素材。
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

      {/* ===== 草稿恢复对话框 ===== */}
      {showDraftRecovery && draftInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold text-gray-200">
              发现未保存的草稿
            </h3>
            <p className="mb-5 text-xs leading-relaxed text-gray-400">
              检测到上次编辑的草稿数据（
              {draftInfo.deltas.length} 行，
              {draftInfo.characterConfigs?.length ?? 0} 个角色，
              {draftInfo.assets?.length ?? 0} 个素材，
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

/** 导出设置占位页面 */
function ExportPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-950/50">
      <span className="text-4xl opacity-30">📤</span>
      <p className="text-sm text-gray-500">导出设置</p>
      <p className="text-xs text-gray-600">Ren'Py 导出配置（请使用顶部工具栏导出按钮）</p>
    </div>
  )
}

/** AI 功能占位页面 */
function AIPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-950/50">
      <span className="text-4xl opacity-30">🤖</span>
      <p className="text-sm text-gray-500">AI 功能</p>
      <p className="text-xs text-gray-600">AI 辅助写作（待实现）</p>
    </div>
  )
}
