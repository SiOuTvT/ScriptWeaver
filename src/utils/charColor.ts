import type { CharacterConfig, AssetItem } from '@/core/types'

// 未设置 dialogueColor 时的确定性回退色板（保证同一角色始终同色）
const FALLBACK_PALETTE = [
  '#f472b6', '#38bdf8', '#a78bfa', '#34d399',
  '#fbbf24', '#fb7185', '#22d3ee', '#c084fc',
]

/** 根据角色 ID 生成稳定的回退颜色 */
export function hashCharColor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length]
}

/**
 * 解析角色显示色：优先使用角色在角色管理里设置的 dialogueColor，
 * 未设置时回退到按 ID 确定性生成的颜色（保证配色稳定且各角色区分明显）。
 */
export function resolveCharColor(
  id: string | null | undefined,
  characterConfigs: CharacterConfig[],
): string {
  if (!id) return '#9ca3af'
  const cfg = characterConfigs.find(
    (c) => c.charId.toLowerCase() === id.toLowerCase(),
  )
  return cfg?.dialogueColor || hashCharColor(id)
}

// 未设置 color 时的素材回退色板
const ASSET_PALETTE = [
  '#8b5cf6', '#22c55e', '#3b82f6', '#eab308',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
]

/** 根据素材 ID 生成稳定的回退颜色 */
export function hashAssetColor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ASSET_PALETTE[h % ASSET_PALETTE.length]
}

/**
 * 解析素材显示色：优先使用素材在素材管理里设置的 color，
 * 未设置时回退到按 ID 确定性生成的颜色（保证配色稳定且各素材区分明显）。
 */
export function resolveAssetColor(
  id: string | null | undefined,
  assets: AssetItem[],
): string {
  if (!id) return '#9ca3af'
  const a = assets.find((x) => x.id.toLowerCase() === id.toLowerCase())
  return a?.color || hashAssetColor(id)
}
