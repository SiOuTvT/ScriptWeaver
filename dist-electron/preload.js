"use strict";
const electron = require("electron");
const api = {
  getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
  getPath: (name) => electron.ipcRenderer.invoke("app:getPath", name),
  /** 用系统默认浏览器打开外部链接（绕过 Electron 内嵌窗口） */
  openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url),
  /** 清除本地缓存：清理 snapshots 目录（素材已统一存储于项目目录下） */
  clearLocalCache: () => electron.ipcRenderer.invoke("app:clearLocalCache"),
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
  /** TTS 一键合成：主进程复用 AI 配置的密钥调用兼容接口，音频落盘会话目录后返回素材元数据 */
  ttsSynthesize: (payload) => electron.ipcRenderer.invoke("tts:synthesize", payload),
  /** 导出 Web 独立包：主进程复制播放器模板 + 素材 + 写入 game.json 到目标目录 */
  exportWeb: (bundle) => electron.ipcRenderer.invoke("fs:exportWeb", bundle),
  // ----- 云端同步 / 版本快照（本地版本库） -----
  /** 创建版本快照（手动或自动静默备份） */
  snapshotProject: (payload) => electron.ipcRenderer.invoke("fs:snapshotProject", payload),
  /** 列出某项目的版本快照（轻量元数据） */
  listSnapshots: (projectId) => electron.ipcRenderer.invoke("fs:listSnapshots", projectId),
  /** 读取快照完整工程 JSON（用于回滚） */
  restoreSnapshot: (projectId, id) => electron.ipcRenderer.invoke("fs:restoreSnapshot", projectId, id),
  /** 删除快照 */
  deleteSnapshot: (projectId, id) => electron.ipcRenderer.invoke("fs:deleteSnapshot", projectId, id),
  /** 释放素材本地缓存（删除磁盘文件，保留库内元数据） */
  evictAssetCache: (relativePath) => electron.ipcRenderer.invoke("fs:evictAssetCache", relativePath),
  /** 按需从云端地址重新下载素材到会话目录 */
  downloadAsset: (remoteUrl, relativePath) => electron.ipcRenderer.invoke("fs:downloadAsset", remoteUrl, relativePath),
  /** 选择目录 */
  selectDirectory: () => electron.ipcRenderer.invoke("dialog:selectDirectory"),
  /** 文件系统基础操作（用于导入 Ren'Py 工程） */
  fs: {
    readdir: (dirPath) => electron.ipcRenderer.invoke("fs:readdir", dirPath),
    readFile: (filePath, encoding) => electron.ipcRenderer.invoke("fs:readFile", filePath, encoding)
  },
  /** 保存项目：选目录 → 复制素材 → 写 .swproj */
  saveProject: (data) => electron.ipcRenderer.invoke("dialog:saveProject", data),
  /** 静默保存：直接写入已知项目目录，不弹对话框（自动保存用） */
  saveProjectToPath: (data) => electron.ipcRenderer.invoke("dialog:saveProjectToPath", data),
  /** 打开项目：选 .swproj → 返回 JSON 内容 + 项目根目录 */
  openProject: () => electron.ipcRenderer.invoke("dialog:openProject"),
  /** 导入素材：打开文件选择器，二进制复制到会话目录（不再返回 Base64） */
  pickAssetFiles: (options) => electron.ipcRenderer.invoke("dialog:pickAssetFiles", options),
  /** 拖入素材：接收 OS 拖放的真实文件路径，二进制落盘（不返回 Base64） */
  importFilesFromPaths: (srcPaths, kind) => electron.ipcRenderer.invoke("fs:importFilesFromPaths", srcPaths, kind),
  /** 设置活动项目根目录：驱动 sw-asset:// 协议查找 + 开启文件夹监听 */
  setActiveProjectRoot: (root) => electron.ipcRenderer.invoke("fs:setActiveProjectRoot", root),
  // --------------- Ren'Py 引擎对接 ---------------
  /** 探测本机 Ren'Py SDK（版本、路径） */
  renpyDetectSdk: () => electron.ipcRenderer.invoke("renpy:detectSdk"),
  /** 将 RpyBundle 暂存为可直接被 Ren'Py 打开的工程目录 */
  renpyStageProject: (payload) => electron.ipcRenderer.invoke("renpy:stageProject", payload),
  /** 调用 SDK 运行 / 构建分发包 / Lint 校验 */
  renpyRunEngine: (payload) => electron.ipcRenderer.invoke("renpy:runEngine", payload),
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
