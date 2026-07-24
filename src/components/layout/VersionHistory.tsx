/**
 * 版本历史弹窗（v0.6.0 需求 4/4 · 云端归档与版本控制）
 *
 * 提供：手动创建快照、查看历史改动记录（行/素材/角色数、体积）、
 * 一键回滚到任意时间点。本地版本库落地于 userData/snapshots（桌面端无后端时的「云端」等价物）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { VersionSnapshotMeta, LineDelta } from '@/core/types'
import { listSnapshots, createSnapshot, readSnapshot, removeSnapshot } from '@/utils/cloudSync'
import { restoreProjectFromJson, serializeProject, deserializeProject } from '@/utils/projectFile'
import { diffDeltas, type LineDiff, type DiffType } from '@/utils/diffEngine'
import { toast } from '@/utils/toast'
import { Button } from '@/components/ui'
import { GitBranch, RotateCcw, Trash2, Plus, Cloud, X, GitCompare, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const DIFF_COLORS: Record<DiffType, string> = {
  added: 'border-emerald-500/20 bg-emerald-500/5',
  removed: 'border-red-500/20 bg-red-500/5',
  modified: 'border-amber-500/20 bg-amber-500/5',
  unchanged: '',
}

const DIFF_LABELS: Record<DiffType, string> = {
  added: '+ 新增',
  removed: '- 删除',
  modified: '~ 修改',
  unchanged: '',
}

function DiffRow({ diff, isExpanded, onToggle }: { diff: LineDiff; isExpanded: boolean; onToggle: () => void }) {
  const cls = DIFF_COLORS[diff.type]
  const label = DIFF_LABELS[diff.type]
  const line = diff.newLine || diff.oldLine
  const hasDetail = diff.changes && diff.changes.length > 0

  return (
    <div className={`px-3 py-2 ${cls}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        <span className="text-[11px] font-medium text-fg-faint tabular-nums w-8 shrink-0">
          {label}
        </span>
        <span className="text-[11px] text-fg-faint tabular-nums w-8 shrink-0">
          行 {diff.index + 1}
        </span>
        <span className="flex-1 truncate text-[13px] text-fg">
          {line?.dialogue || line?.speaker || line?.label || line?.prompt || '(空行)'}
        </span>
        {hasDetail && (
          <span className="shrink-0 text-fg-faint">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="mt-1.5 ml-16 space-y-1">
          {diff.type === 'modified' && diff.oldLine && diff.newLine && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-red-500/15 bg-red-500/3 px-2 py-1.5">
                <div className="text-[10px] text-red-400/70 mb-0.5">旧 (快照)</div>
                <div className="text-[12px] text-fg leading-relaxed break-words">
                  {diff.oldLine.dialogue || diff.oldLine.speaker || diff.oldLine.label || diff.oldLine.prompt || '(空)'}
                </div>
              </div>
              <div className="rounded border border-emerald-500/15 bg-emerald-500/3 px-2 py-1.5">
                <div className="text-[10px] text-emerald-400/70 mb-0.5">新 (当前)</div>
                <div className="text-[12px] text-fg leading-relaxed break-words">
                  {diff.newLine.dialogue || diff.newLine.speaker || diff.newLine.label || diff.newLine.prompt || '(空)'}
                </div>
              </div>
            </div>
          )}
          {diff.changes && diff.changes.length > 0 && (
            <div className="space-y-0.5">
              {diff.changes.map((c, ci) => (
                <div key={ci} className="text-[12px] text-fg-muted ml-1">· {c}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function VersionHistory({ open, onClose }: Props) {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const [list, setList] = useState<VersionSnapshotMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')
  const labelRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await listSnapshots()
      setList(r)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const handleCreate = useCallback(async () => {
    const json = serializeProject(
      useAppStore.getState().draftDeltas,
      useAppStore.getState().characterConfigs,
      useAppStore.getState().assets,
    )
    const ok = await createSnapshot(json, label.trim() || '手动快照', false)
    if (ok) {
      toast('已创建版本快照', 'success')
      setLabel('')
      void refresh()
    } else {
      toast('创建快照失败', 'error')
    }
  }, [label, refresh])

  const handleRestore = useCallback(
    async (s: VersionSnapshotMeta) => {
      if (!window.confirm(`确定回滚到「${s.label}」（${fmtTime(s.createdAt)}）？\n当前未保存的改动将被该版本覆盖。`)) return
      const json = await readSnapshot(s.id)
      if (!json) {
        toast('读取快照失败', 'error')
        return
      }
      const ok = await restoreProjectFromJson(json, useAppStore.getState().projectRoot)
      if (ok) {
        toast('已回滚到所选版本', 'success')
        onClose()
      } else {
        toast('回滚失败：快照内容已损坏', 'error')
      }
    },
    [onClose],
  )

  const handleCompare = useCallback(async (s: VersionSnapshotMeta) => {
    setDiffLoading(true)
    setDiffMode(s.id)
    setDiffResult(null)
    try {
      const json = await readSnapshot(s.id)
      if (!json) {
        toast('读取快照失败', 'error')
        setDiffMode(null)
        return
      }
      const saved = deserializeProject(json)
      if (!saved) {
        toast('快照内容已损坏，无法比对', 'error')
        setDiffMode(null)
        return
      }
      const current = useAppStore.getState().draftDeltas
      const result = diffDeltas(saved.deltas, current)
      setDiffResult(result)
    } finally {
      setDiffLoading(false)
    }
  }, [])

  const toggleDiffExpand = useCallback((idx: number) => {
    setExpandedDiffs((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleDelete = useCallback(
    async (s: VersionSnapshotMeta) => {
      if (!window.confirm(`确定删除快照「${s.label}」？此操作不可撤销。`)) return
      const ok = await removeSnapshot(s.id)
      if (ok) {
        toast('已删除快照', 'info')
        void refresh()
      } else {
        toast('删除失败', 'error')
      }
    },
    [refresh],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-edge/15 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-3">
          <GitBranch size={16} strokeWidth={1.75} className="text-signal" />
          <span className="eyebrow">版本历史</span>
          <span className="ml-1 flex items-center gap-1 text-[11px] text-fg-faint">
            <Cloud size={11} strokeWidth={1.75} /> 本地静默备份
          </span>
          <button
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="关闭"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* 创建栏 */}
        <div className="flex items-center gap-2 border-b border-edge/10 bg-surface-1 px-4 py-3">
          <input
            ref={labelRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            placeholder="快照标签（可选，如「第一章完成」）"
            className="flex-1 rounded-md border border-edge/15 bg-surface-3 px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-signal/60"
          />
          <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.75} />} onClick={() => void handleCreate()}>
            创建快照
          </Button>
        </div>

        {/* 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="px-3 py-8 text-center text-[13px] text-fg-faint">加载中…</p>
          ) : list.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-[13px] text-fg-subtle">还没有任何版本快照</p>
              <p className="mt-1 text-[12px] text-fg-faint">
                编辑停顿 4 分钟或每次保存会自动建档；也可点上方「创建快照」手动留存关键节点。
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {list.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-edge/12 hover:bg-surface-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-fg">{s.label}</span>
                      {s.auto && (
                        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-faint">自动</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-fg-faint">
                      <span>{fmtTime(s.createdAt)}</span>
                      <span>{s.lineCount} 行</span>
                      <span>{s.assetCount} 素材</span>
                      <span>{s.charCount} 角色</span>
                      <span>{fmtSize(s.sizeBytes)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleCompare(s)}
                      title="与当前版本对比"
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <GitCompare size={13} strokeWidth={1.75} />
                      {diffMode === s.id && diffLoading ? '加载中…' : '对比'}
                    </button>
                    <button
                      onClick={() => void handleRestore(s)}
                      title="回滚到此版本"
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <RotateCcw size={13} strokeWidth={1.75} /> 回滚
                    </button>
                    <button
                      onClick={() => void handleDelete(s)}
                      title="删除快照"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Diff 对比结果 */}
        {diffMode && diffResult && (
          <div className="border-t border-edge/10 max-h-[35vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-edge/8 bg-surface-1/95 backdrop-blur-sm px-4 py-2.5">
              <div className="flex items-center gap-2">
                <GitCompare size={14} strokeWidth={1.75} className="text-fg-muted" />
                <span className="text-[13px] font-medium text-fg">变更对比</span>
                <span className="text-[12px] text-fg-faint">{diffResult.summary}</span>
              </div>
              <button
                onClick={() => { setDiffMode(null); setDiffResult(null); setExpandedDiffs(new Set()) }}
                className="flex h-6 w-6 items-center justify-center rounded text-fg-faint hover:text-fg"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>

            {diffResult.lineDiffs.filter((d) => d.type !== 'unchanged').length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-fg-faint">
                当前内容与快照完全一致，无差异
              </div>
            ) : (
              <div className="divide-y divide-edge/5">
                {diffResult.lineDiffs
                  .filter((d) => d.type !== 'unchanged')
                  .map((d) => (
                    <DiffRow
                      key={d.index}
                      diff={d}
                      isExpanded={expandedDiffs.has(d.index)}
                      onToggle={() => toggleDiffExpand(d.index)}
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-edge/10 px-4 py-2 text-[11px] text-fg-faint">
          提示：当前为本地版本库（桌面端无后端）。接入自建云同步服务后，快照可跨设备恢复 —— 详见「协作」中的邀请码。
        </div>
      </div>
    </div>
  )
}
