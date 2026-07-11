# 阶段二发现

## 布局方案
- 使用 CSS Grid 实现四层布局
- grid-template: 左侧边栏 + 素材库 + 舞台 + 剧本抽屉 (横向) / 时间轴 (底部)

## 组件层次
```
AppLayout
├── LeftSidebar        (固定宽 48px 折叠 / 160px 展开)
├── AssetLibrary       (固定宽 220px，Tab 切换)
├── StagePreview       (flex:1 核心区域)
├── ScriptDrawer       (抽屉，0/280/420px)
└── Timeline           (底部固定高 180px，多轨道)
```

## 状态管理
- 使用 Zustand appStore 管理 UI 状态 + mock 数据
- 选中行联动通过 selectedLineIndex 驱动
