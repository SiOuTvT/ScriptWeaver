/**
 * VersionHistory v1.1.0 - 版本历史全屏页面（深度 UI 重做）
 * 沉浸式页头 + 快照时间线 + 对比侧栏，不再是从弹窗拉伸的粗糙样式。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
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
  Info, Calendar, Hash,
} from 'lucide-react'

const DIFF_COLORS: Record<string, string> = {
  added: 'border-blue-500/12 bg-blue-500/[0.04]',
  removed: 'border-red-500/12 bg-red-500/[0.04]',
  modified: 'border-violet-500/12 bg-violet-500/[0.04]',
}

const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
          diff.type === 'added' ? 'bg-blue-500' : diff.type === 'removed' ? 'bg-red-500' : 'bg-violet-500'
        }`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-fg">{label}</span>
            <span className={`text-[11px] px-1.5 py-px rounded-full ${
              diff.type === 'added' ? 'bg-blue-500/10 text-blue-600' :
              diff.type === 'removed' ? 'bg-red-500/10 text-red-600' :
              'bg-violet-500/10 text-violet-600'
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
        <span className="mt-0.5 text-[11px] text-fg-faint">{isExpanded ? '收起' : '展开'}</span>
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
          {/* Quick Actions */}
          <div className="flex gap-2">
            <button onClick={() => void onRestore(selected)} className="flex-1 rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[12px] font-medium text-fg hover:bg-surface-hover transition-colors flex items-center justify-center gap-1.5">
              <RotateCcw size={12} strokeWidth={1.75} />回滚
            </button>
            <button onClick={() => void onCompare(selected)} className="flex-1 rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[12px] font-medium text-fg hover:bg-surface-hover transition-colors flex items-center justify-center gap-1.5">
              <GitCompare size={12} strokeWidth={1.75} />对比
            </button>
            <button onClick={() => void onDelete(selected)} className="rounded-xl border border-danger/15 bg-surface-2 px-3 py-2 text-[12px] text-danger hover:bg-danger/[0.04] transition-colors flex items-center justify-center">
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>

          {/* Meta info */}
          <div className="rounded-xl border border-edge/10 bg-surface-2 p-3 space-y-2.5">
            <StatRow icon={Clock} label="创建时间" value={fmtTime(selected.createdAt)} />
            <StatRow icon={Calendar} label="快照类型" value={selected.auto ? '自动备份' : '手动快照'} />
            <StatRow icon={FileText} label="脚本行" value={`${selected.lineCount} 行`} />
            <StatRow icon={Image} label="素材" value={`${selected.assetCount} 个`} />
            <StatRow icon={User} label="角色" value={`${selected.charCount} 个`} />
            <StatRow icon={HardDrive} label="大小" value={fmtSize(selected.sizeBytes)} />
          </div>

          <div className="rounded-xl border border-edge/10 bg-surface-2 p-3">
            <div className="text-[10px] text-fg-faint mb-1">快照 ID</div>
            <code className="text-[10px] text-fg-muted font-mono break-all">{selected.id}</code>
          </div>
        </div>
      </div>
    )
  }

  // No selection: show global stats
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
            <div className="text-[11px] text-fg-muted mt-0.5">版本快照总数</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{totalLines}</div>
              <div className="text-[10px] text-fg-faint">脚本行</div>
            </div>
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{totalAssets}</div>
              <div className="text-[10px] text-fg-faint">素材</div>
            </div>
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{totalChars}</div>
              <div className="text-[10px] text-fg-faint">角色</div>
            </div>
            <div className="rounded-lg bg-surface p-2.5 text-center">
              <div className="text-[16px] font-semibold text-fg tabular-nums">{fmtSize(totalSize)}</div>
              <div className="text-[10px] text-fg-faint">总容量</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-edge/10 bg-surface-2 p-3">
          <div className="text-[11px] font-medium text-fg-muted mb-2">操作提示</div>
          <ul className="space-y-1.5 text-[11px] text-fg-subtle">
            <li>点击左侧快照可查看详情</li>
            <li>选中后点击「对比」查看差异</li>
            <li>「回滚」将覆盖当前所有未保存改动</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function VersionHistory() {
  const [list, setList] = useState<VersionSnapshotMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const labelRef = useRef<HTMLInputElement>(null)

  const [diffMode, setDiffMode] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffResult, setDiffResult] = useState<SnapshotDiff | null>(null)
  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
      if (!json) { toast('读取快照失败', 'error'); return }
      const ok = await restoreProjectFromJson(json, useAppStore.getState().projectRoot)
      if (ok) { toast('已回滚到所选版本', 'success') }
      else { toast('回滚失败：快照内容已损坏', 'error') }
    },
    [],
  )

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

  const toggleDiffExpand = useCallback((idx: number) => {
    setExpandedDiffs((prev) => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next })
  }, [])

  const handleDelete = useCallback(async (s: VersionSnapshotMeta) => {
    if (!window.confirm(`确定删除快照「${s.label}」？此操作不可撤销。`)) return
    const ok = await removeSnapshot(s.id)
    if (ok) { toast('已删除快照', 'info'); void refresh() }
    else { toast('删除失败', 'error') }
  }, [refresh])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ═══ Header ═══ */}
      <div className="shrink-0 border-b border-edge/10 px-5 py-3">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.06]">
            <GitBranch size={20} strokeWidth={1.5} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="signal-dot" />
              <span className="eyebrow">Version History</span>
            </div>
            <h2 className="t-h2 mt-1.5">版本历史</h2>
            <p className="mt-0.5 t-subtitle">
              编辑停顿 4 分钟或手动保存时自动静默备份，随时回滚到任一关键节点。
              <span className="ml-2 inline-flex items-center gap-1 text-fg-muted"><Cloud size={11} strokeWidth={1.75} /> 本地存储，无需网络</span>
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
          onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
          placeholder="快照标签（可选，如「第一章完成」）"
          className="flex-1 rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[13px] text-fg outline-none placeholder-fg-faint focus:ring-1 focus:ring-primary/30 transition-colors"
        />
        <Button variant="primary" size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => void handleCreate()}>
          创建快照
        </Button>
      </div>

      {/* ====== 主内容：列表 + 右侧面板 ====== */}
      <div className="flex flex-1 min-h-0">
        {/* 快照列表 */}
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
                编辑停顿期间会自动建档；也可点上方「创建快照」手动留存关键节点。
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((s) => {
                const isSelected = selectedId === s.id && diffMode !== s.id
                return (
                <li
                  key={s.id}
                  onClick={() => { if (diffMode !== s.id) setSelectedId(isSelected ? null : s.id) }}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-200 cursor-pointer ${
                    diffMode === s.id
                      ? 'border-primary/20 bg-primary/[0.04] shadow-1'
                      : isSelected
                      ? 'border-primary/15 bg-primary/[0.03] shadow-1'
                      : 'border-edge/10 bg-surface-2 shadow-1 hover:-translate-y-0.5 hover:border-edge/15 hover:shadow-2'
                  }`}
                >
                  <div className="hidden items-center self-stretch lg:flex">
                    <div className={`w-0.5 h-full rounded-full ${diffMode === s.id ? 'bg-primary/30' : isSelected ? 'bg-primary/20' : 'bg-edge/10'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="truncate text-[14px] font-medium text-fg">{s.label}</span>
                      {s.auto && (
                        <span className="shrink-0 rounded-full border border-edge/10 bg-surface px-2 py-px text-[11px] text-fg-muted">自动</span>
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
                      title="与当前版本对比"
                      className="flex h-8 items-center gap-1 rounded-xl px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <GitCompare size={13} strokeWidth={1.75} />
                      {diffMode === s.id && diffLoading ? '…' : ''}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleRestore(s) }}
                      title="回滚到此版本"
                      className="flex h-8 items-center gap-1 rounded-xl px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <RotateCcw size={13} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(s) }}
                      title="删除快照"
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-faint transition-colors hover:bg-danger/[0.06] hover:text-danger"
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

        {/* ═══ 右侧：Diff / 详情 / 统计 = 始终占位不折叠 ═══ */}
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
            totalLines={list.reduce((a,s)=>a+s.lineCount,0)}
            totalAssets={list.reduce((a,s)=>a+s.assetCount,0)}
            totalChars={list.reduce((a,s)=>a+s.charCount,0)}
            totalSize={list.reduce((a,s)=>a+s.sizeBytes,0)}
            onRestore={handleRestore}
            onCompare={handleCompare}
            onDelete={handleDelete}
            onDeselect={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* 页脚提示 */}
      <div className="shrink-0 border-t border-edge/10 px-6 py-3 text-[12px] text-fg-muted">
        当前为本地版本库。接入自建云同步服务后，快照可跨设备恢复——详见「协作空间」。
      </div>
    </div>
  )
}
