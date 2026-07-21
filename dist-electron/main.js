"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const stream = require("stream");
const PROVIDER_PRESETS = {
  openai: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" }
};
function defaultAIConfig() {
  return {
    provider: "openai",
    endpoint: PROVIDER_PRESETS.openai.endpoint,
    apiKey: "",
    model: PROVIDER_PRESETS.openai.model,
    temperature: 0.7,
    maxTokens: 2e3
  };
}
class AIRequestError extends Error {
  constructor(message, status = 0, kind = "unknown") {
    super(message);
    __publicField(this, "status");
    __publicField(this, "kind");
    this.name = "AIRequestError";
    this.status = status;
    this.kind = kind;
  }
}
function classifyHttpError(status, raw) {
  var _a, _b;
  let detail = "";
  try {
    const j = JSON.parse(raw);
    detail = ((_a = j == null ? void 0 : j.error) == null ? void 0 : _a.message) || ((_b = j == null ? void 0 : j.error) == null ? void 0 : _b.type) || "";
  } catch {
  }
  const tail = detail ? `（${detail.slice(0, 160)}）` : raw ? `（${raw.slice(0, 160)}）` : "";
  switch (status) {
    case 401:
      return `API 密钥无效或未授权（401）。请到 AI 设置中检查 Key 是否正确、是否过期${tail}`;
    case 403:
      return `密钥无权访问该模型（403）。请确认账户权限或改用可用模型${tail}`;
    case 404:
      return `请求的端点或模型不存在（404）。请检查 API 端点与模型名${tail}`;
    case 429:
      return `触发频率限制（429）。请稍后重试，或降低并发 / 调小 max_tokens${tail}`;
    default:
      if (status >= 500) return `模型服务端错误（${status}）。上游暂时不可用，请稍后重试${tail}`;
      return `API 请求失败（${status}）${tail}`;
  }
}
function describeAIError(err) {
  const e = err;
  if ((e == null ? void 0 : e.name) === "TimeoutError") return e.message || "请求超时";
  if (e instanceof AIRequestError) return e.message;
  if ((e == null ? void 0 : e.name) === "TypeError")
    return "网络请求失败：无法连接到该端点。请检查 API 地址、本地网络或代理设置（桌面端也需可访问外网）。";
  return (e == null ? void 0 : e.message) || "未知错误";
}
const AI_REQUEST_TIMEOUT_MS = 18e4;
const AI_STALL_TIMEOUT_MS = 3e4;
async function readChunk(reader, ctrl, stallMs, markTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      markTimeout();
      ctrl.abort();
      reject(new Error("数据流中断"));
    }, stallMs);
    reader.read().then((r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
async function streamChatCompletion(config, messages, onToken, signal, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  var _a, _b, _c, _d, _e, _f;
  const body = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true
  };
  const ctrl = new AbortController();
  let timedOut = false;
  const markTimeout = () => {
    timedOut = true;
  };
  const onUserAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onUserAbort, { once: true });
  }
  const overall = setTimeout(() => {
    markTimeout();
    ctrl.abort();
  }, timeoutMs);
  const cleanup = () => {
    clearTimeout(overall);
    if (signal) signal.removeEventListener("abort", onUserAbort);
  };
  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new AIRequestError(classifyHttpError(res.status, raw), res.status, "http");
    }
    if (!res.body) {
      const data = await res.json();
      const content = ((_c = (_b = (_a = data.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) ?? "";
      if (content) onToken(content);
      return content;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await readChunk(reader, ctrl, AI_STALL_TIMEOUT_MS, markTimeout);
      if (done) break;
      if (value) buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const token = (_f = (_e = (_d = json.choices) == null ? void 0 : _d[0]) == null ? void 0 : _e.delta) == null ? void 0 : _f.content;
          if (token) {
            full += token;
            onToken(token);
          }
        } catch {
        }
      }
    }
    return full;
  } catch (err) {
    if (timedOut) {
      throw new AIRequestError(
        `请求超时（>${Math.round(timeoutMs / 1e3)}s 无响应 / 数据流中断），请检查网络连通性或端点是否正确`,
        0,
        "timeout"
      );
    }
    if (err instanceof AIRequestError) throw err;
    const e = err;
    if ((e == null ? void 0 : e.name) === "AbortError") throw err;
    if ((e == null ? void 0 : e.name) === "TypeError") {
      throw new AIRequestError(
        "网络请求失败：无法连接到该端点，请检查 API 地址、本地网络或代理设置。",
        0,
        "network"
      );
    }
    throw err;
  } finally {
    cleanup();
  }
}
let mainWindow = null;
let tray = null;
let isQuiting = false;
const IMG_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const AUDIO_EXTS = [".mp3", ".ogg", ".wav", ".flac"];
const MIME_MAP = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac"
};
const SUBDIR_BACKGROUND = path.join("images", "background");
const SUBDIR_SPRITE = path.join("images", "sprite");
const SUBDIR_AUDIO = "audio";
let activeProjectRoot = null;
electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: "sw-asset",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
]);
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
  mainWindow.on("close", (e) => {
    if (!isQuiting) {
      e.preventDefault();
      mainWindow == null ? void 0 : mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, "../assets/tray.png");
  let icon = fs.existsSync(iconPath) ? electron.nativeImage.createFromPath(iconPath) : makeFallbackTrayIcon();
  if (icon.isEmpty()) icon = makeFallbackTrayIcon();
  icon = icon.resize({ width: 32, height: 32 });
  tray = new electron.Tray(icon);
  tray.setToolTip("ScriptWeaver");
  tray.setContextMenu(
    electron.Menu.buildFromTemplate([
      { label: "显示窗口", click: () => showMainWindow() },
      { type: "separator" },
      { label: "退出", click: () => {
        isQuiting = true;
        electron.app.quit();
      } }
    ])
  );
  tray.on("click", () => showMainWindow());
}
function makeFallbackTrayIcon() {
  const size = 32;
  const [r, g, b, a] = [30, 41, 59, 255];
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) raw.push(r, g, b, a);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(Buffer.from(raw));
  const buf = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return electron.nativeImage.createFromBuffer(buf);
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c >>> 1 ^ 3988292384 & -(c & 1);
  }
  return ~c >>> 0;
}
electron.app.whenReady().then(() => {
  registerAssetProtocol();
  createWindow();
  createTray();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (isQuiting) {
      electron.app.quit();
    } else if (process.env.VITE_DEV_SERVER_URL) {
      if (!mainWindow) createWindow();
    } else {
      electron.app.quit();
    }
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
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      copyFile(s, d);
    }
  }
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}
function resolveSubdir(ext, kind) {
  if (AUDIO_EXTS.includes(ext)) return { subdir: SUBDIR_AUDIO, type: "audio" };
  if (kind === "background") return { subdir: SUBDIR_BACKGROUND, type: "background" };
  return { subdir: SUBDIR_SPRITE, type: "sprite" };
}
function classifyAsset(abs) {
  const ext = path.extname(abs).toLowerCase();
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if (IMG_EXTS.includes(ext)) {
    const normalized = abs.replace(/\\/g, "/");
    return normalized.includes("/images/background/") ? "background" : "sprite";
  }
  return null;
}
let sessionDir = null;
function getSessionDir() {
  if (!sessionDir) {
    sessionDir = path.join(electron.app.getPath("userData"), "session-assets");
    ensureDir(sessionDir);
  }
  return sessionDir;
}
electron.app.on("before-quit", () => {
  stopAssetWatch();
});
function registerAssetProtocol() {
  electron.protocol.handle("sw-asset", (request) => {
    try {
      const url = new URL(request.url);
      let rel;
      try {
        rel = decodeURIComponent(url.pathname);
      } catch {
        rel = url.pathname;
      }
      rel = rel.replace(/^\/+/, "");
      console.log("[sw-asset] request", request.url, "| rel=", rel, "| activeRoot=", activeProjectRoot, "| session=", sessionDir);
      if (!rel) return new Response("bad request", { status: 400 });
      const roots = [];
      if (activeProjectRoot) roots.push(activeProjectRoot);
      roots.push(getSessionDir());
      for (const root of roots) {
        const assetsDir = path.resolve(root, "assets");
        const candidates = [
          path.resolve(root, rel),
          path.resolve(root, "assets", rel)
        ];
        for (const abs of candidates) {
          const inTree = abs === assetsDir || abs.startsWith(assetsDir + path.sep);
          const ext = path.extname(abs).toLowerCase();
          const extOk = IMG_EXTS.includes(ext) || AUDIO_EXTS.includes(ext);
          const exists = fs.existsSync(abs);
          if (!inTree) continue;
          if (!extOk) continue;
          if (!exists) continue;
          const mime = MIME_MAP[ext] ?? "application/octet-stream";
          const total = fs.statSync(abs).size;
          const range = request.headers.get("range");
          if (range) {
            const m = /bytes=(\d+)-(\d*)/.exec(range);
            let start = m ? parseInt(m[1], 10) : 0;
            let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
            if (isNaN(start) || isNaN(end) || start > end || end >= total) {
              start = 0;
              end = total - 1;
            }
            const sliceLen = end - start + 1;
            const slice = fs.readFileSync(abs, { start, end: end + 1 });
            console.log("[sw-asset]  HIT(range)", abs, start, "-", end, "/", total);
            return new Response(new Uint8Array(slice), {
              status: 206,
              headers: {
                "Content-Type": mime,
                "Content-Range": `bytes ${start}-${end}/${total}`,
                "Accept-Ranges": "bytes",
                "Content-Length": String(sliceLen),
                "Cache-Control": "no-cache"
              }
            });
          }
          const stream$1 = stream.Readable.toWeb(fs.createReadStream(abs));
          console.log("[sw-asset]  HIT", abs, mime);
          return new Response(stream$1, {
            headers: { "Content-Type": mime, "Cache-Control": "no-cache" }
          });
        }
      }
      console.log("[sw-asset]  NOT FOUND for", rel);
      return new Response("not found", { status: 404 });
    } catch (err) {
      return new Response(`error: ${err.message}`, { status: 500 });
    }
  });
}
let watcher = null;
let watchedRoot = null;
const watchDebounce = /* @__PURE__ */ new Map();
function stopAssetWatch() {
  if (watcher) {
    try {
      watcher.close();
    } catch {
    }
    watcher = null;
  }
  watchedRoot = null;
  for (const t of watchDebounce.values()) clearTimeout(t);
  watchDebounce.clear();
}
function startAssetWatch(projectRoot) {
  if (watchedRoot === projectRoot && watcher) return;
  stopAssetWatch();
  const assetsDir = path.join(projectRoot, "assets");
  ensureDir(assetsDir);
  try {
    watcher = fs.watch(assetsDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const relFile = filename.toString();
      const abs = path.join(assetsDir, relFile);
      const type = classifyAsset(abs);
      if (!type) return;
      const key = abs;
      const prev = watchDebounce.get(key);
      if (prev) clearTimeout(prev);
      watchDebounce.set(
        key,
        setTimeout(() => {
          watchDebounce.delete(key);
          const relativePath = ("assets/" + path.relative(assetsDir, abs).replace(/\\/g, "/")).replace(/\/+/g, "/");
          const exists = fs.existsSync(abs);
          mainWindow == null ? void 0 : mainWindow.webContents.send("asset:changed", {
            relativePath,
            type,
            exists
          });
        }, 150)
      );
    });
    watchedRoot = projectRoot;
  } catch {
    watcher = null;
    watchedRoot = null;
  }
}
const AI_CONFIG_PATH = path.join(electron.app.getPath("userData"), "ai-config.json");
function readAIConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_PATH)) {
      const p = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, "utf-8"));
      return {
        provider: p.provider ?? "openai",
        endpoint: p.endpoint ?? defaultAIConfig().endpoint,
        apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
        model: p.model ?? defaultAIConfig().model,
        temperature: typeof p.temperature === "number" ? p.temperature : 0.7,
        maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : 2e3
      };
    }
  } catch {
  }
  return defaultAIConfig();
}
function writeAIConfig(incoming) {
  const existing = readAIConfig();
  const merged = { ...existing, ...incoming };
  if (!incoming.apiKey) merged.apiKey = existing.apiKey;
  try {
    fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(merged), "utf-8");
  } catch {
  }
}
electron.ipcMain.handle("ai:getConfig", () => {
  const c = readAIConfig();
  return { ...c, apiKey: "", hasApiKey: !!c.apiKey };
});
electron.ipcMain.handle("ai:setConfig", (_event, cfg) => {
  writeAIConfig(cfg);
  return { ok: true };
});
let activeChat = null;
electron.ipcMain.on("ai:chat", async (event, payload) => {
  const cfg = readAIConfig();
  if (!cfg.apiKey) {
    event.sender.send("ai:error", "未配置 API Key（请在 AI 设置中填写，密钥仅存于本地安全区）");
    return;
  }
  const controller = new AbortController();
  activeChat = controller;
  try {
    const full = await streamChatCompletion(
      cfg,
      payload.messages,
      (delta) => event.sender.send("ai:chunk", { delta }),
      controller.signal
    );
    event.sender.send("ai:done", { full });
  } catch (err) {
    const e = err;
    if ((e == null ? void 0 : e.name) === "AbortError") {
      event.sender.send("ai:aborted");
      return;
    }
    event.sender.send("ai:error", describeAIError(err));
  } finally {
    activeChat = null;
  }
});
electron.ipcMain.on("ai:abort", () => {
  activeChat == null ? void 0 : activeChat.abort();
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
electron.ipcMain.handle("fs:setActiveProjectRoot", (_event, root) => {
  activeProjectRoot = root && typeof root === "string" ? root : null;
  if (activeProjectRoot) {
    startAssetWatch(activeProjectRoot);
  } else {
    stopAssetWatch();
  }
  return { success: true };
});
electron.ipcMain.handle("fs:scanProjectAssets", (_event, projectRoot) => {
  try {
    if (!projectRoot || typeof projectRoot !== "string") {
      return { success: false, error: "缺少 projectRoot" };
    }
    const assetsDir = path.join(projectRoot, "assets");
    const out = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
        } else {
          const type = classifyAsset(abs);
          if (!type) continue;
          const relativePath = "assets/" + path.relative(assetsDir, abs).replace(/\\/g, "/");
          out.push({
            id: uuid(),
            type,
            name: path.parse(abs).name,
            fileName: path.basename(abs),
            relativePath,
            importedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    };
    walk(assetsDir);
    return { success: true, assets: out };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
    ensureDir(path.join(assetsDir, SUBDIR_BACKGROUND));
    ensureDir(path.join(assetsDir, SUBDIR_SPRITE));
    ensureDir(path.join(assetsDir, SUBDIR_AUDIO));
    const sessionAssets = path.join(getSessionDir(), "assets");
    if (fs.existsSync(sessionAssets)) {
      copyDir(sessionAssets, assetsDir);
    }
    const projPath = path.join(projectDir, `${projectName}.swproj`);
    fs.writeFileSync(projPath, data.projectJson, "utf-8");
    activeProjectRoot = projectDir;
    startAssetWatch(projectDir);
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
    activeProjectRoot = projectDir;
    startAssetWatch(projectDir);
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
      const { subdir, type } = resolveSubdir(ext, options == null ? void 0 : options.kind);
      const destDir = path.join(sessionRoot, "assets", subdir);
      ensureDir(destDir);
      let fileDest = path.join(destDir, baseName);
      let counter = 1;
      while (fs.existsSync(fileDest)) {
        const parsed = path.parse(baseName);
        fileDest = path.join(destDir, `${parsed.name}_${counter}${parsed.ext}`);
        counter++;
      }
      copyFile(srcPath, fileDest);
      const relativePath = path.join("assets", subdir, path.basename(fileDest)).replace(/\\/g, "/");
      files.push({
        id: uuid(),
        fileName: path.basename(fileDest),
        relativePath,
        type
      });
    }
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("fs:importFilesFromPaths", async (_event, srcPaths, kind) => {
  if (!Array.isArray(srcPaths) || srcPaths.length === 0) return { success: false, error: "未提供文件" };
  try {
    const sessionRoot = getSessionDir();
    const files = [];
    for (const srcPath of srcPaths) {
      if (typeof srcPath !== "string" || !fs.existsSync(srcPath)) continue;
      const ext = path.extname(srcPath).toLowerCase();
      const baseName = path.basename(srcPath);
      const { subdir, type } = resolveSubdir(ext, kind);
      const destDir = path.join(sessionRoot, "assets", subdir);
      ensureDir(destDir);
      let fileDest = path.join(destDir, baseName);
      let counter = 1;
      while (fs.existsSync(fileDest)) {
        const parsed = path.parse(baseName);
        fileDest = path.join(destDir, `${parsed.name}_${counter}${parsed.ext}`);
        counter++;
      }
      copyFile(srcPath, fileDest);
      const relativePath = path.join("assets", subdir, path.basename(fileDest)).replace(/\\/g, "/");
      files.push({
        id: uuid(),
        fileName: path.basename(fileDest),
        relativePath,
        type
      });
    }
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("fs:exportRenpy", async (_event, bundle) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    title: "选择 Ren'Py 导出目录",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const root = result.filePaths[0];
  const gameDir = path.join(root, "game");
  const imgBg = path.join(gameDir, "images", "background");
  const imgSpr = path.join(gameDir, "images", "sprite");
  const audDir = path.join(gameDir, "audio");
  ensureDir(imgBg);
  ensureDir(imgSpr);
  ensureDir(audDir);
  const srcRoot = activeProjectRoot ?? getSessionDir();
  const resolvedSrcRoot = path.resolve(srcRoot);
  let copied = 0;
  for (const a of bundle.assets ?? []) {
    const src = path.resolve(resolvedSrcRoot, a.sourceRelativePath);
    if (src !== resolvedSrcRoot && !src.startsWith(resolvedSrcRoot + path.sep)) continue;
    if (!fs.existsSync(src)) continue;
    const dest = path.resolve(gameDir, a.exportRelPath);
    try {
      copyFile(src, dest);
      copied++;
    } catch {
    }
  }
  try {
    fs.writeFileSync(path.join(gameDir, "script.rpy"), bundle.script ?? "", "utf-8");
    fs.writeFileSync(path.join(gameDir, "definitions.rpy"), bundle.definitions ?? "", "utf-8");
    if (bundle.transforms && bundle.transforms.trim()) {
      fs.writeFileSync(path.join(gameDir, "transforms.rpy"), bundle.transforms, "utf-8");
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
  return { success: true, gameDir, copied };
});
