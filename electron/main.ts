import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null

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

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
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

// 应用退出时清理临时目录
app.on('before-quit', () => {
  if (sessionDir && fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true })
    } catch { /* 静默 */ }
  }
})

// --------------- IPC Handlers ---------------

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
    ensureDir(path.join(assetsDir, 'backgrounds'))
    ensureDir(path.join(assetsDir, 'sprites'))
    ensureDir(path.join(assetsDir, 'audio'))

    // 从会话临时目录复制素材到项目 assets 目录
    const sessionDirPath = getSessionDir()
    if (fs.existsSync(sessionDirPath)) {
      for (const subDir of ['backgrounds', 'sprites', 'audio']) {
        const srcSub = path.join(sessionDirPath, subDir)
        const destSub = path.join(assetsDir, subDir)
        if (fs.existsSync(srcSub)) {
          const files = fs.readdirSync(srcSub)
          for (const f of files) {
            copyFile(path.join(srcSub, f), path.join(destSub, f))
          }
        }
      }
    }

    // 写入 .swproj
    const projPath = path.join(projectDir, `${projectName}.swproj`)
    fs.writeFileSync(projPath, data.projectJson, 'utf-8')

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
    return { success: true, content, projectDir }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// --------------- 导入素材 ---------------

ipcMain.handle('dialog:pickAssetFiles', async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
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
    const sessionRoot = getSessionDir()
    const files: {
      id: string; fileName: string; relativePath: string; type: string;
      width?: number; height?: number; dataUrl?: string
    }[] = []

    for (const srcPath of result.filePaths) {
      const ext = path.extname(srcPath).toLowerCase()
      const baseName = path.basename(srcPath)

      // 根据扩展名分到对应的子目录
      let subDir: string
      let assetType: string
      const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
      const audioExts = ['.mp3', '.ogg', '.wav', '.flac']

      if (imgExts.includes(ext)) {
        subDir = 'sprites'
        assetType = 'sprite'
      } else if (audioExts.includes(ext)) {
        subDir = 'audio'
        assetType = 'audio'
      } else {
        subDir = 'sprites'
        assetType = 'sprite'
      }

      const destDir = path.join(sessionRoot, subDir)
      ensureDir(destDir)
      const destPath = path.join(destDir, baseName)

      // 避免文件名冲突
      let fileDest = destPath
      let counter = 1
      while (fs.existsSync(fileDest)) {
        const base = path.parse(baseName).name
        fileDest = path.join(destDir, `${base}_${counter}${ext}`)
        counter++
      }

      copyFile(srcPath, fileDest)
      const relativePath = path.join('assets', subDir, path.basename(fileDest)).replace(/\\/g, '/')

      // 尝试读取图片尺寸
      let width: number | undefined
      let height: number | undefined
      let dataUrl: string | undefined

      if (imgExts.includes(ext)) {
        try {
          // 简单读取文件为 base64 data URL 用于前端渲染
          const buf = fs.readFileSync(fileDest)
          const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp'
          dataUrl = `data:${mime};base64,${buf.toString('base64')}`
        } catch { /* ignore */ }
      }

      files.push({
        id: uuid(),
        fileName: path.basename(fileDest),
        relativePath,
        type: assetType,
        width,
        height,
        dataUrl,
      })
    }

    return { success: true, files }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// --------------- 读取素材文件 ---------------

ipcMain.handle('fs:readAssetFile', async (_event, relativePath: string, projectRoot?: string) => {
  try {
    // 先尝试从 projectRoot 读取
    let fullPath: string
    if (projectRoot && typeof projectRoot === 'string') {
      fullPath = path.join(projectRoot, relativePath)
    } else {
      // 尝试从会话临时目录读取
      fullPath = path.join(getSessionDir(), path.basename(relativePath))
    }

    if (!fs.existsSync(fullPath)) {
      // 如果 projectRoot 路径不存在，尝试在 sessionDir/assets 下查找
      const sessionPath = path.join(getSessionDir(), relativePath)
      if (fs.existsSync(sessionPath)) {
        fullPath = sessionPath
      } else {
        return { success: false, error: `文件不存在: ${fullPath}` }
      }
    }

    const ext = path.extname(fullPath).toLowerCase()
    const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
    const audioExts = ['.mp3', '.ogg', '.wav', '.flac']

    if (imgExts.includes(ext)) {
      const buf = fs.readFileSync(fullPath)
      const mimeMap: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.gif': 'image/gif',
      }
      const mime = mimeMap[ext] || 'image/png'
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
    }

    if (audioExts.includes(ext)) {
      const buf = fs.readFileSync(fullPath)
      const mimeMap: Record<string, string> = {
        '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
      }
      const mime = mimeMap[ext] || 'audio/mpeg'
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
    }

    return { success: false, error: `不支持的文件类型: ${ext}` }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})
