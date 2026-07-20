import type { Encyclopedia } from './types'

// 十四、3D 舞台与模型渲染
export const stage3dEnc: Encyclopedia = {
  's-perspective': {
    artGuide: `perspective 是开启 3D 舞台并设置「视距 d」（越小透视越夸张）。它是任何真三维旋转、景深效果的前提——卡牌翻面、立体 UI、镜头推拉，都得先开它。开完之后子显示件才能用 xrotate/yrotate/zrotate 做真三维旋转，不然只是 2D 假转。`,
    paramManual: [
      { name: 'perspective', type: 'float?', def: 'None（关闭 3D）', range: '像素（通常 400~1000）', effect: 'd=相机到 z=0 的距离；越小透视越强（广角），越大越接近正交（平）。' },
    ],
    cssImpl: `/* 父容器开启 3D 透视 */
.stage { perspective: 800px; }   /* d=800 */
.child { transform: rotateY(45deg); }  /* 真 3D 旋转 */`,
    perfTips: `perspective 是「父容器属性」，必须设在显示件的**父级**上，设错层级 3D 不生效。
d 太小会导致边缘严重畸变、文字扭曲；d 太大则几乎看不出立体感，需按画面尺寸调。`,
  },

  's-matrixtransform': {
    artGuide: `matrixtransform 是用 4×4 矩阵对显示件做真三维变换（绕任意轴旋转、平移、缩放）。跟 matrixcolor 不同：后者只改颜色，前者改几何。配合 matrixanchor 确定变换中心。自定义三维旋转、倾斜、3D 翻转、GPU 级几何变换，都靠它。`,
    paramManual: [
      { name: 'matrixtransform', type: 'Matrix?', def: 'None', range: '4×4 矩阵', effect: '三维变换矩阵；绕 matrixanchor 作用。' },
    ],
    cssImpl: `/* Web：matrix3d() 等价 4×4 三维变换 */
.el { transform: perspective(800px) matrix3d(
  1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1); }
/* 或用 rotateX/Y/Z 组合近似 */`,
    perfTips: `matrixtransform 的变换中心由 matrixanchor 决定，两者必须配套设置，否则旋转会绕错点「飞出去」。
复杂三维矩阵建议先在工具里算好再填，手写 16 个数极易错位。`,
  },

  's-matrixanchor': {
    artGuide: `matrixanchor 是三维变换的「旋转/缩放中心点」，默认 (0.5,0.5) 也就是立绘中心。当你想让 3D 旋转绕某个特定点（比如脚底、边缘）进行时，改它。`,
    paramManual: [
      { name: 'matrixanchor', type: '(pos, pos)', def: '(0.5, 0.5)', range: '比例', effect: '三维变换绕此点进行。' },
    ],
    cssImpl: `/* 3D 变换锚点 */
.el { transform-origin: 50% 100%; }  /* 绕脚底 3D 旋转 */`,
    perfTips: `它和 2D 的 transform-origin 同源；设错会导致立绘在 3D 旋转时「甩出画面」，调试时先用单图层确认旋转轴。`,
  },

  's-xrotate': {
    artGuide: `xrotate / yrotate / zrotate 是分别绕 X/Y/Z 三轴做真三维旋转，得先开 perspective。zrotate 就等于 2D 的 rotate 了；xrotate（前后翻，比如抬头低头）、yrotate（左右转，比如转身）才是真 3D。卡牌翻面、书本翻开、立体转身、3D 翻转的 UI，都靠这三个轴组合。`,
    paramManual: [
      { name: 'xrotate / yrotate / zrotate', type: 'float', def: '0', range: '度', effect: '绕各轴旋转角度；zrotate 等价 2D rotate；三者组合即任意三维朝向。' },
    ],
    cssImpl: `/* 真 3D 三轴旋转（需父 perspective） */
.card { transform: rotateX(45deg) rotateY(30deg); }`,
    perfTips: `三轴同时非零时旋转顺序会影响最终朝向（欧拉角万向锁），复杂姿态建议用 orientation 一次性设定。
未开 perspective 时 xrotate/yrotate 看不出纵深，只是平面倾斜。`,
  },

  's-orientation': {
    artGuide: `orientation 是用 (x,y,z) 欧拉角一次性设定三维朝向，是 xrotate/yrotate/zrotate 的便捷打包。当你想用一组欧拉角直接表达最终姿态、免得拆成三条分开写时，用它最干净。`,
    paramManual: [
      { name: 'orientation', type: '(3)float', def: '(0, 0, 0)', range: 'X/Y/Z 欧拉角（度）', effect: '等价同时设 x/y/zrotate，表达最终三维姿态。' },
    ],
    cssImpl: `/* 欧拉角一次性设定朝向 */
.el { transform: rotateX(30deg) rotateY(45deg) rotateZ(0deg); }`,
    perfTips: `欧拉角存在「万向锁」：当某个轴转到 90° 时另外两轴会退化耦合，极端姿态下换用四元数/矩阵更稳。
普通演出用 orientation 足够，不必过度担心。`,
  },

  's-point-to': {
    artGuide: `point_to 是让显示件的「正面」自动转向指定的坐标点，3D 场景里常用来让角色始终面向镜头或者目标——也就是 billboard 效果。你只要说「看向 (x,y)」，引擎自己算出需要的 orientation。`,
    paramManual: [
      { name: 'point_to', type: '(pos, pos)', def: '—', range: '目标坐标', effect: '立绘正面法线指向该点，自动计算 orientation。' },
    ],
    cssImpl: `/* Web：根据目标点反算旋转（简化版） */
function pointTo(el, tx, ty){
  const dx = tx - el.x, dy = ty - el.y;
  el.style.transform = \`rotateY(\${Math.atan2(dx,dy)}rad)\`;
}`,
    perfTips: `它依赖已开启 3D 与正确锚点，否则「转向」会失真。
频繁 point_to 跟随鼠标/镜头会有逐帧矩阵计算开销，移动端注意。`,
  },

  's-zpos-zzoom': {
    artGuide: `zpos / zzoom 是在 3D 舞台里设置沿 Z 轴的深度位置和深度缩放，做出「前后景层次、推拉镜头」。zpos 越大离相机越远（透视下显得越小、能被前景挡住），zzoom 放大或缩小景深感。`,
    paramManual: [
      { name: 'zpos', type: 'float', def: '0', range: '沿 Z 深度', effect: '沿景深位置；越大越远越小，可被前景遮挡。' },
      { name: 'zzoom', type: 'float', def: '1.0', range: '>0', effect: 'Z 方向的缩放因子，放大/缩小景深感。' },
    ],
    cssImpl: `/* 深度位置 + 深度缩放（需 perspective） */
.el { transform: translateZ(120px) scale(1.1); }`,
    perfTips: `zpos 超过 perspective 视距（z ≥ d）会导致物体「跑到相机后面」被裁掉，深度值要小于 d。
多图层用 zpos 做层次时，注意 z 序与 alpha 混合的遮挡关系。`,
  },

  's-mesh': {
    artGuide: `mesh / mesh_pad 是把显示件转成 GPU 模型网格（三角化），这样它才能挂自定义 shader 或者做真三维 matrixtransform。它是高级特效的前提——水波、故障、发光这类 shader 都必须先 mesh=True。`,
    paramManual: [
      { name: 'mesh', type: 'bool', def: 'False', range: 'True / False', effect: 'True=转 GPU 模型网格，可挂 shader/3D 变换。' },
      { name: 'mesh_pad', type: 'bool', def: 'False', range: 'True / False', effect: 'True=网格边缘留透明边距，防 shader 采样越界黑边。' },
    ],
    cssImpl: `/* Web 中 canvas/WebGL 天然是网格化渲染；mesh 概念对应开启 GPU 管线 */
// 用 WebGL 上传纹理 + 顶点缓冲即等价 mesh=True`,
    perfTips: `mesh=True 会显著改变渲染管线（从 2D 合成转 GL），开销上升；仅在确实需要 shader/3D 时开启。
mesh_pad=True 防黑边但会多吃一点纹理内存，shader 采样越界时务必开。`,
  },

  's-shader': {
    artGuide: `shader / blend 是指定 GLSL 着色器来接管像素渲染，以及混合方程。它是 Ren'Py 特效的终极武器：水波、故障、像素风、发光，任何声明式变换做不到的效果，全靠自定义 shader。blend 设置混合（"add" 加法发光、"multiply" 正片叠底）。得先 mesh=True 才能用。`,
    paramManual: [
      { name: 'shader', type: 'str', def: '—', range: 'GLSL 着色器标识', effect: '接管像素渲染的着色器名。' },
      { name: 'blend', type: 'str', def: '—', range: '"add" / "multiply" 等', effect: '混合方程；add 发光、multiply 压暗。' },
    ],
    cssImpl: `/* Web 等价：用 WebGL 片元着色器 / 或 CSS filter 近似 */
.el { filter: url(#water); }              /* SVG filter 近似 shader */
.el { mix-blend-mode: screen; }          /* 等价 blend "add" 发光 */`,
    perfTips: `shader 是性能最重的一档：逐像素 GLSL 在 4K 全屏上极吃 GPU，低端设备会明显掉帧。
blend="add" 会让亮部越叠越亮甚至溢出纯白，大面积发光时注意整体亮度控制。`,
  },
}
