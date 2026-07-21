import { useState, useMemo, useRef, useCallback, useEffect, memo, type ReactNode } from 'react'
import { useAppStore } from '@/stores/appStore'
import {
  Search,
  X,
  ListTree,
  LayoutGrid,
  GitBranch,
  Image as ImageIcon,
  Users,
  Hash,
  Tag,
  Layers,
  FileText,
  ArrowRight,
  Filter,
  Crosshair,
  type LucideIcon,
} from 'lucide-react'

import { resolveCharColor, resolveAssetColor } from '@/utils/charColor'
import type { AssetItem } from '@/core/types'

// ===================== 颜色辅助 =====================
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgba(hex: string, a: number): string {
  if (!hex || hex === 'transparent') return `rgba(127,127,127,${a})`
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ===================== 单行精简模型 =====================
interface CharRef {
  charId: string
  name: string
  color: string
}
interface LineEss {
  index: number
  lineId: string
  speakerId: string | null
  speakerName: string | null
  speakerColor: string | null
  dialogue: string
  isChoice: boolean
  choiceCount: number
  label: string | null
  bgId: string | null
  bgName: string | null
  characters: CharRef[]
}

interface SceneBlock {
  key: string
  bgId: string | null
  bgName: string | null
  label: string | null
  start: number
  end: number
  lineCount: number
  dialogueLines: number
  choiceCount: number
  choiceLines: number
  characters: CharRef[]
  firstDialogue: string
  lines: LineEss[]
}

// ===================== 主组件 =====================
export default function ScriptOverview() {
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const getAsset = useAppStore((s) => s.getAsset)
  const selectedLineIndex = useAppStore((s) => s.selectedLineIndex)
  const selectLine = useAppStore((s) => s.selectLine)
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'outline' | 'grid'>('grid')
  const [fSpeaker, setFSpeaker] = useState<string | null>(null)
  const [fHasChoice, setFHasChoice] = useState(false)
  const [fHasBackground, setFHasBackground] = useState(false)
  const [fHasLabel, setFHasLabel] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const charDisp = useCallback(
    (id: string | null) => {
      if (!id) return null
      return characterConfigs.find((c) => c.charId.toLowerCase() === id.toLowerCase())?.displayName ?? id
    },
    [characterConfigs],
  )

  // 解析全部行（用于全局指标 + 过滤基数）
  const lines = useMemo<LineEss[]>(() => {
    return resolvedStates.map((st, i) => {
      const speakerColor = st.speaker ? resolveCharColor(st.speaker, characterConfigs) : null
      const characters: CharRef[] = Object.entries(st.characters).map(([key, cs]) => {
        const cid = cs.char_id ?? key
        return {
          charId: cid,
          name: charDisp(cid) ?? cid,
          color: resolveCharColor(cid, characterConfigs),
        }
      })
      const isChoice = st.line_type === 'choice'
      const choiceCount = isChoice ? (st.choices?.length ?? 0) : 0
      const bgId = st.background?.asset_id ?? null
      return {
        index: i,
        lineId: st.line_id,
        speakerId: st.speaker ?? null,
        speakerName: charDisp(st.speaker),
        speakerColor,
        dialogue: st.dialogue,
        isChoice,
        choiceCount,
        label: st.label ?? null,
        bgId,
        bgName: bgId ? getAsset(bgId)?.name ?? bgId : null,
        characters,
      }
    })
  }, [resolvedStates, characterConfigs, getAsset, charDisp])

  // 按背景切换切分剧情块（场景）
  const groupScenes = useCallback(
    (src: LineEss[]): SceneBlock[] => {
      const out: SceneBlock[] = []
      let cur: SceneBlock | null = null
      for (const ln of src) {
        if (!cur || cur.bgId !== ln.bgId) {
          const block: SceneBlock = {
            key: `s-${ln.index}`,
            bgId: ln.bgId,
            bgName: ln.bgName,
            label: ln.label,
            start: ln.index,
            end: ln.index,
            lineCount: 0,
            dialogueLines: 0,
            choiceCount: 0,
            choiceLines: 0,
            characters: [],
            firstDialogue: ln.dialogue,
            lines: [],
          }
          cur = block
          out.push(cur)
        }
        cur.end = ln.index
        cur.lineCount++
        cur.lines.push(ln)
        if (ln.dialogue.trim()) cur.dialogueLines++
        if (ln.isChoice) cur.choiceLines++
        cur.choiceCount += ln.choiceCount
        if (!cur.label && ln.label) cur.label = ln.label
        if (!cur.firstDialogue && ln.dialogue.trim()) cur.firstDialogue = ln.dialogue
        // 角色去重合并
        for (const ch of ln.characters) {
          if (!cur!.characters.some((c) => c.charId === ch.charId)) cur!.characters.push(ch)
        }
      }
      return out
    },
    [],
  )

  const fullScenes = useMemo(() => groupScenes(lines), [lines, groupScenes])
  const speakers = useMemo(
    () => characterConfigs.filter((c) => lines.some((l) => l.speakerId === c.charId)),
    [characterConfigs, lines],
  )

  // 全局仪表盘指标（上帝视角，不受过滤影响）
  const metrics = useMemo(() => {
    const words = lines.reduce((sum, l) => sum + (l.dialogue?.length ?? 0), 0)
    const choiceLines = lines.filter((l) => l.isChoice).length
    const endings = new Set<string>()
    resolvedStates.forEach((st) => {
      if (st.line_type === 'choice' && st.choices) {
        st.choices.forEach((c) => {
          if (c.target_label) endings.add(c.target_label)
        })
      }
    })
    return [
      { label: '剧本总字数', value: words.toLocaleString('zh-CN'), unit: '字', icon: FileText, tone: 'signal' as const },
      { label: '剧情块', value: fullScenes.length, unit: '个场景', icon: Layers, tone: 'fg' as const },
      { label: '选择支', value: choiceLines, unit: '处分支', icon: GitBranch, tone: 'accent' as const },
      { label: '分支结局', value: endings.size, unit: '个落点', icon: Crosshair, tone: 'fg' as const },
      { label: '包含角色', value: characterConfigs.length, unit: '位', icon: Users, tone: 'fg' as const },
      { label: '总行数', value: lines.length, unit: '行', icon: Hash, tone: 'fg' as const },
    ]
  }, [lines, fullScenes, characterConfigs, resolvedStates])

  // 过滤（角色 / 选择支 / 背景 / 标签 / 文本）
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lines.filter((ln) => {
      if (fSpeaker && ln.speakerId !== fSpeaker) return false
      if (fHasChoice && !ln.isChoice) return false
      if (fHasBackground && !ln.bgId) return false
      if (fHasLabel && !ln.label) return false
      if (q) {
        const hay = `${ln.speakerName ?? ''} ${ln.dialogue} ${ln.label ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [lines, search, fSpeaker, fHasChoice, fHasBackground, fHasLabel])

  const scenes = useMemo(() => groupScenes(filteredLines), [filteredLines, groupScenes])

  const activeFilterCount =
    (fSpeaker ? 1 : 0) + (fHasChoice ? 1 : 0) + (fHasBackground ? 1 : 0) + (fHasLabel ? 1 : 0)

  const clearFilters = useCallback(() => {
    setSearch('')
    setFSpeaker(null)
    setFHasChoice(false)
    setFHasBackground(false)
    setFHasLabel(false)
  }, [])

  // 点击任意卡片 / 摘要 → 高亮并平滑跳转时间轴对应位置编辑
  const jumpTo = useCallback(
    (index: number) => {
      selectLine(index)
      setActiveNavItem('chapters')
    },
    [selectLine, setActiveNavItem],
  )

  // 过滤后若当前激活行不在视图，确保滚动可见（仅视觉提示，不强制跳转导航）
  useEffect(() => {
    if (selectedLineIndex == null) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-line="${selectedLineIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedLineIndex, viewMode])

  // ===================== 渲染 =====================
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* ============ 头部 ============ */}
      <div className="flex items-center justify-between gap-3 border-b border-edge/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="signal-dot" />
          <span className="t-h2">剧本总览</span>
          <span className="eyebrow">Script Overview</span>
          <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[12px] text-fg-faint">只读预览</span>
        </div>
        {/* 视图切换：大纲 / 卡片网格 */}
        <div className="flex items-center rounded-lg border border-edge/10 bg-surface-3 p-0.5 text-[12px] shadow-inset-top">
          <button
            onClick={() => setViewMode('outline')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
              viewMode === 'outline' ? 'bg-surface-2 font-medium text-fg shadow-1' : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <ListTree size={14} strokeWidth={1.75} />大纲
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
              viewMode === 'grid' ? 'bg-surface-2 font-medium text-fg shadow-1' : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <LayoutGrid size={14} strokeWidth={1.75} />卡片
          </button>
        </div>
      </div>

      {/* ============ 滚动主体 ============ */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* ---- 沉浸式仪表盘 ---- */}
        <section className="relative mb-4 overflow-hidden rounded-xl border border-edge/10 bg-surface shadow-2">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-surface-1/70 via-transparent to-transparent" />
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-signal/10 blur-3xl" />
          <div className="relative flex flex-wrap items-stretch divide-x divide-edge/10">
            {metrics.map((m) => {
              const Icon = m.icon
              const toneColor =
                m.tone === 'signal'
                  ? 'rgb(var(--c-signal))'
                  : m.tone === 'accent'
                    ? 'rgb(var(--c-accent))'
                    : 'rgb(var(--c-fg))'
              return (
                <div key={m.label} className="flex min-w-[140px] flex-1 flex-col gap-1 px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <Icon size={13} strokeWidth={1.75} style={{ color: toneColor }} />
                    <span className="t-label" style={{ color: toneColor }}>
                      {m.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="t-mono font-semibold leading-none"
                      style={{ fontSize: 18, color: toneColor }}
                    >
                      {m.value}
                    </span>
                    <span className="t-micro">{m.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ---- 高级检索与过滤 ---- */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索台词、剧情块标签、角色…"
              className="w-64 rounded-md border border-edge/10 bg-surface-3 py-1.5 pl-8 pr-3 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-signal/40"
            />
          </div>

          {/* 角色对白筛选 */}
          <div className="relative">
            <Users
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <select
              value={fSpeaker ?? ''}
              onChange={(e) => setFSpeaker(e.target.value || null)}
              className="appearance-none rounded-md border border-edge/10 bg-surface-3 py-1.5 pl-8 pr-7 text-[13px] text-fg outline-none transition-colors focus:border-signal/40"
            >
              <option value="">全部角色</option>
              {speakers.map((c) => (
                <option key={c.charId} value={c.charId}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* 维度过滤 chips */}
          <FilterChip active={fHasChoice} onClick={() => setFHasChoice((v) => !v)} icon={GitBranch}>
            含选择支
          </FilterChip>
          <FilterChip active={fHasBackground} onClick={() => setFHasBackground((v) => !v)} icon={ImageIcon}>
            有背景
          </FilterChip>
          <FilterChip active={fHasLabel} onClick={() => setFHasLabel((v) => !v)} icon={Tag}>
            有标签
          </FilterChip>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <X size={12} strokeWidth={2} />清除筛选
            </button>
          )}

          <span className="ml-auto text-[12px] text-fg-faint">
            命中 <span className="t-mono text-fg-muted">{filteredLines.length}</span> / {lines.length} 行
          </span>
        </div>

        {/* ---- 主体：大纲 / 卡片网格 ---- */}
        {scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-[13px] text-fg-faint">
            <Search size={22} strokeWidth={1.5} className="text-fg-faint/60" />
            没有匹配的内容
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-3 pb-8">
            {scenes.map((sc) => (
              <SceneCard key={sc.key} scene={sc} assets={assets} onJump={jumpTo} activeLine={selectedLineIndex} />
            ))}
          </div>
        ) : (
          <div className="space-y-3 pb-8">
            {scenes.map((sc) => (
              <OutlineScene
                key={sc.key}
                scene={sc}
                assets={assets}
                onJump={jumpTo}
                activeLine={selectedLineIndex}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ===================== 过滤 chip =====================
function FilterChip({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors ${
        active
          ? 'border-signal/40 bg-signal/15 font-medium text-signal'
          : 'border-edge/10 bg-surface-3 text-fg-subtle hover:text-fg'
      }`}
    >
      <Icon size={13} strokeWidth={1.75} />
      {children}
    </button>
  )
}

// ===================== 角色头像 =====================
function CharAvatar({ ch, size = 20 }: { ch: CharRef; size?: number }) {
  const initial = (ch.name || ch.charId || '?').slice(0, 1).toUpperCase()
  return (
    <span
      title={ch.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-fg"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: rgba(ch.color, 0.16),
        boxShadow: `inset 0 0 0 1.5px ${rgba(ch.color, 0.55)}`,
      }}
    >
      {initial}
    </span>
  )
}

// ===================== 场景卡片（网格视图） =====================
const SceneCard = memo(function SceneCard({
  scene,
  assets,
  onJump,
  activeLine,
}: {
  scene: SceneBlock
  assets: AssetItem[]
  onJump: (i: number) => void
  activeLine: number
}) {
  const accent = scene.bgId ? resolveAssetColor(scene.bgId, assets) : 'rgb(var(--c-fg-faint))'
  const isActive = activeLine >= scene.start && activeLine <= scene.end
  return (
    <button
      onClick={() => onJump(scene.start)}
      data-line={scene.start}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-surface-2 p-3.5 text-left shadow-1 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2 ${
        isActive ? 'border-signal/40 ring-2 ring-signal/25' : 'border-edge/10'
      }`}
    >
      {/* 顶部分类色条 */}
      <span
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          {/* 标签 */}
          {scene.label ? (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-signal/15 px-1.5 py-0.5 text-[12px] font-medium text-signal">
              <Tag size={11} strokeWidth={1.75} />#{scene.label}
            </span>
          ) : (
            <span className="t-micro">未标记剧情块</span>
          )}
          {/* 背景名 */}
          <span className="t-micro inline-flex items-center gap-1">
            <ImageIcon size={11} strokeWidth={1.75} className="text-fg-subtle" />
            {scene.bgName ?? '未设置场景'}
          </span>
        </div>
        {/* 背景色预览 */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge/10"
          style={{ background: rgba(accent, 0.12) }}
        >
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: accent }} />
        </div>
      </div>

      {/* 首行台词摘要 */}
      <p className="mt-2.5 line-clamp-3 text-[14px] leading-relaxed text-fg">
        {scene.firstDialogue.trim() || '(空行)'}
      </p>

      {/* 统计行 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge/10 pt-2.5 text-[12px] text-fg-subtle">
        <span className="inline-flex items-center gap-1" title="对白总行数">
          <FileText size={11} strokeWidth={1.75} />
          {scene.dialogueLines} 行对白
        </span>
        {scene.choiceCount > 0 && (
          <span className="inline-flex items-center gap-1 text-signal" title="选择支数量">
            <GitBranch size={11} strokeWidth={1.75} />
            {scene.choiceCount} 选择支
          </span>
        )}
        <span className="ml-auto text-fg-faint t-mono">
          L{scene.start + 1}–L{scene.end + 1}
        </span>
      </div>

      {/* 角色立绘列表 */}
      {scene.characters.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {scene.characters.map((ch) => (
            <CharAvatar key={ch.charId} ch={ch} />
          ))}
        </div>
      )}

      {/* hover 跳转提示 */}
      <span className="mt-2.5 inline-flex items-center gap-1 text-[12px] text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">
        点击定位到时间轴 <ArrowRight size={12} strokeWidth={1.75} />
      </span>
    </button>
  )
})

// ===================== 大纲场景（大纲视图） =====================
function OutlineScene({
  scene,
  assets,
  onJump,
  activeLine,
}: {
  scene: SceneBlock
  assets: AssetItem[]
  onJump: (i: number) => void
  activeLine: number
}) {
  const accent = scene.bgId ? resolveAssetColor(scene.bgId, assets) : 'rgb(var(--c-fg-faint))'
  const isActive = activeLine >= scene.start && activeLine <= scene.end
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface shadow-1 ${
        isActive ? 'border-signal/30' : 'border-edge/10'
      }`}
    >
      {/* 场景头 */}
      <button
        onClick={() => onJump(scene.start)}
        data-line={scene.start}
        className={`group flex w-full items-center gap-3 border-b border-edge/10 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover ${
          isActive ? 'bg-signal/5' : ''
        }`}
      >
        <span
          className="h-7 w-7 shrink-0 rounded-md border border-edge/10"
          style={{ background: rgba(accent, 0.14) }}
        >
          <span
            className="block h-full w-full rounded-md"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}55)`,
              boxShadow: `inset 0 0 0 1.5px ${rgba(accent, 0.5)}`,
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {scene.label ? (
              <span className="inline-flex items-center gap-1 rounded bg-signal/15 px-1.5 py-0.5 text-[12px] font-medium text-signal">
                <Tag size={11} strokeWidth={1.75} />#{scene.label}
              </span>
            ) : (
              <span className="t-micro">未标记剧情块</span>
            )}
            <span className="truncate text-[13px] text-fg-subtle">{scene.bgName ?? '未设置场景'}</span>
          </div>
          <span className="t-micro t-mono">
            L{scene.start + 1}–L{scene.end + 1} · {scene.lineCount} 行
            {scene.choiceCount > 0 && ` · ${scene.choiceCount} 选择支`}
          </span>
        </div>
        {/* 角色头像 */}
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {scene.characters.slice(0, 5).map((ch) => (
            <CharAvatar key={ch.charId} ch={ch} size={22} />
          ))}
          {scene.characters.length > 5 && (
            <span className="t-micro">+{scene.characters.length - 5}</span>
          )}
        </div>
        <ArrowRight
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>

      {/* 行摘要列表 */}
      <div className="divide-y divide-edge/8 bg-surface-1/30">
        {scene.lines.map((ln) => (
          <button
            key={ln.lineId}
            onClick={() => onJump(ln.index)}
            data-line={ln.index}
            className={`group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover ${
              activeLine === ln.index ? 'signal-bar bg-signal/5' : ''
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: ln.speakerColor ?? 'transparent', boxShadow: ln.speakerColor ? `0 0 0 2px ${rgba(ln.speakerColor, 0.25)}` : 'none' }}
            />
            <span className="t-mono w-12 shrink-0 text-[12px] text-fg-faint">L{ln.index + 1}</span>
            {ln.speakerName ? (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[12px] font-medium"
                style={{ background: rgba(ln.speakerColor ?? '#888', 0.16), color: ln.speakerColor ?? 'rgb(var(--c-fg-muted))' }}
              >
                {ln.speakerName}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-subtle">
                旁白
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-subtle group-hover:text-fg">
              {ln.isChoice ? `选择支 · ${ln.choiceCount} 选项` : ln.dialogue.trim() || '(空行)'}
            </span>
            {ln.label && (
              <span className="shrink-0 rounded bg-signal/15 px-1 text-[11px] text-signal" title={`剧情块标签：${ln.label}`}>
                #{ln.label}
              </span>
            )}
            {ln.isChoice && <GitBranch size={12} strokeWidth={1.75} className="shrink-0 text-signal" />}
          </button>
        ))}
      </div>
    </div>
  )
}
