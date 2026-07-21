"use strict";
const electron = require("electron");
const api = {
  getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
  getPath: (name) => electron.ipcRenderer.invoke("app:getPath", name),
  /** 获取会话临时目录 */
  getSessionDir: () => electron.ipcRenderer.invoke("app:getSessionDir"),
  /** 导出 Ren'Py 项目包：选目录 → 建 game/ 结构 → 磁盘直拷素材 → 写 .rpy */
  exportRenpy: (bundle) => electron.ipcRenderer.invoke("fs:exportRenpy", bundle),
  /** 同步原生窗口主题（标题栏等），fire-and-forget */
  setNativeTheme: (theme) => electron.ipcRenderer.send("app:setNativeTheme", theme),
  // --------------- AI 桥接（密钥不进渲染进程） ---------------
  /** 取脱敏后的 AI 配置（含 hasApiKey 标记） */
  aiGetConfig: () => electron.ipcRenderer.invoke("ai:getConfig"),
  /** 保存 AI 配置（密钥落入主进程安全区） */
  aiSetConfig: (cfg) => electron.ipcRenderer.invoke("ai:setConfig", cfg),
  /** 发送对话请求（只发 messages，密钥由主进程注入） */
  aiChat: (payload) => electron.ipcRenderer.send("ai:chat", payload),
  /** 中断当前流式对话 */
  aiAbort: () => electron.ipcRenderer.send("ai:abort"),
  /** 订阅流式 chunk */
  onAiChunk: (cb) => electron.ipcRenderer.on("ai:chunk", (_e, d) => cb(d)),
  /** 订阅完成 */
  onAiDone: (cb) => electron.ipcRenderer.on("ai:done", (_e, d) => cb(d)),
  /** 订阅错误 */
  onAiError: (cb) => electron.ipcRenderer.on("ai:error", (_e, d) => cb(d)),
  /** 订阅中断 */
  onAiAborted: (cb) => electron.ipcRenderer.on("ai:aborted", () => cb()),
  /** 清理 AI 流式监听 */
  removeAiListeners: () => {
    electron.ipcRenderer.removeAllListeners("ai:chunk");
    electron.ipcRenderer.removeAllListeners("ai:done");
    electron.ipcRenderer.removeAllListeners("ai:error");
    electron.ipcRenderer.removeAllListeners("ai:aborted");
  },
  /** 保存项目：选目录 → 复制素材 → 写 .swproj */
  saveProject: (data) => electron.ipcRenderer.invoke("dialog:saveProject", data),
  /** 打开项目：选 .swproj → 返回 JSON 内容 + 项目根目录 */
  openProject: () => electron.ipcRenderer.invoke("dialog:openProject"),
  /** 导入素材：打开文件选择器，二进制复制到会话目录（不再返回 Base64） */
  pickAssetFiles: (options) => electron.ipcRenderer.invoke("dialog:pickAssetFiles", options),
  /** 拖入素材：接收 OS 拖放的真实文件路径，二进制落盘（不返回 Base64） */
  importFilesFromPaths: (srcPaths, kind) => electron.ipcRenderer.invoke("fs:importFilesFromPaths", srcPaths, kind),
  /** 设置活动项目根目录：驱动 sw-asset:// 协议查找 + 开启文件夹监听 */
  setActiveProjectRoot: (root) => electron.ipcRenderer.invoke("fs:setActiveProjectRoot", root),
  /** 扫描项目 assets 目录，返回磁盘素材清单（元数据，无二进制） */
  scanProjectAssets: (projectRoot) => electron.ipcRenderer.invoke("fs:scanProjectAssets", projectRoot),
  on(channel, callback) {
    electron.ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  off(channel, _callback) {
    electron.ipcRenderer.removeAllListeners(channel);
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
