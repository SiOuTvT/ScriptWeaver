import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Database, Cpu, Palette, Monitor, Save, Clock,
  History, Gauge, FolderOpen, Server, Radio, Timer
} from 'lucide-react'
import { useAppStore, type AppSettings } from '@/stores/appStore'
import { DEFAULT_ACCENT } from '@/utils/themeColor'
import { toast } from '@/utils/toast'

// ─── 设置分类 ───────────────────────────────────────────
interface SettingTab {
  id: string
  label: string
  icon: typeof Settings
  description: string
}

const TABS: SettingTab[] = [
  { id: 'storage',    label: '存储与项目',  icon: Database,    description: '项目路径、缓存管理与数据持久化' },
  { id: 'ai',         label: 'AI 与语音',   icon: Cpu,         description: '流式输出、请求超时与连接控制' },
  { id: 'editor',     label: '编辑器',      icon: Monitor,    description: '自动保存、快照策略与撤销深度' },
  { id: 'appearance', label: '主题与性能',   icon: Palette,    description: '外观主题、配色偏好与渲染优化' },
]

// ─── 表单控件组件 ──────────────────────────────────────

function SettingGroup({ label, icon: Icon, children }: { label: string; icon: typeof Settings; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-fg-muted" />
        <span className="text-xs font-medium text-fg-muted uppercase tracking-[0.08em]">{label}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg
      hover:bg-surface-hover/40 transition-colors group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg-default leading-snug">{label}</p>
        {hint && <p className="text-xs text-fg-faint mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full
        transition-colors duration-200 focus:outline-none border-2 border-transparent"
      style={{ backgroundColor: checked ? 'rgb(var(--c-primary) / 0.85)' : 'rgb(var(--c-edge) / 0.22)' }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
          transition-transform duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  )
}

function SliderField({ value, min, max, step, unit, onChange }: {
  value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="theme-hue w-24"
      />
      <span className="text-xs font-medium tabular-nums text-fg-muted w-16 text-right">
        {value}{unit}
      </span>
    </div>
  )
}

// ─── 主页面 ────────────────────────────────────────────

export default function SettingsHub() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const accentColor = useAppStore((s) => s.accentColor)
  const setAccentColor = useAppStore((s) => s.setAccentColor)
  const resetAccentColor = useAppStore((s) => s.resetAccentColor)

  const [activeTab, setActiveTab] = useState('storage')
  const [clearing, setClearing] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [pickingPath, setPickingPath] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    ;(async () => {
      try {
        const documents = await api.getPath?.('documents')
        setProjectPath(documents || '')
      } catch { /* ignore */ }
    })()
  }, [])

  const handleClearCache = useCallback(async () => {
    setClearing(true)
    try {
      const api = window.electronAPI
      const result = await api?.clearLocalCache?.()
      if (result?.success) {
        toast('缓存已清除', 'success')
      } else {
        toast(result?.error || '清除失败', 'error')
      }
    } catch {
      toast('清除缓存失败，请重试', 'error')
    } finally {
      setClearing(false)
    }
  }, [])

  const handlePickPath = useCallback(async () => {
    setPickingPath(true)
    try {
      const api = window.electronAPI
      const result = await api?.getPath?.('documents')
      if (result) setProjectPath(result)
    } catch { /* ignore */ }
    setPickingPath(false)
  }, [])

  const patch = useCallback((partial: Partial<AppSettings>) => {
    updateSettings(partial)
  }, [updateSettings])

  const currentTab = TABS.find((t) => t.id === activeTab)!

  return (
    <div className="flex h-full select-none">
      {/* 左侧标签导航 */}
      <div className="w-56 shrink-0 border-r border-edge/8 flex flex-col bg-surface/50">
        <div className="px-4 pt-4 pb-3">
          <h2 className="text-sm font-semibold text-fg-default">设置</h2>
          <p className="text-xs text-fg-faint mt-0.5">配置 ScriptWeaver 运行参数</p>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors
                  ${active
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-fg-muted hover:bg-surface-hover/60 border border-transparent'
                  }`}
              >
                <Icon size={15} className={active ? 'text-primary' : 'text-fg-faint'} />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="px-4 py-3 border-t border-edge/6">
          <p className="text-xs text-fg-faint">更改将立即生效并自动保存</p>
        </div>
      </div>

      {/* 右侧设置内容 */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* 顶部标题 */}
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-edge/6">
          <currentTab.icon size={18} className="text-primary" />
          <div>
            <h3 className="text-base font-semibold text-fg-default">{currentTab.label}</h3>
            <p className="text-xs text-fg-faint mt-0.5">{currentTab.description}</p>
          </div>
        </div>

        {/* ─── 存储与项目 ────────────────────────── */}
        {activeTab === 'storage' && (
          <div className="max-w-lg">
            <SettingGroup label="项目存储" icon={FolderOpen}>
              <SettingRow label="项目默认路径" hint="新建项目与另存为时的默认文件夹">
                <button
                  onClick={handlePickPath}
                  disabled={pickingPath}
                  className="text-xs text-fg-subtle hover:text-primary transition-colors px-2 py-1 rounded
                    hover:bg-surface-hover/60 disabled:opacity-50"
                >
                  选择文件夹...
                </button>
              </SettingRow>
              {projectPath && (
                <div className="px-3 pb-2">
                  <p className="text-xs font-mono text-fg-faint bg-surface-3/40 rounded px-2 py-1 truncate">
                    {projectPath}
                  </p>
                </div>
              )}
            </SettingGroup>

            <SettingGroup label="缓存管理" icon={Database}>
              <SettingRow label="清除本地缓存" hint="清理快照缓存与临时文件，释放磁盘空间。项目数据不受影响">
                <button
                  onClick={handleClearCache}
                  disabled={clearing}
                  className="text-xs px-3 py-1.5 rounded-md border border-danger/30 text-danger
                    hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearing ? '清除中...' : '立即清除'}
                </button>
              </SettingRow>
              <div className="px-3 pb-2">
                <p className="text-xs text-fg-faint">
                  本地缓存包含版本快照与 AI 对话历史。清除后下一次保存时将从项目数据重建。
                </p>
              </div>
            </SettingGroup>
          </div>
        )}

        {/* ─── AI 与语音 ──────────────────────────── */}
        {activeTab === 'ai' && (
          <div className="max-w-lg">
            <SettingGroup label="连接控制" icon={Server}>
              <SettingRow label="流式输出" hint="实时逐字输出 AI 对话内容，关闭则等待完整回复后一次性显示">
                <Switch
                  checked={settings.streamingEnabled}
                  onChange={(v) => patch({ streamingEnabled: v })}
                />
              </SettingRow>
              <SettingRow label="请求总超时" hint="单次 AI 请求从发起到完成的全局最大等待时间">
                <SliderField
                  value={Math.round(settings.timeoutTotalMs / 1000)}
                  min={30} max={300} step={30} unit="s"
                  onChange={(v) => patch({ timeoutTotalMs: v * 1000 })}
                />
              </SettingRow>
              <SettingRow label="静默断流检测" hint="连接无数据超过此时间即判定断流并报错">
                <SliderField
                  value={Math.round(settings.timeoutStallMs / 1000)}
                  min={10} max={120} step={10} unit="s"
                  onChange={(v) => patch({ timeoutStallMs: v * 1000 })}
                />
              </SettingRow>
            </SettingGroup>

            <SettingGroup label="密钥与接口" icon={Timer}>
              <div className="px-3">
                <p className="text-xs text-fg-faint leading-relaxed">
                  AI 接口端点与密钥由主进程安全区托管，无法在此处直接修改。
                  如需更换模型或密钥，请在左侧 AI 编剧抽屉中配置。
                </p>
              </div>
            </SettingGroup>
          </div>
        )}

        {/* ─── 编辑器 ──────────────────────────────── */}
        {activeTab === 'editor' && (
          <div className="max-w-lg">
            <SettingGroup label="自动保存" icon={Save}>
              <SettingRow label="自动保存间隔" hint="编辑停止后自动保存的等待时间，单位为秒">
                <SliderField
                  value={Math.round(settings.autoSaveIntervalMs / 100) / 10}
                  min={0.1} max={10} step={0.1} unit="s"
                  onChange={(v) => patch({ autoSaveIntervalMs: Math.round(v * 1000) })}
                />
              </SettingRow>
            </SettingGroup>

            <SettingGroup label="版本快照" icon={Clock}>
              <SettingRow label="快照间隔" hint="自动创建项目历史快照的时间间隔">
                <SliderField
                  value={settings.snapshotIntervalMin}
                  min={1} max={60} step={1} unit="min"
                  onChange={(v) => patch({ snapshotIntervalMin: v })}
                />
              </SettingRow>
            </SettingGroup>

            <SettingGroup label="历史记录" icon={History}>
              <SettingRow label="撤销深度" hint="最多可撤销的历史操作步数，超过上限自动清理旧记录">
                <SliderField
                  value={settings.undoMaxDepth}
                  min={10} max={200} step={10} unit="步"
                  onChange={(v) => patch({ undoMaxDepth: v })}
                />
              </SettingRow>
            </SettingGroup>

            <SettingGroup label="时间轴" icon={Monitor}>
              <SettingRow label="场景行吸附距离" hint="拖拽时间轴场景行时自动对齐的像素偏差阈值">
                <SliderField
                  value={settings.timelineSnapPx}
                  min={1} max={20} step={1} unit="px"
                  onChange={(v) => patch({ timelineSnapPx: v })}
                />
              </SettingRow>
            </SettingGroup>
          </div>
        )}

        {/* ─── 主题与性能 ──────────────────────────── */}
        {activeTab === 'appearance' && (
          <div className="max-w-lg">
            <SettingGroup label="外观主题" icon={Palette}>
              <SettingRow label="主题模式" hint="浅色模式适合白天使用，深色模式适合暗光环境">
                <div className="flex rounded-md border border-edge/12 overflow-hidden">
                  {(['light', 'dark'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTheme(mode)}
                      className={`px-3 py-1 text-xs font-medium transition-colors
                        ${theme === mode
                          ? 'bg-primary/15 text-primary'
                          : 'text-fg-muted hover:bg-surface-hover/60'
                        }`}
                    >
                      {mode === 'light' ? '浅色' : '深色'}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow label="强调色" hint="界面按钮、链接与选中态的色调">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-8 h-8 rounded-md cursor-pointer border border-edge/12 bg-transparent p-0.5"
                  />
                  <button
                    onClick={resetAccentColor}
                    className="text-xs text-fg-faint hover:text-fg-muted transition-colors"
                  >
                    重置
                  </button>
                </div>
              </SettingRow>
            </SettingGroup>

            <SettingGroup label="性能与渲染" icon={Gauge}>
              <SettingRow label="GPU 硬件加速" hint="启用硬件加速渲染，可显著提升界面流畅度">
                <Switch
                  checked={settings.hwAcceleration}
                  onChange={(v) => patch({ hwAcceleration: v })}
                />
              </SettingRow>
              <SettingRow label="帧率上限" hint="限制渲染帧率以降低 GPU 功耗和发热">
                <SliderField
                  value={settings.framerateLimit}
                  min={30} max={144} step={1} unit="fps"
                  onChange={(v) => patch({ framerateLimit: v })}
                />
              </SettingRow>
              <SettingRow label="DPI 缩放" hint="调整界面元素大小，适配高分辨率显示器">
                <SliderField
                  value={Math.round(settings.highDpiScale * 100)}
                  min={75} max={200} step={25} unit="%"
                  onChange={(v) => patch({ highDpiScale: v / 100 })}
                />
              </SettingRow>
            </SettingGroup>
          </div>
        )}
      </div>
    </div>
  )
}
