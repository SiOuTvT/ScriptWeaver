// ============================================================
// ScriptWeaver - 预设站位（快捷坐标）定义
//
// 经典 Galgame「定点」系统：角色不在舞台上自由漂移，而是磁吸到
// 一组语义化站位（左 / 左偏中 / 中 / 右偏中 / 右）。
// 渲染层（StagePreview）与导出层（rpyExporter）共用同一份坐标源，
// 杜绝「预览站位」与「导出站位」认知分裂。
//
// anchor_x：归一化水平中心坐标 0-1（映射到 Ren'Py xalign / 舞台 left 百分比）
// anchor_y：归一化垂直对齐坐标 0-1（映射到 Ren'Py yalign；舞台内渲染另有 UI 折中）
// ============================================================

import type { PositionSlot } from './types'

/** 五档预设站位 */
export interface PresetSlot {
  /** 站位 ID（同时作为 CharacterDelta.position_slot 的引用值） */
  id: string
  /** 中文显示名：左 / 左偏中 / 中 / 右偏中 / 右 */
  label: string
  /** 归一化水平中心坐标 0-1 */
  anchor_x: number
  /** 归一化垂直对齐坐标 0-1 */
  anchor_y: number
}

/**
 * 经典五档站位。取值对称分散，留足边缘余量，避免立绘贴边。
 * 间距：左(0.22) — 左偏中(0.37) — 中(0.50) — 右偏中(0.63) — 右(0.78)
 */
export const PRESET_SLOTS: PresetSlot[] = [
  { id: 'left', label: '左', anchor_x: 0.22, anchor_y: 1.0 },
  { id: 'left-center', label: '左偏中', anchor_x: 0.37, anchor_y: 1.0 },
  { id: 'center', label: '中', anchor_x: 0.5, anchor_y: 1.0 },
  { id: 'right-center', label: '右偏中', anchor_x: 0.63, anchor_y: 1.0 },
  { id: 'right', label: '右', anchor_x: 0.78, anchor_y: 1.0 },
]

/** 按站位 ID 取预设（未命中返回 undefined） */
export function getPresetSlot(id: string): PresetSlot | undefined {
  return PRESET_SLOTS.find((s) => s.id === id)
}

/**
 * 旧版默认槽位配置（兼容 rpyExporter 的 PositionSlot 形态，用于生成 Ren'Py transform）。
 * 直接由 PRESET_SLOTS 派生，保证「预览」与「导出」落点严格一致。
 */
export const DEFAULT_POSITION_SLOTS: PositionSlot[] = PRESET_SLOTS.map((s) => ({
  id: s.id,
  anchor_x: s.anchor_x,
  anchor_y: s.anchor_y,
  anchor_point: 'bottom',
}))
