import { useRef, useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { ResolvedLineState, ResolvedCharacterState, LineDelta } from '@/core/types'
import {
  DRAG_MIME,
  type DragAssetData,
  deriveCharacterId,
  getAudioCategory,
} from '@/utils/assetHelpers'

// 位置槽位定义
const SLOT_POSITIONS: Record<string, { x: string; y: string }> = {
  left: { x: '22%', y: '65%' },
  center: { x: '50%', y: '65%' },
  right: { x: '78%', y: '65%' },
}

// 背景色映射
const BG_COLORS: Record<string, string> = {
  bg_street_dusk: 'linear-gradient(180deg, #2d1b2e 0%, #4a3728 60%, #6b4c3b 100%)',
  bg_street_night: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a2e 60%, #2a2a3e 100%)',
  bg_night_sky: 'linear-gradient(180deg, #0d1b2a 0%, #1b2838 50%, #0a1628 100%)',
  bg_room: 'linear-gradient(180deg, #2a1a10 0%, #3d2b1f 60%, #4a3528 100%)',
  bg_park: 'linear-gradient(180deg, #4a7c59 0%, #2d5a27 60%, #1a3a18 100%)',
  bg_school: 'linear-gradient(180deg, #5a5a7a 0%, #4a4a6a 60%, #3a3a5a 100%)',
}

// 立绘色映射
const SPRITE_COLORS: Record<string, string> = {
  alice_smile: '#e8a0bf',
  alice_angry: '#d4708a',
  bob_normal: '#7ec8e3',
  bob_smile: '#5da8c9',
  bob_sad: '#4a9099',
  charlie_happy: '#c3b1e1',
}

type DragOverZone = 'bg' | 'ch-left' | 'ch-center' | 'ch-right' | 'audio' | null

export default function StagePreview() {
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const selectLine = useAppStore((s) => s.selectLine)
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)

  const state: ResolvedLineState | null = resolvedStates[selectedIndex] ?? null
  const prevRef = useRef<ResolvedLineState | null>(null)
  const [fadeKey, setFadeKey] = useState(0)
  const [dragOverZone, setDragOverZone] = useState<DragOverZone>(null)
  const [dragAssetType, setDragAssetType] = useState<string | null>(null)

  // 选中行变化时触发交叉淡入淡出
  useEffect(() => {
    prevRef.current = state
    setFadeKey((k) => k + 1)
  }, [selectedIndex])

  // —— 拖放处理器 ——

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragEnterZone = useCallback(
    (zone: DragOverZone, assetType: string) => (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverZone(zone)
      setDragAssetType(assetType)
    },
    [],
  )

  const handleDragLeaveZone = useCallback(() => {
    setDragOverZone(null)
    setDragAssetType(null)
  }, [])

  /** 解析拖拽数据并写入 Delta */
  const handleDropOnStage = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverZone(null)
      setDragAssetType(null)

      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return
      let asset: DragAssetData
      try {
        asset = JSON.parse(raw)
      } catch {
        return
      }

      if (asset.type === 'background') {
        // 背景素材 → 设置当前行背景
        updateDeltaAt(selectedIndex, (prev: LineDelta) => ({
          ...prev,
          background: { asset_id: asset.assetId },
        }))
      } else if (asset.type === 'sprite') {
        // 立绘素材 → 添加/更新角色到当前行
        const charId = deriveCharacterId(asset.assetId)
        const dropX = e.nativeEvent.offsetX
        const el = e.currentTarget as HTMLElement
        const ratio = dropX / el.clientWidth
        let slot = 'center'
        if (ratio < 0.33) slot = 'left'
        else if (ratio > 0.66) slot = 'right'

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
      } else if (asset.type === 'audio') {
        // 音频素材 → 根据前缀判断轨道
        const cat = getAudioCategory(asset.assetId)
        updateDeltaAt(selectedIndex, (prev: LineDelta) => {
          const audio = { ...prev.audio, se: [...prev.audio.se], voice: prev.audio.voice }
          if (cat === 'bgm') {
            audio.bgm = { asset_id: asset.assetId, volume: 0.7, loop: true, fade_in_ms: 1000 }
          } else if (cat === 'ambient') {
            audio.ambient = { asset_id: asset.assetId, volume: 0.4, loop: true, fade_in_ms: 1500 }
          } else if (cat === 'voice') {
            audio.voice = asset.assetId
          } else {
            audio.se = [...audio.se, asset.assetId]
          }
          return { ...prev, audio }
        })
      }
    },
    [selectedIndex, updateDeltaAt],
  )

  // ===== 渲染 =====

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

  const isBgDrag = dragOverZone === 'bg'
  const isChDrag = dragOverZone?.startsWith('ch-')

  return (
    <main className="relative flex flex-1 flex-col">
      {/* 舞台画布 */}
      <div
        className="relative flex-1 overflow-hidden bg-gray-950"
        key={fadeKey}
        onDragOver={handleDragOver}
        onDrop={handleDropOnStage}
      >
        {/* 背景层 */}
        <div
          className="absolute inset-0 animate-fade-in"
          style={{ background: bgStyle }}
          onDragEnter={handleDragEnterZone('bg', 'background')}
          onDragLeave={handleDragLeaveZone}
        >
          {dragOverZone === 'bg' && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-yellow-400 bg-yellow-400/10 transition-all"
              onDragLeave={handleDragLeaveZone}
            >
              <span className="rounded bg-yellow-400/20 px-4 py-2 text-sm font-semibold text-yellow-300 backdrop-blur-sm">
                放置背景
              </span>
            </div>
          )}
        </div>

        {/* 角色放置区域（立绘拖放引导线） */}
        {dragAssetType === 'sprite' && (
          <div
            className="absolute inset-0 z-20 pointer-events-none"
            onDragLeave={handleDragLeaveZone}
          >
            {(['left', 'center', 'right'] as const).map((slot) => {
              const pos = SLOT_POSITIONS[slot]
              return (
                <div
                  key={slot}
                  className="absolute -translate-x-1/2 flex flex-col items-center"
                  style={{ left: pos.x, top: '50%' }}
                >
                  <div
                    className={`rounded-lg border-2 border-dashed px-6 py-12 transition-all ${
                      dragOverZone === `ch-${slot}`
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
        )}

        {/* 角色层 */}
        {Object.entries(state.characters).map(
          ([charId, char]: [string, ResolvedCharacterState]) => {
            const slot = SLOT_POSITIONS[char.position_slot] ?? SLOT_POSITIONS.center
            const spriteColor = SPRITE_COLORS[char.sprite_id] ?? '#888'

            return (
              <div
                key={charId}
                className="absolute -translate-x-1/2 -translate-y-full animate-slide-up"
                style={{ left: slot.x, top: slot.y }}
              >
                <div
                  className="flex w-16 flex-col items-center gap-1 rounded-t-lg px-3 pt-6 pb-3 shadow-lg"
                  style={{ backgroundColor: spriteColor, minHeight: '100px' }}
                >
                  <span className="text-center text-[10px] font-medium text-white/80">
                    {charId}
                  </span>
                  <span className="text-center text-[9px] text-white/50">
                    {char.sprite_id.split('_').pop()}
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
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <span className="rounded bg-gray-900/80 px-2 py-0.5 text-xs font-mono text-gray-400">
            {state.line_id}
          </span>
          {state.background?.transition && (
            <span className="rounded bg-brand-600/30 px-1.5 py-0.5 text-[10px] text-brand-400">
              {state.background.transition}
            </span>
          )}
        </div>

        {/* 音频状态指示器（同时也是拖放区） */}
        <div
          className={`absolute top-3 right-3 z-20 flex flex-col gap-1 text-right rounded-lg p-2 transition-all ${
            dragOverZone === 'audio'
              ? 'ring-2 ring-blue-400 bg-blue-400/10'
              : ''
          }`}
          onDragEnter={handleDragEnterZone('audio', 'audio')}
          onDragLeave={handleDragLeaveZone}
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
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-6 pt-12">
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
