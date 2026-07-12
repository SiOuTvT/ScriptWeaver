/**
 * localStorage 草稿自动保存/恢复
 * 仅存储项目元数据（deltas + configs + assets 信息），不含二进制文件内容。
 * dataUrl 在保存时剥离，避免 base64 撑爆 localStorage（5-10MB 限制）。
 */

import type { LineDelta, CharacterConfig, AssetItem } from '@/core/types'

const DRAFT_KEY = 'scriptweaver_draft'

export interface DraftData {
  deltas: LineDelta[]
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
  savedAt: string
}

/** 剥离 assets 中的 dataUrl 字段，防止 base64 数据进入持久化存储 */
function stripDataUrls(assets: AssetItem[]): AssetItem[] {
  return assets.map(({ dataUrl: _, ...rest }) => rest)
}

export function saveDraft(
  deltas: LineDelta[],
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
): void {
  try {
    const data: DraftData = {
      deltas,
      characterConfigs,
      assets: stripDataUrls(assets),
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as DraftData
    if (!data.deltas || !Array.isArray(data.deltas)) return null
    return data
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // 静默失败
  }
}
