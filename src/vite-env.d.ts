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

  /** 导入素材文件：打开文件选择器 */
  pickAssetFiles: (options?: {
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<{
    success: boolean
    files?: { id: string; fileName: string; relativePath: string; type: string; width?: number; height?: number; dataUrl?: string }[]
    error?: string
  }>

  /** 读取项目的素材文件为 data URL */
  readAssetFile: (relativePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>

  /** 获取会话临时目录路径 */
  getSessionDir: () => Promise<string>

  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
