# 阶段三改进发现

## 时间轴行管理
- ScriptOverview 已有 `createEmptyDelta()` 和通过 textarea 添加行的能力
- 但 Timeline 中没有内联的增删行控件
- 用户必须切到剧本总览页用 textarea 编辑，或只能操作 mock 数据

## 槽位系统
- `PositionSlot` 类型定义存在（types.ts），但从未实例化
- `exportDefinitionsRpy` 硬编码 left/center/right 三个 transform
- 如果未来增加新槽位（如 far_left, offscreen_right 等），导出不会自动包含
- 修复方案：定义 DEFAULT_POSITION_SLOTS 常量，导出时遍历生成 transform

## line_id 格式
- Mock 数据：L1, L2, ... L10
- ScriptOverview 新增：new_{timestamp}_{counter}
- 统一为 L{max + 1} 格式更清晰
