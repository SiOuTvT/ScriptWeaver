/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>
  getPath: (name: string) => Promise<string>

  /** 保存项目：选目录 → 创建 assets/ 结构 → 复制素材 → 写 .swproj */
  saveProject: (data: {
    projectJson: string
    projectName?: string
  }) => Promise<{ success: boolean; projectDir?: string; error?: string }>

  /** 打开项目：选 .swproj → 读取 JSON + 设置 projectRoot */
  openProject: () => Promise<{
    success: boolean
    content?: string
    projectDir?: string
    error?: string
  }>

  /** 导入素材文件：打开文件选择器（二进制落盘，无 Base64） */
  pickAssetFiles: (options?: {
    filters?: { name: string; extensions: string[] }[]
    kind?: 'background' | 'sprite' | 'audio'
  }) => Promise<{
    success: boolean
    files?: { id: string; fileName: string; relativePath: string; type: 'background' | 'sprite' | 'audio' }[]
    error?: string
  }>

  /** 设置活动项目根目录：驱动 sw-asset:// 协议查找 + 文件夹监听 */
  setActiveProjectRoot: (root: string | null) => Promise<{ success: boolean }>

  /** 扫描项目 assets 目录，返回磁盘素材清单 */
  scanProjectAssets: (projectRoot: string) => Promise<{
    success: boolean
    assets?: {
      id: string
      type: 'background' | 'sprite' | 'audio'
      name: string
      fileName: string
      relativePath: string
      importedAt: string
    }[]
    error?: string
  }>

  /** 获取会话临时目录路径 */
  getSessionDir: () => Promise<string>

  /** 同步原生窗口主题（标题栏等） */
  setNativeTheme: (theme: 'dark' | 'light') => void

  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
