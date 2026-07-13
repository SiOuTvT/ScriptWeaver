// ============================================================
// ScriptWeaver - 默认位置槽位定义
// 槽位系统：角色引用命名槽位 ID，禁止自由浮点坐标。
// 导出时根据此配置生成 Ren'Py transform 语句。
// ============================================================

import type { PositionSlot } from './types'

/**
 * 默认位置槽位配置。
 * anchor_x/anchor_y 为归一化坐标（0-1），映射到 Ren'Py 的 xalign/yalign。
 * anchor_point = 'bottom' 时角色底部对齐指定位置（标准立绘行为）。
 */
export const DEFAULT_POSITION_SLOTS: PositionSlot[] = [
  { id: 'left',   anchor_x: 0.25, anchor_y: 1.0, anchor_point: 'bottom' },
  { id: 'center', anchor_x: 0.50, anchor_y: 1.0, anchor_point: 'bottom' },
  { id: 'right',  anchor_x: 0.75, anchor_y: 1.0, anchor_point: 'bottom' },
]
