import type { Encyclopedia } from './types'

// 九、变换属性 · 裁剪与缩放
export const tfCropEnc: Encyclopedia = {
  'tf-crop-prop': {
    artGuide: `crop 就是个「取景框」：把立绘裁成指定的矩形 (x,y,w,h)，坐标相对子图左上角。做「镜头推近脸部特写」「聚焦局部」「模拟凑近看某处」都靠它，让 crop 从全图 (0,0,1,1) 动画缩到脸部的小框，就是在「推近特写」。`,
    paramManual: [
      { name: 'crop', type: '(4)tuple?', def: 'None（不裁剪）', range: '(x,y,w,h) 比例/像素', effect: '相对子图取景框；动画从全图缩到小框=推近特写。' },
    ],
    cssImpl: `/* 头部特写：裁掉下方、右侧，只留头顶区域 */
.crop { clip-path: inset(20% 0 0 60%); }`,
    perfTips: `crop 动画即镜头运动，非常便宜（裁剪盒插值）。
crop 框外的部分被裁，若配合 zoom 放大做「推近+放大」，注意预留透明边距防止裁到立绘主体。`,
  },

  'tf-corner': {
    artGuide: `corner1 / corner2 是用左上(corner1)和右下(corner2)两个对角点来定义裁剪框，比写 crop 四元组直观，想用「两个角点」方式裁切时它更好读。注意：如果同时写了 crop，crop 优先级更高。`,
    paramManual: [
      { name: 'corner1', type: '(pos, pos)?', def: 'None', range: '对角点', effect: '裁剪框左上点。' },
      { name: 'corner2', type: '(pos, pos)?', def: 'None', range: '对角点', effect: '裁剪框右下点；crop 优先级更高。' },
    ],
    cssImpl: `/* corner1(0.2,0) corner2(0.8,1) 等同 crop(0.2,0,0.6,1) */
.corner { clip-path: inset(0% 20% 0% 20%); }`,
    perfTips: `同时写 crop 与 corner 时以 crop 为准，避免两条都在却互相覆盖导致困惑。
corner 写法直观但底层仍是 crop，动画行为一致。`,
  },

  'tf-xysize': {
    artGuide: `xysize / xsize / ysize 是把立绘强制缩放到指定宽高。当你要把不同素材统一到固定尺寸、做缩略图、或者统一机位大小时用它。至于怎么适配（保比例还是拉伸），由 fit 决定。`,
    paramManual: [
      { name: 'xysize', type: '(pos, pos)?', def: 'None', range: '目标宽高', effect: '目标像素尺寸；配合 fit 决定适配方式。' },
    ],
    cssImpl: `/* 强制尺寸 */
.box { width: 400px; height: 600px; object-fit: contain; }`,
    perfTips: `不配 fit 直接给 xysize 时默认行为是「拉伸填满」，可能变形；想要保比例务必同时设 fit="contain"/"cover"。
响应式布局里用固定 xysize 可能在小屏溢出。`,
  },

  'tf-fit': {
    artGuide: `fit 配合 xsize/ysize 决定缩放策略：contain 是含进去不超界（可能留白）、cover 是覆盖不亏（可能裁切）、fill 是直接拉伸填满（会变形）。满屏背景用 cover，要框在固定尺寸里又不溢出用 contain，故意弄变形做艺术效果才用 fill。`,
    paramManual: [
      { name: 'fit', type: 'str?', def: 'None', range: 'contain/cover/fill/scale-down/scale-up', effect: 'contain 含入、cover 覆盖、fill 拉伸；scale-down/up 为单向。' },
    ],
    cssImpl: `/* 与 CSS object-fit 一一对应 */
cover    { object-fit: cover; }     /* 满屏背景 */
contain  { object-fit: contain; }   /* 含入不裁 */
fill     { object-fit: fill; }      /* 拉伸变形 */`,
    perfTips: `fill 会无脑拉伸变形，角色脸被压扁要慎用；cover 可能裁掉立绘边缘（头顶/脚底），做满屏背景时要确认关键内容在中心。
contain 留白处会露出下层，注意背景协调。`,
  },

  'tf-maxsize': {
    artGuide: `maxsize 是把立绘缩到「不超过这个框」同时还保持比例（等价于 xysize 配 fit="contain"）。响应式布局里用它最稳妥，既能防止大图撑爆，又不会把小图放大。`,
    paramManual: [
      { name: 'maxsize', type: '(int, int)?', def: 'None', range: '最大宽高框', effect: '等比含入 w×h，不超界也不放大。' },
    ],
    cssImpl: `/* 最大尺寸约束 + 含入 */
.maxsize { max-width: 800px; max-height: 600px; object-fit: contain; }`,
    perfTips: `它对小图「不放大」的特性很安全，但如果你本想让小图铺满，maxsize 会显得偏小。
多图层各自 maxsize 时，注意彼此比例一致否则大小失衡。`,
  },
}
