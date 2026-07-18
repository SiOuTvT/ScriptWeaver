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
  LineDelta,
  PositionSlot,
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
}

export const PROVIDER_PRESETS: Record<Exclude<AIProvider, 'custom'>, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  // Claude 等通过 OpenRouter 的 OpenAI 兼容接口接入
  openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'anthropic/claude-3.5-sonnet' },
}

const STORAGE_KEY = 'scriptweaver_ai_config'

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
  return {
    provider: 'openai',
    endpoint: PROVIDER_PRESETS.openai.endpoint,
    apiKey: '',
    model: PROVIDER_PRESETS.openai.model,
    temperature: 0.7,
    maxTokens: 2000,
  }
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

export type AIMode = 'mentor' | 'director'

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
}

export interface DirectorDirective {
  lines: DirectorLine[]
}

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
export function parseDirective(jsonText: string): DirectorDirective {
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
  return obj as DirectorDirective
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
  }
  return { delta, report }
}

// ===================== 事务提交拼装 =====================

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
  ctx: { characters: { charId: string; displayName: string }[]; backgrounds: string[]; audioHints: string },
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

export function buildUserPrompt(desc: string, mode: AIMode): string {
  if (mode === 'mentor') return `请润色/扩写以下文本：\n"""${desc}"""`
  return `剧情需求：${desc}\n请生成 5-12 行剧本元数据。`
}

// ===================== SSE 流式读取 =====================

/**
 * 支持 SSE 的流式补全。逐块回调 onToken 用于打字机展示；
 * 流式期间不写 store，返回完整文本供调用方在流结束后一次性提交。
 * 若端点不支持流式（无 body），自动降级为一次性 JSON 解析。
 */
export async function streamChatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const body = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true,
  }

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`API 请求失败 (${res.status}): ${errText.slice(0, 200)}`)
  }

  // 降级：非流式响应
  if (!res.body) {
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    onToken(content)
    return content
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
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
}
