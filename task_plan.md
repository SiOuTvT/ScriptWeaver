# ScriptWeaver - 阶段二任务计划

## 目标
按规格文档第三节的四层布局搭建界面骨架，使用写死假数据渲染，暂不接入真实拖拽/文件系统。

## 子任务

### 2.1 编写 Mock 数据 ✅
- 8-10 行 LineDelta，覆盖所有场景：
  - 背景继承与切换（含 transition）
  - 角色出场/退场/换表情/换位置
  - BGM 设置/替换/__CLEAR__ /跨行延续
  - Ambient 环境音独立继承
  - SE 一次性音效
  - Voice 单行语音
  - speaker=null 旁白
  - 多角色同场
  - 槽位引用与复用

### 2.2 更新 Zustand Store
- `draftDeltas`：存储 mock 数据
- `selectedLineIndex`：当前选中行
- `scriptDrawerOpen`：剧本抽屉开关
- `scriptDrawerPinned`：钉住状态
- `leftSidebarCollapsed`：侧栏折叠

### 2.3 搭建四层布局骨架
- **左侧边栏**（LeftSidebar）：折叠式图标导航
- **素材库**（AssetLibrary）：Tab 切换背景/立绘/音频
- **舞台预览**（StagePreview）：核心视觉焦点，渲染当前选中行合并状态
- **剧本流**（ScriptDrawer）：抽屉式，可钉住
- **底部时间轴**（Timeline）：多轨道色块

### 2.4 联动核心
- 任意区域操作围绕"当前选中行"同步
- 选中行变化 → 舞台预览交叉淡入淡出

### 2.5 验收自查
对照规格文档阶段二要求逐条检查

## 关键技术决策
- 复用阶段一的 `reduceLines` 计算合并状态
- UI 组件只读、纯展示，无写入操作
- 使用 Tailwind 动画实现交叉淡入淡出过渡
