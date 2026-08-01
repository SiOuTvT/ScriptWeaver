/**
 * Ren'Py 工程导入器（重写版）
 * 全量解析 .rpy 文件：label / dialogue / menu / choice / variable / scene / show / play music / play sound / image 定义
 * 扫描 game 目录下真实图片与音频文件，与脚本引用做匹配。
 */

import type { LineDelta, CharacterConfig, ChoiceItem, VariableOperation, CharacterDelta } from '@/core/types'
import {
  type AtlState,
  parseAtlLine,
  atlToPlacement,
  alignToSlot,
  applyBuiltinPosition,
  parseTransformCall,
  RENPY_BUILTIN_POSITIONS,
} from './renpyAtl'

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface RpyImportAsset {
  /** sw-asset 内使用的 id */
  id: string
  /** Ren'Py 脚本中的引用名（如 "bg_park", "eileen_happy"） */
  refName: string
  /** 文件系统中发现的真实文件名 */
  fileName: string
  /** 相对于 game 目录的路径 */
  relativePath: string
  /** 资产类型 */
  kind: 'image' | 'audio'
  /** 图片用途（立绘 sprite / 背景 background） */
  usage?: 'background' | 'sprite'
  /** 音频子分类 */
  audioCategory?: 'bgm' | 'ambient' | 'se' | 'voice'
  /** 文件大小（字节） */
  sizeBytes: number
  /** 图片尺寸 */
  width?: number
  height?: number
}

export interface RpyImportResult {
  deltas: LineDelta[]
  characters: CharacterConfig[]
  variables: { name: string; value: string }[]
  warnings: string[]
  lineCount: number
  charCount: number
  varCount: number
  /** 扫描到的图片资产 */
  imageAssets: RpyImportAsset[]
  /** 扫描到的音频资产 */
  audioAssets: RpyImportAsset[]
  imageCount: number
  audioCount: number
}

/** 文件系统 API 暴露的接口 */
interface FsApi {
  readdir(path: string): Promise<string[]>
  readFile(path: string, encoding?: string): Promise<string>
  stat(path: string): Promise<{ size: number; isDir: boolean } | null>
}

/** 脚本中引用的图片：refName 是脚本内变量名（如 tp1），path 是 image 声明中的真实路径（如 images/cg/tp1.png） */
export interface RpyImageRef {
  refName: string
  path?: string
  /** 素材用途：被 scene 引用 → background，被 show 引用 → sprite */
  usage?: 'background' | 'sprite'
}

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const emptyAudio = { bgm: null as null, ambient: null as null, se: [] as string[], voice: null as string | null }
const noBG = null
const noChars = {} as Record<string, never>
const now = new Date().toISOString()

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a', '.opus', '.wma'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function createCharConfig(charId: string, displayName?: string): CharacterConfig {
  return {
    charId,
    displayName: displayName || charId,
    dialogueColor: '#61afef',
    expressions: [],
    createdAt: now,
    updatedAt: now,
  }
}

function baseDelta(lineId: number): { line_id: string; speaker: string | null; dialogue: string } {
  return {
    line_id: `imp_${lineId}`,
    speaker: null,
    dialogue: '',
  }
}

/** 从路径提取文件名（不含扩展名） */
function stem(p: string): string {
  const base = p.replace(/^.*[\\/]/, '')
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** 推导音频分类 */
function classifyAudio(fileName: string): string {
  const id = fileName.toLowerCase()
  if (id.includes('_bgm_') || id.includes('bgm_') || id.includes('_bgm') || id.includes('music')) return 'bgm'
  if (id.includes('_ambient_') || id.includes('ambient_') || id.includes('_amb')) return 'ambient'
  if (id.includes('_se_') || id.includes('se_') || id.includes('_sfx') || id.includes('_sound')) return 'se'
  if (id.includes('_voice_') || id.includes('voice_') || id.includes('_vo_')) return 'voice'
  return 'bgm' // 默认作为 BGM
}

/** 标准化 Ren'Py 脚本里引用的路径：去掉引号和扩展名 */
function normalizeRef(raw: string): string {
  let s = raw.trim()
  // 去掉引号
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  // 去掉扩展名（Ren'Py 中 image/image bg 引用通常不带扩展名，但 play music 带）
  const dot = s.lastIndexOf('.')
  if (dot > 0) s = s.slice(0, dot)
  return s
}

/** 剥离 Ren'Py 音频控制标签，如 "<from 0.8 to 4.5>zoulu.wav" → "zoulu.wav" */
function stripAudioCtl(raw: string): string {
  let s = raw.trim()
  const m = s.match(/^(?:<[^>]*>)+/)
  if (m) s = s.slice(m[0].length)
  return s
}

/** 数值夹取到 [a, b] */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// ═══════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════

/**
 * 两阶段解析 Ren'Py 脚本：
 * 阶段 1 — 收集 define Character / define 单字符名 / image 声明 / default，建立变量名→显示名映射
 * 阶段 2 — 解析 label / menu / scene / show / play / 对白，用映射修正角色名
 *
 * 对白语法兼容：
 *   1. dialogue_var "文本"         — Ren'Py 最常用写法（无引号的变量名说话人）
 *   2. "角色名" "文本"            — 带引号的说话人（直接使用显示名）
 *   3. "文本"                     — 旁白
 */
/** transform 定义：名称 → 解析后的 ATL 属性状态（保留 Ren'Py 原生语义，含像素/比例之分） */
export interface RpyTransformDefs {
  [name: string]: AtlState
}

/**
 * 归一化 with 子句的过渡名。
 * Ren'Py 允许 `with dissolve`（内建实例）与 `with Dissolve(0.5)`（工厂调用）两种写法，
 * 统一取基名小写（Dissolve(0.5) → dissolve），使预览与导出都能识别；
 * `with None` 表示显式不使用过渡，返回空。
 */
function normalizeTransitionName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const base = raw.trim().replace(/\(.*$/, '').trim()
  if (!base || base === 'None') return undefined
  return base.toLowerCase()
}

/** scene / show 语句解析结果（对齐 Ren'Py 官方语法各子句） */
export interface RpyDisplayStatement {
  /** 图片名：首元素为标签(tag)，其余为属性(attributes)，如 ['eileen','happy'] */
  name: string[]
  /** as 子句指定的实例别名，用于同角色多立绘并存 */
  alias?: string
  /** at 子句的 transform 列表（支持 at a, b 链式） */
  at: string[]
  /** behind 子句的标签列表 */
  behind: string[]
  /** onlayer 子句指定的图层 */
  onlayer?: string
  /** zorder 子句的层叠序号 */
  zorder?: number
  /** with 子句的过渡（已归一化） */
  transition?: string
}

/**
 * 解析 scene / show 语句的完整子句结构，严格对齐 Ren'Py 官方语法：
 *
 *   show <image name…> [as <alias>] [at <transform>[, <transform>…]]
 *        [onlayer <layer>] [behind <tag>[, <tag>…]] [zorder <n>] [with <transition>]
 *
 * 其中 <image name> 由「标签 + 若干属性」构成（show eileen happy → 标签 eileen、属性 happy），
 * 这是过去按空格截断只取首词、导致表情与站位全部丢失的根源。
 */
export function parseDisplayStatement(body: string): RpyDisplayStatement {
  const out: RpyDisplayStatement = { name: [], at: [], behind: [] }

  // done：as / onlayer / zorder 的取值已读完，在遇到下一个关键字前丢弃多余词
  type Section = 'name' | 'alias' | 'at' | 'behind' | 'onlayer' | 'zorder' | 'with' | 'done'
  let section: Section = 'name'
  const withParts: string[] = []
  for (const token of tokenizeStatement(body)) {
    if (section !== 'with') {
      switch (token) {
        case 'as': section = 'alias'; continue
        case 'at': section = 'at'; continue
        case 'behind': section = 'behind'; continue
        case 'onlayer': section = 'onlayer'; continue
        case 'zorder': section = 'zorder'; continue
        case 'with': section = 'with'; continue
        default: break
      }
    }
    switch (section) {
      case 'name': out.name.push(token); break
      // as / onlayer / zorder 各只取紧随其后的一个词，之后不再吸收 image name
      case 'alias': out.alias = token; section = 'done'; break
      case 'onlayer': out.onlayer = token; section = 'done'; break
      case 'zorder': out.zorder = Number(token); section = 'done'; break
      case 'at': out.at.push(token); break
      case 'behind': out.behind.push(token); break
      // 多个过渡可用逗号并列（with dissolve, vpunch），取第一个作为主过渡
      case 'with': withParts.push(token); break
      case 'done': break
    }
  }
  if (withParts.length) out.transition = normalizeTransitionName(withParts[0])
  return out
}

/**
 * 语句分词：以空白与顶层逗号切分，但保持括号与引号内的内容完整。
 * 必须如此才能正确处理 `at Position(xpos=0.5, ypos=1.0)`、`with Dissolve(0.5)`
 * 这类调用式——按空格硬切会把它们拆成互不相干的碎片。
 */
function tokenizeStatement(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let quote: string | null = null
  const push = () => { if (cur) { out.push(cur); cur = '' } }
  for (const ch of input.trim()) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (depth === 0 && (/\s/.test(ch) || ch === ',')) { push(); continue }
    cur += ch
  }
  push()
  return out
}

/** 项目基准分辨率（Ren'Py gui.init(W, H)，默认 1920x1080） */
export interface RpyScreenSize {
  width: number
  height: number
}

/**
 * 解析 Ren'Py 脚本源码。
 * @param source             .rpy 文件内容
 * @param globalCharMap      其他文件收集到的「变量名 → 显示名」全局映射（集中声明跨文件引用）。
 * @param globalTransforms   其他文件收集到的 transform 定义（show X at f 跨文件引用）。
 * @param screen             项目基准分辨率（gui.init）。
 */
export function parseRpy(
  source: string,
  globalCharMap?: Map<string, string>,
  globalTransforms?: RpyTransformDefs,
  screen?: RpyScreenSize,
): {
  deltas: LineDelta[]
  characters: CharacterConfig[]
  variables: { name: string; value: string }[]
  warnings: string[]
  referencedImages: RpyImageRef[]
  referencedAudio: { path: string; type: 'bgm' | 'ambient' | 'se' | 'voice' }[]
  transforms: RpyTransformDefs
  screen: RpyScreenSize
} {
  const lines = source.split(/\r?\n/)
  const warnings: string[] = []
  const characters: CharacterConfig[] = []
  const variableDefs: { name: string; value: string }[] = []
  const charSet = new Set<string>()
  const varSet = new Set<string>()
  const refImages = new Map<string, RpyImageRef>() // key = refName
  const refAudio: { path: string; type: 'bgm' | 'ambient' | 'se' | 'voice' }[] = []

  /** 基准分辨率：gui.init(W, H)，默认 Ren'Py 1920x1080 */
  let screenW = screen?.width ?? 1920
  let screenH = screen?.height ?? 1080
  /** 预扫描的 transform 定义（顶层 transform NAME: 块） */
  const transformDefs: RpyTransformDefs = { ...(globalTransforms ?? {}) }

  // ═══ 预扫描：gui.init 分辨率 + transform 定义（供 show X at f / show X: 应用位置缩放） ═══
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t || t.startsWith('#') || t.startsWith('//')) continue
    const gi = t.match(/gui\.init\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/)
    if (gi) {
      screenW = Number(gi[1])
      screenH = Number(gi[2])
      continue
    }
    // transform 定义。支持带形参的写法（transform slide(dx=100):），形参默认值不参与静态求值，
    // 取块内可识别的属性即可；名称需剥掉参数表，否则 show X at slide 会查不到定义。
    const tf = t.match(/^transform\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:\s*$/)
    if (tf) {
      const name = tf[1]
      const attrs: AtlState = {}
      let j = i + 1
      while (j < lines.length) {
        const al = lines[j].trim()
        if (!al) { j++; continue }
        if (al.startsWith('#')) { j++; continue }
        if (!(lines[j].startsWith(' ') || lines[j].startsWith('\t'))) break
        // 逐行按 Ren'Py 语义累加：后写的属性覆盖先写的，
        // 这正是 `xalign 0.5` 之后再 `xpos 350` 只改位置、锚点保持 0.5 的关键
        parseAtlLine(al, attrs)
        j++
      }
      transformDefs[name] = attrs
    }
  }

  /** 变量名 → { charId, displayName } 映射 */
  const varToDisplayName = new Map<string, string>()
  // 先铺入全局映射（来自其他文件的集中声明），保证跨文件引用可解析
  if (globalCharMap) {
    for (const [k, v] of globalCharMap) {
      varToDisplayName.set(k, v)
      if (!charSet.has(k)) {
        charSet.add(k)
        characters.push(createCharConfig(k, v))
      }
    }
  }

  // ═══ 阶段 1：收集角色定义 ═══
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    // define varName = Character("显示名", ...) / Character('显示名', ...) / DynamicCharacter("显示名", ...)
    // 双引号与单引号统一处理：变量名与显示名彻底解耦
    const defineChar = line.match(/^define\s+([a-zA-Z_]\w*)\s*=\s*(?:Character|DynamicCharacter)\s*\(\s*["']([^"']*)["']/)
    if (defineChar) {
      const varName = defineChar[1]
      const displayName = defineChar[2] || varName
      varToDisplayName.set(varName, displayName)
      if (!charSet.has(varName)) {
        charSet.add(varName)
        characters.push(createCharConfig(varName, displayName))
      }
      continue
    }

    // define varName = "Name" (短角色定义，简化写法——直接把字符串作为显示名)
    const defineSimpleChar = line.match(/^define\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*$/)
    if (defineSimpleChar) {
      const varName = defineSimpleChar[1]
      const displayName = defineSimpleChar[2]
      varToDisplayName.set(varName, displayName)
      if (!charSet.has(varName)) {
        charSet.add(varName)
        characters.push(createCharConfig(varName, displayName))
      }
    }

    // image refName = "path/to/file.png"（收集变量名 + 真实路径，便于按文件路径精准归类素材）
    const imageDef = line.match(/^image\s+(.+?)\s*=\s*"([^"]+)"/)
    if (imageDef) {
      upsertImageRef(imageDef[1].trim(), { path: imageDef[2] })
      continue
    }

    // image refName = 'path/to/file.png'（单引号写法）
    const imageDefSQ = line.match(/^image\s+(.+?)\s*=\s*'([^']+)'/)
    if (imageDefSQ) {
      upsertImageRef(imageDefSQ[1].trim(), { path: imageDefSQ[2] })
      continue
    }

    // default var = Character("显示名") / DynamicCharacter / '单引号'（Ren'Py 常用 default 定义角色）
    const defaultChar = line.match(/^default\s+([a-zA-Z_]\w*)\s*=\s*(?:Character|DynamicCharacter)\s*\(\s*["']([^"']*)["']/)
    if (defaultChar) {
      const varName = defaultChar[1]
      const displayName = defaultChar[2] || varName
      varToDisplayName.set(varName, displayName)
      if (!charSet.has(varName)) {
        charSet.add(varName)
        characters.push(createCharConfig(varName, displayName))
      }
      continue
    }

    // default var = "Name"（字符串变量，可视为角色显示名）
    const defaultSimpleChar = line.match(/^default\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*$/)
    if (defaultSimpleChar) {
      const varName = defaultSimpleChar[1]
      const displayName = defaultSimpleChar[2]
      varToDisplayName.set(varName, displayName)
      if (!charSet.has(varName)) {
        charSet.add(varName)
        characters.push(createCharConfig(varName, displayName))
      }
      continue
    }

    // default var = val（纯变量）
    const defaultVar = line.match(/^default\s+(\w+)\s*=\s*(.+)/)
    if (defaultVar) {
      addVar(defaultVar[1], defaultVar[2].trim())
    }
  }

  function addVar(name: string, value: string) {
    if (!varSet.has(name)) {
      varSet.add(name)
      variableDefs.push({ name, value })
    }
  }

  /**
   * 合并图片引用：image 声明提供真实路径，scene/show 提供用途。
   * 同一 refName 被多处引用时，保留已有 path、补全 usage。
   */
  function upsertImageRef(refName: string, patch: Partial<Pick<RpyImageRef, 'path' | 'usage'>>) {
    const cur = refImages.get(refName)
    if (!cur) {
      refImages.set(refName, { refName, ...patch })
    } else {
      refImages.set(refName, {
        refName,
        path: cur.path || patch.path,
        usage: cur.usage || patch.usage,
      })
    }
  }

  // ═══ 阶段 2：解析内容 ═══

  let lineId = 0
  const deltas: LineDelta[] = []
  let inMenu = false
  let menuChoices: ChoiceItem[] = []

  /**
   * 将「说话者标识」解析为 charId + displayName：
   * 1. 如果标识匹配已知变量名 → 使用对应的 charId + displayName
   * 2. 如果标识匹配已知角色的 displayName → 使用该角色的 charId + displayName
   * 3. 如果标识是纯英文字 ⚡ 变量名 → 创建新角色（charId = 标识, displayName = 标识）
   * 4. 其他 → 按 displayName 创建新角色
   */
  function resolveSpeaker(rawName: string): { charId: string; displayName: string } {
    const name = rawName.trim()
    if (!name) return { charId: '', displayName: '' }

    // 规则1: 精确匹配已知变量名
    if (varToDisplayName.has(name)) {
      return { charId: name, displayName: varToDisplayName.get(name)! }
    }

    // 规则2: 匹配已知角色的 displayName
    const byDisplay = characters.find(c => c.displayName === name)
    if (byDisplay) {
      return { charId: byDisplay.charId, displayName: byDisplay.displayName }
    }

    // 规则3: 纯英文/数字/下划线 → 视为变量名
    if (/^[a-zA-Z_]\w*$/.test(name)) {
      return { charId: name, displayName: name }
    }

    // 规则4: 带中文/其他字符 → 视为显示名
    return { charId: name, displayName: name }
  }

  function ensureChar(charId: string, displayName: string) {
    if (!charId) return
    if (!charSet.has(charId)) {
      charSet.add(charId)
      characters.push(createCharConfig(charId, displayName))
    }
    // 如果已有该 charId 但 displayName 为空/不同，补齐显示名
    const existing = characters.find(c => c.charId === charId)
    if (existing && (!existing.displayName || existing.displayName.trim() === '' || existing.displayName === charId)) {
      if (displayName && displayName !== charId) {
        existing.displayName = displayName
      }
    }
  }

  function emitDelta(delta: LineDelta) {
    deltas.push(delta)
  }

  /**
   * 舞台状态累积器：Ren'Py 的 scene/show/hide/play/label 是「瞬时舞台指令」，
   * 本身没有对白。若每条指令各自生成空对白 delta，剧本流会变成一堆空白隔断，
   * 而且背景/音频只在空白行上生效、到了真正的对白行就丢失。
   * 正确做法：把指令累积进 acc，遇到下一条「对白/选择支/变量操作」时合并成一个 beat。
   */
  type BgAcc = { asset_id: string; transition?: string; scale?: number; focus_x?: number; focus_y?: number }
  let accBackground: BgAcc | null = null
  let accCharacters: Record<string, CharacterDelta> = {}
  /**
   * 本 beat 内刚被 show 出来的立绘键。
   * Ren'Py 允许过渡独立成行（show a / show b / with dissolve），
   * 该 with 作用于此前累积的全部舞台变更，需要回填给这些条目。
   */
  let recentShowKeys: string[] = []
  /**
   * 本 beat 内被 hide / scene 移除的立绘键 → 其退场过渡。
   *
   * 这是「立绘退不下去」这个致命问题的修复核心：舞台状态是继承式归约的，
   * 每个 beat 只声明变化量，未提及的立绘会自动延续。因此仅仅从累积器里删掉
   * 是不够的——必须显式发出一条移除指令，否则被 hide 的立绘会永远留在台上，
   * 随剧情推进越堆越多，与引擎实际表现完全相反。
   */
  const pendingHides = new Map<string, string | undefined>()
  /** 上一个 beat 实际发出的在场立绘，供退场时取回它的位置与尺寸用于播放退场动画 */
  let lastEmitted: Record<string, CharacterDelta> = {}

  /** 记录一个立绘的退场（transition 为空表示瞬间移除） */
  function markHidden(key: string, transition?: string) {
    // 同一 beat 内 show 后又 hide：该立绘从未真正呈现过，无需退场帧
    if (recentShowKeys.includes(key) && !(key in lastEmitted)) return
    pendingHides.set(key, transition ?? pendingHides.get(key))
  }

  /** 汇总 at 子句里的全部变换，按书写顺序叠加（后者覆盖前者） */
  function collectAtl(names: string[]): AtlState {
    const atl: AtlState = {}
    for (const raw of names) {
      const name = raw.trim()
      if (!name) continue
      // 内建位置常量（left / truecenter / offscreenright …）
      if (applyBuiltinPosition(name, atl)) continue
      // 工程自定义 transform（已在预扫描阶段跨文件收集）
      const def = transformDefs[name]
      if (def) { Object.assign(atl, def); continue }
      // 调用式：Position(xpos=0.5) / Transform(zoom=0.8) / 自定义带参 transform
      if (parseTransformCall(name, atl)) continue
      // 其余（如定义在未随工程导入的文件里）静默忽略，不影响其它属性
    }
    return atl
  }

  /** 把 ATL 状态换算并写入立绘条目 */
  function applyCharacterAtl(entry: CharacterDelta, atl: AtlState) {
    const p = atlToPlacement(atl, screenW, screenH)
    // 允许略微超出画面：offscreenleft / offscreenright 等屏外站位本就在 0-1 之外
    if (p.pos_x !== undefined) {
      entry.pos_x = clamp(p.pos_x, -0.5, 1.5)
      entry.position_slot = alignToSlot(p.pos_x)
    }
    if (p.pos_y !== undefined) entry.pos_y = clamp(p.pos_y, -0.5, 1.5)
    if (p.anchor_x !== undefined) entry.anchor_x = p.anchor_x
    if (p.anchor_y !== undefined) entry.anchor_y = p.anchor_y
    // zoom 记为 Ren'Py 原生语义（相对原图像素），由渲染层按真实图片尺寸还原占屏比
    if (p.zoom !== undefined) entry.renpy_zoom = p.zoom
  }

  /** 把 ATL 状态换算并写入背景（推近画面 / 平移取景） */
  function applyBackgroundAtl(bg: BgAcc, atl: AtlState) {
    const p = atlToPlacement(atl, screenW, screenH)
    if (p.zoom !== undefined) bg.scale = p.zoom
    if (p.pos_x !== undefined) bg.focus_x = clamp(p.pos_x, 0, 1)
    if (p.pos_y !== undefined) bg.focus_y = clamp(p.pos_y, 0, 1)
  }
  let accAudio: { bgm: TrackValue; ambient: TrackValue; se: string[]; voice: string | null } = {
    bgm: null, ambient: null, se: [], voice: null,
  }
  let accLabel: string | null = null

  /**
   * 把累积的舞台状态并入目标 delta（对白/选择支等）。
   * Ren'Py 语义：背景/立绘/bgm 是「持续态」，会保留到被显式改变（scene 清除立绘、hide 移除、下一次 play music）；
   * 而标签/音效(se)/语音(voice)是「瞬态」，仅附着到紧随其后的那条对白 beat，消费后即清空。
   */
  function flushAcc(t: LineDelta) {
    if (accBackground) t.background = { ...accBackground }

    // 在场立绘 + 本 beat 的退场指令。
    // 退场必须显式发出：舞台按「继承 + 变化量」归约，只从累积器删掉不会让立绘消失。
    const chars: Record<string, CharacterDelta> = { ...accCharacters }
    for (const [key, tr] of pendingHides) {
      // 同一 beat 内先 hide 又 show（换装写法），以在场状态为准
      if (key in accCharacters) continue
      const prev = lastEmitted[key]
      chars[key] = tr
        ? {
            // 带过渡的退场需要保留原有立绘信息，舞台才能把这张图的退场动画播完
            ...(prev ?? { sprite_id: key, position_slot: 'center' }),
            action: 'hide',
            transition: tr,
          }
        : {
            sprite_id: prev?.sprite_id ?? key,
            char_id: prev?.char_id,
            position_slot: prev?.position_slot ?? 'center',
            action: '__CLEAR__',
          }
    }
    pendingHides.clear()
    if (Object.keys(chars).length) t.characters = chars
    lastEmitted = { ...accCharacters }

    // 过渡（with）是「瞬时事件」：只在发生切换的那一 beat 播放一次。
    // 背景与立绘本身是持续态、会延续到后续 beat，若不在此摘掉过渡标记，
    // 同一个 dissolve 会在之后每一行反复播放，比不播过渡更难受。
    // 已并入 t 的对象保持原样（含过渡），只重建累积器中的副本。
    if (accBackground?.transition) {
      const { transition: _bgConsumed, ...bgRest } = accBackground
      accBackground = bgRest
    }
    for (const key of Object.keys(accCharacters)) {
      if (accCharacters[key].transition) {
        const { transition: _consumed, ...rest } = accCharacters[key]
        accCharacters[key] = rest
      }
    }
    if (accLabel) t.label = accLabel
    if (accAudio.bgm || accAudio.ambient || accAudio.se.length || accAudio.voice) {
      t.audio = { bgm: accAudio.bgm, ambient: accAudio.ambient, se: accAudio.se, voice: accAudio.voice }
    }
    // 仅清空瞬态状态；持续态（背景/立绘/bgm）保留到被显式改变
    accLabel = null
    accAudio.se = []
    accAudio.voice = null
    // 「停止」是一次性指令：发出后转为静默态，否则会在后续每一行重复下达停止命令
    if (accAudio.bgm === '__CLEAR__') accAudio.bgm = null
    if (accAudio.ambient === '__CLEAR__') accAudio.ambient = null
    recentShowKeys = []
  }

  /**
   * 声音通道 → 编辑器音轨。
   * Ren'Py 内建 music / sound / voice 三个通道，工程可自行注册额外通道
   * （register_channel("ambient")），环境音类通道按名称归入环境音轨。
   */
  function channelToTrack(ch: string): 'bgm' | 'ambient' | 'se' | 'voice' | null {
    if (ch === 'music') return 'bgm'
    if (ch === 'sound' || ch === 'audio' || ch === 'sfx') return 'se'
    if (ch === 'voice') return 'voice'
    if (/ambient|atmo|env|bgs/i.test(ch)) return 'ambient'
    return null // movie 等非音频通道
  }

  /**
   * 解析音频语句的修饰参数（官方语法）：
   *   play music "x.ogg" fadein 1.0 fadeout 2.0 volume 0.5 noloop
   * 时长单位为秒，编辑器内部统一用毫秒。
   */
  function parseAudioOptions(s: string) {
    const fadeIn = s.match(/\bfadein\s+([\d.]+)/)
    const fadeOut = s.match(/\bfadeout\s+([\d.]+)/)
    const volume = s.match(/\bvolume\s+([\d.]+)/)
    const noloop = /\bnoloop\b/.test(s)
    return {
      fade_in_ms: fadeIn ? Math.round(Number(fadeIn[1]) * 1000) : undefined,
      fade_out_ms: fadeOut ? Math.round(Number(fadeOut[1]) * 1000) : undefined,
      volume: volume ? Number(volume[1]) : 1,
      loop: /\bloop\b/.test(s) ? true : noloop ? false : undefined,
    }
  }

  /**
   * 处理 play / queue / stop 三类音频语句。
   * 此前只认 `play music "…"` 与 `play sound "…"` 两种写法，
   * 导致 play voice、停止音乐、淡入淡出与音量参数全部丢失。
   */
  function handleAudioStatement(verb: string, channel: string, argsRaw: string) {
    const track = channelToTrack(channel)
    if (!track) return
    if (verb === 'stop') {
      // 停止是明确的舞台事件，必须还原，否则该静下来的地方音乐会一直响
      if (track === 'bgm') accAudio.bgm = '__CLEAR__'
      else if (track === 'ambient') accAudio.ambient = '__CLEAR__'
      return
    }
    // 文件参数支持单引号、双引号与列表写法 play music [ "a.ogg", "b.ogg" ]
    const files = [...argsRaw.matchAll(/"([^"]*)"|'([^']*)'/g)]
      .map((m) => stripAudioCtl(m[1] ?? m[2] ?? ''))
      .filter(Boolean)
    if (!files.length) return
    const opts = parseAudioOptions(argsRaw)

    if (track === 'se' || track === 'voice') {
      for (const p of files) refAudio.push({ path: p, type: track === 'se' ? 'se' : 'voice' })
      if (track === 'se') accAudio.se = [...accAudio.se, ...files]
      else accAudio.voice = files[0]
      return
    }
    // 常驻音轨：queue 是「排在当前曲目之后」，当前有曲目时不应抢占
    const existing = track === 'bgm' ? accAudio.bgm : accAudio.ambient
    if (verb === 'queue' && existing && existing !== '__CLEAR__') return
    const first = files[0]
    refAudio.push({ path: first, type: track === 'bgm' ? 'bgm' : 'ambient' })
    const instruction = {
      asset_id: first,
      volume: opts.volume,
      // 音乐默认循环，与 Ren'Py 一致；显式 noloop 则单次播放
      loop: opts.loop ?? true,
      ...(opts.fade_in_ms !== undefined ? { fade_in_ms: opts.fade_in_ms } : {}),
      ...(opts.fade_out_ms !== undefined ? { fade_out_ms: opts.fade_out_ms } : {}),
    }
    if (track === 'bgm') accAudio.bgm = instruction
    else accAudio.ambient = instruction
  }

  /** ATL / transform 属性行关键字（scene X: / show X: / transform X: 块内的 zoom/xpos/alpha 等属性） */
  const ATL_PROPS = /^(zoom|xzoom|yzoom|size|xpos|ypos|pos|xalign|yalign|align|anchor|xanchor|yanchor|truecenter|xoffset|yoffset|xcenter|ycenter|alpha|rotate|rotate_pad|transform_anchor|around|crop|additive|blend|ease|easein|easeout|linear|pause|time|repeat|block|parallel|choice|function|on|event|warp|matrixcolor|fit|matrixtransform|perspective|xrotate|yrotate|zrotate|gl_depth)\b/

  /**
   * 块状态机：
   * - 'atl'：scene X: / show X: 的 ATL 属性块。只跳过 ATL 属性行，遇到对白/指令立即退出，
   *          保证 label 块内同样缩进的对白（"    js1 \"你好\""）不被误吞；show 内联 ATL 同时收集位置缩放。
   * - 'skip'：transform / init python / screen / style 等块定义体，缩进行整体跳过。
   */
  let blockMode: 'none' | 'atl' | 'skip' = 'none'
  /**
   * 等待接收内联 ATL 属性的目标（show X: 的立绘条目 / scene X: 的背景）。
   * 块内属性与 at 子句共享同一份 ATL 状态，保证覆盖顺序与 Ren'Py 一致。
   */
  let pendingAtl: { state: AtlState; entry?: CharacterDelta; background?: BgAcc } | null = null
  /** 三引号多行字符串（_p("""…""") / define x = """…"""）状态 */
  let inTriple = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    // 三引号多行字符串：跳过直到闭合
    const tripleCount = (line.match(/"""|'''/g) || []).length
    if (inTriple) {
      if (tripleCount % 2 === 1) inTriple = false
      continue
    }
    if (tripleCount % 2 === 1) {
      inTriple = true
      continue
    }

    // skip 块（transform / init python / screen / style 属性体）：缩进行整体跳过
    if (blockMode === 'skip') {
      if (raw.startsWith(' ') || raw.startsWith('\t')) continue
      blockMode = 'none'
    }

    // atl 块（scene X: / show X:）：只跳过 ATL 属性行，show 内联 ATL 收集位置缩放
    if (blockMode === 'atl') {
      if (ATL_PROPS.test(line)) {
        if (pendingAtl && parseAtlLine(line, pendingAtl.state)) {
          if (pendingAtl.entry) applyCharacterAtl(pendingAtl.entry, pendingAtl.state)
          if (pendingAtl.background) applyBackgroundAtl(pendingAtl.background, pendingAtl.state)
        }
        continue
      }
      pendingAtl = null
      blockMode = 'none'
    }

    // ---- define 声明已在阶段 1 处理，跳过；define xxx = { 多行 dict 内容 → skip 整块 ----
    if (line.startsWith('define ')) {
      if (line.trimEnd().endsWith('{')) blockMode = 'skip'
      continue
    }

    // ---- default 变量已收集，跳过 ----
    if (line.startsWith('default ')) continue

    // ---- image 声明已收集，跳过 ----
    if (line.startsWith('image ')) continue

    // ---- label（仅记录标签，并入下一条对白 beat；避免空标签行）----
    const labelM = line.match(/^label\s+(\S+)\s*:/)
    if (labelM) {
      accLabel = labelM[1]
      continue
    }

    // ---- menu: 选择支块（携带当前舞台状态）----
    if (line === 'menu:') {
      inMenu = true
      menuChoices = []
      lineId++
      const d: LineDelta = {
        ...baseDelta(lineId),
        line_type: 'choice',
        choices: [],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      }
      flushAcc(d)
      emitDelta(d)
      continue
    }

    if (inMenu) {
      const choiceM = line.match(/^"([^"]*)"\s*:\s*$/)
      const jumpM = line.match(/^\s*jump\s+(\w+)/)
      if (choiceM) {
        const choice: ChoiceItem = {
          uid: `imp_choice_${lineId}_${menuChoices.length}`,
          text: choiceM[1],
          target_label: '',
        }
        menuChoices.push(choice)
        const last = deltas[deltas.length - 1]
        if (last && last.line_type === 'choice') {
          last.choices = [...menuChoices]
        }
        continue
      }
      if (jumpM) {
        if (menuChoices.length > 0) {
          menuChoices[menuChoices.length - 1].target_label = jumpM[1]
          const last = deltas[deltas.length - 1]
          if (last && last.line_type === 'choice') {
            last.choices = [...menuChoices]
          }
        }
        inMenu = false
        continue
      }
      // menu 内的变量操作
      const varOpM = line.match(/^\$\s*(\w+)\s*([+\-])\s*=\s*(\S+)/)
      if (varOpM) {
        const op: VariableOperation = {
          varName: varOpM[1],
          op: varOpM[2] === '+' ? 'add' : 'subtract',
          value: Number(varOpM[3]) || 0,
        }
        if (menuChoices.length > 0) {
          const idx = menuChoices.length - 1
          menuChoices[idx].ops = [...(menuChoices[idx].ops || []), op]
          const last = deltas[deltas.length - 1]
          if (last && last.line_type === 'choice') {
            last.choices = [...menuChoices]
          }
        }
        continue
      }
      // menu 内 set var = value
      const assignM = line.match(/^\$\s*(\w+)\s*=\s*(.+)/)
      if (assignM) {
        const op: VariableOperation = {
          varName: assignM[1],
          op: 'set',
          value: Number(assignM[2]) || 0,
        }
        if (menuChoices.length > 0) {
          const idx = menuChoices.length - 1
          menuChoices[idx].ops = [...(menuChoices[idx].ops || []), op]
          const last = deltas[deltas.length - 1]
          if (last && last.line_type === 'choice') {
            last.choices = [...menuChoices]
          }
        }
        continue
      }
      continue
    }

    // ---- $ python 变量操作 ----
    const scriptVar = line.match(/^\$\s*(\w+)\s*([+\-])\s*=\s*(\S+)/)
    if (scriptVar) {
      const op: VariableOperation = {
        varName: scriptVar[1],
        op: scriptVar[2] === '+' ? 'add' : 'subtract',
        value: Number(scriptVar[3]) || 0,
      }
      addVar(scriptVar[1], scriptVar[3] || '0')
      lineId++
      const d: LineDelta = {
        ...baseDelta(lineId),
        variableOps: [op],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      }
      flushAcc(d)
      emitDelta(d)
      continue
    }
    const scriptAssign = line.match(/^\$\s*(\w+)\s*=\s*(.+)/)
    if (scriptAssign) {
      const op: VariableOperation = {
        varName: scriptAssign[1],
        op: 'set',
        value: isNaN(Number(scriptAssign[2])) ? 0 : Number(scriptAssign[2]),
      }
      addVar(scriptAssign[1], scriptAssign[2].trim())
      lineId++
      const d: LineDelta = {
        ...baseDelta(lineId),
        variableOps: [op],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      }
      flushAcc(d)
      emitDelta(d)
      continue
    }

    // ---- 块定义（transform / screen / style / init python / layeredimage 等以冒号结尾的块）→ skip 整块 ----
    if (line.endsWith(':') && !line.startsWith('label') && !line.startsWith('menu')
      && !line.startsWith('scene') && !line.startsWith('show')
      && !/^[a-zA-Z_]\w*\s+"[^"]*"\s*$/.test(line)) {
      blockMode = 'skip'
      continue
    }

    // ---- scene (背景) ----
    if (/^scene(\s|:|$)/.test(line)) {
      const isBlock = line.endsWith(':')
      const st = parseDisplayStatement(line.replace(/^scene\b\s*/, '').replace(/:\s*$/, ''))
      // scene 清空当前图层的全部立绘（Ren'Py 语义）。
      // 若 scene 自带过渡，被清掉的立绘应随整屏一起过渡消失，而非瞬间抹掉。
      for (const key of Object.keys(accCharacters)) markHidden(key, st.transition)
      accCharacters = {}
      recentShowKeys = []
      // 背景图片名同样可由「标签 + 属性」构成（scene bg room），需完整保留才能匹配到素材
      const bgName = st.name.join(' ')
      if (bgName) {
        upsertImageRef(bgName, { usage: 'background' })
        accBackground = { asset_id: bgName }
        // scene bg room with fade：过渡此前被正则整段丢弃，导致导入后所有转场消失
        if (st.transition) accBackground.transition = st.transition
        // scene 同样支持 at 与内联 ATL（推近画面：scene bg: zoom 2.0）
        const atl = collectAtl(st.at)
        applyBackgroundAtl(accBackground, atl)
        if (isBlock) {
          blockMode = 'atl'
          pendingAtl = { state: atl, background: accBackground }
        }
      } else if (isBlock) {
        blockMode = 'atl'
      }
      continue
    }

    // ---- show (显示立绘) ----
    if (/^show(\s|:|$)/.test(line)) {
      const isBlock = line.endsWith(':')
      const st = parseDisplayStatement(line.replace(/^show\b\s*/, '').replace(/:\s*$/, ''))
      const tag = st.name[0]
      // show screen / show layer / show expression 不是立绘语句，不能当角色处理
      if (!tag || tag === 'screen' || tag === 'layer' || tag === 'expression') {
        if (isBlock) blockMode = 'skip'
        continue
      }
      // 完整图片名（标签 + 属性）既是素材匹配键，也承载表情信息：
      // show eileen happy → "eileen happy" → 匹配 eileen_happy.png / eileen happy.png
      const fullName = st.name.join(' ')
      upsertImageRef(fullName, { usage: 'sprite' })
      const resolved = resolveSpeaker(tag)
      const charId = resolved.charId || tag
      // Ren'Py 以标签(tag)标识在场立绘，同标签再次 show 即替换；
      // as 别名则让同一角色的多个实例并存
      const charKey = st.alias || charId
      ensureChar(charId, resolved.displayName || tag)

      // 同标签重复 show 属于「换表情/换姿势」，是替换而非新增，不产生退场
      const entry: CharacterDelta = {
        sprite_id: fullName,
        char_id: charId,
        position_slot: 'center',
        action: 'show',
      }
      if (st.transition) entry.transition = st.transition

      // at 子句：内建位置（left/right/truecenter…）、工程自定义 transform、
      // 以及 Position(...)/Transform(...) 调用式，都要还原。
      // 支持 at a, b 链式，后者覆盖前者，与 Ren'Py 的 transform 叠加顺序一致。
      const atl = collectAtl(st.at)
      // 同一角色换装时若本次未给出新位置，沿用它当前的站位，
      // 避免「show a at left」之后一句「show a happy」把人瞬移回画面中央
      const prevEntry = accCharacters[charKey]
      if (prevEntry) {
        entry.pos_x = prevEntry.pos_x
        entry.pos_y = prevEntry.pos_y
        entry.anchor_x = prevEntry.anchor_x
        entry.anchor_y = prevEntry.anchor_y
        entry.renpy_zoom = prevEntry.renpy_zoom
        entry.scale = prevEntry.scale
        entry.position_slot = prevEntry.position_slot
      }
      applyCharacterAtl(entry, atl)

      if (isBlock) {
        blockMode = 'atl'
        // show X: 内联 ATL → 块内属性继续写入同一份 ATL 状态并即时生效，
        // 与 at 子句共享覆盖顺序（后写的赢），完全对齐 Ren'Py
        pendingAtl = { state: atl, entry }
      }
      accCharacters[charKey] = entry
      if (!recentShowKeys.includes(charKey)) recentShowKeys.push(charKey)
      continue
    }

    // ---- hide (隐藏立绘) ----
    if (/^hide(\s|:|$)/.test(line)) {
      const st = parseDisplayStatement(line.replace(/^hide\b\s*/, '').replace(/:\s*$/, ''))
      const tag = st.name[0]
      if (tag) {
        if (tag === 'screen' || tag === 'layer') continue
        const resolved = resolveSpeaker(tag)
        // 按 show 时使用的键移除：别名实例优先，其次角色 ID，最后回退到标签本身。
        // 未登记为角色的立绘（道具图、特写图）同样必须能隐藏。
        for (const key of [st.alias, resolved.charId, tag]) {
          if (!key || !(key in accCharacters)) continue
          markHidden(key, st.transition)
          delete accCharacters[key]
          recentShowKeys = recentShowKeys.filter((k) => k !== key)
        }
      }
      continue
    }

    // ---- with (独立成行的过渡)：作用于此前累积、尚未并入 beat 的舞台变更 ----
    const withM = line.match(/^with\s+(.+)$/)
    if (withM) {
      const transition = normalizeTransitionName(withM[1])
      if (transition) {
        // Ren'Py 中 scene/show/hide 之后单独一行 with，等价于给这批变更整体加过渡
        if (accBackground && !accBackground.transition) accBackground.transition = transition
        for (const key of recentShowKeys) {
          const entry = accCharacters[key]
          if (entry && !entry.transition) entry.transition = transition
        }
        for (const [key, tr] of pendingHides) {
          if (!tr) pendingHides.set(key, transition)
        }
      }
      continue
    }

    // ---- 音频语句：play / queue / stop <channel> …（覆盖官方全部通道与修饰参数）----
    const audioM = line.match(/^(play|queue|stop)\s+([A-Za-z_]\w*)\b\s*(.*)$/)
    if (audioM) {
      handleAudioStatement(audioM[1], audioM[2], audioM[3])
      continue
    }

    // ---- voice "x"（对白配音的简写，等价于 play voice）----
    const voiceM = line.match(/^voice\s+(.+)$/)
    if (voiceM) {
      handleAudioStatement('play', 'voice', voiceM[1])
      continue
    }

    // ═══ 对白（三种模式） ═══

    // ---- 模式 1: varName "文本"（无引号说话人，Ren'Py 最常用写法） ----
    const dialogueVar = line.match(/^([a-zA-Z_]\w*)\s+"([^"]*)"\s*$/)
    if (dialogueVar) {
      const speakerVar = dialogueVar[1]
      const text = dialogueVar[2]
      const resolved = resolveSpeaker(speakerVar)
      ensureChar(resolved.charId, resolved.displayName)
      lineId++
      const d: LineDelta = {
        ...baseDelta(lineId),
        speaker: resolved.displayName || speakerVar,
        dialogue: text,
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      }
      flushAcc(d)
      emitDelta(d)
      continue
    }

    // ---- 模式 2: "角色名" "文本"（带引号的说话人）----
    const dialogueQuoted = line.match(/^"([^"]*)"\s+"([^"]*)"\s*$/)
    if (dialogueQuoted) {
      const speakerName = dialogueQuoted[1].trim()
      const text = dialogueQuoted[2]
      if (speakerName) {
        const resolved = resolveSpeaker(speakerName)
        ensureChar(resolved.charId, resolved.displayName)
        lineId++
        const d: LineDelta = {
          ...baseDelta(lineId),
          speaker: speakerName,
          dialogue: text,
          background: noBG,
          characters: noChars,
          audio: emptyAudio,
        }
        flushAcc(d)
        emitDelta(d)
      } else {
        // 纯对白（无说话人）→ 旁白
        lineId++
        const d2: LineDelta = {
          ...baseDelta(lineId),
          dialogue: text,
          background: noBG,
          characters: noChars,
          audio: emptyAudio,
        }
        flushAcc(d2)
        emitDelta(d2)
      }
      continue
    }

    // ---- 模式 3: "文本"（旁白/叙事） ----
    const narration = line.match(/^"([^"]*)"\s*$/)
    if (narration) {
      const text = narration[1]
      lineId++
      const d: LineDelta = {
        ...baseDelta(lineId),
        dialogue: text,
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      }
      flushAcc(d)
      emitDelta(d)
      continue
    }

    // ---- 续行对白（extend "文本"） ----
    const extendM = line.match(/^extend\s+"([^"]*)"\s*$/)
    if (extendM) {
      lineId++
      const d: LineDelta = {
        ...baseDelta(lineId),
        dialogue: extendM[1],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      }
      flushAcc(d)
      emitDelta(d)
      continue
    }

    // ---- python dict 闭合括号（} / }, 单独成行）→ 跳过 ----
    if (line === '}' || line === '},' || line === '} )') {
      continue
    }

    // ---- return / jump / call / stop / pause / with 等控制流（非内容行，跳过）----
    if (/^(return|jump\s+\w+|call\s+\w+|stop\s+\w+|pause|with\s+\w+|hide\s+\w+|window\s+|init\s+|transform\s+|screen\s+|style\s+|layeredimage\s+|nvl\s+|queue\s+)/.test(line)) {
      continue
    }

    // ---- 纯文本行（无标记的旁白/叙事） ----
    if (!line.startsWith('$') && !line.startsWith('label') && !line.startsWith('scene')
      && !line.startsWith('show') && !line.startsWith('hide') && !line.startsWith('play')
      && !line.startsWith('voice') && !line.startsWith('image') && !line.startsWith('call')
      && !line.startsWith('jump') && !line.startsWith('return') && !line.startsWith('window')
      && !line.startsWith('define') && !line.startsWith('default') && !line.startsWith('init')
      && !line.startsWith('transform') && !line.startsWith('screen') && !line.startsWith('style')) {
      lineId++
      const d: LineDelta = {
        ...baseDelta(lineId),
        dialogue: line,
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      }
      flushAcc(d)
      emitDelta(d)
      continue
    }

    // ---- 兜底：不可静默吞掉的行 → 警告 ----
    if (line && !line.startsWith('init') && !line.startsWith('transform') && !line.startsWith('screen')
      && !line.startsWith('style') && !line.startsWith('layeredimage')) {
      warnings.push(`未识别的行: ${line.slice(0, 60)}`)
    }
  }

  // 收尾：文件末尾仍有未落地的舞台状态（如结尾的 scene/show/play 没有后续对白）→ 生成末尾 beat
  if (accBackground || Object.keys(accCharacters).length || accAudio.bgm || accAudio.se.length || accAudio.voice) {
    lineId++
    const tail: LineDelta = {
      ...baseDelta(lineId),
      background: noBG,
      characters: noChars,
      audio: emptyAudio,
    }
    flushAcc(tail)
    emitDelta(tail)
  }

  // 确保所有角色都有 displayName
  for (const c of characters) {
    if (!c.displayName || c.displayName.trim() === '') {
      c.displayName = c.charId
    }
  }

  return {
    deltas,
    characters,
    variables: variableDefs,
    warnings,
    referencedImages: [...refImages.values()],
    referencedAudio: refAudio,
    transforms: transformDefs,
    screen: { width: screenW, height: screenH },
  }
}

// ═══════════════════════════════════════════
// 素材扫描 & 匹配
// ═══════════════════════════════════════════

/**
 * 扫描目录下的所有图片、音频与 .rpy 脚本文件（递归）。
 * 优先用 fs:stat 判断文件/目录（对含点目录名如 v1.2 也能正确递归）。
 */
export async function scanAssetFiles(dirPath: string): Promise<{
  images: { fileName: string; relativePath: string }[]
  audio: { fileName: string; relativePath: string }[]
  rpyFiles: { fileName: string; relativePath: string }[]
}> {
  const fsApi = (window as any).electronAPI?.fs as FsApi | undefined
  if (!fsApi) return { images: [], audio: [], rpyFiles: [] }
  const api = fsApi // narrowed for closure

  const images: { fileName: string; relativePath: string }[] = []
  const audio: { fileName: string; relativePath: string }[] = []
  const rpyFiles: { fileName: string; relativePath: string }[] = []

  async function walk(currentDir: string, relBase: string) {
    try {
      const entries = await api.readdir(currentDir)
      for (const entry of entries) {
        const full = currentDir + (currentDir.endsWith('/') || currentDir.endsWith('\\') ? '' : '\\') + entry
        const rel = relBase ? (relBase + '/' + entry) : entry
        const lower = entry.toLowerCase()

        // 优先用 stat 精准判断（目录名含点也能正确递归）
        let st: { size: number; isDir: boolean } | null = null
        if (api.stat) {
          try { st = await api.stat(full) } catch { /* 无权限 */ }
        }
        if (st) {
          if (st.isDir) {
            await walk(full, rel).catch(() => { /* 无权限则跳过 */ })
            continue
          }
          const ext = '.' + (lower.split('.').pop() || '')
          if (IMAGE_EXTENSIONS.has(ext)) images.push({ fileName: entry, relativePath: rel })
          else if (AUDIO_EXTENSIONS.has(ext)) audio.push({ fileName: entry, relativePath: rel })
          else if (ext === '.rpy' || ext === '.rpym') rpyFiles.push({ fileName: entry, relativePath: rel })
          continue
        }

        // 无 stat 能力时降级为后缀启发式
        if (entry.includes('.')) {
          const ext = '.' + (lower.split('.').pop() || '')
          if (IMAGE_EXTENSIONS.has(ext)) images.push({ fileName: entry, relativePath: rel })
          else if (AUDIO_EXTENSIONS.has(ext)) audio.push({ fileName: entry, relativePath: rel })
          else if (ext === '.rpy' || ext === '.rpym') rpyFiles.push({ fileName: entry, relativePath: rel })
        } else {
          // 可能是子目录，尝试递归
          await walk(full, rel).catch(() => { /* 无权限则跳过 */ })
        }
      }
    } catch { /* 目录不可读，跳过 */ }
  }

  await walk(dirPath, '')
  return { images, audio, rpyFiles }
}

/**
 * 将脚本中的素材引用与文件系统中找到的真实文件进行匹配。
 */
export function matchAssets(
  referencedImages: RpyImageRef[],
  referencedAudio: { path: string; type: 'bgm' | 'ambient' | 'se' | 'voice' }[],
  foundImages: { fileName: string; relativePath: string }[],
  foundAudio: { fileName: string; relativePath: string }[],
): {
  imageAssets: RpyImportAsset[]
  audioAssets: RpyImportAsset[]
  unmatchedImages: string[]
  unmatchedAudio: string[]
} {
  const imageAssets: RpyImportAsset[] = []
  const audioAssets: RpyImportAsset[] = []
  const unmatchedImages: string[] = []
  const unmatchedAudio: string[] = []

  // 匹配图片：优先按 image 声明里的真实路径（如 images/cg/tp1.png）匹配，
  // 即使变量名简写（如 tp1），也能通过文件路径与后缀精准归类。
  const usedImageFiles = new Set<string>()
  for (const ref of referencedImages) {
    const refName = ref.refName
    const refLow = refName.toLowerCase().replace(/\s+/g, '_')
    let best: typeof foundImages[0] | null = null

    // ① 真实路径最后一段文件名精确匹配（路径优先，最可靠）
    if (ref.path) {
      const pathStem = stem(ref.path.replace(/\\/g, '/')).toLowerCase()
      for (const fi of foundImages) {
        if (usedImageFiles.has(fi.relativePath)) continue
        if (stem(fi.fileName).toLowerCase() === pathStem) { best = fi; break }
      }
      // ② 路径 stem 与文件名互相包含（容忍 images/cg/tp1_v2.png 等变体）
      if (!best) {
        for (const fi of foundImages) {
          if (usedImageFiles.has(fi.relativePath)) continue
          const stemLow = stem(fi.fileName).toLowerCase()
          if (stemLow.includes(pathStem) || pathStem.includes(stemLow)) { best = fi; break }
        }
      }
    }
    // ③ 变量名 refName 匹配（Ren'Py 惯例：eileen happy → eileen_happy.png）
    if (!best) {
      for (const fi of foundImages) {
        if (usedImageFiles.has(fi.relativePath)) continue
        const stemLow = stem(fi.fileName).toLowerCase()
        if (stemLow === refLow) { best = fi; break }
        if (!best && (stemLow.includes(refLow) || refLow.includes(stemLow))) {
          best = fi
        }
      }
    }

    if (best) {
      usedImageFiles.add(best.relativePath)
      imageAssets.push({
        id: `rpy_img_${imageAssets.length}_${stem(best.fileName)}`,
        refName: refName,
        fileName: best.fileName,
        relativePath: best.relativePath,
        kind: 'image',
        usage: ref.usage ?? 'background',
        sizeBytes: 0, // 由 main 进程后续填充
      })
    } else {
      unmatchedImages.push(refName)
    }
  }

  // 匹配音频（剥离 <from..> 等控制标签后再匹配）
  const usedAudioFiles = new Set<string>()
  for (const ref of referencedAudio) {
    const refName = normalizeRef(stripAudioCtl(ref.path))
    const refLow = refName.toLowerCase()
    let best: typeof foundAudio[0] | null = null

    for (const fi of foundAudio) {
      if (usedAudioFiles.has(fi.relativePath)) continue
      const stemLow = stem(fi.fileName).toLowerCase()
      if (stemLow === refLow) { best = fi; break }
      if (!best && (stemLow.includes(refLow) || refLow.includes(stemLow))) { best = fi }
    }

    if (best) {
      usedAudioFiles.add(best.relativePath)
      audioAssets.push({
        id: `rpy_audio_${audioAssets.length}_${stem(best.fileName)}`,
        refName: refName,
        fileName: best.fileName,
        relativePath: best.relativePath,
        kind: 'audio',
        audioCategory: ref.type,
        sizeBytes: 0,
      })
    } else {
      unmatchedAudio.push(ref.path)
    }
  }

  // 未匹配的引用也生成占位条目（标记为 unmatched，后续可用于提示）
  for (const ref of unmatchedImages) {
    imageAssets.push({
      id: `rpy_img_unmatched_${imageAssets.length}_${ref.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      refName: ref,
      fileName: '',
      relativePath: '',
      kind: 'image',
      sizeBytes: 0,
    })
  }
  for (const ref of unmatchedAudio) {
    audioAssets.push({
      id: `rpy_audio_unmatched_${audioAssets.length}_${ref.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      refName: ref,
      fileName: '',
      relativePath: '',
      kind: 'audio',
      audioCategory: 'bgm',
      sizeBytes: 0,
    })
  }

  return { imageAssets, audioAssets, unmatchedImages, unmatchedAudio }
}

// ═══════════════════════════════════════════
// 主入口：从目录导入
// ═══════════════════════════════════════════

/**
 * 从目录导入 Ren'Py 工程：读取所有 .rpy 文件并解析，同时扫描素材文件。
 * 在 Electron 中使用 window.electronAPI.fs 读取文件。
 */
export async function importRpyDirectory(dirPath: string): Promise<RpyImportResult> {
  const fsApi = (window as any).electronAPI?.fs as FsApi | undefined
  if (!fsApi) throw new Error('文件系统 API 不可用，请在 Electron 中打开')
  const api = fsApi // narrowed

  // 递归扫描：素材文件 + 所有 .rpy/.rpym 脚本（含子目录）
  const { images: foundImages, audio: foundAudio, rpyFiles } = await scanAssetFiles(dirPath)

  const allDeltas: LineDelta[] = []
  const allChars: CharacterConfig[] = []
  const allVars: { name: string; value: string }[] = []
  const allWarnings: string[] = []
  const allRefImages = new Map<string, RpyImageRef>() // key = refName
  const allRefAudio: { path: string; type: 'bgm' | 'ambient' | 'se' | 'voice' }[] = []
  const charSeen = new Set<string>()
  const varSeen = new Set<string>()

  if (rpyFiles.length === 0) {
    // 即使没有 .rpy 文件，也报告扫描到的素材
    const { imageAssets, audioAssets } = matchAssets([], [], foundImages, foundAudio)
    return {
      deltas: [],
      characters: [],
      variables: [],
      warnings: ['未找到 .rpy 文件，仅扫描了素材'],
      lineCount: 0,
      charCount: 0,
      varCount: 0,
      imageAssets,
      audioAssets,
      imageCount: imageAssets.filter(a => a.fileName).length,
      audioCount: audioAssets.filter(a => a.fileName).length,
    }
  }

  // ═══ 阶段 A：全量解析，同时收集全局角色映射 ═══
  // 真实工程习惯把 define Character 集中写在脚本顶部（如 define gs1 = Character("阿五")），
  // 而使用处散落在其他 .rpy 文件。此处先收集所有文件的角色定义，
  // 供阶段 B 注入到每个文件解析，确保「代码变量名 gs1」能正确显示为「阿五」。
  const parsedList: { file: string; content: string; result: ReturnType<typeof parseRpy> }[] = []
  const globalCharMap = new Map<string, string>()
  const globalTransforms: RpyTransformDefs = {}
  const screenSize: RpyScreenSize = { width: 1920, height: 1080 }
  for (const f of rpyFiles) {
    const fullPath = dirPath + (dirPath.endsWith('/') || dirPath.endsWith('\\') ? '' : '\\') + f.relativePath
    let content: string
    try {
      content = await fsApi.readFile(fullPath, 'utf-8')
    } catch {
      allWarnings.push(`[${f.relativePath}] 无法读取文件`)
      continue
    }
    const result = parseRpy(content)
    parsedList.push({ file: f.relativePath, content, result })
    for (const c of result.characters) {
      const existing = globalCharMap.get(c.charId)
      // 优先保留「真实显示名」：若已有同名占位（显示名=变量名），用真实显示名覆盖
      if (!existing || (existing === c.charId && c.displayName !== c.charId)) {
        globalCharMap.set(c.charId, c.displayName)
      }
    }
    // 合并全局 transform 定义（show X at f 可能跨文件引用）
    for (const [k, v] of Object.entries(result.transforms)) globalTransforms[k] = v
    // 分辨率：gui.rpy 等文件定义 gui.init(W, H) 时以项目实际为准
    if (result.screen.width !== 1920 || result.screen.height !== 1080) {
      screenSize.width = result.screen.width
      screenSize.height = result.screen.height
    }
  }

  // ═══ 阶段 B：注入全局角色映射 + transform 定义重新解析（本文件局部声明覆盖全局） ═══
  if (globalCharMap.size > 0 || Object.keys(globalTransforms).length > 0) {
    for (const p of parsedList) {
      p.result = parseRpy(p.content, globalCharMap, globalTransforms, screenSize)
    }
  }

  for (const p of parsedList) {
    const file = p.file
    const result = p.result
    for (const d of result.deltas) allDeltas.push(d)
    for (const c of result.characters) {
      if (!charSeen.has(c.charId)) {
        charSeen.add(c.charId)
        allChars.push(c)
      }
    }
    for (const v of result.variables) {
      if (!varSeen.has(v.name)) {
        varSeen.add(v.name)
        allVars.push(v)
      }
    }
    for (const w of result.warnings) allWarnings.push(`[${file}] ${w}`)
    for (const img of result.referencedImages) {
      if (!allRefImages.has(img.refName)) allRefImages.set(img.refName, img)
    }
    allRefAudio.push(...result.referencedAudio)
  }

  // 去重音频引用
  const dedupedAudio: { path: string; type: 'bgm' | 'ambient' | 'se' | 'voice' }[] = []
  const audioSeen = new Set<string>()
  for (const a of allRefAudio) {
    const key = a.path + '|' + a.type
    if (!audioSeen.has(key)) {
      audioSeen.add(key)
      dedupedAudio.push(a)
    }
  }

  const { imageAssets, audioAssets, unmatchedImages, unmatchedAudio } = matchAssets(
    [...allRefImages.values()],
    dedupedAudio,
    foundImages,
    foundAudio,
  )

  // 未匹配的素材引用生成警告
  if (unmatchedImages.length > 0) {
    allWarnings.push(`以下图片引用未在目录中找到对应文件: ${unmatchedImages.join(', ')}`)
  }
  if (unmatchedAudio.length > 0) {
    allWarnings.push(`以下音频引用未在目录中找到对应文件: ${unmatchedAudio.join(', ')}`)
  }

  // 注意：此处不要对 asset_id 做任何预映射（历史上曾把引用名重映射成 relativePath）。
  // deltas 的 background / audio 只保留「引用名」（如 bj1 / jy），
  // 由导入对话框在真正落盘素材后，统一把引用名重映射为素材库的真实 id（uuid）。
  // 若在此预映射成 relativePath，对话框按引用名查 importedImageMap 会查不到，
  // 导致背景 / 音频的 asset_id 卡在无效值、渲染与导出都找不到素材；
  // 而立绘因不在此处预映射，反而一直正常——这正是「背景音频丢失、立绘完好」的根因。

  return {
    deltas: allDeltas,
    characters: allChars,
    variables: allVars,
    warnings: allWarnings,
    lineCount: allDeltas.length,
    charCount: allChars.length,
    varCount: allVars.length,
    imageAssets,
    audioAssets,
    imageCount: imageAssets.filter(a => a.fileName).length,
    audioCount: audioAssets.filter(a => a.fileName).length,
  }
}
