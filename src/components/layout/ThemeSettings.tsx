import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { Check, Pipette, RotateCcw, X, Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui'
import { useAppStore } from '@/stores/appStore'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  parseHex,
  toHex,
  rgbToHsl,
  withHue,
  computeAccentVars,
} from '@/utils/themeColor'

/**
 * 主题预览小窗：在指定明暗语境下渲染一组 UI 组件 mock，style 注入草稿主色，
 * 直观呈现「全站主色」的落地效果。
 */
function PreviewFrame({ dark, style }: { dark?: boolean; style?: CSSProperties }) {
  return (
    <div
      data-theme={dark ? 'dark' : 'light'}
      style={style}
      className="overflow-hidden rounded-lg border border-edge/12 bg-surface"
    >
      {/* 顶栏 */}
      <div className="flex h-8 items-center gap-1.5 border-b border-edge/10 bg-surface-1 px-2.5">
        <span className="signal-dot" />
        <span className="text-[11px] font-semibold text-fg">
          Script<span className="font-light text-fg-muted">Weaver</span>
        </span>
        <span className="ml-auto signal-dot signal-dot--pulse" aria-hidden />
      </div>
      {/* 内容 */}
      <div className="space-y-2.5 p-3">
        <Button variant="primary" size="sm" block>
          开始创作
        </Button>
        <Button variant="outline" size="sm" block>
          导入素材
        </Button>
        <div className="relative overflow-hidden rounded-md bg-surface-1 px-2.5 py-1.5">
          <span className="signal-bar" aria-hidden />
          <span className="pl-2 text-[12px] text-fg">激活的场景分支</span>
        </div>
        <p className="text-[12px] leading-relaxed text-fg-muted">
          一段正文示例，含 <span className="font-medium text-primary">主题色链接</span> 样式。
        </p>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
            已保存
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">草稿</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 外观与主题色 —— 左侧边栏独立页面（非弹窗）
 * 沿用「墨仪」设计语言：panel / eyebrow / t-* 排版层次 + 分层 surface。
 *
 * 布局：左栏为「实时双语境预览 + 预设主题大图卡片」，右栏为「切换控制与细节微调」，
 * 抛弃低端居中留白，全宽 Grid 分栏撑满视野。
 *
 * 交互模型：本地草稿（draft）+ 显式「保存」。
 *  - 选色/拖动/输入只更新草稿，预览区实时反映，但全站不变；
 *  - 点「保存」才把草稿写入 store + localStorage，全局小数线/卡片/按钮同步变色；
 *  - 「取消」丢弃草稿，「恢复默认紫毫」一键回填默认草稿。
 */
export default function ThemeSettings() {
  const accentColor = useAppStore((s) => s.accentColor)
  const setAccentColor = useAppStore((s) => s.setAccentColor)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)

  // 本地草稿：未保存的临时选择
  const [draft, setDraft] = useState(accentColor)
  useEffect(() => {
    setDraft(accentColor)
  }, [accentColor])

  const dirty = draft.toUpperCase() !== accentColor.toUpperCase()
  const isDefaultDraft = draft.toUpperCase() === DEFAULT_ACCENT

  // 预览区作用域变量：让预览只反映草稿，不污染全站
  const previewVars = computeAccentVars(draft, theme)
  const previewStyle = previewVars
    ? (Object.fromEntries(Object.entries(previewVars)) as CSSProperties)
    : undefined

  const currentRgb = parseHex(draft)
  const currentHue = currentRgb ? Math.round(rgbToHsl(currentRgb).h) : 250

  const setValid = (hex: string) => {
    const rgb = parseHex(hex)
    if (rgb) setDraft(toHex(rgb))
  }

  const onTextChange = (v: string) => {
    let s = v
    if (!s.startsWith('#')) s = '#' + s.replace(/#/g, '')
    setDraft(s)
  }

  const revert = () => setDraft(accentColor)
  const restoreDefault = () => setDraft(DEFAULT_ACCENT)

  return (
    <div className="flex-1 overflow-auto bg-canvas">
      <div className="p-6">
        {/* 页头 */}
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">Appearance</span>
          </div>
          <h2 className="t-h1 mt-1.5">外观与主题色</h2>
          <p className="mt-0.5 t-subtitle">选好主色后点「保存」生效，全站按钮、链接、焦点与信号随即同步</p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          {/* ============ 左栏：实时预览 + 预设主题大图卡片 ============ */}
          <div className="flex flex-col gap-4">
            {/* 实时双语境预览 */}
            <section className="panel p-4" style={previewStyle}>
              <div className="eyebrow mb-3">实时预览 Live</div>
              <div className="grid grid-cols-2 gap-3">
                <PreviewFrame style={previewStyle} />
                <PreviewFrame dark style={previewStyle} />
              </div>
              <p className="mt-3 t-micro">左为浅色语境、右为深色语境，均实时反映草稿主色（保存后全站生效）。</p>
            </section>

            {/* 预设主题卡片网格 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">预设主题 Presets</div>
              <div className="grid grid-cols-2 gap-3">
                {ACCENT_PRESETS.map((p) => {
                  const active = draft.toUpperCase() === p.hex.toUpperCase()
                  const pVars = computeAccentVars(p.hex, theme)
                  return (
                    <button
                      key={p.hex}
                      type="button"
                      title={`${p.name} ${p.hex}`}
                      onClick={() => setValid(p.hex)}
                      className={`group flex flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                        active ? 'border-primary/50 bg-primary-soft' : 'border-edge/12 hover:bg-surface-hover'
                      }`}
                    >
                      {/* 该预设的迷你 UI 预览，注入其专属主色 */}
                      <div
                        data-theme="light"
                        style={pVars ?? undefined}
                        className="overflow-hidden rounded-md border border-edge/10 bg-surface"
                      >
                        <div className="flex h-6 items-center gap-1 border-b border-edge/10 bg-surface-1 px-2">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.hex }} />
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                        </div>
                        <div className="space-y-1.5 p-2">
                          <div className="h-4 w-full rounded" style={{ background: p.hex }} />
                          <div className="h-3 w-2/3 rounded bg-surface-2" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-[12px] font-medium ${active ? 'text-fg' : 'text-fg-muted'}`}>
                          {p.name}
                        </span>
                        {active && <Check size={13} strokeWidth={3} className="text-primary" />}
                      </div>
                      <span className="t-mono text-[11px] text-fg-faint">{p.hex}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          {/* ============ 右栏：切换控制与细节微调 ============ */}
          <div className="flex flex-col gap-4">
            {/* 当前主色 + 操作 */}
            <section className="panel flex items-center gap-4 p-4">
              <div
                className="h-14 w-14 shrink-0 rounded-xl border border-edge/10 shadow-inset-top"
                style={{ background: accentColor }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="t-label text-fg-muted">已生效主色</div>
                <div className="t-mono mt-0.5 text-[18px] font-medium leading-tight text-fg">{accentColor}</div>
                {dirty && (
                  <div className="mt-0.5 text-[12px] font-medium text-primary">有未保存的更改</div>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setAccentColor(draft)}
                  disabled={!dirty}
                >
                  保存
                </Button>
                <Button variant="ghost" size="sm" icon={<X size={14} strokeWidth={1.75} />} onClick={revert} disabled={!dirty}>
                  取消
                </Button>
              </div>
            </section>

            {/* 明暗模式 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">明暗模式 Mode</div>
              <div className="flex gap-2">
                <Button
                  variant={theme === 'light' ? 'primary' : 'outline'}
                  size="sm"
                  icon={<Sun size={14} strokeWidth={1.75} />}
                  onClick={() => theme !== 'light' && toggleTheme()}
                >
                  浅色
                </Button>
                <Button
                  variant={theme === 'dark' ? 'primary' : 'outline'}
                  size="sm"
                  icon={<Moon size={14} strokeWidth={1.75} />}
                  onClick={() => theme !== 'dark' && toggleTheme()}
                >
                  深色
                </Button>
              </div>
            </section>

            {/* 色相微调 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">色相微调 Hue</div>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="t-label">拖动调整色相，保留当前明度与饱和度</span>
                <span className="t-mono text-[12px] text-fg-faint">{currentHue}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                value={currentHue}
                onChange={(e) => setValid(withHue(draft, Number(e.target.value)))}
                className="theme-hue w-full"
                style={{
                  background:
                    'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                }}
              />
            </section>

            {/* 自定义色号 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">自定义色号 Custom</div>
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => onTextChange(e.target.value)}
                  spellCheck={false}
                  maxLength={7}
                  placeholder="#5446DC"
                  className="t-mono h-9 w-full rounded-md border border-edge/15 bg-surface-3 px-3 text-[14px] uppercase text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-signal/60"
                />
                <label
                  className="relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-edge/20 bg-surface-2 px-3 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                  title="调出系统取色器"
                >
                  <Pipette size={14} strokeWidth={1.75} />
                  取色
                  <input
                    type="color"
                    value={parseHex(draft) ? toHex(parseHex(draft)!) : DEFAULT_ACCENT}
                    onChange={(e) => setValid(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} strokeWidth={1.75} />}
                  onClick={restoreDefault}
                  disabled={isDefaultDraft}
                  title="恢复默认紫毫（需点保存生效）"
                >
                  默认
                </Button>
              </div>
              <p className="mt-2.5 t-micro">支持 #RGB 或 #RRGGBB，输入即时预览，点「保存」后生效。</p>
            </section>

            {/* 作用域说明 */}
            <section className="panel p-4">
              <div className="eyebrow mb-2">作用域 Scope</div>
              <ul className="space-y-1.5 t-micro leading-relaxed text-fg-subtle">
                <li className="flex items-start gap-2">
                  <Monitor size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" />
                  主色同步驱动按钮、链接、焦点环、列表小数线与信号点。
                </li>
                <li className="flex items-start gap-2">
                  <Monitor size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" />
                  预览区（左侧）仅反映草稿，保存后才会写入全站与本地存储。
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
