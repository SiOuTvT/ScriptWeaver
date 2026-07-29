"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));
var import_os = __toESM(require("os"));
var import_child_process = require("child_process");
var import_zlib = __toESM(require("zlib"));
var import_stream = require("stream");

// src/utils/aiDirector.ts
var PROVIDER_PRESETS = {
  openai: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  deepseek: { endpoint: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" },
  // Claude 等通过 OpenRouter 的 OpenAI 兼容接口接入
  openrouter: { endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "anthropic/claude-3.5-sonnet" }
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
var AIRequestError = class extends Error {
  status;
  kind;
  constructor(message, status = 0, kind = "unknown") {
    super(message);
    this.name = "AIRequestError";
    this.status = status;
    this.kind = kind;
  }
};
function classifyHttpError(status, raw) {
  let detail = "";
  try {
    const j = JSON.parse(raw);
    detail = j?.error?.message || j?.error?.type || "";
  } catch {
  }
  const tail = detail ? `\uFF08${detail.slice(0, 160)}\uFF09` : raw ? `\uFF08${raw.slice(0, 160)}\uFF09` : "";
  switch (status) {
    case 401:
      return `API \u5BC6\u94A5\u65E0\u6548\u6216\u672A\u6388\u6743\uFF08401\uFF09\u3002\u8BF7\u5230 AI \u8BBE\u7F6E\u4E2D\u68C0\u67E5 Key \u662F\u5426\u6B63\u786E\u3001\u662F\u5426\u8FC7\u671F${tail}`;
    case 403:
      return `\u5BC6\u94A5\u65E0\u6743\u8BBF\u95EE\u8BE5\u6A21\u578B\uFF08403\uFF09\u3002\u8BF7\u786E\u8BA4\u8D26\u6237\u6743\u9650\u6216\u6539\u7528\u53EF\u7528\u6A21\u578B${tail}`;
    case 404:
      return `\u8BF7\u6C42\u7684\u7AEF\u70B9\u6216\u6A21\u578B\u4E0D\u5B58\u5728\uFF08404\uFF09\u3002\u8BF7\u68C0\u67E5 API \u7AEF\u70B9\u4E0E\u6A21\u578B\u540D${tail}`;
    case 429:
      return `\u89E6\u53D1\u9891\u7387\u9650\u5236\uFF08429\uFF09\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF0C\u6216\u964D\u4F4E\u5E76\u53D1 / \u8C03\u5C0F max_tokens${tail}`;
    default:
      if (status >= 500) return `\u6A21\u578B\u670D\u52A1\u7AEF\u9519\u8BEF\uFF08${status}\uFF09\u3002\u4E0A\u6E38\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5${tail}`;
      return `API \u8BF7\u6C42\u5931\u8D25\uFF08${status}\uFF09${tail}`;
  }
}
function describeAIError(err) {
  const e = err;
  if (e?.name === "TimeoutError") return e.message || "\u8BF7\u6C42\u8D85\u65F6";
  if (e instanceof AIRequestError) return e.message;
  if (e?.name === "TypeError")
    return "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A\u65E0\u6CD5\u8FDE\u63A5\u5230\u8BE5\u7AEF\u70B9\u3002\u8BF7\u68C0\u67E5 API \u5730\u5740\u3001\u672C\u5730\u7F51\u7EDC\u6216\u4EE3\u7406\u8BBE\u7F6E\uFF08\u684C\u9762\u7AEF\u4E5F\u9700\u53EF\u8BBF\u95EE\u5916\u7F51\uFF09\u3002";
  return e?.message || "\u672A\u77E5\u9519\u8BEF";
}
var AI_REQUEST_TIMEOUT_MS = 18e4;
var AI_STALL_TIMEOUT_MS = 3e4;
async function readChunk(reader, ctrl, stallMs, markTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      markTimeout();
      ctrl.abort();
      reject(new Error("\u6570\u636E\u6D41\u4E2D\u65AD"));
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
async function streamChatCompletion(config, messages, onToken, signal, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;
  const stallMs = opts.stallMs ?? AI_STALL_TIMEOUT_MS;
  const streaming = opts.streaming ?? true;
  const body = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: streaming
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
      const content = data.choices?.[0]?.message?.content ?? "";
      if (content) onToken(content);
      return content;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await readChunk(reader, ctrl, stallMs, markTimeout);
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
          const token = json.choices?.[0]?.delta?.content;
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
        `\u8BF7\u6C42\u8D85\u65F6\uFF08>${Math.round(timeoutMs / 1e3)}s \u65E0\u54CD\u5E94 / \u6570\u636E\u6D41\u4E2D\u65AD\uFF09\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u901A\u6027\u6216\u7AEF\u70B9\u662F\u5426\u6B63\u786E`,
        0,
        "timeout"
      );
    }
    if (err instanceof AIRequestError) throw err;
    const e = err;
    if (e?.name === "AbortError") throw err;
    if (e?.name === "TypeError") {
      throw new AIRequestError(
        "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A\u65E0\u6CD5\u8FDE\u63A5\u5230\u8BE5\u7AEF\u70B9\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740\u3001\u672C\u5730\u7F51\u7EDC\u6216\u4EE3\u7406\u8BBE\u7F6E",
        0,
        "network"
      );
    }
    throw new AIRequestError(err.message || "\u672A\u77E5\u9519\u8BEF", 0, "unknown");
  }
}

// electron/main.ts
var mainWindow = null;
var tray = null;
var isQuiting = false;
var IMG_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
var AUDIO_EXTS = [".mp3", ".ogg", ".wav", ".flac"];
var MIME_MAP = {
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
var SUBDIR_BACKGROUND = import_path.default.join("images", "background");
var SUBDIR_SPRITE = import_path.default.join("images", "sprite");
var SUBDIR_AUDIO = "audio";
var activeProjectRoot = null;
import_electron.protocol.registerSchemesAsPrivileged([
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
  mainWindow = new import_electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "ScriptWeaver",
    webPreferences: {
      preload: import_path.default.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  const isDev = !!process.env.VITE_DEV_SERVER_URL || !import_electron.app.isPackaged;
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
          mainWindow.loadFile(import_path.default.join(__dirname, "../dist/index.html"));
        }
      });
    };
    tryLoad();
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(import_path.default.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("close", (e) => {
    if (!isQuiting) {
      e.preventDefault();
      mainWindow?.hide();
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
  const iconPath = import_path.default.join(__dirname, "../assets/tray.png");
  let icon = import_fs.default.existsSync(iconPath) ? import_electron.nativeImage.createFromPath(iconPath) : makeFallbackTrayIcon();
  if (icon.isEmpty()) icon = makeFallbackTrayIcon();
  icon = icon.resize({ width: 32, height: 32 });
  tray = new import_electron.Tray(icon);
  tray.setToolTip("ScriptWeaver");
  tray.setContextMenu(
    import_electron.Menu.buildFromTemplate([
      { label: "\u663E\u793A\u7A97\u53E3", click: () => showMainWindow() },
      { type: "separator" },
      { label: "\u9000\u51FA", click: () => {
        isQuiting = true;
        import_electron.app.quit();
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
  const idat = import_zlib.default.deflateSync(Buffer.from(raw));
  const buf = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return import_electron.nativeImage.createFromBuffer(buf);
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
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c >>> 1 ^ 3988292384 & -(c & 1);
  }
  return ~c >>> 0;
}
import_electron.app.whenReady().then(() => {
  registerAssetProtocol();
  createWindow();
  createTray();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (isQuiting) {
      import_electron.app.quit();
    } else if (process.env.VITE_DEV_SERVER_URL) {
      if (!mainWindow) createWindow();
    } else {
      import_electron.app.quit();
    }
  }
});
function ensureDir(dir) {
  if (!import_fs.default.existsSync(dir)) {
    import_fs.default.mkdirSync(dir, { recursive: true });
  }
}
function copyFile(src, dest) {
  ensureDir(import_path.default.dirname(dest));
  import_fs.default.copyFileSync(src, dest);
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
  const ext = import_path.default.extname(abs).toLowerCase();
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if (IMG_EXTS.includes(ext)) {
    const normalized = abs.replace(/\\/g, "/");
    return normalized.includes("/images/background/") ? "background" : "sprite";
  }
  return null;
}
function getWebTemplateDir() {
  if (import_electron.app.isPackaged) {
    return import_path.default.join(process.resourcesPath, "web-player");
  }
  return import_path.default.join(__dirname, "..", "web-player");
}
import_electron.app.on("before-quit", () => {
  stopAssetWatch();
});
function registerAssetProtocol() {
  import_electron.protocol.handle("sw-asset", (request) => {
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
        const assetsDir = import_path.default.resolve(root, "assets");
        const candidates = [
          import_path.default.resolve(root, rel),
          import_path.default.resolve(root, "assets", rel)
        ];
        for (const abs of candidates) {
          const inTree = abs === assetsDir || abs.startsWith(assetsDir + import_path.default.sep);
          const ext = import_path.default.extname(abs).toLowerCase();
          const extOk = IMG_EXTS.includes(ext) || AUDIO_EXTS.includes(ext);
          const exists = import_fs.default.existsSync(abs);
          if (!inTree) continue;
          if (!extOk) continue;
          if (!exists) continue;
          const mime = MIME_MAP[ext] ?? "application/octet-stream";
          const total = import_fs.default.statSync(abs).size;
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
            const slice = import_fs.default.readFileSync(abs, { start, end: end + 1 });
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
          const stream = import_stream.Readable.toWeb(import_fs.default.createReadStream(abs));
          console.log("[sw-asset]  HIT", abs, mime);
          return new Response(stream, {
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
var watcher = null;
var watchedRoot = null;
var watchDebounce = /* @__PURE__ */ new Map();
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
  const assetsDir = import_path.default.join(projectRoot, "assets");
  ensureDir(assetsDir);
  try {
    watcher = import_fs.default.watch(assetsDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const relFile = filename.toString();
      const abs = import_path.default.join(assetsDir, relFile);
      const type = classifyAsset(abs);
      if (!type) return;
      const key = abs;
      const prev = watchDebounce.get(key);
      if (prev) clearTimeout(prev);
      watchDebounce.set(
        key,
        setTimeout(() => {
          watchDebounce.delete(key);
          const relativePath = ("assets/" + import_path.default.relative(assetsDir, abs).replace(/\\/g, "/")).replace(/\/+/g, "/");
          const exists = import_fs.default.existsSync(abs);
          mainWindow?.webContents.send("asset:changed", {
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
var AI_CONFIG_PATH = import_path.default.join(import_electron.app.getPath("userData"), "ai-config.json");
function readAIConfig() {
  try {
    if (import_fs.default.existsSync(AI_CONFIG_PATH)) {
      const p = JSON.parse(import_fs.default.readFileSync(AI_CONFIG_PATH, "utf-8"));
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
    import_fs.default.writeFileSync(AI_CONFIG_PATH, JSON.stringify(merged), "utf-8");
  } catch {
  }
}
import_electron.ipcMain.handle("ai:getConfig", () => {
  const c = readAIConfig();
  return { ...c, apiKey: "", hasApiKey: !!c.apiKey };
});
import_electron.ipcMain.handle("ai:setConfig", (_event, cfg) => {
  writeAIConfig(cfg);
  return { ok: true };
});
var activeChat = null;
import_electron.ipcMain.on("ai:chat", async (event, payload) => {
  const cfg = readAIConfig();
  if (!cfg.apiKey) {
    event.sender.send("ai:error", "\u672A\u914D\u7F6E API Key\uFF08\u8BF7\u5728 AI \u8BBE\u7F6E\u4E2D\u586B\u5199\uFF0C\u5BC6\u94A5\u4EC5\u5B58\u4E8E\u672C\u5730\u5B89\u5168\u533A\uFF09");
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
    if (e?.name === "AbortError") {
      event.sender.send("ai:aborted");
      return;
    }
    event.sender.send("ai:error", describeAIError(err));
  } finally {
    activeChat = null;
  }
});
import_electron.ipcMain.on("ai:abort", () => {
  activeChat?.abort();
});
import_electron.ipcMain.handle("tts:synthesize", async (_event, payload) => {
  if (!activeProjectRoot) return { success: false, error: "\u8BF7\u5148\u4FDD\u5B58\u9879\u76EE\uFF0C\u518D\u4F7F\u7528 TTS \u914D\u97F3" };
  const cfg = readAIConfig();
  if (!cfg.apiKey) {
    return { success: false, error: "\u672A\u914D\u7F6E AI API \u5BC6\u94A5\uFF08\u8BF7\u5148\u5728 AI \u8BBE\u7F6E\u4E2D\u586B\u5199\u5BC6\u94A5\uFF09" };
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
      return { success: false, error: `TTS API \u8FD4\u56DE ${resp.status}${errText ? ": " + errText.slice(0, 200) : ""}` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const safeChar = (payload.charId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
    const safeLine = (payload.lineTag || "L0").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 16);
    const id = uuid();
    const fileName = `tts_${safeChar}_${safeLine}_${id.slice(0, 8)}.${fmt}`;
    const destDir = import_path.default.join(activeProjectRoot, "assets", "audio");
    ensureDir(destDir);
    const dest = import_path.default.join(destDir, fileName);
    import_fs.default.writeFileSync(dest, buf);
    const relativePath = import_path.default.join("assets", "audio", fileName).replace(/\\/g, "/");
    return {
      success: true,
      asset: { id, fileName, relativePath }
    };
  } catch (err) {
    const msg = err.message || String(err);
    return { success: false, error: `TTS \u5408\u6210\u5931\u8D25: ${msg}` };
  }
});
import_electron.ipcMain.handle("shell:openExternal", (_event, url) => {
  if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
    import_electron.shell.openExternal(url);
  }
});
import_electron.ipcMain.handle("app:getVersion", () => {
  return import_electron.app.getVersion();
});
import_electron.ipcMain.handle("app:getPath", (_event, name) => {
  return import_electron.app.getPath(name);
});
import_electron.ipcMain.handle("app:clearLocalCache", () => {
  try {
    const userData = import_electron.app.getPath("userData");
    const targets = [import_path.default.join(userData, "snapshots")];
    let removedDirs = 0;
    for (const dir of targets) {
      if (import_fs.default.existsSync(dir)) {
        import_fs.default.rmSync(dir, { recursive: true, force: true });
        removedDirs++;
      }
    }
    return { success: true, removedDirs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.on("app:setNativeTheme", (_event, theme) => {
  import_electron.nativeTheme.themeSource = theme;
});
import_electron.ipcMain.handle("fs:setActiveProjectRoot", (_event, root) => {
  activeProjectRoot = root && typeof root === "string" ? root : null;
  if (activeProjectRoot) {
    startAssetWatch(activeProjectRoot);
  } else {
    stopAssetWatch();
  }
  return { success: true };
});
import_electron.ipcMain.handle("fs:scanProjectAssets", (_event, projectRoot) => {
  try {
    if (!projectRoot || typeof projectRoot !== "string") {
      return { success: false, error: "\u7F3A\u5C11 projectRoot" };
    }
    const assetsDir = import_path.default.join(projectRoot, "assets");
    const out = [];
    const walk = (dir) => {
      if (!import_fs.default.existsSync(dir)) return;
      for (const entry of import_fs.default.readdirSync(dir, { withFileTypes: true })) {
        const abs = import_path.default.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
        } else {
          const type = classifyAsset(abs);
          if (!type) continue;
          const relativePath = "assets/" + import_path.default.relative(assetsDir, abs).replace(/\\/g, "/");
          out.push({
            id: uuid(),
            type,
            name: import_path.default.parse(abs).name,
            fileName: import_path.default.basename(abs),
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
function writeProjectToDir(projectDir, projectJson, projectName) {
  const assetsDir = import_path.default.join(projectDir, "assets");
  ensureDir(import_path.default.join(assetsDir, SUBDIR_BACKGROUND));
  ensureDir(import_path.default.join(assetsDir, SUBDIR_SPRITE));
  ensureDir(import_path.default.join(assetsDir, SUBDIR_AUDIO));
  ensureDir(import_path.default.join(assetsDir, "scripts"));
  const projPath = import_path.default.join(projectDir, `${projectName || "untitled"}.swproj`);
  import_fs.default.writeFileSync(projPath, projectJson, "utf-8");
}
import_electron.ipcMain.handle("dialog:saveProject", async (_event, data) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    title: "\u9009\u62E9\u9879\u76EE\u4FDD\u5B58\u76EE\u5F55",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const projectDir = result.filePaths[0];
  try {
    writeProjectToDir(projectDir, data.projectJson, data.projectName);
    activeProjectRoot = projectDir;
    startAssetWatch(projectDir);
    return { success: true, projectDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("dialog:saveProjectToPath", async (_event, data) => {
  try {
    writeProjectToDir(data.projectDir, data.projectJson, data.projectName);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("dialog:openProject", async () => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    title: "\u6253\u5F00\u9879\u76EE",
    filters: [
      { name: "ScriptWeaver \u9879\u76EE", extensions: ["swproj"] }
    ],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  try {
    const filePath = result.filePaths[0];
    const content = import_fs.default.readFileSync(filePath, "utf-8");
    const projectDir = import_path.default.dirname(filePath);
    activeProjectRoot = projectDir;
    startAssetWatch(projectDir);
    return { success: true, content, projectDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("dialog:pickAssetFiles", async (_event, options) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const filters = options?.filters || [
    { name: "\u56FE\u7247\u6587\u4EF6", extensions: ["png", "jpg", "jpeg", "webp"] },
    { name: "\u97F3\u9891\u6587\u4EF6", extensions: ["mp3", "ogg", "wav"] },
    { name: "\u6240\u6709\u6587\u4EF6", extensions: ["*"] }
  ];
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    title: "\u5BFC\u5165\u7D20\u6750",
    filters,
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  try {
    if (!activeProjectRoot) return { success: false, error: "\u8BF7\u5148\u4FDD\u5B58\u9879\u76EE\uFF0C\u518D\u5BFC\u5165\u7D20\u6750" };
    const files = [];
    for (const srcPath of result.filePaths) {
      const ext = import_path.default.extname(srcPath).toLowerCase();
      const baseName = import_path.default.basename(srcPath);
      const { subdir, type } = resolveSubdir(ext, options?.kind);
      const destDir = import_path.default.join(activeProjectRoot, "assets", subdir);
      ensureDir(destDir);
      let fileDest = import_path.default.join(destDir, baseName);
      let counter = 1;
      while (import_fs.default.existsSync(fileDest)) {
        const parsed = import_path.default.parse(baseName);
        fileDest = import_path.default.join(destDir, `${parsed.name}_${counter}${parsed.ext}`);
        counter++;
      }
      copyFile(srcPath, fileDest);
      const relativePath = import_path.default.join("assets", subdir, import_path.default.basename(fileDest)).replace(/\\/g, "/");
      files.push({
        id: uuid(),
        fileName: import_path.default.basename(fileDest),
        relativePath,
        type
      });
    }
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("fs:importFilesFromPaths", async (_event, srcPaths, kind) => {
  if (!Array.isArray(srcPaths) || srcPaths.length === 0) return { success: false, error: "\u672A\u63D0\u4F9B\u6587\u4EF6" };
  if (!activeProjectRoot) return { success: false, error: "\u8BF7\u5148\u4FDD\u5B58\u9879\u76EE\uFF0C\u518D\u5BFC\u5165\u7D20\u6750" };
  try {
    const files = [];
    for (const srcPath of srcPaths) {
      if (typeof srcPath !== "string" || !import_fs.default.existsSync(srcPath)) continue;
      const ext = import_path.default.extname(srcPath).toLowerCase();
      const baseName = import_path.default.basename(srcPath);
      const { subdir, type } = resolveSubdir(ext, kind);
      const destDir = import_path.default.join(activeProjectRoot, "assets", subdir);
      ensureDir(destDir);
      let fileDest = import_path.default.join(destDir, baseName);
      let counter = 1;
      while (import_fs.default.existsSync(fileDest)) {
        const parsed = import_path.default.parse(baseName);
        fileDest = import_path.default.join(destDir, `${parsed.name}_${counter}${parsed.ext}`);
        counter++;
      }
      copyFile(srcPath, fileDest);
      const relativePath = import_path.default.join("assets", subdir, import_path.default.basename(fileDest)).replace(/\\/g, "/");
      files.push({
        id: uuid(),
        fileName: import_path.default.basename(fileDest),
        relativePath,
        type
      });
    }
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("fs:exportRenpy", async (_event, bundle) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    title: "\u9009\u62E9 Ren'Py \u5BFC\u51FA\u76EE\u5F55",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const root = result.filePaths[0];
  const gameDir = import_path.default.join(root, "game");
  const imgBg = import_path.default.join(gameDir, "images", "background");
  const imgSpr = import_path.default.join(gameDir, "images", "sprite");
  const audDir = import_path.default.join(gameDir, "audio");
  ensureDir(imgBg);
  ensureDir(imgSpr);
  ensureDir(audDir);
  if (!activeProjectRoot) return { success: false, error: "\u8BF7\u5148\u4FDD\u5B58\u9879\u76EE" };
  const srcRoot = activeProjectRoot;
  const resolvedSrcRoot = import_path.default.resolve(srcRoot);
  let copied = 0;
  for (const a of bundle.assets ?? []) {
    const src = import_path.default.resolve(resolvedSrcRoot, a.sourceRelativePath);
    if (src !== resolvedSrcRoot && !src.startsWith(resolvedSrcRoot + import_path.default.sep)) continue;
    if (!import_fs.default.existsSync(src)) continue;
    const dest = import_path.default.resolve(gameDir, a.exportRelPath);
    try {
      copyFile(src, dest);
      copied++;
    } catch {
    }
  }
  try {
    import_fs.default.writeFileSync(import_path.default.join(gameDir, "script.rpy"), bundle.script ?? "", "utf-8");
    import_fs.default.writeFileSync(import_path.default.join(gameDir, "definitions.rpy"), bundle.definitions ?? "", "utf-8");
    if (bundle.transforms && bundle.transforms.trim()) {
      import_fs.default.writeFileSync(import_path.default.join(gameDir, "transforms.rpy"), bundle.transforms, "utf-8");
    }
    if (bundle.options && bundle.options.trim()) {
      import_fs.default.writeFileSync(import_path.default.join(gameDir, "options.rpy"), bundle.options, "utf-8");
    }
    if (bundle.ui && bundle.ui.trim()) {
      import_fs.default.writeFileSync(import_path.default.join(gameDir, "ui.rpy"), bundle.ui, "utf-8");
    }
    if (bundle.iconSourceRelativePath) {
      const iconSrc = import_path.default.resolve(resolvedSrcRoot, bundle.iconSourceRelativePath);
      if (iconSrc !== resolvedSrcRoot && iconSrc.startsWith(resolvedSrcRoot + import_path.default.sep) && import_fs.default.existsSync(iconSrc)) {
        try {
          copyFile(iconSrc, import_path.default.join(root, "icon.ico"));
        } catch {
        }
      }
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
  return { success: true, gameDir, copied };
});
function isRenpyLauncher(p) {
  const base = import_path.default.basename(p).toLowerCase();
  return base === "renpy.exe" || base === "renpy.sh" || base === "renpy";
}
function readRenpyVersion(sdkPath) {
  const candidates = [
    import_path.default.join(sdkPath, "renpy", "__init__.py"),
    import_path.default.join(sdkPath, "renpy.py")
  ];
  for (const f of candidates) {
    try {
      const text = import_fs.default.readFileSync(f, "utf-8");
      const m = text.match(/version\s*=\s*['"]([\d.]+)['"]/);
      if (m) return m[1];
    } catch {
    }
  }
  return null;
}
function findRenpySdk() {
  const bases = [];
  if (process.env.RENPY_SDK) bases.push(process.env.RENPY_SDK);
  const home = import_os.default.homedir();
  if (process.platform === "win32") {
    bases.push("C:\\Program Files\\RenPy", "C:\\RenPy", import_path.default.join(home, "renpy"), import_path.default.join(home, "RenPy"));
  } else if (process.platform === "darwin") {
    bases.push(import_path.default.join(home, "renpy"), "/Applications/RenPy", "/Applications/renpy");
  } else {
    bases.push(import_path.default.join(home, "renpy"), "/opt/renpy", "/usr/local/renpy");
  }
  try {
    const dl = import_path.default.join(home, "Downloads");
    for (const name of import_fs.default.readdirSync(dl)) {
      if (/^renpy/i.test(name)) {
        const full = import_path.default.join(dl, name);
        try {
          if (import_fs.default.statSync(full).isDirectory()) bases.push(full);
        } catch {
        }
      }
    }
  } catch {
  }
  const scan = (base) => {
    let st = null;
    try {
      st = import_fs.default.statSync(base);
    } catch {
      return null;
    }
    if (st.isFile()) return isRenpyLauncher(base) ? base : null;
    if (!st.isDirectory()) return null;
    try {
      for (const name of import_fs.default.readdirSync(base)) {
        const full = import_path.default.join(base, name);
        try {
          const s2 = import_fs.default.statSync(full);
          if (s2.isFile() && isRenpyLauncher(full)) return full;
        } catch {
        }
      }
    } catch {
    }
    try {
      for (const name of import_fs.default.readdirSync(base)) {
        const full = import_path.default.join(base, name);
        try {
          if (import_fs.default.statSync(full).isDirectory()) {
            for (const n2 of import_fs.default.readdirSync(full)) {
              if (isRenpyLauncher(import_path.default.join(full, n2))) return import_path.default.join(full, n2);
            }
          }
        } catch {
        }
      }
    } catch {
    }
    return null;
  };
  for (const b of bases) {
    const launcher = scan(b);
    if (launcher) {
      const sdkPath = import_path.default.dirname(launcher);
      return { sdkPath, launcher, version: readRenpyVersion(sdkPath) };
    }
  }
  return null;
}
function buildMinimalOptions(title) {
  const safe = title.replace(/[^\w一-龥-]/g, "_");
  return [
    "init python:",
    "    config.developer = True",
    `    build.name = "${safe}"`,
    `    config.window_title = "${title}"`,
    "    config.save_directory = None",
    ""
  ].join("\n");
}
import_electron.ipcMain.handle("renpy:detectSdk", async () => {
  const info = findRenpySdk();
  if (!info) {
    return {
      detected: false,
      hint: "\u672A\u68C0\u6D4B\u5230 Ren'Py SDK\u3002\u8BF7\u5B89\u88C5 Ren'Py\uFF08https://www.renpy.org\uFF09\u5E76\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF RENPY_SDK \u6307\u5411 SDK \u6839\u76EE\u5F55\uFF0C\u6216\u5728\u5E38\u89C1\u76EE\u5F55\u653E\u7F6E SDK\u3002"
    };
  }
  return { detected: true, sdkPath: info.sdkPath, launcher: info.launcher, version: info.version };
});
import_electron.ipcMain.handle("renpy:stageProject", async (_event, payload) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const { bundle, title } = payload;
  const safeTitle = (title || "scriptweaver_project").replace(/[^\w一-龥-]/g, "_").slice(0, 60);
  const stageRoot = import_path.default.join(import_electron.app.getPath("userData"), "renpy-staging", safeTitle);
  const gameDir = import_path.default.join(stageRoot, "game");
  try {
    import_fs.default.rmSync(gameDir, { recursive: true, force: true });
  } catch {
  }
  ensureDir(import_path.default.join(gameDir, "images", "background"));
  ensureDir(import_path.default.join(gameDir, "images", "sprite"));
  ensureDir(import_path.default.join(gameDir, "audio"));
  try {
    import_fs.default.writeFileSync(import_path.default.join(gameDir, "script.rpy"), bundle.script ?? "", "utf-8");
    import_fs.default.writeFileSync(import_path.default.join(gameDir, "definitions.rpy"), bundle.definitions ?? "", "utf-8");
    if (bundle.transforms && bundle.transforms.trim()) {
      import_fs.default.writeFileSync(import_path.default.join(gameDir, "transforms.rpy"), bundle.transforms, "utf-8");
    }
    import_fs.default.writeFileSync(import_path.default.join(gameDir, "options.rpy"), bundle.options && bundle.options.trim() ? bundle.options : buildMinimalOptions(safeTitle), "utf-8");
    if (bundle.ui && bundle.ui.trim()) {
      import_fs.default.writeFileSync(import_path.default.join(gameDir, "ui.rpy"), bundle.ui, "utf-8");
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
  let copied = 0;
  const missing = [];
  const srcRoot = activeProjectRoot ? import_path.default.resolve(activeProjectRoot) : null;
  for (const a of bundle.assets ?? []) {
    if (!srcRoot) {
      missing.push(a.exportRelPath);
      continue;
    }
    const src = import_path.default.resolve(srcRoot, a.sourceRelativePath);
    if (src !== srcRoot && !src.startsWith(srcRoot + import_path.default.sep)) {
      missing.push(a.exportRelPath);
      continue;
    }
    if (!import_fs.default.existsSync(src)) {
      missing.push(a.exportRelPath);
      continue;
    }
    const dest = import_path.default.resolve(gameDir, a.exportRelPath);
    try {
      copyFile(src, dest);
      copied++;
    } catch {
      missing.push(a.exportRelPath);
    }
  }
  return { success: true, projectDir: stageRoot, gameDir, copied, missingCount: missing.length };
});
import_electron.ipcMain.handle(
  "renpy:runEngine",
  async (_event, payload) => {
    let info = null;
    if (payload.sdkPath) {
      const launcher = [
        import_path.default.join(payload.sdkPath, "renpy.exe"),
        import_path.default.join(payload.sdkPath, "renpy.sh"),
        import_path.default.join(payload.sdkPath, "renpy")
      ].find((p) => {
        try {
          return import_fs.default.existsSync(p);
        } catch {
          return false;
        }
      });
      if (launcher) info = { sdkPath: payload.sdkPath, launcher, version: readRenpyVersion(payload.sdkPath) };
    } else {
      info = findRenpySdk();
    }
    if (!info) {
      return {
        success: false,
        error: "\u672A\u68C0\u6D4B\u5230 Ren'Py SDK\u3002\u8BF7\u5B89\u88C5 SDK \u5E76\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF RENPY_SDK\uFF0C\u6216\u5728\u300C\u5BFC\u51FA\u8BBE\u7F6E \xB7 Ren'Py \u5F15\u64CE\u300D\u4E2D\u624B\u52A8\u6307\u5B9A\u8DEF\u5F84\u3002"
      };
    }
    const projectDir = payload.projectDir;
    if (payload.action === "run") {
      try {
        const child = (0, import_child_process.spawn)(info.launcher, [projectDir], { detached: true, stdio: "ignore", windowsHide: false });
        child.unref();
        return { success: true, action: "run", pid: child.pid, projectDir };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    if (payload.action === "lint") {
      return await new Promise(
        (resolve) => {
          let out = "";
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve({ success: false, action: "lint", error: "Lint \u6267\u884C\u8D85\u65F6\uFF0860s\uFF09\uFF0C\u8BF7\u68C0\u67E5\u5DE5\u7A0B\u662F\u5426\u53EF\u88AB Ren'Py \u6253\u5F00\u3002" });
            }
          }, 6e4);
          try {
            const child = (0, import_child_process.spawn)(info.launcher, [projectDir, "lint"], { windowsHide: false });
            child.stdout?.on("data", (d) => out += d.toString());
            child.stderr?.on("data", (d) => out += d.toString());
            child.on("error", (e) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ success: false, action: "lint", error: e.message });
              }
            });
            child.on("close", (code) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ success: code === 0, action: "lint", exitCode: code ?? -1, output: out || "(\u65E0\u8F93\u51FA)" });
              }
            });
          } catch (err) {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ success: false, action: "lint", error: err.message });
            }
          }
        }
      );
    }
    const logDir = import_path.default.join(import_electron.app.getPath("userData"), "renpy-build-logs");
    ensureDir(logDir);
    const logFile = import_path.default.join(logDir, `${import_path.default.basename(projectDir)}-${Date.now()}.log`);
    try {
      const out = import_fs.default.createWriteStream(logFile);
      const child = (0, import_child_process.spawn)(info.launcher, [projectDir, "distribute"], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: false
      });
      child.stdout?.pipe(out);
      child.stderr?.pipe(out);
      child.on("exit", () => out.end());
      child.unref();
      return {
        success: true,
        action: "build",
        started: true,
        logFile,
        distDir: import_path.default.join(projectDir, "dist"),
        projectDir
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
);
import_electron.ipcMain.handle("fs:exportWeb", async (_event, bundle) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    title: "\u9009\u62E9 Web \u5BFC\u51FA\u76EE\u5F55",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const root = result.filePaths[0];
  const tpl = getWebTemplateDir();
  if (!activeProjectRoot) return { success: false, error: "\u8BF7\u5148\u4FDD\u5B58\u9879\u76EE" };
  const srcRoot = activeProjectRoot;
  const resolvedSrcRoot = import_path.default.resolve(srcRoot);
  try {
    for (const f of ["index.html", "style.css", "player.js"]) {
      const src = import_path.default.join(tpl, f);
      if (import_fs.default.existsSync(src)) copyFile(src, import_path.default.join(root, f));
    }
    let copied = 0;
    for (const a of bundle.assetRefs ?? []) {
      const src = import_path.default.resolve(resolvedSrcRoot, a.sourceRelativePath);
      if (src !== resolvedSrcRoot && !src.startsWith(resolvedSrcRoot + import_path.default.sep)) continue;
      if (!import_fs.default.existsSync(src)) continue;
      const dest = import_path.default.resolve(root, a.exportRelPath);
      try {
        copyFile(src, dest);
        copied++;
      } catch {
      }
    }
    import_fs.default.writeFileSync(import_path.default.join(root, "game.json"), bundle.gameJson, "utf-8");
    return { success: true, outDir: root, copied };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
function getSnapshotsDir(projectId) {
  const safe = (projectId || "unsaved").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return import_path.default.join(import_electron.app.getPath("userData"), "snapshots", safe);
}
var MAX_SNAPSHOTS = 60;
import_electron.ipcMain.handle(
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
        label: payload.label || (payload.auto ? "\u81EA\u52A8\u5907\u4EFD" : "\u624B\u52A8\u5FEB\u7167"),
        lineCount: Array.isArray(parsed.draftDeltas) ? parsed.draftDeltas.length : 0,
        assetCount: Array.isArray(parsed.assets) ? parsed.assets.length : 0,
        charCount: Array.isArray(parsed.characterConfigs) ? parsed.characterConfigs.length : 0,
        sizeBytes: Buffer.byteLength(payload.projectJson, "utf-8"),
        auto: !!payload.auto,
        projectJson: payload.projectJson
      };
      import_fs.default.writeFileSync(import_path.default.join(dir, `${id}.json`), JSON.stringify(meta, null, 2), "utf-8");
      const files = import_fs.default.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: import_fs.default.statSync(import_path.default.join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
      while (files.length > MAX_SNAPSHOTS) {
        const victim = files.shift();
        import_fs.default.rmSync(import_path.default.join(dir, victim.f), { force: true });
      }
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
);
import_electron.ipcMain.handle("fs:listSnapshots", (_event, projectId) => {
  try {
    const dir = getSnapshotsDir(projectId);
    if (!import_fs.default.existsSync(dir)) return { success: true, snapshots: [] };
    const list = import_fs.default.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
      try {
        const m = JSON.parse(import_fs.default.readFileSync(import_path.default.join(dir, f), "utf-8"));
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
import_electron.ipcMain.handle("fs:restoreSnapshot", (_event, projectId, id) => {
  try {
    const dir = getSnapshotsDir(projectId);
    const fp = import_path.default.join(dir, `${id}.json`);
    if (!import_fs.default.existsSync(fp)) return { success: false, error: "\u5FEB\u7167\u4E0D\u5B58\u5728" };
    const m = JSON.parse(import_fs.default.readFileSync(fp, "utf-8"));
    return { success: true, projectJson: m.projectJson };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("fs:deleteSnapshot", (_event, projectId, id) => {
  try {
    const dir = getSnapshotsDir(projectId);
    const fp = import_path.default.join(dir, `${id}.json`);
    if (import_fs.default.existsSync(fp)) import_fs.default.rmSync(fp, { force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("fs:evictAssetCache", async (_event, relativePath) => {
  try {
    const rel = (relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return { success: false, error: "\u975E\u6CD5\u8DEF\u5F84" };
    if (!activeProjectRoot) return { success: false, error: "\u8BF7\u5148\u4FDD\u5B58\u9879\u76EE" };
    const roots = [activeProjectRoot];
    let removed = false;
    for (const root of roots) {
      const fp = import_path.default.resolve(root, rel);
      if (!fp.startsWith(import_path.default.resolve(root) + import_path.default.sep)) continue;
      if (import_fs.default.existsSync(fp)) {
        import_fs.default.rmSync(fp, { force: true });
        removed = true;
      }
    }
    return { success: true, removed };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("fs:downloadAsset", async (_event, remoteUrl, relativePath) => {
  try {
    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) {
      return { success: false, error: "\u672A\u914D\u7F6E\u6709\u6548\u7684\u4E91\u7AEF\u5730\u5740\uFF08remoteUrl\uFF09" };
    }
    if (!activeProjectRoot) return { success: false, error: "\u8BF7\u5148\u4FDD\u5B58\u9879\u76EE" };
    const rel = (relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return { success: false, error: "\u975E\u6CD5\u8DEF\u5F84" };
    const dir = import_path.default.join(activeProjectRoot, import_path.default.dirname(rel));
    ensureDir(dir);
    const dest = import_path.default.join(activeProjectRoot, rel);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12e4);
    let resp;
    try {
      resp = await fetch(remoteUrl, { signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      return { success: false, error: `\u4E0B\u8F7D\u5931\u8D25\uFF1A${e.message}` };
    }
    clearTimeout(timer);
    if (!resp.ok) return { success: false, error: `\u4E91\u7AEF\u8FD4\u56DE ${resp.status}` };
    const buf = Buffer.from(await resp.arrayBuffer());
    import_fs.default.writeFileSync(dest, buf);
    return { success: true, bytes: buf.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
import_electron.ipcMain.handle("dialog:selectDirectory", async () => {
  const { canceled, filePaths } = await import_electron.dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "\u9009\u62E9 RenPy \u5DE5\u7A0B\u76EE\u5F55"
  });
  if (canceled || filePaths.length === 0) return { cancelled: true };
  return { path: filePaths[0] };
});
import_electron.ipcMain.handle("fs:readdir", async (_event, dirPath) => {
  try {
    const files = await import_fs.default.promises.readdir(dirPath);
    return files;
  } catch {
    return [];
  }
});
import_electron.ipcMain.handle("fs:readFile", async (_event, filePath, encoding) => {
  const buf = await import_fs.default.promises.readFile(filePath);
  return buf.toString(encoding || "utf-8");
});
