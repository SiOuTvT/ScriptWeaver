/**
 * Python / Ren'Py 标识符工具（共享纯函数）。
 *
 * 从 utils/rpyExporter.ts 抽出，作为「变量名 / 过渡名 / 槽位名」合法性判断与
 * 清洗的单一数据源，供导出器、导入器及（未来的）变量定义 UI 复用，
 * 并可在纯 Node 环境下单测，无需渲染进程。
 *
 * 行为必须与 rpyExporter 原实现保持一致 —— 这里关系到 Ren'Py 能否编译通过。
 */

/** 合法 Python 标识符正则（字母/下划线开头，仅含 [a-zA-Z0-9_]） */
export const PY_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/** Python 关键字（不可用作变量名） */
export const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield',
])

/** 判断字符串是否为合法且非关键字的 Python 标识符 */
export function isValidPyIdent(name: string): boolean {
  return PY_IDENT_RE.test(name) && !PYTHON_KEYWORDS.has(name)
}

/** 把任意过渡字符串清洗为合法 Python 标识符（小写、仅 [a-z0-9_]），空结果回退 'dissolve' */
export function sanitizeIdent(t: string): string {
  return (
    t
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'dissolve'
  )
}

/**
 * 把变量名安全地用于 Ren'Py 代码生成：合法标识符原样返回；非法名做防御性清洗
 * （与 default / $ 同一处理，保证自洽可编译）。导出前 validateExportNames 已负责报错提示。
 */
export function pyVarName(name: string): string {
  if (PY_IDENT_RE.test(name)) return name
  return sanitizeIdent(name)
}
