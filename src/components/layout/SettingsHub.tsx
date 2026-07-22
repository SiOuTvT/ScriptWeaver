import { useState, useCallback, useEffect } from 'react'
import { useAppStore, DEFAULT_SETTINGS } from '@/stores/appStore'
import {
  Settings, Monitor, Server, Keyboard, HardDrive,
  Trash2, RefreshCw, AlertTriangle, Check, RotateCw,
} from 'lucide-react'
import type { AppSettings, ThemeMode } from '@/stores/appStore'
import type { AIConfig } from '@/utils/aiDirector'

// ─── 标签页定义 ──────────────────────────────────────────────────
type TabId = 'storage' | 'ai-voice' | 'editor' | 'theme-perf'

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'storage', label: '存储与工程', icon: HardDrive },
  { id: 'ai-voice', label: 'AI 与语音', icon: Server },
  { id: 'editor', label: '编辑器与交互', icon: Keyboard },
  { id: 'theme-perf', label: '主题与性能', icon: Monitor },
]

// ─── 工具函数 ────────────────────────────────────────────────────
function intToString(v: number, unit: string): string {
  return `${v}${unit}`
}

const THEME_LABELS: Record<ThemeMode, string> = { dark: '暗黑', light: '浅色' }
const FPS_LABELS: Record<number, string> = { 0: '无限制', 30: '30 FPS', 60: '60 FPS' }
const DPI_OPTIONS = [1, 1.25, 1.5, 2] as const

// ─── 预设主题色 ──────────────────────────────────────────────────
const PRESET_COLORS = [
  '#eab308', // 琥珀（默认）
  '#3b82f6', // 蓝
  '#8b5cf6', // 紫
  '#ec4899', // 粉
  '#10b981', // 翠绿
  '#f97316', // 橙
  '#ef4444', // 红
  '#06b6d4', // 青
]

// ─── 子组件：编号输入 ────────────────────────────────────────────
function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  className = '',
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && v >= min && v <= max) onChange(v)
        }}
        className="w-24 rounded-md border border-edge/15 bg-surface/60 px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-primary/40 focus:bg-surface [&::-webkit-inner-spin-button]:opacity-30"
      />
      {unit && <span className="text-[12px] text-fg-faint">{unit}</span>}
    </div>
  )
}

// ─── 子组件：滑块 ────────────────────────────────────────────────
function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  marks,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  marks?: Record<number, string>
}) {
  return (
    <div className="space-y-1.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-primary"
      />
      <div className="flex items-center justify-between text-[12px] text-fg-faint">
        <span>{intToString(min, unit)}</span>
        <span className="font-medium text-fg-muted">
          {value}{unit}
        </span>
        <span>{intToString(max, unit)}</span>
      </div>
      {marks && (
        <div className="flex justify-between text-[11px] text-fg-faint/60">
          {Object.entries(marks).map(([k, v]) => (
            <span key={k}>{v}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 子组件：开关 ────────────────────────────────────────────────
function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-[13px] text-fg">{label}</p>
        {desc && <p className="mt-0.5 text-[12px] text-fg-faint">{desc}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-surface-2'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  )
}

// ─── 子组件：节标题 ──────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 mt-5 text-[13px] font-semibold uppercase tracking-wide text-fg-muted first:mt-0">{children}</h3>
}

// ─── 子组件：设置项容器 ──────────────────────────────────────────
function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] text-fg">{label}</p>
        {desc && <p className="mt-0.5 text-[12px] text-fg-faint">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// ─── 子组件：下拉 ────────────────────────────────────────────────
function Select({
  value,
  onChange,
  options,
}: {
  value: string | number
  onChange: (v: string | number) => void
  options: { value: string | number; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        // 尝试转为 number
        const num = parseFloat(v)
        onChange(isNaN(num) ? v : num)
      }}
      className="rounded-md border border-edge/15 bg-surface/60 px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-primary/40 focus:bg-surface cursor-pointer"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── 延迟输入 ────────────────────────────────────────────────────
function useDebouncedEffect(effect: () => void, deps: unknown[], delay: number) {
  const savedCb = useState(() => effect)[0]
  // use ref to track latest
  const cbRef = useState(() => effect)[0]
  ;(cbRef as unknown as Record<string, unknown>)['_'] = effect

  useEffect(() => {
    const timer = setTimeout(() => savedCb(), delay)
    return () => clearTimeout(timer)
  }, [...deps, delay])
}

// ─── AI 配置面板 ─────────────────────────────────────────────────
function AIConfigPanel() {
  const [config, setConfig] = useState<AIConfig>({
    provider: 'custom' as AIConfig['provider'],
    endpoint: '',
    apiKey: '',
    model: '',
    temperature: 0.7,
    maxTokens: 2048,
    ttsModel: 'tts-1',
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    window.electronAPI?.aiGetConfig?.().then((c) => {
      if (c) {
        setConfig({
          provider: c.provider || 'custom',
          endpoint: c.endpoint ?? '',
          apiKey: c.apiKey ?? '',
          model: c.model ?? '',
          temperature: c.temperature ?? 0.7,
          maxTokens: c.maxTokens ?? 2048,
          ttsModel: c.ttsModel ?? 'tts-1',
        })
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await window.electronAPI?.aiSetConfig?.(config)
      setSaveMsg('已保存')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }, [config])

  if (!loaded) {
    return <div className="flex items-center gap-2 py-8 text-[13px] text-fg-faint"><RefreshCw size={14} className="animate-spin" /> 加载 AI 配置中...</div>
  }

  const hasKey = config.apiKey && config.apiKey.length > 4

  return (
    <div className="space-y-1">
      <SectionTitle>服务端点</SectionTitle>
      <SettingRow label="API Base URL" desc="OpenAI / DeepSeek / OpenRouter 等兼容端点">
        <input
          type="text"
          value={config.endpoint}
          onChange={(e) => setConfig((c) => ({ ...c, endpoint: e.target.value }))}
          placeholder="https://api.openai.com/v1"
          className="w-56 rounded-md border border-edge/15 bg-surface/60 px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-primary/40 focus:bg-surface"
        />
      </SettingRow>

      <SectionTitle>API 密钥</SectionTitle>
      <SettingRow label="API Key" desc={hasKey ? `已配置 (${config.apiKey!.slice(0, 4)}${'*'.repeat(8)})` : '尚未配置'}>
        <input
          type="password"
          value={config.apiKey || ''}
          onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
          placeholder="sk-..."
          className="w-56 rounded-md border border-edge/15 bg-surface/60 px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-primary/40 focus:bg-surface"
        />
      </SettingRow>

      <SectionTitle>模型与参数</SectionTitle>
      <SettingRow label="默认模型">
        <input
          type="text"
          value={config.model}
          onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
          placeholder="gpt-4o"
          className="w-48 rounded-md border border-edge/15 bg-surface/60 px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-primary/40 focus:bg-surface"
        />
      </SettingRow>

      <SettingRow label="Temperature" desc="控制输出随机性（0=确定, 2=随性）">
        <div className="flex items-center gap-2">
          <Slider
            value={config.temperature}
            onChange={(v) => setConfig((c) => ({ ...c, temperature: v }))}
            min={0}
            max={2}
            step={0.1}
          />
        </div>
      </SettingRow>

      <SettingRow label="Max Tokens" desc="单次回复最大 token 数">
        <NumberInput
          value={config.maxTokens}
          onChange={(v) => setConfig((c) => ({ ...c, maxTokens: v }))}
          min={256}
          max={16384}
          step={256}
        />
      </SettingRow>

      <SectionTitle>TTS 语音合成</SectionTitle>
      <SettingRow label="TTS 模型">
        <Select
          value={config.ttsModel ?? 'tts-1'}
          onChange={(v) => setConfig((c) => ({ ...c, ttsModel: String(v) }))}
          options={[
            { value: 'tts-1', label: 'tts-1 (快速)' },
            { value: 'tts-1-hd', label: 'tts-1-hd (高保真)' },
          ]}
        />
      </SettingRow>

      <div className="flex items-center gap-3 pt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <><RefreshCw size={14} className="animate-spin" /> 保存中</> : <><Check size={14} /> 保存 AI 配置</>}
        </button>
        {saveMsg && (
          <span className={`text-[13px] ${saveMsg.includes('失败') ? 'text-red-400' : 'text-primary/80'}`}>{saveMsg}</span>
        )}
      </div>
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────
export default function SettingsHub() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const accentColor = useAppStore((s) => s.accentColor)
  const setAccentColor = useAppStore((s) => s.setAccentColor)
  const resetAccentColor = useAppStore((s) => s.resetAccentColor)
  const projectRoot = useAppStore((s) => s.projectRoot)

  const [activeTab, setActiveTab] = useState<TabId>('storage')
  const [clearMsg, setClearMsg] = useState('')
  const [clearing, setClearing] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)

  // 清理缓存
  const handleClearCache = useCallback(async () => {
    setClearing(true)
    setClearMsg('')
    try {
      await window.electronAPI?.clearLocalCache?.()
      setClearMsg('缓存已清理')
      setTimeout(() => setClearMsg(''), 3000)
    } catch {
      setClearMsg('清理失败')
    } finally {
      setClearing(false)
    }
  }, [])

  // 重置所有设置
  const handleResetSettings = useCallback(() => {
    updateSettings({ ...DEFAULT_SETTINGS })
    resetAccentColor()
    setResetConfirm(false)
  }, [updateSettings, resetAccentColor])

  const patch = useCallback(
    (p: Partial<AppSettings>) => updateSettings(p),
    [updateSettings],
  )

  const currentTab = TABS.find((t) => t.id === activeTab)!

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* 顶部标题栏 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-edge/10 bg-surface/70 px-5 py-3 backdrop-blur-md">
        <Settings size={17} strokeWidth={1.75} className="text-primary/70" />
        <span className="text-[14px] font-semibold text-fg">设置中心</span>
        <span className="text-[12px] text-fg-faint">{currentTab.label}</span>
        <span className="flex-1" />
        <button
          onClick={handleResetSettings}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <RotateCw size={13} strokeWidth={1.75} />
          重置所有设置
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 左侧标签导航 */}
        <aside className="flex w-40 shrink-0 flex-col border-r border-edge/10 bg-surface/20 py-3">
          <nav className="flex flex-col gap-0.5 px-2">
            {TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all ${
                    active
                      ? 'signal-bar bg-primary/[0.08] text-fg font-medium'
                      : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
                  }`}
                >
                  <tab.icon size={15} strokeWidth={1.75} className={active ? 'text-primary' : 'text-fg-faint'} />
                  <span className="truncate">{tab.label}</span>
                </button>
              )
            })}
          </nav>

          {/* 快捷键入口 */}
          <div className="mt-auto border-t border-edge/10 px-3 pt-3">
            <p className="text-[11px] text-fg-faint leading-relaxed">
              提示：快捷键可在「编辑器与交互」中查看映射表
            </p>
          </div>
        </aside>

        {/* 右侧设置内容 */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-2xl px-8 py-6">

            {/* ═══ 存储与工程 ═══ */}
            {activeTab === 'storage' && (
              <div>
                <SectionTitle>工程路径</SectionTitle>
                <SettingRow
                  label="当前工程目录"
                  desc={projectRoot || '尚未保存'}
                >
                  <span className="text-[13px] text-fg-muted">
                    {projectRoot || '尚未保存'}
                  </span>
                </SettingRow>

                <SectionTitle>缓存与临时文件</SectionTitle>
                <SettingRow
                  label="本地缓存清理"
                  desc="清除快照、临时文件等本地缓存数据"
                >
                  <button
                    onClick={handleClearCache}
                    disabled={clearing}
                    className="flex items-center gap-1.5 rounded-md bg-surface-2 px-3 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                  >
                    {clearing ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={1.75} />}
                    {clearing ? '清理中...' : '一键清理'}
                  </button>
                </SettingRow>
                {clearMsg && (
                  <p className={`mt-1 text-right text-[12px] ${clearMsg.includes('失败') ? 'text-red-400' : 'text-primary/80'}`}>
                    {clearMsg}
                  </p>
                )}

                <SectionTitle>危险操作</SectionTitle>
                <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-red-400/70" />
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-fg">重置所有设置</p>
                      <p className="mt-1 text-[12px] text-fg-muted leading-relaxed">
                        将所有设置（编辑器、AI、主题、性能）恢复为默认值。此操作不可撤销。
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        {!resetConfirm ? (
                          <button
                            onClick={() => setResetConfirm(true)}
                            className="rounded-md border border-red-400/30 px-3 py-1.5 text-[13px] text-red-400/80 transition-colors hover:bg-red-400/10"
                          >
                            重置所有设置
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={handleResetSettings}
                              className="rounded-md bg-red-500 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500/90"
                            >
                              确认重置
                            </button>
                            <button
                              onClick={() => setResetConfirm(false)}
                              className="rounded-md border border-edge/15 px-3 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-surface-hover"
                            >
                              取消
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ AI 与语音 ═══ */}
            {activeTab === 'ai-voice' && (
              <div>
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/10 bg-primary/[0.03] p-3">
                  <Server size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-primary/60" />
                  <p className="text-[12px] text-fg-muted leading-relaxed">
                    AI 配置存储在本地加密文件中，不会随工程分享。修改后点击「保存 AI 配置」使设置生效。
                  </p>
                </div>
                <AIConfigPanel />

                <SectionTitle>高级 AI 设置</SectionTitle>
                <Toggle
                  checked={settings.streamingEnabled}
                  onChange={(v) => patch({ streamingEnabled: v })}
                  label="启用流式输出"
                  desc="AI 逐字输出响应，提升交互感"
                />
                <SettingRow label="总超时" desc="AI 请求最长等待时间">
                  <NumberInput
                    value={settings.timeoutTotalMs / 1000}
                    onChange={(v) => patch({ timeoutTotalMs: v * 1000 })}
                    min={10}
                    max={600}
                    unit="秒"
                  />
                </SettingRow>
                <SettingRow label="静默断流超时" desc="无数据时间超过此值视为连接中断">
                  <NumberInput
                    value={settings.timeoutStallMs / 1000}
                    onChange={(v) => patch({ timeoutStallMs: v * 1000 })}
                    min={5}
                    max={120}
                    unit="秒"
                  />
                </SettingRow>
              </div>
            )}

            {/* ═══ 编辑器与交互 ═══ */}
            {activeTab === 'editor' && (
              <div>
                <SectionTitle>保存与备份</SectionTitle>
                <SettingRow label="自动保存间隔" desc="编辑停下后，草稿自动写入本地缓存的时间">
                  <div className="w-56">
                    <Slider
                      value={settings.autoSaveIntervalMs / 1000}
                      onChange={(v) => patch({ autoSaveIntervalMs: v * 1000 })}
                      min={0.5}
                      max={5}
                      step={0.5}
                      unit="秒"
                    />
                  </div>
                </SettingRow>
                <SettingRow label="静默备份间隔" desc="自动创建防丢稿备份快照的时间">
                  <div className="w-56">
                    <Slider
                      value={settings.snapshotIntervalMin}
                      onChange={(v) => patch({ snapshotIntervalMin: v })}
                      min={1}
                      max={15}
                      step={1}
                      unit="分钟"
                    />
                  </div>
                </SettingRow>

                <SectionTitle>撤销与重做</SectionTitle>
                <SettingRow label="撤销/重做最大深度" desc="历史记录保留的最大步数（越小内存占用越低）">
                  <NumberInput
                    value={settings.undoMaxDepth}
                    onChange={(v) => patch({ undoMaxDepth: v })}
                    min={10}
                    max={500}
                    step={10}
                  />
                </SettingRow>

                <SectionTitle>时间轴行为</SectionTitle>
                <SettingRow label="吸附灵敏度" desc="时间轴拖拽时的吸附阈值（像素）">
                  <NumberInput
                    value={settings.timelineSnapPx}
                    onChange={(v) => patch({ timelineSnapPx: v })}
                    min={1}
                    max={20}
                    unit="px"
                  />
                </SettingRow>

                <SectionTitle>快捷键映射表</SectionTitle>
                <div className="overflow-hidden rounded-lg border border-edge/10">
                  <table className="w-full text-[13px]">
                    <thead className="bg-surface/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-fg-muted">操作</th>
                        <th className="px-3 py-2 text-left font-medium text-fg-muted">快捷键</th>
                        <th className="px-3 py-2 text-left font-medium text-fg-muted">作用域</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge/5">
                      {[
                        ['撤销', 'Ctrl + Z', '全局'],
                        ['重做', 'Ctrl + Y / Ctrl + Shift + Z', '全局'],
                        ['保存项目', 'Ctrl + S', '全局'],
                        ['新建项目', 'Ctrl + N', '全局'],
                        ['打开项目', 'Ctrl + O', '全局'],
                        ['导出 RPY', 'Ctrl + E', '全局'],
                        ['删除选中元素/行', 'Delete / Backspace', '舞台 / 时间轴'],
                        ['选中上一行', '↑', '时间轴'],
                        ['选中下一行', '↓', '时间轴'],
                        ['切换深色/浅色模式', '点击 Sun/Moon 图标', '工具栏'],
                      ].map(([action, key, scope], i) => (
                        <tr key={i} className="transition-colors hover:bg-surface/30">
                          <td className="px-3 py-2 text-fg">{action}</td>
                          <td className="px-3 py-2">
                            <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg-muted border border-edge/10">
                              {key}
                            </kbd>
                          </td>
                          <td className="px-3 py-2 text-fg-faint">{scope}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[12px] text-fg-faint">
                  当前版本快捷键不可自定义，后续将支持自定义映射。
                </p>
              </div>
            )}

            {/* ═══ 主题与性能 ═══ */}
            {activeTab === 'theme-perf' && (
              <div>
                <SectionTitle>外观主题</SectionTitle>
                <SettingRow label="主题模式">
                  <div className="flex rounded-lg border border-edge/10 bg-surface/40 p-0.5">
                    {(['dark', 'light'] as ThemeMode[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                          theme === t
                            ? 'bg-surface shadow-sm text-fg font-medium'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {THEME_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="强调色" desc="面板高亮、选中态、按钮的主色调">
                  <div className="flex items-center gap-1.5">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setAccentColor(color)}
                        className={`h-5 w-5 rounded-full border-2 transition-shadow ${
                          accentColor === color
                            ? 'border-white shadow-md scale-110 ring-2 ring-primary/30'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <span className="mx-1 h-5 w-px bg-edge/15" />
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => {
                          const v = e.target.value
                          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setAccentColor(v)
                        }}
                        className="w-18 rounded border border-edge/15 bg-surface/60 px-2 py-0.5 font-mono text-[12px] text-fg-muted outline-none transition-colors focus:border-primary/40"
                      />
                    </div>
                  </div>
                </SettingRow>

                <SectionTitle>渲染性能</SectionTitle>
                <Toggle
                  checked={settings.hwAcceleration}
                  onChange={(v) => patch({ hwAcceleration: v })}
                  label="GPU 硬件加速"
                  desc="关闭后使用软件渲染（需重启生效）"
                />

                <SettingRow label="舞台帧率限制" desc="限制舞台预览的刷新率以节省资源">
                  <Select
                    value={settings.framerateLimit}
                    onChange={(v) => patch({ framerateLimit: Number(v) })}
                    options={[
                      { value: 0, label: '无限制' },
                      { value: 30, label: '30 FPS' },
                      { value: 60, label: '60 FPS' },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="高 DPI 缩放适配" desc="调整界面在高分辨率屏幕上的显示比例">
                  <Select
                    value={settings.highDpiScale}
                    onChange={(v) => patch({ highDpiScale: Number(v) })}
                    options={[
                      { value: 1, label: '100%' },
                      { value: 1.25, label: '125%' },
                      { value: 1.5, label: '150%' },
                      { value: 2, label: '200% (Retina)' },
                    ]}
                  />
                </SettingRow>

                <p className="mt-4 text-[12px] text-fg-faint leading-relaxed">
                  GPU 加速与高 DPI 缩放修改后需要重启应用才能完全生效。主题与强调色修改即时生效。
                </p>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
