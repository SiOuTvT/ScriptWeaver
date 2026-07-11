import { create } from 'zustand'
import type { LineDelta, ResolvedLineState } from '@/core/types'
import { reduceLines } from '@/core/reducer'
import { MOCK_DELTAS } from '@/data/mockDeltas'

interface AppState {
  // ---- 数据 ----
  draftDeltas: LineDelta[]
  resolvedStates: ResolvedLineState[]

  // ---- 选中 ----
  selectedLineIndex: number

  // ---- 左侧边栏 ----
  leftSidebarCollapsed: boolean
  activeNavItem: 'chapters' | 'characters' | 'export' | 'ai' | null

  // ---- 素材库 ----
  assetTab: 'background' | 'sprite' | 'audio'

  // ---- 剧本抽屉 ----
  scriptDrawerOpen: boolean
  scriptDrawerPinned: boolean

  // ---- 操作 ----
  setDraftDeltas: (deltas: LineDelta[]) => void
  /** 以不可变方式更新第 index 行 Delta，自动重算 resolvedStates */
  updateDeltaAt: (index: number, updater: (prev: LineDelta) => LineDelta) => void
  selectLine: (index: number) => void
  toggleLeftSidebar: () => void
  setActiveNavItem: (item: AppState['activeNavItem']) => void
  setAssetTab: (tab: AppState['assetTab']) => void
  toggleScriptDrawer: () => void
  toggleScriptDrawerPin: () => void
  setScriptDrawerOpen: (open: boolean) => void
  getResolvedState: (index: number) => ResolvedLineState | null
}

export const useAppStore = create<AppState>((set, get) => ({
  // ---- 数据（初始化载入 mock） ----
  draftDeltas: MOCK_DELTAS,
  resolvedStates: reduceLines(MOCK_DELTAS),

  // ---- 选中 ----
  selectedLineIndex: 0,

  // ---- 左侧边栏 ----
  leftSidebarCollapsed: false,
  activeNavItem: 'chapters',

  // ---- 素材库 ----
  assetTab: 'background',

  // ---- 剧本抽屉 ----
  scriptDrawerOpen: false,
  scriptDrawerPinned: false,

  // ---- 操作 ----
  setDraftDeltas: (deltas) => {
    set({ draftDeltas: deltas, resolvedStates: reduceLines(deltas) })
  },

  updateDeltaAt: (index, updater) => {
    const deltas = [...get().draftDeltas]
    if (index < 0 || index >= deltas.length) return
    deltas[index] = updater(deltas[index])
    set({ draftDeltas: deltas, resolvedStates: reduceLines(deltas) })
  },

  selectLine: (index) => set({ selectedLineIndex: index }),

  toggleLeftSidebar: () =>
    set((s) => ({ leftSidebarCollapsed: !s.leftSidebarCollapsed })),

  setActiveNavItem: (item) => set({ activeNavItem: item }),

  setAssetTab: (tab) => set({ assetTab: tab }),

  toggleScriptDrawer: () =>
    set((s) => {
      if (s.scriptDrawerPinned) return {} // 钉住时不能关闭
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
}))
