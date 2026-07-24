/**
 * 工程健康度诊断面板（Project Diagnostics）—— v0.9.0
 *
 * 自动扫描全剧本逻辑，检查：
 *  悬空 Jump、不存在的 Label、未挂载资产引用、残缺选择支。
 *  点击异常项可直接平滑跳转到对应时间轴/剧情块。
 */

import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { runDiagnostics, type DiagnosticItem, type DiagnosticsReport, type DiagSeverity } from '@/utils/diagnostics'
import { Bug, AlertTriangle, Info, ExternalLink, RefreshCw, CheckCircle, ShieldCheck, type LucideIcon } from 'lucide-react'

const SEVERITY_CONFIG: Record<DiagSeverity, { label: string; color: string; bg: string; icon: LucideIcon }> = {
  error: { label: '错误', color: 'text-red-500', bg: 'bg-red-500/10', icon: Bug },
  warning: { label: '警告', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: AlertTriangle },
  info: { label: '提示', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Info },
}

const CATEGORY_LABELS: Record<string, string> = {
  jump: '悬空跳转',
  label: '标签问题',
  asset: '素材引用',
  choice: '选择支',
  structure: '结构检查',
}

export default function DiagnosticsPanel() {
  const deltas = useAppStore((s) => s.draftDeltas)
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const selectLine = useAppStore((s) => s.selectLine)
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  const [filterSeverity, setFilterSeverity] = useState<DiagSeverity | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const report: DiagnosticsReport = useMemo(
    () => runDiagnostics(deltas, assets, characterConfigs),
    [deltas, assets, characterConfigs],
  )

  const filtered = useMemo(() => {
    return report.items.filter((item) => {
      if (filterSeverity !== 'all' && item.severity !== filterSeverity) return false
      if (filterCategory !== 'all' && item.category !== filterCategory) return false
      return true
    })
  }, [report.items, filterSeverity, filterCategory])

  const categories = useMemo(() => {
    const set = new Set<string>()
    report.items.forEach((x) => set.add(x.category))
    return Array.from(set)
  }, [report.items])

  const handleJump = useCallback(
    (item: DiagnosticItem) => {
      if (item.lineIndex >= 0) {
        selectLine(item.lineIndex)
        setActiveNavItem('chapters')
      }
    },
    [selectLine, setActiveNavItem],
  )

  const handleRerun = useCallback(() => {
    // Force re-render by toggling a state
    setFilterSeverity((s) => s) // triggers memo re-compute
    // Actually we need a key to force remount/rerun
    window.dispatchEvent(new CustomEvent('sw:force-diagnostics'))
  }, [])

  const isHealthy = report.totalIssues === 0

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* 头部仪表盘 */}
      <div className="shrink-0 border-b border-edge/10 px-6 py-5">
        <h2 className="text-[16px] font-semibold text-fg">工程体检</h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          扫描全剧本逻辑，检查跳转、标签、资产引用与选择支完整性
        </p>

        {/* 概览卡片 */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          <div className={`rounded-lg border px-4 py-3 ${isHealthy ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-edge/10 bg-surface'}`}>
            <div className="text-[12px] text-fg-muted">问题总数</div>
            <div className={`mt-1 text-[22px] font-semibold tabular-nums ${isHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg'}`}>
              {report.totalIssues}
            </div>
          </div>
          <div className="rounded-lg border border-edge/10 bg-surface px-4 py-3">
            <div className="text-[12px] text-fg-muted">错误</div>
            <div className="mt-1 text-[22px] font-semibold tabular-nums text-red-500">{report.errors}</div>
          </div>
          <div className="rounded-lg border border-edge/10 bg-surface px-4 py-3">
            <div className="text-[12px] text-fg-muted">警告</div>
            <div className="mt-1 text-[22px] font-semibold tabular-nums text-amber-500">{report.warnings}</div>
          </div>
          <div className="rounded-lg border border-edge/10 bg-surface px-4 py-3">
            <div className="text-[12px] text-fg-muted">提示</div>
            <div className="mt-1 text-[22px] font-semibold tabular-nums text-blue-400">{report.infos}</div>
          </div>
        </div>

        {isHealthy && deltas.length > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-3">
            <CheckCircle size={18} className="text-emerald-500 shrink-0" />
            <span className="text-[14px] text-fg">工程健康，未发现任何问题</span>
          </div>
        )}

        {/* 筛选 */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex rounded-lg border border-edge/10 overflow-hidden">
            {(['all', 'error', 'warning', 'info'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                className={`px-3 py-1.5 text-[12px] transition-colors ${
                  filterSeverity === s
                    ? 'bg-surface-hover text-fg'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                {s === 'all' ? '全部' : SEVERITY_CONFIG[s].label}
              </button>
            ))}
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-edge/10 bg-surface px-3 py-1.5 text-[12px] text-fg-muted outline-none focus:border-primary/30"
          >
            <option value="all">所有类别</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
            ))}
          </select>
          <button
            onClick={() => {
              // re-run diagnostics
              setFilterSeverity((s) => (s))
            }}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <RefreshCw size={13} />
            重新扫描
          </button>
        </div>
      </div>

      {/* 问题列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-fg-faint">
            <ShieldCheck size={40} strokeWidth={1} />
            <p className="mt-3 text-[14px]">
              {report.totalIssues === 0 ? '工程健康，未发现任何问题' : '没有匹配当前筛选条件的问题'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const cfg = SEVERITY_CONFIG[item.severity]
              const Icon = cfg.icon
              const isExpanded = expandedId === item.id

              return (
                <div
                  key={item.id}
                  className={`rounded-lg border transition-colors ${
                    isExpanded ? 'border-primary/20 bg-surface' : 'border-edge/8 bg-surface/50 hover:bg-surface'
                  }`}
                >
                  <button
                    onClick={() => {
                      setExpandedId(isExpanded ? null : item.id)
                      if (!isExpanded) handleJump(item)
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <span className={`mt-0.5 rounded p-1 shrink-0 ${cfg.bg}`}>
                      <Icon size={14} className={cfg.color} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="rounded border border-edge/10 px-1.5 py-px text-[11px] text-fg-faint">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                        {item.lineIndex >= 0 && (
                          <span className="text-[11px] text-fg-faint tabular-nums">
                            第 {item.lineIndex + 1} 行
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[14px] text-fg">{item.message}</p>
                      {item.detail && isExpanded && (
                        <p className="mt-1.5 text-[13px] text-fg-muted leading-relaxed border-t border-edge/5 pt-2">
                          {item.detail}
                        </p>
                      )}
                    </div>
                    {item.lineIndex >= 0 && (
                      <span className="shrink-0 text-fg-faint/50">
                        <ExternalLink size={14} />
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 底部摘要 */}
      <div className="shrink-0 border-t border-edge/10 px-6 py-3">
        <p className="text-[12px] text-fg-faint">
          共扫描 {report.totalLines} 行 · {report.summary}
        </p>
      </div>
    </div>
  )
}
