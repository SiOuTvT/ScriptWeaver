import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { ResolvedLineState, ResolvedCharacterState, LineDelta } from '@/core/types'
import {
  getDragCache,
  type DragAssetData,
  deriveCharacterId,
  getAudioCategory,
} from '@/utils/assetHelpers'

// ===================== 共享坐标判定函数（唯一真理源） =====================

type DragOverZone = 'bg' | 'ch-left' | 'ch-center' | 'ch-right' | 'audio' | null

interface ZoneResult {
  zone: DragOverZone
  assetType: string | null
}

/**
 * 根据鼠标在容器内的相对位置 + 拖拽素材类型，计算应命中的目标区。
 * dragOver（视觉指示器）和 drop（实际落点）共用同一函数，杜绝不一致。
 */
function computeZone(
  cache: DragAssetData,
  rx: number, // 0~1 容器内 X 比例
  ry: number, // 0~1 容器内 Y 比例
): ZoneResult {
  if (cache.type === 'background') {
    return { zone: 'bg', assetType: 'background' }
  }

  if (cache.type === 'sprite') {
    let slot: DragOverZone
    if (rx < 0.33)        slot = 'ch-left'
    else if (rx > 0.66)   slot = 'ch-right'
    else                   slot = 'ch-center'
    return { zone: slot, assetType: 'sprite' }
  }

  if (cache.type === 'audio') {
    // 仅右上角 40%×25% 区域为音频放置区，与视觉指示器一致
    if (rx > 0.6 && ry < 0.25) {
      return { zone: 'audio', assetType: 'audio' }
    }
    // 不放任何指示器
    return { zone: null, assetType: null }
  }

  return { zone: null, assetType: null }
}

/** 从容器 rect 和鼠标 client 坐标提取 rx/ry */
function getRelativePos(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { rx: number; ry: number } {
  return {
    rx: (clientX - rect.left) / rect.width,
    ry: (clientY - rect.top) / rect.height,
  }
}

// ===================== 常量 =====================

const SLOT_POSITIONS: Record<string, { x: string; y: string }> = {
  left: { x: '22%', y: '65%' },
  center: { x: '50%', y: '65%' },
  right: { x: '78%', y: '65%' },
}

const BG_COLORS: Record<string, string> = {
  asset_bg_street_dusk: 'linear-gradient(180deg, #2d1b2e 0%, #4a3728 60%, #6b4c3b 100%)',
  asset_bg_street_night: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a2e 60%, #2a2a3e 100%)',
  asset_bg_night_sky: 'linear-gradient(180deg, #0d1b2a 0%, #1b2838 50%, #0a1628 100%)',
  asset_bg_room: 'linear-gradient(180deg, #2a1a10 0%, #3d2b1f 60%, #4a3528 100%)',
  asset_bg_park: 'linear-gradient(180deg, #4a7c59 0%, #2d5a27 60%, #1a3a18 100%)',
  asset_bg_school: 'linear-gradient(180deg, #5a5a7a 0%, #4a4a6a 60%, #3a3a5a 100%)',
}

const SPRITE_COLORS: Record<string, string> = {
  smile: '#e8a0bf',
  angry: '#d4708a',
  normal: '#7ec8e3',
  happy: '#c3b1e1',
}

// ===================== 组件 =====================

export default function StagePreview() {
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const selectLine = useAppStore((s) => s.selectLine)
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)
  const getDisplayName = useAppStore((s) => s.getDisplayName)

  const state: ResolvedLineState | null = resolvedStates[selectedIndex] ?? null
  const [fadeKey, setFadeKey] = useState(0)

  // 拖拽视觉状态
  const [dragOverZone, _setDragOverZone] = useState<DragOverZone>(null)
  const [dragAssetType, _setDragAssetType] = useState<string | null>(null)
  const zoneRef = useRef<DragOverZone>(null)
  const typeRef = useRef<string | null>(null)
  // 缓存容器 rect，避免 dragOver 每帧都调用 getBoundingClientRect
  const containerRectRef = useRef<DOMRect | null>(null)

  const setDragOverZone = useCallback((z: DragOverZone) => {
    if (zoneRef.current !== z) {
      zoneRef.current = z
      _setDragOverZone(z)
    }
  }, [])

  const setDragAssetType = useCallback((t: string | null) => {
    if (typeRef.current !== t) {
      typeRef.current = t
      _setDragAssetType(t)
    }
  }, [])

  const resetDragState = useCallback(() => {
    zoneRef.current = null
    typeRef.current = null
    containerRectRef.current = null
    _setDragOverZone(null)
    _setDragAssetType(null)
  }, [])

  // 选中行变化 → 交叉淡入淡出
  useEffect(() => {
    setFadeKey((k) => k + 1)
  }, [selectedIndex])

  // =================== 拖放事件 ===================

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const cache = getDragCache()
      if (!cache) return

      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'

      // 缓存 container rect，避免每帧重算
      const rect = e.currentTarget.getBoundingClientRect()
      containerRectRef.current = rect
      const { rx, ry } = getRelativePos(rect, e.clientX, e.clientY)
      const { zone, assetType } = computeZone(cache, rx, ry)

      setDragOverZone(zone)
      setDragAssetType(assetType)
    },
    [setDragOverZone, setDragAssetType],
  )

  const handleDragLeave = useCallback(() => {
    resetDragState()
  }, [resetDragState])

  const handleDropOnStage = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      resetDragState()

      // 优先从模块级缓存获取（比 getData 可靠）
      const asset = getDragCache()
      if (!asset) return
      if (!state) return

      // 用 drop 时的实时坐标做最终判定
      const rect = containerRectRef.current ?? e.currentTarget.getBoundingClientRect()
      const { rx, ry } = getRelativePos(rect, e.clientX, e.clientY)
      const { zone } = computeZone(asset, rx, ry)

      // zone 为 null → 不在有效落区，忽略
      if (!zone) return

      if (zone === 'bg' && asset.type === 'background') {
        updateDeltaAt(selectedIndex, (prev: LineDelta) => ({
          ...prev,
          background: { asset_id: asset.assetId },
        }))
      } else if (zone.startsWith('ch-') && asset.type === 'sprite') {
        const charId = deriveCharacterId(asset.assetId)
        const slot = zone.slice(3) as 'left' | 'center' | 'right'
        updateDeltaAt(selectedIndex, (prev: LineDelta) => ({
          ...prev,
          characters: {
            ...prev.characters,
            [charId]: {
              sprite_id: asset.assetId,
              position_slot: slot,
              action: 'show',
            },
          },
        }))
      } else if (zone === 'audio' && asset.type === 'audio') {
        const cat = getAudioCategory(asset.assetId)
        updateDeltaAt(selectedIndex, (prev: LineDelta) => {
          const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
          if (cat === 'bgm')
            audio.bgm = { asset_id: asset.assetId, volume: 0.7, loop: true, fade_in_ms: 1000 }
          else if (cat === 'ambient')
            audio.ambient = { asset_id: asset.assetId, volume: 0.4, loop: true, fade_in_ms: 1500 }
          else if (cat === 'voice')
            audio.voice = asset.assetId
          else
            audio.se = [...audio.se, asset.assetId]
          return { ...prev, audio }
        })
      }
    },
    [selectedIndex, updateDeltaAt, resetDragState, state],
  )

  // =================== 渲染 ===================

  // Sprite 槽位线（memo 避免每次渲染重建）
  const spriteSlotGuides = useMemo(() => {
    if (dragAssetType !== 'sprite') return null
    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        {(['left', 'center', 'right'] as const).map((slot) => {
          const pos = SLOT_POSITIONS[slot]
          const active = dragOverZone === `ch-${slot}`
          return (
            <div
              key={slot}
              className="absolute -translate-x-1/2 flex flex-col items-center"
              style={{ left: pos.x, top: '50%' }}
            >
              <div
                className={`rounded-lg border-2 border-dashed px-6 py-12 transition-colors duration-150 ${
                  active
                    ? 'border-brand-400 bg-brand-400/20'
                    : 'border-gray-600 bg-gray-800/20'
                }`}
              >
                <span className="text-xs text-gray-400">{slot}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [dragAssetType, dragOverZone])

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-600">
        暂无数据
      </div>
    )
  }

  const bgStyle = state.background?.asset_id
    ? BG_COLORS[state.background.asset_id] ?? '#111'
    : '#111'

  return (
    <main className="relative flex flex-1 flex-col">
      <div
        className="relative flex-1 overflow-hidden bg-gray-950"
        key={fadeKey}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnStage}
      >
        {/* 背景层 */}
        <div
          className="absolute inset-0 animate-fade-in"
          style={{ background: bgStyle }}
        >
          {dragOverZone === 'bg' && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-yellow-400 bg-yellow-400/10">
              <span className="rounded bg-yellow-400/20 px-4 py-2 text-sm font-semibold text-yellow-300 backdrop-blur-sm">
                放置背景
              </span>
            </div>
          )}
        </div>

        {/* 立绘拖放槽位引导线 */}
        {spriteSlotGuides}

        {/* 角色层 */}
        {Object.entries(state.characters).map(
          ([charId, char]: [string, ResolvedCharacterState]) => {
            const slot = SLOT_POSITIONS[char.position_slot] ?? SLOT_POSITIONS.center
            const spriteColor = SPRITE_COLORS[char.sprite_id] ?? '#888'

            return (
              <div
                key={charId}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full animate-slide-up"
                style={{ left: slot.x, top: slot.y }}
              >
                <div
                  className="flex w-16 flex-col items-center gap-1 rounded-t-lg px-3 pt-6 pb-3 shadow-lg"
                  style={{ backgroundColor: spriteColor, minHeight: '100px' }}
                >
                  <span className="text-center text-[10px] font-medium text-white/80">
                    {getDisplayName(charId)}
                  </span>
                  <span className="text-center text-[9px] text-white/50">
                    {char.sprite_id}
                  </span>
                </div>
                <div className="mt-1 text-center text-[10px] text-gray-500">
                  [{char.position_slot}]
                </div>
              </div>
            )
          },
        )}

        {/* 行号指示器 */}
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2">
          <span className="rounded bg-gray-900/80 px-2 py-0.5 text-xs font-mono text-gray-400">
            {state.line_id}
          </span>
          {state.background?.transition && (
            <span className="rounded bg-brand-600/30 px-1.5 py-0.5 text-[10px] text-brand-400">
              {state.background.transition}
            </span>
          )}
        </div>

        {/* 音频状态指示器 + 拖放热区 */}
        <div
          className={`pointer-events-none absolute top-3 right-3 z-20 flex flex-col gap-1 text-right rounded-lg p-2 transition-all duration-150 ${
            dragOverZone === 'audio'
              ? 'ring-2 ring-blue-400 bg-blue-400/10'
              : ''
          }`}
        >
          {state.audio.bgm && (
            <span className="rounded bg-gray-900/80 px-2 py-0.5 text-[10px] text-green-400/70">
              ♪ {state.audio.bgm.asset_id}
            </span>
          )}
          {state.audio.ambient && (
            <span className="rounded bg-gray-900/80 px-2 py-0.5 text-[10px] text-blue-400/70">
              ♫ {state.audio.ambient.asset_id}
            </span>
          )}
          {state.audio.se.length > 0 && (
            <span className="rounded bg-gray-900/80 px-2 py-0.5 text-[10px] text-yellow-400/70">
              🔊 {state.audio.se.join(', ')}
            </span>
          )}
          {state.audio.voice && (
            <span className="rounded bg-gray-900/80 px-2 py-0.5 text-[10px] text-purple-400/70">
              🎤 {state.audio.voice}
            </span>
          )}
          {dragOverZone === 'audio' && (
            <span className="text-[10px] text-blue-300">放置音频</span>
          )}
        </div>

        {/* 台词叠加层 */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-6 pt-12">
          {state.speaker && (
            <p className="mb-1 text-sm font-semibold text-brand-400">
              {state.speaker}
            </p>
          )}
          <p className="text-sm leading-relaxed text-gray-200">
            {state.dialogue}
          </p>
        </div>

        {/* 行进度条 */}
        <div className="absolute right-0 bottom-0 left-0 z-20 flex h-0.5">
          {resolvedStates.map((_, i) => (
            <button
              key={i}
              onClick={() => selectLine(i)}
              className={`flex-1 transition-colors hover:opacity-80 ${
                i === selectedIndex ? 'bg-brand-500' : 'bg-gray-800'
              }`}
              title={`跳转到 ${resolvedStates[i].line_id}`}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
