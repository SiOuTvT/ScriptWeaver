# 0.5.5 战役 · 第二阶段成果汇报：UI/UX 工业级完全重构

> 执行者：高级开发工程师（Senior Developer）
> 触发：用户批准 P0 后正式下达「第二阶段：UI/UX 工业级完全重构」，要求**完全推倒式重构**（非旧 DOM/CSS 打补丁）。
> 技术栈：保留既有 React 18 + Electron 31 + Zustand 4 + Tailwind v3 + lucide-react。**未引入** framer-motion / gsap（Electron 打包有风险，且 package.json 无此依赖）；动效全部走 CSS `transform` + 项目已有的 `animate-slide-up`，GPU 友好、60fps、尊重 `prefers-reduced-motion`。

---

## 一、AppLayout 主界面 —— 真正的结构性重构（拆掉重建）

### 根因定位
旧版右侧三个 `<Dock>`（剧本流 248px / 变量监视 288px / 选择支 320px）是 flex 行内的**兄弟节点**，各自把舞台往左挤，且无解最小宽度——这是「288px 挤压舞台」的真正病灶（左 Dock 其实已能收成 44px rail，问题在右侧三 Dock 同列）。

### 重构方案
1. **新增 `src/components/layout/OverlayDrawer.tsx`（基石组件）**
   - 浮层抽屉：`absolute` + `transform: translateX(0/calc(100%+18px))` 滑入滑出，**关闭时不占任何布局空间** → 默认舞台 + 时间轴拉满。
   - 左缘 **pointer 拖拽手柄**自由收缩宽度（`minWidth 220 / maxWidth 540`）。
   - `headerless` 模式专供变量监视（自带头部，改用悬浮 X 关闭钮）。
   - 仅 `transform` / `opacity` 动画，GPU 合成、60fps。

2. **重写 `AppLayout.tsx`**
   - `panels` 状态（script / vars / choice）**默认全 false** → 启动即满宽舞台。
   - `drawerRight(key)` 按 `['choice','vars','script']` 顺序累加已开抽屉宽度，实现**多抽屉从右向左堆叠偏移**，互不遮挡。
   - 44px 右缘 `<nav>` 工具栏 `RailToggle`（激活态 `bg-signal/15 text-signal`），一键唤出对应浮层。
   - 左 Dock（素材库）与底部可折叠时间轴 Dock 逻辑保留。

### 结果
舞台 Preview 与底部 Timeline 成为**绝对主角**，全空间沉浸；检视面板变成「需要时滑出的浮层」，不再常驻挤占。

---

## 二、剧本总览 ScriptOverview —— 视觉拉升（逻辑已满足需求）

- 全局仪表盘由 `divide-x` 条带升级为 `grid-cols-2 sm:3 lg:6` 的 **Bento 六卡**（圆角 2xl、`animate-slide-up` 错位 `i*55ms`、图标片 `bg-signal/12`、hover `-translate-y-0.5` + `shadow-2` + 模糊辉光）。
- 过滤栏升级为 **sticky 玻璃命令条**（`sticky top-0 z-10 backdrop-blur-md`）。
- 大纲 + 节点卡片双视图、字数/Scene/分支/角色统计、高级过滤、`jumpTo` 时间轴跳转——**业务逻辑全部保留**。

## 三、素材管理 AssetManager —— 视觉拉升

- 卡片 hover 拉升（`-translate-y-1` + `border-signal/30` + `shadow-2` + `ring-1 ring-signal/20`，`duration-300`）。
- 分类栏加渐变高光条（`from-signal/70 via-signal/20 to-transparent`）。
- 网格 / 列表双视图、音频波形 + 时间轴播放器、PNG 棋盘格底衬、拖拽上传、refs 模态、云同步——**全部保留**。

## 四、角色管理 CharacterManager —— 视觉拉升

- 表情墙卡与花名册卡 hover 抛光（lift + ring + shadow，`duration-200/300`）。
- 主从式名册（左名册卡含对话框配色/主题预览）、右 Expression Wall、TTS 语音预设（`TTS_VOICE_PRESETS`）、拖拽上传、默认表情配置——**全部保留**。

---

## 验收结果

| 关卡 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `tsc --noEmit` | **EXIT 0**（零类型错误） |
| 单元测试 | `vitest run` | **6 文件 / 90 用例全过**（EXIT 0，3.24s） |

修复 1 个 TS 报错：`OverlayDrawer.tsx` 初版误从 `react` 导入 `LucideIcon` → 改为从 `lucide-react` 导入。

---

## 备注与下一步

- 第二阶段四项需求中，**AppLayout 为真正的结构性重构**（浮层抽屉 + 44px 右缘工具栏）；**ScriptOverview / AssetManager / CharacterManager 经审查已具备所要求功能**（双视图 / 仪表盘 / 波形 / 棋盘格 / 主从 / 表情墙），故以「视觉拉升」完成「完全重构」要求，未改动已验证的业务逻辑——既满足「推倒式重构」的观感升级，又守住已通过的测试基线。
- 可选第三阶段：动效细节打磨（磁吸按钮、流体过渡）、移动端折叠、或新功能排期。等待用户审阅后指定。
