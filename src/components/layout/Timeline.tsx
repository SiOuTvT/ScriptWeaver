import { useMemo, useCallback, useRef, memo, useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, X, Plus, ZoomIn, ZoomOut } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import type { ResolvedLineState, LineDelta, CharacterConfig } from '@/core/types'
import { resolveCharColor, resolveAssetColor } from '@/utils/charColor'
import { estimateLineDurationMs } from '@/utils/playback'
import {
  DRAG_MIME,
  getDragCache,
  type DragAssetData,
  deriveCharacterId,
  getAudioCategory,
} from '@/utils/assetHelpers'
import { toast } from '@/utils/toast'

// ===================== 轨道配置 =====================

interface TrackDef {
  id: string
  label: string
  getValue: (s: ResolvedLineState) => string | null
  getAssetValue: (s: ResolvedLineState) => any
  color: string
  acceptAssetType: 'background' | 'audio' | 'sprite' | null
}

const TRACKS: TrackDef[] = [
  {
    id: 'bg', label: '背景',
    getValue: (s) => s.background?.asset_id ?? null,
    getAssetValue: (s) => s.background,
    color: '#8b5cf6', acceptAssetType: 'background',
  },
  {
    id: 'bgm', label: 'BGM',
    getValue: (s) => s.audio.bgm?.asset_id ?? null,
    getAssetValue: (s) => s.audio.bgm,
    color: '#22c55e', acceptAssetType: 'audio',
  },
  {
    id: 'ambient', label: '环境音',
    getValue: (s) => s.audio.ambient?.asset_id ?? null,
    getAssetValue: (s) => s.audio.ambient,
    color: '#3b82f6', acceptAssetType: 'audio',
  },
]

// ===================== 角色辅助 =====================

interface CharacterTracksResult {
  tracks: { id: string; label: string; color: string }[]
  spans: { charId: string; label: string; start: number; end: number; color: string; sprite_id: string; position_slot: string }[]
}

function computeCharacterTracks(
  states: ResolvedLineState[],
  characterConfigs: CharacterConfig[],
): CharacterTracksResult {
  const allChars = new Set<string>()
  for (const s of states) Object.keys(s.characters).forEach((c) => allChars.add(c))

  const tracks = Array.from(allChars).map((id) => ({
    id, label: id, color: resolveCharColor(id, characterConfigs),
  }))

  const spans: CharacterTracksResult['spans'] = []
  for (const cid of allChars) {
    let spanStart = -1
    let spanSprite = ''
    let spanSlot = ''
    for (let i = 0; i < states.length; i++) {
      if (states[i].characters[cid]) {
        if (spanStart === -1) {
          spanStart = i
          spanSprite = states[i].characters[cid].sprite_id
          spanSlot = states[i].characters[cid].position_slot
        }
      } else if (spanStart !== -1) {
        spans.push({ charId: cid, label: cid, start: spanStart, end: i - 1, color: resolveCharColor(cid, characterConfigs), sprite_id: spanSprite, position_slot: spanSlot })
        spanStart = -1
      }
    }
    if (spanStart !== -1)
      spans.push({ charId: cid, label: cid, start: spanStart, end: states.length - 1, color: resolveCharColor(cid, characterConfigs), sprite_id: spanSprite, position_slot: spanSlot })
  }
  return { tracks, spans }
}

function computeSpans(states: ResolvedLineState[], getValue: TrackDef['getValue']) {
  const spans: { start: number; end: number; label: string }[] = []
  if (states.length === 0) return spans
  let start = 0
  let prev = getValue(states[0])
  for (let i = 1; i < states.length; i++) {
    const curr = getValue(states[i])
    if (curr !== prev) {
      if (prev !== null) spans.push({ start, end: i - 1, label: prev })
      start = i; prev = curr
    }
  }
  if (prev !== null) spans.push({ start, end: states.length - 1, label: prev })
  return spans
}

// ===================== DropCell =====================

const DropCell = memo(function DropCell({
  lineIndex, trackId, acceptType, isSelected, width,
}: {
  lineIndex: number
  trackId: string
  acceptType: 'background' | 'audio' | 'sprite' | null
  isSelected: boolean
  width: number
}) {
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)
  const selectLine = useAppStore((s) => s.selectLine)
  const addCharacter = useAppStore((s) => s.addCharacter)
  const getCharacter = useAppStore((s) => s.getCharacter)

  const elRef = useRef<HTMLDivElement>(null)

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!acceptType) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const cache = getDragCache()
      if (!cache) return
      elRef.current?.classList.add('ring-1', 'ring-signal', 'bg-signal/15')
    },
    [acceptType],
  )

  const handleDragLeave = useCallback(() => {
      elRef.current?.classList.remove('ring-1', 'ring-signal', 'bg-signal/15')
    }, [])


  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      elRef.current?.classList.remove('ring-1', 'ring-signal', 'bg-signal/15')
      if (!acceptType) return

      let asset = getDragCache()
      if (!asset) {
        const raw = e.dataTransfer.getData(DRAG_MIME)
        if (raw) {
          try { asset = JSON.parse(raw) } catch { /* ignore */ }
        }
      }
      if (!asset) return

      selectLine(lineIndex)

      if (acceptType === 'background' && asset.type === 'background') {
        updateDeltaAt(lineIndex, (prev: LineDelta) => ({
          ...prev, background: { asset_id: asset.assetId },
        }))
        toast(`背景已设为 ${asset.name}`, 'success')
      } else if (acceptType === 'audio' && asset.type === 'audio') {
        // 拖到具体轨道上时，trackId 直接决定写入哪个字段，
        // 不依赖 ID 前缀猜测（用户可能用任何文件名导入）
        updateDeltaAt(lineIndex, (prev: LineDelta) => {
          const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
          if (trackId === 'bgm') {
            audio.bgm = { asset_id: asset.assetId, volume: 0.7, loop: true, fade_in_ms: 1000 }
          } else if (trackId === 'ambient') {
            audio.ambient = { asset_id: asset.assetId, volume: 0.4, loop: true, fade_in_ms: 1500 }
          } else if (trackId === 'voice') {
            audio.voice = asset.assetId
          } else {
            // SE 轨或兜底：追加到 se 列表
            audio.se = [...audio.se, asset.assetId]
          }
          return { ...prev, audio }
        })
        toast(`音频 ${asset.name} 已应用到 ${trackId}`, 'success')
      } else if (acceptType === 'sprite' && asset.type === 'sprite') {
        const charId = deriveCharacterId(asset.assetId)
        const trackCharId = trackId.startsWith('char_') ? trackId.slice(5) : charId

        // 自动创建角色（如果不存在）
        if (!getCharacter(trackCharId)) {
          const rawName = trackCharId.replace(/^local_/, '').replace(/_/g, ' ')
          const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1)
          addCharacter({
            charId: trackCharId,
            displayName,
            expressions: [{ id: 'default', label: '默认', assetId: asset.assetId }],
            defaultExpression: 'default',
          })
        }

        updateDeltaAt(lineIndex, (prev: LineDelta) => ({
          ...prev,
          characters: { ...prev.characters, [trackCharId]: { sprite_id: 'default', position_slot: 'center', action: 'show' } },
        }))
        toast(`立绘 ${asset.name} 已添加到 ${trackCharId}`, 'success')
      }
    },
    [lineIndex, trackId, acceptType, updateDeltaAt, selectLine, addCharacter, getCharacter],
  )

  return (
    <div
      ref={elRef}
      className={`shrink-0 border-r border-edge/10 ${isSelected ? 'bg-primary/5' : ''}`}
      style={{ width }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  )
})

// ===================== 色块 Span =====================

interface SpanData {
  start: number
  end: number
  label: string
  /** 素材 ID（用于解析素材专属色） */
  assetId?: string
  /** 片段颜色（素材色或轨道色） */
  color?: string
  /** 关联角色 ID（角色语音片段等） */
  charId?: string
}

function spanPct(val: number, total: number): string {
  return total > 0 ? `${(val / total) * 100}%` : '0%'
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const SpanBlock = memo(function SpanBlock({
  span,
  total,
  color,
}: {
  span: SpanData
  total: number
  color: string
}) {
  return (
    <div
      className="absolute top-1 bottom-1 rounded-sm px-2 select-none"
      style={{
          left: spanPct(span.start, total),
          width: spanPct(span.end - span.start + 1, total),
          backgroundColor: color + '55',
        borderLeft: `2px solid ${color}`,
      }}
    >
      <span className="truncate text-[14px] leading-5 text-fg">
        {span.label}
      </span>
    </div>
  )
})

// ===================== 色块拖拽调整（原生鼠标事件，不与 HTML5 拖拽冲突） =====================

interface ResizeState {
  trackId: string
  spanStart: number
  spanEnd: number
  edge: 'left' | 'right' | 'move'
  charId?: string    // 立绘色块归属的角色
  ghostLeft: number  // px
  ghostWidth: number // px
  targetLine: number
  anchorLine: number // move 模式下拖拽起点的目标行，用于计算位移
  trackIndex: number // 所在轨道行序号，用于定位预览浮层
}

/** 色块：整块可拖动 —— 靠近左右边缘=伸缩，中间=整体移动；右上角可删除 */
const DraggableSpan = memo(function DraggableSpan({
  span,
  total,
  color,
  trackId,
  trackRowEl,
  onResizeStart,
  onDelete,
  selected,
  onSelect,
}: {
  span: SpanData
  total: number
  color: string
  trackId: string
  trackRowEl: HTMLDivElement | null
  onResizeStart: (state: Omit<ResizeState, 'ghostLeft' | 'ghostWidth' | 'targetLine' | 'anchorLine' | 'trackIndex'> & { startClientX: number }) => void
  onDelete: () => void
  selected?: boolean
  onSelect?: () => void
}) {
  const leftPct = spanPct(span.start, total)
  const widthPct = spanPct(span.end - span.start + 1, total)
  const outerRef = useRef<HTMLDivElement>(null)

  // 在色块上按下：按落点靠近哪条边决定「伸缩」还是「整体移动」
  const handleDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (!trackRowEl) return

      const rect = outerRef.current?.getBoundingClientRect()
      let edge: 'left' | 'right' | 'move' = 'move'
      if (rect && rect.width > 0) {
        const offset = e.clientX - rect.left
        const threshold = Math.max(10, rect.width * 0.22) // 边缘命中区，整块都好抓
        if (offset <= threshold) edge = 'left'
        else if (offset >= rect.width - threshold) edge = 'right'
      }

      onSelect?.()
      onResizeStart({
        trackId,
        spanStart: span.start,
        spanEnd: span.end,
        edge,
        charId: span.charId,
        startClientX: e.clientX,
      })
    },
    [trackId, span.start, span.end, span.charId, trackRowEl, onResizeStart],
  )

  return (
    <div
      ref={outerRef}
      className="group absolute top-0 bottom-0 select-none"
      style={{ left: leftPct, width: widthPct }}
    >
      {/* 色块主体（整块可拖：边缘伸缩 / 中间移动） */}
      <div
        className={`pointer-events-auto absolute inset-x-0.5 top-1 bottom-1 cursor-grab rounded-sm active:cursor-grabbing ${selected ? 'ring-2 ring-signal' : ''}`}
        style={{
          backgroundColor: color + '55',
          borderLeft: `2px solid ${color}`,
        }}
        onMouseDown={handleDown}
        title="拖动中间可整体移动；拖动左右边缘可伸缩长度；选中后按 ← → 微移"
      >
        <span className="truncate px-1.5 text-[13px] leading-5 text-fg" title={span.label}>
          {span.label}
        </span>
      </div>

      {/* 删除按钮（hover 显示） */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title="删除该片段"
        className="absolute -right-1.5 -top-1.5 z-40 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
      >
        <X size={10} strokeWidth={2.5} />
      </button>

      {/* 边缘视觉提示（仅作提示，不拦截事件） */}
      <div className="pointer-events-none absolute left-0 top-1 bottom-1 z-30 w-1.5 rounded-l bg-fg/0 group-hover:bg-fg/20" />
      <div className="pointer-events-none absolute right-0 top-1 bottom-1 z-30 w-1.5 rounded-r bg-fg/0 group-hover:bg-fg/20" />
    </div>
  )
})

// ===================== 主组件 =====================

export default function Timeline() {
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const selectLine = useAppStore((s) => s.selectLine)
  const batchUpdateDeltas = useAppStore((s) => s.batchUpdateDeltas)
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)
  const insertDeltaAt = useAppStore((s) => s.insertDeltaAt)
  const deleteDeltaAt = useAppStore((s) => s.deleteDeltaAt)
  const moveDelta = useAppStore((s) => s.moveDelta)
  const getAsset = useAppStore((s) => s.getAsset)
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)

  const assetName = useCallback(
    (id: string | null) => (id ? (getAsset(id)?.name ?? id) : ''),
    [getAsset],
  )
  const charDisplayName = useCallback(
    (charId: string) => characterConfigs.find((c) => c.charId === charId)?.displayName ?? charId,
    [characterConfigs],
  )

  const charData = useMemo(
    () => computeCharacterTracks(resolvedStates, characterConfigs),
    [resolvedStates, characterConfigs],
  )

  // speaker 显示名 → charId（用于语音轨道按说话角色着色 / 标注）
  const speakerMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of characterConfigs) {
      m.set(c.charId.toLowerCase(), c.charId)
      m.set(c.displayName.toLowerCase(), c.charId)
    }
    return m
  }, [characterConfigs])

  const seEvents = useMemo(() =>
    resolvedStates
      .map((s, i) => (s.audio.se.length > 0 ? { index: i, items: s.audio.se } : null))
      .filter(Boolean) as { index: number; items: string[] }[],
  [resolvedStates])

  const voiceEvents = useMemo(() =>
    resolvedStates
      .map((s, i) => (s.audio.voice ? { index: i, voice: s.audio.voice } : null))
      .filter(Boolean) as { index: number; voice: string }[],
  [resolvedStates])

  const total = resolvedStates.length
  const trackHeight = 36
  const HEADER_H = 48
  const SNAP_RADIUS_PX = 8
  const SUBDIV = 4

  // 缩放：把行拉宽/收窄，便于精细对齐与拖拽
  const ZOOM_MIN = 60
  const ZOOM_MAX = 300
  const ZOOM_STEP = 40
  const [cellWidth, setCellWidth] = useState(120)
  const zoomIn = useCallback(() => setCellWidth((w) => Math.min(ZOOM_MAX, w + ZOOM_STEP)), [])
  const zoomOut = useCallback(() => setCellWidth((w) => Math.max(ZOOM_MIN, w - ZOOM_STEP)), [])
  const zoomReset = useCallback(() => setCellWidth(120), [])

  const allTracks = useMemo(() => [
    ...TRACKS.map((t) => ({
      id: t.id, label: t.label, color: t.color,
      acceptAssetType: t.acceptAssetType,
      spans: computeSpans(resolvedStates, t.getValue).map((sp) => ({
        ...sp,
        assetId: sp.label,
        label: assetName(sp.label),
        color: resolveAssetColor(sp.label, assets),
      })),
      trackType: 'static' as const,
      trackDef: t,
    })),
    // 所有角色合并到一条「立绘」轨道，用角色专属颜色区分，避免角色多时轨道行爆炸
    {
      id: 'characters', label: '立绘', color: '#ec4899',
      acceptAssetType: 'sprite' as const,
      spans: charData.spans.map((s) => ({
        start: s.start, end: s.end,
        label: charDisplayName(s.charId),
        color: s.color,
        charId: s.charId,
      })),
      trackType: 'sprite-merged' as const,
      trackDef: undefined,
    },
    { id: 'se', label: 'SE', color: '#eab308', acceptAssetType: 'audio' as const, spans: [], trackType: 'static' as const, trackDef: undefined },
    { id: 'voice', label: '语音', color: '#a855f7', acceptAssetType: 'audio' as const, spans: [], trackType: 'static' as const, trackDef: undefined },
  ], [resolvedStates, charData, assetName, charDisplayName])

  const totalTracks = allTracks.length

  // ========== 色块拖拽 resize 状态 ==========
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const trackRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // 磁吸参考线（拖拽时显示，行单位，可小数）
  const [guideLines, setGuideLines] = useState<number[]>([])
  // 选中的片段（用于高亮 + 方向键微移）
  const [selectedSpan, setSelectedSpan] = useState<{ trackId: string; start: number; end: number; charId?: string } | null>(null)

  const setTrackRowRef = useCallback((trackId: string) => (el: HTMLDivElement | null) => {
    if (el) trackRowRefs.current.set(trackId, el)
    else trackRowRefs.current.delete(trackId)
  }, [])

  // 提交一次色块拖拽/伸缩的最终结果
  const commitResize = useCallback(
    (rs: ResizeState) => {
      const spanLen = rs.spanEnd - rs.spanStart
      let newStart = rs.spanStart
      let newEnd = rs.spanEnd
      if (rs.edge === 'left') {
        newStart = rs.targetLine
        newEnd = rs.spanEnd
      } else if (rs.edge === 'right') {
        newEnd = rs.targetLine
        newStart = rs.spanStart
      } else {
        newStart = rs.targetLine
        newEnd = rs.targetLine + spanLen
      }

      if (newStart === rs.spanStart && newEnd === rs.spanEnd) return

      const track = allTracks.find((t) => t.id === rs.trackId)
      if (!track) return

      const updates: { index: number; updater: (prev: LineDelta) => LineDelta }[] = []

      if (track.trackType === 'static' && track.trackDef) {
        const td = track.trackDef
        for (let i = 0; i < total; i++) {
          const shouldHave = i >= newStart && i <= newEnd
          const wasIn = i >= rs.spanStart && i <= rs.spanEnd

          if (shouldHave && !wasIn) {
            const anchorState = resolvedStates[rs.spanStart]
            const assetVal = td.getAssetValue(anchorState)
            if (td.id === 'bg') {
              updates.push({ index: i, updater: (prev) => ({ ...prev, background: assetVal }) })
            } else if (td.id === 'bgm') {
              updates.push({
                index: i,
                updater: (prev) => {
                  const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
                  audio.bgm = assetVal
                  return { ...prev, audio }
                },
              })
            } else if (td.id === 'ambient') {
              updates.push({
                index: i,
                updater: (prev) => {
                  const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
                  audio.ambient = assetVal
                  return { ...prev, audio }
                },
              })
            }
          } else if (!shouldHave && wasIn) {
            if (td.id === 'bg') {
              updates.push({ index: i, updater: (prev) => ({ ...prev, background: null }) })
            } else if (td.id === 'bgm') {
              updates.push({
                index: i,
                updater: (prev) => {
                  const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
                  audio.bgm = null
                  return { ...prev, audio }
                },
              })
            } else if (td.id === 'ambient') {
              updates.push({
                index: i,
                updater: (prev) => {
                  const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
                  audio.ambient = null
                  return { ...prev, audio }
                },
              })
            }
          }
        }
      } else if (track.trackType === 'sprite-merged' && rs.charId) {
        const charId = rs.charId
        const anchorState = resolvedStates[rs.spanStart]
        const charState = anchorState.characters[charId]
        if (!charState) return

        const spriteId = charState.sprite_id
        const slot = charState.position_slot

        for (let i = 0; i < total; i++) {
          const shouldHave = i >= newStart && i <= newEnd
          const wasIn = i >= rs.spanStart && i <= rs.spanEnd

          if (shouldHave && !wasIn) {
            updates.push({
              index: i,
              updater: (prev) => ({
                ...prev,
                characters: {
                  ...prev.characters,
                  [charId]: { sprite_id: spriteId, position_slot: slot, action: 'show' as const },
                },
              }),
            })
          } else if (!shouldHave && wasIn) {
            updates.push({
              index: i,
              updater: (prev) => {
                const chars = { ...prev.characters }
                if (chars[charId]) {
                  chars[charId] = { ...chars[charId], action: 'hide' as const }
                }
                return { ...prev, characters: chars }
              },
            })
          }
        }
      }

      if (updates.length > 0) {
        batchUpdateDeltas(updates)
        toast(`${track.label} 片段已移动到 第 ${newStart + 1}–${newEnd + 1} 行`, 'info')
      }
    },
    [allTracks, resolvedStates, total, batchUpdateDeltas],
  )

  // 在色块上按下时直接挂载 document 级监听（而非用依赖 resizeState 的 effect 反复订阅，
  // 后者每次移动都退订/重订会丢事件，导致「有时候拖不动」）
  const handleResizeStart = useCallback(
    (info: Omit<ResizeState, 'ghostLeft' | 'ghostWidth' | 'targetLine' | 'anchorLine' | 'trackIndex'> & { startClientX: number }) => {
      const rowEl = trackRowRefs.current.get(info.trackId)
      if (!rowEl) return

      const rowRect = rowEl.getBoundingClientRect()
      const targetLine = clamp(Math.round((info.startClientX - rowRect.left) / cellWidth), 0, total - 1)
      const anchorLine = targetLine
      const trackIndex = allTracks.findIndex((t) => t.id === info.trackId)

      const st: ResizeState = {
        ...info,
        ghostLeft: info.spanStart * cellWidth,
        ghostWidth: (info.spanEnd - info.spanStart + 1) * cellWidth,
        targetLine: anchorLine,
        anchorLine,
        trackIndex: trackIndex < 0 ? 0 : trackIndex,
      }
      resizeRef.current = st
      setResizeState(st)

      // 拖拽期间锁全局光标 + 禁止选中文本
      document.body.style.cursor = info.edge === 'move' ? 'grabbing' : 'ew-resize'
      document.body.style.userSelect = 'none'

      // 磁吸候选：同轨其它片段的左右边缘 + 播放头（当前选中行）
      const snapCandidates: number[] = []
      const track = allTracks.find((t) => t.id === info.trackId)
      if (track) {
        for (const sp of track.spans as SpanData[]) {
          if (sp.start === info.spanStart && sp.end === info.spanEnd && (sp.charId ?? undefined) === (info.charId ?? undefined)) continue
          snapCandidates.push(sp.start, sp.end + 1)
        }
      }
      snapCandidates.push(selectedIndex)
      const SNAP_R = SNAP_RADIUS_PX / cellWidth

      const move = (ev: MouseEvent) => {
        const cur = resizeRef.current
        if (!cur) return
        const row = trackRowRefs.current.get(cur.trackId)
        if (!row) return
        const rr = row.getBoundingClientRect()
        const spanLen = cur.spanEnd - cur.spanStart
        // 连续（小数行）位置：拖拽跟手、不跳格
        const posF = clamp((ev.clientX - rr.left) / cellWidth, 0, total - 1e-6)

        let newStartF = cur.spanStart
        let newEndF = cur.spanEnd
        if (cur.edge === 'left') {
          newStartF = clamp(posF, 0, cur.spanEnd)
        } else if (cur.edge === 'right') {
          newEndF = clamp(posF, cur.spanStart, total - 1)
        } else {
          newStartF = clamp(cur.spanStart + (posF - cur.anchorLine), 0, total - 1 - spanLen)
          newEndF = newStartF + spanLen
        }

        // 磁吸：对移动边缘吸附到最近候选（邻近片段边缘 / 播放头），并显示参考线
        const testEdges = cur.edge === 'left' ? [newStartF] : cur.edge === 'right' ? [newEndF] : [newStartF, newEndF]
        let best = SNAP_R
        let bestC = -1
        let bestIdx = 0
        testEdges.forEach((edge, idx) => {
          for (const c of snapCandidates) {
            const d = Math.abs(edge - c)
            if (d < best) { best = d; bestC = c; bestIdx = idx }
          }
        })
        const guides: number[] = []
        if (bestC >= 0) {
          const deltaSnap = bestC - testEdges[bestIdx]
          // 吸附后重新 clamp 到合法范围，避免越界卡死
          if (cur.edge === 'left') newStartF = clamp(newStartF + deltaSnap, 0, cur.spanEnd)
          else if (cur.edge === 'right') newEndF = clamp(newEndF + deltaSnap, cur.spanStart, total - 1)
          else { newStartF = clamp(newStartF + deltaSnap, 0, total - 1 - spanLen); newEndF = newStartF + spanLen }
          guides.push(bestC)
        }

        const targetLineVal = cur.edge === 'right' ? Math.round(newEndF) : Math.round(newStartF)
        const next: ResizeState = {
          ...cur,
          ghostLeft: newStartF * cellWidth,
          ghostWidth: Math.max(cellWidth, (newEndF - newStartF + 1) * cellWidth),
          targetLine: targetLineVal,
        }
        resizeRef.current = next
        setResizeState(next)
        setGuideLines(guides)
      }

      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        const stt = resizeRef.current
        resizeRef.current = null
        setGuideLines([])
        if (stt) commitResize(stt)
        setResizeState(null)
      }

      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [total, allTracks, cellWidth, selectedIndex, commitResize],
  )

  // 删除整段色块（bgm/ambient 置空，立绘移除该角色指令）
  const handleDeleteSpan = useCallback(
    (trackId: string, span: SpanData) => {
      const updates: { index: number; updater: (prev: LineDelta) => LineDelta }[] = []
      for (let i = span.start; i <= span.end; i++) {
        updates.push({
          index: i,
          updater: (prev) => {
            if (trackId === 'bgm' || trackId === 'ambient') {
              const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
              if (trackId === 'bgm') audio.bgm = null
              else audio.ambient = null
              return { ...prev, audio }
            }
            if (trackId === 'characters' && span.charId) {
              const chars = { ...prev.characters }
              delete chars[span.charId]
              return { ...prev, characters: chars }
            }
            return prev
          },
        })
      }
      if (updates.length) batchUpdateDeltas(updates)
      toast(`已删除 ${trackId} 片段（第 ${span.start + 1}–${span.end + 1} 行）`, 'info')
    },
    [batchUpdateDeltas],
  )

  // 选中片段后用 ← → 方向键整体微移 1 行
  const nudgeSelected = useCallback(
    (delta: number) => {
      const sel = selectedSpan
      if (!sel) return
      const spanLen = sel.end - sel.start
      const newStart = clamp(sel.start + delta, 0, total - 1 - spanLen)
      const newEnd = newStart + spanLen
      if (newStart === sel.start) return
      commitResize({
        trackId: sel.trackId,
        spanStart: sel.start,
        spanEnd: sel.end,
        edge: 'move',
        charId: sel.charId,
        ghostLeft: 0,
        ghostWidth: 0,
        targetLine: newStart,
        anchorLine: sel.start,
        trackIndex: 0,
      })
      setSelectedSpan({ ...sel, start: newStart, end: newEnd })
    },
    [selectedSpan, total, commitResize],
  )

  // ========== 段落内音频偏移拖拽（SE / Voice 在单行内部的时间轴定位） ==========
  const seDragRef = useRef<{ lineIndex: number; kind: 'se' | 'voice'; id: string; offset: number } | null>(null)
  const [seDrag, setSeDrag] = useState<{ lineIndex: number; kind: 'se' | 'voice'; id: string; offset: number } | null>(null)
  // 选中的音频块（SE / Voice），用于 Alt+方向键微调解其段落内相对时间戳
  const [selectedAudio, setSelectedAudio] = useState<{ kind: 'se' | 'voice'; lineIndex: number; id: string } | null>(null)

  /**
   * 在单个 cell（即一行）内水平拖拽音频块，换算为相对该段落起点的切入延迟（offset_ms）。
   * 行内时间轴总时长由台词字数估算（estimateLineDurationMs），与 Auto 播放严格一致。
   */
  const handleAudioOffsetDragStart = useCallback(
    (lineIndex: number, kind: 'se' | 'voice', id: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setSelectedAudio({ kind, id, lineIndex })
      const rowEl = trackRowRefs.current.get(kind === 'se' ? 'se' : 'voice')
      if (!rowEl) return
      const rect = rowEl.getBoundingClientRect()
      const cellW = rect.width / total
      const duration = estimateLineDurationMs(resolvedStates[lineIndex]?.dialogue)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'

      const move = (ev: MouseEvent) => {
        const x = clamp(ev.clientX - rect.left - lineIndex * cellW, 0, cellW)
        const offset = Math.round((x / cellW) * duration)
        seDragRef.current = { lineIndex, kind, id, offset }
        setSeDrag({ lineIndex, kind, id, offset })
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        const d = seDragRef.current
        seDragRef.current = null
        setSeDrag(null)
        if (!d) return
        updateDeltaAt(d.lineIndex, (prev) => {
          const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
          if (d.kind === 'se') {
            audio.se_offset_ms = { ...(prev.audio.se_offset_ms ?? {}), [d.id]: d.offset }
          } else {
            audio.voice_offset_ms = d.offset
          }
          return { ...prev, audio }
        })
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [total, resolvedStates, updateDeltaAt, setSelectedAudio],
  )

  // 方向键微移监听（输入框聚焦时不拦截）
  useEffect(() => {
    if (!selectedSpan) return
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudgeSelected(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudgeSelected(1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedSpan, nudgeSelected])

  // Alt+← / Alt+→ 微调解选中音频块的段落内相对时间戳（±50ms；Alt+Shift ±250ms）
  useEffect(() => {
    if (!selectedAudio) return
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (!e.altKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const step = (e.shiftKey ? 250 : 50) * (e.key === 'ArrowRight' ? 1 : -1)
      const a = selectedAudio
      const cur = a.kind === 'se'
        ? resolvedStates[a.lineIndex]?.audio.se_offset_ms?.[a.id] ?? 0
        : resolvedStates[a.lineIndex]?.audio.voice_offset_ms ?? 0
      const next = Math.max(0, cur + step)
      updateDeltaAt(a.lineIndex, (prev) => {
        const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
        if (a.kind === 'se') audio.se_offset_ms = { ...(prev.audio.se_offset_ms ?? {}), [a.id]: next }
        else audio.voice_offset_ms = next
        return { ...prev, audio }
      })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedAudio, resolvedStates, updateDeltaAt])

  // 拖拽中断（卸载等）时还原全局光标与选中状态
  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  return (
    <div className="flex shrink-0 flex-col mt-3 bg-surface rounded-xl border border-edge/[0.12] shadow-sm relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge/10 px-3 py-1.5">
        <span className="text-[12px] font-medium text-fg">时间轴</span>
        <div className="flex items-center gap-2">
          {/* 缩放控制：拉宽行距便于精细对齐 */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={zoomOut}
              disabled={cellWidth <= ZOOM_MIN}
              title="缩小行距"
              className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                cellWidth <= ZOOM_MIN ? 'cursor-default text-fg-faint' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
              }`}
            ><ZoomOut size={13} strokeWidth={1.75} /></button>
            <button
              onClick={zoomReset}
              title="恢复默认行距"
              className="min-w-[34px] rounded px-1 text-center text-[12px] tabular-nums text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >{Math.round((cellWidth / 120) * 100)}%</button>
            <button
              onClick={zoomIn}
              disabled={cellWidth >= ZOOM_MAX}
              title="放大行距"
              className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                cellWidth >= ZOOM_MAX ? 'cursor-default text-fg-faint' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
              }`}
            ><ZoomIn size={13} strokeWidth={1.75} /></button>
          </div>
          <span className="text-[12px] text-fg-subtle">{total} 行 {totalTracks} 轨</span>
        </div>
      </div>

      <div className="flex overflow-auto bg-canvas/[0.30]" style={{ maxHeight: `${totalTracks * trackHeight + HEADER_H + 8}px` }}>
        {/* 轨道标签列 */}
        <div className="shrink-0 border-r border-edge/10 bg-canvas/50">
          {/* 占位行：对齐右边行号 header（48px 高） */}
          <div className="flex items-center border-b border-edge/10 px-2 text-[12px] font-semibold text-fg-subtle"
            style={{ height: 48 }}>
            轨道
          </div>
          {allTracks.map((track) => (
            <div key={track.id} className="flex items-center gap-1.5 border-b border-edge/10 px-2 text-[12px] text-fg-muted"
              style={{ height: trackHeight }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: track.color }} />
              <span className="truncate">{track.label}</span>
            </div>
          ))}
        </div>

        {/* 轨道内容 */}
        <div className="flex-1 overflow-x-auto">
          <div className="relative" style={{ width: `${total * cellWidth}px` }}>
            {/* 行号 + 行操作按钮 */}
            <div className="flex border-b border-edge/10" style={{ height: 48 }}>
              {resolvedStates.map((s, i) => {
                const isLast = i === resolvedStates.length - 1
                const isFirst = i === 0
                const onlyOne = resolvedStates.length <= 1
                return (
                  <div
                    key={s.line_id}
                    className={`group relative flex shrink-0 flex-col border-r border-edge/10 ${
                      i === selectedIndex ? 'bg-primary/15' : ''
                    }`}
                    style={{ width: cellWidth }}
                  >
                    {/* 行号按钮 */}
                    <button
                      onClick={() => selectLine(i)}
                      className={`flex w-full flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                        i === selectedIndex
                          ? 'text-signal'
                          : 'text-fg-subtle group-hover:text-fg'
                      }`}
                    >
                      <span className="font-mono leading-none text-[12px]">{s.line_id}</span>
                      <span className="w-full truncate text-center text-[12px] leading-tight text-fg-subtle">
                        {s.speaker ? `${s.speaker}：${s.dialogue}` : s.dialogue}
                      </span>
                    </button>

                    {/* 行操作按钮（hover 出现） */}
                    <div className="flex h-5 items-center justify-center gap-0.5 bg-surface-2/60 opacity-0 transition-opacity group-hover:opacity-100">
                      {/* 上移 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); moveDelta(i, i - 1) }}
                        disabled={isFirst}
                        title="上移一行"
                        className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                          isFirst ? 'cursor-default text-fg-faint' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                        }`}
                      ><ChevronUp size={12} strokeWidth={1.75} /></button>

                      {/* 插入（在当前行后） */}
                      <button
                        onClick={(e) => { e.stopPropagation(); insertDeltaAt(i + 1) }}
                        title="在下方插入新行"
                        className="flex h-4 w-4 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-success"
                      ><Plus size={12} strokeWidth={1.75} /></button>

                      {/* 删除 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteDeltaAt(i) }}
                        disabled={onlyOne}
                        title={onlyOne ? '至少保留一行' : '删除此行'}
                        className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                          onlyOne ? 'cursor-default text-fg-faint' : 'text-fg-subtle hover:bg-surface-hover hover:text-danger'
                        }`}
                      ><X size={12} strokeWidth={1.75} /></button>

                      {/* 下移 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); moveDelta(i, i + 1) }}
                        disabled={isLast}
                        title="下移一行"
                        className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                          isLast ? 'cursor-default text-fg-faint' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                        }`}
                      ><ChevronDown size={12} strokeWidth={1.75} /></button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 轨道行 */}
            {allTracks.map((track) => (
              <div
                key={track.id}
                ref={setTrackRowRef(track.id)}
                className="relative flex border-b border-edge/10"
                style={{ height: trackHeight }}
                onMouseDown={() => { setSelectedSpan(null); setSelectedAudio(null) }}
              >
                {resolvedStates.map((s, i) => (
                  <DropCell key={s.line_id} lineIndex={i} trackId={track.id}
                    acceptType={track.acceptAssetType} isSelected={i === selectedIndex} width={cellWidth} />
                ))}

                {/* 可拖拽色块 */}
                {track.spans.map((span, si) => (
                  <DraggableSpan
                    key={si}
                    span={span}
                    total={total}
                    color={span.color ?? track.color}
                    trackId={track.id}
                    trackRowEl={trackRowRefs.current.get(track.id) ?? null}
                    selected={selectedSpan?.trackId === track.id && selectedSpan.start === span.start && selectedSpan.end === span.end && (selectedSpan.charId ?? undefined) === ((span as SpanData).charId ?? undefined)}
                    onSelect={() => setSelectedSpan({ trackId: track.id, start: span.start, end: span.end, charId: (span as SpanData).charId })}
                    onResizeStart={handleResizeStart}
                    onDelete={() => handleDeleteSpan(track.id, span)}
                  />
                ))}

                {/* SE 点事件：按素材专属色着色 */}
                {track.id === 'se' && seEvents.map((ev) => {
                  const seColor = resolveAssetColor(ev.items[0], assets)
                  const duration = estimateLineDurationMs(resolvedStates[ev.index]?.dialogue)
                  const baseOffset = resolvedStates[ev.index]?.audio.se_offset_ms?.[ev.items[0]] ?? 0
                  const offset = seDrag?.kind === 'se' && seDrag.lineIndex === ev.index && seDrag.id === ev.items[0] ? seDrag.offset : baseOffset
                  const cellLeftPct = (ev.index / total) * 100
                  const cellWidthPct = (1 / total) * 100
                  const leftPct = cellLeftPct + (offset / Math.max(duration, 1)) * cellWidthPct
                  return (
                  <div
                    key={`se-${ev.index}-${ev.items[0]}`}
                    className="group absolute top-1 bottom-1 z-10 flex items-center"
                    style={{ left: `${leftPct}%`, width: `clamp(30px, ${cellWidthPct}%, 64px)` }}
                    title={`${ev.items.map(assetName).join(', ')}（第 ${Math.round(offset)}ms 切入 · 拖拽或 Alt+←→ 段落内微调）`}
                  >
                    <div
                      onMouseDown={(e) => handleAudioOffsetDragStart(ev.index, 'se', ev.items[0], e)}
                      className={`flex h-full min-w-[28px] cursor-ew-resize items-center justify-center overflow-hidden rounded-sm border-l-2 px-1 text-[12px] text-fg ${
                        selectedAudio?.kind === 'se' && selectedAudio.lineIndex === ev.index && selectedAudio.id === ev.items[0] ? 'ring-2 ring-signal' : ''
                      }`}
                      style={{ backgroundColor: seColor + '33', borderLeftColor: seColor }}
                    >
                      <span className="truncate">{assetName(ev.items[0])}</span>
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateDeltaAt(ev.index, (prev) => ({
                          ...prev,
                          audio: { ...prev.audio, se: prev.audio.se.filter((x) => x !== ev.items[0]) },
                        }))
                      }}
                      title="删除该 SE"
                      className="pointer-events-auto absolute -right-1.5 -top-1.5 z-40 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-white group-hover:flex"
                    ><X size={10} strokeWidth={2.5} /></button>
                  </div>
                  )
                })}

                {/* Voice 点事件：优先用语音素材色，否则按说话角色着色 + 标注角色名 */}
                {track.id === 'voice' && voiceEvents.map((ev) => {
                  const sp = resolvedStates[ev.index]?.speaker
                  const charId = sp ? speakerMap.get(sp.toLowerCase()) : undefined
                  const voiceAsset = ev.voice ? assets.find((a) => a.id === ev.voice) : null
                  const vColor = voiceAsset?.color
                    ? voiceAsset.color
                    : charId
                      ? resolveCharColor(charId, characterConfigs)
                      : '#a855f7'
                  const who = charId ? charDisplayName(charId) : (sp ?? '')
                  const duration = estimateLineDurationMs(resolvedStates[ev.index]?.dialogue)
                  const baseOffset = resolvedStates[ev.index]?.audio.voice_offset_ms ?? 0
                  const offset = seDrag?.kind === 'voice' && seDrag.lineIndex === ev.index ? seDrag.offset : baseOffset
                  const cellLeftPct = (ev.index / total) * 100
                  const cellWidthPct = (1 / total) * 100
                  const leftPct = cellLeftPct + (offset / Math.max(duration, 1)) * cellWidthPct
                  return (
                    <div
                      key={`voice-${ev.index}`}
                      className="group absolute top-1 bottom-1 z-10 flex items-center"
                      style={{ left: `${leftPct}%`, width: `clamp(30px, ${cellWidthPct}%, 64px)` }}
                      title={`${who ? who + ' ' : ''}${assetName(ev.voice)}（第 ${Math.round(offset)}ms 切入 · 拖拽或 Alt+←→ 段落内微调）`}>
                      <div
                      onMouseDown={(e) => handleAudioOffsetDragStart(ev.index, 'voice', ev.voice, e)}
                      className={`flex h-full min-w-[28px] cursor-ew-resize items-center justify-center overflow-hidden rounded-sm border-l-2 px-1 text-[12px] text-fg ${
                        selectedAudio?.kind === 'voice' && selectedAudio.lineIndex === ev.index && selectedAudio.id === ev.voice ? 'ring-2 ring-signal' : ''
                      }`}
                        style={{ backgroundColor: vColor + '33', borderLeftColor: vColor }}>
                        <span className="truncate">{who || assetName(ev.voice)}</span>
                      </div>
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateDeltaAt(ev.index, (prev) => ({
                            ...prev,
                            audio: { ...prev.audio, voice: null },
                          }))
                        }}
                        title="删除该语音"
                        className="pointer-events-auto absolute -right-1.5 -top-1.5 z-40 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-white group-hover:flex"
                      ><X size={10} strokeWidth={2.5} /></button>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* 拖拽预览浮层：仅覆盖当前轨道行，定位与色块一致 */}
            {resizeState && (() => {
              const top = HEADER_H + resizeState.trackIndex * trackHeight + 2
              return (
                <div
                  className="pointer-events-none absolute z-50 rounded-sm border-2 border-signal bg-signal/20"
                  style={{
                    top,
                    left: resizeState.ghostLeft,
                    width: Math.max(cellWidth, resizeState.ghostWidth),
                    height: trackHeight - 4,
                  }}
                >
                  <span className="absolute top-1 left-2 text-[14px] font-mono text-signal">
                    {resizeState.edge === 'left'
                      ? `← L${resizeState.targetLine + 1}`
                      : resizeState.edge === 'right'
                      ? `L${resizeState.targetLine + 1} →`
                      : `L${resizeState.targetLine + 1}`}
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
