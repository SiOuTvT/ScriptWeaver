import { useState, useEffect, useRef, useCallback } from 'react'
import LeftSidebar from './LeftSidebar'
import ManagementPanel from './ManagementPanel'
import StagePreview from './StagePreview'
import ScriptDrawer from './ScriptDrawer'
import Timeline from './Timeline'
import ScriptOverview from './ScriptOverview'
import AssetManager from './AssetManager'
import CharacterManager from './CharacterManager'
import AIPanel from './AIPanel'
import ExportSettings from './ExportSettings'
import ThemeSettings from './ThemeSettings'
import { applyAccent } from '@/utils/themeColor'
import { useAppStore } from '@/stores/appStore'
import { downloadRpy } from '@/utils/rpyExporter'
import { saveDraft, loadDraft, clearDraft } from '@/utils/draftStorage'
import { DEFAULT_POSITION_SLOTS } from '@/core/positionSlots'
import { subscribe, getToastItems, toast, type ToastItem } from '@/utils/toast'
import { Sun, Moon, FilePlus, FolderOpen, Save, FileDown } from 'lucide-react'
import { Button, IconButton, ConfirmDialog } from '@/components/ui'
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
 * 失败的读取会打印 console.error 以便调试。
 */
async function refreshAssetDataUrls(
  assets: AssetItem[],
  projectRoot: string | null,
): Promise<AssetItem[]> {
  const api = window.electronAPI
  if (!api) {
    // 浏览器模式：没有 IPC，无法读取磁盘文件
    return assets
  }
  if (!projectRoot) {
    console.warn('[refreshAssetDataUrls] 缺少 projectRoot，跳过素材刷新')
    return assets
  }

  const refreshed = await Promise.all(
    assets.map(async (asset) => {
      // 已有 dataUrl 或缺少 relativePath → 跳过
      if (asset.dataUrl) return asset
      if (!asset.relativePath) {
        console.warn(`[refreshAssetDataUrls] 素材 "${asset.name}" 缺少 relativePath，跳过`)
        return asset
      }
      try {
        const result = await api.readAssetFile(asset.relativePath, projectRoot)
        if (result.success && result.dataUrl) {
          return { ...asset, dataUrl: result.dataUrl }
        }
        console.error(
          `[refreshAssetDataUrls] 读取失败: "${asset.fileName}"\n` +
          `  relativePath: ${asset.relativePath}\n` +
          `  projectRoot: ${projectRoot}\n` +
          `  error: ${result.error ?? '(无详细信息)'}`,
        )
      } catch (err) {
        console.error(
          `[refreshAssetDataUrls] IPC 异常: "${asset.fileName}"\n` +
          `  relativePath: ${asset.relativePath}\n` +
          `  projectRoot: ${projectRoot}\n` +
          `  exception: ${err}`,
        )
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
  const [toasts, setToasts] = useState<ToastItem[]>(getToastItems)

  // ---- auto-save refs ----
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef({ deltas: draftDeltas, characterConfigs, assets, projectRoot })
  snapshotRef.current = { deltas: draftDeltas, characterConfigs, assets, projectRoot }

  /** 防抖写入 localStorage */
  const debouncedSaveDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const { deltas, characterConfigs: chars, assets: asts, projectRoot: root } = snapshotRef.current
      saveDraft(deltas, chars, asts, root)
    }, DEBOUNCE_MS)
  }, [])

  // 监听变化 → 自动存草稿
  useEffect(() => {
    debouncedSaveDraft()
  }, [draftDeltas, characterConfigs, assets, projectRoot, debouncedSaveDraft])

  // 组件挂载时静默恢复自动保存的草稿（无需每次弹窗询问）
  const restoreDraft = useCallback(
    (draft: ReturnType<typeof loadDraft>) => {
      if (!draft) return
      const root = draft.projectRoot ?? null
      loadProjectData({ ...draft, projectRoot: root })
      if (root) {
        refreshAssetDataUrls(draft.assets ?? [], root)
          .then((refreshed) => useAppStore.getState().setAssets(refreshed))
          .catch((err) => console.error('[restoreDraft] 素材刷新失败:', err))
      }
    },
    [loadProjectData],
  )

  useEffect(() => {
    const draft = loadDraft()
    if (!draft || draft.deltas.length === 0) return
    restoreDraft(draft)
    toast('已自动恢复上次草稿', 'info')
  }, [restoreDraft])

  // Toast 订阅
  useEffect(() => {
    return subscribe(setToasts)
  }, [])

  // ---- 主题：应用到 <html data-theme> 并同步 Electron 原生标题栏 ----
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const accentColor = useAppStore((s) => s.accentColor)
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    window.electronAPI?.setNativeTheme?.(theme)
  }, [theme])

  // ---- 主题色：随基色 / 明暗模式变化，实时写入 CSS 变量 ----
  useEffect(() => {
    applyAccent(accentColor, theme)
  }, [accentColor, theme])

  // 全局快捷键：Ctrl+Z 撤销 / Ctrl+Y 或 Ctrl+Shift+Z 重做
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 在输入框/文本域中不拦截（保留原生撤销功能）
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useAppStore.getState().undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        useAppStore.getState().redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ---- 操作 ----

  const handleExport = () => {
    downloadRpy(draftDeltas, resolvedStates, characterConfigs, assets, DEFAULT_POSITION_SLOTS, 'script.rpy')
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
      saveDraft(draftDeltas, characterConfigs, assets, result.projectDir)
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
            saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets, null)
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
    saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets, root)

    // 从磁盘重新读取素材 dataUrl（不依赖 .swproj 中可能残留的旧 base64）
    refreshAssetDataUrls(parsed.assets, root)
      .then((refreshed) => {
        useAppStore.getState().setAssets(refreshed)
      })
      .catch((err) => {
        console.error('[handleOpen] 素材刷新失败:', err)
      })
  }

  const totalLines = draftDeltas.length
  const isChapters = activeNavItem === 'chapters'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-fg">
      {/* 全局极轻颗粒质感叠层（≤3%，不糊字） */}
      <div className="grain-overlay" aria-hidden />

      {/* ===== 顶部工具栏（所有页面通用） ===== */}
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-edge/10 bg-surface/70 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="signal-dot signal-dot--pulse" aria-hidden />
          <span className="text-sm font-semibold tracking-tight text-fg">
            Script<span className="font-light text-fg-muted">Weaver</span>
          </span>
          <span className="hidden h-4 w-px bg-edge-strong/15 sm:block" />
          <span className="eyebrow hidden sm:block">Visual Novel Studio</span>
          {totalLines > 0 && (
            <span className="font-mono text-[12px] tabular-nums text-fg-faint">
              {totalLines.toString().padStart(3, '0')} 行
            </span>
          )}
          {projectRoot && (
            <span className="flex items-center gap-1.5 text-[12px] text-fg-faint" title={projectRoot}>
              <span className="signal-dot" /> 已保存
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={<FilePlus size={14} strokeWidth={1.75} />} onClick={handleNewClick}>
            新建
          </Button>
          <Button variant="ghost" size="sm" icon={<FolderOpen size={14} strokeWidth={1.75} />} onClick={handleOpen}>
            打开
          </Button>
          <Button variant="ghost" size="sm" icon={<Save size={14} strokeWidth={1.75} />} onClick={handleSave}>
            保存
          </Button>
          <span className="mx-0.5 h-4 w-px bg-edge-strong/20" />
          <Button variant="outline" size="sm" icon={<FileDown size={14} strokeWidth={1.75} />} onClick={handleExport}>
            导出 RPY
          </Button>
          <span className="mx-0.5 h-4 w-px bg-edge-strong/20" />
          <IconButton
            icon={theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          />
        </div>
      </header>

      {/* ===== 主内容区 ===== */}
      <div className="relative flex flex-1 overflow-hidden">
        <LeftSidebar />

        {/* --- 场景导航：完整创作工作区 --- */}
        {isChapters && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="relative flex flex-1 items-stretch gap-0 overflow-hidden p-2">
              <ManagementPanel />
              <div className="col-divider" aria-hidden />
              <StagePreview />
              <div className="col-divider" aria-hidden />
              <ScriptDrawer />
            </div>
            <Timeline />
          </div>
        )}

        {/* --- 其他页面：独立全屏视图 --- */}
        {activeNavItem === 'script-overview' && <ScriptOverview />}
        {activeNavItem === 'assets' && <AssetManager />}
        {activeNavItem === 'characters' && <CharacterManager />}
        {activeNavItem === 'export' && <ExportSettings />}
        {activeNavItem === 'ai' && <AIPanel />}
        {activeNavItem === 'theme' && <ThemeSettings />}
      </div>

      {/* ===== 新建确认对话框 ===== */}
      <ConfirmDialog
        open={showNewConfirm}
        title="新建空白项目"
        confirmText="确认新建"
        onConfirm={handleNewConfirm}
        onCancel={() => setShowNewConfirm(false)}
        message={
          <>
            当前项目中有 {totalLines} 行内容、{characterConfigs.length} 个角色、
            {assets.length} 个素材。新建后当前数据将丢失，此操作不可撤销。
          </>
        }
      />

      {/* ===== Toast 通知容器 ===== */}
      {toasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-16 right-4 z-[100] flex flex-col gap-1.5"
        >
          {toasts.map((t) => {
            const colors = {
              success: 'bg-success/90',
              info: 'bg-info/90',
              warning: 'bg-warning/90',
            }
            return (
              <div
                key={t.id}
                className={`pointer-events-auto animate-slide-up rounded-md px-3 py-2 text-xs text-white shadow-2 backdrop-blur-md ${colors[t.type]}`}
              >
                {t.message}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
