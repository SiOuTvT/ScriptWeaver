import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { ResolvedLineState, ResolvedCharacterState, LineDelta, AssetItem, CharacterConfig, MountedEffect, ChoiceItem } from '@/core/types'
import {
  getDragCache,
  type DragAssetData,
  deriveCharacterId,
  genInstanceId,
  getAudioCategory,
} from '@/utils/assetHelpers'
import { toast } from '@/utils/toast'
import { resolveAssetSrc } from '@/utils/assetSrc'
import {
  Music, AudioLines, Megaphone, Volume2, Image as ImageIcon, ChevronLeft, ChevronRight,
  Plus, FileText, Play, Pause, Square, Copy, X, Pencil, Trash2, Sparkles,
} from 'lucide-react'
import { Skeleton, IconButton } from '@/components/ui'
import EffectMountPanel from '@/components/effects/EffectMountPanel'
import { PRESET_SLOTS, getPresetSlot } from '@/core/positionSlots'
import { playAudioPreview, stopBgm, stopAmbient, stopOneShots } from '@/utils/audioManager'
import { estimateLineDurationMs } from '@/utils/playback'
import { evalCondition, findLabelIndex } from '@/utils/varRuntime'

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

/** 可选画布比例（Ren'Py 式自选）；默认 16:9 */
const CANVAS_RATIOS = [
  { id: '16:9', w: 16, h: 9 },
  { id: '4:3', w: 4, h: 3 },
  { id: '1:1', w: 1, h: 1 },
  { id: '21:9', w: 21, h: 9 },
]

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
  if (directAsset) {
    const directSrc = resolveAssetSrc(directAsset)
    if (directSrc) {
      return { dataUrl: directSrc, color: '#888' }
    }
    // asset 存在但 relativePath 为空 → 诊断 (Web 降级路径或序列化丢失)
    if (import.meta.env.DEV) {
      console.warn('[resolveSpriteImage] asset found but resolveAssetSrc returned undefined', { spriteId, directAsset })
    }
  } else if (import.meta.env.DEV) {
    console.warn('[resolveSpriteImage] direct asset not found in assets array', { spriteId, assetCount: assets.length, assetIds: assets.slice(0, 10).map(a => a.id) })
  }

  // 2. 通过角色表情引用查找
  for (const cc of characterConfigs) {
    const expr = cc.expressions.find((e) => e.id === spriteId)
    if (expr) {
      const exprAsset = assets.find((a) => a.id === expr.assetId)
      if (exprAsset) {
        const exprSrc = resolveAssetSrc(exprAsset)
        if (exprSrc) {
          return { dataUrl: exprSrc, color: '#888' }
        }
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

/**
 * 计算一行在自动/交互播放中的停留时长（毫秒）。
 * 若该行走绑定了语音且素材已知真实时长，则以语音时长为准（时长智能吸附），
 * 否则回退到按台词字数估算。
 */
function getLineStayMs(state: ResolvedLineState | null, assets: AssetItem[]): number {
  if (state?.audio.voice) {
    const a = assets.find((x) => x.id === state.audio.voice)
    if (a?.duration && a.duration > 0) return Math.max(900, Math.round(a.duration * 1000) + 250)
  }
  return estimateLineDurationMs(state?.dialogue)
}

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
  // 当前正在配音说话的立绘实例 ID（用于播放期间触发嘴型 / 表情联动）
  const [speakingCharId, setSpeakingCharId] = useState<string | null>(null)
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 说话人显示名 → charId 映射（与 Timeline 同源逻辑）
  const speakerToCharId = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of characterConfigs) {
      m.set(c.charId.toLowerCase(), c.charId)
      m.set(c.displayName.toLowerCase(), c.charId)
    }
    return m
  }, [characterConfigs])
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const scriptDrawerOpen = useAppStore((s) => s.scriptDrawerOpen)
  const toggleScriptDrawer = useAppStore((s) => s.toggleScriptDrawer)
  // 画布比例（Ren'Py 式自选，项目级持久化）
  const canvasRatio = useAppStore((s) => s.canvasRatio)
  const setCanvasRatio = useAppStore((s) => s.setCanvasRatio)
  // 变量调试器 / 交互播放器：运行时变量
  const runtimeValues = useAppStore((s) => s.runtimeValues)
  const applyRuntimeOps = useAppStore((s) => s.applyRuntimeOps)
  const resetRuntimeValues = useAppStore((s) => s.resetRuntimeValues)

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

  // 通用区间夹取
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  // 关键修复：把立绘「中心坐标」clamp 在「立绘永远完整可见」的范围内。
  // 立绘用 center center 原点 + overflow-hidden 画布，若中心越过舞台边缘，半边会被裁掉，
  // 视觉上就像「越往一边移越小」。这里按立绘真实渲染尺寸（含 transform scale）测量半宽/半高占比，
  // 把中心限制在 [hw, 1-hw]×[hh, 1-hh]，使立绘无论怎么移动都完整显示、大小恒定、绝不裁切。
  // 立绘中心坐标夹取：仅限制在舞台范围内 [0,1]，左右完全对称、自由，不再用半宽夹紧
  // （半宽夹紧曾造成「往左拖不上去」的限制感；而「越往右越小」的真因是 div 的 shrink-to-fit，
  // 已由渲染层 w-max/width:max-content 修复，与此夹取无关）。
  const clampCharCenter = useCallback((_charId: string, rx: number, ry: number) => {
    return {
      rx: clamp(rx, 0, 1),
      ry: clamp(ry, 0, 1),
    }
  }, [clamp])

  // 切换场景行时清空立绘选中态，避免面板残留上一行已不存在的角色
  useEffect(() => {
    setSelectedCharId(null)
  }, [selectedIndex])


  // 归一化已存盘但越界的坐标：把立绘中心拉回「完整可见」范围，确保加载即完整显示、绝不裁切。
  // 拖拽过程中（dragPosRef 非空）跳过，避免与实时拖拽互相打架。
  useLayoutEffect(() => {
    if (dragPosRef.current) return
    if (!state) return
    const chars = state.characters
    for (const charId of Object.keys(chars)) {
      const ch = chars[charId]
      const ax = ch.pos_x ?? SLOT_ANCHORS[ch.position_slot]?.x ?? 0.5
      const ay = ch.pos_y ?? SLOT_ANCHORS[ch.position_slot]?.y ?? SLOT_Y
      const c = clampCharCenter(charId, ax, ay)
      // 站位坐标本身（如 right=0.78）也可能让立绘超界被裁切，故即使「用站位」也要检查并修正，
      // 确保加载即完整显示、绝不裁切、大小恒定。
      let needsFix = false
      if (ch.pos_x != null) {
        if (Math.abs(c.rx - ch.pos_x) > 1e-4) needsFix = true
      } else if (Math.abs(c.rx - ax) > 1e-4) {
        needsFix = true
      }
      if (ch.pos_y != null) {
        if (Math.abs(c.ry - ch.pos_y) > 1e-4) needsFix = true
      } else if (Math.abs(c.ry - ay) > 1e-4) {
        needsFix = true
      }
      if (needsFix) {
        updateDeltaAt(selectedIndex, (prev: LineDelta) => {
          const base = prev.characters[charId]
          if (!base) return prev
          return {
            ...prev,
            characters: {
              ...prev.characters,
              [charId]: { ...base, pos_x: c.rx, pos_y: c.ry },
            },
          }
        })
      }
    }
  }, [state?.characters, selectedIndex, clampCharCenter, updateDeltaAt])


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

  // 立绘图片加载失败（素材缺失 / 404 / 格式异常）的兜底：标记后改用带角色名的色块占位，
  // 避免「拖上去却什么都不显示」且没有任何提示的静默失败（铁律 1 下 sw-asset 404 时
  // resolveSpriteImage 仍返回非空 dataUrl，原色块兜底不会触发，故需显式 onError 兜底）。
  const [spriteErrors, setSpriteErrors] = useState<Set<string>>(() => new Set())
  const markSpriteError = useCallback((key: string) => {
    setSpriteErrors((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

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

      const store = useAppStore.getState()

      // 空项目时自动创建首行再接受素材放置
      let idx = store.selectedLineIndex
      let curState: ResolvedLineState | null = store.resolvedStates[idx] ?? null
      if (!curState) {
        store.insertDeltaAt(0)
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
        useAppStore.getState().updateDeltaAt(idx, (prev: LineDelta) => ({
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
        const st2 = useAppStore.getState()
        if (!st2.getCharacter(charId)) {
          const rawName = asset.assetId.replace(/^asset_sprite_|^sprite_|^local_/, '').replace(/_/g, ' ')
          const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1)
          st2.addCharacter({
            charId,
            displayName,
            expressions: [{ id: 'default', label: '默认', assetId: asset.assetId }],
            defaultExpression: 'default',
          })
        }

        // 每个落点生成「全局唯一实例 ID」作 map key，角色身份记在 char_id；
        // asset_id 绑定本次拖入的素材，使每个立绘各自渲染自己的图片、互不覆盖。
        const instanceId = genInstanceId(charId)
        useAppStore.getState().updateDeltaAt(idx, (prev: LineDelta) => ({
          ...prev,
          characters: {
            ...prev.characters,
            [instanceId]: {
              sprite_id: 'default',
              position_slot: slot,
              action: 'show',
              char_id: charId,
              asset_id: asset.assetId,
            },
          },
        }))
        toast(`立绘 ${asset.name} 已放置到 ${slotLabel[slot] ?? slot} 位`, 'success')
      } else if (zone === 'audio' && asset.type === 'audio') {
        const cat = getAudioCategory(asset.assetId)
        useAppStore.getState().updateDeltaAt(idx, (prev: LineDelta) => {
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
    [resetDragState],
  )

  // =================== 立绘自由拖动（磁吸预设站位 + 微调偏移） ===================

  const stageRef = useRef<HTMLDivElement>(null)
  const [dragPos, setDragPos] = useState<{ charId: string; x: number; y: number; snapped: boolean; slot: string } | null>(null)
  const dragPosRef = useRef<typeof dragPos>(null)

  // =================== 画布自适应等比缩放（Letterboxing） ===================
  // 外层视口给足空间、内部画布按所选比例「整块等比」缩放，背景永远完整、绝不截断；
  // 比例留白由主题灰填充（非纯黑）。面板开合/窗口缩放只改画布像素尺寸，立绘百分比坐标不变。
  const fitWrapRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = fitWrapRef.current
    if (!el) return
    const ar = canvasRatio.w / canvasRatio.h
    const compute = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw <= 0 || ch <= 0) return
      // 先按宽度铺满，若高度超出则改按高度铺满 —— 始终整块等比、不裁切
      let w = cw
      let h = cw / ar
      if (h > ch) {
        h = ch
        w = ch * ar
      }
      setStageSize({ w: Math.round(w), h: Math.round(h) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [canvasRatio])

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

  /** 设置立绘挂载特效列表（单事务提交，参数微调实时持久化） */
  const setCharEffects = useCallback(
    (charId: string, next: MountedEffect[]) => {
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
            [charId]: { ...base, effects: next, action: 'show' as const },
          },
        }
      })
    },
    [selectedIndex, updateDeltaAt],
  )

  /** 设置当前行背景挂载特效列表（单事务提交） */
  const setBgEffects = useCallback(
    (next: MountedEffect[]) => {
      updateDeltaAt(selectedIndex, (prev: LineDelta) => {
        const bg = prev.background
        if (!bg) return prev
        return { ...prev, background: { ...bg, effects: next } }
      })
    },
    [selectedIndex, updateDeltaAt],
  )

  /** 设置立绘自由坐标（X/Y，独立于缩放）。面板滑块实时驱动，所见即所得；写入前 clamp 到完整可见范围 */
  const setCharPos = useCallback(
    (charId: string, x: number, y: number) => {
      const c = clampCharCenter(charId, x, y)
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
            [charId]: {
              ...base,
              pos_x: c.rx,
              pos_y: c.ry,
              position_slot: prev.characters[charId]?.position_slot ?? 'center',
              action: 'show' as const,
            },
          },
        }
      })
    },
    [selectedIndex, updateDeltaAt, clampCharCenter],
  )

  /** 从舞台当前场景直接删除某立绘，并立刻同步时间轴（resolvedStates 由 updateDeltaAt 重算） */
  const deleteChar = useCallback(
    (charId: string) => {
      updateDeltaAt(selectedIndex, (prev: LineDelta) => {
        if (!prev.characters[charId]) return prev
        const nextChars = { ...prev.characters }
        delete nextChars[charId]
        return { ...prev, characters: nextChars }
      })
      setSelectedCharId((cur) => (cur === charId ? null : cur))
      toast(`已删除立绘 ${getDisplayName(state?.characters[charId]?.char_id ?? charId)}`, 'success')
    },
    [selectedIndex, updateDeltaAt, getDisplayName, state],
  )

  // 快捷键：选中立绘后按 Delete / Backspace 直接在舞台上删除，并同步时间轴
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selectedCharId) return
      const el = document.activeElement as HTMLElement | null
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
      e.preventDefault()
      deleteChar(selectedCharId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCharId, deleteChar])

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

  /** 清除说话状态（停止动画 / 定时器） */
  const clearSpeaking = useCallback(() => {
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current)
      speakTimerRef.current = null
    }
    setSpeakingCharId(null)
  }, [])

  /** 进入一行时设置「正在说话」的立绘实例，并在语音时长后自动复位（唇形 / 表情联动） */
  const setSpeaking = useCallback(
    (state: ResolvedLineState | null) => {
      if (speakTimerRef.current) {
        clearTimeout(speakTimerRef.current)
        speakTimerRef.current = null
      }
      if (!state?.audio.voice) {
        setSpeakingCharId(null)
        return
      }
      const vchar = state.speaker ? speakerToCharId.get(state.speaker.toLowerCase()) : undefined
      let instId: string | null = null
      if (vchar) {
        for (const [k, ch] of Object.entries(state.characters)) {
          if ((ch.char_id ?? k) === vchar) {
            instId = k
            break
          }
        }
      }
      setSpeakingCharId(instId)
      if (instId) {
        const a = assets.find((x) => x.id === state.audio.voice)
        const stay = a?.duration ? a.duration * 1000 : estimateLineDurationMs(state.dialogue)
        speakTimerRef.current = setTimeout(() => setSpeakingCharId(null), Math.max(800, stay))
      }
    },
    [assets, speakerToCharId],
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
    clearSpeaking()
  }, [clearAutoTimers, clearSpeaking])

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
      setSpeaking(state)
      const dur = getLineStayMs(state, assets)
      autoTimerRef.current = setTimeout(() => runAutoFrom(index + 1), dur)
    },
    [resolvedStates, selectedIndex, selectLine, playLineAudio, setSpeaking, stopAuto],
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
      clearSpeaking()
    }
  }, [clearSpeaking])

  // =================== 交互播放（预览调试）引擎 ===================
  // 逐步推进 selectedIndex 驱动舞台；遇 $ 语句更新 runtimeValues（调试器高亮跳变），
  // 遇选择支行暂停并弹出选项，选中后应用内联 ops 并按 target_label 跳转（缺失目标降级顺序继续）。
  const [playMode, setPlayMode] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [pendingChoiceIndex, setPendingChoiceIndex] = useState<number | null>(null)
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playRunningRef = useRef(false)

  const stopPlayback = useCallback(() => {
    playRunningRef.current = false
    if (playTimerRef.current) clearTimeout(playTimerRef.current)
    playTimerRef.current = null
    setPlayMode('idle')
    setPendingChoiceIndex(null)
    stopOneShots()
    clearSpeaking()
  }, [stopOneShots, clearSpeaking])

  const advanceTo = useCallback(
    (index: number) => {
      if (!playRunningRef.current) return
      if (index >= draftDeltas.length) {
        stopPlayback()
        return
      }
      const delta = draftDeltas[index]
      // 本行变量操作（在台词前发射的 $ 语句）
      if (delta.variableOps && delta.variableOps.length > 0) {
        applyRuntimeOps(delta.variableOps)
      }
      selectLine(index)
      if (delta.line_type === 'choice') {
        playRunningRef.current = false
        setPendingChoiceIndex(index)
        setPlayMode('paused')
        return
      }
      const st = resolvedStates[index]
      if (st) {
        playLineAudio(st, index > 0 ? resolvedStates[index - 1] : null)
        setSpeaking(st)
      }
      const dur = getLineStayMs(st ?? null, assets)
      playTimerRef.current = setTimeout(() => advanceTo(index + 1), dur)
    },
    [draftDeltas, resolvedStates, selectLine, applyRuntimeOps, playLineAudio, setSpeaking, stopPlayback],
  )

  const startPlayback = useCallback(
    (from: number) => {
      stopAuto()
      resetRuntimeValues()
      if (playTimerRef.current) clearTimeout(playTimerRef.current)
      playRunningRef.current = true
      setPendingChoiceIndex(null)
      setPlayMode('playing')
      advanceTo(from)
    },
    [stopAuto, resetRuntimeValues, advanceTo],
  )

  const chooseOption = useCallback(
    (choiceIndex: number, choice: ChoiceItem) => {
      if (choice.ops && choice.ops.length > 0) applyRuntimeOps(choice.ops)
      let target = choiceIndex + 1
      if (choice.target_label) {
        const idx = findLabelIndex(draftDeltas, choice.target_label)
        if (idx >= 0) target = idx
        // 未定义目标：降级顺序继续（铁律4 精神：不崩溃、不跳转 undefined）
      }
      setPendingChoiceIndex(null)
      if (playRunningRef.current) {
        setPlayMode('playing')
        advanceTo(target)
      } else {
        selectLine(target)
      }
    },
    [draftDeltas, applyRuntimeOps, advanceTo, selectLine],
  )

  const togglePlayPause = useCallback(() => {
    if (playMode === 'idle') {
      startPlayback(selectedIndex)
      return
    }
    if (playMode === 'playing') {
      playRunningRef.current = false
      if (playTimerRef.current) clearTimeout(playTimerRef.current)
      playTimerRef.current = null
      setPlayMode('paused')
      return
    }
    // paused：等待选择支行时无法跳过；否则从当前行继续
    if (pendingChoiceIndex !== null) return
    playRunningRef.current = true
    setPlayMode('playing')
    advanceTo(selectedIndex)
  }, [playMode, pendingChoiceIndex, selectedIndex, startPlayback, advanceTo])

  // 卸载清理交互播放定时器
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current)
      playRunningRef.current = false
    }
  }, [])



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
      const startPx = char.pos_x ?? anchor.x
      const startPy = char.pos_y ?? anchor.y

      // 像素增量法拖拽：鼠标像素位移直接换算成归一化位移，与立绘尺寸 / label 完全解耦，彻底跟手；
      // 不再测量 halfWFrac / fullHFrac 做比例夹紧（那是「拖不到最左」边界死锁的根源）。

      const startMouseX = e.clientX
      const startMouseY = e.clientY

      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'

      const move = (ev: MouseEvent) => {
        const rect = stageEl.getBoundingClientRect()
        const dx = (ev.clientX - startMouseX) / rect.width
        const dy = (ev.clientY - startMouseY) / rect.height
        let rx = startPx + dx
        let ry = startPy + dy
        // 解除边界死锁：立绘中心允许到舞台边缘（中心∈[0,1] 时边缘已超出舞台，
        // 由 overflow-hidden 裁切），满足「拖到最左/最右甚至超出」；不再用半宽夹紧卡在中间。
        rx = clamp(rx, 0, 1)
        ry = clamp(ry, 0, 1)
        // 锁定单轴：拖动时只改另一轴，被锁定轴维持抓取起始值（位移与缩放解耦）
        if (lockAxisRef.current === 'x') ry = startPy
        else if (lockAxisRef.current === 'y') rx = startPx
        // 拖动中【不夹取】：让立绘跟手自由移动到任意位置（含贴边 / 探出画框），
        // 「完整可见」的夹取只在松手时执行（见 up）。此前拖拽中夹紧造成「往左拖不上去」的限制感，已移除。
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
          const rawX = snapX ? (ax ?? p.x) : p.x
          const rawY = snapY ? SLOT_Y : p.y
          const atAnchor = snapX && snapY
          // 关键修复：无论是否吸附到预设站位，落点都夹到「立绘完整可见」范围并写入具体坐标。
          // 此前 atAnchor 时跳过夹取、直接写 anchor.x（如 right=0.78），立绘右半被 overflow-hidden
          // 裁掉 → 视觉上「越往右越小」。现在统一夹取，立绘任何位置都完整、大小恒定、绝不裁切。
          const cc = clampCharCenter(charId, rawX, rawY)
          const wx = cc.rx
          const wy = cc.ry
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
                  pos_x: wx,
                  pos_y: wy,
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
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
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

  // 舞台核心区锁定 16:9，背景图以 contain 完整显示、绝不截断；
  // 比例留白由外层纯黑视口（Letterboxing）填充，无需模糊层或底色。
  const hasBgImage = !!bgDataUrl

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-surface rounded-lg border border-edge/[0.14] shadow-sm overflow-hidden">
      {/* 场景导航头部：上一/下一 + 当前/总数 + 添加场景，键盘 ←/→ 亦可切换 */}
      <header className="flex shrink-0 items-center justify-between border-b border-edge/10 px-3 py-1.5">
        <span className="text-[13px] font-medium text-fg">场景预览 · {state.line_id}</span>
        <div className="flex items-center gap-1">
          {/* 画布比例选择器（Ren'Py 式自选，项目级持久化） */}
          <div className="mr-1 flex items-center gap-1 rounded-md border border-edge/20 bg-surface-2 px-1.5 py-0.5" title="切换场景画布比例">
            <span className="text-[12px] text-fg-subtle">画布</span>
            <select
              value={`${canvasRatio.w}:${canvasRatio.h}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split(':').map(Number)
                setCanvasRatio({ w, h })
              }}
              className="bg-transparent text-[13px] font-medium text-fg outline-none"
            >
              {CANVAS_RATIOS.map((r) => (
                <option key={r.id} value={`${r.w}:${r.h}`} className="bg-surface text-fg">
                  {r.id}
                </option>
              ))}
            </select>
          </div>
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
            disabled={playMode !== 'idle'}
            onClick={toggleAuto}
            title={autoOn ? '停止自动播放' : '自动播放（Auto）'}
            className={`ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] font-medium transition-colors ${
              playMode !== 'idle'
                ? 'cursor-not-allowed border-edge/15 bg-surface-1 text-fg-faint opacity-50'
                : autoOn
                  ? 'border-signal bg-signal text-white hover:bg-signal/90'
                  : 'border-edge/20 bg-surface-2 text-fg hover:bg-surface-hover'
            }`}
          >
            {autoOn ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} />}
            Auto
          </button>
          {/* 交互播放（预览调试）：遇选择支暂停弹出选项，变量变化时调试器实时跳变 */}
          <button
            type="button"
            disabled={playMode === 'paused' && pendingChoiceIndex !== null}
            onClick={togglePlayPause}
            title={
              playMode === 'idle'
                ? '从头交互播放（预览调试）'
                : playMode === 'playing'
                  ? '暂停播放'
                  : pendingChoiceIndex !== null
                    ? '请在舞台中选择分支后继续'
                    : '继续播放'
            }
            className={`ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] font-medium transition-colors ${
              playMode === 'paused' && pendingChoiceIndex !== null
                ? 'cursor-not-allowed border-edge/15 bg-surface-1 text-fg-faint opacity-50'
                : playMode === 'idle'
                  ? 'border-edge/20 bg-surface-2 text-fg hover:bg-surface-hover'
                  : 'border-signal bg-signal text-white hover:bg-signal/90'
            }`}
          >
            {playMode === 'playing' ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} />}
            {playMode === 'idle' ? '播放' : playMode === 'playing' ? '暂停' : '继续'}
          </button>
          {playMode !== 'idle' && (
            <button
              type="button"
              onClick={stopPlayback}
              title="停止播放并复位"
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-edge/20 bg-surface-2 px-2 py-1 text-[13px] font-medium text-fg transition-colors hover:bg-surface-hover"
            >
              <Square size={15} strokeWidth={2} />
              停止
            </button>
          )}
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

      {/* 变量实时监视调试器已迁出为右侧可收拉 Dock（见 AppLayout），不再以浮层遮挡舞台核心按钮 */}

      {/* 舞台行：舞台视口（自适应等比缩放）+ 右侧立绘编辑面板（真实布局兄弟，绝不遮挡舞台） */}
      <div className="relative flex min-h-0 flex-1">
        {/* 自适应视口：外层主题灰 letterbox（非纯黑），内部画布按所选比例整块等比缩放 */}
        <div
          ref={fitWrapRef}
          className="relative flex flex-1 items-center justify-center overflow-hidden"
          style={{ background: 'radial-gradient(130% 130% at 50% 38%, rgb(var(--c-canvas)) 0%, rgb(var(--c-surface-1)) 100%)' }}
        >
        <div
          ref={stageRef}
          className="relative overflow-hidden bg-canvas shadow-2xl ring-1 ring-black/10"
          style={{ width: stageSize.w || undefined, height: stageSize.h || undefined }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDropOnStage}
          onClick={() => setSelectedCharId(null)}
        >
        {/* 背景层：contain 完整显示整张图，绝不截断；比例留白由画布底色（主题灰）填充，非纯黑。
            注意：必须用 <img src> 而非 CSS background-image——Electron 的 BrowserWindow 在 CSS
            上下文里对自定义 sw-asset:// 协议不渲染 background-image（请求会发出并 200，但画面空白）；
            <img src> 直读协议是铁律 1 下已验证可用的消费路径（与 PreviewStage 一致）。 */}
        <div className="absolute inset-0 bg-canvas">
          {hasBgImage && (
            <img
              src={bgDataUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full animate-fade-in object-contain object-center"
            />
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
        {!bgDataUrl && Object.keys(state?.characters ?? {}).length === 0 && (
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
        {Object.entries(state?.characters ?? {}).map(
          ([charId, char]: [string, ResolvedCharacterState]) => {
            const isTalking = speakingCharId === charId
            let spriteKey = char.asset_id ?? char.sprite_id
            // 表情联动：配音播放期间若角色有「说话」类表情，临时切换过去，结束后自动复原
            if (isTalking) {
              const cfg = char.char_id
                ? characterConfigs.find((c) => c.charId === char.char_id)
                : undefined
              const talkExpr = cfg?.expressions.find((e) => /talk|speak|say|mouth|说话|开口/i.test(e.id))
              if (talkExpr) spriteKey = talkExpr.assetId
            }
            const { dataUrl: spriteDataUrl, color: spriteColor } = resolveSpriteImage(
              spriteKey,
              assets,
              characterConfigs,
            )
            // 图片加载失败（素材缺失/404）→ 改用带角色名的色块占位，给出可见提示而非空白
            const spriteFailed = !!spriteDataUrl && spriteErrors.has(spriteKey)


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
                data-char={charId}
                onMouseDown={handleCharMouseDown(charId)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); setSelectedCharId(charId) }}
                onDragStart={(e) => e.preventDefault()}
                className={`group pointer-events-auto absolute flex w-max select-none cursor-grab flex-col items-center active:cursor-grabbing ${
                  dragging ? '' : 'transition-[left,top,transform] duration-200'
                } ${selected ? 'rounded-lg ring-2 ring-signal' : ''} ${isTalking ? 'sw-talking' : ''}`}
                // left/top 百分比相对舞台（父容器）定位立绘中心点；transform 仅做居中 translate(-50%,-50%)
                // + 缩放 scale，围绕中心点 origin。
                // 【关键·真凶修复】此 div 是 absolute 且宽度 auto，浏览器对它用 shrink-to-fit：
                // 可用宽度 = 舞台宽 − left，left 越大（越靠右）可用宽度越小 → div 被压缩 → 里面 w-auto 的
                // img 跟着变小，这才是「越往右越小」的真因（与 scale / overflow 无关）。
                // 加 w-max（width:max-content）让 div 按图片固有宽度渲染，彻底不受 left 位置约束。
                style={{
                  left: `${px * 100}%`,
                  top: `${py * 100}%`,
                  width: 'max-content',
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  transformOrigin: 'center center',
                  zIndex: dragging ? 1000 : Math.round((char.pos_x ?? SLOT_ANCHORS[char.position_slot]?.x ?? 0.5) * 10) + 10,
                }}
                title="拖动可移动位置；靠近站位的虚线会自动吸附，拉离即自由微调。双击打开右侧编辑面板（定点 / 缩放 / 锁定）。"
              >
                {spriteDataUrl && !spriteFailed ? (
                  <img
                    src={spriteDataUrl}
                    alt={getDisplayName(char.char_id ?? charId)}
                    draggable={false}
                    className="max-h-64 w-auto select-none object-contain drop-shadow-lg"
                    style={{ minHeight: '80px' }}
                    onError={() => markSpriteError(spriteKey)}
                    onLoad={() => {
                      if (spriteErrors.has(spriteKey)) {
                        setSpriteErrors((prev) => {
                          const next = new Set(prev)
                          next.delete(spriteKey)
                          return next
                        })
                      }
                    }}
                  />
                ) : (
                  <div
                    className={`flex w-16 flex-col items-center gap-1 rounded-t-lg px-3 pt-6 pb-3 shadow-lg ${spriteFailed ? 'ring-1 ring-danger/60' : ''}`}
                    style={{ backgroundColor: spriteColor, minHeight: '100px' }}
                    title={spriteFailed ? '素材文件缺失或加载失败，请在素材库重新导入该图片' : undefined}
                  >
                    <span className="text-center text-[12px] font-medium text-white/80">
                      {getDisplayName(char.char_id ?? charId)}
                    </span>
                    {spriteFailed ? (
                      <span className="text-center text-[11px] text-white/70">素材缺失</span>
                    ) : (
                      <span className="text-center text-[12px] text-white/50">
                        {char.sprite_id}
                      </span>
                    )}
                  </div>
                )}
                {/* 选中态：右上角显眼删除按钮，直接从舞台删除该立绘 */}
                {selected && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); deleteChar(charId) }}
                    className="absolute -top-2 -right-2 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-danger/60 bg-danger text-white shadow-lg transition-colors hover:bg-danger/90"
                    title="删除此立绘（Delete / Backspace）"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                )}
                {/* 标签脱离文档流（absolute），避免占位高度干扰脚底锚点定位精度 */}
                <div
                  className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 rounded px-1.5 text-center text-[12px] transition-colors ${
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
          {(() => {
            const bgN = state.background?.effects?.filter((e) => e.enabled).length ?? 0
            const chN = Object.values(state.characters).reduce(
              (n, c) => n + (c.effects?.filter((e) => e.enabled).length ?? 0),
              0,
            )
            const total = bgN + chN
            return total > 0 ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[12px] text-amber-300" title="本行已挂载的特效数量">
                ✦ 特效 {total}
              </span>
            ) : null
          })()}
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
        </div>

        {/* 选择支交互浮层（交互播放在 menu 处暂停时弹出，条件不满足的选项自动禁用） */}
        {pendingChoiceIndex !== null && (() => {
          const pc = draftDeltas[pendingChoiceIndex]
          if (!pc || pc.line_type !== 'choice') return null
          const choices = pc.choices ?? []
          return (
            <div className="absolute bottom-4 left-1/2 z-40 w-[min(680px,94%)] -translate-x-1/2 rounded-xl border border-signal/30 bg-surface/90 p-3 shadow-2 backdrop-blur-md">
              {pc.prompt && <p className="mb-2 text-center text-[13px] text-fg-muted">{pc.prompt}</p>}
              <div className="flex flex-col gap-2">
                {choices.map((c) => {
                  const ok = evalCondition(c.condition, runtimeValues)
                  return (
                    <button
                      key={c.uid}
                      disabled={!ok}
                      onClick={() => chooseOption(pendingChoiceIndex, c)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[14px] transition-colors ${
                        ok
                          ? 'border-edge/20 bg-surface-2 text-fg hover:border-signal hover:bg-signal/10'
                          : 'cursor-not-allowed border-edge/10 bg-surface-1 text-fg-faint opacity-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {c.text || '（空选项）'}
                        {c.ops && c.ops.length > 0 && <span className="text-[12px] text-fg-faint">$ {c.ops.length} 项</span>}
                      </span>
                      {c.condition && <span className="shrink-0 font-mono text-[12px] text-fg-faint">[{c.condition}]</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* 立绘编辑侧栏：单击选中立绘后常驻显示，真实布局兄弟占用空间，绝不遮挡舞台；
            滑块实时驱动立绘（位置 / 缩放）变化，所见即所得 */}
        {selectedCharId && state.characters[selectedCharId] && (
          <aside className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-l border-edge/12 bg-surface/95 p-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-fg">
                立绘编辑 · {getDisplayName(state.characters[selectedCharId]?.char_id ?? selectedCharId)}
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

            {/* 位置（与缩放完全解耦，面板滑块实时驱动舞台立绘，所见即所得） */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-fg-subtle">
                <span>位置 X</span>
                <span className="tabular-nums text-fg-muted">
                  {Math.round((state.characters[selectedCharId].pos_x ?? SLOT_ANCHORS[state.characters[selectedCharId].position_slot]?.x ?? 0.5) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.characters[selectedCharId].pos_x ?? SLOT_ANCHORS[state.characters[selectedCharId].position_slot]?.x ?? 0.5}
                onChange={(e) =>
                  setCharPos(
                    selectedCharId,
                    parseFloat(e.target.value),
                    state.characters[selectedCharId].pos_y ?? SLOT_ANCHORS[state.characters[selectedCharId].position_slot]?.y ?? SLOT_Y,
                  )
                }
                className="w-full accent-signal"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-fg-subtle">
                <span>位置 Y</span>
                <span className="tabular-nums text-fg-muted">
                  {Math.round((state.characters[selectedCharId].pos_y ?? SLOT_ANCHORS[state.characters[selectedCharId].position_slot]?.y ?? SLOT_Y) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.characters[selectedCharId].pos_y ?? SLOT_ANCHORS[state.characters[selectedCharId].position_slot]?.y ?? SLOT_Y}
                onChange={(e) =>
                  setCharPos(
                    selectedCharId,
                    state.characters[selectedCharId].pos_x ?? SLOT_ANCHORS[state.characters[selectedCharId].position_slot]?.x ?? 0.5,
                    parseFloat(e.target.value),
                  )
                }
                className="w-full accent-signal"
              />
            </div>

            {/* 立绘特效挂载（时间轴 → 特效大本营 闭环） */}
            <div className="border-t border-edge/10 pt-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
                <Sparkles size={12} strokeWidth={1.75} className="text-signal" />
                立绘特效
              </div>
              <EffectMountPanel
                scope="sprite"
                effects={state.characters[selectedCharId].effects ?? []}
                onChange={(next) => setCharEffects(selectedCharId, next)}
              />
            </div>
          </aside>
        )}

        {/* 背景特效挂载面板：当前行有背景即常驻（与立绘面板并列，互不遮挡） */}
        {state.background && (
          <aside className="flex w-52 shrink-0 flex-col gap-2 overflow-y-auto border-l border-edge/12 bg-surface/95 p-3 shadow-xl">
            <div className="flex items-center gap-1.5">
              <ImageIcon size={13} strokeWidth={1.75} className="text-signal" />
              <span className="text-[12px] font-semibold text-fg">背景特效</span>
            </div>
            <p className="text-[11px] leading-relaxed text-fg-faint">应用到本行背景的演出特效。</p>
            <EffectMountPanel
              scope="background"
              effects={state.background.effects ?? []}
              onChange={(next) => setBgEffects(next)}
            />
          </aside>
        )}
      </div>
    </main>
  )
}
