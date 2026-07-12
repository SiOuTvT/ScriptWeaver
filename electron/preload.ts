import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:getPath', name),

  /** 获取会话临时目录 */
  getSessionDir: (): Promise<string> => ipcRenderer.invoke('app:getSessionDir'),

  /** 保存项目：选目录 → 复制素材 → 写 .swproj */
  saveProject: (data: {
    projectJson: string
    projectName?: string
  }): Promise<{ success: boolean; projectDir?: string; error?: string }> =>
    ipcRenderer.invoke('dialog:saveProject', data),

  /** 打开项目：选 .swproj → 返回 JSON 内容 + 项目根目录 */
  openProject: (): Promise<{
    success: boolean
    content?: string
    projectDir?: string
    error?: string
  }> => ipcRenderer.invoke('dialog:openProject'),

  /** 导入素材：打开文件选择器，复制到临时目录 */
  pickAssetFiles: (options?: {
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{
    success: boolean
    files?: {
      id: string
      fileName: string
      relativePath: string
      type: string
      width?: number
      height?: number
      dataUrl?: string
    }[]
    error?: string
  }> => ipcRenderer.invoke('dialog:pickAssetFiles', options),

  /** 读取项目的素材文件为 data URL */
  readAssetFile: (relativePath: string, projectRoot?: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> =>
    ipcRenderer.invoke('fs:readAssetFile', relativePath, projectRoot),

  on(channel: string, callback: (...args: unknown[]) => void) {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },

  off(channel: string, callback: (...args: unknown[]) => void) {
    ipcRenderer.removeAllListeners(channel)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
