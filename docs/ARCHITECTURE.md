# 架构说明（ScriptWeaver）

> 面向：新成员、架构评审、扩展开发者。读完后你应能区分"主进程做了什么、渲染进程做了什么、数据怎么流"。

## 一句话架构

Electron 31 桌面应用 = **主进程（Node）** + **渲染进程（React + Vite）**，中间靠 `ipcMain` / `ipcRenderer` 与自定义 `sw-asset://` 协议连接。

```
┌─ 主进程 electron/main.ts ────────────────┐
│ • 注册 sw-asset:// 特权协议（安全流式）      │
│ • 资产协议处理器（Range / 防穿越 / 白名单） │
│ • IPC 处理器（ai:*, app:*, fs:*）         │
│ • AI 密钥 custody（仅存 userData，渲染端看不到）│
│ • 托盘常驻、资产增量监听                    │
└───────────────┬──────────────────────────┘
        IPC / sw-asset://  │
┌───────────────┴──────────────────────────┐
│ 渲染进程 React 18 + Vite                │
│ • Zustand store = 单一数据源             │
│ • 组件（layout / ui / effects）          │
│ • core/reducer（纯函数派生 resolvedStates）│
│ • rpyExporter（纯函数 → Ren'Py）        │
└────────────────────────────────────────────┘
```

**铁律**：纯函数边界（`reducer.ts` / `rpyExporter.ts` / `aiDirector.ts` 的编排纯函数）**不 import 任何 Zustand store 或 React**，只读快照、无副作用；唯一的 I/O 边界（落盘 / 打包 / IPC）集中在末尾。

## 主进程（`electron/main.ts`）

| 职责 | 要点 |
|---|---|
| `sw-asset://` 协议 | `protocol.registerSchemesAsPrivileged`（secure + stream + `bypassCSP:false`）；handler 在 `activeProjectRoot` 与 `sessionDir` 中按相对路径查找，路径必须落在 `<root>/assets` 子树内（**防目录穿越**），扩展名须白名单（png/jpg/jpeg/webp/gif/mp3/ogg/wav/flac）。 |
| 范围请求 | 音频 `<audio>` 发 `Range`，协议回 `206` + `Content-Range`；图片走整文件流式（`Readable.toWeb`）。统一 `Cache-Control: no-cache`。 |
| 托盘 | 点窗口 X 默认仅隐藏到托盘（进程常驻），托盘「退出」才真正退出。 |
| AI 密钥 custody | 密钥仅存主进程 `userData/ai-config.json`；渲染端取配置时 `apiKey` 置空、只回 `hasApiKey`，**密钥永不进渲染进程**。 |
| 资产监听 | `fs.watch` 递归监听 `assets/`，防抖 150ms 后向渲染端发 `asset:changed`。 |

## 渲染进程：单一数据源（Zustand）

`src/stores/appStore.ts` 是**唯一真相源**。核心 state：

- `draftDeltas: LineDelta[]` —— 剧本行
- `resolvedStates: ResolvedLineState[]` —— **每个写操作在同一个 `set` 内由 `reducer.reduceLines` 派生**，无陈旧派生态
- `assets` / `characterConfigs` / `variables: GlobalVariable[]`
- `runtimeValues` —— 仅预览/调试用，不入 `.swproj`
- `projectRoot` / `selectedLineIndex` / `canvasRatio`(默认 16:9) / `theme`

关键 action（节选）：角色 / 素材 / 变量的 CRUD、`newProject` / `loadProjectData` / `setDraftDeltas`、`applyRuntimeOps`（原子应用变量操作）、`resetRuntimeValues`、撤销重做（快照 `MAX_HISTORY=50`，**从历史快照重算 `resolvedStates`**，历史里从不含派生态）。

## 核心数据模型（`src/core/types.ts`）

| 类型 | 作用 |
|---|---|
| `LineDelta` / `CharacterDelta` | 单行剧本（对话或选择支）与其角色操作 |
| `AssetItem` | 素材（background / sprite / audio），存元数据与 `relativePath`；`blobUrl` 为易失字段，不入 `.swproj` |
| `CharacterConfig` / `ExpressionRef` / `CharacterTtsPreset` | 角色、表情引用、TTS 音色预设 |
| `AudioTrackInstruction` | BGM / 环境音等常驻音轨指令（四通道隔离） |
| `MountedEffect` | 时间轴挂载的特效实例（关联「特效大本营」`EffectItem.id`） |
| `GlobalVariable` / `VariableOperation` | 全局变量声明与单行触发的变量操作（导出为 Ren'Py `$` 表达式） |
| `ChoiceItem` | 选择支行的一项（目标 `jump` 标签 + 可选 `if` 条件 + 内联变量操作） |
| `PositionSlot` | 预定义槽位（禁自由浮点坐标），角色状态引用槽位 ID |

## 工程文件格式（`.swproj`）

`src/utils/projectFile.ts` 负责序列化 / 反序列化 / 恢复：

```jsonc
{
  "version": 1,
  "draftDeltas": [ /* LineDelta[] */ ],
  "characterConfigs": [ /* CharacterConfig[] */ ],
  "assets": [ /* AssetItem[]，已剥离 blobUrl */ ],
  "variables": [ /* GlobalVariable[] */ ],
  "savedAt": "2026-07-21T..",
  "canvasRatio": { "w": 16, "h": 9 }
}
```

`restoreProjectFromJson()` 统一：写入 store → 恢复画布比例 → 落草稿 → 调 `fs:setActiveProjectRoot` 激活协议查找。

## Ren'Py 导出器（`src/utils/rpyExporter.ts`）

**纯函数内核**，三遍流水线（参照文件头注释与 `RpyNode`/`SymbolTable` 类型）：

```
读取 resolvedStates → 符号表 / 校验 → 差分发射 RpyNode[]（与文本无关的中间表示）→ 序列化
```

- 输出 `RpyBundle`：`{ script, definitions, assets: AssetRef[] }`。
- **四通道音频隔离**：bgm→music(+loop)、ambient→自定义注册通道、se→sound、voice→voice；`play` 语句引用**真实文件名**（绝不用 asset_id）。
- 规范目录：`images/background`、`images/sprite`、`audio`，保留真实扩展名。
- 唯一的 I/O 边界（落盘 / 打包）集中在末尾 `exportProjectPackage`。
- **已知边界**：导出器对 label / speaker / choice 名校验，但**调用方需保证 `GlobalVariable.name` 为合法 Ren'Py 标识符**（`^[a-z][a-z0-9_]*$`），否则会生成无法编译的 `default`。

## AI 链路（`src/utils/aiDirector.ts`）

- `streamChatCompletion` 纯函数，支持 OpenAI / DeepSeek / OpenRouter / 自定义端点。
- 看门狗：`AI_STALL_TIMEOUT_MS=30_000`（每读计时）+ `AI_REQUEST_TIMEOUT_MS=180_000`（整体）；超时经 `AbortController` 中断。
- 取消：渲染端 `ai:abort` → 主进程 `activeChat?.abort()`。
- 流式只写本地 `streamText`，提交仅在 `done` 经 `composeDeltas` 返回单一新数组 → 单一撤销记录；中断不会提交部分行。

## 构建与发布

- 开发：`npm run dev`（Vite + `vite-plugin-electron` 拉起 Electron）。
- 打包：`npm run build:win|mac|linux|all`（先 `tsc && vite build`，再 `electron-builder`）。产物含安装包 + `latest.yml` 自动更新索引。
- 测试：`npm run test`（Vitest，覆盖 `src/**/__tests__`）。

> 本文件为**解释性文档（explanation）**，只讲"为什么这样设计"。具体"怎么跑起来"见 [入门指南](GETTING_STARTED.md)，"进程间接口与导出契约"见 [IPC 与导出参考](IPC_AND_EXPORT.md)。
