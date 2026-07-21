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
 * 评估 Python 风格前置条件表达式（number / boolean / string 变量），如
 * `tsundere_points >= 5`、`has_key`、`not has_key`、`name == "bob"`。
 *
 * 安全模型（彻底封堵沙箱逃逸）：
 *  - 自实现 tokenizer + 递归下降求值器，**绝不**使用 `eval` / `new Function`。
 *  - 仅允许：数字/字符串/布尔字面量、已声明变量标识符、`+ - * / %`、
 *    比较 `>= <= > < == !=`、逻辑 `and or not`、括号 `()`。
 *  - `(` 仅用于分组，拒绝任何函数调用（如 `alert(...)`）；`.` 成员访问、`=`、`;` 等一律非法。
 *  - 未声明标识符按"假值"处理（绝不执行代码）；任何非法 token / 语法错误均抛错 →
 *    外层捕获后返回 true（放宽显示，与历史行为一致）。
 */
type Val = string | number | boolean

function truthy(v: Val): boolean {
  return v !== false && v !== 0 && v !== '' && v != null
}

function toNum(v: Val): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function compare(left: Val, op: string, right: Val): boolean {
  if (op === '==') return left === right
  if (op === '!=') return left !== right
  const ln = toNum(left)
  const rn = toNum(right)
  switch (op) {
    case '>=': return ln >= rn
    case '<=': return ln <= rn
    case '>': return ln > rn
    case '<': return ln < rn
  }
  return false
}

type TokType = 'num' | 'str' | 'bool' | 'id' | 'op' | 'lp' | 'rp'
interface Tok {
  type: TokType
  value: string | number | boolean
}

function tokenize(input: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  const n = input.length
  while (i < n) {
    const ch = input[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }
    // 数字（含前导负号，如 -5）
    if ((ch >= '0' && ch <= '9') || (ch === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i + 1
      while (j < n && /[0-9.]/.test(input[j])) j++
      tokens.push({ type: 'num', value: Number(input.slice(i, j)) })
      i = j
      continue
    }
    // 字符串字面量 "..." 或 '...'
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let str = ''
      while (j < n && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < n) {
          str += input[j + 1]
          j += 2
          continue
        }
        str += input[j]
        j++
      }
      if (j >= n) throw new Error('unterminated string')
      tokens.push({ type: 'str', value: str })
      i = j + 1
      continue
    }
    // 标识符 / 关键字
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(input[j])) j++
      const word = input.slice(i, j)
      if (word === 'true' || word === 'True') tokens.push({ type: 'bool', value: true })
      else if (word === 'false' || word === 'False') tokens.push({ type: 'bool', value: false })
      else if (word === 'and' || word === 'or' || word === 'not')
        tokens.push({ type: 'op', value: word })
      else tokens.push({ type: 'id', value: word })
      i = j
      continue
    }
    // 双字符比较运算符
    const two = input.slice(i, i + 2)
    if (two === '>=' || two === '<=' || two === '==' || two === '!=') {
      tokens.push({ type: 'op', value: two })
      i += 2
      continue
    }
    // 单字符运算符
    if ('><+-*/%='.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ type: 'lp', value: '(' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rp', value: ')' })
      i++
      continue
    }
    // 任何其它字符（. ; 等）一律非法 → 触发安全拦截
    throw new Error(`illegal character: ${ch}`)
  }
  return tokens
}

class ConditionParser {
  private pos = 0
  constructor(private readonly tokens: Tok[], private readonly values: RuntimeValues) {}

  parse(): Val {
    const v = this.parseOr()
    if (this.pos !== this.tokens.length) throw new Error('trailing tokens')
    return v
  }

  private peek(): Tok | undefined {
    return this.tokens[this.pos]
  }
  private eat(): Tok {
    const t = this.tokens[this.pos++]
    if (!t) throw new Error('unexpected end of input')
    return t
  }

  private parseOr(): Val {
    let left = this.parseAnd()
    while (this.isOp('or')) {
      this.eat()
      const right = this.parseAnd()
      left = (truthy(left) || truthy(right)) as Val
    }
    return left
  }

  private parseAnd(): Val {
    let left = this.parseNot()
    while (this.isOp('and')) {
      this.eat()
      const right = this.parseNot()
      left = (truthy(left) && truthy(right)) as Val
    }
    return left
  }

  private parseNot(): Val {
    if (this.isOp('not')) {
      this.eat()
      return (!truthy(this.parseNot())) as Val
    }
    return this.parseComparison()
  }

  private parseComparison(): Val {
    let left = this.parseAdditive()
    while (this.peek()?.type === 'op') {
      const v = (this.peek() as Tok).value
      if (typeof v !== 'string' || !['>=', '<=', '==', '!=', '>', '<'].includes(v)) break
      this.eat()
      const right = this.parseAdditive()
      left = compare(left, v, right) as Val
    }
    return left
  }

  private parseAdditive(): Val {
    let left = this.parseMultiplicative()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.eat() as Tok).value as string
      const right = this.parseMultiplicative()
      const ln = toNum(left)
      const rn = toNum(right)
      left = (op === '+' ? ln + rn : ln - rn) as Val
    }
    return left
  }

  private parseMultiplicative(): Val {
    let left = this.parseUnary()
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.eat() as Tok).value as string
      const right = this.parseUnary()
      const ln = toNum(left)
      const rn = toNum(right)
      left = (op === '*' ? ln * rn : op === '/' ? ln / rn : ln % rn) as Val
    }
    return left
  }

  private parseUnary(): Val {
    if (this.isOp('-') || this.isOp('+')) {
      const op = (this.eat() as Tok).value as string
      const v = this.parseUnary()
      return (op === '-' ? -toNum(v) : toNum(v)) as Val
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Val {
    const t = this.peek()
    if (!t) throw new Error('unexpected end of input')
    if (t.type === 'num' || t.type === 'str' || t.type === 'bool') {
      this.eat()
      return t.value as Val
    }
    if (t.type === 'lp') {
      this.eat()
      const v = this.parseOr()
      const close = this.peek()
      if (!close || close.type !== 'rp') throw new Error('expected )')
      this.eat()
      return v
    }
    if (t.type === 'id') {
      this.eat()
      // 拒绝函数调用：标识符后紧跟 ( 一律非法（如 alert(...)）
      if (this.peek()?.type === 'lp') throw new Error('function call not allowed')
      const name = t.value as string
      // 仅允许已声明变量；未声明按假值处理，绝不执行任何代码
      return (name in this.values ? (this.values[name] as Val) : false) as Val
    }
    throw new Error('unexpected token')
  }

  private isOp(v: string): boolean {
    const t = this.peek()
    return t?.type === 'op' && (t.value as string) === v
  }
}

export function evalCondition(expr: string | undefined, values: RuntimeValues): boolean {
  if (!expr || !expr.trim()) return true
  try {
    const tokens = tokenize(expr)
    if (tokens.length === 0) return true
    return Boolean(new ConditionParser(tokens, values).parse())
  } catch {
    // 非法输入 / 安全拦截：宽松显示（不执行任何代码）
    return true
  }
}

/** 按 label 名找到对应行索引（入口 start → 0）。未找到返回 -1。 */
export function findLabelIndex(deltas: LineDelta[], label: string): number {
  if (label === 'start') return 0
  return deltas.findIndex((d) => d.label?.trim() === label)
}
