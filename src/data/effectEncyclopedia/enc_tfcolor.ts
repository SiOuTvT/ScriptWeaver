import type { Encyclopedia } from './types'

// 八、变换属性 · 像素与颜色
export const tfColorEnc: Encyclopedia = {
  'tf-alpha': {
    artGuide: `alpha 控制立绘整体不透明度，是淡入淡出、半透明幽灵、梦境虚化的基石。但它的坑在于「逐子图独立应用」——多图层立绘重叠处可能透视出下层，需要 Flatten() 规避。
绝大多数「淡入/淡出」演出，底层都是 alpha 在动。`,
    paramManual: [
      { name: 'alpha', type: 'float', def: '1.0', range: '0~1', effect: '0=全透, 1=不透明；最终 alpha = 子图原 alpha × 此值。' },
    ],
    cssImpl: `.alpha { opacity: .3; }   /* alpha .3 */`,
    perfTips: `多层子图各自 alpha 相乘后合成，重叠处可能透出下层（双层半透明脸）。需要整体统一半透明时先 Flatten() 压平。
alpha 动画建议配合 will-change: opacity 提升为合成层，避免主线程重绘。`,
  },

  'tf-additive': {
    artGuide: `additive 把混合方程切换为 ADD 加色：亮部越叠越亮、暗部近乎透明，产生霓虹/魔法辉光。它是「发光感」的开关——魔法光效、霓虹灯、能量护盾、赛博辉光都靠它。
0.0 恢复普通覆盖(OVER)。`,
    paramManual: [
      { name: 'additive', type: 'float', def: '0.0', range: '0~1', effect: '0=OVER 覆盖; 1=ADD 加色; 中间为混合权重。' },
    ],
    cssImpl: `.add { mix-blend-mode: screen; }   /* 近似 ADD 发光；plus-lighter 更接近 */`,
    perfTips: `ADD 混合下暗部近乎透明、亮部易溢出纯白；大面积 additive 会让画面过曝。
它和 alpha 通道交互，通常是半透明区域才出光晕，实心不透明图加色效果有限。`,
  },

  'tf-nearest': {
    artGuide: `nearest 控制纹理采样滤波：True=最近邻（硬边像素风），False=双线性（平滑）。像素艺术/复古风必备——默认继承父级或 config。
它只影响「放大时的采样方式」，不改图像本身。`,
    paramManual: [
      { name: 'nearest', type: 'bool?', def: 'None（继承父级）', range: 'True / False', effect: 'True=硬边像素; False=平滑双线性。' },
    ],
    cssImpl: `img { image-rendering: pixelated; }   /* nearest=True */`,
    perfTips: `像素风立绘开 nearest 否则一放大就糊；写实图开 nearest 会出锯齿马赛克。
它是继承属性，父级设了子级默认跟随，不必每个都写。`,
  },

  'tf-blur': {
    artGuide: `blur 高斯模糊，是失焦/出神/梦境/景深/回忆的柔化利器。它先把子图展平(flatten)到透明背景再卷积，因此半透明边缘也能正确模糊。
模糊半径越大越糊，常配合 alpha 做「渐渐朦胧」。`,
    paramManual: [
      { name: 'blur', type: 'float?', def: 'None', range: '像素半径', effect: '0/None=清晰；值越大越糊。' },
    ],
    cssImpl: `.blur { filter: blur(8px); }`,
    perfTips: `blur 半径大时极吃 GPU（每像素卷积）；全屏大模糊在低端设备会掉帧。
它会让边缘渗入透明，注意周边留白；动画 blur 频繁变化开销更高，建议离散档位而非连续。`,
  },

  'tf-matrixcolor': {
    artGuide: `matrixcolor 是统一重着色的入口，接收一个 4×4 颜色矩阵（或 ColorMatrix 子类实例），可相乘组合。任何统一染色、昼夜切换、去色回忆、故障滤镜的底层都在这——它是颜色处理的「总闸」。`,
    paramManual: [
      { name: 'matrixcolor', type: 'Matrix | ColorMatrix', def: 'IdentityMatrix', range: '4×4 矩阵', effect: '对每像素 (R,G,B,A) 线性变换；多个 ColorMatrix 用 × 相乘合成。' },
    ],
    cssImpl: `/* CSS filter 组合近似；或 SVG feColorMatrix 真矩阵 */
filter: saturate(.4) hue-rotate(20deg);`,
    perfTips: `ATL 动画插值两个矩阵时，要求「同类型同顺序」才能线性混合，否则报错。
复杂组合用变量缓存矩阵，避免每帧重建矩阵对象（GC 压力）。`,
  },

  'mc-brightness': {
    artGuide: `BrightnessMatrix 整体加减亮度（不动 Alpha）：value=-1 全黑、0 不变、1 全白。关灯变黑、闪光过曝、情绪明暗调节都它最干脆。`,
    paramManual: [
      { name: 'value', type: 'float', def: '0', range: '-1~1', effect: '新色 = 原色 + value，钳制到 [0,1]。' },
    ],
    cssImpl: `filter: brightness(1.6);   /* value=.6 近似 */`,
    perfTips: `value 负到 -1 全黑会吞掉画面；动画 brightness 与 blur 叠加更重。
它是加性运算，和对比度/饱和度组合时注意顺序（先亮度还是先对比结果不同）。`,
  },

  'mc-contrast': {
    artGuide: `ContrastMatrix 围绕中灰 0.5 缩放对比度：>1 把色推向两极（更硬朗、对比强），<1 把色拉向中灰（更灰、发雾）。硬派战斗滤镜、老照片灰调、强化视觉冲击。`,
    paramManual: [
      { name: 'value', type: 'float', def: '1', range: '>0', effect: '新色 = (原色 - 0.5) × v + 0.5；v>1 更硬，v<1 更灰。' },
    ],
    cssImpl: `filter: contrast(1.6);`,
    perfTips: `高对比会把暗部压死、亮部爆白，人物肤色易失真；低对比发雾。
和 brightness 顺序敏感，建议固定「先 brightness 后 contrast」的管线顺序。`,
  },

  'mc-saturation': {
    artGuide: `SaturationMatrix 调整饱和度（不动 Alpha）：1=原色、0=完全灰度。回忆去色、黑白闪回、强调某色时的降饱和、情绪灰调都靠它。
去饱和时按亮度权重 (0.2126,0.7152,0.0722) 保留灰度。`,
    paramManual: [
      { name: 'value', type: 'float', def: '1', range: '≥0', effect: '新色 = 原色 × v + 灰度 × (1-v)；v=0 纯灰、v=1 原色。' },
      { name: 'desat', type: '(3)tuple', def: '(0.2126,0.7152,0.0722)', range: '权重', effect: '去饱和保留的亮度权重。' },
    ],
    cssImpl: `filter: saturate(0);   /* 去色 */`,
    perfTips: `过度降饱和到 0 会丢失所有情绪色（有时正是回忆想要的）；超饱和 >1 颜色溢出失真。
动画 saturate 很便宜，适合做「回忆渐褪」的渐变。`,
  },

  'mc-hue': {
    artGuide: `HueMatrix 把颜色绕色环旋转指定度数（不动 Alpha）：实现「换色 / 异世界滤镜 / 情绪染色」。毒气绿、魔法粉、整体换色不改明暗，全靠它。`,
    paramManual: [
      { name: 'value', type: 'float', def: '0', range: '度', effect: 'H\' = H + value (mod 360)。' },
    ],
    cssImpl: `filter: hue-rotate(120deg);`,
    perfTips: `色相旋转不改变明暗，所以「绿色毒气」和「红色毒气」只是色相不同；极端旋转后肤色可能怪异。
和其它滤镜顺序敏感，建议放在滤镜链靠后。`,
  },

  'mc-invert': {
    artGuide: `InvertMatrix 反相颜色通道（不动 Alpha）：0→1 控制反转量，1 为完全底片效果。负片闪回、故障美学、强烈视觉反转。`,
    paramManual: [
      { name: 'value', type: 'float', def: '1', range: '0~1', effect: '新色 = 原色 × (1-v) + 反相色 × v；v=1 全底片。' },
    ],
    cssImpl: `filter: invert(1);`,
    perfTips: `全反相会让人脸变成「恐怖负片」，强刺激；半反相(v=0.5)接近灰雾、效果奇怪，通常只用 0 或 1。
光敏/不适人群慎用满反相。`,
  },

  'mc-opacity': {
    artGuide: `OpacityMatrix 仅乘算 Alpha（不动颜色），功能上等同 alpha 属性，但它是矩阵形式，便于与其他 ColorMatrix 组合、统一在一处管理颜色与透明变换。`,
    paramManual: [
      { name: 'value', type: 'float', def: '1', range: '0~1', effect: 'A\' = A × v。' },
    ],
    cssImpl: `/* 等价 CSS opacity，但作为矩阵链一环 */
filter: ... ;   /* 与 feColorMatrix 链组合 */`,
    perfTips: `和 alpha 属性二选一即可，混用只是重复乘算；放进 matrixcolor 链里主要是为了「一处管理全部颜色/透明变换」。`,
  },

  'mc-colorize': {
    artGuide: `ColorizeMatrix 把「黑白图像」在指定黑、白两色之间重新染色（不动 Alpha），适合双色剪影 / 夜视仪绿 / 热成像。它先按亮度转灰，再在 black→white 间线性上色。`,
    paramManual: [
      { name: 'black_color', type: 'Color', def: '"#000"', range: '任意', effect: 't=0 暗部着色。' },
      { name: 'white_color', type: 'Color', def: '"#fff"', range: '任意', effect: 't=1 亮部着色。' },
    ],
    cssImpl: `/* 灰度 + 双色映射：SVG feComponentTransfer 或 gradient map 近似 */
filter: grayscale(1) sepia(1) ...;`,
    perfTips: `原图明暗关系决定染色分布；亮部全染 white_color，暗部染 black_color，注意两色对比别太刺眼。
纯黑/纯白区域会完全变成对应色，失去细节。`,
  },

  'mc-tint': {
    artGuide: `TintMatrix 给整张图染上一层颜色（不动 Alpha），最常用于「夜晚蓝 / 回忆黄 / 危险红」的情绪统一着色。整图蒙一层该色，明暗关系基本保留。`,
    paramManual: [
      { name: 'color', type: 'Color', def: '—', range: '任意', effect: '整图朝该色靠拢，明暗保留。' },
    ],
    cssImpl: `/* 染色：叠加半透明色 + multiply，或 filter 链 */
.el { background: #88ccff; mix-blend-mode: multiply; }`,
    perfTips: `强染色会盖掉细节，夜景蓝调别太重否则人脸发青；回忆暖黄别过曝。
染色是乘性，白色区域保留最亮，黑色区域几乎不变。`,
  },

  'mc-sepia': {
    artGuide: `SepiaMatrix 去饱和 + 棕黄染色，一键复古老照片质感，等价于 TintMatrix("#ffeec2") * SaturationMatrix(0.0)。回忆/年代感闪回的复古滤镜。`,
    paramManual: [
      { name: 'tint', type: 'Color', def: '"#ffeec2"', range: '任意', effect: '棕褐色目标。' },
      { name: 'desat', type: '(3)tuple', def: '(0.2126,0.7152,0.0722)', range: '权重', effect: '灰度亮度权重。' },
    ],
    cssImpl: `filter: sepia(1);   /* 复古棕褐 */`,
    perfTips: `全 sepia 会让现代场景瞬间「旧」，适合闪回；和 brightness 组合可做「褪色老照片」。
注意别和强 saturation 冲突（一个去色一个加色）。`,
  },

  'mc-identity': {
    artGuide: `IdentityMatrix 是 4×4 单位阵，完全不改变任何颜色与 Alpha。它唯一的「用途」是在 ATL 颜色动画中作为「无变化起点/终点」占位，保证两端矩阵结构一致、可插值。`,
    paramManual: [],
    cssImpl: `/* 等价 filter: none；feColorMatrix 单位阵 */
filter: none;`,
    perfTips: `直接显示它毫无意义；只有当你需要动画「两端可插值但某端无变化」时，用它保证类型匹配。
误把它当「某种特效」使用是常见新手错误。`,
  },

  'mc-spline': {
    artGuide: `SplineMatrix 用样条曲线在多个矩阵之间**非线性插值**，实现比线性更自然的颜色渐变——呼吸式闪烁染色、脉动染色。线性插值匀速混合，样条让变化有「加速-减速」的呼吸节奏。`,
    paramManual: [
      { name: 'matrix', type: 'Matrix', def: '—', range: '目标矩阵', effect: '插值终点矩阵。' },
      { name: 'spline', type: 'list', def: '—', range: '≥3 浮点控制点', effect: '定义插值曲线形状（加速-减速）。' },
    ],
    cssImpl: `/* Web 用多关键帧近似样条颜色过渡 */
@keyframes breathe { 0%{filter:saturate(1)} 50%{filter:saturate(1.8)} 100%{filter:saturate(1)} }`,
    perfTips: `样条插值比线性更自然但计算更重；控制点要单调合理，否则颜色「来回跳」。
简单呼吸用多关键帧 CSS 即可近似，不必上 SplineMatrix。`,
  },

  'mc-matrix': {
    artGuide: `Matrix 用 16 个数字直接定义 4×4 颜色变换矩阵（如交换红绿通道）。它是颜色处理的「裸金属」，需要遵循预乘 Alpha 约定，否则缩放出现伪影。`,
    paramManual: [
      { name: 'args', type: '16×float', def: '单位阵', range: '行优先 4×4', effect: '输出 = M × (R,G,B,A)；末行通常 [0,0,0,1]。' },
    ],
    cssImpl: `/* SVG feColorMatrix 行优先 20 值（含偏移列） */
<feColorMatrix values="0 1 0 0 0  1 0 0 0 0  ..."/>  /* 交换红绿 */`,
    perfTips: `必须遵循预乘 Alpha 约定，缩放 RGB 时同步处理 Alpha 否则边缘伪影（黑边/亮边）。
手写 16 个数极易错位，先用工具（如 color-matrix 计算器）验证再填。`,
  },
}
