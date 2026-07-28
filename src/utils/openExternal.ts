/**
 * 打开外部 URL —— 优先通过 Electron shell.openExternal，
 * 降级到 window.open 兜底，并给用户可视化反馈。
 */
export function openExternal(url: string): void {
  // Electron 环境：走主进程安全 API
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url).catch((err: unknown) => {
      console.error('[openExternal] 系统浏览器打开失败:', url, err)
      // 降级：尝试 window.open
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        alert('无法打开浏览器，请手动复制链接访问：\n' + url)
      }
    })
    return
  }

  // 浏览器 dev 模式：直接用 window.open
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  if (!w) {
    alert('无法打开链接，请手动复制访问：\n' + url)
  }
}
