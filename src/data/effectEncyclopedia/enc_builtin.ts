import type { Encyclopedia } from './types'

// 十三、内置定位变换（Built-in Transforms）
export const builtinEnc: Encyclopedia = {
  'bi-center': {
    artGuide: `center 是 Galgame 对话立绘的「家」：水平居中、脚底贴底（align (0.5,1.0)）。绝大多数角色说话时都站这里，是默认、最不抢戏的站位。
当一段对话没有特别的空间调度需求时，center 永远是对的默认选择。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0.5, 1.0)', range: '—', effect: '水平居中 + 脚底贴底，纯定位预设。' },
    ],
    cssImpl: `.center { position:absolute; left:50%; bottom:0; transform: translateX(-50%); }`,
    perfTips: `center 只管定位，不解决遮挡；双人对话时另一角色要用 left/right 错开，否则重叠在一起。`,
  },

  'bi-left': {
    artGuide: `left 把立绘对齐屏幕左下角（align (0,1.0)），是双人对话里的「左位」。当玩家视角习惯「主角在左、对手在右」时，left 给主角最稳的归属地。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0, 1.0)', range: '—', effect: '左边缘贴左 + 脚底贴底。' },
    ],
    cssImpl: `.left { position:absolute; left:0; bottom:0; }`,
    perfTips: `左位立绘与右位立绘若都设脚底贴底，两人脚线对齐更自然；注意两人不要同时占 center 以免重叠。`,
  },

  'bi-right': {
    artGuide: `right 把立绘对齐屏幕右下角（align (1,1.0)），是双人对话里的「右位」。对手、旁白者、新登场的第二人，常落在 right。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(1, 1.0)', range: '—', effect: '右边缘贴右 + 脚底贴底。' },
    ],
    cssImpl: `.right { position:absolute; right:0; bottom:0; }`,
    perfTips: `左右两位立绘最好镜像对称（都脚底贴底、边缘贴边），视觉最稳；必要时用 xzoom=-1 让两人面向彼此。`,
  },

  'bi-top': {
    artGuide: `top 水平居中、与屏幕顶部对齐（align (0.5,0)），适合俯视角色、头顶招牌、悬挂物——任何「从上方垂下来 / 俯视看」的画面。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0.5, 0)', range: '—', effect: '水平居中 + 顶部贴顶。' },
    ],
    cssImpl: `.top { position:absolute; left:50%; top:0; transform: translateX(-50%); }`,
    perfTips: `top 把立绘吊在屏幕上方，常与底部立绘形成「高低落差」的构图；注意别和顶部 UI 栏打架。`,
  },

  'bi-topleft': {
    artGuide: `topleft 对齐屏幕左上角（align (0,0)），是角落站位/角落 UI 的落点——小图标立绘、角落窥视的配角、界面装饰都可用。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0, 0)', range: '—', effect: '左上角对齐屏幕左上。' },
    ],
    cssImpl: `.topleft { position:absolute; left:0; top:0; }`,
    perfTips: `角落位置容易被忽略，适合放次要/装饰性元素；主角色别塞角落，存在感会被削弱。`,
  },

  'bi-topright': {
    artGuide: `topright 对齐屏幕右上角（align (1,0)），与 topleft 镜像，用于右侧角落的 UI/配角/装饰。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(1, 0)', range: '—', effect: '右上角对齐屏幕右上。' },
    ],
    cssImpl: `.topright { position:absolute; right:0; top:0; }`,
    perfTips: `和 topleft 一样是角落位；若两侧都要角落元素，注意左右视觉重量平衡。`,
  },

  'bi-truecenter': {
    artGuide: `truecenter 让立绘**绝对中心**对齐屏幕正中（align (0.5,0.5)），而非脚底贴底。它适合特写、CG 感画面、重要人物居中——当你想让整张立绘充满视觉中心、而非「站在地上」时使用。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0.5, 0.5)', range: '—', effect: '中心对齐屏幕正中（含中心点）。' },
    ],
    cssImpl: `.truecenter { position:absolute; left:50%; top:50%; transform: translate(-50%,-50%); }`,
    perfTips: `truecenter 把立绘中心钉在屏幕中央，大特写时脸会居中很稳；但若立绘本身带脚底透明边，可能显得「悬空」，需确认素材构图。`,
  },

  'bi-offleft': {
    artGuide: `offscreenleft 把立绘放到屏幕左侧之外（xpos 略小于 0）、脚底贴底，是 moveinright 的**入场起点**——角色从画外走进来的起始站位。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '屏外左侧', range: '—', effect: '立绘在屏幕左边缘之外，作 moveinright 起点。' },
    ],
    cssImpl: `.offleft { position:absolute; left:-40%; bottom:0; }  /* 屏外左 */`,
    perfTips: `它只是起点站位，单独 show 会看不到人；必须配 moveinright 等滑入转场才有意义。`,
  },

  'bi-offright': {
    artGuide: `offscreenright 把立绘放到屏幕右侧之外，是 moveoutright 的**离场终点**——角色向画外走去的收尾站位。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '屏外右侧', range: '—', effect: '立绘在屏幕右边缘之外，作 moveoutright 终点。' },
    ],
    cssImpl: `.offright { position:absolute; right:-40%; bottom:0; }  /* 屏外右 */`,
    perfTips: `同理只是终点站位，需配 moveoutright 离场转场；单独用会「人走出去消失」。`,
  },

  'bi-default': {
    artGuide: `default（config.default_transform）是每次 show/scene 未指定 at 时使用的变换，默认等同 center。想让全项目立绘默认就站某个机位（比如全部贴底偏左），重写它就是全局开关。`,
    paramManual: [
      { name: 'config.default_transform', type: 'Transform', def: 'center', range: '任意变换', effect: '未指定 at 时的默认登场变换。' },
    ],
    cssImpl: `/* Web 中可由项目级默认样式统一控制登场机位 */
.default-enter { /* 等价默认 at center 的进入动画 */ }`,
    perfTips: `改 default_transform 是全局影响，务必确认所有 show 都不带 at 的场合仍能正确显示；改坏会导致全项目立绘错位。`,
  },

  'bi-reset': {
    artGuide: `reset 把**所有**变换属性（pos/rotate/zoom/alpha/matrixcolor…）还原为默认值，清除历史叠加——相当于舞台「清屏重启」。在切换机位、重设姿态前先 reset，能防止上一轮变换残留污染下一幕。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '清空全部叠加', range: '—', effect: '所有 transform 属性还原默认，清除残留。' },
    ],
    cssImpl: `/* 还原内联样式 = reset */
el.style.transform = ''; el.style.opacity = ''; el.style.filter = '';`,
    perfTips: `它是「防叠加污染的保险丝」：长演出里多次变换后务必 reset，否则 rotate/zoom 残留会让下一幕立绘莫名歪斜或缩放。
但 reset 也会清掉你本想保留的状态，用前确认当前帧不需要保留任何变换。`,
  },
}
