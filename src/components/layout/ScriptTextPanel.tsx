import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { serializeScript, parseScript } from '@/utils/scriptDsl'
import { toast } from '@/utils/toast'
import { Button } from '@/components/ui'
import { Code2, RefreshCw, Check, Copy, Download, BookOpen } from 'lucide-react'

/** 全屏脚本编辑器：时间轴 LineDelta[] 与可读 DSL 文本双向编辑的落地页。 */
export default function ScriptTextPanel() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)

  const initialText = useMemo(() => serializeScript(draftDeltas), []) // 仅取首次
  const [text, setText] = useState(initialText)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const gutterRef = useRef<HTMLDivElement>(null)

  // 外部剧本变化且用户未改动时，自动同步进来
  useEffect(() => {
    if (!dirty) setText(serializeScript(draftDeltas))
  }, [draftDeltas, dirty])

  const lineCount = useMemo(() => text.split('\n').length, [text])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    setDirty(true)
    setError(null)
  }

  const handleApply = () => {
    try {
      const parsed = parseScript(text)
      if (parsed.lines.length === 0) {
        setError('脚本为空，无法应用。请保留至少一行内容。')
        toast('脚本为空，未应用', 'warning')
        return
      }
      const normalized = serializeScript(parsed.lines)
      setText(normalized)
      setDirty(false)
      setError(null)
      setDraftDeltas(parsed.lines)
      toast(`已应用 ${parsed.lines.length} 行到剧本`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`解析失败：${msg}`)
      toast('脚本解析失败，未应用', 'error')
    }
  }

  const handleReload = () => {
    if (dirty && !window.confirm('当前文本尚未应用，从剧本同步将丢弃改动，确定继续？')) return
    setText(serializeScript(draftDeltas))
    setDirty(false)
    setError(null)
    toast('已从剧本重新载入', 'info')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast('脚本已复制到剪贴板', 'success')
    } catch {
      toast('复制失败，浏览器可能限制了剪贴板', 'error')
    }
  }

  const handleExport = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'script.swscript'
    a.click()
    URL.revokeObjectURL(url)
    toast('已导出 script.swscript', 'success')
  }

  const syncScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* 头部工具条 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-edge/10 bg-surface/70 px-4 backdrop-blur-md">
        <span className="signal-dot" />
        <span className="eyebrow">脚本编辑</span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] tabular-nums text-fg-subtle">
          {lineCount} 行
        </span>
        {dirty && (
          <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[12px] font-medium text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" /> 未应用
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" icon={<BookOpen size={14} strokeWidth={1.75} />} onClick={() => setShowHelp((v) => !v)}>
            语法
          </Button>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} strokeWidth={1.75} />} onClick={handleReload}>
            从剧本同步
          </Button>
          <Button variant="ghost" size="sm" icon={<Copy size={14} strokeWidth={1.75} />} onClick={handleCopy}>
            复制
          </Button>
          <Button variant="ghost" size="sm" icon={<Download size={14} strokeWidth={1.75} />} onClick={handleExport}>
            导出文件
          </Button>
          <span className="mx-0.5 h-4 w-px bg-edge-strong/20" />
          <Button variant="primary" size="sm" icon={<Check size={14} strokeWidth={1.75} />} onClick={handleApply}>
            应用到剧本
          </Button>
        </div>
      </div>

      {/* 语法图例 */}
      {showHelp && (
        <div className="shrink-0 border-b border-edge/10 bg-surface-1/40 px-4 py-3 text-[12px] leading-relaxed text-fg-subtle">
          <div className="mb-1.5 font-medium text-fg-muted">脚本语法速览</div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
            <Code>dialogue "台词" speaker=角色</Code>
            <Code>narration "旁白"</Code>
            <Code>choice "提问"</Code>
            <Code>option "选项" -&gt; label if 条件 ops: 变量+=1</Code>
            <Code>bg asset=背景 with=过渡 fx=滤镜(参数)</Code>
            <Code>show char=角色 expr=表情 slot=站位 scale=倍率</Code>
            <Code>hide char=角色</Code>
            <Code>bgm asset=音乐 vol=0.6 loop=true</Code>
            <Code>voice asset=配音 off=毫秒</Code>
            <Code>set 变量+=1</Code>
            <Code>label 锚点名</Code>
          </div>
        </div>
      )}

      {/* 错误条 */}
      {error && (
        <div className="shrink-0 border-b border-danger/30 bg-danger/10 px-4 py-2 text-[12px] text-danger">
          {error}
        </div>
      )}

      {/* 编辑区：行号槽 + 文本域 */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden
          className="select-none overflow-hidden border-r border-edge/10 bg-surface-1/50 px-3 py-3 text-right font-mono text-[13px] leading-relaxed text-fg-faint"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={text}
          onChange={handleChange}
          onScroll={syncScroll}
          spellCheck={false}
          wrap="off"
          className="min-h-0 flex-1 resize-none bg-surface-1/30 px-4 py-3 font-mono text-[13px] leading-relaxed text-fg outline-none placeholder-fg-subtle"
          placeholder="在此编写剧本脚本，或从剧本同步后编辑，再应用到时间轴"
        />
      </div>

      {/* 底部状态条 */}
      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-edge/10 bg-surface/60 px-4 text-[12px] text-fg-faint">
        <span className="flex items-center gap-1.5">
          <Code2 size={13} strokeWidth={1.75} /> DSL 模式
        </span>
        <span>应用后可在场景导航中继续可视化编辑，两者实时互通</span>
        {dirty && <span className="ml-auto text-warning">有未应用的改动</span>}
      </div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg-muted">{children}</code>
}
