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
electron.ipcMain.handle("app:getVersion", () => {
  return electron.app.getVersion();
});
electron.ipcMain.handle("app:getPath", (_event, name) => {
  return electron.app.getPath(name);
});
electron.ipcMain.handle("dialog:saveFile", async (_event, data) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    title: "保存项目",
    defaultPath: data.defaultName || "untitled.swproj",
    filters: [
      { name: "ScriptWeaver 项目", extensions: ["swproj"] },
      { name: "JSON 文件", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return { success: false };
  try {
    fs.writeFileSync(result.filePath, data.content, "utf-8");
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("dialog:openFile", async () => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    title: "打开项目",
    filters: [
      { name: "ScriptWeaver 项目", extensions: ["swproj"] },
      { name: "JSON 文件", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] }
    ],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  try {
    const content = fs.readFileSync(result.filePaths[0], "utf-8");
    return { success: true, content, filePath: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
