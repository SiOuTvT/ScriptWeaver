"use strict";
const electron = require("electron");
const api = {
  getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
  getPath: (name) => electron.ipcRenderer.invoke("app:getPath", name),
  /** 保存项目文件：弹出原生保存对话框，写入文件 */
  saveFile: (data) => electron.ipcRenderer.invoke("dialog:saveFile", data),
  /** 打开项目文件：弹出原生打开对话框，读取文件内容 */
  openFile: () => electron.ipcRenderer.invoke("dialog:openFile"),
  on(channel, callback) {
    electron.ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  off(channel, callback) {
    electron.ipcRenderer.removeAllListeners(channel);
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
