import type { Encyclopedia } from './types'

// 二、擦除与滑动（CropMove 家族）
export const cropEnc: Encyclopedia = {
  wiperight: {
    artGuide: `wipe 像一块刮板把新画面沿着某个方向一段段揭开，旧画面一直躺在底下不动。这种「逐段揭示」的质感自带科技扫描、画卷铺开、地图展开、信息载入那股劲儿，也适合「秘密一点点被揭开」的场面。但别往角色对话切换里塞——纯几何擦除太冷硬，会打断情绪，对话还是用 dissolve 更顺。`,
    paramManual: [
      { name: 'mode', type: "'wiperight' 等", def: '—', range: 'wiperight/wipeleft/wipeup/wipedown', effect: '决定裁剪盒哪条边移动及方向，即揭示从哪侧开始。' },
    ],
    cssImpl: `/* clip-path inset 滑移揭示新层 */
.wipe { clip-path: inset(0 100% 0 0); animation: wipeR 1s linear forwards; }
@keyframes wipeR { to { clip-path: inset(0 0 0 0); } }  /* 右边界从 100% 推到 0，左→右显形 */`,
    perfTips: `clip-path inset 动画在现代浏览器由合成器处理，GPU 友好、开销低。
但要避免与同时作用的大 blur/filter 叠加——会强制整层走主线程重绘，掉帧。多层 wipe 注意 z 序。`,
  },

  slideright: {
    artGuide: `slide 是整张新画面作为一个整体从屏外平移进来、彻底盖住旧图，旧图自己不运动。它强调的是「一个新东西推门进来了」——新场景登场、UI 面板滑入、整屏内容替换都用它。跟 wipe 的区别是：slide 是整块在动（有位移感），wipe 是就地揭开（不动）。对话里角色换位置用 move，整屏替换才用 slide。`,
    paramManual: [
      { name: 'mode', type: "'slideright' 等", def: '—', range: 'slideleft/right/up/down', effect: '决定初始屏外偏移方向与平移进场方向。' },
    ],
    cssImpl: `/* 整层从右侧屏外平移进场 */
.slide { transform: translateX(100%); animation: slideIn 1s ease forwards; }
@keyframes slideIn { to { transform: translateX(0); } }`,
    perfTips: `translate 动画是合成器最便宜的动画之一。注意新层进场前是屏外元素，若容器 overflow 未 hidden 会先出现横向滚动条——给舞台容器设 overflow:hidden。`,
  },

  slideawayright: {
    artGuide: `slideaway 是旧画面整体平移出屏外、露出底下早就位的新画面，强调的是「旧东西离场走人了」——旧场景退场、角色走出画面、镜头跟着离去的背影都用它。跟 slide 反过来：slide 是新进，slideaway 是旧走。两个配合能做「旧角色滑出去、新角色滑进来」的接力。`,
    paramManual: [
      { name: 'mode', type: "'slideawayright' 等", def: '—', range: 'slideawayleft/right/up/down', effect: '决定旧图离场方向（移出到哪侧屏外）。' },
    ],
    cssImpl: `/* 旧层平移出右侧屏外，露出底层新层 */
.slideaway { animation: slideOut 1s ease forwards; }
@keyframes slideOut { to { transform: translateX(100%); } }`,
    perfTips: `底层新画面需提前就位（z 序在旧层之下），否则会露出空白。
同样给舞台容器 overflow:hidden，避免离场元素撑出滚动条。`,
  },

  pushright: {
    artGuide: `push 是新图旧图绑定在一起、同速反向联动：新图从一边进来的同时，旧图被推着从另一边出去，像推开门板、新场景把旧场景挤走。它强调的是「对冲」——时代更替、对手登场把主角逼退、空间被占。跟 slide 的关键区别在于旧图动不动：push 里旧图必定在动，slide 里旧图不动。`,
    paramManual: [
      { name: 'mode', type: "'pushright' 等", def: '—', range: 'pushleft/right/up/down', effect: '决定位移轴与方向，两图速度大小相等、方向相反。' },
    ],
    cssImpl: `/* 新层进、旧层出，同速反向 */
.new { transform: translateX(100%); animation: pushNew 1s ease forwards; }
.old { animation: pushOld 1s ease forwards; }
@keyframes pushNew { to { transform: translateX(0); } }
@keyframes pushOld { to { transform: translateX(-100%); } }`,
    perfTips: `两个图层同时位移，合成器开销翻倍但仍在 GPU 友好范围。
务必保证新层初始在正确屏外、旧层初始在正位，否则会出现「双层重叠露白」的错位。`,
  },

  iris: {
    artGuide: `iris 是用一个矩形裁剪框从一个角上的点放大到全屏（irisin），或者反过来收束到一点（irisout），像摄影机光圈或者取景框。这种聚焦感天生适合「盯住某个东西、镜头推近、回忆的聚焦点出现、进入某个界面时框选」。irisout 收束到一点特别适合场景结束、世界变暗、或者被「吸进」某处。`,
    paramManual: [
      { name: 'mode', type: "'irisin' / 'irisout'", def: '—', range: 'irisin / irisout', effect: 'irisin: 盒 0→满（展开）；irisout: 盒 满→0（收束）。' },
    ],
    cssImpl: `/* 矩形裁剪盒从角落点放大/收束 */
.iris { clip-path: inset(50% 50% 50% 50%); animation: irisO 1s ease forwards; }
@keyframes irisO { to { clip-path: inset(0 0 0 0); } }   /* irisin：从中心一点展开 */`,
    perfTips: `clip-path 中心展开很便宜。但若同时叠加发光/模糊会重绘。
irisout 收束时画面最终只剩角落一点，注意收束中心要落在有视觉重点处，否则收束到空背景很尴尬。`,
  },

  blinds: {
    artGuide: `blinds 是一组竖条带一条条揭开新画面，像百叶窗叶片依次拉开。它自带复古 UI、侦探窥视、机关开启、遮遮掩掩揭开的俏皮感，也适合「恶作剧式偷偷看」的场面。底层是 ImageDissolve 的条带控制图，每条纹里的亮度渐变，随进度各自独立显出来。`,
    paramManual: [],
    cssImpl: `/* 重复线性渐变 mask 做竖条逐条揭示 */
.blinds {
  mask-image: repeating-linear-gradient(90deg, #000 0 8%, transparent 8% 16%);
  animation: blindsReveal 1s steps(10) forwards;
}
@keyframes blindsReveal { to { mask-position: 100% 0; } }  /* 条带逐条推进 */`,
    perfTips: `repeating-linear-gradient mask + steps() 很便宜。条带数（mask 周期）越多越细，但太多会显得密集刺眼；建议 8~16 条。
mask 合成在部分旧 GPU 上略慢，移动端注意。`,
  },

  squares: {
    artGuide: `squares 是把画面切成方格、一个格子一个格子地显出来，做出「像素拼图、故障重组、魔法阵凝聚、监控画面拼合」的质感。它比 blinds 更碎、更数字感。底层是 ImageDissolve 的方格控制图，按离中心的距离决定显形先后，由内向外拼起来。`,
    paramManual: [],
    cssImpl: `/* 用 grid + 逐格延迟做方块揭示 */
.grid { display: grid; grid-template: repeat(n,1fr)/repeat(n,1fr); }
.cell { opacity: 0; animation: cellIn .4s forwards; }
/* 每格设 --i，delay = calc(var(--i) * 30ms) 形成由内向外拼合 */
@keyframes cellIn { to { opacity: 1; } }`,
    perfTips: `逐格 DOM 方案在方格数多（如 16×16=256 个）时会创建大量节点，重排成本高；Web 里更推荐用单张 canvas 按格绘制或 mask 网格。
太多小方块的闪烁对光敏人群不友好。`,
  },

  'cropmove-class': {
    artGuide: `CropMove 是 wipe、slide、slideaway、iris 这些转场的底层基类。当你要官方没给的「奇葩几何转场」——斜着擦、缩放式揭示、自定义形状的 iris——就用 mode="custom" 自己手写 startcrop/startpos/endcrop/endpos 这几个端点。它是转场界的乐高，会玩的人能用它拼出任何几何想象。`,
    paramManual: [
      { name: 'time', type: 'float', def: '1.0', range: '>0 秒', effect: 'crop/pos 从 start→end 的插值秒数。' },
      { name: 'mode', type: 'str', def: '—', range: "wipe*/slide*/slideaway*/iris*/custom", effect: '预设端点；custom 时由下方参数自定义。' },
      { name: 'startcrop', type: '(4)tuple', def: '(0,0,1,1)', range: '(x,y,w,h) 比例', effect: '起始裁剪盒，相对图自身，(0,0,1,1) 表示整图。' },
      { name: 'startpos', type: '(2)tuple', def: '(0,0)', range: '(x,y) 偏移', effect: '起始位置偏移，如 (1,0) 表示右移一整屏。' },
      { name: 'endcrop', type: '(4)tuple', def: '(0,0,1,1)', range: '(x,y,w,h) 比例', effect: '结束态裁剪，通常 (0,0,1,1) 显全图。' },
      { name: 'endpos', type: '(2)tuple', def: '(0,0)', range: '(x,y) 偏移', effect: '结束态位置，通常 (0,0) 正位。' },
    ],
    cssImpl: `/* custom：对 crop 盒 + 位置做线性插值 */
@keyframes customCrop {
  from { clip-path: inset(0 100% 0 0); transform: translateX(0); }
  to   { clip-path: inset(0 0 0 0);    transform: translateX(0); }
}
/* 实际由 JS 在 time 内把 crop/pos 从 start 线性插值到 end */`,
    perfTips: `自定义端点时务必保证 start/end 的裁剪盒与位置自洽，否则会出现「画面跳变」或「露出空白」。
复杂 custom 转场若叠加多图层，逐帧插值成本高，建议单图层演示。`,
  },

  'pushmove-class': {
    artGuide: `PushMove 是推挤类转场的基类，给旧图和新图施加等大反向的位移。当你要自定义推挤的时长或者方向（而不是官方预设的那几个 pushright 之类）时用它。跟 CropMove 的区别：CropMove 是单图裁剪加位移，PushMove 是双图联动位移。`,
    paramManual: [
      { name: 'time', type: 'float', def: '1.0', range: '>0 秒', effect: '双图位移的秒数。' },
      { name: 'mode', type: 'str', def: '—', range: 'pushright/left/up/down', effect: '决定位移轴与方向。' },
    ],
    cssImpl: `/* 双图联动：JS 在 time 内对 new/old 各施加等大反向 translate */
function pushMove(time, dir) {
  const off = dir === 'right' ? 100 : -100;
  newEl.animate([{transform:\`translateX(\${off}%)\`},{transform:'translateX(0)'}], {duration:time});
  oldEl.animate([{transform:'translateX(0)'},{transform:\`translateX(\${-off}%)\`}], {duration:time});
}`,
    perfTips: `双图层同时位移，合成器开销翻倍但可控。保证两图初末态正确，避免露白错位。`,
  },
}
