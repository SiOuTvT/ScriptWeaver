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
  Cloud, Clock, FileText, Image, User, HardDrive,
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
    <div className={`px-4 py-3 ${color} border-b border-edge/5 last:border-b-0`}>
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
                <span key={i} className="rounded-md bg-surface-3 px-2.5 py-1 text-[12px] text-fg-subtle">{ch}</span>
              ))}
            </div>
          )}
        </div>
        <span className="mt-0.5 text-[11px] text-fg-faint">{isExpanded ? '收起' : '展开'}</span>
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
      {/* ====== 沉浸式页头 ====== */}
      <div className="shrink-0 border-b border-edge/10 px-6 pt-6 pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2">
            <GitBranch size={22} strokeWidth={1.5} className="text-signal" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold text-fg">版本历史</h2>
            <p className="mt-1 text-[14px] text-fg-subtle">
              编辑停顿 4 分钟或手动保存时自动静默备份，随时回滚到任一关键节点。
              <span className="ml-2 inline-flex items-center gap-1 text-fg-muted"><Cloud size={12} strokeWidth={1.75} /> 本地存储，无需网络</span>
            </p>
          </div>
        </div>
      </div>

      {/* ====== 创建栏 ====== */}
      <div className="shrink-0 flex items-center gap-3 border-b border-edge/8 px-6 py-3 bg-surface-1/50">
        <input
          ref={labelRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
          placeholder="快照标签（可选，如「第一章完成」）"
          className="flex-1 rounded-lg border border-edge/15 bg-surface-3 px-3 py-2.5 text-[14px] text-fg outline-none focus:border-signal/60 transition-colors"
        />
        <Button variant="primary" size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => void handleCreate()}>
          创建快照
        </Button>
      </div>

      {/* ====== 主内容：列表 + Diff 侧栏 ====== */}
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
              {list.map((s) => (
                <li
                  key={s.id}
                  className={`group flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-all duration-200 ${
                    diffMode === s.id
                      ? 'border-primary/20 bg-primary/[0.04] shadow-1'
                      : 'border-edge/10 bg-surface-2 shadow-1 hover:-translate-y-0.5 hover:border-edge/15 hover:shadow-2'
                  }`}
                >
                  {/* 时间轴装饰线 */}
                  <div className="hidden items-center self-stretch lg:flex">
                    <div className={`w-0.5 h-full rounded-full ${diffMode === s.id ? 'bg-primary/30' : 'bg-edge/10'}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="truncate text-[14px] font-medium text-fg">{s.label}</span>
                      {s.auto && (
                        <span className="shrink-0 rounded-md bg-surface-3 px-2 py-px text-[11px] text-fg-faint">自动</span>
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

                  {/* 操作按钮组 */}
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => void handleCompare(s)}
                      title="与当前版本对比"
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <GitCompare size={13} strokeWidth={1.75} />
                      {diffMode === s.id && diffLoading ? '加载中…' : '对比'}
                    </button>
                    <button
                      onClick={() => void handleRestore(s)}
                      title="回滚到此版本"
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <RotateCcw size={13} strokeWidth={1.75} /> 回滚
                    </button>
                    <button
                      onClick={() => void handleDelete(s)}
                      title="删除快照"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-danger/[0.06] hover:text-danger"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Diff 对比结果侧栏 */}
        {diffMode && diffResult && (
          <div className="w-[42%] shrink-0 border-l border-edge/10 overflow-y-auto bg-surface-1">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-edge/8 bg-surface-1/95 backdrop-blur-sm px-5 py-3.5">
              <div className="flex items-center gap-2 min-w-0">
                <GitCompare size={15} strokeWidth={1.75} className="shrink-0 text-signal" />
                <span className="text-[14px] font-medium text-fg">变更对比</span>
                <span className="text-[12px] text-fg-faint ml-1">{diffResult.summary}</span>
              </div>
              <button
                onClick={() => { setDiffMode(null); setDiffResult(null); setExpandedDiffs(new Set()) }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-faint hover:text-fg transition-colors hover:bg-surface-hover"
              >
                ✕
              </button>
            </div>

            {diffResult.lineDiffs.filter((d) => d.type !== 'unchanged').length === 0 ? (
              <div className="px-4 py-16 text-center text-[14px] text-fg-muted">当前内容与快照完全一致，无差异</div>
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
      </div>

      {/* 页脚提示 */}
      <div className="shrink-0 border-t border-edge/10 px-6 py-3 text-[12px] text-fg-muted">
        当前为本地版本库。接入自建云同步服务后，快照可跨设备恢复——详见「协作空间」。
      </div>
    </div>
  )
}
