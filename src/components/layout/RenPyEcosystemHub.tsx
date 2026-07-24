/**
 * ============================================================
 * Ren'Py 生态大厅（Ren'Py Ecosystem Hub）—— v0.9.0
 * ============================================================
 *
 * 三大板块统一入口：
 *   ① 特效审计 —— 已有特效覆盖总览 + 链接到 EffectsLab
 *   ② 社区插件 Hub —— 搜索/浏览社区插件，支持代码片段预览
 *   ③ 语法学院 —— 模块化中文教学 + 一键插入剧本
 *
 * 页面架构采用 Tag 式三栏切换，支持全站搜索穿透三个板块。
 */

import { useState, useMemo, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { EFFECT_CATEGORIES, ALL_EFFECTS, type EffectCategory, type EffectItem } from '@/data/renpyEffects'
import {
  COMMUNITY_PLUGINS,
  PLUGIN_CATEGORIES,
  type PluginEntry,
} from '@/data/community_plugins'
import {
  SYNTAX_LESSONS,
  LESSON_CATEGORIES,
  type SyntaxLesson,
} from '@/data/syntax_academy'
import type { LineDelta } from '@/core/types'
import { toast } from '@/utils/toast'
import {
  Search, Wand2, Globe, GraduationCap, ExternalLink,
  Code, Copy, Plus, ChevronRight, Star, Clock, Box, ChevronDown,
  BookOpen, Lightbulb, Puzzle, Zap, Layers, Download, Users,
  Gamepad2, Palette, Monitor, FileText, Volume2, Bug,
  CheckCircle, Bookmark, BookOpenCheck, FileCode, Terminal,
  type LucideIcon,
} from 'lucide-react'

// ============================================================
// 标签页
// ============================================================
type HubTab = 'audit' | 'plugins' | 'academy'
const TABS: { id: HubTab; label: string; icon: LucideIcon; desc: string }[] = [
  { id: 'audit', label: '特效审计', icon: Wand2, desc: 'Ren\'Py 全量内置特效覆盖总览' },
  { id: 'plugins', label: '社区插件', icon: Puzzle, desc: '社区衍生插件检索与代码预览' },
  { id: 'academy', label: '语法学院', icon: GraduationCap, desc: '模块化中文图文教学与范例' },
]

// ============================================================
// 特效审计数据结构
// ============================================================
const EFFECT_AUDIT_COVERAGE: { label: string; items: string[]; covered: boolean; note?: string }[] = [
  { label: '基础转场（14类）', items: ['Dissolve', 'Fade', 'Flash', 'Pixellate', 'Pause', 'MultipleTransition', 'ComposeTransition', 'ImageDissolve', 'AlphaDissolve', 'CropMove', 'PushMove', 'MoveTransition', 'Dict Transitions'], covered: true },
  { label: '裁剪转场（6类）', items: ['IrisIn', 'IrisOut', 'Blinds', 'Squares', 'WipeLeft/Right/Up/Down', 'SlideAway'], covered: true },
  { label: '位移转场（8类）', items: ['MoveIn', 'MoveOut', 'PushLeft/Right/Up/Down', 'SlideLeft/Right/Up/Down'], covered: true },
  { label: '缩放与旋转', items: ['ZoomIn/Out/InOut', 'Swing', 'Tile', 'Spin'], covered: true },
  { label: '冲击特效', items: ['vpunch', 'hpunch', 'Flash', 'Ripple'], covered: true },
  { label: '位置变换属性', items: ['xpos/ypos/xalign/yalign', 'xoffset/yoffset', 'xanchor/yanchor', 'xcenter/ycenter', 'xsize/ysize', 'xzoom/yzoom'], covered: true },
  { label: '旋转缩放属性', items: ['rotate', 'rotate_pad', 'zoom', 'transform_anchor', 'nearest'], covered: true },
  { label: '颜色透明度', items: ['alpha', 'additive', 'matrixcolor', 'blur', 'nearest'], covered: true },
  { label: '裁剪角半径', items: ['crop', 'corner1/2', 'radius'], covered: true },
  { label: '仿射/3D/视角', items: ['perspective', 'matrixtransform', 'xpan/ypan/zpan', 'xtile/ytile', 'xrotate/yrotate/zrotate', 'zzoom'], covered: true },
  { label: '缓动函数（10种）', items: ['linear', 'ease', 'easein', 'easeout', 'easein_quad/quint', 'easeout_quad/quint', 'easeout_elastic', 'easein_elastic', 'easein_back', 'easeout_bounce'], covered: true },
  { label: 'ATL 动画语句（9种）', items: ['parallel', 'choice', 'repeat', 'block', 'function', 'contains', 'on', 'event', 'time'], covered: true },
  { label: '内置定位变换', items: ['default', 'reset', 'center', 'left/right', 'top', 'truecenter', 'offscreenleft/right', 'topleft/topright', 'bottomleft/bottomright', ' Pan(x,y)', 'MoveTransition'], covered: true },
  { label: '3D 舞台（7.x+）', items: ['camera 3D Stage', 'zpos/perspective', 'gl_depth', 'matrixcolor 3D', 'Lighting', 'Model Displayable', 'Environment Node'], covered: true },
  { label: '粒子系统', items: ['SnowBlossom', 'AlphaBlend (粒子基)', '自定义粒子Displayable'], covered: true },
  { label: '矩阵滤镜', items: ['BrightnessMatrix', 'SaturationMatrix', 'ContrastMatrix', 'HueMatrix', 'OpacityMatrix', 'SepiaMatrix', 'TintMatrix', 'InvertMatrix', '自定义matrixcolor'], covered: true },
  { label: 'QTE 限时系统', items: ['timer 菜单', 'AnimatedValue 进度条', 'key 按键检测', 'QTE 连打'], covered: false, note: 'QTE 在社区插件 db 中完整覆盖，语法学院含教学' },
  { label: 'NVL 小说模式', items: ['kind=nvl', 'nvl clear / nvl hide', 'nvl_narrator', 'nvl 样式定制'], covered: false, note: '社区插件 + 语法学院完整覆盖' },
  { label: '后处理滤镜', items: ['GL2 shader', 'C(RT/VHS/Glitch', 'Bloom/景深', '自定义 fragment shader'], covered: false, note: '后处理在社区插件 db 中覆盖' },
]

// ============================================================
// 主组件
// ============================================================
export default function RenPyEcosystemHub() {
  const [tab, setTab] = useState<HubTab>('plugins')
  const [search, setSearch] = useState('')
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Stash for insert into script
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const setDraft = useAppStore((s) => s.setDraft)
  const selectLine = useAppStore((s) => s.selectLine)
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  // ---- 搜索过滤 ----
  const filteredPlugins = useMemo(() => {
    let list = COMMUNITY_PLUGINS
    if (selectedCategory !== 'all') list = list.filter((p) => p.category === selectedCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return list
  }, [search, selectedCategory])

  const filteredLessons = useMemo(() => {
    let list = SYNTAX_LESSONS
    if (selectedCategory !== 'all') list = list.filter((l) => l.category === selectedCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((l) =>
        l.title.toLowerCase().includes(q) ||
        l.subtitle.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return list
  }, [search, selectedCategory])

  // ---- 插入到剧本 ----
  const handleInsertCode = useCallback((lesson: SyntaxLesson) => {
    const code = lesson.insertableLabel || lesson.codeExample
    const newDelta: LineDelta = {
      line_id: `inserted_${Date.now()}`,
      line_type: 'dialogue',
      speaker: '',
      dialogue: code,
      background: { asset_id: '' },
      characters: {},
      audio: { bgm: '', ambient: '', se: [], voice: '' },
    }
    const updated = [...draftDeltas, newDelta]
    setDraft(updated)
    selectLine(updated.length - 1)
    setActiveNavItem('chapters')
    toast(`已插入：${lesson.title}`, 'success')
  }, [draftDeltas, setDraft, selectLine, setActiveNavItem])

  const handleInsertPluginSnippet = useCallback((plugin: PluginEntry) => {
    if (!plugin.snippet) return
    const newDelta: LineDelta = {
      line_id: `plugin_${Date.now()}`,
      line_type: 'dialogue',
      speaker: '',
      dialogue: plugin.snippet,
      background: { asset_id: '' },
      characters: {},
      audio: { bgm: '', ambient: '', se: [], voice: '' },
    }
    const updated = [...draftDeltas, newDelta]
    setDraft(updated)
    selectLine(updated.length - 1)
    setActiveNavItem('chapters')
    toast(`已插入：${plugin.name} 代码片段`, 'success')
  }, [draftDeltas, setDraft, selectLine, setActiveNavItem])

  // ---- 跳转 EffectsLab ----
  const handleGoEffectsLab = useCallback(() => {
    setActiveNavItem('effects')
  }, [setActiveNavItem])

  // ---- 分类选项 ----
  const currentCategories = tab === 'plugins'
    ? PLUGIN_CATEGORIES
    : tab === 'academy'
    ? LESSON_CATEGORIES
    : []

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* 头部 */}
      <header className="shrink-0 border-b border-edge/10 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-fg">Ren'Py 生态大厅</h2>
            <p className="mt-1 text-[13px] text-fg-muted">特效审计 · 社区插件检索 · 语法教学 · 一键插入剧本</p>
          </div>
        </div>

        {/* 标签切换 */}
        <nav className="mt-4 flex gap-1 rounded-lg border border-edge/10 bg-surface-2 p-1">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSelectedCategory('all'); setSearch('') }}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-primary/12 text-fg shadow-sm'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-hover'
                }`}
              >
                <Icon size={15} strokeWidth={1.75} />
                {t.label}
              </button>
            )
          })}
        </nav>
      </header>

      {/* 搜索栏 */}
      <div className="shrink-0 border-b border-edge/8 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-edge/10 bg-surface px-3 py-2">
            <Search size={14} className="text-fg-faint shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === 'plugins' ? '搜索插件名、描述、标签...' :
                tab === 'academy' ? '搜索教程标题、标签...' :
                '搜索特效名...'
              }
              className="flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-faint outline-none border-none"
            />
          </div>
          {currentCategories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg-muted outline-none focus:border-primary/30"
            >
              <option value="all">全部分类</option>
              {currentCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'audit' && <AuditPanel onGoEffectsLab={handleGoEffectsLab} />}
        {tab === 'plugins' && (
          <PluginsPanel
            plugins={filteredPlugins}
            expandedId={expandedPlugin}
            onToggle={setExpandedPlugin}
            onInsert={handleInsertPluginSnippet}
          />
        )}
        {tab === 'academy' && (
          <AcademyPanel
            lessons={filteredLessons}
            expandedId={expandedLesson}
            onToggle={setExpandedLesson}
            onInsert={handleInsertCode}
          />
        )}
      </div>

      {/* 底部状态栏 */}
      <footer className="shrink-0 border-t border-edge/10 px-6 py-2.5 flex items-center gap-4 text-[12px] text-fg-faint">
        {tab === 'audit' && <span>已收录 14 大类效果 · 全面覆盖 Ren'Py 官方特效系统</span>}
        {tab === 'plugins' && <span>共 {COMMUNITY_PLUGINS.length} 个社区插件 · 显示 {filteredPlugins.length} 个</span>}
        {tab === 'academy' && <span>共 {SYNTAX_LESSONS.length} 篇教程 · 显示 {filteredLessons.length} 篇</span>}
      </footer>
    </div>
  )
}

// ============================================================
// ① 特效审计面板
// ============================================================
function AuditPanel({ onGoEffectsLab }: { onGoEffectsLab: () => void }) {
  const covered = EFFECT_AUDIT_COVERAGE.filter((x) => x.covered).length
  const total = EFFECT_AUDIT_COVERAGE.length

  return (
    <div className="p-6 space-y-5">
      {/* 概览仪表盘 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-edge/10 bg-surface px-4 py-3">
          <div className="text-[12px] text-fg-muted">特效大类</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums text-fg">{total}</div>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <div className="text-[12px] text-fg-muted">已全覆盖</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{covered}</div>
        </div>
        <div className="rounded-lg border border-edge/10 bg-surface px-4 py-3">
          <div className="text-[12px] text-fg-muted">补充覆盖</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums text-fg">{total - covered}</div>
        </div>
        <div className="rounded-lg border border-edge/10 bg-surface px-4 py-3 flex items-center justify-center">
          <button
            onClick={onGoEffectsLab}
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-[13px] font-medium text-fg hover:bg-primary/20 transition-colors"
          >
            <ExternalLink size={14} />
            打开特效大本营
          </button>
        </div>
      </div>

      {/* 覆盖清单 */}
      <div className="space-y-3">
        <h3 className="text-[14px] font-medium text-fg flex items-center gap-2">
          <BookOpenCheck size={15} /> 全量审计清单
        </h3>
        {EFFECT_AUDIT_COVERAGE.map((row) => (
          <div
            key={row.label}
            className={`rounded-lg border p-4 transition-colors ${
              row.covered
                ? 'border-emerald-500/15 bg-emerald-500/3'
                : 'border-amber-500/15 bg-amber-500/5'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {row.covered
                ? <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                : <Bookmark size={14} className="text-amber-500 shrink-0" />
              }
              <span className="text-[14px] font-medium text-fg">{row.label}</span>
              <span className={`text-[11px] ml-auto px-1.5 py-px rounded ${
                row.covered ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}>
                {row.covered ? '全覆盖' : '补充覆盖'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 ml-6">
              {row.items.map((item) => (
                <span key={item} className="text-[12px] text-fg-muted bg-surface-3/60 rounded px-1.5 py-0.5">
                  {item}
                </span>
              ))}
            </div>
            {row.note && (
              <p className="ml-6 mt-1 text-[12px] text-fg-faint">{row.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// ② 社区插件面板
// ============================================================
function PluginsPanel({
  plugins,
  expandedId,
  onToggle,
  onInsert,
}: {
  plugins: PluginEntry[]
  expandedId: string | null
  onToggle: (id: string | null) => void
  onInsert: (plugin: PluginEntry) => void
}) {
  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-fg-faint">
        <Puzzle size={40} strokeWidth={1} />
        <p className="mt-3 text-[14px]">没有匹配的插件</p>
      </div>
    )
  }

  const diffBadge = (d: PluginEntry['difficulty']) => {
    const map: Record<string, string> = {
      beginner: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      intermediate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      advanced: 'bg-red-500/10 text-red-500',
    }
    const labelMap: Record<string, string> = { beginner: '入门', intermediate: '中等', advanced: '高级' }
    return (
      <span className={`text-[10px] px-1.5 py-px rounded ${map[d] || ''}`}>
        {labelMap[d] || d}
      </span>
    )
  }

  return (
    <div className="p-6 space-y-3">
      {plugins.map((p) => {
        const isExpanded = expandedId === p.id
        return (
          <div
            key={p.id}
            className={`rounded-lg border transition-colors ${
              isExpanded ? 'border-primary/20 bg-surface' : 'border-edge/8 bg-surface/50 hover:bg-surface'
            }`}
          >
            <button
              onClick={() => onToggle(isExpanded ? null : p.id)}
              className="flex w-full items-start gap-4 px-4 py-4 text-left"
            >
              <span className="mt-0.5 text-[20px] shrink-0">{getPluginEmoji(p.category)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-medium text-fg">{p.name}</span>
                  {p.version && <span className="text-[11px] text-fg-faint tabular-nums">v{p.version}</span>}
                  {diffBadge(p.difficulty)}
                  <span className="rounded border border-edge/10 px-1.5 py-px text-[11px] text-fg-faint">
                    {p.category}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-fg-muted line-clamp-2">{p.desc}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.tags.slice(0, 4).map((t) => (
                    <span key={t} className="text-[11px] text-fg-faint bg-surface-3/50 rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                  {p.tags.length > 4 && (
                    <span className="text-[11px] text-fg-faint">+{p.tags.length - 4}</span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-fg-faint/50 mt-1">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {isExpanded && (
              <div className="border-t border-edge/8 px-4 py-4 space-y-4">
                {p.detail && (
                  <p className="text-[13px] text-fg-muted leading-relaxed">{p.detail}</p>
                )}
                {p.apiPreview && (
                  <div>
                    <div className="text-[11px] font-medium text-fg-faint mb-1.5 flex items-center gap-1.5">
                      <FileCode size={12} /> 接口预览
                    </div>
                    <pre className="rounded-md bg-surface-2/80 border border-edge/10 p-3 text-[12px] text-fg leading-relaxed font-mono whitespace-pre-wrap overflow-x-auto">
                      {p.apiPreview}
                    </pre>
                  </div>
                )}
                {p.snippet && (
                  <div>
                    <div className="text-[11px] font-medium text-fg-faint mb-1.5 flex items-center gap-1.5">
                      <Code size={12} /> 代码范例
                    </div>
                    <pre className="rounded-md bg-surface-2/80 border border-edge/10 p-3 text-[12px] text-fg leading-relaxed font-mono whitespace-pre-wrap overflow-x-auto">
                      {p.snippet}
                    </pre>
                  </div>
                )}
                {p.install && (
                  <div>
                    <div className="text-[11px] font-medium text-fg-faint mb-1.5 flex items-center gap-1.5">
                      <Terminal size={12} /> 安装说明
                    </div>
                    <pre className="rounded-md bg-surface-2/80 border border-edge/10 p-3 text-[12px] text-fg leading-relaxed font-mono whitespace-pre-wrap">
                      {p.install}
                    </pre>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {p.snippet && (
                    <button
                      onClick={() => onInsert(p)}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] text-white font-medium hover:bg-primary/85 transition-colors"
                    >
                      <Plus size={13} />
                      插入到剧本
                    </button>
                  )}
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md border border-edge/10 px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
                    >
                      <ExternalLink size={13} />
                      查看来源
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// ③ 语法学院面板
// ============================================================
function AcademyPanel({
  lessons,
  expandedId,
  onToggle,
  onInsert,
}: {
  lessons: SyntaxLesson[]
  expandedId: string | null
  onToggle: (id: string | null) => void
  onInsert: (lesson: SyntaxLesson) => void
}) {
  if (lessons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-fg-faint">
        <GraduationCap size={40} strokeWidth={1} />
        <p className="mt-3 text-[14px]">没有匹配的教程</p>
      </div>
    )
  }

  const levelBadge = (lvl: SyntaxLesson['level']) => {
    const map: Record<string, string> = {
      '入门': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      '进阶': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      '高级': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    }
    return (
      <span className={`text-[10px] px-1.5 py-px rounded font-medium ${map[lvl] || ''}`}>
        {lvl}
      </span>
    )
  }

  return (
    <div className="p-6 space-y-3">
      {lessons.map((lesson) => {
        const isExpanded = expandedId === lesson.id
        return (
          <div
            key={lesson.id}
            className={`rounded-lg border transition-colors ${
              isExpanded ? 'border-primary/20 bg-surface' : 'border-edge/8 bg-surface/50 hover:bg-surface'
            }`}
          >
            <button
              onClick={() => onToggle(isExpanded ? null : lesson.id)}
              className="flex w-full items-start gap-4 px-4 py-4 text-left"
            >
              {/* 步骤编号 */}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[13px] font-semibold text-fg tabular-nums">
                {lesson.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-medium text-fg">{lesson.title}</span>
                  {levelBadge(lesson.level)}
                  <span className="rounded border border-edge/10 px-1.5 py-px text-[11px] text-fg-faint">
                    {lesson.category}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-fg-muted">{lesson.subtitle}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {lesson.tags.slice(0, 4).map((t) => (
                    <span key={t} className="text-[11px] text-fg-faint bg-surface-3/50 rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-fg-faint/50 mt-1">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {isExpanded && (
              <div className="border-t border-edge/8 px-4 py-4 space-y-4">
                {/* 教学内容 */}
                <div className="prose prose-sm max-w-none text-[14px] text-fg leading-relaxed space-y-3">
                  <ContentRenderer content={lesson.content} />
                </div>

                {/* 代码范例 */}
                <div>
                  <div className="text-[11px] font-medium text-fg-faint mb-1.5 flex items-center gap-1.5">
                    <Code size={12} /> 代码范例
                  </div>
                  <pre className="rounded-md bg-surface-2/80 border border-edge/10 p-3 text-[12px] text-fg leading-relaxed font-mono whitespace-pre-wrap overflow-x-auto">
                    {lesson.codeExample}
                  </pre>
                </div>

                {/* 操作栏 */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onInsert(lesson)}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] text-white font-medium hover:bg-primary/85 transition-colors"
                  >
                    <Plus size={13} />
                    插入到剧本
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// 简易 Markdown 渲染器（仅处理标题和段落）
// ============================================================
function ContentRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let codeBlock: string[] = []
  let inCode = false
  let codeLang = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={`code_${i}`} className="rounded-md bg-surface-2/80 border border-edge/10 p-3 text-[12px] text-fg leading-relaxed font-mono whitespace-pre-wrap overflow-x-auto my-2">
            {codeBlock.join('\n')}
          </pre>,
        )
        codeBlock = []
        inCode = false
      } else {
        inCode = true
        codeLang = line.replace('```', '').trim()
      }
      continue
    }
    if (inCode) {
      codeBlock.push(line)
      continue
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-[14px] font-semibold text-fg mt-4 mb-1">{line.replace('### ', '')}</h4>,
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-[15px] font-semibold text-fg mt-4 mb-2">{line.replace('## ', '')}</h3>,
      )
    } else if (line.startsWith('| ')) {
      // 表格行，保持原样
      elements.push(
        <pre key={i} className="text-[12px] text-fg-muted font-mono">{line}</pre>,
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
    } else if (line.startsWith('- ')) {
      elements.push(
        <li key={i} className="text-[13px] text-fg-muted ml-4 list-disc">{line.replace('- ', '')}</li>,
      )
    } else {
      elements.push(
        <p key={i} className="text-[14px] text-fg leading-relaxed">{line}</p>,
      )
    }
  }

  return <>{elements}</>
}

// ============================================================
// 辅助：分类 emoji
// ============================================================
function getPluginEmoji(cat: string): string {
  const map: Record<string, string> = {
    '角色表演': '🎭',
    'UI 界面': '🖥',
    '小游戏': '🎮',
    '系统引擎': '⚙',
    '视觉滤镜': '🎨',
    'NVL 模式': '📖',
  }
  return map[cat] || '📦'
}
