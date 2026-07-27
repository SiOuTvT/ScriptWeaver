import { describe, it, expect } from 'vitest'
import { serializeScript, parseScript } from '@/utils/scriptDsl'
import type { LineDelta } from '@/core/types'

function sampleLines(): LineDelta[] {
  const lineA: LineDelta = {
    line_id: 'L-a',
    speaker: 'Alice',
    dialogue: '你终于来了。',
    background: { asset_id: 'bg_room', transition: 'dissolve', effects: [{ uid: 'e1', effectId: 'fadein', params: { duration: 0.5 }, enabled: true }] },
    characters: {
      'alice__1': {
        sprite_id: 'smile',
        position_slot: 'center',
        char_id: 'alice',
        asset_id: 'alice_smile',
        scale: 1.2,
        action: 'show',
        effects: [{ uid: 'e2', effectId: 'hpunch', params: { amount: 8 }, enabled: true }],
      },
      'bob__1': {
        sprite_id: 'default',
        position_slot: 'right',
        char_id: 'bob',
        action: 'show',
      },
    },
    audio: {
      bgm: { asset_id: 'bgm_01', volume: 0.6, loop: true, fade_in_ms: 800 },
      ambient: null,
      se: ['door_knock'],
      voice: 'alice_voice',
      voice_offset_ms: 200,
    },
    stageEffects: [{ uid: 'e3', effectId: 'monochrome', params: {}, enabled: true }],
    variableOps: [{ varName: 'trust', op: 'add', value: 1 }],
    label: 'arrival',
  }
  const lineB: LineDelta = {
    line_id: 'L-b',
    speaker: null,
    dialogue: '（旁白内容）',
    background: null,
    characters: {
      'bob__1': { sprite_id: 'default', position_slot: 'right', char_id: 'bob', action: 'hide', transition: 'fade' },
    },
    audio: { bgm: '__CLEAR__', ambient: null, se: [], voice: null },
  }
  const lineC: LineDelta = {
    line_id: 'L-c',
    speaker: 'Alice',
    dialogue: '你要怎么做？',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
    line_type: 'choice',
    prompt: '你的选择是？',
    choices: [
      { uid: 'ch0', text: '上前搭话', target_label: 'talk', condition: 'trust >= 1', ops: [{ varName: 'trust', op: 'add', value: 1 }] },
      { uid: 'ch1', text: '转身离开', target_label: 'leave' },
      { uid: 'ch2', text: '沉默', target_label: '' },
    ],
  }
  return [lineA, lineB, lineC]
}

function normalize(s: string): string {
  return s
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length > 0)
    .join('\n')
}

describe('scriptDsl - 往返幂等', () => {
  it('serialize → parse → serialize 文本一致', () => {
    const t1 = serializeScript(sampleLines())
    const parsed = parseScript(t1)
    const t2 = serializeScript(parsed.lines)
    expect(normalize(t2)).toBe(normalize(t1))
  })
})

describe('scriptDsl - 解析正确性', () => {
  const parsed = parseScript(serializeScript(sampleLines())).lines

  it('解析出 3 行，且类型正确', () => {
    expect(parsed.length).toBe(3)
    expect(parsed[2].line_type).toBe('choice')
    expect(parsed[2].prompt).toBe('你的选择是？')
  })

  it('立绘 show 带 scale / slot / 资源', () => {
    const chars = parsed[0].characters
    const alice = Object.values(chars).find((c) => c.char_id === 'alice')
    expect(alice?.scale).toBeCloseTo(1.2)
    expect(alice?.asset_id).toBe('alice_smile')
    expect(alice?.position_slot).toBe('center')
    expect(alice?.effects?.[0].effectId).toBe('hpunch')
  })

  it('背景带过渡与特效', () => {
    expect(parsed[0].background?.asset_id).toBe('bg_room')
    expect(parsed[0].background?.transition).toBe('dissolve')
    expect(parsed[0].background?.effects?.[0].effectId).toBe('fadein')
  })

  it('音频轨道（bgm / se / voice）还原', () => {
    const a = parsed[0].audio
    expect(a.bgm).not.toBeNull()
    if (a.bgm && typeof a.bgm !== 'string') {
      expect(a.bgm.asset_id).toBe('bgm_01')
      expect(a.bgm.volume).toBeCloseTo(0.6)
      expect(a.bgm.loop).toBe(true)
    }
    expect(a.se).toContain('door_knock')
    expect(a.voice).toBe('alice_voice')
    expect(a.voice_offset_ms).toBe(200)
  })

  it('变量操作与舞台滤镜还原', () => {
    expect(parsed[0].variableOps?.[0]).toMatchObject({ varName: 'trust', op: 'add', value: 1 })
    expect(parsed[0].stageEffects?.[0].effectId).toBe('monochrome')
  })

  it('hide 指令与 bgm 清除还原', () => {
    const hideBob = Object.values(parsed[1].characters).find((c) => c.char_id === 'bob')
    expect(hideBob?.action).toBe('hide')
    expect(hideBob?.transition).toBe('fade')
    expect(parsed[1].audio.bgm).toBe('__CLEAR__')
  })

  it('选择支选项带 jump / if / ops', () => {
    const ch = parsed[2].choices!
    expect(ch[0].target_label).toBe('talk')
    expect(ch[0].condition).toBe('trust >= 1')
    expect(ch[0].ops?.[0]).toMatchObject({ varName: 'trust', op: 'add', value: 1 })
    expect(ch[2].target_label).toBe('')
  })

  it('label 锚点挂回对应行', () => {
    expect(parsed[0].label).toBe('arrival')
  })
})

describe('scriptDsl - 人工可读文本', () => {
  it('输出人类可辨识的脚本', () => {
    const text = serializeScript(sampleLines())
    // 至少含对话、背景、选择、变量等关键字
    expect(text).toContain('dialogue "你终于来了。"')
    expect(text).toContain('bg asset=bg_room')
    expect(text).toContain('choice "你的选择是？"')
    expect(text).toContain('option "上前搭话" -> talk if trust >= 1 ops: trust+=1')
    expect(text).toContain('set trust+=1')
    expect(text).toContain('label arrival')
  })
})
