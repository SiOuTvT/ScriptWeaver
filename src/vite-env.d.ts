/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>
  getPath: (name: string) => Promise<string>
  saveFile: (data: { content: string; defaultName?: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>
  openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; error?: string }>
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
