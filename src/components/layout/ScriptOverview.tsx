import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Search, ChevronRight, Music, Image as ImageIcon, Workflow, List, AudioLines, Megaphone, Volume2, User, X } from 'lucide-react'

// ===================== 颜色辅助 =====================
import { resolveCharColor, resolveAssetColor } from '@/utils/charColor'
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
  bgmId: string | null
  ambientId: string | null
  seIds: string[]
  voiceId: string | null
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

// 音频 chip 图标（线性图标，避免 emoji 廉价感）
const ICON = {
  bg: <ImageIcon size={10} strokeWidth={1.75} className="text-fg-subtle" />,
  bgm: <Music size={10} strokeWidth={1.75} className="text-fg-subtle" />,
  ambient: <AudioLines size={10} strokeWidth={1.75} className="text-fg-subtle" />,
  se: <Megaphone size={10} strokeWidth={1.75} className="text-fg-subtle" />,
  voice: <Volume2 size={10} strokeWidth={1.75} className="text-fg-subtle" />,
  char: <User size={10} strokeWidth={1.75} className="text-fg-subtle" />,
}

// 顶部统计小胶囊
function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-faint">
      <span className="font-semibold text-fg-muted">{value}</span>
      {label}
    </span>
  )
}

export default function ScriptOverview() {
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const getAsset = useAppStore((s) => s.getAsset)

  const [search, setSearch] = useState('')
  const [activeScene, setActiveScene] = useState<number | null>(null)
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'tree'>('cards')

  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const treeRefs = useRef<(HTMLDivElement | null)[]>([])

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
      const speakerColor = st.speaker ? resolveCharColor(st.speaker, characterConfigs) : null
      const characters = Object.entries(st.characters).map(([charId, cs]) => ({
        charId,
        name: charDisp(charId) ?? charId,
        color: resolveCharColor(charId, characterConfigs),
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
        bgmId: bgmId ?? null,
        ambientId: st.audio.ambient ? st.audio.ambient.asset_id : null,
        seIds: st.audio.se,
        voiceId: st.audio.voice ?? null,
        characters,
        bgm: bgmId ? getAsset(bgmId)?.name ?? bgmId : null,
        ambient: st.audio.ambient ? getAsset(st.audio.ambient.asset_id)?.name ?? st.audio.ambient.asset_id : null,
        se: st.audio.se.map((id) => getAsset(id)?.name ?? id),
        voice: st.audio.voice ? getAsset(st.audio.voice)?.name ?? st.audio.voice : null,
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

  // 每场景聚合：出现的角色（彩色叶子）+ 素材计数，用于剧情树
  const sceneDetails = useMemo(() => {
    return scenes.map((sc) => {
      const chars = new Map<string, string>() // charId -> color
      let bgCount = 0
      let audioCount = 0
      for (let i = sc.start; i <= sc.end; i++) {
        const c = cards[i]
        if (!c) continue
        c.characters.forEach((ch) => {
          if (!chars.has(ch.charId)) chars.set(ch.charId, ch.color)
        })
        if (c.backgroundName) bgCount++
        if (c.bgm || c.ambient || c.se.length > 0 || c.voice) audioCount++
      }
      return { chars: [...chars.entries()], bgCount, audioCount }
    })
  }, [scenes, cards])

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

  // 滚动联动：标记离视口中心最近的卡片为当前行（仅卡片流视图使用）
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
  const scrollToScene = useCallback((idx: number) => {
    treeRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const handleSceneClick = useCallback(
    (idx: number) => {
      setActiveScene(idx)
      if (viewMode === 'tree') scrollToScene(idx)
      else scrollToLine(scenes[idx].start)
    },
    [scenes, scrollToLine, scrollToScene, viewMode],
  )

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* ============ 头部 ============ */}
      <div className="flex items-center justify-between gap-3 border-b border-edge/10 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="eyebrow">剧本总览 Script</span>
          <div className="flex items-center gap-1">
            <StatChip label="行" value={stats.lines} />
            <StatChip label="场景" value={stats.scenes} />
            <StatChip label="角色" value={stats.characters} />
            <StatChip label="字" value={stats.words} />
          </div>
          {activeScene !== null && (
            <button
              onClick={() => setActiveScene(null)}
              className="inline-flex items-center gap-1 rounded bg-signal-soft px-2 py-0.5 text-[12px] font-medium text-signal transition-colors hover:bg-signal/20"
            >
              <X size={12} strokeWidth={2} /> 返回全部场景
            </button>
          )}
          <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[12px] text-fg-faint">只读预览</span>
        </div>
        <div className="flex items-center gap-3">
          {/* 视图切换：卡片流 / 剧情树 */}
          <div className="flex items-center rounded-lg border border-edge/10 bg-surface-3 p-0.5 text-[12px] shadow-inset-top">
            <button
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-all ${viewMode === 'cards' ? 'bg-surface-2 font-medium text-fg shadow-1' : 'text-fg-subtle hover:text-fg'}`}
            ><List size={13} strokeWidth={2} />卡片</button>
            <button
              onClick={() => setViewMode('tree')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-all ${viewMode === 'tree' ? 'bg-surface-2 font-medium text-fg shadow-1' : 'text-fg-subtle hover:text-fg'}`}
            ><Workflow size={13} strokeWidth={2} />剧情树</button>
          </div>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索角色 / 台词…"
              className="w-56 rounded-md border border-edge/10 bg-surface-3 py-1 pl-8 pr-3 text-[13px] text-fg placeholder-fg-faint outline-none focus:border-signal/40"
            />
          </div>
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
                title={`L${c.index + 1}${c.speakerName ? ' ' + c.speakerName : ' 旁白'}`}
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
            <span className="text-[12px] font-medium text-fg-muted">大纲 场景</span>
            <span className="ml-auto text-[12px] text-fg-faint">{scenes.length}</span>
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
                  className={`relative flex w-full items-center gap-2 px-3 py-2 pl-7 text-left transition-colors hover:bg-surface-hover ${
                    isActiveScene ? 'signal-bar bg-surface-active' : ''
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border border-edge/20"
                    style={{ background: sc.bgId ? resolveAssetColor(sc.bgId, assets) + '80' : 'transparent' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-fg">{sc.label}</span>
                    <span className="block text-[12px] text-fg-faint">
                      L{sc.start + 1}–L{sc.end + 1} {sc.lineCount} 行
                    </span>
                  </span>
                </button>
              )
            })}
        </div>

        {/* ---- 卡片流（C） / 剧情树 ---- */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto px-8 py-5">
          {viewMode === 'tree' ? (
            /* 剧情树：竖向时间轴工作流 */
            <div className="mx-auto max-w-3xl pb-12">
              {scenes.map((sc, idx) => {
                const d = sceneDetails[idx]
                const isActive = activeScene === idx
                const bgColor = sc.bgId ? resolveAssetColor(sc.bgId, assets) : null
                const railColor = bgColor ?? 'rgb(var(--c-edge-strong) / 0.35)'
                return (
                  <div
                    key={idx}
                    ref={(el) => {
                      treeRefs.current[idx] = el
                    }}
                    className="relative flex animate-fade-in gap-4 pb-4"
                    style={{ animationDelay: `${idx * 45}ms` }}
                  >
                    {/* 时间轴轨道 + 编号节点 */}
                    <div className="relative flex w-9 shrink-0 flex-col items-center">
                      {idx < scenes.length - 1 && (
                        <div className="absolute top-9 bottom-[-16px] w-px bg-gradient-to-b from-edge/25 to-edge/5" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleSceneClick(idx)}
                        title={`跳到场景 ${idx + 1}`}
                        className="z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 text-[13px] font-semibold tabular-nums outline-none transition-transform hover:scale-110"
                        style={{
                          borderColor: railColor,
                          background: bgColor ? bgColor + '1f' : 'rgb(var(--c-surface-3))',
                          color: bgColor ?? 'rgb(var(--c-fg-muted))',
                          boxShadow: isActive ? `0 0 0 4px ${bgColor ?? 'rgb(var(--c-signal) / 0.25)'}` : undefined,
                        }}
                      >
                        {idx + 1}
                      </button>
                    </div>

                    {/* 场景卡 */}
                    <button
                      type="button"
                      onClick={() => handleSceneClick(idx)}
                      className={`group relative flex-1 overflow-hidden rounded-xl border bg-surface-2 p-3.5 text-left shadow-1 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2 ${
                        isActive ? 'border-signal/40 ring-2 ring-signal/30' : 'border-edge/10'
                      }`}
                    >
                      {/* 顶部色条 */}
                      {bgColor && (
                        <span
                          className="absolute inset-x-0 top-0 h-0.5"
                          style={{ background: `linear-gradient(90deg, ${bgColor}, ${bgColor}00)` }}
                        />
                      )}

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[14px] font-semibold text-fg">
                            {sc.label}
                          </h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-faint">
                            <span className="font-mono tabular-nums">L{sc.start + 1}–L{sc.end + 1}</span>
                            <span className="h-1 w-1 rounded-full bg-fg-faint/40" />
                            <span>{sc.lineCount} 行</span>
                            {d.audioCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-accent">
                                <Music size={12} strokeWidth={2} />{d.audioCount}
                              </span>
                            )}
                            {d.bgCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-fg-subtle">
                                <ImageIcon size={12} strokeWidth={2} />{d.bgCount}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 背景色预览 */}
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-edge/10"
                          style={{ background: bgColor ? bgColor + '14' : 'rgb(var(--c-surface-3))' }}
                        >
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{ background: bgColor ?? 'rgb(var(--c-fg-faint))' }}
                          />
                        </div>
                      </div>

                      {/* 角色叶子 */}
                      {d.chars.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-edge/10 pt-3">
                          {d.chars.map(([cid, color]) => (
                            <span
                              key={cid}
                              className="inline-flex items-center gap-1.5 rounded-full bg-surface-3/60 px-2 py-0.5 text-[12px] text-fg-muted ring-1 ring-edge/5"
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: color, boxShadow: `0 0 0 2px ${color}22` }}
                              />
                              {charDisp(cid) ?? cid}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.length === 0 && (
                <div className="py-20 text-center text-[13px] text-fg-faint">没有匹配的行</div>
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
                    className={`rounded-lg border border-edge/10 bg-surface-2 p-2.5 shadow-1 transition-shadow hover:shadow-2 ${
                      isActiveCard ? 'ring-1 ring-signal/50' : ''
                    }`}
                    style={{ borderLeft: `3px solid ${isNarration ? 'transparent' : accent}` }}
                  >
                    {/* 头部：说话人胶囊 / 旁白 */}
                    <div className="mb-1 flex items-center gap-2">
                      {isNarration ? (
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12px] font-medium text-fg-subtle">
                          旁白
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                          style={{ background: rgba(accent, 0.16), color: accent }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                          {c.speakerName}
                        </span>
                      )}
                      <span className="text-[12px] text-fg-faint">L{c.index + 1}</span>
                    </div>

                    {/* 台词正文 */}
                    <p
                      className={`text-[14px] leading-[1.55] ${
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
                      <div className="mt-1.5 flex flex-wrap gap-1 border-t border-edge/10 pt-1.5">
                        {c.characters.map((ch) => (
                          <span
                            key={ch.charId}
                            className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-muted"
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: ch.color }} />
                            {ICON.char} {ch.name}
                            {ch.expr && <span className="text-fg-faint">{ch.expr}</span>}
                          </span>
                        ))}
                        {c.backgroundName && (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-muted">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: resolveAssetColor(c.backgroundId, assets) }} />
                            {ICON.bg} {c.backgroundName}
                          </span>
                        )}
                        {c.bgm && (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-muted">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: resolveAssetColor(c.bgmId, assets) }} />
                            {ICON.bgm} {c.bgm}
                          </span>
                        )}
                        {c.ambient && (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-muted">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: resolveAssetColor(c.ambientId, assets) }} />
                            {ICON.ambient} {c.ambient}
                          </span>
                        )}
                        {c.se.map((s, k) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-muted"
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: resolveAssetColor(c.seIds[k], assets) }} />
                            {ICON.se} {s}
                          </span>
                        ))}
                        {c.voice && (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-muted">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: resolveAssetColor(c.voiceId, assets) }} />
                            {ICON.voice} {c.voice}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
