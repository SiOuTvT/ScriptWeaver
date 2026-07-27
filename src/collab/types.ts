/**
 * 协作模块类型定义 - v1.0.0
 * 公网 P2P 多人协同 + 编辑锁 + 审计日志
 */

import type { LineDelta, AssetItem, CharacterConfig, GlobalVariable } from '@/core/types'

export type CollabRole = 'host' | 'guest' | 'none'
export type PeerPermission = 'edit' | 'view'

export interface RemotePeerInfo {
  id: string
  displayName: string
  permission: PeerPermission
  connectedAt: number
}

export interface BlockLock {
  lineIndex: number
  peerId: string
  displayName: string
  lockedAt: number
}

export type AuditAction =
  | 'join'
  | 'leave'
  | 'modify_dialogue'
  | 'modify_background'
  | 'modify_character'
  | 'modify_audio'
  | 'add_line'
  | 'delete_line'
  | 'move_line'
  | 'add_asset'
  | 'delete_asset'
  | 'add_character'
  | 'delete_character'
  | 'modify_choice'
  | 'modify_label'
  | 'permission_change'
  | 'kick'

export interface AuditLogEntry {
  id: string
  timestamp: number
  peerId: string
  displayName: string
  role: 'HOST' | 'GUEST'
  action: AuditAction
  target?: string
  detail?: string
  severity: 'info' | 'warning' | 'danger'
}

// ---- Data Channel Messages ----

export type CollabMessage =
  | { type: 'handshake'; role: CollabRole; displayName: string; peerId: string }
  | { type: 'handshake_ack'; role: CollabRole; displayName: string; peerId: string; state?: CollabFullState }
  | { type: 'full_sync'; state: CollabFullState }
  | { type: 'delta_set'; index: number; delta: LineDelta; fromPeerId: string }
  | { type: 'delta_insert'; index: number; delta: LineDelta; fromPeerId: string }
  | { type: 'delta_delete'; index: number; fromPeerId: string }
  | { type: 'delta_move'; fromIndex: number; toIndex: number; fromPeerId: string }
  | { type: 'asset_add'; asset: AssetItem; fromPeerId: string }
  | { type: 'asset_delete'; assetId: string; fromPeerId: string }
  | { type: 'character_add'; config: CharacterConfig; fromPeerId: string }
  | { type: 'character_update'; charId: string; patch: Partial<CharacterConfig>; fromPeerId: string }
  | { type: 'character_delete'; charId: string; fromPeerId: string }
  | { type: 'variable_add'; variable: GlobalVariable; fromPeerId: string }
  | { type: 'variable_update'; name: string; patch: Partial<GlobalVariable>; fromPeerId: string }
  | { type: 'variable_delete'; name: string; fromPeerId: string }
  | { type: 'block_lock'; lineIndex: number; peerId: string; displayName: string }
  | { type: 'block_unlock'; lineIndex: number; peerId: string }
  | { type: 'permission_set'; targetPeerId: string; permission: PeerPermission; fromPeerId: string }
  | { type: 'kick'; targetPeerId: string; fromPeerId: string }
  | { type: 'audit_sync'; entry: AuditLogEntry }
  | { type: 'deltas_sync'; deltas: LineDelta[]; fromPeerId: string }
  | { type: 'peer_left_notice'; peerId: string }

export interface CollabFullState {
  deltas: LineDelta[]
  assets: AssetItem[]
  characters: CharacterConfig[]
  variables: GlobalVariable[]
}
