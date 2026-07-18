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

import type { LineDelta, ResolvedLineState, CharacterConfig, AssetItem, PositionSlot } from '@/core/types'

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
  | { kind: 'scene'; image: string; transition?: string }
  | { kind: 'show'; charId: string; exprId: string; at: AtClause; zorder: number }
  | { kind: 'hide'; charId: string }
  | { kind: 'playMusic'; file: string; fadein?: number; loop: boolean }
  | { kind: 'playAmbient'; file: string; fadein?: number; loop: boolean }
  | { kind: 'playSound'; file: string }
  | { kind: 'voice'; file: string }
  | { kind: 'stopMusic'; fadeout: number }
  | { kind: 'stopAmbient' }
  | { kind: 'say'; speaker?: string; text: string }
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

/** 过渡映射：'None'/空 → 不输出 with；其余原样透传（含 fade/dissolve 等 Ren'Py 原生过渡） */
function normalizeTransition(t?: string): string | undefined {
  if (!t || t === 'None') return undefined
  return t
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
      if (!allCharIds.has(charId)) {
        errors.push({
          lineId: lid,
          field: 'characters.key',
          value: charId,
          message: `角色 "${charId}" 未在角色管理中找到配置。`,
        })
      }
      const validExpressions = charExpressions[charId]
      if (validExpressions && char.sprite_id && !validExpressions.has(char.sprite_id)) {
        const available = [...validExpressions].join(', ')
        errors.push({
          lineId: lid,
          field: 'characters.sprite_id',
          value: char.sprite_id,
          message: `表情 "${char.sprite_id}" 不在角色 "${charId}" 的表情列表中。可用表情：[${available}]。`,
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

function serializeAt(at: AtClause): string {
  if (at.kind === 'slot') return at.slotId
  return `semislotted(${at.xpos}, ${at.ypos})`
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
): RpyNode[] {
  const nodes: RpyNode[] = [{ kind: 'label', name: scriptLabel }]

  let currentBg: string | null = null
  let currentBgm: string | null = null
  let currentAmbient: string | null = null
  let currentChars = new Map<string, { exprId: string; at: AtClause; zorder: number }>()

  for (let i = 0; i < resolvedStates.length; i++) {
    const state = resolvedStates[i]
    const delta = deltas[i]
    const block: RpyNode[] = []

    // ---- 背景 ----
    const newBg = state.background?.asset_id ?? null
    if (newBg !== currentBg) {
      currentBg = newBg
      if (newBg) {
        const transition = normalizeTransition(state.background?.transition)
        block.push({ kind: 'scene', image: newBg, transition })
      }
    }

    // ---- 角色：先收集本行完整状态 ----
    const newChars = new Map<string, { exprId: string; at: AtClause; zorder: number }>()
    for (const [charId, c] of Object.entries(state.characters)) {
      newChars.set(charId, {
        exprId: c.sprite_id,
        at: resolveAt(c, st),
        zorder: computeZorder(c, st),
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
        !prev || prev.exprId !== nc.exprId || !atEqual(prev.at, nc.at) || prev.zorder !== nc.zorder
      if (changed) {
        block.push({ kind: 'show', charId, exprId: nc.exprId, at: nc.at, zorder: nc.zorder })
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

    // ---- 台词 ----
    if (state.speaker) {
      const resolved = st.speakerToCharId[state.speaker] ?? state.speaker
      block.push({ kind: 'say', speaker: resolved, text: state.dialogue })
    } else {
      block.push({ kind: 'say', text: state.dialogue })
    }

    block.push({ kind: 'comment', text: delta.line_id })

    if (block.length > 0) {
      if (i > 0) nodes.push({ kind: 'blank' })
      nodes.push(...block)
    }
    currentChars = newChars
  }

  nodes.push({ kind: 'return' })
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
    case 'scene':
      return n.transition ? `scene ${n.image} with ${n.transition}` : `scene ${n.image}`
    case 'show':
      return `show ${n.charId} ${n.exprId} at ${serializeAt(n.at)} zorder ${n.zorder}`
    case 'hide':
      return `hide ${n.charId}`
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
  const nodes = compileToNodes(deltas, resolvedStates, st, scriptLabel)
  return serializeNodes(nodes, deltas.length)
}

// ======================= definitions.rpy 导出 =======================

export function exportDefinitionsRpy(
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
  positionSlots?: PositionSlot[],
  st?: SymbolTable,
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

  // ---- 微调通用 Transform（承载自由微调坐标，A-4）----
  lines.push('# ---- 自由微调通用 Transform ----')
  lines.push('transform semislotted(xpos, ypos):')
  lines.push('    xpos xpos ypos ypos xanchor 0.5 yanchor 1.0')
  lines.push('')

  // ---- Character 声明 ----
  if (characterConfigs.length > 0) {
    lines.push('# ---- Character 声明 ----')
    for (const char of characterConfigs) {
      const colorArg = char.dialogueColor ? `, color="${char.dialogueColor}"` : ''
      lines.push(`define ${char.charId} = Character("${char.displayName}"${colorArg})`)
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
): RpyBundle {
  const st = buildSymbolTable(deltas, characterConfigs, assets, positionSlots)
  const script = deltas.length === 0 ? '# No content\n' : serializeNodes(compileToNodes(deltas, resolvedStates, st, scriptLabel), deltas.length)
  const definitions = exportDefinitionsRpy(characterConfigs, assets, positionSlots, st)
  const assetRefs = buildAssetRefs(assets)
  return { script, definitions, assets: assetRefs }
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
  const defs = exportDefinitionsRpy(characterConfigs, assets, positionSlots)
  triggerDownload(script, scriptFilename)
  triggerDownload(defs, 'definitions.rpy')
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
): Promise<ExportResult> {
  const lookups = resolveLookups(deltas, characterConfigs, assets)
  const errors = validateExportNames(deltas, lookups, characterConfigs, assets)
  if (errors.length > 0) {
    alert(formatValidationErrors(errors))
    return { mode: 'web', success: false, message: '校验失败，已中止导出。' }
  }

  const bundle = buildBundle(deltas, resolvedStates, characterConfigs, assets, positionSlots, scriptLabel)

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
  return {
    mode: 'web',
    success: true,
    message: '已通过浏览器下载 script.rpy 与 definitions.rpy（素材需手动放入 game/ 目录）。',
  }
}
