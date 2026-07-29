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
  stat(path: string): Promise<{ size: number } | null>
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

// ═══════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════

/**
 * 解析一段 Ren'Py 脚本，提取角色、变量、剧本行和素材引用。
 */
export function parseRpy(source: string): {
  deltas: LineDelta[]
  characters: CharacterConfig[]
  variables: { name: string; value: string }[]
  warnings: string[]
  /** 脚本中引用的图片名（如 "bg_park", "eileen happy"） */
  referencedImages: string[]
  /** 脚本中引用的音频文件名（保留原始路径） */
  referencedAudio: { path: string; type: 'bgm' | 'ambient' | 'se' | 'voice' }[]
} {
  const lines = source.split(/\r?\n/)
  const warnings: string[] = []
  const characters: CharacterConfig[] = []
  const variableDefs: { name: string; value: string }[] = []
  const charSet = new Set<string>()
  const varSet = new Set<string>()
  const refImages = new Set<string>()
  const refAudio: { path: string; type: 'bgm' | 'ambient' | 'se' | 'voice' }[] = []

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
      // 尝试提取 displayName: Character("名字", ...)
      const displayNameM = line.match(/Character\s*\(\s*"([^"]*)"/)
      if (displayNameM) {
        const existing = characters.find(c => c.charId === defineChar[1])
        if (existing) existing.displayName = displayNameM[1]
      }
      continue
    }

    // ---- default 变量 ----
    const defaultVar = line.match(/^default\s+(\w+)\s*=\s*(.+)/)
    if (defaultVar) {
      addVar(defaultVar[1], defaultVar[2].trim())
      continue
    }

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

    // ---- image 声明（收集引用，不生成 Delta）----
    const imageDef = line.match(/^image\s+(\S.*?)\s*=\s*"([^"]+)"/)
    if (imageDef) {
      // image eileen happy = "eileen_happy.png" → ref: "eileen happy"
      refImages.add(imageDef[1].trim())
      continue
    }

    // ---- image bg  = "..." (Ren'Py 自动背景图片声明) ----
    const imageBgDef = line.match(/^image\s+bg\s+(\S+)\s*=\s*"([^"]+)"/)
    if (imageBgDef) {
      refImages.add('bg_' + imageBgDef[1])
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
      const bgName = sceneM[1]
      refImages.add(bgName)
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
    const showM = line.match(/^show\s+(\S+)/)
    if (showM) {
      const name = showM[1]
      // Ren'Py show 后面的名字可能有空格，取完整的（如 "show eileen happy"）
      const fullExpr = showM[0].replace(/^show\s+/, '').trim()
      refImages.add(fullExpr)
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
      refAudio.push({ path: playM[1], type: 'bgm' })
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
      refAudio.push({ path: playSfx[1], type: 'se' })
      lineId++
      emitDelta({
        ...baseDelta(lineId),
        audio: { bgm: null, ambient: null, se: [playSfx[1]], voice: null },
        background: noBG,
        characters: noChars,
      })
      continue
    }

    // ---- voice ----
    const voiceM = line.match(/^voice\s+"([^"]*)"/)
    if (voiceM) {
      refAudio.push({ path: voiceM[1], type: 'voice' })
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
      && !line.startsWith('show') && !line.startsWith('hide') && !line.startsWith('play')
      && !line.startsWith('voice') && !line.startsWith('image') && !line.startsWith('call')
      && !line.startsWith('jump') && !line.startsWith('return') && !line.startsWith('window')) {
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
      && !line.startsWith('transform') && !line.startsWith('return') && !line.startsWith('call')
      && !line.startsWith('jump') && !line.startsWith('window')) {
      warnings.push(`未识别的行: ${line.slice(0, 60)}`)
    }
  }

  // 确保所有已添加到 characters 中的角色都带有 displayName（而不是空字符串）
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
    referencedImages: [...refImages],
    referencedAudio: refAudio,
  }
}

// ═══════════════════════════════════════════
// 素材扫描 & 匹配
// ═══════════════════════════════════════════

/**
 * 扫描目录下的所有图片和音频文件（递归）。
 */
export async function scanAssetFiles(dirPath: string): Promise<{
  images: { fileName: string; relativePath: string }[]
  audio: { fileName: string; relativePath: string }[]
}> {
  const fsApi = (window as any).electronAPI?.fs as FsApi | undefined
  if (!fsApi) return { images: [], audio: [] }
  const api = fsApi // narrowed for closure

  const images: { fileName: string; relativePath: string }[] = []
  const audio: { fileName: string; relativePath: string }[] = []

  async function walk(currentDir: string, relBase: string) {
    try {
      const entries = await api.readdir(currentDir)
      for (const entry of entries) {
        const full = currentDir + (currentDir.endsWith('/') || currentDir.endsWith('\\') ? '' : '\\') + entry
        const rel = relBase ? (relBase + '/' + entry) : entry
        // 用后缀判断是文件还是目录
        if (entry.includes('.')) {
          const lower = entry.toLowerCase()
          if (IMAGE_EXTENSIONS.has('.' + (lower.split('.').pop() || ''))) {
            images.push({ fileName: entry, relativePath: rel })
          } else if (AUDIO_EXTENSIONS.has('.' + (lower.split('.').pop() || ''))) {
            audio.push({ fileName: entry, relativePath: rel })
          }
        } else {
          // 可能是子目录，尝试递归
          await walk(full, rel).catch(() => { /* 无权限则跳过 */ })
        }
      }
    } catch { /* 目录不可读，跳过 */ }
  }

  await walk(dirPath, '')
  return { images, audio }
}

/**
 * 将脚本中的素材引用与文件系统中找到的真实文件进行匹配。
 */
export function matchAssets(
  referencedImages: string[],
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

  // 匹配图片：尝试 refName 与文件名（不含扩展名）匹配，或 refName 里的小写部分匹配
  const usedImageFiles = new Set<string>()
  for (const ref of referencedImages) {
    const refLow = ref.toLowerCase().replace(/\s+/g, '_')
    let best: typeof foundImages[0] | null = null

    for (const fi of foundImages) {
      if (usedImageFiles.has(fi.relativePath)) continue
      const stemLow = stem(fi.fileName).toLowerCase()
      // 精确匹配
      if (stemLow === refLow) { best = fi; break }
      // 部分匹配：文件名包含 ref 或 ref 包含文件名
      if (!best && (stemLow.includes(refLow) || refLow.includes(stemLow))) {
        best = fi
      }
      // Ren'Py 里 "eileen happy" → 文件名可能是 "eileen_happy.png"
      if (!best && stemLow === refLow.replace(/\s/g, '_')) { best = fi }
    }

    if (best) {
      usedImageFiles.add(best.relativePath)
      imageAssets.push({
        id: `rpy_img_${imageAssets.length}_${stem(best.fileName)}`,
        refName: ref,
        fileName: best.fileName,
        relativePath: best.relativePath,
        kind: 'image',
        sizeBytes: 0, // 由 main 进程后续填充
      })
    } else {
      unmatchedImages.push(ref)
    }
  }

  // 匹配音频
  const usedAudioFiles = new Set<string>()
  for (const ref of referencedAudio) {
    const refName = normalizeRef(ref.path)
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

  const files = await api.readdir(dirPath)
  const rpyFiles = files.filter((f) => f.endsWith('.rpy') || f.endsWith('.rpym'))

  // 扫描素材文件
  const { images: foundImages, audio: foundAudio } = await scanAssetFiles(dirPath)

  const allDeltas: LineDelta[] = []
  const allChars: CharacterConfig[] = []
  const allVars: { name: string; value: string }[] = []
  const allWarnings: string[] = []
  const allRefImages = new Set<string>()
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

  for (const file of rpyFiles) {
    const fullPath = dirPath + (dirPath.endsWith('/') || dirPath.endsWith('\\') ? '' : '\\') + file
    let content: string
    try {
      content = await fsApi.readFile(fullPath, 'utf-8')
    } catch {
      allWarnings.push(`[${file}] 无法读取文件`)
      continue
    }
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
    for (const img of result.referencedImages) allRefImages.add(img)
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
    [...allRefImages],
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
