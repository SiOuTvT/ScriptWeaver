# ScriptWeaver - 阶段三改进：高优先级修复

## 目标
修复两个影响完整闭环使用的高优先级问题。

## 子任务

### 3.1 时间轴行管理（新增/删除/调序）
- `appStore.ts`：新增 `insertDeltaAt`、`deleteDeltaAt`、`moveDelta` 方法
- `Timeline.tsx`：行号区域增加 + 按钮插入新行；增加右键或工具栏按钮删除行；行号列增加 ▲▼ 上移/下移按钮
- `selectedLineIndex` 在增删移操作后自动修正，避免越界

### 3.2 导出坐标走槽位系统
- 创建 `src/core/positionSlots.ts`：定义默认槽位（left/center/right 含 anchor_x/y/point）
- `rpyExporter.ts`：`exportDefinitionsRpy` 从 PositionSlot 数据生成 transform 而非硬编码
- `AppLayout.tsx`：导出处传入 positionSlots 参数

## 关键技术决策
- insertDeltaAt 生成 line_id 用 `L{max_num + 1}` 格式
- deleteDeltaAt 如果删的是最后一行且 selectedIndex 越界，则回退到上一行
- PositionSlots 暂用常量定义，不存入 Zustand（用户极少自定义槽位）
- 导出 transform 使用 Ren'Py 的 xalign/yalign 语义映射 anchor_x/anchor_y
