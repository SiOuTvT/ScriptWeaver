/**
 * 主题色工具 —— 「墨仪」调色台
 *
 * 用户在设置里选一个基色（HEX），据此推导出 primary / hover / active / soft
 * 以及自适应的 on-primary 文字色，并写入 <html> 的内联 CSS 变量，实时覆盖
 * index.css 中 :root / [data-theme] 里定义的默认值。
 *
 * - 浅色模式：直接用基色
 * - 深色模式：把基色提亮一档（深底上更亮更精神，沿用默认深色 primary 的调性）
 */

export interface RGB {
  r: number
  g: number
  b: number
}

/** 应用商店里视为「默认」的基色（= 浅色模式默认 primary 84 70 220） */
export const DEFAULT_ACCENT = '#5446DC'

/** 需要被覆盖的 CSS 变量名（主色系） */
const VARS = [
  '--c-primary',
  '--c-primary-hover',
  '--c-primary-active',
  '--c-primary-soft',
  '--c-on-primary',
] as const

/** 需要被覆盖的 CSS 变量名（背景着色系） */
const TINT_VARS = [
  '--c-canvas-tinted',
  '--c-surface-tinted',
  '--c-surface-1-tinted',
  '--c-surface-2-tinted',
  '--c-surface-3-tinted',
] as const

/* ───── 各主题下用于着色的基准面 RGB（与 index.css 的默认值严格对齐）───── */

interface TintBases {
  canvas: RGB
  surface: RGB
  surface1: RGB
  surface2: RGB
  surface3: RGB
}

const LIGHT_BASES: TintBases = {
  canvas:   { r: 230, g: 229, b: 225 },
  surface:  { r: 255, g: 255, b: 255 },
  surface1: { r: 244, g: 243, b: 240 },
  surface2: { r: 255, g: 255, b: 255 },
  surface3: { r: 236, g: 235, b: 231 },
}

const DARK_BASES: TintBases = {
  canvas:   { r: 8,   g: 9,   b: 12  },
  surface:  { r: 19,  g: 21,  b: 27  },
  surface1: { r: 26,  g: 29,  b: 36  },
  surface2: { r: 33,  g: 37,  b: 46  },
  surface3: { r: 42,  g: 47,  b: 57  },
}

/** 精调预设色板（Open Color 系，每色取其色相中最耐看的一档，特性鲜明不刺眼） */
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: '樱粉', hex: '#F06595' }, // 可爱粉
  { name: '紫毫', hex: '#5446DC' }, // 品牌紫（默认）
  { name: '靛蓝', hex: '#3B5BDB' }, // 沉静靛
  { name: '天蓝', hex: '#1C7ED6' }, // 清爽蓝
  { name: '青碧', hex: '#0CA678' }, // 通透绿
  { name: '琥珀', hex: '#F08C00' }, // 暖琥珀
  { name: '绯红', hex: '#E03131' }, // 正绯红
  { name: '玫红', hex: '#D6336C' }, // 浓郁玫
]

const clamp = (n: number, min = 0, max = 255) => Math.min(max, Math.max(min, n))

/** 解析 #RGB / #RRGGBB → RGB，非法返回 null */
export function parseHex(input: string): RGB | null {
  if (!input) return null
  let h = input.trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
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

/** 朝目标色混合 t(0~1) */
function mix(c: RGB, target: RGB, t: number): RGB {
  return {
    r: c.r + (target.r - c.r) * t,
    g: c.g + (target.g - c.g) * t,
    b: c.b + (target.b - c.b) * t,
  }
}

export const lighten = (c: RGB, t: number) => mix(c, { r: 255, g: 255, b: 255 }, t)
export const darken = (c: RGB, t: number) => mix(c, { r: 0, g: 0, b: 0 }, t)

/** 相对亮度（sRGB 感知近似），用于决定 on-primary 用白字还是黑字 */
export function luminance({ r, g, b }: RGB): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/* ---------- HSL 互转（供色相滑块使用） ---------- */

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
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
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let r = 0
  let g = 0
  let b = 0
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
  // 灰色（饱和度过低）拖色相无意义，给一个合理默认饱和度
  const sat = s < 8 ? 65 : s
  return toHex(hslToRgb({ h: hue, s: sat, l: Math.min(60, Math.max(30, l)) }))
}

type ThemeMode = 'dark' | 'light'

/** 计算某主题下的一整套 primary 变量值 */
export function computeAccentVars(hex: string, theme: ThemeMode): Record<string, string> | null {
  const base = parseHex(hex)
  if (!base) return null

  const primary = theme === 'dark' ? lighten(base, 0.16) : base
  const hover = lighten(primary, 0.12)
  const active = darken(primary, 0.1)
  const onPrimary = luminance(primary) > 0.6 ? { r: 23, g: 22, b: 20 } : { r: 255, g: 255, b: 255 }

  return {
    '--c-primary': rgbTriple(primary),
    '--c-primary-hover': rgbTriple(hover),
    '--c-primary-active': rgbTriple(active),
    '--c-primary-soft': rgbTriple(primary),
    '--c-on-primary': rgbTriple(onPrimary),
    // 信号色（小数线 / 选中卡片 / 焦点环）随主色同步，确保整站协调
    '--c-signal': rgbTriple(primary),
    '--c-signal-soft': rgbTriple(primary),
  }
}

/**
 * 计算背景着色变量（Accent-Driven Dynamic Tinting）。
 *
 * 将当前主题色以 2%~5% 混入各层级基准面颜色，产生一整套温润且有归属感的
 * "主题色联动微调" 着色面，替代原先固定的中性灰。
 *
 * - canvas (2%):   根背景——极微量着色，仅微微偏离中性灰
 * - surface (3%):  面板主面
 * - surface-1 (4%):二层面板——着色最明显，用作侧栏/卡片等次级容器
 * - surface-2 (3%):卡片面
 * - surface-3 (2%):输入框/内嵌面——保持近中性以利可读性
 *
 * @param hex   主题色 HEX
 * @param theme 当前模式 'dark' | 'light'
 */
export function computeSurfaceTints(hex: string, theme: ThemeMode): Record<string, string> | null {
  const accent = parseHex(hex)
  if (!accent) return null

  const bases: TintBases = theme === 'dark' ? DARK_BASES : LIGHT_BASES

  return {
    '--c-canvas-tinted':      rgbTriple(mix(bases.canvas,   accent, 0.02)),
    '--c-surface-tinted':     rgbTriple(mix(bases.surface,  accent, 0.03)),
    '--c-surface-1-tinted':   rgbTriple(mix(bases.surface1, accent, 0.04)),
    '--c-surface-2-tinted':   rgbTriple(mix(bases.surface2, accent, 0.03)),
    '--c-surface-3-tinted':   rgbTriple(mix(bases.surface3, accent, 0.02)),
  }
}

/**
 * 应用主题色 + 背景着色表到 <html> 内联样式。
 * 信号色（小数线 / 选中卡片 / 焦点环 / 信号点）恒等于主色，确保整站一致跟随。
 * 仅在基色非法时才清除覆盖、回落到 index.css 默认值（包括着色面回退到中性默认值）。
 */
export function applyAccent(hex: string, theme: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const vars = computeAccentVars(hex, theme)
  const tints = computeSurfaceTints(hex, theme)
  if (!vars || !tints) {
    ;[...VARS, ...TINT_VARS].forEach((v) => root.style.removeProperty(v))
    return
  }
  Object.entries({ ...vars, ...tints }).forEach(([k, val]) => root.style.setProperty(k, val))
}
