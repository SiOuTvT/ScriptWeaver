/**
 * AuditLogHub - 协作审计日志面板
 * 展示所有协同操作的标准化日志，支持跳转定位
 */

import { useState, useMemo } from 'react'
import { useCollabStore } from '@/collab/collabStore'
import { useAppStore } from '@/stores/appStore'
import type { AuditLogEntry } from '@/collab/types'
import { Button } from '@/components/ui'
import PeerBadge from '@/components/collab/PeerBadge'
import {
  History, ArrowRight, Trash2, Search,
  Filter, AlertTriangle, Clock, FileText, Image,
  Users, MessageSquare, GitBranch,
} from 'lucide-react'

const SEVERITY_COLORS: Record<string, string> = {
  info: 'border-l-info/40',
  warning: 'border-l-warning/60 bg-warning/5',
  danger: 'border-l-danger/60 bg-danger/5',
}

const SEVERITY_DOTS: Record<string, string> = {
  info: 'bg-info',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const ACTION_LABELS: Record<string, string> = {
  join: '加入协作',
  leave: '离开协作',
  modify_dialogue: '修改台词',
  modify_background: '修改背景',
  modify_character: '修改角色',
  modify_audio: '修改音频',
  add_line: '添加行',
  delete_line: '删除行',
  move_line: '移动行',
  add_asset: '添加素材',
  delete_asset: '删除素材',
  add_character: '添加角色',
  delete_character: '删除角色',
  modify_choice: '修改选择支',
  modify_label: '修改标签',
  permission_change: '权限变更',
  kick: '被移除',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export default function AuditLogHub() {
  const store = useCollabStore()
  const appStore = useAppStore()
  const [filter, setFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    let logs = [...store.auditLogs].reverse()
    if (filter.trim()) {
      const q = filter.toLowerCase()
      logs = logs.filter(l =>
        l.displayName.toLowerCase().includes(q) ||
        (ACTION_LABELS[l.action] || l.action).toLowerCase().includes(q) ||
        (l.target || '').toLowerCase().includes(q)
      )
    }
    if (severityFilter !== 'all') {
      logs = logs.filter(l => l.severity === severityFilter)
    }
    return logs
  }, [store.auditLogs, filter, severityFilter])

  const handleJumpLine = (detail?: string) => {
    // 尝试从 detail 中提取行号（格式如 "行 L3"）
    if (!detail) return
    const match = detail.match(/L(\d+)/)
    if (match) {
      const num = parseInt(match[1], 10)
      const deltas = appStore.draftDeltas
      const idx = deltas.findIndex(d => d.line_id === `L${num}`)
      if (idx >= 0) {
        appStore.selectLine(idx)
        appStore.setActiveNavItem('chapters')
      }
    }
  }

  if (store.status === 'disconnected') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <History size={28} strokeWidth={1.5} className="text-fg-faint" />
        <p className="text-[13px] text-fg-subtle">未连接协作网络</p>
        <p className="text-[11px] text-fg-faint">连接后可查看协作审计日志</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge/10 px-3 py-2.5">
        <History size={15} strokeWidth={1.75} className="text-fg-muted" />
        <span className="text-[12px] font-semibold text-fg">协作审计日志</span>
        <span className="text-[10px] text-fg-faint ml-1">({store.auditLogs.length})</span>

        <button
          onClick={() => store.clearAuditLogs()}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-fg-faint hover:text-danger transition-colors"
          title="清空日志"
        >
          <Trash2 size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 border-b border-edge/10 px-3 py-1.5">
        <div className="relative flex-1">
          <Search size={12} strokeWidth={1.5} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索操作人或类型..."
            className="w-full rounded border border-edge/12 bg-surface-2 py-1 pl-6 pr-2 text-[11px] text-fg outline-none focus:border-primary/40"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded border border-edge/12 bg-surface-2 px-1.5 py-1 text-[11px] text-fg outline-none"
        >
          <option value="all">全部</option>
          <option value="info">信息</option>
          <option value="warning">警告</option>
          <option value="danger">高危</option>
        </select>
      </div>

      {/* Log List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Clock size={22} strokeWidth={1.5} className="text-fg-faint" />
            <p className="text-[12px] text-fg-subtle">
              {store.auditLogs.length === 0 ? '暂无协作记录' : '无匹配日志'}
            </p>
          </div>
        )}

        {filtered.map((entry) => (
          <div
            key={entry.id}
            className={`border-l-2 px-3 py-2.5 transition-colors hover:bg-surface-hover ${SEVERITY_COLORS[entry.severity] || ''} ${entry.severity === 'danger' ? 'border-l-danger' : 'border-l-transparent'}`}
          >
            <div className="flex items-start gap-2">
              {/* Time */}
              <span className="shrink-0 text-[10px] font-mono text-fg-faint mt-0.5">
                {formatTime(entry.timestamp)}
              </span>

              {/* Dot */}
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOTS[entry.severity]}`} />

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <PeerBadge role={entry.role} displayName={entry.displayName} size="sm" />
                  <span className="text-[12px] text-fg">
                    {ACTION_LABELS[entry.action] || entry.action}
                  </span>
                  {entry.target && (
                    <span className="text-[11px] font-medium text-primary">[{entry.target}]</span>
                  )}
                </div>

                {entry.detail && (
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 truncate text-[11px] text-fg-subtle">{entry.detail}</p>
                    {/* 跳转定位按钮 */}
                    <button
                      onClick={() => handleJumpLine(entry.detail)}
                      className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-primary"
                      title="定位到对应行"
                    >
                      <ArrowRight size={10} strokeWidth={1.75} />
                      定位
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer summary */}
      <div className="border-t border-edge/10 px-3 py-1.5 text-[10px] text-fg-faint">
        共 {store.auditLogs.length} 条操作记录
        {severityFilter !== 'all' && ` · 筛选: ${severityFilter}`}
      </div>
    </div>
  )
}
