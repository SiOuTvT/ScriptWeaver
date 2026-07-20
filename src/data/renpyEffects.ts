// ============================================================
// ScriptWeaver · 特效大本营 (Effects HQ)
// ------------------------------------------------------------
// 全量收录 Ren'Py 演出特效系统：Transitions / Transform Properties /
// matrixcolor 颜色矩阵 / ATL 缓动函数(Warpers) / ATL 动画语句 /
// 内置定位变换 / 3D 舞台与模型渲染。
//
// 数据来源：Ren'Py 官方文档（transitions.html / transform_properties.html
// / matrixcolor.html / transforms.html#atl）逐条研读，力求「没有漏网之鱼」。
//
// 每个特效均配：原名(name)、中文名(cn)、示例语法(syntax)、
// 功能说明(desc)、参数用途(params)、可点击预览的规格(preview)。
// ============================================================

export type Dir = 'left' | 'right' | 'up' | 'down'

/** 预览规格：声明式描述该特效在舞台上的演示方式，由 effectPlayer 解释执行 */
export type PreviewSpec =
  | { kind: 'dissolve' }
  | { kind: 'fadeIn' }
  | { kind: 'flash' }
  | { kind: 'pixellate' }
  | { kind: 'wipe'; dir: Dir }
  | { kind: 'slide'; dir: Dir; mode: 'in' | 'out' }
  | { kind: 'push'; dir: Dir }
  | { kind: 'iris'; mode: 'in' | 'out' }
  | { kind: 'blinds' }
  | { kind: 'squares' }
  | { kind: 'move'; dir: Dir; mode: 'in' | 'out' }
  | { kind: 'zoom'; mode: 'in' | 'out' | 'inout' }
  | { kind: 'swing' }
  | { kind: 'shake'; axis: 'h' | 'v' }
  | { kind: 'rotate'; deg: number }
  | { kind: 'flip'; axis: 'h' | 'v' }
  | { kind: 'blur' }
  | { kind: 'color'; filter: string }
  | { kind: 'alpha' }
  | { kind: 'additive' }
  | { kind: 'crop' }
  | { kind: 'pan' }
  | { kind: 'tile' }
  | { kind: 'position' }
  | { kind: 'polar' }
  | { kind: 'ease'; bezier: [number, number, number, number] }
  | { kind: 'loop' }
  | { kind: 'parallel' }
  | { kind: 'choice' }
  | { kind: 'rotate3d' }
  | { kind: 'concept'; text: string }

export interface EffectParam {
  name: string
  type: string
  desc: string
}

export interface EffectItem {
  id: string
  name: string // Ren'Py 原名
  cn: string // 中文名
  syntax?: string // 示例语法
  desc: string // 功能说明
  params?: EffectParam[] // 参数用途
  preview: PreviewSpec // 预览规格
  renpyClass?: boolean // 是否为可实例化的类
}

export interface EffectCategory {
  id: string
  name: string
  icon: string // lucide 图标名（在页面映射）
  desc: string // 分类说明
  items: EffectItem[]
}

// ============================================================
// 一、基础转场（Basic Transitions）
// ============================================================
const basic: EffectCategory = {
  id: 'basic',
  name: '基础转场',
  icon: 'Sparkles',
  desc: '视觉小说最常用的一层幕布：淡入淡出、溶解、闪白、像素化等，决定「上一幕」如何过渡到「下一幕」。',
  items: [
    {
      id: 'dissolve',
      name: 'Dissolve',
      cn: '溶解（交叉淡入）',
      syntax: 'with dissolve   # 或 Dissolve(0.5)',
      desc: '在指定时长内把旧画面与新画面做交叉淡化（cross-fade），是最经典、最柔和的场景切换。默认 0.5 秒。',
      params: [{ name: 'time', type: 'float', desc: '溶解时长（秒），默认 0.5' }],
      preview: { kind: 'dissolve' },
    },
    {
      id: 'fade',
      name: 'Fade',
      cn: '淡入淡出（经黑场）',
      syntax: 'with fade   # 或 Fade(0.5, 0.0, 0.5)',
      desc: '先把画面淡出到某个纯色（默认黑），停留片刻，再淡入新画面。比 dissolve 更有「章节感」。',
      params: [
        { name: 'out_time', type: 'float', desc: '淡出到纯色屏的时长' },
        { name: 'hold_time', type: 'float', desc: '纯色屏停留时长' },
        { name: 'in_time', type: 'float', desc: '从纯色屏淡入新画面的时长' },
        { name: 'color', type: 'Color', desc: '中间色屏颜色，默认 "#000"（黑），可改 "#fff" 做白场' },
      ],
      preview: { kind: 'fadeIn' },
    },
    {
      id: 'flash',
      name: 'flash',
      cn: '闪白（高光闪烁）',
      syntax: 'define flash = Fade(0.1, 0.0, 0.5, color="#fff")\nwith flash',
      desc: '定义一个极短的淡出白场 + 较长淡入，制造「闪光 / 镜头反光 / 顿悟」般的瞬间爆白效果。它本身是 Fade 的定制实例。',
      params: [{ name: 'color', type: 'Color', desc: '闪光颜色，默认白色 "#fff"' }],
      preview: { kind: 'flash' },
    },
    {
      id: 'pixellate',
      name: 'Pixellate',
      cn: '像素化',
      syntax: 'with pixellate   # 或 Pixellate(0.5, 20)',
      desc: '先把旧画面像素块化放大、再像素化收束到新画面，营造「信号故障 / 回忆 / 魔法变形」的块状过渡。',
      params: [
        { name: 'time', type: 'float', desc: '单程（退出或进入）像素化时长' },
        { name: 'steps', type: 'int', desc: '每方向像素步进级数，越大块越明显（每步像素翻倍）' },
      ],
      preview: { kind: 'pixellate' },
    },
    {
      id: 'pause',
      name: 'Pause',
      cn: '停顿（纯停留）',
      syntax: 'with Pause(1.0)',
      desc: '不切换画面，仅把新画面原样保持 delay 秒。常用于 MultipleTransition 序列中制造「呼吸感」停顿。',
      params: [{ name: 'delay', type: 'float', desc: '新画面保持的秒数' }],
      preview: { kind: 'concept', text: 'Pause 仅让当前画面静止保持若干秒，无视觉变化——可在多重转场序列中作为「标点」使用。' },
    },
    {
      id: 'multiple-transition',
      name: 'MultipleTransition',
      cn: '多重转场序列',
      syntax: 'with MultipleTransition([None, dissolve, "a", wipeleft, "b"])',
      desc: '接收一个交替排列的列表【场景、转场、场景、转场…】，按顺序连续播放多个转场，实现复杂编排（如「先溶解→停顿→再擦除」）。',
      params: [{ name: 'args', type: 'list', desc: '奇数项为场景（None 表示沿用当前），偶数项为转场' }],
      preview: { kind: 'concept', text: '多重转场 = 把多段转场「串接播放」。点击后请连续观察：溶解 → 停留 → 擦除 的编排效果。' },
    },
    {
      id: 'compose-transition',
      name: 'ComposeTransition',
      cn: '组合转场',
      syntax: 'ComposeTransition(dissolve, before=flash, after=pixellate)',
      desc: '最多组合三段转场：先对旧/新画面应用 before/after，再将结果交给主转场 trans，适合把「闪白+溶解+像素化」叠成一次华丽切换。',
      params: [
        { name: 'trans', type: 'Transition', desc: '主转场' },
        { name: 'before', type: 'Transition?', desc: '施加于旧画面的前置转场' },
        { name: 'after', type: 'Transition?', desc: '施加于新画面的后置转场' },
      ],
      preview: { kind: 'concept', text: '组合转场把 before / 主转场 / after 三段叠加。预览中以「闪白 + 溶解」示意其叠加观感。' },
    },
    {
      id: 'alpha-dissolve',
      name: 'AlphaDissolve',
      cn: 'Alpha 遮罩溶解',
      syntax: 'with AlphaDissolve("mask.png", 1.0)',
      desc: '用一张「控制图」的透明度决定溶解形状：控制图不透明处先显示新画面，透明处后显示——可做出心形、星形等非矩形溶解。',
      params: [
        { name: 'control', type: 'Displayable', desc: '作为遮罩的控制图（用其 alpha 通道）' },
        { name: 'delay', type: 'float', desc: '转场时长' },
        { name: 'reverse', type: 'bool', desc: '是否反转遮罩明暗关系' },
        { name: 'mipmap', type: 'bool?', desc: '是否对控制图做 mipmap 平滑' },
      ],
      preview: { kind: 'iris', mode: 'in' },
    },
    {
      id: 'image-dissolve',
      name: 'ImageDissolve',
      cn: '图像控制溶解',
      syntax: 'with ImageDissolve("wipe.png", 1.0, ramplen=8)',
      desc: '类似 AlphaDissolve，但按控制图的灰度（亮度）决定溶解顺序：白像素先溶入、黑像素最后溶入，可做「由亮到暗渐次显现」。',
      params: [
        { name: 'image', type: 'Displayable', desc: '控制图（用其亮度决定溶解顺序）' },
        { name: 'time', type: 'float', desc: '转场时长' },
        { name: 'ramplen', type: 'int', desc: '溶解斜坡长度，越大过渡越柔' },
        { name: 'reverse', type: 'bool', desc: '反转溶解方向' },
      ],
      preview: { kind: 'wipe', dir: 'right' },
    },
    {
      id: 'swing',
      name: 'Swing',
      cn: '翻转门（旋屏切换）',
      syntax: 'with Swing(1.0)',
      desc: '把旧画面像门板一样旋转 90° 露出边缘，换上新画面后再旋回 90° 展平，营造「翻页 / 开门」式的立体切换。',
      params: [
        { name: 'delay', type: 'float', desc: '总时长' },
        { name: 'vertical', type: 'bool', desc: 'true 则上下翻，false 左右翻' },
        { name: 'reverse', type: 'bool', desc: '是否反向旋转' },
        { name: 'background', type: 'Color', desc: '翻转时露出的背景色' },
      ],
      preview: { kind: 'swing' },
    },
  ],
}

// ============================================================
// 二、擦除与滑动（CropMove 家族）
// ============================================================
const crop: EffectCategory = {
  id: 'crop',
  name: '擦除 · 滑动 · 推挤',
  icon: 'Move',
  desc: '由 CropMove / PushMove 两大基类驱动的「几何位移」转场族：擦除、滑入、滑出、推挤、虹膜，是视觉小说换景的主力。',
  items: [
    {
      id: 'wiperight',
      name: 'wipeleft / wiperight / wipeup / wipedown',
      cn: '擦除揭示',
      syntax: 'with wiperight',
      desc: '像用一块「刮板」把新画面按指定方向擦出来：旧画面不动，新画面被一条边界 progressively 揭示。对应 CropMove 的 wipe* 模式。',
      params: [{ name: 'mode', type: "'wiperight' 等", desc: '擦除方向' }],
      preview: { kind: 'wipe', dir: 'right' },
    },
    {
      id: 'slideright',
      name: 'slideleft / slideright / slideup / slidedown',
      cn: '滑入',
      syntax: 'with slideright',
      desc: '新画面从指定方向滑入覆盖旧画面（旧画面保持不动）。对应 CropMove 的 slide* 模式。',
      params: [{ name: 'mode', type: "'slideright' 等", desc: '滑入方向' }],
      preview: { kind: 'slide', dir: 'right', mode: 'in' },
    },
    {
      id: 'slideawayright',
      name: 'slideawayleft / slideawayright / slideawayup / slideawaydown',
      cn: '滑出',
      syntax: 'with slideawayright',
      desc: '旧画面朝指定方向滑出离场，露出其后的新画面。对应 CropMove 的 slideaway* 模式。',
      params: [{ name: 'mode', type: "'slideawayright' 等", desc: '滑出方向' }],
      preview: { kind: 'slide', dir: 'right', mode: 'out' },
    },
    {
      id: 'pushright',
      name: 'pushleft / pushright / pushup / pushdown',
      cn: '推挤',
      syntax: 'with pushright',
      desc: '新画面「推」着旧画面一同朝指定方向离场——两者联动位移，像推开门板。对应 PushMove 的 push* 模式。',
      params: [{ name: 'mode', type: "'pushright' 等", desc: '推动方向' }],
      preview: { kind: 'push', dir: 'right' },
    },
    {
      id: 'iris',
      name: 'irisin / irisout',
      cn: '虹膜（矩形开合）',
      syntax: 'with irisout',
      desc: '从一个矩形光圈（角落）展开(irisin)或收束(irisout)到全屏，如同摄影机光圈或「聚焦」动画。对应 CropMove 的 iris* 模式。',
      params: [{ name: 'mode', type: "'irisin' / 'irisout'", desc: '展开或收束' }],
      preview: { kind: 'iris', mode: 'out' },
    },
    {
      id: 'blinds',
      name: 'blinds',
      cn: '百叶窗',
      syntax: 'with blinds',
      desc: '用一组垂直条带逐条揭开新画面，形如百叶窗开合。底层为 ImageDissolve 的条带控制图实例。',
      params: [],
      preview: { kind: 'blinds' },
    },
    {
      id: 'squares',
      name: 'squares',
      cn: '方块揭示',
      syntax: 'with squares',
      desc: '把画面切成方格，逐格随机/顺序揭示新画面，制造「像素拼图 / 故障重组」质感。',
      params: [],
      preview: { kind: 'squares' },
    },
    {
      id: 'cropmove-class',
      name: 'CropMove',
      cn: '裁剪位移转场（基类）',
      syntax: 'CropMove(1.0, "slideright")',
      desc: '所有 wipe/slide/slideaway/iris 的底层基类。通过 startcrop/startpos/endcrop/endpos 等参数，可自定义任意「裁剪盒 + 位移」转场（mode="custom"）。',
      params: [
        { name: 'time', type: 'float', desc: '时长' },
        { name: 'mode', type: 'str', desc: "wipe*/slide*/slideaway*/iris*/custom 之一" },
        { name: 'startcrop', type: '(4)tuple', desc: '起始裁剪盒 (x,y,w,h)' },
        { name: 'startpos', type: '(2)tuple', desc: '起始位置偏移' },
        { name: 'endcrop', type: '(4)tuple', desc: '结束裁剪盒' },
        { name: 'endpos', type: '(2)tuple', desc: '结束位置偏移' },
      ],
      renpyClass: true,
      preview: { kind: 'slide', dir: 'left', mode: 'in' },
    },
    {
      id: 'pushmove-class',
      name: 'PushMove',
      cn: '推挤转场（基类）',
      syntax: 'PushMove(1.0, "pushright")',
      desc: '推挤类转场的基类，新画面推着旧画面离场。mode 支持 pushright/left/up/down。',
      params: [
        { name: 'time', type: 'float', desc: '时长' },
        { name: 'mode', type: 'str', desc: 'pushright/left/up/down' },
      ],
      renpyClass: true,
      preview: { kind: 'push', dir: 'left' },
    },
  ],
}

// ============================================================
// 三、位移与移动（Movement）
// ============================================================
const movement: EffectCategory = {
  id: 'movement',
  name: '位移 · 移动',
  icon: 'MoveHorizontal',
  desc: '针对「同一标签图层上位置变化」的平滑补间：立绘进场、退场、缓动滑入——是角色演出最频繁的动作。',
  items: [
    {
      id: 'move',
      name: 'move',
      cn: '位置补间移动',
      syntax: 'with move',
      desc: '当同一 tag 的立绘位置发生变化时，用 0.5 秒把旧位置平滑插值到新位置。最常用于「角色从左边走到右边」。',
      params: [],
      preview: { kind: 'move', dir: 'right', mode: 'in' },
    },
    {
      id: 'moveinright',
      name: 'moveinleft / right / top / bottom',
      cn: '移入',
      syntax: 'with moveinright',
      desc: '让「新出现」的立绘从指定屏幕外缘滑入到目标位置；已在场的立绘则不参与。MoveTransition 的进入变体。',
      params: [{ name: 'side', type: "'right' 等", desc: '从哪个方向进入' }],
      preview: { kind: 'move', dir: 'right', mode: 'in' },
    },
    {
      id: 'moveoutright',
      name: 'moveoutleft / right / top / bottom',
      cn: '移出',
      syntax: 'with moveoutright',
      desc: '让「即将隐藏」的立绘朝指定屏幕外缘滑出离场。MoveTransition 的离开变体。',
      params: [{ name: 'side', type: "'right' 等", desc: '朝哪个方向离场' }],
      preview: { kind: 'move', dir: 'right', mode: 'out' },
    },
    {
      id: 'easeinright',
      name: 'easein* / easeout*（缓动移动族）',
      cn: '余弦缓动移入 / 移出',
      syntax: 'with easeinright',
      desc: '与 movein*/moveout* 类似，但使用余弦缓动曲线（先慢后快再慢），进出更有「重量感」。涵盖 easein/out + left/right/top/bottom 共 8 种。',
      params: [{ name: 'variant', type: 'str', desc: 'easeinleft/right/top/bottom、easeoutleft/right/top/bottom' }],
      preview: { kind: 'move', dir: 'left', mode: 'in' },
    },
    {
      id: 'move-transition',
      name: 'MoveTransition',
      cn: '移动转场（基类）',
      syntax: 'MoveTransition(0.5, time_warp=_warper.ease)',
      desc: 'move / movein* / moveout* / ease* 的底层类。可自定义进入/离开变换与缓动，甚至用 move_transitions() 批量生成整族。',
      params: [
        { name: 'delay', type: 'float', desc: '补间时长' },
        { name: 'enter', type: 'Transform?', desc: '进入立绘的变换' },
        { name: 'leave', type: 'Transform?', desc: '离开立绘的变换' },
        { name: 'time_warp', type: 'warper', desc: '缓动函数' },
      ],
      renpyClass: true,
      preview: { kind: 'move', dir: 'left', mode: 'out' },
    },
    {
      id: 'move-transitions',
      name: 'move_transitions()',
      cn: '移动转场批量生成器',
      syntax: 'move_transitions("fly", 0.5)',
      desc: '一行批量定义一整族 MoveTransition（fly、fly_inleft/right/top/bottom、fly_outleft/right/top/bottom），避免手动逐个声明。',
      params: [
        { name: 'prefix', type: 'str', desc: '生成转场名的前缀' },
        { name: 'delay', type: 'float', desc: '时长' },
      ],
      preview: { kind: 'concept', text: 'move_transitions() 是「生成器」而非单一特效——它批量产出整族移动转场，本身无独立画面。' },
    },
  ],
}

// ============================================================
// 四、缩放与镜头（Zoom & Camera）
// ============================================================
const zoom: EffectCategory = {
  id: 'zoom',
  name: '缩放 · 镜头',
  icon: 'ZoomIn',
  desc: '通过「放大 / 缩小」模拟镜头推拉与情绪聚焦，是演出张力的重要来源。',
  items: [
    {
      id: 'zoomin',
      name: 'zoomin',
      cn: '放大进入',
      syntax: 'with zoomin',
      desc: '进入的立绘从较小尺寸放大到目标尺寸，制造「登场 / 强调」的推近感。',
      params: [],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 'zoomout',
      name: 'zoomout',
      cn: '缩小离场',
      syntax: 'with zoomout',
      desc: '离开的立绘缩小淡出，制造「退场 / 远去」的拉远感。',
      params: [],
      preview: { kind: 'zoom', mode: 'out' },
    },
    {
      id: 'zoominout',
      name: 'zoominout',
      cn: '放大进入 + 缩小离场',
      syntax: 'with zoominout',
      desc: '同时让进入立绘放大、离开立绘缩小，对比强烈，常用于「角色替换登场」。',
      params: [],
      preview: { kind: 'zoom', mode: 'inout' },
    },
  ],
}

// ============================================================
// 五、冲击与抖动（Impact & Shake）
// ============================================================
const impact: EffectCategory = {
  id: 'impact',
  name: '冲击 · 抖动',
  icon: 'Zap',
  desc: '瞬时、强烈的「物理反馈」类特效，常用于打击、惊吓、爆炸、强调台词。',
  items: [
    {
      id: 'hpunch',
      name: 'hpunch',
      cn: '水平猛击（横震屏）',
      syntax: 'with hpunch',
      desc: '让整个画面在水平方向快速抖动 0.25 秒，像被从侧面猛击一拳，强调冲击。',
      params: [],
      preview: { kind: 'shake', axis: 'h' },
    },
    {
      id: 'vpunch',
      name: 'vpunch',
      cn: '垂直猛击（纵震屏）',
      syntax: 'with vpunch',
      desc: '让整个画面在垂直方向快速抖动 0.25 秒，如地震、重击落地、剧烈惊吓。',
      params: [],
      preview: { kind: 'shake', axis: 'v' },
    },
    {
      id: 'shake',
      name: 'Shake',
      cn: '自定义抖动',
      syntax: 'transform shake:\n    on show: Shake((0,0,0,0), "sprite.png", 1.0, 10)',
      desc: '比 hpunch/vpunch 更可控的抖动变换工厂：可指定抖动幅度(围绕某锚点的偏移盒)、时长与次数，做持续颤动（如恐惧、寒颤、引擎轰鸣）。',
      params: [
        { name: 'offset', type: '(4)tuple', desc: '抖动的最大偏移盒 (x,y,w,h)' },
        { name: 'child', type: 'Displayable', desc: '被抖动的显示件' },
        { name: 'delay', type: 'float', desc: '总时长' },
        { name: 'strength', type: 'float', desc: '抖动强度' },
      ],
      preview: { kind: 'shake', axis: 'h' },
    },
  ],
}

// ============================================================
// 六、变换属性 · 位置
// ============================================================
const tfPos: EffectCategory = {
  id: 'tf-pos',
  name: '变换属性 · 位置',
  icon: 'LocateFixed',
  desc: 'Transform Properties 中控制「立绘落在屏幕何处」的一组属性，是 ATL 定点动画的基石。',
  items: [
    {
      id: 'tf-pos-prop',
      name: 'pos / xpos / ypos',
      cn: '绝对位置',
      syntax: 'linear 1.0 xpos 0.8',
      desc: '相对父容器左上角的位置。xpos/ypos 单独设置横/纵；pos 同时设置两者。值是 position 类型（浮点表示比例，absolute 表示像素）。',
      params: [{ name: 'pos', type: 'position', desc: '横纵坐标' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-align',
      name: 'align / xalign / yalign',
      cn: '对齐锚点定位',
      syntax: 'xalign 0.5 yalign 1.0',
      desc: '同时把「位置」与「锚点」设为同一值，最直观的定位方式：xalign=0.5 即水平居中。等价于 pos 与 anchor 同值。',
      params: [{ name: 'align', type: '(float,float)', desc: '0~1 的对齐比例' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-anchor',
      name: 'anchor / xanchor / yanchor',
      cn: '锚点',
      syntax: 'anchor (0.5, 1.0)',
      desc: '立绘自身的「悬挂点」：旋转、缩放都绕此点进行。anchor=(0.5,1.0) 表示以「底部中心」为基准，常用作立绘脚底对齐。',
      params: [{ name: 'anchor', type: 'position', desc: '立绘内部锚点比例' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-offset',
      name: 'offset / xoffset / yoffset',
      cn: '像素偏移',
      syntax: 'xoffset 40',
      desc: '在已定位基础上再叠加像素级偏移（正向右/下），常用于轻微抖动或「说话时前倾」。与 pos 不同，它不受比例缩放影响。',
      params: [{ name: 'offset', type: 'absolute', desc: '像素偏移量' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-center',
      name: 'xycenter / xcenter / ycenter',
      cn: '中心定位',
      syntax: 'xcenter 0.5',
      desc: '把立绘「自身中心」放到指定坐标（等价于 pos + anchor=(0.5,0.5)），定位直觉、旋转缩放都稳。',
      params: [{ name: 'center', type: 'position', desc: '立绘中心目标坐标' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-subpixel',
      name: 'subpixel',
      cn: '亚像素定位',
      syntax: 'subpixel True',
      desc: '开启后用亚像素级精度绘制，移动时边缘更顺滑、不锯齿跳动；移动方向上需保留透明边距以避免被裁。',
      params: [{ name: 'subpixel', type: 'bool', desc: '是否启用亚像素' }],
      preview: { kind: 'concept', text: 'subpixel 是「渲染精度」开关，本身无动画画面；开启后让位移/旋转更顺滑、边缘不抖。' },
    },
    {
      id: 'tf-polar',
      name: 'around / angle / radius（极坐标）',
      cn: '极坐标定位',
      syntax: 'around (0.5,0.5)\nlinear 2.0 angle 360',
      desc: '用「起点 + 角度 + 半径」描述位置，特别适合圆周运动（绕某点旋转一圈）。angle 0°指正上、90°指正右，自动归一到 0~360。',
      params: [
        { name: 'around', type: '(pos,pos)', desc: '极坐标起点' },
        { name: 'angle', type: 'float', desc: '角度（度）' },
        { name: 'radius', type: 'position', desc: '半径' },
      ],
      preview: { kind: 'polar' },
    },
    {
      id: 'tf-polar-anchor',
      name: 'anchoraround / anchorangle / anchorradius',
      cn: '锚点极坐标',
      syntax: 'anchoraround (0.5,0.5)\nanchorangle 180',
      desc: '与极坐标同理，但作用于「锚点」而非「位置」——让立绘围绕某点公转时，自身悬挂点也随之旋转。',
      params: [
        { name: 'anchoraround', type: '(pos,pos)', desc: '锚点极坐标起点' },
        { name: 'anchorangle', type: 'float', desc: '锚点角度' },
        { name: 'anchorradius', type: 'position', desc: '锚点半径' },
      ],
      preview: { kind: 'polar' },
    },
  ],
}

// ============================================================
// 七、变换属性 · 旋转 / 缩放 / 翻转
// ============================================================
const tfRot: EffectCategory = {
  id: 'tf-rot',
  name: '变换属性 · 旋转缩放翻转',
  icon: 'Rotate3d',
  desc: '控制立绘的「姿态」：旋转、整体/单向缩放、水平或垂直翻转。',
  items: [
    {
      id: 'tf-rotate',
      name: 'rotate',
      cn: '旋转',
      syntax: 'linear 1.0 rotate 360',
      desc: '顺时针旋转指定角度（度）。配合 rotate_pad 可避免旋转时尺寸抖动；transform_anchor 可改旋转中心。',
      params: [{ name: 'rotate', type: 'float?', desc: '旋转角度，None 表示不旋转' }],
      preview: { kind: 'rotate', deg: 360 },
    },
    {
      id: 'tf-rotate-pad',
      name: 'rotate_pad',
      cn: '旋转留白',
      syntax: 'rotate_pad True',
      desc: '为旋转后的显示件补足成「正方形外接框」，使其在旋转全程尺寸恒定、不忽大忽小。固定角度旋转时可设为 False 取最小包围盒。',
      params: [{ name: 'rotate_pad', type: 'bool', desc: '是否补齐外接正方形' }],
      preview: { kind: 'rotate', deg: 45 },
    },
    {
      id: 'tf-transform-anchor',
      name: 'transform_anchor',
      cn: '变换锚点跟随',
      syntax: 'transform_anchor True',
      desc: '开启后，锚点落在「被裁剪后的子图」上，并随缩放/旋转一起移动——等于把锚点变成立绘真正的「旋转缩放中心」。',
      params: [{ name: 'transform_anchor', type: 'bool', desc: '是否启用' }],
      preview: { kind: 'rotate', deg: 360 },
    },
    {
      id: 'tf-zoom',
      name: 'zoom',
      cn: '整体缩放',
      syntax: 'linear 0.5 zoom 1.2',
      desc: '统一缩放立绘（因子，1.0 为原大）。与 xzoom/yzoom 不同，zoom 保持宽高比。',
      params: [{ name: 'zoom', type: 'float', desc: '缩放因子' }],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 'tf-xzoom',
      name: 'xzoom / yzoom（含翻转）',
      cn: '单向缩放 / 翻转',
      syntax: 'xzoom -1   # 水平翻转',
      desc: '分别控制水平/垂直缩放。**负值即翻转**：xzoom=-1 是水平镜像（常用于角色「转身面向另一边」），yzoom=-1 是垂直镜像。',
      params: [{ name: 'xzoom/yzoom', type: 'float', desc: '缩放因子，负值=翻转' }],
      preview: { kind: 'flip', axis: 'h' },
    },
  ],
}

// ============================================================
// 八、变换属性 · 像素与颜色
// ============================================================
const tfColor: EffectCategory = {
  id: 'tf-color',
  name: '变换属性 · 像素与颜色',
  icon: 'Palette',
  desc: '立绘的「质感层」：透明度、叠加发光、像素采样、模糊，以及强大的 matrixcolor 颜色矩阵全家桶。',
  items: [
    {
      id: 'tf-alpha',
      name: 'alpha',
      cn: '透明度',
      syntax: 'linear 1.0 alpha 0.3',
      desc: '控制立绘整体不透明度（0 全透、1 不透明）。逐子图独立应用，重叠子图叠加时可能透视——可用 Flatten() 规避。',
      params: [{ name: 'alpha', type: 'float', desc: '不透明度 0~1' }],
      preview: { kind: 'alpha' },
    },
    {
      id: 'tf-additive',
      name: 'additive',
      cn: '叠加发光',
      syntax: 'additive 1.0',
      desc: '设为 1.0 时用「加色混合(ADD)」绘制，产生霓虹/魔法发光感；0.0 用普通覆盖(OVER)。对半透明区域做光晕特别有用。',
      params: [{ name: 'additive', type: 'float', desc: '加色强度 0~1' }],
      preview: { kind: 'additive' },
    },
    {
      id: 'tf-nearest',
      name: 'nearest',
      cn: '最近邻采样',
      syntax: 'nearest True',
      desc: 'True 用最近邻（硬边、像素风）滤波，False 用双线性（平滑）。像素艺术/复古风必备；默认继承父级或 config。',
      params: [{ name: 'nearest', type: 'bool?', desc: '是否最近邻' }],
      preview: { kind: 'concept', text: 'nearest 是像素采样方式开关（硬边 vs 平滑），无动态画面；对像素风立绘开启可避免缩放模糊。' },
    },
    {
      id: 'tf-blur',
      name: 'blur',
      cn: '模糊',
      syntax: 'linear 0.5 blur 8',
      desc: '把立绘按指定像素半径模糊（如梦、失焦、景深、回忆）。模糊会先把子图展平到透明底再处理。',
      params: [{ name: 'blur', type: 'float?', desc: '模糊半径（像素），None=不模糊' }],
      preview: { kind: 'blur' },
    },
    {
      id: 'tf-matrixcolor',
      name: 'matrixcolor',
      cn: '颜色矩阵（总属性）',
      syntax: 'matrixcolor TintMatrix("#ff8888") * SaturationMatrix(0.5)',
      desc: '统一重着色入口，接受 4×4 Matrix 或任意 ColorMatrix 子类，可相乘组合。ATL 中做动画插值要求两端「同类型、同顺序」。',
      params: [{ name: 'matrixcolor', type: 'Matrix|ColorMatrix', desc: '颜色变换对象' }],
      preview: { kind: 'color', filter: 'saturate(0.4) hue-rotate(20deg)' },
    },
    {
      id: 'mc-brightness',
      name: 'BrightnessMatrix',
      cn: '亮度',
      syntax: 'matrixcolor BrightnessMatrix(0.3)',
      desc: '整体加减亮度（不动 Alpha）。value=-1 全黑、0 不变、1 全白。常用于「灯灭 / 曝光」。',
      params: [{ name: 'value', type: 'float', desc: '亮度增量 -1~1' }],
      preview: { kind: 'color', filter: 'brightness(1.6)' },
    },
    {
      id: 'mc-contrast',
      name: 'ContrastMatrix',
      cn: '对比度',
      syntax: 'matrixcolor ContrastMatrix(1.4)',
      desc: '调整对比度（不动 Alpha）。<1 降低、>1 增强，让画面更「硬」或更「灰」。',
      params: [{ name: 'value', type: 'float', desc: '对比度倍率' }],
      preview: { kind: 'color', filter: 'contrast(1.6)' },
    },
    {
      id: 'mc-saturation',
      name: 'SaturationMatrix',
      cn: '饱和度',
      syntax: 'matrixcolor SaturationMatrix(0.0)',
      desc: '调整饱和度（不动 Alpha）。1=原色、0=完全灰度。desat 为去饱和时保留的三通道权重（默认按亮度 0.2126/0.7152/0.0722）。',
      params: [{ name: 'value', type: 'float', desc: '饱和度倍率' }, { name: 'desat', type: '(3)tuple', desc: '去饱和保留权重' }],
      preview: { kind: 'color', filter: 'saturate(0)' },
    },
    {
      id: 'mc-hue',
      name: 'HueMatrix',
      cn: '色相旋转',
      syntax: 'matrixcolor HueMatrix(120)',
      desc: '把颜色绕色环旋转指定度数（不动 Alpha）。用于「换色 / 异世界滤镜 / 情绪染色」。',
      params: [{ name: 'value', type: 'float', desc: '旋转度数' }],
      preview: { kind: 'color', filter: 'hue-rotate(120deg)' },
    },
    {
      id: 'mc-invert',
      name: 'InvertMatrix',
      cn: '反相',
      syntax: 'matrixcolor InvertMatrix(1.0)',
      desc: '反转颜色通道（不动 Alpha）。0→1 控制反转量，1 为完全底片效果。',
      params: [{ name: 'value', type: 'float', desc: '反转量 0~1' }],
      preview: { kind: 'color', filter: 'invert(1)' },
    },
    {
      id: 'mc-opacity',
      name: 'OpacityMatrix',
      cn: '不透明度矩阵',
      syntax: 'matrixcolor OpacityMatrix(0.5)',
      desc: '仅乘算 Alpha（不动颜色），与 alpha 属性等价但走矩阵通道，便于与其他矩阵组合。',
      params: [{ name: 'value', type: 'float', desc: 'Alpha 乘子 0~1' }],
      preview: { kind: 'alpha' },
    },
    {
      id: 'mc-colorize',
      name: 'ColorizeMatrix',
      cn: '黑白着色',
      syntax: 'matrixcolor ColorizeMatrix("#000", "#f00")',
      desc: '把「黑白图像」在指定黑、白两色之间重新着色（不动 Alpha），适合双色剪影 / 夜视仪绿。',
      params: [{ name: 'black_color', type: 'Color', desc: '暗部着色' }, { name: 'white_color', type: 'Color', desc: '亮部着色' }],
      preview: { kind: 'color', filter: 'sepia(1) saturate(2) hue-rotate(300deg)' },
    },
    {
      id: 'mc-tint',
      name: 'TintMatrix',
      cn: '整体染色',
      syntax: 'matrixcolor TintMatrix("#88ccff")',
      desc: '给整张图染上一层颜色（不动 Alpha），最常用于「夜晚蓝 / 回忆黄 / 危险红」的情绪统一着色。',
      params: [{ name: 'color', type: 'Color', desc: '染色颜色' }],
      preview: { kind: 'color', filter: 'sepia(1) saturate(1.4) hue-rotate(190deg)' },
    },
    {
      id: 'mc-sepia',
      name: 'SepiaMatrix',
      cn: '棕褐（复古）',
      syntax: 'matrixcolor SepiaMatrix()',
      desc: '返回棕褐色调矩阵，等价于 TintMatrix("#ffeec2") * SaturationMatrix(0.0)，一键复古老照片质感。',
      params: [{ name: 'tint', type: 'Color', desc: '色调，默认 "#ffeec2"' }, { name: 'desat', type: '(3)tuple', desc: '去饱和权重' }],
      preview: { kind: 'color', filter: 'sepia(1)' },
    },
    {
      id: 'mc-identity',
      name: 'IdentityMatrix',
      cn: '单位矩阵',
      syntax: 'matrixcolor IdentityMatrix()',
      desc: '完全不改变颜色与 Alpha 的基准矩阵，常在 ATL 插值中作为「起点/终点」占位，保证结构一致。',
      params: [],
      preview: { kind: 'concept', text: 'IdentityMatrix 是不做任何改动的基准矩阵，常用于动画起点/终点占位以保证可插值。' },
    },
    {
      id: 'mc-spline',
      name: 'SplineMatrix',
      cn: '样条矩阵插值',
      syntax: 'matrixcolor SplineMatrix(SaturationMatrix(1.0), [0,0.5,1])',
      desc: '用样条曲线在多个矩阵之间插值，实现比线性更自然的颜色渐变（如呼吸式闪烁染色）。',
      params: [{ name: 'matrix', type: 'Matrix', desc: '目标矩阵' }, { name: 'spline', type: 'list', desc: '≥3 个浮点的样条控制点' }],
      preview: { kind: 'color', filter: 'saturate(1.8)' },
    },
    {
      id: 'mc-matrix',
      name: 'Matrix（自定义 4×4）',
      cn: '裸矩阵',
      syntax: 'matrixcolor Matrix([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])',
      desc: '用 16 个数字直接定义 4×4 颜色变换矩阵（如交换红绿通道）。需遵循预乘 Alpha 约定，否则缩放出现伪影。',
      params: [{ name: 'args', type: '16×float', desc: '行优先的 4×4 矩阵' }],
      preview: { kind: 'color', filter: 'saturate(1.5) hue-rotate(60deg)' },
    },
  ],
}

// ============================================================
// 九、变换属性 · 裁剪与缩放
// ============================================================
const tfCrop: EffectCategory = {
  id: 'tf-crop',
  name: '变换属性 · 裁剪缩放',
  icon: 'Crop',
  desc: '对立绘做「取景框」式操作：裁切局部、改尺寸、按 fit 规则适配，是做「特写 / 镜头推近局部」的关键。',
  items: [
    {
      id: 'tf-crop-prop',
      name: 'crop',
      cn: '裁剪盒',
      syntax: 'crop (0.2, 0.0, 0.6, 1.0)',
      desc: '把立绘裁切成指定矩形 (x,y,w,h)，坐标相对子图左上角。可超出原图（外部透明）。配合动画可做「镜头推近脸部」。',
      params: [{ name: 'crop', type: '(4)tuple?', desc: '裁剪盒，None=不裁剪' }],
      preview: { kind: 'crop' },
    },
    {
      id: 'tf-corner',
      name: 'corner1 / corner2',
      cn: '对角裁剪',
      syntax: 'corner1 (0.2,0.0) corner2 (0.8,1.0)',
      desc: '用左上(corner1)与右下(corner2)两个对角点定义裁剪盒，比 crop 写四元组更直观。crop 优先级更高。',
      params: [
        { name: 'corner1', type: '(pos,pos)?', desc: '左上角' },
        { name: 'corner2', type: '(pos,pos)?', desc: '右下角' },
      ],
      preview: { kind: 'crop' },
    },
    {
      id: 'tf-xysize',
      name: 'xysize / xsize / ysize',
      cn: '强制尺寸',
      syntax: 'xysize (400, 600)',
      desc: '把立绘缩放到指定宽高。xsize/ysize 单独设宽/高；受 fit 属性影响（contain/cover/fill 等）。',
      params: [{ name: 'xysize', type: '(pos,pos)?', desc: '目标宽高' }],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 'tf-fit',
      name: 'fit',
      cn: '适配模式',
      syntax: 'fit "cover"',
      desc: '配合 xsize/ysize 决定缩放策略：contain(含入不超界)、cover(覆盖不亏)、fill(拉伸填满)、scale-down/scale-up(单向)。',
      params: [{ name: 'fit', type: 'str?', desc: 'contain/cover/fill/scale-down/scale-up' }],
      preview: { kind: 'concept', text: 'fit 决定「指定尺寸时如何保持比例」：contain 含入、cover 覆盖、fill 拉伸。无独立动画。' },
    },
    {
      id: 'tf-maxsize',
      name: 'maxsize',
      cn: '最大尺寸约束',
      syntax: 'maxsize (800, 600)',
      desc: '把立绘缩放到「不超过该框」且保持比例（等价于 xysize + fit="contain"）。旧版 size 属性不推荐再用。',
      params: [{ name: 'maxsize', type: '(int,int)?', desc: '最大宽高框' }],
      preview: { kind: 'zoom', mode: 'in' },
    },
  ],
}

// ============================================================
// 十、变换属性 · 全景与平铺
// ============================================================
const tfPan: EffectCategory = {
  id: 'tf-pan',
  name: '变换属性 · 全景平铺',
  icon: 'PanelsTopLeft',
  desc: '针对「超宽全景图 / 重复纹理」的专用属性：xpan/ypan 做 360° 全景漫游，xtile/ytile 做纹理平铺。',
  items: [
    {
      id: 'tf-xpan',
      name: 'xpan / ypan',
      cn: '全景漫游',
      syntax: 'xpan 45',
      desc: '把一张 360° 全景图按「角度」横向/纵向平移取景（中心为 0°，左右边缘 ±180°）。做「环视四周」必备。',
      params: [{ name: 'xpan/ypan', type: 'float?', desc: '取景角度（度）' }],
      preview: { kind: 'pan' },
    },
    {
      id: 'tf-xtile',
      name: 'xtile / ytile',
      cn: '纹理平铺',
      syntax: 'xtile 3 ytile 2',
      desc: '把图像在水平/垂直方向平铺指定次数，常用于背景花纹、雪地、重复 UI。配合 xpan 可做无限滚动。',
      params: [{ name: 'xtile/ytile', type: 'int', desc: '平铺次数，默认 1' }],
      preview: { kind: 'tile' },
    },
  ],
}

// ============================================================
// 十一、缓动函数（Warpers / Easing）
// ============================================================
// 统一用 bezier 近似（供预览小球沿曲线运动演示）
const warper = (
  id: string,
  name: string,
  cn: string,
  bezier: [number, number, number, number],
  desc: string,
): EffectItem => ({
  id,
  name,
  cn,
  desc,
  preview: { kind: 'ease', bezier },
})

const warpers: EffectCategory = {
  id: 'warpers',
  name: '缓动函数（Warpers）',
  icon: 'Activity',
  desc: '插值动画的「时间曲线」灵魂：决定属性从 A 到 B「怎么走」（匀速、先快后慢、回弹、弹跳）。所有 linear/ease*/Penner 族在此全集收录。',
  items: [
    warper('w-linear', 'linear', '线性', [0, 0, 1, 1], '绝对匀速，最机械、最「程序感」，适合机械/数字风。'),
    warper('w-ease', 'ease', '缓动（默认）', [0.25, 0.1, 0.25, 1], 'Ren\'Py 默认缓动：首尾柔、中间快，自然不突兀。'),
    warper('w-easein', 'easein', '缓入', [0.42, 0, 1, 1], '开头慢、结尾快，适合「加速离场 / 冲出」。'),
    warper('w-easeout', 'easeout', '缓出', [0, 0, 0.58, 1], '开头快、结尾慢，适合「减速入场 / 轻轻落下」。'),
    warper('w-easeinout', 'easeinout', '缓入缓出', [0.42, 0, 0.58, 1], '两端都柔，最顺滑通用，对话/移动首选。'),
    warper('w-spring', 'spring', '弹簧', [0.68, -0.55, 0.27, 1.55], '带过冲回弹，像被弹簧拉到位，活泼有弹性。'),
    warper('w-zoomin', 'zoomin', '缩放入场曲线', [0.34, 1.2, 0.64, 1], '专用于缩放进场的缓动（与 zoom 转场配套）。'),
    warper('w-zoomout', 'zoomout', '缩放离场曲线', [0.36, 0, 0.66, -0.2], '专用于缩放离场的缓动。'),
    warper('w-bounce', 'bounce', '弹跳', [0.34, 1.56, 0.64, 1], '落地后多次小弹跳，俏皮、Q 弹。'),
    // Penner 族（基础 10 种，in/out/inout 三态）
    warper('w-back', 'ease_back', '回弹(Penner)', [0.68, -0.55, 0.27, 1.55], '先微退再冲过、最后回弹就位，有「蓄力感」。'),
    warper('w-bounce-p', 'ease_bounce', '弹跳(Penner)', [0.34, 1.56, 0.64, 1], '标准 Penner 弹跳曲线，落地回弹。'),
    warper('w-circ', 'ease_circ', '圆周(Penner)', [0.08, 0.82, 0.17, 1], '基于圆周函数的加速，收尾极陡。'),
    warper('w-cubic', 'ease_cubic', '三次(Penner)', [0.65, 0, 0.35, 1], '三次缓动，比 quad 更柔。'),
    warper('w-elastic', 'ease_elastic', '弹性(Penner)', [0.68, -0.55, 0.27, 1.55], '剧烈来回震荡后归位，超有弹性张力。'),
    warper('w-expo', 'ease_expo', '指数(Penner)', [1, 0, 0, 1], '指数级加速/减速，极快起步或极柔收尾。'),
    warper('w-quad', 'ease_quad', '二次(Penner)', [0.45, 0, 0.55, 1], '二次缓动，轻量柔和。'),
    warper('w-quart', 'ease_quart', '四次(Penner)', [0.76, 0, 0.24, 1], '四次缓动，比 cubic 更明显。'),
    warper('w-quint', 'ease_quint', '五次(Penner)', [0.83, 0, 0.17, 1], '五次缓动，最极致的缓入缓出。'),
    warper('w-sine', 'ease_sine', '正弦(Penner)', [0.37, 0, 0.63, 1], '正弦曲线，最平滑、最「呼吸感」。'),
    {
      id: 'w-penner-variants',
      name: 'Penner 三态变体（in / out / inout）',
      cn: 'Penner 全表',
      desc:
        '上述 10 种 Penner 缓动各有三态后缀，合共 30 种，全部可用：\n' +
        '• ease_in_* ：ease_in_back / ease_in_bounce / ease_in_circ / ease_in_cubic / ease_in_elastic / ease_in_expo / ease_in_quad / ease_in_quart / ease_in_quint / ease_in_sine\n' +
        '• ease_out_*：ease_out_back / ease_out_bounce / ease_out_circ / ease_out_cubic / ease_out_elastic / ease_out_expo / ease_out_quad / ease_out_quart / ease_out_quint / ease_out_sine\n' +
        '• ease_inout_*：ease_inout_back / ease_inout_bounce / ease_inout_circ / ease_inout_cubic / ease_inout_elastic / ease_inout_expo / ease_inout_quad / ease_inout_quart / ease_inout_quint / ease_inout_sine\n' +
        '在插值语句里直接用，如 `ease_inout_elastic 1.0 xpos 0.5`。',
      preview: { kind: 'ease', bezier: [0.68, -0.55, 0.27, 1.55] },
    },
  ],
}

// ============================================================
// 十二、ATL 动画语句
// ============================================================
const atl: EffectCategory = {
  id: 'atl',
  name: 'ATL 动画语句',
  icon: 'ScrollText',
  desc: 'Animation and Transformation Language 的「语法积木」：如何用声明式语句编排时间、循环、并行、随机、事件。',
  items: [
    {
      id: 'atl-interp',
      name: 'Interpolation（插值语句）',
      cn: '属性补间',
      syntax: 'linear 2.0 xalign 1.0',
      desc: 'ATL 最核心的语句：在给定时长内，用某缓动把属性从当前值补间到目标值。可连续多条形成关键帧。',
      params: [{ name: 'warper time prop value', type: '—', desc: '缓动 时长 属性 目标值' }],
      preview: { kind: 'position' },
    },
    {
      id: 'atl-pause',
      name: 'pause / 数字语句',
      cn: '停顿',
      syntax: 'pause 1.0   # 或单独写 2.0',
      desc: '在动画时间线上暂停指定秒数（或写个裸数字）。用于关键帧之间的留白。',
      params: [{ name: 'time', type: 'float', desc: '暂停秒数' }],
      preview: { kind: 'concept', text: 'pause 在动画时间线上制造停顿（留白），无自身画面变化，可观察后一段动画「延迟启动」。' },
    },
    {
      id: 'atl-time',
      name: 'time',
      cn: '绝对时间点',
      syntax: 'time 2.0\n    xalign 0.5',
      desc: '把后续语句「锚定」到时间线的绝对时刻（而非相对上一条之后），便于编排多轨同步。',
      params: [{ name: 'time', type: 'float', desc: '绝对秒数' }],
      preview: { kind: 'concept', text: 'time 2.0 让其后语句从时间线第 2 秒开始，便于多属性按绝对时刻对齐。' },
    },
    {
      id: 'atl-repeat',
      name: 'repeat',
      cn: '循环',
      syntax: 'repeat:\n    linear 1.0 rotate 360',
      desc: '从头重复整个块（可带次数 repeat 3）。做呼吸、自转、飘浮等「永续动画」的关键。',
      params: [{ name: 'count', type: 'int?', desc: '重复次数，省略=无限' }],
      preview: { kind: 'loop' },
    },
    {
      id: 'atl-parallel',
      name: 'parallel',
      cn: '并行',
      syntax: 'parallel:\n    xalign 0.0 0.5\n    linear 1.0 yalign 0.0',
      desc: '让多个块同时执行——例如「一边左右移动、一边上下浮动」。注意同一数据块内不要同时改互相冲突的属性。',
      params: [],
      preview: { kind: 'parallel' },
    },
    {
      id: 'atl-choice',
      name: 'choice',
      cn: '随机选择',
      syntax: 'choice:\n    "a.png"\n    "b.png"',
      desc: '按权重随机挑选一个分支执行，做「眨眼随机 / 多套表情随机 / 自然不重复」演出。',
      params: [],
      preview: { kind: 'choice' },
    },
    {
      id: 'atl-block',
      name: 'block',
      cn: '代码块',
      syntax: 'block:\n    linear 1.0 xpos 0.5',
      desc: '把一组语句聚成可重复/可并行的单元，是 repeat/parallel/choice 的内容载体。',
      params: [],
      preview: { kind: 'concept', text: 'block 是组织 ATL 语句的「容器」，本身无画面，常与 repeat/parallel/choice 配合。' },
    },
    {
      id: 'atl-contains',
      name: 'contains',
      cn: '内嵌子显示件',
      syntax: 'contains "sprite.png"\ncontains:\n    ...ATL...',
      desc: '在变换内嵌一个子显示件（并独立施加 ATL）。可用于「立绘内部再叠一个飘动的光效」。',
      params: [],
      preview: { kind: 'concept', text: 'contains 把一个子显示件嵌入当前变换并独立动画，适合「立绘上叠加局部动效」。' },
    },
    {
      id: 'atl-function',
      name: 'function',
      cn: 'Python 函数驱动',
      syntax: 'function my_anim',
      desc: '调用 Python 函数 (trans, st, at) -> delay|None 逐帧驱动变换，实现算法化动画（粒子、物理、逐像素）。',
      params: [{ name: 'func', type: 'callable', desc: '接收 transform/time 并返回延迟' }],
      preview: { kind: 'concept', text: 'function 把动画交给 Python 逐帧函数驱动，可实现任意算法化效果（粒子、物理）。' },
    },
    {
      id: 'atl-on',
      name: 'on',
      cn: '事件处理器',
      syntax: 'on show,hide:\n    linear 0.5 alpha 1.0',
      desc: '响应 show/hide/hover/idle 等事件时执行对应动画块，做「出场/入场/悬停反馈」的状态机。',
      params: [{ name: 'event', type: 'str', desc: '事件名（可逗号并列）' }],
      preview: { kind: 'loop' },
    },
    {
      id: 'atl-event',
      name: 'event',
      cn: '发出事件',
      syntax: 'event "arrived"',
      desc: '在动画某时刻主动发出一个命名事件，供外层 on 或 Python 监听，做跨层联动。',
      params: [{ name: 'name', type: 'str', desc: '事件名' }],
      preview: { kind: 'concept', text: 'event 在动画中广播命名事件，供 on 语句 / Python 监听，实现跨层编排。' },
    },
    {
      id: 'atl-with',
      name: 'with',
      cn: '转场嵌套',
      syntax: 'contains "a.png" with dissolve',
      desc: '在切换显示件时套用一次转场（如 contains 换图时 dissolve），让子层切换也丝滑。',
      params: [{ name: 'transition', type: 'Transition', desc: '嵌套转场' }],
      preview: { kind: 'dissolve' },
    },
    {
      id: 'atl-pass',
      name: 'pass',
      cn: '空操作',
      syntax: 'pass',
      desc: '占位空语句（no-op），用于对齐结构或预留扩展，不改变任何属性。',
      params: [],
      preview: { kind: 'concept', text: 'pass 是空操作占位语句，不改变画面，常用于结构对齐。' },
    },
    {
      id: 'atl-animation',
      name: 'animation',
      cn: '动画时间基',
      syntax: 'animation\nlinear 1.0 xpos 1.0',
      desc: '声明该变换使用「动画时间基(at)」而非「显示时间基(st)」，使其在循环/重播时时间归零，避免续播错位。',
      params: [],
      preview: { kind: 'loop' },
    },
  ],
}

// ============================================================
// 十三、内置定位变换（Built-in Transforms）
// ============================================================
const builtin: EffectCategory = {
  id: 'builtin',
  name: '内置定位变换',
  icon: 'MapPin',
  desc: 'Ren\'Py 预置的一组「一键摆位」变换，常直接用在 show 语句里把立绘放到经典机位（左/中/右/出屏）。',
  items: [
    { id: 'bi-center', name: 'center', cn: '居中', syntax: 'show eileen at center', desc: '水平居中、与屏幕底部对齐，最常用的立绘机位。', preview: { kind: 'position' } },
    { id: 'bi-left', name: 'left', cn: '左下', syntax: 'show eileen at left', desc: '对齐屏幕左下角。', preview: { kind: 'position' } },
    { id: 'bi-right', name: 'right', cn: '右下', syntax: 'show eileen at right', desc: '对齐屏幕右下角。', preview: { kind: 'position' } },
    { id: 'bi-top', name: 'top', cn: '顶中', syntax: 'show eileen at top', desc: '水平居中、与屏幕顶部对齐（适合俯视/招牌）。', preview: { kind: 'position' } },
    { id: 'bi-topleft', name: 'topleft', cn: '左上', syntax: 'show eileen at topleft', desc: '对齐屏幕左上角。', preview: { kind: 'position' } },
    { id: 'bi-topright', name: 'topright', cn: '右上', syntax: 'show eileen at topright', desc: '对齐屏幕右上角。', preview: { kind: 'position' } },
    { id: 'bi-truecenter', name: 'truecenter', cn: '绝对中心', syntax: 'show eileen at truecenter', desc: '水平与垂直都居中（含中心点），适合特写/重要画面。', preview: { kind: 'position' } },
    { id: 'bi-offleft', name: 'offscreenleft', cn: '屏外左', syntax: 'show eileen at offscreenleft', desc: '放到屏幕左侧之外（与底对齐），用于「从画外走进来」的起点。', preview: { kind: 'move', dir: 'right', mode: 'in' } },
    { id: 'bi-offright', name: 'offscreenright', cn: '屏外右', syntax: 'show eileen at offscreenright', desc: '放到屏幕右侧之外，用于「向画外走去」的终点。', preview: { kind: 'move', dir: 'right', mode: 'out' } },
    { id: 'bi-default', name: 'default', cn: '默认变换', syntax: 'config.default_transform = ...', desc: 'show/scene 的默认摆放变换（默认等同 center），可全局重定义改变所有登场机位。', preview: { kind: 'position' } },
    { id: 'bi-reset', name: 'reset', cn: '重置变换', syntax: 'show eileen at reset', desc: '把所有变换属性还原为默认值、清除之前设置的属性，相当于「清空叠加状态」。', preview: { kind: 'concept', text: 'reset 把变换属性全部还原默认、清除历史叠加，无独立画面——可观察立绘瞬间回到初始姿态。' } },
  ],
}

// ============================================================
// 十四、3D 舞台与模型渲染
// ============================================================
const stage3d: EffectCategory = {
  id: 'stage3d',
  name: '3D 舞台 · 模型渲染',
  icon: 'Box',
  desc: 'Ren\'Py 的高级层：perspective 开启 3D 舞台，配合矩阵变换做真实三维旋转；mesh/shader 走 GPU 模型渲染管线，实现自定义着色。',
  items: [
    {
      id: 's-perspective',
      name: 'perspective',
      cn: '透视投影',
      syntax: 'perspective 400.0',
      desc: '开启 3D 舞台并设置视距（越小透视越夸张）。开启后子显示件才能用 xrotate/yrotate/zrotate 做真三维旋转。',
      params: [{ name: 'perspective', type: 'float?', desc: '视距，None=关闭 3D' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-matrixtransform',
      name: 'matrixtransform',
      cn: '三维变换矩阵',
      syntax: 'matrixtransform rotate_matrix',
      desc: '用 4×4 矩阵对显示件做三维变换（旋转/平移/缩放），与 matrixanchor 配合确定变换中心。',
      params: [{ name: 'matrixtransform', type: 'Matrix?', desc: '三维变换矩阵' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-matrixanchor',
      name: 'matrixanchor',
      cn: '三维变换锚点',
      syntax: 'matrixanchor (0.5, 0.5)',
      desc: '三维变换的「旋转/缩放中心」点，默认 (0.5,0.5) 即中心。',
      params: [{ name: 'matrixanchor', type: '(pos,pos)', desc: '锚点比例' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-xrotate',
      name: 'xrotate / yrotate / zrotate',
      cn: '三维旋转（三轴）',
      syntax: 'xrotate 45 yrotate 30',
      desc: '分别绕 X/Y/Z 轴做三维旋转，需先开启 perspective。zrotate 等价于 2D 的 rotate。可做「卡牌翻面 / 立体翻转」。',
      params: [{ name: 'xrotate/yrotate/zrotate', type: 'float', desc: '绕各轴旋转角度' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-orientation',
      name: 'orientation',
      cn: '欧拉朝向',
      syntax: 'orientation 0.0 0.0 0.0',
      desc: '用 (x,y,z) 欧拉角一次性设置三维朝向，是 xrotate/yrotate/zrotate 的便捷组合。',
      params: [{ name: 'orientation', type: '(3)float', desc: 'X/Y/Z 欧拉角' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-point-to',
      name: 'point_to',
      cn: '朝向某点',
      syntax: 'point_to (0.5, 0.5)',
      desc: '让显示件「正面」自动转向指定坐标点，常用于 3D 场景里角色始终面向镜头或目标。',
      params: [{ name: 'point_to', type: '(pos,pos)', desc: '目标坐标' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-zpos-zzoom',
      name: 'zpos / zzoom',
      cn: '深度位置 / 深度缩放',
      syntax: 'zpos 0.2 zzoom 1.1',
      desc: '在 3D 舞台中设置沿 Z 轴的深度位置与深度缩放，制造「前后景层次 / 推拉镜头」。',
      params: [{ name: 'zpos', type: 'float', desc: 'Z 深度' }, { name: 'zzoom', type: 'float', desc: 'Z 方向缩放' }],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 's-mesh',
      name: 'mesh / mesh_pad',
      cn: '网格化（GPU 渲染）',
      syntax: 'mesh True',
      desc: '把显示件转为 GPU 模型网格，使其能应用自定义 shader / 矩阵变换。mesh_pad 控制是否在边缘留透明边距以避免采样越界。',
      params: [{ name: 'mesh', type: 'bool', desc: '是否网格化' }, { name: 'mesh_pad', type: 'bool', desc: '是否留透明边距' }],
      preview: { kind: 'concept', text: 'mesh/mesh_pad 把显示件转为 GPU 模型网格，是应用 shader/矩阵变换的前提，本身无独立画面。' },
    },
    {
      id: 's-shader',
      name: 'shader / blend',
      cn: '着色器 / 混合模式',
      syntax: 'shader "shaders.example"',
      desc: '指定 GLSL 着色器实现自定义渲染（水波、故障、像素风等）；blend 设置混合方程（如加法发光）。是 Ren\'Py 特效的「终极武器」。',
      params: [{ name: 'shader', type: 'str', desc: '着色器名' }, { name: 'blend', type: 'str', desc: '混合模式' }],
      preview: { kind: 'concept', text: 'shader/blend 走 GPU 自定义着色（水波/故障/发光），是特效的终极武器，无内置统一画面。' },
    },
  ],
}

// ============================================================
// 汇总导出
// ============================================================
export const EFFECT_CATEGORIES: EffectCategory[] = [
  basic,
  crop,
  movement,
  zoom,
  impact,
  tfPos,
  tfRot,
  tfColor,
  tfCrop,
  tfPan,
  warpers,
  atl,
  builtin,
  stage3d,
]

/** 扁平化所有特效，便于搜索与「下一个」遍历 */
export const ALL_EFFECTS: EffectItem[] = EFFECT_CATEGORIES.flatMap((c) => c.items)
