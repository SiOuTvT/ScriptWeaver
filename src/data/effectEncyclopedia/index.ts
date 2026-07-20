// ============================================================
// 特效百科「灾难级」扩展内容 · 合并入口
// ------------------------------------------------------------
// 14 个分类文件按 id 索引，统一合并为 EFFECT_ENCYCLOPEDIA。
// EffectsLab.DetailView 通过 item.id 查表渲染四大深度板块。
// ============================================================
import { basicEnc } from './enc_basic'
import { cropEnc } from './enc_crop'
import { movementEnc } from './enc_movement'
import { zoomEnc } from './enc_zoom'
import { impactEnc } from './enc_impact'
import { tfPosEnc } from './enc_tfpos'
import { tfRotEnc } from './enc_tfrot'
import { tfColorEnc } from './enc_tfcolor'
import { tfCropEnc } from './enc_tfcrop'
import { tfPanEnc } from './enc_tfpan'
import { warpersEnc } from './enc_warpers'
import { atlEnc } from './enc_atl'
import { builtinEnc } from './enc_builtin'
import { stage3dEnc } from './enc_stage3d'
import type { Encyclopedia } from './types'

export const EFFECT_ENCYCLOPEDIA: Encyclopedia = {
  ...basicEnc,
  ...cropEnc,
  ...movementEnc,
  ...zoomEnc,
  ...impactEnc,
  ...tfPosEnc,
  ...tfRotEnc,
  ...tfColorEnc,
  ...tfCropEnc,
  ...tfPanEnc,
  ...warpersEnc,
  ...atlEnc,
  ...builtinEnc,
  ...stage3dEnc,
}
