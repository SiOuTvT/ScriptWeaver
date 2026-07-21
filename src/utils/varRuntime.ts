// ============================================================
// ScriptWeaver - 变量运行时引擎（预览调试器 / 交互播放器共用）
//
// 提供纯函数：初始化运行时变量、应用单条/批量变量操作、评估 Python 风格
// 前置条件表达式、按 label 查找行索引。所有函数无副作用，便于单元测试。
// ============================================================

import type { GlobalVariable, VariableOperation, LineDelta } from '@/core/types'

export type RuntimeValue = number | boolean
export type RuntimeValues = Record<string, RuntimeValue>

/** 用变量声明初始化运行时值（取 initial）。 */
export function initRuntimeValues(variables: GlobalVariable[]): RuntimeValues {
  const out: RuntimeValues = {}
  for (const v of variables) out[v.name] = v.initial
  return out
}

/** 不可变地应用一条变量操作（set / add / subtract / toggle）。 */
export function applyOp(values: RuntimeValues, op: VariableOperation): RuntimeValues {
  const next: RuntimeValues = { ...values }
  const cur = next[op.varName]
  switch (op.op) {
    case 'set':
      next[op.varName] = (op.value ?? (typeof cur === 'boolean' ? false : 0)) as RuntimeValue
      break
    case 'add':
      next[op.varName] = (Number(cur || 0) + Number(op.value || 0)) as RuntimeValue
      break
    case 'subtract':
      next[op.varName] = (Number(cur || 0) - Number(op.value || 0)) as RuntimeValue
      break
    case 'toggle':
      next[op.varName] = !cur as RuntimeValue
      break
  }
  return next
}

/** 顺序应用一组操作（不可变），空列表直接返回原对象。 */
export function applyOps(values: RuntimeValues, ops: VariableOperation[] | undefined): RuntimeValues {
  if (!ops || ops.length === 0) return values
  return ops.reduce<RuntimeValues>((acc, op) => applyOp(acc, op), values)
}

/**
 * 评估 Python 风格前置条件表达式（仅 number / boolean 变量），如
 * `tsundere_points >= 5`、`has_key`、`not has_key`。
 * 安全模型：变量名先被替换为字面量值，最终表达式仅允许安全字符集，
 * 不经任何变量作用域，杜绝代码注入。解析失败 / 不安全 / 空 → true（放宽显示）。
 */
export function evalCondition(expr: string | undefined, values: RuntimeValues): boolean {
  if (!expr || !expr.trim()) return true
  try {
    let js = expr
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/\bnot\b/g, '!')
    for (const [name, val] of Object.entries(values)) {
      const re = new RegExp(`\\b${name}\\b`, 'g')
      const lit = val === undefined ? 'null' : JSON.stringify(val)
      js = js.replace(re, lit)
    }
    if (!/^[\s0-9a-zA-Z_().<>!=+\-*/%&|!?:]+$/.test(js)) return true
    // eslint-disable-next-line no-new-func
    return Boolean(new Function(`return (${js})`)())
  } catch {
    return true
  }
}

/** 按 label 名找到对应行索引（入口 start → 0）。未找到返回 -1。 */
export function findLabelIndex(deltas: LineDelta[], label: string): number {
  if (label === 'start') return 0
  return deltas.findIndex((d) => d.label?.trim() === label)
}
