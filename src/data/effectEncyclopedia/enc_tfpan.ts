import type { Encyclopedia } from './types'

// 十、变换属性 · 全景与平铺
export const tfPanEnc: Encyclopedia = {
  'tf-xpan': {
    artGuide: `xpan / ypan 把一张 360° 全景图按「角度」横向/纵向平移取景（中心为 0°，左右边缘 ±180°）。它是做「环视四周」的必备——第一人称转头看四周、天空盒漫游、360° 背景环视。
动画 xpan 从 0→360 就是「绕着全景图转一圈」。`,
    paramManual: [
      { name: 'xpan / ypan', type: 'float?', def: 'None', range: '角度（度），±180 越界回卷', effect: '0=图中心, ±180=左右/上下边缘；越界自动回卷(wrap)。' },
    ],
    cssImpl: `/* 全景图按角度取景：angle° 映射到 background-position */
.pano {
  background: url("pano.jpg") repeat-x;
  background-size: 200% 100%;   /* 全景宽=2×视口 */
  background-position: calc(var(--angle) * 1% ) 0;
}`,
    perfTips: `xpan 要求素材是「宽=2×高」的标准 360° 全景图，否则环视时接缝/比例怪异。
非全景图强行 xpan 会在边缘回卷露出不对劲的内容；全景图要无缝拼接。`,
  },

  'tf-xtile': {
    artGuide: `xtile / ytile 把图像在水平/垂直方向平铺指定次数，形成无缝网格——雪地、星空、花纹地面、重复 UI 都用它。配合 xpan 可做「无限滚动」的背景（如无尽星空流动）。`,
    paramManual: [
      { name: 'xtile / ytile', type: 'int', def: '1', range: '≥1 整数', effect: '平铺次数；重复拼接成网格。' },
    ],
    cssImpl: `/* 纹理平铺 N 次 */
.tile {
  background: url("snow.png") repeat;
  background-size: calc(100% / var(--n)) 100%;  /* 平铺 n 次 */
}`,
    perfTips: `平铺图本身必须**左右/上下无缝衔接**，否则滚动时露明显接缝。
平铺次数过多会成倍增加绘制像素量，超大背景注意性能。`,
  },
}
