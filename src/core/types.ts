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
  /**
   * Web 降级模式下的临时对象 URL（URL.createObjectURL 结果）。
   * Electron 模式恒为空——素材通过 sw-asset:// 协议按 relativePath 流式直读，二进制不进内存。
   * 该字段为易失字段，不写入 .swproj / localStorage。
   */
  blobUrl?: string
  /** 素材专属显示色（hex），可选，用于时间轴/总览着色 */
  color?: string
  /**
   * 语义标签（可选，B 方向自动打点引擎的精准索引）。
   * 用于让 AI 返回的语义标签（如 "rain" / "storm"）稳定命中真实素材，
   * 而不依赖文件名启发式。完全向后兼容：旧 .swproj 无此字段亦可正常工作。
   */
  tags?: string[]
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
  /**
   * 相对该段落（行）起点的切入延迟（毫秒）。
   * 用于「台词播放到第 N 秒才切入 BGM/环境音」之类的段落内精确时序。
   * 默认 0 = 随该段立即切入。仅作用于常驻通道的起始时刻。
   */
  offset_ms?: number
}

/**
 * 音频轨道值类型：
 * - null: 不修改，继承上一行
 * - AudioTrackInstruction: 设置新音频
 * - "__CLEAR__": 显式停止/清除该轨道
 */
export type TrackValue = AudioTrackInstruction | null | '__CLEAR__'

// --------------- 挂载特效（时间轴 → 特效大本营闭环） ---------------

/**
 * 时间轴上挂载到「立绘 / 背景」的一个特效实例。
 * 通过 effectId 关联「特效大本营」(renpyEffects) 中同 id 的 EffectItem，
 * 实现「展示厅 → 剧本」的真正闭环；导出时由 rpyExporter 据 kind + params 生成
 * 对应的 `with <transition>` 或 `at <transform>`（详见任务 2/2 导出闭环）。
 */
export interface MountedEffect {
  /** 实例唯一 ID（单事务内稳定，用于 React key / 删除定位） */
  uid: string
  /**
   * 关联特效大本营的 EffectItem.id（如 'hpunch' / 'tf-alpha' / 'shake'）。
   * 与 renpyEffects 同源，保证「添加特效」下拉与百科一致。
   */
  effectId: string
  /** 用户可调数值参数（时长 / 幅度 / 角度等），key 与 MountableEffectDef.params[].key 对齐 */
  params: Record<string, number>
  /** 是否启用（关闭则导出时忽略），默认 true */
  enabled: boolean
}

// --------------- 全局变量中央数据库 ---------------

export type GlobalVarType = 'boolean' | 'number'

/**
 * 全局变量声明（导出为 Ren'Py 的 `default` 语句）。
 * 例如：tsundere_points = 0、has_key = False。
 */
export interface GlobalVariable {
  /** Ren'Py 合法变量名：小写字母开头，仅含 [a-z0-9_]，如 tsundere_points */
  name: string
  type: GlobalVarType
  /** 初始值：boolean 存 true/false，number 存任意数值 */
  initial: boolean | number
  /** 用户备注（可选） */
  note?: string
}

/**
 * 单行触发的变量操作（导出为 `$ <python 表达式>`）。
 * 例如：tsundere_points += 1、has_key = True、has_key = not has_key。
 */
export interface VariableOperation {
  /** 关联全局变量名 */
  varName: string
  /** 操作类型 */
  op: 'set' | 'add' | 'subtract' | 'toggle'
  /** 操作数：set 赋的值（boolean | number）；add/subtract 的增量（number）；toggle 忽略 */
  value?: boolean | number
}

// --------------- 选择支行（Choices） ---------------

/** 行类型：对话行（默认）或选择支行 */
export type LineType = 'dialogue' | 'choice'

/**
 * 单个选项（选择支行的一枝）。
 * 导出为 Ren'Py `menu:` 下的一项，带可选 `if <condition>` 门槛与 `jump <target_label>` 跳转。
 */
export interface ChoiceItem {
  /** 选项唯一 ID（单事务内稳定，用作 React key） */
  uid: string
  /** 选项按钮文本（玩家可见） */
  text: string
  /** 目标跳转标签名（Ren'Py label）；空字符串 = 顺序继续（不 jump，落到 menu 之后） */
  target_label: string
  /** 前置变量条件（Python 表达式），如 "tsundere_points >= 5"；空 = 无门槛、始终显示 */
  condition?: string
  /**
   * 选项内联变量操作（在 jump 之前、选项分支内发射的 `$ <python 表达式>`）。
   * 例如选择「调戏她」后立刻 `tsundere_points += 1`。导出时紧跟选项下方并正确缩进。
   */
  ops?: VariableOperation[]
}

// --------------- 角色指令 ---------------

/**
 * 单行 Delta 中对某个角色的操作指令。
 * sprite_id 现存储表情 ID（如 "smile"），而非素材 ID。
 * 实际立绘图片通过 CharacterConfig.expressions 查找。
 */
export interface CharacterDelta {
  /** 表情 ID（如 "smile"），对应 CharacterConfig.expressions[].id */
  sprite_id: string
  /** 引用命名槽位ID（作为吸附基准 / 未微调时的落点） */
  position_slot: string
  /** 角色身份 ID（如 "alice"），由素材派生；即便同一角色多次落点生成不同实例，身份保持一致，用于显示名 / 配色 / 导出。可选：旧数据或 AI 生成未携带时回退到 characters map 的 key */
  char_id?: string
  /** 该实例专属绑定的素材 ID；存在时舞台直接按此素材渲染图片，实现「多立绘各自独立图片、互不覆盖」 */
  asset_id?: string
  /**
   * 自由微调坐标（归一化 0-1，舞台内绝对位置）。
   * 未设置时按 position_slot 落点；设置后覆盖槽位，用于「预设吸附 + 自由微调」。
   * pos_x = 水平中心，pos_y = 立绘底部对齐的纵向位置。
   */
  pos_x?: number
  pos_y?: number
  /**
   * 缩放比例（独立变量，默认 1，即原始尺寸）。
   * 与 pos_x/pos_y 完全解耦：缩放仅改变立绘自身大小，不影响其在舞台中的落点。
   * 渲染层以「底部中心」为缩放原点，确保放大/缩小时立绘脚底锚定、位置零漂移。
   */
  scale?: number
  /** 过渡效果 */
  transition?: string
  /**
   * 挂载到本立绘的特效/变换列表（震动、淡入、闪烁、旋转…）。
   * 导出为 `at` 叠加 transform（kind=transform）或 `with` 过渡（kind=transition）。
   */
  effects?: MountedEffect[]
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
    /** 挂载到背景的特效（淡入 / 擦除 / 闪烁…），导出为 `with` 或 `scene ... at <transform>` */
    effects?: MountedEffect[]
  } | null

  /**
   * 角色指令集合。key 为全局唯一「实例 ID」（由拖拽落点生成，形如 "<角色>__<时间戳+随机>"），
   * 保证同一角色多次落点、多个不同立绘都能各自独立存在；角色身份记录在 value.char_id 中。
   */
  characters: Record<string, CharacterDelta>

  /** 音频指令 */
  audio: {
    bgm: TrackValue
    ambient: TrackValue
    se: string[]
    voice: string | null
    /**
     * 语音相对该段落起点的切入延迟（毫秒）。
     * 一次性事件（voice/se）同样支持段落内精确偏移。
     */
    voice_offset_ms?: number
    /** 音效（se）逐项相对该段落起点的切入延迟（毫秒），key 为 asset_id */
    se_offset_ms?: Record<string, number>
  }

  /**
   * 舞台级全局滤镜（scope: 'stage'）。
   * 仅接受 filter 类目（Monochrome / Sepia / ColorMatrix）。
   * 与立绘/背景特效挂载解耦，导出为整层 `show layer master: matrixcolor`；
   * 后续无滤镜的行自动复位 IdentityMatrix()，杜绝染色残留。
   * undefined = 继承上一行；null/[] = 显式清空（无滤镜）。
   */
  stageEffects?: MountedEffect[] | null

  /**
   * 本行触发的变量操作（在台词前发射 `$ <python 表达式>`）。
   * 例如 tsundere_points += 1、has_key = True。
   */
  variableOps?: VariableOperation[]

  /** 行类型：'dialogue'（对话，默认）或 'choice'（选择支）。缺省 'dialogue' 以兼容旧数据。 */
  line_type?: LineType

  /** 选择支行选项数组（仅 line_type === 'choice' 时生效）。 */
  choices?: ChoiceItem[]

  /** 选择支提示语（menu 标题，可选），如「你要怎么做？」 */
  prompt?: string

  /**
   * 剧情块标签（Label）节点化：为该行在导出的 .rpy 中打上 `label <name>:` 锚点，
   * 使选择支的 jump 有合法落点。空 = 不标记（顺延进上一剧情块）。
   * 必须是合法 Python 标识符且项目内唯一；缺省空。
   */
  label?: string

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
  /** 全局变量中央数据库（导出为 definitions.rpy 的 default 语句） */
  variables: GlobalVariable[]
  savedAt: string
  /** 场景画布比例（Ren'Py 式自选）；缺省按 16:9 处理 */
  canvasRatio?: { w: number; h: number }
}

// --------------- 合并后的完整行状态 ---------------

export interface ResolvedCharacterState {
  sprite_id: string
  /** 角色身份 ID（同 CharacterDelta.char_id）；缺省时回退到 characters map 的 key */
  char_id?: string
  /** 该实例专属素材 ID（同 CharacterDelta.asset_id）；存在时优先作为渲染图片源 */
  asset_id?: string
  position_slot: string
  /** 自由微调坐标（归一化 0-1）；未设置时按 position_slot 落点 */
  pos_x?: number
  pos_y?: number
  /** 缩放比例（独立变量，默认 1）；与位置解耦 */
  scale?: number
  transition?: string
  /** 挂载到本立绘的特效实例（透传自 CharacterDelta） */
  effects?: MountedEffect[]
}

export interface ResolvedAudioState {
  bgm: AudioTrackInstruction | null
  ambient: AudioTrackInstruction | null
  se: string[]
  voice: string | null
  voice_offset_ms?: number
  se_offset_ms?: Record<string, number>
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
    effects?: MountedEffect[]
  } | null
  characters: Record<string, ResolvedCharacterState>
  audio: ResolvedAudioState
  /** 合并后的舞台级全局滤镜（继承上一行；空数组表示无滤镜） */
  stageEffects?: MountedEffect[]
  /** 行类型（合并透传） */
  line_type?: LineType
  /** 合并后的选择支选项（仅选择支行） */
  choices?: ChoiceItem[]
  /** 选择支提示语 */
  prompt?: string
  /** 合并透传的剧情块标签（label 节点名） */
  label?: string
}
