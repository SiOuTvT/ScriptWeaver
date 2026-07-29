import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { runDiagnostics, type DiagSeverity, type DiagnosticItem } from '../../utils/diagnostics'
import { Bug, AlertTriangle, Info, ShieldCheck, Zap, Search, SlidersHorizontal, CheckCircle2, Wrench } from 'lucide-react'

const SEVERITY_CONFIG: Record<DiagSeverity, { label: string; color: string; icon: typeof Bug; ring: string }> = {
  error:   { label: '错误', color: 'text-danger', icon: Bug, ring: 'ring-danger/15' },
  warning: { label: '警告', color: 'text-warning', icon: AlertTriangle, ring: 'ring-warning/15' },
  info:    { label: '提示', color: 'text-info', icon: Info, ring: 'ring-info/15' },
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
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas">

      {/* ═══ Header ═══ */}
      <div className="shrink-0 border-b border-edge/10 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="signal-dot" />
              <span className="eyebrow">Diagnostics</span>
            </div>
            <h2 className="t-h2 mt-1.5">工程体检</h2>
            <p className="mt-0.5 t-subtitle">自动扫描剧本中的跳转断裂、缺素材、分支孤岛等问题</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-edge/10 bg-surface-2 px-3 py-1.5 text-[12px] text-fg-muted">
            <Wrench size={12} />
            已扫描
          </span>
        </div>
      </div>

      {/* ═══ Dashboard Stats ═══ */}
      <div className="shrink-0 border-b border-edge/10 px-5 py-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { value: report.totalIssues, label: '总计', icon: ShieldCheck, toneColor: 'rgb(var(--c-fg))', iconBg: 'rgb(var(--c-fg) / 0.1)' },
            { value: report.errors, label: '错误', icon: Bug, toneColor: 'rgb(var(--c-danger))', iconBg: 'rgb(var(--c-danger) / 0.12)' },
            { value: report.warnings, label: '警告', icon: AlertTriangle, toneColor: 'rgb(var(--c-warning))', iconBg: 'rgb(var(--c-warning) / 0.12)' },
            { value: report.infos, label: '提示', icon: Info, toneColor: 'rgb(var(--c-info))', iconBg: 'rgb(var(--c-info) / 0.12)' },
          ].map((s, i) => {
            const Icon = s.icon
            const isFg = s.toneColor === 'rgb(var(--c-fg))'
            return (
              <div
                key={s.label}
                className="group relative flex animate-slide-up flex-col gap-2 overflow-hidden rounded-2xl border border-edge/10 bg-surface p-4 shadow-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-edge/20 hover:shadow-2"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <div
                  className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: s.toneColor }}
                />
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: isFg ? 'rgb(var(--c-fg-muted) / 0.08)' : s.iconBg, color: s.toneColor }}
                >
                  <Icon size={16} />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="t-mono text-[22px] font-semibold leading-none tabular-nums" style={{ color: s.toneColor }}>
                    {s.value}
                  </span>
                </div>
                <span className="t-label">{s.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ Filter Bar ═══ */}
      <div className="shrink-0 border-b border-edge/10 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="relative max-w-lg">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索诊断结果..."
              className="w-full rounded-xl border border-edge/10 bg-surface/80 pl-9 pr-3 py-2 text-[12px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30 focus:bg-surface transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal size={13} className="mr-0.5 text-fg-muted" />
            {(['all', 'error', 'warning', 'info'] as const).map((s) => {
              const active = severityFilter === s
              const cfg = s !== 'all' ? SEVERITY_CONFIG[s] : null
              return (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                    active
                      ? cfg
                        ? `bg-surface-2 text-${s === 'error' ? 'danger' : s === 'warning' ? 'warning' : 'info'} border border-edge/10 shadow-1`
                        : 'bg-surface-2 text-fg border border-edge/10 shadow-1'
                      : 'border border-transparent text-fg-muted hover:text-fg hover:bg-surface-2'
                  }`}
                >
                  {cfg && <span className={`h-1.5 w-1.5 rounded-full ${s === 'error' ? 'bg-danger' : s === 'warning' ? 'bg-warning' : 'bg-info'}`} />}
                  {s === 'all' ? '全部' : cfg!.label}
                  {s === 'all' && <span className="text-fg-faint">({report.totalIssues})</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ═══ Issues Grid ═══ */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-edge/10 bg-surface-2">
              <CheckCircle2 size={22} className="text-emerald-500/60" />
            </div>
            <span className="text-[13px] font-medium text-fg-muted">未发现问题</span>
            <span className="mt-1 text-[12px] text-fg-faint">剧本健康度良好</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((item) => {
              const cfg = SEVERITY_CONFIG[item.severity]
              const canJump = item.lineIndex >= 0
              return (
                <div
                  key={item.id}
                  className={`group rounded-xl border border-edge/10 bg-surface-2 px-4 py-3 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2 hover:ring-1 ${cfg.ring} ${canJump ? 'cursor-pointer' : ''}`}
                  onClick={() => canJump && handleJump(item)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${item.severity === 'error' ? 'bg-danger/10 text-danger' : item.severity === 'warning' ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info'}`}>
                      <cfg.icon size={12} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                        <span className="truncate text-[11px] text-fg-faint">{item.category}</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-fg">{item.message}</p>
                    </div>
                    {canJump && (
                      <span className="mt-0.5 shrink-0 rounded-xl border border-primary/15 bg-primary/5 px-2 py-0.5 text-[11px] text-primary transition-colors group-hover:bg-primary/10">
                        <Zap size={10} className="mr-0.5 inline" />
                        跳转
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
