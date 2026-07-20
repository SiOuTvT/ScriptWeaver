import type { Encyclopedia } from './types'

// 四、缩放与镜头（Zoom & Camera）
export const zoomEnc: Encyclopedia = {
  zoomin: {
    artGuide: `zoomin 是「放大进入」：进入的立绘从较小尺寸放大到目标尺寸，制造「登场 / 强调」的推近感。当新角色/新背景要「怼到玩家眼前」、或你想强调某物出现时，用它最有冲击力。
不要把它用在平凡的日常背景切换上——放大进场太张扬，会稀释真正需要强调的时刻。`,
    paramManual: [
      { name: '(默认时长)', type: 'float', def: '≈0.5', range: '秒', effect: '缩放补间秒数，由缩放类 MoveTransition 决定。' },
    ],
    cssImpl: `/* 进入画面从小放大到原大 */
.zoomin { animation: zoomIn .5s cubic-bezier(.34,1.2,.64,1) forwards; }
@keyframes zoomIn { from { transform: scale(.6); } to { transform: scale(1); } }`,
    perfTips: `起始 scale 太小会「砰」地弹出，配合 zoomin 专用缓动曲线（中段略过冲）更自然。
缩放围绕 anchor 进行，若锚点不是中心，放大时立绘会往一侧偏，注意设好 transform_anchor。`,
  },

  zoomout: {
    artGuide: `zoomout 是「缩小离场」：离开的立绘缩小并淡出，制造「退场 / 远去」的拉远感。适合角色远去退场、物体飞走变小、回忆「缩远」淡出。
它是 zoomin 的镜像，一个把世界拉近、一个把世界推远。`,
    paramManual: [
      { name: '(默认时长)', type: 'float', def: '≈0.5', range: '秒', effect: '缩小+淡出补间秒数。' },
    ],
    cssImpl: `/* 离场画面缩小并淡出 */
.zoomout { animation: zoomOut .5s cubic-bezier(.36,0,.66,-0.2) forwards; }
@keyframes zoomOut { to { transform: scale(.6); opacity: 0; } }`,
    perfTips: `单缩小不淡出会「缩到一个点突然消失」很突兀，配合 alpha 淡出更顺。
缩小会改变立绘包围盒，若 rotate_pad 未开且同时旋转，可能抖动。`,
  },

  zoominout: {
    artGuide: `zoominout 同时让进入立绘放大、离开立绘缩小，两者并发，形成「一新一旧、一进一退」的强烈对比替换。它最适合「角色替换登场」（新角色顶掉旧角色）、变身前后对比、重要人物切换——一进一退的张力极强。`,
    paramManual: [
      { name: '(默认时长)', type: 'float', def: '≈0.5', range: '秒', effect: '两段缩放并发补间秒数。' },
    ],
    cssImpl: `/* 新放大进场 + 旧缩小离场，并发 */
.new { animation: zoomIn  .5s forwards; }
.old { animation: zoomOut .5s forwards; }
@keyframes zoomIn  { from{transform:scale(.6)} to{transform:scale(1)} }
@keyframes zoomOut { to{transform:scale(.6); opacity:0} }`,
    perfTips: `两图层同时缩放，合成器开销翻倍但可控。务必保证两者锚点/缩放中心一致，否则一个绕脚底、一个绕中心，视觉上会「错位挤压」。
层级上让新层在旧层之上，避免旧层缩小过程中透出新层背后的空白。`,
  },
}
