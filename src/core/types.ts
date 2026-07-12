// ============================================================
// ScriptWeaver - 核心数据类型定义
// 阶段一：数据核心
// ============================================================

// --------------- 位置槽位系统 ---------------

/**
 * 预定义命名槽位，禁止使用自由浮点坐标。
 * 角色在某一行的状态引用槽位ID，而非坐标数值。
 * 若某行未对该角色下达任何指令，直接复用上一行的 position_slot 引用。
 */
export interface PositionSlot {
  id: string
  /** 归一化坐标 X，范围 0-1 */
  anchor_x: number
  /** 归一化坐标 Y，范围 0-1 */
  anchor_y: number
  /** 对齐基准点 */
  anchor_point: 'bottom' | 'center'
}

// --------------- 音频轨道指令 ---------------

/**
 * 用于 BGM/环境音等持续型音轨的指令。
 * null = 继承上一行；对象 = 设置新音频；"__CLEAR__" = 显式停止。
 */
export interface AudioTrackInstruction {
  asset_id: string
  /** 音量 0-1 */
  volume: number
  fade_in_ms?: number
  fade_out_ms?: number
  loop: boolean
}

/**
 * 音频轨道值类型：
 * - null: 不修改，继承上一行
 * - AudioTrackInstruction: 设置新音频
 * - "__CLEAR__": 显式停止/清除该轨道
 */
export type TrackValue = AudioTrackInstruction | null | '__CLEAR__'

// --------------- 角色指令 ---------------

/**
 * 单行 Delta 中对某个角色的操作指令。
 * 未出现的角色 = 继承上一行状态不变。
 */
export interface CharacterDelta {
  /** 立绘/表情差分素材ID */
  sprite_id: string
  /** 引用命名槽位ID */
  position_slot: string
  /** 过渡效果 */
  transition?: string
  /**
   * 显式动作，不可省略语义：
   * - "show":  出场/更新
   * - "hide":  退场（带过渡）
   * - "__CLEAR__": 清除该角色（不带过渡，立即移除）
   */
  action: 'show' | 'hide' | '__CLEAR__'
}

// --------------- 单行 Delta ---------------

/**
 * 单行差量指令 —— 只记录"相对上一行发生了什么改变"。
 * null 表示"不修改该字段，继承上一行"；
 * "__CLEAR__" 表示"显式清除/停止"。
 */
export interface LineDelta {
  line_id: string
  /** 说话人名称，null 表示旁白 */
  speaker: string | null
  /** 台词文本 */
  dialogue: string

  /**
   * 背景指令。
   * null = 继承上一行背景，不重新计算。
   * 对象 = 切换到新背景。
   */
  background: {
    asset_id: string
    transition?: string // e.g. "dissolve", "fade"
  } | null

  /**
   * 角色指令集合。
   * key 为角色ID，value 为该角色在本行的变更。
   * 未出现的 key = 继承上一行状态。
   */
  characters: Record<string, CharacterDelta>

  /** 音频指令 */
  audio: {
    /** BGM —— 持续继承+循环，直到显式停止或替换 */
    bgm: TrackValue
    /** 环境音 —— 持续继承+循环，直到显式停止或替换 */
    ambient: TrackValue
    /** 一次性音效，不进入继承链 */
    se: string[]
    /** 绑定本行的语音文件，一次性事件，不继承 */
    voice: string | null
  }

  /** AI 生成的元数据（阶段四使用，当前预留） */
  ai_meta?: {
    confidence: number
    needs_review: boolean
    source_text_span: [number, number]
  }
}

// --------------- 项目文件格式 ---------------

export interface ProjectFile {
  version: number
  draftDeltas: LineDelta[]
  savedAt: string
}

// --------------- 合并后的完整行状态 ---------------

/**
 * 当前在舞台上的角色完整状态。
 * 由 reducer 将 Delta 中当前角色指令与继承状态合并后得出。
 */
export interface ResolvedCharacterState {
  sprite_id: string
  position_slot: string
  transition?: string
}

/**
 * 当前音频轨道的完整状态。
 */
export interface ResolvedAudioState {
  bgm: AudioTrackInstruction | null
  ambient: AudioTrackInstruction | null
  /** 一次性音效，仅存在于当前行 */
  se: string[]
  /** 语音文件，仅存在于当前行 */
  voice: string | null
}

/**
 * 合并后的单行完整状态 S_i。
 * S_i = merge(S_{i-1}, Δ_i)
 */
export interface ResolvedLineState {
  line_id: string
  speaker: string | null
  dialogue: string
  background: {
    asset_id: string
    transition?: string
  } | null
  /** 当前行舞台上所有活跃角色的状态（已去除隐藏/清除的角色） */
  characters: Record<string, ResolvedCharacterState>
  audio: ResolvedAudioState
}
