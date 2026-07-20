import type { Encyclopedia } from './types'

// 三、位移与移动（Movement）
export const movementEnc: Encyclopedia = {
  move: {
    artGuide: `move 就是「同一个角色换站位」的核心：当你给同一个 tag 的立绘换个 at 机位，Ren'Py 会用 0.5 秒把坐标平滑补间过去——角色从左走到右、从远处走近、换个座，都靠它。前提是新旧两帧得是同一个 tag（同一个角色），不然引擎不知道怎么补，就退化成硬切了。它和 movein*/moveout* 的区别：move 是「已经在场的人自己挪」，后两个是「新人进来 / 旧人消失」。`,
    paramManual: [
      { name: '(默认时长)', type: 'float', def: '0.5', range: '秒（由 MoveTransition 决定）', effect: '位置插值总时长，默认 0.5s；可换用更长/更短的 MoveTransition 改变。' },
    ],
    cssImpl: `/* 同 tag 立绘换机位：对 transform 做 transition 自动补间 */
.sprite { transition: transform .5s ease; }
.sprite.left  { transform: translateX(-30%); }
.sprite.right { transform: translateX( 30%); }`,
    perfTips: `move 只在「同 tag 前后两帧」成立；若 show 的是不同 tag（或先 hide 再 show），不会触发补间而是硬切。
多图层立绘（身体+表情）需整体作为一个 transform 一起移动，否则子层错位。`,
  },

  moveinright: {
    artGuide: `movein* 是专门给「新角色登场」用的：立绘之前不在场上，于是让它从指定的屏外边（left/right/top/bottom）滑进来到 at 指定的机位。角色第一次亮相、从门外走进、从屏幕侧边滑入，都用它。跟 move 的区别是：movein 假定「之前没这个人」，只进不出；move 是「人一直都在，只是挪了位置」。`,
    paramManual: [
      { name: 'side', type: "'right' 等", def: '—', range: 'left/right/top/bottom', effect: '决定立绘从哪个屏外缘进入，即初始偏移方向。' },
    ],
    cssImpl: `/* 新立绘从右侧屏外滑入到目标机位 */
.movein { transform: translateX(100%); animation: moveIn .5s ease forwards; }
@keyframes moveIn { to { transform: translateX(0); } }`,
    perfTips: `必须配 at 指定目标机位，否则默认滑入到 center。
若场景里已有一个同 tag 立绘，movein 不会「顶替」它而是叠加，注意清理旧实例。`,
  },

  moveoutright: {
    artGuide: `moveout* 是「立绘退场」专用：把当前在场的立绘朝指定的屏外边滑出去，然后 hide。常写在 hide 的 with 里，让退场也有戏——角色离场走去、退出对话、被人「请出去」那一下滑动。单独 hide 不写 with 就是硬切消失，干巴巴的一点情绪都没有；用 moveoutright 才「走得有戏」。`,
    paramManual: [
      { name: 'side', type: "'right' 等", def: '—', range: 'left/right/top/bottom', effect: '决定立绘朝哪个屏外缘离场。' },
    ],
    cssImpl: `/* 在场立绘朝右侧屏外滑出后退场 */
.moveout { animation: moveOut .5s ease forwards; }
@keyframes moveOut { to { transform: translateX(100%); } }`,
    perfTips: `只有当立绘「当前在场」时 moveout 才有意义；若它本就不在场，with 不会显形任何东西。
注意与对话节奏配合，离场动画期间避免立即切走下一句导致被截断。`,
  },

  easeinright: {
    artGuide: `easein*/easeout* 是 movein*/moveout* 的「余弦缓动版」：把默认匀速换成首尾柔、中间快的余弦曲线，移动就带上了重量感和惯性，比匀速的 move 自然、更像真人走动。8 种组合（easein/out × 四个方向）覆盖了所有「带惯性的进出」需求。`,
    paramManual: [
      { name: 'variant', type: 'str', def: '—', range: 'easeinleft/right/top/bottom、easeoutleft/right/top/bottom', effect: '决定方向 + 进/出 + 余弦缓动。' },
    ],
    cssImpl: `/* 余弦缓动（ease 曲线）的滑入 */
.movein-ease { animation: easeIn .5s cubic-bezier(.42,0,.58,1) forwards; }
@keyframes easeIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`,
    perfTips: `余弦缓动首尾柔，适合「有生命感」的走动；但若节奏太快会显得拖泥带水，时长与对话语速要匹配。
不要和线性 move 混用在同一段连续移动里，否则速度曲线突变不自然。`,
  },

  'move-transition': {
    artGuide: `MoveTransition 是 move、movein*、moveout*、ease* 的底层类，把「位置补间」抽象成 enter/leave 两个变换加上 time_warp 缓动。当你要自定义移动轨迹（比如走弧线、带旋转进场），或者批量生成一整族转场时，直接调它。它是移动演出的引擎，上面那些方便的转场全都是它的预设实例。`,
    paramManual: [
      { name: 'delay', type: 'float', def: '0.5', range: '>0 秒', effect: '位置插值补间秒数。' },
      { name: 'enter', type: 'Transform?', def: 'None', range: 'Transform', effect: '定义新立绘从哪来、怎么进（位移/旋转）。' },
      { name: 'leave', type: 'Transform?', def: 'None', range: 'Transform', effect: '定义旧立绘去哪、怎么走。' },
      { name: 'time_warp', type: 'warper', def: '_warper.linear', range: '任意缓动函数', effect: '位置随时间的曲线，决定惯性感。' },
    ],
    cssImpl: `/* 自定义 enter/leave + 缓动 */
const t = new MoveTransition(0.5,
  enter: offscreenRight, leave: warpOut, time_warp: _warper.ease);
/* Web：newEl.animate([fromTransform, toTransform], {duration:500, easing:'ease'}) */`,
    perfTips: `自定义 enter/leave 时，注意不要在两段变换里同时改「同一个属性」（如都改 xpos），会冲突覆盖。
复杂轨迹若叠加其它变换属性，调试时建议单图层验证。`,
  },

  'move-transitions': {
    artGuide: `move_transitions(prefix, delay) 是个工厂函数：一行就批量 define 出 prefix、prefix_in*、prefix_out* 共 9 个移动转场，省得手写九条。当你想一次性拿到一整族「统一风格」的移动转场（比如全带缓动、全带旋转）时，它是最高效的入口。它生成的是全局 define 名，在游戏初始化阶段调一次就行。`,
    paramManual: [
      { name: 'prefix', type: 'str', def: '—', range: '任意前缀', effect: '生成 prefix / prefix_in* / prefix_out* 共 9 个转场名。' },
      { name: 'delay', type: 'float', def: '0.5', range: '>0 秒', effect: '整族统一的补间秒数。' },
    ],
    cssImpl: `// 工厂：循环四个方向批量生成
move_transitions("fly", 0.5)
/* 等价于 define fly, fly_inleft, fly_inright, fly_intop, fly_inbottom,
   fly_outleft, ... fly_outbottom 共 9 个 */
// Web 可写一个 generator 批量注册 CSS 类`,
    perfTips: `它生成的是全局 define，调用一次即可；重复调用会覆盖定义。
若只需其中几个方向，手写反而更省，不必为用工厂而用工厂。`,
  },
}
