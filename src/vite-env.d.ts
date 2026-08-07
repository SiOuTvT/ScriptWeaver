/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>
  getPath: (name: string) => Promise<string>

  /** 保存项目：选目录 → 创建 assets/ 结构 → 复制素材 → 写 .swproj */
  saveProject: (data: {
    projectJson: string
    projectName?: string
  }) => Promise<{ success: boolean; projectDir?: string; error?: string }>

  /** 静默保存：直接写入已知项目目录，不弹对话框（自动保存用） */
  saveProjectToPath: (data: {
    projectDir: string
    projectJson: string
    projectName?: string
  }) => Promise<{ success: boolean; error?: string }>

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
    kind?: 'background' | 'sprite' | 'audio' | 'video' | 'effect'
  }) => Promise<{
    success: boolean
    files?: { id: string; fileName: string; relativePath: string; type: 'background' | 'sprite' | 'audio' | 'video' | 'effect' }[]
    error?: string
  }>

  /** 拖入素材：接收 OS 拖放的真实文件路径，二进制落盘（不返回 Base64） */
  importFilesFromPaths: (
    srcPaths: string[],
    kind?: 'background' | 'sprite' | 'audio' | 'video' | 'effect',
  ) => Promise<{
    success: boolean
    files?: { id: string; fileName: string; relativePath: string; type: 'background' | 'sprite' | 'audio' | 'video' | 'effect' }[]
    error?: string
  }>

  /** 设置活动项目根目录：驱动 sw-asset:// 协议查找 + 文件夹监听 */
  setActiveProjectRoot: (root: string | null) => Promise<{ success: boolean }>

  /** 扫描项目 assets 目录，返回磁盘素材清单 */
  scanProjectAssets: (projectRoot: string) => Promise<{
    success: boolean
    assets?: {
      id: string
      type: 'background' | 'sprite' | 'audio' | 'video' | 'effect'
      name: string
      fileName: string
      relativePath: string
      importedAt: string
    }[]
    error?: string
  }>

  /** 清除本地缓存：清理 snapshots 目录（素材已统一存储于项目目录下，不再使用 session-assets） */
  clearLocalCache: () => Promise<{ success: boolean; removedDirs?: number; error?: string }>

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
  /** 从厂商实时拉取可用模型列表 */
  aiListModels: () => Promise<{ success: boolean; models?: string[]; error?: string }>
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

  // --------------- Ren'Py 引擎对接 ---------------
  /** 探测本机 Ren'Py SDK（版本、路径）；可传手动指定的 SDK 根目录优先探测 */
  renpyDetectSdk: (manualPath?: string) => Promise<{
    detected: boolean
    sdkPath?: string
    launcher?: string
    version?: string | null
    hint?: string
  }>
  /** 将 RpyBundle 暂存为可直接被 Ren'Py 打开的工程目录 */
  renpyStageProject: (payload: {
    bundle: unknown
    title: string
  }) => Promise<{ success: boolean; projectDir?: string; copied?: number; missingCount?: number; error?: string }>
  /** 调用 SDK 运行 / 构建分发包 / Lint 校验 */
  renpyRunEngine: (payload: {
    action: 'run' | 'build' | 'lint'
    sdkPath?: string
    projectDir: string
  }) => Promise<{
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
  }>

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

  /** 选择目录（返回路径） */
  selectDirectory: () => Promise<{ path?: string; cancelled?: boolean }>

  /** 文件系统基础操作（用于导入 Ren'Py 工程） */
  fs: {
    readdir: (dirPath: string) => Promise<string[]>
    readFile: (filePath: string, encoding: string) => Promise<string>
  }

  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
  /** 渲染端完成「退出前自动备份」后回执主进程放行退出 */
  quitSnapshotDone: () => void

  /** 使用系统默认浏览器打开外部 URL */
  openExternal: (url: string) => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
