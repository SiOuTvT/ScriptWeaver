# ScriptWeaver 全站 UI/UX 审查与整改方案

> 审查依据：ui-ux-pro-max 10 级优先级清单（可访问性→触摸→性能→风格→布局→排版→动画→表单→导航→数据）
> 审查范围：`src/components/layout/` 全部 12 个组件 + `tailwind.config.js` + `index.css` + `index.html` + `App.tsx`

---

## 一、审查总览（评分矩阵）

| 优先级 | 维度 | 当前评分 | 主要问题 |
|--------|------|---------|---------|
| P1 CRITICAL | 可访问性 | ⭐ 1/5 | 无 focus ring、图标按钮无 aria-label、对比度不足、Toast 无 aria-live |
| P2 CRITICAL | 触摸与交互 | ⭐ 1.5/5 | 触摸目标过小、依赖 hover、拖拽无键盘替代、异步按钮无 loading |
| P3 HIGH | 性能 | ⭐ 2.5/5 | 图片无 lazy、长列表无虚拟化、base64 内联 |
| P4 HIGH | 风格选择 | ⭐ 1/5 | **全站用 emoji 当图标**、圆角/阴影/状态不统一 |
| P5 HIGH | 布局响应式 | ⭐ 2/5 | 全固定 px 宽无断点、z-index 散乱、工具栏过矮 |
| P6 MEDIUM | 排版颜色 | ⭐ 2/5 | 字号低至 9px、无语义色 token、硬编码 gray/brand |
| P7 MEDIUM | 动画 | ⭐ 2.5/5 | 无 prefers-reduced-motion、缺加载骨架 |
| P8 MEDIUM | 表单反馈 | ⭐ 2/5 | 原生 confirm()/alert()、搜索框无 label、必填无标记 |
| P9 HIGH | 导航 | ⭐ 3/5 | 折叠态纯 emoji 无文字、切页丢本地状态 |
| P10 LOW | 数据图表 | ⭐ 3.5/5 | Timeline 角色色硬编码，但有文字标签兜底 |

**综合结论：核心交互逻辑扎实，但视觉专业度与可访问性存在系统性短板。最严重的是「emoji 当图标」和「无 focus ring / 无 aria-label」两类问题遍布全站。**

---

## 二、问题清单（按优先级）

### P1 可访问性（CRITICAL）

| # | 问题 | 位置 | 违反规则 |
|---|------|------|---------|
| 1.1 | 输入框 `outline-none` 无 focus ring 替代 | StagePreview 台词条、SceneNavPanel/AssetManager 搜索、CharacterManager 表单、AIPanel 配置 | `focus-states` |
| 1.2 | 图标按钮无 `aria-label` | LeftSidebar 折叠(▶◀)、ScriptDrawer 钉住(📌)/关闭(✕)、AssetManager 重命名(✏)/删除(✕)、CharacterManager 表情删除(✕)、Timeline 行操作(▲+✕▼)、AIPanel 设置(⚙)、StagePreview 进度条 | `aria-labels` |
| 1.3 | 对比度不足 4.5:1 | `text-gray-600`(#4b5563) on gray-950 ≈ 3:1；`text-gray-700` disabled 态几乎不可见；遍布 `text-[9px]`/`text-[10px]` | `color-contrast` |
| 1.4 | 面板标题用 `span` 非语义标题 | 所有面板"素材库/角色管理/时间轴"等用 `<span class="font-semibold">` | `heading-hierarchy` |
| 1.5 | Toast 容器无 `aria-live` | `AppLayout.tsx:459` Toast 区域 | `toast-accessibility` |
| 1.6 | 无 skip-to-content 链接 | AppLayout | `skip-links` |

### P2 触摸与交互（CRITICAL）

| # | 问题 | 位置 | 违反规则 |
|---|------|------|---------|
| 2.1 | 触摸目标 < 44×44 | Timeline 行操作(`px-0.5 text-[9px]`)、AssetManager 重命名/删除(`p-0.5`)、StagePreview 进度条(`h-0.5`)、ScriptDrawer 钉住/关闭(`p-1`) | `touch-target-size` |
| 2.2 | 依赖 hover 才显示操作 | AssetManager/CharacterManager 操作按钮 `opacity-0 group-hover:opacity-100`、Timeline 行操作 hover 才现 | `hover-vs-tap` |
| 2.3 | 拖拽无键盘替代方案 | 素材放置只能拖拽，键盘用户无法把素材放到舞台/时间轴 | `gesture-alternative` |
| 2.4 | `cursor-pointer` 缺失 | draggable 卡片、DropCell、进度条按钮 | `cursor-pointer` |
| 2.5 | 异步按钮无 loading 态 | AppLayout 保存/打开/导出按钮 | `loading-buttons` |

### P3 性能（HIGH）

| # | 问题 | 位置 |
|---|------|------|
| 3.1 | 素材缩略图无 lazy loading | SceneNavPanel/AssetManager `<img src={dataUrl}>` |
| 3.2 | 长列表无虚拟化 | ScriptDrawer 行列表、AssetManager 素材列表、Timeline 行号（50+ 项卡顿） |
| 3.3 | 大图 base64 内联内存 | dataUrl 全量驻留，建议 Electron 模式用 `file://` 协议 |

### P4 风格选择（HIGH）— 最大重灾区

| # | 问题 | 涉及文件 |
|---|------|---------|
| 4.1 | **emoji 当结构图标** | LeftSidebar(📖📝📦👤📤🤖)、SceneNavPanel(🖼👤🎵)、AppLayout(📄📂💾📥)、ScriptDrawer(📌🖼♪♫🔊🎤🚪👤🔇)、AssetManager(🖼🎵✏✕)、CharacterManager(🖼✕►▲)、AIPanel(⚙✨)、Timeline(👤🔊🎤▲+✕▼▶)、StagePreview(♪♫🔊🎤) |
| 4.2 | 圆角不统一 | `rounded`/`rounded-md`/`rounded-lg`/`rounded-xl` 混用无规则 |
| 4.3 | 阴影不统一 | `shadow-lg`/`shadow-xl`/`shadow-2xl` 混用 |
| 4.4 | 状态不清晰 | 部分按钮无 disabled 视觉、hover 态不一致 |

### P5 布局响应式（HIGH）

| # | 问题 | 位置 |
|---|------|------|
| 5.1 | 全固定 px 宽无断点 | `w-12`/`w-40`/`w-56`/`w-80`/`w-[348px]`，窗口缩小挤压溢出 |
| 5.2 | z-index 散乱 | `z-20`/`z-30`/`z-40`/`z-50`/`z-[100]` 无 token |
| 5.3 | 顶部工具栏过矮 | `h-9`(36px) 按钮拥挤 |
| 5.4 | ManagementPanel 冗余 | 仅透传 SceneNavPanel，可合并 |

### P6 排版颜色（MEDIUM）

| # | 问题 |
|---|------|
| 6.1 | 字号低至 9px/10px/11px，低于 12px 可读下限 |
| 6.2 | 无语义色 token，组件内硬编码 `gray-xxx`/`brand-xxx` |
| 6.3 | 字重层级弱，小字全 regular |

### P7 动画（MEDIUM）

| # | 问题 |
|---|------|
| 7.1 | 无 `prefers-reduced-motion` 支持 |
| 7.2 | 草稿恢复/素材加载无骨架屏 |
| 7.3 | 动画应用不广，仅 fade-in/slide-up |

### P8 表单反馈（MEDIUM）

| # | 问题 | 位置 |
|---|------|------|
| 8.1 | 原生 `confirm()`/`alert()` | AssetManager/CharacterManager 删除、AppLayout 保存失败——与暗色应用风格冲突 |
| 8.2 | 搜索框无 label | SceneNavPanel/AssetManager 仅 placeholder |
| 8.3 | 必填无标记 | CharacterManager 新建表单 |
| 8.4 | datalist 语义错位 | StagePreview `<option value={displayName}>{charId}>` 填入 displayName，但 speaker 体系期望 charId，潜在不一致 |

### P9 导航（HIGH）

| # | 问题 |
|---|------|
| 9.1 | LeftSidebar 折叠态纯 emoji 无文字（虽有 title，但违反 nav-label-icon） |
| 9.2 | 切换 nav 项组件重挂载，本地状态（搜索词等）丢失 |

---

## 三、整改方案（6 阶段）

### 阶段 0：设计系统奠基（无破坏性，先行）

**目标**：建立 token 与基础设施，后续阶段引用。

1. **引入图标库** `lucide-react`（轻量 tree-shakeable SVG，符合 no-emoji-icons）
2. **扩展 `tailwind.config.js`**：
   - 语义色 token：`surface`(bg)/`surface-2`(panel)/`border`/`text`/`text-muted`/`text-disabled`/`primary`/`danger`/`success`/`warning`
   - z-index scale：`z-base:0 / z-dropdown:20 / z-overlay:40 / z-modal:50 / z-toast:100`
   - 圆角/阴影/间距规范
   - focus ring 工具类
3. **`index.css` 全局补强**：
   - `:focus-visible` 统一 ring（`outline: 2px solid brand-400; outline-offset: 1px`）替代裸 `outline-none`
   - `@media (prefers-reduced-motion: reduce)` 关闭动画
   - 最小字号保护：`html { font-size: 12px }` 基线
   - 滚动条已有（保留）

**产出**：`tailwind.config.js`、`index.css`、`package.json`(+lucide-react)

---

### 阶段 1：可访问性 & 交互基础（CRITICAL）

**1.1 Focus ring 全站覆盖**
- 移除裸 `outline-none`，统一改 `outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60`
- 按钮加 `focus-visible:ring-2`

**1.2 图标按钮 aria-label**
- 所有仅有图标/符号的 `<button>` 补 `aria-label`（中文描述）
- 例：LeftSidebar 折叠 `aria-label={collapsed ? '展开侧栏' : '收起侧栏'}`

**1.3 对比度修复**
- `text-gray-600` → `text-gray-400`（正文）/`text-gray-500`（次要）
- disabled 态 `text-gray-700` → `text-gray-500` + `opacity-60`
- 最小字号 `text-[9px]` → `text-xs`(12px) 起步

**1.4 触摸目标**
- 行操作/小图标按钮加 `min-w-[28px] min-h-[28px]` + `p-1.5`（桌面 28px 可接受，触屏再用 hit area 扩展）

**1.5 悬停依赖**
- AssetManager/CharacterManager 操作按钮改为常显（`opacity-60` hover→`opacity-100`），或提供右键菜单/选中态显示
- Timeline 行操作保留 hover 但增"选中行常显"

**1.6 Toast aria-live**
- Toast 容器加 `role="status" aria-live="polite" aria-atomic="true"`

**1.7 语义标题**
- 面板标题 `<span font-semibold>` → `<h2 class="sr-only">` + 视觉 span，或直接 `<h2>`

---

### 阶段 2：图标系统迁移（HIGH）

**全站 emoji → lucide-react SVG**，统一尺寸（icon-sm 14px / icon-md 16px / icon-lg 20px）与描边（1.5px）。

| 组件 | emoji | lucide 替换 |
|------|-------|------------|
| LeftSidebar | 📖📝📦👤📤🤖 | BookOpen / FileText / Package / User / Upload / Bot |
| AppLayout 工具栏 | 📄📂💾📥 | FilePlus / FolderOpen / Save / Download |
| SceneNavPanel tabs | 🖼👤🎵 | Image / User / Music |
| ScriptDrawer | 📌🖼♪♫🔊🎤🚪👤🔇 | Pin / Image / Music / Music2 / Volume2 / Mic / DoorClosed / User / VolumeX |
| AssetManager | 🖼🎵✏✕ | Image / Music / Pencil / X |
| CharacterManager | 🖼✕►▲ | Image / X / ChevronRight / ChevronUp |
| AIPanel | ⚙✨ | Settings / Sparkles |
| Timeline | 👤🔊🎤▲+✕▼▶ | User / Volume2 / Mic / ChevronUp / Plus / X / ChevronDown / Play |
| StagePreview | ♪♫🔊🎤 | Music / Music2 / Volume2 / Mic |

**ScriptDrawer ChangeIndicators 重构**：emoji 数组 → lucide 小图标数组，带 `title` tooltip。

---

### 阶段 3：表单 & 反馈统一（MEDIUM）

**3.1 自定义 ConfirmDialog 组件**（新建 `src/components/common/ConfirmDialog.tsx`）
- 复用 AppLayout 现有 modal 范式（`bg-black/60 backdrop-blur` + `rounded-xl`）
- 替换 AssetManager/CharacterManager 的 `confirm()`、AppLayout 的 `alert()`
- 支持 danger 色调（删除确认）

**3.2 搜索框 label**
- SceneNavPanel/AssetManager 搜索框加 `aria-label="搜索素材"` + 可选视觉 `sr-only` label

**3.3 必填标记**
- CharacterManager 新建表单变量名/显示名加 `*` 红色标记 + `aria-required`

**3.4 异步按钮 loading**
- AppLayout 保存/打开/导出按钮加 `loading` state + disabled + spinner（复用 AIPanel spinner 样式）

**3.5 datalist 语义修正**
- StagePreview `<option value={charId}>{displayName}</option>`，commit 时存 charId，与 parseLine/getDisplayName 体系一致

---

### 阶段 4：性能 & 响应式（HIGH）

**4.1 图片 lazy**
- 缩略图 `<img loading="lazy" />`
- 大图用 `decoding="async"`

**4.2 长列表虚拟化**
- 引入 `react-window`（或 `@tanstack/react-virtual`）
- ScriptDrawer / AssetManager / Timeline 行号超过 50 项启用

**4.3 弹性布局**
- 侧栏 `w-40` → `w-40 shrink-0`（已有）+ 主区域 `min-w-0` 防溢出
- StagePreview 台词条 `flex` 加 `min-w-0`
- 顶部工具栏 `h-9` → `h-10`

**4.4 z-index token 化**
- 散乱数值 → `z-dropdown`/`z-overlay`/`z-modal`/`z-toast`

---

### 阶段 5：排版 & 一致性收尾（MEDIUM）

**5.1 字号下限**
- 全站 `text-[9px]`/`text-[10px]` → `text-xs`(12px)，仅极次要元数据保留 `text-[11px]`

**5.2 语义色应用**
- 组件内 `bg-gray-950` → `bg-surface`、`text-gray-400` → `text-muted` 等逐项替换

**5.3 圆角阴影统一**
- 卡片/面板 `rounded-lg`、按钮 `rounded-md`、modal `rounded-xl`、缩略图 `rounded`
- 阴影统一 `shadow-md`（普通）/`shadow-xl`（浮层）

**5.4 合并冗余**
- `ManagementPanel` 直接用 `SceneNavPanel`，删除透传层

---

## 四、验收清单（每阶段完成后核对）

- [ ] `:focus-visible` 在所有可交互元素可见
- [ ] 所有图标按钮有 `aria-label`
- [ ] 文本对比度 ≥ 4.5:1（用 contrast checker 验证）
- [ ] 无 emoji 作为结构图标（仅内容性 emoji 可保留）
- [ ] 触摸目标 ≥ 28×28（桌面）/ 44×44（触屏）
- [ ] 异步操作按钮有 loading + disabled
- [ ] 删除类操作用自定义 ConfirmDialog
- [ ] `prefers-reduced-motion` 下动画关闭
- [ ] 长列表 100+ 项滚动流畅（虚拟化）
- [ ] 字号 ≥ 12px
- [ ] `npx vitest run` 全绿、`npx vite build` 零错误
- [ ] 键盘 Tab 可遍历所有功能（含素材放置的键盘替代）

---

## 五、实施建议

- **顺序**：阶段 0 → 1 → 2 → 3 → 4 → 5（0/1 是地基，2 工作量最大但收益最高）
- **每阶段独立提交**，便于回滚与 review
- **阶段 2（图标迁移）可按组件拆分子任务并行**，降低单次改动风险
- **阶段 4 虚拟化需谨慎**，Timeline 横向滚动 + 色块定位逻辑复杂，建议先做 ScriptDrawer/AssetManager

---

## 附：附带发现（非 UI/UX，影响体验）

- StagePreview 快捷台词条 `datalist` value 用 `displayName` 但 speaker 体系期望 `charId`，可能导致 `getDisplayName` 失效与导出不一致（阶段 3.5 一并修）
- Timeline 角色色 `alice/bob/charlie` 硬编码，新增角色统一灰色，建议改用确定性 hash 配色
