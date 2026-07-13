"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "ScriptWeaver",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}
let sessionDir = null;
function getSessionDir() {
  if (!sessionDir) {
    sessionDir = path.join(electron.app.getPath("temp"), `scriptweaver-session-${Date.now()}`);
    ensureDir(sessionDir);
  }
  return sessionDir;
}
electron.app.on("before-quit", () => {
  if (sessionDir && fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {
    }
  }
});
electron.ipcMain.handle("app:getVersion", () => {
  return electron.app.getVersion();
});
electron.ipcMain.handle("app:getPath", (_event, name) => {
  return electron.app.getPath(name);
});
electron.ipcMain.handle("app:getSessionDir", () => {
  return getSessionDir();
});
electron.ipcMain.on("app:setNativeTheme", (_event, theme) => {
  electron.nativeTheme.themeSource = theme;
});
electron.ipcMain.handle("dialog:saveProject", async (_event, data) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    title: "选择项目保存目录",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const projectDir = result.filePaths[0];
  const projectName = data.projectName || "untitled";
  const assetsDir = path.join(projectDir, "assets");
  try {
    ensureDir(path.join(assetsDir, "backgrounds"));
    ensureDir(path.join(assetsDir, "sprites"));
    ensureDir(path.join(assetsDir, "audio"));
    const sessionDirPath = getSessionDir();
    if (fs.existsSync(sessionDirPath)) {
      for (const subDir of ["backgrounds", "sprites", "audio"]) {
        const srcSub = path.join(sessionDirPath, subDir);
        const destSub = path.join(assetsDir, subDir);
        if (fs.existsSync(srcSub)) {
          const files = fs.readdirSync(srcSub);
          for (const f of files) {
            copyFile(path.join(srcSub, f), path.join(destSub, f));
          }
        }
      }
    }
    const projPath = path.join(projectDir, `${projectName}.swproj`);
    fs.writeFileSync(projPath, data.projectJson, "utf-8");
    return { success: true, projectDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("dialog:openProject", async () => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    title: "打开项目",
    filters: [
      { name: "ScriptWeaver 项目", extensions: ["swproj"] }
    ],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  try {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, "utf-8");
    const projectDir = path.dirname(filePath);
    return { success: true, content, projectDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("dialog:pickAssetFiles", async (_event, options) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const filters = (options == null ? void 0 : options.filters) || [
    { name: "图片文件", extensions: ["png", "jpg", "jpeg", "webp"] },
    { name: "音频文件", extensions: ["mp3", "ogg", "wav"] },
    { name: "所有文件", extensions: ["*"] }
  ];
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    title: "导入素材",
    filters,
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  try {
    const sessionRoot = getSessionDir();
    const files = [];
    for (const srcPath of result.filePaths) {
      const ext = path.extname(srcPath).toLowerCase();
      const baseName = path.basename(srcPath);
      let subDir;
      let assetType;
      const imgExts = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
      const audioExts = [".mp3", ".ogg", ".wav", ".flac"];
      if (imgExts.includes(ext)) {
        subDir = "sprites";
        assetType = "sprite";
      } else if (audioExts.includes(ext)) {
        subDir = "audio";
        assetType = "audio";
      } else {
        subDir = "sprites";
        assetType = "sprite";
      }
      const destDir = path.join(sessionRoot, subDir);
      ensureDir(destDir);
      const destPath = path.join(destDir, baseName);
      let fileDest = destPath;
      let counter = 1;
      while (fs.existsSync(fileDest)) {
        const base = path.parse(baseName).name;
        fileDest = path.join(destDir, `${base}_${counter}${ext}`);
        counter++;
      }
      copyFile(srcPath, fileDest);
      const relativePath = path.join("assets", subDir, path.basename(fileDest)).replace(/\\/g, "/");
      let width;
      let height;
      let dataUrl;
      if (imgExts.includes(ext)) {
        try {
          const buf = fs.readFileSync(fileDest);
          const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
          dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
        } catch {
        }
      }
      files.push({
        id: uuid(),
        fileName: path.basename(fileDest),
        relativePath,
        type: assetType,
        width,
        height,
        dataUrl
      });
    }
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("fs:readAssetFile", async (_event, relativePath, projectRoot) => {
  try {
    let fullPath;
    if (projectRoot && typeof projectRoot === "string") {
      fullPath = path.join(projectRoot, relativePath);
    } else {
      fullPath = path.join(getSessionDir(), path.basename(relativePath));
    }
    if (!fs.existsSync(fullPath)) {
      const sessionPath = path.join(getSessionDir(), relativePath);
      if (fs.existsSync(sessionPath)) {
        fullPath = sessionPath;
      } else {
        return { success: false, error: `文件不存在: ${fullPath}` };
      }
    }
    const ext = path.extname(fullPath).toLowerCase();
    const imgExts = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
    const audioExts = [".mp3", ".ogg", ".wav", ".flac"];
    if (imgExts.includes(ext)) {
      const buf = fs.readFileSync(fullPath);
      const mimeMap = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif"
      };
      const mime = mimeMap[ext] || "image/png";
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
    }
    if (audioExts.includes(ext)) {
      const buf = fs.readFileSync(fullPath);
      const mimeMap = {
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
        ".flac": "audio/flac"
      };
      const mime = mimeMap[ext] || "audio/mpeg";
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
    }
    return { success: false, error: `不支持的文件类型: ${ext}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
