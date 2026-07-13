/**
 * 轻量 className 合并工具（无外部依赖）。
 * 接收任意个 字符串 / falsy 值，过滤 falsy 后用空格拼接。
 */
export type ClassValue = string | number | false | null | undefined

export function cn(...values: ClassValue[]): string {
  let out = ''
  for (const v of values) {
    if (!v && v !== 0) continue
    out += (out ? ' ' : '') + v
  }
  return out
}
