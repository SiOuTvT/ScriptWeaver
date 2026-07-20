import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
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
  ArrowLeft,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { EFFECT_CATEGORIES, ALL_EFFECTS, type EffectItem, type PreviewSpec } from '@/data/renpyEffects'
import PreviewStage, { type ActiveSpec } from '../effects/PreviewStage'
import { Button, IconButton } from '@/components/ui'
import { useAppStore } from '@/stores/appStore'
import { resolveAssetSrc } from '@/utils/assetSrc'
import type { AssetItem } from '@/core/types'

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

// 幅度滑块适用的特效种类（其余以时长为主）
const AMP_KINDS = new Set<PreviewSpec['kind']>([
  'shake',
  'rotate',
  'flip',
  'zoom',
  'move',
  'slide',
  'push',
  'pixellate',
  'blur',
  'crop',
  'position',
  'polar',
  'loop',
  'parallel',
  'rotate3d',
  'alpha',
  'additive',
  'swing',
])

const TOTAL = ALL_EFFECTS.length

function firstLine(s: string): string {
  const i = s.search(/[。；;]/)
  return i > 0 ? s.slice(0, i) : s
}

// ============================================================
// 素材选择器（三级保底：默认首图 / 列表直选 / 本地选择）
// ============================================================
function MatPicker({
  label,
  list,
  selectedId,
  local,
  onSelect,
  onLocal,
  onClearLocal,
  fileRef,
}: {
  label: string
  list: AssetItem[]
  selectedId: string | null
  local: { url: string; name: string } | null
  onSelect: (id: string) => void
  onLocal: (f: File) => void
  onClearLocal: () => void
  fileRef: RefObject<HTMLInputElement>
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[12px] font-medium text-fg-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {list.map((a) => {
          const url = resolveAssetSrc(a)
          const active = !local && a.id === selectedId
          return (
            <button
              key={a.id}
              title={a.name}
              onClick={() => onSelect(a.id)}
              className={`h-9 w-9 shrink-0 overflow-hidden rounded-md border transition-colors ${
                active ? 'border-signal ring-1 ring-signal/40' : 'border-edge/15 hover:border-edge-strong/30'
              }`}
            >
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full bg-surface-2" />
              )}
            </button>
          )
        })}
        {list.length === 0 && <span className="text-[12px] text-fg-faint">素材库暂无{label}</span>}
        {local && (
          <div className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-signal/50 bg-primary/[0.08] pl-1 pr-0.5">
            <img src={local.url} alt="" className="h-7 w-7 rounded object-cover" draggable={false} />
            <span className="max-w-[64px] truncate text-[12px] text-fg-subtle">{local.name}</span>
            <button onClick={onClearLocal} className="rounded p-0.5 text-fg-faint hover:text-fg" title="清除本地图">
              <X size={12} />
            </button>
          </div>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-dashed border-edge/25 px-2 text-[12px] text-fg-subtle hover:border-signal/40 hover:text-fg"
          title="从电脑选择（不导入项目）"
        >
          <Upload size={13} strokeWidth={1.75} />
          本地
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onLocal(f)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

// ============================================================
// 特效卡片（首页卡片墙）
// ============================================================
function EffectCard({ item, active, onClick }: { item: EffectItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-full flex-col rounded-lg border p-3 text-left transition-colors ${
        active
          ? 'border-signal/50 bg-primary/[0.08]'
          : 'border-edge/12 bg-surface-2 hover:border-edge-strong/25 hover:bg-surface-hover'
      }`}
    >
      <span className="text-[14px] font-semibold leading-snug text-fg">{item.cn}</span>
      <span className="mt-0.5 font-mono text-[12px] text-signal">{item.name}</span>
      <span className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-fg-subtle">{firstLine(item.desc)}</span>
    </button>
  )
}

// ============================================================
// 主组件
// ============================================================
export default function EffectsLab() {
  const assets = useAppStore((s) => s.assets)
  const bgList = useMemo(() => assets.filter((a) => a.type === 'background'), [assets])
  const spriteList = useMemo(() => assets.filter((a) => a.type === 'sprite'), [assets])

  const [view, setView] = useState<'home' | 'detail'>('home')
  const [selected, setSelected] = useState<EffectItem | null>(null)
  const [catId, setCatId] = useState<string>(EFFECT_CATEGORIES[0].id)
  const [query, setQuery] = useState('')
  const [duration, setDuration] = useState(1200)
  const [amp, setAmp] = useState(1.0)
  const [playToken, setPlayToken] = useState(0)

  // 素材选择状态
  const [selBgId, setSelBgId] = useState<string | null>(null)
  const [selSpriteId, setSelSpriteId] = useState<string | null>(null)
  const [localBg, setLocalBg] = useState<{ url: string; name: string } | null>(null)
  const [localSprite, setLocalSprite] = useState<{ url: string; name: string } | null>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const spFileRef = useRef<HTMLInputElement>(null)

  const catOfItem = useMemo(() => {
    const m = new Map<string, string>()
    EFFECT_CATEGORIES.forEach((c) => c.items.forEach((it) => m.set(it.id, c.id)))
    return m
  }, [])

  // 第一保底：素材库有图时默认选中首张
  useEffect(() => {
    if (!selBgId && bgList.length) setSelBgId(bgList[0].id)
  }, [bgList, selBgId])
  useEffect(() => {
    if (!selSpriteId && spriteList.length) setSelSpriteId(spriteList[0].id)
  }, [spriteList, selSpriteId])

  // 释放本地对象 URL
  useEffect(
    () => () => {
      if (localBg) URL.revokeObjectURL(localBg.url)
      if (localSprite) URL.revokeObjectURL(localSprite.url)
    },
    [localBg, localSprite],
  )

  const bgUrl = localBg?.url ?? resolveAssetSrc(bgList.find((a) => a.id === selBgId))
  const spriteUrl = localSprite?.url ?? resolveAssetSrc(spriteList.find((a) => a.id === selSpriteId))

  const openItem = (item: EffectItem) => {
    setSelected(item)
    setCatId(catOfItem.get(item.id) ?? EFFECT_CATEGORIES[0].id)
    setView('detail')
    setPlayToken((t) => t + 1)
  }

  const replay = () => setPlayToken((t) => t + 1)

  const handleLocalBg = (f: File) => {
    if (localBg) URL.revokeObjectURL(localBg.url)
    setLocalBg({ url: URL.createObjectURL(f), name: f.name })
  }
  const handleLocalSprite = (f: File) => {
    if (localSprite) URL.revokeObjectURL(localSprite.url)
    setLocalSprite({ url: URL.createObjectURL(f), name: f.name })
  }

  const q = query.trim().toLowerCase()
  const results = useMemo(
    () =>
      q
        ? ALL_EFFECTS.filter(
            (it) =>
              it.name.toLowerCase().includes(q) ||
              it.cn.toLowerCase().includes(q) ||
              it.desc.toLowerCase().includes(q) ||
              (it.syntax ?? '').toLowerCase().includes(q) ||
              it.id.toLowerCase().includes(q),
          )
        : null,
    [q],
  )

  const catItems = useMemo(() => EFFECT_CATEGORIES.find((c) => c.id === catId)?.items ?? [], [catId])
  const ampApplies = selected ? AMP_KINDS.has(selected.preview.kind) : false

  const active: ActiveSpec | null = selected ? { spec: selected.preview, token: playToken } : null

  // ---------------- 首页：卡片墙 ----------------
  if (view === 'home') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-canvas text-fg">
        <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-2.5">
          <Sparkles size={16} strokeWidth={1.75} className="text-signal" />
          <h1 className="text-[15px] font-semibold tracking-tight">特效大本营</h1>
          <span className="eyebrow ml-1">Ren&apos;Py Effects HQ</span>
          <span className="ml-auto font-mono text-[12px] text-fg-faint">共 {TOTAL} 项 · 14 大类</span>
        </div>

        <div className="border-b border-edge/10 px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-edge/15 bg-surface px-2.5 py-1.5">
            <Search size={14} strokeWidth={1.75} className="text-fg-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索特效（中文 / 英文 / 语法）"
              className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {results ? (
            <div>
              <div className="mb-2 text-[13px] font-medium text-fg-muted">搜索结果 · {results.length} 项</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {results.map((it) => (
                  <EffectCard key={it.id} item={it} active={selected?.id === it.id} onClick={() => openItem(it)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-7">
              {EFFECT_CATEGORIES.map((cat) => {
                const Icon = ICONS[cat.icon] ?? Sparkles
                return (
                  <section key={cat.id}>
                    <div className="mb-2.5 flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.10] text-signal">
                        <Icon size={16} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-[15px] font-semibold leading-tight text-fg">{cat.name}</h2>
                        <p className="truncate text-[12px] text-fg-subtle">{cat.desc}</p>
                      </div>
                      <span className="ml-auto font-mono text-[12px] text-fg-faint">{cat.items.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {cat.items.map((it) => (
                        <EffectCard key={it.id} item={it} active={false} onClick={() => openItem(it)} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------------- 二级：三合一整合页 ----------------
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas text-fg">
      <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-2.5">
        <IconButton variant="ghost" size="sm" icon={<ArrowLeft size={15} strokeWidth={1.75} />} onClick={() => setView('home')} title="返回卡片墙" aria-label="返回卡片墙" />
        <Sparkles size={16} strokeWidth={1.75} className="text-signal" />
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight">{selected?.cn}</h1>
          <div className="font-mono text-[12px] text-signal">{selected?.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" icon={<RotateCw size={13} strokeWidth={1.75} />} onClick={replay}>
            重新播放
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ========== 左：本类特效列表 + 参数滑块 ========== */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-edge/12 bg-surface/60">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-edge/10 p-2">
            {EFFECT_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  const first = c.items[0]
                  if (first) openItem(first)
                  else setCatId(c.id)
                }}
                className={`shrink-0 rounded-md px-2 py-1 text-[12px] transition-colors ${
                  c.id === catId ? 'bg-primary/[0.12] text-fg' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                }`}
              >
                {c.name.replace(/（.*?）|·.*/g, '').slice(0, 4)}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="mb-1.5 px-1 text-[12px] font-medium text-fg-muted">本类特效</div>
            <div className="space-y-0.5">
              {catItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => openItem(it)}
                  className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    selected?.id === it.id
                      ? 'bg-primary/[0.10] text-fg ring-1 ring-primary/30'
                      : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                  }`}
                >
                  <span className="block">{it.cn}</span>
                  <span className="block font-mono text-[12px] text-fg-faint">{it.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-edge/10 p-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="text-fg-muted">时长</span>
                <span className="font-mono text-fg-subtle">{(duration / 1000).toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={300}
                max={3000}
                step={100}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                onPointerUp={() => setPlayToken((t) => t + 1)}
                onKeyUp={() => setPlayToken((t) => t + 1)}
                className="w-full accent-signal"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="text-fg-muted">幅度 {ampApplies ? '' : '(本特效以时长为主)'}</span>
                <span className="font-mono text-fg-subtle">{amp.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.3}
                max={1.6}
                step={0.1}
                value={amp}
                onChange={(e) => setAmp(Number(e.target.value))}
                onPointerUp={() => setPlayToken((t) => t + 1)}
                onKeyUp={() => setPlayToken((t) => t + 1)}
                className="w-full accent-signal"
                disabled={!ampApplies}
              />
            </div>
          </div>
        </aside>

        {/* ========== 中：素材条 + 预览舞台 ========== */}
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex flex-col gap-2 rounded-lg border border-edge/12 bg-surface-2 p-2.5">
            <MatPicker
              label="背景"
              list={bgList}
              selectedId={selBgId}
              local={localBg}
              onSelect={setSelBgId}
              onLocal={handleLocalBg}
              onClearLocal={() => setLocalBg(null)}
              fileRef={bgFileRef}
            />
            <MatPicker
              label="立绘"
              list={spriteList}
              selectedId={selSpriteId}
              local={localSprite}
              onSelect={setSelSpriteId}
              onLocal={handleLocalSprite}
              onClearLocal={() => setLocalSprite(null)}
              fileRef={spFileRef}
            />
          </div>

          <div className="min-h-0 flex-1">
            <PreviewStage active={active} bgUrl={bgUrl} spriteUrl={spriteUrl} duration={duration} amp={amp} />
          </div>

          <p className="text-center text-[12px] text-fg-faint">
            点击左侧特效即时演示 · 上方切换背景/立绘测试不同素材 · 预览为 Web 近似实现，语义与 Ren&apos;Py 一致
          </p>
        </main>

        {/* ========== 右：特效大百科 ========== */}
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-edge/12 bg-surface/60 p-4">
          <div className="mb-1 text-[12px] font-medium text-fg-muted">特效大百科</div>
          <h2 className="text-[18px] font-semibold tracking-tight">{selected?.cn}</h2>
          <div className="mt-0.5 font-mono text-[13px] text-signal">{selected?.name}</div>

          {selected?.syntax && (
            <div className="mt-3">
              <div className="mb-1 text-[12px] text-fg-muted">Ren&apos;Py 代码示例</div>
              <pre className="overflow-x-auto rounded-lg border border-edge/12 bg-canvas px-3 py-2 font-mono text-[12px] leading-relaxed text-fg-subtle">
                {selected.syntax}
              </pre>
            </div>
          )}

          <div className="mt-3">
            <div className="mb-1 text-[12px] text-fg-muted">功能说明</div>
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg">{selected?.desc}</p>
          </div>

          {selected?.renpyClass && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary/[0.08] px-2 py-1 text-[12px] text-fg-muted">
              可实例化的转场 / 变换类
            </div>
          )}

          {selected?.params && selected.params.length > 0 && (
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
                    {selected.params.map((p, i) => (
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

          <div className="mt-auto pt-4 text-[12px] leading-relaxed text-fg-faint">
            归类与说明依据 Ren&apos;Py 官方文档整理，覆盖 Transitions / Transform Properties / matrixcolor / ATL Warpers / ATL 语句 / 内置定位变换 / 3D 舞台 全体系。
          </div>
        </aside>
      </div>
    </div>
  )
}
