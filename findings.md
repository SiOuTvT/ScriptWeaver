# 发现记录

## 卡片样式基准 (ScriptOverview SceneCard)
```
rounded-xl border bg-surface-2 p-3.5 shadow-1
hover:-translate-y-0.5 hover:shadow-2 transition-all duration-200
```
- 顶部色条: absolute inset-x-0 top-0 h-0.5 + linear-gradient
- 右上角 hover 光晕球: blur-2xl opacity 0→100
- 底部统计行: border-t border-edge/10

## 弹窗现状
- CollabPanel: Modal (fixed inset-0 z-[90]) ← 需改全屏
- DiagnosticsPanel: 已是全屏页面 ✅
- AuditLogHub: 已是全屏页面 ✅

## LeftSidebar: 5组19项, 可折叠/展开

## HelpCenter: 三栏但中间用2列卡片网格 → 改长文档

## Ren'Py生态: 语法学院仅15篇, 审计卡片无悬浮交互

## 导出SDK: 已有 renpyDetectSdk() IPC, 需验证真伪
