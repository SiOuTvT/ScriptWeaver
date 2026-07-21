import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, nativeTheme, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
import { Readable } from 'stream'
// AI 编排逻辑（纯函数）由主进程持有：密钥不进渲染进程，渲染端只发 prompt 收文本
import { streamChatCompletion, describeAIError, defaultAIConfig, type AIConfig, type ChatMessage } from '../src/utils/aiDirector'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// 托盘常驻模式下，仅当用户通过托盘「退出」或显式 quit 时才真正关闭，
// 平时点窗口 X 只隐藏到托盘（见 createWindow 的 close 拦截）
let isQuiting = false

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

  // 点窗口 X：默认仅隐藏到托盘（进程常驻），避免“窗口又没了”
  mainWindow.on('close', (e) => {
    if (!isQuiting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===================== 系统托盘（常驻 + 一键唤回） =====================
function showMainWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  if (tray) return
  const iconPath = path.join(__dirname, '../assets/tray.png')
  let icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : makeFallbackTrayIcon()
  if (icon.isEmpty()) icon = makeFallbackTrayIcon()
  // Windows 托盘使用小尺寸，避免模糊/过大
  icon = icon.resize({ width: 32, height: 32 })
  tray = new Tray(icon)
  tray.setToolTip('ScriptWeaver')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示窗口', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '退出', click: () => { isQuiting = true; app.quit() } },
    ]),
  )
  // Windows 上托盘图标点击即唤回窗口
  tray.on('click', () => showMainWindow())
}

// 运行时生成纯色方形 PNG，作为缺图标文件时的兜底，确保托盘永不创建失败
function makeFallbackTrayIcon(): nativeImage {
  const size = 32
  const [r, g, b, a] = [30, 41, 59, 255]
  const raw: number[] = []
  for (let y = 0; y < size; y++) {
    raw.push(0) // 每行 filter type 0
    for (let x = 0; x < size; x++) raw.push(r, g, b, a)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const idat = zlib.deflateSync(Buffer.from(raw))
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  return nativeImage.createFromBuffer(buf)
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

app.whenReady().then(() => {
  registerAssetProtocol()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 显式退出（托盘「退出」已置 isQuiting）必须真正退出，否则会残留在无窗口状态
    if (isQuiting) {
      app.quit()
    } else if (process.env.VITE_DEV_SERVER_URL) {
      // dev 模式：窗口一般不会走到这里（close 已拦截为 hide），兜底重建
      if (!mainWindow) createWindow()
    } else {
      app.quit()
    }
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

// 会话素材目录（持久化、路径稳定）
// 注意：必须用「稳定且持久」的路径（userData 下，不含时间戳），且退出时不删除。
// 否则导入但未保存项目的素材会随应用退出 / dev 热重载（electron 重启触发 before-quit）
// 而从临时目录被整体清空，导致 sw-asset 全部 404：图片看不了、音频听不了、时间轴失效。
let sessionDir: string | null = null

function getSessionDir(): string {
  if (!sessionDir) {
    sessionDir = path.join(app.getPath('userData'), 'session-assets')
    ensureDir(sessionDir)
  }
  return sessionDir
}

// 应用退出时只停监听器，不再删除素材目录（素材已落在持久化的 userData 下，
// 删除会导致下次启动全部 404；如需彻底清空，由「新建项目」等显式动作处理）。
app.on('before-quit', () => {
  stopAssetWatch()
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
      // pathname 形如 "/assets/images/sprite/x.png"，可能含中文/空格的百分号编码。
      // decodeURIComponent 对真实文件名里偶发的非法 % 序列会抛错 → 必须容错，
      // 否则协议 handler 抛异常会直接 500，导致整张图渲染断裂（铁律 1 严禁）。
      let rel: string
      try {
        rel = decodeURIComponent(url.pathname)
      } catch {
        rel = url.pathname
      }
      rel = rel.replace(/^\/+/, '')
      console.log('[sw-asset] request', request.url, '| rel=', rel, '| activeRoot=', activeProjectRoot, '| session=', sessionDir)
      if (!rel) return new Response('bad request', { status: 400 })

      const roots: string[] = []
      if (activeProjectRoot) roots.push(activeProjectRoot)
      roots.push(getSessionDir())

      for (const root of roots) {
        const assetsDir = path.resolve(root, 'assets')
        // 候选路径：优先直接拼 rel（rel 已含 assets/），再退一步尝试在 assets/ 下拼接
        // （兼容 relativePath 带或不带 assets/ 前缀两种存储格式，杜绝因前缀差异导致 404）
        const candidates = [
          path.resolve(root, rel),
          path.resolve(root, 'assets', rel),
        ]
        for (const abs of candidates) {
          // 防目录穿越：必须在 assets 子树内
          const inTree = abs === assetsDir || abs.startsWith(assetsDir + path.sep)
          const ext = path.extname(abs).toLowerCase()
          const extOk = IMG_EXTS.includes(ext) || AUDIO_EXTS.includes(ext)
          const exists = fs.existsSync(abs)
          if (!inTree) continue
          if (!extOk) continue
          if (!exists) continue

          const mime = MIME_MAP[ext] ?? 'application/octet-stream'
          // 媒体元素（<audio>/<video>）会发 Range 请求并期望 206 + Content-Range，
          // 必须正确响应范围，否则报 MEDIA_ELEMENT_ERROR 无法播放。图片不需要范围，故不影响。
          const total = fs.statSync(abs).size
          const range = request.headers.get('range')
          if (range) {
            const m = /bytes=(\d+)-(\d*)/.exec(range)
            let start = m ? parseInt(m[1], 10) : 0
            let end = m && m[2] ? parseInt(m[2], 10) : total - 1
            if (isNaN(start) || isNaN(end) || start > end || end >= total) {
              start = 0
              end = total - 1
            }
            const sliceLen = end - start + 1
            // 注意：Range 响应必须用「整段读入内存的定长 body」，不能走流式 ReadableStream。
            // Electron 的 protocol.handle 对「流式 206」支持有坑，会导致 <audio> 收不全数据而
            // 报 MEDIA_ELEMENT_ERROR / 播放无声；图片走的是整文件 200，故一直正常。
            // 关键：fs.readFileSync 的 end 是排他性的，HTTP Range 的 end 是包含性的，
            // 必须 +1 否则 body 比 Content-Length 少 1 字节 → 浏览器一直等 → 音频卡死。
            const slice = fs.readFileSync(abs, { start, end: end + 1 })
            console.log('[sw-asset]  HIT(range)', abs, start, '-', end, '/', total)
            return new Response(new Uint8Array(slice), {
              status: 206,
              headers: {
                'Content-Type': mime,
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(sliceLen),
                'Cache-Control': 'no-cache',
              },
            })
          }
          // 整文件响应：流式 body 不要带 Content-Length，
          // 否则 Electron protocol.handle 会按长度截断/卡死（图片/立绘加载不出）。
          const stream = Readable.toWeb(fs.createReadStream(abs)) as unknown as ReadableStream
          console.log('[sw-asset]  HIT', abs, mime)
          return new Response(stream, {
            headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' },
          })
        }
      }
      console.log('[sw-asset]  NOT FOUND for', rel)
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

// --------------- AI 配置与主进程代理（安全不透明感知） ---------------
// 密钥仅存在于主进程 userData/ai-config.json，渲染进程永远拿不到明文。
const AI_CONFIG_PATH = path.join(app.getPath('userData'), 'ai-config.json')

function readAIConfig(): AIConfig {
  try {
    if (fs.existsSync(AI_CONFIG_PATH)) {
      const p = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf-8'))
      return {
        provider: p.provider ?? 'openai',
        endpoint: p.endpoint ?? defaultAIConfig().endpoint,
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
        model: p.model ?? defaultAIConfig().model,
        temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
        maxTokens: typeof p.maxTokens === 'number' ? p.maxTokens : 2000,
      }
    }
  } catch {
    /* 损坏则回落默认 */
  }
  return defaultAIConfig()
}

function writeAIConfig(incoming: AIConfig): void {
  const existing = readAIConfig()
  const merged: AIConfig = { ...existing, ...incoming }
  // 渲染端传空密钥代表「保留现有密钥」，绝不覆盖已存值
  if (!incoming.apiKey) merged.apiKey = existing.apiKey
  try {
    fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(merged), 'utf-8')
  } catch {
    /* 写入失败静默 */
  }
}

// 渲染端取配置：脱敏（apiKey 置空）+ hasApiKey 标记，确保密钥不透明
ipcMain.handle('ai:getConfig', () => {
  const c = readAIConfig()
  return { ...c, apiKey: '', hasApiKey: !!c.apiKey }
})

ipcMain.handle('ai:setConfig', (_event, cfg: AIConfig) => {
  writeAIConfig(cfg)
  return { ok: true }
})

// 流式对话：渲染端只发 messages，主进程用自有密钥请求上游并回灌 chunk
let activeChat: AbortController | null = null

ipcMain.on('ai:chat', async (event, payload: { messages: ChatMessage[] }) => {
  const cfg = readAIConfig()
  if (!cfg.apiKey) {
    event.sender.send('ai:error', '未配置 API Key（请在 AI 设置中填写，密钥仅存于本地安全区）')
    return
  }
  const controller = new AbortController()
  activeChat = controller
  try {
    const full = await streamChatCompletion(
      cfg,
      payload.messages,
      (delta: string) => event.sender.send('ai:chunk', { delta }),
      controller.signal,
    )
    event.sender.send('ai:done', { full })
  } catch (err: unknown) {
    const e = err as { name?: string }
    if (e?.name === 'AbortError') {
      event.sender.send('ai:aborted')
      return
    }
    event.sender.send('ai:error', describeAIError(err))
  } finally {
    activeChat = null
  }
})

ipcMain.on('ai:abort', () => {
  activeChat?.abort()
})

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

// ===================== 拖入素材（OS 拖放真实路径落盘，绝不返回 Base64） =====================

ipcMain.handle('fs:importFilesFromPaths', async (_event, srcPaths: string[], kind?: AssetKind) => {
  if (!Array.isArray(srcPaths) || srcPaths.length === 0) return { success: false, error: '未提供文件' }
  try {
    const sessionRoot = getSessionDir()
    const files: { id: string; fileName: string; relativePath: string; type: AssetKind }[] = []

    for (const srcPath of srcPaths) {
      if (typeof srcPath !== 'string' || !fs.existsSync(srcPath)) continue
      const ext = path.extname(srcPath).toLowerCase()
      const baseName = path.basename(srcPath)
      const { subdir, type } = resolveSubdir(ext, kind)

      const destDir = path.join(sessionRoot, 'assets', subdir)
      ensureDir(destDir)

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

// ===================== 导出 Ren'Py 项目包 =====================

interface ExportAssetRef {
  assetId: string
  type: 'background' | 'sprite' | 'audio'
  fileName: string
  /** 相对项目根目录的源路径，如 assets/images/background/x.jpg */
  sourceRelativePath: string
  /** 相对 game/ 的导出路径，如 images/background/x.jpg */
  exportRelPath: string
}

interface RpyBundle {
  script: string
  definitions: string
  transforms?: string
  assets: ExportAssetRef[]
}

ipcMain.handle('fs:exportRenpy', async (_event, bundle: RpyBundle) => {
  if (!mainWindow) return { success: false, error: 'No active window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Ren\'Py 导出目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return { success: false }
  const root = result.filePaths[0]
  const gameDir = path.join(root, 'game')

  // 自动创建 game/ 目录结构（与 C 阶段 assets/ 规范同名映射）
  const imgBg = path.join(gameDir, 'images', 'background')
  const imgSpr = path.join(gameDir, 'images', 'sprite')
  const audDir = path.join(gameDir, 'audio')
  ensureDir(imgBg)
  ensureDir(imgSpr)
  ensureDir(audDir)

  // 源根：已保存项目用 projectRoot，否则回落会话目录
  const srcRoot = activeProjectRoot ?? getSessionDir()
  const resolvedSrcRoot = path.resolve(srcRoot)

  // 单文件磁盘直拷（磁盘→磁盘，二进制不进内存），带防目录穿越校验
  let copied = 0
  for (const a of bundle.assets ?? []) {
    const src = path.resolve(resolvedSrcRoot, a.sourceRelativePath)
    // 安全：解析后必须仍落在 srcRoot 子树内（防 ../ 逃逸）
    if (src !== resolvedSrcRoot && !src.startsWith(resolvedSrcRoot + path.sep)) continue
    if (!fs.existsSync(src)) continue
    const dest = path.resolve(gameDir, a.exportRelPath)
    try {
      copyFile(src, dest)
      copied++
    } catch {
      /* 单文件失败不阻断整体导出 */
    }
  }

  try {
    fs.writeFileSync(path.join(gameDir, 'script.rpy'), bundle.script ?? '', 'utf-8')
    fs.writeFileSync(path.join(gameDir, 'definitions.rpy'), bundle.definitions ?? '', 'utf-8')
    if (bundle.transforms && bundle.transforms.trim()) {
      fs.writeFileSync(path.join(gameDir, 'transforms.rpy'), bundle.transforms, 'utf-8')
    }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }

  return { success: true, gameDir, copied }
})
