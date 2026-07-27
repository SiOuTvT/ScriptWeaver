/**
 * ScriptWeaver 脚本 DSL —— 时间轴 LineDelta[] 与可读脚本文本之间的双向通道。
 *
 * 设计目标：
 *  1. 人类可读、可手写编辑（程序员也能高效写作，方便 diff / 协作 / 版本管理）。
 *  2. 与 Ren'Py 语义贴近，但比 .rpy 更紧凑、去掉 Python 缩进包袱（用 `indent` 层级表达）。
 *  3. 往返一致（round-trip）：serialize -> parse -> serialize 必须幂等（忽略空白差异）。
 *
 * 顶层为语句流，每条语句带一个 `indent` 层级（默认 0）：
 *  - dialogue / narration：本行台词（speaker 为空即旁白）
 *  - choice：选择支行（prompt 可选）
 *  - option：递归属于最近一个 choice，可带 `-> label` / `if <cond>` / `ops:`
 *  - bg / show / hide / clear：背景与立绘
 *  - bgm / ambient / se / voice / stop：音频
 *  - set：变量操作
 *  - label：剧情块锚点
 *  - effect：舞台级滤镜（stageEffects）
 *
 * 字段行语法：`key: value`（行内键值）或 `key=value`（紧凑写法，二者等价）。
 */

import { genInstanceId } from './assetHelpers'
import type {
  LineDelta,
  CharacterDelta,
  ChoiceItem,
  VariableOperation,
  MountedEffect,
  AudioTrackInstruction,
  TrackValue,
} from '@/core/types'

// ---------------- 类型与工具 ----------------

export interface ScriptStatement {
  /** 语句种类 */
  kind:
    | 'dialogue'
    | 'narration'
    | 'choice'
    | 'option'
    | 'bg'
    | 'show'
    | 'hide'
    | 'clear'
    | 'bgm'
    | 'ambient'
    | 'se'
    | 'voice'
    | 'stop'
    | 'set'
    | 'label'
    | 'effect'
  /** 缩进层级（菜单选项深一层） */
  indent: number
  /** 主文本（台词 / 旁白 / 选项文本 / prompt 等） */
  text?: string
  /** 结构化字段（key -> 值） */
  fields: Record<string, string>
  /** option 的内联变量操作（ops: a+=1; b=true） */
  opsText?: string
  /** option 的跳转目标 */
  jump?: string
  /** option 的显示门槛 */
  condition?: string
}

export interface ParsedScript {
  lines: LineDelta[]
}

// ---------------- 序列化（LineDelta[] -> DSL 文本） ----------------

const ACTION_TO_VERB: Record<string, string> = {
  show: 'show',
  hide: 'hide',
  __CLEAR__: 'clear',
}

function serializeEffect(e: MountedEffect): string {
  const params = Object.entries(e.params ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
  return `${e.effectId}${params ? `(${params})` : ''}`
}

function serializeChar(c: CharacterDelta): string {
  const parts: string[] = []
  if (c.char_id) parts.push(`char=${c.char_id}`)
  if (c.sprite_id && c.sprite_id !== 'default') parts.push(`expr=${c.sprite_id}`)
  if (c.asset_id) parts.push(`asset=${c.asset_id}`)
  if (c.position_slot && c.position_slot !== 'center') parts.push(`slot=${c.position_slot}`)
  if (typeof c.pos_x === 'number') parts.push(`x=${c.pos_x.toFixed(3)}`)
  if (typeof c.pos_y === 'number') parts.push(`y=${c.pos_y.toFixed(3)}`)
  if (typeof c.scale === 'number' && c.scale !== 1) parts.push(`scale=${c.scale}`)
  if (c.transition) parts.push(`with=${c.transition}`)
  if (c.effects?.length) {
    parts.push(`fx=${c.effects.filter((e) => e.enabled !== false).map(serializeEffect).join('|')}`)
  }
  return parts.join(' ')
}

function serializeTrack(key: string, tv: TrackValue): string | null {
  if (tv === null) return null // 继承，不输出
  if (tv === '__CLEAR__') return `${key} clear`
  const t = tv as AudioTrackInstruction
  const parts: string[] = [`asset=${t.asset_id}`, `vol=${t.volume.toFixed(2)}`]
  if (t.loop) parts.push('loop=true')
  if (t.fade_in_ms) parts.push(`fin=${t.fade_in_ms}`)
  if (t.fade_out_ms) parts.push(`fout=${t.fade_out_ms}`)
  if (t.offset_ms) parts.push(`off=${t.offset_ms}`)
  return `${key} ${parts.join(' ')}`
}

function serializeOp(op: VariableOperation): string {
  const v = op.value
  switch (op.op) {
    case 'set':
      return `${op.varName}=${v === true ? 'true' : v === false ? 'false' : v}`
    case 'add':
      return `${op.varName}+=${v}`
    case 'subtract':
      return `${op.varName}-=${v}`
    case 'toggle':
      return `${op.varName}=!${op.varName}`
    default:
      return `${op.varName}=${String(v)}`
  }
}

function serializeOps(ops?: VariableOperation[]): string | null {
  if (!ops?.length) return null
  return ops.map(serializeOp).join('; ')
}

/** 单条 LineDelta -> 语句序列（dialogue/narration 句 + 若干修饰句） */
function serializeLine(line: LineDelta, index: number): ScriptStatement[] {
  const stmts: ScriptStatement[] = []

  // 旁白 vs 对话
  if (line.line_type === 'choice') {
    stmts.push({ kind: 'choice', indent: 0, text: line.prompt, fields: {} })
  } else if (!line.speaker) {
    stmts.push({ kind: 'narration', indent: 0, text: line.dialogue, fields: {} })
  } else {
    stmts.push({ kind: 'dialogue', indent: 0, text: line.dialogue, fields: { speaker: line.speaker } })
  }

  // 选择支选项（递归缩进）
  if (line.line_type === 'choice' && line.choices?.length) {
    for (const ch of line.choices) {
      const opt: ScriptStatement = {
        kind: 'option',
        indent: 1,
        text: ch.text,
        fields: {},
      }
      if (ch.target_label) opt.jump = ch.target_label
      if (ch.condition) opt.condition = ch.condition
      const ops = serializeOps(ch.ops)
      if (ops) opt.opsText = ops
      stmts.push(opt)
    }
  }

  // 背景
  if (line.background) {
    const b = line.background
    const parts: string[] = [`asset=${b.asset_id}`]
    if (b.transition) parts.push(`with=${b.transition}`)
    if (b.effects?.length) parts.push(`fx=${b.effects.filter((e) => e.enabled !== false).map(serializeEffect).join('|')}`)
    stmts.push({ kind: 'bg', indent: 0, fields: { value: parts.join(' ') } })
  }

  // 立绘集合
  for (const instId of Object.keys(line.characters ?? {})) {
    const c = line.characters[instId]
    const verb = ACTION_TO_VERB[c.action] ?? 'show'
    stmts.push({ kind: verb as any, indent: 0, fields: { value: serializeChar(c) } })
  }

  // 音频
  const bgm = serializeTrack('bgm', line.audio.bgm)
  if (bgm) stmts.push({ kind: 'bgm', indent: 0, fields: { value: bgm.replace(/^bgm /, '') } })
  const amb = serializeTrack('ambient', line.audio.ambient)
  if (amb) stmts.push({ kind: 'ambient', indent: 0, fields: { value: amb.replace(/^ambient /, '') } })
  if (line.audio.se?.length) {
    stmts.push({ kind: 'se', indent: 0, fields: { value: line.audio.se.join(' ') } })
  }
  if (line.audio.voice) {
    const parts = [`asset=${line.audio.voice}`]
    if (line.audio.voice_offset_ms) parts.push(`off=${line.audio.voice_offset_ms}`)
    stmts.push({ kind: 'voice', indent: 0, fields: { value: parts.join(' ') } })
  }

  // 舞台级滤镜
  if (line.stageEffects?.length) {
    stmts.push({
      kind: 'effect',
      indent: 0,
      fields: { value: line.stageEffects.filter((e) => e.enabled !== false).map(serializeEffect).join('|') },
    })
  }

  // 变量操作
  const lineOps = serializeOps(line.variableOps)
  if (lineOps) stmts.push({ kind: 'set', indent: 0, fields: { value: lineOps } })

  // 剧情块标签
  if (line.label) stmts.push({ kind: 'label', indent: 0, fields: { value: line.label } })

  return stmts
}

function renderStmt(s: ScriptStatement): string {
  const pad = '  '.repeat(s.indent)
  const f = (k: string, v: string) => `${k}=${v}`
  switch (s.kind) {
    case 'dialogue':
      return `${pad}dialogue "${esc(s.text ?? '')}" speaker=${esc(s.fields.speaker ?? '')}`
    case 'narration':
      return `${pad}narration "${esc(s.text ?? '')}"`
    case 'choice':
      return s.text ? `${pad}choice "${esc(s.text)}"` : `${pad}choice`
    case 'option': {
      let line = `${pad}option "${esc(s.text ?? '')}"`
      if (s.jump) line += ` -> ${s.jump}`
      if (s.condition) line += ` if ${s.condition}`
      if (s.opsText) line += ` ops: ${s.opsText}`
      return line
    }
    case 'bg':
      return `${pad}bg ${s.fields.value ?? ''}`
    case 'show':
      return `${pad}show ${s.fields.value ?? ''}`
    case 'hide':
      return `${pad}hide ${s.fields.value ?? ''}`
    case 'clear':
      return `${pad}clear ${s.fields.value ?? ''}`
    case 'bgm':
      return `${pad}bgm ${s.fields.value ?? ''}`
    case 'ambient':
      return `${pad}ambient ${s.fields.value ?? ''}`
    case 'se':
      return `${pad}se ${s.fields.value ?? ''}`
    case 'voice':
      return `${pad}voice ${s.fields.value ?? ''}`
    case 'stop':
      return `${pad}stop ${s.fields.value ?? ''}`
    case 'set':
      return `${pad}set ${s.fields.value ?? ''}`
    case 'effect':
      return `${pad}effect ${s.fields.value ?? ''}`
    case 'label':
      return `${pad}label ${s.fields.value ?? ''}`
    default:
      return ''
  }
}

function esc(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
function unesc(str: string): string {
  return str.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

/** 将整个剧本序列化为 DSL 文本 */
export function serializeScript(lines: LineDelta[]): string {
  const out: string[] = []
  lines.forEach((line, i) => {
    const stmts = serializeLine(line, i)
    stmts.forEach((s) => out.push(renderStmt(s)))
  })
  return out.join('\n')
}

// ---------------- 解析（DSL 文本 -> LineDelta[]） ----------------

interface PendingLine {
  line: LineDelta
  choiceStack: ChoiceItem[]
}

function blankLine(): LineDelta {
  return {
    line_id: genInstanceId('L'),
    speaker: null,
    dialogue: '',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
    line_type: 'dialogue',
  }
}

function parseFields(s: string): Record<string, string> {
  const f: Record<string, string> = {}
  // 简单 key=value 解析（值可能含空格，但 key 不含空格与 =）
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)=("(?:[^"\\]|\\.)*"|[^"\s][^\s]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = unesc(v.slice(1, -1))
    f[m[1]] = v
  }
  return f
}

function parseEffects(raw: string): MountedEffect[] {
  if (!raw) return []
  return raw.split('|').map((seg, i) => {
    const m = seg.match(/^([^(]+)(?:\((.*)\))?$/)
    const effectId = m?.[1] ?? seg
    const params: Record<string, number> = {}
    if (m?.[2]) {
      m[2].split(',').forEach((p) => {
        const [k, v] = p.split('=')
        if (k && v !== undefined) params[k.trim()] = Number(v)
      })
    }
    return { uid: `fx_${i}`, effectId, params, enabled: true }
  })
}

function parseOpText(raw: string): VariableOperation[] {
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((expr, i): VariableOperation => {
      const setM = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/)
      if (setM) {
        const name = setM[1]
        const val = setM[2].trim()
        if (val === 'true') return { varName: name, op: 'set', value: true }
        if (val === 'false') return { varName: name, op: 'set', value: false }
        if (val === `!${name}`) return { varName: name, op: 'toggle' }
        const num = Number(val)
        if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(val)) return { varName: name, op: 'set', value: num }
        return { varName: name, op: 'set', value: num }
      }
      const addM = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\+=\s*(-?\d+(?:\.\d+)?)$/)
      if (addM) return { varName: addM[1], op: 'add', value: Number(addM[2]) }
      const subM = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*-=\s*(-?\d+(?:\.\d+)?)$/)
      if (subM) return { varName: subM[1], op: 'subtract', value: Number(subM[2]) }
      // 兜底
      return { varName: expr, op: 'set', value: 0 }
    })
}

function buildTrack(key: string, raw: string): TrackValue {
  if (raw === 'clear') return '__CLEAR__'
  const f = parseFields(raw)
  const t: AudioTrackInstruction = {
    asset_id: f.asset ?? '',
    volume: f.vol !== undefined ? Number(f.vol) : 1,
    loop: f.loop === 'true' || f.loop === '' || f.loop === 'loop',
  }
  if (f.fin) t.fade_in_ms = Number(f.fin)
  if (f.fout) t.fade_out_ms = Number(f.fout)
  if (f.off) t.offset_ms = Number(f.off)
  return t
}

function parseChar(raw: string): CharacterDelta {
  const f = parseFields(raw)
  const c: CharacterDelta = {
    sprite_id: f.expr ?? 'default',
    position_slot: f.slot ?? 'center',
    action: 'show',
  }
  if (f.char) c.char_id = f.char
  if (f.asset) c.asset_id = f.asset
  if (f.x !== undefined) c.pos_x = Number(f.x)
  if (f.y !== undefined) c.pos_y = Number(f.y)
  if (f.scale !== undefined) c.scale = Number(f.scale)
  if (f.with) c.transition = f.with
  if (f.fx) c.effects = parseEffects(f.fx)
  return c
}

/** 解析 DSL 文本为 LineDelta[] */
export function parseScript(text: string): ParsedScript {
  const lines = text.split('\n')
  const result: LineDelta[] = []
  let cur: PendingLine | null = null

  const flush = () => {
    if (cur) {
      result.push(cur.line)
      cur = null
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue

    const indent = line.length - line.trimStart().length
    const body = line.trim()
    const head = body.split(/\s+/)[0]
    const rest = body.slice(head.length).trim()

    switch (head) {
      case 'dialogue': {
        flush()
        const f = parseFields(rest)
        const l = blankLine()
        l.dialogue = unesc((rest.match(/"((?:[^"\\]|\\.)*)"/)?.[1]) ?? '')
        l.speaker = f.speaker ? unesc(f.speaker) : null
        cur = { line: l, choiceStack: [] }
        break
      }
      case 'narration': {
        flush()
        const l = blankLine()
        l.dialogue = unesc((rest.match(/"((?:[^"\\]|\\.)*)"/)?.[1]) ?? '')
        l.speaker = null
        cur = { line: l, choiceStack: [] }
        break
      }
      case 'choice': {
        flush()
        const l = blankLine()
        l.line_type = 'choice'
        l.choices = []
        const m = rest.match(/"((?:[^"\\]|\\.)*)"/)
        if (m) l.prompt = unesc(m[1])
        cur = { line: l, choiceStack: [] }
        break
      }
      case 'option': {
        if (!cur) break
        const textM = rest.match(/"((?:[^"\\]|\\.)*)"/)
        const ch: ChoiceItem = {
          uid: `ch_${cur.choiceStack.length}`,
          text: textM ? unesc(textM[1]) : '',
          target_label: '',
        }
        // 解析 -> label / if cond / ops:
        const jumpM = rest.match(/->\s*([a-zA-Z_][a-zA-Z0-9_]*)/)
        if (jumpM) ch.target_label = jumpM[1]
        const ifM = rest.match(/if\s+(.+?)(?=\s+ops:|$)/)
        if (ifM) ch.condition = ifM[1].trim()
        const opsM = rest.match(/ops:\s*(.+)$/)
        if (opsM) ch.ops = parseOpText(opsM[1].trim())
        cur.line.choices = cur.line.choices ?? []
        cur.line.choices.push(ch)
        cur.choiceStack.push(ch)
        break
      }
      case 'bg': {
        if (!cur) break
        const f = parseFields(rest)
        const b = { asset_id: f.asset ?? '' }
        if (f.with) (b as any).transition = f.with
        if (f.fx) (b as any).effects = parseEffects(f.fx)
        cur.line.background = b as any
        break
      }
      case 'show':
      case 'hide':
      case 'clear': {
        if (!cur) break
        const c = parseChar(rest)
        c.action = head === 'show' ? 'show' : head === 'hide' ? 'hide' : '__CLEAR__'
        const instId = c.char_id ? genInstanceId(c.char_id) : genInstanceId('char')
        cur.line.characters[instId] = c
        break
      }
      case 'bgm':
        if (cur) cur.line.audio.bgm = buildTrack('bgm', rest)
        break
      case 'ambient':
        if (cur) cur.line.audio.ambient = buildTrack('ambient', rest)
        break
      case 'se':
        if (cur) cur.line.audio.se = rest.split(/\s+/).filter(Boolean)
        break
      case 'voice': {
        if (!cur) break
        const f = parseFields(rest)
        cur.line.audio.voice = f.asset ?? null
        if (f.off) cur.line.audio.voice_offset_ms = Number(f.off)
        break
      }
      case 'stop':
        if (cur) cur.line.audio.voice = null
        break
      case 'set':
        if (cur) cur.line.variableOps = parseOpText(rest)
        break
      case 'effect':
        if (cur) cur.line.stageEffects = parseEffects(rest)
        break
      case 'label':
        if (cur) cur.line.label = rest.trim()
        else {
          // 独立 label 行（无对话主体）：生成一个带 label 的空对话行以挂载锚点
          const l = blankLine()
          l.label = rest.trim()
          result.push(l)
        }
        break
      default:
        // 未知语句：忽略（保留向后兼容弹性）
        break
    }
  }
  flush()
  return { lines: result }
}
