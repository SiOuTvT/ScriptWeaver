import type { Encyclopedia } from './types'

// 七、变换属性 · 旋转 / 缩放 / 翻转
export const tfRotEnc: Encyclopedia = {
  'tf-rotate': {
    artGuide: `rotate 是绕 anchor（默认中心）的 2D 平面旋转，单位是度（正为顺时针，从正上方起算）。做自转装饰、强调时甩一下头、技能 CD 环、转场里的旋转元素，都靠它。让 rotate 从 0 动到 360 就是转一圈；配合 rotate_pad 能避免旋转时尺寸抖。`,
    paramManual: [
      { name: 'rotate', type: 'float?', def: 'None', range: '度（可负）', effect: '顺时针旋转角度；None=不旋转复位。' },
    ],
    cssImpl: `/* 绕锚点顺时针旋转 */
.rotate { transform: rotate(360deg); transition: transform 1s; }
/* 默认 transform-origin 即中心 (0.5,0.5) */`,
    perfTips: `旋转会改变立绘外接包围盒，若 rotate_pad=False 且旋转后超出原盒，可能被裁。
rotate_pad=True 用正方形外接框包裹，尺寸恒定但可能露出更多透明边距。`,
  },

  'tf-rotate-pad': {
    artGuide: `rotate_pad 给旋转后的显示件补成一个正方形外接框，让它在旋转全程尺寸恒定、不忽大忽小。如果你永远固定在某个角度旋转（比如一直 45°），可以设 False 取最小包围盒，省下边距。它就是个「尺寸稳定性」开关，跟视觉无关，只影响包围盒。`,
    paramManual: [
      { name: 'rotate_pad', type: 'bool', def: 'True', range: 'True / False', effect: 'True=恒尺寸（正方形外接）；False=最小包围盒（省边距但脉动）。' },
    ],
    cssImpl: `/* Web 中旋转本身不改变布局盒；等价于不额外留白 */
.rotate-pad { /* 持续自转建议保留透明边距，避免裁切 */ }`,
    perfTips: `持续自转、任意角度旋转（要尺寸稳定）时开 True；固定单角度且想省边距时 False。
设 False 后若旋转角度接近 45° 且立绘接近方形，可能明显可见尺寸「呼吸」。`,
  },

  'tf-transform-anchor': {
    artGuide: `transform_anchor 让锚点落在「被裁剪后的子图」上，并跟着缩放/旋转一起移动，等于把锚点变成真正的「旋转缩放中心」。当你带着 crop 做变换、或者想严格绕自身真实中心旋转时，开它最稳，免得「转着转着偏心」。`,
    paramManual: [
      { name: 'transform_anchor', type: 'bool', def: 'False', range: 'True / False', effect: 'True=锚点随变换后子图走，旋转缩放中心更稳。' },
    ],
    cssImpl: `/* Web：transform-origin 固定为子图真实中心即可等效 */
.el { transform-origin: 50% 50%; }`,
    perfTips: `带 crop 或缩放后旋转时开 True，否则锚点漂移导致「偏心旋转」。
纯未裁剪的整图，默认 anchor 与 transform_anchor 效果几乎一致，无需额外开。`,
  },

  'tf-zoom': {
    artGuide: `zoom 是整体等比缩放因子（1.0 是原大），宽高同乘、保持比例。推近强调、物体放大缩小、呼吸式胀缩、镜头 zoom 模拟，都靠它。它跟 xzoom/yzoom 不一样：zoom 强制等比，后两个可以非等比。`,
    paramManual: [
      { name: 'zoom', type: 'float', def: '1.0', range: '>0', effect: '1=原大；>1 放大；<1 缩小；等价 xzoom=yzoom。' },
    ],
    cssImpl: `/* 等比缩放 */
.zoom { transform: scale(1.2); }  /* zoom 1.2 */`,
    perfTips: `zoom 放大可能超出裁剪盒被裁，尤其贴边立绘；配合 transform_anchor 决定缩放中心。
要与 rotate 叠加时，注意两者都绕 anchor，顺序/锚点一致才能预期。`,
  },

  'tf-xzoom': {
    artGuide: `xzoom / yzoom 分别控制水平/垂直缩放，负值是翻转：xzoom=-1 就是水平镜像，常用来让「角色转身面向另一边」，一张素材左右翻一下就行，省得再画一套。它也能做非等比压扁拉伸（比如 xzoom=1.2, yzoom=0.8）。`,
    paramManual: [
      { name: 'xzoom / yzoom', type: 'float', def: '1.0', range: '任意实数（负=翻转）', effect: '1=原;<1缩小;>1放大;-1=镜像翻转。' },
    ],
    cssImpl: `/* 水平镜像翻转（xzoom = -1） */
.flip { transform: scaleX(-1); }`,
    perfTips: `负值翻转是镜像，左右互换；用于转身省素材，但**文字/标志/伤口朝向**也会反转，用时留意。
非等比拉伸（x≠y）会变形，角色脸被压扁要谨慎。`,
  },
}
