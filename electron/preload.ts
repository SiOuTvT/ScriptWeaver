import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:getPath', name),

  /** 保存项目文件：弹出原生保存对话框，写入文件 */
  saveFile: (data: { content: string; defaultName?: string }): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('dialog:saveFile', data),

  /** 打开项目文件：弹出原生打开对话框，读取文件内容 */
  openFile: (): Promise<{ success: boolean; content?: string; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('dialog:openFile'),

  on(channel: string, callback: (...args: unknown[]) => void) {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },

  off(channel: string, callback: (...args: unknown[]) => void) {
    ipcRenderer.removeAllListeners(channel)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

// --------------- Type declarations ---------------

export type ElectronAPI = typeof api
