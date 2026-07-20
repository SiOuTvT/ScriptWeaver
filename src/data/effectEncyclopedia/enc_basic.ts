import type { Encyclopedia } from './types'

// 一、基础转场（Basic Transitions）
export const basicEnc: Encyclopedia = {
  dissolve: {
    artGuide: `Dissolve 是 Galgame 演出里最温柔的呼吸。当你只想让玩家从一幕「悄然沉入」下一幕、不希望任何几何运动打断情绪流动时，它就是默认答案——日常对话切换、清晨到正午的光影推移、角色默默落泪时背景的轻柔过渡，都该交给它。
但正因为它几乎不会出错，反而容易被滥用：重大转折、冲击性揭示、章节更迭，请换用更有仪式感的转场，别让 Dissolve 把高潮也「轻轻带过」。`,
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
    artGuide: `Fade 是「翻篇」的仪式。经一段纯色（默认黑）中转，它比 Dissolve 更有重量：章节切换、时间跳跃、回忆的开场与收束、情绪强烈转折处，用它最合适。
不要把它塞进高频日常对话——每一次黑场都会打断叙事节奏，让玩家从沉浸里被「弹」出来。白场(color="#fff")则适合「醒来 / 闪回 / 圣洁」的瞬间。`,
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
    artGuide: `Flash 是「瞬间爆白 + 缓慢回神」：极短的淡出白场（0.1s）把画面一口吞没，再用较长淡入（0.5s）让世界从白中缓缓显形。这种生理观感天然对应「强光、顿悟、记忆闪回、被打到眼冒金星」。
它本质只是 Fade 的偏置实例（Fade(0.1, 0.0, 0.5, color="#fff")）。切忌连续高频爆白——强闪光既是视觉暴力，也可能触发光敏性癫痫人群。`,
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
    artGuide: `Pixellate 是块状马赛克先放大糊掉旧画面、再收束清晰出新画面，天然带「信号故障 / 监控画面 / 魔法变形 / 记忆模糊化」的质感，也是赛博故障美学的标配。
把 reverse=True 可反转成「画面从最糊开始慢慢拼合成形」，适合变身完成、世界线收束、记忆重组归位的瞬间。`,
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
    artGuide: `Pause 是个「什么都不做」的演出标点：它把当前画面原样保持 delay 秒，不切换任何视觉。在多重转场序列（MultipleTransition）里，它是让前后两段转场之间留出「静默呼吸」的逗号。
也可以单独用——只是想让某一幕多停留一会儿、让玩家看清画面细节或读完一句关键台词时。`,
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
    artGuide: `MultipleTransition 让你把多个转场「串接播放」，列表是「场景, 转场, 场景, 转场…」交替结构。它是复杂情绪推进的编排器：例如「溶解淡出 → 停顿 → 擦除进入回忆」，一步 with 就完成三段式演出。
"a"/"b" 这类字符串是「暂停点标记」，可配合交互让玩家点击后才继续，做成交互式过场。`,
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
    artGuide: `ComposeTransition 把「前置转场 → 主转场 → 后置转场」三段串行包裹成一次华丽切换。想一次性做出「闪白 + 溶解 + 像素化」的复合炸裂感而不在脚本里写三行 with 时，它就派上用场——boss 登场、世界线变动、真相揭露都适合。
它本质是把三个独立转场「前后包裹」，所以可控性来自你对三段各自的选择。`,
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
    artGuide: `AlphaDissolve 用一张「控制图」的透明度决定溶解形状：控制图不透明处先显新画面、透明处最后显。于是你能做出心形、星形、文字轮廓、墨迹晕开等**非矩形**的艺术化揭示——浪漫告白时爱心绽开、魔法阵勾勒成形、秘密在墨痕里浮现，都靠它。
reverse 反转明暗关系，可让揭示「从边缘往中心收」或反向。`,
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
    artGuide: `ImageDissolve 与 AlphaDissolve 同构，但按控制图的**亮度（灰度）**决定溶解顺序：白像素先溶入、黑像素最后溶入。于是你能做「由亮处向暗处渐次显现」——晨光洒落、灯光渐亮、由明到暗的梦境浮现，都极贴。
reverse 反转方向，让暗部先显、亮部压轴。`,
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
    artGuide: `Swing 把旧画面像门板一样绕某条边旋转 90° 露出背板、换上新画面、再旋回展平，是「翻页 / 开门 / 揭示秘密房间 / 章节书页翻动」的立体切换。
vertical=True 改成上下翻（如从顶边翻下），reverse 换翻转方向。它比平面擦除多了「厚度感」，适合有物理质感的转场。`,
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
