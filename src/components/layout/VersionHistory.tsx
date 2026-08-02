/**
 * VersionHistory v1.1.0 — 版本历史全屏页面
 * 修复：真正的快照回退 + 自动快照机制 + 清晰的状态管理
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listSnapshots, createSnapshot, readSnapshot, removeSnapshot,
} from '@/utils/cloudSync'
import { restoreProjectFromJson, serializeProject, deserializeProject } from '@/utils/projectFile'
import { diffDeltas, type LineDiff, type SnapshotDiff } from '@/utils/diffEngine'
import type { VersionSnapshotMeta } from '@/core/types'
import { useAppStore } from '@/stores/appStore'
import { toast } from '@/utils/toast'
import { Button } from '@/components/ui'
import {
  GitBranch, GitCompare, RotateCcw, Trash2, Plus,
  Cloud, Clock, FileText, Image, User, HardDrive, X,
  Info, ShieldAlert,
} from 'lucide-react'

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const AUTO_SNAPSHOT_IDLE_MS = 4 * 60 * 1000 // 4 分钟无操作自动快照
const MIN_DELTA_COUNT_FOR_AUTO = 1 // 至少有 1 行剧本才自动快照

const DIFF_COLORS: Record<string, string> = {
  added: 'border-[rgb(var(--c-success)/0.12)] bg-[rgb(var(--c-success)/0.04)]',
  removed: 'border-[rgb(var(--c-danger)/0.12)] bg-[rgb(var(--c-danger)/0.04)]',
  modified: 'border-[rgb(var(--c-primary)/0.12)] bg-[rgb(var(--c-primary)/0.04)]',
}

const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return iso }
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ═══════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════

/** 自动快照定时器：每 AUTO_SNAPSHOT_IDLE_MS 检查是否有新内容需要快照 */
function useAutoSnapshot() {
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const lastDeltaCount = useRef(0)

  useEffect(() => {
    // 先创建一次当前状态作为 baseline
    lastDeltaCount.current = useAppStore.getState().draftDeltas.length

    timerRef.current = setInterval(async () => {
      const store = useAppStore.getState()
      const currentCount = store.draftDeltas.length

      // 只有剧本行数增加（或变化）且超过阈值才自动快照
      if (currentCount >= MIN_DELTA_COUNT_FOR_AUTO && currentCount !== lastDeltaCount.current) {
        lastDeltaCount.current = currentCount
        try {
          const json = serializeProject(store.draftDeltas, store.characterConfigs, store.assets)
          const ok = await createSnapshot(
            json,
            `自动备份 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
            true,
          )
          if (ok) {
            console.log(`[VersionHistory] 自动快照已创建 (${currentCount} 行)`)
          }
        } catch { /* 静默失败，不打扰用户 */ }
      }
    }, AUTO_SNAPSHOT_IDLE_MS)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])
}

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

function DiffRow({ diff, isExpanded, onToggle }: {
  diff: LineDiff
  isExpanded: boolean
  onToggle: () => void
}) {
  const color = DIFF_COLORS[diff.type] ?? 'border-edge/10 bg-surface-2'
  const label = diff.oldLine?.label || diff.newLine?.label || '行 ' + (diff.index + 1)
  return (
    <div className={`px-4 py-3 ${color} border-b border-edge/10 last:border-b-0`}>
      <div className="flex items-start gap-3 cursor-pointer" onClick={onToggle}>
        <span className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${
          diff.type === 'added' ? 'bg-[rgb(var(--c-success))]' : diff.type === 'removed' ? 'bg-[rgb(var(--c-danger))]' : 'bg-[rgb(var(--c-primary))]'
        }`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-fg">{label}</span>
            <span className={`text-[12px] px-1.5 py-px rounded-full ${
              diff.type === 'added' ? 'bg-[rgb(var(--c-success)/0.1)] text-[rgb(var(--c-success))]' :
              diff.type === 'removed' ? 'bg-[rgb(var(--c-danger)/0.1)] text-[rgb(var(--c-danger))]' :
              'bg-[rgb(var(--c-primary)/0.1)] text-[rgb(var(--c-primary))]'
            }`}>
              {diff.type === 'added' ? '新增' : diff.type === 'removed' ? '删除' : '修改'}
            </span>
          </div>
          {isExpanded && diff.changes && diff.changes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {diff.changes.map((ch, i) => (
                <span key={i} className="rounded-lg border border-edge/10 bg-surface px-2.5 py-1 text-[12px] text-fg-subtle">{ch}</span>
              ))}
            </div>
          )}
        </div>
        <span className="mt-0.5 text-[12px] text-fg-faint">{isExpanded ? '收起' : '展开'}</span>
      </div>
    </div>
  )
}

function DiffSidebar({ diffResult, expandedDiffs, onToggleDiff, onClose }: {
  diffResult: SnapshotDiff
  expandedDiffs: Set<number>
  onToggleDiff: (idx: number) => void
  onClose: () => void
}) {
  return (
    <div className="w-[42%] shrink-0 border-l border-edge/10 overflow-y-auto bg-surface">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-edge/10 bg-surface/95 backdrop-blur-sm px-5 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <GitCompare size={15} strokeWidth={1.75} className="shrink-0 text-primary" />
          <span className="text-[14px] font-medium text-fg">变更对比</span>
          <span className="text-[12px] text-fg-muted ml-1">{diffResult.summary}</span>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors">
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      {diffResult.lineDiffs.filter((d) => d.type !== 'unchanged').length === 0 ? (
        <div className="px-4 py-16 text-center text-[13px] text-fg-muted">当前内容与快照完全一致，无差异</div>
      ) : (
        <div className="divide-y divide-edge/10">
          {diffResult.lineDiffs.filter((d) => d.type !== 'unchanged').map((d) => (
            <DiffRow key={d.index} diff={d} isExpanded={expandedDiffs.has(d.index)} onToggle={() => onToggleDiff(d.index)} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatRow({ icon: Icon, label, value }: { icon: React.ComponentType<any>; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-fg-muted flex items-center gap-1.5"><Icon size={12} strokeWidth={1.75} />{label}</span>
      <span className="text-fg font-medium tabular-nums">{value}</span>
    </div>
  )
}

function RightInfoPanel({ selected, total, totalLines, totalAssets, totalChars, totalSize, onRestore, onCompare, onDelete, onDeselect }: {
  selected: VersionSnapshotMeta | null
  total: number; totalLines: number; totalAssets: number; totalChars: number; totalSize: number
  onRestore: (s: VersionSnapshotMeta) => void
  onCompare: (s: VersionSnapshotMeta) => void
  onDelete: (s: VersionSnapshotMeta) => void
  onDeselect: () => void
}) {
  if (selected) {
    return (
      <div className="w-[340px] shrink-0 border-l border-edge/10 overflow-y-auto bg-surface">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-edge/10 bg-surface/95 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/[0.06]">
              <GitBranch size={13} strokeWidth={1.75} className="text-primary" />
            </div>
            <span className="text-[13px] font-semibold text-fg truncate">{selected.label}</span>
          </div>
          <button onClick={onDeselect} className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors">
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* 回滚警告 */}
          <div className="rounded-xl border border-warning/15 bg-warning/[0.04] p-3 flex items-start gap-2">
            <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warning" />
            <span className="text-[12px] text-fg-muted">
              回滚将覆盖当前所有未保存的改动。建议先创建快照保存当前状态。
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => void onRestore(selected)}
              className="flex-1 rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[12px] font-medium text-fg hover:bg-surface-hover transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={12} strokeWidth={1.75} />回滚
            </button>
            <button
              onClick={() => void onCompare(selected)}
              className="flex-1 rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[12px] font-medium text-fg hover:bg-surface-hover transition-colors flex items-center justify-center gap-1.5"
            >
              <GitCompare size={12} strokeWidth={1.75} />对比
            </button>
            <button
              onClick={() => void onDelete(selected)}
              className="rounded-xl border border-danger/15 bg-surface-2 px-3 py-2 text-[12px] text-danger hover:bg-danger/[0.04] transition-colors flex items-center justify-center"
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>

          {/* Meta info */}
          <div className="rounded-xl border border-edge/10 bg-surface-2 p-3 space-y-2.5">
            <StatRow icon={Clock} label="创建时间" value={fmtTime(selected.createdAt)} />
            <StatRow icon={FileText} label="脚本行" value={`${selected.lineCount} 行`} />
            <StatRow icon={Image} label="素材" value={`${selected.assetCount} 个`} />
            <StatRow icon={User} label="角色" value={`${selected.charCount} 个`} />
            <StatRow icon={HardDrive} label="大小" value={fmtSize(selected.sizeBytes)} />
          </div>
        </div>
      </div>
    )
  }

  if (total === 0) return null

  return (
    <div className="w-[340px] shrink-0 border-l border-edge/10 overflow-y-auto bg-surface">
      <div className="sticky top-0 z-10 border-b border-edge/10 bg-surface/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Info size={13} strokeWidth={1.75} className="text-primary" />
          </div>
          <span className="text-[13px] font-semibold text-fg">版本库统计</span>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="rounded-xl border border-edge/10 bg-surface-2 p-4">
          <div className="text-center mb-3">
            <div className="text-[28px] font-semibold text-primary tabular-nums">{total}</div>
            <div className="text-[12px] text-fg-muted mt-0.5">版本快照总数</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{totalLines}</div>
              <div className="text-[12px] text-fg-faint">脚本行</div>
            </div>
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{totalAssets}</div>
              <div className="text-[12px] text-fg-faint">素材</div>
            </div>
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{totalChars}</div>
              <div className="text-[12px] text-fg-faint">角色</div>
            </div>
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{fmtSize(totalSize)}</div>
              <div className="text-[12px] text-fg-faint">总容量</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-edge/10 bg-surface-2 p-3">
          <div className="text-[12px] font-medium text-fg-muted mb-2">操作提示</div>
          <ul className="space-y-1.5 text-[12px] text-fg-subtle">
            <li>点击左侧快照可查看详情</li>
            <li>选中后点击「对比」查看与当前版本的差异</li>
            <li>「回滚」将把工作区恢复到该快照状态</li>
            <li>编辑期间每 4 分钟自动静默备份</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════

export default function VersionHistory() {
  const [list, setList] = useState<VersionSnapshotMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const labelRef = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

  const [diffMode, setDiffMode] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffResult, setDiffResult] = useState<SnapshotDiff | null>(null)
  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 启用自动快照定时器
  useAutoSnapshot()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const items = await listSnapshots()
      setList(items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ── Create Snapshot ──
  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const json = serializeProject(
        useAppStore.getState().draftDeltas,
        useAppStore.getState().characterConfigs,
        useAppStore.getState().assets,
      )
      const ok = await createSnapshot(json, label.trim() || '手动快照', false)
      if (ok) {
        toast('已创建版本快照', 'success')
        setLabel('')
        await refresh()
      } else {
        toast('创建快照失败，请检查项目是否已保存', 'error')
      }
    } finally {
      setCreating(false)
    }
  }, [label, refresh])

  // ── Restore (Rollback) ──
  const handleRestore = useCallback(
    async (s: VersionSnapshotMeta) => {
      // 先问用户是否要保存当前状态为快照
      const doBackup = window.confirm(
        `即将回滚到「${s.label}」（${fmtTime(s.createdAt)}）。\n\n` +
        '当前未保存的改动将被覆盖。\n' +
        '是否先创建一个当前状态的备份快照？\n\n' +
        '—— 点击「确定」先备份再回滚\n' +
        '—— 点击「取消」直接回滚（不备份当前状态）',
      )

      if (doBackup) {
        try {
          const currentJson = serializeProject(
            useAppStore.getState().draftDeltas,
            useAppStore.getState().characterConfigs,
            useAppStore.getState().assets,
          )
          await createSnapshot(
            currentJson,
            `回滚前备份 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
            true,
          )
        } catch { /* 备份失败不阻断回滚 */ }
      }

      setRestoring(s.id)
      try {
        const json = await readSnapshot(s.id)
        if (!json) {
          toast('读取快照失败', 'error')
          return
        }
        const ok = await restoreProjectFromJson(json, useAppStore.getState().projectRoot)
        if (ok) {
          toast(`已回滚到「${s.label}」`, 'success')
          setDiffMode(null)
          setDiffResult(null)
          setSelectedId(null)
          // 刷新列表以显示可能新增的备份快照
          await refresh()
        } else {
          toast('回滚失败：快照内容已损坏', 'error')
        }
      } finally {
        setRestoring(null)
      }
    },
    [refresh],
  )

  // ── Compare ──
  const handleCompare = useCallback(async (s: VersionSnapshotMeta) => {
    if (diffMode === s.id) { setDiffMode(null); setDiffResult(null); return }
    setDiffLoading(true)
    setDiffMode(s.id)
    setDiffResult(null)
    try {
      const json = await readSnapshot(s.id)
      if (!json) { toast('读取快照失败', 'error'); setDiffMode(null); return }
      const saved = deserializeProject(json)
      if (!saved) { toast('快照内容已损坏，无法比对', 'error'); setDiffMode(null); return }
      const current = useAppStore.getState().draftDeltas
      const result = diffDeltas(saved.deltas, current)
      setDiffResult(result)
    } finally { setDiffLoading(false) }
  }, [diffMode])

  // ── Toggle Diff Expand ──
  const toggleDiffExpand = useCallback((idx: number) => {
    setExpandedDiffs((prev) => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next })
  }, [])

  // ── Delete ──
  const handleDelete = useCallback(async (s: VersionSnapshotMeta) => {
    if (!window.confirm(`确定删除快照「${s.label}」？此操作不可撤销。`)) return
    const ok = await removeSnapshot(s.id)
    if (ok) {
      toast('已删除快照', 'info')
      if (selectedId === s.id) setSelectedId(null)
      if (diffMode === s.id) { setDiffMode(null); setDiffResult(null) }
      await refresh()
    } else {
      toast('删除失败', 'error')
    }
  }, [refresh, selectedId, diffMode])

  // ── Computed ──
  const totalLines = useMemo(() => list.reduce((a, s) => a + s.lineCount, 0), [list])
  const totalAssets = useMemo(() => list.reduce((a, s) => a + s.assetCount, 0), [list])
  const totalChars = useMemo(() => list.reduce((a, s) => a + s.charCount, 0), [list])
  const totalSize = useMemo(() => list.reduce((a, s) => a + s.sizeBytes, 0), [list])

  // ── Render ──
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* ═══ Header ═══ */}
      <div className="shrink-0 border-b border-edge/10 px-5 py-3">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.06]">
            <GitBranch size={20} strokeWidth={1.5} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="signal-dot" />
              <span className="text-[12px] font-semibold uppercase tracking-widest text-fg-faint">Version History</span>
            </div>
            <h2 className="text-[15px] font-semibold text-fg mt-1.5">版本历史</h2>
            <p className="mt-0.5 text-[12px] text-fg-muted">
              编辑期间每 4 分钟自动静默备份，随时回滚到任一关键节点。
              <span className="ml-2 inline-flex items-center gap-1 text-fg-faint"><Cloud size={11} strokeWidth={1.75} /> 本地存储</span>
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Create bar ═══ */}
      <div className="shrink-0 flex items-center gap-3 border-b border-edge/10 px-5 py-3 bg-surface">
        <input
          ref={labelRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !creating && void handleCreate()}
          placeholder="快照标签（可选，如「第一章完成」）—— Enter 快速创建"
          className="flex-1 rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[13px] text-fg outline-none placeholder-fg-faint focus:ring-1 focus:ring-primary/30 transition-colors"
        />
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} strokeWidth={1.75} />}
          onClick={() => void handleCreate()}
          disabled={creating}
        >
          {creating ? '创建中…' : '创建快照'}
        </Button>
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* Snapshot List */}
        <div className={`${diffMode && diffResult ? 'w-[58%]' : 'flex-1'} overflow-y-auto px-4 py-4 transition-all`}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-[14px] text-fg-muted">加载中…</span>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 mb-4">
                <GitBranch size={28} strokeWidth={1.25} className="text-fg-faint/40" />
              </div>
              <p className="text-[14px] font-medium text-fg-subtle mb-1">还没有任何版本快照</p>
              <p className="text-[13px] text-fg-muted text-center max-w-xs">
                编辑期间会自动建档；也可以点上方「创建快照」手动留存关键节点。
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((s) => {
                const isSelected = selectedId === s.id && diffMode !== s.id
                const isBeingRestored = restoring === s.id
                return (
                <li
                  key={s.id}
                  onClick={() => { if (diffMode !== s.id && !restoring) setSelectedId(isSelected ? null : s.id) }}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-200 cursor-pointer ${
                    isBeingRestored ? 'border-primary/30 bg-primary/[0.06] opacity-60' :
                    diffMode === s.id
                      ? 'border-primary/20 bg-primary/[0.04] shadow-1'
                      : isSelected
                      ? 'border-primary/15 bg-primary/[0.03] shadow-1'
                      : 'border-edge/10 bg-surface-2 shadow-1 hover:-translate-y-0.5 hover:border-edge/15 hover:shadow-2'
                  }`}
                >
                  <div className="hidden items-center self-stretch lg:flex">
                    <div className={`w-0.5 h-full rounded-full ${
                      isBeingRestored ? 'bg-primary/40' :
                      diffMode === s.id ? 'bg-primary/30' : isSelected ? 'bg-primary/20' : 'bg-edge/10'
                    }`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="truncate text-[14px] font-medium text-fg">{s.label}</span>
                      {s.auto && (
                        <span className="shrink-0 rounded-full border border-edge/10 bg-surface px-2 py-px text-[12px] text-fg-muted">自动</span>
                      )}
                      {isBeingRestored && (
                        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-px text-[12px] text-primary">回滚中…</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] text-fg-muted">
                      <span className="inline-flex items-center gap-1"><Clock size={11} strokeWidth={1.75} />{fmtTime(s.createdAt)}</span>
                      <span className="inline-flex items-center gap-1"><FileText size={11} strokeWidth={1.75} />{s.lineCount} 行</span>
                      <span className="inline-flex items-center gap-1"><Image size={11} strokeWidth={1.75} />{s.assetCount} 素材</span>
                      <span className="inline-flex items-center gap-1"><User size={11} strokeWidth={1.75} />{s.charCount} 角色</span>
                      <span className="inline-flex items-center gap-1"><HardDrive size={11} strokeWidth={1.75} />{fmtSize(s.sizeBytes)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleCompare(s) }}
                      disabled={!!restoring}
                      title={diffMode === s.id ? '关闭对比' : '与当前版本对比'}
                      className="flex h-8 items-center gap-1 rounded-xl px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40"
                    >
                      <GitCompare size={13} strokeWidth={1.75} />
                      {diffMode === s.id && diffLoading ? '…' : ''}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleRestore(s) }}
                      disabled={!!restoring}
                      title="回滚到此版本"
                      className="flex h-8 items-center gap-1 rounded-xl px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40"
                    >
                      <RotateCcw size={13} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(s) }}
                      disabled={!!restoring}
                      title="删除快照"
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-faint transition-colors hover:bg-danger/[0.06] hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ═══ Right Panel: Diff / Detail / Stats ═══ */}
        {diffMode && diffResult ? (
          <DiffSidebar
            diffResult={diffResult}
            expandedDiffs={expandedDiffs}
            onToggleDiff={toggleDiffExpand}
            onClose={() => { setDiffMode(null); setDiffResult(null); setExpandedDiffs(new Set()) }}
          />
        ) : (
          <RightInfoPanel
            selected={selectedId ? list.find(s => s.id === selectedId) || null : null}
            total={list.length}
            totalLines={totalLines}
            totalAssets={totalAssets}
            totalChars={totalChars}
            totalSize={totalSize}
            onRestore={handleRestore}
            onCompare={handleCompare}
            onDelete={handleDelete}
            onDeselect={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
