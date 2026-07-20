# ScriptWeaver v0.3.0 发行说明

**发布日期**：2026-07-20
**适用升级**：从 v0.2.0 升级
**涵盖范围**：v0.2.0 至今的全部新增、改进与修复（基于 git 提交 v0.2.0..v0.3.0 共 24 个提交整理）

---

## ✨ 新增功能

### 1. 特效大本营（Effects Lab）
全新特效浏览与实时预览引擎，可在软件内直接预览 Ren'Py 特效效果并对照作者指南。
- **预览引擎（EffectPlayer）**：基于 Web 动画渲染 PreviewSpec 演示（过渡 / 变换 / warpers / 描边闪烁等），单精灵层 + 强重置语义，避免特效叠加；支持时长 / 幅度参数化。
- **预览舞台（PreviewStage）**：单精灵元素 + 背景 / 精灵资源选择（本地上传）、aspect-video 布局、key 重挂载强制干净重启、对话层 / 闪光 / 球 / 字幕分层。
- **特效百科（effectEncyclopedia）**：15 个专题（基础 / atl / builtin / crop / impact / movement / stage3d / tfcolor / tfcrop / tfpan / tfpos / tfrot / warpers / zoom），每条含作者指南 artGuide、参数手册 paramManual、CSS 实现 cssImpl、性能提示 perfTips、参数表；缺数据时回退到既有 params/syntax。
- **导航与入口**：左侧 TOC 目录导航 + 大纲平滑跳转（jumpTo）+ 预览入口统一收归左侧栏；移除了顶部重复按钮与右侧多余 aside。

### 2. 系统托盘
- 关闭窗口时最小化到系统托盘而非退出；仅经托盘菜单「退出」真正终止进程（isQuiting 标志）。
- 内置 PNG 兜底图标生成器（zlib + PNG chunk/CRC），保证无外部图标文件时托盘图标始终可用。

### 3. 舞台预设槽位 · 角色缩放 · 逐行音频偏移 · Auto 自动播放
- **预设位置槽**：新增左中 / 右中等预设槽位（PRESET_SLOTS），拖拽吸附对齐；支持应用预设、复制上一角色位置、锁定轴。
- **每角色缩放**：角色支持独立 scale，并写入 Ren'Py 导出的 show 语句（zoom 反映预览缩放）。
- **逐行音频偏移**：SE / 语音支持行内拖拽偏移（按估算行时长映射），时间轴渲染偏移感知音频块；新增 Alt+方向键（±50ms）、Alt+Shift+方向键（±250ms）微调。
- **Auto 自动播放**：调度引擎按偏移依次播放 BGM / 环境 / SE / 语音用于审阅。

### 4. 画布比例持久化
- 项目级 canvasRatio 持久化（ProjectFile / DraftData 序列化），加载时恢复；舞台新增 Ren'Py 风格比例预设选择器（默认 16:9），自适应 letterbox 缩放（整画布正确比例、背景填充）。

---

## 🔧 改进

### 舞台预览大幅优化
- **角色拖拽边界修正**：精灵始终完整可见、不溢出裁剪；加载时归一化越界坐标；拖拽中不提前选中角色（选中延后到 mouseup）。
- **不再缩小**：强制角色包裹宽度为 max-content + 中心原点变换，靠近边缘移动时不再视觉缩小。
- **背景整图显示**：以背景图宽高比驱动布局（移除 canvas 取色采样，改用 bgAspect），背景 contain 居中整图显示不裁切；letterbox 区域用背景主色调填充（12×12 降采样平均）。
- **拖拽体验**：拖拽中提升角色 z-index（=1000）避免重叠；用像素 delta + 实际渲染尺寸计算归一化位置，clamp 区间不再塌缩卡死。
- **布局稳定**：舞台包裹居中容器 + ResizeObserver 计算最大内接舞台框，避免绝对定位子元素塌陷。
- **编辑器侧栏**：角色 / standee 编辑器改为固定右侧 aside（绝对定位），不再浮在舞台上方遮挡。
- **素材管理页缩略图**：精灵卡片改为竖版 3/4、透明背景、顶部对齐、增大内边距，角色更清晰；背景维持小方块。

### 素材管理页（Assets）音频区重构
- 两侧音频区统一卡片设计：圆形播放 / 暂停按钮 + 类别徽标（BGM / 环境 / 音效 / 语音）+ 文件名；播放中蓝边高亮，点击按钮 toggleAssetPreview 试听，订阅 subscribeAudio / getAudioVersion 刷新图标。
- 图片 / 音频卡片新增 draggable（之前在素材管理页拖不动），接 handleAssetDragStart/End（setDragCache + DRAG_MIME）可直接拖到舞台预览。

### 按钮体系收敛
- 主按钮背景降透明度更柔和（bg-primary/90），主色调环由 signal/35 改为 primary/30。
- 字号体系收敛到 12 / 13 / 14 档，高度与字号成比例，视觉更统一。

### 其他
- **开发期进程保活**：dev 模式下窗口全部关闭时重建主窗口而非 app.quit()，避免误退 Electron。
- **AI 配置安全**：密钥仅存主进程 userData/ai-config.json，渲染进程永远拿不到明文。
- **特效百科文案**：多专题描述词句与标点润色，元数据与 Ren'Py 信息保持一致。

---

## 🐛 修复

- **严重显示问题 · 左下角版本号**：此前硬编码为 **v0.1.0**，导致 v0.2.0 安装包左下角误显 **0.1.0**。改为运行时读取 app.getVersion()（即 package.json 的 version），本版起左下角正确显示 **v0.3.0**；以后升版本只改 package.json，左下角与安装包名自动一致。
- **音频播放协议（sw-asset://）**：<audio> 发 Range 请求期望 206 + Content-Range，原 handler 只返回整文件导致 MEDIA_ELEMENT_ERROR 播不了。修复为 Range 分支「读入内存的定长 body」返回 206 + Content-Length，整文件分支保持原样。
- **重启 / 热重载丢素材**：导入素材原落 temp/scriptweaver-session-<时间戳> 且退出时 fs.rmSync 删除 → dev 重启 / 热重载后素材全 404。改为落持久化 userData/session-assets（稳定路径、无时间戳），退出只停监听器不再删目录；重新导入的素材跨重启 / 热重载保留。
- **角色拖拽 clamp / 编辑器侧栏定位**：用像素 delta + 实际渲染尺寸（排除标签）计算归一化位置，修复 clamp 区间塌缩、角色卡死；修正轴锁定（startPx/startPy）；侧栏绝对定位不再遮挡舞台。
- **舞台布局 / 精灵对齐**：居中容器 + ResizeObserver 计算最大内接舞台框，避免绝对定位子元素塌陷；精灵缩略图对齐修正。
- **EffectsLab 导入错误**：修正预览 import 解析（引用 effects/PreviewStage），消除导入报错。

---

## ⚠️ 关于 v0.2.0
v0.2.0 安装包左下角仍会显示 **0.1.0**（**仅显示错误，功能完全正常**），已重新打包修正版（仅修版本号显示，功能等同原 v0.2.0）并替换 GitHub 附件，下载即正确显示 **v0.2.0**。

---

## 📦 安装包
- ScriptWeaver-0.3.0-x64.exe（标准安装包）
- ScriptWeaver-0.3.0-x64.zip（免安装绿色版）
- 自动更新索引 latest.yml + .blockmap
