import type { Encyclopedia } from './types'

// 十三、内置定位变换（Built-in Transforms）
export const builtinEnc: Encyclopedia = {
  'bi-center': {
    artGuide: `center 就是立绘的「老位置」：水平居中、脚底贴着底边（align 0.5,1.0）。绝大多数角色说话都站这儿，最不抢戏。只要这段对话没啥空间上的讲究，无脑用 center 准没错。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0.5, 1.0)', range: '—', effect: '水平居中 + 脚底贴底，纯定位预设。' },
    ],
    cssImpl: `.center { position:absolute; left:50%; bottom:0; transform: translateX(-50%); }`,
    perfTips: `center 只管定位，不解决遮挡；双人对话时另一角色要用 left/right 错开，否则重叠在一起。`,
  },

  'bi-left': {
    artGuide: `left 把立绘贴到屏幕左下角（align 0,1.0），双人对话时主角站这儿。玩家习惯「主角在左、对手在右」的话，left 就是主角的固定归属地。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0, 1.0)', range: '—', effect: '左边缘贴左 + 脚底贴底。' },
    ],
    cssImpl: `.left { position:absolute; left:0; bottom:0; }`,
    perfTips: `左位立绘与右位立绘若都设脚底贴底，两人脚线对齐更自然；注意两人不要同时占 center 以免重叠。`,
  },

  'bi-right': {
    artGuide: `right 贴到右下角（align 1,1.0），双人对话里对手、旁白者、或者刚登场的第二个人常站这儿。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(1, 1.0)', range: '—', effect: '右边缘贴右 + 脚底贴底。' },
    ],
    cssImpl: `.right { position:absolute; right:0; bottom:0; }`,
    perfTips: `左右两位立绘最好镜像对称（都脚底贴底、边缘贴边），视觉最稳；必要时用 xzoom=-1 让两人面向彼此。`,
  },

  'bi-top': {
    artGuide: `top 是水平居中、贴上边缘（align 0.5,0），俯视视角下的角色、头顶的招牌、吊下来的东西，总之任何「从上方垂下来或者俯着看」的画面用它。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0.5, 0)', range: '—', effect: '水平居中 + 顶部贴顶。' },
    ],
    cssImpl: `.top { position:absolute; left:50%; top:0; transform: translateX(-50%); }`,
    perfTips: `top 把立绘吊在屏幕上方，常与底部立绘形成「高低落差」的构图；注意别和顶部 UI 栏打架。`,
  },

  'bi-topleft': {
    artGuide: `topleft 怼到左上角（align 0,0），角落站位或者角落 UI 的落点。小图标立绘、在角落偷偷窥视的配角、界面装饰都能放这。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0, 0)', range: '—', effect: '左上角对齐屏幕左上。' },
    ],
    cssImpl: `.topleft { position:absolute; left:0; top:0; }`,
    perfTips: `角落位置容易被忽略，适合放次要/装饰性元素；主角色别塞角落，存在感会被削弱。`,
  },

  'bi-topright': {
    artGuide: `topright 怼到右上角（align 1,0），跟 topleft 左右镜像，右侧角落的 UI、配角、装饰用。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(1, 0)', range: '—', effect: '右上角对齐屏幕右上。' },
    ],
    cssImpl: `.topright { position:absolute; right:0; top:0; }`,
    perfTips: `和 topleft 一样是角落位；若两侧都要角落元素，注意左右视觉重量平衡。`,
  },

  'bi-truecenter': {
    artGuide: `truecenter 把立绘的中心点钉在屏幕正中（align 0.5,0.5），而不是脚底贴底。做特写、CG 感画面、重要人物居中的时候用它，你想让整张立绘占满视觉中心、而不是「杵在地上」时就选它。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '等价 align(0.5, 0.5)', range: '—', effect: '中心对齐屏幕正中（含中心点）。' },
    ],
    cssImpl: `.truecenter { position:absolute; left:50%; top:50%; transform: translate(-50%,-50%); }`,
    perfTips: `truecenter 把立绘中心钉在屏幕中央，大特写时脸会居中很稳；但若立绘本身带脚底透明边，可能显得「悬空」，需确认素材构图。`,
  },

  'bi-offleft': {
    artGuide: `offscreenleft 把立绘放到屏幕左边之外（xpos 略小于 0）、脚底贴底，它是 moveinright 的入场起点，角色从画外走进来时一开始站这儿。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '屏外左侧', range: '—', effect: '立绘在屏幕左边缘之外，作 moveinright 起点。' },
    ],
    cssImpl: `.offleft { position:absolute; left:-40%; bottom:0; }  /* 屏外左 */`,
    perfTips: `它只是起点站位，单独 show 会看不到人；必须配 moveinright 等滑入转场才有意义。`,
  },

  'bi-offright': {
    artGuide: `offscreenright 把立绘放到屏幕右边之外，是 moveoutright 的离场终点，角色往画外走去时最后站这儿。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '屏外右侧', range: '—', effect: '立绘在屏幕右边缘之外，作 moveoutright 终点。' },
    ],
    cssImpl: `.offright { position:absolute; right:-40%; bottom:0; }  /* 屏外右 */`,
    perfTips: `同理只是终点站位，需配 moveoutright 离场转场；单独用会「人走出去消失」。`,
  },

  'bi-default': {
    artGuide: `default（也就是 config.default_transform）是每次 show/scene 没写 at 时用的变换，默认等于 center。想让整个项目立绘默认就站某个机位（比如全部贴底偏左一点），改它就是个全局开关。`,
    paramManual: [
      { name: 'config.default_transform', type: 'Transform', def: 'center', range: '任意变换', effect: '未指定 at 时的默认登场变换。' },
    ],
    cssImpl: `/* Web 中可由项目级默认样式统一控制登场机位 */
.default-enter { /* 等价默认 at center 的进入动画 */ }`,
    perfTips: `改 default_transform 是全局影响，务必确认所有 show 都不带 at 的场合仍能正确显示；改坏会导致全项目立绘错位。`,
  },

  'bi-reset': {
    artGuide: `reset 把所有的变换属性（pos/rotate/zoom/alpha/matrixcolor……）一键还原成默认，清掉之前叠上去的东西，等于舞台清屏重启。切换机位、重设姿态之前先 reset 一下，能防止上一轮变换的残留污染下一幕。`,
    paramManual: [
      { name: '(无独立参数)', type: '—', def: '清空全部叠加', range: '—', effect: '所有 transform 属性还原默认，清除残留。' },
    ],
    cssImpl: `/* 还原内联样式 = reset */
el.style.transform = ''; el.style.opacity = ''; el.style.filter = '';`,
    perfTips: `它是「防叠加污染的保险丝」：长演出里多次变换后务必 reset，否则 rotate/zoom 残留会让下一幕立绘莫名歪斜或缩放。
但 reset 也会清掉你本想保留的状态，用前确认当前帧不需要保留任何变换。`,
  },
}
