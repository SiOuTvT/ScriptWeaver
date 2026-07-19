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
import { resolveAssetSrc } from '@/utils/assetSrc'
import { Music, AudioLines, Megaphone, Volume2, Image as ImageIcon } from 'lucide-react'
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

/** 预设站位锚点（归一化 0-1）——作为磁吸基准，保证全篇站位一致 */
const SLOT_ANCHORS: Record<string, { x: number; y: number }> = {
  left: { x: 0.22, y: 0.65 },
  center: { x: 0.5, y: 0.65 },
  right: { x: 0.78, y: 0.65 },
}
const SLOT_Y = 0.65
/** 磁吸阈值：拖到离预设站位这么近才吸附（留足自由微调空间，避免「被钉死」） */
const SNAP_X = 0.035
const SNAP_Y = 0.045

const SLOT_POSITIONS: Record<string, { x: string; y: string }> = Object.fromEntries(
  Object.entries(SLOT_ANCHORS).map(([k, v]) => [k, { x: `${v.x * 100}%`, y: `${v.y * 100}%` }]),
)

/** 返回离给定 x 最近的预设站位 ID */
function nearestSlot(x: number): string {
  let best = 'center'
  let bestDist = Infinity
  for (const [id, a] of Object.entries(SLOT_ANCHORS)) {
    const d = Math.abs(a.x - x)
    if (d < bestDist) {
      bestDist = d
      best = id
    }
  }
  return best
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
 * 根据 asset_id 解析背景图片 URL（sw-asset:// 协议或 blobUrl）。
 * 兜底到 BG_COLORS 色块。
 */
function resolveBackgroundUrl(assetId: string | undefined, assets: AssetItem[]): string | undefined {
  if (!assetId) return undefined
  const asset = assets.find((a) => a.id === assetId)
  return resolveAssetSrc(asset)
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
  const directSrc = resolveAssetSrc(directAsset)
  if (directSrc) {
    return { dataUrl: directSrc, color: '#888' }
  }

  // 2. 通过角色表情引用查找
  for (const cc of characterConfigs) {
    const expr = cc.expressions.find((e) => e.id === spriteId)
    if (expr) {
      const exprAsset = assets.find((a) => a.id === expr.assetId)
      const exprSrc = resolveAssetSrc(exprAsset)
      if (exprSrc) {
        return { dataUrl: exprSrc, color: '#888' }
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

  // =================== 立绘自由拖动（磁吸预设站位 + 微调偏移） ===================

  const stageRef = useRef<HTMLDivElement>(null)
  const [dragPos, setDragPos] = useState<{ charId: string; x: number; y: number; snapped: boolean; slot: string } | null>(null)
  const dragPosRef = useRef<typeof dragPos>(null)

  // 拖拽中断（卸载等）时还原全局光标与选中状态
  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const handleCharMouseDown = useCallback(
    (charId: string) => (e: React.MouseEvent) => {
      // 只接管左键，避免与右键菜单等冲突
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const stageEl = stageRef.current
      if (!stageEl) return
      const char = (resolvedStates[selectedIndex]?.characters ?? {})[charId]
      if (!char) return
      const anchor = SLOT_ANCHORS[char.position_slot] ?? SLOT_ANCHORS.center
      const startX = char.pos_x ?? anchor.x
      const startY = char.pos_y ?? anchor.y

      // 记录抓取点相对立绘中心的偏移：否则一拖动立绘中心就「瞬移」到光标下，看着像闪
      const rect0 = stageEl.getBoundingClientRect()
      const rx0 = (e.clientX - rect0.left) / rect0.width
      const ry0 = (e.clientY - rect0.top) / rect0.height
      const offsetX = rx0 - startX
      const offsetY = ry0 - startY

      // 拖拽期间锁全局光标为抓取态 + 禁止选中文本，避免「抓住又变回鼠标 / 误选文字」
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'

      const move = (ev: MouseEvent) => {
        const rect = stageEl.getBoundingClientRect()
        let rx = (ev.clientX - rect.left) / rect.width - offsetX
        let ry = (ev.clientY - rect.top) / rect.height - offsetY
        rx = clamp(rx, 0.03, 0.97)
        ry = clamp(ry, 0.2, 1)
        // 磁吸：仅当靠近预设站位（吸附带较窄）才吸过去，留出自由微调空间
        let snapped = false
        let slot = char.position_slot
        for (const [id, a] of Object.entries(SLOT_ANCHORS)) {
          if (Math.abs(rx - a.x) < SNAP_X) {
            rx = a.x
            snapped = true
            slot = id
            break
          }
        }
        if (Math.abs(ry - SLOT_Y) < SNAP_Y) {
          ry = SLOT_Y
        }
        const p = { charId, x: rx, y: ry, snapped, slot }
        dragPosRef.current = p
        setDragPos(p)
      }

      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        const p = dragPosRef.current
        if (p) {
          const slot = p.slot
          const resolvedChar = resolvedStates[selectedIndex]?.characters[charId]
          // 完全吸回锚点才不存偏移（保持全篇一致）；否则存独立微调
          const atAnchor = Math.abs(p.x - SLOT_ANCHORS[slot].x) < 1e-6 && Math.abs(p.y - SLOT_Y) < 1e-6
          updateDeltaAt(selectedIndex, (prev: LineDelta) => {
            const base = prev.characters[charId] ?? {
              sprite_id: resolvedChar?.sprite_id ?? 'default',
              position_slot: slot,
              action: 'show' as const,
            }
            return {
              ...prev,
              characters: {
                ...prev.characters,
                [charId]: {
                  ...base,
                  pos_x: p.snapped && atAnchor ? undefined : p.x,
                  pos_y: p.snapped && atAnchor ? undefined : p.y,
                  position_slot: slot,
                  action: 'show' as const,
                },
              },
            }
          })
        }
        dragPosRef.current = null
        setDragPos(null)
      }

      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [selectedIndex, updateDeltaAt, resolvedStates],
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
                className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
                style={{ left: pos.x, top: pos.y }}
              >
              <div
                className={`rounded-lg border-2 border-dashed px-6 py-12 transition-colors duration-150 ${
                  active
                    ? 'border-signal bg-signal/20'
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

  // 背景图加载检测：hook 必须在提前 return 之前无条件调用，遵守 React Rules of Hooks
  // （此前 useImageLoaded 写在 if (!state) return 之后，导致有/无数据时 hook 数量不一致 → #310）
  const bgAssetId = state?.background?.asset_id
  const bgDataUrl = resolveBackgroundUrl(bgAssetId, assets)
  const bgLoaded = useImageLoaded(bgDataUrl)

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-fg-faint">
        暂无数据
      </div>
    )
  }

  // 空舞台底色归入「canvas 底」层（浅色=干净浅灰 230 / 深色=近黑），与左右白色浮起面板形成清晰分层，不再有孤立的第三种米灰
  const stageEmptyBg = 'rgb(var(--c-canvas))'
  const bgStyle: React.CSSProperties = bgDataUrl
    ? { backgroundImage: `url(${bgDataUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: bgAssetId ? (BG_COLORS[bgAssetId] ?? stageEmptyBg) : stageEmptyBg }

  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden rounded-lg border border-edge/16 bg-canvas shadow-[inset_0_0_30px_rgba(0,0,0,0.08)]"
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

        {/* 空舞台引导：无背景图且无立绘时给出下一步提示，避免大片空白显丑 */}
        {!bgDataUrl && Object.keys(state.characters).length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 text-center">
            <ImageIcon size={28} strokeWidth={1.5} className="text-fg-faint" />
            <p className="max-w-[260px] text-[13px] leading-relaxed text-fg-subtle">
              从左侧拖入背景或立绘，或直接在下方的输入框写下第一行台词
            </p>
          </div>
        )}

        {/* 立绘拖放槽位引导线 */}
        {spriteSlotGuides}

        {/* 拖动立绘时显示预设站位锚点线，让「吸附」看得见、好理解 */}
        {dragPos && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {Object.entries(SLOT_ANCHORS).map(([id, a]) => (
              <div
                key={id}
                className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-signal/50"
                style={{ left: `${a.x * 100}%` }}
              >
                <span className="absolute top-1 left-1 rounded bg-signal/20 px-1 text-[11px] text-signal">
                  {id}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 角色层（可拖动：磁吸预设站位，拉离即自由微调） */}
        {Object.entries(state.characters).map(
          ([charId, char]: [string, ResolvedCharacterState]) => {
            const { dataUrl: spriteDataUrl, color: spriteColor } = resolveSpriteImage(
              char.sprite_id,
              assets,
              characterConfigs,
            )

            const dragging = dragPos?.charId === charId
            const anchor = SLOT_ANCHORS[char.position_slot] ?? SLOT_ANCHORS.center
            const px = dragging ? dragPos!.x : char.pos_x ?? anchor.x
            const py = dragging ? dragPos!.y : char.pos_y ?? anchor.y
            const hasOffset = char.pos_x != null || char.pos_y != null

            return (
              <div
                key={charId}
                onMouseDown={handleCharMouseDown(charId)}
                onDragStart={(e) => e.preventDefault()}
                className={`group pointer-events-auto absolute -translate-x-1/2 -translate-y-full flex select-none cursor-grab flex-col items-center active:cursor-grabbing ${
                  dragging ? '' : 'transition-[left,top] duration-200'
                }`}
                // zIndex 动态对齐 computeZorder：按水平位置升序（越靠右越靠前），
                // 与 Ren'Py 导出产物层级严格一致，消灭预览/导出认知分歧。
                style={{
                  left: `${px * 100}%`,
                  top: `${py * 100}%`,
                  zIndex: Math.round((char.pos_x ?? SLOT_ANCHORS[char.position_slot]?.x ?? 0.5) * 10) + 10,
                }}
                title="拖动可移动位置；靠近左/中/右的虚线会自动吸附到站位，拉离即自由微调"
              >
                {spriteDataUrl ? (
                  /* 真实立绘图片 */
                  <img
                    src={spriteDataUrl}
                    alt={getDisplayName(charId)}
                    draggable={false}
                    className="max-h-64 w-auto select-none object-contain drop-shadow-lg"
                    style={{ minHeight: '80px' }}
                  />
                ) : (
                  /* 兜底色块占位 */
                  <div
                    className="flex w-16 flex-col items-center gap-1 rounded-t-lg px-3 pt-6 pb-3 shadow-lg"
                    style={{ backgroundColor: spriteColor, minHeight: '100px' }}
                  >
                    <span className="text-center text-[12px] font-medium text-white/80">
                      {getDisplayName(charId)}
                    </span>
                    <span className="text-center text-[12px] text-white/50">
                      {char.sprite_id}
                    </span>
                  </div>
                )}
                <div
                  className={`mt-1 rounded px-1.5 text-center text-[12px] transition-colors ${
                    dragging
                      ? 'bg-signal/20 text-signal'
                      : 'text-fg-faint opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {dragging ? dragPos!.slot : char.position_slot}
                  {hasOffset && !dragging ? ' 微调' : ''}
                  {dragging ? (dragPos!.snapped ? ' 吸附' : ` ${Math.round(px * 100)},${Math.round(py * 100)}`) : ''}
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
            <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[12px] text-signal">
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
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[12px] text-success">
              <Music size={10} strokeWidth={1.75} /> {state.audio.bgm.asset_id}
            </span>
          )}
          {state.audio.ambient && (
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[12px] text-info">
              <AudioLines size={10} strokeWidth={1.75} /> {state.audio.ambient.asset_id}
            </span>
          )}
          {state.audio.se.length > 0 && (
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[12px] text-warning">
              <Megaphone size={10} strokeWidth={1.75} /> {state.audio.se.join(', ')}
            </span>
          )}
          {state.audio.voice && (
            <span className="flex items-center justify-end gap-1 rounded bg-surface-2/80 px-2 py-0.5 text-[12px] text-purple-400">
              <Volume2 size={10} strokeWidth={1.75} /> {state.audio.voice}
            </span>
          )}
          {dragOverZone === 'audio' && (
            <span className="text-[12px] text-info">放置音频</span>
          )}
        </div>

        {/* 快捷台词编辑条 —— 拖入素材后直接在此写台词，无需切视图；遮罩跟随主题（浅色=浅灰渐隐） */}
        <div
          className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 p-3 pt-10"
          style={{
            background:
              'linear-gradient(to top, rgb(var(--c-canvas) / 0.96), rgb(var(--c-canvas) / 0.82) 55%, transparent)',
          }}
        >
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
                className="w-24 rounded-md border border-edge/15 bg-surface-3 px-2 py-1.5 text-[14px] text-fg placeholder-fg-subtle outline-none transition-colors focus:border-signal/60"
              />
              <datalist id="speaker-list">
                {characterConfigs.map((c) => (
                  <option key={c.charId} value={c.displayName}>{c.charId}</option>
                ))}
              </datalist>
            </div>
            {/* 台词输入 */}
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={localDialogue}
                onChange={(e) => {
                  setLocalDialogue(e.target.value)
                  commitDialogue(localSpeaker, e.target.value)
                }}
                placeholder={state.speaker ? `${state.speaker}的台词...` : '旁白或台词...'}
                className="w-full rounded-md border border-edge/15 bg-surface-3 px-2 py-1.5 text-[14px] text-fg placeholder-fg-subtle outline-none transition-colors focus:border-signal/60"
              />
            </div>
          </div>
          {/* 行信息提示 */}
          <div className="mt-1.5 text-right text-[12px] text-fg-subtle">
            {state.line_id} 快捷输入 {state.speaker ? `说话人 ${state.speaker}` : '旁白模式'}
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
