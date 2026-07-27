/**
 * CollabPanel v1.0.0 - 公网多人 P2P 协同面板（纯 UI 层）
 * 网络与同步逻辑全部由 collabBridge 承载，面板关闭不影响协作连接
 */

import { useState } from 'react'
import { useCollabStore } from '@/collab/collabStore'
import { startHost, joinSession, stopCollab, setPeerPermission, kickPeer } from '@/collab/collabBridge'
import type { PeerPermission } from '@/collab/types'
import { Button } from '@/components/ui'
import PeerBadge from '@/components/collab/PeerBadge'
import {
  Copy, Check, Users, X, Wifi, Shield,
  UserPlus, UserMinus, Eye, Edit3, LogIn, LogOut,
  Loader2, Radio, Key, AlertTriangle, Lock,
} from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CollabPanel({ open, onClose }: Props) {
  const store = useCollabStore()

  const [nameInput, setNameInput] = useState(store.myName || '')
  const [inviteInput, setInviteInput] = useState('')
  const [copied, setCopied] = useState(false)

  const isHost = store.role === 'host'
  const isConnected = store.status === 'connected'
  const connecting = store.status === 'connecting'

  const rememberName = (name: string) => {
    try { localStorage.setItem('sw-collab-name', name) } catch { /* ignore */ }
  }

  const handleHost = async () => {
    const name = nameInput.trim() || '主机'
    rememberName(name)
    try { await startHost(name) } catch { /* 错误已写入 store.error */ }
  }

  const handleJoin = async () => {
    const code = inviteInput.trim()
    if (!code) { store.setError('请输入邀请码'); return }
    const name = nameInput.trim() || '协作者'
    rememberName(name)
    try { await joinSession(code, name) } catch { /* 错误已写入 store.error */ }
  }

  const handleCopyCode = async () => {
    if (!store.inviteCode) return
    try {
      await navigator.clipboard.writeText(store.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 忽略 */ }
  }

  const handleTogglePermission = (peerId: string, current: PeerPermission) => {
    setPeerPermission(peerId, current === 'edit' ? 'view' : 'edit')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-edge/15 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-3">
          {isConnected ? (
            <Wifi size={16} strokeWidth={1.75} className="text-success" />
          ) : connecting ? (
            <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-primary" />
          ) : (
            <Radio size={16} strokeWidth={1.75} className="text-fg-muted" />
          )}
          <span className="text-[13px] font-semibold text-fg">P2P 协作空间</span>

          {isConnected && (
            <span className="ml-auto flex items-center gap-1.5">
              {isHost ? (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">主机模式</span>
              ) : (
                <PeerBadge role="GUEST" displayName={store.displayName} isSelf size="sm" />
              )}
            </span>
          )}

          <button
            onClick={onClose}
            className="ml-2 flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="关闭"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">

          {/* ---- 未连接：显示主机/加入界面 ---- */}
          {!isConnected && (
            <>
              {/* 身份名称输入 */}
              <section className="rounded-lg border border-edge/12 bg-surface-1 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  <UserPlus size={14} strokeWidth={1.75} /> 你的称呼
                </div>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="如：文案-阿杰"
                  maxLength={16}
                  className="w-full rounded-md border border-edge/15 bg-surface-3 px-2.5 py-2 text-[13px] text-fg outline-none focus:border-primary/60"
                />
                <p className="mt-1 text-[11px] text-fg-faint">无需登录，仅用于协作中的身份标识。本地记忆。</p>
              </section>

              {/* 主机模式 */}
              <section className="rounded-lg border border-edge/12 bg-surface-1 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  <Shield size={14} strokeWidth={1.75} className="text-primary" /> 创建主机
                </div>
                <p className="mb-2 text-[11px] text-fg-subtle">
                  作为房主发起协作，生成全局唯一邀请码，协作者输入后即可直连。
                </p>
                <Button
                  variant="primary" size="sm"
                  onClick={handleHost}
                  disabled={connecting}
                  icon={connecting ? <Loader2 size={13} strokeWidth={1.75} className="animate-spin" /> : undefined}
                >
                  {connecting ? '正在连接 P2P 网络...' : '创建协作主机'}
                </Button>
              </section>

              {/* 加入模式 */}
              <section className="rounded-lg border border-edge/12 bg-surface-1 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  <LogIn size={14} strokeWidth={1.75} className="text-info" /> 加入协作
                </div>
                <div className="flex gap-2">
                  <input
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder="粘贴主机邀请码"
                    className="flex-1 rounded-md border border-edge/15 bg-surface-3 px-2.5 py-2 font-mono text-[12px] text-fg outline-none focus:border-info/60"
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={handleJoin}
                    disabled={connecting || !inviteInput.trim()}
                  >
                    {connecting ? <Loader2 size={13} strokeWidth={1.75} className="animate-spin" /> : '加入'}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-fg-faint">
                  加入后主机的项目将同步覆盖当前工作区，请先保存本地项目。
                </p>
              </section>

              {/* 错误提示 */}
              {store.error && (
                <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-[12px] text-danger">
                  <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                  <span>{store.error}</span>
                </div>
              )}
            </>
          )}

          {/* ---- 已连接：显示邀请码 + 成员列表 ---- */}
          {isConnected && (
            <>
              {/* 邀请码 */}
              {isHost && (
                <section className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-primary">
                    <Key size={14} strokeWidth={1.75} /> 邀请码
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-surface-3 px-3 py-2 font-mono text-[13px] font-semibold tracking-wider text-primary select-all">
                      {store.inviteCode}
                    </code>
                    <button
                      onClick={handleCopyCode}
                      className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-primary/25 px-2.5 text-[12px] text-primary transition-colors hover:bg-primary/10"
                    >
                      {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-fg-subtle">
                    将此邀请码发给协作者，对方输入后即可通过 P2P 直接连入你的主机。
                  </p>
                </section>
              )}

              {/* Guest 被限权提示 */}
              {!isHost && store.myPermission === 'view' && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/8 px-3 py-2.5 text-[12px] text-warning">
                  <Lock size={13} strokeWidth={1.75} />
                  你当前为仅限查看模式，编辑内容不会同步给其他成员。
                </div>
              )}

              {/* 成员列表 */}
              <section className="rounded-lg border border-edge/12 bg-surface-1 p-3">
                <div className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  <Users size={14} strokeWidth={1.75} />
                  在线成员 <span className="text-fg-muted text-[12px]">({store.peers.length + 1})</span>
                </div>

                {/* 自己 */}
                <div className="mb-2 flex items-center gap-2 rounded-md bg-primary/4 px-2.5 py-2">
                  <PeerBadge role={isHost ? 'HOST' : 'GUEST'} displayName={store.displayName} isSelf size="md" />
                  <span className="ml-auto text-[10px] text-fg-faint">{(isHost ? '房主' : '你')}</span>
                </div>

                {/* 其他成员 */}
                {store.peers.length === 0 && (
                  <p className="py-2 text-center text-[12px] text-fg-faint">等待协作者加入...</p>
                )}
                {store.peers.map((peer) => (
                  <div key={peer.id} className="mb-1.5 flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2">
                    <PeerBadge role={peer.id === store.inviteCode ? 'HOST' : 'GUEST'} displayName={peer.displayName} size="md" />
                    <span className={`ml-auto text-[10px] ${peer.permission === 'view' ? 'text-warning' : 'text-fg-muted'}`}>
                      {peer.permission === 'view' ? '仅查看' : '可编辑'}
                    </span>

                    {/* Host 权限管理 */}
                    {isHost && (
                      <div className="flex items-center gap-0.5 ml-1">
                        <button
                          onClick={() => handleTogglePermission(peer.id, peer.permission)}
                          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg transition-colors"
                          title={peer.permission === 'edit' ? '设为仅查看' : '设为可编辑'}
                        >
                          {peer.permission === 'edit' ? <Edit3 size={12} strokeWidth={1.5} /> : <Eye size={12} strokeWidth={1.5} />}
                        </button>
                        <button
                          onClick={() => kickPeer(peer.id)}
                          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-danger transition-colors"
                          title="移出协作"
                        >
                          <UserMinus size={12} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {/* 断开 */}
              <Button
                variant="ghost" size="sm"
                onClick={() => { void stopCollab() }}
                icon={<LogOut size={13} strokeWidth={1.75} />}
                className="w-full text-danger hover:bg-danger/10"
              >
                断开连接
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
