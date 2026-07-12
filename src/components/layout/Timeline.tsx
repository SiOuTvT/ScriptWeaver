import { useMemo, useCallback, useRef, memo } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { ResolvedLineState, LineDelta } from '@/core/types'
import {
  DRAG_MIME,
  getDragCache,
  type DragAssetData,
  deriveCharacterId,
  getAudioCategory,
} from '@/utils/assetHelpers'

// 轨道配置
interface TrackDef {
  id: string
  label: string
  getValue: (s: ResolvedLineState) => string | null
  color: string
  acceptAssetType: 'background' | 'audio' | 'sprite' | null
}

const TRACKS: TrackDef[] = [
  {
    id: 'bg', label: '背景',
    getValue: (s) => s.background?.asset_id ?? null,
    color: '#8b5cf6', acceptAssetType: 'background',
  },
  {
    id: 'bgm', label: 'BGM',
    getValue: (s) => s.audio.bgm?.asset_id ?? null,
    color: '#22c55e', acceptAssetType: 'audio',
  },
  {
    id: 'ambient', label: '环境音',
    getValue: (s) => s.audio.ambient?.asset_id ?? null,
    color: '#3b82f6', acceptAssetType: 'audio',
  },
]

interface CharacterTracksResult {
  tracks: { id: string; label: string; color: string }[]
  spans: { charId: string; label: string; start: number; end: number; color: string }[]
}

function computeCharacterTracks(states: ResolvedLineState[]): CharacterTracksResult {
  const allChars = new Set<string>()
  for (const s of states) Object.keys(s.characters).forEach((c) => allChars.add(c))

  const charColors: Record<string, string> = {
    alice: '#f472b6', bob: '#38bdf8', charlie: '#a78bfa',
  }

  const tracks = Array.from(allChars).map((id) => ({
    id, label: id, color: charColors[id] ?? '#9ca3af',
  }))

  const spans: CharacterTracksResult['spans'] = []
  for (const cid of allChars) {
    let spanStart = -1
    for (let i = 0; i < states.length; i++) {
      if (states[i].characters[cid]) {
        if (spanStart === -1) spanStart = i
      } else if (spanStart !== -1) {
        spans.push({ charId: cid, label: cid, start: spanStart, end: i - 1, color: charColors[cid] ?? '#9ca3af' })
        spanStart = -1
      }
    }
    if (spanStart !== -1)
      spans.push({ charId: cid, label: cid, start: spanStart, end: states.length - 1, color: charColors[cid] ?? '#9ca3af' })
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

// ========== DropCell（memo 隔离，不随父级频繁渲染） ==========

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

  // 用 ref 驱动 className 切换，避免 React setState 导致重渲染
  const elRef = useRef<HTMLDivElement>(null)

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!acceptType) return
      const cache = getDragCache()
      if (!cache) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      elRef.current?.classList.add('ring-1', 'ring-brand-400', 'bg-brand-400/15')
    },
    [acceptType],
  )

  const handleDragLeave = useCallback(() => {
    elRef.current?.classList.remove('ring-1', 'ring-brand-400', 'bg-brand-400/15')
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      elRef.current?.classList.remove('ring-1', 'ring-brand-400', 'bg-brand-400/15')
      if (!acceptType) return

      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return
      let asset: DragAssetData
      try { asset = JSON.parse(raw) } catch { return }

      selectLine(lineIndex)

      if (acceptType === 'background' && asset.type === 'background') {
        updateDeltaAt(lineIndex, (prev: LineDelta) => ({
          ...prev, background: { asset_id: asset.assetId },
        }))
      } else if (acceptType === 'audio' && asset.type === 'audio') {
        const cat = getAudioCategory(asset.assetId)
        updateDeltaAt(lineIndex, (prev: LineDelta) => {
          const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
          if (cat === 'bgm') audio.bgm = { asset_id: asset.assetId, volume: 0.7, loop: true, fade_in_ms: 1000 }
          else if (cat === 'ambient') audio.ambient = { asset_id: asset.assetId, volume: 0.4, loop: true, fade_in_ms: 1500 }
          else if (cat === 'voice') audio.voice = asset.assetId
          else audio.se = [...audio.se, asset.assetId]
          return { ...prev, audio }
        })
      } else if (acceptType === 'sprite' && asset.type === 'sprite') {
        const charId = deriveCharacterId(asset.assetId)
        const trackCharId = trackId.startsWith('char_') ? trackId.slice(5) : charId
        updateDeltaAt(lineIndex, (prev: LineDelta) => ({
          ...prev,
          characters: { ...prev.characters, [trackCharId]: { sprite_id: asset.assetId, position_slot: 'center', action: 'show' } },
        }))
      }
    },
    [lineIndex, trackId, acceptType, updateDeltaAt, selectLine],
  )

  return (
    <div
      ref={elRef}
      className={`shrink-0 border-r border-gray-800/20 ${isSelected ? 'bg-brand-600/5' : ''}`}
      style={{ width: 120 }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  )
})

// ========== 主组件 ==========

export default function Timeline() {
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const selectLine = useAppStore((s) => s.selectLine)

  const charData = useMemo(() => computeCharacterTracks(resolvedStates), [resolvedStates])

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

  const allTracks = useMemo(() => [
    ...TRACKS.map((t) => ({
      id: t.id, label: t.label, color: t.color,
      acceptAssetType: t.acceptAssetType,
      spans: computeSpans(resolvedStates, t.getValue),
    })),
    ...charData.tracks.map((ct) => ({
      id: `char_${ct.id}`, label: `👤 ${ct.label}`, color: ct.color,
      acceptAssetType: 'sprite' as const,
      spans: charData.spans.filter((s) => s.charId === ct.id).map((s) => ({ start: s.start, end: s.end, label: '' })),
    })),
    { id: 'se', label: '🔊 SE', color: '#eab308', acceptAssetType: null as const, spans: [] },
    { id: 'voice', label: '🎤 语音', color: '#a855f7', acceptAssetType: null as const, spans: [] },
  ], [resolvedStates, charData])

  const totalTracks = allTracks.length

  return (
    <div className="flex shrink-0 flex-col border-t border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">时间轴</span>
        <span className="text-[10px] text-gray-600">{total} 行 · {totalTracks} 轨</span>
      </div>

      <div className="flex overflow-auto" style={{ maxHeight: `${totalTracks * trackHeight + 40}px` }}>
        {/* 轨道标签列 */}
        <div className="shrink-0 border-r border-gray-800 bg-gray-950/50">
          {allTracks.map((track) => (
            <div key={track.id} className="flex items-center border-b border-gray-800/50 px-2 text-[10px] text-gray-500"
              style={{ height: trackHeight }}>{track.label}</div>
          ))}
        </div>

        {/* 轨道内容 */}
        <div className="flex-1 overflow-x-auto">
          <div className="relative" style={{ minWidth: `${total * 120}px` }}>
            {/* 行号 */}
            <div className="flex border-b border-gray-800/50" style={{ height: 20 }}>
              {resolvedStates.map((s, i) => (
                <button key={s.line_id} onClick={() => selectLine(i)}
                  className={`flex shrink-0 items-center justify-center border-r border-gray-800/30 text-[10px] font-mono transition-colors ${
                    i === selectedIndex ? 'bg-brand-600/30 text-brand-400' : 'text-gray-600 hover:bg-gray-900'
                  }`} style={{ width: 120 }}>{s.line_id}</button>
              ))}
            </div>

            {/* 轨道行 */}
            {allTracks.map((track) => (
              <div key={track.id} className="relative flex border-b border-gray-800/30" style={{ height: trackHeight }}>
                {resolvedStates.map((s, i) => (
                  <DropCell key={s.line_id} lineIndex={i} trackId={track.id}
                    acceptType={track.acceptAssetType} isSelected={i === selectedIndex} />
                ))}

                {/* 色块 */}
                {track.spans.map((span, si) => (
                  <div key={si}
                    className="pointer-events-none absolute top-1 bottom-1 rounded-sm px-2"
                    style={{
                      left: total > 0 ? `${(span.start / total) * 100}%` : '0%',
                      width: total > 0 ? `${((span.end - span.start + 1) / total) * 100}%` : '0%',
                      backgroundColor: track.color + '33', borderLeft: `2px solid ${track.color}`,
                    }}>
                    <span className="truncate text-[9px] leading-5 text-gray-400">{span.label}</span>
                  </div>
                ))}

                {/* SE 点事件 */}
                {track.id === 'se' && seEvents.map((ev) => (
                  <div key={`se-${ev.index}`}
                    className="pointer-events-none absolute top-1 bottom-1 flex items-center justify-center rounded-sm bg-yellow-600/30 px-1 text-[9px] text-yellow-400/80"
                    style={{ left: total > 0 ? `${(ev.index / total) * 100}%` : '0%', width: total > 0 ? `${(1 / total) * 100}%` : '0%', minWidth: 30 }}
                    title={ev.items.join(', ')}>{ev.items[0]}</div>
                ))}

                {/* Voice 点事件 */}
                {track.id === 'voice' && voiceEvents.map((ev) => (
                  <div key={`voice-${ev.index}`}
                    className="pointer-events-none absolute top-1 bottom-1 flex items-center justify-center rounded-sm bg-purple-600/30 px-1 text-[9px] text-purple-400/80"
                    style={{ left: total > 0 ? `${(ev.index / total) * 100}%` : '0%', width: total > 0 ? `${(1 / total) * 100}%` : '0%', minWidth: 30 }}
                    title={ev.voice}>{ev.voice}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
