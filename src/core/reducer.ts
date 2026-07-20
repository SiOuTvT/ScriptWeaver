// ============================================================
// ScriptWeaver - 状态归约纯函数
// 将 LineDelta[] 逐行归约为 ResolvedLineState[]
// S_i = merge(S_{i-1}, Δ_i)
// ============================================================

import type {
  LineDelta,
  ResolvedLineState,
  ResolvedCharacterState,
  AudioTrackInstruction,
} from './types'

// --------------- 常量 ---------------

const CLEAR = '__CLEAR__' as const

// --------------- 辅助函数 ---------------

/**
 * 解析音轨指令：
 * - null → 继承上一行
 * - "__CLEAR__" → 显式停止（返回 null）
 * - AudioTrackInstruction → 直接使用
 */
function resolveTrack(
  deltaValue: AudioTrackInstruction | null | '__CLEAR__',
  prevValue: AudioTrackInstruction | null,
): AudioTrackInstruction | null {
  if (deltaValue === null) return prevValue
  if (deltaValue === CLEAR) return null
  return deltaValue
}

/**
 * 应用一行 Delta 指令，返回该行的完整合并状态。
 * prev 为上一行的完整状态（首行为 null）。
 */
export function applyDelta(
  prev: ResolvedLineState | null,
  delta: LineDelta,
): ResolvedLineState {
  // --- 背景 ---
  // null = 继承上一行背景；对象 = 切换新背景
  const background =
    delta.background !== null ? delta.background : prev?.background ?? null

  // --- 角色 ---
  // 1. 继承上一行所有角色状态（浅拷贝）
  const characters: Record<string, ResolvedCharacterState> = prev
    ? { ...prev.characters }
    : {}

  // 2. 应用本行 Delta 角色指令
  for (const [charId, charDelta] of Object.entries(delta.characters)) {
    switch (charDelta.action) {
      case 'show': {
        characters[charId] = {
          sprite_id: charDelta.sprite_id,
          position_slot: charDelta.position_slot,
          char_id: charDelta.char_id,
          pos_x: charDelta.pos_x,
          pos_y: charDelta.pos_y,
          scale: charDelta.scale,
          transition: charDelta.transition,
          asset_id: charDelta.asset_id,
          effects: charDelta.effects,
        }
        break
      }
      case 'hide':
      case CLEAR: {
        delete characters[charId]
        break
      }
    }
  }

  // --- 音频 ---
  const bgm = resolveTrack(delta.audio.bgm, prev?.audio.bgm ?? null)
  const ambient = resolveTrack(delta.audio.ambient, prev?.audio.ambient ?? null)
  // se / voice 是一次性事件，不参与继承
  const se = delta.audio.se
  const voice = delta.audio.voice

  return {
    line_id: delta.line_id,
    speaker: delta.speaker,
    dialogue: delta.dialogue,
    background,
    characters,
    audio: {
      bgm,
      ambient,
      se,
      voice,
      voice_offset_ms: delta.audio.voice_offset_ms,
      se_offset_ms: delta.audio.se_offset_ms,
    },
  }
}

/**
 * 对 LineDelta[] 序列逐行归约，返回每行的完整合并状态数组。
 *
 * 核心公式：S_i = merge(S_{i-1}, Δ_i)
 *
 * 继承规则总结：
 * | 轨道          | 继承行为                                         |
 * |--------------|-------------------------------------------------|
 * | 背景          | 持续继承，直到显式切换指令                          |
 * | 角色立绘/位置  | 持续继承，直到该角色被移动/换表情/退场               |
 * | BGM/环境音    | 持续继承+循环，直到显式停止或替换                    |
 * | 音效(SE)      | 一次性事件，不进入继承链                             |
 * | 语音          | 绑定单行的一次性事件，不继承                          |
 */
export function reduceLines(deltas: LineDelta[]): ResolvedLineState[] {
  const resolved: ResolvedLineState[] = []
  let prev: ResolvedLineState | null = null

  for (const delta of deltas) {
    const state = applyDelta(prev, delta)
    resolved.push(state)
    prev = state
  }

  return resolved
}

/**
 * 根据行索引获取该行的完整合并状态（便捷函数）。
 * 内部调用 reduceLines 后按索引返回。
 */
export function getResolvedState(
  deltas: LineDelta[],
  index: number,
): ResolvedLineState | null {
  const states = reduceLines(deltas)
  return states[index] ?? null
}
