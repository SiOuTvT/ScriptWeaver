// ============================================================
// ScriptWeaver - 剧情节点连线图谱（Visual Script Graph Canvas）
//
// 将带 label 的「剧情块」绘制为节点卡片，ChoiceItem 的跳转关系自动绘制为
// 节点间连线。支持：拖拽节点、点击节点/连线定位编辑、拖拽连线末端重新
// 绑定跳转目标。布局按 label 跳转关系 BFS 分层，自动排布。
// 严守铁律：所有跳转修改均经 updateDeltaAt 单事务提交。
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, CornerDownRight, RefreshCw, AlertTriangle, Crosshair, MousePointerClick } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import type { LineDelta } from '@/core/types'

const NODE_W = 228
const NODE_H = 176
const LAYER_GAP_X = 340
const NODE_GAP_Y = 224
const MARGIN = 56

interface BlockChoice {
  text: string
  condition?: string
  target_label: string
  lineIndex: number
  uid: string
}

interface Block {
  label: string
  startIndex: number
  endIndex: number
  lineIndexes: number[]
  choices: BlockChoice[]
  firstSpeaker: string | null
  firstDialogue: string
}

interface GraphEdge {
  id: string
  source: string
  target: string
  text: string
  condition?: string
  choiceLineIndex: number
  choiceUid: string
  broken: boolean
}

interface GraphData {
  blocks: Block[]
  edges: GraphEdge[]
  layout: Record<string, { x: number; y: number }>
}

/** 从剧本行提取剧情块 / 节点 / 连线，并做 BFS 分层布局。 */
function extractGraph(deltas: LineDelta[]): GraphData {
  const blocks: Block[] = []
  let cur: Block | null = null

  deltas.forEach((d, i) => {
    if (i === 0 || d.label?.trim()) {
      const label = d.label?.trim() || 'start'
      cur = {
        label,
        startIndex: i,
        endIndex: i,
        lineIndexes: [i],
        choices: [],
        firstSpeaker: d.speaker ?? null,
        firstDialogue: d.dialogue ?? '',
      }
      blocks.push(cur)
    } else {
      if (!cur) {
        cur = { label: 'start', startIndex: i, endIndex: i, lineIndexes: [i], choices: [], firstSpeaker: d.speaker ?? null, firstDialogue: d.dialogue ?? '' }
        blocks.push(cur)
      }
      cur.endIndex = i
      cur.lineIndexes.push(i)
      if (!cur.firstDialogue && d.dialogue) {
        cur.firstDialogue = d.dialogue
        cur.firstSpeaker = d.speaker ?? null
      }
    }
    if (d.line_type === 'choice') {
      for (const c of d.choices ?? []) {
        cur!.choices.push({
          text: c.text,
          condition: c.condition,
          target_label: c.target_label,
          lineIndex: i,
          uid: c.uid,
        })
      }
    }
  })

  const nodeLabels = new Set(blocks.map((b) => b.label))

  const edges: GraphEdge[] = []
  for (const b of blocks) {
    for (const ch of b.choices) {
      if (!ch.target_label) continue // 顺序继续（无跳转）不绘制连线
      const broken = !nodeLabels.has(ch.target_label)
      edges.push({
        id: ch.uid,
        source: b.label,
        target: ch.target_label,
        text: ch.text,
        condition: ch.condition,
        choiceLineIndex: ch.lineIndex,
        choiceUid: ch.uid,
        broken,
      })
    }
  }

  // ---- BFS 分层（按现有跳转关系） ----
  const adj = new Map<string, string[]>()
  for (const b of blocks) adj.set(b.label, [])
  for (const e of edges) if (nodeLabels.has(e.target)) adj.get(e.source)!.push(e.target)

  const layer = new Map<string, number>()
  const queue: string[] = blocks.length ? [blocks[0].label] : []
  if (queue.length) layer.set(queue[0], 0)
  while (queue.length) {
    const c = queue.shift()!
    for (const t of adj.get(c) ?? []) {
      if (!layer.has(t)) {
        layer.set(t, (layer.get(c) ?? 0) + 1)
        queue.push(t)
      }
    }
  }
  let maxL = 0
  for (const l of layer.values()) maxL = Math.max(maxL, l)
  const orphan = maxL + 1
  for (const b of blocks) if (!layer.has(b.label)) layer.set(b.label, orphan)

  const ordered = [...blocks].sort(
    (a, b) => (layer.get(a.label)! - layer.get(b.label)!) || a.startIndex - b.startIndex,
  )

  const layout: Record<string, { x: number; y: number }> = {}
  const rowCount: Record<number, number> = {}
  for (const b of ordered) {
    const l = layer.get(b.label)!
    const row = rowCount[l] ?? 0
    rowCount[l] = row + 1
    layout[b.label] = { x: MARGIN + l * LAYER_GAP_X, y: MARGIN + row * NODE_GAP_Y }
  }

  return { blocks, edges, layout }
}

function edgePath(s: { label: string; x: number; y: number }, t: { label: string; x: number; y: number }): string {
  const x1 = s.x + NODE_W / 2
  const y1 = s.y + NODE_H
  const x2 = t.x + NODE_W / 2
  const y2 = t.y
  if (s.label === t.label) {
    return `M ${x1} ${y1} C ${x1 + 100} ${y1 + 70}, ${x1 + 100} ${y2 - 70}, ${x2} ${y2}`
  }
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

export default function ScriptGraph({ onFocusLine }: { onFocusLine?: (index: number) => void }) {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)
  const selectLine = useAppStore((s) => s.selectLine)
  const selectedLineIndex = useAppStore((s) => s.selectedLineIndex)

  const graph = useMemo(() => extractGraph(draftDeltas), [draftDeltas])
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(graph.layout)
  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const [rebind, setRebind] = useState<{ edgeId: string; source: string; choiceLineIndex: number; choiceUid: string } | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)

  // 剧本结构变化 → 重新自动布局（重置拖拽位置）
  useEffect(() => {
    setPositions(graph.layout)
  }, [graph])

  const focus = (index: number) => {
    if (onFocusLine) onFocusLine(index)
    else selectLine(index)
  }

  const applyRebind = (choiceLineIndex: number, choiceUid: string, newTarget: string) => {
    updateDeltaAt(choiceLineIndex, (prev) => ({
      ...prev,
      choices: (prev.choices ?? []).map((c) =>
        c.uid === choiceUid ? { ...c, target_label: newTarget } : c,
      ),
    }))
  }

  // ---- 拖拽节点 ----
  const onNodePointerDown = (label: string, e: React.PointerEvent) => {
    e.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const start = positions[label] ?? { x: 0, y: 0 }
    const offX = e.clientX - (rect.left + start.x)
    const offY = e.clientY - (rect.top + start.y)
    const move = (ev: PointerEvent) => {
      setPositions((p) => ({
        ...p,
        [label]: { x: ev.clientX - rect.left - offX, y: ev.clientY - rect.top - offY },
      }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ---- 拖拽连线末端重绑跳转目标 ----
  const startRebind = (edge: GraphEdge, e: React.PointerEvent) => {
    e.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setRebind({ edgeId: edge.id, source: edge.source, choiceLineIndex: edge.choiceLineIndex, choiceUid: edge.choiceUid })
    setDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    const move = (ev: PointerEvent) => setDragPos({ x: ev.clientX - rect.left, y: ev.clientY - rect.top })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (hoverLabel && hoverLabel !== edge.source) {
        applyRebind(edge.choiceLineIndex, edge.choiceUid, hoverLabel)
      }
      setRebind(null)
      setDragPos(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const maxX = Math.max(0, ...graph.blocks.map((b) => (positions[b.label]?.x ?? 0) + NODE_W)) + MARGIN
  const maxY = Math.max(0, ...graph.blocks.map((b) => (positions[b.label]?.y ?? 0) + NODE_H)) + MARGIN

  const hasLabelNode = graph.blocks.some((b) => b.label !== 'start')

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* 顶部工具条 */}
      <div className="flex shrink-0 items-center justify-between border-b border-edge/10 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <GitBranch size={15} strokeWidth={1.75} className="text-signal" />
          <span className="eyebrow">剧情节点图谱</span>
          <span className="rounded-full bg-surface-1 px-1.5 py-0.5 text-[12px] text-fg-subtle">
            {graph.blocks.length} 节点 · {graph.edges.length} 连线
          </span>
          {graph.edges.some((e) => e.broken) && (
            <span className="flex items-center gap-1 rounded-full bg-danger/15 px-1.5 py-0.5 text-[12px] text-danger" title="存在指向未定义标签的跳转">
              <AlertTriangle size={11} strokeWidth={2} /> 断链 {graph.edges.filter((e) => e.broken).length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-fg-faint">
          <span className="hidden sm:inline">拖动节点移动 · 拖动连线末端圆点重绑跳转 · 双击卡片定位编辑</span>
          <button
            onClick={() => setPositions(graph.layout)}
            title="重新自动布局"
            className="inline-flex items-center gap-1 rounded-md border border-edge/20 bg-surface-2 px-2 py-1 text-fg transition-colors hover:bg-surface-hover"
          >
            <RefreshCw size={13} strokeWidth={1.75} /> 重排
          </button>
        </div>
      </div>

      {/* 画布 */}
      <div className="relative min-h-0 flex-1 overflow-auto">
        {graph.blocks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-fg-subtle">
            暂无剧情，先在时间轴添加几行吧
          </div>
        ) : !hasLabelNode ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-fg-subtle">
            <MousePointerClick size={26} strokeWidth={1.5} />
            <p className="max-w-[320px] text-[13px] leading-relaxed">
              还没有剧情块标签。在时间轴选中某行、于头部输入框填写「剧情块标签」（如 <span className="font-mono text-fg-muted">label_battle</span>），即可生成节点与跳转连线。
            </p>
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="relative"
            style={{ width: maxX, height: maxY, minWidth: '100%', minHeight: '100%' }}
            onPointerDown={(e) => {
              // 点击画布空白：若处于重绑中则取消（兜底）
              if (rebind) {
                setRebind(null)
                setDragPos(null)
              }
              e.stopPropagation()
            }}
          >
            {/* 连线层 */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
              {graph.edges.map((edge) => {
                const s = positions[edge.source]
                const t = positions[edge.target]
                if (!s || !t) return null
                const d = edgePath({ ...s, label: edge.source }, { ...t, label: edge.target })
                const stroke = edge.broken ? 'rgb(var(--c-danger))' : 'rgb(var(--c-signal))'
                return (
                  <g key={edge.id}>
                    <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeDasharray={edge.broken ? '6 4' : undefined} opacity={0.85} />
                    {/* 透明粗线用于点击定位 */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        focus(edge.choiceLineIndex)
                      }}
                    />
                    {/* 末端重绑手柄 */}
                    {!edge.broken && (
                      <circle
                        cx={t.x + NODE_W / 2}
                        cy={t.y}
                        r={5}
                        fill="rgb(var(--c-surface))"
                        stroke={stroke}
                        strokeWidth={2}
                        className="pointer-events-auto cursor-crosshair"
                        onPointerDown={(e) => startRebind(edge, e)}
                      />
                    )}
                    {edge.broken && (
                      <circle cx={t.x + NODE_W / 2} cy={t.y} r={5} fill="rgb(var(--c-danger))" stroke="rgb(var(--c-danger))" strokeWidth={2} />
                    )}
                  </g>
                )
              })}
              {/* 重绑临时线 */}
              {rebind && dragPos && positions[rebind.source] && (
                <path
                  d={`M ${positions[rebind.source].x + NODE_W / 2} ${positions[rebind.source].y + NODE_H} L ${dragPos.x} ${dragPos.y}`}
                  fill="none"
                  stroke="rgb(var(--c-signal))"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}
            </svg>

            {/* 连线标签（选项文本 + 条件） */}
            {graph.edges.map((edge) => {
              const s = positions[edge.source]
              const t = positions[edge.target]
              if (!s || !t) return null
              const mx = (s.x + NODE_W / 2 + t.x + NODE_W / 2) / 2
              const my = (s.y + NODE_H + t.y) / 2
              return (
                <button
                  key={`lbl-${edge.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    focus(edge.choiceLineIndex)
                  }}
                  title="点击定位到该选项所在选择支行"
                  className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] shadow-sm transition-colors ${
                    edge.broken
                      ? 'border-danger/40 bg-danger/10 text-danger'
                      : 'border-signal/40 bg-surface/90 text-fg-muted hover:bg-signal/15 hover:text-fg'
                  }`}
                  style={{ left: mx, top: my }}
                >
                  {edge.text || '（空选项）'}
                  {edge.condition && <span className="ml-1 text-fg-faint">[{edge.condition}]</span>}
                </button>
              )
            })}

            {/* 节点卡片 */}
            {graph.blocks.map((b) => {
              const pos = positions[b.label] ?? { x: MARGIN, y: MARGIN }
              const isStart = b.label === 'start'
              const isHover = hoverLabel === b.label
              const isSelected = selectedLineIndex === b.startIndex
              return (
                <div
                  key={b.label}
                  data-graph-node={b.label}
                  onPointerEnter={() => setHoverLabel(b.label)}
                  onPointerLeave={() => setHoverLabel((h) => (h === b.label ? null : h))}
                  className={`absolute flex flex-col rounded-xl border bg-surface shadow-md transition-shadow ${
                    isHover && rebind ? 'border-success ring-2 ring-success/50' : isSelected ? 'border-signal ring-2 ring-signal/40' : 'border-edge/[0.14]'
                  }`}
                  style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    focus(b.startIndex)
                  }}
                >
                  {/* 拖拽手柄 / 标题 */}
                  <div
                    onPointerDown={(e) => onNodePointerDown(b.label, e)}
                    className="flex cursor-grab items-center justify-between rounded-t-xl border-b border-edge/10 bg-surface-1/60 px-2.5 py-1.5 active:cursor-grabbing"
                  >
                    <span className="flex items-center gap-1 truncate font-mono text-[12px] font-semibold text-fg">
                      {isStart ? <span className="text-fg-faint">▣</span> : <span className="text-signal">#</span>}
                      <span className="truncate">{b.label}</span>
                    </span>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        focus(b.startIndex)
                      }}
                      title="定位编辑此剧情块"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-signal/15 hover:text-signal"
                    >
                      <Crosshair size={13} strokeWidth={1.75} />
                    </button>
                  </div>

                  {/* 首行摘要 */}
                  <div className="min-h-0 flex-1 overflow-hidden px-2.5 py-1.5">
                    <p className="line-clamp-2 text-[12px] leading-snug text-fg-subtle">
                      {b.firstSpeaker && <span className="font-medium text-fg-muted">{b.firstSpeaker}：</span>}
                      {b.firstDialogue || '（无台词）'}
                    </p>
                  </div>

                  {/* 选择支列表 */}
                  {b.choices.length > 0 && (
                    <div className="max-h-[68px] shrink-0 space-y-1 overflow-y-auto border-t border-edge/10 px-2.5 py-1.5">
                      {b.choices.map((c) => (
                        <button
                          key={c.uid}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            focus(c.lineIndex)
                          }}
                          title="点击定位到该选择支行"
                          className="flex w-full items-center gap-1 truncate rounded bg-surface-2/60 px-1.5 py-0.5 text-left text-[12px] text-fg-subtle transition-colors hover:bg-signal/15 hover:text-fg"
                        >
                          <CornerDownRight size={11} strokeWidth={1.75} className="shrink-0 text-signal/70" />
                          <span className="truncate">{c.text || '（空选项）'}</span>
                          {c.condition && <span className="ml-auto shrink-0 text-[11px] text-fg-faint">[{c.condition}]</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
