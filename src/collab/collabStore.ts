/**
 * 协作状态管理 (Zustand Store)
 * 管理连接状态、Peer 列表、编辑锁、审计日志
 */

import { create } from 'zustand'
import type { CollabRole, PeerPermission, RemotePeerInfo, BlockLock, AuditLogEntry } from './types'

// ---- 连接状态 ----
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface CollabState {
  // 连接
  status: ConnectionStatus
  role: CollabRole
  peerId: string
  displayName: string
  inviteCode: string  // Host 的 peer ID = 邀请码
  error: string | null

  // Peer 列表
  peers: RemotePeerInfo[]

  // 编辑锁 (lineIndex -> lock)
  locks: Map<number, BlockLock>

  // 本地用户是否在编辑某行 (用于防止双向触发)
  localEditingLine: number | null

  // 审计日志
  auditLogs: AuditLogEntry[]

  // 本地 Peer 名称缓存 (key: peer displayName)
  myName: string

  // 本端权限（Guest 被 Host 设为 view 后本地禁写）
  myPermission: PeerPermission

  // ---- Actions ----
  setStatus: (s: ConnectionStatus) => void
  setRole: (r: CollabRole) => void
  setPeerId: (id: string) => void
  setDisplayName: (n: string) => void
  setInviteCode: (c: string) => void
  setError: (e: string | null) => void

  addPeer: (p: RemotePeerInfo) => void
  removePeer: (peerId: string) => void
  setPeerPermission: (peerId: string, p: PeerPermission) => void

  addLock: (lock: BlockLock) => void
  removeLock: (lineIndex: number) => void
  setLocalEditingLine: (lineIndex: number | null) => void
  setMyPermission: (p: PeerPermission) => void

  addAuditLog: (entry: AuditLogEntry) => void
  clearAuditLogs: () => void

  reset: () => void
}

export const useCollabStore = create<CollabState>((set, get) => ({
  status: 'disconnected',
  role: 'none',
  peerId: '',
  displayName: '',
  inviteCode: '',
  error: null,
  peers: [],
  locks: new Map(),
  localEditingLine: null,
  auditLogs: [],
  myName: (typeof localStorage !== 'undefined' && localStorage.getItem('sw-collab-name')) || '',
  myPermission: 'edit',

  setStatus: (s) => set({ status: s }),
  setRole: (r) => set({ role: r }),
  setPeerId: (id) => set({ peerId: id }),
  setDisplayName: (n) => set({ displayName: n }),
  setInviteCode: (c) => set({ inviteCode: c }),
  setError: (e) => set({ error: e }),

  addPeer: (p) => set((s) => {
    const existing = s.peers.find((x) => x.id === p.id)
    if (existing) {
      return { peers: s.peers.map((x) => x.id === p.id ? p : x) }
    }
    return { peers: [...s.peers, p] }
  }),

  removePeer: (peerId) => set((s) => ({
    peers: s.peers.filter((x) => x.id !== peerId),
    // 清理该 Peer 的所有锁
    locks: new Map([...s.locks].filter(([, l]) => l.peerId !== peerId)),
  })),

  setPeerPermission: (peerId, permission) => set((s) => ({
    peers: s.peers.map((p) => p.id === peerId ? { ...p, permission } : p),
  })),

  addLock: (lock) => set((s) => {
    const next = new Map(s.locks)
    next.set(lock.lineIndex, lock)
    return { locks: next }
  }),

  removeLock: (lineIndex) => set((s) => {
    const next = new Map(s.locks)
    next.delete(lineIndex)
    return { locks: next }
  }),

  setLocalEditingLine: (lineIndex) => set({ localEditingLine: lineIndex }),

  setMyPermission: (p) => set({ myPermission: p }),

  addAuditLog: (entry) => set((s) => ({
    auditLogs: [...s.auditLogs.slice(-499), entry],
  })),

  clearAuditLogs: () => set({ auditLogs: [] }),

  reset: () => set({
    status: 'disconnected',
    role: 'none',
    peerId: '',
    inviteCode: '',
    error: null,
    peers: [],
    locks: new Map(),
    localEditingLine: null,
    auditLogs: [],
    myPermission: 'edit',
  }),
}))
