import { useEffect, useState } from 'react'
import { Check, Pipette, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui'
import { useAppStore } from '@/stores/appStore'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  parseHex,
  toHex,
  rgbToHsl,
  withHue,
} from '@/utils/themeColor'

/**
 * 外观与主题色 —— 左侧边栏独立页面（非弹窗）
 * 严格沿用「墨仪」设计语言：panel / eyebrow / t-* 排版层次 + 分层 surface。
 * 选色实时写入 CSS 变量，全站（含小数线、选中卡片）同步生效。
 */
export default function ThemeSettings() {
  const accentColor = useAppStore((s) => s.accentColor)
  const setAccentColor = useAppStore((s) => s.setAccentColor)
  const resetAccentColor = useAppStore((s) => s.resetAccentColor)

  // HEX 输入框本地草稿（允许输入过程中的非法中间态）
  const [text, setText] = useState(accentColor)
  useEffect(() => {
    setText(accentColor)
  }, [accentColor])

  const currentRgb = parseHex(accentColor)
  const currentHue = currentRgb ? Math.round(rgbToHsl(currentRgb).h) : 250
  const isDefault = accentColor.toUpperCase() === DEFAULT_ACCENT

  const commit = (hex: string) => {
    const rgb = parseHex(hex)
    if (!rgb) return
    const normalized = toHex(rgb)
    setAccentColor(normalized)
    setText(normalized)
  }

  const onTextChange = (v: string) => {
    let s = v
    if (!s.startsWith('#')) s = '#' + s.replace(/#/g, '')
    setText(s)
    if (parseHex(s)) commit(s)
  }

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
          <p className="mt-0.5 t-subtitle">选择主色，全站按钮、链接、焦点与信号即时生效</p>
        </header>

        {/* 当前主色概览 */}
        <section className="panel mb-4 p-4">
          <div className="eyebrow mb-3">当前主色 Current</div>
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 shrink-0 rounded-lg border border-edge/10"
              style={{ background: accentColor }}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="t-label text-fg-muted">主题色</div>
              <div className="t-mono mt-0.5 text-[16px] font-medium text-fg">{accentColor}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} strokeWidth={1.75} />}
              onClick={() => resetAccentColor()}
              disabled={isDefault}
              className="ml-auto"
            >
              恢复默认紫毫
            </Button>
          </div>
        </section>

        {/* 预设色板 */}
        <section className="panel mb-4 p-4">
          <div className="eyebrow mb-3">预设色板 Presets</div>
          <div className="grid grid-cols-5 gap-2">
            {ACCENT_PRESETS.map((p) => {
              const active = accentColor.toUpperCase() === p.hex.toUpperCase()
              return (
                <button
                  key={p.hex}
                  type="button"
                  title={`${p.name} ${p.hex}`}
                  onClick={() => commit(p.hex)}
                  className={`group relative flex h-11 items-center justify-center rounded-lg border transition-all ${
                    active
                      ? 'border-fg/40'
                      : 'border-edge/12 hover:border-edge/30 hover:-translate-y-0.5'
                  }`}
                  style={{ background: p.hex }}
                >
                  {active && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fg text-surface shadow-1">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-2.5 t-micro">点选任一预设即可应用，选中项以角标标记。</p>
        </section>

        {/* 色相微调 */}
        <section className="panel mb-4 p-4">
          <div className="eyebrow mb-3">色相微调 Hue</div>
          <div className="mb-2 flex items-center justify-between">
            <span className="t-label">拖动调整色相，保持明度与饱和度</span>
            <span className="t-mono text-[12px] text-fg-faint">{currentHue}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={currentHue}
            onChange={(e) => commit(withHue(accentColor, Number(e.target.value)))}
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
              value={text}
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
                value={parseHex(accentColor) ? toHex(parseHex(accentColor)!) : DEFAULT_ACCENT}
                onChange={(e) => commit(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <p className="mt-2.5 t-micro">支持 #RGB 或 #RRGGBB，输入即时生效并自动校正大小写。</p>
        </section>

        {/* 实时预览 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">实时预览 Live</div>
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
              <span className="pl-2 text-[13px] text-fg">激活的列表项（左侧小数线随主题色）</span>
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
