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
  MountedEffect,
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
    delta.background != null ? delta.background : prev?.background ?? null

  // --- 舞台级全局滤镜（scope: 'stage'）---
  // undefined = 继承上一行；null/[] = 显式清空
  const stageEffects: MountedEffect[] =
    delta.stageEffects !== undefined
      ? delta.stageEffects ?? []
      : prev?.stageEffects ?? []


  // --- 角色 ---
  // 1. 继承上一行所有角色状态（浅拷贝）
  const characters: Record<string, ResolvedCharacterState> = prev
    ? { ...prev.characters }
    : {}

  // 2. 应用本行 Delta 角色指令
  for (const [charId, charDelta] of Object.entries(delta.characters ?? {})) {
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
  const audioRaw = delta.audio ?? {}
  const bgm = resolveTrack(audioRaw.bgm ?? null, prev?.audio.bgm ?? null)
  const ambient = resolveTrack(audioRaw.ambient ?? null, prev?.audio.ambient ?? null)
  // se / voice 是一次性事件，不参与继承
  const se = audioRaw.se ?? []
  const voice = audioRaw.voice ?? null

  return {
    line_id: delta.line_id,
    speaker: delta.speaker,
    dialogue: delta.dialogue,
    background,
    characters,
    stageEffects,
    line_type: delta.line_type ?? 'dialogue',
    choices: delta.line_type === 'choice' ? (delta.choices ?? []) : undefined,
    prompt: delta.line_type === 'choice' ? (delta.prompt ?? '') : undefined,
    label: delta.label?.trim() ? delta.label.trim() : undefined,
    audio: {
      bgm,
      ambient,
      se,
      voice,
      voice_offset_ms: audioRaw.voice_offset_ms,
      se_offset_ms: audioRaw.se_offset_ms,
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
 * 归一化单行 Delta，补齐缺失的嵌套字段（背景 / 角色 / 音频等），
 * 作为"外部数据进入内核"的边界校验层，杜绝加载缺字段导致 applyDelta 崩溃。
 * 纯函数、幂等（对已规整数据无副作用）。
 */
export function normalizeDelta(d: LineDelta): LineDelta {
  const audio = {
    bgm: d.audio?.bgm ?? null,
    ambient: d.audio?.ambient ?? null,
    se: d.audio?.se ?? [],
    voice: d.audio?.voice ?? null,
    voice_offset_ms: d.audio?.voice_offset_ms,
    se_offset_ms: d.audio?.se_offset_ms,
  }
  const base: LineDelta = {
    line_id: d.line_id,
    speaker: d.speaker ?? null,
    dialogue: d.dialogue ?? '',
    background: d.background ?? null,
    characters: d.characters ?? {},
    audio,
    line_type: d.line_type ?? 'dialogue',
  }
  if (d.line_type === 'choice' || d.choices) {
    base.choices = d.choices ?? []
    base.prompt = d.prompt ?? ''
  }
  if (d.label !== undefined) base.label = d.label
  if (d.stageEffects !== undefined) base.stageEffects = d.stageEffects ?? []
  if (d.variableOps) base.variableOps = d.variableOps
  return base
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
