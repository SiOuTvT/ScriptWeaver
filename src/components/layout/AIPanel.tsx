import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui'
import { Settings, Sparkles, Loader2 } from 'lucide-react'
import type { LineDelta } from '@/core/types'
import { DEFAULT_POSITION_SLOTS } from '@/core/positionSlots'
import {
  AIConfig,
  AIMode,
  loadConfig,
  saveConfig,
  applyPreset,
  buildSystemPrompt,
  buildUserPrompt,
  buildAudioHints,
  buildTagIndex,
  parseDirective,
  resolveDirectiveToDelta,
  composeDeltas,
  streamChatCompletion,
} from '@/utils/aiDirector'

const STORAGE_MODE_KEY = 'scriptweaver_ai_mode'

function maxLineNum(deltas: LineDelta[]): number {
  let max = 0
  for (const d of deltas) {
    const m = d.line_id.match(/^L(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max
}

export default function AIPanel() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const selectedLineIndex = useAppStore((s) => s.selectedLineIndex)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)
  const selectLine = useAppStore((s) => s.selectLine)

  const [config, setConfig] = useState<AIConfig>(loadConfig)
  const [mode, setMode] = useState<AIMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_MODE_KEY) as AIMode) || 'director'
    } catch {
      return 'director'
    }
  })
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(!config.apiKey)
  const [streamText, setStreamText] = useState('') // 打字机缓冲（仅本地，不写 store）
  const [applyResult, setApplyResult] = useState<{ ok: boolean; message: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const committedRef = useRef(false) // 幂等守卫：一次 AI 排戏只提交一次

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode)
    } catch {
      /* noop */
    }
  }, [mode])

  const generate = useCallback(async () => {
    if (!prompt.trim() || !config.apiKey.trim()) return

    setLoading(true)
    setError(null)
    setApplyResult(null)
    setStreamText('')
    committedRef.current = false

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const messages = [
        {
          role: 'system' as const,
          content: buildSystemPrompt(mode, {
            characters: characterConfigs.map((c) => ({ charId: c.charId, displayName: c.displayName })),
            backgrounds: assets.filter((a) => a.type === 'background').map((a) => a.name),
            audioHints: buildAudioHints(assets),
          }),
        },
        { role: 'user' as const, content: buildUserPrompt(prompt, mode) },
      ]

      const full = await streamChatCompletion(
        config,
        messages,
        (tok) => setStreamText((prev) => prev + tok),
        controller.signal,
      )

      // 导师模式：仅预览，不触碰时间轴
      if (mode === 'mentor') {
        setApplyResult({ ok: true, message: '（导师模式）已在上方预览改写结果，未修改时间轴。' })
        setPrompt('')
        return
      }

      // 舞台监督模式：解析 → 标签绑定 → 单事务提交
      const directive = parseDirective(full)
      if (!directive.lines.length) {
        setApplyResult({ ok: false, message: 'AI 未返回任何剧本行。' })
        return
      }

      const index = buildTagIndex(assets)
      const baseMax = maxLineNum(draftDeltas)
      const plan: LineDelta[] = []
      const allReport = { resolved: [] as string[], unresolved: [] as string[] }

      directive.lines.forEach((line, i) => {
        const { delta, report } = resolveDirectiveToDelta(line, {
          index,
          assets,
          characterConfigs,
          slots: DEFAULT_POSITION_SLOTS,
          lineId: `L${baseMax + i + 1}`,
          span: [0, 0],
        })
        plan.push(delta)
        allReport.resolved.push(...report.resolved)
        allReport.unresolved.push(...report.unresolved)
      })

      // ★ 单事务提交：一次 setDraftDeltas = 整段 AI 排戏仅一条撤销记录
      if (!committedRef.current) {
        const finalDeltas = composeDeltas(draftDeltas, plan, selectedLineIndex, 'insert')
        setDraftDeltas(finalDeltas)
        committedRef.current = true
        const firstNew = Math.min(finalDeltas.length, selectedLineIndex + 1)
        selectLine(firstNew)
      }

      const resolvedMsg = allReport.resolved.length
        ? `已绑定：${allReport.resolved.join('、')}`
        : '未自动绑定任何素材'
      const unresolvedMsg = allReport.unresolved.length
        ? `；待复核：${allReport.unresolved.join('、')}`
        : ''
      setApplyResult({
        ok: allReport.unresolved.length === 0,
        message: `已应用 ${plan.length} 行（插入到第 ${selectedLineIndex + 1} 行后）。${resolvedMsg}${unresolvedMsg}`,
      })
      setPrompt('')
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setError(err?.message ?? '未知错误')
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [prompt, config, mode, draftDeltas, assets, characterConfigs, selectedLineIndex, setDraftDeltas, selectLine])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const saveConfigCb = useCallback(() => {
    saveConfig(config)
    setShowConfig(false)
  }, [config])

  return (
    <div className="flex flex-1 flex-col bg-canvas">
      {/* Header */}
      <div className="shrink-0 border-b border-edge/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">AI 辅助写作 Assistant</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Settings size={14} strokeWidth={1.75} />}
            onClick={() => setShowConfig(!showConfig)}
          >
            设置
          </Button>
        </div>
        {/* 双角色切换 */}
        <div className="mt-3 inline-flex rounded-lg border border-edge/15 bg-surface-3 p-0.5">
          <button
            type="button"
            onClick={() => setMode('director')}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              mode === 'director' ? 'bg-signal text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            舞台监督
          </button>
          <button
            type="button"
            onClick={() => setMode('mentor')}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              mode === 'mentor' ? 'bg-signal text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            文学导师
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* 连接设置 */}
        {showConfig && (
          <section className="panel p-4">
            <div className="eyebrow mb-3">连接设置 Connection</div>
            <div className="space-y-3">
              <label className="block">
                <span className="t-label">厂商预设</span>
                <select
                  value={config.provider}
                  onChange={(e) =>
                    setConfig(applyPreset(config, e.target.value as AIConfig['provider']))
                  }
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                >
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openrouter">OpenRouter (Claude 等)</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label className="block">
                <span className="t-label">API 端点</span>
                <input
                  type="text"
                  value={config.endpoint}
                  onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
              </label>
              <label className="block">
                <span className="t-label">API Key</span>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
              </label>
              <label className="block">
                <span className="t-label">模型</span>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
              </label>
              <label className="block">
                <span className="t-label">温度 (Temperature)：{config.temperature.toFixed(1)}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={config.temperature}
                  onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                  className="mt-1 w-full accent-signal"
                />
              </label>
              <label className="block">
                <span className="t-label">最大 Token</span>
                <input
                  type="number"
                  min={256}
                  max={8192}
                  step={256}
                  value={config.maxTokens}
                  onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value || '2000', 10) })}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
              </label>
              <Button variant="primary" block onClick={saveConfigCb}>
                保存设置
              </Button>
            </div>
          </section>
        )}

        {/* 当前上下文 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">当前上下文 Context</div>
          <div className="flex gap-5 t-label">
            <span>
              <span className="font-mono text-fg-muted">{draftDeltas.length}</span> 行
            </span>
            <span>
              <span className="font-mono text-fg-muted">{characterConfigs.length}</span> 个角色
            </span>
            <span>
              <span className="font-mono text-fg-muted">
                {assets.filter((a) => a.type === 'background').length}
              </span>{' '}
              个背景
            </span>
            <span>
              <span className="font-mono text-fg-muted">
                {assets.filter((a) => a.type === 'audio').length}
              </span>{' '}
              个音频
            </span>
          </div>
        </section>

        {/* 流式打字机预览 */}
        {streamText && (
          <section className="panel p-4">
            <div className="eyebrow mb-2">
              {loading ? 'AI 生成中…' : mode === 'mentor' ? '改写预览' : '导演指令预览'}
            </div>
            <pre className="whitespace-pre-wrap t-micro t-mono leading-relaxed text-fg-muted">
              {streamText}
              {loading && <span className="animate-pulse">▍</span>}
            </pre>
          </section>
        )}

        {/* 错误 */}
        {error && (
          <div className="panel border-danger/40 p-3">
            <p className="t-caption text-danger">{error}</p>
          </div>
        )}

        {/* 应用结果 */}
        {applyResult && (
          <div className={`panel p-3 ${applyResult.ok ? 'border-success/40' : 'border-danger/40'}`}>
            <p className="t-caption">{applyResult.message}</p>
          </div>
        )}

        {/* 创作指令 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">
            {mode === 'mentor' ? '润色指令 Prompt' : '创作指令 Prompt'}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'mentor'
                ? '粘贴需要润色/扩写的台词或大纲…'
                : '例如：Alice 和 Bob 在学校走廊相遇，争吵关于周末去图书馆还是去游乐园的事情…'
            }
            rows={4}
            disabled={loading}
            className="w-full resize-none rounded-lg border border-edge/15 bg-surface-3 px-3 py-2 text-xs text-fg placeholder-fg-subtle outline-none focus:border-signal/60 disabled:opacity-50"
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              onClick={generate}
              disabled={loading || !prompt.trim() || !config.apiKey.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={1.75} />
                  {mode === 'mentor' ? '润色' : '生成剧本'}
                </>
              )}
            </Button>
            {loading && (
              <Button variant="outline" onClick={cancel}>
                取消
              </Button>
            )}
          </div>
        </section>

        {/* 使用提示 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">使用提示 Tips</div>
          <p className="t-micro leading-relaxed">
            <span className="text-signal">舞台监督</span>：AI 返回结构化元数据，自动把情感/环境/音效标签绑定到真实素材，
            并在有对白时自动挂载语音打点，整段作为单条记录写入时间轴（可一步撤销）。
            <span className="text-signal">文学导师</span>：仅预览润色结果，不修改时间轴。
            支持 OpenAI 兼容端点（OpenAI / DeepSeek / OpenRouter / 本地模型等）。
          </p>
        </section>
      </div>
    </div>
  )
}
