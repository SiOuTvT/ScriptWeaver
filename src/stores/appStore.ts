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

export type NavItemId = 'chapters' | 'assets' | 'characters' | 'export' | 'ai'

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
    const now = new Date().toISOString()
    const character: CharacterConfig = { ...config, createdAt: now, updatedAt: now }
    set((s) => ({ characterConfigs: [...s.characterConfigs, character] }))
  },

  updateCharacter: (charId, patch) => {
    set((s) => ({
      characterConfigs: s.characterConfigs.map((c) =>
        c.charId === charId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
      ),
    }))
  },

  deleteCharacter: (charId) => {
    set((s) => ({
      characterConfigs: s.characterConfigs.filter((c) => c.charId !== charId),
    }))
  },

  getCharacter: (charId) => {
    return get().characterConfigs.find((c) => c.charId === charId)
  },

  // ===== 素材 CRUD =====
  addAsset: (asset) => {
    set((s) => ({ assets: [...s.assets, asset] }))
  },

  updateAsset: (id, patch) => {
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }))
  },

  deleteAsset: (id) => {
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }))
  },

  getAsset: (id) => {
    return get().assets.find((a) => a.id === id)
  },

  // ===== 项目操作 =====
  newProject: () => {
    const empty: LineDelta[] = []
    set({
      draftDeltas: empty,
      resolvedStates: reduceLines(empty),
      assets: [],
      characterConfigs: [],
      projectRoot: null,
      selectedLineIndex: 0,
    })
  },

  setDraftDeltas: (deltas) => {
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
    })
  },

  setProjectRoot: (root) => set({ projectRoot: root }),
  setAssets: (assets) => set({ assets }),
  setCharacterConfigs: (configs) => set({ characterConfigs: configs }),

  updateDeltaAt: (index, updater) => {
    const deltas = [...get().draftDeltas]
    if (index < 0 || index >= deltas.length) return
    deltas[index] = updater(deltas[index])
    set({ draftDeltas: deltas, resolvedStates: reduceLines(deltas) })
  },

  batchUpdateDeltas: (updates) => {
    if (updates.length === 0) return
    const deltas = [...get().draftDeltas]
    for (const { index, updater } of updates) {
      if (index < 0 || index >= deltas.length) continue
      deltas[index] = updater(deltas[index])
    }
    set({ draftDeltas: deltas, resolvedStates: reduceLines(deltas) })
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
}))
