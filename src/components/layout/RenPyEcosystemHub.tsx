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
  GraduationCap, Puzzle, Shield, X
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

  // ── Helpers ──────────────────────────────────────────────────────
  const togglePlugin = (id: string) => {
    setExpandedPlugins((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  const toggleTutorial = (id: string) => {
    setExpandedTutorials((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const difficultyBadge = (level: string) => {
    const map: Record<string, string> = { beginner: '入门', intermediate: '中等', advanced: '高级', 入门: '入门', 进阶: '进阶', 高级: '高级' }
    const colors: Record<string, string> = { beginner: 'bg-emerald-500/10 text-emerald-500', intermediate: 'bg-amber-500/10 text-amber-500', advanced: 'bg-rose-500/10 text-rose-500', 入门: 'bg-emerald-500/10 text-emerald-500', 进阶: 'bg-amber-500/10 text-amber-500', 高级: 'bg-rose-500/10 text-rose-500' }
    return (
      <span className={`inline-flex px-1.5 py-0 text-[10px] font-medium rounded ${colors[level] ?? 'bg-surface-2 text-fg-muted'}`}>
        {map[level] ?? level}
      </span>
    )
  }

  return (
    <div className="flex h-full flex-col select-none">
      {/* Header */}
      <div className="shrink-0 border-b border-edge/10 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-semibold text-fg">Ren'Py 生态大厅</h1>
            <p className="mt-0.5 text-[12px] text-fg-muted">特效审计 · 社区插件 Hub · 语法学院 —— 三位一体知识中心</p>
          </div>
          <span className="text-[11px] text-fg-faint bg-surface-2/60 px-2.5 py-1 rounded-md border border-edge/10">
            19 大类 · {COMMUNITY_PLUGINS.length} 插件 · {SYNTAX_LESSONS.length} 教程
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4">
          {([
            { id: 'audit' as const, label: '特效审计', icon: Shield, desc: '19 大类全覆盖清单' },
            { id: 'plugins' as const, label: '社区插件', icon: Puzzle, desc: `${COMMUNITY_PLUGINS.length} 个高质量插件` },
            { id: 'academy' as const, label: '语法学院', icon: GraduationCap, desc: `${SYNTAX_LESSONS.length} 篇模块化教程` },
          ]).map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors border ${
                  active
                    ? 'border-primary/20 bg-primary/5 text-primary'
                    : 'border-transparent text-fg-muted hover:text-fg hover:bg-surface-2/60'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {!active && <span className="text-fg-faint text-[11px]">{tab.desc}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Search Bar */}
      <div className="shrink-0 px-8 py-4">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'audit' ? '搜索特效大类或特效名...'
              : activeTab === 'plugins' ? '搜索插件名、描述或标签...'
              : '搜索教程标题、内容或标签...'
            }
            className="w-full rounded-lg border border-edge/10 bg-surface pl-10 pr-4 py-2 text-[13px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg">
              <X size={14} />
            </button>
          )}
        </div>
        {activeTab === 'plugins' && (
          <div className="flex items-center gap-1.5 mt-3">
            {PLUGIN_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setPluginCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  pluginCategory === cat ? 'bg-primary/10 text-primary border border-primary/20' : 'text-fg-muted hover:text-fg hover:bg-surface-2/60'
                }`}
              >{cat}</button>
            ))}
          </div>
        )}
        {activeTab === 'academy' && (
          <div className="flex items-center gap-1.5 mt-3">
            {ACADEMY_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setAcademyCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  academyCategory === cat ? 'bg-primary/10 text-primary border border-primary/20' : 'text-fg-muted hover:text-fg hover:bg-surface-2/60'
                }`}
              >{cat}</button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        
        {/* ── Audit Panel ──────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {/* Stats Dashboard */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-edge/10 bg-surface p-4">
                <div className="text-[11px] text-fg-faint mb-1">大类总数</div>
                <div className="text-[24px] font-semibold text-fg">{auditStats.total}</div>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="text-[11px] text-emerald-600 mb-1">已全覆盖</div>
                <div className="text-[24px] font-semibold text-emerald-500">{auditStats.covered}</div>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="text-[11px] text-amber-600 mb-1">补充覆盖</div>
                <div className="text-[24px] font-semibold text-amber-500">{auditStats.supplement}</div>
              </div>
              <div className="rounded-lg border border-edge/10 bg-surface p-4 flex flex-col justify-between">
                <div className="text-[11px] text-fg-faint">特效大本营</div>
                <button
                  onClick={() => setActiveNavItem('effects')}
                  className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors"
                >
                  打开特效大本营 <ExternalLink size={12} />
                </button>
              </div>
            </div>

            {/* Coverage Grid: 2 columns on xl */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredAudit.map((cat) => (
                <div
                  key={cat.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    cat.covered
                      ? 'border-emerald-500/15 bg-emerald-500/3'
                      : 'border-amber-500/15 bg-amber-500/3'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cat.covered ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <h3 className="text-[13px] font-medium text-fg">{cat.name}</h3>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      cat.covered
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                    }`}>
                      {cat.covered ? '已覆盖' : '补充覆盖'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.items.map((item) => (
                      <span
                        key={item}
                        className="inline-flex px-2 py-0.5 rounded text-[11px] font-mono bg-surface-2/60 border border-edge/8 text-fg-muted"
                      >{item}</span>
                    ))}
                  </div>
                  {cat.supplement && (
                    <p className="mt-2.5 text-[11px] text-fg-faint leading-snug">{cat.supplement}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Plugins Panel ─────────────────────────────────────── */}
        {activeTab === 'plugins' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filteredPlugins.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-16 text-fg-muted">
                <Puzzle size={32} className="mb-2 opacity-40" />
                <span className="text-[13px]">未找到匹配的插件</span>
              </div>
            )}
            {filteredPlugins.map((plugin) => {
              const isExpanded = expandedPlugins.has(plugin.id)
              return (
                <div
                  key={plugin.id}
                  className="rounded-lg border border-edge/10 bg-surface transition-colors hover:border-primary/15"
                >
                  <button
                    onClick={() => togglePlugin(plugin.id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[14px] font-medium text-fg">{plugin.name}</span>
                        {plugin.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0 rounded bg-surface-2/60 text-fg-faint border border-edge/8">{t}</span>
                        ))}
                      </div>
                      <p className="text-[12px] text-fg-muted leading-relaxed line-clamp-2">{plugin.desc}</p>
                    </div>
                    <span className={`mt-1 text-fg-faint transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={15} />
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-edge/8 pt-3">
                      {plugin.snippet && (
                        <div>
                          <div className="text-[11px] font-medium text-fg-faint uppercase tracking-[0.05em] mb-1.5">代码范例</div>
                          <pre className="rounded-md bg-surface-2/80 border border-edge/10 p-3 text-[12px] font-mono text-fg-muted overflow-x-auto whitespace-pre-wrap">{plugin.snippet}</pre>
                        </div>
                      )}
                      {plugin.install && (
                        <div>
                          <div className="text-[11px] font-medium text-fg-faint uppercase tracking-[0.05em] mb-1.5">安装说明</div>
                          <p className="text-[12px] text-fg-muted leading-relaxed">{plugin.install}</p>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); insertToScript(plugin.snippet ?? '', plugin.name) }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/15 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 text-[12px] text-primary transition-colors"
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

        {/* ── Academy Panel ─────────────────────────────────────── */}
        {activeTab === 'academy' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filteredTutorials.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-16 text-fg-muted">
                <GraduationCap size={32} className="mb-2 opacity-40" />
                <span className="text-[13px]">未找到匹配的教程</span>
              </div>
            )}
            {filteredTutorials.map((lesson) => {
              const isExpanded = expandedTutorials.has(lesson.id)
              return (
                <div
                  key={lesson.id}
                  className="rounded-lg border border-edge/10 bg-surface transition-colors hover:border-primary/15"
                >
                  <button
                    onClick={() => toggleTutorial(lesson.id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[12px] font-mono text-fg-faint">#{lesson.id}</span>
                        <span className="text-[14px] font-medium text-fg">{lesson.title}</span>
                        {difficultyBadge(lesson.level)}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] px-1.5 py-0 rounded bg-surface-2/60 text-fg-muted border border-edge/8">{lesson.category}</span>
                      </div>
                    </div>
                    <span className={`mt-1 text-fg-faint transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={15} />
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-edge/8 pt-3">
                      <div className="prose-content text-[13px] text-fg leading-relaxed space-y-2" dangerouslySetInnerHTML={{ __html: lesson.renderedContent ?? lesson.content }} />
                      {lesson.codeExample && (
                        <div>
                          <div className="text-[11px] font-medium text-fg-faint uppercase tracking-[0.05em] mb-1.5">可运行范例</div>
                          <pre className="rounded-md bg-surface-2/80 border border-edge/10 p-3 text-[12px] font-mono text-fg-muted overflow-x-auto whitespace-pre-wrap">{lesson.codeExample}</pre>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); insertToScript(lesson.codeExample ?? '', lesson.title) }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/15 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 text-[12px] text-primary transition-colors"
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
