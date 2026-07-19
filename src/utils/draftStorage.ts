/**
 * localStorage 草稿自动保存/恢复
 * 仅存储项目元数据（deltas + configs + assets 信息），不含二进制文件内容。
 * blobUrl（Web 降级临时对象 URL）在保存时剥离，避免持久化无效引用。
 * projectRoot 也一并保存，以便草稿恢复时从磁盘经 sw-asset:// 协议直读素材。
 */

import type { LineDelta, CharacterConfig, AssetItem } from '@/core/types'

const DRAFT_KEY = 'scriptweaver_draft'

export interface DraftData {
  deltas: LineDelta[]
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
  /** 项目根目录（.swproj 所在目录），恢复草稿时用于重新读取素材文件 */
  projectRoot: string | null
  savedAt: string
  /** 场景画布比例（Ren'Py 式自选）；缺省按 16:9 处理 */
  canvasRatio?: { w: number; h: number }
}

/** 剥离 assets 中的 blobUrl 易失字段，防止无效对象 URL 进入持久化存储 */
function stripVolatile(assets: AssetItem[]): AssetItem[] {
  return assets.map(({ blobUrl: _blobUrl, ...rest }) => rest)
}

export function saveDraft(
  deltas: LineDelta[],
  characterConfigs: CharacterConfig[] = [],
  assets: AssetItem[] = [],
  projectRoot: string | null = null,
  canvasRatio?: { w: number; h: number },
): void {
  try {
    const data: DraftData = {
      deltas,
      characterConfigs,
      assets: stripVolatile(assets),
      projectRoot,
      savedAt: new Date().toISOString(),
      canvasRatio,
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
