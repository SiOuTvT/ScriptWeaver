// ============================================================
// ScriptWeaver - Ren'Py 富文本台词渲染器（含打字机）
//
// 消费 renpyText.layoutRenpyText 的解析结果：
//   - 样式分段渲染 {b}{i}{u}{s}{color=}{size=}{alpha=} 为真实视觉
//   - [变量] 实时插值（运行时值来自变量监视器同一数据源）
//   - 打字机模式：按 cps 逐字显现，{w}/{p} 停顿、{fast} 瞬显、{cps=} 变速
// 纯展示组件，无副作用写入 store。
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  layoutRenpyText,
  resolveSizeCss,
  countVisibleChars,
  type FlatPiece,
  type ChunkStyle,
} from '@/utils/renpyText'

export interface RenpyRichTextProps {
  text: string
  /** 变量运行时值（[var] 插值） */
  values?: Record<string, unknown>
  /** 打字机模式（false 时全文即显） */
  typing?: boolean
  /** 默认打字速度（字符/秒） */
  cps?: number
  /** 基准字号 px（{size=+2} 相对此值） */
  basePx?: number
  /** 打字完成回调 */
  onDone?: () => void
  className?: string
}

/** 打字机时间轴步骤：显示到第 n 个字符，或等待 */
interface Step {
  chars: number // 累计可见字符数
  delayMs: number // 本步之前的延迟
}

function styleToCss(s: ChunkStyle, basePx: number): React.CSSProperties {
  const css: React.CSSProperties = {}
  if (s.bold) css.fontWeight = 600
  if (s.italic) css.fontStyle = 'italic'
  const deco: string[] = []
  if (s.underline) deco.push('underline')
  if (s.strike) deco.push('line-through')
  if (deco.length > 0) css.textDecoration = deco.join(' ')
  if (s.color) css.color = s.color
  const size = resolveSizeCss(s.size, basePx)
  if (size !== undefined) css.fontSize = size
  if (s.alpha != null) css.opacity = s.alpha
  return css
}

/** 构建打字机时间轴：每个可见字符一步，{w}/{p} 插入额外延迟，{fast} 之前全部 0 延迟 */
function buildTimeline(pieces: FlatPiece[], defaultCps: number): Step[] {
  const steps: Step[] = []
  let chars = 0
  for (const p of pieces) {
    if (p.kind === 'chunk') {
      const cps = p.style.cps ?? defaultCps
      const perChar = cps > 0 ? 1000 / cps : 0
      for (const _ of Array.from(p.text)) {
        chars += 1
        steps.push({ chars, delayMs: perChar })
      }
    } else if (p.kind === 'pause') {
      steps.push({ chars, delayMs: p.ms })
    } else if (p.kind === 'fast') {
      // {fast}：把已有步骤延迟全部清零（瞬间显示至此）
      for (const s of steps) s.delayMs = 0
    }
    // break/nowait 不产生延迟步骤（break 由渲染层换行）
  }
  return steps
}

export default function RenpyRichText({
  text,
  values,
  typing = false,
  cps = 28,
  basePx = 15,
  onDone,
  className,
}: RenpyRichTextProps) {
  const pieces = useMemo(() => layoutRenpyText(text, values), [text, values])
  const totalChars = useMemo(() => countVisibleChars(pieces), [pieces])
  const timeline = useMemo(() => (typing ? buildTimeline(pieces, cps) : []), [pieces, cps, typing])

  const [visible, setVisible] = useState(typing ? 0 : totalChars)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)

  // 文本变化 → 重置打字机
  useEffect(() => {
    doneRef.current = false
    if (!typing) {
      setVisible(totalChars)
      return
    }
    setVisible(0)
    let idx = 0
    const tick = () => {
      if (idx >= timeline.length) {
        if (!doneRef.current) {
          doneRef.current = true
          onDone?.()
        }
        return
      }
      const step = timeline[idx]
      idx += 1
      timerRef.current = setTimeout(() => {
        setVisible(step.chars)
        tick()
      }, Math.max(0, step.delayMs))
    }
    tick()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, typing, totalChars])

  // 渲染：按 visible 截断可见字符
  const rendered = useMemo(() => {
    const out: React.ReactNode[] = []
    let used = 0
    let key = 0
    for (const p of pieces) {
      if (p.kind === 'break') {
        out.push(<br key={`br-${key++}`} />)
        continue
      }
      if (p.kind !== 'chunk') continue
      const arr = Array.from(p.text)
      const remain = visible - used
      if (remain <= 0) break
      const shown = arr.slice(0, Math.min(arr.length, remain)).join('')
      used += Math.min(arr.length, remain)
      if (shown) {
        out.push(
          <span key={`c-${key++}`} style={styleToCss(p.style, basePx)}>
            {shown}
          </span>,
        )
      }
    }
    return out
  }, [pieces, visible, basePx])

  return <span className={className}>{rendered}</span>
}
