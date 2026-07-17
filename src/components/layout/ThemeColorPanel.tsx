import { useEffect, useState } from 'react'
import { Check, Pipette, RotateCcw } from 'lucide-react'
import { Dialog, Button } from '@/components/ui'
import { useAppStore } from '@/stores/appStore'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  parseHex,
  toHex,
  rgbToHsl,
  withHue,
} from '@/utils/themeColor'

interface ThemeColorPanelProps {
  open: boolean
  onClose: () => void
}

/**
 * 主题色调色台 —— 高级选色面板
 * 预设色板 + 色相滑块 + HEX 色号输入 + 原生取色器 + 全应用实时预览
 */
export default function ThemeColorPanel({ open, onClose }: ThemeColorPanelProps) {
  const accentColor = useAppStore((s) => s.accentColor)
  const setAccentColor = useAppStore((s) => s.setAccentColor)
  const resetAccentColor = useAppStore((s) => s.resetAccentColor)

  // HEX 输入框的本地草稿（允许输入过程中的非法中间态）
  const [text, setText] = useState(accentColor)

  useEffect(() => {
    if (open) setText(accentColor)
  }, [open, accentColor])

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
    <Dialog open={open} onClose={onClose} title="主题色" width={440}>
      <div className="space-y-5">
        {/* 当前色 + 大预览 */}
        <div className="flex items-center gap-3">
          <div
            className="h-14 w-14 shrink-0 rounded-lg border border-edge/20 shadow-1"
            style={{ background: accentColor }}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="t-label text-fg-muted">当前主题色</div>
            <div className="t-mono mt-0.5 text-[16px] font-medium text-fg">{accentColor}</div>
            <div className="t-micro mt-0.5">应用后全站按钮 链接 焦点与信号即时生效</div>
          </div>
        </div>

        {/* 预设色板 */}
        <div className="space-y-2">
          <div className="t-label text-fg-muted">预设</div>
          <div className="grid grid-cols-5 gap-2">
            {ACCENT_PRESETS.map((p) => {
              const active = accentColor.toUpperCase() === p.hex.toUpperCase()
              return (
                <button
                  key={p.hex}
                  type="button"
                  title={`${p.name} ${p.hex}`}
                  onClick={() => commit(p.hex)}
                  className={`group relative flex h-11 items-center justify-center rounded-md border transition-all ${
                    active
                      ? 'border-transparent ring-2 ring-fg/60 ring-offset-2 ring-offset-surface-2'
                      : 'border-edge/15 hover:scale-[1.04]'
                  }`}
                  style={{ background: p.hex }}
                >
                  {active && (
                    <Check size={16} strokeWidth={2.5} className="text-white drop-shadow" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 色相滑块 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="t-label text-fg-muted">色相</span>
            <span className="t-mono text-[12px] text-fg-faint">{currentHue}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={currentHue}
            onChange={(e) => commit(withHue(accentColor, Number(e.target.value)))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background:
                'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
              accentColor,
            }}
          />
        </div>

        {/* HEX 输入 + 原生取色器 */}
        <div className="space-y-2">
          <div className="t-label text-fg-muted">自定义色号</div>
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              spellCheck={false}
              maxLength={7}
              placeholder="#5446DC"
              className="t-mono h-9 w-full rounded-md border border-edge/15 bg-surface-3 px-3 text-[14px] uppercase text-fg outline-none transition-all placeholder:text-fg-faint focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
            <label
              className="relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-edge/20 bg-surface-2 px-3 text-[13px] font-medium text-fg-muted transition-all hover:bg-surface-hover hover:text-fg"
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
        </div>

        {/* 实时预览 */}
        <div className="space-y-2">
          <div className="t-label text-fg-muted">预览</div>
          <div className="rounded-lg border border-edge/12 bg-surface p-3">
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm">
                主要按钮
              </Button>
              <Button variant="outline" size="sm">
                次要
              </Button>
              <span className="signal-dot signal-dot--pulse ml-auto" aria-hidden />
            </div>
            <div className="relative mt-3 overflow-hidden rounded-md bg-surface-active/60 px-3 py-2">
              <span className="signal-bar" aria-hidden />
              <span className="pl-2 text-[13px] text-fg">激活的列表项</span>
            </div>
            <p className="mt-2 text-[13px] text-fg-muted">
              这是一段正文，其中包含一个{' '}
              <span className="font-medium text-primary">主题色链接</span> 的样式示例。
            </p>
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="mt-5 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={14} strokeWidth={1.75} />}
          onClick={() => resetAccentColor()}
          disabled={isDefault}
        >
          恢复默认
        </Button>
        <Button variant="primary" size="sm" onClick={onClose}>
          完成
        </Button>
      </div>
    </Dialog>
  )
}
