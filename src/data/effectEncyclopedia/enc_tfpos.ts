import type { Encyclopedia } from './types'

// 六、变换属性 · 位置
export const tfPosEnc: Encyclopedia = {
  'tf-pos-prop': {
    artGuide: `pos / xpos / ypos 是立绘「落在屏幕哪儿」最基础的坐标。要精确摆位、自定义非标准机位、或者做「镜头扫到某个坐标」的补间动画时，直接用坐标值最直观。记住 position 类型的灵活：浮点 0.0~1.0 是「占父容器宽/高的比例」，absolute(n) 是「绝对像素」。两者混在一起做补间会跳变。`,
    paramManual: [
      { name: 'pos', type: 'position', def: '(0, 0)', range: '浮点 0~1 / absolute(n)', effect: '相对父容器左上角的坐标；浮点=比例，absolute=像素；pos=(x,y) 同时设横纵。' },
    ],
    cssImpl: `/* 绝对定位：浮点比例用 %，absolute 用 px */
.pos-ratio { left: 50%; top: 100%; }   /* 等同 xpos .5 ypos 1 */
.pos-px    { left: 320px; top: 600px; } /* absolute(320), absolute(600) */`,
    perfTips: `比例定位会随父容器（屏幕）尺寸变化自动适配，适合响应式；absolute 像素在窗口缩放时会错位。
补间时**不要混用**比例与 absolute，否则 Ren'Py 会强制转换导致中途跳变。`,
  },

  'tf-align': {
    artGuide: `align / xalign / yalign 是最常用的摆位方式：它把「位置」和「锚点」设成同一个值，于是「立绘的某比例点」精确对齐「父容器的某比例点」，xalign=0.5 就是水平居中，比 pos 直觉得多。绝大多数对话立绘的站位（居中、贴底、对齐某个比例）都用 align 搞定。`,
    paramManual: [
      { name: 'align', type: '(float, float)', def: '(0, 0)', range: '0~1', effect: 'ax=xpos=xanchor，ay=ypos=yanchor；立绘的 (ax,ay) 点对齐父容器 (ax,ay) 点。' },
    ],
    cssImpl: `/* align(0.5, 1.0)：脚底中点对齐屏幕底部中心 */
.align { position:absolute; left:50%; bottom:0; transform: translateX(-50%); }`,
    perfTips: `align 同时改 pos 和 anchor，若你之前单独设过 anchor，再用 align 会覆盖掉——注意语句顺序。
它是摆位首选，但做「绕非中心旋转」时要先想清楚锚点。`,
  },

  'tf-anchor': {
    artGuide: `anchor / xanchor / yanchor 是立绘自身的「悬挂点」：所有 rotate、scale、position 都绕着这个点算。anchor=(0.5,1.0) 就是以「底部中心」为基准，立绘脚底对齐常用这个。当你想让立绘绕脚底转（而不是绕中心）、或者绕某个特征点缩放时，得先改 anchor。`,
    paramManual: [
      { name: 'anchor', type: 'position', def: '(0, 0) 左上', range: '(0,0)~(1,1)', effect: '立绘内部锚点比例；(0,0)左上 (0.5,0.5)中心 (0.5,1.0)脚底。' },
    ],
    cssImpl: `/* 锚点=脚底中心：transform-origin: 50% 100% */
.anchor { transform-origin: 50% 100%; }  /* 绕脚底旋转/缩放 */`,
    perfTips: `改 anchor 等于改立绘的「重心」，会改变 position 计算（anchor 点落到 pos 指定的父坐标）。
旋转时若 anchor 不在中心，立绘会「甩出去」，务必确认这是你要的效果。`,
  },

  'tf-offset': {
    artGuide: `offset / xoffset / yoffset 是在已经定位好的基础上再叠加的像素级偏移（正方向向右/下），说话时立绘微微往前倾、强调时轻轻挪一下，常用它。跟 pos 不同，它不受比例缩放影响。它的价值就在「叠加微调」：不干扰主定位（pos/anchor），又能做点轻量动效。`,
    paramManual: [
      { name: 'offset', type: 'absolute', def: '(0, 0)', range: '像素（可负）', effect: '在最终定位后额外平移；正向右/下；xoffset/yoffset 分别控制。' },
    ],
    cssImpl: `/* 叠加偏移：不影响主定位 */
.offset { transform: translate(40px, 0); }  /* 等效 xoffset 40 */`,
    perfTips: `offset 是绝对像素，叠加在 pos 之后，因此做「呼吸前倾」时不会干扰机位、也不被缩放扭曲，比直接改 pos 安全。
但注意它仍受父容器裁剪影响，偏移过大会被裁切边。`,
  },

  'tf-center': {
    artGuide: `xycenter / xcenter / ycenter 是把「立绘自身中心」放到指定坐标（等价于 pos 配 anchor=(0.5,0.5)）。当你需要「立绘中心精准落在某点」而且之后还要旋转/缩放时，用它比 pos 稳，因为中心被锚定了，后续变换都绕着中心走。`,
    paramManual: [
      { name: 'center', type: 'position', def: '(0, 0)', range: '浮点 0~1 / absolute', effect: '立绘中心目标坐标；等价 anchor=(0.5,0.5)+pos=(cx,cy)。' },
    ],
    cssImpl: `/* 中心对齐：translate(-50%,-50%) 锚定中心 */
.center { position:absolute; left:50%; top:50%; transform: translate(-50%,-50%); }`,
    perfTips: `它本质是 pos+anchor 的糖，但若你之后又单独改了 anchor，语义会被破坏。
做旋转/缩放前用 center 摆位最稳，避免「转着转着偏心」。`,
  },

  'tf-subpixel': {
    artGuide: `subpixel 是「亚像素定位」开关：打开后用小数像素精度绘制，慢速移动时边缘更顺、不跳格。任何「不想看到像素一格一格蹦」的位移动画（细线移动、慢速平移）都应该开它。代价是得预留透明边距，不然旋转/放大会被裁剪盒切边。`,
    paramManual: [
      { name: 'subpixel', type: 'bool', def: 'False', range: 'True / False', effect: 'True=小数坐标插值绘制，抗跳格；默认四舍五入整数像素会跳格。' },
    ],
    cssImpl: `/* Web 默认即亚像素平滑；等价于开启图像平滑 */
canvas { image-rendering: auto; }  /* 反义：pixelated 才跳格 */`,
    perfTips: `开启后移动极顺滑，但立绘四周需留透明边距，否则旋转/放大时边缘被裁。
对静态不动物体开 subpixel 毫无收益，只在位移动画时有意义。`,
  },

  'tf-polar': {
    artGuide: `around / angle / radius 是用「起点 + 角度 + 半径」来表达位置，特别适合圆周运动，让立绘绕某点公转一圈，只要插值 angle 就行。angle 0° 是正上方、90° 是正右方，引擎会自动归一到 0~360。行星公转、圆周入场、指针罗盘类动画都离不开它。`,
    paramManual: [
      { name: 'around', type: '(pos, pos)', def: '(0.5, 0.5)', range: '坐标', effect: '极坐标圆心（起点）。' },
      { name: 'angle', type: 'float', def: '0', range: '度（自动 0~360 归一）', effect: '0=正上, 90=正右；插值 angle 即绕点公转。' },
      { name: 'radius', type: 'position', def: '0', range: 'position 类型', effect: '到圆心的距离。' },
    ],
    cssImpl: `/* 极坐标转直角：x=around.x+R*sin(a), y=around.y-R*cos(a) */
function polar(around, angleDeg, R){
  const a = angleDeg * Math.PI / 180;
  return { x: around.x + R*Math.sin(a), y: around.y - R*Math.cos(a) };
}`,
    perfTips: `极坐标让圆周运动只需插值一个 angle，远比手算 x/y 方便。
但 angle 与直角 pos 混用做补间会跳变，整段动画要统一坐标系。`,
  },

  'tf-polar-anchor': {
    artGuide: `anchoraround / anchorangle / anchorradius 是把极坐标机制搬到了「锚点」上：让立绘的锚点绕某个圆心做圆周运动。这样立绘「公转」的时候，自身的悬挂点也跟着转，适合卫星绕行星（卫星始终某点朝外）、绕轴旋转的挂件。`,
    paramManual: [
      { name: 'anchoraround', type: '(pos, pos)', def: '(0.5, 0.5)', range: '坐标', effect: '锚点公转圆心。' },
      { name: 'anchorangle', type: 'float', def: '0', range: '度', effect: '锚点绕圆心的角度。' },
      { name: 'anchorradius', type: 'position', def: '0', range: 'position', effect: '锚点到圆心的距离。' },
    ],
    cssImpl: `/* 锚点极坐标：复用 polar()，作用于 transform-origin */
const p = polar(anchorAround, anchorAngle, anchorRadius);
el.style.transformOrigin = \`\${p.x*100}% \${p.y*100}%\`;`,
    perfTips: `锚点公转 + 立绘自转组合，能做出「既绕点转、自身又朝外」的复杂运动，但调试困难，建议先用单图层确认轨迹。`,
  },
}
