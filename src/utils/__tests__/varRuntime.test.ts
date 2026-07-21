import { describe, it, expect } from 'vitest'
import {
  initRuntimeValues,
  applyOp,
  applyOps,
  evalCondition,
  findLabelIndex,
  type RuntimeValues,
} from '@/utils/varRuntime'
import type { GlobalVariable, LineDelta } from '@/core/types'

/** 构造最小 LineDelta（补齐必填字段），供 findLabelIndex 测试使用 */
const mk = (over: Partial<LineDelta>): LineDelta => ({
  line_id: 'x',
  speaker: null,
  dialogue: '',
  background: null,
  characters: {},
  audio: { bgm: null, ambient: null, se: [], voice: null },
  line_type: 'dialogue',
  ...over,
})

const vars: GlobalVariable[] = [
  { name: 'tsundere_points', type: 'number', initial: 0 },
  { name: 'has_key', type: 'boolean', initial: false },
]

describe('varRuntime · 运行时变量引擎', () => {
  it('initRuntimeValues 取变量初始值', () => {
    const v = initRuntimeValues(vars)
    expect(v.tsundere_points).toBe(0)
    expect(v.has_key).toBe(false)
  })

  it('applyOp：set / add / subtract / toggle', () => {
    let v: RuntimeValues = {}
    v = applyOp(v, { varName: 'a', op: 'set', value: 5 })
    expect(v.a).toBe(5)
    v = applyOp(v, { varName: 'a', op: 'add', value: 3 })
    expect(v.a).toBe(8)
    v = applyOp(v, { varName: 'a', op: 'subtract', value: 2 })
    expect(v.a).toBe(6)
    v = applyOp(v, { varName: 'b', op: 'set', value: true })
    v = applyOp(v, { varName: 'b', op: 'toggle' })
    expect(v.b).toBe(false)
  })

  it('applyOps 顺序应用（不可变原对象）', () => {
    const src = { hp: 10 }
    const next = applyOps(src, [
      { varName: 'hp', op: 'subtract', value: 3 },
      { varName: 'hp', op: 'add', value: 1 },
    ])
    expect(next.hp).toBe(8)
    expect(src.hp).toBe(10) // 原对象不被修改
  })

  it('evalCondition：比较 / 布尔 / and / or / not', () => {
    expect(evalCondition('tsundere_points >= 5', { tsundere_points: 5 })).toBe(true)
    expect(evalCondition('tsundere_points >= 5', { tsundere_points: 4 })).toBe(false)
    expect(evalCondition('has_key', { has_key: true })).toBe(true)
    expect(evalCondition('has_key', { has_key: false })).toBe(false)
    expect(evalCondition('not has_key', { has_key: false })).toBe(true)
    expect(evalCondition('tsundere_points >= 1 and has_key', { tsundere_points: 2, has_key: true })).toBe(true)
    expect(evalCondition('tsundere_points >= 1 and has_key', { tsundere_points: 2, has_key: false })).toBe(false)
    expect(evalCondition('tsundere_points >= 9 or has_key', { tsundere_points: 0, has_key: true })).toBe(true)
  })

  it('evalCondition：空条件恒为真（放宽显示）', () => {
    expect(evalCondition('', {})).toBe(true)
    expect(evalCondition(undefined, {})).toBe(true)
  })

  it('evalCondition：注入式危险字符串被安全放宽（不抛错、返回 true）', () => {
    expect(evalCondition("1; alert('x')", {})).toBe(true)
    expect(evalCondition("constructor.constructor('alert(1)')()", {})).toBe(true)
  })

  it('findLabelIndex：start → 0，命中返回行号，未定义返回 -1', () => {
    const ds: LineDelta[] = [
      mk({ line_id: 'L1', speaker: 'a', dialogue: 'x' }),
      mk({ line_id: 'L2', label: 'battle', speaker: 'a', dialogue: 'y' }),
      mk({ line_id: 'L3', speaker: 'a', dialogue: 'z' }),
    ]
    expect(findLabelIndex(ds, 'start')).toBe(0)
    expect(findLabelIndex(ds, 'battle')).toBe(1)
    expect(findLabelIndex(ds, 'ghost')).toBe(-1)
  })
})
