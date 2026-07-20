import { useMemo, useState } from 'react'
import {
  Sparkles,
  Move,
  MoveHorizontal,
  ZoomIn,
  Zap,
  LocateFixed,
  Rotate3d,
  Palette,
  Crop,
  PanelsTopLeft,
  Activity,
  ScrollText,
  MapPin,
  Box,
  Search,
  RotateCw,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { EFFECT_CATEGORIES, ALL_EFFECTS, type EffectItem, type EffectCategory } from '@/data/renpyEffects'
import PreviewStage, { type ActiveSpec } from '../effects/PreviewStage'
import { Button, IconButton } from '@/components/ui'

const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Move,
  MoveHorizontal,
  ZoomIn,
  Zap,
  LocateFixed,
  Rotate3d,
  Palette,
  Crop,
  PanelsTopLeft,
  Activity,
  ScrollText,
  MapPin,
  Box,
}

const TOTAL = ALL_EFFECTS.length

export default function EffectsLab() {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string>(EFFECT_CATEGORIES[0].id)
  const [active, setActive] = useState<ActiveSpec>({
    spec: EFFECT_CATEGORIES[0].items[0].preview,
    token: Date.now(),
  })
  const [activeItem, setActiveItem] = useState<EffectItem>(EFFECT_CATEGORIES[0].items[0])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return null
    return ALL_EFFECTS.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.cn.toLowerCase().includes(q) ||
        it.desc.toLowerCase().includes(q) ||
        (it.syntax ?? '').toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q),
    )
  }, [q])

  const select = (item: EffectItem, cat?: EffectCategory) => {
    setActiveItem(item)
    setActive({ spec: item.preview, token: Date.now() })
    if (cat) setExpanded(cat.id)
  }

  const replay = () => setActive((a) => ({ spec: a.spec, token: Date.now() }))

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas text-fg">
      <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-2.5">
        <Sparkles size={16} strokeWidth={1.75} className="text-signal" />
        <h1 className="text-[15px] font-semibold tracking-tight">特效大本营</h1>
        <span className="eyebrow ml-1">Ren&apos;Py Effects HQ</span>
        <span className="ml-auto font-mono text-[12px] text-fg-faint">全 {TOTAL} 项 · 14 大类 · 零遗漏</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ============ 左栏：分类 / 搜索 / 条目 ============ */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-edge/12 bg-surface/60">
          <div className="p-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-edge/15 bg-canvas px-2.5 py-1.5">
              <Search size={14} strokeWidth={1.75} className="text-fg-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索特效（中/英/语法）"
                className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {filtered ? (
              <div className="space-y-1">
                <div className="px-1 py-1.5 text-[12px] font-medium text-fg-muted">
                  搜索结果 · {filtered.length} 项
                </div>
                {filtered.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => select(it)}
                    className={`w-full rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
                      activeItem.id === it.id
                        ? 'bg-primary/[0.10] text-fg ring-1 ring-primary/30'
                        : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                    }`}
                  >
                    <span className="block font-medium">{it.cn}</span>
                    <span className="block font-mono text-[11px] text-fg-faint">{it.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              EFFECT_CATEGORIES.map((cat) => {
                const Icon = ICONS[cat.icon] ?? Sparkles
                const open = expanded === cat.id
                return (
                  <div key={cat.id} className="mb-1">
                    <button
                      onClick={() => setExpanded(open ? '' : cat.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                        open ? 'bg-surface-hover text-fg' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                      }`}
                    >
                      <Icon size={15} strokeWidth={1.75} className="shrink-0 text-signal" />
                      <span className="flex-1 text-[13px] font-medium">{cat.name}</span>
                      <span className="font-mono text-[11px] text-fg-faint">{cat.items.length}</span>
                      <ChevronRight
                        size={14}
                        className={`text-fg-faint transition-transform ${open ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {open && (
                      <div className="mt-0.5 space-y-0.5 pl-3">
                        {cat.items.map((it) => (
                          <button
                            key={it.id}
                            onClick={() => select(it, cat)}
                            className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                              activeItem.id === it.id
                                ? 'bg-primary/[0.10] text-fg ring-1 ring-primary/30'
                                : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                            }`}
                          >
                            <span className="block">{it.cn}</span>
                            <span className="block font-mono text-[11px] text-fg-faint">{it.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* ============ 中栏：预览舞台 ============ */}
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-surface px-2 py-1 text-[12px] text-fg-muted">
              {activeItem.cn}
            </span>
            <span className="font-mono text-[12px] text-fg-faint">{activeItem.name}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="outline" size="sm" icon={<RotateCw size={13} strokeWidth={1.75} />} onClick={replay}>
                重新播放
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <PreviewStage active={active} />
          </div>

          <p className="text-center text-[12px] text-fg-faint">
            点击左侧任意特效，上方舞台即刻丝滑演示 · 预览为 Web 近似实现，参数与语义与 Ren&apos;Py 一致
          </p>
        </main>

        {/* ============ 右栏：特效大百科详情 ============ */}
        <aside className="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l border-edge/12 bg-surface/60 p-4">
          <div className="mb-1 text-[12px] font-medium text-fg-muted">特效大百科</div>
          <h2 className="text-[18px] font-semibold tracking-tight">{activeItem.cn}</h2>
          <div className="mt-0.5 font-mono text-[13px] text-signal">{activeItem.name}</div>

          {activeItem.syntax && (
            <div className="mt-3">
              <div className="mb-1 text-[12px] text-fg-muted">示例语法</div>
              <pre className="overflow-x-auto rounded-lg border border-edge/12 bg-canvas px-3 py-2 font-mono text-[12px] leading-relaxed text-fg-subtle">
                {activeItem.syntax}
              </pre>
            </div>
          )}

          <div className="mt-3">
            <div className="mb-1 text-[12px] text-fg-muted">功能说明</div>
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg">{activeItem.desc}</p>
          </div>

          {activeItem.renpyClass && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary/[0.08] px-2 py-1 text-[12px] text-fg-muted">
              可实例化的转场 / 变换类
            </div>
          )}

          {activeItem.params && activeItem.params.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-[12px] text-fg-muted">参数用途</div>
              <div className="overflow-hidden rounded-lg border border-edge/12">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-canvas/60 text-left text-fg-faint">
                      <th className="px-2.5 py-1.5 font-medium">参数</th>
                      <th className="px-2.5 py-1.5 font-medium">类型</th>
                      <th className="px-2.5 py-1.5 font-medium">用途</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItem.params.map((p, i) => (
                      <tr key={i} className="border-t border-edge/10 align-top">
                        <td className="px-2.5 py-1.5 font-mono text-signal">{p.name}</td>
                        <td className="px-2.5 py-1.5 font-mono text-fg-subtle">{p.type}</td>
                        <td className="px-2.5 py-1.5 text-fg-subtle">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 text-[11px] leading-relaxed text-fg-faint">
            归类与说明由 ScriptWeaver 依据 Ren&apos;Py 官方文档整理，覆盖 Transitions / Transform
            Properties / matrixcolor / ATL Warpers / ATL 语句 / 内置定位变换 / 3D 舞台 全体系。
          </div>
        </aside>
      </div>
    </div>
  )
}
