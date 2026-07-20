import type { Encyclopedia } from './types'

// 十一、缓动函数（Warpers / Easing）
export const warpersEnc: Encyclopedia = {
  'w-linear': {
    artGuide: `linear 是绝对匀速——进度 p(t)=t，斜率恒为 1，无任何加速减速。它最机械、最「程序感」，适合数字读数、机械运动、进度条等需要「绝对匀速」的场合。
但也正因无缓动，人物走动用它会显得僵硬不自然。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0, 0, 1, 1)', range: 'CSS cubic-bezier', effect: '线性曲线，全程匀速无缓动。' },
    ],
    cssImpl: `transition: transform 1s linear;
/* 或 cubic-bezier(0,0,1,1) 等价 */`,
    perfTips: `纯时间曲线，零渲染开销。但位移类用 linear 会「说停就停」，末端突兀；人物动画少用，机械/数字风才合适。`,
  },

  'w-ease': {
    artGuide: `ease 是 Ren'Py 默认缓动：首尾柔、中间快，自然不突兀。它是标准 CSS ease 贝塞尔，是大多数补间的默认选择——不想思考缓动时，用它就对了。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.25, 0.1, 0.25, 1)', range: 'CSS cubic-bezier', effect: '开头慢加速、中段最快、结尾柔减速。' },
    ],
    cssImpl: `transition: transform 1s ease;  /* 或 cubic-bezier(.25,.1,.25,1) */`,
    perfTips: `零开销的纯曲线。作为默认它很安全，但所有动画都用 ease 会显得「缺乏性格」，重要时刻换更有特征的曲线。`,
  },

  'w-easein': {
    artGuide: `easein 开头慢、结尾快，像「蓄力后加速冲出」——适合物体冲出屏幕、加速离场、发射。它把张力攒在开头，末端猛地到位。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.42, 0, 1, 1)', range: 'CSS cubic-bezier', effect: '起点缓、终点陡，加速冲出。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.42,0,1,1);`,
    perfTips: `零开销。加速离场很带感，但若是「入场」用 easein 会显得「慢吞吞才出现」，入场更适合 easeout。`,
  },

  'w-easeout': {
    artGuide: `easeout 开头快、结尾慢，像「冲进来后轻柔落定」——适合物体减速入场、轻轻落下、柔和显形。它把缓冲放在末端，落点安稳。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0, 0, 0.58, 1)', range: 'CSS cubic-bezier', effect: '起点陡、终点柔，减速落定。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(0,0,.58,1);`,
    perfTips: `零开销。入场/落地的首选缓动；但若物体「从很远冲来」，纯 easeout 起步太突兀，可换 easeinout。`,
  },

  'w-easeinout': {
    artGuide: `easeinout 两端都柔、中间快，是 ease 的「两端对称加强版」，最顺滑无突兀。角色走动、镜头平移、几乎所有平滑补间都用它。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.42, 0, 0.58, 1)', range: 'CSS cubic-bezier', effect: '首尾都柔、中间快，最顺滑。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.42,0,.58,1);`,
    perfTips: `零开销，最通用。但它「太顺滑」也意味着缺乏戏剧性，重大爆点时刻用带过冲的 spring/back 更有冲击。`,
  },

  'w-spring': {
    artGuide: `spring 带过冲回弹，像被弹簧拉到位，活泼有弹性。它模拟弹簧/阻尼振荡，物体会「冲过终点再弹回」，适合弹窗弹出、俏皮 UI、果冻感元素。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.68, -0.55, 0.27, 1.55)', range: '含负/超1 控制点', effect: '进度会冲过终点(>1)再回弹(负值)。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.68,-.55,.27,1.55);`,
    perfTips: `零曲线开销，但过冲会让元素短暂越界——容器需 overflow:hidden 或留余量，否则弹出元素被裁/出现滚动条。`,
  },

  'w-zoomin': {
    artGuide: `zoomin 是专用于缩放进场的缓动，中段有过冲(1.2)使缩放「先略大再回弹到目标」，配套 zoomin 转场的推近登场——怼脸切入更有弹性。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.34, 1.2, 0.64, 1)', range: '中段超 1', effect: '中段过冲使缩放先略大再回弹。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.34,1.2,.64,1);`,
    perfTips: `专配缩放；过冲会让立绘瞬间略大于目标，注意别和 crop 边界打架（放大露透明边）。`,
  },

  'w-zoomout': {
    artGuide: `zoomout 专用于缩放离场的缓动，起步快、末端带轻微负向回弹，配套 zoomout 转场的远去感——缩小消逝更自然。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.36, 0, 0.66, -0.2)', range: '末端负向', effect: '起步快、末端轻微负向回弹远去。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.36,0,.66,-.2);`,
    perfTips: `零开销。负值回弹幅度极小，主要为了「收尾不死板」，配合 alpha 淡出更顺。`,
  },

  'w-bounce': {
    artGuide: `bounce 落地后多次小弹跳，俏皮、Q 弹。它用 >1 控制点制造「到终点后小幅回弹」，模拟物体落地的多次弹跳余韵。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.34, 1.56, 0.64, 1)', range: '含超1', effect: '到终点后小幅回弹，Q 弹。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.34,1.56,.64,1);`,
    perfTips: `零曲线开销。弹跳幅度受容器限制，元素终点附近需留空间，否则回弹被裁。`,
  },

  'w-back': {
    artGuide: `ease_back（Penner back）先微退再冲过、最后回弹就位，有「蓄力感」。它起手反向微退（蓄力），再冲过终点，最后回弹，强烈「蓄力→弹出」感——按钮弹出、强调登场。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.68, -0.55, 0.27, 1.55)', range: '含负/超1', effect: '先反向微退蓄力，再冲过回弹就位。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.68,-.55,.27,1.55);`,
    perfTips: `零开销，但「先退再进」的蓄力会让入场元素短暂往反方向移，确认那点反向位移不会露出空白/穿帮。`,
  },

  'w-bounce-p': {
    artGuide: `ease_bounce（Penner bounce）是标准 Penner 弹跳曲线，落地回弹逐次减半，比 CSS bounce 更「物理」。它精确模拟重力落地后衰减的弹跳余韵。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.34, 1.56, 0.64, 1)', range: '含超1', effect: '逐次减半的弹跳衰减。' },
    ],
    cssImpl: `/* Penner bounce 需分段关键帧，非单一 cubic-bezier 可表；Web 用 @keyframes 多段近似 */
@keyframes pennerBounce { 0%{transform:translateY(-100%)} 60%{transform:translateY(0)} 80%{transform:translateY(-15%)} 100%{transform:translateY(0)} }`,
    perfTips: `Penner 物理弹跳无法用单条 cubic-bezier 表达，真实实现是分段曲线；Web 近似用多关键帧。零额外渲染开销。`,
  },

  'w-circ': {
    artGuide: `ease_circ 用四分之一圆周函数，起步极缓、收尾极陡（加速度持续增大），适合「慢慢起势后骤然到位」——蓄力大招、能量汇聚后爆发。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.08, 0.82, 0.17, 1)', range: 'CSS cubic-bezier', effect: '起步极缓、收尾极陡。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.08,.82,.17,1);`,
    perfTips: `零开销。收尾极陡意味着「末段突然加速」，适合爆发；但若是匀速期望的进度条，circ 会让人误判剩余时间。`,
  },

  'w-cubic': {
    artGuide: `ease_cubic 用三次多项式，比二次(quad)更柔更缓，起止都更克制。需要比 quad 更柔的通用缓动时用它。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.65, 0, 0.35, 1)', range: 'CSS cubic-bezier', effect: '三次缓动，比 quad 更柔。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.65,0,.35,1);`,
    perfTips: `零开销。它和 easeinout 观感接近但曲线更「圆」，差别微妙，按项目统一风格选其一即可。`,
  },

  'w-elastic': {
    artGuide: `ease_elastic 用衰减正弦叠加，进度会大幅来回震荡多次才归位，弹性张力极强，戏剧化。夸张登场、魔法弹簧、需要「震一下」的强调。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.68, -0.55, 0.27, 1.55)', range: '近似（真实为多段）', effect: '大幅来回震荡后归位，弹性张力强。' },
    ],
    cssImpl: `/* 真实 elastic 需多段 keyframes 近似单 cubic-bezier 不足 */
@keyframes elastic { 0%{transform:scale(0)} 40%{transform:scale(1.15)} 60%{transform:scale(.95)} 100%{transform:scale(1)} }`,
    perfTips: `弹性震荡幅度大，元素会大幅越界；务必给足容器余量或 overflow:hidden。光敏/眩晕人群对大幅回弹较敏感。`,
  },

  'w-expo': {
    artGuide: `ease_expo 用指数函数，起步极快（瞬间冲出）或收尾极柔（无限趋近），对比极端。闪电瞬移、极速入场、柔和消散。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(1, 0, 0, 1)', range: 'CSS cubic-bezier', effect: '指数级加速/减速，极端对比。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(1,0,0,1);`,
    perfTips: `零开销。起步极快意味着「几乎看不见起点」，适合瞬移；但瞬移太快玩家可能错过，配合音效/残影更清楚。`,
  },

  'w-quad': {
    artGuide: `ease_quad 用二次多项式，最轻量的缓入缓出，比 cubic 更「直」一点。需要比 cubic 更轻的通用缓动时用它。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.45, 0, 0.55, 1)', range: 'CSS cubic-bezier', effect: '二次缓动，轻量柔和。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.45,0,.55,1);`,
    perfTips: `零开销。最轻量的 inout，差别细微；和 cubic 二选一统一风格即可，不必两者都堆。`,
  },

  'w-quart': {
    artGuide: `ease_quart 用四次多项式，缓入缓出比 cubic 更夸张（两端更平、中间更陡）。需要更强缓动对比时。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.76, 0, 0.24, 1)', range: 'CSS cubic-bezier', effect: '四次缓动，对比更强。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.76,0,.24,1);`,
    perfTips: `零开销。对比更强意味着两端「停顿感」更明显，长动画里会显得拖尾；短动画更丝滑。`,
  },

  'w-quint': {
    artGuide: `ease_quint 用五次多项式，缓入缓出最极致，两端极平、中间极陡，最「丝滑厚重」。顶级丝滑补间、电影级运镜。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.83, 0, 0.17, 1)', range: 'CSS cubic-bezier', effect: '五次缓动，极致丝滑。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.83,0,.17,1);`,
    perfTips: `零开销。极致丝滑但两端「几乎不动」的区间较长，急性子玩家可能觉得慢；适合从容的电影感运镜。`,
  },

  'w-sine': {
    artGuide: `ease_sine 用正弦半波，过渡最平滑无拐点，有「呼吸般」的自然感。呼吸动画、漂浮、轻柔往复。`,
    paramManual: [
      { name: 'bezier', type: '(4)控制点', def: '(0.37, 0, 0.63, 1)', range: 'CSS cubic-bezier', effect: '正弦曲线，最平滑呼吸感。' },
    ],
    cssImpl: `transition: transform 1s cubic-bezier(.37,0,.63,1);`,
    perfTips: `零开销，最柔和无拐点。做呼吸/漂浮时它是默认；但缺乏「落点感」，需要明确停住的动画别用。`,
  },

  'w-penner-variants': {
    artGuide: `Penner 三态变体：上述 10 种基函数（back/bounce/circ/cubic/elastic/expo/quad/quart/quint/sine）各有 in（仅缓入）、out（仅缓出）、inout（两端都缓）三种形态，合共 30 种，覆盖几乎所有「加速/减速/回弹/弹跳」需求。
在插值语句里直接用，如 \`ease_inout_elastic 1.0 xpos 0.5\`。`,
    paramManual: [
      { name: 'in 变体', type: 'warper', def: 'ease_in_*', range: '10 种', effect: '仅缓入，适合加速离场/冲出。' },
      { name: 'out 变体', type: 'warper', def: 'ease_out_*', range: '10 种', effect: '仅缓出，适合减速入场/落定。' },
      { name: 'inout 变体', type: 'warper', def: 'ease_inout_*', range: '10 种', effect: '两端都缓，适合平滑补间。' },
    ],
    cssImpl: `/* 以 back 为例的三种形态（CSS 近似）*/
in:     cubic-bezier(.6,-.28,.735,.045);
out:    cubic-bezier(.175,.885,.32,1.275);
inout:  cubic-bezier(.68,-.55,.27,1.55);`,
    perfTips: `30 种里挑最贴切的即可，不必穷举；带 back/elastic 的变体会大幅越界，容器务必留余量。
Web 近似时单 cubic-bezier 无法完美表达 inout_elastic 等复杂曲线，可用多关键帧。`,
  },
}
