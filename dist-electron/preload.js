"use strict";
const electron = require("electron");
const api = {
  getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
  getPath: (name) => electron.ipcRenderer.invoke("app:getPath", name),
  /** 获取会话临时目录 */
  getSessionDir: () => electron.ipcRenderer.invoke("app:getSessionDir"),
  /** 保存项目：选目录 → 复制素材 → 写 .swproj */
  saveProject: (data) => electron.ipcRenderer.invoke("dialog:saveProject", data),
  /** 打开项目：选 .swproj → 返回 JSON 内容 + 项目根目录 */
  openProject: () => electron.ipcRenderer.invoke("dialog:openProject"),
  /** 导入素材：打开文件选择器，复制到临时目录 */
  pickAssetFiles: (options) => electron.ipcRenderer.invoke("dialog:pickAssetFiles", options),
  /** 读取项目的素材文件为 data URL */
  readAssetFile: (relativePath, projectRoot) => electron.ipcRenderer.invoke("fs:readAssetFile", relativePath, projectRoot),
  on(channel, callback) {
    electron.ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  off(channel, callback) {
    electron.ipcRenderer.removeAllListeners(channel);
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
