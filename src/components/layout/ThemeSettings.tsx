import { useEffect, useState, type CSSProperties } from 'react'
import { Check, Pipette, RotateCcw, X } from 'lucide-react'
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
 * 外观与主题色 —— 左侧边栏独立页面（非弹窗）
 * 沿用「墨仪」设计语言：panel / eyebrow / t-* 排版层次 + 分层 surface。
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
    <div className="flex flex-1 flex-col overflow-auto bg-canvas p-6">
      <div className="mx-auto w-full max-w-2xl">
        {/* 标题 */}
        <header className="mb-5">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">Appearance</span>
          </div>
          <h2 className="t-h2 mt-1.5">外观与主题色</h2>
          <p className="mt-0.5 t-subtitle">选好主色后点「保存」生效，全站按钮、链接、焦点与信号随即同步</p>
        </header>

        {/* 当前主色 + 操作 */}
        <section className="panel mb-4 flex items-center gap-4 p-4">
          <div
            className="h-14 w-14 shrink-0 rounded-xl border border-edge/10 shadow-inset-top"
            style={{ background: accentColor }}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="t-label text-fg-muted">已生效主色</div>
            <div className="t-mono mt-0.5 text-[18px] font-medium leading-tight text-fg">{accentColor}</div>
            {dirty && (
              <div className="mt-0.5 text-[12px] font-medium text-primary">● 有未保存的更改</div>
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

        {/* 预设色板 */}
        <section className="panel mb-4 p-4">
          <div className="eyebrow mb-4">预设色板 Presets</div>
          <div className="grid grid-cols-4 gap-x-3 gap-y-4">
            {ACCENT_PRESETS.map((p) => {
              const active = draft.toUpperCase() === p.hex.toUpperCase()
              return (
                <button
                  key={p.hex}
                  type="button"
                  title={`${p.name} ${p.hex}`}
                  onClick={() => setValid(p.hex)}
                  className="group flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                      active
                        ? 'border-fg/40 ring-1 ring-fg/30'
                        : 'border-edge/15 hover:border-edge/40 hover:scale-105'
                    }`}
                    style={{ background: p.hex }}
                  >
                    {active && (
                      <Check
                        size={15}
                        strokeWidth={3}
                        className="text-white"
                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
                      />
                    )}
                  </span>
                  <span
                    className={`t-micro transition-colors ${
                      active ? 'text-fg' : 'text-fg-faint group-hover:text-fg-muted'
                    }`}
                  >
                    {p.name}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 色相微调 */}
        <section className="panel mb-4 p-4">
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
        <section className="panel mb-4 p-4">
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

        {/* 实时预览（作用域变量，仅反映草稿） */}
        <section className="panel p-4" style={previewStyle}>
          <div className="eyebrow mb-3">实时预览 Live（仅预览，保存后全站生效）</div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm">
                主要按钮
              </Button>
              <Button variant="outline" size="sm">
                次要
              </Button>
              <span className="signal-dot signal-dot--pulse ml-auto" aria-hidden />
            </div>
            <div className="relative overflow-hidden rounded-md bg-surface-1 px-3 py-2">
              <span className="signal-bar" aria-hidden />
              <span className="pl-2 text-[13px] text-fg">激活的列表项（左侧小数线随主色）</span>
            </div>
            <p className="text-[13px] text-fg-muted">
              这是一段正文，其中包含{' '}
              <span className="font-medium text-primary">主题色链接</span> 的样式示例。
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
