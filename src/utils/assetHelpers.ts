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

/** 从 sprite_id 推导角色 ID（alice_smile → alice） */
export function deriveCharacterId(spriteId: string): string {
  const idx = spriteId.lastIndexOf('_')
  return idx > 0 ? spriteId.slice(0, idx) : spriteId
}

/** 从 audio asset_id 判断所属轨道类别 */
export function getAudioCategory(audioId: string): 'bgm' | 'ambient' | 'se' | 'voice' {
  if (audioId.startsWith('bgm_')) return 'bgm'
  if (audioId.startsWith('ambient_')) return 'ambient'
  if (audioId.startsWith('se_')) return 'se'
  if (audioId.startsWith('v_') || audioId.startsWith('voice_')) return 'voice'
  return 'se'
}
