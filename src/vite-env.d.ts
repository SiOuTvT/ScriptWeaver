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

  /** 拖入素材：接收 OS 拖放的真实文件路径，二进制落盘（不返回 Base64） */
  importFilesFromPaths: (
    srcPaths: string[],
    kind?: 'background' | 'sprite' | 'audio',
  ) => Promise<{
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

  /** 导出 Ren'Py 项目包：主进程建 game/ 目录 + 磁盘直拷素材 */
  exportRenpy: (bundle: unknown) => Promise<{
    success: boolean
    gameDir?: string
    copied?: number
    error?: string
  }>

  /** 同步原生窗口主题（标题栏等） */
  setNativeTheme: (theme: 'dark' | 'light') => void

  // --------------- AI 桥接（密钥不进渲染进程） ---------------
  aiGetConfig: () => Promise<import('./utils/aiDirector').AIConfig & { hasApiKey: boolean }>
  aiSetConfig: (cfg: import('./utils/aiDirector').AIConfig) => Promise<{ ok: boolean }>
  aiChat: (payload: { messages: import('./utils/aiDirector').ChatMessage[] }) => void
  aiAbort: () => void
  onAiChunk: (cb: (d: { delta: string }) => void) => void
  onAiDone: (cb: (d: { full: string }) => void) => void
  onAiError: (cb: (msg: string) => void) => void
  onAiAborted: (cb: () => void) => void
  removeAiListeners: () => void

  /** TTS 一键合成：主进程复用 AI 配置密钥，音频落盘会话目录后返回素材元数据 */
  ttsSynthesize: (payload: {
    text: string
    voiceId: string
    charId: string
    lineTag: string
    speed?: number
    pitch?: number
    format?: 'mp3' | 'wav' | 'ogg'
  }) => Promise<{
    success: boolean
    asset?: { id: string; fileName: string; relativePath: string }
    error?: string
  }>

  /** 导出 Web 独立包：主进程复制播放器模板 + 素材 + 写入 game.json 到目标目录 */
  exportWeb: (bundle: {
    gameJson: string
    assetRefs: { assetId: string; type: string; sourceRelativePath: string; exportRelPath: string }[]
    title: string
  }) => Promise<{ success: boolean; outDir?: string; copied?: number; error?: string }>

  // ----- 云端同步 / 版本快照（本地版本库） -----
  /** 创建版本快照（手动或自动静默备份） */
  snapshotProject: (payload: {
    projectId: string
    projectJson: string
    label?: string
    auto?: boolean
  }) => Promise<{ success: boolean; id?: string; error?: string }>
  /** 列出某项目的版本快照（轻量元数据） */
  listSnapshots: (projectId: string) => Promise<{ success: boolean; snapshots: unknown[]; error?: string }>
  /** 读取快照完整工程 JSON（用于回滚） */
  restoreSnapshot: (projectId: string, id: string) => Promise<{ success: boolean; projectJson?: string; error?: string }>
  /** 删除快照 */
  deleteSnapshot: (projectId: string, id: string) => Promise<{ success: boolean; error?: string }>
  /** 释放素材本地缓存（删除磁盘文件，保留库内元数据） */
  evictAssetCache: (relativePath: string) => Promise<{ success: boolean; removed?: boolean; error?: string }>
  /** 按需从云端地址重新下载素材到会话目录 */
  downloadAsset: (remoteUrl: string, relativePath: string) => Promise<{ success: boolean; bytes?: number; error?: string }>

  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
