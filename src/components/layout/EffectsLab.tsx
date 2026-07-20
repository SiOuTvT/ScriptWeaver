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
  PlayCircle,
  type LucideIcon,
} from 'lucide-react'
import { EFFECT_CATEGORIES, ALL_EFFECTS, type EffectItem, type PreviewSpec } from '@/data/renpyEffects'
import { EFFECT_ENCYCLOPEDIA } from '@/data/effectEncyclopedia'
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

type View = 'home' | 'detail' | 'preview'

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
// 二级：纯百科页（无舞台，含「进入预览舞台」按钮）
// ============================================================
function DetailView({
  item,
  onBack,
  onEnterPreview,
}: {
  item: EffectItem
  onBack: () => void
  onEnterPreview: () => void
}) {
  const enc = EFFECT_ENCYCLOPEDIA[item.id]

  // 右侧「本页速览」目录：仅列出当前特效实际存在的板块
  const toc = [
    { id: 'enc-art', label: '剧情用法', show: !!enc?.artGuide },
    { id: 'enc-principle', label: '底层原理', show: !!item.principle },
    { id: 'enc-params', label: '参数拆解', show: !!(enc?.paramManual?.length) },
    { id: 'enc-params-math', label: '参数数学逻辑', show: !!(item.params?.length) },
    { id: 'enc-renpy', label: 'Ren\'Py 代码', show: !!item.syntax },
    { id: 'enc-impl', label: '本项目实现', show: !!enc?.cssImpl },
    { id: 'enc-perf', label: '性能与避坑', show: !!enc?.perfTips },
  ].filter((t) => t.show)

  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas text-fg">
      <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-2.5">
        <IconButton variant="ghost" size="sm" icon={<ArrowLeft size={15} strokeWidth={1.75} />} onClick={onBack} title="返回卡片墙" aria-label="返回卡片墙" />
        <Sparkles size={16} strokeWidth={1.75} className="text-signal" />
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight">{item.cn}</h1>
          <div className="font-mono text-[12px] text-signal">{item.name}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左：本页速览 + 目录跳转（放在左边，长文可直跳板块） */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-edge/10 bg-surface/40 px-4 py-6 lg:block">
          <p className="mb-2 text-[12px] font-semibold tracking-wide text-fg-faint">本页速览</p>
          <div className="mb-4 rounded-lg border border-edge/12 bg-surface-2/60 p-3">
            <p className="truncate text-[13px] font-semibold text-fg">{item.cn}</p>
            <p className="truncate font-mono text-[12px] text-signal">{item.name}</p>
          </div>
          <p className="mb-1.5 text-[12px] text-fg-faint">目录 · 点击跳转</p>
          <nav className="space-y-0.5">
            {toc.map((t) => (
              <button
                key={t.id}
                onClick={() => jumpTo(t.id)}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
              >
                {t.label}
              </button>
            ))}
          </nav>
          <Button
            variant="primary"
            size="sm"
            icon={<PlayCircle size={14} strokeWidth={1.75} />}
            onClick={onEnterPreview}
            className="mt-4 w-full"
          >
            进入预览舞台
          </Button>
        </aside>

        {/* 右：正文（限宽保证行长易读，左对齐铺开） */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <article className="max-w-3xl px-6 py-6">
          {/* 一句话概述 */}
          <p className="text-[15px] leading-relaxed text-fg">{item.desc}</p>

          {item.renpyClass && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary/[0.08] px-2 py-1 text-[12px] text-fg-muted">
              可实例化的转场 / 变换类
            </div>
          )}

          {/* 🎭 板块一：剧情应用场景与艺术演出指导（整合原 renpyEffects.scenario） */}
          {enc?.artGuide && (
            <Section id="enc-art" title="剧情里的用法与演出建议">
              <p className="whitespace-pre-line text-[13px] leading-[1.85] text-fg">{enc.artGuide}</p>
              {item.scenario && (
                <div className="mt-4 border-t border-edge/10 pt-3">
                  <p className="mb-1 text-[12px] font-medium text-fg-faint">原 Ren'Py 资料 · 适用情景清单</p>
                  <p className="whitespace-pre-line text-[13px] leading-[1.85] text-fg-subtle">{item.scenario}</p>
                </div>
              )}
            </Section>
          )}

          {/* 底层原理（Ren'Py 官方机制，保留） */}
          {item.principle && (
            <Section id="enc-principle" title="底层原理（Ren'Py 官方机制）">
              <p className="whitespace-pre-line text-[13px] leading-[1.85] text-fg">{item.principle}</p>
            </Section>
          )}

          {/* 📐 板块二：完备的底层参数拆解手册（新四大板块） */}
          {enc?.paramManual && enc.paramManual.length > 0 && (
            <Section title="参数拆解手册">
              <div className="overflow-hidden rounded-lg border border-edge/12">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-surface-2 text-left text-fg-faint">
                      <th className="px-2.5 py-1.5 font-medium">参数</th>
                      <th className="px-2.5 py-1.5 font-medium">类型</th>
                      <th className="px-2.5 py-1.5 font-medium">默认值</th>
                      <th className="px-2.5 py-1.5 font-medium">取值范围 / 单位</th>
                      <th className="px-2.5 py-1.5 font-medium">改了会怎样</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enc.paramManual.map((p, i) => (
                      <tr key={i} className="border-t border-edge/10 align-top">
                        <td className="px-2.5 py-1.5 font-mono text-signal">{p.name}</td>
                        <td className="px-2.5 py-1.5 font-mono text-fg-subtle">{p.type}</td>
                        <td className="px-2.5 py-1.5 font-mono text-fg-subtle">{p.def}</td>
                        <td className="px-2.5 py-1.5 text-fg-subtle">{p.range}</td>
                        <td className="px-2.5 py-1.5 text-fg-muted">{p.effect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* 📐 原 Ren'Py 资料 · 参数底层数学逻辑（保留旧 enrich 数据，含 math） */}
          {item.params && item.params.length > 0 && (
            <Section id="enc-params-math" title="参数的数学逻辑">
              <div className="overflow-hidden rounded-lg border border-edge/12">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-surface-2 text-left text-fg-faint">
                      <th className="px-2.5 py-1.5 font-medium">参数</th>
                      <th className="px-2.5 py-1.5 font-medium">类型</th>
                      <th className="px-2.5 py-1.5 font-medium">用途</th>
                      <th className="px-2.5 py-1.5 font-medium">底层数学 / 取值逻辑</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.params.map((p, i) => (
                      <tr key={i} className="border-t border-edge/10 align-top">
                        <td className="px-2.5 py-1.5 font-mono text-signal">{p.name}</td>
                        <td className="px-2.5 py-1.5 font-mono text-fg-subtle">{p.type}</td>
                        <td className="px-2.5 py-1.5 text-fg-subtle">{p.desc}</td>
                        <td className="px-2.5 py-1.5 text-fg-muted">{p.math ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* 💻 板块三：双引擎原生代码示例对照 */}
          {item.syntax && (
            <Section title="Ren'Py 代码示例">
              <pre className="overflow-x-auto rounded-lg border border-edge/12 bg-surface-2 px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-fg-subtle">
                {item.syntax}
              </pre>
              {item.syntax2 && (
                <pre className="mt-2 overflow-x-auto rounded-lg border border-edge/12 bg-surface-2 px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-fg-subtle">
                  {item.syntax2}
                </pre>
              )}
            </Section>
          )}
          {enc?.cssImpl && (
            <Section title="本项目实现（Electron + React + CSS）">
              <pre className="overflow-x-auto rounded-lg border border-edge/12 bg-[#0d1117] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-emerald-200/90">
                {enc.cssImpl}
              </pre>
            </Section>
          )}

          {/* ⚠️ 板块四：性能提示与视觉避坑 */}
          {enc?.perfTips && (
            <Section id="enc-perf" title="性能提示与视觉避坑">
              <p className="whitespace-pre-line text-[13px] leading-[1.85] text-fg">{enc.perfTips}</p>
            </Section>
          )}

        </article>
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-6 scroll-mt-4">
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg-muted">
        <span className="h-3.5 w-1 rounded-full bg-signal/70" />
        {title}
      </h2>
      {children}
    </section>
  )
}

// ============================================================
// 三级：终极整合预览舞台（三合一，右侧精简）
// ============================================================
function PreviewView({
  selected,
  catId,
  duration,
  amp,
  onDuration,
  onAmp,
  onReplay,
  onBack,
  onSelectInPreview,
  onSelectCategory,
  bgList,
  spriteList,
  bgUrl,
  spriteUrl,
  selBgId,
  selSpriteId,
  localBg,
  localSprite,
  onSelBg,
  onSelSprite,
  onLocalBg,
  onLocalSprite,
  onClearLocalBg,
  onClearLocalSprite,
  bgFileRef,
  spFileRef,
  active,
}: {
  selected: EffectItem
  catId: string
  duration: number
  amp: number
  onDuration: (v: number) => void
  onAmp: (v: number) => void
  onReplay: () => void
  onBack: () => void
  onSelectInPreview: (it: EffectItem) => void
  onSelectCategory: (c: (typeof EFFECT_CATEGORIES)[number]) => void
  bgList: AssetItem[]
  spriteList: AssetItem[]
  bgUrl?: string
  spriteUrl?: string
  selBgId: string | null
  selSpriteId: string | null
  localBg: { url: string; name: string } | null
  localSprite: { url: string; name: string } | null
  onSelBg: (id: string) => void
  onSelSprite: (id: string) => void
  onLocalBg: (f: File) => void
  onLocalSprite: (f: File) => void
  onClearLocalBg: () => void
  onClearLocalSprite: () => void
  bgFileRef: RefObject<HTMLInputElement>
  spFileRef: RefObject<HTMLInputElement>
  active: ActiveSpec | null
}) {
  const catItems = useMemo(() => EFFECT_CATEGORIES.find((c) => c.id === catId)?.items ?? [], [catId])
  const ampApplies = AMP_KINDS.has(selected.preview.kind)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas text-fg">
      <div className="flex items-center gap-2 border-b border-edge/10 px-4 py-2.5">
        <IconButton variant="ghost" size="sm" icon={<ArrowLeft size={15} strokeWidth={1.75} />} onClick={onBack} title="返回百科" aria-label="返回百科" />
        <Sparkles size={16} strokeWidth={1.75} className="text-signal" />
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight">{selected.cn}</h1>
          <div className="font-mono text-[12px] text-signal">{selected.name}</div>
        </div>
        <Button variant="outline" size="sm" icon={<RotateCw size={13} strokeWidth={1.75} />} onClick={onReplay} className="ml-auto">
          重新播放
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ========== 左：本类特效列表 + 参数滑块 ========== */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-edge/12 bg-surface/60">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-edge/10 p-2">
            {EFFECT_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCategory(c)}
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
                  onClick={() => onSelectInPreview(it)}
                  className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    selected.id === it.id
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
                onChange={(e) => onDuration(Number(e.target.value))}
                onPointerUp={() => onReplay()}
                onKeyUp={() => onReplay()}
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
                onChange={(e) => onAmp(Number(e.target.value))}
                onPointerUp={() => onReplay()}
                onKeyUp={() => onReplay()}
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
              onSelect={onSelBg}
              onLocal={onLocalBg}
              onClearLocal={onClearLocalBg}
              fileRef={bgFileRef}
            />
            <MatPicker
              label="立绘"
              list={spriteList}
              selectedId={selSpriteId}
              local={localSprite}
              onSelect={onSelSprite}
              onLocal={onLocalSprite}
              onClearLocal={onClearLocalSprite}
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

        {/* ========== 右：精简说明（不密密麻麻） ========== */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-edge/12 bg-surface/60 p-4">
          <div className="mb-1 text-[12px] font-medium text-fg-muted">当前演示</div>
          <h2 className="text-[16px] font-semibold tracking-tight">{selected.cn}</h2>
          <div className="mt-0.5 font-mono text-[12px] text-signal">{selected.name}</div>

          <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">{selected.brief ?? firstLine(selected.desc)}</p>

          <div className="mt-4 space-y-2 rounded-lg border border-edge/12 bg-surface-2 p-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-fg-muted">时长</span>
              <span className="font-mono text-fg">{(duration / 1000).toFixed(1)}s</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-fg-muted">幅度</span>
              <span className="font-mono text-fg">{ampApplies ? `${amp.toFixed(1)}x` : '—（以时长为主）'}</span>
            </div>
          </div>

          <div className="mt-4 space-y-1.5 text-[12px] leading-relaxed text-fg-faint">
            <p>· 拖动左侧滑块实时调节，松手即重播</p>
            <p>· 点「重新播放」可重看当前特效</p>
            <p>· 想看完整原理与代码，点左上「返回百科」</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================
export default function EffectsLab() {
  const assets = useAppStore((s) => s.assets)
  const bgList = useMemo(() => assets.filter((a) => a.type === 'background'), [assets])
  const spriteList = useMemo(() => assets.filter((a) => a.type === 'sprite'), [assets])

  const [view, setView] = useState<View>('home')
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
  }

  const enterPreview = () => {
    setPlayToken((t) => t + 1)
    setView('preview')
  }

  // 在预览页内切换特效（保持 preview 视图）
  const selectInPreview = (item: EffectItem) => {
    setSelected(item)
    setCatId(catOfItem.get(item.id) ?? catId)
    setPlayToken((t) => t + 1)
  }

  const selectCategory = (c: (typeof EFFECT_CATEGORIES)[number]) => {
    const first = c.items[0]
    setCatId(c.id)
    if (first) selectInPreview(first)
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

  if (!selected) return null

  // ---------------- 二级：纯百科页 ----------------
  if (view === 'detail') {
    return (
      <DetailView
        item={selected}
        onBack={() => setView('home')}
        onEnterPreview={enterPreview}
      />
    )
  }

  // ---------------- 三级：终极整合预览舞台 ----------------
  return (
    <PreviewView
      selected={selected}
      catId={catId}
      duration={duration}
      amp={amp}
      onDuration={setDuration}
      onAmp={setAmp}
      onReplay={replay}
      onBack={() => setView('detail')}
      onSelectInPreview={selectInPreview}
      onSelectCategory={selectCategory}
      bgList={bgList}
      spriteList={spriteList}
      bgUrl={bgUrl}
      spriteUrl={spriteUrl}
      selBgId={selBgId}
      selSpriteId={selSpriteId}
      localBg={localBg}
      localSprite={localSprite}
      onSelBg={setSelBgId}
      onSelSprite={setSelSpriteId}
      onLocalBg={handleLocalBg}
      onLocalSprite={handleLocalSprite}
      onClearLocalBg={() => setLocalBg(null)}
      onClearLocalSprite={() => setLocalSprite(null)}
      bgFileRef={bgFileRef}
      spFileRef={spFileRef}
      active={active}
    />
  )
}
