/**
 * Ren'Py 工程导入器（重写版）
 * 全量解析 .rpy 文件：label / dialogue / menu / choice / variable / scene / show / play music / play sound / image 定义
 * 扫描 game 目录下真实图片与音频文件，与脚本引用做匹配。
 */

import type { LineDelta, CharacterConfig, ChoiceItem, VariableOperation } from '@/core/types'

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
/** transform 定义：名称 → ATL 属性（zoom/xpos/ypos/xalign/yalign…） */
export interface RpyTransformDefs {
  [name: string]: Record<string, number>
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
    const tf = t.match(/^transform\s+(\S+)\s*:\s*$/)
    if (tf) {
      const name = tf[1]
      const attrs: Record<string, number> = {}
      let j = i + 1
      while (j < lines.length) {
        const al = lines[j].trim()
        if (!al) { j++; continue }
        if (!(lines[j].startsWith(' ') || lines[j].startsWith('\t'))) break
        const m = al.match(/^(zoom|xpos|ypos|xalign|yalign|xanchor|yanchor)\s+([-\d.]+)/)
        if (m) attrs[m[1]] = Number(m[2])
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

  /** ATL / transform 属性行关键字（scene X: / show X: / transform X: 块内的 zoom/xpos/alpha 等属性） */
  const ATL_PROPS = /^(zoom|xzoom|yzoom|size|xpos|ypos|pos|xalign|yalign|align|anchor|xanchor|yanchor|truecenter|xoffset|yoffset|xcenter|ycenter|alpha|rotate|rotate_pad|transform_anchor|around|crop|additive|blend|ease|easein|easeout|linear|pause|time|repeat|block|parallel|choice|function|on|event|warp|matrixcolor|fit|matrixtransform|perspective|xrotate|yrotate|zrotate|gl_depth)\b/

  /**
   * 块状态机：
   * - 'atl'：scene X: / show X: 的 ATL 属性块。只跳过 ATL 属性行，遇到对白/指令立即退出，
   *          保证 label 块内同样缩进的对白（"    js1 \"你好\""）不被误吞；show 内联 ATL 同时收集位置缩放。
   * - 'skip'：transform / init python / screen / style 等块定义体，缩进行整体跳过。
   */
  let blockMode: 'none' | 'atl' | 'skip' = 'none'
  /** 等待应用内联 ATL 属性的 show 行（deltas 索引 + 角色 id） */
  let pendingShow: { idx: number; charId: string } | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    // skip 块（transform / init python / screen / style 属性体）：缩进行整体跳过
    if (blockMode === 'skip') {
      if (raw.startsWith(' ') || raw.startsWith('\t')) continue
      blockMode = 'none'
    }

    // atl 块（scene X: / show X:）：只跳过 ATL 属性行，show 内联 ATL 收集位置缩放
    if (blockMode === 'atl') {
      if (ATL_PROPS.test(line)) {
        if (pendingShow) {
          const m = line.match(/^(zoom|xpos|ypos|xalign|yalign)\s+([-\d.]+)/)
          if (m) {
            const ce = deltas[pendingShow.idx]?.characters?.[pendingShow.charId]
            if (ce) {
              if (m[1] === 'zoom') ce.scale = Number(m[2])
              else if (m[1] === 'xpos') ce.pos_x = clamp(Number(m[2]) / screenW, 0, 1)
              else if (m[1] === 'ypos') ce.pos_y = clamp(Number(m[2]) / screenH, 0, 1)
            }
          }
        }
        continue
      }
      pendingShow = null
      blockMode = 'none'
    }

    // ---- define 声明已在阶段 1 处理，跳过 ----
    if (line.startsWith('define ')) continue

    // ---- default 变量已收集，跳过 ----
    if (line.startsWith('default ')) continue

    // ---- image 声明已收集，跳过 ----
    if (line.startsWith('image ')) continue

    // ---- label ----
    const labelM = line.match(/^label\s+(\S+)\s*:/)
    if (labelM) {
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        label: labelM[1],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
      continue
    }

    // ---- menu: 选择支块 ----
    if (line === 'menu:') {
      inMenu = true
      menuChoices = []
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        line_type: 'choice',
        choices: [],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
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
      emitDelta({
        ...baseDelta(lineId),
        variableOps: [op],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
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
      emitDelta({
        ...baseDelta(lineId),
        variableOps: [op],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
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
    const sceneM = line.match(/^scene\s+([^\s:]+)/)
    if (sceneM) {
      const bgName = sceneM[1]
      if (line.endsWith(':')) blockMode = 'atl' // scene X: 内联 ATL 块（仅跳过属性行）
      upsertImageRef(bgName, { usage: 'background' })
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        background: { asset_id: bgName },
        characters: noChars,
        audio: emptyAudio,
      })
      continue
    }

    // ---- show (显示立绘) ----
    const showM = line.match(/^show\s+([^\s:]+)(?:\s+at\s+(\S+))?/)
    if (showM) {
      const fullExpr = showM[0].replace(/^show\s+/, '').trim()
      const atName = showM[2]
      if (line.endsWith(':')) blockMode = 'atl' // show X: 内联 ATL 块
      upsertImageRef(fullExpr, { usage: 'sprite' })
      // show 指令的第一个词通常是角色变量名（也可是 expression name）
      const firstWord = fullExpr.split(/\s+/)[0]
      const resolved = resolveSpeaker(firstWord)
      // 如果 firstWord 本身无法解析为角色（如纯图片），就用 fullExpr 的第一个词
      if (resolved.charId) {
        ensureChar(resolved.charId, resolved.displayName)
        lineId++
        emitDelta({
          ...baseDelta(lineId),
          characters: {
            [resolved.charId]: { sprite_id: fullExpr, char_id: resolved.charId, position_slot: 'center', action: 'show' as const },
          },
          background: noBG,
          audio: emptyAudio,
        })
      } else {
        // 无法解析为已知角色，使用全名作为 sprite_id
        ensureChar(firstWord, firstWord)
        lineId++
        emitDelta({
          ...baseDelta(lineId),
          characters: {
            [firstWord]: { sprite_id: fullExpr, char_id: firstWord, position_slot: 'center', action: 'show' as const },
          },
          background: noBG,
          audio: emptyAudio,
        })
      }
      continue
    }

    // ---- hide (隐藏立绘) ----
    const hideM = line.match(/^hide\s+(\S+)/)
    if (hideM) {
      const target = hideM[1].replace(/:$/, '')
      const resolved = resolveSpeaker(target)
      if (resolved.charId) {
        lineId++
        emitDelta({
          ...baseDelta(lineId),
          characters: {
            [resolved.charId]: {
              sprite_id: target,
              char_id: resolved.charId,
              position_slot: 'center',
              action: 'hide' as const,
            },
          },
          background: noBG,
          audio: emptyAudio,
        })
      }
      continue
    }

    // ---- play music（剥离 <from..> <to..> <loop..> 等音频控制标签） ----
    const playM = line.match(/^play\s+music\s+"([^"]*)"/)
    if (playM) {
      const p = stripAudioCtl(playM[1])
      refAudio.push({ path: p, type: 'bgm' })
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        audio: { bgm: { asset_id: p, volume: 1, loop: true }, ambient: null, se: [], voice: null },
        background: noBG,
        characters: noChars,
      })
      continue
    }

    // ---- play music '单引号' ----
    const playMSQ = line.match(/^play\s+music\s+'([^']*)'/)
    if (playMSQ) {
      const p = stripAudioCtl(playMSQ[1])
      refAudio.push({ path: p, type: 'bgm' })
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        audio: { bgm: { asset_id: p, volume: 1, loop: true }, ambient: null, se: [], voice: null },
        background: noBG,
        characters: noChars,
      })
      continue
    }

    // ---- play sound ----
    const playSfx = line.match(/^play\s+sound\s+"([^"]*)"/)
    if (playSfx) {
      const p = stripAudioCtl(playSfx[1])
      refAudio.push({ path: p, type: 'se' })
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        audio: { bgm: null, ambient: null, se: [p], voice: null },
        background: noBG,
        characters: noChars,
      })
      continue
    }

    // ---- play sound '单引号' ----
    const playSfxSQ = line.match(/^play\s+sound\s+'([^']*)'/)
    if (playSfxSQ) {
      const p = stripAudioCtl(playSfxSQ[1])
      refAudio.push({ path: p, type: 'se' })
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        audio: { bgm: null, ambient: null, se: [p], voice: null },
        background: noBG,
        characters: noChars,
      })
      continue
    }

    // ---- voice ----
    const voiceM = line.match(/^voice\s+"([^"]*)"/)
    if (voiceM) {
      refAudio.push({ path: stripAudioCtl(voiceM[1]), type: 'voice' })
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
      emitDelta({
        ...baseDelta(lineId),
        speaker: resolved.displayName || speakerVar,
        dialogue: text,
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
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
        emitDelta({
          ...baseDelta(lineId),
          speaker: speakerName,
          dialogue: text,
          background: noBG,
          characters: noChars,
          audio: emptyAudio,
        })
      } else {
        // 纯对白（无说话人）→ 旁白
        lineId++
        emitDelta({
          ...baseDelta(lineId),
          dialogue: text,
          background: noBG,
          characters: noChars,
          audio: emptyAudio,
        })
      }
      continue
    }

    // ---- 模式 3: "文本"（旁白/叙事） ----
    const narration = line.match(/^"([^"]*)"\s*$/)
    if (narration) {
      const text = narration[1]
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        dialogue: text,
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
      continue
    }

    // ---- 续行对白（extend "文本"） ----
    const extendM = line.match(/^extend\s+"([^"]*)"\s*$/)
    if (extendM) {
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        dialogue: extendM[1],
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
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
      emitDelta({
        ...baseDelta(lineId),
        dialogue: line,
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
      continue
    }

    // ---- 兜底：不可静默吞掉的行 → 警告 ----
    if (line && !line.startsWith('init') && !line.startsWith('transform') && !line.startsWith('screen')
      && !line.startsWith('style') && !line.startsWith('layeredimage')) {
      warnings.push(`未识别的行: ${line.slice(0, 60)}`)
    }
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
  }

  // ═══ 阶段 B：注入全局映射重新解析（本文件局部 define 声明覆盖全局） ═══
  if (globalCharMap.size > 0) {
    for (const p of parsedList) {
      p.result = parseRpy(p.content, globalCharMap)
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

  // 将素材引用映射回 deltas（修正 asset_id 为实际文件名）
  const imageMap = new Map<string, string>() // refName → actual relativePath
  for (const a of imageAssets) {
    if (a.fileName) imageMap.set(a.refName, a.relativePath)
  }
  const audioMap = new Map<string, string>()
  for (const a of audioAssets) {
    if (a.fileName) audioMap.set(a.refName, a.relativePath)
  }

  for (const d of allDeltas) {
    // 修正背景引用
    if (d.background?.asset_id && imageMap.has(d.background.asset_id)) {
      d.background.asset_id = imageMap.get(d.background.asset_id)!
    }
    // 修正音频引用（bgm 是 AudioTrackInstruction | null | '__CLEAR__'，需窄化类型）
    const bgm = d.audio?.bgm
    if (bgm && typeof bgm === 'object' && 'asset_id' in bgm) {
      const aid = bgm.asset_id
      if (aid && audioMap.has(normalizeRef(aid))) {
        bgm.asset_id = audioMap.get(normalizeRef(aid))!
      }
    }
    if (d.audio?.se) {
      d.audio.se = d.audio.se.map(s => audioMap.get(normalizeRef(s)) || s)
    }
  }

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
