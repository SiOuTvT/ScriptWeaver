# IPC 与导出参考（ScriptWeaver）

> 面向：需要对接主进程、扩展 `sw-asset://` 资产协议、或改写 Ren'Py 导出器的开发者。

## 渲染进程如何调主进程

`electron/main.ts` 通过 preload 把安全 API 暴露为 `window.electronAPI`。渲染端**永远拿不到 AI 密钥明文**——密钥只存主进程 `userData/ai-config.json`。

```ts
// 设置活动工程根目录（驱动 sw-asset:// 查找 + 资产监听）
await window.electronAPI.setActiveProjectRoot(projectRoot)

// 流式对话
window.electronAPI.onAiChunk((delta: string) => { /* 追加 */ })
window.electronAPI.onAiDone((full: string) => { /* 完成 */ })
window.electronAPI.onAiError((msg: string) => { /* 失败 */ })
await window.electronAPI.aiChat({ messages })
window.electronAPI.aiAbort() // 取消
```

## IPC 接口总览

| 通道 | 方向 | 入参 | 返回 / 事件 | 说明 |
|---|---|---|---|---|
| `ai:getConfig` | 渲染→主（handle） | — | `{ ...cfg, apiKey: "", hasApiKey: bool }` | 取配置，**密钥脱敏** |
| `ai:setConfig` | 渲染→主（handle） | `AIConfig` | `{ ok: true }` | 传空 `apiKey` 代表"保留现有密钥"，绝不覆盖 |
| `ai:chat` | 渲染→主（on） | `{ messages: ChatMessage[] }` | 流式：`ai:chunk {delta}` → `ai:done {full}`；异常：`ai:error` / `ai:aborted` | 主进程用自有密钥请求上游并回灌 chunk |
| `ai:abort` | 渲染→主（on） | — | — | 中断当前对话（`activeChat.abort()`） |
| `app:getVersion` | 渲染→主（handle） | — | `string` | `app.getVersion()` |
| `app:getPath` | 渲染→主（handle） | `name` | `string` | `app.getPath(name)` |
| `app:getSessionDir` | 渲染→主（handle） | — | `string` | 会话级资产目录 |
| `app:setNativeTheme` | 渲染→主（on） | `'dark' \| 'light'` | — | 同步系统原生主题 |
| `fs:setActiveProjectRoot` | 渲染→主（handle） | `root \| null` | `{ success: true }` | 设活动工程根，驱动协议查找 + 启动资产监听 |
| `asset:changed` | 主→渲染（事件） | `{ relativePath, type, exists }` | — | 资产文件变更（防抖 150ms 后发送） |

> 新增 IPC 时：密钥 / 文件系统等敏感能力**只放主进程**，渲染端只发指令收结果；暴露给渲染端的 API 在 preload 中显式声明。

## `sw-asset://` 资产协议

主进程注册特权协议 `sw-asset`（secure + stream + `bypassCSP:false`）。消费端统一经 `resolveAssetSrc()` 按 `relativePath` 流式解析，**二进制从不整体进内存、绝不 base64 内联**。

```
sw-asset://asset/<relativePath>      # relativePath 形如 assets/images/sprite/alice_smile.png
```

解析顺序（命中即返回）：

1. 在 `activeProjectRoot` 下查找；
2. 退一步在 `sessionDir` 下查找；
3. 兼容 `relativePath` 带或不带 `assets/` 前缀两种存储格式。

**安全约束（协议 handler 强制）**：

- **防目录穿越**：解析后路径必须仍落在 `<root>/assets` 子树内，否则跳过。
- **扩展名白名单**：`png / jpg / jpeg / webp / gif / mp3 / ogg / wav / flac`。
- **Range 支持**：`<audio>` 发 `Range` 时回 `206` + `Content-Range`（音频必需）；图片走整文件流式 `200`。
- **`Cache-Control: no-cache`**：改名 / 替换即时重读，无陈旧缓存。
- 非法 `%` 序列经 `decodeURIComponent` 容错包裹，不抛 500。

> 新增资产类型时：同时改白名单 `IMG_EXTS` / `AUDIO_EXTS`、`MIME_MAP`、与 `classifyAsset()`。

## 工程文件格式（`.swproj`）

由 `src/utils/projectFile.ts` 序列化 / 反序列化：

```jsonc
{
  "version": 1,
  "draftDeltas": [ /* LineDelta[] */ ],
  "characterConfigs": [ /* CharacterConfig[] */ ],
  "assets": [ /* AssetItem[]，已剥离 blobUrl 易失字段 */ ],
  "variables": [ /* GlobalVariable[] */ ],
  "savedAt": "2026-07-21T..",
  "canvasRatio": { "w": 16, "h": 9 }
}
```

- `serializeProject(...)` / `deserializeProject(json)` / `restoreProjectFromJson(json, root)` 为统一入口。
- 反序列化仅做基本结构校验（缺 `draftDeltas` 数组即判无效），**不**对内部字段逐行校验——加载旧版 / 部分写入 / 手改的 JSON 可能缺字段，调用方需保证结构完整（见下「导出器边界」）。

## Ren'Py 导出契约（`src/utils/rpyExporter.ts`）

**纯函数内核**，与 React / store 零耦合，可单测、可换引擎后端。三遍流水线：

```
读取 resolvedStates → 符号表 / 校验（SymbolTable）→ 差分发射 RpyNode[]（与文本无关的中间表示）→ 序列化
```

核心产出类型（均已从源码确认）：

| 类型 | 含义 |
|---|---|
| `RpyBundle` | `{ script: string, definitions: string, assets: AssetRef[] }` |
| `RpyNode` | 与文本无关的 AST 节点：`label` / `scene` / `show` / `hide` / `playMusic` / `playAmbient` / `playSound` / `voice` / `stopMusic` / `say` / `menu` / `python` / `comment` / `return` 等 |
| `SymbolTable` | Pass 1 产出，编译期权威解析器（`speakerToCharId` / `charDefs` / `bgDefs` / `audioDefs` / `slots`） |
| `ValidationError` | `{ lineId, field, value, message }` |
| `AssetRef` | `{ assetId, type, fileName, sourceRelativePath, exportRelPath }` |

导出约定：

- **四通道音频隔离**：bgm→`music`(+loop)、ambient→自定义注册通道、se→`sound`、voice→`voice`；所有 `play` 语句引用**真实文件名**，不用 `asset_id`。
- **规范目录**：`images/background`、`images/sprite`、`audio`，保留真实扩展名。
- **唯一的 I/O 边界**（落盘 / 打包）集中在末尾 `exportProjectPackage`。
- `AssetItem.blobUrl` 为易失字段，**不写入** `.swproj` / `localStorage`。

**调用方边界（必读）**：

- `GlobalVariable.name` 必须是合法 Ren'Py 标识符（小写字母开头，仅含 `[a-z0-9_]`）；导出器对 `label` / `speaker` / `choice` 名做校验，但**不替你校验变量名**——非法名会生成无法编译的 `default`。
- 加载旧工程 / 手改 JSON 缺字段时，先经 `normalizeDelta()` 规整再喂给导出器，避免 `TypeError` 导致工程打不开。
- 自定义特效走 `sw_custom_<id>` 定义；原始 `transition` 字符串路径不经同一机制，需保证用的是 Ren'Py 真实转场名。

## 错误排查

- 资产图不显示：先查 `sw-asset://` 返回——`404` 是相对路径 / 落盘不一致；`206` 缺失会导致 `<audio>` 播放无声。
- 导出 `.rpy` 编译失败：按 `ValidationError` 逐条核对 `lineId` / `field`；重点查变量名、显示名引号、台词内换行。
- AI 一直转：确认主进程已配置密钥（`hasApiKey`），超时由 30s 看门狗 + 180s 整体计时兜底。
