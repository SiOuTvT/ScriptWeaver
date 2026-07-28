# v1.0.0 全站细节重构任务计划

## 目标
统一卡片视觉、废除功能弹窗、扁平化侧边栏、重构帮助/关于、扩充生态内容、真实验证导出SDK。

## 阶段

### 阶段 1: 卡片样式全站统一
- 提取 ScriptOverview 卡片样式为可复用 CSS/Tailwind 模式
- 替换 RenPyEcosystemHub 中审计卡/插件卡/学院卡
- 替换 HelpCenter section 卡片 → 长文档
- 状态: pending

### 阶段 2: 废除功能弹窗 → 独立页面
- CollabPanel Modal → 全屏页面
- 检查 VersionHistory 渲染方式
- 状态: pending

### 阶段 3: LeftSidebar 扁平化
- 取消分组折叠/展开交互
- 用分组标题分隔
- 状态: pending

### 阶段 4: HelpCenter + About 重构
- HelpCenter: 左目录树 + 中长文档 + 右大纲
- About: 外部链接 system browser 打开
- 状态: pending

### 阶段 5: Ren'Py 生态内容扩充 + 卡片修复
- 语法学院 15→40+ 篇
- 特效审计卡片重构
- 状态: pending

### 阶段 6: 导出 SDK 真实校验
- 验证 renpyDetectSdk 是真实 IPC
- 未检测到 SDK 时阻断导出
- 状态: pending

## 遇到的错误
（暂无）
