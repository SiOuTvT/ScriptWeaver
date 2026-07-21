/**
 * 项目文件（.swproj）序列化 / 反序列化 / 恢复 —— 供 AppLayout、版本历史等复用。
 */

import { useAppStore } from '@/stores/appStore'
import { saveDraft } from '@/utils/draftStorage'
import type { ProjectFile, LineDelta, CharacterConfig, AssetItem, GlobalVariable } from '@/core/types'

/** 剥离 assets 中的 blobUrl 易失字段 —— 仅 Web 降级内存渲染使用，不入 .swproj / localStorage */
function stripVolatile(assets: AssetItem[]): AssetItem[] {
  return assets.map(({ blobUrl: _blobUrl, ...rest }) => rest)
}

/** 序列化完整项目数据为 JSON（不含 dataUrl） */
export function serializeProject(deltas: LineDelta[], characterConfigs: CharacterConfig[], assets: AssetItem[]): string {
  const project: ProjectFile = {
    version: 1,
    draftDeltas: deltas,
    characterConfigs,
    assets: stripVolatile(assets),
    variables: useAppStore.getState().variables,
    savedAt: new Date().toISOString(),
    canvasRatio: useAppStore.getState().canvasRatio,
  }
  return JSON.stringify(project, null, 2)
}

/** 反序列化项目 JSON，校验基本结构 */
export function deserializeProject(json: string): {
  deltas: LineDelta[]
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
  variables: GlobalVariable[]
  canvasRatio?: { w: number; h: number }
} | null {
  try {
    const data = JSON.parse(json) as ProjectFile
    if (!data.draftDeltas || !Array.isArray(data.draftDeltas)) return null
    return {
      deltas: data.draftDeltas,
      characterConfigs: data.characterConfigs ?? [],
      assets: data.assets ?? [],
      variables: data.variables ?? [],
      canvasRatio: data.canvasRatio,
    }
  } catch {
    return null
  }
}

/**
 * 将工程 JSON 恢复到当前工作区（用于打开 .swproj 或回滚快照）。
 * 统一处理：写入 store → 恢复画布比例 → 落草稿 → 激活项目根目录（驱动 sw-asset:// 协议）。
 */
export async function restoreProjectFromJson(json: string, projectRoot: string | null): Promise<boolean> {
  const parsed = deserializeProject(json)
  if (!parsed) return false
  const store = useAppStore.getState()
  store.loadProjectData({ ...parsed, projectRoot })
  store.setCanvasRatio(parsed.canvasRatio ?? { w: 16, h: 9 })
  saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets, projectRoot, parsed.canvasRatio ?? { w: 16, h: 9 })

  const api = window.electronAPI
  if (api) {
    try {
      await api.setActiveProjectRoot(projectRoot)
    } catch {
      /* 忽略：纯浏览器环境无此 IPC */
    }
  }
  return true
}
