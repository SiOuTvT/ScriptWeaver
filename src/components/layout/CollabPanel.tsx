/**
 * 协作空间弹窗（v0.6.0 需求 4/4 · 多人协同编剧脚手架）
 *
 * 诚实边界：当前 ScriptWeaver 为纯桌面端，没有后端服务器，
 * 「实时多人协同编辑」需要自建 WebSocket/CRDT 同步服务。
 * 本面板提供：① 可分享的协作邀请码（离线描述符）；② 邀请码解析校验。
 * 接入真实云同步后端后，邀请码即可驱动实时协同；数据通道已由 CloudSyncProvider 抽象预留。
 */

import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { encodeInvite, decodeInvite, type CollabInvite } from '@/utils/cloudSync'
import { Button } from '@/components/ui'
import { Cloud, Copy, Check, Users, X, AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CollabPanel({ open, onClose }: Props) {
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const [name, setName] = useState(characterConfigs[0]?.displayName || '未命名协作')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [parsed, setParsed] = useState<CollabInvite | null>(null)
  const [err, setErr] = useState('')

  if (!open) return null

  const handleGen = () => {
    const c = encodeInvite(name.trim() || '未命名协作')
    setCode(c)
    setParsed(null)
    setErr('')
  }

  const handleCopy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用，用户可手动选择文本复制 */
    }
  }

  const handleImport = () => {
    setErr('')
    setParsed(null)
    const inv = decodeInvite(code.trim())
    if (!inv) {
      setErr('邀请码无效或格式错误')
      return
    }
    setParsed(inv)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-edge/15 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-3">
          <Users size={16} strokeWidth={1.75} className="text-signal" />
          <span className="eyebrow">协作空间</span>
          <button
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="关闭"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* 生成邀请码 */}
          <section className="rounded-lg border border-edge/12 bg-surface-1 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-fg">
              <Cloud size={14} strokeWidth={1.75} className="text-info" /> 生成协作邀请码
            </div>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="协作项目名称"
                className="flex-1 rounded-md border border-edge/15 bg-surface-3 px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-signal/60"
              />
              <Button variant="primary" size="sm" onClick={handleGen}>
                生成
              </Button>
            </div>
            {code && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <textarea
                    readOnly
                    value={code}
                    className="h-16 w-full resize-none rounded-md border border-edge/15 bg-surface-3 px-2 py-1.5 font-mono text-[11px] text-fg-muted outline-none"
                  />
                  <button
                    onClick={() => void handleCopy()}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-edge/15 px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    title="复制邀请码"
                  >
                    {copied ? <Check size={13} strokeWidth={1.75} /> : <Copy size={13} strokeWidth={1.75} />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-fg-faint">将邀请码发给协作者；导入后可识别同一工程与云端同步标识。</p>
              </div>
            )}
          </section>

          {/* 导入邀请码 */}
          <section className="rounded-lg border border-edge/12 bg-surface-1 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-fg">
              <Users size={14} strokeWidth={1.75} className="text-info" /> 导入协作邀请码
            </div>
            <div className="flex items-center gap-2">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="粘贴协作者分享的邀请码"
                className="h-16 w-full resize-none rounded-md border border-edge/15 bg-surface-3 px-2 py-1.5 font-mono text-[11px] text-fg outline-none focus:border-signal/60"
              />
              <Button variant="outline" size="sm" onClick={handleImport}>
                解析
              </Button>
            </div>
            {err && <p className="mt-1 text-[11px] text-danger">{err}</p>}
            {parsed && (
              <div className="mt-2 rounded-md bg-success/10 px-3 py-2 text-[12px] text-fg">
                已识别协作工程：<span className="font-medium">{parsed.name}</span>
                <span className="text-fg-faint">（ID {parsed.projectId}）</span>
              </div>
            )}
          </section>

          {/* 诚实说明 */}
          <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2.5 text-[11px] leading-relaxed text-fg-subtle">
            <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
            <span>
              实时多人协同编辑需要自建同步服务（鉴权 + 存储 + WebSocket/CRDT）。当前为桌面端本地版，
              邀请码仅用于标识与对齐同一工程；真正的跨设备实时同步请接入 CloudSyncProvider 后端实现。
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
