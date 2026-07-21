import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui'
import { Settings, Sparkles, Loader2, GitBranch, Network } from 'lucide-react'
import type { LineDelta } from '@/core/types'
import { DEFAULT_POSITION_SLOTS } from '@/core/positionSlots'
import {
  AIConfig,
  AIMode,
  loadConfig,
  saveConfig,
  defaultAIConfig,
  applyPreset,
  buildSystemPrompt,
  buildUserPrompt,
  buildAudioHints,
  buildTagIndex,
  parseDirective,
  resolveDirectiveToDelta,
  resolveBlueprint,
  composeDeltas,
  findBlockRange,
  replaceBlock,
  streamChatCompletion,
  describeAIError,
  type DirectorBlueprint,
  type ResolutionReport,
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

interface PendingBlueprint {
  blueprint: DirectorBlueprint
  plan: LineDelta[]
  report: ResolutionReport
  labelLines: { index: number; label: string }[]
}

const NODE_KIND_LABEL: Record<string, string> = {
  start: '起点',
  branch: '分支',
  ending: '结局',
}
const NODE_DOT: Record<string, string> = {
  start: 'bg-signal',
  branch: 'bg-fg-subtle',
  ending: 'bg-success',
}

export default function AIPanel() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const variables = useAppStore((s) => s.variables)
  const selectedLineIndex = useAppStore((s) => s.selectedLineIndex)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)
  const selectLine = useAppStore((s) => s.selectLine)

  const [config, setConfig] = useState<AIConfig>(loadConfig)
  // 是否已有（脱敏后）密钥：桌面端来自主进程 ai:getConfig，dev 来自 localStorage
  const [hasKey, setHasKey] = useState<boolean>(() => {
    try {
      return !!loadConfig().apiKey.trim()
    } catch {
      return false
    }
  })
  const [mode, setMode] = useState<AIMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_MODE_KEY) as AIMode) || 'director'
    } catch {
      return 'director'
    }
  })
  const [prompt, setPrompt] = useState('')
  // 蓝图模式专属：分支数 / 结局数提示
  const [branchHint, setBranchHint] = useState('')
  const [endingHint, setEndingHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState<boolean>(() => {
    try {
      return !loadConfig().apiKey.trim()
    } catch {
      return true
    }
  })
  const [streamText, setStreamText] = useState('') // 打字机缓冲（仅本地，不写 store）
  const [applyResult, setApplyResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, setPending] = useState<PendingBlueprint | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const committedRef = useRef(false) // 幂等守卫：一次 AI 排戏只提交一次

  // 启动即从主进程安全区拉取脱敏配置（密钥不进渲染进程）
  useEffect(() => {
    const api = window.electronAPI
    if (api?.aiGetConfig) {
      api
        .aiGetConfig()
        .then((cfg) => {
          setConfig({ ...defaultAIConfig(), ...cfg })
          setHasKey(!!cfg.hasApiKey)
          setShowConfig(!cfg.hasApiKey)
        })
        .catch(() => {
          /* 回落到下方 dev 默认 */
        })
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode)
    } catch {
      /* noop */
    }
  }, [mode])

  // 切换模式或重新生成时清理蓝图预览态
  useEffect(() => {
    setPending(null)
  }, [mode])

  // 收尾：解析 → 标签绑定 → 单事务提交 或 挂起蓝图预览（两套收发路径共用）
  const finish = useCallback(
    (full: string) => {
      // 导师模式：仅预览，不触碰时间轴
      if (mode === 'mentor') {
        setApplyResult({ ok: true, message: '（导师模式）已在上方预览改写结果，未修改时间轴。' })
        setPrompt('')
        return
      }

      // 剧情蓝图模式：解析 → 标签绑定 → 挂起预览，等待用户选择应用方式
      if (mode === 'blueprint') {
        const blueprint = parseDirective(full)
        if (!blueprint.lines.length) {
          setApplyResult({ ok: false, message: 'AI 未返回任何剧本行。' })
          return
        }
        const index = buildTagIndex(assets)
        const baseMax = maxLineNum(useAppStore.getState().draftDeltas)
        const { plan, report, labelLines } = resolveBlueprint(blueprint, {
          index,
          assets,
          characterConfigs,
          slots: DEFAULT_POSITION_SLOTS,
          baseLineId: baseMax,
        })
        setPending({ blueprint, plan, report, labelLines })
        setApplyResult(null)
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
    },
    [mode, assets, characterConfigs, draftDeltas, selectedLineIndex, setDraftDeltas, selectLine],
  )

  // 蓝图应用：整体替换 / 当前行后插入 / 替换选中剧情块
  const applyBlueprint = useCallback(
    (how: 'replace' | 'insert' | 'block') => {
      if (!pending) return
      const { plan } = pending
      const cur = useAppStore.getState().draftDeltas
      const sel = useAppStore.getState().selectedLineIndex
      let finalDeltas: LineDelta[]
      let focus = 0
      if (how === 'replace') {
        finalDeltas = composeDeltas(cur, plan, 0, 'replace')
        focus = 0
      } else if (how === 'insert') {
        finalDeltas = composeDeltas(cur, plan, sel, 'insert')
        focus = Math.min(finalDeltas.length - 1, sel + 1)
      } else {
        const { start, end } = findBlockRange(cur, sel)
        finalDeltas = replaceBlock(cur, plan, start, end)
        focus = start
      }
      setDraftDeltas(finalDeltas)
      selectLine(focus)
      const label = how === 'replace' ? '整体替换' : how === 'insert' ? '插入到当前行后' : '替换选中剧情块'
      setApplyResult({ ok: true, message: `已${label}：${plan.length} 行已写入时间轴（可一步撤销）。` })
      setPending(null)
    },
    [pending, setDraftDeltas, selectLine],
  )

  const generate = useCallback(async () => {
    if (!prompt.trim()) return
    const secure = !!window.electronAPI?.aiChat
    const keyReady = secure ? hasKey : config.apiKey.trim().length > 0
    if (!keyReady) return

    setLoading(true)
    setError(null)
    setApplyResult(null)
    setStreamText('')
    setPending(null)
    committedRef.current = false

    const varCtx = variables.map((v) => ({ name: v.name, type: v.type }))
    const messages = [
      {
        role: 'system' as const,
        content: buildSystemPrompt(mode, {
          characters: characterConfigs.map((c) => ({ charId: c.charId, displayName: c.displayName })),
          backgrounds: assets.filter((a) => a.type === 'background').map((a) => a.name),
          audioHints: buildAudioHints(assets),
          variables: varCtx,
        }),
      },
      {
        role: 'user' as const,
        content:
          mode === 'blueprint'
            ? buildUserPrompt(prompt, mode, {
                branches: branchHint ? parseInt(branchHint, 10) || undefined : undefined,
                endings: endingHint ? parseInt(endingHint, 10) || undefined : undefined,
              })
            : buildUserPrompt(prompt, mode),
      },
    ]

    // 桌面端：密钥在主进程，渲染端只发 prompt 收 chunk
    if (secure) {
      const api = window.electronAPI!
      let full = ''
      const onChunk = (d: { delta: string }) => {
        full += d.delta
        setStreamText(full)
      }
      const onDone = (d: { full: string }) => {
        api.removeAiListeners()
        setLoading(false)
        try {
          finish(d.full)
        } catch (err: any) {
          setError(err?.message ?? '解析 AI 返回的剧本数据失败，请重试或调整指令。')
        }
      }
      const onErr = (msg: string) => {
        api.removeAiListeners()
        setLoading(false)
        setError(msg)
      }
      const onAbort = () => {
        api.removeAiListeners()
        setLoading(false)
      }
      // 注册前先清掉可能残留的旧监听，杜绝重复触发
      api.removeAiListeners()
      api.onAiChunk(onChunk)
      api.onAiDone(onDone)
      api.onAiError(onErr)
      api.onAiAborted(onAbort)
      api.aiChat({ messages })
      return
    }

    // dev 纯 web 降级：渲染端直接请求（密钥来自 localStorage）
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const full = await streamChatCompletion(
        config,
        messages,
        (tok) => setStreamText((prev) => prev + tok),
        controller.signal,
      )
      finish(full)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setError(describeAIError(err))
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [prompt, branchHint, endingHint, config, hasKey, mode, draftDeltas, assets, characterConfigs, variables, selectedLineIndex, setDraftDeltas, selectLine, finish])

  const cancel = useCallback(() => {
    const api = window.electronAPI
    if (api?.aiAbort) {
      api.aiAbort()
    } else {
      abortRef.current?.abort()
      setLoading(false)
    }
  }, [])

  const saveConfigCb = useCallback(async () => {
    const api = window.electronAPI
    if (api?.aiSetConfig) {
      // 密钥落入主进程安全区；渲染端提交后立即丢弃明文
      await api.aiSetConfig(config)
      setHasKey(true)
      setConfig((c) => ({ ...c, apiKey: '' }))
    } else {
      saveConfig(config)
      setHasKey(!!config.apiKey.trim())
    }
    setShowConfig(false)
  }, [config])

  const isBlueprint = mode === 'blueprint'

  return (
    <div className="flex flex-1 flex-col bg-canvas">
      {/* Header */}
      <div className="shrink-0 border-b border-edge/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">AI 编剧抽屉 Copilot</span>
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
        {/* 三模式切换 */}
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
          <button
            type="button"
            onClick={() => setMode('blueprint')}
            className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs transition-colors ${
              isBlueprint ? 'bg-signal text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Network size={13} strokeWidth={1.75} />
            剧情蓝图
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
                  placeholder={hasKey && !config.apiKey ? '已保存在本地安全区，留空即保留' : 'sk-...'}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
                {hasKey && !config.apiKey && (
                  <p className="mt-1 text-[11px] text-fg-faint">
                    密钥由主进程安全区托管，渲染进程不可见。
                  </p>
                )}
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
              <span className="font-mono text-fg-muted">{variables.length}</span> 个变量
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

        {/* 蓝图预览：剧情树 + 行级预览 + 应用方式 */}
        {isBlueprint && pending && (
          <BlueprintPreview pending={pending} onApply={applyBlueprint} selectedLineIndex={selectedLineIndex} />
        )}

        {/* 流式打字机预览 */}
        {streamText && (
          <section className="panel p-4">
            <div className="eyebrow mb-2">
              {loading ? 'AI 生成中…' : isBlueprint ? '蓝图草稿（JSON）' : mode === 'mentor' ? '改写预览' : '导演指令预览'}
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
            {isBlueprint ? '核心梗概 Premise' : mode === 'mentor' ? '润色指令 Prompt' : '创作指令 Prompt'}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isBlueprint
                ? '例如：男主在废墟遇到失忆机甲少女，面临救与不救的选择…'
                : mode === 'mentor'
                  ? '粘贴需要润色/扩写的台词或大纲…'
                  : '例如：Alice 和 Bob 在学校走廊相遇，争吵关于周末去图书馆还是去游乐园的事情…'
            }
            rows={isBlueprint ? 5 : 4}
            disabled={loading}
            className="w-full resize-none rounded-lg border border-edge/15 bg-surface-3 px-3 py-2 text-xs text-fg placeholder-fg-subtle outline-none focus:border-signal/60 disabled:opacity-50"
          />
          {isBlueprint && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="t-label">分支数（可选）</span>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={branchHint}
                  onChange={(e) => setBranchHint(e.target.value)}
                  placeholder="如 2"
                  disabled={loading}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="t-label">结局数（可选）</span>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={endingHint}
                  onChange={(e) => setEndingHint(e.target.value)}
                  placeholder="如 3"
                  disabled={loading}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60 disabled:opacity-50"
                />
              </label>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              onClick={generate}
              disabled={loading || !prompt.trim() || (window.electronAPI ? !hasKey : !config.apiKey.trim())}
            >
              {loading ? (
                <>
                  <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={1.75} />
                  {isBlueprint ? '生成剧情蓝图' : mode === 'mentor' ? '润色' : '生成剧本'}
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
            并在有对白时自动挂载语音打点，整段作为单条记录写入时间轴（可一步撤销）。<br />
            <span className="text-signal">文学导师</span>：仅预览润色结果，不修改时间轴。<br />
            <span className="text-signal">剧情蓝图</span>：输入核心梗概，AI 规划含起点/分支/结局的网状分歧树，
            自动挂载角色与表情、插入选择支与变量逻辑；生成后可整体替换、插入到当前行之后，或替换选中剧情块。
            支持 OpenAI 兼容端点（OpenAI / DeepSeek / OpenRouter / 本地模型等）。
          </p>
        </section>
      </div>
    </div>
  )
}

// ===================== 蓝图预览子组件 =====================

function BlueprintPreview({
  pending,
  onApply,
  selectedLineIndex,
}: {
  pending: PendingBlueprint
  onApply: (how: 'replace' | 'insert' | 'block') => void
  selectedLineIndex: number
}) {
  const { blueprint, plan, report } = pending
  const nodeMap = new Map((blueprint.nodes ?? []).map((n) => [n.id, n]))

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="eyebrow">
          <GitBranch size={13} strokeWidth={1.75} className="mr-1 inline" />
          剧情蓝图预览
        </div>
        <span className="t-micro text-fg-faint">
          {blueprint.nodes?.length ?? 0} 节点 · {plan.length} 行
        </span>
      </div>

      {blueprint.title && <p className="t-label font-medium text-fg">{blueprint.title}</p>}

      {/* 剧情树：节点 + 边 */}
      {(blueprint.nodes?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <div className="t-micro text-fg-subtle">剧情树</div>
          <div className="flex flex-wrap gap-2">
            {(blueprint.nodes ?? []).map((n) => (
              <span
                key={n.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-edge/15 bg-surface-2 px-2.5 py-1 text-[12px]"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${NODE_DOT[n.kind] ?? 'bg-fg-subtle'}`} />
                <span className="text-fg">{n.title}</span>
                <span className="text-fg-faint">{NODE_KIND_LABEL[n.kind] ?? ''}</span>
              </span>
            ))}
          </div>
          {(blueprint.edges?.length ?? 0) > 0 && (
            <ul className="space-y-1 t-micro text-fg-muted">
              {blueprint.edges!.map((e, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="text-fg-subtle">{nodeMap.get(e.from)?.title ?? e.from}</span>
                  <span className="text-fg-faint">— {e.via} →</span>
                  <span className="text-fg-subtle">{nodeMap.get(e.to)?.title ?? e.to}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 行级预览 */}
      <div className="space-y-1.5">
        <div className="t-micro text-fg-subtle">生成内容（{plan.length} 行）</div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {blueprint.lines.map((ln, i) => (
            <div key={i} className="rounded-md border border-edge/10 bg-surface-2/60 px-2.5 py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-fg-faint">{i + 1}</span>
                <span className="text-[12px] font-medium text-fg">
                  {ln.speaker ?? <span className="italic text-fg-faint">旁白</span>}
                </span>
                {ln.line_type === 'choice' && (
                  <span className="rounded bg-signal/15 px-1.5 text-[10px] text-signal">选择支</span>
                )}
                {ln.label && <span className="rounded bg-surface-3 px-1.5 text-[10px] text-fg-subtle">#{ln.label}</span>}
              </div>
              <p className="t-micro leading-snug text-fg-muted">{ln.dialogue || '（无台词）'}</p>
              {ln.characters && Object.keys(ln.characters).length > 0 && (
                <p className="t-micro text-fg-faint">
                  角色：{Object.entries(ln.characters)
                    .map(([k, c]) => `${k}·${c.sprite_id ?? '—'}`)
                    .join('、')}
                </p>
              )}
              {ln.background?.tag && (
                <p className="t-micro text-fg-faint">场景：{ln.background.tag}</p>
              )}
              {ln.line_type === 'choice' && (ln.choices?.length ?? 0) > 0 && (
                <ul className="t-micro text-fg-faint">
                  {ln.choices!.map((c, ci) => (
                    <li key={ci}>
                      · {c.text}
                      {c.target_label ? ` → ${c.target_label}` : ''}
                      {c.ops?.length ? ` （变量${c.ops.length}）` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {ln.variableOps?.length ? (
                <p className="t-micro text-fg-faint">
                  变量：{ln.variableOps.map((o) => `${o.varName} ${o.op} ${o.value ?? ''}`).join('，')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* 解析报告 */}
      <div className="t-micro">
        {report.resolved.length > 0 && (
          <p className="text-success">已绑定素材：{report.resolved.join('、')}</p>
        )}
        {report.unresolved.length > 0 && (
          <p className="text-fg-subtle">待复核（未匹配素材）：{report.unresolved.join('、')}</p>
        )}
        {report.resolved.length === 0 && report.unresolved.length === 0 && (
          <p className="text-fg-faint">无素材绑定需求。</p>
        )}
      </div>

      {/* 应用方式 */}
      <div className="space-y-2 border-t border-edge/10 pt-3">
        <div className="t-micro text-fg-subtle">
          应用方式（当前选中第 {selectedLineIndex + 1} 行）
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Button variant="primary" size="sm" block onClick={() => onApply('replace')}>
            整体替换当前剧本
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => onApply('insert')}>
              插入当前行后
            </Button>
            <Button variant="outline" size="sm" onClick={() => onApply('block')}>
              替换选中剧情块
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
