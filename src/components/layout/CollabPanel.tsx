/**
 * CollabPanel v1.1.0 - P2P 协作全屏页面（深度 UI 重做）
 * 放弃弹窗拉伸风格，改为沉浸式工作区布局：大标题 + 双栏卡片 + 对齐排版。
 */

import { useState } from 'react'
import { useCollabStore } from '@/collab/collabStore'
import { startHost, joinSession, stopCollab, setPeerPermission, kickPeer } from '@/collab/collabBridge'
import type { PeerPermission } from '@/collab/types'
import { Button } from '@/components/ui'
import PeerBadge from '@/components/collab/PeerBadge'
import {
  Copy, Check, Users, Wifi, Shield,
  UserPlus, UserMinus, Eye, Edit3, LogIn, LogOut,
  Loader2, Radio, Key, AlertTriangle, Lock,
} from 'lucide-react'

export default function CollabPanel() {
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

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* ====== 沉浸式页头 ====== */}
      <div className="shrink-0 border-b border-edge/10 px-6 pt-6 pb-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isConnected ? 'bg-primary/10' : connecting ? 'bg-signal/10' : 'bg-surface-2'
          }`}>
            {isConnected ? (
              <Wifi size={22} strokeWidth={1.5} className="text-primary" />
            ) : connecting ? (
              <Loader2 size={22} strokeWidth={1.5} className="animate-spin text-signal" />
            ) : (
              <Radio size={22} strokeWidth={1.5} className="text-fg-muted" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-fg">协作空间</h2>
            <p className="mt-1 text-[14px] text-fg-subtle">
              P2P 实时协作，无需服务器中转。创建主机或加入现有会话，多人同时编辑同一项目。
            </p>
          </div>
          <span className="ml-auto shrink-0 flex items-center gap-2">
            {isConnected && (
              <>
                {isHost ? (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">主机模式</span>
                ) : (
                  <PeerBadge role="GUEST" displayName={store.displayName} isSelf size="sm" />
                )}
              </>
            )}
          </span>
        </div>
      </div>

      {/* ====== 内容区 ====== */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

        {/* ---- 未连接：双栏布局 ---- */}
        {!isConnected && (
          <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 左栏：身份 + 创建 */}
            <div className="space-y-5">
              <section className="rounded-xl border border-edge/10 bg-surface-2 p-5 shadow-1">
                <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-fg">
                  <UserPlus size={16} strokeWidth={1.5} /> 你的身份
                </div>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="如：文案-阿杰"
                  maxLength={16}
                  className="w-full rounded-lg border border-edge/15 bg-surface-3 px-3 py-2.5 text-[14px] text-fg outline-none focus:border-primary/60 transition-colors"
                />
                <p className="mt-2 text-[12px] text-fg-muted">无需登录，仅用于协作中的身份标识。本地记忆。</p>
              </section>

              <section className="rounded-xl border border-edge/10 bg-surface-2 p-5 shadow-1">
                <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-fg">
                  <Shield size={16} strokeWidth={1.5} className="text-primary" /> 创建主机
                </div>
                <p className="mb-4 text-[13px] text-fg-subtle leading-relaxed">
                  作为房主发起协作，系统会生成全局唯一的邀请码。协作者输入邀请码后通过 P2P 直连你的主机。
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
            </div>

            {/* 右栏：加入 + 错误 */}
            <div className="space-y-5">
              <section className="rounded-xl border border-edge/10 bg-surface-2 p-5 shadow-1">
                <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-fg">
                  <LogIn size={16} strokeWidth={1.5} className="text-signal" /> 加入协作
                </div>
                <p className="mb-4 text-[13px] text-fg-subtle leading-relaxed">
                  输入主机分享的邀请码，即可通过 P2P 直连加入会话。加入后主机项目将同步覆盖当前工作区，请先保存本地项目。
                </p>
                <div className="flex gap-2">
                  <input
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder="粘贴主机邀请码"
                    className="flex-1 rounded-lg border border-edge/15 bg-surface-3 px-3 py-2.5 font-mono text-[13px] text-fg outline-none focus:border-signal/60 transition-colors"
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={handleJoin}
                    disabled={connecting || !inviteInput.trim()}
                  >
                    {connecting ? <Loader2 size={13} strokeWidth={1.75} className="animate-spin" /> : '加入'}
                  </Button>
                </div>
              </section>

              {!store.error && (
                <div className="rounded-xl border border-edge/8 bg-surface-1/50 p-5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-fg-subtle mb-3">
                    <Users size={14} strokeWidth={1.5} /> P2P 协作特性
                  </div>
                  <ul className="space-y-2 text-[13px] text-fg-subtle">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                      直连传输，无需中转服务器
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-signal/60" />
                      主机可管理成员权限（编辑/仅查看）
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-fg-faint/60" />
                      协作内容实时同步，断开后不会丢失
                    </li>
                  </ul>
                </div>
              )}

              {store.error && (
                <div className="flex items-start gap-3 rounded-xl border border-danger/15 bg-danger/[0.04] px-4 py-4">
                  <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />
                  <div>
                    <div className="text-[13px] font-medium text-danger mb-0.5">连接失败</div>
                    <div className="text-[13px] text-fg-subtle">{store.error}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- 已连接 ---- */}
        {isConnected && (
          <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 左栏 */}
            <div className="space-y-5">
              {isHost && (
                <section className="rounded-xl border border-primary/15 bg-primary/[0.04] p-5 shadow-1">
                  <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-primary">
                    <Key size={16} strokeWidth={1.5} /> 邀请码
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 rounded-lg bg-surface-3 px-4 py-3 font-mono text-[15px] font-semibold tracking-widest text-primary select-all">
                      {store.inviteCode}
                    </code>
                    <button
                      onClick={handleCopyCode}
                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-primary/20 px-3 text-[13px] text-primary transition-colors hover:bg-primary/10"
                    >
                      {copied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                  <p className="mt-3 text-[12px] text-fg-subtle">
                    将此邀请码发给协作者，对方在加入框中输入后即可通过 P2P 直连。
                  </p>
                </section>
              )}

              {!isHost && store.myPermission === 'view' && (
                <div className="flex items-start gap-2 rounded-xl border border-warning/15 bg-warning/[0.04] px-4 py-4">
                  <Lock size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
                  <span className="text-[13px] text-fg-subtle">你当前为仅限查看模式，编辑内容不会同步给其他成员。</span>
                </div>
              )}
            </div>

            {/* 右栏：成员列表 */}
            <div className="space-y-5">
              <section className="rounded-xl border border-edge/10 bg-surface-2 p-5 shadow-1">
                <div className="mb-5 flex items-center gap-2 text-[14px] font-semibold text-fg">
                  <Users size={16} strokeWidth={1.5} />
                  在线成员
                  <span className="ml-1 text-[13px] font-normal text-fg-muted">({store.peers.length + 1})</span>
                </div>

                {/* 自己 */}
                <div className="mb-2 flex items-center gap-3 rounded-lg bg-primary/[0.04] px-4 py-3">
                  <PeerBadge role={isHost ? 'HOST' : 'GUEST'} displayName={store.displayName} isSelf size="md" />
                  <span className="ml-auto text-[12px] text-fg-muted">{(isHost ? '房主 · 主机' : '你')}</span>
                </div>

                {/* 其他成员 */}
                {store.peers.length === 0 && (
                  <p className="py-6 text-center text-[13px] text-fg-muted">等待协作者加入...</p>
                )}
                {store.peers.map((peer) => (
                  <div key={peer.id} className="mb-2 flex items-center gap-3 rounded-lg bg-surface-3 px-4 py-3">
                    <PeerBadge role={peer.id === store.inviteCode ? 'HOST' : 'GUEST'} displayName={peer.displayName} size="md" />
                    <span className={`ml-auto text-[12px] ${peer.permission === 'view' ? 'text-warning' : 'text-fg-muted'}`}>
                      {peer.permission === 'view' ? '仅查看' : '可编辑'}
                    </span>

                    {isHost && (
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          onClick={() => handleTogglePermission(peer.id, peer.permission)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:text-fg transition-colors hover:bg-surface-hover"
                          title={peer.permission === 'edit' ? '设为仅查看' : '设为可编辑'}
                        >
                          {peer.permission === 'edit' ? <Edit3 size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
                        </button>
                        <button
                          onClick={() => kickPeer(peer.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:text-danger transition-colors hover:bg-surface-hover"
                          title="移出协作"
                        >
                          <UserMinus size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              <Button
                variant="ghost" size="sm"
                onClick={() => { void stopCollab() }}
                icon={<LogOut size={15} strokeWidth={1.75} />}
                className="w-full text-danger hover:bg-danger/[0.06]"
              >
                断开连接
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
