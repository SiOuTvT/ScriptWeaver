/**
 * Ren'Py 工程导入器
 * 解析 .rpy 文件，将基本结构映射为 ScriptWeaver 的 LineDelta / characters / variables
 */

import type { LineDelta, CharacterConfig, ChoiceItem, VariableOperation } from '@/core/types'

export interface RpyImportResult {
  deltas: LineDelta[]
  characters: CharacterConfig[]
  variables: { name: string; value: string }[]
  warnings: string[]
  lineCount: number
  charCount: number
  varCount: number
}

const emptyAudio = { bgm: null as null, ambient: null as null, se: [] as string[], voice: null as string | null }
const noBG = null
const noChars = {} as Record<string, never>

const now = new Date().toISOString()

function createCharConfig(name: string): CharacterConfig {
  return {
    charId: name,
    displayName: name,
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

/**
 * 解析一段 Ren'Py 脚本，提取角色、变量和剧本行。
 */
export function parseRpy(source: string): RpyImportResult {
  const lines = source.split(/\r?\n/)
  const warnings: string[] = []
  const characters: CharacterConfig[] = []
  const variableDefs: { name: string; value: string }[] = []
  const charSet = new Set<string>()
  const varSet = new Set<string>()

  let lineId = 0
  const deltas: LineDelta[] = []
  let inMenu = false
  let menuChoices: ChoiceItem[] = []

  function addChar(name: string) {
    if (!charSet.has(name)) {
      charSet.add(name)
      characters.push(createCharConfig(name))
    }
  }

  function addVar(name: string, value: string) {
    if (!varSet.has(name)) {
      varSet.add(name)
      variableDefs.push({ name, value })
    }
  }

  function emitDelta(delta: LineDelta) {
    deltas.push(delta)
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    // ---- define Character ----
    const defineChar = line.match(/^define\s+(\w+)\s*=\s*Character\s*\(/)
    if (defineChar) {
      addChar(defineChar[1])
      continue
    }

    // ---- default 变量 ----
    const defaultVar = line.match(/^default\s+(\w+)\s*=\s*(.+)/)
    if (defaultVar) {
      addVar(defaultVar[1], defaultVar[2].trim())
      continue
    }

    // ---- label ----
    const labelM = line.match(/^label\s+(\w+)\s*:/)
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
      const jumpM = line.match(/^jump\s+(\w+)/)
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
      const varOpM = line.match(/^\$\s*(\w+)\s*(\+|-|)\s*=\s*(\S+)/)
      if (varOpM) {
        const op: VariableOperation = {
          varName: varOpM[1],
          op: varOpM[2] === '+' ? 'add' : varOpM[2] === '-' ? 'subtract' : 'set',
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
      continue
    }

    // ---- $ python 变量操作 ----
    const scriptVar = line.match(/^\$\s*(\w+)\s*(\+|-|)\s*=\s*(\S+)/)
    if (scriptVar) {
      const op: VariableOperation = {
        varName: scriptVar[1],
        op: scriptVar[2] === '+' ? 'add' : scriptVar[2] === '-' ? 'subtract' : 'set',
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

    // ---- scene (背景) ----
    const sceneM = line.match(/^scene\s+(\S+)/)
    if (sceneM) {
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        background: { asset_id: sceneM[1] },
        characters: noChars,
        audio: emptyAudio,
      })
      continue
    }

    // ---- show (显示立绘) ----
    const showM = line.match(/^show\s+(\S+)/)
    if (showM) {
      const name = showM[1]
      addChar(name)
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        characters: {
          [name]: { sprite_id: name, char_id: name, position_slot: 'center', action: 'show' as const },
        },
        background: noBG,
        audio: emptyAudio,
      })
      continue
    }

    // ---- hide — ScriptWeaver 模型不支持独立 hide 行，跳过 ----

    // ---- play music ----
    const playM = line.match(/^play\s+music\s+"([^"]*)"/)
    if (playM) {
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        audio: { bgm: { asset_id: playM[1], volume: 1, loop: true }, ambient: null, se: [], voice: null },
        background: noBG,
        characters: noChars,
      })
      continue
    }

    // ---- play sound ----
    const playSfx = line.match(/^play\s+sound\s+"([^"]*)"/)
    if (playSfx) {
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        audio: { bgm: null, ambient: null, se: [playSfx[1]], voice: null },
        background: noBG,
        characters: noChars,
      })
      continue
    }

    // ---- 对白: "Speaker" "text" ----
    const dialogueM = line.match(/^"([^"]*)"\s+"([^"]*)"\s*$/)
    if (dialogueM && !inMenu) {
      const speaker = dialogueM[1].trim()
      const text = dialogueM[2]
      if (speaker) addChar(speaker)
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        speaker: speaker || null,
        dialogue: text,
        background: noBG,
        characters: noChars,
        audio: emptyAudio,
      })
      continue
    }

    // ---- 旁白/叙事（无引号的直接文本） ----
    if (!line.startsWith('$') && !line.startsWith('label') && !line.startsWith('scene')
      && !line.startsWith('show') && !line.startsWith('hide') && !line.startsWith('play')) {
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

    if (line && !line.startsWith('$') && !line.startsWith('init') && !line.startsWith('image')
      && !line.startsWith('transform') && !line.startsWith('return')) {
      warnings.push(`未识别的行: ${line.slice(0, 60)}`)
    }
  }

  return {
    deltas,
    characters,
    variables: variableDefs,
    warnings,
    lineCount: deltas.length,
    charCount: characters.length,
    varCount: variableDefs.length,
  }
}

/**
 * 从目录导入 Ren'Py 工程：读取所有 .rpy 文件并解析。
 * 在 Electron 中使用 window.electronAPI.fs 读取文件。
 */
export async function importRpyDirectory(dirPath: string): Promise<RpyImportResult> {
  const fsApi = window.electronAPI?.fs
  if (!fsApi) throw new Error('文件系统 API 不可用，请在 Electron 中打开')

  const files = await fsApi.readdir(dirPath)
  const rpyFiles = files.filter((f) => f.endsWith('.rpy'))

  if (rpyFiles.length === 0) {
    return { deltas: [], characters: [], variables: [], warnings: ['未找到 .rpy 文件'], lineCount: 0, charCount: 0, varCount: 0 }
  }

  const allDeltas: LineDelta[] = []
  const allChars: CharacterConfig[] = []
  const allVars: { name: string; value: string }[] = []
  const allWarnings: string[] = []
  const charSeen = new Set<string>()
  const varSeen = new Set<string>()

  for (const file of rpyFiles) {
    const fullPath = dirPath + (dirPath.endsWith('/') || dirPath.endsWith('\\') ? '' : '\\') + file
    const content = await fsApi.readFile(fullPath, 'utf-8')
    const result = parseRpy(content)

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
  }

  return {
    deltas: allDeltas,
    characters: allChars,
    variables: allVars,
    warnings: allWarnings,
    lineCount: allDeltas.length,
    charCount: allChars.length,
    varCount: allVars.length,
  }
}
