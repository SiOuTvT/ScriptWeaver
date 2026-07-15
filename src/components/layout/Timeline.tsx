import { useMemo, useCallback, useRef, memo, useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import type { ResolvedLineState, LineDelta, CharacterConfig } from '@/core/types'
import { resolveCharColor, resolveAssetColor } from '@/utils/charColor'
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
  lineIndex, trackId, acceptType, isSelected,
}: {
  lineIndex: number
  trackId: string
  acceptType: 'background' | 'audio' | 'sprite' | null
  isSelected: boolean
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
          } else {
            // 兜底：非标准音频轨道走自动检测
            const cat = getAudioCategory(asset.assetId)
            if (cat === 'bgm') audio.bgm = { asset_id: asset.assetId, volume: 0.7, loop: true, fade_in_ms: 1000 }
            else if (cat === 'ambient') audio.ambient = { asset_id: asset.assetId, volume: 0.4, loop: true, fade_in_ms: 1500 }
            else if (cat === 'voice') audio.voice = asset.assetId
            else audio.se = [...audio.se, asset.assetId]
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
      style={{ width: 120 }}
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
      <span className="truncate text-[11px] leading-5 text-fg">
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
  edge: 'left' | 'right'
  charId?: string    // 立绘色块归属的角色
  ghostLeft: number  // px
  ghostWidth: number // px
  targetLine: number
}

/** 色块 + 左右拖拽手柄 */
const DraggableSpan = memo(function DraggableSpan({
  span,
  total,
  color,
  trackId,
  trackRowEl,
  onResizeStart,
}: {
  span: SpanData
  total: number
  color: string
  trackId: string
  trackRowEl: HTMLDivElement | null
  onResizeStart: (state: Omit<ResizeState, 'ghostLeft' | 'ghostWidth' | 'targetLine'> & { startClientX: number }) => void
}) {
  const leftPct = spanPct(span.start, total)
  const widthPct = spanPct(span.end - span.start + 1, total)

  const handleMouseDown = useCallback(
    (edge: 'left' | 'right') => (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (!trackRowEl) return

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
      className="absolute top-0 bottom-0 select-none"
      style={{ left: leftPct, width: widthPct }}
    >
      {/* 色块主体（穿透鼠标事件到 DropCell） */}
      <div
        className="pointer-events-none absolute inset-x-2 top-1 bottom-1 rounded-sm"
        style={{
          backgroundColor: color + '55',
          borderLeft: `2px solid ${color}`,
        }}
      >
        <span className="truncate px-1.5 text-[11px] leading-5 text-fg" title={span.label}>
          {span.label}
        </span>
      </div>

      {/* 左拖拽手柄 */}
      <div
        className="absolute left-0 -ml-1 top-1 bottom-1 z-30 w-2 cursor-col-resize rounded-l hover:bg-fg/15 active:bg-fg/25"
        style={{ minWidth: 6 }}
        onMouseDown={handleMouseDown('left')}
        title="拖拽调整起始行"
      />

      {/* 右拖拽手柄 */}
      <div
        className="absolute right-0 -mr-1 top-1 bottom-1 z-30 w-2 cursor-col-resize rounded-r hover:bg-fg/15 active:bg-fg/25"
        style={{ minWidth: 6 }}
        onMouseDown={handleMouseDown('right')}
        title="拖拽调整结束行"
      />
    </div>
  )
})

// ===================== 主组件 =====================

export default function Timeline() {
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const selectLine = useAppStore((s) => s.selectLine)
  const batchUpdateDeltas = useAppStore((s) => s.batchUpdateDeltas)
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
  const trackHeight = 28
  const cellWidth = 120

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
    { id: 'se', label: 'SE', color: '#eab308', acceptAssetType: null, spans: [], trackType: 'static' as const, trackDef: undefined },
    { id: 'voice', label: '语音', color: '#a855f7', acceptAssetType: null, spans: [], trackType: 'static' as const, trackDef: undefined },
  ], [resolvedStates, charData, assetName, charDisplayName])

  const totalTracks = allTracks.length

  // ========== 色块拖拽 resize 状态 ==========
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const trackRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const setTrackRowRef = useCallback((trackId: string) => (el: HTMLDivElement | null) => {
    if (el) trackRowRefs.current.set(trackId, el)
    else trackRowRefs.current.delete(trackId)
  }, [])

  const handleResizeStart = useCallback(
    (info: Omit<ResizeState, 'ghostLeft' | 'ghostWidth' | 'targetLine'> & { startClientX: number }) => {
      const rowEl = trackRowRefs.current.get(info.trackId)
      if (!rowEl) return

      const rowRect = rowEl.getBoundingClientRect()
      const cellPx = cellWidth // each cell is 120px
      const targetLine = Math.round((info.startClientX - rowRect.left) / cellPx)
      const clamped = Math.max(0, Math.min(total - 1, targetLine))

      const newStart = info.edge === 'left' ? clamped : info.spanStart
      const newEnd = info.edge === 'right' ? clamped : info.spanEnd

      setResizeState({
        ...info,
        ghostLeft: newStart * cellPx,
        ghostWidth: (newEnd - newStart + 1) * cellPx,
        targetLine: clamped,
      })
    },
    [total],
  )

  // document-level mousemove/mouseup
  useEffect(() => {
    if (!resizeState) return

    const handleMouseMove = (e: MouseEvent) => {
      const rowEl = trackRowRefs.current.get(resizeState.trackId)
      if (!rowEl) return

      const rowRect = rowEl.getBoundingClientRect()
      const targetLine = Math.round((e.clientX - rowRect.left) / cellWidth)
      const clamped = Math.max(0, Math.min(total - 1, targetLine))

      const newStart = resizeState.edge === 'left' ? clamped : resizeState.spanStart
      const newEnd = resizeState.edge === 'right' ? clamped : resizeState.spanEnd

      setResizeState((prev) =>
        prev
          ? {
              ...prev,
              ghostLeft: newStart * cellWidth,
              ghostWidth: (newEnd - newStart + 1) * cellWidth,
              targetLine: clamped,
            }
          : null,
      )
    }

    const handleMouseUp = () => {
      if (!resizeState) return
      const rs = resizeState

      const newStart = rs.edge === 'left' ? rs.targetLine : rs.spanStart
      const newEnd = rs.edge === 'right' ? rs.targetLine : rs.spanEnd

      if (newStart === rs.spanStart && newEnd === rs.spanEnd) {
        setResizeState(null)
        return
      }

      // 查找对应轨道定义
      const track = allTracks.find((t) => t.id === rs.trackId)
      if (!track) { setResizeState(null); return }

      const updates: { index: number; updater: (prev: LineDelta) => LineDelta }[] = []

      if (track.trackType === 'static' && track.trackDef) {
        const td = track.trackDef
        for (let i = 0; i < total; i++) {
          const shouldHave = i >= newStart && i <= newEnd
          const wasIn = i >= rs.spanStart && i <= rs.spanEnd

          if (shouldHave && !wasIn) {
            // 该行需要设置素材
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
            // 该行需要清除素材
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
        if (!charState) { setResizeState(null); return }

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
                // 如果该行之前没有角色指令，就不需要添加 hide
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
      }
      setResizeState(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizeState, total, allTracks, resolvedStates, draftDeltas, batchUpdateDeltas])

  return (
    <div className="flex shrink-0 flex-col border-t border-edge/10 bg-canvas relative">
      {/* 拖拽预览浮层 */}
      {resizeState && (
        <div
          className="pointer-events-none absolute z-50 rounded-sm border-2 border-signal bg-signal/20"
          style={{
            top: 0,
            left: resizeState.ghostLeft,
            width: Math.max(cellWidth, resizeState.ghostWidth),
            height: '100%',
          }}
        >
          <span className="absolute top-1 left-2 text-[11px] font-mono text-signal">
            {resizeState.edge === 'left'
              ? `← L${resizeState.targetLine + 1}`
              : `L${resizeState.targetLine + 1} →`}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-edge/10 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">时间轴</span>
        <span className="text-[11px] text-fg-subtle">{total} 行 · {totalTracks} 轨</span>
      </div>

      <div className="flex overflow-auto" style={{ maxHeight: `${totalTracks * trackHeight + 60}px` }}>
        {/* 轨道标签列 */}
        <div className="shrink-0 border-r border-edge/10 bg-canvas/50">
          {/* 占位行：对齐右边行号 header（48px 高） */}
          <div className="flex items-center border-b border-edge/10 px-2 text-[11px] font-semibold text-fg-subtle"
            style={{ height: 48 }}>
            轨道
          </div>
          {allTracks.map((track) => (
            <div key={track.id} className="flex items-center gap-1.5 border-b border-edge/10 px-2 text-[11px] text-fg-muted"
              style={{ height: trackHeight }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: track.color }} />
              <span className="truncate">{track.label}</span>
            </div>
          ))}
        </div>

        {/* 轨道内容 */}
        <div className="flex-1 overflow-x-auto">
          <div className="relative" style={{ minWidth: `${total * cellWidth}px` }}>
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
                      <span className="font-mono leading-none text-[11px]">{s.line_id}</span>
                      <span className="w-full truncate text-center text-[11px] leading-tight text-fg-subtle">
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
              >
                {resolvedStates.map((s, i) => (
                  <DropCell key={s.line_id} lineIndex={i} trackId={track.id}
                    acceptType={track.acceptAssetType} isSelected={i === selectedIndex} />
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
                    onResizeStart={handleResizeStart}
                  />
                ))}

                {/* SE 点事件：按素材专属色着色 */}
                {track.id === 'se' && seEvents.map((ev) => {
                  const seColor = resolveAssetColor(ev.items[0], assets)
                  return (
                  <div key={`se-${ev.index}`}
                    className="pointer-events-none absolute top-1 bottom-1 flex items-center justify-center overflow-hidden rounded-sm border-l-2 px-1 text-[11px] text-fg"
                    style={{ left: total > 0 ? `${(ev.index / total) * 100}%` : '0%', width: total > 0 ? `${(1 / total) * 100}%` : '0%', minWidth: 30, backgroundColor: seColor + '22', borderLeftColor: seColor }}
                    title={ev.items.map(assetName).join(', ')}>{assetName(ev.items[0])}</div>
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
                  return (
                    <div key={`voice-${ev.index}`}
                      className="pointer-events-none absolute top-1 bottom-1 flex items-center justify-center overflow-hidden rounded-sm border-l-2 px-1 text-[11px] text-fg"
                      style={{
                        left: total > 0 ? `${(ev.index / total) * 100}%` : '0%',
                        width: total > 0 ? `${(1 / total) * 100}%` : '0%',
                        minWidth: 30,
                        backgroundColor: vColor + '22',
                        borderLeftColor: vColor,
                      }}
                      title={`${who ? who + ' · ' : ''}${assetName(ev.voice)}`}>
                      {who || assetName(ev.voice)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
