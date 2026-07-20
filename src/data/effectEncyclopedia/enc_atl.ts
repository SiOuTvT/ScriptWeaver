import type { Encyclopedia } from './types'

// 十二、ATL 动画语句
export const atlEnc: Encyclopedia = {
  'atl-interp': {
    artGuide: `Interpolation（插值语句）是 ATL 最核心的语句，格式「warper 时长 属性 目标值」：引擎记录属性当前值作起点，按缓动曲线在时长内补间到目标。任何属性动画（移动、淡入、缩放、旋转）都由它驱动，多条顺序执行即关键帧序列。
可以说，没有插值语句就没有 ATL 动画。`,
    paramManual: [
      { name: 'warper time prop value', type: '—', def: '—', range: '缓动 时长 属性 目标值', effect: '属性从当前值按 warper 曲线在 time 内到 value。' },
    ],
    cssImpl: `/* Web 等价：Web Animations API 关键帧 */
el.animate([{xpos:0},{xpos:1}], {duration:2000, easing:'linear'});
/* 或 CSS transition 配过渡属性 */`,
    perfTips: `多条插值「顺序执行」，总时长 = 各条之和；当前值取决于上一条结果，注意链式依赖。
属性名要用 Ren'Py 的 transform 属性名（xpos 而非 left），写错会当普通语句忽略。`,
  },

  'atl-pause': {
    artGuide: `pause 在时间线上空转指定秒数，不修改任何属性，用于关键帧之间的留白/呼吸。单独写个数字（如 2.0）等价 pause 2.0——这是让一个动作「悬停」一会儿再继续的逗号。`,
    paramManual: [
      { name: 'time', type: 'float', def: '—', range: '秒', effect: '时钟前进 time 秒，属性不变。' },
    ],
    cssImpl: `/* Web：在动画序列里插入延迟 */
await delay(1000);  // 等价 pause 1.0
// 或 CSS animation-delay / keyframes 里的留白区间`,
    perfTips: `pause 只空转不重绘，免费；但长 pause 期间画面静止，给点字幕/氛围反馈避免像卡死。`,
  },

  'atl-time': {
    artGuide: `time 把后续语句锚定到时间线绝对时刻（而非接在上一条之后），便于多轨同步编排——多条 time 语句让不同属性在各自绝对时刻启动，像关键帧的绝对时间戳。`,
    paramManual: [
      { name: 'time', type: 'float', def: '—', range: '绝对秒数', effect: '后续语句从时间线第 N 秒开始。' },
    ],
    cssImpl: `/* Web：用绝对时间轴调度，如 GSAP timeline 的 .add(..., N) */
tl.add(tween, 2.0);  // 第 2 秒启动`,
    perfTips: `time 与相对顺序混用容易乱，复杂编排建议全程用 time 绝对锚定，避免「接龙」累积误差导致不同步。`,
  },

  'atl-repeat': {
    artGuide: `repeat 让整个块从头重复（可带次数 repeat 3）。它是呼吸、自转、飘浮等「永续动画」的关键。不带参数 = 无限循环；repeat N = 只重复 N 次后停止。`,
    paramManual: [
      { name: 'count', type: 'int?', def: '∞（省略）', range: '≥1 整数', effect: '省略=无限循环；N=重复 N 次后停。' },
    ],
    cssImpl: `/* Web：CSS infinite；或 repeat N */
@keyframes breathe { 0%{scale:1} 50%{scale:1.1} 100%{scale:1} }
.el { animation: breathe 2s ease-in-out infinite; }`,
    perfTips: `无限 repeat 会一直占用渲染，静止场景里要节制；配合 animation 语句避免每次循环时间错位。
repeat 块内若有 time 绝对锚点，循环行为可能异常，用相对语句更稳。`,
  },

  'atl-parallel': {
    artGuide: `parallel 让多个块同时执行——一边左右移动、一边上下浮动。但要注意：同一数据块内不要同时改互相冲突的属性（后者的时间线覆盖前者）。`,
    paramManual: [],
    cssImpl: `/* Web：两个独立 animation 同时跑 */
el.animate([/* X 轴 */], {...});
el.animate([/* Y 轴 */], {...});   // 并行`,
    perfTips: `并行块若改同一属性会冲突覆盖，让你「明明写了两个动画却只看到一个」。
分轴（X/Y/rotate 各立一个块）最安全，避免属性打架。`,
  },

  'atl-choice': {
    artGuide: `choice 按权重随机挑一个分支执行，做「眨眼随机 / 多套表情随机 / 自然不重复」演出。可给分支权重，默认等权——让每次播放都不一样的随机感。`,
    paramManual: [],
    cssImpl: `/* Web：随机选分支 */
function choice(branches){ return branches[Math.floor(Math.random()*branches.length)]; }`,
    perfTips: `随机演出要避免「连续两次同一分支」显得假，可加去重逻辑。
choice 内各分支时长尽量一致，否则随机到短分支时整体节奏跳变。`,
  },

  'atl-block': {
    artGuide: `block 把一组语句聚成可重复/可并行的单元，是 repeat/parallel/choice 的内容载体。本身不改变行为，但界定作用范围——缩进错会导致语句「逃逸」到外层。`,
    paramManual: [],
    cssImpl: `/* Web：用函数/对象封装一段动画逻辑 */
function blockIdle(){ return [tweenA, tweenB]; }  // 等价 block`,
    perfTips: `block 仅作容器；写错缩进是最常见 bug 来源，务必对齐块内语句的层级。`,
  },

  'atl-contains': {
    artGuide: `contains 在当前变换内嵌一个子显示件（图像或带 ATL 的 block），子件拥有独立 ATL 时间线——立绘上再叠一个飘动的光效/独立表情，父子层级清晰。`,
    paramManual: [],
    cssImpl: `/* Web：嵌套元素各自动画 */
<div class="sprite">
  <div class="glow"></div>  {/* 子件独立 animation */}
</div>`,
    perfTips: `子件独立时间线，父层 transform 会影响子层定位；深嵌套过多层会增加合成层开销，别无必要不深嵌。`,
  },

  'atl-function': {
    artGuide: `function 把动画交给 Python 函数逐帧驱动，函数接收 (trans, st, at) 并返回下一帧间隔 delay（或 None 结束），能实现任意算法化动画——粒子、物理、逐像素，是 ATL 的「终极逃生舱」。`,
    paramManual: [
      { name: 'func', type: 'callable', def: '—', range: '(trans, st, at) -> delay|None', effect: '每帧调用，返回下一帧间隔；None=结束。' },
    ],
    cssImpl: `/* Web：requestAnimationFrame 逐帧驱动 */
function fn(t){ /* 粒子/物理更新 */ return done ? null : 16; }
requestAnimationFrame(loop);`,
    perfTips: `逐帧函数开销取决于内部逻辑，粒子/物理计算重时掉帧；务必在 done 时返回 null 结束，否则无限空转吃 CPU。`,
  },

  'atl-on': {
    artGuide: `on 是 ATL 的事件状态机：当 show/hide/hover/idle 等事件发生时执行对应 block——立绘「被 show 时淡入、被 hide 时淡出、hover 时放大」，行为随状态自动切换。`,
    paramManual: [
      { name: 'event', type: 'str', def: '—', range: 'show/hide/hover/idle/自定义', effect: '逗号可并列多个事件名。' },
    ],
    cssImpl: `/* Web：事件监听触发动画 */
el.onmouseenter = () => el.animate([{scale:1},{scale:1.1}], {duration:200});`,
    perfTips: `on 的 block 在事件发生时「打断」当前动画执行，注意与 repeat/parallel 共存时的优先级，避免状态机打架。`,
  },

  'atl-event': {
    artGuide: `event 在动画某时刻主动广播一个命名事件，供外层 on 语句或 Python 监听，实现跨层联动——走到某步触发音效/对话/外部逻辑。`,
    paramManual: [
      { name: 'name', type: 'str', def: '—', range: '事件名', effect: '广播的命名事件标识。' },
    ],
    cssImpl: `/* Web：自定义事件派发 */
el.dispatchEvent(new CustomEvent('arrived'));`,
    perfTips: `配合 on 或监听器使用才有意义；孤立的 event 只是「喊一声没人听」。事件名要与监听端严格一致。`,
  },

  'atl-with': {
    artGuide: `with 在显示件切换时套用一次转场（如 contains 换子图时 dissolve），让子层切换也丝滑。最常见于 contains 换子图时，避免硬切——本层切换不再硬切、同样柔和。`,
    paramManual: [
      { name: 'transition', type: 'Transition', def: '—', range: '任意转场', effect: '作用于本次显示件切换。' },
    ],
    cssImpl: `/* Web：换图时套 CSS 过渡 */
img.style.opacity = 0;
setTimeout(() => { img.src = newSrc; img.style.opacity = 1; }, 200);`,
    perfTips: `子层 with 转场会增加一次重绘；高频换子图（如逐帧换表情）配重转场会卡，轻量 dissolve 即可。`,
  },

  'atl-pass': {
    artGuide: `pass 是空操作占位语句（no-op），不修改任何属性、不消耗额外时间，仅用于对齐 if/choice 分支结构或预留扩展点。`,
    paramManual: [],
    cssImpl: `// Web：空函数 / no-op
function pass(){}`,
    perfTips: `它完全无副作用，误以为它「有等待作用」是常见误解；需要停顿请用 pause。`,
  },

  'atl-animation': {
    artGuide: `animation 声明该变换使用「动画时间基(at)」而非「显示时间基(st)」，使循环/重播时时间归零，避免续播错位。对 repeat 循环动画几乎必加——否则循环可能卡在半途。`,
    paramManual: [],
    cssImpl: `/* Web：每次重播重置 startTime，等价 animation 时间基 */
function restart(){ start = performance.now(); }`,
    perfTips: `忘加 animation 的 repeat 动画可能在「循环中间」续播，看起来卡顿错位；带 repeat 的块建议默认加。`,
  },
}
