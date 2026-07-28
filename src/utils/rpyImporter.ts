/**
 * Ren'Py 工程导入器
 * 解析 .rpy 文件，映射为 ScriptWeaver 的 LineDelta[] + CharacterConfig[] + GlobalVariable[]
 */

import type { LineDelta, CharacterConfig, AssetItem } from '@/core/types'

// ---- 解析结果 ----
export interface RpyImportResult {
  deltas: LineDelta[]
  characters: CharacterConfig[]
  variables: { name: string; value: string }[]
  warnings: string[]
}

interface ParseState {
  inMenu: boolean
  menuChoices: Array<{ text: string; label: string }>
  menuTargets: string[]
  inPython: boolean
  indent: number
  lineIdx: number
  warnings: string[]
}

// ---- 逐行解析器 ----
export function parseRpySource(source: string): RpyImportResult {
  const lines = source.split(/\r?\n/)
  const deltas: LineDelta[] = []
  const chars: CharacterConfig[] = []
  const vars: { name: string; value: string }[] = []
  const st: ParseState = { inMenu: false, menuChoices: [], menuTargets: [], inPython: false, indent: 0, lineIdx: 0, warnings: [] }

  const emit = (d: LineDelta) => { deltas.push(d) }

  for (st.lineIdx = 0; st.lineIdx < lines.length; st.lineIdx++) {
    const raw = lines[st.lineIdx]
    const trimmed = raw.trimStart()
    if (!trimmed || trimmed.startsWith('#')) continue // 跳过空行/注释

    const indent = raw.length - trimmed.length

    // 退出 menu 块
    if (st.inMenu && (indent <= st.indent || trimmed.startsWith('label'))) {
      flushMenu(deltas, st)
    }

    // ---- label ----
    const labelM = trimmed.match(/^label\s+(\w+)\s*:/)
    if (labelM) {
      // 如果上一个也是 label，拆开
      emit({ kind: 'dialogue', line_id: genId(deltas), speaker: '', text: '', label: labelM[1], audio: {} })
      continue
    }

    // ---- return ----
    if (trimmed === 'return') {
      emit({ kind: 'dialogue', line_id: genId(deltas), speaker: '', text: '<return>', audio: {} })
      continue
    }

    // ---- jump / call ----
    const jumpM = trimmed.match(/^(jump|call)\s+(\w+)/)
    if (jumpM) {
      emit({ kind: 'dialogue', line_id: genId(deltas), speaker: '', text: `<${jumpM[1]}> ${jumpM[2]}`, audio: {} })
      continue
    }

    // ---- scene (背景变更) ----
    const sceneM = trimmed.match(/^scene\s+(\w+)(?:\s+with\s+(\w+))?/)
    if (sceneM) {
      emit({ kind: 'dialogue', line_id: genId(deltas), speaker: '', text: '', background: sceneM[1], audio: {} })
      continue
    }

    // ---- show / hide ----
    const showM = trimmed.match(/^show\s+(\w+)(?:\s+(.+))?/)
    if (showM) {
      const name = showM[1]
      const at = showM[2]?.trim()
      const d: LineDelta = { kind: 'dialogue', line_id: genId(deltas), speaker: '', text: '', audio: {} }
      d.characters = d.characters || []
      d.characters.push({ id: name, action: 'show', sprite_id: name, position_slot: at || 'center', scale: 1 })
      emit(d)
      continue
    }
    const hideM = trimmed.match(/^hide\s+(\w+)/)
    if (hideM) {
      const d: LineDelta = { kind: 'dialogue', line_id: genId(deltas), speaker: '', text: '', audio: {} }
      d.characters = d.characters || []
      d.characters.push({ id: hideM[1], action: 'hide', sprite_id: '', position_slot: 'center', scale: 1 })
      emit(d)
      continue
    }

    // ---- $ python ----
    if (trimmed.startsWith('$ ')) {
      const expr = trimmed.slice(2)
      emit({ kind: 'dialogue', line_id: genId(deltas), speaker: '', text: `\${${expr}}`, audio: {} })
      continue
    }

    // ---- define / default (角色和变量) ----
    const defineM = trimmed.match(/^define\s+(\w+)\s*=\s*Character\(["'](.*?)["']/)
    if (defineM) {
      const varname = defineM[1]
      const dispname = defineM[2] || varname
      if (!chars.find((c) => c.variableName === varname)) {
        chars.push({
          variableName: varname,
          displayName: dispname,
          color: '#ffffff',
        })
      }
      continue
    }
    const defaultM = trimmed.match(/^default\s+(\w+)\s*=\s*(.+)/)
    if (defaultM) {
      vars.push({ name: defaultM[1], value: defaultM[2].trim() })
      continue
    }

    // ---- menu: ----
    if (trimmed === 'menu:') {
      st.inMenu = true
      st.indent = indent
      st.menuChoices = []
      st.menuTargets = []
      continue
    }
    // menu 内的 choice 行："text" (jump label):
    if (st.inMenu && indent > st.indent) {
      const choiceM = trimmed.match(/^"(.+)"(?:\s*:\s*\{?.*?\}?\s*)?(?:\s*\(jump\s+(\w+)\))?(?:\s*:\s*$)?/)
      if (choiceM) {
        const text = choiceM[1]
        let target = ''
        // 后续行可能有 jump target
        const nextLine = lines[st.lineIdx + 1]?.trimStart()
        if (nextLine && nextLine.startsWith('jump ')) {
          target = nextLine.slice(5).trim()
          st.lineIdx++ // 吃掉下一行
        }
        st.menuChoices.push({ text, label: target || `choice_${st.menuChoices.length + 1}` })
        continue
      }
    }

    // ---- 对话： "Speaker" "text" 或 speaker "text" ----
    const dlM = trimmed.match(/^"([^"]+)"\s+"(.+)"$/)
    if (dlM) {
      emit({ kind: 'dialogue', line_id: genId(deltas), speaker: dlM[1], text: dlM[2], audio: {} })
      continue
    }
    const dl2M = trimmed.match(/^(\w+)\s+"(.+)"$/)
    if (dl2M) {
      emit({ kind: 'dialogue', line_id: genId(deltas), speaker: dl2M[1], text: dl2M[2], audio: {} })
      continue
    }

    // ---- Python 块忽略 ----
    if (trimmed.startsWith('python:')) { st.inPython = true; continue }
    if (st.inPython && indent <= st.indent) { st.inPython = false }
    if (st.inPython) continue

    // ---- 未识别的行：记录警告 ----
    st.warnings.push(`第 ${st.lineIdx + 1} 行未识别: ${trimmed.slice(0, 60)}`)
  }

  // 最后还可能遗留 menu
  if (st.inMenu) flushMenu(deltas, st)

  return { deltas, characters: chars, variables: vars, warnings: st.warnings }
}

function flushMenu(deltas: LineDelta[], st: ParseState) {
  if (st.menuChoices.length === 0) { st.inMenu = false; return }
  const d: LineDelta = {
    kind: 'dialogue',
    line_id: genId(deltas),
    speaker: '',
    text: '',
    choices: st.menuChoices.map((c) => ({ ...c, label: c.label, id: `imp_${c.label}` })),
    audio: {},
  }
  deltas.push(d)
  st.inMenu = false
}

function genId(deltas: LineDelta[]): string {
  return `imp_${deltas.length + 1}`
}

// ---- 从目录读取 .rpy 文件（需要 Electron 环境） ----
export async function importRpyDirectory(dirPath: string): Promise<RpyImportResult> {
  const fs = window.electronAPI?.fs
  if (!fs) throw new Error('需在 Electron 环境中运行导入')

  const result: RpyImportResult = { deltas: [], characters: [], variables: [], warnings: [] }

  // 列出该目录下所有 .rpy 文件
  const files: string[] = await fs.readdir(dirPath)
  const rpyFiles = files.filter((f) => f.endsWith('.rpy'))

  for (const file of rpyFiles) {
    const filePath = `${dirPath}/${file}`
    const content: string = await fs.readFile(filePath, 'utf-8')
    const parsed = parseRpySource(content)
    result.deltas.push(...parsed.deltas)
    result.characters.push(...parsed.characters)
    result.variables.push(...parsed.variables)
    if (parsed.warnings.length > 0) {
      result.warnings.push(`[${file}] ${parsed.warnings.length} 条未识别行`)
    }
  }

  return result
}
