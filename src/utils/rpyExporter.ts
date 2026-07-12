/**
 * Delta → Ren'Py .rpy 脚本导出器
 *
 * 利用 resolvedStates 逐行比较前一行的完整状态，
 * 只输出发生改变的部分，生成可在 Ren'Py 引擎中直接运行的合法脚本。
 *
 * 导出前会运行校验步骤（validateExportNames），
 * 确保所有引用名称与声明名称逐字符一致，不一致时阻止导出并给出明确错误。
 */
import type { LineDelta, ResolvedLineState } from '@/core/types'

// --------------- 类型 ---------------

/** 导出前校验发现的单条错误 */
export interface ValidationError {
  lineId: string
  field: string
  value: string
  message: string
}

/** 通过校验后给导出函数使用的统一映射表 */
export interface ResolvedLookups {
  /** 全部角色 ID（delta.characters 的 key，如 "alice"） */
  allCharIds: Set<string>
  /** sprite_id → 所属角色 charId（如 "alice_smile" → "alice"） */
  spriteToCharId: Record<string, string>
  /** speaker（如 "Alice"）→ charId（如 "alice"），大小写不敏感匹配 */
  speakerToCharId: Record<string, string>
  /** 全部背景 asset_id */
  allBgIds: Set<string>
}

// --------------- 辅助函数 ---------------

/** 从 sprite_id 提取表情后缀（alice_smile → smile） */
function spriteSuffix(spriteId: string): string {
  const idx = spriteId.lastIndexOf('_')
  return idx > 0 ? spriteId.slice(idx + 1) : spriteId
}

/** 缩进 */
function indent(level: number, text: string): string {
  return '    '.repeat(level) + text
}

/** 首字母大写 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// --------------- 校验层 ---------------

/**
 * 扫描全部 Delta 行，构建统一的名称映射表。
 * 此函数不验证合法性，仅做搜集。
 */
export function resolveLookups(deltas: LineDelta[]): ResolvedLookups {
  const allCharIds = new Set<string>()
  const spriteToCharId: Record<string, string> = {}
  const speakerToCharId: Record<string, string> = {}
  const allBgIds = new Set<string>()

  for (const delta of deltas) {
    // 背景
    if (delta.background?.asset_id) {
      allBgIds.add(delta.background.asset_id)
    }

    // 角色
    for (const [charId, char] of Object.entries(delta.characters)) {
      allCharIds.add(charId)
      if (char.sprite_id) {
        // 如果同一个 sprite_id 被多个角色使用（理论上不应发生），取最后出现的
        spriteToCharId[char.sprite_id] = charId
      }
    }

    // speaker 映射
    if (delta.speaker) {
      for (const charId of allCharIds) {
        if (delta.speaker.toLowerCase() === charId.toLowerCase()) {
          speakerToCharId[delta.speaker] = charId
          break
        }
      }
    }
  }

  return { allCharIds, spriteToCharId, speakerToCharId, allBgIds }
}

/**
 * 导出前校验：逐行检查每个引用名是否在声明表中存在对应项。
 * 返回空数组表示校验通过；否则返回所有错误，阻止导出。
 */
export function validateExportNames(
  deltas: LineDelta[],
  lookups: ResolvedLookups,
): ValidationError[] {
  const errors: ValidationError[] = []
  const { allCharIds, spriteToCharId, speakerToCharId, allBgIds } = lookups

  for (const delta of deltas) {
    const lid = delta.line_id

    // 1) 说话人校验
    if (delta.speaker) {
      const mapped = speakerToCharId[delta.speaker]
      if (!mapped) {
        // 也尝试直接匹配（speaker 本身可能就是全小写 charId）
        if (!allCharIds.has(delta.speaker)) {
          errors.push({
            lineId: lid,
            field: 'speaker',
            value: delta.speaker,
            message: `说话人 "${delta.speaker}" 未匹配到任何角色 ID。`
              + `已知角色 ID：[${[...allCharIds].join(', ')}]。`
              + `请在数据中将 speaker 改为与角色 ID 完全一致的小写名称，或确保 definitions.rpy 中存在 define ${delta.speaker} 声明。`,
          })
        }
      }
    }

    // 2) 角色 show/hide 校验
    for (const [charId, char] of Object.entries(delta.characters)) {
      // 2a) charId 本身是否在声明中
      if (!allCharIds.has(charId)) {
        errors.push({
          lineId: lid,
          field: 'characters.key',
          value: charId,
          message: `角色 "${charId}" 未出现在已知角色 ID 列表中。`,
        })
      }
      // 2b) sprite_id → charId 是否与当前 charId 一致（检测下划线分叉）
      if (char.sprite_id) {
        const owner = spriteToCharId[char.sprite_id]
        if (owner && owner !== charId) {
          errors.push({
            lineId: lid,
            field: 'characters.sprite_id',
            value: char.sprite_id,
            message: `立绘 "${char.sprite_id}" 已绑定角色 "${owner}"，`
              + `但当前行将它用于角色 "${charId}"。`
              + `一个 sprite_id 只能属于一个角色（用于生成 image 声明）。`,
          })
        }
        // 2c) 确保 spriteSuffix 能正确提取
        if (!char.sprite_id.startsWith(charId)) {
          errors.push({
            lineId: lid,
            field: 'characters.sprite_id',
            value: char.sprite_id,
            message: `立绘 "${char.sprite_id}" 不以角色 ID "${charId}" 开头，`
              + `导出时 image 声明与 show 命令的标签可能不一致。`
              + `建议命名格式：${charId}_<表情>（如 ${charId}_smile）。`,
          })
        }
      }
    }

    // 3) 背景校验
    if (delta.background?.asset_id) {
      if (!allBgIds.has(delta.background.asset_id)) {
        errors.push({
          lineId: lid,
          field: 'background.asset_id',
          value: delta.background.asset_id,
          message: `背景 "${delta.background.asset_id}" 不在已知背景列表中。`,
        })
      }
    }
  }

  return errors
}

/**
 * 格式化校验错误为可读的多行字符串，用于 alert 弹窗。
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  const header = `导出校验失败 · ${errors.length} 处问题\n${'─'.repeat(40)}`
  const body = errors.map((e, i) =>
    `\n[${i + 1}] 行 ${e.lineId} · ${e.field}\n    值: "${e.value}"\n    ${e.message}`,
  ).join('\n')
  return header + body
}

// --------------- script.rpy 导出 ---------------

export function exportToRpy(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  lookups: ResolvedLookups,
  scriptLabel: string = 'start',
): string {
  if (deltas.length === 0) return '# No content\n'

  const { speakerToCharId } = lookups
  const lines: string[] = []

  lines.push(`# Generated by ScriptWeaver`)
  lines.push(`# ${deltas.length} lines · ${resolvedStates.length} resolved states`)
  lines.push('')
  lines.push(`label ${scriptLabel}:`)
  lines.push('')

  // 当前行级的追踪状态（用于检测变化）
  let currentBg: string | null = null
  let currentChars: Record<string, { sprite_id: string; position_slot: string }> = {}
  let currentBgm: string | null = null
  let currentAmbient: string | null = null

  for (let i = 0; i < resolvedStates.length; i++) {
    const state = resolvedStates[i]
    const delta = deltas[i]
    const block: string[] = []

    // ---- 背景 ----
    const newBg = state.background?.asset_id ?? null
    if (newBg !== currentBg) {
      currentBg = newBg
      if (newBg) {
        const transition = state.background?.transition
        if (transition && transition !== 'None') {
          block.push(`scene ${newBg}`)
          block.push(`with ${transition}`)
        } else {
          block.push(`scene ${newBg}`)
        }
      }
    }

    // ---- 角色出场/变化/退场 ----
    const newChars: Record<string, { sprite_id: string; position_slot: string }> = {}
    for (const [charId, char] of Object.entries(state.characters)) {
      newChars[charId] = { sprite_id: char.sprite_id, position_slot: char.position_slot }
    }

    // 退场角色
    for (const charId of Object.keys(currentChars)) {
      if (!newChars[charId]) {
        block.push(`hide ${charId}`)
      }
    }

    // 出场/变化角色
    for (const [charId, char] of Object.entries(newChars)) {
      const prev = currentChars[charId]
      if (!prev || prev.sprite_id !== char.sprite_id || prev.position_slot !== char.position_slot) {
        block.push(`show ${charId} ${spriteSuffix(char.sprite_id)} at ${char.position_slot}`)
      }
    }

    // ---- BGM ----
    const newBgm = state.audio.bgm?.asset_id ?? null
    if (newBgm !== currentBgm) {
      currentBgm = newBgm
      if (newBgm) {
        const fadeIn = state.audio.bgm?.fade_in_ms ? state.audio.bgm.fade_in_ms / 1000 : 0
        if (fadeIn > 0) {
          block.push(`play music "${newBgm}" fadein ${fadeIn}`)
        } else {
          block.push(`play music "${newBgm}"`)
        }
      } else {
        block.push('stop music fadeout 1.0')
      }
    }

    // ---- 环境音 ----
    const newAmbient = state.audio.ambient?.asset_id ?? null
    if (newAmbient !== currentAmbient) {
      currentAmbient = newAmbient
      if (newAmbient) {
        const fadeIn = state.audio.ambient?.fade_in_ms ? state.audio.ambient.fade_in_ms / 1000 : 0
        if (fadeIn > 0) {
          block.push(`play sound "${newAmbient}" fadein ${fadeIn}`)
        } else {
          block.push(`play sound "${newAmbient}"`)
        }
      } else {
        block.push('stop sound')
      }
    }

    // ---- SE（一次性音效）----
    for (const seId of state.audio.se) {
      block.push(`play sound "${seId}"`)
    }

    // ---- Voice ----
    if (state.audio.voice) {
      block.push(`voice "${state.audio.voice}"`)
    }

    // ---- 台词 ----
    // 通过 lookups 将 speaker 映射为与 definitions.rpy 一致的 charId
    if (state.speaker) {
      const resolvedSpeaker = speakerToCharId[state.speaker] ?? state.speaker
      const escaped = state.dialogue.replace(/"/g, '\\"')
      block.push(`${resolvedSpeaker} "${escaped}"`)
    } else {
      const escaped = state.dialogue.replace(/"/g, '\\"')
      block.push(`"${escaped}"`)
    }

    // 输出该行内容
    if (block.length > 0) {
      if (i > 0) lines.push('')
      for (const b of block) {
        lines.push(indent(1, b))
      }
    }

    // 注释行号（调试用）
    lines.push(indent(1, `# ${delta.line_id}`))

    // 更新追踪状态
    currentChars = newChars
  }

  lines.push('')
  lines.push('    return')
  lines.push('')

  return lines.join('\n')
}

// --------------- definitions.rpy 导出 ---------------

interface ExportMeta {
  charDisplayNames: Record<string, string>
  sprites: Set<string>
  backgrounds: Set<string>
  audioAssets: Set<string>
}

function collectMeta(
  deltas: LineDelta[],
  lookups: ResolvedLookups,
): ExportMeta {
  const charDisplayNames: Record<string, string> = {}
  const sprites = new Set<string>()
  const backgrounds = new Set<string>()
  const audioAssets = new Set<string>()

  for (const delta of deltas) {
    if (delta.background?.asset_id) backgrounds.add(delta.background.asset_id)

    for (const [charId, char] of Object.entries(delta.characters)) {
      if (char.sprite_id) sprites.add(char.sprite_id)
      charDisplayNames[charId] = charDisplayNames[charId] ?? capitalize(charId)
    }

    const { audio } = delta
    if (audio.bgm && audio.bgm !== '__CLEAR__' && audio.bgm.asset_id) audioAssets.add(audio.bgm.asset_id)
    if (audio.ambient && audio.ambient !== '__CLEAR__' && audio.ambient.asset_id) audioAssets.add(audio.ambient.asset_id)
    for (const seId of audio.se) audioAssets.add(seId)
    if (audio.voice) audioAssets.add(audio.voice)
  }

  // 用 speaker 字段微调显示名称
  for (const delta of deltas) {
    if (!delta.speaker) continue
    for (const charId of Object.keys(charDisplayNames)) {
      if (delta.speaker.toLowerCase() === charId.toLowerCase()) {
        charDisplayNames[charId] = delta.speaker
      }
    }
  }

  return { charDisplayNames, sprites, backgrounds, audioAssets }
}

/**
 * 生成 definitions.rpy 内容：
 *   - position transforms（left / center / right）
 *   - Character 声明（define）
 *   - image 声明（立绘 + 背景）
 *   - 音频素材清单（注释）
 *
 * 立绘 image 声明通过 lookups.spriteToCharId 获取正确的 charId，
 * 而非简单切分 sprite_id 字符串，避免角色 ID 含下划线时分叉。
 */
export function exportDefinitionsRpy(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  lookups: ResolvedLookups,
): string {
  const meta = collectMeta(deltas, lookups)
  const lines: string[] = []

  lines.push('# ============================================================')
  lines.push('# ScriptWeaver - definitions.rpy')
  lines.push('# 角色声明 / image 声明 / position transforms')
  lines.push('# ============================================================')
  lines.push('')

  // ---- Position Transforms ----
  lines.push('# ---- Position Transforms ----')
  lines.push('transform left:')
  lines.push('    xalign 0.25')
  lines.push('    yalign 1.0')
  lines.push('')
  lines.push('transform center:')
  lines.push('    xalign 0.5')
  lines.push('    yalign 1.0')
  lines.push('')
  lines.push('transform right:')
  lines.push('    xalign 0.75')
  lines.push('    yalign 1.0')
  lines.push('')

  // ---- Character 声明 ----
  if (Object.keys(meta.charDisplayNames).length > 0) {
    lines.push('# ---- Character 声明 ----')
    for (const [charId, displayName] of Object.entries(meta.charDisplayNames).sort()) {
      lines.push(`define ${charId} = Character("${displayName}")`)
    }
    lines.push('')
    lines.push('# 命名约定：')
    lines.push('#   脚本中使用角色 ID（小写）作为 Character 变量名和对话说话人。')
    lines.push('#   导出器会自动将 speaker（如 "Alice"）映射为角色 ID（如 "alice"）。')
    lines.push('#   show <角色id> <表情> at <位置>  例如: show alice smile at center')
    lines.push('#   <角色id> "台词"                 例如: alice "Hello"')
    lines.push('')
  }

  // ---- 立绘 Image 声明 ----
  if (meta.sprites.size > 0) {
    lines.push('# ---- 立绘 Image 声明 ----')
    for (const spriteId of [...meta.sprites].sort()) {
      // 通过 lookups 获取准确的 charId，而非从 sprite_id 切分字符串
      const charId = lookups.spriteToCharId[spriteId] ?? spriteId.split('_').slice(0, -1).join('_')
      const expr = spriteSuffix(spriteId)
      lines.push(`image ${charId} ${expr} = "images/sprites/${spriteId}.png"`)
    }
    lines.push('')
  }

  // ---- 背景 Image 声明 ----
  if (meta.backgrounds.size > 0) {
    lines.push('# ---- 背景 Image 声明 ----')
    for (const bgId of [...meta.backgrounds].sort()) {
      lines.push(`image ${bgId} = "images/bg/${bgId}.jpg"`)
    }
    lines.push('')
  }

  // ---- 音频清单 ----
  if (meta.audioAssets.size > 0) {
    lines.push('# ---- 音频素材清单（需放入 game/audio/ 目录） ----')
    for (const audioId of [...meta.audioAssets].sort()) {
      lines.push(`#   audio/${audioId}.ogg`)
    }
    lines.push('')
  }

  lines.push('# 素材路径为默认生成，请按实际项目结构调整。')
  lines.push('')

  return lines.join('\n')
}

// --------------- 下载 ---------------

/**
 * 触发生成并下载 .rpy 文件（一式两份：definitions.rpy + script.rpy）。
 *
 * 导出前置步骤：
 * 1. resolveLookups → 构建声明表
 * 2. validateExportNames → 校验引用一致性
 *    - 通过：继续导出
 *    - 失败：弹出 alert 显示错误详情，阻止下载
 */
export function downloadRpy(
  deltas: LineDelta[],
  resolvedStates: ResolvedLineState[],
  scriptFilename: string = 'script.rpy',
): void {
  // Step 1: 构建映射表
  const lookups = resolveLookups(deltas)

  // Step 2: 导出前校验
  const errors = validateExportNames(deltas, lookups)
  if (errors.length > 0) {
    alert(formatValidationErrors(errors))
    return
  }

  // Step 3: 生成并下载
  const scriptContent = exportToRpy(deltas, resolvedStates, lookups)
  triggerDownload(scriptContent, scriptFilename)

  const defsContent = exportDefinitionsRpy(deltas, resolvedStates, lookups)
  triggerDownload(defsContent, 'definitions.rpy')
}

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
