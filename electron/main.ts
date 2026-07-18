import { app, BrowserWindow, ipcMain, dialog, nativeTheme, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { Readable } from 'stream'

let mainWindow: BrowserWindow | null = null

// --------------- 资产常量 ---------------

const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
const AUDIO_EXTS = ['.mp3', '.ogg', '.wav', '.flac']

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
}

// 统一目录规范：
//   assets/images/background   背景
//   assets/images/sprite       立绘
//   assets/audio               音频
const SUBDIR_BACKGROUND = path.join('images', 'background')
const SUBDIR_SPRITE = path.join('images', 'sprite')
const SUBDIR_AUDIO = 'audio'

type AssetKind = 'background' | 'sprite' | 'audio'

/** 当前活动项目根目录（由渲染进程通过 fs:setActiveProjectRoot 同步） */
let activeProjectRoot: string | null = null

// ===================== 自定义协议注册（必须在 app.ready 之前） =====================

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sw-asset',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
])

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'ScriptWeaver',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerAssetProtocol()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --------------- 工具 ---------------

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
}

/** 递归复制目录 */
function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  ensureDir(dest)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(s, d)
    } else {
      copyFile(s, d)
    }
  }
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** 依据扩展名与 kind 决定落盘子目录 */
function resolveSubdir(ext: string, kind?: AssetKind): { subdir: string; type: AssetKind } {
  if (AUDIO_EXTS.includes(ext)) return { subdir: SUBDIR_AUDIO, type: 'audio' }
  if (kind === 'background') return { subdir: SUBDIR_BACKGROUND, type: 'background' }
  return { subdir: SUBDIR_SPRITE, type: 'sprite' }
}

/** 依据磁盘绝对路径推断资产类型（用于扫描 / 监听） */
function classifyAsset(abs: string): AssetKind | null {
  const ext = path.extname(abs).toLowerCase()
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  if (IMG_EXTS.includes(ext)) {
    const normalized = abs.replace(/\\/g, '/')
    return normalized.includes('/images/background/') ? 'background' : 'sprite'
  }
  return null
}

// 会话临时目录
let sessionDir: string | null = null

function getSessionDir(): string {
  if (!sessionDir) {
    sessionDir = path.join(app.getPath('temp'), `scriptweaver-session-${Date.now()}`)
    ensureDir(sessionDir)
  }
  return sessionDir
}

// 应用退出时清理临时目录 + 监听器
app.on('before-quit', () => {
  stopAssetWatch()
  if (sessionDir && fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true })
    } catch { /* 静默 */ }
  }
})

// ===================== sw-asset:// 协议 Handler =====================

/**
 * 流式零拷贝读取本地素材：
 *   sw-asset://asset/<relativePath>   （relativePath 形如 assets/images/sprite/x.png）
 * 依次在 [activeProjectRoot, sessionDir] 中查找，命中即以文件流返回，二进制永不整体进内存。
 * 安全：路径规范化后必须仍落在 <root>/assets 子树内（防目录穿越）+ 扩展名白名单。
 */
function registerAssetProtocol(): void {
  protocol.handle('sw-asset', (request) => {
    try {
      const url = new URL(request.url)
      // pathname 形如 "/assets/images/sprite/x.png"
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      if (!rel) return new Response('bad request', { status: 400 })

      const roots: string[] = []
      if (activeProjectRoot) roots.push(activeProjectRoot)
      roots.push(getSessionDir())

      for (const root of roots) {
        const assetsDir = path.resolve(root, 'assets')
        const abs = path.resolve(root, rel)
        // 防目录穿越：必须在 assets 子树内
        if (abs !== assetsDir && !abs.startsWith(assetsDir + path.sep)) continue
        const ext = path.extname(abs).toLowerCase()
        if (!IMG_EXTS.includes(ext) && !AUDIO_EXTS.includes(ext)) continue
        if (!fs.existsSync(abs)) continue

        const mime = MIME_MAP[ext] ?? 'application/octet-stream'
        const stream = Readable.toWeb(fs.createReadStream(abs)) as unknown as ReadableStream
        return new Response(stream, {
          headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' },
        })
      }
      return new Response('not found', { status: 404 })
    } catch (err) {
      return new Response(`error: ${(err as Error).message}`, { status: 500 })
    }
  })
}

// ===================== 文件夹增量监听 =====================

let watcher: fs.FSWatcher | null = null
let watchedRoot: string | null = null
const watchDebounce = new Map<string, ReturnType<typeof setTimeout>>()

function stopAssetWatch(): void {
  if (watcher) {
    try { watcher.close() } catch { /* 静默 */ }
    watcher = null
  }
  watchedRoot = null
  for (const t of watchDebounce.values()) clearTimeout(t)
  watchDebounce.clear()
}

function startAssetWatch(projectRoot: string): void {
  if (watchedRoot === projectRoot && watcher) return
  stopAssetWatch()

  const assetsDir = path.join(projectRoot, 'assets')
  ensureDir(assetsDir)
  try {
    watcher = fs.watch(assetsDir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const relFile = filename.toString()
      const abs = path.join(assetsDir, relFile)
      const type = classifyAsset(abs)
      if (!type) return

      // 防抖：编辑器批量写入时合并为一次通知
      const key = abs
      const prev = watchDebounce.get(key)
      if (prev) clearTimeout(prev)
      watchDebounce.set(
        key,
        setTimeout(() => {
          watchDebounce.delete(key)
          const relativePath = ('assets/' + path.relative(assetsDir, abs).replace(/\\/g, '/')).replace(/\/+/g, '/')
          const exists = fs.existsSync(abs)
          mainWindow?.webContents.send('asset:changed', {
            relativePath,
            type,
            exists,
          })
        }, 150),
      )
    })
    watchedRoot = projectRoot
  } catch {
    // 平台不支持 recursive 时静默降级（不影响主流程）
    watcher = null
    watchedRoot = null
  }
}

// ===================== IPC Handlers =====================

ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPath', (_event, name: Parameters<typeof app.getPath>[0]) => {
  return app.getPath(name)
})

ipcMain.handle('app:getSessionDir', () => {
  return getSessionDir()
})

// --------------- 原生主题同步 ---------------
ipcMain.on('app:setNativeTheme', (_event, theme: 'dark' | 'light') => {
  nativeTheme.themeSource = theme
})

// --------------- 设置活动项目根目录（驱动协议查找 + 监听） ---------------
ipcMain.handle('fs:setActiveProjectRoot', (_event, root: string | null) => {
  activeProjectRoot = root && typeof root === 'string' ? root : null
  if (activeProjectRoot) {
    startAssetWatch(activeProjectRoot)
  } else {
    stopAssetWatch()
  }
  return { success: true }
})

// --------------- 扫描项目素材目录 ---------------
ipcMain.handle('fs:scanProjectAssets', (_event, projectRoot: string) => {
  try {
    if (!projectRoot || typeof projectRoot !== 'string') {
      return { success: false, error: '缺少 projectRoot' }
    }
    const assetsDir = path.join(projectRoot, 'assets')
    const out: {
      id: string; type: AssetKind; name: string; fileName: string; relativePath: string; importedAt: string
    }[] = []

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(abs)
        } else {
          const type = classifyAsset(abs)
          if (!type) continue
          const relativePath = 'assets/' + path.relative(assetsDir, abs).replace(/\\/g, '/')
          out.push({
            id: uuid(),
            type,
            name: path.parse(abs).name,
            fileName: path.basename(abs),
            relativePath,
            importedAt: new Date().toISOString(),
          })
        }
      }
    }
    walk(assetsDir)
    return { success: true, assets: out }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// --------------- 保存项目 ---------------

ipcMain.handle('dialog:saveProject', async (_event, data: { projectJson: string; projectName?: string }) => {
  if (!mainWindow) return { success: false, error: 'No active window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择项目保存目录',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) return { success: false }
  const projectDir = result.filePaths[0]
  const projectName = data.projectName || 'untitled'
  const assetsDir = path.join(projectDir, 'assets')

  try {
    ensureDir(path.join(assetsDir, SUBDIR_BACKGROUND))
    ensureDir(path.join(assetsDir, SUBDIR_SPRITE))
    ensureDir(path.join(assetsDir, SUBDIR_AUDIO))

    // 从会话临时目录整体复制素材树到项目 assets 目录
    const sessionAssets = path.join(getSessionDir(), 'assets')
    if (fs.existsSync(sessionAssets)) {
      copyDir(sessionAssets, assetsDir)
    }

    // 写入 .swproj
    const projPath = path.join(projectDir, `${projectName}.swproj`)
    fs.writeFileSync(projPath, data.projectJson, 'utf-8')

    // 保存后激活该项目根目录（协议查找 + 监听）
    activeProjectRoot = projectDir
    startAssetWatch(projectDir)

    return { success: true, projectDir }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// --------------- 打开项目 ---------------

ipcMain.handle('dialog:openProject', async () => {
  if (!mainWindow) return { success: false, error: 'No active window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开项目',
    filters: [
      { name: 'ScriptWeaver 项目', extensions: ['swproj'] },
    ],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return { success: false }

  try {
    const filePath = result.filePaths[0]
    const content = fs.readFileSync(filePath, 'utf-8')
    const projectDir = path.dirname(filePath)

    // 打开后激活该项目根目录（协议查找 + 监听）
    activeProjectRoot = projectDir
    startAssetWatch(projectDir)

    return { success: true, content, projectDir }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// --------------- 导入素材（二进制落盘，绝不返回 Base64） ---------------

ipcMain.handle('dialog:pickAssetFiles', async (_event, options?: {
  filters?: { name: string; extensions: string[] }[]
  kind?: AssetKind
}) => {
  if (!mainWindow) return { success: false, error: 'No active window' }

  const filters = options?.filters || [
    { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
    { name: '音频文件', extensions: ['mp3', 'ogg', 'wav'] },
    { name: '所有文件', extensions: ['*'] },
  ]

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入素材',
    filters,
    properties: ['openFile', 'multiSelections'],
  })

  if (result.canceled || result.filePaths.length === 0) return { success: false }

  try {
    // 内部导入统一落到会话临时目录，保存时再整体复制进项目（保持既有稳定语义）
    const sessionRoot = getSessionDir()
    const files: {
      id: string; fileName: string; relativePath: string; type: AssetKind
    }[] = []

    for (const srcPath of result.filePaths) {
      const ext = path.extname(srcPath).toLowerCase()
      const baseName = path.basename(srcPath)
      const { subdir, type } = resolveSubdir(ext, options?.kind)

      const destDir = path.join(sessionRoot, 'assets', subdir)
      ensureDir(destDir)

      // 避免文件名冲突
      let fileDest = path.join(destDir, baseName)
      let counter = 1
      while (fs.existsSync(fileDest)) {
        const parsed = path.parse(baseName)
        fileDest = path.join(destDir, `${parsed.name}_${counter}${parsed.ext}`)
        counter++
      }

      copyFile(srcPath, fileDest)
      const relativePath = path.join('assets', subdir, path.basename(fileDest)).replace(/\\/g, '/')

      files.push({
        id: uuid(),
        fileName: path.basename(fileDest),
        relativePath,
        type,
      })
    }

    return { success: true, files }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})
