# ScriptWeaver 全站代码诊断与隐患报告

> **角色**：首席架构师 / 高级开发工程师（全栈 · 性能 · 代码质量）
> **范围**：React 18 + Electron 31 + Zustand 4 + Ren'Py Codegen 可视化 Galgame 引擎
> **口径**：仅静态审查，**未修改任何代码**（按指令待命）
> **代码规模**：`src/` 约 23.6k 行 TS/TSX（含测试），5 个审查维度并行深读

---

## 0. 总览与整体评级

| 维度 | 评级 | 一句话结论 |
|---|---|---|
| 1. 核心逻辑 / 状态管理 | 🟡 B- | 单一数据源设计优秀，但**变量求值沙箱形同虚设**、**加载缺字段会崩** |
| 2. 资产 / 内存协议 | 🟡 B | 流式协议架构正确、零 base64 驻留，但存在**确定的 blobUrl 泄漏** |
| 3. UI/UX 布局交互 | 🟢 B+ | 历史遮挡已修复；主要痛点是**变量监视面板无法收起 + 右侧堆叠挤压舞台** |
| 4. Ren'Py 导出引擎 | 🔴 C+ | 结构（label/jump/menu/ATL）稳健，但**输入消毒缺失 → 可生成无法编译的 .rpy** |
| 5. AI 链路健壮性 | 🟢 B+ | 流式/超时/取消接线扎实，但**未冲刷残留缓冲 + 无重试/兜底 JSON** |

**总体判断**：架构地基是健康的（Store 单一数据源、流式资产协议、overlay portal 架构都对），但**"信任上游 UI 输入"的假设**在状态加载、Ren'Py 导出、变量求值三处形成了明确的崩溃/安全盲区。这些是"能跑但会在边缘炸"的典型，正是团队最需要建立的防线意识。

图例：🔴 严重/潜在 Bug（会崩或安全漏洞） · 🟡 交互/性能劣势项（脆弱、泄漏、难用） · 🟢 良好架构设计

---

## 1. 核心逻辑与状态管理（Zustand Store / Reducer）

### 🔴 严重问题 / 潜在 Bug

**1.1 `evalCondition` 沙箱逃逸 —— `src/utils/varRuntime.ts:53-73`**
安全模型注释写着"杜绝代码注入"，但实际允许字符集 `/^[\s0-9a-zA-Z_().<>!=+\-*/%&|!?:]+$/` 同时放行了 `(` 和 `=`。
```ts
// varRuntime.ts:67-69
if (!/^[\s0-9a-zA-Z_().<>!=+\-*/%&|!?:]+$/.test(js)) return true
return Boolean(new Function(`return (${js})`)())
```
变量替换（:62-66）只替换"已声明变量名"，因此 `evalCondition('localStorage.clear()')`、`document.title=1`、`JSON` 任意调用都会**真正执行**——`try/catch`（:70）只吞异常不挡副作用。测试 `varRuntime.test.ts:76-77` 通过只是因为 `'` 不在白名单里，是**假阳性信心**。
> 影响：单机本地编辑器实际危害有限，但一旦接入 AI 生成的条件表达式或复制粘贴内容即变为真实 RCE 面。必须改用 AST 解析或受限标识符求值。

**1.2 `reducer.applyDelta` 加载缺 `audio` 字段直接崩 —— `src/core/reducer.ts:89-93`**
```ts
const bgm = resolveTrack(delta.audio.bgm, prev?.audio.bgm ?? null)  // delta.audio 可能为 undefined
```
`loadProjectData`（`appStore.ts:397-399`）对未校验的 `.swproj` 直接 `reduceLines(data.deltas)`。旧版本/部分写入/手改的 JSON 缺 `audio` 即抛 `TypeError`，**项目打不开**。同样，`CharacterDelta` 缺必需字段会被盲目拷贝（:67-77）。缺加载期校验。

### 🟡 劣势 / 风险项

- **1.3 非原子 `_pushHistory()` + 数据 `set`**：每个 mutator 先 `_pushHistory()`（一次 `set`）再数据 `set`（如 `updateDeltaAt:422→426`、`deleteCharacter:230→253`、undo `:605-640`）。同步内两次通知，外部事件外会短暂出现"历史已涨、数据未变"的中间态。建议把历史压入合并进同一个数据 `set` 的 updater 内。
- **1.4 `variables` ↔ `runtimeValues` 失同步**：`addVariable`（`:344`）不播种 `runtimeValues`；`loadProjectData`（`:396-408`）**完全不重置** `runtimeValues`（沿用上一工程的 `{}`）。声明变量直到 `resetRuntimeValues`（`:365`）才有运行时值 → 求值读到 `undefined` 静默当 `null/0`。两个相关切片可发散。
- **1.5 拼错的变量名静默默认**：`applyOp`（:23/:29/:32）遇未知 `varName` 从 0 起算；`evalCondition`（:64）未命中→`'null'`。无"是否声明过"校验；类型也不守（`add`/`subtract` 对布尔 var 走 `Number(false||0)`（:29），`toggle` 对数字→`!5=false`（:35））。
- **1.6 `findLabelIndex` 缺 label 返回 `-1`**（:76-79）：播放器 jump 必须自行 guard，否则用 `-1` 索引。
- **1.7 空 `choice` 行可构造**：`setLineType`（:447-451）用 `prev.choices ?? []`，0 选项的 `choice` 行在 store 合法、导出器可能不认。软有效性缺口。
- **1.8 性能微项**：`deleteCharacter` 在 `map` 内调 `get()`（:237）→ O(N·M)；`newProject` 先 `_pushHistory()` 再清空（:374→388）浪费一次快照。无害。
- **1.9 渲染循环**：store 本身无；提示组件侧——`resolvedStates` 每次变更是新数组，`useAppStore(s=>s.resolvedStates)` 会每次重渲；用 `getResolvedState(i)` 取单条才是引用稳定。对象/数组 selector 需用 `shallow`。

### 🟢 良好设计

- `resolvedStates` 在**每一个**写操作同一个 `set` 内由 `draftDeltas` 派生（十余处一致）→ 单一数据源，无陈旧派生态。
- 无任何 stale closure：action 全部走 `get()/set()`；store 方法注册一次但从不捕获旧 state。
- undo/redo 由快照 `snap.draftDeltas` **重算** `resolvedStates`（:633/:656），历史里从不存派生态。
- 快照用 `structuredClone`（:605-613 等）→ 隔离后续 mutation，无共享引用腐化。
- `selectedLineIndex` 在 `deleteDeltaAt`/`moveDelta` 原子 clamp。
- `deleteAsset` 先查引用（:277-290）作 store 层防御。
- 全审查文件**零 `any` 强转、零 `!` 非空断言**。

---

## 2. 资产与内存协议（sw-asset://）

### 🔴 严重问题 / 潜在 Bug

**2.1 `blobUrl` 对象 URL 永不释放（确定泄漏） —— 创建 `AssetManager.tsx:301` / `CharacterManager.tsx:271` / `SceneNavPanel.tsx:117`；释放缺失 `appStore.ts:331-332`**
```ts
// appStore.ts:331-332 deleteAsset 内
set((s) => ({
  assets: s.assets.filter((a) => a.id !== id),   // 从未 URL.revokeObjectURL(a.blobUrl)
  ...
}))
```
Web/浏览器降级模式下每导入一张图就泄漏一个 blob 句柄，**整个会话累积**，直到页面重载才释放。修复：在 `deleteAsset` 及 app 卸载路径对 `a.blobUrl` 执行 `revokeObjectURL`。

### 🟡 劣势 / 风险项

- **2.2 `resolveAssetSrc` 无缓存**：每帧对每个立绘重拼字符串（`StagePreview.tsx:1371-1387`）。纯字符串、开销可忽略，但立绘量级大时属 O(chars) 重复计算；对象未 memo。
- **2.3 `useImageLoaded` Image 清理不彻底**（`StagePreview.tsx:176-194`）：`url` 变化 `new Image()`，cleanup 仅 `active=false`（:189-191），未 `img.src=''`/置空 `onload`。局部变量会被 GC，实际无泄漏，但不够严谨。
- **2.4 主进程 Range 整段读入内存**（`electron/main.ts:342`）：`fs.readFileSync(abs, {start, end})` 把切片读进 Buffer。仅切片、边界 `+1` 正确（:340-341），可接受；超长音频 seek 受切片尺寸约束。
- **2.5 会话级 blob 资产不可持久**（`projectFile.ts:10-12` `stripVolatile` 剥离 `blobUrl`）：`relativePath:''` 的本地资产仅当次会话有效，刷新即失效。UX/正确性提示，非内存问题。
- **2.6 主进程每请求 `console.log`**（`main.ts:298,343,358,364`）：开发期刷屏，非泄漏。

### 🟢 良好设计

- **全站消费者均经 `resolveAssetSrc()` 流式解析，无 base64 内联**：`StagePreview`(img 而非 CSS bg，规避 Electron 协议不渲染 background-image 的坑)、`AssetManager`、`CharacterManager`、`SceneNavPanel`、`EffectsLab`、`audioManager`、`tts`；全 src 无 `data:image/audio`、无 base64 资产字节。
- **资产字节从不进 store**：store 仅存元数据（id/type/name/relativePath/blobUrl/duration/color）；序列化 `stripVolatile` 剥离 `blobUrl` → `.swproj` 与 localStorage 均无 base64。
- **主进程协议卫生好**：整文件走 `fs.createReadStream` 流式（:357，流结束自动关 fd）；防目录穿越（:315）、扩展名白名单（:317）；`decodeURIComponent` 包 try（:292-296）非法 `%` 不抛 500。
- **缺失/改名资产优雅降级不崩**：`resolveAssetSrc` 在 `!asset/!relativePath` 返 undefined（:14/:22）；协议返 404（:365）；消费端降为渐变色块 + `onError` 标记；`audioManager` 警告返 false。
- **`Cache-Control: no-cache`**（:351/:360）：改名/替换即时重读，无陈旧缓存、无替换竞态。
- **定时器/监听器清理到位**：StagePreview 的 keydown 移除、ResizeObserver.disconnect、自动播放定时器清空、拖拽 mousemove/up 移除；`audioManager` 一次性音频 ended/error 即清理、常驻 bgm/ambient 复用不重建；`assetSync.bindAssetWatcher` 经 `_bound` 幂等。

---

## 3. UI / UX 布局与交互体验

### 🔴 严重问题 / 潜在 Bug

**无。** 历史上遮挡操作区的悬浮"变量监视器"已迁移为 dock（`VariableDebugger.tsx:1296` 注释 + `AppLayout.tsx:443-445` `<VariableDebugger embedded />`），`AIPanel` 为整页视图、`EffectMountPanel` 内嵌舞台 aside，当前**无活动悬浮窗遮挡舞台/工具栏**。

### 🟡 劣势 / 风险项

- **3.1 `变量监视` Dock 永远收不成 rail（常驻 288px） —— `AppLayout.tsx:443` + `Dock.tsx:42-92`**：传了 `showHeader={false}`，而 `Dock` 的"收成细条"按钮只在 header 内渲染 → `open` 恒为 `true`，即便折叠内层内容也是 288px 面板。其他 Dock 都能收成 44px。**最高优先修复项**。
- **3.2 右侧面板堆叠挤压舞台、无 min-width 兜底**：选中 choice 行时右侧三 Dock 堆叠 = 剧本流(248) + 变量监视(288) + 选择支(320) = 856px；再叠加选中立绘/背景时舞台内两个 `w-52`(208px) aside（`StagePreview.tsx:1668,1821`）+ 左侧 ~440px → 在 1280–1440px 窗口舞台可压到 <150px。靠 letterbox 不破版但画布近乎不可用。**缺 `min-width` 地板**。
- **3.3 残留浮动遮挡死代码**（`VariableDebugger.tsx:43`）：非 embedded 分支是 `absolute right-3 top-14 z-50`，一旦被非 embedded 渲染即盖住舞台右上工具栏/音频指示（`StagePreview.tsx:1525-1555`）。当前未用但有风险。
- **3.4 z-index 散落魔法数**：grain `z-1`、header `z-10`、VD浮动 `z-50`、Timeline 预览 `z-50`、舞台 overlay `z-40`、toast `z-[100]`、Collab/Version `z-[90]`、Dialog `z-[200]`、Tooltip `z-[300]`。当前不撞，但 **Tooltip(`z-[300]`) 浮在 Dialog(`z-[200]`) 之上**、toast(`z-[100]`) 浮在 modal(`z-[90]`) 之上；缺统一刻度。
- **3.5 响应式靠滚动不靠 reflow**：Dock 宽硬编码 px（264/248/288/320）+ `w-44` 侧栏，舞台无 min-width；<1400px 即拥挤；顶部工具栏窄屏不收按钮（仅 eyebrow `<sm>` 隐藏），6 个文字按钮 + 主题切换极小窗会溢出。`EffectsLab`/`AIPanel` 用了 `lg:` 断点，降级不一。
- **3.6 模态焦点管理缺口**（`Dialog.tsx:36-76`）：有 `role/aria-modal`、Esc/遮罩关闭，但**打开时焦点未移入、无 focus trap**，键盘用户会 tab 到背景。
- **3.7 双向箭头键双绑定**：`StagePreview.tsx:264-283`（行导航）与 `Timeline.tsx:942-957`（span 微调）都在 `window` 绑 `←/→`，span 选中且焦点在输入外时两者同发。低影响。

### 🟢 良好设计

- **收拉体验强**：LeftSidebar(`w-44`↔`w-12`)、各 header Dock(→44px rail)、底部 Timeline(320↔38px)、ScriptDrawer pin/open；舞台对话 overlay 可按钮收起。
- **对比度体系刻意合规**：fg ~15:1(亮)/~13:1(暗)、`fg-faint` ~4.5:1（`index.css:28-31,79-82`）→ WCAG AA 达标。
- **overlay 架构正确**：Dialog/Tooltip 经 `createPortal` 到 `body`（:47）避免堆叠上下文裁剪；toast `pointer-events-none` 且瞬态。
- **滚动容器嵌套合理**：每个滚动区都有 `min-h-0 flex-1` 祖先（`Dock.tsx:93`、`ScriptDrawer.tsx:28`），flex 子项滚动而非溢出视口。
- **舞台 canvas 稳健**：aspect-ratio letterbox + `ResizeObserver` 保证不裁切；立绘 `w-max` 修复（:1417-1424）防"右移变小"bug。

---

## 4. Ren'Py 导出引擎（rpyExporter / Codegen）

> 核对基准：Ren'Py 官方文档 `renpy.org/doc/html/transitions.html`（2026-07-21 复核）。

### 🔴 严重问题 / 潜在 Bug（生成无法编译/运行的 .rpy）

**4.1 变量名未消毒 → 非法 `default`/`$` → SyntaxError —— `rpyExporter.ts:336`（`varOpExpr`）、`:1178`（`default ${v.name}`）；`validateExportNames`（:532-668）校验 label/speaker/choice 但**从不校验 `GlobalVariable.name`**
场景：变量名 `1score`、`my var`（含空格）、或 Python 关键字 `for` → 生成 `default 1score = 0` 与 `$ 1score += 1` → Python `SyntaxError` → `definitions.rpy` 加载失败。中文名（如 `好感度`）其实是合法 Py3 标识符**能编译**，所以此坑特指"数字开头/空格/关键字"。

**4.2 `displayName`/`dialogueColor` 未转义进 `define` —— `rpyExporter.ts:1168-1169`**
```python
define ${char.charId} = Character("${char.displayName}"${colorArg})
```
`displayName: 'Al"ice'` → `define alice = Character("Al"ice", ...)` → 字符串字面量断裂 → SyntaxError。`dialogueColor` 同理未转义（`colorArg` :1168）。

**4.3 `escapeDialogue` 漏转义字面换行 —— `rpyExporter.ts:108-110`**
```ts
function escapeDialogue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')   // 未处理 \n
}
```
含真实换行符的台词 → 多行 `"..."` 字面量（say :1030、menu :1041/:1044）→ `SyntaxError: EOL while scanning string literal`。

**4.4 `BUILTIN_TRANSITIONS` 白名单含**非法/错误**名 —— `rpyExporter.ts:118-130`**
经官方文档核对：
- **非法名（Ren'Py 无此 transition，发射 `with X` 必 NameError）**：`glitter`、`squeezeleft/right/up/down`（共4）、`facin`、`facout`。
- **方向后缀错误（应为 `top/bottom`，不是 `up/down`）**：`moveinup`→`moveintop`、`moveindown`→`moveinbottom`、`moveoutup`→`moveouttop`、`moveoutdown`→`moveoutbottom`、`easeinup`→`easeintop`、`easeindown`→`easeinbottom`、`easeoutup`→`easeouttop`、`easeoutdown`→`easeoutbottom`。
- **复核更正**：`flash`、`vpunch`、`hpunch` 是**真实**内置 transition（子审查一度误判，已纠正），可保留。
- **缺失的真实名**（选了会被当 custom 生成 def，可能覆盖/冗余）：`squares`、`slideaway*`、`zoomin/out/zoominout`、`moveintop/bottom`、`moveouttop/bottom`、`easeintop/bottom`、`easeouttop/bottom`。

`resolveTransition`（:151-158）命中白名单即原样发射 `with X` 且**不生成定义** → 上述非法/错名一旦被选用即运行时 `NameError`。注意：挂载特效路径正确经 `sw_custom_*` 生成 def，但**原始 transition 字符串路径未走同一机制**，行为不一致。

### 🟡 劣势 / 风险项

- **4.5 menu `condition` 原样发射**（:1043）：`"${text}" if ${ch.condition}:` —— 条件含 `"`（如 `name == "bob"`）会提前闭合选项串 → SyntaxError；引用未声明变量（如 `score >= 5` 无 `default score`）编译过但运行时 NameError。均未被校验。
- **4.6 `charId` 导出未校验**：`define`(:1169)/`show`(:997)/`hide`(:1002)/`image`(:1194)/`say`(:1030) 信任 types 声称的 `^[a-z][a-z0-9_]*$`，坏 `charId`（`1alice`、`my char`）即非法 `define`/`show`，仅靠上游 UI 守。
- **4.7 未匹配说话人回退原始串**（:934）：raw `exportToRpy` 跳过校验时 `Alice Smith "text"` 断裂。
- **4.8 `sanitizeIdent` 冲突**（:133）：`"my push"` 与 `"mypush"` 映射到同一 id → 一个 transform def 被复用，动画可能错，但仍编译。
- **4.9 空 choice 仅 package 路径保护**：`validateExportNames` 抓 `choices.length===0` 且 `exportToRpy` 空时跳过 menu（:924），但 raw `exportToRpy` 直调无护栏。

### 🟢 良好设计

- **label/jump 校验健全**：正则 + 唯一性 + `start` 保留（:540/:647）；jump 目标对照 `definedLabels`，悬空 jump 安全降级为 `# 注释 + return`（:1047-1054）；分段以 `return` 收尾防 fall-through（:773/:954）。
- **menu 缩进/引用正确**：4/8/12 空格嵌套、caption + `pass` 占位（:1036-1061）。
- **挂载特效 → `sw_custom_<id>` defs**（`exportTransformsRpy` :409）：ATL 体参数名匹配 `def` 签名（:352-406），`repeat:` 子块缩进正确（:436），数值经 `num()` + `?? p.def` 兜底（:226）。
- **转义顺序正确**：先反斜杠后引号。
- **边界处理稳**：空台词→`""`、缺特效参数→默认、`show layer master:` matrixcolor 缩进正确（:1003-1007）、音频路径带引号（:1009-1023）、文件恒以 `return` 收尾。

---

## 5. AI 链路与健壮性

> 架构注：生产桌面路径 `AIPanel.generate()` → `api.aiChat` → 主进程 `ipcMain.on('ai:chat')`（`main.ts:480-506`）复用 `streamChatCompletion`（:489），故 `aiDirector.ts` 的 180s/30s 超时**对真实使用生效**；`webExporter`/`cloudSync` 不做 AI/fetch；`tts` 为 IPC 薄封装。

### 🔴 严重问题 / 潜在 Bug

**无**（无确认崩溃/丢数据/挂起；单事务模型被尊重，见 🟢）。

### 🟡 劣势 / 风险项

- **5.1 `cleanup()` 死代码 → 180s 定时器泄漏 —— `aiDirector.ts:846-849`**：定义 `cleanup()` 清 `overall` 定时器并移除 abort 监听，但**全文件无调用点、无 `finally`**。每次请求遗留 180s `overall` 定时器（fetch 已结束后自动 no-op，非挂起，但每请求泄漏一个 + `once:true` 仅缓解外部 abort 监听）。修复：在 `finally` 调 `cleanup()`。
- **5.2 无重试 / backoff / 429 处理**：全 src 无 `retry`/`backoff`。`classifyHttpError`（:749-750）仅**文案**分级 429/5xx，首次失败即把流丢给用户，无指数退避、无 `Retry-After` 处理。
- **5.3 `parseDirective` 不容忍尾逗号/部分恢复**（:208-227）：剥离 ```json 围栏 ✅、找最外 `{…}` ✅，但 `JSON.parse`（:218）**不容忍尾逗号**、**无截断输出恢复** → 流被截断/畸形即整份蓝图丢失报错（上层 AIPanel 捕获不崩，但全量数据丢失）。"恢复部分输出"诉求未满足。
- **5.4 未冲刷残留 SSE buffer**（:881-903）：`done` 时 `break` 未 flush 残留 `buffer`；末行 `data:` 无尾部 `\n` 即被静默丢弃（罕见，OpenAI 发 `[DONE]\n`）；流末多字节字符 `decoder.decode()` 未 flush。
- **5.5 主进程无并发守卫**（`main.ts:480-510`）：模块级 `activeChat` 被无检查覆盖。第二个 `ai:chat` IPC 启动并行流，第一个成孤儿继续 `event.sender.send`。渲染端靠禁用按钮（:610）+ `removeAiListeners()`（:306）缓解，director 模式有 `committedRef`（:191）防双提交，但 blueprint 模式 `finish`（:144）无同款守卫（仅无害覆盖）。

### 🟢 良好设计

- **流式核心正确**：`fetch` + `ReadableStreamDefaultReader`（:876）、`TextDecoder({stream:true})`（:884）、`buffer.split('\n')` + pop-back（:885-886）正确重组跨块 SSE 行；`done` 终止（:883）；逐块 `JSON.parse` 失败均被吞（无未捕获 parse）。
- **断流看门狗实现到位且启用**：`AI_STALL_TIMEOUT_MS=30_000`（:772）经 `readChunk` 每读计时（:786-792）≥30s 静默即 abort+reject；`AI_REQUEST_TIMEOUT_MS=180_000`（:770）经 `overall`（:841）。两者汇入 `timedOut` → `AIRequestError('timeout')`（:906-912）。每次循环重置 30s 计时 → 心跳有效。
- **错误捕获分级**：非 200 → `classifyHttpError`（401/403/404/429/5xx）（:863-866/:742-754）；`TypeError`→`network`（:916-922）；`AbortError` 透传供取消处理（:915）；用户可见 `error` 态渲染（AIPanel.tsx:544-548）。
- **取消完全接线**：Cancel → `api.aiAbort`（:335-343）→ `activeChat?.abort()`（main.ts:508-510）→ abort fetch；渲染端取消时隐藏 error（:327-328）；reader 被 abort 不泄漏。
- **状态一致性安全**：流式**只写本地 `streamText`**（AIPanel.tsx:97），从不写 store；唯一 `setDraftDeltas` 提交在 `done` 经 `composeDeltas` 返回单一新数组（:193/:234）→ 单一 undo 记录。**中断不会提交部分/重复行**（abort/error 路径从不调 `finish`）。

---

## 6. 跨维度共识 & 优先修复清单

**共同根因**：多处"信任上游 UI 输入 / 信任外部文件结构"的假设，缺少**边界校验层**。这是团队最该建立的工程纪律——导出器、加载器、求值器都应在边界做"消毒 + 校验 + 降级"，而非把正确性押在 UI 不会传错。

### 建议的修复优先级（按"用户必炸 → 体验硬伤 → 健壮性"排序）

| 序 | 问题 | 维度 | 严重度 | 修复方向（概要） |
|---|---|---|---|---|
| P0 | 变量名未消毒致 Ren'Py 编译失败 (4.1) | 4 | 🔴 | `validateExportNames` 增加 `GlobalVariable.name` 标识符校验；导出用 `sanitizeIdent` |
| P0 | `displayName`/换行未转义致 .rpy 断裂 (4.2/4.3) | 4 | 🔴 | `define` 用转义函数；`escapeDialogue` 增加 `\n`→`\n`（Ren'Py 用 `\\n` 或拆行） |
| P0 | `BUILTIN_TRANSITIONS` 非法/错名 (4.4) | 4 | 🔴 | 按官方文档修正白名单（删 glitter/squeeze*/facin/facout，up→top/bottom） |
| P0 | `evalCondition` 沙箱逃逸 (1.1) | 1 | 🔴 | 改 AST/受限标识符求值，禁 `(` 紧跟标识符与 `=` |
| P0 | 加载缺 `audio` 崩 (1.2) | 1 | 🔴 | `loadProjectData` 加载期对 `LineDelta` 做 normalize/校验 |
| P1 | `blobUrl` 泄漏 (2.1) | 2 | 🔴 | `deleteAsset` + 卸载路径 `revokeObjectURL(a.blobUrl)` |
| P1 | 变量监视 Dock 无法收起 (3.1) | 3 | 🟡 | 保留 header 或加 rail 切换 |
| P1 | 右侧堆叠挤压舞台 (3.2) | 3 | 🟡 | 舞台 `min-width` 地板 + 面板互斥/折叠策略 |
| P1 | AI 残留缓冲未冲刷 + 无 JSON 兜底 (5.3/5.4) | 5 | 🟡 | 流末 flush；`parseDirective` 容忍尾逗号/截断恢复 |
| P2 | 历史非原子 / runtimeValues 失同步 (1.3/1.4) | 1 | 🟡 | 合并 history 入数据 set；声明/加载时播种 runtimeValues |
| P2 | `cleanup()` 死代码 (5.1) | 5 | 🟡 | `finally` 调用 `cleanup()`；加指数退避/429 处理 |
| P2 | 模态焦点管理 (3.6) / z-index 刻度 (3.4) | 3 | 🟡 | focus trap；统一 z 刻度常量 |

### 给团队的能力提升建议（基于本次体检）
1. **边界即契约**：所有"文件/AI/用户输入 → 内部状态/外部代码"的入口必须有一层校验与降级（这是本次 🔴 的共性）。
2. **导出器/代码生成器必须有"语法正确性"单测**：建议把 `rpyExporter.test.ts` 增补"非法变量名/特殊字符台词/所有 transition 名"用例，并用 Ren'Py 实际 `compile` 做端到端校验（CI 跑 headless renpy）。
3. **危险 API 审查清单**：`new Function` / `eval` / `URL.createObjectURL` / `fs.readFileSync` 列入团队 code review 必查项。
4. **单一数据源纪律已做得好**，保持；把"派生态不入历史/引用稳定 selector"写成规范。

---

**下一步**：以上为纯体检，未改动任何代码。请确认你想从哪个 P0 开始，或希望我直接给出某一项的**最小修复 PR 草案**（仍停留在方案层，等你拍板再落地）。
