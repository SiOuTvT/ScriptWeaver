import { describe, it, expect } from 'vitest'
import { deserializeProject } from '../projectFile'

/** 构造一份最小合法工程 JSON */
function validProject(overrides: Record<string, unknown> = {}): string {
  const base = {
    version: 1,
    draftDeltas: [
      { line_id: 'L1', speaker: null, dialogue: 'hi', background: null, characters: {}, audio: { bgm: null, ambient: null, se: [], voice: null } },
    ],
    characterConfigs: [],
    assets: [],
    variables: [{ name: 'trust', type: 'number', initial: 0, note: '' }],
    canvasRatio: { w: 16, h: 9 },
  }
  return JSON.stringify({ ...base, ...overrides })
}

describe('deserializeProject', () => {
  it('解析合法工程并按原样返回', () => {
    const r = deserializeProject(validProject())
    expect(r).not.toBeNull()
    expect(r!.deltas).toHaveLength(1)
    expect(r!.deltas[0].line_id).toBe('L1')
    expect(r!.variables).toHaveLength(1)
    expect(r!.variables[0].name).toBe('trust')
    expect(r!.canvasRatio).toEqual({ w: 16, h: 9 })
  })

  it('缺省数组字段回退为空数组而非崩溃', () => {
    const r = deserializeProject(
      JSON.stringify({ version: 1, draftDeltas: [{ line_id: 'L1', dialogue: 'x' }] }),
    )
    expect(r).not.toBeNull()
    expect(r!.characterConfigs).toEqual([])
    expect(r!.assets).toEqual([])
    expect(r!.variables).toEqual([])
  })

  it('顶层非对象 / 非法 JSON → null（无法恢复）', () => {
    expect(deserializeProject('not json{{{')).toBeNull()
    expect(deserializeProject('123')).toBeNull()
    expect(deserializeProject('[1,2,3]')).toBeNull()
    expect(deserializeProject('null')).toBeNull()
  })

  it('draftDeltas 混入 null / 非对象项被过滤，不崩溃', () => {
    const r = deserializeProject(
      JSON.stringify({
        version: 1,
        draftDeltas: [null, 'garbage', { line_id: 'L1', dialogue: 'ok' }, 42],
      }),
    )
    expect(r).not.toBeNull()
    expect(r!.deltas).toHaveLength(1)
    expect(r!.deltas[0].line_id).toBe('L1')
  })

  it('draftDeltas 缺 line_id 的条目补全确定性占位 id', () => {
    const r = deserializeProject(
      JSON.stringify({
        version: 1,
        draftDeltas: [{ dialogue: 'no id' }, { line_id: 'L2', dialogue: 'has id' }],
      }),
    )
    expect(r).not.toBeNull()
    expect(r!.deltas).toHaveLength(2)
    expect(r!.deltas[0].line_id).toBe('sw_line_0')
    expect(r!.deltas[1].line_id).toBe('L2')
  })

  it('draftDeltas 非数组（如对象）回退为空数组', () => {
    const r = deserializeProject(
      JSON.stringify({ version: 1, draftDeltas: { line_id: 'L1' } }),
    )
    expect(r).not.toBeNull()
    expect(r!.deltas).toEqual([])
  })

  it('variables 过滤掉非对象 / 无 name 的非法项', () => {
    const r = deserializeProject(
      JSON.stringify({
        version: 1,
        draftDeltas: [],
        variables: [null, { type: 'number' }, { name: 'a', type: 'number', initial: 0 }, 'x'],
      }),
    )
    expect(r).not.toBeNull()
    expect(r!.variables).toHaveLength(1)
    expect(r!.variables[0].name).toBe('a')
  })

  it('canvasRatio 非法值回退 undefined，合法值保留', () => {
    expect(
      deserializeProject(JSON.stringify({ version: 1, draftDeltas: [], canvasRatio: { w: -1, h: 9 } }))!.canvasRatio,
    ).toBeUndefined()
    expect(
      deserializeProject(JSON.stringify({ version: 1, draftDeltas: [], canvasRatio: '16:9' }))!.canvasRatio,
    ).toBeUndefined()
    expect(
      deserializeProject(JSON.stringify({ version: 1, draftDeltas: [], canvasRatio: { w: 16, h: 9 } }))!.canvasRatio,
    ).toEqual({ w: 16, h: 9 })
  })

  it('缺 projectMeta 回退默认标题', () => {
    const r = deserializeProject(JSON.stringify({ version: 1, draftDeltas: [] }))
    expect(r!.projectMeta).toEqual({ title: 'My Visual Novel' })
  })
})
