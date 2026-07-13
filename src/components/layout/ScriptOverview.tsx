import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Check } from 'lucide-react'
import type { LineDelta } from '@/core/types'

// --------------- 工具函数 ---------------

let _newLineCounter = 0
function createEmptyDelta(): LineDelta {
  _newLineCounter++
  return {
    line_id: `new_${Date.now()}_${_newLineCounter}`,
    speaker: null,
    dialogue: '',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
  }
}

/**
 * 解析一行文本 → { speaker, dialogue }
 * 格式：角色显示名: 台词  (冒号+空格分隔)
 * 无冒号则视为旁白。
 */
function parseLine(raw: string, characterConfigs: { charId: string; displayName: string }[]): {
  speaker: string | null
  dialogue: string
} {
  const colonIdx = raw.indexOf(': ')
  let speaker: string | null = null
  let dialogue = raw

  if (colonIdx > 0) {
    const candidate = raw.slice(0, colonIdx)
    const matched = characterConfigs.find((c) => c.displayName === candidate)
    speaker = matched ? matched.charId : candidate
    dialogue = raw.slice(colonIdx + 2)
  }

  if (dialogue === '(空行)') dialogue = ''

  return { speaker, dialogue }
}

// --------------- 组件 ---------------

export default function ScriptOverview() {
  const deltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)

  const [lines, setLines] = useState<string[]>([])
  const [isDirty, setIsDirty] = useState(false)

  // 用 ref 代替闭包 isDirty，避免 effect 读到过期值
  const isDirtyRef = useRef(false)
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // deltas → 文本行（仅在用户没有未保存编辑时同步）
  useEffect(() => {
    if (isDirtyRef.current) return

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
  }, [deltas, resolvedStates, characterConfigs])

  // 文本行 → deltas
  //   关键修复：按 lines.length 迭代（而非 deltas.length），
  //   新增行自动创建空白 delta 作为骨架。
  const applyChanges = useCallback(() => {
    const newDeltas: LineDelta[] = []

    for (let i = 0; i < lines.length; i++) {
      const { speaker, dialogue } = parseLine(lines[i], characterConfigs)

      if (i < deltas.length) {
        // 已有行：保留原有动作/背景字段，仅覆盖 speaker + dialogue
        newDeltas.push({ ...deltas[i], speaker, dialogue })
      } else {
        // 新增行：从空骨架开始
        newDeltas.push({ ...createEmptyDelta(), speaker, dialogue })
      }
    }

    setDraftDeltas(newDeltas)
    setIsDirty(false)
  }, [deltas, lines, characterConfigs, setDraftDeltas])

  // 单行编辑
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

  // textarea 全量编辑
  const handleTextareaChange = useCallback((value: string) => {
    const newLines = value.split('\n')
    setLines(newLines)
    setIsDirty(true)
  }, [])

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
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-edge/10 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            剧本总览
          </span>
          <span className="text-[10px] text-fg-faint">
            {lines.length} 行
          </span>
          {isDirty && (
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
              已修改
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={applyChanges}
            disabled={!isDirty}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              isDirty
                ? 'bg-primary text-on-primary hover:bg-primary-hover'
                : 'cursor-not-allowed bg-surface-1 text-fg-faint'
            }`}
          >
            <Check size={13} strokeWidth={1.75} />
            应用更改
          </button>
          <span className="text-[10px] text-fg-faint">Ctrl+S</span>
        </div>
      </div>

      {/* 编辑器主体 */}
      <div className="flex flex-1 overflow-hidden font-mono text-sm">
        {/* 行号列 */}
        <div
          ref={lineCountRef}
          className="shrink-0 select-none overflow-hidden border-r border-edge/10 bg-surface-1/50"
          style={{ width: 48 }}
        >
          <div className="py-3">
            {lines.map((_, i) => (
              <div
                key={i}
                className="flex h-7 items-center justify-end px-2 text-[11px] text-fg-faint"
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
          onChange={(e) => handleTextareaChange(e.target.value)}
          onScroll={handleScroll}
          placeholder="在此编辑剧本内容...&#10;&#10;格式：角色名: 台词&#10;示例：&#10;alice: 你好，今天天气真好&#10;bob: 是啊，我们去公园走走吧"
          className="flex-1 resize-none bg-transparent px-4 py-3 text-fg-muted leading-7 outline-none placeholder-fg-faint"
          spellCheck={false}
        />
      </div>

      {/* 底部提示 */}
      <div className="flex items-center justify-between border-t border-edge/10 px-4 py-1.5 text-[10px] text-fg-faint">
        <span>格式：角色名: 台词（角色名匹配角色管理中的显示名）</span>
        <span>Ctrl+S 保存 · 编辑后点击「应用更改」同步到项目</span>
      </div>
    </div>
  )
}
