// ============================================================
// ScriptWeaver - 核心数据类型定义
// 阶段二：角色 & 素材管理系统
// ============================================================

// --------------- 位置槽位系统 ---------------

/**
 * 预定义命名槽位，禁止使用自由浮点坐标。
 * 角色在某一行的状态引用槽位ID，而非坐标数值。
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

// --------------- 素材 ---------------

export type AssetType = 'background' | 'sprite' | 'audio'

export interface AssetItem {
  /** 全局唯一 ID */
  id: string
  type: AssetType
  /** 用户可编辑的显示名 */
  name: string
  /** 原始文件名 */
  fileName: string
  /** 相对于项目根目录的路径，如 "assets/sprites/alice_smile.png" */
  relativePath: string
  width?: number
  height?: number
  /** 音频时长（秒） */
  duration?: number
  importedAt: string
}

// --------------- 角色 ---------------

export interface ExpressionRef {
  /** 表情标识，如 "smile", "angry", "normal" */
  id: string
  /** 显示名，如 "微笑", "生气" */
  label: string
  /** 引用素材库中立绘的 AssetItem.id */
  assetId: string
}

export interface CharacterConfig {
  /** Ren'Py 变量标识符（小写，无空格），校验正则 ^[a-z][a-z0-9_]*$ */
  charId: string
  /** 对话框显示名，如 "Alice", "爱丽丝" */
  displayName: string
  /** 可用表情列表 */
  expressions: ExpressionRef[]
  /** 出场默认表情 ID（引用 ExpressionRef.id），未设置时取第一个表情 */
  defaultExpression?: string
  /** 对话框专属颜色（hex），可选 */
  dialogueColor?: string
  createdAt: string
  updatedAt: string
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
 * sprite_id 现存储表情 ID（如 "smile"），而非素材 ID。
 * 实际立绘图片通过 CharacterConfig.expressions 查找。
 */
export interface CharacterDelta {
  /** 表情 ID（如 "smile"），对应 CharacterConfig.expressions[].id */
  sprite_id: string
  /** 引用命名槽位ID */
  position_slot: string
  /** 过渡效果 */
  transition?: string
  /**
   * 显式动作：
   * - "show":  出场/更新
   * - "hide":  退场（带过渡）
   * - "__CLEAR__": 清除该角色（不带过渡，立即移除）
   */
  action: 'show' | 'hide' | '__CLEAR__'
}

// --------------- 单行 Delta ---------------

/**
 * 单行差量指令 —— 只记录"相对上一行发生了什么改变"。
 */
export interface LineDelta {
  line_id: string
  /** 说话人名称，null 表示旁白 */
  speaker: string | null
  /** 台词文本 */
  dialogue: string

  /**
   * 背景指令。null = 继承上一行背景。
   */
  background: {
    asset_id: string
    transition?: string
  } | null

  /**
   * 角色指令集合。key 为角色 ID（charId），value 为该角色在本行的变更。
   */
  characters: Record<string, CharacterDelta>

  /** 音频指令 */
  audio: {
    bgm: TrackValue
    ambient: TrackValue
    se: string[]
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
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
  savedAt: string
}

// --------------- 合并后的完整行状态 ---------------

export interface ResolvedCharacterState {
  sprite_id: string
  position_slot: string
  transition?: string
}

export interface ResolvedAudioState {
  bgm: AudioTrackInstruction | null
  ambient: AudioTrackInstruction | null
  se: string[]
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
  characters: Record<string, ResolvedCharacterState>
  audio: ResolvedAudioState
}
