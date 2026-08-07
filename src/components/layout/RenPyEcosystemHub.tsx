import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { COMMUNITY_PLUGINS } from '../../data/community_plugins'
import { SYNTAX_LESSONS } from '../../data/syntax_academy'
import { toast } from '../../utils/toast'
import type { LineDelta } from '../../core/types'
import {
  Search, Sparkles, BookOpen, Globe,
  ExternalLink, Zap, Copy, Download,
  Check, ChevronDown, ChevronRight,
  GraduationCap, Puzzle, Shield, X,
  CheckCircle2, Bookmark, Library
} from 'lucide-react'

// ── Audit Data ──────────────────────────────────────────────────────
const AUDIT_CATEGORIES = [
  { id: 'basics', name: '基础转场', items: ['dissolve', 'Fade', 'move', 'pushright', 'pushleft', 'zoomin', 'zoomout', 'pixellate', 'wipeleft', 'wiperight', 'slideleft', 'slideright', 'slideup', 'slidedown', 'vpgrid', 'irisin', 'irisout'], covered: true },
  { id: 'crop', name: '裁剪', items: ['crop', 'crop_relative'], covered: true },
  { id: 'position', name: '位移', items: ['xpos', 'ypos', 'xanchor', 'yanchor', 'xalign', 'yalign', 'xoffset', 'yoffset', 'xcenter', 'ycenter'], covered: true },
  { id: 'size', name: '缩放', items: ['zoom', 'xzoom', 'yzoom', 'size', 'fit', 'truecenter'], covered: true },
  { id: 'alpha', name: '透明度冲击', items: ['alpha', 'additive', 'blend', 'dissolve'], covered: true },
  { id: 'transform', name: '位置变换', items: ['rotate', 'rotate_pad', 'transform_anchor', 'around'], covered: true },
  { id: 'color', name: '颜色', items: ['matrixcolor', 'ContrastMatrix', 'SaturationMatrix', 'BrightnessMatrix', 'HueMatrix', 'TintMatrix', 'OpacityMatrix', 'SepiaMatrix'], covered: true },
  { id: 'cropcorner', name: '裁剪角', items: ['crop_corner', 'corner1', 'corner2', 'corner3', 'corner4'], covered: true },
  { id: '3d', name: '3D 仿射', items: ['perspective', 'matrixtransform', 'xrotate', 'yrotate', 'zrotate', 'matte3d'], covered: true },
  { id: 'easing', name: '缓动函数', items: ['ease', 'linear', 'easein', 'easeout', 'ease_cubic', 'ease_quad', 'ease_quart', 'ease_quint', 'ease_expo', 'ease_circ', 'ease_elastic', 'ease_back', 'ease_bounce', 'warper'], covered: true },
  { id: 'atl', name: 'ATL 语句', items: ['parallel', 'choice', 'repeat', 'block', 'contains', 'function', 'on', 'event', 'time', 'pause'], covered: true },
  { id: 'builtinpos', name: '内置定位', items: ['left', 'right', 'center', 'top', 'bottom', 'topleft', 'topright', 'offscreenleft', 'offscreenright', 'reset'], covered: true },
  { id: '3dstage', name: '3D 舞台', items: ['camera', 'show layer', 'zpos', 'rotate3d', 'gl_depth', 'perspective'], covered: true },
  { id: 'particle', name: '粒子', items: ['SnowBlossom', 'particle sprite', 'Particle'], covered: true },
  { id: 'matrix', name: '矩阵滤镜', items: ['im.MatrixColor', 'im.matrix', 'BrightnessMatrix', 'OpacityMatrix', 'blur', 'im.FactorScale', 'im.Twocolor'], covered: true },
  { id: 'qte', name: 'QTE', items: ['timer', 'key', 'button screen', 'QTE 限时选择'], covered: false, supplement: '插件 DB 含 QTE 限时选择插件 + 语法学院 QTE 教程' },
  { id: 'nvl', name: 'NVL', items: ['nvl mode', 'nvl clear', 'nvl hide', 'nvl show', 'nvl dissolve', 'NVL 扩展风格包'], covered: false, supplement: '插件 DB 含 NVL 扩展风格包 + 语法学院 NVL 教程' },
  { id: 'postfx', name: '后处理', items: ['layeredimage', 'ConditionSwitch', 'DynamicDisplayable', 'CRT/VHS 后处理滤镜'], covered: false, supplement: '插件 DB 含后处理滤镜插件(CRT/VHS)' },
]

const PLUGIN_CATEGORIES = ['全部', '角色表演', 'UI 界面', '小游戏', '系统引擎', '视觉滤镜', 'NVL 模式']
const ACADEMY_CATEGORIES = ['全部', '基础语法', 'ATL 动画', 'NVL 模式', '自定义界面', '音频多媒体', '高级技巧', '调试优化']

// ── Component ────────────────────────────────────────────────────────
export default function RenPyEcosystemHub() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const setDraftDeltas = useAppStore((s) => s.setDraftDeltas)
  const selectLine = useAppStore((s) => s.selectLine)
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)


  const [activeTab, setActiveTab] = useState<'audit' | 'plugins' | 'academy'>('audit')
  const [searchQuery, setSearchQuery] = useState('')
  const [pluginCategory, setPluginCategory] = useState('全部')
  const [academyCategory, setAcademyCategory] = useState('全部')
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set())
  const [expandedTutorials, setExpandedTutorials] = useState<Set<string>>(new Set())

  // ── Filtered Lists ──────────────────────────────────────────────
  const filteredPlugins = useMemo(() => {
    let list = COMMUNITY_PLUGINS
    if (pluginCategory !== '全部') list = list.filter((p) => p.category === pluginCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)))
    }
    return list
  }, [pluginCategory, searchQuery])

  const filteredTutorials = useMemo(() => {
    let list = SYNTAX_LESSONS
    if (academyCategory !== '全部') list = list.filter((t) => t.category === academyCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    }
    return list
  }, [academyCategory, searchQuery])

  const filteredAudit = useMemo(() => {
    if (!searchQuery.trim()) return AUDIT_CATEGORIES
    const q = searchQuery.toLowerCase()
    return AUDIT_CATEGORIES.filter((c) => c.name.toLowerCase().includes(q) || c.items.some((i) => i.toLowerCase().includes(q)))
  }, [searchQuery])

  // ── Stats ────────────────────────────────────────────────────────
  const auditStats = useMemo(() => ({
    total: AUDIT_CATEGORIES.length,
    covered: AUDIT_CATEGORIES.filter((c) => c.covered).length,
    supplement: AUDIT_CATEGORIES.filter((c) => !c.covered).length,
  }), [])

  // ── Insert to Script ─────────────────────────────────────────────
  const insertToScript = useCallback((code: string, label: string) => {
    const newDelta: LineDelta = {
      line_id: `inserted_${Date.now()}`,
      dialogue: code,
      speaker: '',
      background: { asset_id: '' },
      characters: {},
      audio: { bgm: null, ambient: null, se: [], voice: null },
    }
    const updated = [...draftDeltas, newDelta]
    setDraftDeltas(updated)
    selectLine(updated.length - 1)
    setActiveNavItem('chapters')
    toast(`已插入：${label}`, 'success')
  }, [draftDeltas, setDraftDeltas, selectLine, setActiveNavItem])

  // ── Copy code ───────────────────────────────────────────────────
  const copyCode = useCallback(async (code: string, label: string) => {
    if (!code) {
      toast('该条目没有可复制的代码', 'info')
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      toast(`已复制：${label}`, 'success')
    } catch {
      toast('复制失败，请手动框选复制', 'error')
    }
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────
  const togglePlugin = (id: string) => {
    setExpandedPlugins((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  const toggleTutorial = (id: string) => {
    setExpandedTutorials((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const difficultyBadge = (level: string) => {
    const map: Record<string, string> = { beginner: '入门', intermediate: '中等', advanced: '高级', 入门: '入门', 进阶: '进阶', 高级: '高级' }
    const colors: Record<string, string> = { beginner: 'bg-[rgb(var(--c-info)/0.1)] text-[rgb(var(--c-info))]', intermediate: 'bg-[rgb(var(--c-primary)/0.1)] text-[rgb(var(--c-primary))]', advanced: 'bg-[rgb(var(--c-danger)/0.1)] text-[rgb(var(--c-danger))]', 入门: 'bg-[rgb(var(--c-info)/0.1)] text-[rgb(var(--c-info))]', 进阶: 'bg-[rgb(var(--c-primary)/0.1)] text-[rgb(var(--c-primary))]', 高级: 'bg-[rgb(var(--c-danger)/0.1)] text-[rgb(var(--c-danger))]' }
    return (
      <span className={`inline-flex px-1.5 py-0 text-[12px] font-medium rounded ${colors[level] ?? 'bg-surface-2 text-fg-muted'}`}>
        {map[level] ?? level}
      </span>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas">

      {/* ═══ Header: signal-dot + eyebrow + t-h2 ═══ */}
      <div className="shrink-0 border-b border-edge/10 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="signal-dot" />
              <span className="eyebrow">Ecosystem Hub</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-edge/10 bg-surface-2 px-2 py-0.5 text-[12px] text-fg-muted">
                <Library size={11} />
                {COMMUNITY_PLUGINS.length + SYNTAX_LESSONS.length} 项资源
              </span>
            </div>
            <h2 className="t-h2 mt-1.5">Ren'Py 生态大厅</h2>
            <p className="mt-0.5 t-subtitle">特效审计 · 社区插件 Hub · 语法学院 —— 三位一体知识中心</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-1.5">
          {([
            { id: 'audit' as const, label: '特效审计', icon: Shield },
            { id: 'plugins' as const, label: '社区插件', icon: Puzzle },
            { id: 'academy' as const, label: '语法学院', icon: GraduationCap },
          ]).map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? 'border-primary/25 bg-primary/[0.06] text-primary shadow-1'
                    : 'border-transparent text-fg-muted hover:text-fg hover:bg-surface-2'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ Search Bar ═══ */}
      <div className="shrink-0 border-b border-edge/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative max-w-lg">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'audit' ? '搜索特效大类或特效名...'
                : activeTab === 'plugins' ? '搜索插件名、描述或标签...'
                : '搜索教程标题、内容或标签...'
              }
              className="w-full rounded-xl border border-edge/10 bg-surface/80 pl-9 pr-8 py-2 text-[13px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30 focus:bg-surface transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
          {activeTab === 'plugins' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {PLUGIN_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setPluginCategory(cat)}
                  className={`rounded-xl px-2.5 py-1 text-[12px] font-medium transition-all duration-200 ${
                    pluginCategory === cat
                      ? 'bg-primary/10 text-primary border border-primary/20 shadow-1'
                      : 'border border-transparent text-fg-muted hover:text-fg hover:bg-surface-2'
                  }`}
                >{cat}</button>
              ))}
            </div>
          )}
          {activeTab === 'academy' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {ACADEMY_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setAcademyCategory(cat)}
                  className={`rounded-xl px-2.5 py-1 text-[12px] font-medium transition-all duration-200 ${
                    academyCategory === cat
                      ? 'bg-primary/10 text-primary border border-primary/20 shadow-1'
                      : 'border border-transparent text-fg-muted hover:text-fg hover:bg-surface-2'
                  }`}
                >{cat}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="flex-1 overflow-y-auto px-5 py-5">

        {/* ── Audit Panel ──────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <div className="space-y-5">

            {/* Stats Dashboard — 1:1 对齐 ScriptOverview bento 卡片 */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[{
                label: '大类总数', value: auditStats.total, icon: Bookmark,
                toneColor: 'rgb(var(--c-fg))', iconBg: 'rgb(var(--c-fg) / 0.1)',
              }, {
                label: '已全覆盖', value: auditStats.covered, icon: CheckCircle2,
                toneColor: 'rgb(var(--c-signal))', iconBg: 'rgb(var(--c-signal) / 0.12)',
              }, {
                label: '补充覆盖', value: auditStats.supplement, icon: Puzzle,
                toneColor: 'rgb(var(--c-fg))', iconBg: 'rgb(var(--c-fg) / 0.1)',
              }, {
                label: '特效大本营', value: null, icon: Sparkles,
                toneColor: 'rgb(var(--c-primary))', iconBg: 'rgb(var(--c-primary) / 0.12)',
              }].map((stat, i) => {
                const Icon = stat.icon
                return (
                  <div
                    key={stat.label}
                    className="group relative flex animate-slide-up flex-col gap-2 overflow-hidden rounded-2xl border border-edge/10 bg-surface p-4 shadow-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-edge/20 hover:shadow-2"
                    style={{ animationDelay: `${i * 55}ms` }}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ background: stat.toneColor === 'rgb(var(--c-fg))' ? 'rgb(var(--c-fg-muted) / 0.08)' : stat.iconBg, color: stat.toneColor }}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    {stat.value !== null ? (
                      <div className="flex items-baseline gap-1">
                        <span className="t-mono text-[22px] font-semibold leading-none tabular-nums" style={{ color: stat.toneColor }}>
                          {stat.value}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveNavItem('effects')}
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:underline"
                        style={{ color: stat.toneColor }}
                      >
                        打开特效大本营 <ExternalLink size={11} />
                      </button>
                    )}
                    <span className="t-label">{stat.label}</span>
                    <div
                      className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                      style={{ background: stat.toneColor }}
                    />
                  </div>
                )
              })}
            </div>

            {/* Coverage Grid */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredAudit.map((cat) => (
                <div
                  key={cat.id}
                  className={`group rounded-xl border bg-surface-2 p-4 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2 relative overflow-hidden ${
                    cat.covered ? 'border-edge/10' : 'border-edge/10'
                  }`}
                >
                  <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${
                    cat.covered ? 'from-signal/50 to-transparent' : 'from-fg-muted/25 to-transparent'
                  }`} />
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${cat.covered ? 'bg-signal' : 'bg-fg-muted'}`} />
                      <h3 className="t-title text-[14px]">{cat.name}</h3>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium ${
                      cat.covered
                        ? 'border-signal/20 bg-signal/[0.06] text-signal'
                        : 'border-edge/10 bg-surface text-fg-muted'
                    }`}>
                      {cat.covered ? '已覆盖' : '补充覆盖'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.items.map((item) => (
                      <span
                        key={item}
                        className="inline-flex rounded-xl border border-edge/10 bg-surface px-2 py-0.5 text-[12px] font-mono text-fg-subtle"
                      >{item}</span>
                    ))}
                  </div>
                  {cat.supplement && (
                    <p className="mt-2.5 text-[12px] leading-snug text-fg-faint">{cat.supplement}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Plugins Panel ─────────────────────────────────────── */}
        {activeTab === 'plugins' && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filteredPlugins.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-20 text-fg-muted">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-edge/10 bg-surface-2">
                  <Puzzle size={22} className="opacity-40" />
                </div>
                <span className="text-[13px] text-fg-muted">未找到匹配的插件</span>
              </div>
            )}
            {filteredPlugins.map((plugin) => {
              const isExpanded = expandedPlugins.has(plugin.id)
              return (
                <div
                  key={plugin.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-edge/10 bg-surface-2 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2"
                >
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    onClick={() => togglePlugin(plugin.id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
                      <Puzzle size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="t-title text-[14px]">{plugin.name}</span>
                        {plugin.tags.slice(0, 2).map((t) => (
                          <span key={t} className="rounded-full border border-edge/10 bg-surface px-1.5 py-0 text-[12px] text-fg-muted">{t}</span>
                        ))}
                      </div>
                      <p className="line-clamp-2 text-[12px] leading-relaxed text-fg-subtle">{plugin.desc}</p>
                    </div>
                    <span className={`mt-1.5 text-fg-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={15} />
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="space-y-3 border-t border-edge/10 px-4 pb-4 pt-3">
                      {plugin.snippet && (
                        <div>
                          <div className="t-label mb-1.5">代码范例</div>
                          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-edge/10 bg-surface p-3 text-[12px] font-mono leading-relaxed text-fg-subtle">{plugin.snippet}</pre>
                        </div>
                      )}
                      {plugin.install && (
                        <div>
                          <div className="t-label mb-1.5">安装说明</div>
                          <p className="text-[12px] leading-relaxed text-fg-subtle">{plugin.install}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); void copyCode(plugin.snippet ?? '', plugin.name) }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/15 bg-primary/5 px-3 py-1.5 text-[12px] text-primary transition-colors hover:bg-primary/10"
                        >
                          <Copy size={12} />
                          复制代码
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); insertToScript(plugin.snippet ?? '', plugin.name) }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/15 bg-primary/5 px-3 py-1.5 text-[12px] text-primary transition-colors hover:bg-primary/10"
                        >
                          <Download size={12} />
                          插入到剧本
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Academy Panel ─────────────────────────────────────── */}
        {activeTab === 'academy' && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filteredTutorials.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-20 text-fg-muted">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-edge/10 bg-surface-2">
                  <GraduationCap size={22} className="opacity-40" />
                </div>
                <span className="text-[13px] text-fg-muted">未找到匹配的教程</span>
              </div>
            )}
            {filteredTutorials.map((lesson) => {
              const isExpanded = expandedTutorials.has(lesson.id)
              return (
                <div
                  key={lesson.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-edge/10 bg-surface-2 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2"
                >
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    onClick={() => toggleTutorial(lesson.id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
                      <BookOpen size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-mono text-fg-faint">#{lesson.id}</span>
                        <span className="t-title text-[14px]">{lesson.title}</span>
                        {difficultyBadge(lesson.level)}
                      </div>
                      <span className="inline-flex rounded-full border border-edge/10 bg-surface px-1.5 py-0 text-[12px] text-fg-muted">{lesson.category}</span>
                    </div>
                    <span className={`mt-1.5 text-fg-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={15} />
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="space-y-3 border-t border-edge/10 px-4 pb-4 pt-3">
                      <div className="prose-content space-y-2 text-[13px] leading-relaxed text-fg" dangerouslySetInnerHTML={{ __html: lesson.content }} />
                      {lesson.codeExample && (
                        <div>
                          <div className="t-label mb-1.5">可运行范例</div>
                          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-edge/10 bg-surface p-3 text-[12px] font-mono leading-relaxed text-fg-subtle">{lesson.codeExample}</pre>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); insertToScript(lesson.codeExample ?? '', lesson.title) }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/15 bg-primary/5 px-3 py-1.5 text-[12px] text-primary transition-colors hover:bg-primary/10"
                      >
                        <Download size={12} />
                        插入到剧本
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
