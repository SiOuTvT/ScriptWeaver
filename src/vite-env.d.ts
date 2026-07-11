/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>
  getPath: (name: string) => Promise<string>
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
