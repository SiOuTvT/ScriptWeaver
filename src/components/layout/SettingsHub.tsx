import { useState, useCallback, useEffect } from 'react'
import { useAppStore, DEFAULT_SETTINGS } from '../../stores/appStore'
import { applyPreset, type AIProvider } from '../../utils/aiDirector'
import { Button } from '@/components/ui'
import { ClearCacheButton } from './ClearCacheButton'
import ThemeSettings from './ThemeSettings'
import { toast } from '../../utils/toast'
import {
  Settings, Palette, Key, Database, Save, RotateCcw, Eye, EyeOff, Info, RefreshCw, Loader2,
} from 'lucide-react'

type SectionId = 'general' | 'appearance' | 'ai' | 'data'

interface SettingSection {
  id: SectionId
  label: string
  icon: typeof Settings
}

const SECTIONS: SettingSection[] = [
  { id: 'general', label: '通用', icon: Settings },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'ai', label: 'AI 配置', icon: Key },
  { id: 'data', label: '数据与缓存', icon: Database },
]

/** 轻量开关（项目无现成 Switch 原子，自建并与主题色体系一致） */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-surface-3 border border-edge/10'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

/** 滑块行：标签 + 说明 + 当前值 + range */
function SliderRow({
  label, desc, value, min, max, step, display, onChange,
}: {
  label: string
  desc?: string
  value: number
  min: number
  max: number
  step: number
  display?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-edge/10 bg-surface-2 shadow-1">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] font-medium text-fg">{label}</div>
          {desc && <div className="text-[12px] text-fg-muted mt-0.5">{desc}</div>}
        </div>
        <span className="text-[12px] text-fg-muted tabular-nums">
          {display ? display(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  )
}

export default function SettingsHub() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const [activeSection, setActiveSection] = useState<SectionId>('general')

  // 当前数据目录（默认 D 盘，绝不默认 C 盘；仅供展示，让用户确认存储位置）
  const [dataDir, setDataDir] = useState('')
  useEffect(() => {
    window.electronAPI?.getPath('userData')
      .then((p) => setDataDir(p || ''))
      .catch(() => setDataDir(''))
  }, [])

  // AI Config（密钥存于主进程安全区，经 IPC 读写；getConfig 返回已脱敏 apiKey='' + hasApiKey）
  const [apiKey, setApiKey] = useState('')
  const [hasStoredKey, setHasStoredKey] = useState(false)
  const [provider, setProvider] = useState<AIProvider>('openai')
  const [apiEndpoint, setApiEndpoint] = useState('https://api.openai.com/v1/chat/completions')
  const [model, setModel] = useState('gpt-4o-mini')
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const config = await (window as any).electronAPI?.aiGetConfig?.()
        if (config?.hasApiKey) setHasStoredKey(true)
        if (config?.provider) setProvider(config.provider)
        if (config?.endpoint) setApiEndpoint(config.endpoint)
        if (config?.model) setModel(config.model)
      } catch { /* ignore */ }
    })()
  }, [])

  // 从厂商实时拉取可用模型列表（不写死模型名）
  const handleFetchModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const r = await (window as any).electronAPI?.aiListModels?.()
      if (r?.success && Array.isArray(r.models)) {
        setModels(r.models as string[])
      } else {
        setModelsError(r?.error ?? '拉取模型列表失败')
      }
    } catch {
      setModelsError('拉取模型列表失败')
    } finally {
      setModelsLoading(false)
    }
  }, [])
  // 已配置密钥时自动拉取一次
  useEffect(() => {
    if (hasStoredKey) void handleFetchModels()
  }, [hasStoredKey, handleFetchModels])

  const handleSave = useCallback(() => {
    // 密钥留空 = 保留主进程已存密钥（writeAIConfig 约定），端点/模型始终保存
    ;(window as any).electronAPI?.aiSetConfig?.({
      apiKey,
      provider,
      endpoint: apiEndpoint,
      model,
    }).then(() => {
      if (apiKey) setHasStoredKey(true)
      setApiKey('')
    }).catch(() => {})
    toast?.('设置已保存', 'success')
  }, [apiKey, apiEndpoint, model])

  const handleReset = () => {
    updateSettings({ ...DEFAULT_SETTINGS })
    toast?.('已恢复默认设置', 'info')
  }

  const activeCfg = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]

  return (
    <div className="flex h-full flex-1 min-w-0">
      {/* Left Nav */}
      <div className="flex w-[180px] shrink-0 flex-col border-r border-edge/10">
        <div className="border-b border-edge/10 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">Settings</span>
          </div>
          <h2 className="t-h2 mt-1.5">设置</h2>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const active = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? 'bg-primary/[0.06] text-fg'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon size={15} />
                {section.label}
              </button>
            )
          })}
        </nav>
        <div className="space-y-2 border-t border-edge/10 px-3 py-3">
          <button
            onClick={handleSave}
            className="btn-primary-sm w-full"
          >
            <Save size={13} />
            保存设置
          </button>
          <button
            onClick={handleReset}
            className="btn-ghost-sm w-full"
          >
            <RotateCcw size={13} />
            恢复默认
          </button>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto bg-canvas">
        <div className="px-5 py-5">
          <div className="mb-5">
            <h2 className="t-title">{activeCfg.label} 设置</h2>
            <p className="mt-0.5 text-[12px] text-fg-muted">调整 ScriptWeaver 的基本配置与偏好</p>
          </div>

          {/* ── 通用 ─────────────────────────────────── */}
          {activeSection === 'general' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-4">编辑器</h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <SliderRow
                    label="自动保存防抖间隔"
                    desc="编辑暂停后多久无改动才自动写入"
                    value={settings.autoSaveIntervalMs}
                    min={200}
                    max={3000}
                    step={100}
                    display={(v) => `${v} ms`}
                    onChange={(v) => updateSettings({ autoSaveIntervalMs: v })}
                  />
                  <SliderRow
                    label="长会话安全备份间隔"
                    desc="内容有变化时每隔多久自动备份一次（兜底崩溃断电；退出软件时也会备份，不会频繁建档）"
                    value={settings.snapshotIntervalMin}
                    min={1}
                    max={120}
                    step={1}
                    display={(v) => `每 ${v} 分钟`}
                    onChange={(v) => updateSettings({ snapshotIntervalMin: v })}
                  />
                  <SliderRow
                    label="撤销深度"
                    desc="可撤销 / 重做的最大步数"
                    value={settings.undoMaxDepth}
                    min={10}
                    max={200}
                    step={10}
                    display={(v) => `${v} 步`}
                    onChange={(v) => updateSettings({ undoMaxDepth: v })}
                  />
                </div>
              </section>
            </div>
          )}

          {/* ── 外观 ─────────────────────────────────── */}
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <section className="space-y-4">
                <div>
                  <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-2">外观与主题色</h3>
                  <p className="text-[12px] text-fg-muted">
                    调整界面主色、明暗模式与主题预设，实时预览双语境效果（更改需点「保存」生效）。
                  </p>
                </div>
                <ThemeSettings embedded />
              </section>
            </div>
          )}

          {/* ── AI 配置 ───────────────────────────────── */}
          {activeSection === 'ai' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-4">API 配置</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* API Key */}
                  <div className="px-4 py-3 rounded-xl border border-edge/10 bg-surface-2 shadow-1">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[13px] font-medium text-fg">API Key</label>
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="text-fg-muted hover:text-fg transition-colors"
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={hasStoredKey ? '已保存（留空则保留现有密钥）' : 'sk-...'}
                        className="w-full rounded-xl border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg font-mono placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                    <p className="mt-1.5 text-[12px] text-fg-faint">
                      <Info size={11} className="inline mr-1" />
                      {hasStoredKey ? '密钥已存于本地安全区，不会回显' : '密钥加密存储在本地'}
                    </p>
                  </div>

                  {/* Provider 厂商选择 */}
                  <div className="px-4 py-3 rounded-xl border border-edge/10 bg-surface-2 shadow-1">
                    <label className="text-[13px] font-medium text-fg block mb-2">厂商（Provider）</label>
                    <select
                      value={provider}
                      onChange={(e) => {
                        const p = e.target.value as AIProvider
                        setProvider(p)
                        if (p !== 'custom') {
                          const preset = applyPreset(
                            { provider, endpoint: apiEndpoint, apiKey, model, temperature: 0.7, maxTokens: 2000 },
                            p,
                          )
                          setApiEndpoint(preset.endpoint)
                          setModel(preset.model)
                        }
                      }}
                      className="w-full rounded-xl border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="qwen">通义千问（阿里云百炼）</option>
                      <option value="glm">智谱 GLM</option>
                      <option value="openrouter">OpenRouter（可接 Claude 等）</option>
                      <option value="custom">自定义（手动填端点）</option>
                    </select>
                    <p className="mt-1.5 text-[12px] text-fg-faint">选厂商会自动填入对应端点与模型；也可以选自定义后手动修改</p>
                  </div>

                  {/* Endpoint */}
                  <div className="px-4 py-3 rounded-xl border border-edge/10 bg-surface-2 shadow-1">
                    <label className="text-[13px] font-medium text-fg block mb-2">API 端点</label>
                    <input
                      type="text"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full rounded-xl border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg font-mono placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <p className="mt-1.5 text-[12px] text-fg-faint">支持 OpenAI 兼容 API</p>
                  </div>

                  {/* Model：从厂商实时拉取，不写死 */}
                  <div className="px-4 py-3 rounded-xl border border-edge/10 bg-surface-2 shadow-1">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[13px] font-medium text-fg block">模型</label>
                      <button
                        type="button"
                        onClick={() => void handleFetchModels()}
                        disabled={modelsLoading}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[12px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                      >
                        {modelsLoading ? <Loader2 size={12} strokeWidth={1.75} className="animate-spin" /> : <RefreshCw size={12} strokeWidth={1.75} />}
                        {models.length > 0 ? '刷新模型列表' : '拉取模型列表'}
                      </button>
                    </div>
                    {models.length > 0 ? (
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full rounded-xl border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-primary/30"
                      >
                        {model && !models.includes(model) && (
                          <option value={model}>{model}（当前）</option>
                        )}
                        {models.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="配置厂商与密钥后，点上方拉取可用模型"
                        className="w-full rounded-xl border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    )}
                    {modelsError ? (
                      <p className="mt-1.5 text-[12px] text-danger/90">{modelsError}</p>
                    ) : (
                      <p className="mt-1.5 text-[12px] text-fg-faint">模型列表从当前厂商实时拉取，不在软件里写死</p>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-4">请求与超时</h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <label className="flex items-center justify-between px-4 py-3 rounded-xl border border-edge/10 bg-surface-2 shadow-1">
                    <div>
                      <div className="text-[13px] font-medium text-fg">流式输出</div>
                      <div className="text-[12px] text-fg-muted mt-0.5">逐字流式生成；关闭则等待整段返回</div>
                    </div>
                    <Toggle
                      checked={settings.streamingEnabled}
                      onChange={(v) => updateSettings({ streamingEnabled: v })}
                    />
                  </label>
                  <SliderRow
                    label="总超时"
                    desc="单次请求最长等待时间"
                    value={settings.timeoutTotalMs}
                    min={30_000}
                    max={600_000}
                    step={1_000}
                    display={(v) => `${Math.round(v / 1000)} 秒`}
                    onChange={(v) => updateSettings({ timeoutTotalMs: v })}
                  />
                  <SliderRow
                    label="静默断流超时"
                    desc="流式过程中多久无数据即判定断流"
                    value={settings.timeoutStallMs}
                    min={5_000}
                    max={120_000}
                    step={1_000}
                    display={(v) => `${Math.round(v / 1000)} 秒`}
                    onChange={(v) => updateSettings({ timeoutStallMs: v })}
                  />
                </div>
              </section>
            </div>
          )}

          {/* ── 数据与缓存 ───────────────────────────── */}
          {activeSection === 'data' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-4">存储位置</h3>
                <div className="px-5 py-5 rounded-xl border border-edge/10 bg-surface-2 shadow-1">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-[14px] font-medium text-fg">应用数据目录</div>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary">默认不存 C 盘</span>
                  </div>
                  <div className="text-[12px] text-fg-muted mt-1 break-all">
                    缓存、版本快照、AI 配置、测试运行暂存等全部默认保存到 D 盘，不会写入系统盘
                    {dataDir && (
                      <span className="mt-2 block font-mono text-[12px] text-fg-subtle bg-surface-3/60 rounded-lg px-3 py-2 border border-edge/10">
                        {dataDir}
                      </span>
                    )}
                    {!dataDir && <span className="mt-2 block text-[12px] text-fg-subtle">正在读取…</span>}
                  </div>
                  <div className="text-[12px] text-fg-faint mt-3">
                    如需自定义位置，可设置环境变量 SW_DATA_DIR 指向任意目录。
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-4">本地缓存</h3>
                <div className="px-5 py-5 rounded-xl border border-edge/10 bg-surface-2 shadow-1 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[14px] font-medium text-fg">清除本地缓存</div>
                    <div className="text-[12px] text-fg-muted mt-1">
                      删除版本快照与本地草稿，重置为纯净白板（素材文件不受影响）。
                    </div>
                  </div>
                  <ClearCacheButton />
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
