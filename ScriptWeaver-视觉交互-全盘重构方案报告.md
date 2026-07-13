# ScriptWeaver 视觉与交互全盘重构方案报告

> **版本**：v1.0（设计蓝图 / Spec 驱动论证稿）
> **范围**：全站 UI 视觉、UX 交互、配色系统、组件质感、图标设计
> **技术栈约束**：Electron 31 + React 18 + TypeScript 5.5 + Zustand 4.5 + Tailwind CSS 3.4 + Vite 5
> **状态**：本报告仅做方案论证，**不改动任何业务代码**，待你确认后按阶段实施。

---

## 0. 设计使命与北极星原则

ScriptWeaver 是一款面向「不会写代码的视觉小说创作者」的桌面编辑器，核心价值是把"中文剧本 + 素材摆放"确定性地编译成 Ren'Py。它的界面必须同时服务两种气质：

- **创作者的沉浸感** —— 像在写小说、在导戏，而不是在填表格；
- **生产力工具的精确感** —— 像 Linear / VS Code，信息密度高、反馈即时、操作可信。

当前界面在这两点上都偏弱：默认灰蓝扁平、emoji 当图标、无 focus ring、无主题系统、背板色写死 `bg-gray-950`。这正是你感到"缺乏高级感与沉浸感"的根因。

### 设计语言命名：**「织 · WEAVE」**

产品名是 Weaver（编织者），剧本是"被编织的线"。我们把整套管视觉语言命名为 **「织 / WEAVE」**，并以一组东方意象锚定两种主题：

| 主题 | 意象 | 关键词 |
|---|---|---|
| **Dark（深色）** | **墨** —— 夜墨、砚台、赛博水墨 | 沉浸、专注、二次元暗黑极客、深夜码字不伤眼 |
| **Light（浅色）** | **纸** —— 宣纸、素笺、羊皮纸 | 克制、清爽、纸张质感、拒绝刺眼纯白 |

### 北极星原则（任何取舍都回到这四条）

1. **沉浸（Immersive）** —— 舞台预览是全局视觉锚点，它周围的 UI 应当"退后"，让创作焦点呼吸。
2. **克制（Restrained）** —— 颜色只用在"有意义的地方"：状态、选中、品牌。其余一律交给中性墨/纸层级。
3. **精确（Precise）** —— 每一个 hover、点击、联动都要有确定且即时的反馈；时间轴的"继承"关系必须一眼可读。
4. **呼吸感（Breathing）** —— 用层级（墨/纸的明度差）和微边框制造纵深，而非廉价重阴影。

---

## 1. 现状诊断（节选自已完成的全站审查）

| 维度 | 现状问题 | 严重度 |
|---|---|---|
| 主题 | 无深浅色系统，背景写死 `bg-gray-950` | 🔴 硬性缺口 |
| 配色 | 仅有一套 brand 蓝（`#4c6ef5`），其余全用 Tailwind 默认 `gray-*`，无语义色、无状态色体系 | 🔴 |
| 图标 | 9 个组件用 emoji 当结构图标（📖📦👤🤖💾…），跨平台渲染不一致、无法主题化、线条粗糙 | 🔴 |
| 可访问性 | 图标按钮无 `aria-label`，全站 `outline-none` 无替代 focus ring，键盘用户不可达 | 🔴 |
| 质感 | 干瘪扁平：无微阴影、无半透明毛玻璃层级、圆角混用（6/8/12px 随意）、边框单一 `border-gray-800` | 🟠 |
| 对比度 | `text-gray-600` 在深底上约 3:1，低于正文 4.5:1 标准 | 🟠 |
| 触控目标 | 多处图标按钮高度仅 28–32px，折叠把手更窄，低于 40px 舒适区 | 🟠 |
| 反馈 | 原生 `confirm()`/`alert()` 与暗色风格冲突；Toast 无 `aria-live`；异步按钮无 loading 态 | 🟠 |
| 字号 | 大量 `text-[10px]`/`text-[11px]` 低于 12px 可读下限 | 🟡 |
| 响应式 | 全固定 px 宽（侧栏 w-12/w-40），无弹性断点 | 🟡 |

> 结论：底层框架（Zustand 状态机、Delta 归约、四层联动）运行良好，问题集中在"皮肤与交互层"。本次重构是**换皮 + 补骨架**，不应触碰数据与联动逻辑。

---

## 2. 色彩系统重构（Palette）

### 2.1 设计策略

- **彻底抛弃 Tailwind 默认 `gray-*` 与写死的 `bg-gray-950`**，改为一套**语义化 token**（背景/表面/边框/文字/主色/辅色/状态），由 CSS 变量驱动。
- **双主题共用同一套 token 名**，仅值不同。组件里只写 `bg-surface-2`、`text-text-secondary`、`border-border`，**不写 `dark:` 分支**，主题切换即全局生效。
- 颜色以 **OKLCH** 为定义基准（感知均匀，便于微调），同时给出落地用的 HEX/RGB 通道值。

### 2.2 深色主题「墨 / INK」（默认）

| Token | 用途 | HEX | 备注 |
|---|---|---|---|
| `--ink-950` | 应用最底层背景（App 背板） | `#0A0B0E` | 近黑、极轻冷调，非纯黑 |
| `--ink-900` | 主面板背景（侧栏/素材库/时间轴） | `#0F1115` | 与 950 拉开 1 级 |
| `--ink-850` | 次级面板 | `#14161B` | |
| `--ink-800` | 抬起卡片 / 抽屉常驻态 | `#191C22` | |
| `--ink-750` | 输入框底 / 内嵌区 | `#1F232B` | |
| `--ink-700` | hover 态表面 | `#262B34` | |
| `--ink-600` | 激活/选中态表面 | `#323843` | |
| `--border-subtle` | 1px 极淡分隔线 | `rgba(255,255,255,.06)` | 面板内分隔 |
| `--border` | 1px 标准边框 | `rgba(255,255,255,.10)` | 卡片/面板外框 |
| `--border-strong` | 强调边框 | `rgba(255,255,255,.16)` | 聚焦/拖拽态 |
| `--text-primary` | 正文/标题 | `#E7E9EE` | 冷白，非纯白 |
| `--text-secondary` | 次要文字 | `#A0A6B2` | |
| `--text-tertiary` | 说明/元信息 | `#717786` | ≥12px 时对比度达标 |
| `--text-quaternary` | 占位符/禁用 | `#4B5563` | 仅用于装饰性文字 |

**品牌主色「紫毫 / VIOLET」**（二次元暗黑极客的冷紫，替代原蓝）：

| Token | HEX | 用途 |
|---|---|---|
| `--primary` | `#6D5EFC` | 主按钮、选中、品牌 |
| `--primary-hover` | `#8275FF` | hover |
| `--primary-active` | `#5A4CE6` | 按下 |
| `--primary-soft` | `rgba(109,94,252,.16)` | 选中态背景（如激活导航项） |
| `--primary-soft-hover` | `rgba(109,94,252,.24)` | |
| `--on-primary` | `#FFFFFF` | 主按钮文字 |

**辅色「青 / CYAN」**（仅用于焦点环、链接、文本选区、强调高亮，克制使用）：

| Token | HEX |
|---|---|
| `--accent` | `#3DD6C4` |
| `--accent-soft` | `rgba(61,214,196,.14)` |

**语义状态色**（统一明度，避免"报警红"刺眼）：

| Token | HEX | 用途 |
|---|---|---|
| `--success` | `#34D399` | 保存成功、继承正常 |
| `--warning` | `#FBBF24` | 需复核、AI 低置信 |
| `--danger` | `#FB7185` | 删除、错误（柔和玫瑰红） |
| `--info` | `#60A5FA` | 提示、链接 |

### 2.3 浅色主题「纸 / PAPER」

拒绝纯白。采用**暖中性纸调**，与深色共享 token 名。

| Token | HEX | 对照深色 |
|---|---|---|
| `--ink-950` | `#F2F1EC` | 应用背板（暖白，非 `#fff`） |
| `--ink-900` | `#F7F6F2` | 主面板 |
| `--ink-850` | `#FBFAF7` | 次级面板 |
| `--ink-800` | `#FFFFFF` | 抬起卡片（暖白纸面） |
| `--ink-750` | `#F4F2ED` | 输入框底 |
| `--ink-700` | `#ECE9E3` | hover |
| `--ink-600` | `#E2DED7` | 选中 |
| `--border-subtle` | `rgba(28,24,18,.07)` | |
| `--border` | `rgba(28,24,18,.12)` | |
| `--border-strong` | `rgba(28,24,18,.20)` | |
| `--text-primary` | `#1C1B19` | |
| `--text-secondary` | `#56524C` | |
| `--text-tertiary` | `#8A857C` | |
| `--text-quaternary` | `#AAA49A` | |
| `--primary` | `#5A4FE0` | 浅底上加深以保证对比 |
| `--primary-hover` | `#6D5EFC` | |
| `--primary-active` | `#4A40C8` | |
| `--primary-soft` | `rgba(90,79,224,.10)` | |
| `--on-primary` | `#FFFFFF` | |
| 辅色/状态 | 复用深色 HEX（青/成功/警告/危险/信息） | 浅底上仍清晰 |

> **张力来源**：视觉小说该有的"张力"由主色紫毫 + 辅色青的冷调对比提供，而非靠高饱和红绿。墨/纸层级负责安静的背景，紫青负责"亮起来"的瞬间。

---

## 3. 质感与组件精修（Visual Texture）

拒绝干瘪扁平。我们用「**层级 + 微边框 + 微阴影 + 毛玻璃**」四件套制造高级纵深。

### 3.1 圆角尺度（统一，消除随意混用）

| Token | 值 | 用于 |
|---|---|---|
| `--radius-xs` | 4px | 徽标、chip、状态点 |
| `--radius-sm` | 6px | 输入框、小按钮、标签 |
| `--radius-md` | 8px | 标准按钮、卡片、列表行 |
| `--radius-lg` | 12px | 面板、抽屉、对话框 |
| `--radius-xl` | 16px | 模态、大型浮层 |
| `--radius-full` | 9999px | 头像、圆形按钮、轨道端点 |

### 3.2 微阴影（Elevation Token）

深色（阴影偏黑、带低透明，靠"压暗"而非"发光"）：

```css
--shadow-1: 0 1px 2px rgba(0,0,0,.40);
--shadow-2: 0 4px 12px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.50);
--shadow-3: 0 16px 48px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.40);
/* 暗色卡片顶边"受光高光"，制造精致边缘 */
--shadow-inset-top: inset 0 1px 0 rgba(255,255,255,.05);
```

浅色（阴影偏暖、低饱和，柔和投影）：

```css
--shadow-1: 0 1px 2px rgba(28,24,18,.06), 0 1px 3px rgba(28,24,18,.04);
--shadow-2: 0 4px 16px rgba(28,24,18,.10);
--shadow-3: 0 24px 64px rgba(28,24,18,.16);
--shadow-inset-top: inset 0 1px 0 rgba(255,255,255,.70);
```

**使用纪律**：`shadow-1` 给卡片/行；`shadow-2` 给抽屉常驻/悬浮面板/下拉；`shadow-3` 仅给模态与重浮层。默认面板**只用边框 + 层级差**，不滥用阴影。

### 3.3 细腻边框（Subtle Borders）

- 所有表面外框统一 `--border`；面板内部细分隔用 `--border-subtle`。
- 抬起态（hover/选中）边框升级为 `--border-strong` 或染上 `--primary` 低透明。
- 卡片可叠加 `--shadow-inset-top` 获得"上沿受光"的高级感（暗色尤甚）。

### 3.4 半透明毛玻璃（Backdrop-blur）

| 位置 | 处理 |
|---|---|
| 顶部工具栏 | `backdrop-blur-md` + 半透明墨/纸表面，滚动态可加底框 |
| 剧本抽屉（半展开浮层） | 保留并强化 `backdrop-blur-xl` + 侧边 `shadow-3` |
| 模态/确认框 | `backdrop-blur-sm` 遮罩 + 玻璃面板 |
| 命令面板（未来） | 全玻璃 |
| 下拉/Popover/Toast | `backdrop-blur` + 半透明表面 |

### 3.5 焦点系统（可访问性硬指标）

所有可交互元素统一：

```css
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ink-900), 0 0 0 4px var(--primary);
  /* 即 ring-2 ring-primary/60 + ring-offset，偏移色取当前表面 */
}
```

键盘 Tab 必须可见；鼠标点击不触发（用 `:focus-visible` 区分）。

---

## 4. 图标系统升级（Iconography）

### 4.1 现状与局限

当前用 emoji（📖📦👤🤖💾📂📤📝）承担结构图标，问题：跨 OS 渲染不同、无法随主题变色、线条粗细不可控、与"精密生产力工具"调性冲突、ARIA 缺失。

### 4.2 推荐方案：**lucide-react**

理由：24×24 网格、1.5–2px 统一描边、Tree-shaking、完整 TS 类型、覆盖本项目全部语义（文件/文件夹/图片/音乐/机器人/下载/设置/搜索…），且与 Linear/VS Code 的极客精致感一致。线条图标也比实心图标更适合暗色"退后"。

**集成**：`npm i lucide-react`。统一约定：默认 `size={18}`、`strokeWidth={1.75}`、`className="text-current"`（随 `text-*` token 变色）。

### 4.3 导航与核心动作图标映射

| 位置 | 旧 emoji | 新 lucide |
|---|---|---|
| 场景导航 | 📖 | `ScrollText` |
| 剧本总览 | 📝 | `ListTree` / `FileText` |
| 素材管理 | 📦 | `Images` |
| 角色管理 | 👤 | `Users` |
| 导出设置 | 📤 | `FileOutput` / `Download` |
| AI 功能 | 🤖 | `Sparkles` |
| 新建 | 📄 | `FilePlus` |
| 打开 | 📂 | `FolderOpen` |
| 保存 | 💾 | `Save` |
| 导出 RPY | — | `FileDown` |
| 折叠/展开 | ▶◀ | `PanelLeftClose` / `PanelLeftOpen` |
| 钉住 | — | `Pin` |
| 撤销/重做 | — | `Undo2` / `Redo2` |
| 删除 | — | `Trash2` |
| 搜索 | — | `Search` |

> emoji 仅保留在**语义必要**处（如角色表情预览缩略），绝不再作 UI 骨架图标。

### 4.4 品牌 Mark（自定义 SVG 概念）

设计一个"织"的意象 mark：两条交缠的线（W 的变体）从一点发散，象征剧本线被编织。

```
概念草图（线性、1.75 描边、随 primary 变色）：
  /\      /\        —— 两道向上的"线"
 /  \/\  /  \        —— 在底部交织成结
 \  /  \/    \       —— 呼应 Weaver/编织
  \/      \  /
```

用于：登录/空态大字标、关于页、导出文件头注释、任务栏图标（需再出深色/浅色双版 `.ico`）。

---

## 5. UX 交互与排版布局

### 5.1 排版（Typography）

- **字号下限 12px**（消除 `text-[10px]`）；正文基准 **13px**，舒适模式 14px。
- **字重克制**：常规 400、强调 500/600，标题至多 600（避免 700 的笨重感）。
- **字体栈**：
  - UI 无衬线：`"Inter", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`（建议引入 Inter 提升拉丁字符精致度，CJK 回退系统字体）。
  - 等宽（行号 / Delta / 代码）：`"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace` —— 用于时间轴行号、StagePreview 的 slot 坐标、导出预览。
- **层级规范**：
  - Eyebrow（区块小标题）：`text-[11px] font-semibold uppercase tracking-wider text-tertiary`
  - Panel 标题：`text-[13px] font-semibold text-primary`
  - Body：`text-[13px] leading-relaxed text-secondary`
  - Meta：`text-[11px] text-tertiary`

### 5.2 间距（Spacing，8px 基线网格）

统一内边距节奏：面板 `p-4(16)`、卡片 `p-3(12)`、列表行 `px-3 py-2.5`、区块间距 `gap-3(12)`/`gap-4(16)`、分组留白 `space-y-3`。彻底告别零散的 `px-2 py-1` 与 `gap-1.5` 混用。

### 5.3 微交互（Hover / 点击 / 联动）

| 元素 | 常态 | Hover | Active / 点击 | 进场 |
|---|---|---|---|---|
| 按钮（主） | `bg-primary` | `bg-primary-hover` + `shadow-2` | `translate-y-px` + `bg-primary-active` | — |
| 按钮（次/图标） | `text-secondary` | `bg-ink-700 text-primary` + `border-strong` | `scale-[.97]` | — |
| 卡片/素材 | `border` | `border-strong` + `shadow-1` + 顶边高光 | — | `animate-fade-in` |
| 导航项激活 | `primary-soft` 背景 + 左侧 2px 紫毫竖条 + 轻微 glow | — | — | 竖条 `transition-all` |
| 列表行（剧本流） | 透明 | `bg-ink-700` | — | 行高亮 `transition-colors 150ms` |
| 时间轴色块 | 语义色块 | 上浮 1px + `shadow-1` + 端点圆角 | 点击联动选中 | `transition 200ms` |
| 抽屉 | 三态 | 半展开时遮罩 `backdrop-blur-xl` | 按下把手 `scale` | `cubic-bezier(.22,1,.36,1) 240ms` |

- **动效曲线**：颜色/背景用 `cubic-bezier(.4,0,.2,1)` 150ms；位移/缩放进场用 `cubic-bezier(.22,1,.36,1)` 200–240ms（轻微回弹的"高级感"）。
- **按下反馈**：所有按钮 `active:translate-y-px active:scale-[.98]`，给"实体操作感"。
- **`prefers-reduced-motion`**：全局关闭非必要位移/淡入，仅保留颜色瞬变。

### 5.4 焦点与键盘（硬补全）

- 全站 `:focus-visible` 紫毫环（见 3.5）。
- 图标按钮一律加 `aria-label`；导航 `role="navigation"` + `aria-current="page"`。
- Toast 容器加 `role="status" aria-live="polite"`。
- 模态：`role="dialog" aria-modal="true"` + Esc 关闭 + 焦点陷阱。

### 5.5 反馈与状态

- 用自建 `ConfirmDialog`（玻璃模态）替换原生 `confirm()`/`alert()`。
- 异步按钮显示 loading（spinner + disabled + 文案"导出中…"）。
- 搜索/输入加可见 `<label>` 或 `aria-label`，必填项 `*` 用 `--danger`。
- 长列表（素材库/角色/剧本流）虚拟滚动，避免百条卡顿。
- 骨架屏 shimmer 替代空白加载。

---

## 6. 深浅色主题切换 —— 技术实现（硬性需求落地）

### 6.1 架构选择

采用 **「语义 CSS 变量 + 显式 `data-theme` + Tailwind 语义色映射」**，而非逐元素 `dark:` 分支。好处：组件零主题分支、切换零闪烁、易扩展第三主题。

### 6.2 Tailwind 配置（`tailwind.config.js`）

```js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'], // 支持必要时 dark: 微调
  theme: {
    extend: {
      colors: {
        // 全部走 CSS 变量通道，支持 <alpha-value>
        'ink-950': 'rgb(var(--ink-950) / <alpha-value>)',
        'ink-900': 'rgb(var(--ink-900) / <alpha-value>)',
        'ink-800': 'rgb(var(--ink-800) / <alpha-value>)',
        'ink-700': 'rgb(var(--ink-700) / <alpha-value>)',
        'border-subtle': 'rgb(var(--border-subtle) / <alpha-value>)',
        'border-base':  'rgb(var(--border) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary) / <alpha-value>)',
        'primary': 'rgb(var(--primary) / <alpha-value>)',
        'accent': 'rgb(var(--accent) / <alpha-value>)',
        'success': 'rgb(var(--success) / <alpha-value>)',
        'warning': 'rgb(var(--warning) / <alpha-value>)',
        'danger':  'rgb(var(--danger) / <alpha-value>)',
        'info':    'rgb(var(--info) / <alpha-value>)',
      },
      borderRadius: { xs:'4px', sm:'6px', md:'8px', lg:'12px', xl:'16px' },
      boxShadow: {
        '1':'var(--shadow-1)','2':'var(--shadow-2)','3':'var(--shadow-3)',
        'inset-top':'var(--shadow-inset-top)',
      },
      fontFamily: {
        sans: ['Inter','"PingFang SC"','"Noto Sans SC"','sans-serif'],
        mono: ['"JetBrains Mono"','ui-monospace','monospace'],
      },
    },
  },
}
```

> 变量以**通道值**存储（如 `--ink-950: 10 11 14;`），才能被 `rgb(var(--x) / <alpha-value>)` 正确解析并支持 `/40` 透明度。

### 6.3 变量定义（`src/index.css`）

```css
:root,                      /* 默认 = 浅色「纸」 */
[data-theme="light"] {
  --ink-950: 242 241 236;  /* #F2F1EC */
  --ink-900: 247 246 242;
  --ink-800: 255 255 255;
  --ink-700: 236 233 227;
  --border: 28 24 18;      /* 存通道，透明度在类里给 */
  --border-subtle: 28 24 18;
  --text-primary: 28 27 25;
  --text-secondary: 86 82 76;
  --primary: 90 79 224;    /* #5A4FE0 */
  --accent: 61 214 196;
  --success: 52 211 153; --warning: 251 191 36;
  --danger: 251 113 133; --info: 96 165 250;
  --shadow-1: 0 1px 2px rgba(28,24,18,.06), 0 1px 3px rgba(28,24,18,.04);
  --shadow-2: 0 4px 16px rgba(28,24,18,.10);
  --shadow-3: 0 24px 64px rgba(28,24,18,.16);
  --shadow-inset-top: inset 0 1px 0 rgba(255,255,255,.70);
  color-scheme: light;
}

[data-theme="dark"] {       /* 深色「墨」 */
  --ink-950: 10 11 14;      /* #0A0B0E */
  --ink-900: 15 17 21;
  --ink-800: 25 28 34;
  --ink-700: 38 43 52;
  --border: 255 255 255;    /* 透明度在类里给，如 border-white/[.10] */
  --border-subtle: 255 255 255;
  --text-primary: 231 233 238;
  --text-secondary: 160 166 178;
  --primary: 109 94 252;    /* #6D5EFC */
  --accent: 61 214 196;
  --success: 52 211 153; --warning: 251 191 36;
  --danger: 251 113 133; --info: 96 165 250;
  --shadow-1: 0 1px 2px rgba(0,0,0,.40);
  --shadow-2: 0 4px 12px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.50);
  --shadow-3: 0 16px 48px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.40);
  --shadow-inset-top: inset 0 1px 0 rgba(255,255,255,.05);
  color-scheme: dark;
}

/* 全局过渡：主题切换时平滑，但避免对布局属性过渡 */
@layer base {
  * { border-color: rgb(var(--border) / .10); }
  body { background: rgb(var(--ink-950)); color: rgb(var(--text-primary)); }
  :focus-visible { outline: none;
    box-shadow: 0 0 0 2px rgb(var(--ink-900)), 0 0 0 4px rgb(var(--primary) / .6); }
  @media (prefers-reduced-motion: reduce) {
    *,*::before,*::after { transition-duration: .01ms !important; animation: none !important; }
  }
}
```

### 6.4 状态与切换逻辑（Zustand + 持久化）

在 `src/stores/appStore.ts` 增加主题切片（不动既有 Delta/联动逻辑）：

```ts
type ThemeMode = 'dark' | 'light'        // 可扩展 'system'
interface ThemeSlice {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  toggleTheme: () => void
}
// 持久化：localStorage key "sw-theme"，默认 'dark'
```

在 `AppLayout`（或独立 `<ThemeProvider>`）挂载时应用：

```ts
useEffect(() => {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  // Electron：同步原生标题栏
  window.electronAPI?.setNativeTheme?.(theme)
}, [theme])
```

### 6.5 切换入口（顶部工具栏）

在 `AppLayout.tsx` 头部右侧加入主题开关按钮（`Sun`/`Moon` 图标，lucide），点击 `toggleTheme()`，并带 200ms 图标旋转/淡入微动效。`handleSave` 中的 `alert()` 同步改为自建 `ConfirmDialog`/`Toast`。

### 6.6 Electron 协同

- `electron/main.ts` 暴露 `setNativeTheme(source: 'dark'|'light')` 经 `contextBridge` 给渲染进程，使窗口边框/标题栏跟随。
- 浏览器模式（无 `electronAPI`）优雅降级为纯 CSS 主题。

---

## 7. 分组件重构指引（逐面板落地）

| 组件 | 关键改造 |
|---|---|
| **AppLayout** | 头部改玻璃工具栏；移除 `bg-gray-950` 写死，改 `bg-ink-950`；新增主题开关；`confirm/alert`→`ConfirmDialog`；Toast 加 `aria-live`。 |
| **LeftSidebar** | emoji→lucide；激活项加左侧紫毫竖条 + `primary-soft` + glow；折叠态加 tooltip；宽度 token 化。 |
| **ManagementPanel（素材库）** | Tab 改分段控件/下划线；素材卡 `hover:shadow-1 border-strong inset-top`；缩略图 `loading="lazy"`。 |
| **StagePreview（核心锚点）** | 增加电影感暗角(vignette) + 径向柔光背板；选中行切换保留 200ms 交叉淡入；slot 标记用 `accent` 细线；整体"退后"突出预览。 |
| **ScriptDrawer** | 三态保留；半展开强化 `backdrop-blur-xl`；行高亮按"发言/背景/音频"用语义色左侧细条，直观呈现继承；当前行 `primary` 强调。 |
| **Timeline** | 轨道用语义色（背景/角色/BGM/环境/SE/语音各自低饱和色）；连续区间用同色块 + 细微连接；hover 上浮 + tooltip 行号；播放头细线。 |
| **ScriptOverview / AssetManager / CharacterManager / AIPanel / ExportSettings** | 统一卡片 + 表单模式（label、focus ring、必填 `*`、loading 按钮）；AIPanel 加"生成中"骨架 shimmer。 |
| **Toast** | 玻璃 + `shadow-2` + `aria-live="polite"`；类型色用语义 token。 |
| **Dialogs** | 玻璃模态 + `shadow-3` + `inset-top`；按钮主次分明；Esc/焦点陷阱。 |

---

## 8. 分阶段实施路线图（Spec 驱动）

| 阶段 | 目标 | 主要产出 | 破坏性 |
|---|---|---|---|
| **A. 设计地基** | 引入 `lucide-react`；`tailwind.config.js` 语义色/圆角/阴影/字体；`index.css` 双主题变量 + focus/reduced-motion；Zustand 主题切片 + 持久化；`ThemeProvider` 应用 `data-theme` | 主题可切、token 可用 | 低（仅配置） |
| **B. 基础组件库** | 抽离 `Button`/`IconButton`/`Card`/`Dialog`/`Tabs`/`Tooltip`/`Input`/`ConfirmDialog`/`Toast`，统一 focus ring 与微动效 | 可复用原语 | 中（新建文件） |
| **C. 皮肤替换** | 逐组件替换写死灰阶→语义 token；emoji→lucide；加 `aria-label` | 视觉统一 | 中 |
| **D. 质感与动效** | 微阴影/毛玻璃/内高光/圆角；hover·点击·联动微动效；骨架屏；虚拟滚动 | 高级感 | 低 |
| **E. 浅色精修 & 对比度审计** | 浅色「纸」逐页微调；`text-tertiary` 对比度达标；字号下限 12px；Electron 原生主题同步 | 双主题闭环 | 低 |

> 每阶段独立提交，阶段 A 完成即可见"一键切换深浅色"的硬性需求兑现。

---

## 9. 验收清单

- [ ] 顶部一键切换 Dark/Light，全局即时生效、无闪烁、记忆上次选择
- [ ] Electron 窗口标题栏随主题变化
- [ ] 深色：近黑冷调、紫毫主色、深夜不刺眼；浅色：暖纸调、非纯白、克制清爽
- [ ] 全站零 emoji 结构图标，lucide 线条统一（size/stroke）
- [ ] 所有可交互元素有可见 `:focus-visible` 紫毫环
- [ ] 图标按钮均有 `aria-label`；Toast `aria-live`
- [ ] 面板用"层级 + 微边框 + 微阴影 + 毛玻璃"呈现纵深，无干瘪扁平
- [ ] 圆角/阴影/间距遵循统一 token
- [ ] 悬停/点击/联动均有确定微动效；`prefers-reduced-motion` 下关闭
- [ ] 时间轴"继承"关系一眼可读；选中行联动预览 200ms 淡入
- [ ] 正文字号 ≥12px，对比度达标（正文 ≥4.5:1）
- [ ] 原生 `confirm/alert` 已全部移除

---

## 附录：Token 速查（实施时直接引用）

| 类别 | Token（Tailwind 类） |
|---|---|
| 背景层 | `bg-ink-950 / 900 / 850 / 800 / 750 / 700 / 600` |
| 边框 | `border-base`(默认低透) / `border-strong` / `border-subtle` |
| 文字 | `text-primary / secondary / tertiary / quaternary` |
| 品牌 | `bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active` `bg-primary-soft` |
| 辅色 | `text-accent` `bg-accent-soft` `ring-accent` |
| 状态 | `text-success/warning/danger/info` `bg-*-soft` |
| 阴影 | `shadow-1 / 2 / 3 / inset-top` |
| 圆角 | `rounded-xs/sm/md/lg/xl/full` |
| 字体 | `font-sans`(UI) / `font-mono`(行号·Delta) |

> 设计语言「织 / WEAVE」—— 墨与纸之间，紫毫为线，青为光。让创作者沉入故事，让工具隐于幕后。
