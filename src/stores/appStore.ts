import { create } from 'zustand'
import type { LineDelta, ResolvedLineState, AssetItem, CharacterConfig } from '@/core/types'
import { reduceLines } from '@/core/reducer'
import { MOCK_DELTAS, MOCK_ASSETS, MOCK_CHARACTERS } from '@/data/mockDeltas'

// 生成唯一 ID
let _uidCounter = 0
function uid(prefix = 'id'): string {
  _uidCounter++
  return `${prefix}_${Date.now()}_${_uidCounter}`
}

/** 根据已有 deltas 生成下一个行号 line_id（L1, L2, ...） */
function nextLineId(deltas: LineDelta[]): string {
  let maxNum = 0
  for (const d of deltas) {
    const match = d.line_id.match(/^L(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > maxNum) maxNum = n
    }
  }
  return `L${maxNum + 1}`
}

/** 创建一行空白 Delta */
function createEmptyDelta(nextId: string): LineDelta {
  return {
    line_id: nextId,
    speaker: null,
    dialogue: '',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
  }
}

// ==================== 撤销/重做 快照 ====================

interface HistorySnapshot {
  draftDeltas: LineDelta[]
  assets: AssetItem[]
  characterConfigs: CharacterConfig[]
  selectedLineIndex: number
}

const MAX_HISTORY = 50

export type NavItemId = 'chapters' | 'assets' | 'characters' | 'export' | 'ai' | 'script-overview'

interface AppState {
  // ---- 数据 ----
  draftDeltas: LineDelta[]
  resolvedStates: ResolvedLineState[]
  /** 素材库 */
  assets: AssetItem[]
  /** 角色配置 */
  characterConfigs: CharacterConfig[]
  /** 当前项目根目录（.swproj 所在目录），null = 尚未保存 */
  projectRoot: string | null

  // ---- 选中 ----
  selectedLineIndex: number

  // ---- 左侧边栏 ----
  leftSidebarCollapsed: boolean
  activeNavItem: NavItemId | null

  // ---- 剧本抽屉 ----
  scriptDrawerOpen: boolean
  scriptDrawerPinned: boolean

  // ===== 角色 CRUD =====
  addCharacter: (config: Omit<CharacterConfig, 'createdAt' | 'updatedAt'>) => void
  updateCharacter: (charId: string, patch: Partial<CharacterConfig>) => void
  deleteCharacter: (charId: string) => void
  getCharacter: (charId: string) => CharacterConfig | undefined

  // ===== 素材 CRUD =====
  addAsset: (asset: AssetItem) => void
  updateAsset: (id: string, patch: Partial<AssetItem>) => void
  deleteAsset: (id: string) => void
  getAsset: (id: string) => AssetItem | undefined

  // ===== 项目操作 =====
  /** 新建空白项目（清空所有数据） */
  newProject: () => void
  setDraftDeltas: (deltas: LineDelta[]) => void
  /** 一次性设置所有项目数据（用于打开项目） */
  loadProjectData: (data: {
    deltas: LineDelta[]
    assets: AssetItem[]
    characterConfigs: CharacterConfig[]
    projectRoot: string | null
  }) => void
  setProjectRoot: (root: string | null) => void
  setAssets: (assets: AssetItem[]) => void
  setCharacterConfigs: (configs: CharacterConfig[]) => void

  /** 以不可变方式更新第 index 行 Delta */
  updateDeltaAt: (index: number, updater: (prev: LineDelta) => LineDelta) => void
  batchUpdateDeltas: (updates: { index: number; updater: (prev: LineDelta) => LineDelta }[]) => void

  /** 行管理：插入 / 删除 / 移动 */
  insertDeltaAt: (index: number, delta?: LineDelta) => void
  deleteDeltaAt: (index: number) => void
  moveDelta: (fromIndex: number, toIndex: number) => void

  selectLine: (index: number) => void
  toggleLeftSidebar: () => void
  setActiveNavItem: (item: AppState['activeNavItem']) => void
  toggleScriptDrawer: () => void
  toggleScriptDrawerPin: () => void
  setScriptDrawerOpen: (open: boolean) => void
  getResolvedState: (index: number) => ResolvedLineState | null

  /** 根据 charId 获取角色显示名 */
  getDisplayName: (charId: string) => string
  /** 根据 charId + 表情 ID 获取对应的素材 */
  getCharacterSprite: (charId: string, expressionId: string) => AssetItem | undefined

  // ===== 撤销/重做 =====
  _history: HistorySnapshot[]
  _future: HistorySnapshot[]
  _pushHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  // ---- 数据（初始化载入 mock） ----
  draftDeltas: MOCK_DELTAS,
  resolvedStates: reduceLines(MOCK_DELTAS),
  assets: MOCK_ASSETS,
  characterConfigs: MOCK_CHARACTERS,
  projectRoot: null,

  // ---- 选中 ----
  selectedLineIndex: 0,

  // ---- 左侧边栏 ----
  leftSidebarCollapsed: false,
  activeNavItem: 'chapters',

  // ---- 剧本抽屉 ----
  scriptDrawerOpen: false,
  scriptDrawerPinned: false,

  // ===== 角色 CRUD =====
  addCharacter: (config) => {
    get()._pushHistory()
    const now = new Date().toISOString()
    const character: CharacterConfig = { ...config, createdAt: now, updatedAt: now }
    set((s) => ({ characterConfigs: [...s.characterConfigs, character] }))
  },

  updateCharacter: (charId, patch) => {
    get()._pushHistory()
    set((s) => ({
      characterConfigs: s.characterConfigs.map((c) =>
        c.charId === charId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
      ),
    }))
  },

  deleteCharacter: (charId) => {
    get()._pushHistory()
    // 级联清理 Delta 中对被删角色的引用
    const deltas = get().draftDeltas.map((d) => {
      let changed = false
      const next = { ...d }

      // 清除说话人（如果匹配该角色 displayName 或 charId）
      const char = get().characterConfigs.find((c) => c.charId === charId)
      const displayToMatch = char?.displayName
      if (next.speaker === displayToMatch || next.speaker === charId) {
        next.speaker = null
        changed = true
      }

      // 清除角色指令
      if (next.characters && next.characters[charId]) {
        next.characters = { ...next.characters }
        delete next.characters[charId]
        changed = true
      }

      return changed ? next : d
    })
    set((s) => ({
      characterConfigs: s.characterConfigs.filter((c) => c.charId !== charId),
      draftDeltas: deltas,
      resolvedStates: reduceLines(deltas),
    }))
  },

  getCharacter: (charId) => {
    return get().characterConfigs.find((c) => c.charId === charId)
  },

  // ===== 素材 CRUD =====
  addAsset: (asset) => {
    get()._pushHistory()
    set((s) => ({ assets: [...s.assets, asset] }))
  },

  updateAsset: (id, patch) => {
    get()._pushHistory()
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }))
  },

  deleteAsset: (id) => {
    get()._pushHistory()
    // 级联清理 Delta 中对被删素材的引用
    const deltas = get().draftDeltas.map((d) => {
      let changed = false
      const next = { ...d }

      // 背景引用
      if (next.background?.asset_id === id) {
        next.background = null
        changed = true
      }

      // 角色 expressions 通过 assetId 引用，这里检查的是角色 sprite_id 情况不直接引用 asset id
      // 但 characters 中有可能通过表情间接引用（已被 deleteCharacter 处理），这里不做额外清理

      // 音频引用
      if (next.audio) {
        const audio = { ...next.audio, se: [...next.audio.se], voice: next.audio.voice }
        if (audio.bgm && typeof audio.bgm !== 'string' && audio.bgm.asset_id === id) {
          audio.bgm = null
          changed = true
        }
        if (audio.ambient && typeof audio.ambient !== 'string' && audio.ambient.asset_id === id) {
          audio.ambient = null
          changed = true
        }
        if (audio.se.includes(id)) {
          audio.se = audio.se.filter((s) => s !== id)
          changed = true
        }
        if (audio.voice === id) {
          audio.voice = null
          changed = true
        }
        if (changed) next.audio = audio
      }

      return changed ? next : d
    })
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      draftDeltas: deltas,
      resolvedStates: reduceLines(deltas),
    }))
  },

  getAsset: (id) => {
    return get().assets.find((a) => a.id === id)
  },

  // ===== 项目操作 =====
  newProject: () => {
    get()._pushHistory()
    const empty: LineDelta[] = []
    set({
      draftDeltas: empty,
      resolvedStates: reduceLines(empty),
      assets: [],
      characterConfigs: [],
      projectRoot: null,
      selectedLineIndex: 0,
      _history: [],
      _future: [],
    })
  },

  setDraftDeltas: (deltas) => {
    get()._pushHistory()
    set({ draftDeltas: deltas, resolvedStates: reduceLines(deltas) })
  },

  loadProjectData: (data) => {
    set({
      draftDeltas: data.deltas,
      resolvedStates: reduceLines(data.deltas),
      assets: data.assets,
      characterConfigs: data.characterConfigs,
      projectRoot: data.projectRoot,
      selectedLineIndex: 0,
      _history: [],
      _future: [],
    })
  },

  setProjectRoot: (root) => set({ projectRoot: root }),

  setAssets: (assets) => {
    get()._pushHistory()
    set({ assets })
  },
  setCharacterConfigs: (configs) => {
    get()._pushHistory()
    set({ characterConfigs: configs })
  },

  updateDeltaAt: (index, updater) => {
    get()._pushHistory()
    const deltas = [...get().draftDeltas]
    if (index < 0 || index >= deltas.length) return
    deltas[index] = updater(deltas[index])
    set({ draftDeltas: deltas, resolvedStates: reduceLines(deltas) })
  },

  batchUpdateDeltas: (updates) => {
    if (updates.length === 0) return
    get()._pushHistory()
    const deltas = [...get().draftDeltas]
    for (const { index, updater } of updates) {
      if (index < 0 || index >= deltas.length) continue
      deltas[index] = updater(deltas[index])
    }
    set({ draftDeltas: deltas, resolvedStates: reduceLines(deltas) })
  },

  // ===== 行管理 =====

  insertDeltaAt: (index, delta) => {
    get()._pushHistory()
    const deltas = [...get().draftDeltas]
    const clamped = Math.max(0, Math.min(deltas.length, index))
    const newDelta = delta ?? createEmptyDelta(nextLineId(deltas))
    deltas.splice(clamped, 0, newDelta)
    const newIndex = clamped
    set({
      draftDeltas: deltas,
      resolvedStates: reduceLines(deltas),
      selectedLineIndex: newIndex,
    })
  },

  deleteDeltaAt: (index) => {
    get()._pushHistory()
    const deltas = [...get().draftDeltas]
    if (deltas.length <= 1 || index < 0 || index >= deltas.length) return
    deltas.splice(index, 1)
    const prev = get().selectedLineIndex
    const newIndex = prev >= deltas.length ? deltas.length - 1 : Math.min(prev, deltas.length - 1)
    set({
      draftDeltas: deltas,
      resolvedStates: reduceLines(deltas),
      selectedLineIndex: newIndex,
    })
  },

  moveDelta: (fromIndex, toIndex) => {
    get()._pushHistory()
    const deltas = [...get().draftDeltas]
    if (fromIndex < 0 || fromIndex >= deltas.length) return
    if (toIndex < 0 || toIndex >= deltas.length) return
    if (fromIndex === toIndex) return
    const [removed] = deltas.splice(fromIndex, 1)
    deltas.splice(toIndex, 0, removed)
    set({
      draftDeltas: deltas,
      resolvedStates: reduceLines(deltas),
      selectedLineIndex: toIndex,
    })
  },

  selectLine: (index) => set({ selectedLineIndex: index }),

  toggleLeftSidebar: () =>
    set((s) => ({ leftSidebarCollapsed: !s.leftSidebarCollapsed })),

  setActiveNavItem: (item) => set({ activeNavItem: item }),

  toggleScriptDrawer: () =>
    set((s) => {
      if (s.scriptDrawerPinned) return {}
      return { scriptDrawerOpen: !s.scriptDrawerOpen }
    }),

  toggleScriptDrawerPin: () =>
    set((s) => {
      const newPinned = !s.scriptDrawerPinned
      return {
        scriptDrawerPinned: newPinned,
        scriptDrawerOpen: newPinned ? true : s.scriptDrawerOpen,
      }
    }),

  setScriptDrawerOpen: (open) => set({ scriptDrawerOpen: open }),

  getResolvedState: (index) => {
    const states = get().resolvedStates
    return states[index] ?? null
  },

  getDisplayName: (charId) => {
    const char = get().characterConfigs.find((c) => c.charId === charId)
    return char?.displayName ?? charId
  },

  getCharacterSprite: (charId, expressionId) => {
    const char = get().characterConfigs.find((c) => c.charId === charId)
    if (!char) return undefined
    const expr = char.expressions.find((e) => e.id === expressionId)
    if (!expr) return undefined
    return get().assets.find((a) => a.id === expr.assetId)
  },

  // ===== 撤销/重做 =====
  _history: [],
  _future: [],

  _pushHistory: () => {
    const s = get()
    const snap: HistorySnapshot = {
      draftDeltas: structuredClone(s.draftDeltas),
      assets: structuredClone(s.assets),
      characterConfigs: structuredClone(s.characterConfigs),
      selectedLineIndex: s.selectedLineIndex,
    }
    set((st) => ({
      _history: [...st._history.slice(-MAX_HISTORY + 1), snap],
      _future: [],
    }))
  },

  undo: () => {
    const s = get()
    if (s._history.length === 0) return
    const prev = s._history[s._history.length - 1]
    const current: HistorySnapshot = {
      draftDeltas: structuredClone(s.draftDeltas),
      assets: structuredClone(s.assets),
      characterConfigs: structuredClone(s.characterConfigs),
      selectedLineIndex: s.selectedLineIndex,
    }
    set({
      draftDeltas: prev.draftDeltas,
      resolvedStates: reduceLines(prev.draftDeltas),
      assets: prev.assets,
      characterConfigs: prev.characterConfigs,
      selectedLineIndex: prev.selectedLineIndex,
      _history: s._history.slice(0, -1),
      _future: [...s._future, current],
    })
  },

  redo: () => {
    const s = get()
    if (s._future.length === 0) return
    const next = s._future[s._future.length - 1]
    const current: HistorySnapshot = {
      draftDeltas: structuredClone(s.draftDeltas),
      assets: structuredClone(s.assets),
      characterConfigs: structuredClone(s.characterConfigs),
      selectedLineIndex: s.selectedLineIndex,
    }
    set({
      draftDeltas: next.draftDeltas,
      resolvedStates: reduceLines(next.draftDeltas),
      assets: next.assets,
      characterConfigs: next.characterConfigs,
      selectedLineIndex: next.selectedLineIndex,
      _future: s._future.slice(0, -1),
      _history: [...s._history, current],
    })
  },

  canUndo: () => get()._history.length > 0,
  canRedo: () => get()._future.length > 0,
}))
