# AI 智能剧本助手与自动打点技术方案（B 方向 · Spec 驱动论证）

> 项目现状：A（Ren'Py 导出）与 C（资产闭环 / `sw-asset://` 协议）已全量落地，`npm run build` 零错误零警告。
> 本方向目标：让 AI 既能当"文学导师"润色扩写，又能当"舞台监督"以结构化元数据自动在时间轴上排戏（自动打点）。
> 核心约束（与 A/C 一致）：**不破坏 Zustand 状态机内核**——零个既有 action 签名被修改，导出/AI 逻辑全部收敛于纯函数模块。

---

## 0. 现状评估（让方案长在真实骨架上，而非空中楼阁）

先做一次"资产盘点"，确认我们要在哪块地基上施工：

| 既有能力 | 位置 | 对 B 方向的启示 |
|---|---|---|
| `AIConfig` 持久化（endpoint / apiKey / model） | `AIPanel.tsx:7-25` `localStorage['scriptweaver_ai_config']` | 密钥已独立于 Zustand，B 方向沿用并**强化**（迁出渲染进程） |
| 基础生成流程 | `AIPanel.tsx:83-151` | 已能 `fetch` → 解析 JSON 数组 → `insertDeltaAt` 逐行插入 |
| `LineDelta.ai_meta?` 字段 | `types.ts:163-168` | **已预留** `confidence / needs_review / source_text_span`，正是自动打点的天然元数据落点 |
| 资产库 `assets: AssetItem[]` | `types.ts:26-49` | C 阶段规范化的 `assets/images/background\|sprite`、`assets/audio` 目录，是打点解析器的"素材字典" |
| 既有 action：`setDraftDeltas` / `batchUpdateDeltas` / `insertDeltaAt` | `appStore.ts:323,360,373` | 每个 action 内部都会 `_pushHistory()` → 流式逐 token 提交会**炸穿撤销栈** |
| A 方向 `resolveLookups` / `validateExportNames` | `rpyExporter.ts` | 可复用于校验 AI 生成的 `audio.asset_id` 引用合法性 |

**最大现实约束（贯穿全文的设计红线）**：现有 6 个既有 action 的签名一个都不能改。尤其 `setDraftDeltas` 是唯一一个"**一次性替换全部 deltas 且只压一次历史**"的入口——这恰好是 B 方向避免 Undo/Redo 爆炸的"逃生舱口"。

**结论**：B 方向不是从零写，而是"**承认骨架 + 修正 3 处架构性缺口 + 补齐打点解析器与流式事务**"：
- 缺口 G1：现有 Prompt 单一、输出格式脆弱（仅靠正则 `\[[\s\S]*\]` 抓数组），无"导师/监督"双角色，无语义标签。
- 缺口 G2：生成结果直接 `insertDeltaAt` 逐行插入 → 一次生成 10 行就压 10 条历史；且无法做"自动打点"（音效/环境音/voice 挂载）。
- 缺口 G3：API Key 停留在渲染进程 `localStorage`，Electron 下可被 renderer 任意读取，安全等级不足。

---

## 1. AIPanel 多模态提示词工程（Prompt Engineering）

### 1.1 双角色路由：一个 System Prompt，两种 Persona

核心洞察：**让模型做"语义理解"，把"资产绑定"留给本地纯函数**。模型不应猜测本地素材库的 `asset_id`（它根本不知道你有哪些雨声文件），而应输出**语义标签**（如 `{"environment":["rain","storm"]}`），由本地的 `resolveDirectiveToDelta` 解析器把标签映射到真实 `asset_id`。这正是"LLM 负责懂戏，本地代码负责懂库"的优雅分工。

`mode` 由 UI 上的一个分段控件决定，注入到 System Prompt 的不同段落：

- `mode: "mentor"`（文学导师）：润色台词、扩写大纲、改写语气。输出**人类可读文本**（可附带轻量 `{"suggestions":[...]}` 结构化建议，但不强制机器解析）。
- `mode: "director"`（舞台监督）：把选中文本/剧情需求编译成时间轴元数据。输出**严格 DSL JSON**，字段与 `LineDelta` 一一对齐。

### 1.2 舞台监督模式（director）的 DSL Schema

模型必须只返回如下 JSON（不夹带任何解释文字，便于本地 `JSON.parse`）：

```jsonc
{
  "lines": [
    {
      "speaker": "alice",            // charId 或 displayName；null = 旁白
      "dialogue": "天上下起了瓢泼大雨……",
      "background": { "tag": "school", "transition": "dissolve" },  // 语义 tag，非 asset_id
      "characters": {
        "alice": { "sprite_id": "sad", "position_slot": "left", "action": "show" }
      },
      // ★ 核心：语义标签，由本地解析器绑定到真实素材
      "tags": {
        "emotion": ["despair", "cry"],
        "environment": ["rain", "storm"],
        "sfx": ["thunder", "footsteps"],
        "bgm": ["tense"]
      },
      "confidence": 0.82
    }
  ]
}
```

设计要点：
1. **`tags` 是打点的唯一真相源**。模型输出语义标签，绝不输出 `asset_id`——避免"猜错素材 ID 导致 Ren'Py 拉起即报错"（即 A 方向 G1 的同源问题）。
2. **`confidence` 由模型自评**（0–1），直接落入 `ai_meta.confidence`，驱动"待复核"标记。
3. `background` / `characters` 用 `tag` / `sprite_id` / `position_slot` 等**语义键**，本地解析器再查 `assets` / `characterConfigs` 完成绑定，与 A 方向 `resolveLookups` 的符号表思路一脉相承。

### 1.3 文学导师模式（mentor）的约束

- 保留创造力，但要求返回结构：先给 `rewritten`（改写全文），再给 `notes`（3 条以内修改理由）。
- 导师模式**不触碰时间轴**，只在 AIPanel 内预览，用户手动"采纳"才走 commit 流程（见 §3）。

### 1.4 System Prompt 骨架（伪代码）

```
 SYSTEM = 你是 ScriptWeaver 的剧本副导演。
 [公共规则] 你服务于视觉小说（Ren'Py）创作；中文优先；不杜撰用户未提供的角色。
 [导师模式] 当 mode=mentor：润色/扩写，返回 {rewritten, notes}，不修改时间轴。
 [监督模式] 当 mode=director：严格返回 {"lines":[...]}，字段见 DSL；
           只输出 JSON，禁止 markdown 代码块包裹；tags 用语义标签而非素材ID。
 [资产上下文] 当前可用角色：{charId→displayName}；当前背景库：{name 列表}；
            当前音频库（按语义）：{environment/sfx/bgm 标签→素材名}。
            ★ 优先复用已有角色/背景/音频，仅在确无匹配时新增。
```

> 资产上下文由 `buildUserPrompt(ctx)` **本地拼装**（从 `assets` / `characterConfigs` 读取），不进 store，纯函数 `src/utils/aiDirector.ts` 负责。

---

## 2. 时间轴自动智能打点算法（核心核心）

### 2.1 总体流水线

```
AI JSON (tags)
   │  resolveDirectiveToDelta(directive, ctx)
   ▼
LineDelta + ResolutionReport
   │  ctx = { assets, characterConfigs, slots, prevState }
   ▼
composeDeltas(existing, plan, anchor)  →  最终 LineDelta[]
   │  setDraftDeltas(finalArray)  ← 一次性提交（见 §3）
   ▼
时间轴自动排戏 + 音效/环境音/voice 打点
```

### 2.2 标签 → 素材的解析器 `resolveTags(tags, assets)`

这是打点的发动机。本地维护一张**语义标签 → 素材**的索引（构建于 `assets`，O(assets) 一次）：

- 每个 `AssetItem` 匹配规则（按优先级）：
  1. 若 `AssetItem.tags?: string[]` 存在（**B 方向建议为 AssetItem 增加可选 `tags`，完全向后兼容，不破坏既有 action**），直接命中。
  2. 退化为关键词启发式：用 `name` / `fileName`（去扩展名、转小写、按 `_`/`-` 分词）匹配标签词。
  3. 仍失败 → 标记 `unresolved`，写入 `ResolutionReport`，并将该行的 `ai_meta.needs_review = true`。

> 为什么给 `AssetItem` 加可选 `tags`？因为"雨声"素材可能文件名叫 `ambient_crickets.mp3`，纯靠文件名匹配 `rain` 会漏。可选 `tags:["rain","storm","weather"]` 让绑定确定可控。**该字段为可选增量，旧 `.swproj` 无 tags 也能跑**，不触碰任何 action 签名。

### 2.3 四类打点映射（对应 §1.2 的 tags）

设某行 directive 含 `tags = {emotion:[despair,cry], environment:[rain,storm], sfx:[thunder], bgm:[tense]}`：

| 标签类别 | 解析动作 | 落到 `LineDelta.audio` | 说明 |
|---|---|---|---|
| `environment` | 取主环境（权重最高者，如 `storm`>`rain`）→ 解析为 ambient 资产 | `audio.ambient = {asset_id, volume:0.3, loop:true, fade_in_ms:1500}` | 环境音走 **ambient 通道**（复用 A 方向注册的独立 channel，不抢 BGM） |
| `sfx` | 每个 sfx 标签解析为一个 audio 资产 | `audio.se = [seId1, seId2, ...]` | 一次性挂载多个音效打点（如雷声+脚步） |
| `bgm` | 解析为 bgm 资产 | `audio.bgm = {asset_id, volume:0.6, loop:true}` | 覆盖式设置，遵循 `TrackValue` 规范 |
| `emotion` + 有说话人 | 若说话角色配置了 voice 资产，则挂载 | `audio.voice = voiceAssetId` | **"自动在当前行挂载 voice 打点"**：有对白即有语音，零手动操作 |

映射纯函数签名（示意）：

```ts
function resolveAudioDirective(
  tags: DirectiveTags,
  ctx: { assets: AssetItem[]; characterConfigs: CharacterConfig[]; speaker?: string },
): { audio: AudioState; report: ResolutionReport }
```

### 2.4 `ai_meta` 与"待复核"机制（落进 `types.ts` 预留字段）

每一行 AI 生成的 `LineDelta` 都带：

```ts
ai_meta: {
  confidence: number,                 // 来自模型自评
  needs_review: boolean,              // 任一标签未解析 或 confidence < 0.6 → true
  source_text_span: [number, number], // 对应"用户选中的原文"区间，便于回溯定位
}
```

- `needs_review=true` 的行，在 StagePreview / 时间轴上渲染一个 **"⚠ AI 待复核"** 徽标，用户点开可一键替换素材。
- `source_text_span` 让"用户选中一段文本 → AI 处理 → 结果回写同一段"形成**确定性闭环**，也是 §3 幂等性的锚点。

### 2.5 打点与 A 方向的正交校验

生成完成后，可复用 A 方向的 `validateExportNames` 对 AI 写入的 `audio.{bgm,ambient,se,voice}` 再验一遍 `asset_id` 合法性（确保解析器没写出悬空引用）。这是 C→A→B 三线闭环的关键咬合点。

---

## 3. Streaming 流式响应与状态机同步

### 3.1 SSE 流式读取

OpenAI 兼容端点（DeepSeek / Claude-via-OpenRouter / 本地 vLLM）均支持 `stream:true`，返回 `text/event-stream`：

```
data: {"choices":[{"delta":{"content":"天"}}]}
data: {"choices":[{"delta":{"content":"上下起"}}]}
...
data: [DONE]
```

渲染端用 `fetch` + `ReadableStream` 逐块解析 `data:` 行，`choices[0].delta.content` 累积为 token 缓冲。

### 3.2 双流缓冲：文本流与指令流分离

- **导师模式（文本流）**：累积的 token 直接进入 AIPanel 的**本地 `useState` 缓冲**做打字机渲染。**绝不写入 store**——否则每 token 一次 `set` 会触发全树重算。
- **监督模式（指令流）**：模型输出的是 JSON。两种策略：
  - **策略 A（推荐，正确性优先）**：流式仅用于"实时展示模型正在思考"（把已收到的片段显示在预览框），**完整 JSON 在流结束 `data:[DONE]` 后一次性解析**，再走 §3.3 的提交事务。
  - 策略 B（增量 JSON Patch）：复杂度高、半截 JSON 易崩，不推荐首版。
  - 用户体验上，策略 A 仍可在流结束后做"逐行揭示"动画（本地纯展示），达到打字机观感而**不污染 store**。

### 3.3 提交事务边界（杜绝 Undo/Redo 爆炸的核心设计）

这是 B 方向与 A/C 一样严守"内核零侵入"的**胜负手**：

> **AI 结果在流式过程中完全不调用任何 store action；只在流结束、用户点"应用"时，由纯函数 `composeDeltas` 在内存里拼出完整 `LineDelta[]`，再一次性 `setDraftDeltas(finalArray)` 提交。**

为什么这完美满足约束：
1. `setDraftDeltas` 内部只调 **一次** `_pushHistory()`（`appStore.ts:324`）→ 一次 AI 操作 = **一条**撤销记录，整段 AI 排戏可一步 undo 回原始状态。
2. 全程**零新增 action 签名**：我们复用既有的 `setDraftDeltas`，连 `insertDeltaAt` / `batchUpdateDeltas` 都不需要逐个调。
3. 无闪烁：store 仅在"应用"瞬间更新一次，`resolvedStates` 重算一次，时间轴一次性刷新；流式期间只有 AIPanel 局部预览缓冲在动。

`composeDeltas` 的三种应用形态（纯函数，输入 `existing` + `plan` + `anchorIndex`）：
- **整段替换**：`final = plan`（用户选"AI 重写全剧"）。
- **锚点插入 N 行**：`final = [...existing.slice(0,anchor+1), ...plan, ...existing.slice(anchor+1)]`。
- **原地改写选中行**：`final = existing.map((d,i)=> i===anchor ? plan[0] : d)`。
三种都收敛为单个数组 → 单次 `setDraftDeltas`。

### 3.4 幂等性保证

- `composeDeltas(existing, plan, anchor)` 是**纯函数**：同输入必同输出。
- 组件侧用 `committedRef`（useRef）守卫：用户重复点"应用"只生效一次。
- `source_text_span` 提供确定性锚点：即使对同一段原文多次重跑 AI，结果都落回同一行区间，行为可预期。

---

## 4. 纯函数边界与安全性

### 4.1 模块边界：所有 AI 逻辑收敛于 `src/utils/aiDirector.ts`

| 层 | 职责 | 是否 import store / React |
|---|---|---|
| `aiDirector.ts`（纯函数） | 拼 Prompt、解析 SSE、解析 DSL、`resolveTags`、`resolveAudioDirective`、`composeDeltas`、计算 `ai_meta` | **否**（只接收 `assets`/`characterConfigs` 作为参数，不读取 store） |
| `AIPanel.tsx`（组件） | 持有 UI 状态、调用纯函数、读 store 作只读输入、在"应用"时调一次 `setDraftDeltas` | 仅 `getState()` 只读 + 一次 `setDraftDeltas` |
| 主进程 IPC（可选强化） | 代理 API 请求、保管密钥、转发 SSE | 与 store 完全正交 |

→ **零 action 签名改动，状态机内核零侵入**，与 A/C 方向原则完全一致。

### 4.2 API Key 与模型配置的持久化（安全升级）

现状缺陷：Key 在渲染进程 `localStorage`，renderer 任意脚本可读。B 方向给出**两级方案**：

- **基础版（纯前端，沿用现有）**：`AIConfig` 留在 `localStorage`，扩充字段：
  ```ts
  interface AIConfig {
    provider: 'openai' | 'deepseek' | 'anthropic' | 'custom'
    endpoint: string
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
  }
  ```
  提供"厂商预设"（DeepSeek `https://api.deepseek.com/v1/chat/completions`、Claude via OpenRouter 等）一键填 endpoint/model。

- **进阶版（Electron 安全范式，推荐）**：新增 `ai:chat` IPC：
  - 密钥与 endpoint 存于**主进程**（用 `electron-store` 或系统钥匙串 `keytar`），**绝不发往渲染进程**。
  - 渲染端只发 `{messages, model, temperature}` → 主进程注入密钥后转发 → 通过 `event.reply('ai:token', chunk)` 把 SSE 片段回传渲染端。
  - 好处：密钥不出现在 renderer 内存，`sw-asset://` 协议同属主进程安全域，架构统一。
  - **该 IPC 与 store 完全隔离**，不引入任何新 action。

### 4.3 请求安全约束

- endpoint 强制 `https://`（防明文泄露密钥）；可选"可信域名白名单"配置。
- 请求体不携带项目正文以外的敏感信息；`ai_meta` / `tags` 绝不回写 `.swproj`（属于运行时元数据，不持久化或仅本地缓存）。
- 流式读取加 `AbortController`（现有 `abortRef`）支持取消，避免悬挂连接。

### 4.4 与 C / A 方向的资产闭环咬合

```
C（资产闭环）: 规范 assets/images/background|sprite、assets/audio
        │  提供"素材字典"
        ▼
B（AI 打点）: resolveTags 把语义标签绑定到真实 asset_id
        │  生成带 audio.{ambient,se,voice,bgm} 的 LineDelta
        ▼
A（Ren'Py 导出）: exportToRpy 直接吃到合法的 asset 引用 → 引擎零报错拉起
```
C 是 B 的"眼睛"，B 是 A 的"上游"，三线在同一套 `asset_id` 语义下严丝合缝。

---

## 5. 落地执行顺序（B-1 到 B-10）

| 编号 | 任务 | 内核影响 |
|---|---|---|
| B-1 | 扩充 `AIConfig` 类型（provider / temperature / maxTokens / 预设） | 仅 localStorage，零 store 改动 |
| B-2 | 新建纯函数模块 `src/utils/aiDirector.ts`：`buildSystemPrompt` / `buildUserPrompt`（双角色） | 纯函数，零 store |
| B-3 | `parseDirective(json)`：健壮解析 DSL，分离 `tags` 与字段 | 纯函数 |
| B-4 | `buildTagIndex(assets)` + `resolveTags`：语义标签 → `asset_id` | 纯函数 |
| B-5 | `resolveAudioDirective`：environment→ambient / sfx→se / bgm→bgm / emotion+说话人→voice | 纯函数 |
| B-6 | `resolveDirectiveToDelta` + `ai_meta`（confidence / needs_review / source_text_span）+ `ResolutionReport` | 纯函数 |
| B-7 | `composeDeltas(existing, plan, anchor)` 三种形态（替换/插入/改写） | 纯函数 |
| B-8 | SSE 流式读取（fetch + ReadableStream 解析 `data:`）+ 打字机缓冲 | 仅 AIPanel 本地 state |
| B-9 | 提交事务：流结束 → `setDraftDeltas(finalArray)` 一次性提交（**单条历史**）+ `committedRef` 幂等守卫 | **复用既有 `setDraftDeltas`，零新 action** |
| B-10 | （可选安全强化）主进程 `ai:chat` IPC 代理 + `preload`/`vite-env` 桥接；密钥移出渲染进程 | 与 store 正交 |

> 全程不修改任一既有 action 签名；新增可选 `AssetItem.tags?` 为纯增量、向后兼容。

---

## 6. 端到端示例（一条自动打点闭环）

**用户选中原文**：`"天上下起了瓢泼大雨，他绝望地痛哭。"`（span `[12, 24]`）

**AI（director 模式）返回**：
```json
{ "lines": [{
  "speaker": "bob", "dialogue": "（大雨中）我……我什么都没有了……",
  "background": { "tag": "school", "transition": "dissolve" },
  "characters": { "bob": { "sprite_id": "cry", "position_slot": "center", "action": "show" } },
  "tags": { "emotion": ["despair","cry"], "environment": ["rain","storm"], "sfx": ["thunder"], "bgm": ["tense"] },
  "confidence": 0.84
}]}
```

**`resolveAudioDirective` 解析后写入该行 `LineDelta.audio`**：
```ts
audio: {
  bgm:    { asset_id: "asset_audio_bgm_tense",   volume: 0.6, loop: true },
  ambient:{ asset_id: "asset_audio_ambient_rain", volume: 0.3, loop: true, fade_in_ms: 1500 },
  se:     ["asset_audio_se_thunder"],
  voice:  "asset_audio_voice_bob_XX",   // bob 有对白 → 自动挂载语音打点
}
ai_meta: { confidence: 0.84, needs_review: false, source_text_span: [12, 24] }
```

**`composeDeltas` + `setDraftDeltas` 一次性提交** → 时间轴出现：雨幕背景（dissolve）、Bob 居中哭泣立绘、雷声 SE、雨声环境音、紧张 BGM、Bob 语音——**导演一句话排完一场戏**，且整段可一步 Undo。

导出时（A 方向）这些 `asset_id` 全部合法，`renpy launch` 直接拉起。

---

*（本 Spec 已对齐 `types.ts` / `appStore.ts` / `AIPanel.tsx` / `rpyExporter.ts` 的真实字段与 action 签名，落地时按 B-1~B-10 推进，全程零破坏状态机内核。）*
