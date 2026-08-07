import { describe, it, expect } from 'vitest'
import { isValidPyIdent, sanitizeIdent, pyVarName, PYTHON_KEYWORDS } from '../pyIdent'

describe('isValidPyIdent', () => {
  it('合法标识符（字母/下划线开头，仅含 [a-zA-Z0-9_]）通过', () => {
    expect(isValidPyIdent('trust')).toBe(true)
    expect(isValidPyIdent('hero_1')).toBe(true)
    expect(isValidPyIdent('_internal')).toBe(true)
  })

  it('数字开头 / 含非法字符 → 不合法', () => {
    expect(isValidPyIdent('1bad')).toBe(false)
    expect(isValidPyIdent('bad-name')).toBe(false)
    expect(isValidPyIdent('bad.name')).toBe(false)
    expect(isValidPyIdent('')).toBe(false)
  })

  it('Python 关键字一律不合法', () => {
    expect(isValidPyIdent('class')).toBe(false)
    expect(isValidPyIdent('None')).toBe(false)
    expect(isValidPyIdent('yield')).toBe(false)
    expect(PYTHON_KEYWORDS.has('def')).toBe(true)
  })
})

describe('sanitizeIdent（过渡名清洗）', () => {
  it('小写化并收敛为 [a-z0-9_]', () => {
    expect(sanitizeIdent('Dissolve!')).toBe('dissolve')
    expect(sanitizeIdent('my Transition')).toBe('my_transition')
    expect(sanitizeIdent('Already_Fine')).toBe('already_fine')
  })

  it('清洗后为空 → 回退 dissolve', () => {
    expect(sanitizeIdent('---')).toBe('dissolve')
    expect(sanitizeIdent('   ')).toBe('dissolve')
  })
})

describe('pyVarName（变量名安全输出）', () => {
  it('合法名原样返回', () => {
    expect(pyVarName('trust')).toBe('trust')
    expect(pyVarName('hero_1')).toBe('hero_1')
  })

  it('非法名防御性清洗为可编译标识符', () => {
    expect(pyVarName('bad-name')).toBe('bad_name')
    expect(pyVarName('好感度')).toBe('dissolve') // 全非 ASCII → 清洗为空 → 回退默认过渡名
  })
})
