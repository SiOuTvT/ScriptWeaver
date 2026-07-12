import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { LineDelta } from '@/core/types'

export default function ScriptOverview() {
  const deltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)

  // 将 deltas 展平为可编辑文本行
  const [lines, setLines] = useState<string[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const prevDeltasRef = useRef(deltas)

  // deltas → 文本行（仅在外部 deltas 变化时同步，不覆盖用户编辑）
  useEffect(() => {
    if (prevDeltasRef.current === deltas) return
    prevDeltasRef.current = deltas

    const textLines: string[] = []
    for (let i = 0; i < deltas.length; i++) {
      const state = resolvedStates[i]
      if (!state) continue

      let line = ''
      if (state.speaker) {
        const displayName =
          characterConfigs.find(
            (c) => c.charId.toLowerCase() === state.speaker?.toLowerCase(),
          )?.displayName ?? state.speaker
        line += `${displayName}: `
      }
      line += state.dialogue || '(空行)'
      textLines.push(line)
    }
    setLines(textLines)
    setIsDirty(false)
  }, [deltas, resolvedStates, characterConfigs])

  // 文本行 → deltas（保留原有非对话字段）
  const applyChanges = useCallback(() => {
    const newDeltas: LineDelta[] = deltas.map((delta, i) => {
      const raw = lines[i] ?? ''
      const colonIdx = raw.indexOf(': ')

      let speaker: string | null = null
      let dialogue = raw

      if (colonIdx > 0) {
        const candidate = raw.slice(0, colonIdx)
        // 反过来匹配 displayName → charId
        const matched = characterConfigs.find(
          (c) => c.displayName === candidate,
        )
        speaker = matched ? matched.charId : candidate
        dialogue = raw.slice(colonIdx + 2)
      }

      if (dialogue === '(空行)') dialogue = ''

      return {
        ...delta,
        speaker,
        dialogue,
      }
    })
    setDraftDeltas(newDeltas)
    setIsDirty(false)
  }, [deltas, lines, characterConfigs, setDraftDeltas])

  const handleLineChange = useCallback(
    (index: number, value: string) => {
      setLines((prev) => {
        const next = [...prev]
        next[index] = value
        return next
      })
      setIsDirty(true)
    },
    [],
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineCountRef = useRef<HTMLDivElement>(null)

  // 行号与正文同步滚动
  const handleScroll = useCallback(() => {
    if (lineCountRef.current && textareaRef.current) {
      lineCountRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  // Ctrl+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (isDirty) applyChanges()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDirty, applyChanges])

  const fullText = lines.join('\n')

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gray-950">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            剧本总览
          </span>
          <span className="text-[10px] text-gray-600">
            {deltas.length} 行
          </span>
          {isDirty && (
            <span className="rounded bg-yellow-600/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
              已修改
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={applyChanges}
            disabled={!isDirty}
            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              isDirty
                ? 'bg-brand-600 text-white hover:bg-brand-500'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            应用更改
          </button>
          <span className="text-[10px] text-gray-600">Ctrl+S</span>
        </div>
      </div>

      {/* 编辑器主体 */}
      <div className="flex flex-1 overflow-hidden font-mono text-sm">
        {/* 行号列 */}
        <div
          ref={lineCountRef}
          className="shrink-0 overflow-hidden bg-gray-900/50 border-r border-gray-800 select-none"
          style={{ width: 48 }}
        >
          <div className="py-3">
            {lines.map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-end px-2 h-7 text-[11px] text-gray-600"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* 文本编辑区 */}
        <textarea
          ref={textareaRef}
          value={fullText}
          onChange={(e) => {
            const newLines = e.target.value.split('\n')
            setLines(newLines)
            setIsDirty(true)
          }}
          onScroll={handleScroll}
          placeholder="在此编辑剧本内容...&#10;&#10;格式：角色名: 台词&#10;示例：&#10;alice: 你好，今天天气真好&#10;bob: 是啊，我们去公园走走吧"
          className="flex-1 resize-none bg-transparent px-4 py-3 text-gray-300 placeholder-gray-700 outline-none leading-7"
          spellCheck={false}
        />
      </div>

      {/* 底部提示 */}
      <div className="border-t border-gray-800 px-4 py-1.5 text-[10px] text-gray-600 flex items-center justify-between">
        <span>格式：角色名: 台词（角色名匹配角色管理中的显示名）</span>
        <span>Ctrl+S 保存 · 编辑后点击「应用更改」同步到项目</span>
      </div>
    </div>
  )
}
