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
import {
  Music, AudioLines, Megaphone, Volume2, Image as ImageIcon, ChevronLeft, ChevronRight,
  Plus, FileText, Play, Pause, Copy, X, Pencil,
} from 'lucide-react'
import { Skeleton, IconButton } from '@/components/ui'
import { PRESET_SLOTS, getPresetSlot } from '@/core/positionSlots'
import { playAudioPreview, stopBgm, stopAmbient, stopOneShots } from '@/utils/audioManager'
import { estimateLineDurationMs } from '@/utils/playback'

// ===================== 共享坐标判定函数（唯一真理源） =====================

type DragOverZone = 'bg' | 'ch-left' | 'ch-left-center' | 'ch-center' | 'ch-right-center' | 'ch-right' | 'audio' | null

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
    const slotId = nearestSlot(rx)
    return { zone: `ch-${slotId}` as DragOverZone, assetType: 'sprite' }
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

/** 立绘底部对齐的归一化纵向位置（舞台留顶给 UI，65% 处为脚底基准） */
const SLOT_Y = 0.65
/** 由统一预设站位派生的磁吸锚点（水平中心 + 固定脚底 y），五档一致且可磁吸 */
const SLOT_ANCHORS: Record<string, { x: number; y: number }> = Object.fromEntries(
  PRESET_SLOTS.map((s) => [s.id, { x: s.anchor_x, y: SLOT_Y }]),
)
/** 磁吸阈值：拖到离预设站位这么近才吸附（留足自由微调空间，避免「被钉死」） */
const SNAP_X = 0.035
const SNAP_Y = 0.045

const SLOT_POSITIONS: Record<string, { x: string; y: string }> = Object.fromEntries(
  Object.entries(SLOT_ANCHORS).map(([k, v]) => [k, { x: `${v.x * 100}%`, y: `${v.y * 100}%` }]),
)

/** 返回离给定 x 最近的预设站位 ID（含左偏中 / 右偏中） */
function nearestSlot(x: number): string {
  let best = 'center'
  let bestDist = Infinity
  for (const s of PRESET_SLOTS) {
    const d = Math.abs(s.anchor_x - x)
    if (d < bestDist) {
      bestDist = d
      best = s.id
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
  const insertDeltaAt = useAppStore((s) => s.insertDeltaAt)
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)
  const getDisplayName = useAppStore((s) => s.getDisplayName)
  const getCharacter = useAppStore((s) => s.getCharacter)
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const addCharacter = useAppStore((s) => s.addCharacter)
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const scriptDrawerOpen = useAppStore((s) => s.scriptDrawerOpen)
  const toggleScriptDrawer = useAppStore((s) => s.toggleScriptDrawer)

  const currentDelta = draftDeltas[selectedIndex] ?? null
  const state: ResolvedLineState | null = resolvedStates[selectedIndex] ?? null

  // 快捷台词编辑本地状态
  const [localSpeaker, setLocalSpeaker] = useState(currentDelta?.speaker ?? '')
  const [localDialogue, setLocalDialogue] = useState(currentDelta?.dialogue ?? '')
  const dialogueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 台词栏激活态：默认隐藏，点击悬浮按钮或快捷键「I」才弹出半透明浮层，避免常驻挡视线
  const [inputActive, setInputActive] = useState(false)

  // 选中行变化 → 同步本地状态
  useEffect(() => {
    if (currentDelta) {
      setLocalSpeaker(currentDelta.speaker ?? '')
      setLocalDialogue(currentDelta.dialogue ?? '')
    }
  }, [selectedIndex, currentDelta?.line_id])

  // 键盘切换场景：←/↑ 上一场景，→/↓ 下一场景（在输入框内输入时不抢键）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (selectedIndex < resolvedStates.length - 1) {
          e.preventDefault()
          selectLine(selectedIndex + 1)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (selectedIndex > 0) {
          e.preventDefault()
          selectLine(selectedIndex - 1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIndex, resolvedStates.length, selectLine])

  // 快捷键：I 切换台词浮层，Esc 关闭（输入框聚焦时不拦截原生行为）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        setInputActive((v) => !v)
      } else if (e.key === 'Escape') {
        setInputActive(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

      // 空项目时自动创建首行再接受素材放置
      let idx = selectedIndex
      let curState: ResolvedLineState | null = state
      if (!curState) {
        useAppStore.getState().insertDeltaAt(0)
        idx = 0
        curState = useAppStore.getState().getResolvedState(0)
        if (!curState) return
      }

      // 用 drop 时的实时坐标做最终判定
      const rect = containerRectRef.current ?? e.currentTarget.getBoundingClientRect()
      const { rx, ry } = getRelativePos(rect, e.clientX, e.clientY)
      const { zone } = computeZone(asset, rx, ry)

      // zone 为 null → 不在有效落区，忽略
      if (!zone) return

      if (zone === 'bg' && asset.type === 'background') {
        updateDeltaAt(idx, (prev: LineDelta) => ({
          ...prev,
          background: { asset_id: asset.assetId },
        }))
        toast(`背景已设为 ${asset.name}`, 'success')
      } else if (zone.startsWith('ch-') && asset.type === 'sprite') {
        const charId = deriveCharacterId(asset.assetId)
        const slot = zone.slice(3)
        const slotLabel: Record<string, string> = {
          left: '左', 'left-center': '左偏中', center: '中', 'right-center': '右偏中', right: '右',
        }

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
        updateDeltaAt(idx, (prev: LineDelta) => ({
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
        toast(`立绘 ${asset.name} 已放置到 ${slotLabel[slot] ?? slot} 位`, 'success')
      } else if (zone === 'audio' && asset.type === 'audio') {
        const cat = getAudioCategory(asset.assetId)
        updateDeltaAt(idx, (prev: LineDelta) => {
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
    [selectedIndex, updateDeltaAt, resetDragState, state, getCharacter, addCharacter],
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

  // =================== 立绘编辑面板（定点 / 复制 / 锁定 / 缩放） ===================
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  const [lockAxis, setLockAxis] = useState<'none' | 'x' | 'y'>('none')
  const lockAxisRef = useRef<'none' | 'x' | 'y'>('none')
  lockAxisRef.current = lockAxis

  /** 一键定点：吸附到预设站位，清除自由微调偏移（保证全篇同站位严丝合缝） */
  const applyPresetSlot = useCallback(
    (charId: string, slotId: string) => {
      updateDeltaAt(selectedIndex, (prev: LineDelta) => {
        const base = prev.characters[charId] ?? {
          sprite_id: 'default',
          position_slot: slotId,
          action: 'show' as const,
        }
        return {
          ...prev,
          characters: {
            ...prev.characters,
            [charId]: {
              ...base,
              position_slot: slotId,
              pos_x: undefined,
              pos_y: undefined,
              action: 'show' as const,
            },
          },
        }
      })
    },
    [selectedIndex, updateDeltaAt],
  )

  /** 复制上一行该角色的位置 / 缩放（经典「对齐上一句同角色站位」） */
  const copyPrevPosition = useCallback(
    (charId: string) => {
      const prevChar = resolvedStates[selectedIndex - 1]?.characters[charId]
      if (!prevChar) {
        toast('上一行没有该角色，无法复制位置', 'info')
        return
      }
      updateDeltaAt(selectedIndex, (prev: LineDelta) => {
        const base = prev.characters[charId] ?? {
          sprite_id: prevChar.sprite_id,
          position_slot: prevChar.position_slot,
          action: 'show' as const,
        }
        return {
          ...prev,
          characters: {
            ...prev.characters,
            [charId]: {
              ...base,
              position_slot: prevChar.position_slot,
              pos_x: prevChar.pos_x,
              pos_y: prevChar.pos_y,
              scale: prevChar.scale,
              action: 'show' as const,
            },
          },
        }
      })
      toast('已复制上一行的位置与缩放', 'success')
    },
    [selectedIndex, resolvedStates, updateDeltaAt],
  )

  /** 设置立绘缩放（独立于位置，不影响落点） */
  const setCharScale = useCallback(
    (charId: string, scale: number) => {
      const clamped = Math.max(0.2, Math.min(2, scale))
      updateDeltaAt(selectedIndex, (prev: LineDelta) => {
        const base = prev.characters[charId] ?? {
          sprite_id: 'default',
          position_slot: 'center',
          action: 'show' as const,
        }
        return {
          ...prev,
          characters: {
            ...prev.characters,
            [charId]: { ...base, scale: clamped, action: 'show' as const },
          },
        }
      })
    },
    [selectedIndex, updateDeltaAt],
  )

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  // =================== 自动播放（Auto）引擎 ===================
  // 经典 Galgame 自动翻页：按字数估算每行停留时长，自动推进并触发演出 / 音频变化（含段落内 offset）。
  const [autoOn, setAutoOn] = useState(false)
  const autoRunningRef = useRef(false)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAudioRef = useRef<ReturnType<typeof setTimeout>[]>([])

  /** 进入一行时调度该行的音频（含段落内 offset 延迟切入）；一次性事件每次重播，常驻通道仅在变化时切换 */
  const playLineAudio = useCallback(
    (state: ResolvedLineState | null, prev: ResolvedLineState | null) => {
      if (!state) return
      // 常驻通道：BGM（仅当曲目变化时切换，避免循环中断）
      const curBgm = state.audio.bgm?.asset_id ?? null
      const prevBgm = prev?.audio.bgm?.asset_id ?? null
      if (curBgm !== prevBgm) {
        stopBgm()
        if (curBgm) {
          const asset = assets.find((a) => a.id === curBgm)
          if (asset) {
            const off = state.audio.bgm?.offset_ms ?? 0
            if (off > 0) pendingAudioRef.current.push(setTimeout(() => void playAudioPreview(asset), off))
            else void playAudioPreview(asset)
          }
        }
      }
      // 常驻通道：环境音
      const curAmb = state.audio.ambient?.asset_id ?? null
      const prevAmb = prev?.audio.ambient?.asset_id ?? null
      if (curAmb !== prevAmb) {
        stopAmbient()
        if (curAmb) {
          const asset = assets.find((a) => a.id === curAmb)
          if (asset) {
            const off = state.audio.ambient?.offset_ms ?? 0
            if (off > 0) pendingAudioRef.current.push(setTimeout(() => void playAudioPreview(asset), off))
            else void playAudioPreview(asset)
          }
        }
      }
      // 一次性：音效（逐条 offset）
      for (const seId of state.audio.se) {
        const asset = assets.find((a) => a.id === seId)
        if (!asset) continue
        const off = state.audio.se_offset_ms?.[seId] ?? 0
        if (off > 0) pendingAudioRef.current.push(setTimeout(() => void playAudioPreview(asset), off))
        else void playAudioPreview(asset)
      }
      // 一次性：语音（offset）
      if (state.audio.voice) {
        const asset = assets.find((a) => a.id === state.audio.voice!)
        if (asset) {
          const off = state.audio.voice_offset_ms ?? 0
          if (off > 0) pendingAudioRef.current.push(setTimeout(() => void playAudioPreview(asset), off))
          else void playAudioPreview(asset)
        }
      }
    },
    [assets],
  )

  const clearAutoTimers = useCallback(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = null
    pendingAudioRef.current.forEach((t) => clearTimeout(t))
    pendingAudioRef.current = []
  }, [])

  const stopAuto = useCallback(() => {
    autoRunningRef.current = false
    setAutoOn(false)
    clearAutoTimers()
    stopOneShots() // 停止一次性 se / voice，避免停下后残留播放
  }, [clearAutoTimers])

  const runAutoFrom = useCallback(
    (index: number) => {
      if (!autoRunningRef.current) return
      if (index >= resolvedStates.length) {
        stopAuto()
        return
      }
      if (selectedIndex !== index) selectLine(index)
      const state = resolvedStates[index]
      const prev = index > 0 ? resolvedStates[index - 1] : null
      playLineAudio(state, prev)
      const dur = estimateLineDurationMs(state.dialogue)
      autoTimerRef.current = setTimeout(() => runAutoFrom(index + 1), dur)
    },
    [resolvedStates, selectedIndex, selectLine, playLineAudio, stopAuto],
  )

  const toggleAuto = useCallback(() => {
    if (autoRunningRef.current) {
      stopAuto()
      return
    }
    autoRunningRef.current = true
    setAutoOn(true)
    runAutoFrom(selectedIndex)
  }, [selectedIndex, runAutoFrom, stopAuto])

  // 卸载时停止 Auto，避免定时器泄漏
  useEffect(() => {
    return () => {
      autoRunningRef.current = false
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
      pendingAudioRef.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  const handleCharMouseDown = useCallback(
    (charId: string) => (e: React.MouseEvent) => {
      // 只接管左键，避免与右键菜单等冲突
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      setSelectedCharId(charId)
      const el = e.currentTarget as HTMLDivElement
      const stageEl = stageRef.current
      if (!stageEl) return
      const char = (resolvedStates[selectedIndex]?.characters ?? {})[charId]
      if (!char) return
      const anchor = SLOT_ANCHORS[char.position_slot] ?? SLOT_ANCHORS.center
      const startX = char.pos_x ?? anchor.x
      const startY = char.pos_y ?? anchor.y

      // 用 getBoundingClientRect 拿到「含 scale 变换」的真实渲染尺寸，做边界夹紧，
      // 避免缩放后的立绘在边缘被裁切（看起来「变小」）或拖出舞台。
      const srect0 = stageEl.getBoundingClientRect()
      const erect0 = el.getBoundingClientRect()
      const halfWFrac = erect0.width / srect0.width / 2
      const fullHFrac = erect0.height / srect0.height

      // 抓取点相对立绘「中心-X / 底部-Y」锚点的偏移，避免一抓住立绘中心就瞬移到光标下（看着像闪）
      const rx0 = (e.clientX - srect0.left) / srect0.width
      const ry0 = (e.clientY - srect0.top) / srect0.height
      const offsetX = rx0 - startX
      const offsetY = ry0 - startY

      // 拖拽期间锁全局光标为抓取态 + 禁止选中文本，避免「抓住又变回鼠标 / 误选文字」
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'

      const move = (ev: MouseEvent) => {
        const rect = stageEl.getBoundingClientRect()
        let rx = (ev.clientX - rect.left) / rect.width - offsetX
        let ry = (ev.clientY - rect.top) / rect.height - offsetY
        // 边界夹紧：整张立绘永远完整落在舞台内（绝不被 overflow-hidden 裁切而「变小」）
        rx = clamp(rx, halfWFrac, 1 - halfWFrac)
        ry = clamp(ry, fullHFrac, 1)
        // 锁定单轴：拖动时只改另一轴，被锁定轴维持抓取起始值（位移与缩放解耦）
        if (lockAxisRef.current === 'x') ry = startY
        else if (lockAxisRef.current === 'y') rx = startX
        // 仅实时显示「将吸附到的站位」，拖动中不强行吸附（避免来回跳变 / 闪屏）；吸附在松手时执行
        const slot = nearestSlot(rx)
        const p = { charId, x: rx, y: ry, snapped: false, slot }
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
          const resolvedChar = resolvedStates[selectedIndex]?.characters[charId]
          const slot = p.slot
          const ax = SLOT_ANCHORS[slot]?.x
          // 松手时再做磁吸：足够靠近预设站位 X 或默认脚底 Y 才吸附，否则保留自由微调
          const snapX = ax != null && Math.abs(p.x - ax) < SNAP_X
          const snapY = Math.abs(p.y - SLOT_Y) < SNAP_Y
          const sx = snapX ? ax! : p.x
          const sy = snapY ? SLOT_Y : p.y
          const atAnchor = snapX && snapY
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
                  pos_x: atAnchor ? undefined : sx,
                  pos_y: atAnchor ? undefined : sy,
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
        {PRESET_SLOTS.map((s) => {
          const pos = SLOT_POSITIONS[s.id]
          const active = dragOverZone === `ch-${s.id}`
          return (
              <div
                key={s.id}
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
                <span className="text-xs text-fg-subtle">{s.label}</span>
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

  // 从背景图采样主色调，用来填充 contain 的 letterbox 区（比纯色空白自然，也比模糊铺满干净）
  const [bgTint, setBgTint] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!bgDataUrl) {
      setBgTint(undefined)
      return
    }
    let active = true
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 12
        c.height = 12
        const ctx = c.getContext('2d')
        if (!ctx) {
          if (active) setBgTint(undefined)
          return
        }
        ctx.drawImage(img, 0, 0, 12, 12)
        const d = ctx.getImageData(0, 0, 12, 12).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
        }
        if (active) setBgTint(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`)
      } catch {
        if (active) setBgTint(undefined)
      }
    }
    img.onerror = () => { if (active) setBgTint(undefined) }
    img.src = bgDataUrl
    return () => { active = false }
  }, [bgDataUrl])

  if (!state) {
    return (
      <main
        className="relative flex min-w-0 flex-1 flex-col bg-surface rounded-md border border-edge/10 shadow-sm overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnStage}
      >
        <div className="flex flex-1 items-center justify-center text-sm text-fg-faint bg-[rgb(var(--c-surface-3))]">
          暂无数据
        </div>
      </main>
    )
  }

  // 空舞台演出区占位：用 surface-3（236 输入框底），在白面板外壳内形成清晰的内嵌画布感（255→236 差 19 级，视觉分明但不刺眼）
  const stageEmptyBg = 'rgb(var(--c-surface-3))'
  // 背景图：清晰整图用 contain 完整显示（不裁切）；letterbox 的空白区用「同图模糊铺满」填充，
  // 既看得到整张背景、又不会上下留难看的纯色空白。
  const hasBgImage = !!bgDataUrl
  const bgSharpStyle: React.CSSProperties = hasBgImage
    ? { backgroundImage: `url(${bgDataUrl})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
    : {}
  // letterbox 区用「从背景图采样的主色调」填充：既看到整张背景、又不会上下留刺眼的纯色空白
  const bgBaseStyle: React.CSSProperties = hasBgImage
    ? { background: bgTint ?? stageEmptyBg }
    : { background: bgAssetId ? (BG_COLORS[bgAssetId] ?? stageEmptyBg) : stageEmptyBg }

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-surface rounded-lg border border-edge/[0.14] shadow-sm overflow-hidden">
      {/* 场景导航头部：上一/下一 + 当前/总数 + 添加场景，键盘 ←/→ 亦可切换 */}
      <header className="flex shrink-0 items-center justify-between border-b border-edge/10 px-3 py-1.5">
        <span className="text-[13px] font-medium text-fg">场景预览 · {state.line_id}</span>
        <div className="flex items-center gap-1">
          <IconButton
            variant="ghost"
            size="sm"
            disabled={selectedIndex <= 0 || autoOn}
            icon={<ChevronLeft size={16} strokeWidth={1.75} />}
            onClick={() => selectLine(selectedIndex - 1)}
            title="上一个场景"
            aria-label="上一个场景"
          />
          <span className="min-w-[46px] text-center text-[13px] tabular-nums text-fg-subtle">
            {selectedIndex + 1} / {resolvedStates.length}
          </span>
          <IconButton
            variant="ghost"
            size="sm"
            disabled={selectedIndex >= resolvedStates.length - 1 || autoOn}
            icon={<ChevronRight size={16} strokeWidth={1.75} />}
            onClick={() => selectLine(selectedIndex + 1)}
            title="下一个场景"
            aria-label="下一个场景"
          />
          <button
            type="button"
            onClick={toggleAuto}
            title={autoOn ? '停止自动播放' : '自动播放（Auto）'}
            className={`ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] font-medium transition-colors ${
              autoOn
                ? 'border-signal bg-signal text-white hover:bg-signal/90'
                : 'border-edge/20 bg-surface-2 text-fg hover:bg-surface-hover'
            }`}
          >
            {autoOn ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} />}
            Auto
          </button>
          <button
            type="button"
            onClick={() => insertDeltaAt(selectedIndex + 1)}
            title="在当前场景之后添加新场景"
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-edge/20 bg-surface-2 px-2 py-1 text-[13px] font-medium text-fg transition-colors hover:bg-surface-hover"
          >
            <Plus size={15} strokeWidth={2} />
            添加场景
          </button>
          {!scriptDrawerOpen && (
            <button
              type="button"
              onClick={toggleScriptDrawer}
              title="打开剧本流"
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-edge/20 bg-surface-2 px-2 py-1 text-[13px] font-medium text-fg transition-colors hover:bg-surface-hover"
            >
              <FileText size={15} strokeWidth={1.75} />
              剧本
            </button>
          )}
        </div>
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        <div
          ref={stageRef}
          className="relative flex-1 overflow-hidden bg-canvas shadow-[inset_0_0_30px_rgba(0,0,0,0.08)]"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDropOnStage}
          onClick={() => setSelectedCharId(null)}
        >
        {/* 背景层 */}
        <div
          className="absolute inset-0 animate-fade-in"
          style={bgBaseStyle}
        >
          {hasBgImage && (
            /* 清晰整图：contain 完整显示，不裁切；letterbox 由底色(bgTint)自然填充 */
            <div className="absolute inset-0" style={bgSharpStyle} />
          )}
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
            const scale = char.scale ?? 1
            const hasOffset = char.pos_x != null || char.pos_y != null
            const selected = selectedCharId === charId
            const slotLabel = getPresetSlot(char.position_slot)?.label ?? char.position_slot

            return (
              <div
                key={charId}
                onMouseDown={handleCharMouseDown(charId)}
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e) => e.preventDefault()}
                className={`group pointer-events-auto absolute -translate-x-1/2 -translate-y-full flex select-none cursor-grab flex-col items-center active:cursor-grabbing ${
                  dragging ? '' : 'transition-[left,top] duration-200'
                } ${selected ? 'rounded-lg ring-2 ring-signal' : ''}`}
                // zIndex 动态对齐 computeZorder：按水平位置升序（越靠右越靠前），
                // 与 Ren'Py 导出产物层级严格一致，消灭预览/导出认知分歧。
                style={{
                  left: `${px * 100}%`,
                  top: `${py * 100}%`,
                  zIndex: dragging ? 1000 : Math.round((char.pos_x ?? SLOT_ANCHORS[char.position_slot]?.x ?? 0.5) * 10) + 10,
                }}
                title="拖动可移动位置；靠近站位的虚线会自动吸附，拉离即自由微调。点按选中后可定点 / 缩放 / 锁定。"
              >
                {spriteDataUrl ? (
                  /* 真实立绘图片：外层负责定位，内层 img 仅承载 scale，缩放原点锁定底部中心 → 位移与缩放彻底解耦 */
                  <img
                    src={spriteDataUrl}
                    alt={getDisplayName(charId)}
                    draggable={false}
                    className="max-h-64 w-auto select-none object-contain drop-shadow-lg"
                    style={{ minHeight: '80px', transform: `scale(${scale})`, transformOrigin: 'bottom center' }}
                  />
                ) : (
                  /* 兜底色块占位（同样仅内层缩放） */
                  <div
                    className="flex w-16 flex-col items-center gap-1 rounded-t-lg px-3 pt-6 pb-3 shadow-lg"
                    style={{ backgroundColor: spriteColor, minHeight: '100px', transform: `scale(${scale})`, transformOrigin: 'bottom center' }}
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
                      : selected
                        ? 'bg-signal/15 text-signal'
                        : 'text-fg-faint opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {dragging ? dragPos!.slot : slotLabel}
                  {hasOffset && !dragging ? ' 微调' : ''}
                  {scale !== 1 ? ` ×${scale.toFixed(2)}` : ''}
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

        {/* 台词输入浮层：默认隐藏，点击悬浮按钮 / 快捷键「I」才弹出半透明浮层，激活时浮于舞台下方中央，不长期遮挡视线 */}
        {inputActive ? (
          <div
            className="absolute bottom-3 left-1/2 z-40 w-[min(640px,92%)] -translate-x-1/2 rounded-xl border border-edge/15 bg-surface/85 p-2.5 shadow-2 backdrop-blur-md"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-fg">写台词</span>
              <button
                type="button"
                onClick={() => setInputActive(false)}
                className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                title="收起（Esc）"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <div className="relative shrink-0">
                <input
                  type="text"
                  autoFocus
                  value={localSpeaker}
                  onChange={(e) => { setLocalSpeaker(e.target.value); commitDialogue(e.target.value, localDialogue) }}
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
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={localDialogue}
                  onChange={(e) => { setLocalDialogue(e.target.value); commitDialogue(localSpeaker, e.target.value) }}
                  placeholder={state.speaker ? `${state.speaker}的台词...` : '旁白或台词...'}
                  className="w-full rounded-md border border-edge/15 bg-surface-3 px-2 py-1.5 text-[14px] text-fg placeholder-fg-subtle outline-none transition-colors focus:border-signal/60"
                />
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setInputActive(true)}
            className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-edge/15 bg-surface/80 px-3 py-1.5 text-[13px] text-fg-muted shadow-lg backdrop-blur-md transition-colors hover:bg-surface-hover hover:text-fg"
            title="写台词（快捷键 I）"
          >
            <Pencil size={13} strokeWidth={1.75} /> 写台词
          </button>
        )}

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

        {/* 立绘编辑侧栏：单击选中立绘后常驻显示，固定在舞台右侧，绝不遮挡舞台；
            滑块实时驱动立绘（位置 / 缩放）变化，所见即所得 */}
        {selectedCharId && state.characters[selectedCharId] && (
          <aside className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-l border-edge/12 bg-surface/95 p-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-fg">
                立绘编辑 · {getDisplayName(selectedCharId)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedCharId(null)}
                className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                title="关闭"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>

            {/* 一键定点（五档经典站位） */}
            <div>
              <div className="mb-1 text-[11px] text-fg-subtle">定点</div>
              <div className="grid grid-cols-3 gap-1">
                {PRESET_SLOTS.map((s) => {
                  const cur = state.characters[selectedCharId]
                  const activeSlot = cur.position_slot === s.id && cur.pos_x == null && cur.pos_y == null
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => applyPresetSlot(selectedCharId, s.id)}
                      className={`rounded border px-1 py-1 text-[12px] transition-colors ${
                        activeSlot
                          ? 'border-signal bg-signal/15 text-signal'
                          : 'border-edge/15 text-fg-muted hover:bg-surface-hover'
                      }`}
                      title={`定位到${s.label}`}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 复制上一行位置 */}
            <button
              type="button"
              onClick={() => copyPrevPosition(selectedCharId)}
              className="flex w-full items-center justify-center gap-1 rounded border border-edge/15 px-2 py-1 text-[12px] text-fg-muted transition-colors hover:bg-surface-hover"
              title="把上一行该角色的位置与缩放复制过来，实现同角色跨页精确对齐"
            >
              <Copy size={12} strokeWidth={1.75} /> 复制上一行位置
            </button>

            {/* 锁定单轴 */}
            <div>
              <div className="mb-1 text-[11px] text-fg-subtle">锁定轴</div>
              <div className="flex gap-1">
                {(['none', 'x', 'y'] as const).map((ax) => (
                  <button
                    key={ax}
                    type="button"
                    onClick={() => setLockAxis(ax)}
                    className={`flex-1 rounded border px-1 py-1 text-[12px] transition-colors ${
                      lockAxis === ax
                        ? 'border-signal bg-signal/15 text-signal'
                        : 'border-edge/15 text-fg-muted hover:bg-surface-hover'
                    }`}
                    title={ax === 'none' ? '不锁定，自由拖动' : ax === 'x' ? '锁定横向，只改纵向' : '锁定纵向，只改横向'}
                  >
                    {ax === 'none' ? '无' : ax === 'x' ? '锁X' : '锁Y'}
                  </button>
                ))}
              </div>
            </div>

            {/* 缩放（与位置完全解耦） */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-fg-subtle">
                <span>缩放</span>
                <span className="tabular-nums text-fg-muted">×{(state.characters[selectedCharId].scale ?? 1).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.05}
                value={state.characters[selectedCharId].scale ?? 1}
                onChange={(e) => setCharScale(selectedCharId, parseFloat(e.target.value))}
                className="w-full accent-signal"
              />
            </div>
          </aside>
        )}
      </div>
    </main>
  )
}
