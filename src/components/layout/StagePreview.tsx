import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { ResolvedLineState, ResolvedCharacterState, LineDelta, AssetItem, CharacterConfig } from '@/core/types'
import {
  getDragCache,
  type DragAssetData,
  deriveCharacterId,
  getAudioCategory,
} from '@/utils/assetHelpers'
import { toast } from '@/utils/toast'
import { Music, AudioLines, Megaphone, Volume2 } from 'lucide-react'
import { Skeleton } from '@/components/ui'

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

// ===================== 素材图片解析 =====================

/**
 * 根据 asset_id 解析背景图片 dataUrl。
 * 优先从 assets 查找真实图片 dataUrl，兜底到 BG_COLORS 色块。
 */
function resolveBackgroundUrl(assetId: string | undefined, assets: AssetItem[]): string | undefined {
  if (!assetId) return undefined
  const asset = assets.find((a) => a.id === assetId)
  return asset?.dataUrl
}

/**
 * 根据 sprite_id（可能是资产 ID 或表情 ID）解析立绘图片。
 * 1. 先尝试直接匹配 assets 的 id（拖放导入的立绘直接以 asset.id 作为 sprite_id）
 * 2. 再尝试通过 CharacterConfig 的表情引用查找
 * 3. 兜底 SPRITE_COLORS
 */
function resolveSpriteImage(
  spriteId: string,
  assets: AssetItem[],
  characterConfigs: CharacterConfig[],
): { dataUrl?: string; color: string } {
  // 1. 直接匹配 asset id（拖放场景）
  const directAsset = assets.find((a) => a.id === spriteId)
  if (directAsset?.dataUrl) {
    return { dataUrl: directAsset.dataUrl, color: '#888' }
  }

  // 2. 通过角色表情引用查找
  for (const cc of characterConfigs) {
    const expr = cc.expressions.find((e) => e.id === spriteId)
    if (expr) {
      const exprAsset = assets.find((a) => a.id === expr.assetId)
      if (exprAsset?.dataUrl) {
        return { dataUrl: exprAsset.dataUrl, color: '#888' }
      }
    }
  }

  // 3. 兜底色块
  return { color: SPRITE_COLORS[spriteId] ?? '#888' }
}

// 背景图解码检测：在图片加载完成前展示骨架屏
function useImageLoaded(url?: string): boolean {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!url) {
      setLoaded(false)
      return
    }
    let active = true
    const img = new Image()
    img.onload = () => active && setLoaded(true)
    img.onerror = () => active && setLoaded(true)
    img.src = url
    if (img.complete) setLoaded(true)
    return () => {
      active = false
    }
  }, [url])
  return loaded
}

// ===================== 组件 =====================

export default function StagePreview() {
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const selectLine = useAppStore((s) => s.selectLine)
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)
  const getDisplayName = useAppStore((s) => s.getDisplayName)
  const getCharacter = useAppStore((s) => s.getCharacter)
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const addCharacter = useAppStore((s) => s.addCharacter)
  const draftDeltas = useAppStore((s) => s.draftDeltas)

  const currentDelta = draftDeltas[selectedIndex] ?? null
  const state: ResolvedLineState | null = resolvedStates[selectedIndex] ?? null
  const [fadeKey, setFadeKey] = useState(0)

  // 快捷台词编辑本地状态
  const [localSpeaker, setLocalSpeaker] = useState(currentDelta?.speaker ?? '')
  const [localDialogue, setLocalDialogue] = useState(currentDelta?.dialogue ?? '')
  const dialogueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 选中行变化 → 同步本地状态
  useEffect(() => {
    if (currentDelta) {
      setLocalSpeaker(currentDelta.speaker ?? '')
      setLocalDialogue(currentDelta.dialogue ?? '')
    }
  }, [selectedIndex, currentDelta?.line_id])

  // dialogue 变更 → 防抖写入 store
  const commitDialogue = useCallback((speaker: string, dialogue: string) => {
    if (dialogueTimerRef.current) clearTimeout(dialogueTimerRef.current)
    dialogueTimerRef.current = setTimeout(() => {
      updateDeltaAt(selectedIndex, (prev: LineDelta) => ({
        ...prev,
        speaker: speaker.trim() || null,
        dialogue: dialogue,
      }))
    }, 300)
  }, [selectedIndex, updateDeltaAt])

  // 拖拽视觉状态
  const [dragOverZone, _setDragOverZone] = useState<DragOverZone>(null)
  const [dragAssetType, _setDragAssetType] = useState<string | null>(null)
  const zoneRef = useRef<DragOverZone>(null)
  const typeRef = useRef<string | null>(null)
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
        toast(`背景已设为 ${asset.name}`, 'success')
      } else if (zone.startsWith('ch-') && asset.type === 'sprite') {
        const charId = deriveCharacterId(asset.assetId)
        const slot = zone.slice(3) as 'left' | 'center' | 'right'

        // 自动创建角色（如果不存在）
        if (!getCharacter(charId)) {
          const rawName = asset.assetId.replace(/^asset_sprite_|^sprite_|^local_/, '').replace(/_/g, ' ')
          const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1)
          addCharacter({
            charId,
            displayName,
            expressions: [{ id: 'default', label: '默认', assetId: asset.assetId }],
            defaultExpression: 'default',
          })
        }

        // sprite_id 统一使用表情 ID（'default'），而非 asset ID
        updateDeltaAt(selectedIndex, (prev: LineDelta) => ({
          ...prev,
          characters: {
            ...prev.characters,
            [charId]: {
              sprite_id: 'default',
              position_slot: slot,
              action: 'show',
            },
          },
        }))
        const slotName = { left: '左', center: '中', right: '右' }[slot]
        toast(`立绘 ${asset.name} 已放置到 ${slotName} 位`, 'success')
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
        toast(`音频 ${asset.name} 已应用`, 'success')
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
                    ? 'border-primary bg-primary/20'
                    : 'border-edge-strong/20 bg-surface-1/20'
                }`}
              >
                <span className="text-xs text-fg-subtle">{slot}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [dragAssetType, dragOverZone])

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-fg-faint">
        暂无数据
      </div>
    )
  }

  const bgAssetId = state.background?.asset_id
  const bgDataUrl = resolveBackgroundUrl(bgAssetId, assets)
  const bgLoaded = useImageLoaded(bgDataUrl)
  const bgStyle: React.CSSProperties = bgDataUrl
    ? { backgroundImage: `url(${bgDataUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: bgAssetId ? (BG_COLORS[bgAssetId] ?? '#111') : '#111' }

  return (
    <main className="relative flex flex-1 flex-col">
      <div
        className="relative flex-1 overflow-hidden rounded-lg border border-edge/16 bg-canvas shadow-[inset_0_0_30px_rgba(0,0,0,0.08)]"
        key={fadeKey}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnStage}
      >
        {/* 背景层 */}
        <div
          className="absolute inset-0 animate-fade-in"
          style={bgStyle}
        >
          {bgDataUrl && !bgLoaded && (
            <Skeleton className="absolute inset-0" />
          )}
          {dragOverZone === 'bg' && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-warning/60 bg-warning/10">
              <span className="rounded bg-warning/20 px-4 py-2 text-sm font-semibold text-warning backdrop-blur-sm">
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
            const { dataUrl: spriteDataUrl, color: spriteColor } = resolveSpriteImage(
              char.sprite_id,
              assets,
              characterConfigs,
            )

            return (
              <div
                key={charId}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full animate-slide-up flex flex-col items-center"
                style={{ left: slot.x, top: slot.y }}
              >
                {spriteDataUrl ? (
                  /* 真实立绘图片 */
                  <img
                    src={spriteDataUrl}
                    alt={getDisplayName(charId)}
                    className="max-h-64 w-auto object-contain drop-shadow-lg"
                    style={{ minHeight: '80px' }}
                  />
                ) : (
                  /* 兜底色块占位 */
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
                )}
                <div className="mt-1 text-center text-[10px] text-fg-faint">
                  [{char.position_slot}]
                </div>
              </div>
            )
          },
        )}

        {/* 行号指示器 */}
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2">
          <span className="rounded bg-surface-2/80 px-2 py-0.5 text-xs font-mono text-fg-subtle">
            {state.line_id}
          </span>
          {state.background?.transition && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
              {state.background.transition}
            </span>
          )}
        </div>

        {/* 音频状态指示器 + 拖放热区 */}
        <div
          className={`pointer-events-none absolute top-3 right-3 z-20 flex flex-col gap-1 text-right rounded-lg p-2 transition-all duration-150 ${
            dragOverZone === 'audio'
              ? 'ring-2 ring-info bg-info/10'
              : ''
          }`}
        >
          {state.audio.bgm && (
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[10px] text-success">
              <Music size={10} strokeWidth={1.75} /> {state.audio.bgm.asset_id}
            </span>
          )}
          {state.audio.ambient && (
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[10px] text-info">
              <AudioLines size={10} strokeWidth={1.75} /> {state.audio.ambient.asset_id}
            </span>
          )}
          {state.audio.se.length > 0 && (
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[10px] text-warning">
              <Megaphone size={10} strokeWidth={1.75} /> {state.audio.se.join(', ')}
            </span>
          )}
          {state.audio.voice && (
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[10px] text-purple-400">
              <Volume2 size={10} strokeWidth={1.75} /> {state.audio.voice}
            </span>
          )}
          {dragOverZone === 'audio' && (
            <span className="text-[10px] text-info">放置音频</span>
          )}
        </div>

        {/* 快捷台词编辑条 —— 拖入素材后直接在此写台词，无需切视图 */} 
        <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/95 via-black/85 to-transparent p-3 pt-10">
          <div className="flex items-start gap-2">
            {/* 说话人选择器 */}
            <div className="relative shrink-0">
              <input
                type="text"
                value={localSpeaker}
                onChange={(e) => {
                  setLocalSpeaker(e.target.value)
                  commitDialogue(e.target.value, localDialogue)
                }}
                placeholder="说话人"
                list="speaker-list"
                className="w-24 rounded-md border border-edge/15 bg-surface-3 px-2 py-1 text-xs text-fg placeholder-fg-faint outline-none transition-colors focus:border-primary/60"
              />
              <datalist id="speaker-list">
                {characterConfigs.map((c) => (
                  <option key={c.charId} value={c.displayName}>{c.charId}</option>
                ))}
              </datalist>
            </div>
            {/* 台词输入 */}
            <div className="flex-1">
              <input
                type="text"
                value={localDialogue}
                onChange={(e) => {
                  setLocalDialogue(e.target.value)
                  commitDialogue(localSpeaker, e.target.value)
                }}
                placeholder={state.speaker ? `${state.speaker}的台词...` : '旁白或台词...'}
                className="w-full rounded-md border border-edge/15 bg-surface-3 px-2 py-1 text-xs text-fg placeholder-fg-faint outline-none transition-colors focus:border-primary/60"
              />
            </div>
          </div>
          {/* 行信息提示 */}
          <div className="mt-1.5 text-right text-[9px] text-fg-faint">
            {state.line_id} · 快捷输入 · {state.speaker ? `说话人 ${state.speaker}` : '旁白模式'}
          </div>
        </div>

        {/* 行进度条 */}
        <div className="absolute right-0 bottom-0 left-0 z-20 flex h-0.5">
          {resolvedStates.map((_, i) => (
            <button
              key={i}
              onClick={() => selectLine(i)}
              className={`flex-1 transition-colors hover:opacity-80 ${
                i === selectedIndex ? 'bg-primary' : 'bg-surface-1'
              }`}
              title={`跳转到 ${resolvedStates[i].line_id}`}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
