# Ren'Py 编译与一键导出技术方案（A 方向 · Spec 驱动论证）

> 目标：把 ScriptWeaver 当前 Zustand Store 中的「剧本流 + 时间轴色块 + 素材元数据」，结构化、可复现地编译为 **Ren'Py 引擎可直接 `launch` 拉起** 的 `.rpy` 脚本与项目资源包。
> 设计原则（与 C 方向对齐）：纯函数编译内核 + Electron 原生文件包分发；**不新增/不修改任何 Zustand action 签名**，状态机内核零侵入。

---

## 0. 现状盘点与定位（先看清家底，再论证增量）

A 方向**并非空白**。当前仓库已存在一套可用骨架，本 Spec 不是从零设计，而是「**承认现有骨架 + 修正语义缺陷 + 补上文件包分发**」。

| 现有资产 | 位置 | 状态 |
|---|---|---|
| `src/utils/rpyExporter.ts` | `exportToRpy` / `exportDefinitionsRpy` / `validateExportNames` / `resolveLookups` / `downloadRpy` | 已实现「resolvedStates 差分编译 + 校验 + 双文本下载」 |
| `src/core/positionSlots.ts` | `DEFAULT_POSITION_SLOTS`（`left/center/right`，`anchor_x/y` 归一化） | 已实现槽位 → `xalign/yalign` 映射 |
| `src/components/layout/ExportSettings.tsx` | 校验 / 导出 script / 导出 definitions / 一并导出 四个按钮 | UI 已接线，调用 `downloadRpy` |
| `electron/main.ts` + `preload.ts` | `dialog:saveProject` / `dialog:openProject`（目录选择 + `fs` 复制 + `sw-asset` 激活） | C 阶段已就绪，可直接复用其「选目录 + `fs.copyDir/copyFile` + `ensureDir`」范式 |

### 必须满足的 5 个正确性缺口（G1–G5，即本 Spec 的真正增量）

| 编号 | 问题 | 现状 | 危害 |
|---|---|---|---|
| **G1** | 音频引用用的是 `asset_id` 而非真实文件名 | `play music "asset_audio_bgm_peaceful"`、`voice "v_alice_02"`、`play sound "footsteps"` | Ren'Py `play` 按**文件路径**查找，`asset_id` 根本不是文件 → 引擎直接报错拉不起 |
| **G2** | 路径约定与 C 阶段规范化目录错位 | `definitions.rpy` 硬编码 `images/sprites/`、`images/bg/`，且扩展名写死 `.png/.jpg` | 真实素材在 `assets/images/sprite`、`assets/images/background`，格式可能是 `webp` → 路径 404 |
| **G3** | 通道语义混乱 | `ambient` 与 `se` 都映射到 `play sound`（同一 `sound` 通道） | 两者互相打断；ambient（环境音应循环常驻）被一次性 SE 顶掉 |
| **G4** | **文件包分发完全缺失** | `downloadRpy` 只是浏览器 `Blob` 下载两份 `.rpy` 文本 | 不建 `game/` 目录、不复制素材 → 用户拿到文本也跑不起来 |
| **G5** | `voice`/`se` 未纳入校验 | `validateExportNames` 只校验 `speaker`/`characters.sprite_id`/`background` | 假数据里 `voice:"v_alice_02"`、`se:["footsteps"]` 是自由字符串，导出即错，但校验放行 |

> 本 Spec 的 A-1~A-5 修 G1–G3、G5；A-6~A-9 落地 G4（文件包）；A-10 收口。

---

## 1. AST 编译器模型（对应需求点 1）

### 1.1 三遍编译流水线

编译器的输入是 **Store 已算好的派生数据**，不重新归约、不改 Store：

```
draftDeltas ─┐
resolvedStates ─┼─► [Pass 0 读取] ─► [Pass 1 符号表/校验] ─► [Pass 2 差分发射] ─► RpyNode[] ─► serialize ─► .rpy 文本
characterConfigs ─┤                                          │
assets ───────────┘                                          └─► RpyBundle(含素材清单)
```

- **Pass 0（读取）**：直接消费 `store.resolvedStates`（即 `S_i = merge(S_{i-1}, Δ_i)`，已在 `src/core/reducer.ts` 算好）。**不调用 `reduceLines`，不写 Store。**
- **Pass 1（符号表 `SymbolTable`）**：建立「id → 真实文件名/声明」的映射，并做全量校验（含 G5 的 voice/se）。
- **Pass 2（差分发射）**：逐行对比「舞台当前状态」与「本行 resolved 状态」，只发射**发生了变化的指令**（经典「数据流 → 有状态场景图」归约），得到 `RpyNode[]`。

### 1.2 符号表 `SymbolTable`（Pass 1 产出）

```ts
interface SymbolTable {
  speakerToCharId: Record<string, string>      // "Alice"/"alice" 大小写不敏感 → "alice"
  charDefs: Record<string, {                   // key=charId
    displayName: string
    dialogueColor?: string
    expressions: Map<string, AssetItem>        // exprId → 立绘 AssetItem(含 fileName)
  }>
  bgDefs: Map<string, AssetItem>               // asset_id → 背景 AssetItem
  audioDefs: Map<string, AssetItem>            // asset_id → 音频 AssetItem（含 bgm/ambient/se/voice）
  slots: Record<string, { xalign:number; yalign:number; anchor_point:string }>
  exportFileNames: Map<string, string>         // asset_id → Ren'Py 安全文件名(真实扩展名)
}
```

### 1.3 中间表示 `RpyNode`（AST 节点，文本无关 → 可测、可换引擎）

```ts
type AtClause =
  | { kind:'slot'; slotId:string }
  | { kind:'transform'; xpos:number; ypos:number; xanchor:number; yanchor:number }

type RpyNode =
  | { kind:'label';   name:string }
  | { kind:'scene';   image:string; transition?:string }            // 背景
  | { kind:'show';    charId:string; exprId:string; at:AtClause; zorder:number }  // 立绘
  | { kind:'hide';    charId:string; transition?:string }
  | { kind:'playMusic';   file:string; fadein?:number; loop:boolean }
  | { kind:'playAmbient'; file:string; fadein?:number; loop:boolean }
  | { kind:'playSound';   file:string }                              // SE 一次性
  | { kind:'voice';       file:string }
  | { kind:'stopMusic';    fadeout:number }
  | { kind:'stopAmbient' }
  | { kind:'say';   speaker?:string; text:string }                   // 普通说白/旁白
  | { kind:'comment'; text:string }
  | { kind:'return' }
```

> **为什么引入 AST 而不是直接拼字符串**：把「语义映射」与「文本序列化」解耦。未来若需导出「Web 小说 / 纯文本剧本 / 其他引擎」，只需新增一个 `serialize` 后端，Pass 2 不动。同时 `RpyNode[]` 易于单元测试（断言某一行是否发射了 `show alice smile`）。

### 1.4 Pass 2 差分算法（舞台状态机）

维护一个 `stage` 累加器（与现有 `currentBg/currentChars/currentBgm/currentAmbient` 思路一致，但类型化为 `RpyNode`）：

```
stage = { bg: string|null, chars: Map<charId, {exprId, at, zorder}>, bgm: string|null, ambient: string|null }

for each resolved state S_i (i=0..n-1):
  block = []
  if S_i.background?.asset_id !== stage.bg:
      stage.bg = S_i.background?.asset_id ?? null
      if stage.bg: block.push(scene(bgImageTag, S_i.background.transition))
  for charId in stage.chars not in S_i.characters:   // 退场
      block.push(hide(charId, transition?))
  for [charId, c] in S_i.characters:                  // 出场/更新
      prev = stage.chars.get(charId)
      if !prev || changed(prev, c):
          stage.chars.set(charId, resolveAt(c))        // 槽位或自由微调
          block.push(show(charId, c.sprite_id, at, zorder))
  if S_i.bgm?.asset_id !== stage.bgm:                 // BGM 通道
      stage.bgm = ...
      if stage.bgm: block.push(playMusic(file, fadein, loop))
      else: block.push(stopMusic(1.0))
  if S_i.ambient?.asset_id !== stage.ambient:         // 环境音专用通道
      ...同理 playAmbient / stopAmbient
  for seId in S_i.audio.se: block.push(playSound(seFile))   // 一次性，不进 stage
  if S_i.audio.voice: block.push(voice(voiceFile))          // 一次性
  block.push(say(resolvedSpeaker, escape(S_i.dialogue)))    // 旁白=无 speaker
  block.push(comment("# " + S_i.line_id))
```

---

## 2. 核心语法映射规范（对应需求点 2）

### 2.1 剧本流 → `label` / `say` / 旁白

| Store 字段 | Ren'Py 输出 | 说明 |
|---|---|---|
| `scriptLabel`（UI 输入，默认 `start`） | `label start:` | 入口，Ren'Py 从此启动 |
| `state.speaker === null` | `"{dialogue}"` | **旁白**：Ren'Py 中无角色的裸字符串即为旁白 |
| `state.speaker === 'Alice'` → 解析为 `alice` | `alice "{dialogue}"` | 说白用 `define` 出的变量名（charId），而非显示名 |
| 无法映射的 speaker | **校验失败，中止导出** | 见 G5 之外的一致性约束 |

- **转义**：`"` → `\"`；`\` → `\\`。Ren'Py 换行可用 `\{w}` 或保留 `\n`（Spec 默认原样转义，不在导出层做语义改写）。
- **旁白与说白不混用**：speaker 为 null 永远走旁白分支，确保 `Character` 不被误触发。

### 2.2 音频与图层 → `play music` / `play sound` / `voice` + 通道规划（修 G1/G3/G5）

定义 Ren'Py 四通道方案（在 `definitions.rpy` 中 `init python` 注册环境音专用通道）：

```renpy
# definitions.rpy 头部注入
init python:
    renpy.music.register_channel("ambient", "sfx", loop=True, stop_on_mute=False)
```

| Store 轨道 | 通道 | 发射语句 | loop / fade 处理 |
|---|---|---|---|
| `audio.bgm` (AudioTrackInstruction) | `music` | `play music "<file>"` | `loop` 字段 → 追加 `loop`；`fade_in_ms` → `fadein {s}` |
| `audio.bgm === "__CLEAR__"` | `music` | `stop music fadeout 1.0` | 默认 1.0s，可由 `fade_out_ms` 增强 |
| `audio.ambient` (Instruction) | `ambient`（自定义） | `play ambient "<file>"` | `loop` 常量 True（通道已 loop） |
| `audio.ambient === "__CLEAR__"` | `ambient` | `stop ambient` | — |
| `audio.se[]` (string[]) | `sound` | `play sound "<file>"` ×N | 一次性，不进继承链 |
| `audio.voice` (string) | `voice` | `voice "<file>"` | Ren'Py voice 通道自动管理 |

- **关键修正（G1/G5）**：`"<file>"` 一律取自 `SymbolTable.audioDefs.get(asset_id).fileName`（真实文件名+真实扩展名），**绝不**用 `asset_id` 字符串。`voice`/`se` 同样必须先解析为 `AssetItem` —— 因此 G5 要求把它们纳入 `validateExportNames`，无法解析即报错。
- 通道隔离（G3）：`ambient` 走独立注册通道，与 `se` 的 `sound` 通道互不打断，环境音可常驻循环。

### 2.3 舞台与画面 → `scene` / `show` / `Transform` / `zorder`（图层深浅与相对位置）

**背景**：
```renpy
scene asset_bg_street_dusk            # 背景 image 标签 = asset_id
scene asset_bg_street_night with dissolve
```
`definitions.rpy` 中声明：`image asset_bg_street_dusk = "images/background/street_dusk.jpg"`（路径对齐 C 阶段 subdir）。

**立绘（含相对位置 + 图层深浅）**：
```renpy
show alice smile at center zorder 2
show bob normal at left zorder 1
# 自由微调（pos_x/pos_y 存在时）：
show alice smile at semislotted(0.42, 0.6) zorder 2
```

- **`at` 子句生成规则**：
  - 无微调 → `at {position_slot}`（如 `left/center/right`，由 `DEFAULT_POSITION_SLOTS` 生成对应 `transform`）。
  - 有微调 → 复用通用 transform `semislotted(xpos, ypos)`（在 `definitions.rpy` 声明：
    `transform semislotted(xpos, ypos): xpos xpos ypos ypos xanchor 0.5 yanchor 1.0`），调用即 `at semislotted(0.42, 0.6)`。
- **图层深浅（zorder）**：依据水平位置排序，越靠右/越靠前 zorder 越高，确保立绘重叠时的前后遮挡正确：
  ```
  zorder = slot 排名(left=1, center=2, right=3)；自由微调时按 xpos 升序排名
  ```
- **`anchor_point`**：`bottom` → `yanchor 1.0`（立绘底部对齐地面线，标准 VN 行为）；`center` → `yanchor 0.5`。
- **过渡映射表**（消除 `with` 非法值）：`fade→fade`、`dissolve→dissolve`、其余未知/None→省略 `with`。

---

## 3. 文件包整体导出（对应需求点 3，落地 G4，最大增量）

### 3.1 目标目录结构（直接对齐 C 阶段规范化 subdir）

```
<ExportRoot>/                         ← 用户选择的导出目录
└── game/                             ← Ren'Py 直接识别的根
    ├── script.rpy                    ← Pass 2 文本
    ├── definitions.rpy               ← 角色/image/transform/通道注册
    ├── images/
    │   ├── background/  street_dusk.jpg  night_sky.webp ...
    │   └── sprite/      alice_smile.png  bob_normal.png ...
    └── audio/
        ├── bgm_peaceful.mp3  ambient_rain.ogg  v_alice_02.ogg ...
```

> 妙处：C 阶段把磁盘资产统一到 `assets/images/background`、`assets/images/sprite`、`assets/audio`；导出时**同名 subdir 直接映射** `images/background`、`images/sprite`、`audio`，零概念转换。

### 3.2 素材清单 `AssetRef` 与文件名归一化

Pass 1 同时产出 `RpyBundle.assets: AssetRef[]`：

```ts
interface AssetRef {
  assetId: string
  type: 'background' | 'sprite' | 'audio'
  fileName: string                     // 真实文件名(含扩展名)，如 street_dusk.jpg
  // 源：relativePath 相对 projectRoot；未保存时回落会话目录
  sourceRelativePath: string          // 如 "assets/images/background/street_dusk.jpg"
  exportRelPath: string               // 如 "images/background/street_dusk.jpg"
}
```

- **文件名策略**：优先用导入时已去重的 `AssetItem.fileName`（已保证项目内唯一），保留**真实扩展名**（修 G2 的 `.png/.jpg` 写死问题）。`image` 标签与磁盘文件严格一一对应，`scene/show` 引用的标签即 `asset_id`，路径即 `exportRelPath`。
- **背景标签**：`image {asset_id} = "images/background/{fileName}"`，`scene {asset_id}` 引用之。
- **立绘标签**：`image {charId} {exprId} = "images/sprite/{fileName}"`，`show {charId} {exprId}` 引用之。

### 3.3 Electron 原生分发（新增 IPC，复用 C 阶段范式）

**`electron/main.ts`** 新增（风格与 `dialog:saveProject` 一致）：

```ts
ipcMain.handle('fs:exportRenpy', async (_e, bundle: RpyBundle) => {
  if (!mainWindow) return { success:false, error:'No active window' }
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title:'选择 Ren\'Py 导出目录', properties:['openDirectory','createDirectory'],
  })
  if (canceled || !filePaths[0]) return { success:false }
  const root = filePaths[0]
  const gameDir = path.join(root, 'game')
  ensureDir(path.join(gameDir,'images','background'))
  ensureDir(path.join(gameDir,'images','sprite'))
  ensureDir(path.join(gameDir,'audio'))
  // 源根：已保存项目用 projectRoot，否则会话目录
  const srcRoot = activeProjectRoot ?? getSessionDir()
  // 复制素材
  for (const a of bundle.assets) {
    const src = path.join(srcRoot, a.sourceRelativePath)
    const dest = path.join(gameDir, a.exportRelPath)
    if (fs.existsSync(src)) copyFile(src, dest)      // copyFile = 单文件复制
  }
  // 写脚本
  fs.writeFileSync(path.join(gameDir,'script.rpy'), bundle.script, 'utf-8')
  fs.writeFileSync(path.join(gameDir,'definitions.rpy'), bundle.definitions, 'utf-8')
  return { success:true, gameDir, copied: bundle.assets.length }
})
```

**`electron/preload.ts`** 新增 `exportRenpy(bundle)` → `ipcRenderer.invoke('fs:exportRenpy', bundle)`，并同步 `ElectronAPI` 类型。

**源路径解析的安全性**（继承 C 阶段 `path.resolve` + `startsWith` 防穿越）：`srcRoot` 与 `sourceRelativePath` 拼接后必须落在 `srcRoot` 内，杜绝 `../` 逃逸。

### 3.4 Web 降级（保持现有能力）

当 `window.electronAPI?.exportRenpy` 不存在（纯浏览器预览）时，`ExportSettings` 回落到现有的 `Blob` 双文件下载（`script.rpy` + `definitions.rpy`），并提示「素材需手动放入 Ren'Py 的 game/ 目录」。Electron 模式下走 `fs:exportRenpy` 自动完成复制。

---

## 4. 不破坏内核的边界（对应需求点 4）

- **全部导出逻辑收敛在纯模块 `src/utils/rpyExporter.ts`**（可再拆 `rpyBundle.ts`，但同目录纯函数即可）。该模块：
  - **不 `import` 任何 Zustand store / React**；
  - 输入是「只读快照」（`draftDeltas`, `resolvedStates`, `characterConfigs`, `assets`, `DEFAULT_POSITION_SLOTS`）；
  - 输出是 `string` / `RpyBundle`，**无任何副作用**。
- **`ExportSettings.tsx` 的按钮处理器**只读式取数：`const { draftDeltas, resolvedStates, characterConfigs, assets } = useAppStore.getState()`，**永不调用任何 setter / action**。状态机内核零侵入。
- **零新增 action**：不新增 `addAsset/updateAsset/...` 之外的任何 Store 方法；`reducer.ts` / `positionSlots.ts` 不变。
- **校验即护栏**：`validateExportNames` 在序列化前全量拦截（含 G5 的 voice/se），失败时只弹错误、不改任何状态。
- 唯一新增的「副作用边界」在 Electron 主进程（`fs:exportRenpy`），与主渲染进程 Store 完全隔离，符合现有 C 阶段 IPC 架构。

---

## 5. 落地执行顺序（A-1 ~ A-10）

| 步骤 | 内容 | 修缺口 | 风险点 |
|---|---|---|---|
| **A-1** | `exportToRpy` 音频语句改用 `SymbolTable.audioDefs` 解析真实 `fileName`（bgm/ambient/se/voice 全部） | G1 | 假数据 voice/se 为自由串 → 先扩校验(A-5) |
| **A-2** | `definitions.rpy` 注入 `renpy.music.register_channel("ambient",...)`；bgm→`music`(+loop)、ambient→`ambient`、se→`sound`、voice→`voice` | G3 | 通道名需与 `play` 语句一致 |
| **A-3** | image/audio 路径生成对齐 C subdir（`images/background`/`images/sprite`/`audio`）+ 真实扩展名，去掉 `.png/.jpg` 写死 | G2 | 与 `scene/show` 标签严格对应 |
| **A-4** | 舞台：引入 `RpyNode[]` AST + `serialize`；`zorder` 深浅排序；`semislotted` 通用 transform 承载微调；过渡映射表 | 架构 | AST 拆分需保证与现输出等价（加单测比对） |
| **A-5** | `validateExportNames` 扩至 `voice`/`se` 资产引用校验；未知引用中止导出 | G5 | 校验文案清晰定位 `line_id` |
| **A-6** | 新增 `RpyBundle` 模型（`script`/`definitions`/`assets:AssetRef[]`），`exportToRpy` 同时产出素材清单 | G4 前置 | AssetRef 路径字段需与 A-3 一致 |
| **A-7** | `main.ts` 新增 `fs:exportRenpy`（选目录 + `ensureDir` + `copyFile` + 写文件 + 防穿越）；`preload.ts` 加 `exportRenpy` + 类型 | G4 | 源根回落 projectRoot/sessionDir |
| **A-8** | `ExportSettings` 加「一键导出项目包」按钮：组装 `RpyBundle` → `electronAPI.exportRenpy`；无 electron 时回落 Blob 双下载 | G4 | Web/Electron 双路径 |
| **A-9** | 导出后回显结果（复制文件数、game 目录路径）；失败弹错误 | 体验 | — |
| **A-10** | `npm run build` 零错误零警告；手动验证：导出 → Ren'Py `launch` 直接跑通旁白/BGM/立绘/切换 | 收口 | 用 MOCK 数据端到端 |

---

## 6. 端到端示例（基于 MOCK 数据，修正后预期输出）

**`definitions.rpy`（节选）**：
```renpy
init python:
    renpy.music.register_channel("ambient", "sfx", loop=True, stop_on_mute=False)

transform left:    xalign 0.25 yalign 1.0
transform center:  xalign 0.50 yalign 1.0
transform right:   xalign 0.75 yalign 1.0
transform semislotted(xpos, ypos):
    xpos xpos ypos ypos xanchor 0.5 yanchor 1.0

define alice = Character("Alice")
define bob   = Character("Bob")

image asset_bg_street_dusk  = "images/background/street_dusk.jpg"
image alice smile = "images/sprite/alice_smile.png"
image bob normal = "images/sprite/bob_normal.png"
```

**`script.rpy`（节选，修正后）**：
```renpy
label start:

    scene asset_bg_street_dusk
    play music "audio/bgm_peaceful.mp3" fadein 2.0 loop
    "黄昏的街道上，行人渐渐稀少。街灯一盏接一盏亮起，将石板路面染成暖黄。"
    # L1

    show alice smile at center zorder 2
    voice "audio/v_alice_02.ogg"
    alice "今天的夕阳真美啊，不是吗？"
    # L2

    scene asset_bg_street_night with dissolve
    show bob normal at left zorder 1
    play sound "audio/footsteps.ogg"
    voice "audio/v_bob_03.ogg"
    bob "是啊……不过我更喜欢夜晚的星空。"
    # L3
```

> 对比旧实现：`play music "asset_audio_bgm_peaceful"`（错）、`images/bg/`（错）、`play sound` 同时承载 ambient+se（冲突）—— 修正后全部对齐真实文件与 C 阶段目录，Ren'Py 可一键 `launch`。

---

## 7. 风险与边界声明

1. **Ren'Py 工程雏形**：导出的 `game/` 需放入一个 Ren'Py 工程（用户用 `renpy --new` 建壳，或直接把 `game/` 丢进现有工程）。Spec 不生成 `options.rpy`/`screens.rpy`（属引擎脚手架，超出范围）；若需「零依赖直接 launch」，可在 A-9 追加生成极简 `options.rpy`（一行 `define config.main_menu = False` 等）——列为可选增强。
2. **voice/se 资产管理**：当前 Store 的 `audio.voice`/`audio.se` 是 `asset_id` 字符串，须确保 UI 导入时已把它们登记为 `type:'audio'` 的 `AssetItem`，否则 A-5 校验会拦截（这是正确的 fail-fast，而非缺陷）。
3. **跨平台路径**：`exportRelPath` 统一用 `/`；`fs.copyFile` 在 win32/macOS 行为一致。
4. **大项目性能**：`copyFile` 逐资产复制，O(n) 且零内存膨胀，契合 C 阶段「不把二进制读进内存」的基调（主进程直接磁盘到磁盘）。

---

*本 Spec 在保留现有 `rpyExporter` 骨架与 `ExportSettings` 接线的基础上，明确论证了「AST 编译模型、四通道音频语义、舞台 transform/zorder、文件包 Electron 分发、纯函数边界」五大支柱，并标定 G1–G5 五处必须修正的语义缺陷，确保导出脚本 100% 可被 Ren'Py 引擎直接拉起。*
