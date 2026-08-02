import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { streamChatCompletion, chatViaMain, hasMainAIBridge, loadConfig, buildSystemPrompt, buildBlueprintSystemPrompt, buildBlueprintUserPrompt, parseDirective, describeAIError } from '../../utils/aiDirector'
import type { DirectorBlueprint, AIMode as AIAIMode, ChatMessage } from '../../utils/aiDirector'
import { toast } from '../../utils/toast'
import {
  Sparkles, Send, Loader2, AlertTriangle, Brain, ChevronDown, Copy,
  MessageSquare, Zap, GitBranch, Wand2, FileText, RefreshCw, Info,
  ArrowRight, X, Bot, User, Lightbulb, BookOpen
} from 'lucide-react'

type AIMode = 'director' | 'mentor' | 'blueprint'

const MODE_CONFIG: Record<AIMode, { label: string; desc: string; icon: typeof Sparkles; placeholder: string; color: string }> = {
  director: {
    label: '舞台监督',
    desc: 'AI 导演辅助编排场景、角色调度与演出节奏',
    icon: Wand2,
    placeholder: '描述你想要的场景编排... 例如：让角色 A 从左侧入场，停顿后开始对话',
    color: 'indigo',
  },
  mentor: {
    label: '文学导师',
    desc: '分析剧本结构、角色弧光与台词打磨建议',
    icon: BookOpen,
    placeholder: '粘贴或描述需要分析的剧本片段... 例如：这段告白戏的情感铺垫是否足够？',
    color: 'emerald',
  },
  blueprint: {
    label: '剧情蓝图',
    desc: '一键生成网状分歧剧情树，含分支点与结局规划',
    icon: GitBranch,
    placeholder: '输入核心故事梗概与分支意图... 例如：校园恋爱 3 个结局 + 至少 5 个分支点',
    color: 'violet',
  },
}

const MODE_ORDER: AIMode[] = ['director', 'mentor', 'blueprint']

export default function AIPanel() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)
  const selectLine = useAppStore((s) => s.selectLine)
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)
  const variables = useAppStore((s) => s.variables)
  const settings = useAppStore((s) => s.settings)

  const [mode, setMode] = useState<AIMode>('director')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blueprint, setBlueprint] = useState<DirectorBlueprint | null>(null)
  const [contextExpanded, setContextExpanded] = useState(false)
  const responseRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | undefined>(undefined)

  const modeCfg = MODE_CONFIG[mode]

  // Theme-safe mode colors (mapped to CSS variable semantic colors)
  const MODE_THEME: Record<string, { bg: string; border: string; text: string; dot: string; gradFrom: string; gradTo: string }> = {
    indigo: { bg: 'bg-[rgb(var(--c-primary)/0.06)]', border: 'border-[rgb(var(--c-primary)/0.15)]', text: 'text-[rgb(var(--c-primary))]', dot: 'bg-[rgb(var(--c-primary))]', gradFrom: 'from-[rgb(var(--c-primary)/0.05)]', gradTo: 'to-[rgb(var(--c-primary)/0.02)]' },
    emerald: { bg: 'bg-[rgb(var(--c-success)/0.06)]', border: 'border-[rgb(var(--c-success)/0.15)]', text: 'text-[rgb(var(--c-success))]', dot: 'bg-[rgb(var(--c-success))]', gradFrom: 'from-[rgb(var(--c-success)/0.05)]', gradTo: 'to-[rgb(var(--c-success)/0.02)]' },
    violet: { bg: 'bg-[rgb(var(--c-signal)/0.06)]', border: 'border-[rgb(var(--c-signal)/0.15)]', text: 'text-[rgb(var(--c-signal))]', dot: 'bg-[rgb(var(--c-signal))]', gradFrom: 'from-[rgb(var(--c-signal)/0.05)]', gradTo: 'to-[rgb(var(--c-signal)/0.02)]' },
  }

  // Context stats
  const contextInfo = useMemo(() => ({
    lines: draftDeltas.length,
    chars: characterConfigs.length,
    dialogueLines: draftDeltas.filter((d) => d.dialogue).length,
    choices: draftDeltas.filter((d) => d.line_type === 'choice').length,
  }), [draftDeltas, characterConfigs])

  // Auto-scroll response
  useEffect(() => {
    responseRef.current?.scrollTo({ top: responseRef.current.scrollHeight, behavior: 'smooth' })
  }, [response, loading])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [prompt])

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    setResponse(null)
    setBlueprint(null)

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      // Electron：密钥在主进程安全区，渲染端只需确认已配置；浏览器降级才读本地配置
      const useMainBridge = hasMainAIBridge()
      const config = loadConfig()
      if (useMainBridge) {
        const remote = await window.electronAPI!.aiGetConfig()
        if (!remote?.hasApiKey) {
          setError('请先在设置中配置 AI API Key')
          setLoading(false)
          return
        }
      } else if (!config.apiKey) {
        setError('请先在设置中配置 AI API Key')
        setLoading(false)
        return
      }

      // Build context
      const characters = Object.entries(characterConfigs).map(([charId, cfg]) => ({
        charId,
        displayName: cfg.displayName || charId,
      }))
      const bgSet = new Set<string>()
      draftDeltas.forEach((d) => { if (d.background?.asset_id) bgSet.add(d.background.asset_id) })
      const backgrounds = Array.from(bgSet)
      const audioHints = draftDeltas
        .filter((d) => d.audio)
        .map((d) => {
          const parts: string[] = []
          if (d.audio?.bgm && typeof d.audio.bgm === 'string') parts.push(d.audio.bgm)
          if (d.audio?.ambient && typeof d.audio.ambient === 'string') parts.push(d.audio.ambient)
          if (d.audio?.voice && typeof d.audio.voice === 'string') parts.push(d.audio.voice)
          return parts.join(',')
        })
        .filter(Boolean)
        .join(', ')
      const variableRefs = (variables || []).map((v) => ({
        name: v.name,
        type: v.type,
      }))

      let messages: ChatMessage[]
      if (mode === 'blueprint') {
        messages = [
          { role: 'system', content: buildBlueprintSystemPrompt({ characters, backgrounds, audioHints, variables: variableRefs }) },
          { role: 'user', content: buildBlueprintUserPrompt(prompt.trim()) },
        ]
      } else {
        messages = [
          { role: 'system', content: buildSystemPrompt(mode as AIAIMode, { characters, backgrounds, audioHints }) },
          { role: 'user', content: prompt.trim() },
        ]
      }

      let fullText = ''
      const onToken = (token: string) => {
        fullText += token
        setResponse(fullText)
      }
      const streamOpts = {
        timeoutMs: settings.timeoutTotalMs,
        stallMs: settings.timeoutStallMs,
        streaming: settings.streamingEnabled,
      }
      if (useMainBridge) {
        // 铁律3：Electron 下密钥不进渲染进程，请求经主进程注入密钥
        fullText = await chatViaMain(messages, onToken, abortController.signal, streamOpts)
        setResponse(fullText)
      } else {
        await streamChatCompletion(config, messages, onToken, abortController.signal, streamOpts)
      }

      if (mode === 'blueprint' && fullText) {
        try {
          const bp = parseDirective(fullText)
          setBlueprint(bp)
        } catch {
          // Blueprint parse failed but text response is shown
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setError(describeAIError(err))
    } finally {
      setLoading(false)
      abortRef.current = undefined
    }
  }, [prompt, loading, mode, draftDeltas, characterConfigs, variables, settings])

  const handleApplyBlueprint = useCallback((blueprint: DirectorBlueprint) => {
    // Insert blueprint as structured dialogue + choice blocks
    const newDeltas = blueprint.lines.map((line) => {
      const charDeltas: Record<string, import('../../core/types').CharacterDelta> = {}
      if (line.characters) {
        for (const [charId, dc] of Object.entries(line.characters)) {
          charDeltas[charId] = {
            sprite_id: dc.sprite_id,
            position_slot: dc.position_slot,
            action: dc.action,
            pos_x: dc.pos_x,
            pos_y: dc.pos_y,
          }
        }
      }
      return {
        line_id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        dialogue: line.dialogue || '',
        speaker: line.speaker,
        label: line.label,
        line_type: line.line_type || 'dialogue',
        background: line.background ? { asset_id: line.background.tag } : null,
        characters: charDeltas,
        audio: { bgm: null, ambient: null, se: [], voice: null },
        choices: line.choices?.map((c, ci) => ({
          uid: `bp_choice_${Date.now()}_${ci}`,
          text: c.text,
          target_label: c.target_label || '',
          condition: c.condition,
          ops: c.ops ? c.ops.map((o) => ({ op: o.op, varName: o.varName, value: o.value })) : undefined,
        })),
        variableOps: line.variableOps,
      }
    })
    const updated = [...draftDeltas, ...newDeltas]
    setDraftDeltas(updated)
    if (updated.length > 0) selectLine(updated.length - 1)
    setActiveNavItem('chapters')
    toast('已应用剧情蓝图到剧本', 'success')
  }, [draftDeltas, setDraftDeltas, selectLine, setActiveNavItem])

  return (
    <div className="flex h-full flex-1 min-w-0 flex-col select-none">
      {/* Header */}
      <div className="shrink-0 border-b border-edge/10 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-semibold text-fg">AI 编剧 Copilot</h1>
            <p className="mt-0.5 text-[12px] text-fg-muted">AI 辅助编排、分析与蓝图生成</p>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-1 bg-surface-2/60 rounded-lg p-1 border border-edge/10">
            {MODE_ORDER.map((m) => {
              const cfg = MODE_CONFIG[m]
              const Icon = cfg.icon
              const active = mode === m
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    active
                      ? 'bg-surface text-fg shadow-sm border border-edge/10'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  <Icon size={13} className={active ? 'text-primary' : ''} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Mode Description Bar */}
      <div className={`shrink-0 mx-6 mt-4 rounded-lg border px-4 py-2.5 bg-gradient-to-r ${MODE_THEME[modeCfg.color].gradFrom} ${MODE_THEME[modeCfg.color].gradTo} ${MODE_THEME[modeCfg.color].border}`}>
        <div className="flex items-center gap-2.5">
          {React.createElement(modeCfg.icon, { size: 15, className: MODE_THEME[modeCfg.color].text })}
          <span className="text-[13px] text-fg font-medium">{modeCfg.label}</span>
          <span className="text-[12px] text-fg-muted">{modeCfg.desc}</span>
        </div>
      </div>

      {/* Config + Context Quick Bar */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => setContextExpanded(!contextExpanded)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
            contextExpanded
              ? 'border-primary/20 bg-primary/5 text-primary'
              : 'border-edge/10 bg-surface text-fg-muted hover:text-fg hover:border-primary/15'
          }`}
        >
          <FileText size={13} />
          上下文
          <span className="text-fg-faint">{contextInfo.lines} 行 · {contextInfo.chars} 角色</span>
          <ChevronDown size={12} className={contextExpanded ? 'rotate-180' : ''} />
        </button>

        {/* Quick stats pills */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[12px] text-fg-faint bg-surface-2/60 px-2 py-0.5 rounded border border-edge/8">
            {contextInfo.dialogueLines} 对白
          </span>
          <span className="text-[12px] text-fg-faint bg-surface-2/60 px-2 py-0.5 rounded border border-edge/8">
            {contextInfo.choices} 选择支
          </span>
        </div>
      </div>

      {/* Expanded Context */}
      {contextExpanded && (
        <div className="shrink-0 mx-6 mb-4 rounded-lg border border-edge/10 bg-surface-2/30 p-4 max-h-40 overflow-y-auto">
          <div className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.05em] mb-2">当前剧本上下文</div>
          <div className="text-[12px] text-fg-muted leading-relaxed space-y-0.5 font-mono">
            {draftDeltas.slice(-15).map((d, i) => (
              <div key={i} className="truncate">
                {d.label && <span className="text-primary">[{d.label}] </span>}
                {d.speaker && <span className="text-[rgb(var(--c-info))]">{d.speaker}: </span>}
                <span>{(d.dialogue || '').slice(0, 80)}</span>
              </div>
            ))}
            {draftDeltas.length === 0 && <span className="italic">暂无剧本内容</span>}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 px-6 pb-4">

        {/* Response */}
        <div ref={responseRef} className="flex-1 overflow-y-auto mb-4 rounded-xl border border-edge/10 bg-surface p-5">
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-[rgb(var(--c-danger)/0.2)] bg-[rgb(var(--c-danger)/0.05)] p-4">
                <AlertTriangle size={16} className="text-[rgb(var(--c-danger))] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[13px] font-medium text-[rgb(var(--c-danger))] mb-1">请求失败</div>
                  <div className="text-[12px] text-fg-muted leading-relaxed">{error}</div>
                </div>
              </div>
            )}

            {loading && !response && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  <Sparkles size={16} className="absolute inset-0 m-auto text-primary/40" />
                </div>
                <span className="text-[13px] text-fg-muted">
                  {mode === 'blueprint' ? '生成剧情蓝图中...' : 'AI 思考中...'}
                </span>
              </div>
            )}

            {response && (
              <div>
                {/* AI Response */}
                <div className="flex items-start gap-3 mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Bot size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.05em] mb-2">
                      {mode === 'blueprint' ? '剧情蓝图' : 'AI 回复'}
                    </div>
                    <div className="prose-content text-[13px] text-fg leading-relaxed space-y-2 whitespace-pre-wrap">
                      {response}
                    </div>
                  </div>
                </div>

                {/* Blueprint */}
                {blueprint && (
                  <div className="rounded-lg border border-primary/15 bg-primary/3 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <GitBranch size={15} className="text-primary" />
                        <span className="text-[13px] font-medium text-fg">剧情蓝图 ({(blueprint.nodes ?? []).length} 节点 · {(blueprint.edges ?? []).length} 分支)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApplyBlueprint(blueprint)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 hover:bg-primary/15 px-3 py-1.5 text-[12px] text-primary transition-colors"
                        >
                          <ArrowRight size={12} />
                          应用到剧本
                        </button>
                        <button
                          onClick={() => navigator.clipboard.writeText(JSON.stringify(blueprint, null, 2))}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-edge/10 bg-surface px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg transition-colors"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                    {/* Blueprint nodes preview */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {(blueprint.nodes ?? []).map((node) => (
                        <div key={node.id} className={`rounded-lg border px-3 py-2 text-[12px] leading-snug ${
                          node.kind === 'start' ? 'border-[rgb(var(--c-success)/0.2)] bg-[rgb(var(--c-success)/0.05)]'
                          : node.kind === 'ending' ? 'border-[rgb(var(--c-danger)/0.2)] bg-[rgb(var(--c-danger)/0.05)]'
                          : 'border-edge/10 bg-surface-2/40'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              node.kind === 'start' ? 'bg-[rgb(var(--c-success))]'
                              : node.kind === 'ending' ? 'bg-[rgb(var(--c-danger))]'
                              : 'bg-primary'
                            }`} />
                            <span className="font-medium text-fg">{node.title}</span>
                            <span className="text-fg-faint text-[12px]">
                              {node.kind === 'start' ? '起点' : node.kind === 'ending' ? '结局' : '分支'}
                            </span>
                          </div>
                          {node.summary && <p className="text-fg-muted">{node.summary}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!response && !error && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Bot size={24} className="text-primary" />
                </div>
                <h2 className="text-[16px] font-semibold text-fg">AI 编剧助手已就绪</h2>
                <p className="mt-1.5 text-[13px] text-fg-muted max-w-sm leading-relaxed">
                  {modeCfg.desc}。在下方输入框描述需求，按 Enter 发送即可开始。
                </p>
                {mode === 'blueprint' && (
                  <div className={`mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] ${MODE_THEME.violet.border} ${MODE_THEME.violet.bg} ${MODE_THEME.violet.text}`}>
                    <GitBranch size={13} /> 输入核心梗概，AI 自动生成分支结局树
                  </div>
                )}
                {mode === 'mentor' && (
                  <div className={`mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] ${MODE_THEME.emerald.border} ${MODE_THEME.emerald.bg} ${MODE_THEME.emerald.text}`}>
                    <BookOpen size={13} /> 粘贴剧本片段，获取结构、角色与台词建议
                  </div>
                )}
                {mode === 'director' && (
                  <div className={`mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] ${MODE_THEME.indigo.border} ${MODE_THEME.indigo.bg} ${MODE_THEME.indigo.text}`}>
                    <Wand2 size={13} /> 描述场景构想，AI 协助编排角色与演出节奏
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Input Area */}
        <div className="shrink-0">
          <div className="rounded-xl border border-edge/10 bg-surface shadow-sm focus-within:ring-1 focus-within:ring-primary/20 focus-within:border-primary/20 transition-all">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder={modeCfg.placeholder}
              rows={3}
              className="w-full resize-none bg-transparent px-4 py-3 text-[13px] text-fg placeholder-fg-faint focus:outline-none leading-relaxed"
            />
            <div className="flex items-center justify-between px-4 py-2 border-t border-edge/8">
              <div className="flex items-center gap-1.5">
                {mode === 'blueprint' && (
                  <TemplateInfo text="输入梗概后按 Enter 发送，AI 将自动生成分支树" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-fg-faint">{prompt.length} 字</span>
                <button
                  onClick={handleSend}
                  disabled={!prompt.trim() || loading}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-medium transition-colors ${
                    !prompt.trim() || loading
                      ? 'bg-surface-2 text-fg-faint cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-primary-hover shadow-sm'
                  }`}
                >
                  {loading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  发送
                </button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-fg-faint text-center">
            按 Enter 发送 · Shift+Enter 换行
          </p>
        </div>
      </div>
    </div>
  )
}

function TemplateInfo({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-fg-faint">
      <Lightbulb size={11} />
      {text}
    </span>
  )
}
