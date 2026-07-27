/**
 * PeerBadge - 极客身份徽章组件
 * 无头像、纯文字徽章：[HOST] 主机   [GUEST] 协作者
 */

import { Shield, User } from 'lucide-react'
import type { CollabRole } from '@/collab/types'

interface Props {
  role: 'HOST' | 'GUEST'
  displayName: string
  isSelf?: boolean
  size?: 'sm' | 'md'
}

const ROLE_COLORS: Record<'HOST' | 'GUEST', { bg: string; text: string; border: string }> = {
  HOST: { bg: 'bg-primary/12', text: 'text-primary', border: 'border-primary/30' },
  GUEST: { bg: 'bg-info/10', text: 'text-info', border: 'border-info/25' },
}

export default function PeerBadge({ role, displayName, isSelf, size = 'sm' }: Props) {
  const c = ROLE_COLORS[role]
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-[12px]'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium ${c.bg} ${c.border} ${c.text} ${textSize}`}
      title={isSelf ? `${role === 'HOST' ? '主机' : '协作者'} (你)` : undefined}
    >
      {role === 'HOST' ? <Shield size={11} strokeWidth={1.75} /> : <User size={11} strokeWidth={1.75} />}
      <span className="font-semibold tracking-wide">{role}</span>
      <span className="opacity-80">{displayName}</span>
      {isSelf && <span className="opacity-60 ml-0.5">(你)</span>}
    </span>
  )
}
