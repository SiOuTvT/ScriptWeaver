import type { Encyclopedia } from './types'

// 一、基础转场（Basic Transitions）
export const basicEnc: Encyclopedia = {
  dissolve: {
    artGuide: `Dissolve 就是最普通的淡入淡出，平时切对话、换背景基本都用它。它不抢戏，情绪是连续流动的，所以适合那种「不想让玩家感觉到转场」的安静时刻，日常对话、清晨到正午的光影、角色默默掉眼泪时背景悄悄换掉。但正因为它太安全，新手最容易滥用：大转折、真相揭晓、章节切换这种该有仪式感的节点，换更有重量的转场，别拿 dissolve 轻轻带过，那样高潮也会被磨平。`,
    paramManual: [
      { name: 'time', type: 'float', def: '0.5', range: '>0 秒', effect: 't 从 0→1 的线性跨度。越大过渡越慢越柔；<0.3s 会显得仓促。' },
      { name: 'alpha', type: 'bool', def: 'False', range: 'True / False', effect: 'True 时按每像素 alpha 加权混合，避免半透明边缘出现黑边；带透明通道的图建议开。' },
    ],
    cssImpl: `/* 双图层交叉淡化：新层淡入、旧层反向淡出 */
.dissolve-new { animation: dFadeIn var(--t, .5s) linear forwards; }
.dissolve-old { animation: dFadeOut var(--t, .5s) linear forwards; }
@keyframes dFadeIn  { from { opacity: 0 } to { opacity: 1 } }
@keyframes dFadeOut { from { opacity: 1 } to { opacity: 0 } }
/* Web 近似：两层 absolute 叠放，同时反向 opacity 动画即为交叉淡化 */`,
    perfTips: `几乎零成本：仅 opacity 变化，GPU 合成层即可完成。但 Dissolve 同时持有「旧+新」两层，各占一个合成层；若场景已堆叠大量常驻图层，再叠 dissolve 会临时翻倍显存占用。
多图层叠加转场时注意 z 层级，避免新层被旧层背后的其它图层穿透遮挡。`,
  },

  fade: {
    artGuide: `Fade 是翻篇用的，中间经过一段纯色（默认黑）再回来，所以它比 dissolve 更重、更有仪式感。章节切换、时间跳跃、一段回忆的开头和结尾、情绪强烈的大转折，用这个最合适。但别往高频日常对话里塞，每次黑场都会把玩家从沉浸里弹出来。白场（color="#fff"）适合醒来、闪回、或者圣洁感的瞬间。`,
    paramManual: [
      { name: 'out_time', type: 'float', def: '0.5', range: '≥0 秒', effect: '旧画面 alpha 1→0 淡出到纯色屏的秒数。' },
      { name: 'hold_time', type: 'float', def: '0.0', range: '≥0 秒', effect: '纯色屏保持秒数；总时长 = out + hold + in。' },
      { name: 'in_time', type: 'float', def: '0.5', range: '≥0 秒', effect: '新画面从纯色屏 alpha 0→1 淡入的秒数。' },
      { name: 'color', type: 'Color', def: '"#000"', range: '任意颜色字面量', effect: '中转色屏。黑=夜/转场，白=醒/闪，彩="#3a2f55"=情绪场。' },
    ],
    cssImpl: `/* 经纯色中转的三段式淡入淡出 */
.fade { animation:
  fadeOut var(--out,.5s) linear forwards,
  fadeIn  var(--in,.5s)  linear calc(var(--out,.5s) + var(--hold,0s)) forwards; }
@keyframes fadeOut { from{opacity:1} to{opacity:0} }  /* 到纯色屏 */
@keyframes fadeIn  { from{opacity:0} to{opacity:1} }  /* 从纯色屏 */
/* 纯色屏由底层 .fade-color 背景层提供 */`,
    perfTips: `纯色屏会短暂完全遮挡全部图层，若与其它转场用 ComposeTransition 并行，注意层级谁在上。
color 用非黑非白时，务必确认与画面色调协调，否则一个突兀的彩色全屏会破坏气氛。白场比黑场更刺眼，敏感人群慎用。`,
  },

  flash: {
    artGuide: `Flash 就是「啪一下全白、再慢慢回神」：极短的白场（0.1 秒）把画面一口吞掉，再用稍长的淡入让世界从白里慢慢回来。这种生理感天生对应强光、顿悟、记忆闪回、被打到眼冒金星。它其实就是个偏置过的 Fade（Fade(0.1, 0, 0.5, "#fff")）。唯一要注意：别连续高频爆白，既廉价又可能让光敏性癫痫的人出问题。`,
    paramManual: [
      { name: 'color', type: 'Color', def: '"#fff"', range: '任意颜色', effect: '闪光颜色。白=强光/顿悟；红=血色暴击；青=电流冲击。' },
      { name: '(out / in)', type: 'float', def: '0.1 / 0.5', range: '秒', effect: '内部即 Fade(0.1, 0, 0.5)：爆白一瞬 + 缓慢回神。' },
    ],
    cssImpl: `/* 爆白：极短淡出 + 较长淡入 */
.flash { animation: flashOut .1s linear forwards, flashIn .5s linear .1s forwards; }
@keyframes flashOut { from{opacity:1} to{opacity:0} }  /* 瞬间被白吞没 */
@keyframes flashIn  { from{opacity:0} to{opacity:1} }
/* 底层白屏 .flash-color { background:#fff } 在 .1s 内盖满 */`,
    perfTips: `爆白瞬间整屏接近纯白，对光敏性癫痫人群有风险。若项目面向大众，建议提供「减弱闪白」开关或把白场换成柔和的灰度。
纯白比纯黑更刺眼，连续两次 flash 之间的间隔要足够，避免玩家眩晕。`,
  },

  pixellate: {
    artGuide: `Pixellate 是先把画面打成马赛克块、糊掉，再慢慢收束清晰露出新画面。这种块状质感天然适合信号故障、监控画面、魔法变形、记忆模糊化，也是赛博故障风爱用的。把 reverse=True 反过来，就变成「从最糊开始一点点拼合成形」，变身完成、世界线收束、记忆归位这种瞬间很对味。`,
    paramManual: [
      { name: 'time', type: 'float', def: '0.5', range: '>0 秒', effect: '单程（退出或进入）像素化时长；总时长 ≈ 2×time。' },
      { name: 'steps', type: 'int', def: '5', range: '≥1 整数', effect: '块边长 = 2^step 像素。step=4→16px；step=20 已在 8 位上限附近，块极大。值越大马赛克越夸张。' },
      { name: 'reverse', type: 'bool', def: 'False', range: 'True / False', effect: 'True 时从最糊开始收束，适合「画面拼合成形」。' },
    ],
    cssImpl: `/* Web 近似：canvas 逐块取首像素填充（真·像素化） */
function pixelate(ctx, step) {
  const s = 2 ** step;                       // 块边长
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.imageSmoothingEnabled = false;
  for (let y=0; y<h; y+=s) for (let x=0; x<w; x+=s) {
    const d = ctx.getImageData(x, y, 1, 1).data;  // 块首像素
    ctx.fillStyle = \`rgb(\${d[0]},\${d[1]},\${d[2]})\`;
    ctx.fillRect(x, y, s, s);                      // 整块填同色
  }
}
/* 或纯 CSS 廉价近似：先缩小再放大 + image-rendering:pixelated */`,
    perfTips: `**GPU/CPU 瞬时压力最高的转场之一**：逐帧对整屏像素重采样，steps 越大、画面分辨率越高，开销越陡。
浏览器里用 CSS image-rendering:pixelated 的「缩放下采样再放大」近似极便宜，但不是真算法（块边界不含取均值）。多图层同时 pixellate 会明显掉帧，建议单图层演示。`,
  },

  pause: {
    artGuide: `Pause 就是让画面原样停在那儿 delay 秒，啥视觉变化都不发生。在多重转场序列里，它是两段之间的「逗号」，留一口静默的呼吸。单独用也行，就是想让某一幕多停一会儿，让玩家看清画面细节、或者读完那句关键台词。`,
    paramManual: [
      { name: 'delay', type: 'float', def: '1.0', range: '≥0 秒', effect: '新画面保持的秒数，纯等待不渲染变化。' },
    ],
    cssImpl: `// 无视觉变化，仅时间线上的「空转」
function withPause(delay) {
  return new Promise(res => setTimeout(res, delay * 1000));
}
/* 在转场序列中：await withPause(1.0) 即一秒静止 */`,
    perfTips: `性能上完全免费（不重绘）。但不要在 Pause 期间阻塞交互或让画面「假死」过久——玩家可能以为程序卡了。
长 Pause 建议配一句字幕或轻微氛围变化，给足「这是刻意的停顿」的反馈。`,
  },

  'multiple-transition': {
    artGuide: `MultipleTransition 让你把好几个转场串起来播，写法是「场景、转场、场景、转场……」交替的列表。做复杂情绪推进很方便，比如「先 dissolve 淡出、停一下、再 wiperight 擦进回忆」，一步 with 就全搞定。里面的 "a" "b" 这种字符串是暂停点，可以等玩家点一下再继续，做成可交互的过场。`,
    paramManual: [
      { name: 'args', type: 'list', def: '—', range: '奇数长度列表', effect: '索引 0,2,4… 是场景（None 表示沿用当前画面），1,3,5… 是转场。长度须为奇数。' },
      { name: '(pause 标记)', type: 'str', def: '—', range: '"a" … "z"', effect: '字符串项作为暂停点，可等待交互后再继续后续转场。' },
    ],
    cssImpl: `// 顺序播放转场序列（伪代码）
async function multipleTransition(steps) {
  for (let i = 0; i < steps.length - 1; i += 2) {
    const scene = steps[i];        // 场景（可 None）
    const trans = steps[i + 1];    // 转场
    await playTransition(trans, scene);
  }
}
/* 例：multipleTransition([null, 'dissolve', 'a', 'wiperight']) */`,
    perfTips: `整条序列的耗时 = 各段转场时长之和，容易悄悄拉到 3~5 秒。玩家对长过场耐心有限，建议总时长控制在 3s 内，或把中间停顿用作可跳过的交互点。`,
  },

  'compose-transition': {
    artGuide: `ComposeTransition 把「前置转场 → 主转场 → 后置转场」三段包成一次切换。想一口气做出「闪白 + 溶解 + 像素化」那种复合炸裂感、又不想在脚本里写三行 with，就用它，boss 登场、世界线变动、真相揭露都很合适。说白了就是把三个转场前后裹在一起，所以效果全看你这三段各自挑了啥。`,
    paramManual: [
      { name: 'trans', type: 'Transition', def: '—', range: '任意转场', effect: '主转场，夹在前后置之间。' },
      { name: 'before', type: 'Transition?', def: 'None', range: '任意转场 / None', effect: '先对旧画面施加的前置转场。' },
      { name: 'after', type: 'Transition?', def: 'None', range: '任意转场 / None', effect: '最后对新画面施加的后置转场。' },
    ],
    cssImpl: `/* 三段串行包裹 */
async function compose(before, trans, after, scene) {
  if (before) await play(before, scene);
  await play(trans, scene);
  if (after)  await play(after, scene);
}
/* 例：compose(flash, dissolve, pixellate) */`,
    perfTips: `整体耗时 = 三段时长之和，注意别让复合切换拖太久。
before/after 若各自是重特效（如 pixellate），会与主转场叠加性能开销；同时叠加时还要注意层级与颜色协调，避免三段互相打架看不清。`,
  },

  'alpha-dissolve': {
    artGuide: `AlphaDissolve 是用一张控制图的透明度来决定新画面从哪儿先显出来：控制图不透明的地方先显、透明的地方最后显。这样你就能做出心形、星形、文字轮廓、墨迹晕开这种不规则形状的揭示，浪漫告白时爱心绽开、魔法阵勾勒成形、秘密在墨痕里浮现，都靠它。reverse 反过来，就让揭示从边缘往中心收或者反向。`,
    paramManual: [
      { name: 'control', type: 'Displayable', def: '—', range: '带 alpha 的图', effect: '用其 alpha 通道作显形进度图：alpha=1 处先显，alpha=0 处最后显。' },
      { name: 'delay', type: 'float', def: '1.0', range: '>0 秒', effect: '全局进度 p:0→1 的秒数。' },
      { name: 'reverse', type: 'bool', def: 'False', range: 'True / False', effect: 'True 时 alpha=0 处先显（反方向揭示）。' },
      { name: 'mipmap', type: 'bool?', def: 'None', range: 'True / False', effect: '对控制图做 mipmap，缓解小图放大锯齿、边更柔。' },
    ],
    cssImpl: `/* Web 近似：用 mask-image 控制显示形状（心形 SVG） */
.reveal {
  --p: 0%;
  mask-image: url("heart.svg");
  mask-size: 300% 300%;
  mask-position: calc(100% - var(--p)) center;  /* 进度推进显形 */
  animation: heartReveal 1.5s linear forwards;
}
@keyframes heartReveal { to { --p: 100%; } }`,
    perfTips: `控制图必须是带 alpha 通道的图，缺图会 404 导致整段转场失败（退回硬切）。
大控制图实时计算 alpha 阈值有成本；边缘锯齿可在 Ren'Py 里开 mipmap、在 Web 里用平滑 mask 缓解。移动端合成 mask 也有额外开销。`,
  },

  'image-dissolve': {
    artGuide: `ImageDissolve 跟 AlphaDissolve 差不多，但它是按控制图的亮度（灰度）决定溶解顺序：白的地方先溶进来、黑的地方最后。所以你做的是「从亮处往暗处一点点显形」，晨光洒落、灯光渐亮、由明到暗的梦境浮现，都特别贴。reverse 反过来，让暗部先显、亮部压轴。`,
    paramManual: [
      { name: 'image', type: 'Displayable', def: '—', range: '带亮度信息的图', effect: '用其亮度决定溶解顺序：亮(白)先溶入，暗(黑)最后。' },
      { name: 'time', type: 'float', def: '1.0', range: '>0 秒', effect: '全局进度 p:0→1 秒数。' },
      { name: 'ramplen', type: 'int', def: '8', range: '≥1 像素级', effect: '相邻阈值的过渡带宽（灰度斜坡）。越大边界越柔、计算越慢。' },
      { name: 'reverse', type: 'bool', def: 'False', range: 'True / False', effect: 'True 时暗部先显、亮部最后。' },
    ],
    cssImpl: `/* Web 近似：渐变 mask + mask-size 动画做「由亮到暗」显形 */
.reveal {
  mask-image: linear-gradient(90deg, #000 0%, #fff 100%);
  mask-size: 200% 100%;
  animation: wipeReveal 2s linear forwards;
}
@keyframes wipeReveal { from { mask-position: 100% 0 } to { mask-position: 0 0 } }`,
    perfTips: `ramplen 越大，亮度斜坡越平滑、边界越柔，但实时重算亮度的成本也越高。
大控制图（全屏）每帧重采样亮度对低端 GPU 不友好；Web 近似用渐变 mask 更便宜但不是逐像素真算法。`,
  },

  swing: {
    artGuide: `Swing 是把旧画面像门板一样绕一条边转 90 度，露出背板、换上新画面、再转回来展平，翻页、开门、揭开秘密房间、章节书页翻动都能用它。vertical=True 改成从上往下翻，reverse 换翻转方向。比起平面擦除，它多了点厚度感，适合有物理质感的转场。`,
    paramManual: [
      { name: 'delay', type: 'float', def: '1.0', range: '>0 秒', effect: '总时长；每程旋转 ≈ delay/2 秒。' },
      { name: 'vertical', type: 'bool', def: 'False', range: 'True / False', effect: 'False→绕左边缘 rotateY（左右翻）；True→绕上边缘 rotateX（上下翻）。' },
      { name: 'reverse', type: 'bool', def: 'False', range: 'True / False', effect: '反转旋转方向，换图在另一侧发生。' },
      { name: 'background', type: 'Color', def: '"#000"', range: '任意颜色', effect: '翻转时门板背后的纯色，默认黑。' },
    ],
    cssImpl: `/* 绕左缘 rotateY 90° 露出背板再展平 */
.swing { transform-style: preserve-3d; animation: swing 1s ease forwards; }
@keyframes swing {
  0%   { transform: rotateY(0deg); }
  50%  { transform: rotateY(90deg); }   /* 露出 background 背板，此刻换图 */
  100% { transform: rotateY(0deg); }
}
/* 容器需 perspective: 800px */`,
    perfTips: `3D 旋转必须父容器有 perspective，否则退化成 2D 缩放看起来很怪。
旋转到 90° 的瞬间背面会朝向相机，若未隐藏会「穿帮」看到镜像；background 纯色会在那一瞬短暂盖住画面，选色要与场景协调。`,
  },
}
