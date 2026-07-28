/**
 * 打开外部 URL —— 强制通过 system default browser（shell.openExternal）。
 * 严禁 window.open / iframe 等内嵌行为。
 */
export function openExternal(url: string): void {
  if (!window.electronAPI?.openExternal) {
    console.error('[openExternal] electronAPI 不可用，无法打开 URL:', url)
    return
  }
  window.electronAPI.openExternal(url).catch((err: unknown) => {
    console.error('[openExternal] 系统浏览器打开失败:', url, err)
  })
}
