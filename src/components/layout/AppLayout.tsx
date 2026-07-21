import { useState, useEffect, useRef, useCallback } from 'react'
import LeftSidebar from './LeftSidebar'
import ManagementPanel from './ManagementPanel'
import StagePreview from './StagePreview'
import ScriptDrawer from './ScriptDrawer'
import Timeline from './Timeline'
import ScriptGraph from './ScriptGraph'
import ScriptOverview from './ScriptOverview'
import AssetManager from './AssetManager'
import CharacterManager from './CharacterManager'
import EffectsLab from './EffectsLab'
import AIPanel from './AIPanel'
import ExportSettings from './ExportSettings'
import ThemeSettings from './ThemeSettings'
import ChoiceEditor from './ChoiceEditor'
import Dock from './Dock'
import VariableDebugger from './VariableDebugger'
import { applyAccent } from '@/utils/themeColor'
import { useAppStore } from '@/stores/appStore'
import { downloadRpy } from '@/utils/rpyExporter'
import { saveDraft, loadDraft, clearDraft } from '@/utils/draftStorage'
import { bindAssetWatcher } from '@/services/assetSync'
import { DEFAULT_POSITION_SLOTS } from '@/core/positionSlots'
import { subscribe, getToastItems, toast, type ToastItem } from '@/utils/toast'
import { Sun, Moon, FilePlus, FolderOpen, Save, FileDown, Images, FileText, Activity, GitBranch, ChevronUp, ChevronDown } from 'lucide-react'
import { Button, IconButton, ConfirmDialog } from '@/components/ui'
import type { ProjectFile, LineDelta, CharacterConfig, AssetItem, GlobalVariable } from '@/core/types'

/** 剥离 assets 中的 blobUrl 易失字段 —— 仅 Web 降级内存渲染使用，不入 .swproj / localStorage */
function stripVolatile(assets: AssetItem[]): AssetItem[] {
  return assets.map(({ blobUrl: _blobUrl, ...rest }) => rest)
}

/**
 * 合并磁盘扫描出的素材：仅新增库中尚未存在（按 relativePath 去重）的文件，
 * 不覆盖 .swproj 已有素材（保留其 id 与角色/背景/音频引用关系）。
 */
function mergeScannedAssets(
  scanned: { id: string; type: AssetItem['type']; name: string; fileName: string; relativePath: string; importedAt: string }[],
): void {
  const store = useAppStore.getState()
  const have = new Set(store.assets.map((a) => a.relativePath).filter(Boolean))
  const fresh = scanned.filter((a) => a.relativePath && !have.has(a.relativePath))
  if (fresh.length > 0) {
    store.setAssets([...store.assets, ...fresh])
  }
}

/**
 * 激活项目根目录：通知主进程（驱动 sw-asset:// 协议查找 + 文件夹监听），
 * 并扫描磁盘 assets 目录做增量合并。
 */
async function activateProjectRoot(root: string | null): Promise<void> {
  const api = window.electronAPI
  if (!api) return
  try {
    await api.setActiveProjectRoot(root)
    if (root) {
      const scan = await api.scanProjectAssets(root)
      if (scan.success && scan.assets) {
        mergeScannedAssets(scan.assets)
      }
    }
  } catch (err) {
    console.error('[activateProjectRoot] 失败:', err)
  }
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
    assets: stripVolatile(assets),
    variables: useAppStore.getState().variables,
    savedAt: new Date().toISOString(),
    canvasRatio: useAppStore.getState().canvasRatio,
  }
  return JSON.stringify(project, null, 2)
}

/** 反序列化项目 JSON，校验基本结构 */
function deserializeProject(json: string): {
  deltas: LineDelta[]
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
  variables: GlobalVariable[]
  canvasRatio?: { w: number; h: number }
} | null {
  try {
    const data = JSON.parse(json) as ProjectFile
    if (!data.draftDeltas || !Array.isArray(data.draftDeltas)) return null
    return {
      deltas: data.draftDeltas,
      characterConfigs: data.characterConfigs ?? [],
      assets: data.assets ?? [],
      variables: data.variables ?? [],
      canvasRatio: data.canvasRatio,
    }
  } catch {
    return null
  }
}

const DEBOUNCE_MS = 800

export default function AppLayout() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const selectedLineIndex = useAppStore((s) => s.selectedLineIndex)
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
      saveDraft(deltas, chars, asts, root, useAppStore.getState().canvasRatio)
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
      // 恢复画布比例（缺省 16:9）
      useAppStore.getState().setCanvasRatio(draft.canvasRatio ?? { w: 16, h: 9 })
      // 激活项目根目录：驱动 sw-asset:// 协议 + 文件夹监听 + 磁盘增量合并
      activateProjectRoot(root)
    },
    [loadProjectData],
  )

  // 绑定资产文件夹增量监听（幂等）
  useEffect(() => {
    bindAssetWatcher()
  }, [])

  useEffect(() => {
    const draft = loadDraft()
    // 恢复条件：有行数据 或 有素材配置 或 有角色配置（允许"只导入素材未创作"的草稿）
    if (!draft) return
    const hasContent = draft.deltas.length > 0 || draft.assets.length > 0 || draft.characterConfigs.length > 0
    if (!hasContent) return
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
    downloadRpy(draftDeltas, resolvedStates, characterConfigs, assets, DEFAULT_POSITION_SLOTS, 'script.rpy', useAppStore.getState().variables)
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
    // 新项目无根目录：停止监听、清空协议查找根
    window.electronAPI?.setActiveProjectRoot?.(null)
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
      saveDraft(draftDeltas, characterConfigs, assets, result.projectDir, useAppStore.getState().canvasRatio)
      // 保存后激活项目根：主进程已开启监听，此处扫描合并磁盘素材
      activateProjectRoot(result.projectDir)
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
            useAppStore.getState().setCanvasRatio(parsed.canvasRatio ?? { w: 16, h: 9 })
            saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets, null, parsed.canvasRatio ?? { w: 16, h: 9 })
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
    useAppStore.getState().setCanvasRatio(parsed.canvasRatio ?? { w: 16, h: 9 })
    saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets, root, parsed.canvasRatio ?? { w: 16, h: 9 })

    // 激活项目根：驱动 sw-asset:// 协议 + 文件夹监听 + 磁盘增量合并（不依赖任何 base64 回读）
    activateProjectRoot(root)
  }

  const totalLines = draftDeltas.length
  const isChapters = activeNavItem === 'chapters'
  const showChoiceEditor = draftDeltas[selectedLineIndex]?.line_type === 'choice'
  const selectLine = useAppStore((s) => s.selectLine)

  // 底部视图：时间轴 / 节点图谱 一键切换；图谱点击节点/连线联动定位到时间轴对应行
  const [bottomView, setBottomView] = useState<'timeline' | 'graph'>('timeline')
  // 底部时间轴 Dock 折叠（收起以把更多空间让给舞台）
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const handleFocusLine = useCallback(
    (index: number) => {
      selectLine(index)
      setBottomView('timeline')
    },
    [selectLine],
  )

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
          <Button variant="ghost" size="md" icon={<FilePlus size={14} strokeWidth={1.75} />} onClick={handleNewClick}>
            新建
          </Button>
          <Button variant="ghost" size="md" icon={<FolderOpen size={14} strokeWidth={1.75} />} onClick={handleOpen}>
            打开
          </Button>
          <Button variant="ghost" size="md" icon={<Save size={14} strokeWidth={1.75} />} onClick={handleSave}>
            保存
          </Button>
          <span className="mx-0.5 h-4 w-px bg-edge-strong/20" />
          <Button variant="outline" size="md" icon={<FileDown size={14} strokeWidth={1.75} />} onClick={handleExport}>
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
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* ===== 左 Dock：素材库（拖拽至舞台的素材源） ===== */}
            <Dock side="left" title="素材库" icon={Images} badge={assets.length} defaultOpen width={264}>
              <ManagementPanel embedded />
            </Dock>

            {/* ===== 中央核心区：舞台（绝对核心，flex-1 最大空间）+ 底部时间轴 Dock ===== */}
            <div className="flex min-w-0 flex-1 flex-col">
              <StagePreview />

              {/* 底部 Dock：时间轴 / 节点图谱（核心二，可折叠把空间让给舞台） */}
              <div
                className="flex shrink-0 flex-col border-t border-edge/10 bg-surface"
                style={{ height: bottomCollapsed ? 38 : 320, transition: 'height 200ms ease' }}
              >
                <div className="flex h-9 shrink-0 items-center gap-1 border-b border-edge/10 bg-surface/60 px-3">
                  <button
                    onClick={() => setBottomView('timeline')}
                    className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                      bottomView === 'timeline' ? 'bg-primary/[0.08] text-fg' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                    }`}
                  >
                    时间轴
                  </button>
                  <button
                    onClick={() => setBottomView('graph')}
                    className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                      bottomView === 'graph' ? 'bg-primary/[0.08] text-fg' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                    }`}
                  >
                    节点图谱
                  </button>
                  <div className="ml-auto">
                    <button
                      onClick={() => setBottomCollapsed((c) => !c)}
                      title={bottomCollapsed ? '展开时间轴' : '收起时间轴'}
                      aria-label={bottomCollapsed ? '展开时间轴' : '收起时间轴'}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      {bottomCollapsed ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
                    </button>
                  </div>
                </div>
                {!bottomCollapsed && (
                  <div className="min-h-0 flex-1">
                    {bottomView === 'timeline' ? <Timeline /> : <ScriptGraph onFocusLine={handleFocusLine} />}
                  </div>
                )}
              </div>
            </div>

            {/* ===== 右 Dock：剧本流（场景行列表，可收拉） ===== */}
            <Dock side="right" title="剧本流" icon={FileText} badge={totalLines} defaultOpen width={248}>
              <ScriptDrawer embedded />
            </Dock>

            {/* ===== 右 Dock：变量监视（内部自带标题/重置/折叠，Dock 不重复头部） ===== */}
            <Dock side="right" title="变量监视" icon={Activity} defaultOpen width={288} showHeader={false}>
              <VariableDebugger embedded />
            </Dock>

            {/* ===== 条件右 Dock：选择支编辑器（仅选中选择支行时出现） ===== */}
            {showChoiceEditor && (
              <Dock side="right" title="选择支" icon={GitBranch} defaultOpen width={320}>
                <ChoiceEditor embedded />
              </Dock>
            )}
          </div>
        )}

        {/* --- 其他页面：独立全屏视图 --- */}
        {activeNavItem === 'script-overview' && <ScriptOverview />}
        {activeNavItem === 'assets' && <AssetManager />}
        {activeNavItem === 'characters' && <CharacterManager />}
        {activeNavItem === 'effects' && <EffectsLab />}
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
