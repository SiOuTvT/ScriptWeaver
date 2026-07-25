/**
 * 主题色工具 —— 「墨仪」调色台
 *
 * 预设主题拥有完整、手工设计的颜色体系（主色 / hover / active），
 * 不再自动混合白/黑生成大量深浅变体。信号色保持琥珀独立身份。
 * 自定义颜色（色相滑块）仅做最小 HSL 亮度推导，保留原始饱和度。
 */

export interface RGB {
  r: number
  g: number
  b: number
}

/** 应用商店里视为「默认」的基色（紫毫） */
export const DEFAULT_ACCENT = '#5446DC'

/** 预设色板的完整定义 */
export interface AccentPreset {
  name: string
  hex: string
  light: { primary: string; hover: string; active: string }
  dark:  { primary: string; hover: string; active: string }
}

/** 手工设计预设色板：每套主题拥有独立完整的颜色体系 */
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    name: '紫毫', hex: '#5446DC',
    light: { primary: '#5446DC', hover: '#6B5EE8', active: '#4638C4' },
    dark:  { primary: '#7C6EFF', hover: '#988FFF', active: '#6558E8' },
  },
  {
    name: '樱粉', hex: '#F06595',
    light: { primary: '#F06595', hover: '#F47DA8', active: '#D94D7E' },
    dark:  { primary: '#F47DA8', hover: '#F89BBC', active: '#E05588' },
  },
  {
    name: '靛蓝', hex: '#3B5BDB',
    light: { primary: '#3B5BDB', hover: '#5574E8', active: '#2E4AC4' },
    dark:  { primary: '#6B8AFF', hover: '#8DA5FF', active: '#5574E8' },
  },
  {
    name: '天蓝', hex: '#1C7ED6',
    light: { primary: '#1C7ED6', hover: '#3B95E8', active: '#1668B8' },
    dark:  { primary: '#4DABF7', hover: '#74C0FC', active: '#339AF0' },
  },
  {
    name: '青碧', hex: '#0CA678',
    light: { primary: '#0CA678', hover: '#20B88C', active: '#099268' },
    dark:  { primary: '#38D9A9', hover: '#63E6BE', active: '#20B88C' },
  },
  {
    name: '琥珀', hex: '#F08C00',
    light: { primary: '#F08C00', hover: '#FCA028', active: '#D97A00' },
    dark:  { primary: '#FCA028', hover: '#FDBD5E', active: '#E88C10' },
  },
  {
    name: '绯红', hex: '#E03131',
    light: { primary: '#E03131', hover: '#E85555', active: '#C92A2A' },
    dark:  { primary: '#F06565', hover: '#F48C8C', active: '#E04848' },
  },
  {
    name: '玫红', hex: '#D6336C',
    light: { primary: '#D6336C', hover: '#E05585', active: '#BF2A5E' },
    dark:  { primary: '#F06595', hover: '#F47DA8', active: '#E05588' },
  },
]

/** 按浅色主色 hex 快速查找预设 */
const PRESETS_BY_HEX = new Map(ACCENT_PRESETS.map((p) => [p.hex.toUpperCase(), p]))

/* ───── 基础工具 ───── */

const clamp = (n: number, min = 0, max = 255) => Math.min(max, Math.max(min, n))

/** 解析 #RGB / #RRGGBB → RGB，非法返回 null */
export function parseHex(input: string): RGB | null {
  if (!input) return null
  let h = input.trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** RGB → #RRGGBB（大写） */
export function toHex({ r, g, b }: RGB): string {
  const s = (n: number) => clamp(Math.round(n)).toString(16).padStart(2, '0')
  return `#${s(r)}${s(g)}${s(b)}`.toUpperCase()
}

/** "R G B" 三元组字符串（供 rgb(var(--x) / a) 使用） */
export function rgbTriple({ r, g, b }: RGB): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
}

/** 相对亮度（sRGB 感知近似），用于决定 on-primary 用白字还是黑字 */
export function luminance({ r, g, b }: RGB): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/* ────────── HSL 互转（供色相滑块使用）────────── */

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): RGB {
  const sn = s / 100, ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** 仅改色相，保持原有 S/L —— 供色相滑块拖动 */
export function withHue(hex: string, hue: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const { s, l } = rgbToHsl(rgb)
  const sat = s < 8 ? 65 : s
  return toHex(hslToRgb({ h: hue, s: sat, l: Math.min(60, Math.max(30, l)) }))
}

/* ────────── 主题变量计算 ────────── */

export type ThemeMode = 'dark' | 'light'

/** 保护色相与饱和度的最小亮度推演（仅用于非预设的自定义颜色） */
function deriveHoverActive(
  primaryHex: string,
  theme: ThemeMode,
): { hover: string; active: string } {
  const rgb = parseHex(primaryHex)
  if (!rgb) return { hover: primaryHex, active: primaryHex }
  const { h, s, l } = rgbToHsl(rgb)
  const hoverL = theme === 'dark' ? Math.min(l + 8, 92) : Math.min(l + 8, 90)
  const activeL = Math.max(l - 8, 8)
  return {
    hover: toHex(hslToRgb({ h, s, l: hoverL })),
    active: toHex(hslToRgb({ h, s, l: activeL })),
  }
}

/** 需要被覆盖的 CSS 变量名 */
const VARS = [
  '--c-primary',
  '--c-primary-hover',
  '--c-primary-active',
  '--c-primary-soft',
  '--c-on-primary',
  '--c-signal',
  '--c-signal-soft',
] as const

/** hex → "R G B" triple（带 fallback） */
const hexToTriple = (hex: string): string => {
  const c = parseHex(hex)
  return c ? rgbTriple(c) : '84 70 220'
}

/**
 * 计算某主题下的一整套 primary CSS 变量值。
 *
 * - 预设色：使用手工设计的完整色板（保持原始色彩气质）
 * - 自定义色：仅作最小 HSL 亮度推导（保留饱和度和色相）
 * - 信号色跟随 primary 联动，保持 UI 指示元素主题色统一
 * - 背景面不再着色，保持干净的中性底
 */
export function computeAccentVars(hex: string, theme: ThemeMode): Record<string, string> | null {
  const normHex = hex.trim().toUpperCase()
  const preset = PRESETS_BY_HEX.get(normHex)

  let primaryHex: string
  let hoverHex: string
  let activeHex: string

  if (preset) {
    const p = theme === 'dark' ? preset.dark : preset.light
    primaryHex = p.primary
    hoverHex = p.hover
    activeHex = p.active
  } else {
    // 自定义颜色 → 仅在暗色模式下提亮主色，hover/active 做最小 HSL 推演
    const rgb = parseHex(hex)
    if (!rgb) return null
    if (theme === 'dark') {
      const { h, s, l } = rgbToHsl(rgb)
      primaryHex = toHex(hslToRgb({ h, s, l: Math.min(l + 12, 88) }))
    } else {
      primaryHex = normHex
    }
    const d = deriveHoverActive(primaryHex, theme)
    hoverHex = d.hover
    activeHex = d.active
  }

  const primaryRgb = parseHex(primaryHex)!
  const onPrimaryTriple = luminance(primaryRgb) > 0.6 ? '23 22 20' : '255 255 255'
  const primaryTriple = hexToTriple(primaryHex)

  return {
    '--c-primary': primaryTriple,
    '--c-primary-hover': hexToTriple(hoverHex),
    '--c-primary-active': hexToTriple(activeHex),
    '--c-primary-soft': primaryTriple,
    '--c-on-primary': onPrimaryTriple,
    '--c-signal': primaryTriple,
    '--c-signal-soft': primaryTriple,
  }
}

/**
 * 应用主题色到 <html> 内联样式。
 * 仅覆写 primary 相关变量；信号色和背景面保持默认，不再联动。
 */
export function applyAccent(hex: string, theme: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const vars = computeAccentVars(hex, theme)
  if (!vars) {
    VARS.forEach((v) => root.style.removeProperty(v))
    return
  }
  Object.entries(vars).forEach(([k, val]) => root.style.setProperty(k, val))
}
