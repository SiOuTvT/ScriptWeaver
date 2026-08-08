/**
 * CollabManager - 公网 P2P 协同核心网络层
 * 基于 PeerJS (WebRTC) 实现跨网络 P2P 连接 + JSON 消息同步
 *
 * 拓扑：星型（Host 为中心）。Guest 只连 Host；
 * Host 收到 Guest 消息后负责中继给其他 Guest（relayExcept）。
 */

import Peer, { DataConnection } from 'peerjs'
import type {
  CollabMessage, CollabFullState, CollabRole, PeerPermission,
  RemotePeerInfo, BlockLock, AuditLogEntry,
} from './types'

// ---- 事件类型 ----
export type CollabEvent =
  | { type: 'connected'; role: CollabRole; peerId: string }
  | { type: 'disconnected' }
  | { type: 'link_health'; liveConns: number }
  | { type: 'error'; message: string }
  | { type: 'peer_joined'; peer: RemotePeerInfo }
  | { type: 'peer_left'; peerId: string }
  | { type: 'message'; msg: CollabMessage; sourcePeerId: string }
  | { type: 'block_lock'; lock: BlockLock }
  | { type: 'block_unlock'; lineIndex: number; peerId: string }

export type CollabEventHandler = (event: CollabEvent) => void

let _autoId = 0
function autoId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `sw-${Date.now().toString(36)}-${rand}${(++_autoId).toString(36)}`
}

/** 默认 PeerJS 官方信令服务器；可被 setSignalingHost 覆盖（国内访问官方服务器不稳时可自定） */
let PEERJS_HOST = '0.peerjs.com'
const PEERJS_PORT = 443
const PEERJS_SECURE = true

/** 设置自定义信令服务器（传入空字符串恢复官方默认） */
export function setSignalingHost(host: string): void {
  PEERJS_HOST = host.trim() || '0.peerjs.com'
}

export class CollabManager {
  private peer: Peer | null = null
  private conns = new Map<string, DataConnection>()
  private handlers = new Set<CollabEventHandler>()
  private role: CollabRole = 'none'
  private displayName = ''
  private peerId = ''
  private destroyed = false
  /** 真实数据通道存活数（与信令连接解耦，用于链路健康判断） */
  private liveConns = 0
  /** Guest 模式记忆的 Host Peer ID，用于断链后自动重建数据通道 */
  private hostPeerId: string | null = null
  /** 已完成握手的 Peer（防止 handshake + handshake_ack 双次触发 peer_joined） */
  private greeted = new Set<string>()

  /** 广播消息给所有已连接 Peer */
  broadcast(msg: CollabMessage): void {
    const data = JSON.stringify(msg)
    for (const conn of this.conns.values()) {
      if (conn.open) {
        try { conn.send(data) } catch { /* ignore closed conn */ }
      }
    }
  }

  /** Host 中继：转发给除来源之外的所有 Peer */
  relayExcept(msg: CollabMessage, exceptPeerId: string): void {
    const data = JSON.stringify(msg)
    for (const [pid, conn] of this.conns) {
      if (pid === exceptPeerId) continue
      if (conn.open) {
        try { conn.send(data) } catch { /* ignore */ }
      }
    }
  }

  /** 发送给特定 Peer */
  sendTo(peerId: string, msg: CollabMessage): void {
    const conn = this.conns.get(peerId)
    if (conn?.open) {
      try { conn.send(JSON.stringify(msg)) } catch { /* ignore */ }
    }
  }

  private fire(event: CollabEvent): void {
    for (const h of this.handlers) {
      try { h(event) } catch { /* ignore */ }
    }
  }

  /** 建立 DataConnection 事件绑定 */
  private setupConn(conn: DataConnection, asHost: boolean): void {
    const remotePeerId = conn.peer

    conn.on('open', () => {
      if (this.destroyed) return
      // 数据通道建立 → 链路健康 +1
      this.liveConns += 1
      this.fire({ type: 'link_health', liveConns: this.liveConns })
      // Host 主动发 handshake
      if (asHost) {
        conn.send(JSON.stringify({
          type: 'handshake',
          role: 'host',
          displayName: this.displayName,
          peerId: this.peerId,
        } satisfies CollabMessage))
      }
    })

    conn.on('data', (raw: unknown) => {
      if (this.destroyed) return
      try {
        const msg = JSON.parse(raw as string) as CollabMessage
        this.handleMessage(msg, conn)
      } catch { /* ignore corrupt message */ }
    })

    conn.on('close', () => {
      if (this.destroyed) return
      this.conns.delete(remotePeerId)
      this.greeted.delete(remotePeerId)
      this.liveConns = Math.max(0, this.liveConns - 1)
      this.fire({ type: 'link_health', liveConns: this.liveConns })
      this.fire({ type: 'peer_left', peerId: remotePeerId })
    })

    conn.on('error', () => {
      if (this.destroyed) return
      this.conns.delete(remotePeerId)
      this.greeted.delete(remotePeerId)
      this.liveConns = Math.max(0, this.liveConns - 1)
      this.fire({ type: 'link_health', liveConns: this.liveConns })
      this.fire({ type: 'peer_left', peerId: remotePeerId })
    })
  }

  private handleMessage(msg: CollabMessage, conn: DataConnection): void {
    const remotePeerId = conn.peer

    // ---- 握手（handshake / handshake_ack 都视为「对方自我介绍」，用 greeted 去重） ----
    if (msg.type === 'handshake' || msg.type === 'handshake_ack') {
      const firstTime = !this.greeted.has(msg.peerId)
      this.greeted.add(msg.peerId)

      // 只在收到 handshake 时回 ack（避免 ack 死循环）
      if (msg.type === 'handshake') {
        conn.send(JSON.stringify({
          type: 'handshake_ack',
          role: this.role,
          displayName: this.displayName,
          peerId: this.peerId,
        } satisfies CollabMessage))
      }

      if (firstTime) {
        this.fire({
          type: 'peer_joined',
          peer: {
            id: msg.peerId,
            displayName: msg.displayName,
            permission: 'edit',
            connectedAt: Date.now(),
          },
        })
      }
      return
    }

    // ---- 编辑锁 ----
    if (msg.type === 'block_lock') {
      this.fire({ type: 'block_lock', lock: { lineIndex: msg.lineIndex, peerId: msg.peerId, displayName: msg.displayName, lockedAt: Date.now() } })
      // Host 中继锁消息给其他 Guest
      if (this.role === 'host') this.relayExcept(msg, remotePeerId)
      return
    }
    if (msg.type === 'block_unlock') {
      this.fire({ type: 'block_unlock', lineIndex: msg.lineIndex, peerId: msg.peerId })
      if (this.role === 'host') this.relayExcept(msg, remotePeerId)
      return
    }

    // ---- 普通数据消息：透传给桥接层处理（中继决策由桥接层做，因需权限判定） ----
    this.fire({ type: 'message', msg, sourcePeerId: remotePeerId })
  }

  // ---- 公开 API ----

  on(handler: CollabEventHandler): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  getRole(): CollabRole { return this.role }
  getPeerId(): string { return this.peerId }
  getDisplayName(): string { return this.displayName }
  isActive(): boolean { return !this.destroyed && this.peer !== null }

  /** 主机模式：创建 Peer 并等待连接 */
  async host(name: string): Promise<string> {
    await this.destroy()
    this.destroyed = false
    this.role = 'host'
    this.displayName = name || '主机'
    this.peerId = autoId()

    return new Promise((resolve, reject) => {
      this.peer = new Peer(this.peerId, {
        host: PEERJS_HOST, port: PEERJS_PORT, secure: PEERJS_SECURE,
        debug: 0,
      })

      const timeout = setTimeout(() => {
        reject(new Error('P2P 连接超时，请检查网络后重试'))
      }, 15_000)

      this.peer.on('open', (id) => {
        clearTimeout(timeout)
        this.peerId = id
        this.fire({ type: 'connected', role: 'host', peerId: id })
        resolve(id)
      })

      this.peer.on('connection', (conn) => {
        if (this.destroyed) { conn.close(); return }
        this.conns.set(conn.peer, conn)
        this.setupConn(conn, true)
      })

      this.peer.on('error', (err) => {
        clearTimeout(timeout)
        this.fire({ type: 'error', message: `P2P 错误: ${err.message}` })
        reject(err)
      })

      this.peer.on('disconnected', () => {
        if (this.destroyed) return
        // 尝试重连信令服务器（不影响已建立的 P2P 数据通道）
        try { this.peer?.reconnect() } catch { /* ignore */ }
      })
    })
  }

  /** 客户端模式：连接指定 Peer ID */
  async join(hostPeerId: string, name: string): Promise<void> {
    await this.destroy()
    this.destroyed = false
    this.role = 'guest'
    this.displayName = name || '协作者'
    this.peerId = autoId()
    this.hostPeerId = hostPeerId

    return new Promise((resolve, reject) => {
      this.peer = new Peer(this.peerId, {
        host: PEERJS_HOST, port: PEERJS_PORT, secure: PEERJS_SECURE,
        debug: 0,
      })

      const timeout = setTimeout(() => {
        reject(new Error('连接超时：请确认邀请码正确且主机在线'))
      }, 20_000)

      this.peer.on('open', () => {
        const conn = this.peer!.connect(hostPeerId, { reliable: true })
        this.conns.set(hostPeerId, conn)
        this.setupConn(conn, false)

        conn.on('open', () => {
          clearTimeout(timeout)
          // Guest 发送 handshake
          conn.send(JSON.stringify({
            type: 'handshake',
            role: 'guest',
            displayName: this.displayName,
            peerId: this.peerId,
          } satisfies CollabMessage))
          this.fire({ type: 'connected', role: 'guest', peerId: this.peerId })
          resolve()
        })

        conn.on('error', (err) => {
          clearTimeout(timeout)
          reject(new Error(`连接失败: ${err.message}`))
        })
      })

      this.peer.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      this.peer.on('disconnected', () => {
        if (this.destroyed) return
        try { this.peer?.reconnect() } catch { /* ignore */ }
        // Guest：信令恢复后重建到 Host 的数据通道，使离线缓冲能 flush
        this.scheduleGuestReconnect()
      })
    })
  }

  /**
   * Guest 断链后重建与 Host 的数据通道。
   * 信令重连是异步的，故在 peer 重新 open 后再 connect；用 once 式监听避免重复累积。
   */
  private scheduleGuestReconnect(): void {
    if (this.role !== 'guest' || this.destroyed || !this.hostPeerId) return
    const peer = this.peer
    if (!peer) return
    const attempt = () => {
      if (this.destroyed || !peer.open || this.conns.has(this.hostPeerId!)) return
      const conn = peer.connect(this.hostPeerId!, { reliable: true })
      this.conns.set(this.hostPeerId!, conn)
      this.setupConn(conn, false)
      conn.on('open', () => {
        conn.send(JSON.stringify({
          type: 'handshake',
          role: 'guest',
          displayName: this.displayName,
          peerId: this.peerId,
        } satisfies CollabMessage))
      })
    }
    if (peer.open) {
      attempt()
    } else {
      const onOpen = () => { peer.off('open', onOpen); attempt() }
      peer.on('open', onOpen)
    }
  }

  /** 向指定 Peer 发送完整状态（新成员入场同步） */
  sendFullSyncTo(peerId: string, state: CollabFullState): void {
    this.sendTo(peerId, { type: 'full_sync', state })
  }

  /** 锁定剧本块 */
  lockBlock(lineIndex: number): void {
    this.broadcast({
      type: 'block_lock',
      lineIndex, peerId: this.peerId, displayName: this.displayName,
    })
  }

  /** 解锁剧本块 */
  unlockBlock(lineIndex: number): void {
    this.broadcast({
      type: 'block_unlock',
      lineIndex, peerId: this.peerId,
    })
  }

  /** 同步审计日志 */
  syncAuditLog(entry: AuditLogEntry): void {
    this.broadcast({ type: 'audit_sync', entry })
  }

  /** 设置 Peer 权限（广播给所有人，让每个端的成员列表同步更新） */
  setPermission(targetPeerId: string, permission: PeerPermission): void {
    this.broadcast({
      type: 'permission_set', targetPeerId, permission, fromPeerId: this.peerId,
    })
  }

  /** 踢出 Peer */
  kickPeer(targetPeerId: string): void {
    this.sendTo(targetPeerId, {
      type: 'kick', targetPeerId, fromPeerId: this.peerId,
    })
    // 延迟关闭连接，保证 kick 消息送达
    const conn = this.conns.get(targetPeerId)
    setTimeout(() => {
      try { conn?.close() } catch { /* ignore */ }
    }, 500)
    this.conns.delete(targetPeerId)
    this.greeted.delete(targetPeerId)
    this.fire({ type: 'peer_left', peerId: targetPeerId })
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    for (const conn of this.conns.values()) {
      try { conn.close() } catch { /* ignore */ }
    }
    this.conns.clear()
    this.greeted.clear()
    this.liveConns = 0
    this.hostPeerId = null
    if (this.peer) {
      try { this.peer.destroy() } catch { /* ignore */ }
      this.peer = null
    }
    this.role = 'none'
  }
}
