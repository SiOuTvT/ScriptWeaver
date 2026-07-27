/**
 * collabBridge - 协作桥接层（模块级单例，不依赖任何 React 组件挂载）
 *
 * 职责：
 * 1. 本地编辑 → 差量广播：订阅 appStore，diff 出变化并广播给协作方
 * 2. 远端消息 → 本地应用：旁路撤销栈（不污染 _history），并抑制回声广播
 * 3. Host 星型中继：Guest 的编辑经 Host 转发给其他 Guest（含权限拦截）
 * 4. 编辑锁：本地选中行变化时自动 lock/unlock 并广播
 * 5. 审计日志：对每个网络同步的操作生成标准化日志并全网同步
 */

import { CollabManager, type CollabEvent } from './CollabManager'
import { useCollabStore } from './collabStore'
import { useAppStore } from '@/stores/appStore'
import { reduceLines, normalizeDelta } from '@/core/reducer'
import type { LineDelta } from '@/core/types'
import type { AuditAction, AuditLogEntry, CollabMessage, CollabFullState } from './types'

// ---- 单例 ----
let manager: CollabManager | null = null

/** 正在应用远端修改（抑制本地 diff 广播，防回声循环） */
let applyingRemote = false
/** 上一次广播时的 deltas 快照（用于 diff） */
let lastDeltas: LineDelta[] | null = null
/** appStore 订阅解绑 */
let unsubscribeStore: (() => void) | null = null
/** collab 事件解绑 */
let unsubscribeEvents: (() => void) | null = null
/** 编辑锁：上一次锁定的行 */
let lastLockedLine: number | null = null
/** diff 广播节流计时器 */
let diffTimer: ReturnType<typeof setTimeout> | null = null

let _logId = 0
function makeLogId(): string {
  return `log_${Date.now()}_${++_logId}`
}

export function getCollabManager(): CollabManager {
  if (!manager) manager = new CollabManager()
  return manager
}

// ============================================================
// 审计日志
// ============================================================

const DANGER_ACTIONS: ReadonlySet<AuditAction> = new Set([
  'delete_line', 'delete_asset', 'delete_character', 'kick',
])
const WARNING_ACTIONS: ReadonlySet<AuditAction> = new Set([
  'move_line', 'permission_change',
])

/** 记录一条本地产生的审计日志并同步全网 */
export function recordAudit(action: AuditAction, target?: string, detail?: string): void {
  const cs = useCollabStore.getState()
  if (cs.status !== 'connected') return
  const entry: AuditLogEntry = {
    id: makeLogId(),
    timestamp: Date.now(),
    peerId: cs.peerId,
    displayName: cs.displayName || (cs.role === 'host' ? '主机' : '协作者'),
    role: cs.role === 'host' ? 'HOST' : 'GUEST',
    action,
    target,
    detail,
    severity: DANGER_ACTIONS.has(action) ? 'danger' : WARNING_ACTIONS.has(action) ? 'warning' : 'info',
  }
  cs.addAuditLog(entry)
  manager?.syncAuditLog(entry)
}

/** 记录远端 Peer 的行为（本地生成，不再向外同步，避免风暴） */
function recordRemoteAudit(peerId: string, action: AuditAction, target?: string, detail?: string): void {
  const cs = useCollabStore.getState()
  const peer = cs.peers.find((p) => p.id === peerId)
  const entry: AuditLogEntry = {
    id: makeLogId(),
    timestamp: Date.now(),
    peerId,
    displayName: peer?.displayName || '协作者',
    role: 'GUEST',
    action,
    target,
    detail,
    severity: DANGER_ACTIONS.has(action) ? 'danger' : WARNING_ACTIONS.has(action) ? 'warning' : 'info',
  }
  cs.addAuditLog(entry)
}

// ============================================================
// 远端应用（旁路撤销栈）
// ============================================================

/** 直接写 draftDeltas，不进撤销栈，不触发广播（旁路 setDraftDeltas 的 _pushHistory） */
function applyRemoteDeltas(next: LineDelta[]): void {
  applyingRemote = true
  try {
    const sel = useAppStore.getState().selectedLineIndex
    useAppStore.setState({
      draftDeltas: next,
      resolvedStates: reduceLines(next),
      // 边界防护：选中行越界时收拢
      selectedLineIndex: sel >= next.length ? Math.max(0, next.length - 1) : sel,
    })
  } finally {
    lastDeltas = useAppStore.getState().draftDeltas
    applyingRemote = false
  }
}

// ============================================================
// 本地 diff → 广播
// ============================================================

/** 对比新旧 deltas，产出最小差量消息（简化版：单行改/插/删/移，否则全量） */
function diffAndBroadcast(prev: LineDelta[], next: LineDelta[]): void {
  if (!manager) return
  const cs = useCollabStore.getState()
  const myId = cs.peerId

  // 权限强制：仅查看的 Guest 本地编辑直接回滚，防止与主机静默分叉
  if (cs.role === 'guest' && cs.myPermission === 'view') {
    applyRemoteDeltas(prev)
    cs.setError('仅限查看模式：修改已被撤销')
    return
  }

  if (prev.length === next.length) {
    // 找出所有变化行
    const changed: number[] = []
    for (let i = 0; i < next.length; i++) {
      if (prev[i] !== next[i]) changed.push(i)
    }
    if (changed.length === 0) return
    if (changed.length <= 3) {
      for (const i of changed) {
        manager.broadcast({ type: 'delta_set', index: i, delta: next[i], fromPeerId: myId })
        auditForLineChange(prev[i], next[i], i)
      }
      return
    }
    // 变化过多 → 全量
    manager.broadcast({ type: 'deltas_sync', deltas: next, fromPeerId: myId })
    recordAudit('modify_dialogue', undefined, `批量修改 ${changed.length} 行`)
    return
  }

  if (next.length === prev.length + 1) {
    // 插入：找第一处分歧
    let i = 0
    while (i < prev.length && prev[i] === next[i]) i++
    // 校验剩余部分对齐
    let aligned = true
    for (let j = i; j < prev.length; j++) {
      if (prev[j] !== next[j + 1]) { aligned = false; break }
    }
    if (aligned) {
      manager.broadcast({ type: 'delta_insert', index: i, delta: next[i], fromPeerId: myId })
      recordAudit('add_line', `行 ${next[i].line_id}`, `在第 ${i + 1} 行插入`)
      return
    }
  }

  if (next.length === prev.length - 1) {
    // 删除
    let i = 0
    while (i < next.length && prev[i] === next[i]) i++
    let aligned = true
    for (let j = i; j < next.length; j++) {
      if (prev[j + 1] !== next[j]) { aligned = false; break }
    }
    if (aligned) {
      manager.broadcast({ type: 'delta_delete', index: i, fromPeerId: myId })
      recordAudit('delete_line', `行 ${prev[i].line_id}`, `删除第 ${i + 1} 行`)
      return
    }
  }

  // 其他复杂变化（移动/批量）→ 全量同步兜底
  manager.broadcast({ type: 'deltas_sync', deltas: next, fromPeerId: myId })
  recordAudit('move_line', undefined, `剧本结构调整（${prev.length} → ${next.length} 行）`)
}

/** 针对单行变化生成更精确的审计动作 */
function auditForLineChange(prev: LineDelta, next: LineDelta, index: number): void {
  const target = `行 ${next.line_id}`
  if (prev.dialogue !== next.dialogue || prev.speaker !== next.speaker) {
    recordAudit('modify_dialogue', target, `第 ${index + 1} 行台词变更`)
  } else if (prev.background !== next.background) {
    recordAudit('modify_background', target, `第 ${index + 1} 行背景变更`)
  } else if (prev.characters !== next.characters) {
    recordAudit('modify_character', target, `第 ${index + 1} 行立绘变更`)
  } else if (prev.audio !== next.audio) {
    recordAudit('modify_audio', target, `第 ${index + 1} 行音频变更`)
  } else if (prev.choices !== next.choices || prev.prompt !== next.prompt) {
    recordAudit('modify_choice', target, `第 ${index + 1} 行选择支变更`)
  } else if (prev.label !== next.label) {
    recordAudit('modify_label', target, `第 ${index + 1} 行标签变更`)
  } else {
    recordAudit('modify_dialogue', target, `第 ${index + 1} 行属性变更`)
  }
}

// ============================================================
// 远端消息处理
// ============================================================

function handleRemoteMessage(msg: CollabMessage, sourcePeerId: string): void {
  const cs = useCollabStore.getState()
  const app = useAppStore.getState()

  // ---- Host 权限拦截 + 中继 ----
  if (cs.role === 'host') {
    const isEditMsg = msg.type.startsWith('delta') || msg.type.startsWith('asset')
      || msg.type.startsWith('character') || msg.type.startsWith('variable')
    if (isEditMsg) {
      const peer = cs.peers.find((p) => p.id === sourcePeerId)
      if (peer && peer.permission === 'view') {
        // 仅查看成员的编辑一律丢弃，并回发全量状态纠正其本地
        manager?.sendFullSyncTo(sourcePeerId, collectFullState())
        return
      }
      // 中继给其他 Guest
      manager?.relayExcept(msg, sourcePeerId)
    }
  }

  switch (msg.type) {
    case 'full_sync': {
      // 仅 Guest 接受全量覆盖（Host 的项目是权威源，不接受 Guest 覆盖）
      if (cs.role !== 'guest') return
      applyRemoteState(msg.state)
      return
    }
    case 'deltas_sync': {
      applyRemoteDeltas(msg.deltas.map(normalizeDelta))
      recordRemoteAudit(sourcePeerId, 'modify_dialogue', undefined, '全量剧本同步')
      return
    }
    case 'delta_set': {
      const deltas = [...app.draftDeltas]
      if (msg.index < 0 || msg.index >= deltas.length) {
        // 索引失配 → 请求方状态可能超前，Host 回发全量纠正
        if (cs.role === 'host') manager?.sendFullSyncTo(sourcePeerId, collectFullState())
        return
      }
      deltas[msg.index] = normalizeDelta(msg.delta)
      applyRemoteDeltas(deltas)
      recordRemoteAudit(sourcePeerId, 'modify_dialogue', `行 ${msg.delta.line_id}`, `第 ${msg.index + 1} 行内容更新`)
      return
    }
    case 'delta_insert': {
      const deltas = [...app.draftDeltas]
      const at = Math.max(0, Math.min(deltas.length, msg.index))
      deltas.splice(at, 0, normalizeDelta(msg.delta))
      applyRemoteDeltas(deltas)
      recordRemoteAudit(sourcePeerId, 'add_line', `行 ${msg.delta.line_id}`, `在第 ${at + 1} 行插入`)
      return
    }
    case 'delta_delete': {
      const deltas = [...app.draftDeltas]
      if (msg.index < 0 || msg.index >= deltas.length) return
      const removed = deltas[msg.index]
      deltas.splice(msg.index, 1)
      applyRemoteDeltas(deltas)
      recordRemoteAudit(sourcePeerId, 'delete_line', `行 ${removed.line_id}`, `删除第 ${msg.index + 1} 行`)
      return
    }
    case 'delta_move': {
      const deltas = [...app.draftDeltas]
      if (msg.fromIndex < 0 || msg.fromIndex >= deltas.length) return
      if (msg.toIndex < 0 || msg.toIndex >= deltas.length) return
      const [moved] = deltas.splice(msg.fromIndex, 1)
      deltas.splice(msg.toIndex, 0, moved)
      applyRemoteDeltas(deltas)
      recordRemoteAudit(sourcePeerId, 'move_line', `行 ${moved.line_id}`, `第 ${msg.fromIndex + 1} 行移至第 ${msg.toIndex + 1} 行`)
      return
    }
    case 'audit_sync': {
      // 远端主动同步的日志（去重后入库）
      const exists = cs.auditLogs.some((l) => l.id === msg.entry.id)
      if (!exists) cs.addAuditLog(msg.entry)
      return
    }
    case 'permission_set': {
      cs.setPeerPermission(msg.targetPeerId, msg.permission)
      // 如果是设置本端的权限
      if (msg.targetPeerId === cs.peerId) {
        cs.setMyPermission(msg.permission)
        recordRemoteAudit(msg.fromPeerId, 'permission_change', undefined,
          msg.permission === 'view' ? '你已被设为仅限查看' : '你已被授予编辑权限')
      }
      return
    }
    case 'kick': {
      if (msg.targetPeerId === cs.peerId) {
        // 本端被踢出
        cs.setError('你已被主机移出协作')
        void stopCollab(false)
      }
      return
    }
    case 'peer_left_notice': {
      cs.removePeer(msg.peerId)
      return
    }
    default:
      return
  }
}

/** 收集当前项目全量状态（发给新加入的 Guest） */
function collectFullState(): CollabFullState {
  const app = useAppStore.getState()
  return {
    deltas: app.draftDeltas,
    assets: app.assets,
    characters: app.characterConfigs,
    variables: app.variables,
  }
}

/** Guest 应用 Host 的全量状态 */
function applyRemoteState(state: CollabFullState): void {
  applyingRemote = true
  try {
    const normalized = (state.deltas ?? []).map(normalizeDelta)
    useAppStore.setState({
      draftDeltas: normalized,
      resolvedStates: reduceLines(normalized),
      assets: state.assets ?? [],
      characterConfigs: state.characters ?? [],
      variables: state.variables ?? [],
      selectedLineIndex: 0,
      // 切断本地项目根：防止自动保存把主机内容静默覆写 Guest 自己的磁盘项目
      projectRoot: null,
    })
  } finally {
    lastDeltas = useAppStore.getState().draftDeltas
    applyingRemote = false
  }
}

// ============================================================
// 事件处理（连接生命周期）
// ============================================================

function handleCollabEvent(event: CollabEvent): void {
  const cs = useCollabStore.getState()

  switch (event.type) {
    case 'connected': {
      cs.setStatus('connected')
      cs.setRole(event.role)
      cs.setPeerId(event.peerId)
      if (event.role === 'host') cs.setInviteCode(event.peerId)
      recordAudit('join', undefined, event.role === 'host' ? '创建协作主机' : '加入协作')
      return
    }
    case 'disconnected': {
      cs.reset()
      return
    }
    case 'error': {
      cs.setError(event.message)
      return
    }
    case 'peer_joined': {
      cs.addPeer(event.peer)
      recordRemoteAudit(event.peer.id, 'join', undefined, `${event.peer.displayName} 加入协作`)
      // Host：向新 Guest 发送全量项目状态
      if (cs.role === 'host') {
        manager?.sendFullSyncTo(event.peer.id, collectFullState())
      }
      return
    }
    case 'peer_left': {
      const peer = cs.peers.find((p) => p.id === event.peerId)
      cs.removePeer(event.peerId) // 内部会清掉该 Peer 的所有锁
      if (peer) {
        recordRemoteAudit(event.peerId, 'leave', undefined, `${peer.displayName} 离开协作`)
      }
      // Host 通知其他 Guest 该成员已离开
      if (cs.role === 'host') {
        manager?.broadcast({ type: 'peer_left_notice', peerId: event.peerId })
      }
      return
    }
    case 'block_lock': {
      // 忽略自己的锁回显
      if (event.lock.peerId === cs.peerId) return
      cs.addLock(event.lock)
      return
    }
    case 'block_unlock': {
      if (event.peerId === cs.peerId) return
      const lock = cs.locks.get(event.lineIndex)
      if (lock && lock.peerId === event.peerId) {
        cs.removeLock(event.lineIndex)
      }
      return
    }
    case 'message': {
      handleRemoteMessage(event.msg, event.sourcePeerId)
      return
    }
  }
}

// ============================================================
// appStore 订阅（本地编辑侦测 + 编辑锁自动化）
// ============================================================

function startStoreSubscription(): void {
  stopStoreSubscription()
  lastDeltas = useAppStore.getState().draftDeltas
  lastLockedLine = null

  unsubscribeStore = useAppStore.subscribe((state) => {
    const cs = useCollabStore.getState()
    if (cs.status !== 'connected') return

    // ---- 编辑锁：选中行变化 → 解锁旧行 + 锁定新行 ----
    const sel = state.selectedLineIndex
    if (sel !== lastLockedLine) {
      if (lastLockedLine !== null) manager?.unlockBlock(lastLockedLine)
      manager?.lockBlock(sel)
      lastLockedLine = sel
      useCollabStore.getState().setLocalEditingLine(sel)
    }

    // ---- 编辑差量广播（节流 150ms 合并高频输入） ----
    if (applyingRemote) return
    const current = state.draftDeltas
    if (current === lastDeltas) return
    if (diffTimer) clearTimeout(diffTimer)
    diffTimer = setTimeout(() => {
      diffTimer = null
      const prev = lastDeltas
      const next = useAppStore.getState().draftDeltas
      lastDeltas = next
      if (prev && prev !== next && !applyingRemote) {
        diffAndBroadcast(prev, next)
      }
    }, 150)
  })
}

function stopStoreSubscription(): void {
  if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null }
  if (diffTimer) { clearTimeout(diffTimer); diffTimer = null }
  lastDeltas = null
  lastLockedLine = null
}

// ============================================================
// 公开 API
// ============================================================

/** 创建协作主机，返回邀请码 */
export async function startHost(name: string): Promise<string> {
  const mgr = getCollabManager()
  const cs = useCollabStore.getState()
  cs.setStatus('connecting')
  cs.setDisplayName(name || '主机')
  cs.setError(null)

  if (unsubscribeEvents) unsubscribeEvents()
  unsubscribeEvents = mgr.on(handleCollabEvent)

  try {
    const code = await mgr.host(name)
    startStoreSubscription()
    return code
  } catch (err) {
    cs.setStatus('disconnected')
    cs.setError(err instanceof Error ? err.message : '创建主机失败')
    throw err
  }
}

/** 加入协作 */
export async function joinSession(inviteCode: string, name: string): Promise<void> {
  const mgr = getCollabManager()
  const cs = useCollabStore.getState()
  cs.setStatus('connecting')
  cs.setDisplayName(name || '协作者')
  cs.setError(null)

  if (unsubscribeEvents) unsubscribeEvents()
  unsubscribeEvents = mgr.on(handleCollabEvent)

  try {
    await mgr.join(inviteCode.trim(), name)
    cs.setInviteCode(inviteCode.trim())
    startStoreSubscription()
  } catch (err) {
    cs.setStatus('disconnected')
    cs.setError(err instanceof Error ? err.message : '加入协作失败')
    throw err
  }
}

/** 断开协作（keepError=true 时保留错误信息展示） */
export async function stopCollab(logLeave = true): Promise<void> {
  if (logLeave) recordAudit('leave', undefined, '主动断开协作')
  stopStoreSubscription()
  if (unsubscribeEvents) { unsubscribeEvents(); unsubscribeEvents = null }
  const err = useCollabStore.getState().error
  if (manager) await manager.destroy()
  useCollabStore.getState().reset()
  // 被踢等场景保留错误提示
  if (err) useCollabStore.getState().setError(err)
}

/** Host 设置成员权限 */
export function setPeerPermission(peerId: string, permission: 'edit' | 'view'): void {
  const cs = useCollabStore.getState()
  if (cs.role !== 'host') return
  cs.setPeerPermission(peerId, permission)
  manager?.setPermission(peerId, permission)
  const peer = cs.peers.find((p) => p.id === peerId)
  recordAudit('permission_change', peer?.displayName,
    permission === 'view' ? '设为仅限查看' : '授予编辑权限')
}

/** Host 踢出成员 */
export function kickPeer(peerId: string): void {
  const cs = useCollabStore.getState()
  if (cs.role !== 'host') return
  const peer = cs.peers.find((p) => p.id === peerId)
  recordAudit('kick', peer?.displayName, '被主机移出协作')
  manager?.kickPeer(peerId)
}

/** 素材/角色/变量类操作的审计埋点（由 UI 层显式调用） */
export function auditAssetAdd(name: string): void { recordAudit('add_asset', name) }
export function auditAssetDelete(name: string): void { recordAudit('delete_asset', name) }
export function auditCharacterAdd(name: string): void { recordAudit('add_character', name) }
export function auditCharacterDelete(name: string): void { recordAudit('delete_character', name) }
