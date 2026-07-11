// ============================================================
// ScriptWeaver - 阶段一单元测试
// 覆盖：继承、显式覆盖、__CLEAR__ 清除、槽位复用、音频跨行延续
// ============================================================

import { describe, it, expect } from 'vitest'
import { reduceLines, applyDelta, getResolvedState } from '../reducer'
import type { LineDelta, AudioTrackInstruction } from '../types'

// --------------- 测试用工厂函数 ---------------

function bgm(asset_id: string, overrides?: Partial<AudioTrackInstruction>): AudioTrackInstruction {
  return { asset_id, volume: 0.8, loop: true, ...overrides }
}

function ambient(asset_id: string, overrides?: Partial<AudioTrackInstruction>): AudioTrackInstruction {
  return { asset_id, volume: 0.5, loop: true, ...overrides }
}

function delta(overrides: Partial<LineDelta>): LineDelta {
  return {
    line_id: 'L0',
    speaker: null,
    dialogue: '',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
    ...overrides,
  }
}

// ================================================================
// 1. 基础：空输入 / 单行
// ================================================================

describe('基础场景', () => {
  it('空输入返回空数组', () => {
    const result = reduceLines([])
    expect(result).toEqual([])
  })

  it('单行 Delta 正确归约', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        speaker: 'Alice',
        dialogue: 'Hello world',
        background: { asset_id: 'bg_room' },
        characters: {
          alice: {
            sprite_id: 'alice_happy',
            position_slot: 'center',
            action: 'show',
          },
        },
        audio: {
          bgm: bgm('bgm_calm'),
          ambient: null,
          se: [],
          voice: null,
        },
      }),
    ]

    const [s0] = reduceLines(deltas)

    expect(s0.line_id).toBe('L1')
    expect(s0.speaker).toBe('Alice')
    expect(s0.dialogue).toBe('Hello world')
    expect(s0.background).toEqual({ asset_id: 'bg_room' })
    expect(s0.characters.alice).toEqual({
      sprite_id: 'alice_happy',
      position_slot: 'center',
    })
    expect(s0.audio.bgm).toEqual(bgm('bgm_calm'))
  })

  it('getResolvedState 便捷函数正常工作', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', dialogue: '第一行' }),
      delta({ line_id: 'L2', dialogue: '第二行' }),
    ]
    expect(getResolvedState(deltas, 0)?.dialogue).toBe('第一行')
    expect(getResolvedState(deltas, 1)?.dialogue).toBe('第二行')
    expect(getResolvedState(deltas, 2)).toBeNull()
  })
})

// ================================================================
// 2. 继承 —— null 语义
// ================================================================

describe('继承（null 语义）', () => {
  it('背景 null → 继承上一行背景', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', background: { asset_id: 'bg_park' } }),
      delta({ line_id: 'L2', background: null }), // 继承
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.background).toEqual({ asset_id: 'bg_park' })
    expect(s1.background).toEqual({ asset_id: 'bg_park' }) // 继承
  })

  it('未提及的角色 → 继承上一行的 sprite/位置', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: {
          alice: { sprite_id: 'alice_normal', position_slot: 'left', action: 'show' },
        },
      }),
      delta({
        line_id: 'L2',
        dialogue: 'Alice 没有说话但仍在场',
        characters: {}, // 空：alice 应继承
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.characters.alice).toBeDefined()
    expect(s1.characters.alice).toEqual({
      sprite_id: 'alice_normal',
      position_slot: 'left',
    })
  })

  it('BGM null → 持续跨行继承', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: bgm('bgm_battle'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L3', audio: { bgm: null, ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_battle'))
    expect(s1.audio.bgm).toEqual(bgm('bgm_battle')) // 继承 2 行
    expect(s2.audio.bgm).toEqual(bgm('bgm_battle')) // 继续继承
  })

  it('BGM 继承不受中间 se/voice 干扰', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: bgm('bgm_calm'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: ['bang'], voice: null } }),
      delta({ line_id: 'L3', audio: { bgm: null, ambient: null, se: [], voice: 'v_alice_03' } }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_calm'))
    expect(s1.audio.bgm).toEqual(bgm('bgm_calm')) // 继承，se 不干扰
    expect(s2.audio.bgm).toEqual(bgm('bgm_calm')) // 继续继承，voice 不干扰
  })

  it('环境音（ambient）独立继承，不受 BGM 变更影响', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        audio: { bgm: bgm('bgm_a'), ambient: ambient('ambient_rain'), se: [], voice: null },
      }),
      delta({
        line_id: 'L2',
        audio: { bgm: bgm('bgm_b'), ambient: null, se: [], voice: null }, // 只换 BGM，ambient 继承
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.audio.ambient).toEqual(ambient('ambient_rain'))
    expect(s1.audio.bgm).toEqual(bgm('bgm_b'))
    expect(s1.audio.ambient).toEqual(ambient('ambient_rain')) // ambient 不受 BGM 切换影响
  })

  it('首行有 null 背景时，背景为 null', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', background: null }),
      delta({ line_id: 'L2', background: null }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.background).toBeNull()
    expect(s1.background).toBeNull()
  })
})

// ================================================================
// 3. 显式覆盖
// ================================================================

describe('显式覆盖', () => {
  it('角色换表情（sprite_id 切换）', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: { alice: { sprite_id: 'alice_normal', position_slot: 'center', action: 'show' } },
      }),
      delta({
        line_id: 'L2',
        characters: { alice: { sprite_id: 'alice_angry', position_slot: 'center', action: 'show' } },
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.characters.alice.sprite_id).toBe('alice_normal')
    expect(s1.characters.alice.sprite_id).toBe('alice_angry') // 覆盖表情
    expect(s1.characters.alice.position_slot).toBe('center') // 位置不变
  })

  it('角色移动位置（position_slot 切换）', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: { alice: { sprite_id: 'alice_normal', position_slot: 'left', action: 'show' } },
      }),
      delta({
        line_id: 'L2',
        characters: { alice: { sprite_id: 'alice_normal', position_slot: 'right', action: 'show' } },
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.characters.alice.position_slot).toBe('left')
    expect(s1.characters.alice.position_slot).toBe('right') // 移动到右侧
    expect(s1.characters.alice.sprite_id).toBe('alice_normal') // 表情不变
  })

  it('背景显式切换覆盖继承', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', background: { asset_id: 'bg_park' } }),
      delta({ line_id: 'L2', background: null }),
      delta({ line_id: 'L3', background: { asset_id: 'bg_room', transition: 'dissolve' } }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    expect(s0.background).toEqual({ asset_id: 'bg_park' })
    expect(s1.background).toEqual({ asset_id: 'bg_park' }) // 继承
    expect(s2.background).toEqual({ asset_id: 'bg_room', transition: 'dissolve' }) // 切换
  })

  it('BGM 显式替换，不再继承旧 BGM', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: bgm('bgm_a'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: bgm('bgm_b'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L3', audio: { bgm: null, ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_a'))
    expect(s1.audio.bgm).toEqual(bgm('bgm_b'))
    expect(s2.audio.bgm).toEqual(bgm('bgm_b')) // 继承 bgm_b，不是 bgm_a
  })

  it('多个角色独立继承，只修改其中一个', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: {
          alice: { sprite_id: 'a_normal', position_slot: 'left', action: 'show' },
          bob: { sprite_id: 'b_normal', position_slot: 'right', action: 'show' },
        },
      }),
      delta({
        line_id: 'L2',
        characters: {
          alice: { sprite_id: 'a_happy', position_slot: 'left', action: 'show' }, // 只改 alice
        },
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.characters.alice.sprite_id).toBe('a_normal')
    expect(s0.characters.bob.sprite_id).toBe('b_normal')

    expect(s1.characters.alice.sprite_id).toBe('a_happy') // 更新了
    expect(s1.characters.bob.sprite_id).toBe('b_normal') // bob 继承不变
    expect(s1.characters.bob.position_slot).toBe('right')
  })
})

// ================================================================
// 4. __CLEAR__ 清除
// ================================================================

describe('__CLEAR__ 清除语义', () => {
  it('BGM __CLEAR__ → 停止播放', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: bgm('bgm_tense'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: '__CLEAR__', ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_tense'))
    expect(s1.audio.bgm).toBeNull() // 已清除
  })

  it('BGM __CLEAR__ 后不再继承', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: bgm('bgm_a'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: '__CLEAR__', ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L3', audio: { bgm: null, ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_a'))
    expect(s1.audio.bgm).toBeNull()
    expect(s2.audio.bgm).toBeNull() // 继承 null（即保持停止）
  })

  it('环境音 __CLEAR__ 独立清除，BGM 不受影响', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        audio: { bgm: bgm('bgm_a'), ambient: ambient('ambient_wind'), se: [], voice: null },
      }),
      delta({
        line_id: 'L2',
        audio: { bgm: null, ambient: '__CLEAR__', se: [], voice: null }, // 只清除环境音
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_a'))
    expect(s0.audio.ambient).toEqual(ambient('ambient_wind'))

    expect(s1.audio.bgm).toEqual(bgm('bgm_a')) // BGM 继承不变
    expect(s1.audio.ambient).toBeNull() // 环境音已清除
  })

  it('角色 hide → 从活跃角色中移除', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: {
          alice: { sprite_id: 'alice_normal', position_slot: 'center', action: 'show' },
          bob: { sprite_id: 'bob_normal', position_slot: 'left', action: 'show' },
        },
      }),
      delta({
        line_id: 'L2',
        characters: {
          alice: { sprite_id: 'alice_normal', position_slot: 'center', action: 'hide' },
        },
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.characters.alice).toBeDefined()
    expect(s0.characters.bob).toBeDefined()

    expect(s1.characters.alice).toBeUndefined() // alice 已退场
    expect(s1.characters.bob).toBeDefined() // bob 仍在场
  })

  it('角色 __CLEAR__ → 立即移除（与 hide 语义一致，均为移除）', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: {
          alice: { sprite_id: 'alice_normal', position_slot: 'center', action: 'show' },
        },
      }),
      delta({
        line_id: 'L2',
        characters: {
          alice: { sprite_id: 'alice_normal', position_slot: 'center', action: '__CLEAR__' },
        },
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.characters.alice).toBeDefined()
    expect(s1.characters.alice).toBeUndefined()
  })

  it('角色退场后，后续行不继承该角色', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: { alice: { sprite_id: 'a1', position_slot: 'center', action: 'show' } },
      }),
      delta({
        line_id: 'L2',
        characters: { alice: { sprite_id: 'a1', position_slot: 'center', action: 'hide' } },
      }),
      delta({
        line_id: 'L3',
        characters: { bob: { sprite_id: 'b1', position_slot: 'center', action: 'show' } },
      }),
    ]
    const [, , s2] = reduceLines(deltas)

    expect(s2.characters.alice).toBeUndefined() // alice 已退场，不出现
    expect(s2.characters.bob).toBeDefined()
  })
})

// ================================================================
// 5. 音效(SE) 与 语音(Voice) —— 一次性事件
// ================================================================

describe('一次性事件（SE / Voice）', () => {
  it('SE 不进入继承链，每行独立', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: null, ambient: null, se: ['bang', 'scream'], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L3', audio: { bgm: null, ambient: null, se: ['click'], voice: null } }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    expect(s0.audio.se).toEqual(['bang', 'scream'])
    expect(s1.audio.se).toEqual([]) // 不继承 SE
    expect(s2.audio.se).toEqual(['click']) // 新 SE
  })

  it('Voice 不进入继承链，每行独立', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: null, ambient: null, se: [], voice: 'v_alice_01' } }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.audio.voice).toBe('v_alice_01')
    expect(s1.audio.voice).toBeNull() // 不继承 voice
  })
})

// ================================================================
// 6. 槽位复用（Position Slot Reuse）
// ================================================================

describe('槽位复用', () => {
  it('角色引用的是槽位ID而非坐标数值', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: { alice: { sprite_id: 'a1', position_slot: 'center', action: 'show' } },
      }),
      delta({
        line_id: 'L2',
        characters: { alice: { sprite_id: 'a2', position_slot: 'left', action: 'show' } },
      }),
      delta({
        line_id: 'L3',
        characters: { alice: { sprite_id: 'a3', position_slot: 'center', action: 'show' } },
      }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    // 所有状态中 position_slot 都是字符串 ID，而非数值坐标
    expect(typeof s0.characters.alice.position_slot).toBe('string')
    expect(s0.characters.alice.position_slot).toBe('center')
    expect(s1.characters.alice.position_slot).toBe('left')
    expect(s2.characters.alice.position_slot).toBe('center') // 复用 center 槽位
  })

  it('多个角色可同时使用不同槽位', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: {
          alice: { sprite_id: 'a1', position_slot: 'left', action: 'show' },
          bob: { sprite_id: 'b1', position_slot: 'right', action: 'show' },
          charlie: { sprite_id: 'c1', position_slot: 'center', action: 'show' },
        },
      }),
    ]
    const [s0] = reduceLines(deltas)

    expect(s0.characters.alice.position_slot).toBe('left')
    expect(s0.characters.bob.position_slot).toBe('right')
    expect(s0.characters.charlie.position_slot).toBe('center')
  })

  it('未下达指令的角色直接复用上一行的 position_slot 引用', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: {
          alice: { sprite_id: 'a1', position_slot: 'left', action: 'show' },
          bob: { sprite_id: 'b1', position_slot: 'right', action: 'show' },
        },
      }),
      delta({
        line_id: 'L2',
        characters: {
          // 未对 alice 下达任何指令 → 复用 position_slot 引用
          bob: { sprite_id: 'b2', position_slot: 'right', action: 'show' },
        },
      }),
    ]
    const [s0, s1] = reduceLines(deltas)

    expect(s0.characters.alice.position_slot).toBe('left')
    expect(s1.characters.alice).toEqual({
      sprite_id: 'a1',
      position_slot: 'left',
    })
  })
})

// ================================================================
// 7. 音频区间跨行延续（BGM / Ambient 长区间）
// ================================================================

describe('音频区间跨行延续', () => {
  it('BGM 跨多行持续播放（时间轴色块覆盖多行）', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: bgm('bgm_theme'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L3', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L4', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L5', audio: { bgm: '__CLEAR__', ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1, s2, s3, s4] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_theme'))
    expect(s1.audio.bgm).toEqual(bgm('bgm_theme'))
    expect(s2.audio.bgm).toEqual(bgm('bgm_theme'))
    expect(s3.audio.bgm).toEqual(bgm('bgm_theme'))
    expect(s4.audio.bgm).toBeNull()
  })

  it('BGM 和 Ambient 各自独立跨行', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        audio: { bgm: bgm('bgm_theme'), ambient: ambient('ambient_rain'), se: [], voice: null },
      }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({
        line_id: 'L3',
        audio: { bgm: '__CLEAR__', ambient: null, se: [], voice: null }, // 只停止 BGM
      }),
      delta({ line_id: 'L4', audio: { bgm: null, ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1, s2, s3] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_theme'))
    expect(s0.audio.ambient).toEqual(ambient('ambient_rain'))

    expect(s1.audio.bgm).toEqual(bgm('bgm_theme'))
    expect(s1.audio.ambient).toEqual(ambient('ambient_rain'))

    expect(s2.audio.bgm).toBeNull() // BGM 停止
    expect(s2.audio.ambient).toEqual(ambient('ambient_rain')) // 环境音仍在

    expect(s3.audio.bgm).toBeNull() // 继承停止
    expect(s3.audio.ambient).toEqual(ambient('ambient_rain')) // 环境音仍在
  })

  it('BGM 在中间替换后延续', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', audio: { bgm: bgm('bgm_a'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L3', audio: { bgm: bgm('bgm_b'), ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L4', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({ line_id: 'L5', audio: { bgm: null, ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1, s2, s3, s4] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_a'))
    expect(s1.audio.bgm).toEqual(bgm('bgm_a'))
    expect(s2.audio.bgm).toEqual(bgm('bgm_b'))
    expect(s3.audio.bgm).toEqual(bgm('bgm_b'))
    expect(s4.audio.bgm).toEqual(bgm('bgm_b'))
  })

  it('Ambient 在中间替换后延续，BGM 不受影响', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        audio: { bgm: bgm('bgm_a'), ambient: ambient('amb_forest'), se: [], voice: null },
      }),
      delta({ line_id: 'L2', audio: { bgm: null, ambient: null, se: [], voice: null } }),
      delta({
        line_id: 'L3',
        audio: { bgm: null, ambient: ambient('amb_cave'), se: [], voice: null },
      }),
      delta({ line_id: 'L4', audio: { bgm: null, ambient: null, se: [], voice: null } }),
    ]
    const [s0, s1, s2, s3] = reduceLines(deltas)

    expect(s0.audio.bgm).toEqual(bgm('bgm_a'))
    expect(s0.audio.ambient).toEqual(ambient('amb_forest'))

    expect(s1.audio.bgm).toEqual(bgm('bgm_a'))
    expect(s1.audio.ambient).toEqual(ambient('amb_forest'))

    expect(s2.audio.bgm).toEqual(bgm('bgm_a')) // BGM 持续
    expect(s2.audio.ambient).toEqual(ambient('amb_cave')) // Ambient 替换

    expect(s3.audio.bgm).toEqual(bgm('bgm_a')) // BGM 继续
    expect(s3.audio.ambient).toEqual(ambient('amb_cave')) // 新 Ambient 延续
  })
})

// ================================================================
// 8. 综合场景
// ================================================================

describe('综合场景', () => {
  it('完整对话场景：背景切换 + 角色出入 + BGM 替换', () => {
    const deltas: LineDelta[] = [
      // L1: 开场
      delta({
        line_id: 'L1',
        speaker: '旁白',
        dialogue: '故事开始了...',
        background: { asset_id: 'bg_street' },
        audio: { bgm: bgm('bgm_peaceful'), ambient: null, se: [], voice: null },
      }),
      // L2: Alice 出场
      delta({
        line_id: 'L2',
        speaker: 'Alice',
        dialogue: '你好！',
        background: null,
        characters: { alice: { sprite_id: 'alice_smile', position_slot: 'center', action: 'show' } },
        audio: { bgm: null, ambient: null, se: [], voice: 'v_alice_01' },
      }),
      // L3: Bob 出场，Alice 仍在线
      delta({
        line_id: 'L3',
        speaker: 'Bob',
        dialogue: '你好 Alice！',
        background: { asset_id: 'bg_room', transition: 'dissolve' },
        characters: { bob: { sprite_id: 'bob_happy', position_slot: 'left', action: 'show' } },
        audio: { bgm: bgm('bgm_tense'), ambient: null, se: ['door_open'], voice: 'v_bob_01' },
      }),
      // L4: Alice 生气
      delta({
        line_id: 'L4',
        speaker: 'Alice',
        dialogue: '你迟到了！',
        background: null,
        characters: { alice: { sprite_id: 'alice_angry', position_slot: 'center', action: 'show' } },
        audio: { bgm: null, ambient: null, se: [], voice: 'v_alice_02' },
      }),
      // L5: Bob 离场，BGM 停止
      delta({
        line_id: 'L5',
        speaker: '旁白',
        dialogue: 'Bob 离开了房间...',
        background: null,
        characters: { bob: { sprite_id: 'bob_sad', position_slot: 'left', action: 'hide' } },
        audio: { bgm: '__CLEAR__', ambient: null, se: ['door_close'], voice: null },
      }),
    ]

    const [s0, s1, s2, s3, s4] = reduceLines(deltas)

    // L1
    expect(s0.background).toEqual({ asset_id: 'bg_street' })
    expect(s0.audio.bgm).toEqual(bgm('bgm_peaceful'))
    expect(Object.keys(s0.characters)).toHaveLength(0)

    // L2 - Alice 出场，背景和 BGM 继承
    expect(s1.background).toEqual({ asset_id: 'bg_street' })
    expect(s1.audio.bgm).toEqual(bgm('bgm_peaceful'))
    expect(s1.characters.alice.sprite_id).toBe('alice_smile')
    expect(s1.audio.voice).toBe('v_alice_01')

    // L3 - 背景切换，Bob 出场，BGM 替换
    expect(s2.background).toEqual({ asset_id: 'bg_room', transition: 'dissolve' })
    expect(s2.audio.bgm).toEqual(bgm('bgm_tense'))
    expect(s2.characters.alice.sprite_id).toBe('alice_smile') // 继承
    expect(s2.characters.bob.sprite_id).toBe('bob_happy')
    expect(s2.audio.se).toEqual(['door_open'])
    expect(s2.audio.voice).toBe('v_bob_01')

    // L4 - Alice 变表情，Bob 继承
    expect(s3.background).toEqual({ asset_id: 'bg_room', transition: 'dissolve' })
    expect(s3.characters.alice.sprite_id).toBe('alice_angry') // 更新
    expect(s3.characters.bob.sprite_id).toBe('bob_happy') // 继承
    expect(s3.audio.se).toEqual([])
    expect(s3.audio.voice).toBe('v_alice_02')

    // L5 - Bob 退场，BGM 停止
    expect(s4.characters.alice).toBeDefined()
    expect(s4.characters.bob).toBeUndefined() // 已退场
    expect(s4.audio.bgm).toBeNull()
    expect(s4.audio.se).toEqual(['door_close'])
  })

  it('applyDelta 纯函数：相同输入产生相同输出', () => {
    const prev: ReturnType<typeof reduceLines>[0] | null = null
    const d = delta({
      line_id: 'L1',
      speaker: 'Alice',
      dialogue: 'Hello',
      background: { asset_id: 'bg_park' },
      characters: { alice: { sprite_id: 'a1', position_slot: 'center', action: 'show' } },
      audio: { bgm: bgm('bgm_a'), ambient: null, se: ['ding'], voice: 'v1' },
    })

    const r1 = applyDelta(prev, d)
    const r2 = applyDelta(prev, d)

    expect(r1).toEqual(r2) // 纯函数，幂等
  })
})

// ================================================================
// 9. 边界情况
// ================================================================

describe('边界情况', () => {
  it('speaker 为 null（旁白）正常处理', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', speaker: null, dialogue: '...' }),
    ]
    const [s0] = reduceLines(deltas)
    expect(s0.speaker).toBeNull()
    expect(s0.dialogue).toBe('...')
  })

  it('空 characters 对象不影响继承', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: { alice: { sprite_id: 'a1', position_slot: 'center', action: 'show' } },
      }),
      delta({ line_id: 'L2', characters: {} }),
      delta({ line_id: 'L3', characters: {} }),
    ]
    const [s0, s1, s2] = reduceLines(deltas)

    expect(s0.characters.alice).toBeDefined()
    expect(s1.characters.alice).toEqual(s0.characters.alice)
    expect(s2.characters.alice).toEqual(s0.characters.alice)
  })

  it('show 同一个角色多次，最后一条生效', () => {
    const deltas: LineDelta[] = [
      delta({
        line_id: 'L1',
        characters: {
          alice: { sprite_id: 'a_happy', position_slot: 'center', action: 'show' },
        },
      }),
      delta({
        line_id: 'L2',
        characters: {
          alice: { sprite_id: 'a_sad', position_slot: 'left', action: 'show' },
        },
      }),
    ]
    const [, s1] = reduceLines(deltas)
    expect(s1.characters.alice.sprite_id).toBe('a_sad')
    expect(s1.characters.alice.position_slot).toBe('left')
  })

  it('背景带 transition 参数正确传递', () => {
    const deltas: LineDelta[] = [
      delta({ line_id: 'L1', background: { asset_id: 'bg_a', transition: 'fade' } }),
      delta({ line_id: 'L2', background: null }),
    ]
    const [s0, s1] = reduceLines(deltas)
    expect(s0.background).toEqual({ asset_id: 'bg_a', transition: 'fade' })
    expect(s1.background).toEqual({ asset_id: 'bg_a', transition: 'fade' })
  })
})
