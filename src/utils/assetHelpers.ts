/**
 * 素材拖拽辅助工具
 */

/** 拖拽传输的数据格式 */
export interface DragAssetData {
  type: 'background' | 'sprite' | 'audio'
  assetId: string
  label: string
}

export const DRAG_MIME = 'application/x-scriptweaver-asset'

/**
 * 模块级缓存：dragover 事件中 getData() 被浏览器安全策略阻止，
 * 因此在 dragstart 时写入此变量，dragover/drop 时读取。
 * 拖拽结束后清空。
 */
let _currentDragCache: DragAssetData | null = null

export function setDragCache(data: DragAssetData | null): void {
  _currentDragCache = data
}

export function getDragCache(): DragAssetData | null {
  return _currentDragCache
}

/** 从 sprite_id 推导角色 ID（alice_smile → alice） */
export function deriveCharacterId(spriteId: string): string {
  const idx = spriteId.lastIndexOf('_')
  return idx > 0 ? spriteId.slice(0, idx) : spriteId
}

/** 从 audio asset_id 判断所属轨道类别 */
export function getAudioCategory(audioId: string): 'bgm' | 'ambient' | 'se' | 'voice' {
  // 支持两种 ID 格式：
  //   模板数据：asset_audio_bgm_peaceful → 匹配 _bgm_
  //   直接 ID：  bgm_peaceful → 匹配 startsWith('bgm_')
  if (audioId.startsWith('bgm_') || audioId.includes('_bgm_')) return 'bgm'
  if (audioId.startsWith('ambient_') || audioId.includes('_ambient_')) return 'ambient'
  if (audioId.startsWith('se_') || audioId.includes('_se_')) return 'se'
  if (
    audioId.startsWith('v_') ||
    audioId.startsWith('voice_') ||
    audioId.includes('_v_') ||
    audioId.includes('_voice_')
  )
    return 'voice'
  return 'se'
}
