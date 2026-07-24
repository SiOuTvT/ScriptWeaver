import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { runDiagnostics, type DiagSeverity, type DiagnosticItem } from '../../utils/diagnostics'
import { Bug, AlertTriangle, Info, ShieldCheck, Zap, Search, SlidersHorizontal } from 'lucide-react'

const SEVERITY_CONFIG: Record<DiagSeverity, { label: string; color: string; bg: string; border: string; dotColor: string }> = {
  error:   { label: '错误', color: 'text-red-400', bg: 'bg-red-500/8', border: 'border-red-500/20', dotColor: 'bg-red-500' },
  warning: { label: '警告', color: 'text-amber-400', bg: 'bg-amber-500/8', border: 'border-amber-500/20', dotColor: 'bg-amber-500' },
  info:    { label: '提示', color: 'text-blue-400', bg: 'bg-blue-500/8', border: 'border-blue-500/20', dotColor: 'bg-blue-500' },
}

const CheckCircle = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

export default function DiagnosticsPanel() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const selectLine = useAppStore((s) => s.selectLine)
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  const [severityFilter, setSeverityFilter] = useState<DiagSeverity | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const report = useMemo(() => runDiagnostics(draftDeltas, assets, characterConfigs), [draftDeltas, assets, characterConfigs])

  const filtered = useMemo(() => {
    let items = report.items
    if (severityFilter !== 'all') items = items.filter((i) => i.severity === severityFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter((i) => i.message.toLowerCase().includes(q))
    }
    return items
  }, [report, severityFilter, searchQuery])

  const handleJump = useCallback((item: DiagnosticItem) => {
    if (item.lineIndex >= 0) {
      selectLine(item.lineIndex)
      setActiveNavItem('chapters')
    }
  }, [selectLine, setActiveNavItem])

  return (
    <div className="flex h-full flex-1 min-w-0 flex-col select-none">
      {/* Header */}
      <div className="shrink-0 border-b border-edge/10 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-semibold text-fg">工程体检</h1>
            <p className="mt-0.5 text-[12px] text-fg-muted">自动扫描剧本中的跳转断裂、缺素材、分支孤岛等问题</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-edge/10 bg-surface px-3 py-1.5 text-[12px] text-fg-muted">
            <Zap size={13} />
            已扫描
          </div>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="shrink-0 px-6 py-4">
        <div className="grid grid-cols-4 gap-3">
          {[
            { value: report.totalIssues, label: '总计', icon: ShieldCheck, color: 'text-fg-muted' },
            { value: report.errors, label: '错误', icon: Bug, color: 'text-red-400' },
            { value: report.warnings, label: '警告', icon: AlertTriangle, color: 'text-amber-400' },
            { value: report.infos, label: '提示', icon: Info, color: 'text-blue-400' },
          ].map((s) => {
            const Icon = s.icon
            const isHealthy = s.label === '错误' ? s.value === 0 : s.label === '总计' ? s.value === 0 : false
            return (
              <div
                key={s.label}
                className={`rounded-lg border px-4 py-3.5 ${
                  isHealthy
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-edge/10 bg-surface'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-fg-faint">{s.label}</span>
                  <Icon size={14} className={s.color} />
                </div>
                <div className={`text-[24px] font-semibold ${isHealthy ? 'text-emerald-400' : 'text-fg'}`}>
                  {s.value}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="shrink-0 px-6 pb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索诊断结果..."
            className="w-full rounded-lg border border-edge/10 bg-surface pl-9 pr-3 py-1.5 text-[12px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <SlidersHorizontal size={13} className="text-fg-faint" />
        <div className="flex items-center gap-1.5">
          {(['all', 'error', 'warning', 'info'] as const).map((s) => {
            const active = severityFilter === s
            const cfg = s === 'all' ? null : SEVERITY_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? cfg
                      ? `${cfg.bg} ${cfg.color} border ${cfg.border}`
                      : 'bg-surface-2 text-fg border border-edge/15'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-2/60'
                }`}
              >
                {cfg && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />}
                {s === 'all' ? '全部' : SEVERITY_CONFIG[s].label}
                {s === 'all' && <span className="text-fg-faint">({report.totalIssues})</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Issues Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-fg-muted">
            <CheckCircle size={32} className="mb-2 text-emerald-400/60" />
            <span className="text-[13px]">未发现问题</span>
            <span className="text-[12px] text-fg-faint mt-1">剧本健康度良好</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {filtered.map((item) => {
              const cfg = SEVERITY_CONFIG[item.severity]
              const canJump = item.lineIndex >= 0
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border px-4 py-3 transition-colors cursor-pointer ${cfg.bg} ${cfg.border} ${canJump ? 'hover:border-primary/25 hover:bg-surface-hover/30' : ''}`}
                  onClick={() => canJump && handleJump(item)}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full ${cfg.dotColor} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[11px] font-medium uppercase tracking-[0.05em] ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-[11px] text-fg-faint truncate">{item.category}</span>
                      </div>
                      <p className="text-[13px] text-fg leading-relaxed">{item.message}</p>
                    </div>
                    {canJump && (
                      <span className="shrink-0 text-[11px] text-primary/70 hover:text-primary transition-colors mt-0.5">
                        <Zap size={12} className="inline mr-0.5" />
                        跳转到行
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
