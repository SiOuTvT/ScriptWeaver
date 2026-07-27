// ============================================================
// renpyText 单元测试：分词 / 校验 / 插值 / 布局 / 打字机计数
// 语法基准：Ren'Py 官方 Text 文档（text tags + interpolation）
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  tokenizeRenpyText,
  validateRenpyText,
  stripRenpyMarkup,
  layoutRenpyText,
  resolveSizeCss,
  countVisibleChars,
} from '../renpyText'

describe('tokenizeRenpyText 分词', () => {
  it('纯文本原样输出', () => {
    const { tokens, issues } = tokenizeRenpyText('你好，世界')
    expect(issues).toHaveLength(0)
    expect(tokens).toEqual([{ kind: 'text', text: '你好，世界' }])
  })

  it('成对标签与自闭合标签正确区分', () => {
    const { tokens } = tokenizeRenpyText('{b}加粗{/b}{w=0.5}后续')
    expect(tokens).toEqual([
      { kind: 'open', name: 'b', arg: null },
      { kind: 'text', text: '加粗' },
      { kind: 'close', name: 'b' },
      { kind: 'self', name: 'w', arg: '0.5' },
      { kind: 'text', text: '后续' },
    ])
  })

  it('变量插值与转换后缀', () => {
    const { tokens } = tokenizeRenpyText('好感度[trust]，姓名[name!t]')
    expect(tokens).toContainEqual({ kind: 'interp', expr: 'trust', conversion: null })
    expect(tokens).toContainEqual({ kind: 'interp', expr: 'name', conversion: 't' })
  })

  it('字面转义 {{ 与 [[ 不产生标签', () => {
    const { tokens, issues } = tokenizeRenpyText('字面{{括号}}与[[方括]')
    expect(issues).toHaveLength(0)
    // }} 的第二个 } 是普通字符；[[ 转义为 [
    expect(tokens[0]).toEqual({ kind: 'text', text: '字面{括号}}与[方括]' })
  })

  it('未闭合花括号报错且不抛异常', () => {
    const { issues } = tokenizeRenpyText('坏的{color=#f00')
    expect(issues.some((i) => i.severity === 'error')).toBe(true)
  })
})

describe('validateRenpyText 校验', () => {
  it('合法富文本零问题', () => {
    expect(validateRenpyText('{b}你好{/b} {color=#ff5555}红{/color}{w=0.5}[trust]', ['trust'])).toHaveLength(0)
  })

  it('未知标签报错', () => {
    const iss = validateRenpyText('{blink}闪烁{/blink}')
    expect(iss.some((i) => i.severity === 'error' && i.message.includes('blink'))).toBe(true)
  })

  it('未闭合成对标签报错', () => {
    const iss = validateRenpyText('{b}加粗没关')
    expect(iss.some((i) => i.message.includes('未闭合'))).toBe(true)
  })

  it('交叉嵌套报错', () => {
    const iss = validateRenpyText('{b}{i}文字{/b}{/i}')
    expect(iss.some((i) => i.message.includes('交叉嵌套'))).toBe(true)
  })

  it('缺参数标签报错（color/size/w=非数字）', () => {
    expect(validateRenpyText('{color}x{/color}').some((i) => i.severity === 'error')).toBe(true)
    expect(validateRenpyText('{w=abc}').some((i) => i.severity === 'error')).toBe(true)
  })

  it('未定义变量给警告，已定义不报', () => {
    const iss = validateRenpyText('[unknown_var]', ['trust'])
    expect(iss.some((i) => i.severity === 'warning' && i.message.includes('unknown_var'))).toBe(true)
    expect(validateRenpyText('[trust]', ['trust'])).toHaveLength(0)
  })
})

describe('stripRenpyMarkup 净化', () => {
  it('去除全部标签保留可见文本', () => {
    expect(stripRenpyMarkup('{b}你好{/b}{w=0.5}世界{p}再见')).toBe('你好世界再见')
  })

  it('插值按运行时值替换', () => {
    expect(stripRenpyMarkup('好感[trust]点', { trust: 7 })).toBe('好感7点')
  })

  it('无值时保留变量名', () => {
    expect(stripRenpyMarkup('好感[trust]点')).toBe('好感trust点')
  })
})

describe('layoutRenpyText 渲染布局', () => {
  it('样式正确叠加与闭合', () => {
    const pieces = layoutRenpyText('普通{b}粗{i}粗斜{/i}{/b}尾')
    const chunks = pieces.filter((p) => p.kind === 'chunk')
    expect(chunks).toHaveLength(4)
    expect(chunks[0]).toMatchObject({ text: '普通', style: { bold: false, italic: false } })
    expect(chunks[1]).toMatchObject({ text: '粗', style: { bold: true, italic: false } })
    expect(chunks[2]).toMatchObject({ text: '粗斜', style: { bold: true, italic: true } })
    expect(chunks[3]).toMatchObject({ text: '尾', style: { bold: false, italic: false } })
  })

  it('{w} 与 {p} 生成停顿与换行事件', () => {
    const pieces = layoutRenpyText('前{w=1.5}中{p}后')
    expect(pieces).toContainEqual({ kind: 'pause', ms: 1500 })
    expect(pieces.some((p) => p.kind === 'break')).toBe(true)
  })

  it('插值用运行时值，缺失保留 [var] 提示', () => {
    const withVal = layoutRenpyText('值[x]', { x: 3 }).filter((p) => p.kind === 'chunk')
    expect(withVal[0]).toMatchObject({ text: '值3' })
    const noVal = layoutRenpyText('值[x]').filter((p) => p.kind === 'chunk')
    expect(noVal[0]).toMatchObject({ text: '值[x]' })
  })

  it('未知标签原样显示不吞字', () => {
    const chunks = layoutRenpyText('{bogus}文字').filter((p) => p.kind === 'chunk')
    expect(chunks.map((c) => (c.kind === 'chunk' ? c.text : '')).join('')).toBe('{bogus}文字')
  })

  it('颜色与字号进入样式', () => {
    const chunks = layoutRenpyText('{color=#f00}{size=+4}大红{/size}{/color}').filter((p) => p.kind === 'chunk')
    expect(chunks[0]).toMatchObject({ style: { color: '#f00', size: '+4' } })
  })
})

describe('辅助函数', () => {
  it('resolveSizeCss 相对与绝对换算', () => {
    expect(resolveSizeCss('+4', 15)).toBe(19)
    expect(resolveSizeCss('-4', 15)).toBe(11)
    expect(resolveSizeCss('24', 15)).toBe(24)
    expect(resolveSizeCss(null, 15)).toBeUndefined()
  })

  it('countVisibleChars 只数可见字符', () => {
    const pieces = layoutRenpyText('{b}你好{/b}{w}世界', { })
    expect(countVisibleChars(pieces)).toBe(4)
  })
})
