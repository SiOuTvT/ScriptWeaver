import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Search, ChevronRight } from 'lucide-react'

// ===================== 颜色辅助 =====================
const KNOWN_CHAR_COLORS: Record<string, string> = {
  alice: '#f472b6',
  bob: '#38bdf8',
  charlie: '#a78bfa',
}
const CHAR_PALETTE = [
  '#f472b6', '#38bdf8', '#a78bfa', '#34d399',
  '#fbbf24', '#fb7185', '#22d3ee', '#c084fc',
]
function charColor(id: string): string {
  if (KNOWN_CHAR_COLORS[id]) return KNOWN_CHAR_COLORS[id]
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CHAR_PALETTE[h % CHAR_PALETTE.length]
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ===================== 类型 =====================
interface CardData {
  index: number
  lineId: string
  speakerId: string | null
  speakerName: string | null
  speakerColor: string | null
  dialogue: string
  backgroundId: string | null
  backgroundName: string | null
  characters: { charId: string; name: string; color: string; expr: string }[]
  bgm: string | null
  ambient: string | null
  se: string[]
  voice: string | null
}
interface SceneData {
  bgId: string | null
  label: string
  start: number
  end: number
  lineCount: number
}

// 音频 chip 图标
const ICON = {
  bg: '🖼',
  bgm: '🎵',
  ambient: '🌿',
  se: '⚡',
  voice: '🗣',
  char: '👤',
}

// 顶部统计小胶囊
function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-faint">
      <span className="font-semibold text-fg-muted">{value}</span>
      {label}
    </span>
  )
}

export default function ScriptOverview() {
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const getAsset = useAppStore((s) => s.getAsset)

  const [search, setSearch] = useState('')
  const [activeScene, setActiveScene] = useState<number | null>(null)
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  const charDisp = useCallback(
    (id: string | null) => {
      if (!id) return null
      return (
        characterConfigs.find((c) => c.charId.toLowerCase() === id.toLowerCase())?.displayName ?? id
      )
    },
    [characterConfigs],
  )

  const resolveExpr = useCallback(
    (charId: string | null, spriteId: string | undefined) => {
      if (!charId || !spriteId) return spriteId ?? ''
      const cfg = characterConfigs.find((c) => c.charId.toLowerCase() === charId.toLowerCase())
      return cfg?.expressions.find((e) => e.id === spriteId)?.label ?? spriteId
    },
    [characterConfigs],
  )

  // 解析所有卡片数据
  const cards = useMemo<CardData[]>(() => {
    return resolvedStates.map((st, i) => {
      const speakerColor = st.speaker ? charColor(st.speaker) : null
      const characters = Object.entries(st.characters).map(([charId, cs]) => ({
        charId,
        name: charDisp(charId) ?? charId,
        color: charColor(charId),
        expr: resolveExpr(charId, cs.sprite_id),
      }))
      const bgmId = typeof st.audio.bgm === 'object' && st.audio.bgm ? st.audio.bgm.asset_id : null
      return {
        index: i,
        lineId: st.line_id,
        speakerId: st.speaker,
        speakerName: charDisp(st.speaker),
        speakerColor,
        dialogue: st.dialogue,
        backgroundId: st.background?.asset_id ?? null,
        backgroundName: st.background ? getAsset(st.background.asset_id)?.name ?? st.background.asset_id : null,
        characters,
        bgm: bgmId ? getAsset(bgmId)?.name ?? bgmId : null,
        ambient: st.audio.ambient ? getAsset(st.audio.ambient.asset_id)?.name ?? st.audio.ambient.asset_id : null,
        se: st.audio.se.map((id) => getAsset(id)?.name ?? id),
        voice: st.voice ? getAsset(st.voice)?.name ?? st.voice : null,
      }
    })
  }, [resolvedStates, characterConfigs, getAsset, charDisp, resolveExpr])

  // 按背景切换切分场景（大纲树）
  const scenes = useMemo<SceneData[]>(() => {
    const out: SceneData[] = []
    let cur: SceneData | null = null
    cards.forEach((c) => {
      if (!cur || cur.bgId !== c.backgroundId) {
        const label = c.backgroundName ?? '未设置场景'
        cur = { bgId: c.backgroundId, label, start: c.index, end: c.index, lineCount: 0 }
        out.push(cur)
      }
      cur.end = c.index
      cur.lineCount++
    })
    return out
  }, [cards])

  // 统计概览
  const stats = useMemo(() => {
    const words = cards.reduce((sum, c) => sum + (c.dialogue?.length ?? 0), 0)
    return {
      lines: cards.length,
      scenes: scenes.length,
      characters: characterConfigs.length,
      words,
    }
  }, [cards, scenes, characterConfigs])

  // 过滤
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cards.filter((c) => {
      if (activeScene !== null) {
        const sc = scenes[activeScene]
        if (!sc || c.index < sc.start || c.index > sc.end) return false
      }
      if (!q) return true
      const hay = `${c.speakerName ?? ''} ${c.dialogue} ${c.characters.map((x) => x.name).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [cards, search, activeScene, scenes])

  // 滚动联动：标记离视口中心最近的卡片为当前行
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    let raf = 0
    const compute = () => {
      raf = 0
      const cRect = container.getBoundingClientRect()
      const center = cRect.top + container.clientHeight / 2
      let best: number | null = null
      let bestDist = Infinity
      cardRefs.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const c = r.top + r.height / 2
        const d = Math.abs(c - center)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      if (best !== null) setActiveLine(best)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute)
    }
    compute()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [filtered])

  const scrollToLine = useCallback((i: number) => {
    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const handleSceneClick = useCallback(
    (idx: number) => {
      setActiveScene(idx)
      scrollToLine(scenes[idx].start)
    },
    [scenes, scrollToLine],
  )

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* ============ 头部 ============ */}
      <div className="flex items-center justify-between gap-3 border-b border-edge/10 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">剧本总览</span>
          <div className="flex items-center gap-1">
            <StatChip label="行" value={stats.lines} />
            <StatChip label="场景" value={stats.scenes} />
            <StatChip label="角色" value={stats.characters} />
            <StatChip label="字" value={stats.words} />
          </div>
          {activeScene !== null && (
            <button
              onClick={() => setActiveScene(null)}
              className="rounded bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
            >
              返回全部场景 ✕
            </button>
          )}
          <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[10px] text-fg-faint">只读预览</span>
        </div>
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索角色 / 台词…"
            className="w-56 rounded-md border border-edge/10 bg-surface-3 py-1 pl-8 pr-3 text-[12px] text-fg placeholder-fg-faint outline-none focus:border-primary/40"
          />
        </div>
      </div>

      {/* ============ 主体 ============ */}
      <div className="flex min-h-0 flex-1">
        {/* ---- 节奏条（A）：按说话人着色，点任意处跳转 ---- */}
        <div className="flex w-3 shrink-0 flex-col border-r border-edge/10 bg-surface-1/40">
          {cards.map((c) => {
            const inFilter = filtered.includes(c)
            const isActive = c.index === activeLine
            return (
              <button
                key={c.index}
                onClick={() => scrollToLine(c.index)}
                title={`L${c.index + 1}${c.speakerName ? ' · ' + c.speakerName : ' · 旁白'}`}
                className="group relative flex-1 border-b border-edge/5 transition-all"
                style={{
                  opacity: inFilter ? 1 : 0.18,
                  background: c.speakerColor
                    ? rgba(c.speakerColor, isActive ? 1 : 0.85)
                    : isActive
                      ? 'rgba(255,255,255,0.14)'
                      : 'transparent',
                  boxShadow: isActive ? 'inset 0 0 0 2px rgba(255,255,255,0.9)' : undefined,
                }}
              >
                {!c.speakerColor && <span className="absolute inset-x-0 bottom-0 h-px bg-fg-faint/30" />}
              </button>
            )
          })}
        </div>

        {/* ---- 大纲树（B）：可折叠根节点 + 按场景分组 ---- */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-edge/10 bg-surface-1/30 py-2">
          <button
            onClick={() => setOutlineCollapsed((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 pb-1.5 text-left"
          >
            <ChevronRight
              size={12}
              className={`text-fg-subtle transition-transform ${outlineCollapsed ? '' : 'rotate-90'}`}
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">大纲 · 场景</span>
            <span className="ml-auto text-[10px] text-fg-faint">{scenes.length}</span>
          </button>
          {!outlineCollapsed &&
            scenes.map((sc, idx) => {
              const isActiveScene =
                activeScene === idx ||
                (activeLine !== null && activeLine >= sc.start && activeLine <= sc.end)
              return (
                <button
                  key={idx}
                  onClick={() => handleSceneClick(idx)}
                  className={`flex w-full items-center gap-2 px-3 py-2 pl-7 text-left transition-colors hover:bg-surface-hover ${
                    isActiveScene ? 'bg-surface-active' : ''
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border border-edge/20"
                    style={{ background: sc.bgId ? 'rgb(var(--c-accent) / 0.5)' : 'transparent' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{sc.label}</span>
                    <span className="block text-[11px] text-fg-faint">
                      L{sc.start + 1}–L{sc.end + 1} · {sc.lineCount} 行
                    </span>
                  </span>
                </button>
              )
            })}
        </div>

        {/* ---- 卡片流（C） ---- */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto px-8 py-5">
          <div className="flex flex-col gap-3">
            {filtered.length === 0 && (
              <div className="py-20 text-center text-[12px] text-fg-faint">没有匹配的行</div>
            )}
            {filtered.map((c) => {
              const isNarration = !c.speakerId
              const isActiveCard = c.index === activeLine
              const accent = c.speakerColor ?? 'rgb(var(--c-fg-faint))'
              return (
                <div
                  key={c.lineId}
                  ref={(el) => {
                    cardRefs.current[c.index] = el
                  }}
                  className={`rounded-lg border border-edge/10 bg-surface-2 p-3 shadow-1 transition-shadow hover:shadow-2 ${
                    isActiveCard ? 'ring-1 ring-primary/50' : ''
                  }`}
                  style={{ borderLeft: `3px solid ${isNarration ? 'transparent' : accent}` }}
                >
                  {/* 头部：说话人胶囊 / 旁白 */}
                  <div className="mb-1.5 flex items-center gap-2">
                    {isNarration ? (
                      <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-fg-subtle">
                        旁白
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: rgba(accent, 0.16), color: accent }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                        {c.speakerName}
                      </span>
                    )}
                    <span className="text-[10px] text-fg-faint">L{c.index + 1}</span>
                  </div>

                  {/* 台词正文 */}
                  <p
                    className={`text-[15px] leading-[1.7] ${
                      c.dialogue ? 'text-fg' : 'text-fg-faint italic'
                    }`}
                  >
                    {c.dialogue || '(空行)'}
                  </p>

                  {/* 素材 chip 行 */}
                  {(c.characters.length > 0 ||
                    c.backgroundName ||
                    c.bgm ||
                    c.ambient ||
                    c.se.length > 0 ||
                    c.voice) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-edge/10 pt-2">
                      {c.characters.map((ch) => (
                        <span
                          key={ch.charId}
                          className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ch.color }} />
                          {ICON.char} {ch.name}
                          {ch.expr && <span className="text-fg-faint">· {ch.expr}</span>}
                        </span>
                      ))}
                      {c.backgroundName && (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
                          {ICON.bg} {c.backgroundName}
                        </span>
                      )}
                      {c.bgm && (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
                          {ICON.bgm} {c.bgm}
                        </span>
                      )}
                      {c.ambient && (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
                          {ICON.ambient} {c.ambient}
                        </span>
                      )}
                      {c.se.map((s, k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted"
                        >
                          {ICON.se} {s}
                        </span>
                      ))}
                      {c.voice && (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
                          {ICON.voice} {c.voice}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
