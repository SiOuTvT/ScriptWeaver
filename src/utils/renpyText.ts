// ============================================================
// ScriptWeaver - Ren'Py 台词富文本引擎（文本标签 + 变量插值）
//
// 严格对齐 Ren'Py 官方 Text 文档（doc/html/text.html）：
//   - 文本标签：{b} {i} {u} {s} {plain} {color=} {outlinecolor=} {size=}
//     {alpha=} {cps=} {font=} {k=} {a=} {alt} {noalt} {rt} {rb} {art}
//     自闭合：{w} {w=秒} {p} {p=秒} {nw} {fast} {clear} {done}
//     {space=像素} {vspace=像素} {image=} {#注释}
//   - 变量插值：[var]、[var!t] 等转换后缀；[[ 与 {{ 为字面转义。
//
// 三个消费端共用同一份解析结果（唯一真理源）：
//   1. 舞台对话框：解析 → 样式分段渲染 + 打字机时间轴（{w}/{p}/{cps} 生效）
//   2. 导出校验：validateRenpyText 检查标签配对 / 未知标签 / 未定义变量
//   3. 播放时长估算：stripRenpyMarkup 去标记后按真实可见字数计时
// ============================================================

// ======================= 标签定义表 =======================

/** 成对标签（需要 {/xxx} 闭合）；值为是否要求参数：'required' | 'optional' | 'none' */
const PAIRED_TAGS: Record<string, 'required' | 'optional' | 'none'> = {
  b: 'none',
  i: 'none',
  u: 'none',
  s: 'none',
  plain: 'none',
  color: 'required',
  outlinecolor: 'required',
  size: 'required',
  alpha: 'required',
  cps: 'required',
  font: 'required',
  k: 'required',
  a: 'required',
  alt: 'none',
  noalt: 'none',
  rt: 'none',
  rb: 'none',
  art: 'none',
}

/** 自闭合标签；值为是否允许 =参数 */
const SELF_CLOSING_TAGS: Record<string, 'required' | 'optional' | 'none'> = {
  w: 'optional',
  p: 'optional',
  nw: 'none',
  fast: 'none',
  clear: 'none',
  done: 'none',
  space: 'required',
  vspace: 'required',
  image: 'required',
}

// ======================= 类型 =======================

export interface RenpyTextIssue {
  /** 原文中的字符位置（0 基） */
  index: number
  severity: 'error' | 'warning'
  message: string
}

export type RenpyToken =
  | { kind: 'text'; text: string }
  | { kind: 'open'; name: string; arg: string | null }
  | { kind: 'close'; name: string }
  | { kind: 'self'; name: string; arg: string | null }
  | { kind: 'interp'; expr: string; conversion: string | null }

/** 渲染用样式（叠加后的最终态） */
export interface ChunkStyle {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color: string | null
  /** 字号：'+N' | '-N' | 'N'（绝对像素），null 为默认 */
  size: string | null
  alpha: number | null
  /** 每秒字符数（打字机速度覆盖），null 用默认 */
  cps: number | null
}

/** 打字机时间轴上的一段：连续同样式文本，或一个控制事件 */
export type FlatPiece =
  | { kind: 'chunk'; text: string; style: ChunkStyle }
  | { kind: 'pause'; ms: number }        // {w}/{w=x}（预览中 {w} 视为固定停顿）
  | { kind: 'break' }                    // {p}（换行 + 停顿由紧随 pause 表达）
  | { kind: 'fast' }                     // {fast}：此前文本瞬间显示
  | { kind: 'nowait' }                   // {nw}：行尾不等待（预览提示用）

const DEFAULT_STYLE: ChunkStyle = {
  bold: false, italic: false, underline: false, strike: false,
  color: null, size: null, alpha: null, cps: null,
}

// ======================= 分词器 =======================

/**
 * 把台词原文切成 token 流。容错优先：非法片段按普通文本回退并记录 issue，
 * 绝不抛异常（舞台渲染永远有产出）。
 */
export function tokenizeRenpyText(raw: string): { tokens: RenpyToken[]; issues: RenpyTextIssue[] } {
  const tokens: RenpyToken[] = []
  const issues: RenpyTextIssue[] = []
  let buf = ''
  let i = 0
  const n = raw.length

  const flush = () => {
    if (buf) {
      tokens.push({ kind: 'text', text: buf })
      buf = ''
    }
  }

  while (i < n) {
    const ch = raw[i]

    // 字面转义
    if (ch === '{' && raw[i + 1] === '{') { buf += '{'; i += 2; continue }
    if (ch === '[' && raw[i + 1] === '[') { buf += '['; i += 2; continue }

    if (ch === '{') {
      const end = raw.indexOf('}', i + 1)
      if (end < 0) {
        issues.push({ index: i, severity: 'error', message: '存在未闭合的「{」：标签必须以「}」结束（字面花括号请写 {{）' })
        buf += raw.slice(i)
        i = n
        break
      }
      const inner = raw.slice(i + 1, end)
      i = end + 1
      if (inner.startsWith('#')) continue // {#注释} 直接丢弃
      if (inner.startsWith('/')) {
        const name = inner.slice(1).trim()
        flush()
        tokens.push({ kind: 'close', name })
        continue
      }
      const eq = inner.indexOf('=')
      const name = (eq >= 0 ? inner.slice(0, eq) : inner).trim()
      const arg = eq >= 0 ? inner.slice(eq + 1) : null
      flush()
      if (name in SELF_CLOSING_TAGS) {
        tokens.push({ kind: 'self', name, arg })
      } else {
        tokens.push({ kind: 'open', name, arg })
      }
      continue
    }

    if (ch === '[') {
      const end = raw.indexOf(']', i + 1)
      if (end < 0) {
        issues.push({ index: i, severity: 'error', message: '存在未闭合的「[」：变量插值必须以「]」结束（字面方括号请写 [[）' })
        buf += raw.slice(i)
        i = n
        break
      }
      const inner = raw.slice(i + 1, end)
      i = end + 1
      const bang = inner.indexOf('!')
      const expr = (bang >= 0 ? inner.slice(0, bang) : inner).trim()
      const conversion = bang >= 0 ? inner.slice(bang + 1).trim() : null
      flush()
      tokens.push({ kind: 'interp', expr, conversion })
      continue
    }

    buf += ch
    i += 1
  }
  flush()
  return { tokens, issues }
}

// ======================= 校验器 =======================

/**
 * 校验台词文本的 Ren'Py 标记合法性。
 * knownVars 传入全局变量名列表时，未定义变量插值报 warning
 * （Ren'Py 中未定义变量会直接 NameError 崩溃，但用户可能在别处 default，故仅警告）。
 */
export function validateRenpyText(raw: string, knownVars?: string[]): RenpyTextIssue[] {
  const { tokens, issues } = tokenizeRenpyText(raw)
  const out = [...issues]
  const stack: string[] = []

  for (const t of tokens) {
    if (t.kind === 'open') {
      if (!(t.name in PAIRED_TAGS)) {
        out.push({ index: 0, severity: 'error', message: `未知文本标签 {${t.name}}（Ren'Py 不认识，运行时会报错）` })
        continue
      }
      const argReq = PAIRED_TAGS[t.name]
      if (argReq === 'required' && (t.arg == null || t.arg === '')) {
        out.push({ index: 0, severity: 'error', message: `标签 {${t.name}} 缺少参数（应写作 {${t.name}=值}）` })
      }
      if (argReq === 'none' && t.arg != null) {
        out.push({ index: 0, severity: 'warning', message: `标签 {${t.name}} 不接受参数，多余的 =${t.arg} 会被忽略` })
      }
      if (t.name === 'color' && t.arg && !/^#[0-9a-fA-F]{3,8}$/.test(t.arg.trim())) {
        out.push({ index: 0, severity: 'warning', message: `{color=${t.arg}} 建议使用 #rgb / #rrggbb 十六进制颜色` })
      }
      stack.push(t.name)
    } else if (t.kind === 'close') {
      if (stack.length === 0) {
        out.push({ index: 0, severity: 'error', message: `多余的闭合标签 {/${t.name}}（没有对应的开启标签）` })
      } else {
        const top = stack[stack.length - 1]
        if (top === t.name) {
          stack.pop()
        } else if (stack.includes(t.name)) {
          out.push({ index: 0, severity: 'error', message: `标签交叉嵌套：{/${t.name}} 应先闭合内层 {${top}}` })
          // 弹到目标为止（容错继续）
          while (stack.length > 0 && stack[stack.length - 1] !== t.name) stack.pop()
          if (stack.length > 0) stack.pop()
        } else {
          out.push({ index: 0, severity: 'error', message: `闭合标签 {/${t.name}} 没有对应的开启标签` })
        }
      }
    } else if (t.kind === 'self') {
      const argReq = SELF_CLOSING_TAGS[t.name]
      if (argReq === 'required' && (t.arg == null || t.arg === '')) {
        out.push({ index: 0, severity: 'error', message: `标签 {${t.name}} 缺少参数（应写作 {${t.name}=值}）` })
      }
      if ((t.name === 'w' || t.name === 'p') && t.arg != null && !/^\d+(\.\d+)?$/.test(t.arg.trim())) {
        out.push({ index: 0, severity: 'error', message: `{${t.name}=${t.arg}} 的参数必须是秒数（如 {${t.name}=0.5}）` })
      }
    } else if (t.kind === 'interp') {
      if (t.expr === '') {
        out.push({ index: 0, severity: 'error', message: '空的变量插值 []（字面方括号请写 [[）' })
      } else if (knownVars && knownVars.length >= 0) {
        // 只校验裸标识符（带点/下标的复杂表达式不猜）
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.expr) && !knownVars.includes(t.expr)) {
          out.push({ index: 0, severity: 'warning', message: `变量 [${t.expr}] 未在变量库中定义（若未在别处 default，运行时会 NameError）` })
        }
      }
      if (t.conversion && !/^[tiqulc!s]+$/.test(t.conversion)) {
        out.push({ index: 0, severity: 'warning', message: `插值转换后缀 !${t.conversion} 不是常见形式（t/i/q/u/l/c）` })
      }
    }
  }

  for (const name of stack) {
    out.push({ index: 0, severity: 'error', message: `标签 {${name}} 未闭合（缺少 {/${name}}）` })
  }
  return out
}

// ======================= 插值与净化 =======================

/** 将运行时值格式化为台词内显示文本 */
function formatValue(v: unknown): string {
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (v == null) return ''
  return String(v)
}

/**
 * 去除全部标记，得到「玩家实际看到的字符」。
 * values 提供时插值替换为真实值（用于播放时长按可见字数估算）。
 */
export function stripRenpyMarkup(raw: string, values?: Record<string, unknown>): string {
  const { tokens } = tokenizeRenpyText(raw)
  let out = ''
  for (const t of tokens) {
    if (t.kind === 'text') out += t.text
    else if (t.kind === 'interp') {
      if (values && t.expr in values) out += formatValue(values[t.expr])
      else out += t.expr
    }
  }
  return out
}

// ======================= 渲染布局（样式分段 + 打字机事件） =======================

/**
 * 解析 → 展平为「样式分段 + 控制事件」序列，供舞台对话框直接渲染。
 * values：变量运行时值（插值实时替换；缺失时保留 [var] 原样提示创作者）。
 */
export function layoutRenpyText(raw: string, values?: Record<string, unknown>): FlatPiece[] {
  const { tokens } = tokenizeRenpyText(raw)
  const pieces: FlatPiece[] = []
  // 样式栈：每个开启标签压栈，闭合弹栈
  const stack: { name: string; arg: string | null }[] = []

  const currentStyle = (): ChunkStyle => {
    const st = { ...DEFAULT_STYLE }
    for (const s of stack) {
      switch (s.name) {
        case 'b': st.bold = true; break
        case 'i': st.italic = true; break
        case 'u': st.underline = true; break
        case 's': st.strike = true; break
        case 'plain': st.bold = false; st.italic = false; st.underline = false; st.strike = false; break
        case 'color': st.color = s.arg; break
        case 'size': st.size = s.arg; break
        case 'alpha': {
          const v = s.arg != null ? parseFloat(s.arg) : NaN
          if (!Number.isNaN(v)) st.alpha = Math.max(0, Math.min(1, v))
          break
        }
        case 'cps': {
          const v = s.arg != null ? parseFloat(s.arg) : NaN
          if (!Number.isNaN(v) && v > 0) st.cps = v
          break
        }
        default: break // font/a/k/alt/rt/rb 等预览不改变视觉，忽略
      }
    }
    return st
  }

  const pushText = (text: string) => {
    if (!text) return
    const style = currentStyle()
    const last = pieces[pieces.length - 1]
    if (last && last.kind === 'chunk' && sameStyle(last.style, style)) {
      last.text += text
    } else {
      pieces.push({ kind: 'chunk', text, style })
    }
  }

  for (const t of tokens) {
    switch (t.kind) {
      case 'text': pushText(t.text); break
      case 'interp': {
        if (values && t.expr in values) pushText(formatValue(values[t.expr]))
        else pushText(`[${t.expr}]`)
        break
      }
      case 'open':
        if (t.name in PAIRED_TAGS) stack.push({ name: t.name, arg: t.arg })
        else pushText(`{${t.name}${t.arg != null ? '=' + t.arg : ''}}`) // 未知标签原样显示，提示创作者
        break
      case 'close': {
        const idx = stack.map((s) => s.name).lastIndexOf(t.name)
        if (idx >= 0) stack.splice(idx, 1)
        break
      }
      case 'self': {
        if (t.name === 'w') {
          const sec = t.arg != null ? parseFloat(t.arg) : NaN
          pieces.push({ kind: 'pause', ms: Number.isNaN(sec) ? 800 : Math.round(sec * 1000) })
        } else if (t.name === 'p') {
          const sec = t.arg != null ? parseFloat(t.arg) : NaN
          pieces.push({ kind: 'break' })
          pieces.push({ kind: 'pause', ms: Number.isNaN(sec) ? 800 : Math.round(sec * 1000) })
        } else if (t.name === 'fast') {
          pieces.push({ kind: 'fast' })
        } else if (t.name === 'nw') {
          pieces.push({ kind: 'nowait' })
        } else if (t.name === 'space') {
          const px = t.arg != null ? parseInt(t.arg, 10) : 0
          if (px > 0) pushText('\u00A0'.repeat(Math.max(1, Math.round(px / 8))))
        } else if (t.name === 'vspace' || t.name === 'clear') {
          pieces.push({ kind: 'break' })
        }
        // image/done：预览忽略
        break
      }
    }
  }
  return pieces
}

function sameStyle(a: ChunkStyle, b: ChunkStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline &&
    a.strike === b.strike && a.color === b.color && a.size === b.size &&
    a.alpha === b.alpha && a.cps === b.cps
}

/** 把 size 标签值换算为 CSS font-size（相对基准 px） */
export function resolveSizeCss(size: string | null, basePx: number): number | undefined {
  if (!size) return undefined
  const s = size.trim()
  if (s.startsWith('+')) {
    const d = parseInt(s.slice(1), 10)
    return Number.isNaN(d) ? undefined : basePx + d
  }
  if (s.startsWith('-')) {
    const d = parseInt(s.slice(1), 10)
    return Number.isNaN(d) ? undefined : Math.max(8, basePx - d)
  }
  const abs = parseInt(s, 10)
  return Number.isNaN(abs) ? undefined : abs
}

/** 汇总一行台词中的可见字符总数（打字机总步数用） */
export function countVisibleChars(pieces: FlatPiece[]): number {
  let n = 0
  for (const p of pieces) if (p.kind === 'chunk') n += Array.from(p.text).length
  return n
}
