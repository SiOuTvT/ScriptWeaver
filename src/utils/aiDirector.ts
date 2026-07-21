// ============================================================
// ScriptWeaver - AI 智能剧本助手与自动打点（B 方向）
// 纯函数模块：所有 AI 编排逻辑（提示词 / DSL 解析 / 打点解析器 /
// 事务提交拼装 / SSE 流式读取）全部收敛于此，不 import store / React，
// 状态机内核零侵入。唯一出口是调用方在流结束后使用既有 setDraftDeltas 提交。
// ============================================================

import type {
  AssetItem,
  CharacterConfig,
  CharacterDelta,
  ChoiceItem,
  GlobalVarType,
  LineDelta,
  LineType,
  PositionSlot,
  VariableOperation,
} from '@/core/types'

// ===================== AIConfig 持久化 =====================

export type AIProvider = 'openai' | 'deepseek' | 'openrouter' | 'custom'

export interface AIConfig {
  provider: AIProvider
  endpoint: string
  apiKey: string
  model: string
  /** 采样温度 0-1 */
  temperature: number
  /** 最大生成 Token */
  maxTokens: number
  /** TTS 合成模型（独立于对话模型，默认 tts-1；OpenAI 兼容 /audio/speech） */
  ttsModel?: string
}

export const PROVIDER_PRESETS: Record<Exclude<AIProvider, 'custom'>, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  // Claude 等通过 OpenRouter 的 OpenAI 兼容接口接入
  openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'anthropic/claude-3.5-sonnet' },
}

const STORAGE_KEY = 'scriptweaver_ai_config'

/** 默认 AI 配置（dev 渲染端降级用；主进程有独立持久化，密钥不在此） */
export function defaultAIConfig(): AIConfig {
  return {
    provider: 'openai',
    endpoint: PROVIDER_PRESETS.openai.endpoint,
    apiKey: '',
    model: PROVIDER_PRESETS.openai.model,
    temperature: 0.7,
    maxTokens: 2000,
    ttsModel: 'tts-1',
  }
}

/**
 * 渲染端 dev 降级读取（仅在无 electronAPI 的纯 web 环境使用）。
 * 桌面端密钥由主进程持有，渲染进程通过 ai:getConfig 拿到的是已脱敏配置。
 */
export function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        provider: p.provider ?? 'openai',
        endpoint: p.endpoint ?? PROVIDER_PRESETS.openai.endpoint,
        apiKey: p.apiKey ?? '',
        model: p.model ?? PROVIDER_PRESETS.openai.model,
        temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
        maxTokens: typeof p.maxTokens === 'number' ? p.maxTokens : 2000,
      }
    }
  } catch {
    /* noop */
  }
  return defaultAIConfig()
}

export function saveConfig(cfg: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch {
    /* 隐私模式下存储失败，忽略 */
  }
}

/** 选择厂商预设时回填 endpoint / model（custom 仅切换 provider） */
export function applyPreset(cfg: AIConfig, provider: AIProvider): AIConfig {
  if (provider === 'custom') return { ...cfg, provider }
  const p = PROVIDER_PRESETS[provider]
  return { ...cfg, provider, endpoint: p.endpoint, model: p.model }
}

// ===================== 模式与 DSL 类型 =====================

export type AIMode = 'mentor' | 'director' | 'blueprint'

export interface DirectorCharacter {
  sprite_id: string
  position_slot: string
  action: 'show' | 'hide' | '__CLEAR__'
  pos_x?: number
  pos_y?: number
}

export interface DirectorLine {
  speaker: string | null
  dialogue: string
  background?: { tag: string; transition?: string } | null
  characters?: Record<string, DirectorCharacter>
  tags?: {
    emotion?: string[]
    environment?: string[]
    sfx?: string[]
    bgm?: string[]
  }
  confidence?: number
  /** 剧情块标签锚点（对应 Ren'Py 的 label），供选择支 jump 落点 */
  label?: string
  /** 行类型：'dialogue'（默认）或 'choice'（选择支行） */
  line_type?: 'dialogue' | 'choice'
  /** 选择支提示语（menu 标题），仅 line_type === 'choice' 时有效 */
  prompt?: string
  /** 选项数组，仅 line_type === 'choice' 时有效 */
  choices?: DirectorChoice[]
  /** 本行触发的变量操作（如 heroine_trust += 1） */
  variableOps?: DirectorVariableOp[]
}

/** 选择支单个选项（导演模式 AI 生成的 menu 项） */
export interface DirectorChoice {
  /** 选项按钮文本（玩家可见） */
  text: string
  /** 跳转目标标签名（Ren'Py label）；留空 = 顺序继续 */
  target_label?: string
  /** 前置变量条件（Python 表达式），如 "heroine_trust >= 5" */
  condition?: string
  /** 选项内联变量操作（选择后立刻生效） */
  ops?: DirectorVariableOp[]
}

/** 单行触发的变量操作（导演/蓝图模式 AI 生成） */
export interface DirectorVariableOp {
  op: 'set' | 'add' | 'subtract' | 'toggle'
  /** 变量名（Ren'Py 合法：小写字母开头，仅含 [a-z0-9_]） */
  varName: string
  /** 操作数：set 赋值 / add|subtract 增量；toggle 忽略 */
  value?: number | boolean
}

/** 剧情蓝图的节点（Story Tree Node） */
export interface DirectorBlueprintNode {
  /** 节点唯一 ID，同时作为该行在导出中的 label 名 */
  id: string
  /** 节点种类：起点 / 分支 / 结局 */
  kind: 'start' | 'branch' | 'ending'
  /** 节点标题（如「废墟初遇」「救助少女」「真结局」） */
  title: string
  /** 一句话摘要 */
  summary?: string
}

/** 剧情蓝图的边（选择支跳转关系） */
export interface DirectorBlueprintEdge {
  /** 起点节点 ID */
  from: string
  /** 触发该跳转的选项文本 */
  via: string
  /** 目标节点 ID */
  to: string
  /** 该跳转的前置条件（可选） */
  condition?: string
}

/**
 * 剧情蓝图：AI 返回的「网状分歧树」完整描述。
 * - nodes / edges：高层剧情树（供 UI 直接绘制节点关系图）
 * - lines：已按深度优先铺平的剧本行序列；每个节点的入口行携带 label（= 节点 id），
 *   选择支的 target_label 指向对应节点 id，从而构成可导出、可跳转的网状剧本。
 */
export interface DirectorBlueprint {
  title?: string
  nodes?: DirectorBlueprintNode[]
  edges?: DirectorBlueprintEdge[]
  lines: DirectorLine[]
}

/** 向后兼容别名 */
export type DirectorDirective = DirectorBlueprint

export interface ResolutionReport {
  resolved: string[]
  unresolved: string[]
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ===================== DSL 健壮解析 =====================

/** 从模型可能夹带的文本/代码围栏中抽取最外层 JSON 对象 */
export function parseDirective(jsonText: string): DirectorBlueprint {
  let text = jsonText.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 响应格式错误：未找到 JSON 对象')
  }
  const obj = JSON.parse(text.slice(start, end + 1))
  if (!obj || !Array.isArray(obj.lines)) {
    throw new Error('AI 响应格式错误：缺少 lines 数组')
  }
  const blueprint: DirectorBlueprint = { lines: obj.lines }
  if (typeof obj.title === 'string') blueprint.title = obj.title
  if (Array.isArray(obj.nodes)) blueprint.nodes = obj.nodes
  if (Array.isArray(obj.edges)) blueprint.edges = obj.edges
  return blueprint
}

// ===================== 标签索引与解析器 =====================

/** 分词：保留字母/数字/汉字，转小写 */
export function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9一-龥]+/g) ?? []
}

/** 构建 关键词 → 素材[] 的索引（tags 优先，退化为 name/fileName 分词） */
export function buildTagIndex(assets: AssetItem[]): Map<string, AssetItem[]> {
  const idx = new Map<string, AssetItem[]>()
  const add = (kw: string, a: AssetItem) => {
    const k = kw.toLowerCase().trim()
    if (!k) return
    const arr = idx.get(k)
    if (arr) arr.push(a)
    else idx.set(k, [a])
  }
  for (const a of assets) {
    if (a.tags) for (const t of a.tags) add(t, a)
    for (const kw of tokenize(a.name)) add(kw, a)
    for (const kw of tokenize(a.fileName.replace(/\.[^.]+$/, ''))) add(kw, a)
  }
  return idx
}

function findAsset(
  idx: Map<string, AssetItem[]>,
  tag: string,
  type: AssetItem['type'],
): AssetItem | null {
  const candidates = idx.get(tag.toLowerCase())
  if (!candidates) return null
  return candidates.find((a) => a.type === type) ?? null
}

/** 环境音优先级：越靠前越"重"，取第一个可解析者作为主环境 */
const ENV_PRIORITY = [
  'storm', 'rain', 'snow', 'wind', 'thunder',
  'night', 'forest', 'cafe', 'school', 'room',
  'street', 'park', 'beach', 'mountain', 'sea', 'city',
]

function findVoiceForSpeaker(
  speaker: string,
  chars: CharacterConfig[],
  assets: AssetItem[],
): string | null {
  const char = chars.find((c) => c.charId === speaker || c.displayName === speaker)
  const name = char?.displayName ?? speaker
  const loweredName = name.toLowerCase()
  const v = assets.find(
    (a) =>
      a.type === 'audio' &&
      (a.name.toLowerCase().includes(loweredName) ||
        a.fileName.toLowerCase().includes(speaker.toLowerCase())) &&
      /voice|语音|v_/.test(a.name + a.fileName),
  )
  return v?.id ?? null
}

/**
 * 核心：将 AI 返回的语义标签映射为真实资产引用，写入 audio 轨道。
 * - environment → ambient（主环境，独立通道，不抢 BGM）
 * - sfx         → se[]（可挂多个音效打点）
 * - bgm         → bgm
 * - emotion + 说话人 → 机会性挂载 voice（有对白即有语音）
 */
export function resolveAudioDirective(
  tags: NonNullable<DirectorLine['tags']>,
  ctx: { index: Map<string, AssetItem[]>; assets: AssetItem[]; characterConfigs: CharacterConfig[]; speaker?: string | null },
): { audio: LineDelta['audio']; report: ResolutionReport } {
  const report: ResolutionReport = { resolved: [], unresolved: [] }
  const audio: LineDelta['audio'] = { bgm: null, ambient: null, se: [], voice: null }

  // ---- environment → ambient ----
  let ambientResolved = false
  for (const e of ENV_PRIORITY) {
    if ((tags.environment ?? []).includes(e)) {
      const asset = findAsset(ctx.index, e, 'audio')
      if (asset) {
        audio.ambient = { asset_id: asset.id, volume: 0.3, loop: true, fade_in_ms: 1500 }
        report.resolved.push(`环境音:${e}`)
      } else {
        report.unresolved.push(`environment:${e}`)
      }
      ambientResolved = true
      break
    }
  }
  if (!ambientResolved) {
    for (const e of tags.environment ?? []) {
      const asset = findAsset(ctx.index, e, 'audio')
      if (asset) {
        audio.ambient = { asset_id: asset.id, volume: 0.3, loop: true, fade_in_ms: 1500 }
        report.resolved.push(`环境音:${e}`)
        break
      }
      report.unresolved.push(`environment:${e}`)
    }
  }

  // ---- sfx → se[] ----
  for (const s of tags.sfx ?? []) {
    const asset = findAsset(ctx.index, s, 'audio')
    if (asset) {
      audio.se.push(asset.id)
      report.resolved.push(`音效:${s}`)
    } else {
      report.unresolved.push(`sfx:${s}`)
    }
  }

  // ---- bgm ----
  for (const b of tags.bgm ?? []) {
    const asset = findAsset(ctx.index, b, 'audio')
    if (asset) {
      audio.bgm = { asset_id: asset.id, volume: 0.6, loop: true }
      report.resolved.push(`BGM:${b}`)
      break
    }
    report.unresolved.push(`bgm:${b}`)
  }

  // ---- emotion + 说话人 → voice（机会性） ----
  if (ctx.speaker && (tags.emotion?.length ?? 0) > 0) {
    const vid = findVoiceForSpeaker(ctx.speaker, ctx.characterConfigs, ctx.assets)
    if (vid) {
      audio.voice = vid
      report.resolved.push(`语音:${ctx.speaker}`)
    }
  }

  return { audio, report }
}

// ===================== 单行 Delta 解析 =====================

function resolveSpeaker(speaker: string | null | undefined, chars: CharacterConfig[]): string | null {
  if (!speaker) return null
  const c = chars.find((x) => x.charId === speaker || x.displayName === speaker)
  return c ? c.displayName : speaker
}

function resolveCharId(key: string, chars: CharacterConfig[]): string | null {
  const c = chars.find((x) => x.charId === key || x.displayName === key)
  return c ? c.charId : null
}

function resolveSlot(slot: string | undefined, slots: PositionSlot[]): string {
  if (slot && slots.some((s) => s.id === slot)) return slot
  return slots[0]?.id ?? 'left'
}

/** DirectorVariableOp → VariableOperation（导出为 $ 表达式） */
function mapVarOp(op: DirectorVariableOp): VariableOperation {
  return { varName: op.varName, op: op.op, value: op.value }
}

/** DirectorChoice → ChoiceItem（选项内联变量操作一并映射） */
function mapChoice(c: DirectorChoice, seq: number): ChoiceItem {
  return {
    uid: `c_ai_${Date.now().toString(36)}_${seq}`,
    text: c.text,
    target_label: c.target_label ?? '',
    condition: c.condition,
    ops: c.ops?.map(mapVarOp),
  }
}

/** 将一条导演指令解析为 LineDelta，并计算 ai_meta 与 ResolutionReport */
export function resolveDirectiveToDelta(
  line: DirectorLine,
  ctx: {
    index: Map<string, AssetItem[]>
    assets: AssetItem[]
    characterConfigs: CharacterConfig[]
    slots: PositionSlot[]
    lineId: string
    span: [number, number]
  },
): { delta: LineDelta; report: ResolutionReport } {
  const report: ResolutionReport = { resolved: [], unresolved: [] }

  const speaker = resolveSpeaker(line.speaker, ctx.characterConfigs)

  let background: LineDelta['background'] = null
  if (line.background) {
    const bg = findAsset(ctx.index, line.background.tag, 'background')
    if (bg) background = { asset_id: bg.id, transition: line.background.transition }
    else report.unresolved.push(`background:${line.background.tag}`)
  }

  const characters: Record<string, CharacterDelta> = {}
  for (const [key, c] of Object.entries(line.characters ?? {})) {
    const charId = resolveCharId(key, ctx.characterConfigs)
    if (!charId) {
      report.unresolved.push(`character:${key}`)
      continue
    }
    const charDelta: CharacterDelta = {
      sprite_id: c.sprite_id,
      position_slot: resolveSlot(c.position_slot, ctx.slots),
      action: c.action,
      char_id: charId,
    }
    if (typeof c.pos_x === 'number') charDelta.pos_x = c.pos_x
    if (typeof c.pos_y === 'number') charDelta.pos_y = c.pos_y
    characters[charId] = charDelta
  }

  const audioRes = resolveAudioDirective(line.tags ?? {}, {
    index: ctx.index,
    assets: ctx.assets,
    characterConfigs: ctx.characterConfigs,
    speaker: line.speaker,
  })
  report.resolved.push(...audioRes.report.resolved)
  report.unresolved.push(...audioRes.report.unresolved)

  // ---- 选择支：line_type / choices / prompt ----
  let lineType: LineType | undefined
  let choices: ChoiceItem[] | undefined
  let prompt: string | undefined
  if (line.line_type === 'choice') {
    lineType = 'choice'
    choices = (line.choices ?? []).map((c, i) => mapChoice(c, i))
    prompt = line.prompt ?? ''
    if (choices.length === 0) report.unresolved.push('choice:空选项')
  }

  // ---- 本行变量操作（如 heroine_trust += 1） ----
  const variableOps = (line.variableOps ?? []).length
    ? line.variableOps!.map(mapVarOp)
    : undefined

  const confidence = typeof line.confidence === 'number' ? line.confidence : 0.5
  const needsReview = report.unresolved.length > 0 || confidence < 0.6

  const delta: LineDelta = {
    line_id: ctx.lineId,
    speaker,
    dialogue: line.dialogue ?? '',
    background,
    characters,
    audio: audioRes.audio,
    ai_meta: { confidence, needs_review: needsReview, source_text_span: ctx.span },
    ...(line.label?.trim() ? { label: line.label.trim() } : {}),
    ...(lineType ? { line_type: lineType, choices, prompt } : {}),
    ...(variableOps ? { variableOps } : {}),
  }
  return { delta, report }
}

// ===================== 事务提交拼装 =====================

export interface ResolveBlueprintResult {
  /** 解析后的剧本行序列（可直接交付 composeDeltas） */
  plan: LineDelta[]
  /** 解析报告（素材绑定命中 / 待复核） */
  report: ResolutionReport
  /** 携带 label 的行索引（0-based）与标签名，便于 UI 高亮节点入口 */
  labelLines: { index: number; label: string }[]
}

/**
 * 将整张剧情蓝图解析为 LineDelta 序列。
 * 复用 resolveDirectiveToDelta 逐行解析（含背景/立绘/音频/选择支/变量），
 * 同时收集行号 → label 映射供 UI 展示节点落点。
 */
export function resolveBlueprint(
  blueprint: DirectorBlueprint,
  ctx: {
    index: Map<string, AssetItem[]>
    assets: AssetItem[]
    characterConfigs: CharacterConfig[]
    slots: PositionSlot[]
    baseLineId: number
  },
): ResolveBlueprintResult {
  const plan: LineDelta[] = []
  const report: ResolutionReport = { resolved: [], unresolved: [] }
  const labelLines: { index: number; label: string }[] = []
  blueprint.lines.forEach((line, i) => {
    const { delta, report: r } = resolveDirectiveToDelta(line, {
      index: ctx.index,
      assets: ctx.assets,
      characterConfigs: ctx.characterConfigs,
      slots: ctx.slots,
      lineId: `L${ctx.baseLineId + i + 1}`,
      span: [0, 0],
    })
    if (delta.label) labelLines.push({ index: plan.length, label: delta.label })
    plan.push(delta)
    report.resolved.push(...r.resolved)
    report.unresolved.push(...r.unresolved)
  })
  return { plan, report, labelLines }
}

export type ApplyMode = 'replace' | 'insert' | 'edit'

/**
 * 拼装最终 deltas 数组（纯函数）。三种形态都收敛为单个数组，
 * 调用方在流结束后用既有 setDraftDeltas(数组) 一次性提交 → 仅一条撤销记录。
 */
export function composeDeltas(
  existing: LineDelta[],
  plan: LineDelta[],
  anchor: number,
  mode: ApplyMode = 'insert',
): LineDelta[] {
  if (mode === 'replace') return [...plan]
  if (mode === 'edit') {
    if (anchor < 0 || anchor >= existing.length || plan.length === 0) return existing
    return existing.map((d, i) => (i === anchor ? plan[0] : d))
  }
  // insert：插入到 anchor 之后
  const clamped = Math.max(0, Math.min(existing.length, anchor + 1))
  return [...existing.slice(0, clamped), ...plan, ...existing.slice(clamped)]
}

/**
 * 在已有剧本中定位「选中行所在的剧情块」范围 [start, end)。
 * 剧情块 = 从某个带 label 的入口行起，到下一个带 label 的入口行之前。
 * - 选中行自身带 label → 块以该行为起点
 * - 选中行在某带 label 块内部 → 块以最近的上一层 label 行为起点
 * - 全剧本无任何 label → 退化为选中单行 [i, i+1)
 */
export function findBlockRange(deltas: LineDelta[], index: number): { start: number; end: number } {
  const len = deltas.length
  if (len === 0) return { start: 0, end: 0 }
  const i = Math.max(0, Math.min(index, len - 1))

  let start = i
  while (start > 0 && !deltas[start].label) start--

  // 没有任何带 label 的入口行 → 退化为单行
  if (!deltas[start].label) {
    return { start: i, end: Math.min(i + 1, len) }
  }

  let end = start + 1
  while (end < len && !deltas[end].label) end++
  return { start, end }
}

/** 用 plan 替换 existing 的 [start, end) 区间（用于「替换选中剧情块」） */
export function replaceBlock(
  existing: LineDelta[],
  plan: LineDelta[],
  start: number,
  end: number,
): LineDelta[] {
  const s = Math.max(0, Math.min(start, existing.length))
  const e = Math.max(s, Math.min(end, existing.length))
  return [...existing.slice(0, s), ...plan, ...existing.slice(e)]
}

// ===================== 提示词工程 =====================

/** 从素材库提炼音频语义提示，注入 System Prompt 的资产上下文 */
export function buildAudioHints(assets: AssetItem[]): string {
  const env = assets
    .filter((a) => a.type === 'audio' && /ambient|环境|雨|风|虫|海|雪/.test(a.name))
    .map((a) => a.name)
  const sfx = assets
    .filter((a) => a.type === 'audio' && /se|音效|脚步|门|雷|玻璃|枪/.test(a.name))
    .map((a) => a.name)
  const bgm = assets
    .filter((a) => a.type === 'audio' && /bgm|背景音乐|音乐/.test(a.name))
    .map((a) => a.name)
  const parts: string[] = []
  if (env.length) parts.push(`环境音可用：${env.join('/')}`)
  if (sfx.length) parts.push(`音效可用：${sfx.join('/')}`)
  if (bgm.length) parts.push(`BGM可用：${bgm.join('/')}`)
  return parts.join('；') || '暂无'
}

export function buildSystemPrompt(
  mode: AIMode,
  ctx: {
    characters: { charId: string; displayName: string }[]
    backgrounds: string[]
    audioHints: string
    variables?: { name: string; type: GlobalVarType }[]
  },
): string {
  const charList = ctx.characters.map((c) => `${c.charId}(${c.displayName})`).join(', ') || '无'
  const bgList = ctx.backgrounds.join(', ') || '无'
  const common =
    '你是 ScriptWeaver 的剧本副导演，服务于视觉小说（Ren\'Py）创作。中文优先；绝不杜撰用户未提供的角色或背景。'

  if (mode === 'mentor') {
    return (
      `${common}\n` +
      '【文学导师模式】你负责润色台词、扩写大纲、改写语气。请只返回 JSON：' +
      '{"rewritten":"改写后的全文","notes":["修改理由1","修改理由2"]}。不要包裹 markdown 代码块。'
    )
  }

  if (mode === 'blueprint') {
    return buildBlueprintSystemPrompt({
      characters: ctx.characters,
      backgrounds: ctx.backgrounds,
      audioHints: ctx.audioHints,
      variables: ctx.variables ?? [],
    })
  }

  return (
    `${common}\n` +
    '【舞台监督模式】把剧情需求编译成时间轴元数据，严格返回 JSON：' +
    '{"lines":[{"speaker":角色charId或displayName或null,"dialogue":"台词",' +
    '"background":{"tag":"背景语义标签","transition":"dissolve"},' +
    '"characters":{"charId":{"sprite_id":"表情ID","position_slot":"left|center|right","action":"show"}},' +
    '"tags":{"emotion":["绝望","痛哭"],"environment":["rain","storm"],"sfx":["thunder"],"bgm":["tense"]},' +
    '"confidence":0.8}]}。\n' +
    '★ 只输出 JSON，禁止 markdown 代码块包裹；tags 用语义标签而非素材ID，本地解析器会绑定真实素材。\n' +
    `当前可用角色：${charList}\n` +
    `当前背景库：${bgList}\n` +
    `音频语义提示：${ctx.audioHints}\n` +
    '优先复用已有角色/背景，仅在确无匹配时新增。'
  )
}

export function buildUserPrompt(desc: string, mode: AIMode, opts?: { branches?: number; endings?: number }): string {
  if (mode === 'mentor') return `请润色/扩写以下文本：\n"""${desc}"""`
  if (mode === 'blueprint') return buildBlueprintUserPrompt(desc, opts)
  return `剧情需求：${desc}\n请生成 5-12 行剧本元数据。`
}

// ===================== 剧情蓝图提示词 =====================

/**
 * 构建「剧情蓝图」系统提示：要求 AI 返回 nodes / edges / lines 三段式，
 * 输出一张可导出、可跳转的网状分歧树。变量库注入以使 AI 复用既有变量名。
 */
export function buildBlueprintSystemPrompt(ctx: {
  characters: { charId: string; displayName: string }[]
  backgrounds: string[]
  audioHints: string
  variables: { name: string; type: GlobalVarType }[]
}): string {
  const charList = ctx.characters.map((c) => `${c.charId}(${c.displayName})`).join(', ') || '无'
  const bgList = ctx.backgrounds.join(', ') || '无'
  const varList = ctx.variables.map((v) => `${v.name}:${v.type}`).join(', ') || '无（可新增）'
  return (
    '你是 ScriptWeaver 的剧情架构师，服务于视觉小说（Ren\'Py）创作。中文优先。\n' +
    '根据作者给出的核心梗概，规划一张完整的「网状分歧树」剧本蓝图。\n' +
    '必须只输出一个 JSON 对象（禁止 markdown 代码块包裹），结构如下：\n' +
    '{\n' +
    '  "title": "剧本标题",\n' +
    '  "nodes": [{"id":"start","kind":"start","title":"起点标题","summary":"一句话摘要"}],\n' +
    '  "edges": [{"from":"start","via":"选项文本","to":"branch_a"}],\n' +
    '  "lines": [ /* 按深度优先铺平的剧本行，见下 */ ]\n' +
    '}\n' +
    '节点 kind 取值：start（唯一起点）/ branch（分歧分支）/ ending（结局，可多个）。\n' +
    'lines 为有序数组，按「起点 → 分支A → 分支B → 结局」的深度优先顺序铺平；' +
    '每个节点的入口行必须带 "label" 字段且等于该节点 id，使选择支 target_label 能精准跳转。\n' +
    '每行 line 字段：\n' +
    '  - speaker: 角色 charId 或 displayName，旁白用 null\n' +
    '  - dialogue: 台词文本\n' +
    '  - background: {"tag":"背景语义标签","transition":"dissolve"}，无则省略\n' +
    '  - characters: {"charId":{"sprite_id":"表情ID","position_slot":"left|center|right","action":"show"}}\n' +
    '  - tags: {"emotion":["绝望"],"environment":["rain"],"sfx":["thunder"],"bgm":["tense"]}\n' +
    '  - label: 仅节点入口行填写（= 节点 id）\n' +
    '  - line_type: "choice" 表示选择支行，需同时给 prompt 与 choices：\n' +
    '      choices: [{"text":"选项文本","target_label":"branch_a","condition":"信任>=5","ops":[{"op":"add","varName":"信任","value":1}]}]\n' +
    '      target_label 必须指向某个 nodes[].id；condition 为可选 Python 表达式；ops 为选项内联变量操作\n' +
    '  - variableOps: 行级变量操作数组，如 [{"op":"add","varName":"信任","value":1}]，用于推进好感或旗帜\n' +
    'AI 自动推理并挂载 character_id（角色）、emotion（表情）、background（场景）；优先复用已有角色/背景/变量。\n' +
    `当前可用角色：${charList}\n` +
    `当前背景库：${bgList}\n` +
    `当前变量库：${varList}\n` +
    `音频语义提示：${ctx.audioHints}\n` +
    '语义标签（tags / background.tag）由本地解析器绑定真实素材，不要直接写素材文件名。'
  )
}

export function buildBlueprintUserPrompt(desc: string, opts?: { branches?: number; endings?: number }): string {
  const parts = [`核心梗概：${desc}`]
  if (opts?.branches && opts.branches > 0) parts.push(`请规划约 ${opts.branches} 条主要分歧分支。`)
  if (opts?.endings && opts.endings > 0) parts.push(`请设计约 ${opts.endings} 个不同结局。`)
  parts.push(
    '请给出完整的 nodes / edges / lines，确保选择支的 target_label 都能落在某个节点 label 上，剧情可顺畅从起点走到各结局。',
  )
  return parts.join('\n')
}

// ===================== 错误类型与分类 =====================

/** 结构化 AI 请求错误：携带 HTTP 状态与错误类别，便于前端精准提示 */
export class AIRequestError extends Error {
  status: number
  kind: 'http' | 'timeout' | 'network' | 'unknown'
  constructor(message: string, status = 0, kind: AIRequestError['kind'] = 'unknown') {
    super(message)
    this.name = 'AIRequestError'
    this.status = status
    this.kind = kind
  }
}

/** 将上游 HTTP 错误转为可读中文提示（401/403/404/429/5xx 分级） */
function classifyHttpError(status: number, raw: string): string {
  let detail = ''
  try {
    const j = JSON.parse(raw)
    detail = j?.error?.message || j?.error?.type || ''
  } catch {
    /* 非 JSON 错误体 */
  }
  const tail = detail ? `（${detail.slice(0, 160)}）` : raw ? `（${raw.slice(0, 160)}）` : ''
  switch (status) {
    case 401:
      return `API 密钥无效或未授权（401）。请到 AI 设置中检查 Key 是否正确、是否过期${tail}`
    case 403:
      return `密钥无权访问该模型（403）。请确认账户权限或改用可用模型${tail}`
    case 404:
      return `请求的端点或模型不存在（404）。请检查 API 端点与模型名${tail}`
    case 429:
      return `触发频率限制（429）。请稍后重试，或降低并发 / 调小 max_tokens${tail}`
    default:
      if (status >= 500) return `模型服务端错误（${status}）。上游暂时不可用，请稍后重试${tail}`
      return `API 请求失败（${status}）${tail}`
  }
}

/** 统一错误描述：主进程回传与渲染端兜底共用，避免用户看到裸英文异常 */
export function describeAIError(err: unknown): string {
  const e = err as { name?: string; message?: string }
  if (e?.name === 'TimeoutError') return e.message || '请求超时'
  if (e instanceof AIRequestError) return e.message
  if (e?.name === 'TypeError')
    return '网络请求失败：无法连接到该端点。请检查 API 地址、本地网络或代理设置（桌面端也需可访问外网）。'
  return e?.message || '未知错误'
}

// ===================== SSE 流式读取 =====================

/** 总超时：从发起请求到完整收尾的最长时间（毫秒） */
export const AI_REQUEST_TIMEOUT_MS = 180_000
/** 静默超时：流式过程中连续多久未收到任何数据即判定断流 */
export const AI_STALL_TIMEOUT_MS = 30_000

/**
 * 带静默保护的单次读取：在 stallMs 内未返回则标记超时并主动 abort，
 * 避免服务端“假死”导致界面永久卡在“生成中”。
 */
async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ctrl: AbortController,
  stallMs: number,
  markTimeout: () => void,
): Promise<{ done: boolean; value?: Uint8Array }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      markTimeout()
      ctrl.abort()
      reject(new Error('数据流中断'))
    }, stallMs)
    reader
      .read()
      .then((r) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(r)
      })
      .catch((err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * 支持 SSE 的流式补全。逐块回调 onToken 用于打字机展示；
 * 流式期间不写 store，返回完整文本供调用方在流结束后一次性提交。
 * 健壮性：①总超时 ②流式静默断流检测 ③HTTP 状态分级报错
 * ④网络异常兜底（DNS/CORS/ECONNREFUSED）⑤非流式端点自动降级。
 */
export async function streamChatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
  timeoutMs: number = AI_REQUEST_TIMEOUT_MS,
): Promise<string> {
  const body = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true,
  }

  const ctrl = new AbortController()
  let timedOut = false
  const markTimeout = () => {
    timedOut = true
  }
  const onUserAbort = () => ctrl.abort()
  if (signal) {
    if (signal.aborted) ctrl.abort()
    else signal.addEventListener('abort', onUserAbort, { once: true })
  }
  const overall = setTimeout(() => {
    markTimeout()
    ctrl.abort()
  }, timeoutMs)

  const cleanup = () => {
    clearTimeout(overall)
    if (signal) signal.removeEventListener('abort', onUserAbort)
  }

  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      throw new AIRequestError(classifyHttpError(res.status, raw), res.status, 'http')
    }

    // 降级：非流式响应
    if (!res.body) {
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content ?? ''
      if (content) onToken(content)
      return content
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''

    while (true) {
      const { done, value } = await readChunk(reader, ctrl, AI_STALL_TIMEOUT_MS, markTimeout)
      if (done) break
      if (value) buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const token: string | undefined = json.choices?.[0]?.delta?.content
          if (token) {
            full += token
            onToken(token)
          }
        } catch {
          /* 忽略不完整片段 */
        }
      }
    }
    return full
  } catch (err) {
    if (timedOut) {
      throw new AIRequestError(
        `请求超时（>${Math.round(timeoutMs / 1000)}s 无响应 / 数据流中断），请检查网络连通性或端点是否正确`,
        0,
        'timeout',
      )
    }
    if (err instanceof AIRequestError) throw err
    const e = err as { name?: string }
    if (e?.name === 'AbortError') throw err // 用户主动取消，交上层判定为 ai:aborted
    if (e?.name === 'TypeError') {
      throw new AIRequestError(
        '网络请求失败：无法连接到该端点，请检查 API 地址、本地网络或代理设置',
        0,
        'network',
      )
    }
    throw new AIRequestError((err as Error).message || '未知错误', 0, 'unknown')
  }
}