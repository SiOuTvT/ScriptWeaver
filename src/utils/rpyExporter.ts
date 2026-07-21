/**
 * Delta → Ren'Py .rpy 脚本导出器（A 方向 · 纯函数内核）
 *
 * 设计支柱：
 *  1. AST 编译器模型：三遍流水线 —— 读取(resolvedStates) → 符号表/校验 → 差分发射(RpyNode[]) → serialize。
 *     与文本无关的 RpyNode 中间表示，可单测、可换引擎后端。
 *  2. 四通道音频隔离：bgm→music(+loop)、ambient→自定义注册通道、se→sound、voice→voice。
 *     所有 play 语句引用**真实文件名**（绝不用 asset_id），修复 G1。
 *  3. 路径对齐 C 阶段规范目录：images/background、images/sprite、audio，保留真实扩展名，修复 G2。
 *  4. 纯函数边界：本模块不 import 任何 Zustand store / React，只读快照、无副作用；
 *     唯一的 I/O 边界（Blob 下载 / electronAPI 调用）集中在末尾 exportProjectPackage。
 *
 * sprite_id 现为表情 ID（如 "smile"），立绘图片通过 CharacterConfig → ExpressionRef → AssetItem 解析。
 */

import type { LineDelta, ResolvedLineState, CharacterConfig, AssetItem, PositionSlot, MountedEffect, GlobalVariable, VariableOperation, ChoiceItem } from '@/core/types'
import { getMountable } from '@/data/mountableEffects'

// ======================= 类型 =======================

export interface ValidationError {
  lineId: string
  field: string
  value: string
  message: string
}

export interface ResolvedLookups {
  allCharIds: Set<string>
  /** expressionId 集合（仅用于历史兼容，已被 SymbolTable 取代） */
  expressionNames: Set<string>
  /** speaker（如 "Alice"）→ charId（如 "alice"），大小写不敏感匹配 */
  speakerToCharId: Record<string, string>
  allBgIds: Set<string>
  /** 全部音频素材 id（用于 voice/se 校验，A-5） */
  allAudioIds: Set<string>
}

// ---- 符号表（Pass 1 产出，编译期权威解析器）----
export interface SymbolTable {
  speakerToCharId: Record<string, string>
  charDefs: Record<string, {
    displayName: string
    dialogueColor?: string
    expressions: Map<string, AssetItem>
  }>
  bgDefs: Map<string, AssetItem>
  audioDefs: Map<string, AssetItem>
  slots: Record<string, { xalign: number; yalign: number; anchor_point: string }>
}

// ---- AST 节点（与文本无关）----
type AtClause =
  | { kind: 'slot'; slotId: string }
  | { kind: 'transform'; xpos: number; ypos: number; xanchor: number; yanchor: number }

type RpyNode =
  | { kind: 'label'; name: string }
  | { kind: 'blank' }
  | { kind: 'scene'; image: string; transition?: string; effectAt?: string[]; effectWith?: string }
  | { kind: 'show'; charId: string; exprId: string; at: AtClause; zorder: number; zoom?: number; transition?: string; effectAt?: string[]; effectWith?: string }
  | { kind: 'layer_filter'; expr: string | null }
  | { kind: 'hide'; charId: string }
  | { kind: 'playMusic'; file: string; fadein?: number; loop: boolean }
  | { kind: 'playAmbient'; file: string; fadein?: number; loop: boolean }
  | { kind: 'playSound'; file: string }
  | { kind: 'voice'; file: string }
  | { kind: 'stopMusic'; fadeout: number }
  | { kind: 'stopAmbient' }
  | { kind: 'say'; speaker?: string; text: string }
  | { kind: 'python'; expr: string }
  | { kind: 'menu'; prompt?: string; choices: { text: string; target_label: string; condition?: string; ops?: string[]; defined?: boolean }[] }
  | { kind: 'comment'; text: string }
  | { kind: 'return' }

// ---- 文件包分发模型（A-6）----
export interface AssetRef {
  assetId: string
  type: 'background' | 'sprite' | 'audio'
  /** 真实文件名（含扩展名），如 street_dusk.jpg */
  fileName: string
  /** 相对项目根目录的源路径，如 assets/images/background/street_dusk.jpg */
  sourceRelativePath: string
  /** 相对 game/ 的导出路径，如 images/background/street_dusk.jpg */
  exportRelPath: string
}

export interface RpyBundle {
  script: string
  definitions: string
  /** 时间轴挂载特效 → 参数化 ATL transform 自动生成（独立 transforms.rpy） */
  transforms?: string
  assets: AssetRef[]
}

// ======================= 辅助函数 =======================

function indent(level: number, text: string): string {
  return '    '.repeat(level) + text
}

/** 归一化坐标保留 3 位小数，避免导出脚本出现超长浮点 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** 转义台词中的反斜杠与双引号（先转义反斜杠，再转义引号） */
function escapeDialogue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// ======================= 过渡 / 特效映射 =======================

/**
 * Ren'Py 内建过渡（含可当过渡使用的 transform）。命中则原样透传，无需额外定义。
 * 仅收录确证存在的内建名，避免把不存在的变量名原样发射成 `with xxx` 导致 NameError。
 */
const BUILTIN_TRANSITIONS = new Set<string>([
  'dissolve', 'fade', 'flash', 'pixellate', 'blinds', 'glitter',
  'irisin', 'irisout', 'move',
  'moveinleft', 'moveinright', 'moveinup', 'moveindown',
  'moveoutleft', 'moveoutright', 'moveoutup', 'moveoutdown',
  'pushleft', 'pushright', 'pushup', 'pushdown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'squeezeleft', 'squeezeright', 'squeezeup', 'squeezedown',
  'easeinleft', 'easeinright', 'easeinup', 'easeindown',
  'easeoutleft', 'easeoutright', 'easeoutup', 'easeoutdown',
  'facin', 'facout', 'vpunch', 'hpunch',
])

/** 把任意过渡字符串清洗为合法 Python 标识符（小写、仅 [a-z0-9_]） */
function sanitizeIdent(t: string): string {
  return (
    t
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'dissolve'
  )
}

/**
 * 解析过渡名：
 *  - 空 / 'None' / 'none' → undefined（不输出 with）
 *  - 内建过渡 → 原样返回
 *  - 其余（自定义特效名）→ 清洗为标识符并返回，同时记入 custom 集合，
 *    由 definitions.rpy 生成对应 transform，保证 `with <name>` 必定存在、必定可编译。
 */
function resolveTransition(raw: string | undefined, custom: Set<string>): string | undefined {
  if (!raw || raw === 'None' || raw.trim() === '') return undefined
  const id = sanitizeIdent(raw)
  if (id === 'none') return undefined
  if (BUILTIN_TRANSITIONS.has(id)) return id
  custom.add(id)
  return id
}

/** 扫描整篇剧本实际用到的过渡名（供 definitions 生成 transform 定义） */
function collectUsedTransitions(
  _deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
): Set<string> {
  const set = new Set<string>()
  for (const s of resolvedStates) {
    if (s.background?.transition) resolveTransition(s.background.transition, set)
    for (const c of Object.values(s.characters)) {
      if (c.transition) resolveTransition(c.transition, set)
    }
  }
  return set
}

// ======================= 挂载特效 → 参数化 ATL codegen =======================
//
// 任务 2/2 核心：把时间轴上「挂载的特效实例」(MountedEffect) 转成符合 Ren'Py
// 官方 Scripting Manual 的标准 ATL 代码。设计要点：
//  - 每个 distinct 特效只在 transforms.rpy 定义一次 `transform sw_custom_<id>(默认参数):`，
//    调用处按实例参数 `at sw_custom_<id>(duration=0.5, amplitude=10)` 覆盖，零重复、必编译。
//  - transform 型 → 追加到 `at` 子句；transition 型 → 走 `with`。
//  - 少数内建过渡工厂（dissolve/fade/pixellate）直接 `with dissolve(0.5)`，无需自定义定义，
//    其余一律 `sw_custom_` 前缀，彻底规避与内建名/其它自定义名的 NameError 碰撞。

/** 内建过渡工厂：可直接 `with <id>(参数)` 调用，无需生成自定义 transform */
const BUILTIN_FACTORY_TRANSITIONS = new Set([
  'dissolve', 'fade', 'pixellate',
  'wiperight', 'wipeleft', 'wipeup', 'wipedown',
])

/** 格式化数值参数（3 位小数，避免超长浮点污染 .rpy） */
function num(n: number): number {
  return round3(n)
}

/** 内建过渡工厂的参数拼接（dissolve(time) / fade(out,hold,in) / pixellate(time,steps) / wipe*(time)） */
function builtinFactoryArgs(id: string, params: Record<string, number>): string {
  switch (id) {
    case 'dissolve':
      return `${num(params.time ?? 0.5)}`
    case 'fade':
      return `${num(params.out_time ?? 0.5)}, ${num(params.hold_time ?? 0)}, ${num(params.in_time ?? 0.5)}`
    case 'pixellate':
      return `${num(params.time ?? 0.5)}, ${Math.round(params.steps ?? 4)}`
    case 'wiperight':
    case 'wipeleft':
    case 'wipeup':
    case 'wipedown':
      return `${num(params.time ?? 0.8)}`
    default:
      return ''
  }
}

/** 把单个挂载特效实例渲染为调用字符串（at/with 子句用） */
function effectCallStr(e: MountedEffect): string | null {
  const def = getMountable(e.effectId)
  if (!def) return null
  // 滤镜（filter）不走 at/with，由 layer_filter 节点单独处理
  if (def.kind === 'filter') return null
  // 内建过渡工厂：直接 with dissolve(0.5) / fade(...) / pixellate(...) / wiperight(...)
  if (def.kind === 'transition' && BUILTIN_FACTORY_TRANSITIONS.has(def.id)) {
    return `${def.id}(${builtinFactoryArgs(def.id, e.params)})`
  }
  // 自定义：sw_custom_<id>(k=v, ...)，参数取实例实值（缺省回退 def）
  const args = def.params.map((p) => `${p.key}=${num(e.params[p.key] ?? p.def)}`).join(', ')
  return `sw_custom_${def.id}(${args})`
}

/** 该特效是否需要生成 transform 定义（自定义均需；内建工厂/滤镜无需） */
function effectNeedsDef(e: MountedEffect): boolean {
  const def = getMountable(e.effectId)
  if (!def) return false
  if (def.kind === 'filter') return false
  if (def.kind === 'transition' && BUILTIN_FACTORY_TRANSITIONS.has(def.id)) return false
  return true
}

/** 稳定签名：仅取启用的挂载特效，用于 diff 是否变化 */
function effectsSig(list?: MountedEffect[]): string {
  return (list ?? [])
    .filter((e) => e.enabled)
    .map((e) => `${e.effectId}:${JSON.stringify(e.params)}`)
    .join('|')
}

/** 把挂载列表拆成 {at: 变换型调用[], withCall: 首个过渡型调用} */
function mountEffects(list?: MountedEffect[]): { at: string[]; withCall?: string } {
  const at: string[] = []
  let withCall: string | undefined
  for (const e of list ?? []) {
    if (!e.enabled) continue
    const call = effectCallStr(e)
    if (!call) continue
    const def = getMountable(e.effectId)
    if (!def) continue
    if (def.kind === 'transition') {
      if (!withCall) withCall = call
    } else {
      at.push(call)
    }
  }
  return { at, withCall }
}

/** 收集全剧本所有挂载特效实例（去重前） */
function collectMountedEffects(resolvedStates: ResolvedLineState[]): MountedEffect[] {
  const out: MountedEffect[] = []
  for (const s of resolvedStates) {
    if (s.background?.effects) out.push(...s.background.effects)
    for (const c of Object.values(s.characters)) if (c.effects) out.push(...c.effects)
  }
  return out
}

// ======================= 全屏滤镜 → Ren'Py matrixcolor =======================
// 滤镜（filter 类）针对整个舞台色调/氛围，导出为 `show layer master: matrixcolor <Matrix>`。
// 复用 Ren'Py 内建 SaturationMatrix / SepiaMatrix / HueMatrix，组合以 ` * ` 连接，零自定义 shader。

/** 单个滤镜实例 → matrixcolor 表达式片段（如 SaturationMatrix(0.0)） */
function filterMatrixExpr(e: MountedEffect): string | null {
  const def = getMountable(e.effectId)
  if (!def || def.kind !== 'filter') return null
  switch (def.id) {
    case 'monochrome':
      // 去色：SaturationMatrix(0) 即纯灰度；1 则原色
      return `SaturationMatrix(${num(e.params.saturation ?? 0)})`
    case 'sepia':
      return `SepiaMatrix()`
    case 'colormatrix': {
      const hue = num(e.params.hue ?? 0)
      const sat = num(e.params.saturation ?? 1)
      // 调色滤镜：先调饱和度再旋转色相（如血腥红光 hue≈0 sat>1、中毒绿 hue≈120）
      return `SaturationMatrix(${sat}) * HueMatrix(${hue})`
    }
    default:
      return null
  }
}

/** 收集单行所有启用的滤镜实例，组合成 matrixcolor 表达式（多滤镜以 ` * ` 连接）；无则返回 null */
function collectLineFilterExpr(state: ResolvedLineState): string | null {
  const exprs: string[] = []
  const push = (list?: MountedEffect[]) => {
    for (const e of list ?? []) {
      if (!e.enabled) continue
      const def = getMountable(e.effectId)
      if (!def || def.kind !== 'filter') continue
      const expr = filterMatrixExpr(e)
      if (expr) exprs.push(expr)
    }
  }
  push(state.background?.effects)
  for (const c of Object.values(state.characters)) push(c.effects)
  // 舞台级全局滤镜（scope: 'stage'）同样贡献整层 matrixcolor
  push(state.stageEffects)
  return exprs.length ? exprs.join(' * ') : null
}

// ======================= 全局变量操作 → Ren'Py `$` 语句 =======================
// 严格对齐 Ren'Py 的标准 Python 表达式语法，导出为 `$ <expr>`。
// 例如：`$ tsundere_points += 1`、`$ has_key = True`、`$ has_key = not has_key`。

/** 把 boolean / number 初始值格式化为 Python 字面量（boolean 必须大写 True/False） */
function pyLiteral(v: boolean | number): string {
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  return `${round3(v)}`
}

/** 单个变量操作 → `$` 后的 Python 表达式（如 `tsundere_points += 1`）；非法返回 null */
function varOpExpr(op: VariableOperation): string | null {
  const name = op.varName
  if (!name) return null
  switch (op.op) {
    case 'set':
      return `${name} = ${pyLiteral(op.value ?? false)}`
    case 'add':
      return `${name} += ${num(op.value != null ? (op.value as number) : 0)}`
    case 'subtract':
      return `${name} -= ${num(op.value != null ? (op.value as number) : 0)}`
    case 'toggle':
      return `${name} = not ${name}`
    default:
      return null
  }
}

/**
 * 参数化 transform 的 ATL 正文（已含 4 空格基础缩进；repeat 内层 8 空格）。
 * 正文直接引用参数变量名（duration / amplitude…），调用处覆盖即生效。
 */
function effectTransformBody(id: string): string[] {
  switch (id) {
    // ---- transform 型（at 叠加）----
    case 'shake':
      return [
        'xoffset 0',
        'linear (duration / 4.0) xoffset -amplitude',
        'linear (duration / 4.0) xoffset amplitude',
        'linear (duration / 4.0) xoffset -amplitude',
        'linear (duration / 4.0) xoffset 0',
      ]
    case 'alpha':
      return ['alpha 1.0', 'linear duration alpha alpha']
    case 'blink':
      return [
        'repeat:',
        '    alpha 1.0',
        '    linear (0.5 / frequency) alpha minAlpha',
        '    linear (0.5 / frequency) alpha 1.0',
      ]
    case 'rotate':
      return ['rotate 0', 'linear duration rotate angle']
    case 'zoomin':
      return ['zoom 1.0', 'linear duration zoom zoom']
    case 'zoom':
      return ['zoom zoom']
    case 'blur':
      return ['blur blur']
    case 'breathing':
      return ['zoom 1.0', 'repeat:', '    linear (0.5 / rate) zoom (1.0 + depth)', '    linear (0.5 / rate) zoom 1.0']
    case 'nudge':
      return [
        'xoffset 0',
        'yoffset 0',
        'repeat:',
        '    linear (0.5 / rate) xoffset dx',
        '    linear (0.5 / rate) xoffset 0',
        '    linear (0.5 / rate) yoffset dy',
        '    linear (0.5 / rate) yoffset 0',
      ]
    // ---- transition 型（with 调度，自定义 ATL 过渡）----
    case 'hpunch':
      return ['xoffset 0', 'linear 0.06 xoffset -10', 'linear 0.06 xoffset 10', 'linear 0.06 xoffset 0']
    case 'vpunch':
      return ['yoffset 0', 'linear 0.06 yoffset -10', 'linear 0.06 yoffset 10', 'linear 0.06 yoffset 0']
    case 'flash':
      return ['alpha 0.0', 'linear 0.15 alpha 1.0']
    case 'blinds':
      return ['alpha 0.0', 'linear 0.3 alpha 1.0']
    // 注：wiperight/left/up/down 已纳入内建过渡工厂，走 `with wiperight(time)`，不在此生成
    default:
      // 兜底：安全淡入（任何情况下都能编译运行，绝不抛错）
      return ['alpha 0.0', 'linear 0.3 alpha 1.0']
  }
}

/** 生成独立的 transforms.rpy：仅含需要自定义定义的挂载特效（按 distinct id 去重） */
export function exportTransformsRpy(resolvedStates: ResolvedLineState[]): string {
  const used = collectMountedEffects(resolvedStates).filter((e) => e.enabled && effectNeedsDef(e))
  const seen = new Set<string>()
  const distinct = used.filter((e) => {
    if (seen.has(e.effectId)) return false
    seen.add(e.effectId)
    return true
  })

  const lines: string[] = []
  lines.push('# ============================================================')
  lines.push('# ScriptWeaver - transforms.rpy')
  lines.push('# 时间轴挂载特效 → 参数化 ATL transform（自动生成，请勿手改）')
  lines.push('# 由 rpyExporter 依据挂载实例的参数规格产出，保证编译零报错。')
  lines.push('# ============================================================')
  lines.push('')

  if (distinct.length === 0) {
    lines.push('# （本剧本未挂载任何需要自定义 transform 的特效）')
    return lines.join('\n')
  }

  for (const e of distinct) {
    const def = getMountable(e.effectId)
    if (!def) continue
    const sig = def.params.map((p) => `${p.key}=${num(p.def)}`).join(', ')
    lines.push(`transform sw_custom_${def.id}(${sig}):`)
    for (const bl of effectTransformBody(def.id)) lines.push(`    ${bl}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** 磁盘/导出子目录（与 C 阶段 assets/ 规范完全同名） */
function subdirFor(type: AssetItem['type']): string {
  switch (type) {
    case 'background': return 'images/background'
    case 'sprite': return 'images/sprite'
    case 'audio': return 'audio'
  }
}

// ======================= Pass 1：符号表 =======================

export function buildSymbolTable(
  deltas: LineDelta[],
  characterConfigs: CharacterConfig[],
  assets: AssetItem[],
  positionSlots?: PositionSlot[],
): SymbolTable {
  // speaker → charId（先按 charId 大小写不敏感，再按 displayName 兜底）
  const speakerToCharId: Record<string, string> = {}
  const displayNameToCharId = new Map<string, string>()
  for (const c of characterConfigs) {
    displayNameToCharId.set(c.displayName.toLowerCase(), c.charId)
  }
  for (const d of deltas) {
    if (!d.speaker) continue
    const direct = characterConfigs.find((c) => c.charId.toLowerCase() === d.speaker!.toLowerCase())?.charId
    const matched = direct ?? displayNameToCharId.get(d.speaker.toLowerCase())
    if (matched) speakerToCharId[d.speaker] = matched
  }

  // 角色 → 表情 → 立绘素材
  const charDefs: SymbolTable['charDefs'] = {}
  for (const c of characterConfigs) {
    const expMap = new Map<string, AssetItem>()
    for (const e of c.expressions) {
      const asset = assets.find((a) => a.id === e.assetId)
      if (asset) expMap.set(e.id, asset)
    }
    charDefs[c.charId] = { displayName: c.displayName, dialogueColor: c.dialogueColor, expressions: expMap }
  }

  // 背景 / 音频 索引
  const bgDefs = new Map<string, AssetItem>()
  const audioDefs = new Map<string, AssetItem>()
  for (const a of assets) {
    if (a.type === 'background') bgDefs.set(a.id, a)
    else if (a.type === 'audio') audioDefs.set(a.id, a)
  }

  // 位置槽位
  const slots: SymbolTable['slots'] = {}
  for (const s of positionSlots ?? []) {
    slots[s.id] = { xalign: s.anchor_x, yalign: s.anchor_y, anchor_point: s.anchor_point }
  }

  return { speakerToCharId, charDefs, bgDefs, audioDefs, slots }
}

// ======================= 校验层（A-5 扩展 voice/se） =======================

export function resolveLookups(
  deltas: LineDelta[],
  characterConfigs: CharacterConfig[],
  assets: AssetItem[] = [],
): ResolvedLookups {
  const allCharIds = new Set(characterConfigs.map((c) => c.charId))
  const expressionNames = new Set<string>()
  const speakerToCharId: Record<string, string> = {}
  const allBgIds = new Set<string>()
  const allAudioIds = new Set<string>(assets.filter((a) => a.type === 'audio').map((a) => a.id))

  const displayNameToCharId = new Map<string, string>()
  for (const char of characterConfigs) {
    displayNameToCharId.set(char.displayName.toLowerCase(), char.charId)
  }
  for (const char of characterConfigs) {
    for (const expr of char.expressions) expressionNames.add(expr.id)
  }
  for (const delta of deltas) {
    if (delta.background?.asset_id) allBgIds.add(delta.background.asset_id)
    if (delta.speaker) {
      const direct = [...allCharIds].find((id) => id.toLowerCase() === delta.speaker!.toLowerCase())
      const matched = direct ?? displayNameToCharId.get(delta.speaker.toLowerCase())
      if (matched) speakerToCharId[delta.speaker] = matched
    }
  }

  return { allCharIds, expressionNames, speakerToCharId, allBgIds, allAudioIds }
}

export function validateExportNames(
  deltas: LineDelta[],
  lookups: ResolvedLookups,
  characterConfigs: CharacterConfig[],
  assets: AssetItem[] = [],
): ValidationError[] {
  const errors: ValidationError[] = []
  // 'start' 为入口 label 保留字，禁止作为剧情块标签（避免遮蔽入口）
  const seenLabels = new Set<string>(['start'])
  const { allCharIds, speakerToCharId, allBgIds } = lookups
  const audioIds = lookups.allAudioIds ?? new Set(assets.filter((a) => a.type === 'audio').map((a) => a.id))

  // 构建 charId → 有效表情集合
  const charExpressions: Record<string, Set<string>> = {}
  for (const char of characterConfigs) {
    charExpressions[char.charId] = new Set(char.expressions.map((e) => e.id))
  }

  for (const delta of deltas) {
    const lid = delta.line_id

    // 1) 说话人校验
    if (delta.speaker) {
      const mapped = speakerToCharId[delta.speaker]
      if (!mapped && !allCharIds.has(delta.speaker)) {
        errors.push({
          lineId: lid,
          field: 'speaker',
          value: delta.speaker,
          message: `说话人 "${delta.speaker}" 未匹配到任何角色 ID。已知角色：[${[...allCharIds].join(', ')}]。`,
        })
      }
    }

    // 2) 角色 sprite_id（表情 ID）校验
    for (const [charId, char] of Object.entries(delta.characters)) {
      const role = char.char_id ?? charId
      if (!allCharIds.has(role)) {
        errors.push({
          lineId: lid,
          field: 'characters.key',
          value: charId,
          message: `角色 "${role}" 未在角色管理中找到配置。`,
        })
      }
      const validExpressions = charExpressions[role]
      if (validExpressions && char.sprite_id && !validExpressions.has(char.sprite_id)) {
        const available = [...validExpressions].join(', ')
        errors.push({
          lineId: lid,
          field: 'characters.sprite_id',
          value: char.sprite_id,
          message: `表情 "${char.sprite_id}" 不在角色 "${role}" 的表情列表中。可用表情：[${available}]。`,
        })
      }
    }

    // 3) 背景校验
    if (delta.background?.asset_id && !allBgIds.has(delta.background.asset_id)) {
      errors.push({
        lineId: lid,
        field: 'background.asset_id',
        value: delta.background.asset_id,
        message: `背景 "${delta.background.asset_id}" 不在已知背景列表中。`,
      })
    }

    // 4) 语音校验（A-5）：必须解析到音频素材
    if (delta.audio.voice && !audioIds.has(delta.audio.voice)) {
      errors.push({
        lineId: lid,
        field: 'audio.voice',
        value: delta.audio.voice,
        message: `语音 "${delta.audio.voice}" 未匹配到任何音频素材（需在素材库中登记 type=audio 的资产）。`,
      })
    }

    // 5) 音效校验（A-5）
    for (const se of delta.audio.se) {
      if (!audioIds.has(se)) {
        errors.push({
          lineId: lid,
          field: 'audio.se',
          value: se,
          message: `音效 "${se}" 未匹配到任何音频素材。`,
        })
      }
    }

    // 6) 选择支行校验
    if (delta.line_type === 'choice') {
      const choices = delta.choices ?? []
      if (choices.length === 0) {
        errors.push({
          lineId: lid,
          field: 'choices',
          value: '',
          message: '选择支行至少需要一个选项。',
        })
      }
      choices.forEach((c, idx) => {
        if (!c.text || !c.text.trim()) {
          errors.push({
            lineId: lid,
            field: `choices[${idx}].text`,
            value: c.text ?? '',
            message: `第 ${idx + 1} 个选项文本为空，玩家将无法看到该选项。`,
          })
        }
      })
    }

    // 7) 剧情块标签（Label）校验
    if (delta.label?.trim()) {
      const lab = delta.label.trim()
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lab)) {
        errors.push({
          lineId: lid,
          field: 'label',
          value: lab,
          message: `标签名 "${lab}" 不是合法标识符（须以字母或下划线开头，仅含字母、数字、下划线）。`,
        })
      } else if (seenLabels.has(lab)) {
        errors.push({
          lineId: lid,
          field: 'label',
          value: lab,
          message: `标签 "${lab}" 重复，剧情块标签必须项目内唯一。`,
        })
      } else {
        seenLabels.add(lab)
      }
    }
  }

  return errors
}

export function formatValidationErrors(errors: ValidationError[]): string {
  const header = `导出校验失败 ${errors.length} 处问题\n${'─'.repeat(40)}`
  const body = errors.map((e, i) =>
    `\n[${i + 1}] 行 ${e.lineId} ${e.field}\n    值: "${e.value}"\n    ${e.message}`,
  ).join('\n')
  return header + body
}

// ======================= Pass 2：差分舞台编译 =======================

function resolveAt(c: { position_slot: string; pos_x?: number; pos_y?: number }, st: SymbolTable): AtClause {
  if (c.pos_x != null || c.pos_y != null) {
    return {
      kind: 'transform',
      xpos: round3(c.pos_x ?? 0.5),
      ypos: round3(c.pos_y ?? 0.65),
      xanchor: 0.5,
      yanchor: 1.0,
    }
  }
  return { kind: 'slot', slotId: c.position_slot }
}

/** 图层深浅：按水平位置升序排 zorder（越靠右越靠前） */
function computeZorder(c: { position_slot: string; pos_x?: number; pos_y?: number }, st: SymbolTable): number {
  const x = c.pos_x != null ? c.pos_x : (st.slots[c.position_slot]?.xalign ?? 0.5)
  return Math.round(x * 10)
}

function atEqual(a: AtClause, b: AtClause): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'slot' && b.kind === 'slot') return a.slotId === b.slotId
  if (a.kind === 'transform' && b.kind === 'transform') {
    return a.xpos === b.xpos && a.ypos === b.ypos && a.xanchor === b.xanchor && a.yanchor === b.yanchor
  }
  return false
}

/**
 * 生成 `at` 子句：
 *  - 槽位且无缩放 → 直接使用槽位 transform（如 left / center / right，内建或 definitions 定义）
 *  - 槽位 + 缩放 → `left, sw_zoom(1.2)`（sw_zoom 为合规 transform，非属性）
 *  - 自由坐标 → `sw_pos(x, y, zoom)`（sw_pos 为 definitions 定义的合规参数化 transform）
 * 注意：绝不能把 zoom 当作 transform 调用（旧版 `at left, zoom(1.2)` 属非法语法）。
 */
function serializeAt(at: AtClause, zoom?: number): string {
  if (at.kind === 'slot') {
    if (zoom != null && zoom !== 1) return `${at.slotId}, sw_zoom(${zoom})`
    return at.slotId
  }
  return `sw_pos(${at.xpos}, ${at.ypos}, ${zoom ?? 1})`
}

/**
 * 将 resolvedStates 差分编译为 RpyNode[]（AST）。
 * 只发射相对上一行发生改变的指令，得到最小有状态场景图指令流。
 */
function compileToNodes(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  st: SymbolTable,
  scriptLabel: string,
  customTransitions: Set<string>,
): RpyNode[] {
  const nodes: RpyNode[] = []

  // ---- 标签符号表（供 menu 安全跳转与代码段收尾）----
  // 已定义标签 = 入口 label + 所有行携带的 delta.label
  const definedLabels = new Set<string>([scriptLabel])
  // 被引用标签 = 所有 choice 选项的 target_label
  const referencedLabels = new Set<string>()
  for (const d of deltas) {
    if (d.label?.trim()) definedLabels.add(d.label.trim())
    if (d.line_type === 'choice') {
      for (const c of d.choices ?? []) {
        const t = c.target_label?.trim()
        if (t) referencedLabels.add(t)
      }
    }
  }

  // 入口 label（Ren'Py 游戏起点）
  nodes.push({ kind: 'label', name: scriptLabel })
  let lastWasLabel = true // 刚推入 label，下一行 block 前不加空行
  // 当前代码段是否是被 jump 引用的分支段（决定段尾是否补 return 兜底，避免穿透进下一剧情块）
  let segmentReferenced = referencedLabels.has(scriptLabel)
  let segmentEndedTerminal = false

  let currentBgKey: string | null = null
  let currentBgm: string | null = null
  let currentAmbient: string | null = null
  let currentLayerFilter: string | null = null
  let currentChars = new Map<string, { exprId: string; at: AtClause; zorder: number; zoom?: number; transition?: string; effectsSig: string; effects?: MountedEffect[] }>()

  for (let i = 0; i < resolvedStates.length; i++) {
    const state = resolvedStates[i]
    const delta = deltas[i]
    const block: RpyNode[] = []

    // ---- 标签节点化：本行携带 label → 新开一个剧情块（label）----
    const lineLabel = delta.label?.trim()
    if (lineLabel) {
      // 收尾上一代码段：若为被引用的分支段且未以 return 收尾，补 return 避免穿透进下一剧情块
      if (i > 0 && segmentReferenced && !segmentEndedTerminal) {
        nodes.push({ kind: 'return' })
        lastWasLabel = false
        segmentEndedTerminal = true
      }
      if (i > 0 && !lastWasLabel) nodes.push({ kind: 'blank' })
      nodes.push({ kind: 'label', name: lineLabel })
      lastWasLabel = true
      segmentReferenced = referencedLabels.has(lineLabel)
      segmentEndedTerminal = false
    }

    // ---- 背景（资产变化 或 挂载特效变化 均重发 scene）----
    const newBg = state.background?.asset_id ?? null
    const newBgKey = newBg ? `${newBg}|${effectsSig(state.background?.effects)}` : null
    if (newBgKey !== currentBgKey) {
      currentBgKey = newBgKey
      if (newBg) {
        const transition = resolveTransition(state.background?.transition, customTransitions)
        const bgFx = mountEffects(state.background?.effects)
        if (st.bgDefs.get(newBg)) {
          block.push({ kind: 'scene', image: newBg, transition, effectAt: bgFx.at, effectWith: bgFx.withCall })
        } else {
          block.push({ kind: 'comment', text: `[缺失背景] ${newBg}` })
        }
      }
    }

    // ---- 全屏滤镜（Filters）：本行任意启用的 filter 型特效 → 整层 matrixcolor ----
    // 与背景/立绘解耦，独立做「变化才发射」的 diff，关闭时回退 IdentityMatrix()。
    const lineFilterExpr = collectLineFilterExpr(state)
    if (lineFilterExpr !== currentLayerFilter) {
      currentLayerFilter = lineFilterExpr
      block.push({ kind: 'layer_filter', expr: lineFilterExpr })
    }

    // ---- 角色：先收集本行完整状态 ----
    const newChars = new Map<string, { exprId: string; at: AtClause; zorder: number; zoom?: number; transition?: string; effectsSig: string; effects?: MountedEffect[] }>()
    for (const [charId, c] of Object.entries(state.characters)) {
      // 同一角色身份（char_id）在 Ren'Py 中对应同一标签；多实例退化为单标签（Ren'Py 同 tag 不可同屏多份）
      const role = c.char_id ?? charId
      newChars.set(role, {
        exprId: c.sprite_id,
        at: resolveAt(c, st),
        zorder: computeZorder(c, st),
        zoom: c.scale != null && c.scale !== 1 ? round3(c.scale) : undefined,
        transition: resolveTransition(c.transition, customTransitions),
        effectsSig: effectsSig(c.effects),
        effects: c.effects,
      })
    }
    // 退场（上一行有、本行无）
    for (const charId of currentChars.keys()) {
      if (!newChars.has(charId)) block.push({ kind: 'hide', charId })
    }
    // 出场 / 更新
    for (const [charId, nc] of newChars) {
      const prev = currentChars.get(charId)
      const changed =
        !prev ||
        prev.exprId !== nc.exprId ||
        !atEqual(prev.at, nc.at) ||
        prev.zorder !== nc.zorder ||
        prev.zoom !== nc.zoom ||
        prev.transition !== nc.transition ||
        prev.effectsSig !== nc.effectsSig
      if (changed) {
        const exprAsset = st.charDefs[charId]?.expressions.get(nc.exprId)
        const fx = mountEffects(nc.effects)
        if (exprAsset) {
          block.push({
            kind: 'show',
            charId,
            exprId: nc.exprId,
            at: nc.at,
            zorder: nc.zorder,
            zoom: nc.zoom,
            transition: nc.transition,
            effectAt: fx.at,
            effectWith: fx.withCall,
          })
        } else {
          block.push({ kind: 'comment', text: `[缺失立绘] ${charId} ${nc.exprId}` })
        }
      }
    }

    // ---- BGM（music 通道）----
    const newBgm = state.audio.bgm?.asset_id ?? null
    if (newBgm !== currentBgm) {
      currentBgm = newBgm
      if (newBgm) {
        const asset = st.audioDefs.get(newBgm)
        if (asset) {
          const fadein = state.audio.bgm?.fade_in_ms ? state.audio.bgm.fade_in_ms / 1000 : undefined
          block.push({ kind: 'playMusic', file: `audio/${asset.fileName}`, fadein, loop: state.audio.bgm?.loop ?? false })
        }
      } else {
        block.push({ kind: 'stopMusic', fadeout: 1.0 })
      }
    }

    // ---- 环境音（自定义 ambient 通道，A-2）----
    const newAmbient = state.audio.ambient?.asset_id ?? null
    if (newAmbient !== currentAmbient) {
      currentAmbient = newAmbient
      if (newAmbient) {
        const asset = st.audioDefs.get(newAmbient)
        if (asset) {
          const fadein = state.audio.ambient?.fade_in_ms ? state.audio.ambient.fade_in_ms / 1000 : undefined
          block.push({ kind: 'playAmbient', file: `audio/${asset.fileName}`, fadein, loop: true })
        }
      } else {
        block.push({ kind: 'stopAmbient' })
      }
    }

    // ---- 音效（一次性，不进继承链）----
    for (const seId of state.audio.se) {
      const asset = st.audioDefs.get(seId)
      if (asset) block.push({ kind: 'playSound', file: `audio/${asset.fileName}` })
    }

    // ---- 语音（一次性）----
    if (state.audio.voice) {
      const asset = st.audioDefs.get(state.audio.voice)
      if (asset) block.push({ kind: 'voice', file: `audio/${asset.fileName}` })
    }

    // ---- 变量操作（本行触发，在台词前发射 `$ <python 表达式>`）----
    for (const op of delta.variableOps ?? []) {
      const expr = varOpExpr(op)
      if (expr) block.push({ kind: 'python', expr })
    }

    // ---- 选择支行：导出为 Ren'Py `menu:` 块（含选项内联变量操作与跳转）----
    if (delta.line_type === 'choice') {
      const choices = (delta.choices ?? []).map((c: ChoiceItem) => {
        const t = (c.target_label ?? '').trim()
        const ops = (c.ops ?? [])
          .map((op) => varOpExpr(op))
          .filter((e): e is string => !!e)
        return {
          text: c.text,
          target_label: t,
          condition: c.condition?.trim() ? c.condition.trim() : undefined,
          ops,
          // 空目标（顺序继续）恒合法；非空目标需命中已定义标签，否则序列化时安全降级
          defined: t ? definedLabels.has(t) : true,
        }
      })
      if (choices.length > 0) {
        block.push({
          kind: 'menu',
          prompt: delta.prompt?.trim() ? delta.prompt.trim() : undefined,
          choices,
        })
      }
    } else {
      // ---- 台词 ----
      if (state.speaker) {
        const resolved = st.speakerToCharId[state.speaker] ?? state.speaker
        block.push({ kind: 'say', speaker: resolved, text: state.dialogue })
      } else {
        block.push({ kind: 'say', text: state.dialogue })
      }
    }

    block.push({ kind: 'comment', text: delta.line_id })

    if (block.length > 0) {
      if (!lastWasLabel) nodes.push({ kind: 'blank' })
      nodes.push(...block)
      lastWasLabel = false
      // 仅当本段最后一条语句是 return 时才算已收尾（menu/say/comment 均非终态）
      segmentEndedTerminal = block[block.length - 1].kind === 'return'
    }
    currentChars = newChars
  }

  // 收尾最后一段：被引用的分支段若未 return，补 return 兜底（铁律4：绝不穿透/崩溃）
  if (segmentReferenced && !segmentEndedTerminal) {
    nodes.push({ kind: 'return' })
    segmentEndedTerminal = true
  }
  // 文件级收尾：确保脚本以 return 结束，杜绝末尾标签穿透导致的未定义行为
  if (nodes.length === 0 || nodes[nodes.length - 1].kind !== 'return') {
    nodes.push({ kind: 'return' })
  }
  return nodes
}

/** 将 AST 序列化为 Ren'Py 文本（label 居左，其余缩进 4 空格） */
function serializeNodes(nodes: RpyNode[], totalLines: number): string {
  const lines: string[] = []
  lines.push('# Generated by ScriptWeaver')
  lines.push(`# ${totalLines} lines`)
  lines.push('')

  for (const n of nodes) {
    if (n.kind === 'label') {
      lines.push(`label ${n.name}:`)
      continue
    }
    if (n.kind === 'blank') {
      lines.push('')
      continue
    }
    lines.push('    ' + serializeNode(n))
  }
  return lines.join('\n') + '\n'
}

function serializeNode(n: RpyNode): string {
  switch (n.kind) {
    case 'scene': {
      const atStr = n.effectAt && n.effectAt.length ? ` at ${n.effectAt.join(', ')}` : ''
      if (n.transition) return `scene ${n.image}${atStr} with ${n.transition}`
      if (n.effectWith) return `scene ${n.image}${atStr} with ${n.effectWith}`
      return `scene ${n.image}${atStr}`
    }
    case 'show': {
      const at = serializeAt(n.at, n.zoom)
      const atStr = n.effectAt && n.effectAt.length ? `${at}, ${n.effectAt.join(', ')}` : at
      if (n.transition) return `show ${n.charId} ${n.exprId} at ${atStr} zorder ${n.zorder} with ${n.transition}`
      if (n.effectWith) return `show ${n.charId} ${n.exprId} at ${atStr} zorder ${n.zorder} with ${n.effectWith}`
      return `show ${n.charId} ${n.exprId} at ${atStr} zorder ${n.zorder}`
    }
    case 'hide':
      return `hide ${n.charId}`
    case 'layer_filter':
      // 整层颜色矩阵：expr 为 null 表示关闭滤镜（复位为单位矩阵，避免残留染色）
      return n.expr == null
        ? 'show layer master:\n    matrixcolor IdentityMatrix()'
        : `show layer master:\n    matrixcolor ${n.expr}`
    case 'playMusic': {
      let s = `play music "${n.file}"`
      if (n.loop) s += ' loop'
      if (n.fadein) s += ` fadein ${n.fadein}`
      return s
    }
    case 'playAmbient': {
      let s = `play ambient "${n.file}"`
      if (n.loop) s += ' loop'
      if (n.fadein) s += ` fadein ${n.fadein}`
      return s
    }
    case 'playSound':
      return `play sound "${n.file}"`
    case 'voice':
      return `voice "${n.file}"`
    case 'stopMusic':
      return `stop music fadeout ${n.fadeout}`
    case 'stopAmbient':
      return 'stop ambient'
    case 'say': {
      const text = escapeDialogue(n.text)
      return n.speaker ? `${n.speaker} "${text}"` : `"${text}"`
    }
    case 'comment':
      return `# ${n.text}`
    case 'python':
      return `$ ${n.expr}`
    case 'menu': {
      // menu: 4 空格基础缩进；选项 8 空格、选项内语句 12 空格。
      // 选项内联变量操作（ops）紧跟选项下方并正确缩进；随后按 target_label 决定
      // jump / pass / 安全降级（铁律4：未定义目标绝不发射 jump，改为注释 + return）。
      const inner: string[] = []
      if (n.prompt) inner.push(`        "${escapeDialogue(n.prompt)}"`)
      for (const ch of n.choices) {
        const cond = ch.condition ? ` if ${ch.condition}` : ''
        inner.push(`        "${escapeDialogue(ch.text)}"${cond}:`)
        const ops = ch.ops ?? []
        for (const op of ops) inner.push(`            $ ${op}`)
        if (ch.target_label) {
          if (ch.defined) {
            inner.push(`            jump ${ch.target_label}`)
          } else {
            // 铁律4：未定义/缺失的跳转目标绝不发射 jump（避免 NameError），降级为注释 + return
            inner.push(`            # [ScriptWeaver] 跳转目标 "${ch.target_label}" 未定义，已安全降级`)
            inner.push(`            return`)
          }
        } else if (ops.length === 0) {
          // 无跳转目标且无内联操作：落到 menu 之后继续，用 pass 占位保证语法完整
          inner.push(`            pass`)
        }
      }
      return `menu:\n${inner.join('\n')}`
    }
    case 'return':
      return 'return'
    default:
      return ''
  }
}

// ======================= script.rpy 导出 =======================

export function exportToRpy(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
  positionSlots?: PositionSlot[],
  scriptLabel: string = 'start',
): string {
  if (deltas.length === 0) return '# No content\n'
  const st = buildSymbolTable(deltas, characterConfigs, assets, positionSlots)
  const custom = collectUsedTransitions(deltas, resolvedStates)
  const nodes = compileToNodes(deltas, resolvedStates, st, scriptLabel, custom)
  return serializeNodes(nodes, deltas.length)
}

// ======================= definitions.rpy 导出 =======================

export function exportDefinitionsRpy(
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
  positionSlots?: PositionSlot[],
  st?: SymbolTable,
  usedTransitions?: Set<string>,
  variables: GlobalVariable[] = [],
): string {
  const symbol = st ?? buildSymbolTable([], characterConfigs, assets, positionSlots)
  const lines: string[] = []

  lines.push('# ============================================================')
  lines.push('# ScriptWeaver - definitions.rpy')
  lines.push('# 通道注册 / 角色声明 / image 声明 / position transforms')
  lines.push('# ============================================================')
  lines.push('')

  // ---- 环境音专用通道（A-2 四通道隔离）----
  lines.push('# ---- 音频通道注册 ----')
  lines.push('init python:')
  lines.push('    renpy.music.register_channel("ambient", "sfx", loop=True, stop_on_mute=False)')
  lines.push('')

  // ---- Position Transforms（从槽位配置生成，非硬编码）----
  const slots = positionSlots ?? []
  if (slots.length > 0) {
    lines.push('# ---- Position Transforms ----')
    for (const slot of slots) {
      lines.push(`transform ${slot.id}:`)
      lines.push(`    xalign ${round3(slot.anchor_x)}`)
      lines.push(`    yalign ${round3(slot.anchor_y)}`)
      lines.push('')
    }
  }

  // ---- 自由微调通用 Transform（承载自由坐标 + 缩放，A-4）----
  // 注意：sw_pos / sw_zoom 均为合规 transform，可被 `at` / `with` 合法引用。
  lines.push('# ---- 位置/缩放通用 Transform ----')
  lines.push('transform sw_pos(xpos, ypos, zoom=1.0):')
  lines.push('    xpos xpos')
  lines.push('    ypos ypos')
  lines.push('    xanchor 0.5')
  lines.push('    yanchor 1.0')
  lines.push('    zoom zoom')
  lines.push('')
  lines.push('transform sw_zoom(z):')
  lines.push('    zoom z')
  lines.push('')

  // ---- 自定义特效 Transform 库（保证 with <name> 必定存在，编译无忧）----
  lines.push('# ---- 自定义特效 Transform 库 ----')
  // 命中下列已知特效名时给出更贴近的动效；其余一律安全淡入兜底。
  const effectDefs: Record<string, string[]> = {
    flash: ['alpha 0.0', 'linear 0.15 alpha 1.0'],
    vpunch: ['ypos 0.0', 'linear 0.06 ypos -0.02', 'linear 0.06 ypos 0.0'],
    hpunch: ['xpos 0.0', 'linear 0.06 xpos -0.02', 'linear 0.06 xpos 0.0'],
    shake: ['xpos 0.0', 'linear 0.05 xpos -0.015', 'linear 0.05 xpos 0.015', 'linear 0.05 xpos 0.0'],
    zoomin: ['zoom 1.3', 'linear 0.4 zoom 1.0'],
    zoomout: ['zoom 0.7', 'linear 0.4 zoom 1.0'],
    push: ['xpos 1.0', 'linear 0.4 xpos 0.0'],
    slide: ['xpos 1.0', 'linear 0.4 xpos 0.0'],
    rotate: ['rotate 0', 'linear 0.4 rotate 8', 'linear 0.4 rotate 0'],
  }
  for (const id of usedTransitions ?? []) {
    lines.push(`transform ${id}:`)
    const body = effectDefs[id]
    if (body) {
      for (const l of body) lines.push(`    ${l}`)
    } else {
      // 安全兜底：淡入（alpha 为合法 ATL 属性，任何情况下都能编译运行）
      lines.push('    alpha 0.0')
      lines.push('    linear 0.3 alpha 1.0')
    }
    lines.push('')
  }

  // ---- Character 声明 ----
  if (characterConfigs.length > 0) {
    lines.push('# ---- Character 声明 ----')
    for (const char of characterConfigs) {
      const colorArg = char.dialogueColor ? `, color="${char.dialogueColor}"` : ''
      lines.push(`define ${char.charId} = Character("${char.displayName}"${colorArg})`)
    }
    lines.push('')
  }

  // ---- 全局变量声明（default）----
  if (variables.length > 0) {
    lines.push('# ---- 全局变量声明（default）----')
    for (const v of variables) {
      lines.push(`default ${v.name} = ${pyLiteral(v.initial)}`)
    }
    lines.push('')
  }

  // ---- 立绘 Image 声明（路径对齐 C 阶段 images/sprite，真实扩展名）----
  const spriteAssets = assets.filter((a) => a.type === 'sprite')
  if (characterConfigs.length > 0 && spriteAssets.length > 0) {
    lines.push('# ---- 立绘 Image 声明 ----')
    for (const char of characterConfigs) {
      for (const expr of char.expressions) {
        const asset = symbol.charDefs[char.charId]?.expressions.get(expr.id)
        if (!asset) {
          lines.push(`# [缺失] image ${char.charId} ${expr.id} = "images/sprite/missing.png"`)
          continue
        }
        lines.push(`image ${char.charId} ${expr.id} = "images/sprite/${asset.fileName}"`)
      }
    }
    lines.push('')
  }

  // ---- 背景 Image 声明（路径对齐 C 阶段 images/background，真实扩展名）----
  const bgAssets = assets.filter((a) => a.type === 'background')
  if (bgAssets.length > 0) {
    lines.push('# ---- 背景 Image 声明 ----')
    for (const bg of bgAssets) {
      lines.push(`image ${bg.id} = "images/background/${bg.fileName}"`)
    }
    lines.push('')
  }

  // ---- 音频引用说明 ----
  lines.push('# ---- 音频引用说明 ----')
  lines.push('# 音频通过 play 语句按路径引用 game/audio/ 目录下的素材，无需 image 声明。')
  lines.push('# 导出项目包时，音频文件会被自动复制进 game/audio/。')
  lines.push('')

  return lines.join('\n')
}

// ======================= RpyBundle（A-6） =======================

function buildAssetRefs(assets: AssetItem[]): AssetRef[] {
  const seen = new Set<string>()
  const refs: AssetRef[] = []
  for (const a of assets) {
    if (a.type !== 'background' && a.type !== 'sprite' && a.type !== 'audio') continue
    if (seen.has(a.id)) continue
    seen.add(a.id)
    const sub = subdirFor(a.type)
    const sourceRelativePath = a.relativePath && a.relativePath.trim()
      ? a.relativePath.replace(/\\/g, '/')
      : `assets/${sub}/${a.fileName}`
    refs.push({
      assetId: a.id,
      type: a.type,
      fileName: a.fileName,
      sourceRelativePath,
      exportRelPath: `${sub}/${a.fileName}`,
    })
  }
  return refs
}

export function buildBundle(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
  positionSlots?: PositionSlot[],
  scriptLabel: string = 'start',
  variables: GlobalVariable[] = [],
): RpyBundle {
  const st = buildSymbolTable(deltas, characterConfigs, assets, positionSlots)
  const used = collectUsedTransitions(deltas, resolvedStates)
  const script = deltas.length === 0 ? '# No content\n' : serializeNodes(compileToNodes(deltas, resolvedStates, st, scriptLabel, used), deltas.length)
  const definitions = exportDefinitionsRpy(characterConfigs, assets, positionSlots, st, used, variables)
  const transforms = exportTransformsRpy(resolvedStates)
  const assetRefs = buildAssetRefs(assets)
  return { script, definitions, transforms, assets: assetRefs }
}

// ======================= I/O 边界（A-9 Web 降级 / Electron） =======================

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/x-renpy;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 浏览器兜底：仅下载 script.rpy + definitions.rpy 两个文本（素材需手动放入 game/） */
export function downloadRpy(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
  positionSlots?: PositionSlot[],
  scriptFilename: string = 'script.rpy',
  variables: GlobalVariable[] = [],
): void {
  // 校验（沿用全量校验，含 voice/se）
  const lookups = resolveLookups(deltas, characterConfigs, assets)
  const errors = validateExportNames(deltas, lookups, characterConfigs, assets)
  if (errors.length > 0) {
    alert(formatValidationErrors(errors))
    return
  }
  const label = scriptFilename.replace(/\.rpy$/i, '') || 'start'
  const script = exportToRpy(deltas, resolvedStates, characterConfigs, assets, positionSlots, label)
  const used = collectUsedTransitions(deltas, resolvedStates)
  const defs = exportDefinitionsRpy(characterConfigs, assets, positionSlots, undefined, used, variables)
  const transforms = exportTransformsRpy(resolvedStates)
  triggerDownload(script, scriptFilename)
  triggerDownload(defs, 'definitions.rpy')
  triggerDownload(transforms, 'transforms.rpy')
}

export interface ExportResult {
  mode: 'electron' | 'web'
  success: boolean
  message: string
}

/**
 * 一键导出 Ren'Py 项目包（A-6~A-9）：
 *  - 先全量校验，失败则中止（非破坏）。
 *  - Electron 环境：调用 fs:exportRenpy，由主进程建 game/ 目录并磁盘直拷素材。
 *  - Web 环境（无 electronAPI）：回落 Blob 双文件下载。
 */
export async function exportProjectPackage(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
  positionSlots?: PositionSlot[],
  scriptLabel: string = 'start',
  variables: GlobalVariable[] = [],
): Promise<ExportResult> {
  const lookups = resolveLookups(deltas, characterConfigs, assets)
  const errors = validateExportNames(deltas, lookups, characterConfigs, assets)
  if (errors.length > 0) {
    alert(formatValidationErrors(errors))
    return { mode: 'web', success: false, message: '校验失败，已中止导出。' }
  }

  const bundle = buildBundle(deltas, resolvedStates, characterConfigs, assets, positionSlots, scriptLabel, variables)

  const api = (window as unknown as { electronAPI?: {
    exportRenpy?: (b: RpyBundle) => Promise<{ success: boolean; gameDir?: string; copied?: number; error?: string }>
  } }).electronAPI

  if (api?.exportRenpy) {
    try {
      const res = await api.exportRenpy(bundle)
      if (res?.success) {
        return {
          mode: 'electron',
          success: true,
          message: `已导出到 ${res.gameDir}（复制 ${res.copied ?? 0} 个素材）`,
        }
      }
      return { mode: 'electron', success: false, message: `导出失败：${res?.error ?? '未知错误'}` }
    } catch (err) {
      return { mode: 'electron', success: false, message: `导出异常：${(err as Error).message}` }
    }
  }

  // Web 降级
  triggerDownload(bundle.script, `${scriptLabel}.rpy`)
  triggerDownload(bundle.definitions, 'definitions.rpy')
  if (bundle.transforms) triggerDownload(bundle.transforms, 'transforms.rpy')
  return {
    mode: 'web',
    success: true,
    message: '已通过浏览器下载 script.rpy、definitions.rpy 与 transforms.rpy（素材需手动放入 game/ 目录）。',
  }
}
