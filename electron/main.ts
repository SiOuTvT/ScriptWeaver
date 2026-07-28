import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, nativeTheme, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'
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
      sandbox: true,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged

  // 动态 CSP：Dev 模式放行 Vite HMR (ws://localhost) 和 localhost 资源，生产模式严格
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self' http://localhost:* ws://localhost:*;",
          "script-src 'self' 'unsafe-inline' http://localhost:*;",
          "style-src 'self' 'unsafe-inline' http://localhost:*;",
          "font-src 'self' data: http://localhost:*;",
          "img-src 'self' data: sw-asset: blob: http://localhost:*;",
          "media-src 'self' data: sw-asset: blob: http://localhost:*;",
          "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:*;",
        ].join(' ')
      : [
          "default-src 'self';",
          "script-src 'self' 'unsafe-inline';",
          "style-src 'self' 'unsafe-inline';",
          "font-src 'self' data:;",
          "img-src 'self' data: sw-asset: blob:;",
          "media-src 'self' data: sw-asset: blob:;",
        ].join(' ')
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  if (isDev) {
    // 开发模式：加载 Vite 开发服务器，失败时自动重试（兼容并行启动时序）
    const tryLoad = (retries = 0) => {
      mainWindow!.loadURL(devUrl).catch((err) => {
        console.warn(`[dev] loadURL ${devUrl} failed (retry ${retries}): ${String(err)}`)
        if (retries < 10) {
          setTimeout(() => tryLoad(retries + 1), 1500)
        } else {
          mainWindow!.loadFile(path.join(__dirname, '../dist/index.html'))
        }
      })
    }
    tryLoad()
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

// 所有素材统一存储在项目目录下的 assets/ 中（不再使用系统 AppData）。
// 导入/保存/导出均直接读写 activeProjectRoot/assets/，实现"随删随清、随移随走"。
// 导入素材前必须先保存项目（确定 projectRoot），否则返回明确错误提示。

// Web 导出模板目录：开发期指向仓库根 web-player，打包后随 extraResources 进入 resources/web-player
function getWebTemplateDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web-player')
  }
  return path.join(__dirname, '..', 'web-player')
}


// 应用退出时只停监听器。素材已统一存储于项目目录 assets/ 下，无需清理。
app.on('before-quit', () => {
  stopAssetWatch()
})

// ===================== sw-asset:// 协议 Handler =====================

/**
 * 流式零拷贝读取本地素材：
 *   sw-asset://asset/<relativePath>   （relativePath 形如 assets/images/sprite/x.png）
 * 在 activeProjectRoot 中查找（仅项目目录，不再使用系统 AppData），
 * 命中即以文件流返回，二进制永不整体进内存。
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
      console.log('[sw-asset] request', request.url, '| rel=', rel, '| activeRoot=', activeProjectRoot)
      if (!rel) return new Response('bad request', { status: 400 })

      const roots: string[] = []
      if (activeProjectRoot) roots.push(activeProjectRoot)

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
        ttsModel: typeof p.ttsModel === 'string' && p.ttsModel.trim() ? p.ttsModel : 'tts-1',
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

// --------------- TTS 一键合成（主进程代理，复用 AI 配置密钥） ---------------
ipcMain.handle('tts:synthesize', async (_event, payload: {
  text: string
  voiceId: string
  charId: string
  lineTag: string
  speed?: number
  pitch?: number
  format?: 'mp3' | 'wav' | 'ogg'
}) => {
  if (!activeProjectRoot) return { success: false, error: '请先保存项目，再使用 TTS 配音' }
  const cfg = readAIConfig()
  if (!cfg.apiKey) {
    return { success: false, error: '未配置 AI API 密钥（请先在 AI 设置中填写密钥）' }
  }
  try {
    const ttsEndpoint = cfg.endpoint.replace(/\/chat\/completions\/?$/, '/audio/speech')
    const fmt = payload.format || 'mp3'
    const body: Record<string, unknown> = {
      model: cfg.ttsModel || 'tts-1',
      input: payload.text || ' ',
      voice: payload.voiceId || 'alloy',
      response_format: fmt,
    }
    if (payload.speed != null) body.speed = payload.speed

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 120000)

    let resp: Response
    try {
      resp = await fetch(ttsEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      return { success: false, error: `TTS API 返回 ${resp.status}${errText ? ': ' + errText.slice(0, 200) : ''}` }
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    const safeChar = (payload.charId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
    const safeLine = (payload.lineTag || 'L0').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 16)
    const id = uuid()
    const fileName = `tts_${safeChar}_${safeLine}_${id.slice(0, 8)}.${fmt}`
    const destDir = path.join(activeProjectRoot!, 'assets', 'audio')
    ensureDir(destDir)
    const dest = path.join(destDir, fileName)
    fs.writeFileSync(dest, buf)

    const relativePath = path.join('assets', 'audio', fileName).replace(/\\/g, '/')
    return {
      success: true,
      asset: { id, fileName, relativePath },
    }
  } catch (err: unknown) {
    const msg = (err as Error).message || String(err)
    return { success: false, error: `TTS 合成失败: ${msg}` }
  }
})

ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPath', (_event, name: Parameters<typeof app.getPath>[0]) => {
  return app.getPath(name)
})

// --------------- 本地缓存清理 ---------------
// 素材已统一存储在项目目录下，不再写入系统 AppData。
// 此功能仅清理 userData/snapshots（版本快照），渲染端另行清空 localStorage。
ipcMain.handle('app:clearLocalCache', () => {
  try {
    const userData = app.getPath('userData')
    const targets = [path.join(userData, 'snapshots')]
    let removedDirs = 0
    for (const dir of targets) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
        removedDirs++
      }
    }
    return { success: true, removedDirs }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
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

/** 静默写入项目文件到指定目录（不弹对话框，用于自动保存） */
function writeProjectToDir(projectDir: string, projectJson: string, projectName?: string): void {
  const assetsDir = path.join(projectDir, 'assets')
  ensureDir(path.join(assetsDir, SUBDIR_BACKGROUND))
  ensureDir(path.join(assetsDir, SUBDIR_SPRITE))
  ensureDir(path.join(assetsDir, SUBDIR_AUDIO))
  ensureDir(path.join(assetsDir, 'scripts'))

  const projPath = path.join(projectDir, `${projectName || 'untitled'}.swproj`)
  fs.writeFileSync(projPath, projectJson, 'utf-8')
}

ipcMain.handle('dialog:saveProject', async (_event, data: { projectJson: string; projectName?: string }) => {
  if (!mainWindow) return { success: false, error: 'No active window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择项目保存目录',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) return { success: false }
  const projectDir = result.filePaths[0]

  try {
    writeProjectToDir(projectDir, data.projectJson, data.projectName)

    // 保存后激活该项目根目录（协议查找 + 监听）
    activeProjectRoot = projectDir
    startAssetWatch(projectDir)

    return { success: true, projectDir }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

/** 静默保存：直接写入已知项目目录，不弹对话框（自动保存用） */
ipcMain.handle('dialog:saveProjectToPath', async (_event, data: {
  projectDir: string
  projectJson: string
  projectName?: string
}) => {
  try {
    writeProjectToDir(data.projectDir, data.projectJson, data.projectName)
    return { success: true }
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
    if (!activeProjectRoot) return { success: false, error: '请先保存项目，再导入素材' }
    const files: {
      id: string; fileName: string; relativePath: string; type: AssetKind
    }[] = []

    for (const srcPath of result.filePaths) {
      const ext = path.extname(srcPath).toLowerCase()
      const baseName = path.basename(srcPath)
      const { subdir, type } = resolveSubdir(ext, options?.kind)

      const destDir = path.join(activeProjectRoot!, 'assets', subdir)
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
  if (!activeProjectRoot) return { success: false, error: '请先保存项目，再导入素材' }
  try {
    const files: { id: string; fileName: string; relativePath: string; type: AssetKind }[] = []

    for (const srcPath of srcPaths) {
      if (typeof srcPath !== 'string' || !fs.existsSync(srcPath)) continue
      const ext = path.extname(srcPath).toLowerCase()
      const baseName = path.basename(srcPath)
      const { subdir, type } = resolveSubdir(ext, kind)

      const destDir = path.join(activeProjectRoot!, 'assets', subdir)
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
  /** options.rpy：窗口标题 / 打包名 / 关于页名 */
  options?: string
  /** ui.rpy：覆盖主菜单，包含标题画面(封面) */
  ui?: string
  assets: ExportAssetRef[]
  /** 游戏图标源相对路径（相对项目 assets 根），用于拷贝为根目录 icon.ico */
  iconSourceRelativePath?: string
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

  // 源根：仅使用已保存项目的 assets 目录
  if (!activeProjectRoot) return { success: false, error: '请先保存项目' }
  const srcRoot = activeProjectRoot
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
    // 游戏元信息：窗口标题 / 打包名（options.rpy）
    if (bundle.options && bundle.options.trim()) {
      fs.writeFileSync(path.join(gameDir, 'options.rpy'), bundle.options, 'utf-8')
    }
    // 标题画面(封面)：覆盖主菜单（ui.rpy）
    if (bundle.ui && bundle.ui.trim()) {
      fs.writeFileSync(path.join(gameDir, 'ui.rpy'), bundle.ui, 'utf-8')
    }
    // 游戏图标：拷贝为根目录 icon.ico（Ren'Py 构建时自动识别）
    if (bundle.iconSourceRelativePath) {
      const iconSrc = path.resolve(resolvedSrcRoot, bundle.iconSourceRelativePath)
      if (iconSrc !== resolvedSrcRoot && iconSrc.startsWith(resolvedSrcRoot + path.sep) && fs.existsSync(iconSrc)) {
        try {
          copyFile(iconSrc, path.join(root, 'icon.ico'))
        } catch {
          /* 图标拷贝失败不阻断整体导出 */
        }
      }
    }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }

  return { success: true, gameDir, copied }
})

// ===================== Ren'Py 引擎对接（SDK 探测 / 暂存 / 运行 / 构建 / Lint） =====================

type RenpyAction = 'run' | 'build' | 'lint'

interface RenpySdkInfo {
  sdkPath: string
  launcher: string
  version: string | null
}

/** 判断路径是否为 Ren'Py SDK 启动器 */
function isRenpyLauncher(p: string): boolean {
  const base = path.basename(p).toLowerCase()
  return base === 'renpy.exe' || base === 'renpy.sh' || base === 'renpy'
}

/** 离线读取 SDK 版本号（不启动 GUI）：从 renpy/__init__.py 抓取 version 字段 */
function readRenpyVersion(sdkPath: string): string | null {
  const candidates = [
    path.join(sdkPath, 'renpy', '__init__.py'),
    path.join(sdkPath, 'renpy.py'),
  ]
  for (const f of candidates) {
    try {
      const text = fs.readFileSync(f, 'utf-8')
      const m = text.match(/version\s*=\s*['"]([\d.]+)['"]/)
      if (m) return m[1]
    } catch {
      /* 忽略不存在的文件 */
    }
  }
  return null
}

/** 在常见安装位置与环境变量中探测 Ren'Py SDK */
function findRenpySdk(): RenpySdkInfo | null {
  const bases: string[] = []
  if (process.env.RENPY_SDK) bases.push(process.env.RENPY_SDK)
  const home = os.homedir()
  if (process.platform === 'win32') {
    bases.push('C:\\Program Files\\RenPy', 'C:\\RenPy', path.join(home, 'renpy'), path.join(home, 'RenPy'))
  } else if (process.platform === 'darwin') {
    bases.push(path.join(home, 'renpy'), '/Applications/RenPy', '/Applications/renpy')
  } else {
    bases.push(path.join(home, 'renpy'), '/opt/renpy', '/usr/local/renpy')
  }
  // 下载目录下的 renpy* 文件夹
  try {
    const dl = path.join(home, 'Downloads')
    for (const name of fs.readdirSync(dl)) {
      if (/^renpy/i.test(name)) {
        const full = path.join(dl, name)
        try {
          if (fs.statSync(full).isDirectory()) bases.push(full)
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 逐级探测启动器：候选根 → 一层子目录
  const scan = (base: string): string | null => {
    let st: fs.Stats | null = null
    try {
      st = fs.statSync(base)
    } catch {
      return null
    }
    if (st.isFile()) return isRenpyLauncher(base) ? base : null
    if (!st.isDirectory()) return null
    try {
      for (const name of fs.readdirSync(base)) {
        const full = path.join(base, name)
        try {
          const s2 = fs.statSync(full)
          if (s2.isFile() && isRenpyLauncher(full)) return full
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    try {
      for (const name of fs.readdirSync(base)) {
        const full = path.join(base, name)
        try {
          if (fs.statSync(full).isDirectory()) {
            for (const n2 of fs.readdirSync(full)) {
              if (isRenpyLauncher(path.join(full, n2))) return path.join(full, n2)
            }
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    return null
  }

  for (const b of bases) {
    const launcher = scan(b)
    if (launcher) {
      const sdkPath = path.dirname(launcher)
      return { sdkPath, launcher, version: readRenpyVersion(sdkPath) }
    }
  }
  return null
}

/** 生成最小可运行 options.rpy，保证 Ren'Py 能启动与 build 分发包 */
function buildMinimalOptions(title: string): string {
  const safe = title.replace(/[^\w一-龥-]/g, '_')
  return [
    'init python:',
    '    config.developer = True',
    `    build.name = "${safe}"`,
    `    config.window_title = "${title}"`,
    '    config.save_directory = None',
    '',
  ].join('\n')
}

// 探测 SDK：渲染进程挂载时调用，给出状态与版本
ipcMain.handle('renpy:detectSdk', async () => {
  const info = findRenpySdk()
  if (!info) {
    return {
      detected: false,
      hint: '未检测到 Ren\'Py SDK。请安装 Ren\'Py（https://www.renpy.org）并设置环境变量 RENPY_SDK 指向 SDK 根目录，或在常见目录放置 SDK。',
    }
  }
  return { detected: true, sdkPath: info.sdkPath, launcher: info.launcher, version: info.version }
})

// 将渲染进程构建好的 RpyBundle 暂存到 userData，得到可直接被 Ren'Py 打开的工程目录
ipcMain.handle('renpy:stageProject', async (_event, payload: { bundle: RpyBundle; title: string }) => {
  if (!mainWindow) return { success: false, error: 'No active window' }
  const { bundle, title } = payload
  const safeTitle = (title || 'scriptweaver_project').replace(/[^\w一-龥-]/g, '_').slice(0, 60)
  const stageRoot = path.join(app.getPath('userData'), 'renpy-staging', safeTitle)
  const gameDir = path.join(stageRoot, 'game')
  try {
    fs.rmSync(gameDir, { recursive: true, force: true })
  } catch {
    /* 首次无目录可忽略 */
  }
  ensureDir(path.join(gameDir, 'images', 'background'))
  ensureDir(path.join(gameDir, 'images', 'sprite'))
  ensureDir(path.join(gameDir, 'audio'))

  try {
    fs.writeFileSync(path.join(gameDir, 'script.rpy'), bundle.script ?? '', 'utf-8')
    fs.writeFileSync(path.join(gameDir, 'definitions.rpy'), bundle.definitions ?? '', 'utf-8')
    if (bundle.transforms && bundle.transforms.trim()) {
      fs.writeFileSync(path.join(gameDir, 'transforms.rpy'), bundle.transforms, 'utf-8')
    }
    // 优先用 bundle 自带的 options（含 config.name / build.name），兜底用最小配置
    fs.writeFileSync(path.join(gameDir, 'options.rpy'), bundle.options && bundle.options.trim() ? bundle.options : buildMinimalOptions(safeTitle), 'utf-8')
    // 标题画面(封面)：覆盖主菜单
    if (bundle.ui && bundle.ui.trim()) {
      fs.writeFileSync(path.join(gameDir, 'ui.rpy'), bundle.ui, 'utf-8')
    }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }

  // 拷贝素材（依赖当前活动项目根目录）
  let copied = 0
  const missing: string[] = []
  const srcRoot = activeProjectRoot ? path.resolve(activeProjectRoot) : null
  for (const a of bundle.assets ?? []) {
    if (!srcRoot) {
      missing.push(a.exportRelPath)
      continue
    }
    const src = path.resolve(srcRoot, a.sourceRelativePath)
    if (src !== srcRoot && !src.startsWith(srcRoot + path.sep)) {
      missing.push(a.exportRelPath)
      continue
    }
    if (!fs.existsSync(src)) {
      missing.push(a.exportRelPath)
      continue
    }
    const dest = path.resolve(gameDir, a.exportRelPath)
    try {
      copyFile(src, dest)
      copied++
    } catch {
      missing.push(a.exportRelPath)
    }
  }

  return { success: true, projectDir: stageRoot, gameDir, copied, missingCount: missing.length }
})

// 调用 SDK 执行 run / build / lint
ipcMain.handle(
  'renpy:runEngine',
  async (_event, payload: { action: RenpyAction; sdkPath?: string; projectDir: string }) => {
    let info: RenpySdkInfo | null = null
    if (payload.sdkPath) {
      // 由调用方指定 SDK 根目录，需定位启动器
      const launcher = [
        path.join(payload.sdkPath, 'renpy.exe'),
        path.join(payload.sdkPath, 'renpy.sh'),
        path.join(payload.sdkPath, 'renpy'),
      ].find((p) => {
        try {
          return fs.existsSync(p)
        } catch {
          return false
        }
      })
      if (launcher) info = { sdkPath: payload.sdkPath, launcher, version: readRenpyVersion(payload.sdkPath) }
    } else {
      info = findRenpySdk()
    }
    if (!info) {
      return {
        success: false,
        error:
          '未检测到 Ren\'Py SDK。请安装 SDK 并设置环境变量 RENPY_SDK，或在「导出设置 · Ren\'Py 引擎」中手动指定路径。',
      }
    }

    const projectDir = payload.projectDir
    if (payload.action === 'run') {
      // 启动 GUI 预览，后台分离，不阻塞主进程
      try {
        const child = spawn(info.launcher, [projectDir], { detached: true, stdio: 'ignore', windowsHide: false })
        child.unref()
        return { success: true, action: 'run', pid: child.pid, projectDir }
      } catch (err: unknown) {
        return { success: false, error: (err as Error).message }
      }
    }

    if (payload.action === 'lint') {
      // 语法校验：捕获控制台输出
      return await new Promise<{ success: boolean; action: string; exitCode?: number; output?: string; error?: string }>(
        (resolve) => {
          let out = ''
          let settled = false
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true
              resolve({ success: false, action: 'lint', error: 'Lint 执行超时（60s），请检查工程是否可被 Ren\'Py 打开。' })
            }
          }, 60000)
          try {
            const child = spawn(info!.launcher, [projectDir, 'lint'], { windowsHide: false })
            child.stdout?.on('data', (d) => (out += d.toString()))
            child.stderr?.on('data', (d) => (out += d.toString()))
            child.on('error', (e) => {
              if (!settled) {
                settled = true
                clearTimeout(timer)
                resolve({ success: false, action: 'lint', error: e.message })
              }
            })
            child.on('close', (code) => {
              if (!settled) {
                settled = true
                clearTimeout(timer)
                resolve({ success: code === 0, action: 'lint', exitCode: code ?? -1, output: out || '(无输出)' })
              }
            })
          } catch (err: unknown) {
            if (!settled) {
              settled = true
              clearTimeout(timer)
              resolve({ success: false, action: 'lint', error: (err as Error).message })
            }
          }
        },
      )
    }

    // build / distribute：后台分离，输出写入日志文件，产物落在 projectDir/dist
    const logDir = path.join(app.getPath('userData'), 'renpy-build-logs')
    ensureDir(logDir)
    const logFile = path.join(logDir, `${path.basename(projectDir)}-${Date.now()}.log`)
    try {
      const out = fs.createWriteStream(logFile)
      const child = spawn(info.launcher, [projectDir, 'distribute'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
      })
      child.stdout?.pipe(out)
      child.stderr?.pipe(out)
      child.on('exit', () => out.end())
      child.unref()
      return {
        success: true,
        action: 'build',
        started: true,
        logFile,
        distDir: path.join(projectDir, 'dist'),
        projectDir,
      }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    }
  },
)

// ===================== 导出 Web 独立包（纯前端试玩） =====================

interface WebAssetRef {
  assetId: string
  type: string
  sourceRelativePath: string
  exportRelPath: string
}

ipcMain.handle('fs:exportWeb', async (_event, bundle: { gameJson: string; assetRefs: WebAssetRef[]; title: string }) => {
  if (!mainWindow) return { success: false, error: 'No active window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Web 导出目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return { success: false }
  const root = result.filePaths[0]

  const tpl = getWebTemplateDir()
  // 源根：仅使用已保存项目的 assets 目录
  if (!activeProjectRoot) return { success: false, error: '请先保存项目' }
  const srcRoot = activeProjectRoot
  const resolvedSrcRoot = path.resolve(srcRoot)

  try {
    // 复制播放器模板（index.html / style.css / player.js）
    for (const f of ['index.html', 'style.css', 'player.js']) {
      const src = path.join(tpl, f)
      if (fs.existsSync(src)) copyFile(src, path.join(root, f))
    }
    // 复制被引用的素材（磁盘→磁盘，二进制不进内存），带防目录穿越校验
    let copied = 0
    for (const a of bundle.assetRefs ?? []) {
      const src = path.resolve(resolvedSrcRoot, a.sourceRelativePath)
      if (src !== resolvedSrcRoot && !src.startsWith(resolvedSrcRoot + path.sep)) continue
      if (!fs.existsSync(src)) continue
      const dest = path.resolve(root, a.exportRelPath)
      try {
        copyFile(src, dest)
        copied++
      } catch {
        /* 单文件失败不阻断整体导出 */
      }
    }
    // 写入游戏数据
    fs.writeFileSync(path.join(root, 'game.json'), bundle.gameJson, 'utf-8')
    return { success: true, outDir: root, copied }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ===================== 云端同步与版本快照（本地版本库） =====================
// 说明：当前为纯桌面端，无后端服务器，版本库落地于 userData/snapshots/<projectId>/。
// 该目录结构即为「云端同步」的本地等价物；接入真实云后端时，只需将下方落盘/读取
// 替换为对云存储的读写（CloudSyncProvider 抽象已在渲染端预留）。

function getSnapshotsDir(projectId: string): string {
  const safe = (projectId || 'unsaved').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  return path.join(app.getPath('userData'), 'snapshots', safe)
}

const MAX_SNAPSHOTS = 60

/** 创建版本快照（手动或自动静默备份） */
ipcMain.handle(
  'fs:snapshotProject',
  async (_event, payload: { projectId: string; projectJson: string; label?: string; auto?: boolean }) => {
    try {
      const dir = getSnapshotsDir(payload.projectId)
      ensureDir(dir)
      let parsed: { draftDeltas?: unknown[]; assets?: unknown[]; characterConfigs?: unknown[] } = {}
      try {
        parsed = JSON.parse(payload.projectJson)
      } catch {
        /* 仍按原样建档 */
      }
      const now = new Date()
      const ts = now.toISOString().replace(/[:.]/g, '-')
      const id = `${ts}__${uuid().slice(0, 6)}`
      const meta = {
        id,
        createdAt: now.toISOString(),
        label: payload.label || (payload.auto ? '自动备份' : '手动快照'),
        lineCount: Array.isArray(parsed.draftDeltas) ? parsed.draftDeltas.length : 0,
        assetCount: Array.isArray(parsed.assets) ? parsed.assets.length : 0,
        charCount: Array.isArray(parsed.characterConfigs) ? parsed.characterConfigs.length : 0,
        sizeBytes: Buffer.byteLength(payload.projectJson, 'utf-8'),
        auto: !!payload.auto,
        projectJson: payload.projectJson,
      }
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta, null, 2), 'utf-8')

      // 自动修剪：超出上限删除最旧的非自动快照优先，其次最旧的自动快照
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => a.t - b.t)
      while (files.length > MAX_SNAPSHOTS) {
        const victim = files.shift()!
        fs.rmSync(path.join(dir, victim.f), { force: true })
      }
      return { success: true, id }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    }
  },
)

/** 列出某项目的版本快照（轻量元数据，不含工程体） */
ipcMain.handle('fs:listSnapshots', (_event, projectId: string) => {
  try {
    const dir = getSnapshotsDir(projectId)
    if (!fs.existsSync(dir)) return { success: true, snapshots: [] as unknown[] }
    const list = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
          const { projectJson: _p, ...meta } = m
          return meta
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a: { createdAt: string }, b: { createdAt: string }) => (a.createdAt < b.createdAt ? 1 : -1))
    return { success: true, snapshots: list }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message, snapshots: [] as unknown[] }
  }
})

/** 读取快照完整工程（用于回滚） */
ipcMain.handle('fs:restoreSnapshot', (_event, projectId: string, id: string) => {
  try {
    const dir = getSnapshotsDir(projectId)
    const fp = path.join(dir, `${id}.json`)
    if (!fs.existsSync(fp)) return { success: false, error: '快照不存在' }
    const m = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    return { success: true, projectJson: m.projectJson as string }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

/** 删除快照 */
ipcMain.handle('fs:deleteSnapshot', (_event, projectId: string, id: string) => {
  try {
    const dir = getSnapshotsDir(projectId)
    const fp = path.join(dir, `${id}.json`)
    if (fs.existsSync(fp)) fs.rmSync(fp, { force: true })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// --------------- 素材本地缓存释放 / 按需重下载（大体积素材轻量化同步） ---------------

/** 释放本地缓存：删除磁盘上的素材文件（保留库内元数据），释放磁盘空间 */
ipcMain.handle('fs:evictAssetCache', async (_event, relativePath: string) => {
  try {
    const rel = (relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!rel || rel.includes('..')) return { success: false, error: '非法路径' }
    if (!activeProjectRoot) return { success: false, error: '请先保存项目' }
    const roots: string[] = [activeProjectRoot!]
    let removed = false
    for (const root of roots) {
      const fp = path.resolve(root, rel)
      if (!fp.startsWith(path.resolve(root) + path.sep)) continue
      if (fs.existsSync(fp)) {
        fs.rmSync(fp, { force: true })
        removed = true
      }
    }
    return { success: true, removed }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

/** 按需重新下载：从云端地址取回素材写入项目 assets 目录 */
ipcMain.handle('fs:downloadAsset', async (_event, remoteUrl: string, relativePath: string) => {
  try {
    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) {
      return { success: false, error: '未配置有效的云端地址（remoteUrl）' }
    }
    if (!activeProjectRoot) return { success: false, error: '请先保存项目' }
    const rel = (relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!rel || rel.includes('..')) return { success: false, error: '非法路径' }
    const dir = path.join(activeProjectRoot!, path.dirname(rel))
    ensureDir(dir)
    const dest = path.join(activeProjectRoot!, rel)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 120000)
    let resp: Response
    try {
      resp = await fetch(remoteUrl, { signal: ctrl.signal })
    } catch (e) {
      clearTimeout(timer)
      return { success: false, error: `下载失败：${(e as Error).message}` }
    }
    clearTimeout(timer)
    if (!resp.ok) return { success: false, error: `云端返回 ${resp.status}` }
    const buf = Buffer.from(await resp.arrayBuffer())
    fs.writeFileSync(dest, buf)
    return { success: true, bytes: buf.length }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})
