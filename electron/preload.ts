import { contextBridge, ipcRenderer } from 'electron'
import type { AIConfig, ChatMessage } from '../src/utils/aiDirector'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:getPath', name),

  /** 清除本地缓存：清理 snapshots 目录（素材已统一存储于项目目录下） */
  clearLocalCache: (): Promise<{ success: boolean; removedDirs?: number; error?: string }> =>
    ipcRenderer.invoke('app:clearLocalCache'),

  /** 导出 Ren'Py 项目包：选目录 → 建 game/ 结构 → 磁盘直拷素材 → 写 .rpy */
  exportRenpy: (
    bundle: unknown,
  ): Promise<{ success: boolean; gameDir?: string; copied?: number; error?: string }> =>
    ipcRenderer.invoke('fs:exportRenpy', bundle),

  /** 同步原生窗口主题（标题栏等），fire-and-forget */
  setNativeTheme: (theme: 'dark' | 'light'): void => ipcRenderer.send('app:setNativeTheme', theme),

  // --------------- AI 桥接（密钥不进渲染进程） ---------------
  /** 取脱敏后的 AI 配置（含 hasApiKey 标记） */
  aiGetConfig: (): Promise<AIConfig & { hasApiKey: boolean }> =>
    ipcRenderer.invoke('ai:getConfig'),

  /** 保存 AI 配置（密钥落入主进程安全区） */
  aiSetConfig: (cfg: AIConfig): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('ai:setConfig', cfg),

  /** 发送对话请求（只发 messages，密钥由主进程注入） */
  aiChat: (payload: { messages: ChatMessage[] }): void =>
    ipcRenderer.send('ai:chat', payload),

  /** 中断当前流式对话 */
  aiAbort: (): void => ipcRenderer.send('ai:abort'),

  /** 订阅流式 chunk */
  onAiChunk: (cb: (d: { delta: string }) => void): void =>
    ipcRenderer.on('ai:chunk', (_e, d) => cb(d)),
  /** 订阅完成 */
  onAiDone: (cb: (d: { full: string }) => void): void =>
    ipcRenderer.on('ai:done', (_e, d) => cb(d)),
  /** 订阅错误 */
  onAiError: (cb: (msg: string) => void): void =>
    ipcRenderer.on('ai:error', (_e, d) => cb(d)),
  /** 订阅中断 */
  onAiAborted: (cb: () => void): void =>
    ipcRenderer.on('ai:aborted', () => cb()),
  /** 清理 AI 流式监听 */
  removeAiListeners: (): void => {
    ipcRenderer.removeAllListeners('ai:chunk')
    ipcRenderer.removeAllListeners('ai:done')
    ipcRenderer.removeAllListeners('ai:error')
    ipcRenderer.removeAllListeners('ai:aborted')
  },

  /** TTS 一键合成：主进程复用 AI 配置的密钥调用兼容接口，音频落盘会话目录后返回素材元数据 */
  ttsSynthesize: (payload: {
    text: string
    voiceId: string
    charId: string
    lineTag: string
    speed?: number
    pitch?: number
    format?: 'mp3' | 'wav' | 'ogg'
  }): Promise<{
    success: boolean
    asset?: { id: string; fileName: string; relativePath: string }
    error?: string
  }> => ipcRenderer.invoke('tts:synthesize', payload),

  /** 导出 Web 独立包：主进程复制播放器模板 + 素材 + 写入 game.json 到目标目录 */
  exportWeb: (bundle: {
    gameJson: string
    assetRefs: { assetId: string; type: string; sourceRelativePath: string; exportRelPath: string }[]
    title: string
  }): Promise<{ success: boolean; outDir?: string; copied?: number; error?: string }> =>
    ipcRenderer.invoke('fs:exportWeb', bundle),

  // ----- 云端同步 / 版本快照（本地版本库） -----
  /** 创建版本快照（手动或自动静默备份） */
  snapshotProject: (payload: {
    projectId: string
    projectJson: string
    label?: string
    auto?: boolean
  }): Promise<{ success: boolean; id?: string; error?: string }> =>
    ipcRenderer.invoke('fs:snapshotProject', payload),

  /** 列出某项目的版本快照（轻量元数据） */
  listSnapshots: (projectId: string): Promise<{ success: boolean; snapshots: unknown[]; error?: string }> =>
    ipcRenderer.invoke('fs:listSnapshots', projectId),

  /** 读取快照完整工程 JSON（用于回滚） */
  restoreSnapshot: (projectId: string, id: string): Promise<{ success: boolean; projectJson?: string; error?: string }> =>
    ipcRenderer.invoke('fs:restoreSnapshot', projectId, id),

  /** 删除快照 */
  deleteSnapshot: (projectId: string, id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:deleteSnapshot', projectId, id),

  /** 释放素材本地缓存（删除磁盘文件，保留库内元数据） */
  evictAssetCache: (relativePath: string): Promise<{ success: boolean; removed?: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:evictAssetCache', relativePath),

  /** 按需从云端地址重新下载素材到会话目录 */
  downloadAsset: (remoteUrl: string, relativePath: string): Promise<{ success: boolean; bytes?: number; error?: string }> =>
    ipcRenderer.invoke('fs:downloadAsset', remoteUrl, relativePath),

  /** 选择目录 */
  selectDirectory: (): Promise<{ path?: string; cancelled?: boolean }> =>
    ipcRenderer.invoke('dialog:selectDirectory'),

  /** 文件系统基础操作（用于导入 Ren'Py 工程） */
  fs: {
    readdir: (dirPath: string): Promise<string[]> => ipcRenderer.invoke('fs:readdir', dirPath),
    readFile: (filePath: string, encoding: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath, encoding),
  },


  /** 保存项目：选目录 → 复制素材 → 写 .swproj */
  saveProject: (data: {
    projectJson: string
    projectName?: string
  }): Promise<{ success: boolean; projectDir?: string; error?: string }> =>
    ipcRenderer.invoke('dialog:saveProject', data),

  /** 静默保存：直接写入已知项目目录，不弹对话框（自动保存用） */
  saveProjectToPath: (data: {
    projectDir: string
    projectJson: string
    projectName?: string
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dialog:saveProjectToPath', data),

  /** 打开项目：选 .swproj → 返回 JSON 内容 + 项目根目录 */
  openProject: (): Promise<{
    success: boolean
    content?: string
    projectDir?: string
    error?: string
  }> => ipcRenderer.invoke('dialog:openProject'),

  /** 导入素材：打开文件选择器，二进制复制到会话目录（不再返回 Base64） */
  pickAssetFiles: (options?: {
    filters?: { name: string; extensions: string[] }[]
    kind?: 'background' | 'sprite' | 'audio'
  }): Promise<{
    success: boolean
    files?: {
      id: string
      fileName: string
      relativePath: string
      type: 'background' | 'sprite' | 'audio'
    }[]
    error?: string
  }> => ipcRenderer.invoke('dialog:pickAssetFiles', options),

  /** 拖入素材：接收 OS 拖放的真实文件路径，二进制落盘（不返回 Base64） */
  importFilesFromPaths: (
    srcPaths: string[],
    kind?: 'background' | 'sprite' | 'audio',
  ): Promise<{
    success: boolean
    files?: { id: string; fileName: string; relativePath: string; type: 'background' | 'sprite' | 'audio' }[]
    error?: string
  }> => ipcRenderer.invoke('fs:importFilesFromPaths', srcPaths, kind),

  /** 设置活动项目根目录：驱动 sw-asset:// 协议查找 + 开启文件夹监听 */
  setActiveProjectRoot: (root: string | null): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('fs:setActiveProjectRoot', root),

  // --------------- Ren'Py 引擎对接 ---------------
  /** 探测本机 Ren'Py SDK（版本、路径） */
  renpyDetectSdk: (): Promise<{
    detected: boolean
    sdkPath?: string
    launcher?: string
    version?: string | null
    hint?: string
  }> => ipcRenderer.invoke('renpy:detectSdk'),

  /** 将 RpyBundle 暂存为可直接被 Ren'Py 打开的工程目录 */
  renpyStageProject: (payload: {
    bundle: unknown
    title: string
  }): Promise<{ success: boolean; projectDir?: string; copied?: number; missingCount?: number; error?: string }> =>
    ipcRenderer.invoke('renpy:stageProject', payload),

  /** 调用 SDK 运行 / 构建分发包 / Lint 校验 */
  renpyRunEngine: (payload: {
    action: 'run' | 'build' | 'lint'
    sdkPath?: string
    projectDir: string
  }): Promise<{
    success: boolean
    action?: string
    pid?: number
    projectDir?: string
    output?: string
    exitCode?: number
    logFile?: string
    distDir?: string
    started?: boolean
    error?: string
  }> => ipcRenderer.invoke('renpy:runEngine', payload),

  /** 扫描项目 assets 目录，返回磁盘素材清单（元数据，无二进制） */
  scanProjectAssets: (projectRoot: string): Promise<{
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
  }> => ipcRenderer.invoke('fs:scanProjectAssets', projectRoot),

  on(channel: string, callback: (...args: unknown[]) => void) {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },

  off(channel: string, _callback: (...args: unknown[]) => void) {
    ipcRenderer.removeAllListeners(channel)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
