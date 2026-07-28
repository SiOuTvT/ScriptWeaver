import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  BookOpen, ChevronRight, Search, ExternalLink,
  HelpCircle, FileText, Keyboard, Zap, Video, Sparkles,
  Globe, Users, Download, ArrowRight, X, MessageCircle, Bug, Heart,
  ChevronDown,
} from 'lucide-react'
import { GITHUB_LINKS } from '../../data/links'
import { openExternal } from '@/utils/openExternal'

interface HelpTopic {
  id: string
  label: string
  icon: typeof BookOpen
  category: string
  sections: { id: string; title: string; content: string }[]
  links?: { label: string; url: string }[]
}

const TOPICS: HelpTopic[] = [
  {
    id: 'getting-started', label: '快速上手', icon: Zap, category: '入门指南',
    sections: [
      {
        id: 'overview', title: 'ScriptWeaver 概览',
        content: `**ScriptWeaver** 是专为 Ren'Py 视觉小说设计的全流程创作工具。它把剧本写作、立绘排布、分支管理、素材导入和导出打包在一个应用里，让你少写代码、多看画面。

整个界面分为五个主要区域：

**中央舞台 (舞台预览)**
你看到的画面就是玩家最终看到的画面。拖入角色立绘、切换背景，所见即所得。双击立绘可以调整坐标，单击旋转/缩放控制点。

**底部时间轴**
按行编辑整部剧本。每一行可以是对白、选择支、背景切换、角色入场、变量操作。选中一行，右侧会弹出属性面板供你精细调整。

**左侧栏**
集中了六个常用面板，点击图标即可切换：素材库 (管理图片音频)、场景导航 (跳转到任意场景)、AI 编剧 Copilot、语法学院 (Ren'Py 语法速查)、项目信息、设置。

**右侧栏**
角色管理 (配置角色立绘/表情/对话框样式) 和变量监视器 (调试期查看变量值变化)。

**顶部工具栏**
播放预览、添加场景、撤销/重做、项目保存等核心操作。

> 提示：所有面板都是可折叠的 Dock 抽屉，点击边缘的细轨即可收起，需要时再展开。
` },
      {
        id: 'first-script', title: '创建第一个剧本',
        content: `下面用 5 分钟手把手写出第一篇互动故事。

**第 1 步：新建项目**
启动 ScriptWeaver 后，如果没有打开的项目，会自动创建新项目。你也可以通过左侧栏底部的 **项目信息** 管理多个项目。

**第 2 步：添加角色**
打开右侧 **角色管理**，点击"添加角色"。设置：
- 显示名 (读者看到的名称，如"小樱")
- 变量名 (内部标识，如 \`heroine\`)
- 颜色主题 (决定对话框里名字的颜色)
- 默认立绘 (拖一张 PNG 进去当作这个角色的默认表情)

**第 3 步：写第一句对白**
点击时间轴里的空白行，在弹出的属性面板中选择角色 (如"小樱")，输入对白内容："你好，欢迎来到这个世界。"

**第 4 步：放上背景**
点击舞台下方的 **添加背景**，从素材库选一张背景图。舞台立刻更新。

**第 5 步：添加选择支**
在时间轴中新建一行，类型选"选择支"。输入选项文本 (如"去花园" 和 "留在房间")，并为每个选项填写跳转标签 (如 \`go_garden\` 和 \`stay_room\`)。导出后玩家就能选择了。

**第 6 步：预览**
点击顶部工具栏的播放按钮，从当前行开始预览流程。

常用快捷键速查：

| 快捷键 | 功能 |
|--------|------|
| Ctrl+K | 命令面板 |
| Ctrl+S | 保存项目 |
| Ctrl+Z | 撤销 |
| Ctrl+Shift+Z | 重做 |
| Ctrl+E | 导出到 Ren'Py |
| Tab | 缩进 |
| Enter | 添加新行 |
| Delete | 删除选中行 |` },
    ],
    links: [],
  },
  {
    id: 'editor-basics', label: '编辑器基础', icon: FileText, category: '入门指南',
    sections: [
      {
        id: 'timeline', title: '时间轴详解',
        content: `**时间轴**是 ScriptWeaver 最核心的编辑区。它以水平滚动行列表的形式展示整部剧本，从左到右依次排列。

**每行支持的类型：**
- **对白行 (say)**：指定说话角色 + 台词内容。可以带表情标签 (如 \`happy\`)，导出后角色立绘自动切换表情。
- **选择支行 (menu/choice)**：给玩家 2-4 个选项，每个选项对应一个跳转标签。选择支之间会自动插入分支体。
- **标签行 (label)**：定义跳转锚点。其他行通过 jump / call 跳到此处。
- **背景切换 (scene)**：更换舞台背景图，可附带 ATL 过场效果。
- **立绘入场/退场 (show/hide)**：让角色立绘出现或消失，可指定位置槽位 (左/中/右) 和缩放比例。
- **音频行 (play/stop)**：播放 BGM、环境音、音效、语音。
- **变量操作 (python)**：修改游戏变量，如好感度加减、开关标记等。

**操作技巧：**
- 单击某行选中，右侧弹出属性面板，可修改该行所有参数。
- 双击某行，自动在场景导航树中定位到该场景，方便大跨度导航。
- 选中行后按 Delete 直接删除，该操作会同步更新时间轴和导出数据。
- 时间轴支持单选和多选的批量操作 (按住 Shift)。` },
      {
        id: 'docks', title: 'Dock 可停靠面板',
        content: `ScriptWeaver 采用类 IDE 的可停靠布局。每个面板都是独立的 Dock，可以折叠、展开、调整大小。

**舞台 (中央区域)**
不可折叠，始终占据最大可用空间。因为它是你创作的核心视觉反馈。

**时间轴 (底部 Dock)**
默认高度 320px，可通过拖拽边界调整。折叠后仅剩 38px 的标题条，给舞台腾出更多空间。再次点击标题条即可恢复。

**左侧 Dock 组**
包含素材库、场景导航、AI 编剧、语法学院、项目信息、设置六个面板。每个面板折叠后变为 44px 的竖向细轨，只显示图标。点击图标展开面板同时自动收起上一个。

**右侧 Dock 组**
包含角色管理和变量监视器。角色管理的立绘墙、对话框样式预览是高频使用区，建议保持展开。变量监视器在调试时展开，平时收起即可。

**折叠技巧：**
- 面板内容区右上角有折叠按钮 (通常是个箭头图标)。
- 所有 Dock 的折叠状态在会话中保持，重启后恢复默认展开状态。
- 通过拖动 Dock 之间的分隔条可调整面板宽度。` },
    ],
    links: [],
  },
  {
    id: 'ai-copilot', label: 'AI 编剧 Copilot', icon: Sparkles, category: 'AI 功能',
    sections: [
      {
        id: 'ai-modes', title: '三种 AI 模式',
        content: `AI 编剧 Copilot 位于左侧栏第四个面板，提供三种创作辅助模式，用标签页切换。

**舞台监督模式**
你描述一个场景的意图 (例如："女主角在天台独自回忆，情绪低落")，AI 会返回：
- 建议的角色调度 (谁入场、站哪、什么表情)
- 建议的演出节奏 (音乐切入时机、停顿节奏)
- 隐含的情感弧线和节点提示
输出以导演注释的形式呈现，你可以选择性采纳，不会被强制插入时间轴。

**文学导师模式**
分析已有剧本片段的文学质量。粘贴一段对白或叙述，AI 诊断：
- 角色台词是否千人一面 (有没有辨识度)
- 节奏是否单调 (全是短句或全是长段的毛病)
- 信息密度是否过大 (读者跟不上的地方)
- 情感转折是否突兀
诊断结果带具体行号和修改建议，可直接对应到时间轴里的行。

**剧情蓝图模式 (最强)**
输入核心梗概 (一段中文描述)，可选设定期望的分支数和结局数。AI 返回一张网状分歧剧情树：
- 每个节点包含场景标签 (label)、对白概要、角色情绪、背景设定
- 分支边自动附带选择支文本和变量操作 (如 \`heroine_trust += 1\`)
- 结局节点自动标红，附带结局条件 (如 \`heroine_trust >= 5\`)

生成后可预览剧情树、查看每行的 AI 素材解析报告，然后选择三种方式应用到时间轴：
- **整体替换**：清空时间轴，放入完整蓝图
- **插入到当前行后**：在当前选中位置后追加新剧情块
- **替换选中剧情块**：按 label 范围覆盖特定区间

> 提示：剧情蓝图适合构思阶段，文学导师适合打磨阶段，舞台监督适合卡壳时找灵感。` },
      {
        id: 'ai-config', title: 'AI 配置说明',
        content: `使用 AI 功能前需要在设置中完成 API 配置。

**配置步骤：**
1. 点击左侧栏底部的 **设置 (#11)** 图标
2. 找到 **AI 配置** 分区
3. 填入你的 API 密钥 (需来自 OpenAI 兼容服务商)
4. 可修改端点 URL (默认是 OpenAI 官方地址，也可用第三方代理)
5. 选择模型 (影响回复质量与速度)

**支持的模型与推荐场景：**

| 模型 | 推荐场景 | 特点 |
|------|---------|------|
| GPT-4 / GPT-4 Turbo | 剧情蓝图、文学导师 | 理解力最强，生成质量最高 |
| GPT-3.5 Turbo | 舞台监督、快速试稿 | 速度快、成本低 |
| Claude 3 Opus / Sonnet | 文学导师 | 中文表现优秀 |
| DeepSeek Chat | 预算有限时 | 国产模型、性价比高 |

**安全说明：**
- API Key 加密存储在本地，永不离开你的电脑
- 所有 AI 请求设置了 180 秒总超时 + 30 秒静默断流保护
- 报错以中文友好提示呈现，不会界面假死
- 窗口内不会暴露完整密钥 (仅显示部分字符)` },
    ],
    links: [],
  },
  {
    id: 'assets', label: '素材管理', icon: Download, category: '素材与资源',
    sections: [
      {
        id: 'import-assets', title: '导入与管理素材',
        content: `素材库位于左侧栏第一个面板 (图标：图片)。管理剧中用到的所有背景图、角色立绘、音频文件。

**导入素材的两种方式：**
1. **拖拽导入 (推荐)**：从 Windows 文件管理器直接把图片或音频文件拖入素材库区域，会显示拖放遮罩提示。
2. **文件选择器**：点击素材库顶部的"导入"按钮，在弹出对话框中选择文件。

**支持的格式：**
- 图片：PNG、JPG、WebP (透明 PNG 立绘会显示棋盘格底衬)
- 音频：WAV、MP3、OGG

**素材存储机制：**
导入后文件会被复制到应用的持久化存储区 (位于 userData 目录)，不会直接引用原始路径。这样做的好处：
- 项目打包不发散，不会因为原文件移动而断裂
- 通过内置的 sw-asset 私有协议流式读取，不把整图塞进内存
- 保存项目文件 (.swproj) 时只存相对路径，不暴露磁盘真实路径

**音频分类识别：**
素材库会根据文件名自动识别音频类别：
- 含 \`_bgm_\` 的标记为背景音乐
- 含 \`_ambient_\` 的标记为环境音
- 含 \`_se_\` 的标记为音效
- 含 \`_voice_\` 的标记为角色语音
建议导入前用此规则命名文件，便于后续管理。` },
      {
        id: 'organize', title: '素材组织与引用',
        content: `素材库提供了丰富的组织功能，方便管理大量素材。

**分类筛选**
左侧分类树按类型快速过滤：全部、背景、立绘、音频、视频 (待开放)、特效预设 (待开放)。每个分类旁边显示当前数量。

**搜索与排序**
顶部搜索栏支持按文件名即时筛选。右侧排序下拉可选：最近导入、按名称、按类型。

**视图切换**
支持三种网格密度 (紧凑 / 标准 / 大图) 和列表视图。列表视图额外展示分辨率、文件体积、导入日期等列。

**素材卡片操作：**
- **右键** 弹出菜单：重命名、删除、查看引用
- **拖入舞台** 或拖入角色管理器可直接配置为背景/立绘
- 图片卡片悬浮放大预览 (立绘透明图棋盘格底衬)
- 音频卡片自带波形播放器：点击播放/暂停、拖动进度条、调节音量

**引用检索：**
在素材卡片的右键菜单中选择"查看引用"，弹窗会列出剧本中所有用到该素材的行。点击行号可跳转到时间轴对应位置——这个功能在清理未使用的素材时非常有用。

**删除保护：**
如果素材正在被某个剧本行引用，删除时会弹出警告，防止误删后时间轴出现断链。` },
    ],
    links: [],
  },
  {
    id: 'renpy-hub', label: "Ren'Py 生态", icon: Globe, category: "Ren'Py 知识库",
    sections: [
      {
        id: 'audit', title: '特效全量审计',
        content: `Ren'Py 生态大厅 (左侧栏 #06) 对 Ren'Py 视觉特效做了完整的覆盖率审计，共 19 大类。

**已全覆盖 (16 类，ScriptWeaver 导出直接支持)：**

| 类别 | 具体内容 |
|------|---------|
| 基础转场 | dissolve / fade / pixellate / move / wipe |
| 裁剪 | crop 属性，按坐标裁切图像 |
| 位移 | xoffset / yoffset / xpos / ypos 坐标变换 |
| 缩放 | zoom 属性，等比缩放立绘 |
| 透明度 | alpha 属性，控制显隐 |
| 位置变换 | xalign / yalign / xanchor / yanchor |
| 颜色 | matrixcolor、TintMatrix、BrightnessMatrix |
| 裁剪角 | corner1 / corner2 四角变形 |
| 3D 仿射 | perspective / matrixtransform |
| 缓动 | ease / easein / easeout / linear / 自定义贝塞尔 |
| ATL 语句 | parallel / choice / repeat / block |
| 内置定位 | left / right / center / truecenter |
| 3D 舞台 | camera / 3D layer |
| 粒子 | SnowBlossom 等内置粒子 |
| 矩阵滤镜 | Blur、Hue、Saturation 等矩阵变换 |

**补充覆盖 (3 类，含代码范例)：**
- QTE 限时选择：通过 screen timer + action Jump 实现
- NVL 小说模式：nvl clear / nvl show 语法链
- 后处理滤镜：CRT 扫描线、VHS 噪点、暗角

每个特效条目附带 Ren'Py 原生代码范例，可直接复制到导出的 script.rpy 中使用。` },
      {
        id: 'plugins', title: '社区插件 Hub',
        content: `插件 Hub 收录了 12 个经过验证的高质量 Ren'Py 开源插件，按 6 个功能方向分类。

**角色表演 (3 个)：**
- **Live2D 集成**：在 Ren'Py 中播放 Live2D 模型动画，替代静态立绘
- **Kinetic 动态文字**：台词逐字弹出、抖动、缩放等动态效果
- **立绘自动口型**：根据语音时长自动切换口型图片序列

**UI 界面 (3 个)：**
- **手机短信模拟**：模拟即时通讯聊天界面，适合现代题材
- **CG 鉴赏厅**：通关后解锁的画廊模式，含缩略图网格和全屏查看
- **音乐鉴赏厅**：BGM 播放器、曲目列表、解锁条件

**小游戏 (3 个)：**
- **小游戏模板**：翻牌记忆、接东西等迷你游戏的框架
- **QTE 限时选择**：倒计时内做出选择，含成功/失败分支
- **好感度日程**：日历 UI 选择每日行动，影响角色好感

**系统引擎 (2 个)：**
- **日历时间系统**：日期推进、星期循环、季节变化、时间段切换
- **成就系统**：定义成就条件，注册触发事件，展示成就弹窗

**视觉滤镜 (2 个)：**
- **天气粒子**：下雨、下雪、落叶等环境粒子效果
- **后处理滤镜**：CRT 扫描线、VHS 磁带噪点、暗角遮罩

**NVL 扩展 (1 个)：**
- **NVL 风格包**：字体、间距、颜色方案等多套 NVL 视觉预设

每个插件页面包含：简介、接口预览、代码范例、安装步骤。部分插件支持一键插入当前项目的 script.rpy。` },
      {
        id: 'academy', title: '语法学院',
        content: `语法学院位于左侧栏第三个面板，收录 40+ 条 Ren'Py 语法教程，按从入门到高阶的严格顺序排列。

**入门基础：**
台词与对话、角色出场 (show)、分支与选择 (menu)、变量与判定 (if/else)、音频播放、对话框样式、文本插值、场景过渡 (with/transition)、自定义过渡 (ATL)、条件表达式、视频播放、角色位置槽位

**中级进阶：**
ATL 路径动画、ATL 事件回调、ATL 运镜、ATL 文字特效、NVL 模式入门、Screen 自定义界面、Screen 动作与按钮、Screen 定时器与进度条、Screen 输入框、Screen 属性继承、流程控制 (jump/call/return)、存档 Label (save_name)、回滚控制、Python 代码块、多音频通道混音

**高阶实战：**
分层立绘 (layeredimage)、矩阵滤镜操作、im 图像变换 (im.Scale/im.Flip 等)、持久化数据 (persistent)、成就系统实现、音频与对白同步、多语言翻译支持、Ren'Py 性能调优、游戏打包发布

每条教程结构统一：**功能作用 + 通俗解释 + 真实代码范例 + 避坑提示**。不堆砌机械文档，而是讲清楚"做什么"和"注意什么"。` },
    ],
    links: [],
  },
  {
    id: 'export', label: '导出与发布', icon: ExternalLink, category: '导出与发布',
    sections: [
      {
        id: 'renpy-export', title: "导出到 Ren'Py 工程",
        content: `将 ScriptWeaver 项目一键导出为标准 Ren'Py 目录结构，可直接用 Ren'Py SDK 打开运行。

**操作步骤：**
1. 点击顶部工具栏的 **导出到 Ren'Py** 按钮 (或按 Ctrl+E)
2. 在弹出的对话框中选择目标目录 (建议选 Ren'Py SDK 的 projects 文件夹下)
3. 等待导出完成 (进度条会显示当前阶段)

**导出产物：**
- \`script.rpy\`：主剧本文件，包含所有对白、选择支、标签、变量操作、过场指令
- \`images/\` 目录：所有用到的图片素材 (PNG/JPG/WebP)
- \`audio/\` 目录：所有用到的音频素材 (WAV/MP3/OGG)
- \`gui/\` 目录：默认的 UI 资源文件 (如果项目没自定义 GUI 则使用模板)

**导出规则 (详见 Ren'Py Scripting Manual)：**
- 立绘的缩放比例通过标准 \`zoom\` 属性生成 (不再生成非法语法)
- 立绘位置通过 \`at left\` / \`at right\` 等标准定位
- 所有非内置过场效果会自动生成对应的 \`transform\` 定义
- 选择支会转换为标准 \`menu:\` 代码块
- 变量操作 (python 行) 会被包裹在 \`python:\` 块或使用 \`$\` 前缀
- 缺失素材的行会生成注释 \`# TODO: missing asset ...\` 而非损坏代码

**注意事项：**
- 导出前请确保项目已保存。素材库中的素材会随 .swproj 一同导出。
- 建议导出后用 Ren'Py SDK 的执行器试跑一遍，确认所有素材路径正确。
- 如需反复导出调试，建议固定使用同一个目标目录，避免重复复制素材。` },
      {
        id: 'multi-export', title: '多格式导出',
        content: `除 Ren'Py 工程外，ScriptWeaver 还支持四种轻量导出格式，适合分享、审阅、打印等非游戏场景。

**四种格式对比：**

| 格式 | 输出内容 | 适用场景 |
|------|---------|---------|
| Markdown (.md) | 带格式的剧本全文，含标题层级 | 发给编剧/制作人审阅 |
| 纯文本 (.txt) | 只保留台词文本，去掉指令 | 快速查看纯对白流程 |
| HTML 打印 (.html) | 网页排版，分页友好 | 打印纸质剧本/存档 |
| CV 台词表 (.csv) | 按角色分组的台词统计表 | 声优配音时按角色查看台词 |

**使用方式：**
1. 打开左侧栏的 **多格式导出 (#09)** 面板
2. 选择导出格式
3. (可选) 指定角色过滤——只导出来些角色的台词
4. 面板右侧会实时预览前 80 行
5. 点击下载按钮获取完整文件

> 提示：CSV 台词表格式为 "角色名，台词内容，行号"，可直接用 Excel 或 WPS 打开。` },
    ],
    links: [],
  },
  {
    id: 'shortcuts', label: '快捷键', icon: Keyboard, category: '参考',
    sections: [
      {
        id: 'all-shortcuts', title: '全部快捷键速查',
        content: `以下快捷键在 ScriptWeaver 全局可用 (部分需焦点在时间轴编辑区)。

**文件与项目：**

| 快捷键 | 功能 |
|--------|------|
| Ctrl+S | 保存当前项目 |
| Ctrl+E | 导出到 Ren'Py 工程 |
| Ctrl+K | 打开命令面板，快速搜索所有功能 |

**编辑操作：**

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Z | 撤销上一步操作 |
| Ctrl+Shift+Z | 重做被撤销的操作 |
| Tab | 缩进当前行 (用于选择支内的子行) |
| Enter | 在当前选中的行下方添加新行 |
| Delete / Backspace | 删除当前选中的行或元素 |

**舞台操作：**

| 快捷键 | 功能 |
|--------|------|
| 鼠标拖动立绘 | 调整立绘在舞台上的位置 |
| 双击立绘 | 打开该立绘的属性面板 (调整坐标/缩放) |
| Delete (选中时) | 从舞台上移除该立绘 |

**导航与界面：**

| 快捷键 | 功能 |
|--------|------|
| Esc | 关闭当前弹出面板或取消选择 |
| 鼠标滚轮 | 在时间轴上水平滚动 |
| Ctrl+滚轮 | 缩放舞台画面 |

> 提示：在命令面板 (Ctrl+K) 中可以直接搜索任何功能名称并执行，无需记快捷键。` },
    ],
    links: [],
  },
  {
    id: 'faq', label: '常见问题', icon: HelpCircle, category: '支持',
    sections: [
      {
        id: 'faq-items', title: 'FAQ 常见问题与解答',
        content: `**Q：素材导入后舞台上看不到，或者图片显示裂开？**
A：请确认你在 Electron 本机应用内使用 ScriptWeaver，而不是用浏览器打开 localhost 页面。素材通过 sw-asset 私有协议加载，普通浏览器不认识该协议 —— 这会导致所有图片音频加载失败。正确的调试方式是在 Electron 窗口内操作，不要用外部浏览器打开 dev 页面测试。

**Q：AI 功能点上去没反应，或者报网络错误？**
A：三步排查：① 确认设置中的 API Key 已填入且未过期；② 确认端点 URL 格式正确 (参考服务商文档)；③ 检查网络是否能访问该端点 (某些代理需要关闭 VPN)。AI 请求有 180 秒超时保护，超时会弹出中文错误提示，不会一直转圈。

**Q：导出 Ren'Py 后，打开 script.rpy 发现素材路径不对？**
A：请确认两件事：① 导出前已保存项目 (.swproj)；② 导出时选择的目标目录正确。素材文件是和 script.rpy 一起写到目标目录的 images/ 和 audio/ 子文件夹下。如果后续又删了 .swproj 中的某些素材，需要重新导出。

**Q：角色立绘重叠在一起了怎么办？**
A：每个立绘有独立 ID，不会互相覆盖。如果位置重叠，在舞台上双击立绘打开属性面板，调整 X/Y 坐标或选择预置槽位 (左/中/右)。新拖入的立绘会使用你在角色管理里设置的默认位置槽位和默认缩放比例。

**Q：不小心删了一行，能恢复吗？**
A：可以，按 Ctrl+Z 撤销删除。ScriptWeaver 支持完整的撤销/重做栈，不仅限于单步操作。

**Q：怎么看我之前做过哪些版本的修改？**
A：打开左侧栏的 **版本历史** 页面。每次保存会生成一个快照，可以看到两个版本之间的差异对比 (新增/修改/删除的行)，也可以回退到之前的快照。

**Q：多个 .swproj 项目怎么管理？**
A：打开左侧栏的 **项目信息** 面板，可以查看当前项目路径，新建项目或打开已有的 .swproj 文件。多个项目互不影响。

**Q：快捷键可以和 Ren'Py SDK 一致吗？**
A：ScriptWeaver 是独立的 Electron 应用，有自己的快捷键体系。不过最常用的 Ctrl+S (保存) 和 Ctrl+Z (撤销) 和 Ren'Py SDK 的快捷键一致。` },
    ],
    links: [
      { label: 'GitHub 仓库', url: GITHUB_LINKS.repo },
      { label: '报告 Bug', url: GITHUB_LINKS.newBug },
      { label: '功能建议', url: GITHUB_LINKS.newFeature },
      { label: '反馈与建议', url: GITHUB_LINKS.issues },
      { label: "Ren'Py 官方文档", url: 'https://renpy.org/doc/html/' },
    ],
  },
]


export default function HelpCenter() {
  const [selectedTopic, setSelectedTopic] = useState<string>('getting-started')
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [activeSection, setActiveSection] = useState<string>('')

  const topic = TOPICS.find((t) => t.id === selectedTopic) ?? TOPICS[0]
  const contentRef = useRef<HTMLDivElement>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, HelpTopic[]>()
    TOPICS.forEach((t) => {
      const existing = map.get(t.category) ?? []
      existing.push(t)
      map.set(t.category, existing)
    })
    return Array.from(map.entries())
  }, [])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    const results: { topicId: string; sectionId: string; title: string }[] = []
    TOPICS.forEach((t) => {
      t.sections.forEach((s) => {
        if (s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)) {
          results.push({ topicId: t.id, sectionId: s.id, title: s.title })
        }
      })
    })
    return results.slice(0, 10)
  }, [searchQuery])

  const handleSearchSelect = (topicId: string, sectionId: string) => {
    setSelectedTopic(topicId)
    setSearchQuery('')
    setTimeout(() => {
      document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // IntersectionObserver to track visible sections for right TOC
  useEffect(() => {
    const container = contentRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id)
        }
      },
      { rootMargin: '-40px 0px -60% 0px', threshold: 0 }
    )
    const sectionEls = container.querySelectorAll('[id^="section-"]')
    sectionEls.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [topic.id])

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(`section-${sectionId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="flex h-full flex-1 min-w-0 select-none">
      {/* ====== Left Nav: 可展开收起的分类目录树 ====== */}
      <div className="w-[200px] shrink-0 border-r border-edge/10 flex flex-col">
        <div className="px-4 py-4 border-b border-edge/10">
          <div className="flex items-center gap-2">
            <BookOpen size={17} className="text-primary" />
            <span className="text-[15px] font-semibold text-fg">帮助中心</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {grouped.map(([category, topics]) => (
            <div key={category} className="mb-3">
              {/* 分类标题——可点击展开/收起 */}
              <button
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-fg-faint uppercase tracking-[0.06em] hover:text-fg-muted transition-colors"
              >
                <ChevronDown
                  size={12}
                  strokeWidth={2}
                  className={`shrink-0 transition-transform ${collapsedCategories.has(category) ? '-rotate-90' : ''}`}
                />
                {category}
              </button>
              {!collapsedCategories.has(category) && topics.map((t) => {
                const Icon = t.icon
                const active = selectedTopic === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTopic(t.id)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-left transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary border border-primary/15 font-medium'
                        : 'text-fg-muted hover:text-fg hover:bg-surface-2/60 border border-transparent'
                    }`}
                  >
                    <Icon size={16} className={active ? 'text-primary' : ''} />
                    <span className="truncate">{t.label}</span>
                    {active && <span className="ml-auto w-1 h-4 rounded-full bg-primary/60 shrink-0" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ====== Middle Content: 高可读性 Markdown 正文 ====== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search bar */}
        <div className="shrink-0 border-b border-edge/10 px-6 py-3.5">
          <div className="relative max-w-[680px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索帮助内容..."
              className="w-full rounded-lg border border-edge/10 bg-surface pl-10 pr-4 py-2 text-[14px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg">
                <X size={14} />
              </button>
            )}
          </div>
          {/* Search Results Dropdown */}
          {searchResults && (
            <div className="mt-2 absolute z-20 left-6 right-6 max-w-[680px] rounded-lg border border-edge/10 bg-surface shadow-lg overflow-hidden">
              {searchResults.length === 0 ? (
                <div className="px-4 py-3 text-[14px] text-fg-muted text-center">未找到匹配内容</div>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={`${r.topicId}-${r.sectionId}`}
                    onClick={() => handleSearchSelect(r.topicId, r.sectionId)}
                    className="w-full text-left px-4 py-2.5 text-[14px] text-fg hover:bg-surface-hover/40 border-b border-edge/8 last:border-b-0 flex items-center gap-2 transition-colors"
                  >
                    <Search size={13} className="text-fg-faint shrink-0" />
                    <span className="truncate">{r.title}</span>
                    <ChevronRight size={13} className="text-fg-faint ml-auto shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Scrollable content area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-[680px] mx-auto px-8 py-8">
            {/* Topic Title */}
            <div className="mb-8 pb-6 border-b border-edge/10">
              <div className="flex items-center gap-2.5 mb-2">
                {React.createElement(topic.icon, { size: 22, className: 'text-primary' })}
                <h1 className="text-[18px] font-semibold text-fg">{topic.label}</h1>
              </div>
              <span className="text-[14px] text-fg-faint">{topic.category}</span>
            </div>

            {/* Sections — 干净正文布局，无卡片包裹 */}
            <div className="space-y-10">
              {topic.sections.map((section) => (
                <div key={section.id} id={`section-${section.id}`} className="scroll-mt-6">
                  <h2 className="text-[16px] font-semibold text-fg mb-4 pb-2 border-b border-edge/8">
                    {section.title}
                  </h2>
                  <div className="prose-help max-w-none">
                    {renderMarkdown(section.content)}
                  </div>
                </div>
              ))}
            </div>

            {/* Links */}
            {topic.links && topic.links.length > 0 && (
              <div className="mt-10 pt-6 border-t border-edge/10">
                <h3 className="text-[13px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-3">相关链接</h3>
                <div className="flex flex-wrap gap-2">
                  {topic.links.map((link) => (
                    <button
                      key={link.label}
                      onClick={() => openExternal(link.url)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-edge/10 bg-surface-2 px-3 py-2 text-[14px] text-fg-muted hover:text-fg hover:border-edge/20 transition-colors"
                    >
                      <ExternalLink size={13} />
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback — 简洁区块 */}
            <div className="mt-12 pt-6 border-t border-edge/10">
              <div className="flex items-center gap-3 mb-3">
                <MessageCircle size={18} className="text-primary" />
                <span className="text-[15px] font-medium text-fg">还有问题？</span>
              </div>
              <p className="text-[14px] text-fg-subtle mb-4">直接到 GitHub 反馈，我们会持续跟进。</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openExternal(GITHUB_LINKS.newBug)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-edge/10 bg-surface-2 px-3 py-2 text-[14px] text-fg-subtle hover:text-fg hover:border-edge/20 transition-colors"
                >
                  <Bug size={15} className="text-rose-400" />
                  报告 Bug
                </button>
                <button
                  onClick={() => openExternal(GITHUB_LINKS.newFeature)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-edge/10 bg-surface-2 px-3 py-2 text-[14px] text-fg-subtle hover:text-fg hover:border-edge/20 transition-colors"
                >
                  <Heart size={15} className="text-violet-400" />
                  功能建议
                </button>
                <button
                  onClick={() => openExternal(GITHUB_LINKS.issues)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-edge/10 bg-surface-2 px-3 py-2 text-[14px] text-fg-subtle hover:text-fg hover:border-edge/20 transition-colors"
                >
                  <MessageCircle size={15} className="text-sky-400" />
                  反馈与建议
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== Right TOC: On this page 悬浮导航 ====== */}
      <div className="w-[180px] shrink-0 border-l border-edge/10 overflow-y-auto">
        <div className="sticky top-0 px-3 py-5">
          <div className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-3 px-1">
            页面目录
          </div>
          <nav className="space-y-0.5">
            {topic.sections.map((s) => {
              const isActive = activeSection === `section-${s.id}`
              return (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`w-full text-left pl-3 pr-2 py-1.5 text-[13px] rounded-md transition-colors border-l-2 truncate ${
                    isActive
                      ? 'text-primary border-primary bg-primary/[0.04] font-medium'
                      : 'text-fg-muted border-transparent hover:text-fg hover:border-edge/20 hover:bg-surface-2/60'
                  }`}
                >
                  {s.title}
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </div>
  )
}

// ── Simple Markdown Renderer (unchanged) ──────────────────────────
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === '') { i++; continue }

    // Heading
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-[14px] font-medium text-fg mt-4 mb-2">{line.slice(4)}</h3>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-[15px] font-medium text-fg mt-4 mb-2">{line.slice(3)}</h2>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-[16px] font-semibold text-fg mt-4 mb-2">{line.slice(2)}</h1>)
      i++; continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]); i++
      }
      const headerCells = tableLines[0]?.split('|').filter(Boolean).map((c) => c.trim()) ?? []
      const rows = tableLines.slice(2).map((r) => r.split('|').filter(Boolean).map((c) => c.trim()))
      elements.push(
        <div key={key++} className="overflow-x-auto my-3 rounded-lg border border-edge/10">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface-2/60">
                {headerCells.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-medium text-fg-muted border-b border-edge/10">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-edge/8 last:border-b-0">
                  {row.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 text-fg">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]); i++
      }
      i++
      elements.push(
        <pre key={key++} className="bg-surface-2/80 rounded-lg border border-edge/10 p-3 my-3 overflow-x-auto text-[13px] font-mono text-fg-muted whitespace-pre-wrap">
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // Bullet list
    if (line.match(/^[\*\-\d]\.?\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[\*\-\d]\.?\s/)) {
        items.push(lines[i].replace(/^[\*\-\d]\.?\s/, '')); i++
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside my-2 space-y-1 text-[14px] text-fg leading-relaxed">
          {items.map((item, ii) => <li key={ii}>{renderInlineMarkdown(item)}</li>)}
        </ul>
      )
      continue
    }

    // Paragraph
    elements.push(
      <p key={key++} className="text-[14px] text-fg leading-relaxed my-2">{renderInlineMarkdown(line)}</p>
    )
    i++
  }

  return elements.length > 0 ? elements : <p className="text-[14px] text-fg-muted italic">暂无内容</p>
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    const codeParts = part.split(/(`[^`]+`)/g)
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return <code key={j} className="font-mono text-[13px] bg-surface-2/80 px-1 rounded">{cp.slice(1, -1)}</code>
      }
      return cp
    })
  })
}
