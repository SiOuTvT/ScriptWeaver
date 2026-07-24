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
    maxTokens: 2e3,
    ttsModel: "tts-1"
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
  setTimeout(() => {
    markTimeout();
    ctrl.abort();
  }, timeoutMs);
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
        "网络请求失败：无法连接到该端点，请检查 API 地址、本地网络或代理设置",
        0,
        "network"
      );
    }
    throw new AIRequestError(err.message || "未知错误", 0, "unknown");
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
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  const isDev = !!process.env.VITE_DEV_SERVER_URL || !electron.app.isPackaged;
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev ? [
      "default-src 'self' http://localhost:* ws://localhost:*;",
      "script-src 'self' 'unsafe-inline' http://localhost:*;",
      "style-src 'self' 'unsafe-inline' http://localhost:*;",
      "font-src 'self' data: http://localhost:*;",
      "img-src 'self' data: sw-asset: blob: http://localhost:*;",
      "media-src 'self' data: sw-asset: blob: http://localhost:*;",
      "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:*;"
    ].join(" ") : [
      "default-src 'self';",
      "script-src 'self' 'unsafe-inline';",
      "style-src 'self' 'unsafe-inline';",
      "font-src 'self' data:;",
      "img-src 'self' data: sw-asset: blob:;",
      "media-src 'self' data: sw-asset: blob:;"
    ].join(" ");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp]
      }
    });
  });
  if (isDev) {
    const tryLoad = (retries = 0) => {
      mainWindow.loadURL(devUrl).catch((err) => {
        console.warn(`[dev] loadURL ${devUrl} failed (retry ${retries}): ${String(err)}`);
        if (retries < 10) {
          setTimeout(() => tryLoad(retries + 1), 1500);
        } else {
          mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
        }
      });
    };
    tryLoad();
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
function getWebTemplateDir() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "web-player");
  }
  return path.join(__dirname, "..", "web-player");
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
      console.log("[sw-asset] request", request.url, "| rel=", rel, "| activeRoot=", activeProjectRoot);
      if (!rel) return new Response("bad request", { status: 400 });
      const roots = [];
      if (activeProjectRoot) roots.push(activeProjectRoot);
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
        maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : 2e3,
        ttsModel: typeof p.ttsModel === "string" && p.ttsModel.trim() ? p.ttsModel : "tts-1"
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
electron.ipcMain.handle("tts:synthesize", async (_event, payload) => {
  if (!activeProjectRoot) return { success: false, error: "请先保存项目，再使用 TTS 配音" };
  const cfg = readAIConfig();
  if (!cfg.apiKey) {
    return { success: false, error: "未配置 AI API 密钥（请先在 AI 设置中填写密钥）" };
  }
  try {
    const ttsEndpoint = cfg.endpoint.replace(/\/chat\/completions\/?$/, "/audio/speech");
    const fmt = payload.format || "mp3";
    const body = {
      model: cfg.ttsModel || "tts-1",
      input: payload.text || " ",
      voice: payload.voiceId || "alloy",
      response_format: fmt
    };
    if (payload.speed != null) body.speed = payload.speed;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12e4);
    let resp;
    try {
      resp = await fetch(ttsEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { success: false, error: `TTS API 返回 ${resp.status}${errText ? ": " + errText.slice(0, 200) : ""}` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const safeChar = (payload.charId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
    const safeLine = (payload.lineTag || "L0").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 16);
    const id = uuid();
    const fileName = `tts_${safeChar}_${safeLine}_${id.slice(0, 8)}.${fmt}`;
    const destDir = path.join(activeProjectRoot, "assets", "audio");
    ensureDir(destDir);
    const dest = path.join(destDir, fileName);
    fs.writeFileSync(dest, buf);
    const relativePath = path.join("assets", "audio", fileName).replace(/\\/g, "/");
    return {
      success: true,
      asset: { id, fileName, relativePath }
    };
  } catch (err) {
    const msg = err.message || String(err);
    return { success: false, error: `TTS 合成失败: ${msg}` };
  }
});
electron.ipcMain.handle("app:getVersion", () => {
  return electron.app.getVersion();
});
electron.ipcMain.handle("app:getPath", (_event, name) => {
  return electron.app.getPath(name);
});
electron.ipcMain.handle("app:clearLocalCache", () => {
  try {
    const userData = electron.app.getPath("userData");
    const targets = [path.join(userData, "snapshots")];
    let removedDirs = 0;
    for (const dir of targets) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        removedDirs++;
      }
    }
    return { success: true, removedDirs };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
    ensureDir(path.join(assetsDir, "scripts"));
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
    if (!activeProjectRoot) return { success: false, error: "请先保存项目，再导入素材" };
    const files = [];
    for (const srcPath of result.filePaths) {
      const ext = path.extname(srcPath).toLowerCase();
      const baseName = path.basename(srcPath);
      const { subdir, type } = resolveSubdir(ext, options == null ? void 0 : options.kind);
      const destDir = path.join(activeProjectRoot, "assets", subdir);
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
  if (!activeProjectRoot) return { success: false, error: "请先保存项目，再导入素材" };
  try {
    const files = [];
    for (const srcPath of srcPaths) {
      if (typeof srcPath !== "string" || !fs.existsSync(srcPath)) continue;
      const ext = path.extname(srcPath).toLowerCase();
      const baseName = path.basename(srcPath);
      const { subdir, type } = resolveSubdir(ext, kind);
      const destDir = path.join(activeProjectRoot, "assets", subdir);
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
  if (!activeProjectRoot) return { success: false, error: "请先保存项目" };
  const srcRoot = activeProjectRoot;
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
electron.ipcMain.handle("fs:exportWeb", async (_event, bundle) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    title: "选择 Web 导出目录",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const root = result.filePaths[0];
  const tpl = getWebTemplateDir();
  if (!activeProjectRoot) return { success: false, error: "请先保存项目" };
  const srcRoot = activeProjectRoot;
  const resolvedSrcRoot = path.resolve(srcRoot);
  try {
    for (const f of ["index.html", "style.css", "player.js"]) {
      const src = path.join(tpl, f);
      if (fs.existsSync(src)) copyFile(src, path.join(root, f));
    }
    let copied = 0;
    for (const a of bundle.assetRefs ?? []) {
      const src = path.resolve(resolvedSrcRoot, a.sourceRelativePath);
      if (src !== resolvedSrcRoot && !src.startsWith(resolvedSrcRoot + path.sep)) continue;
      if (!fs.existsSync(src)) continue;
      const dest = path.resolve(root, a.exportRelPath);
      try {
        copyFile(src, dest);
        copied++;
      } catch {
      }
    }
    fs.writeFileSync(path.join(root, "game.json"), bundle.gameJson, "utf-8");
    return { success: true, outDir: root, copied };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
function getSnapshotsDir(projectId) {
  const safe = (projectId || "unsaved").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(electron.app.getPath("userData"), "snapshots", safe);
}
const MAX_SNAPSHOTS = 60;
electron.ipcMain.handle(
  "fs:snapshotProject",
  async (_event, payload) => {
    try {
      const dir = getSnapshotsDir(payload.projectId);
      ensureDir(dir);
      let parsed = {};
      try {
        parsed = JSON.parse(payload.projectJson);
      } catch {
      }
      const now = /* @__PURE__ */ new Date();
      const ts = now.toISOString().replace(/[:.]/g, "-");
      const id = `${ts}__${uuid().slice(0, 6)}`;
      const meta = {
        id,
        createdAt: now.toISOString(),
        label: payload.label || (payload.auto ? "自动备份" : "手动快照"),
        lineCount: Array.isArray(parsed.draftDeltas) ? parsed.draftDeltas.length : 0,
        assetCount: Array.isArray(parsed.assets) ? parsed.assets.length : 0,
        charCount: Array.isArray(parsed.characterConfigs) ? parsed.characterConfigs.length : 0,
        sizeBytes: Buffer.byteLength(payload.projectJson, "utf-8"),
        auto: !!payload.auto,
        projectJson: payload.projectJson
      };
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta, null, 2), "utf-8");
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
      while (files.length > MAX_SNAPSHOTS) {
        const victim = files.shift();
        fs.rmSync(path.join(dir, victim.f), { force: true });
      }
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
);
electron.ipcMain.handle("fs:listSnapshots", (_event, projectId) => {
  try {
    const dir = getSnapshotsDir(projectId);
    if (!fs.existsSync(dir)) return { success: true, snapshots: [] };
    const list = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
        const { projectJson: _p, ...meta } = m;
        return meta;
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
    return { success: true, snapshots: list };
  } catch (err) {
    return { success: false, error: err.message, snapshots: [] };
  }
});
electron.ipcMain.handle("fs:restoreSnapshot", (_event, projectId, id) => {
  try {
    const dir = getSnapshotsDir(projectId);
    const fp = path.join(dir, `${id}.json`);
    if (!fs.existsSync(fp)) return { success: false, error: "快照不存在" };
    const m = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return { success: true, projectJson: m.projectJson };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("fs:deleteSnapshot", (_event, projectId, id) => {
  try {
    const dir = getSnapshotsDir(projectId);
    const fp = path.join(dir, `${id}.json`);
    if (fs.existsSync(fp)) fs.rmSync(fp, { force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("fs:evictAssetCache", async (_event, relativePath) => {
  try {
    const rel = (relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return { success: false, error: "非法路径" };
    if (!activeProjectRoot) return { success: false, error: "请先保存项目" };
    const roots = [activeProjectRoot];
    let removed = false;
    for (const root of roots) {
      const fp = path.resolve(root, rel);
      if (!fp.startsWith(path.resolve(root) + path.sep)) continue;
      if (fs.existsSync(fp)) {
        fs.rmSync(fp, { force: true });
        removed = true;
      }
    }
    return { success: true, removed };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("fs:downloadAsset", async (_event, remoteUrl, relativePath) => {
  try {
    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) {
      return { success: false, error: "未配置有效的云端地址（remoteUrl）" };
    }
    if (!activeProjectRoot) return { success: false, error: "请先保存项目" };
    const rel = (relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return { success: false, error: "非法路径" };
    const dir = path.join(activeProjectRoot, path.dirname(rel));
    ensureDir(dir);
    const dest = path.join(activeProjectRoot, rel);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12e4);
    let resp;
    try {
      resp = await fetch(remoteUrl, { signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      return { success: false, error: `下载失败：${e.message}` };
    }
    clearTimeout(timer);
    if (!resp.ok) return { success: false, error: `云端返回 ${resp.status}` };
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return { success: true, bytes: buf.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
