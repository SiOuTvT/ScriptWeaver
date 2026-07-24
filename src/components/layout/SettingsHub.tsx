import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { toast } from '../../utils/toast'
import {
  Settings, Key, Save, RotateCcw, Eye, EyeOff, Info
} from 'lucide-react'

interface SettingSection {
  id: string; label: string; icon: typeof Settings
}

const SECTIONS: SettingSection[] = [
  { id: 'general', label: '通用', icon: Settings },
  { id: 'ai', label: 'AI 配置', icon: Key },
]

export default function SettingsHub() {

  // AI Config
  const [apiKey, setApiKey] = useState('')
  const [apiEndpoint, setApiEndpoint] = useState('https://api.openai.com/v1')
  const [model, setModel] = useState('gpt-4')
  const [showKey, setShowKey] = useState(false)

  // Project
  const [autoSave, setAutoSave] = useState(true)
  const [autoSaveInterval, setAutoSaveInterval] = useState(5)

  // Active section
  const [activeSection, setActiveSection] = useState('general')
  const activeCfg = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]

  // Load existing config on mount
  useEffect(() => {
    ;(async () => {
      try {
        const config = await (window as any).electronAPI?.aiGetConfig?.()
        if (config?.apiKey) setApiKey(config.apiKey)
        if (config?.baseURL) setApiEndpoint(config.baseURL)
        if (config?.model) setModel(config.model)
      } catch { /* ignore */ }
    })()
  }, [])

  const handleSave = useCallback(() => {
    // Save AI config
    if (apiKey) {
      ;(window as any).electronAPI?.aiSetConfig?.({
        apiKey,
        baseURL: apiEndpoint,
        model,
      }).catch(() => {})
    }
    toast?.('设置已保存', 'success')
  }, [apiKey, apiEndpoint, model])

  const handleReset = () => {
    setAutoSave(true)
    setAutoSaveInterval(5)
    toast?.('已恢复默认设置', 'info')
  }

  return (
    <div className="flex h-full flex-1 min-w-0 select-none">
      {/* Left Nav */}
      <div className="w-[180px] shrink-0 border-r border-edge/10 flex flex-col">
        <div className="px-4 py-5 border-b border-edge/10">
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-fg-muted" />
            <span className="text-[14px] font-semibold text-fg">设置</span>
          </div>
        </div>
        <div className="flex-1 py-3 px-2 space-y-1">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const active = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary border border-primary/15'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-2/60 border border-transparent'
                }`}
              >
                <Icon size={15} />
                {section.label}
              </button>
            )
          })}
        </div>
        <div className="px-3 py-3 border-t border-edge/10 space-y-2">
          <button
            onClick={handleSave}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-white px-3 py-2 text-[12px] font-medium hover:bg-primary/90 transition-colors"
          >
            <Save size={13} />
            保存设置
          </button>
          <button
            onClick={handleReset}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-edge/10 bg-surface text-fg-muted hover:text-fg px-3 py-2 text-[12px] font-medium transition-colors"
          >
            <RotateCcw size={13} />
            恢复默认
          </button>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 w-full">
          <div className="mb-6">
            <h2 className="text-[14px] font-semibold text-fg">{activeCfg.label} 设置</h2>
            <p className="mt-1 text-[12px] text-fg-muted">调整 ScriptWeaver 的基本配置与偏好</p>
          </div>

          {/* ── General ─────────────────────────────────── */}
          {activeSection === 'general' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-4">项目</h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <label className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge/10 bg-surface">
                    <div>
                      <div className="text-[13px] font-medium text-fg">自动保存</div>
                      <div className="text-[12px] text-fg-muted mt-0.5">定时自动保存当前项目</div>
                    </div>
                    <button
                      onClick={() => setAutoSave(!autoSave)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${autoSave ? 'bg-primary' : 'bg-surface-2 border border-edge/15'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${autoSave ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </button>
                  </label>

                  {autoSave && (
                    <label className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge/10 bg-surface">
                      <div>
                        <div className="text-[13px] font-medium text-fg">保存间隔</div>
                        <div className="text-[12px] text-fg-muted mt-0.5">每 {autoSaveInterval} 分钟自动保存一次</div>
                      </div>
                      <select
                        value={autoSaveInterval}
                        onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
                        className="rounded-lg border border-edge/10 bg-surface-2/60 px-3 py-1.5 text-[12px] text-fg focus:outline-none focus:ring-1 focus:ring-primary/30"
                      >
                        {[1, 3, 5, 10, 15, 30].map((v) => (
                          <option key={v} value={v}>{v} 分钟</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ── AI Config ───────────────────────────────── */}
          {activeSection === 'ai' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-4">API 配置</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* API Key */}
                  <div className="px-4 py-3 rounded-lg border border-edge/10 bg-surface">
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
                        placeholder="sk-..."
                        className="w-full rounded-lg border border-edge/10 bg-surface-2/60 px-3 py-2 text-[13px] text-fg font-mono placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-fg-faint">
                      <Info size={11} className="inline mr-1" />
                      密钥加密存储在本地
                    </p>
                  </div>

                  {/* Endpoint */}
                  <div className="px-4 py-3 rounded-lg border border-edge/10 bg-surface">
                    <label className="text-[13px] font-medium text-fg block mb-2">API 端点</label>
                    <input
                      type="text"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full rounded-lg border border-edge/10 bg-surface-2/60 px-3 py-2 text-[13px] text-fg font-mono placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <p className="mt-1.5 text-[11px] text-fg-faint">支持 OpenAI 兼容 API</p>
                  </div>

                  {/* Model */}
                  <div className="px-4 py-3 rounded-lg border border-edge/10 bg-surface">
                    <label className="text-[13px] font-medium text-fg block mb-2">模型</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full rounded-lg border border-edge/10 bg-surface-2/60 px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="gpt-4">GPT-4</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      <option value="claude-3-opus">Claude 3 Opus</option>
                      <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                      <option value="deepseek-chat">DeepSeek Chat</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* 外观已独立为「外观主题」页面（见左侧导航） */}
        </div>
      </div>
    </div>
  )
}
