/**
 * Ren'Py ATL / Transform 属性模型
 * ================================
 * 本模块严格按 Ren'Py 官方 ATL 与 Transform 文档实现属性解析与定位换算，
 * 是「导入的工程在编辑器里跑出与引擎一致观感」的地基。
 *
 * 之所以要单独成模块，是因为 Ren'Py 的定位语义存在大量「快捷属性展开」，
 * 稍有偏差立绘的大小与站位就会整体跑偏：
 *
 *   xalign  a   ≡  xpos a  +  xanchor a      （对齐 = 同时设位置与锚点）
 *   xcenter a   ≡  xpos a  +  xanchor 0.5    （以中心对准某坐标）
 *   pos    (x,y) ≡ xpos x  +  ypos y
 *   anchor (x,y) ≡ xanchor x + yanchor y
 *   align  (x,y) ≡ xalign x + yalign y
 *   offset (x,y) ≡ xoffset x + yoffset y     （像素级附加偏移）
 *
 * 关键点：这些展开必须「按书写顺序逐条覆盖」。例如工程里常见的写法
 *
 *   transform f:
 *       xalign 0.5      # → xpos 0.5, xanchor 0.5
 *       yalign 0.5      # → ypos 0.5, yanchor 0.5
 *       xpos 350        # → 仅覆盖 xpos，xanchor 仍为 0.5
 *       ypos 650        # → 仅覆盖 ypos，yanchor 仍为 0.5
 *
 * 真实语义是「把图片的几何中心放在坐标 (350, 650)」。若把 xalign 简单当作
 * 对齐比例、或让后面的 xpos 连锚点一起改写，立绘就会整体偏移半个身位。
 *
 * 另一处高频误解是数值单位：Ren'Py 中整数是像素、浮点数是屏幕比例
 * （xpos 350 是 350 像素，xpos 0.5 是屏宽一半）。锚点同理，只是比例基准
 * 变成图片自身尺寸。本模块统一把两者折算成 0-1 归一化值。
 */

/** ATL 位置与变换属性的中间态（全部为 Ren'Py 原生语义，未做归一化） */
export interface AtlState {
  /** 位置：数值 + 是否为比例值（浮点=比例，整数=像素） */
  xpos?: { v: number; ratio: boolean }
  ypos?: { v: number; ratio: boolean }
  /** 锚点：比例基准为图片自身尺寸 */
  xanchor?: { v: number; ratio: boolean }
  yanchor?: { v: number; ratio: boolean }
  /** 像素偏移，叠加在位置之上 */
  xoffset?: number
  yoffset?: number
  /** 缩放：相对图片原始像素的倍率 */
  zoom?: number
  xzoom?: number
  yzoom?: number
  /** 透明度 0-1 */
  alpha?: number
  /** 旋转角度 */
  rotate?: number
}

/** Ren'Py 数值字面量：含小数点即为比例值，否则为像素 */
function num(raw: string): { v: number; ratio: boolean } | null {
  const t = raw.trim()
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  return { v: Number(t), ratio: t.includes('.') }
}

/** 单值属性名 → 写入 AtlState 的方式 */
const SCALAR_SETTERS: Record<string, (s: AtlState, n: { v: number; ratio: boolean }) => void> = {
  xpos: (s, n) => { s.xpos = n },
  ypos: (s, n) => { s.ypos = n },
  xanchor: (s, n) => { s.xanchor = n },
  yanchor: (s, n) => { s.yanchor = n },
  // 对齐 = 位置与锚点同时设定，且恒为比例语义（官方即以 0-1 定义）
  xalign: (s, n) => { s.xpos = { v: n.v, ratio: true }; s.xanchor = { v: n.v, ratio: true } },
  yalign: (s, n) => { s.ypos = { v: n.v, ratio: true }; s.yanchor = { v: n.v, ratio: true } },
  // xcenter = 把图片中心对准该坐标
  xcenter: (s, n) => { s.xpos = n; s.xanchor = { v: 0.5, ratio: true } },
  ycenter: (s, n) => { s.ypos = n; s.yanchor = { v: 0.5, ratio: true } },
  xoffset: (s, n) => { s.xoffset = n.v },
  yoffset: (s, n) => { s.yoffset = n.v },
  zoom: (s, n) => { s.zoom = n.v },
  xzoom: (s, n) => { s.xzoom = n.v },
  yzoom: (s, n) => { s.yzoom = n.v },
  alpha: (s, n) => { s.alpha = n.v },
  rotate: (s, n) => { s.rotate = n.v },
}

/** 元组属性名 → 拆成两个分量 */
const TUPLE_SETTERS: Record<string, [string, string]> = {
  pos: ['xpos', 'ypos'],
  anchor: ['xanchor', 'yanchor'],
  align: ['xalign', 'yalign'],
  offset: ['xoffset', 'yoffset'],
  center: ['xcenter', 'ycenter'],
}

/**
 * ATL 时间控制关键字（warper）。
 * 形如 `linear 0.5 xalign 1.0`：前缀声明补间方式与时长，其后才是目标属性。
 * 静态预览取动画的「终态」最贴近实际观感，故跳过前缀继续解析属性。
 */
const WARPERS = new Set([
  'linear', 'ease', 'easein', 'easeout', 'easeinout',
  'easein_quad', 'easeout_quad', 'easeinout_quad',
  'easein_cubic', 'easeout_cubic', 'easeinout_cubic',
  'easein_quart', 'easeout_quart', 'easein_expo', 'easeout_expo',
  'easein_circ', 'easeout_circ', 'easein_back', 'easeout_back',
  'easein_elastic', 'easeout_elastic', 'easein_bounce', 'easeout_bounce',
])

/**
 * 解析一行 ATL 属性，把结果按「顺序覆盖」写入 state。
 * 支持：一行多属性、warper 前缀、元组写法、关键字位置（left/center/right…）。
 * 返回是否识别出至少一个属性（供调用方判断该行是否属于 ATL 块）。
 */
export function parseAtlLine(line: string, state: AtlState): boolean {
  // 先摘出所有元组写法，避免括号内的逗号被空格切分逻辑打散
  let rest = line.trim()
  let matched = false
  rest = rest.replace(/\b(pos|anchor|align|offset|center|size)\s*\(([^)]*)\)/g, (_all, key: string, body: string) => {
    const parts = body.split(',').map((p) => p.trim()).filter(Boolean)
    if (key === 'size') {
      // size (w, h) 指定绝对像素尺寸，本模型以 zoom 表达缩放，交由调用方按原图换算，此处忽略
      matched = true
      return ' '
    }
    const [kx, ky] = TUPLE_SETTERS[key]
    const nx = parts[0] ? num(parts[0]) : null
    const ny = parts[1] ? num(parts[1]) : null
    if (nx) { SCALAR_SETTERS[kx]?.(state, nx); matched = true }
    if (ny) { SCALAR_SETTERS[ky]?.(state, ny); matched = true }
    return ' '
  })

  const tokens = rest.split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].replace(/[,:]$/, '')
    // warper 前缀：`linear 0.5 …`，跳过关键字与紧随的时长
    if (WARPERS.has(token)) {
      if (tokens[i + 1] && num(tokens[i + 1])) i++
      matched = true
      continue
    }
    // 关键字位置（Ren'Py 内建 Position 常量）
    if (applyBuiltinPosition(token, state)) {
      matched = true
      continue
    }
    const setter = SCALAR_SETTERS[token]
    if (!setter) continue
    const value = tokens[i + 1] ? num(tokens[i + 1]) : null
    if (!value) continue
    setter(state, value)
    i++
    matched = true
  }
  return matched
}

/**
 * Ren'Py 官方内建位置（定义于 renpy/common/00definitions.rpy）。
 * 这些名字不会出现在工程自己的 transform 定义里，但脚本中大量直接使用
 * （show eileen at left），必须内置，否则立绘站位会全部退化成居中。
 *
 * 注意 left / right 的官方定义是 xalign 0.0 / 1.0，即锚点也贴到图片边缘，
 * 效果是「立绘紧贴屏幕左右边」，而非「立绘中心落在屏幕 0% / 100% 处」。
 */
export const RENPY_BUILTIN_POSITIONS: Record<
  string,
  { xpos: number; xanchor: number; ypos: number; yanchor: number }
> = {
  // align 类：位置与锚点同值，效果是紧贴屏幕对应边
  left: { xpos: 0.0, xanchor: 0.0, ypos: 1.0, yanchor: 1.0 },
  center: { xpos: 0.5, xanchor: 0.5, ypos: 1.0, yanchor: 1.0 },
  right: { xpos: 1.0, xanchor: 1.0, ypos: 1.0, yanchor: 1.0 },
  truecenter: { xpos: 0.5, xanchor: 0.5, ypos: 0.5, yanchor: 0.5 },
  top: { xpos: 0.5, xanchor: 0.5, ypos: 0.0, yanchor: 0.0 },
  topleft: { xpos: 0.0, xanchor: 0.0, ypos: 0.0, yanchor: 0.0 },
  topright: { xpos: 1.0, xanchor: 1.0, ypos: 0.0, yanchor: 0.0 },
  bottom: { xpos: 0.5, xanchor: 0.5, ypos: 1.0, yanchor: 1.0 },
  bottomleft: { xpos: 0.0, xanchor: 0.0, ypos: 1.0, yanchor: 1.0 },
  bottomright: { xpos: 1.0, xanchor: 1.0, ypos: 1.0, yanchor: 1.0 },
  // 屏外位置：位置贴边而锚点取反，使图片整体移出可视区（滑入滑出动画的起止点）
  offscreenleft: { xpos: 0.0, xanchor: 1.0, ypos: 1.0, yanchor: 1.0 },
  offscreenright: { xpos: 1.0, xanchor: 0.0, ypos: 1.0, yanchor: 1.0 },
  default: { xpos: 0.5, xanchor: 0.5, ypos: 1.0, yanchor: 1.0 },
}

/** 把内建位置常量写入 ATL 状态（等价于按顺序设置 xpos/xanchor/ypos/yanchor） */
export function applyBuiltinPosition(name: string, state: AtlState): boolean {
  const p = RENPY_BUILTIN_POSITIONS[name]
  if (!p) return false
  state.xpos = { v: p.xpos, ratio: true }
  state.xanchor = { v: p.xanchor, ratio: true }
  state.ypos = { v: p.ypos, ratio: true }
  state.yanchor = { v: p.yanchor, ratio: true }
  return true
}

/** 编辑器可直接消费的放置参数（全部归一化到 0-1） */
export interface AtlPlacement {
  /** 锚点在舞台上的归一化坐标 */
  pos_x?: number
  pos_y?: number
  /** 锚点在图片自身的归一化坐标（0.5/0.5 为几何中心） */
  anchor_x?: number
  anchor_y?: number
  /** Ren'Py 原生 zoom（相对原图像素） */
  zoom?: number
  alpha?: number
  rotate?: number
}

/**
 * 把 ATL 中间态换算成编辑器放置参数。
 *
 * @param screenW 工程基准分辨率宽（用于把像素位置折算成比例）
 * @param screenH 工程基准分辨率高
 */
export function atlToPlacement(state: AtlState, screenW: number, screenH: number): AtlPlacement {
  const out: AtlPlacement = {}

  // 位置：整数按像素折算，浮点本身即比例；offset 是附加像素偏移
  if (state.xpos) {
    const base = state.xpos.ratio ? state.xpos.v : state.xpos.v / screenW
    out.pos_x = base + (state.xoffset ?? 0) / screenW
  } else if (state.xoffset !== undefined) {
    out.pos_x = state.xoffset / screenW
  }
  if (state.ypos) {
    const base = state.ypos.ratio ? state.ypos.v : state.ypos.v / screenH
    out.pos_y = base + (state.yoffset ?? 0) / screenH
  } else if (state.yoffset !== undefined) {
    out.pos_y = state.yoffset / screenH
  }

  // 锚点：比例基准是图片自身；像素锚点缺少原图尺寸无法精确折算，
  // 此时退回几何中心，比错误地当成比例（如 xanchor 200 → 200 倍宽）稳妥得多
  if (state.xanchor) out.anchor_x = state.xanchor.ratio ? state.xanchor.v : 0.5
  if (state.yanchor) out.anchor_y = state.yanchor.ratio ? state.yanchor.v : 0.5

  // 缩放：分轴 zoom 取其一近似（编辑器目前按等比渲染）
  const zoom = state.zoom ?? state.xzoom ?? state.yzoom
  if (zoom !== undefined) out.zoom = zoom
  if (state.alpha !== undefined) out.alpha = state.alpha
  if (state.rotate !== undefined) out.rotate = state.rotate
  return out
}

/**
 * 把 Ren'Py 的 xalign（0=贴左，1=贴右）折算到编辑器的五档预设站位。
 * 仅在脚本未给出精确坐标时作为兜底，保证 at left / at right 至少落在正确一侧。
 */
export function alignToSlot(xalign: number): string {
  if (xalign <= 0.15) return 'left'
  if (xalign < 0.42) return 'left-center'
  if (xalign <= 0.58) return 'center'
  if (xalign < 0.85) return 'right-center'
  return 'right'
}

/**
 * 解析 at 子句中的可调用变换：Position(xpos=0.5, ypos=1.0) / Transform(zoom=0.8) /
 * 以及工程自定义的带参 transform（取其关键字实参中可识别的属性）。
 * 位置实参无法可靠对应属性名，故只取关键字实参。
 */
export function parseTransformCall(expr: string, state: AtlState): boolean {
  const m = expr.match(/^([A-Za-z_]\w*)\s*\((.*)\)$/s)
  if (!m) return false
  let matched = false
  for (const part of m[2].split(',')) {
    const kv = part.split('=')
    if (kv.length !== 2) continue
    const key = kv[0].trim()
    const value = num(kv[1])
    if (!value) continue
    const setter = SCALAR_SETTERS[key]
    if (setter) { setter(state, value); matched = true }
  }
  return matched
}
