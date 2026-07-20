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
// 每个特效均配：
//   name        Ren'Py 原名
//   cn          中文名
//   syntax      示例语法（主）
//   syntax2?    补充语法示例（可选）
//   desc        功能说明（一句话概述）
//   principle   底层原理（官方文档原理拆解）
//   scenario    适合在什么剧情场景下使用
//   brief       精简一句话（预览舞台右侧用）
//   params      参数用途 + math（参数底层数学/取值逻辑）
//   preview     可点击预览的规格
//   renpyClass  是否为可实例化的类
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
  /** 参数的底层数学 / 取值逻辑 */
  math?: string
}

export interface EffectItem {
  id: string
  name: string // Ren'Py 原名
  cn: string // 中文名
  syntax?: string // 示例语法（主）
  syntax2?: string // 补充语法示例
  desc: string // 功能说明（概述）
  principle?: string // 底层原理
  scenario?: string // 适用剧情场景
  brief?: string // 精简一句话（预览舞台右侧）
  params?: EffectParam[] // 参数用途 + 数学逻辑
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
      syntax2: 'show bg night with Dissolve(1.5, alpha=True)',
      desc: '在指定时长内把旧画面与新画面做交叉淡化（cross-fade），是最经典、最柔和的场景切换。默认 0.5 秒。',
      principle:
        'Dissolve 在内部维持旧场景(old)与新场景(new)两张图的叠加。每一像素处：新图不透明度 = clamp(t,0,1)，旧图不透明度 = 1-t，其中 t 随 time 从 0 线性走到 1。任意时刻两图按互补权重混合，于是视觉上旧图渐隐、新图渐显，形成无任何几何运动的纯交叉淡化。',
      scenario: '绝大多数普通场景切换、对话间的柔和转场，是最不会出错、几乎天天都在用的默认选择。',
      brief: '两图按互补权重交叉淡化，无几何运动。',
      params: [
        {
          name: 'time',
          type: 'float',
          desc: '溶解时长（秒）',
          math: 't: 0→1 的线性跨度（秒）。new_alpha = t，old_alpha = 1-t。默认 0.5。',
        },
        {
          name: 'alpha',
          type: 'bool',
          desc: '是否对带透明通道的图做 alpha 感知混合',
          math: 'True 时按每像素 alpha 加权混合，避免半透明边缘出现黑边；默认 False。',
        },
      ],
      preview: { kind: 'dissolve' },
    },
    {
      id: 'fade',
      name: 'Fade',
      cn: '淡入淡出（经黑场）',
      syntax: 'with fade   # 或 Fade(0.5, 0.0, 0.5)',
      syntax2: 'define fade_white = Fade(0.5, 0.0, 0.5, color="#fff")',
      desc: '先把画面淡出到某个纯色（默认黑），停留片刻，再淡入新画面。比 dissolve 更有「章节感」。',
      principle:
        'Fade 分三段时序：以 out_time 把当前画面 alpha 从 1 降到 0（淡出到纯色 color 屏）；hold_time 期间保持纯色屏不动；再以 in_time 把新画面从纯色屏 alpha 0 淡入到 1。本质是「经纯色中转」的 Dissolve 变体，中转色带来强烈的换幕仪式感。',
      scenario: '章节切换、时间跳跃、回忆开场/收束、情绪强烈转折处——比 dissolve 更有「翻篇」的仪式感。',
      brief: '旧画面淡出到纯色屏 → 停留 → 新画面淡入。',
      params: [
        { name: 'out_time', type: 'float', desc: '淡出到纯色屏的时长', math: '旧画面 alpha 1→0 的秒数。' },
        { name: 'hold_time', type: 'float', desc: '纯色屏停留时长', math: '纯色屏保持的秒数；总时长 = out+hold+in。' },
        { name: 'in_time', type: 'float', desc: '从纯色屏淡入新画面的时长', math: '新画面 alpha 0→1 的秒数。' },
        {
          name: 'color',
          type: 'Color',
          desc: '中间色屏颜色，默认 "#000"（黑），可改 "#fff" 做白场',
          math: 'RGB 颜色字面量；改 "#fff" 即白场闪切，改 "#3a2f55" 即彩色情绪场。',
        },
      ],
      preview: { kind: 'fadeIn' },
    },
    {
      id: 'flash',
      name: 'flash',
      cn: '闪白（高光闪烁）',
      syntax: 'define flash = Fade(0.1, 0.0, 0.5, color="#fff")\nwith flash',
      desc: '定义一个极短的淡出白场 + 较长淡入，制造「闪光 / 镜头反光 / 顿悟」般的瞬间爆白效果。它本身是 Fade 的定制实例。',
      principle:
        'Flash 就是 Fade 的偏置实例：out_time 极短(0.1)使画面瞬间被白场吞没，hold_time=0 不停留，in_time 较长(0.5)让画面从白中缓缓显形。爆白一瞬 + 缓慢回神，正是「强光 / 顿悟 / 记忆闪回」的生理观感。',
      scenario: '镜头反光、魔法释放、记忆闪回、角色猛然醒悟、被打到眼冒金星的瞬间。',
      brief: '极短白场爆白 + 缓慢回神，强化冲击/顿悟。',
      params: [
        { name: 'color', type: 'Color', desc: '闪光颜色，默认白色 "#fff"', math: '任意 Color；改红即血色爆闪，改青即电流感。' },
      ],
      preview: { kind: 'flash' },
    },
    {
      id: 'pixellate',
      name: 'Pixellate',
      cn: '像素化',
      syntax: 'with pixellate   # 或 Pixellate(0.5, 20)',
      syntax2: 'with Pixellate(0.5, 20, reverse=True)',
      desc: '先把旧画面像素块化放大、再像素化收束到新画面，营造「信号故障 / 回忆 / 魔法变形」的块状过渡。',
      principle:
        'Pixellate 把画面按「像素块」重采样：每个 block（边长 = 2^step 像素）取块内一像素代表整块，形成马赛克。转场分两程：第一程旧画面 block 从 1px 增至 steps 级（越来越糊），到极点瞬间换图，第二程新画面 block 从 steps 级缩回 1px（越来越清晰），最终显出清晰新图。',
      scenario: '信号干扰、监控画面、魔法变形/变身、记忆模糊化、赛博故障美学。',
      brief: '块状马赛克先放大糊掉旧图，再收束清晰出新图。',
      params: [
        { name: 'time', type: 'float', desc: '单程（退出或进入）像素化时长', math: '每程时长（秒）；总时长 ≈ 2×time。' },
        {
          name: 'steps',
          type: 'int',
          desc: '每方向像素步进级数，越大块越明显',
          math: '块边长 = 2^step 像素。step=4 → 16px 块；step=20 已在 8 位上限附近，块极大。',
        },
        { name: 'reverse', type: 'bool', desc: '是否反转（先清晰→糊→清晰 还是 糊→清晰→糊）', math: 'True 时从最糊开始收束，适合「画面拼合成形」。' },
      ],
      preview: { kind: 'pixellate' },
    },
    {
      id: 'pause',
      name: 'Pause',
      cn: '停顿（纯停留）',
      syntax: 'with Pause(1.0)',
      desc: '不切换画面，仅把新画面原样保持 delay 秒。常用于 MultipleTransition 序列中制造「呼吸感」停顿。',
      principle:
        'Pause 是一个「什么都不做」的转场：它直接将传入的新场景原样显示，并阻塞 delay 秒后才结束。在多重转场序列中，它充当视觉标点，让前后两段转场之间留出静默呼吸。',
      scenario: '多重转场编排里的「停顿标点」，或单纯想让某一幕多停留一会儿再继续。',
      brief: '保持当前画面静止 delay 秒，不做任何视觉变化。',
      params: [{ name: 'delay', type: 'float', desc: '新画面保持的秒数', math: '阻塞时长（秒），纯等待。' }],
      preview: { kind: 'concept', text: 'Pause 仅让当前画面静止保持若干秒，无视觉变化——可在多重转场序列中作为「标点」使用。' },
    },
    {
      id: 'multiple-transition',
      name: 'MultipleTransition',
      cn: '多重转场序列',
      syntax: 'with MultipleTransition([None, dissolve, "a", wipeleft, "b"])',
      desc: '接收一个交替排列的列表【场景、转场、场景、转场…】，按顺序连续播放多个转场，实现复杂编排（如「先溶解→停顿→再擦除」）。',
      principle:
        '列表是「场景, 转场, 场景, 转场 …」交替结构。None 表示沿用当前画面；字符串("a"/"b"…)是「暂停点标记」，可配合交互等待。引擎依次取出(场景,转场,场景)三元组，每段转场把前一个场景过渡到下一个场景，串成连续编排。',
      scenario: '需要「多个转场接力」表现复杂情绪推进时，例如「溶解淡出 → 停顿 → 擦除进入回忆」。',
      brief: '把多段转场「串接播放」，场景与转场交替排列。',
      params: [
        { name: 'args', type: 'list', desc: '奇数项为场景（None 表示沿用当前），偶数项为转场', math: '长度须为奇数；索引 0,2,4… 是场景，1,3,5… 是转场。' },
      ],
      preview: { kind: 'concept', text: '多重转场 = 把多段转场「串接播放」。点击后请连续观察：溶解 → 停留 → 擦除 的编排效果。' },
    },
    {
      id: 'compose-transition',
      name: 'ComposeTransition',
      cn: '组合转场',
      syntax: 'ComposeTransition(dissolve, before=flash, after=pixellate)',
      desc: '最多组合三段转场：先对旧/新画面应用 before/after，再将结果交给主转场 trans，适合把「闪白+溶解+像素化」叠成一次华丽切换。',
      principle:
        '组合时序：先用 before 转场处理旧画面 → 主转场 trans 在 before 的结果与新画面间过渡 → 用 after 转场处理新画面。三段串行叠加，等价于把三个独立转场「前后包裹」成一次复合切换。',
      scenario: '想一次性做出「华丽复合切换」而不在脚本里写三行 with 时，例如 boss 登场、世界线变动。',
      brief: 'before → 主转场 → after 三段串行叠加成复合切换。',
      params: [
        { name: 'trans', type: 'Transition', desc: '主转场', math: '核心过渡，夹在前后置之间。' },
        { name: 'before', type: 'Transition?', desc: '施加于旧画面的前置转场', math: '先对旧图做；可为 None。' },
        { name: 'after', type: 'Transition?', desc: '施加于新画面的后置转场', math: '最后对新图做；可为 None。' },
      ],
      preview: { kind: 'concept', text: '组合转场把 before / 主转场 / after 三段叠加。预览中以「闪白 + 溶解」示意其叠加观感。' },
    },
    {
      id: 'alpha-dissolve',
      name: 'AlphaDissolve',
      cn: 'Alpha 遮罩溶解',
      syntax: 'with AlphaDissolve("mask.png", 1.0)',
      syntax2: 'with AlphaDissolve("heart.png", 2.0, reverse=True)',
      desc: '用一张「控制图」的透明度决定溶解形状：控制图不透明处先显示新画面，透明处后显示——可做出心形、星形等非矩形溶解。',
      principle:
        'AlphaDissolve 取控制图(control)的 alpha 通道作为「显形进度图」：把 alpha 归一化到 0~1，再按 ramplen 做斜坡平滑，得到每个像素的阈值 t(x,y)。新图像素仅在 t(x,y) ≤ 全局进度 p 时显形。于是随 p 从 0→1，新图按控制图形状「长」出来。',
      scenario: '想做非矩形的艺术化揭示：心形 dissolves、星形、文字轮廓、墨迹晕开等。',
      brief: '按控制图透明度形状「长」出非矩形溶解。',
      params: [
        { name: 'control', type: 'Displayable', desc: '作为遮罩的控制图（用其 alpha 通道）', math: 'alpha=1 处先显形，alpha=0 处最后显形。' },
        { name: 'delay', type: 'float', desc: '转场时长', math: '全局进度 p: 0→1 的秒数。' },
        { name: 'reverse', type: 'bool', desc: '是否反转遮罩明暗关系', math: 'True 时 alpha=0 处先显形。' },
        { name: 'mipmap', type: 'bool?', desc: '是否对控制图做 mipmap 平滑', math: 'True 缓解小图放大锯齿，更柔的边。' },
      ],
      preview: { kind: 'iris', mode: 'in' },
    },
    {
      id: 'image-dissolve',
      name: 'ImageDissolve',
      cn: '图像控制溶解',
      syntax: 'with ImageDissolve("wipe.png", 1.0, ramplen=8)',
      syntax2: 'with ImageDissolve("cloud.png", 2.0, ramplen=16, reverse=True)',
      desc: '类似 AlphaDissolve，但按控制图的灰度（亮度）决定溶解顺序：白像素先溶入、黑像素最后溶入，可做「由亮到暗渐次显现」。',
      principle:
        '与 AlphaDissolve 唯一区别：阈值来自控制图的「亮度(luminance)」而非 alpha。把亮度归一 0~1 得阈值 t(x,y)；全局进度 p 从 0→1 时，t(x,y) ≤ p 的像素先溶入。白色区域(p 小即显)先出现，黑色区域最后出现——可做「由亮部向暗部」的渐次显形。',
      scenario: '想做「光从亮处铺开」的溶解：晨光洒落、灯光渐亮、由明到暗的梦境浮现。',
      brief: '按控制图亮度决定溶入顺序，亮部先显。',
      params: [
        { name: 'image', type: 'Displayable', desc: '控制图（用其亮度决定溶解顺序）', math: '亮度高(白)→先溶入；亮度低(黑)→最后溶入。' },
        { name: 'time', type: 'float', desc: '转场时长', math: '全局进度 p: 0→1 的秒数。' },
        { name: 'ramplen', type: 'int', desc: '溶解斜坡长度，越大过渡越柔', math: '相邻阈值的过渡带宽（像素级灰度），越大边界越柔。' },
        { name: 'reverse', type: 'bool', desc: '反转溶解方向', math: 'True 时暗部先显、亮部最后。' },
      ],
      preview: { kind: 'wipe', dir: 'right' },
    },
    {
      id: 'swing',
      name: 'Swing',
      cn: '翻转门（旋屏切换）',
      syntax: 'with Swing(1.0)',
      syntax2: 'with Swing(0.8, vertical=True, background="#222")',
      desc: '把旧画面像门板一样旋转 90° 露出边缘，换上新画面后再旋回 90° 展平，营造「翻页 / 开门」式的立体切换。',
      principle:
        'Swing 沿某条边（默认左边缘，vertical 时上边缘）做 rotateY（或 rotateX）90° 旋转：旧画面转离视线露出 background 纯色背板，此时悄悄换上新画面，再反向旋回 90° 展平。两程旋转共用 delay 的一半时长，于是像门板开合一样切换。',
      scenario: '翻页、开门、揭示秘密房间、章节书页翻动等「立体开合」切换。',
      brief: '旧画面绕边旋 90° 露出背板换图，再旋回展平。',
      params: [
        { name: 'delay', type: 'float', desc: '总时长', math: '每程旋转 ≈ delay/2 秒。' },
        { name: 'vertical', type: 'bool', desc: 'true 则上下翻，false 左右翻', math: 'false→绕左边缘 rotateY；true→绕上边缘 rotateX。' },
        { name: 'reverse', type: 'bool', desc: '是否反向旋转', math: '反转旋转方向，换图在另一侧发生。' },
        { name: 'background', type: 'Color', desc: '翻转时露出的背景色', math: '门板背后的纯色，默认黑。' },
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
      syntax2: 'with CropMove(1.0, "wiperight")',
      desc: '像用一块「刮板」把新画面按指定方向擦出来：旧画面不动，新画面被一条边界 progressively 揭示。对应 CropMove 的 wipe* 模式。',
      principle:
        'wipe 的几何本质是「裁剪盒(crop)滑动」。以 wiperight 为例：新画面的裁剪盒初始为 inset(0 100% 0 0)（完全裁掉），随进度把右边界从 100% 推到 0%，于是新图从左向右逐列显形，旧图始终在底层不动——像刮板把新图刮出来。',
      scenario: '地图展开、画卷铺陈、机器人扫描、信息载入等「逐段揭示」的科技/叙事感。',
      brief: '裁剪盒滑移，新图沿方向逐列/逐行显形，旧图不动。',
      params: [{ name: 'mode', type: "'wiperight' 等", desc: '擦除方向', math: '决定裁剪盒哪条边移动及移动方向。' }],
      preview: { kind: 'wipe', dir: 'right' },
    },
    {
      id: 'slideright',
      name: 'slideleft / slideright / slideup / slidedown',
      cn: '滑入',
      syntax: 'with slideright',
      syntax2: 'with CropMove(0.8, "slideright")',
      desc: '新画面从指定方向滑入覆盖旧画面（旧画面保持不动）。对应 CropMove 的 slide* 模式。',
      principle:
        'slide 让「整张新画面」作为一个刚体从屏外平移进场：初始位置偏移 100%（如 slideright 初始在屏幕右侧外），随进度平移到 (0,0) 正位，完全覆盖旧图。旧画面不参与运动，仅被覆盖。',
      scenario: '新场景「推门而入」、UI 面板滑入、整屏内容替换，强调「新东西进来」。',
      brief: '整张新画面从屏外平移进场覆盖旧图。',
      params: [{ name: 'mode', type: "'slideright' 等", desc: '滑入方向', math: '决定初始偏移方向（左/右/上/下 屏外）与平移方向。' }],
      preview: { kind: 'slide', dir: 'right', mode: 'in' },
    },
    {
      id: 'slideawayright',
      name: 'slideawayleft / slideawayright / slideawayup / slideawaydown',
      cn: '滑出',
      syntax: 'with slideawayright',
      syntax2: 'with CropMove(0.8, "slideawayright")',
      desc: '旧画面朝指定方向滑出离场，露出其后的新画面。对应 CropMove 的 slideaway* 模式。',
      principle:
        'slideaway 与 slide 相反：旧画面作为刚体从正位平移到屏外（如 slideawayright 从正位移出到右侧外），新画面一开始就在底层正位等待。旧图离场后新图完整显露。',
      scenario: '旧场景「退场离去」、角色走出画面、镜头跟随离去的背影，强调「旧东西离开」。',
      brief: '旧画面整体平移出屏外，露出底层新图。',
      params: [{ name: 'mode', type: "'slideawayright' 等", desc: '滑出方向', math: '决定旧图离场方向（移出到哪侧屏外）。' }],
      preview: { kind: 'slide', dir: 'right', mode: 'out' },
    },
    {
      id: 'pushright',
      name: 'pushleft / pushright / pushup / pushdown',
      cn: '推挤',
      syntax: 'with pushright',
      syntax2: 'with PushMove(0.8, "pushright")',
      desc: '新画面「推」着旧画面一同朝指定方向离场——两者联动位移，像推开门板。对应 PushMove 的 push* 模式。',
      principle:
        'push 与 slide 的关键区别：新旧两图「绑定同速位移」。如 pushright：新图从左侧屏外进场，同时旧图被推着向右移出右侧屏外，两者位移量相等、方向相反的相对运动，形成「新推旧走」的联动门板观感。',
      scenario: '强调「新场景挤走旧场景」的对冲：时代更替、对手登场逼退主角、空间被占据。',
      brief: '新旧两图同速反向联动，新推着旧一起离场。',
      params: [{ name: 'mode', type: "'pushright' 等", desc: '推动方向', math: '决定位移轴与方向；两图速度大小相等。' }],
      preview: { kind: 'push', dir: 'right' },
    },
    {
      id: 'iris',
      name: 'irisin / irisout',
      cn: '虹膜（矩形开合）',
      syntax: 'with irisout',
      syntax2: 'with CropMove(1.0, "irisout")',
      desc: '从一个矩形光圈（角落）展开(irisin)或收束(irisout)到全屏，如同摄影机光圈或「聚焦」动画。对应 CropMove 的 iris* 模式。',
      principle:
        'iris 用裁剪盒从「角落一个点」(0×0) 放大到全屏(100%)（irisin），或反向收束（irisout）。本质是裁剪盒四边同时从角落向外扩张/向内收缩，于是一个矩形光圈开合，像摄影机光圈或聚焦框。',
      scenario: '聚焦某物、镜头推近、回忆「聚焦」出现、游戏里「进入某界面」的框选感。',
      brief: '矩形裁剪盒从角落点放大/收束，如摄影机光圈。',
      params: [{ name: 'mode', type: "'irisin' / 'irisout'", desc: '展开或收束', math: 'irisin: 盒 0→满；irisout: 盒 满→0。' }],
      preview: { kind: 'iris', mode: 'out' },
    },
    {
      id: 'blinds',
      name: 'blinds',
      cn: '百叶窗',
      syntax: 'with blinds',
      syntax2: 'with ImageDissolve("blinds.png", 1.0)',
      desc: '用一组垂直条带逐条揭开新画面，形如百叶窗开合。底层为 ImageDissolve 的条带控制图实例。',
      principle:
        'blinds 是 ImageDissolve 的特例：控制图是一组垂直黑白条纹，每条纹内亮度从全黑到全白渐变。随进度 p，每条纹按自身亮度阈值独立显形，于是新图被「一条条竖条」逐次揭开，形如百叶窗叶片依次打开。',
      scenario: '复古 UI、侦探窥视、机关开启、遮掩揭开、恶作剧式「偷偷看」。',
      brief: '垂直条纹控制图，新图被一条条竖条逐次揭开。',
      params: [],
      preview: { kind: 'blinds' },
    },
    {
      id: 'squares',
      name: 'squares',
      cn: '方块揭示',
      syntax: 'with squares',
      syntax2: 'with ImageDissolve("squares.png", 1.0)',
      desc: '把画面切成方格，逐格随机/顺序揭示新画面，制造「像素拼图 / 故障重组」质感。',
      principle:
        'squares 是 ImageDissolve 的方格控制图：把画面划分成 N×N 方格，每格内亮度按「离中心的距离」渐变。随进度 p，离中心近的格先显形、远的格后显形（或反之），形成由内向外的方格拼合，像像素拼图重组。',
      scenario: '故障美学、数据重组、魔法阵凝聚、监控画面拼合、游戏过场「像素化生成」。',
      brief: '方格控制图按距离逐格显形，像素拼图式重组。',
      params: [],
      preview: { kind: 'squares' },
    },
    {
      id: 'cropmove-class',
      name: 'CropMove',
      cn: '裁剪位移转场（基类）',
      syntax: 'CropMove(1.0, "slideright")',
      syntax2: 'CropMove(1.0, "custom", startcrop=(0,0,1,1), startpos=(1,0), endcrop=(0,0,1,1), endpos=(0,0))',
      desc: '所有 wipe/slide/slideaway/iris 的底层基类。通过 startcrop/startpos/endcrop/endpos 等参数，可自定义任意「裁剪盒 + 位移」转场（mode="custom"）。',
      principle:
        'CropMove 对任意显示件施加「裁剪盒(crop) + 位置(pos)」的动画。它在转场起止两端各定义一组 (crop, pos)：startcrop/startpos 是进入画面的初始裁剪与位置，endcrop/endpos 是结束态。引擎在 time 内把 crop/pos 从 start 线性插值到 end，于是既裁剪又移动。内置模式(wiperight/…)只是预设了这些端点。',
      scenario:
        '当你需要官方没提供的「奇葩几何转场」（斜向、缩放式擦拭、自定义 iris 形状）时，用 mode="custom" 手写端点。',
      brief: '转场基类：对 crop+pos 做线性插值，custom 可手写任意几何。',
      params: [
        { name: 'time', type: 'float', desc: '时长', math: 'crop/pos 从 start→end 的插值秒数。' },
        { name: 'mode', type: 'str', desc: "wipe*/slide*/slideaway*/iris*/custom 之一", math: '预设端点；custom 时由下方参数自定义。' },
        { name: 'startcrop', type: '(4)tuple', desc: '起始裁剪盒 (x,y,w,h)', math: '坐标相对图自身，(0,0,1,1) 表示整图。' },
        { name: 'startpos', type: '(2)tuple', desc: '起始位置偏移', math: '相对正位的位置偏移，如 (1,0) 表示右移一整屏。' },
        { name: 'endcrop', type: '(4)tuple', desc: '结束裁剪盒', math: '结束态裁剪，通常 (0,0,1,1) 显全图。' },
        { name: 'endpos', type: '(2)tuple', desc: '结束位置偏移', math: '结束态位置，通常 (0,0) 正位。' },
      ],
      renpyClass: true,
      preview: { kind: 'slide', dir: 'left', mode: 'in' },
    },
    {
      id: 'pushmove-class',
      name: 'PushMove',
      cn: '推挤转场（基类）',
      syntax: 'PushMove(1.0, "pushright")',
      syntax2: ' PushMove(0.6, "pushup")',
      desc: '推挤类转场的基类，新画面推着旧画面离场。mode 支持 pushright/left/up/down。',
      principle:
        'PushMove 是 CropMove 的「双图联动」特化：它对旧图和新图同时施加等大反向位移（新图 startpos=屏外、endpos=正位；旧图 startpos=正位、endpos=屏外），speed 一致，于是新推旧走紧耦合。',
      scenario: '需要自定义推挤时长/方向（非官方预设 pushright 等）时使用其基类。',
      brief: 'CropMove 双图联动特化，新推旧走等大反向。',
      params: [
        { name: 'time', type: 'float', desc: '时长', math: '双图位移的秒数。' },
        { name: 'mode', type: 'str', desc: 'pushright/left/up/down', math: '决定位移轴与方向。' },
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
      syntax2: 'show eileen at left with move',
      desc: '当同一 tag 的立绘位置发生变化时，用 0.5 秒把旧位置平滑插值到新位置。最常用于「角色从左边走到右边」。',
      principle:
        'move 是一类「位置补间转场」：它比较同一 tag 立绘的「旧摆位」与「新摆位」（由 at 子句决定），在 0.5s 内用默认缓动把立绘从旧坐标线性插值到新坐标。前提是新旧两帧是同一 tag（同一角色），才会触发补间而非硬切。',
      scenario: '角色在同一场景内走动：从左边走到右边、从远处走近、换座位等。',
      brief: '同一角色新旧摆位间 0.5s 平滑位移补间。',
      params: [],
      preview: { kind: 'move', dir: 'right', mode: 'in' },
    },
    {
      id: 'moveinright',
      name: 'moveinleft / right / top / bottom',
      cn: '移入',
      syntax: 'with moveinright',
      syntax2: 'show eileen at center with moveinleft',
      desc: '让「新出现」的立绘从指定屏幕外缘滑入到目标位置；已在场的立绘则不参与。MoveTransition 的进入变体。',
      principle:
        'movein* 是 move 的「只进不出」变体：它假设立绘「之前不在场」，于是让它从指定屏外缘（left/right/top/bottom）平移进场到 at 指定的目标位置。已在场的其它 tag 不参与。',
      scenario: '角色第一次登场、从门外走进、从屏幕侧边滑入亮相。',
      brief: '新立绘从指定屏外缘滑入到目标机位。',
      params: [{ name: 'side', type: "'right' 等", desc: '从哪个方向进入', math: '决定初始屏外偏移方向。' }],
      preview: { kind: 'move', dir: 'right', mode: 'in' },
    },
    {
      id: 'moveoutright',
      name: 'moveoutleft / right / top / bottom',
      cn: '移出',
      syntax: 'with moveoutright',
      syntax2: 'hide eileen with moveoutleft',
      desc: '让「即将隐藏」的立绘朝指定屏幕外缘滑出离场。MoveTransition 的离开变体。',
      principle:
        'moveout* 是 move 的「只出不进」变体：把当前在场的立绘朝指定屏外缘平移离场后 hide。常用于 hide 语句的 with，让退场也有动画。',
      scenario: '角色离场走去、退出对话、被「请出去」的滑出动作。',
      brief: '在场立绘朝指定屏外缘滑出后退场。',
      params: [{ name: 'side', type: "'right' 等", desc: '朝哪个方向离场', math: '决定离场偏移方向。' }],
      preview: { kind: 'move', dir: 'right', mode: 'out' },
    },
    {
      id: 'easeinright',
      name: 'easein* / easeout*（缓动移动族）',
      cn: '余弦缓动移入 / 移出',
      syntax: 'with easeinright',
      syntax2: 'with easeoutbottom',
      desc: '与 movein*/moveout* 类似，但使用余弦缓动曲线（先慢后快再慢），进出更有「重量感」。涵盖 easein/out + left/right/top/bottom 共 8 种。',
      principle:
        'easein*/easeout* 在 movein*/moveout* 基础上把默认缓动换成「余弦缓动(ease)」：其速度曲线首尾柔、中间快，于是移动带「重量感」与惯性，比线性 move 更自然拟人。',
      scenario: '想让角色走动带「惯性/重量」而非匀速机械感时，用缓动移动族。',
      brief: '余弦缓动版的移入/移出，带重量感与惯性。',
      params: [{ name: 'variant', type: 'str', desc: 'easeinleft/right/top/bottom、easeoutleft/right/top/bottom', math: '8 种组合，决定方向 + 进/出 + 缓动。' }],
      preview: { kind: 'move', dir: 'left', mode: 'in' },
    },
    {
      id: 'move-transition',
      name: 'MoveTransition',
      cn: '移动转场（基类）',
      syntax: 'MoveTransition(0.5, time_warp=_warper.ease)',
      syntax2: 'define flyin = MoveTransition(0.5, enter=offscreen_right, leave=warp_out)',
      desc: 'move / movein* / moveout* / ease* 的底层类。可自定义进入/离开变换与缓动，甚至用 move_transitions() 批量生成整族。',
      principle:
        'MoveTransition 把「位置补间」抽象成类：它接受 enter/leave 两个 Transform（定义进场/离场的位移变换）和 time_warp（缓动函数）。move/movein*/moveout*/ease* 都只是给它预设了不同的 enter/leave 与 time_warp。',
      scenario: '需要自定义移动轨迹（弧形、带旋转进场）或批量生成整族移动转场时。',
      brief: '移动转场基类：enter/leave 变换 + time_warp 缓动。',
      params: [
        { name: 'delay', type: 'float', desc: '补间时长', math: '位置插值秒数，默认 0.5。' },
        { name: 'enter', type: 'Transform?', desc: '进入立绘的变换', math: '定义新立绘从哪来、怎么进。' },
        { name: 'leave', type: 'Transform?', desc: '离开立绘的变换', math: '定义旧立绘去哪、怎么走。' },
        { name: 'time_warp', type: 'warper', desc: '缓动函数', math: '位置随时间的曲线，决定惯性感。' },
      ],
      renpyClass: true,
      preview: { kind: 'move', dir: 'left', mode: 'out' },
    },
    {
      id: 'move-transitions',
      name: 'move_transitions()',
      cn: '移动转场批量生成器',
      syntax: 'move_transitions("fly", 0.5)',
      syntax2: 'move_transitions("fly", 0.5, time_warp=_warper.ease)',
      desc: '一行批量定义一整族 MoveTransition（fly、fly_inleft/right/top/bottom、fly_outleft/right/top/bottom），避免手动逐个声明。',
      principle:
        'move_transitions(prefix, delay) 是一个工厂函数：它内部循环四个方向，用 MoveTransition 批量构造并 define 出 prefix、prefix_in*、prefix_out* 共 9 个转场名。本质是「代码生成代码」，省去手写 9 条。',
      scenario: '想一次性拥有整族带统一风格的移动转场（如全部带缓动或带旋转）时使用。',
      brief: '工厂函数：一行批量生成 9 个方向化移动转场。',
      params: [
        { name: 'prefix', type: 'str', desc: '生成转场名的前缀', math: '生成 prefix / prefix_in* / prefix_out*。' },
        { name: 'delay', type: 'float', desc: '时长', math: '整族统一的补间秒数。' },
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
      syntax2: 'show bg city with zoomin',
      desc: '进入的立绘从较小尺寸放大到目标尺寸，制造「登场 / 强调」的推近感。',
      principle:
        'zoomin 是「缩放补间转场」：进入画面初始 zoom 小于 1（较小），在约 0.5s 内放大插值到目标 zoom=1，配合 zoom 专用缓动(zoomin 曲线)产生「推近登场」的镜头感。',
      scenario: '角色/背景「推近登场」、强调某物出现、镜头怼脸的戏剧化切入。',
      brief: '进入画面从小放大到原大，推近登场感。',
      params: [],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 'zoomout',
      name: 'zoomout',
      cn: '缩小离场',
      syntax: 'with zoomout',
      syntax2: 'hide eileen with zoomout',
      desc: '离开的立绘缩小淡出，制造「退场 / 远去」的拉远感。',
      principle:
        'zoomout 与 zoomin 相反：离开画面从 zoom=1 缩小到小于 1 并淡出，配合 zoomout 缓动曲线，像被镜头拉远、渐渐远去消逝。',
      scenario: '角色远去退场、物体飞走变小、回忆「缩远」淡出。',
      brief: '离场画面缩小淡出，拉远远去感。',
      params: [],
      preview: { kind: 'zoom', mode: 'out' },
    },
    {
      id: 'zoominout',
      name: 'zoominout',
      cn: '放大进入 + 缩小离场',
      syntax: 'with zoominout',
      syntax2: 'show hero at center with zoominout',
      desc: '同时让进入立绘放大、离开立绘缩小，对比强烈，常用于「角色替换登场」。',
      principle:
        'zoominout 同时施加两段缩放：新画面 zoomin（放大进场），旧画面 zoomout（缩小离场），两者并发，形成「一新一旧、一进一退」的强烈对比替换。',
      scenario: '角色「替换登场」（新角色顶掉旧角色）、变身前后对比、重要人物切换。',
      brief: '新放大进场 + 旧缩小离场，强烈对比替换。',
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
      syntax2: 'with hpunch  # 配合 show 抖动整屏',
      desc: '让整个画面在水平方向快速抖动 0.25 秒，像被从侧面猛击一拳，强调冲击。',
      principle:
        'hpunch 是一个「整屏 Transform 抖动」转场：它在约 0.25s 内对根显示件施加一条水平位移关键帧（0 → -δ → +δ → -δ/2 → 0，δ≈屏幕宽 3%），指数衰减。整屏随之左右猛颤，像被侧击。',
      scenario: '被扇耳光、爆炸冲击波、重击、突然的惊吓/打断。',
      brief: '整屏水平方向指数衰减抖动 0.25s，侧击感。',
      params: [],
      preview: { kind: 'shake', axis: 'h' },
    },
    {
      id: 'vpunch',
      name: 'vpunch',
      cn: '垂直猛击（纵震屏）',
      syntax: 'with vpunch',
      syntax2: 'with vpunch',
      desc: '让整个画面在垂直方向快速抖动 0.25 秒，如地震、重击落地、剧烈惊吓。',
      principle:
        'vpunch 与 hpunch 同构，只是位移轴换为垂直方向：在 0.25s 内对根显示件施加垂直位移关键帧（指数衰减），整屏上下猛颤，如地震或落地重击。',
      scenario: '地震、重物落地、从上劈下的重击、剧烈颠簸。',
      brief: '整屏垂直方向指数衰减抖动 0.25s，地震感。',
      params: [],
      preview: { kind: 'shake', axis: 'v' },
    },
    {
      id: 'shake',
      name: 'Shake',
      cn: '自定义抖动',
      syntax: 'transform shake:\n    on show: Shake((0,0,0,0), "sprite.png", 1.0, 10)',
      syntax2: 'Shake((0, 0, 100, 100), "eileen concerned", 0.5, 20)',
      desc: '比 hpunch/vpunch 更可控的抖动变换工厂：可指定抖动幅度(围绕某锚点的偏移盒)、时长与次数，做持续颤动（如恐惧、寒颤、引擎轰鸣）。',
      principle:
        'Shake(offset, child, delay, strength) 创建一个 Transform：它以「随机偏移」方式持续扰动 child。offset 是一个 (x,y,w,h) 盒，每帧从该盒内随机取 (dx,dy) 加到 child 位置上；strength 缩放抖动强度；delay 是总时长。于是立绘在盒内高频随机抖动。',
      scenario: '角色恐惧寒颤、受伤发抖、引擎轰鸣、飞机颠簸、紧张等待。',
      brief: '在 (x,y,w,h) 盒内随机高频扰动 child，可控制时长强度。',
      params: [
        { name: 'offset', type: '(4)tuple', desc: '抖动的最大偏移盒 (x,y,w,h)', math: '每帧随机位移范围；w,h 越大抖得越狠。' },
        { name: 'child', type: 'Displayable', desc: '被抖动的显示件', math: '施加抖动的立绘/图层。' },
        { name: 'delay', type: 'float', desc: '总时长', math: '抖动持续秒数。' },
        { name: 'strength', type: 'float', desc: '抖动强度', math: '对 offset 的缩放倍率；越大抖幅越大。' },
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
      syntax2: 'show eileen at Position(xpos=0.5, ypos=1.0)',
      desc: '相对父容器左上角的位置。xpos/ypos 单独设置横/纵；pos 同时设置两者。值是 position 类型（浮点表示比例，absolute 表示像素）。',
      principle:
        'pos 是变换的「摆放坐标」，相对父容器（通常是整屏）的左上角原点。position 类型很灵活：浮点 0.0~1.0 表示「占父容器宽/高的比例」，absolute(n) 表示「绝对像素」。xpos/ypos 分别控制横/纵，pos=(x,y) 一次设两个。',
      scenario: '精确摆位、自定义机位、做「镜头扫到某坐标」的补间动画。',
      brief: '相对父容器左上角的坐标，浮点=比例、absolute=像素。',
      params: [{ name: 'pos', type: 'position', desc: '横纵坐标', math: '浮点 0~1 为比例；absolute(n) 为像素；pos=(x,y)。' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-align',
      name: 'align / xalign / yalign',
      cn: '对齐锚点定位',
      syntax: 'xalign 0.5 yalign 1.0',
      syntax2: 'show eileen at Align(0.5, 1.0)',
      desc: '同时把「位置」与「锚点」设为同一值，最直观的定位方式：xalign=0.5 即水平居中。等价于 pos 与 anchor 同值。',
      principle:
        'align=(ax,ay) 是一个语法糖：它同时设 pos=(ax,ay) 且 anchor=(ax,ay)。anchor 是立绘自身的「悬挂点」比例，pos 是悬挂点要落到的父容器坐标。两者同值 → 立绘的该比例点精确对齐父容器的该比例点（如 0.5,1.0 = 脚底中点对齐屏幕底部）。',
      scenario: '最常用摆位方式：居中、贴底、对齐某比例点，比 pos 直觉。',
      brief: 'pos 与 anchor 同值，让立绘该比例点对齐父容器该比例点。',
      params: [{ name: 'align', type: '(float,float)', desc: '0~1 的对齐比例', math: 'ax=xpos=xanchor，ay=ypos=yanchor。' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-anchor',
      name: 'anchor / xanchor / yanchor',
      cn: '锚点',
      syntax: 'anchor (0.5, 1.0)',
      syntax2: 'xanchor 0.5 yanchor 0.5',
      desc: '立绘自身的「悬挂点」：旋转、缩放都绕此点进行。anchor=(0.5,1.0) 表示以「底部中心」为基准，常用作立绘脚底对齐。',
      principle:
        'anchor 定义立绘「自身坐标系里的基准点」比例（0,0=左上，0.5,0.5=中心，0.5,1.0=脚底中点）。所有 rotate/scale/position 都围绕这个点运算：position 把 anchor 点放到父容器坐标，rotate/scale 绕 anchor 旋转缩放。改 anchor 等于改「立绘的重心」。',
      scenario: '让立绘绕脚底旋转（而非中心）、绕某特征点缩放、脚底贴地对齐。',
      brief: '立绘自身基准点，旋转/缩放/定位都绕它进行。',
      params: [{ name: 'anchor', type: 'position', desc: '立绘内部锚点比例', math: '(0,0)左上 (0.5,0.5)中心 (0.5,1.0)脚底。' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-offset',
      name: 'offset / xoffset / yoffset',
      cn: '像素偏移',
      syntax: 'xoffset 40',
      syntax2: 'linear 0.5 xoffset 20',
      desc: '在已定位基础上再叠加像素级偏移（正向右/下），常用于轻微抖动或「说话时前倾」。与 pos 不同，它不受比例缩放影响。',
      principle:
        'offset 是「在最终定位之后额外平移」的像素量（absolute 像素，不受父容器比例/缩放影响）。它叠加在 pos/anchor 计算出的位置之上，因此做「呼吸前倾」「轻微晃动」时不会干扰主定位，也不会被缩放扭曲。',
      scenario: '说话时立绘微微前倾、强调时的轻微位移、叠加在 at 机位上的微调。',
      brief: '定位之后再叠加的绝对像素平移，不受缩放影响。',
      params: [{ name: 'offset', type: 'absolute', desc: '像素偏移量', math: '正向右/下；xoffset/yoffset 分别控制。' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-center',
      name: 'xycenter / xcenter / ycenter',
      cn: '中心定位',
      syntax: 'xcenter 0.5',
      syntax2: 'xycenter (0.5, 0.5)',
      desc: '把立绘「自身中心」放到指定坐标（等价于 pos + anchor=(0.5,0.5)），定位直觉、旋转缩放都稳。',
      principle:
        'xcenter/ycenter 是「把立绘中心对齐到某坐标」的便捷写法：内部等价于设 anchor=(0.5,0.5) 再设 pos=(xcenter,ycenter)。因为中心被锚定，后续 rotate/scale 都绕中心，视觉最稳定。',
      scenario: '需要「立绘中心精准落在某点」且之后要旋转/缩放时，比 pos 更稳。',
      brief: '锚定立绘中心到指定坐标，旋转缩放都绕中心。',
      params: [{ name: 'center', type: 'position', desc: '立绘中心目标坐标', math: '等价 anchor=(0.5,0.5)+pos=(cx,cy)。' }],
      preview: { kind: 'position' },
    },
    {
      id: 'tf-subpixel',
      name: 'subpixel',
      cn: '亚像素定位',
      syntax: 'subpixel True',
      syntax2: 'transform s:\n    subpixel True\n    linear 1.0 xpos 1.0',
      desc: '开启后用亚像素级精度绘制，移动时边缘更顺滑、不锯齿跳动；移动方向上需保留透明边距以避免被裁。',
      principle:
        '默认 Ren\'Py 把位置四舍五入到整数像素绘制，慢速移动时边缘会「一格一格跳」。subpixel=True 时保留小数像素坐标做插值绘制，于是边缘平滑滑动。代价是需预留透明边距，否则旋转/放大会被裁剪盒切边。',
      scenario: '慢速平移、细线移动、任何「不想看到像素跳格」的位移动画。',
      brief: '保留小数像素绘制，移动更顺滑，但需留透明边距。',
      params: [{ name: 'subpixel', type: 'bool', desc: '是否启用亚像素', math: 'True=小数坐标插值绘制，抗跳格。' }],
      preview: { kind: 'concept', text: 'subpixel 是「渲染精度」开关，本身无动画画面；开启后让位移/旋转更顺滑、边缘不抖。' },
    },
    {
      id: 'tf-polar',
      name: 'around / angle / radius（极坐标）',
      cn: '极坐标定位',
      syntax: 'around (0.5,0.5)\nlinear 2.0 angle 360',
      syntax2: 'radius 0.3\nlinear 1.0 angle 180',
      desc: '用「起点 + 角度 + 半径」描述位置，特别适合圆周运动（绕某点旋转一圈）。angle 0°指正上、90°指正右，自动归一到 0~360。',
      principle:
        '极坐标把「位置」表达为 (around 圆心, angle 角度, radius 半径)：最终坐标 = around + (radius·sin(angle), -radius·cos(angle))（angle=0 指向正上）。angle 以度计，引擎自动归一到 0~360。它让「绕点公转」变得只需插值 angle，比手算 x/y 方便得多。',
      scenario: '绕中心旋转的 UI、行星公转、圆周入场、指针/罗盘类动画。',
      brief: '用 (圆心,角度,半径) 描述位置，绕点公转只需插值 angle。',
      params: [
        { name: 'around', type: '(pos,pos)', desc: '极坐标起点（圆心）', math: '极坐标的原点坐标。' },
        { name: 'angle', type: 'float', desc: '角度（度）', math: '0=正上,90=正右；自动 0~360 归一。' },
        { name: 'radius', type: 'position', desc: '半径', math: '到圆心的距离，position 类型。' },
      ],
      preview: { kind: 'polar' },
    },
    {
      id: 'tf-polar-anchor',
      name: 'anchoraround / anchorangle / anchorradius',
      cn: '锚点极坐标',
      syntax: 'anchoraround (0.5,0.5)\nanchorangle 180',
      syntax2: 'anchorradius 0.2\nanchorangle 90',
      desc: '与极坐标同理，但作用于「锚点」而非「位置」——让立绘围绕某点公转时，自身悬挂点也随之旋转。',
      principle:
        'anchoraround/anchorangle/anchorradius 把极坐标机制搬到 anchor 上：anchor 点绕某圆心做圆周运动。于是立绘「公转」时自身悬挂点也跟着转，适合做「绕点旋转且自身朝向圆心」的效果。',
      scenario: '卫星绕行星（且卫星始终某点朝外）、绕轴旋转的挂件。',
      brief: '极坐标作用于锚点，让自身悬挂点也绕圆心公转。',
      params: [
        { name: 'anchoraround', type: '(pos,pos)', desc: '锚点极坐标起点', math: '锚点公转圆心。' },
        { name: 'anchorangle', type: 'float', desc: '锚点角度', math: '锚点绕圆心的角度（度）。' },
        { name: 'anchorradius', type: 'position', desc: '锚点半径', math: '锚点到圆心的距离。' },
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
      syntax2: 'rotate 0\nlinear 0.5 rotate 180',
      desc: '顺时针旋转指定角度（度）。配合 rotate_pad 可避免旋转时尺寸抖动；transform_anchor 可改旋转中心。',
      principle:
        'rotate 是绕 anchor（默认中心 (0.5,0.5)）的 2D 平面旋转，角度以度计（正为顺时针，从正上起算）。旋转会改变立绘外接包围盒，若 rotate_pad=False 且旋转后超出原盒，可能被裁；rotate_pad=True 时 Ren\'Py 用正方形外接框包裹，尺寸恒定。',
      scenario: '自转装饰、强调时的甩头、技能 CD 环、转场中的旋转元素。',
      brief: '绕 anchor 顺时针旋转（度），rotate_pad 防裁切抖动。',
      params: [{ name: 'rotate', type: 'float?', desc: '旋转角度，None 表示不旋转', math: '度；正=顺时针；None=复位不旋转。' }],
      preview: { kind: 'rotate', deg: 360 },
    },
    {
      id: 'tf-rotate-pad',
      name: 'rotate_pad',
      cn: '旋转留白',
      syntax: 'rotate_pad True',
      syntax2: 'transform r:\n    rotate_pad True\n    rotate 45',
      desc: '为旋转后的显示件补足成「正方形外接框」，使其在旋转全程尺寸恒定、不忽大忽小。固定角度旋转时可设为 False 取最小包围盒。',
      principle:
        '旋转后立绘的 AABB 包围盒会随角度变化（45° 时最大）。rotate_pad=True 时 Ren\'Py 始终把包围盒按「外接正方形」预留，于是旋转全程占用空间不变、不抖动；设 False 则取当前角度的最小包围盒，省空间但旋转时尺寸会脉动。',
      scenario: '持续自转、任意角度旋转（要尺寸稳定）时开 True；固定单角度且想省边距时 False。',
      brief: 'True=正方形外接框，旋转尺寸恒定不抖动。',
      params: [{ name: 'rotate_pad', type: 'bool', desc: '是否补齐外接正方形', math: 'True=恒尺寸；False=最小包围盒。' }],
      preview: { kind: 'rotate', deg: 45 },
    },
    {
      id: 'tf-transform-anchor',
      name: 'transform_anchor',
      cn: '变换锚点跟随',
      syntax: 'transform_anchor True',
      syntax2: 'transform r:\n    transform_anchor True\n    linear 1.0 rotate 360',
      desc: '开启后，锚点落在「被裁剪后的子图」上，并随缩放/旋转一起移动——等于把锚点变成立绘真正的「旋转缩放中心」。',
      principle:
        '默认 anchor 是相对「未变换子图」的固定比例点，旋转/缩放时该点位置可能漂移。transform_anchor=True 让 anchor 跟随「经裁剪/变换后的实际子图」走，于是旋转缩放中心稳定地落在立绘真实几何中心，避免「转着转着偏心」。',
      scenario: '想让立绘严格绕自身真实中心旋转/缩放（尤其带 crop 时）。',
      brief: '让锚点跟随裁剪后子图，旋转缩放中心更稳。',
      params: [{ name: 'transform_anchor', type: 'bool', desc: '是否启用', math: 'True=锚点随变换后子图走。' }],
      preview: { kind: 'rotate', deg: 360 },
    },
    {
      id: 'tf-zoom',
      name: 'zoom',
      cn: '整体缩放',
      syntax: 'linear 0.5 zoom 1.2',
      syntax2: 'zoom 1.0\nlinear 1.0 zoom 0.8',
      desc: '统一缩放立绘（因子，1.0 为原大）。与 xzoom/yzoom 不同，zoom 保持宽高比。',
      principle:
        'zoom 是等比缩放因子：最终尺寸 = 原尺寸 × zoom，宽高同乘，比例不变。zoom=1 原大，>1 放大，<1 缩小。它内部等价于 xzoom=yzoom=zoom。',
      scenario: '推近强调、物体放大缩小、呼吸式胀缩、镜头 zoom 模拟。',
      brief: '等比缩放因子，宽高同乘，保持比例。',
      params: [{ name: 'zoom', type: 'float', desc: '缩放因子', math: '1=原大；>1 放大；<1 缩小；等价 xzoom=yzoom。' }],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 'tf-xzoom',
      name: 'xzoom / yzoom（含翻转）',
      cn: '单向缩放 / 翻转',
      syntax: 'xzoom -1   # 水平翻转',
      syntax2: 'yzoom 0.8   # 仅纵向压扁',
      desc: '分别控制水平/垂直缩放。**负值即翻转**：xzoom=-1 是水平镜像（常用于角色「转身面向另一边」），yzoom=-1 是垂直镜像。',
      principle:
        'xzoom/yzoom 分别乘到宽/高方向。它们与 zoom 独立：可 xzoom=1.2,yzoom=0.8 做非等比拉伸。关键特性：负值=镜像翻转——xzoom=-1 把立绘水平镜像，常用于「角色转身背对/面向」（用一张素材左右翻转即可，省一套素材）。',
      scenario: '角色转身（水平镜像）、非等比压扁拉伸、朝向翻转。',
      brief: '分别缩放宽/高；负值即镜像翻转（xzoom=-1 转身）。',
      params: [{ name: 'xzoom/yzoom', type: 'float', desc: '缩放因子，负值=翻转', math: '1=原;>1放大;<1缩小;-1=镜像翻转。' }],
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
      syntax2: 'alpha 1.0\nlinear 0.5 alpha 0.0',
      desc: '控制立绘整体不透明度（0 全透、1 不透明）。逐子图独立应用，重叠子图叠加时可能透视——可用 Flatten() 规避。',
      principle:
        'alpha 是「整体不透明度乘子」，最终像素 alpha = 子图原 alpha × alpha 属性。它逐子图独立应用：若一个立绘由多层子图叠成，各自 alpha 相乘后才合成，重叠处可能透出下层。需要整体统一半透明时用 Flatten() 先压平。',
      scenario: '淡入淡出、半透明幽灵、梦境虚化、叠加合成前的透明度控制。',
      brief: '整体不透明度乘子，逐子图独立，重叠可能透视。',
      params: [{ name: 'alpha', type: 'float', desc: '不透明度 0~1', math: '0=全透,1=不透明,最终 alpha=原×此值。' }],
      preview: { kind: 'alpha' },
    },
    {
      id: 'tf-additive',
      name: 'additive',
      cn: '叠加发光',
      syntax: 'additive 1.0',
      syntax2: 'linear 0.5 additive 0.0',
      desc: '设为 1.0 时用「加色混合(ADD)」绘制，产生霓虹/魔法发光感；0.0 用普通覆盖(OVER)。对半透明区域做光晕特别有用。',
      principle:
        'additive 切换混合方程：默认 OVER 是「覆盖」（上层盖下层）；additive=1 时改用 ADD（结果色 = 下层 + 上层，按通道相加并钳制）。于是亮部越叠越亮、暗部近乎透明，产生霓虹/魔法辉光；0 恢复正常覆盖。',
      scenario: '魔法光效、霓虹灯、能量护盾、发光粒子、赛博辉光。',
      brief: 'ADD 加色混合，亮部越叠越亮，霓虹/辉光感。',
      params: [{ name: 'additive', type: 'float', desc: '加色强度 0~1', math: '0=OVER 覆盖;1=ADD 加色;中间为混合权重。' }],
      preview: { kind: 'additive' },
    },
    {
      id: 'tf-nearest',
      name: 'nearest',
      cn: '最近邻采样',
      syntax: 'nearest True',
      syntax2: 'image eileen = "eileen.png"\nnearest True',
      desc: 'True 用最近邻（硬边、像素风）滤波，False 用双线性（平滑）。像素艺术/复古风必备；默认继承父级或 config。',
      principle:
        'nearest 控制纹理采样的「放大滤波」：True 用最近邻（取最近像素，放大显硬边、像素块清晰），False 用双线性（插值平滑、放大糊）。像素艺术必须开 True 否则一放大就糊；写实图一般 False。',
      scenario: '像素风立绘/素材、复古游戏质感、刻意硬边放大。',
      brief: 'True=最近邻硬边像素风，False=双线性平滑。',
      params: [{ name: 'nearest', type: 'bool?', desc: '是否最近邻', math: 'True=硬边;False=平滑;None=继承父级。' }],
      preview: { kind: 'concept', text: 'nearest 是像素采样方式开关（硬边 vs 平滑），无动态画面；对像素风立绘开启可避免缩放模糊。' },
    },
    {
      id: 'tf-blur',
      name: 'blur',
      cn: '模糊',
      syntax: 'linear 0.5 blur 8',
      syntax2: 'blur 0\nlinear 1.0 blur 12',
      desc: '把立绘按指定像素半径模糊（如梦、失焦、景深、回忆）。模糊会先把子图展平到透明底再处理。',
      principle:
        'blur 对显示件做高斯模糊，半径(像素)越大越糊。实现上 Ren\'Py 先把子图展平(flatten)到透明背景再卷积，因此半透明边缘也能正确模糊。常用于失焦、梦境、景深、回忆的柔化。',
      scenario: '失焦/出神、梦境回忆、景深虚化、转场柔化、朦胧氛围。',
      brief: '高斯模糊，半径越大越糊，先展平再卷积。',
      params: [{ name: 'blur', type: 'float?', desc: '模糊半径（像素），None=不模糊', math: '像素半径；0/None=清晰。' }],
      preview: { kind: 'blur' },
    },
    {
      id: 'tf-matrixcolor',
      name: 'matrixcolor',
      cn: '颜色矩阵（总属性）',
      syntax: 'matrixcolor TintMatrix("#ff8888") * SaturationMatrix(0.5)',
      syntax2: 'linear 2.0 matrixcolor BrightnessMatrix(0.0)',
      desc: '统一重着色入口，接受 4×4 Matrix 或任意 ColorMatrix 子类，可相乘组合。ATL 中做动画插值要求两端「同类型、同顺序」。',
      principle:
        'matrixcolor 是颜色处理的统一入口：它接收一个 4×4 颜色矩阵（或 ColorMatrix 子类实例），对显示件每个像素的 (R,G,B,A) 做线性变换。多个 ColorMatrix 用 × 相乘合成（矩阵乘法），如 Tint×Saturation。ATL 动画插值两矩阵要求「同类型同顺序」以保证可线性混合。',
      scenario: '任何统一重着色：情绪染色、昼夜切换、去色回忆、故障滤镜的底层。',
      brief: '4×4 颜色矩阵统一重着色入口，可相乘组合。',
      params: [{ name: 'matrixcolor', type: 'Matrix|ColorMatrix', desc: '颜色变换对象', math: '4×4 矩阵；ColorMatrix 子类可 × 组合。' }],
      preview: { kind: 'color', filter: 'saturate(0.4) hue-rotate(20deg)' },
    },
    {
      id: 'mc-brightness',
      name: 'BrightnessMatrix',
      cn: '亮度',
      syntax: 'matrixcolor BrightnessMatrix(0.3)',
      syntax2: 'matrixcolor BrightnessMatrix(-0.5)',
      desc: '整体加减亮度（不动 Alpha）。value=-1 全黑、0 不变、1 全白。常用于「灯灭 / 曝光」。',
      principle:
        'BrightnessMatrix(value) 在 RGB 上各加 value（在 0~1 色彩空间）：新色 = 原色 + value。value=-1 把所有色压到 0（全黑），0 不变，1 推到 1（全白）。Alpha 不动。',
      scenario: '关灯变黑、闪光过曝、情绪明暗调节。',
      brief: 'RGB 各加 value；-1 全黑、0 不变、1 全白。',
      params: [{ name: 'value', type: 'float', desc: '亮度增量 -1~1', math: '新色=原色+value；钳制到 [0,1]。' }],
      preview: { kind: 'color', filter: 'brightness(1.6)' },
    },
    {
      id: 'mc-contrast',
      name: 'ContrastMatrix',
      cn: '对比度',
      syntax: 'matrixcolor ContrastMatrix(1.4)',
      syntax2: 'matrixcolor ContrastMatrix(0.6)',
      desc: '调整对比度（不动 Alpha）。<1 降低、>1 增强，让画面更「硬」或更「灰」。',
      principle:
        'ContrastMatrix(v) 围绕中灰 0.5 做缩放：新色 = (原色 - 0.5) × v + 0.5。v>1 把色推向两极（更硬朗、对比强），v<1 把色拉向中灰（更灰、发雾），v=1 不变。Alpha 不动。',
      scenario: '硬派战斗滤镜、老照片灰调、强化视觉冲击。',
      brief: '绕中灰缩放：v>1 更硬、v<1 更灰。',
      params: [{ name: 'value', type: 'float', desc: '对比度倍率', math: '新色=(原-0.5)×v+0.5。' }],
      preview: { kind: 'color', filter: 'contrast(1.6)' },
    },
    {
      id: 'mc-saturation',
      name: 'SaturationMatrix',
      cn: '饱和度',
      syntax: 'matrixcolor SaturationMatrix(0.0)',
      syntax2: 'matrixcolor SaturationMatrix(1.5)',
      desc: '调整饱和度（不动 Alpha）。1=原色、0=完全灰度。desat 为去饱和时保留的三通道权重（默认按亮度 0.2126/0.7152/0.0722）。',
      principle:
        '饱和度 = 原色与「其灰度版本」的线性混合。灰度按亮度权重 desat=(0.2126,0.7152,0.0722) 计算。新色 = 原色 × v + 灰度 × (1-v)。v=1 原色，v=0 纯灰度（去色），v>1 超饱和。Alpha 不动。',
      scenario: '回忆去色、黑白闪回、强调某色时的降饱和、情绪灰调。',
      brief: '原色与灰度按 v 混合；v=0 纯灰、v=1 原色。',
      params: [
        { name: 'value', type: 'float', desc: '饱和度倍率', math: '新色=原×v+灰×(1-v)。' },
        { name: 'desat', type: '(3)tuple', desc: '去饱和保留权重', math: '默认亮度权重 (0.2126,0.7152,0.0722)。' },
      ],
      preview: { kind: 'color', filter: 'saturate(0)' },
    },
    {
      id: 'mc-hue',
      name: 'HueMatrix',
      cn: '色相旋转',
      syntax: 'matrixcolor HueMatrix(120)',
      syntax2: 'matrixcolor HueMatrix(-90)',
      desc: '把颜色绕色环旋转指定度数（不动 Alpha）。用于「换色 / 异世界滤镜 / 情绪染色」。',
      principle:
        'HueMatrix(deg) 在 RGB→HSV 的色相 H 上做旋转 deg 度（H\'=H+deg mod 360），再转回 RGB。于是整图颜色沿色环整体偏移，红变绿、绿变蓝……是实现「换色/异世界滤镜」的核心。Alpha 不动。',
      scenario: '异世界滤镜、毒气绿、魔法粉、整体换色不改明暗。',
      brief: '色相绕色环旋转 deg 度，整体换色不改动暗。',
      params: [{ name: 'value', type: 'float', desc: '旋转度数', math: 'H\'=H+deg (mod 360)。' }],
      preview: { kind: 'color', filter: 'hue-rotate(120deg)' },
    },
    {
      id: 'mc-invert',
      name: 'InvertMatrix',
      cn: '反相',
      syntax: 'matrixcolor InvertMatrix(1.0)',
      syntax2: 'matrixcolor InvertMatrix(0.5)',
      desc: '反转颜色通道（不动 Alpha）。0→1 控制反转量，1 为完全底片效果。',
      principle:
        'InvertMatrix(v) 把色相 H 旋转 180°（即 RGB 取反方向）并按 v 混合：新色 = 原色 × (1-v) + 反相色 × v。v=1 完全底片（R\'=1-R,…），v=0 不变。Alpha 不动。',
      scenario: '底片闪回、故障美学、负片印象、强烈视觉反转。',
      brief: '色相旋转 180° 并按 v 混合，v=1 全底片。',
      params: [{ name: 'value', type: 'float', desc: '反转量 0~1', math: '新色=原×(1-v)+反相×v。' }],
      preview: { kind: 'color', filter: 'invert(1)' },
    },
    {
      id: 'mc-opacity',
      name: 'OpacityMatrix',
      cn: '不透明度矩阵',
      syntax: 'matrixcolor OpacityMatrix(0.5)',
      syntax2: 'matrixcolor OpacityMatrix(0.2)',
      desc: '仅乘算 Alpha（不动颜色），与 alpha 属性等价但走矩阵通道，便于与其他矩阵组合。',
      principle:
        'OpacityMatrix(v) 把输出 Alpha 乘 v（A\'=A×v），RGB 不变。功能上等同 alpha 属性，但它是矩阵形式，可写进 matrixcolor 的乘法链里与其他 ColorMatrix 组合，统一在一处管理。',
      scenario: '需要把「透明度」也并入颜色矩阵链时（而非单独用 alpha）。',
      brief: '仅 A×v，等价 alpha，便于并入矩阵链。',
      params: [{ name: 'value', type: 'float', desc: 'Alpha 乘子 0~1', math: 'A\'=A×v。' }],
      preview: { kind: 'alpha' },
    },
    {
      id: 'mc-colorize',
      name: 'ColorizeMatrix',
      cn: '黑白着色',
      syntax: 'matrixcolor ColorizeMatrix("#000", "#f00")',
      syntax2: 'matrixcolor ColorizeMatrix("#222", "#0ff")',
      desc: '把「黑白图像」在指定黑、白两色之间重新着色（不动 Alpha），适合双色剪影 / 夜视仪绿。',
      principle:
        'ColorizeMatrix(black, white) 先把图像按亮度转成灰度 t∈[0,1]，再在 black→white 两色间线性插值上色：新色 = black×(1-t) + white×t。于是暗部染 black、亮部染 white，得到双色剪影/夜视仪效果。Alpha 不动。',
      scenario: '夜视仪绿、双色剪影、热成像、监控单色滤镜。',
      brief: '灰度在 black→white 间插值上色，双色剪影。',
      params: [
        { name: 'black_color', type: 'Color', desc: '暗部着色', math: 't=0 处颜色。' },
        { name: 'white_color', type: 'Color', desc: '亮部着色', math: 't=1 处颜色。' },
      ],
      preview: { kind: 'color', filter: 'sepia(1) saturate(2) hue-rotate(300deg)' },
    },
    {
      id: 'mc-tint',
      name: 'TintMatrix',
      cn: '整体染色',
      syntax: 'matrixcolor TintMatrix("#88ccff")',
      syntax2: 'matrixcolor TintMatrix("#ffd27f")',
      desc: '给整张图染上一层颜色（不动 Alpha），最常用于「夜晚蓝 / 回忆黄 / 危险红」的情绪统一着色。',
      principle:
        'TintMatrix(color) 让每个像素朝 color 靠拢：它本质是把原色与纯 color 按「保留亮度」的方式混合（近似于把颜色乘以 color 的 RGB 并修正亮度）。效果是整图蒙上一层该色，明暗关系基本保留。Alpha 不动。',
      scenario: '夜景蓝调、回忆暖黄、危险红晕、统一情绪染色。',
      brief: '整图蒙一层颜色，明暗保留，情绪染色。',
      params: [{ name: 'color', type: 'Color', desc: '染色颜色', math: '整图朝该色靠拢。' }],
      preview: { kind: 'color', filter: 'sepia(1) saturate(1.4) hue-rotate(190deg)' },
    },
    {
      id: 'mc-sepia',
      name: 'SepiaMatrix',
      cn: '棕褐（复古）',
      syntax: 'matrixcolor SepiaMatrix()',
      syntax2: 'matrixcolor SepiaMatrix(tint="#e9d8b0")',
      desc: '返回棕褐色调矩阵，等价于 TintMatrix("#ffeec2") * SaturationMatrix(0.0)，一键复古老照片质感。',
      principle:
        'SepiaMatrix 是「去饱和 + 棕黄染色」的固定组合：先 SaturationMatrix(0) 转灰度，再 TintMatrix 染成棕褐(#ffeec2 附近)。于是老照片/复古质感一键达成。可选 tint/desat 微调。',
      scenario: '老照片回忆、复古叙事、年代感闪回。',
      brief: '去饱和 + 棕黄染色，一键复古。',
      params: [
        { name: 'tint', type: 'Color', desc: '色调，默认 "#ffeec2"', math: '棕褐色目标。' },
        { name: 'desat', type: '(3)tuple', desc: '去饱和权重', math: '灰度亮度权重。' },
      ],
      preview: { kind: 'color', filter: 'sepia(1)' },
    },
    {
      id: 'mc-identity',
      name: 'IdentityMatrix',
      cn: '单位矩阵',
      syntax: 'matrixcolor IdentityMatrix()',
      syntax2: 'linear 1.0 matrixcolor IdentityMatrix()',
      desc: '完全不改变颜色与 Alpha 的基准矩阵，常在 ATL 插值中作为「起点/终点」占位，保证结构一致。',
      principle:
        'IdentityMatrix 是 4×4 单位阵（对角线 1，其余 0），对任意 (R,G,B,A) 作用后完全不变。它的价值在动画：当两端矩阵需「同类型同顺序」才能插值，用它作占位起点/终点保证结构一致。',
      scenario: 'ATL 颜色动画的「无变化起点/终点」占位。',
      brief: '单位阵，不改变任何颜色，动画占位用。',
      params: [],
      preview: { kind: 'concept', text: 'IdentityMatrix 是不做任何改动的基准矩阵，常用于动画起点/终点占位以保证可插值。' },
    },
    {
      id: 'mc-spline',
      name: 'SplineMatrix',
      cn: '样条矩阵插值',
      syntax: 'matrixcolor SplineMatrix(SaturationMatrix(1.0), [0,0.5,1])',
      syntax2: 'matrixcolor SplineMatrix(HueMatrix(0), [0, 0.33, 0.66, 1])',
      desc: '用样条曲线在多个矩阵之间插值，实现比线性更自然的颜色渐变（如呼吸式闪烁染色）。',
      principle:
        'SplineMatrix 用一条样条（由 control_points 定义的曲线）在「两个矩阵之间」做非线性插值。与线性插值（匀速混合）不同，样条让颜色变化有「加速-减速」的呼吸节奏，适合闪烁/脉动染色。',
      scenario: '呼吸式发光、脉动染色、需要非线性颜色过渡时。',
      brief: '样条曲线在矩阵间非线性插值，呼吸式过渡。',
      params: [
        { name: 'matrix', type: 'Matrix', desc: '目标矩阵', math: '插值终点矩阵。' },
        { name: 'spline', type: 'list', desc: '≥3 个浮点的样条控制点', math: '定义插值曲线形状。' },
      ],
      preview: { kind: 'color', filter: 'saturate(1.8)' },
    },
    {
      id: 'mc-matrix',
      name: 'Matrix（自定义 4×4）',
      cn: '裸矩阵',
      syntax: 'matrixcolor Matrix([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])',
      syntax2: 'matrixcolor Matrix([0,1,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,1])  # 交换红绿',
      desc: '用 16 个数字直接定义 4×4 颜色变换矩阵（如交换红绿通道）。需遵循预乘 Alpha 约定，否则缩放出现伪影。',
      principle:
        'Matrix 是裸 4×4 颜色变换，行优先 16 个数：[m00,m01,m02,m03, m10,…]。输出 (R\',G\',B\',A\') = M × (R,G,B,A)，其中最后一列通常是偏移、最后一行通常是 [0,0,0,1] 保 Alpha。Ren\'Py 用预乘 Alpha 约定，自定义缩放 RGB 时须同步处理 Alpha 否则边缘伪影。',
      scenario: '通道交换（红绿互调）、自定义色彩映射、高级 shader 前的颜色运算。',
      brief: '裸 4×4 矩阵，行优先，需遵循预乘 Alpha 约定。',
      params: [{ name: 'args', type: '16×float', desc: '行优先的 4×4 矩阵', math: '输出 = M×(R,G,B,A)；末行通常 [0,0,0,1]。' }],
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
      syntax2: 'linear 1.0 crop (0.0, 0.0, 1.0, 1.0)',
      desc: '把立绘裁切成指定矩形 (x,y,w,h)，坐标相对子图左上角。可超出原图（外部透明）。配合动画可做「镜头推近脸部」。',
      principle:
        'crop=(x,y,w,h) 是一个「取景框」，坐标相对子图自身宽高（浮点为比例，absolute 为像素）。只显示框内部分，框外被裁掉。动起来就是「镜头在图上平移/推近」——动画 crop 从全图 (0,0,1,1) 缩到脸部小框，即「推近特写」。',
      scenario: '镜头推近脸部特写、聚焦局部、模拟「放大看某处」。',
      brief: '取景框裁切，动画 crop 即镜头推近/平移。',
      params: [{ name: 'crop', type: '(4)tuple?', desc: '裁剪盒，None=不裁剪', math: '相对子图 (x,y,w,h)，浮点=比例。' }],
      preview: { kind: 'crop' },
    },
    {
      id: 'tf-corner',
      name: 'corner1 / corner2',
      cn: '对角裁剪',
      syntax: 'corner1 (0.2,0.0) corner2 (0.8,1.0)',
      syntax2: 'corner1 (0,0) corner2 (1,1)',
      desc: '用左上(corner1)与右下(corner2)两个对角点定义裁剪盒，比 crop 写四元组更直观。crop 优先级更高。',
      principle:
        'corner1=(x1,y1) 与 corner2=(x2,y2) 是裁剪框的两个对角点，等价 crop=(x1,y1,x2-x1,y2-y1)。写法更直观（直接给两个角）。若同时写 crop，crop 优先生效。',
      scenario: '想用「两个角点」方式直观裁切时，比四元组好读。',
      brief: '两对角点定义裁剪框，比四元组直观。',
      params: [
        { name: 'corner1', type: '(pos,pos)?', desc: '左上角', math: '裁剪框左上点。' },
        { name: 'corner2', type: '(pos,pos)?', desc: '右下角', math: '裁剪框右下点；crop 优先级更高。' },
      ],
      preview: { kind: 'crop' },
    },
    {
      id: 'tf-xysize',
      name: 'xysize / xsize / ysize',
      cn: '强制尺寸',
      syntax: 'xysize (400, 600)',
      syntax2: 'xsize 300',
      desc: '把立绘缩放到指定宽高。xsize/ysize 单独设宽/高；受 fit 属性影响（contain/cover/fill 等）。',
      principle:
        'xysize=(w,h) 强制把显示件缩放到指定像素宽高。它是「目标尺寸」声明，具体如何适配（保比例还是拉伸）由 fit 决定。xsize/ysize 单独控制一边。',
      scenario: '把不同素材统一到固定尺寸、做缩略图/统一机位大小。',
      brief: '强制缩放到指定宽高，适配方式由 fit 决定。',
      params: [{ name: 'xysize', type: '(pos,pos)?', desc: '目标宽高', math: '目标像素尺寸；配合 fit 适配。' }],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 'tf-fit',
      name: 'fit',
      cn: '适配模式',
      syntax: 'fit "cover"',
      syntax2: 'xysize (400,300) fit "contain"',
      desc: '配合 xsize/ysize 决定缩放策略：contain(含入不超界)、cover(覆盖不亏)、fill(拉伸填满)、scale-down/scale-up(单向)。',
      principle:
        'fit 决定「给定目标尺寸时如何保持比例」：contain = 等比缩到「完全装入目标框」（可能有留白）；cover = 等比缩到「覆盖整个目标框」（可能裁切溢出）；fill = 直接拉伸到目标宽高（变形）；scale-down/up = 仅缩小/仅放大版的 contain。',
      scenario: '统一不同比例素材到框内（contain）、做满屏背景（cover）、故意变形（fill）。',
      brief: 'contain 含入 / cover 覆盖 / fill 拉伸。',
      params: [{ name: 'fit', type: 'str?', desc: 'contain/cover/fill/scale-down/scale-up', math: '控制等比还是拉伸。' }],
      preview: { kind: 'concept', text: 'fit 决定「指定尺寸时如何保持比例」：contain 含入、cover 覆盖、fill 拉伸。无独立动画。' },
    },
    {
      id: 'tf-maxsize',
      name: 'maxsize',
      cn: '最大尺寸约束',
      syntax: 'maxsize (800, 600)',
      syntax2: 'maxsize (1024, 768)',
      desc: '把立绘缩放到「不超过该框」且保持比例（等价于 xysize + fit="contain"）。旧版 size 属性不推荐再用。',
      principle:
        'maxsize=(w,h) 等价于「xysize=(w,h) 且 fit=contain」：把图等比缩到「刚好塞进 w×h 框且不超界」。保证大图不会撑爆布局，同时小图不被放大（保持原大）。',
      scenario: '限制素材最大显示尺寸、响应式布局里防溢出。',
      brief: '等比缩到不超过 w×h 框，等价于 xysize+contain。',
      params: [{ name: 'maxsize', type: '(int,int)?', desc: '最大宽高框', math: '等比含入，不超界也不放大。' }],
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
      syntax2: 'linear 10.0 xpan 360',
      desc: '把一张 360° 全景图按「角度」横向/纵向平移取景（中心为 0°，左右边缘 ±180°）。做「环视四周」必备。',
      principle:
        'xpan/ypan 把显示件当成「360° 环绕贴图」，用角度定位取景窗：0° 是图中心，±180° 是左右（或上下）边缘，越界会回卷（wrap）。于是动画 xpan 从 0→360 就是「绕着全景图转一圈」，实现第一人称环视。',
      scenario: '360° 全景背景环视、天空盒漫游、第一人称转头看四周。',
      brief: '把图当 360° 环绕贴图，按角度取景，环视四周。',
      params: [{ name: 'xpan/ypan', type: 'float?', desc: '取景角度（度）', math: '0=中心,±180=边缘,越界回卷。' }],
      preview: { kind: 'pan' },
    },
    {
      id: 'tf-xtile',
      name: 'xtile / ytile',
      cn: '纹理平铺',
      syntax: 'xtile 3 ytile 2',
      syntax2: 'xtile 4',
      desc: '把图像在水平/垂直方向平铺指定次数，常用于背景花纹、雪地、重复 UI。配合 xpan 可做无限滚动。',
      principle:
        'xtile/ytile 把显示件在水平/垂直方向重复 N 次拼成网格（默认 1）。平铺的图像彼此无缝衔接，于是动画 xpan 时看起来像「无限滚动的纹理」，非常适合雪地、星空、花纹背景。',
      scenario: '无缝滚屏背景、花纹地面、星空流动、重复 UI 纹理。',
      brief: '水平/垂直平铺 N 次，配 xpan 做无限滚动。',
      params: [{ name: 'xtile/ytile', type: 'int', desc: '平铺次数，默认 1', math: '重复拼接成网格。' }],
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
  principle: string,
  scenario: string,
  brief: string,
): EffectItem => ({
  id,
  name,
  cn,
  desc,
  principle,
  scenario,
  brief,
  preview: { kind: 'ease', bezier },
})

const warpers: EffectCategory = {
  id: 'warpers',
  name: '缓动函数（Warpers）',
  icon: 'Activity',
  desc: '插值动画的「时间曲线」灵魂：决定属性从 A 到 B「怎么走」（匀速、先快后慢、回弹、弹跳）。所有 linear/ease*/Penner 族在此全集收录。',
  items: [
    warper('w-linear', 'linear', '线性', [0, 0, 1, 1], '绝对匀速，最机械、最「程序感」，适合机械/数字风。', 'linear 的进度 p(t)=t，属性值 = A + (B-A)·t，斜率恒为 1，无任何加速减速。最机械、最可预测。', '数字读数、机械运动、进度条、需要「绝对匀速」的场合。', 'p(t)=t，匀速无缓动。'),
    warper('w-ease', 'ease', '缓动（默认）', [0.25, 0.1, 0.25, 1], 'Ren\'Py 默认缓动：首尾柔、中间快，自然不突兀。', 'ease 是标准 CSS ease 贝塞尔 (0.25,0.1,0.25,1)：开头慢加速、中段最快、结尾柔减速，整体自然，是大多数补间的默认选择。', '对话移动、通用补间、不想思考缓动时的默认。', '默认贝塞尔，首尾柔中间快。'),
    warper('w-easein', 'easein', '缓入', [0.42, 0, 1, 1], '开头慢、结尾快，适合「加速离场 / 冲出」。', 'easein (0.42,0,1,1)：起点切线平缓（慢启动），终点切线陡（快速冲到终点）。适合「蓄力后加速冲出」。', '物体冲出屏幕、加速离场、发射。', '慢启动快收尾，加速冲出。'),
    warper('w-easeout', 'easeout', '缓出', [0, 0, 0.58, 1], '开头快、结尾慢，适合「减速入场 / 轻轻落下」。', 'easeout (0,0,0.58,1)：起点切线陡（瞬间快），终点切线平（缓缓到位）。适合「冲进来后轻柔落定」。', '物体减速入场、轻轻落下、柔和显形。', '快启动慢收尾，减速落定。'),
    warper('w-easeinout', 'easeinout', '缓入缓出', [0.42, 0, 0.58, 1], '两端都柔，最顺滑通用，对话/移动首选。', 'easeinout (0.42,0,0.58,1)：首尾都柔、中间快，是 ease 的「两端对称加强版」，最顺滑无突兀，对话与移动首选。', '角色走动、镜头平移、几乎所有平滑补间。', '两端柔中间快，最顺滑。'),
    warper('w-spring', 'spring', '弹簧', [0.68, -0.55, 0.27, 1.55], '带过冲回弹，像被弹簧拉到位，活泼有弹性。', 'spring 贝塞尔控制点含负值与 >1 值：进度会「冲过终点再回弹」（overshoot），模拟弹簧/阻尼振荡，活泼有弹性。', '弹窗弹出、俏皮 UI、果冻感元素。', '带过冲回弹的弹性曲线。'),
    warper('w-zoomin', 'zoomin', '缩放入场曲线', [0.34, 1.2, 0.64, 1], '专用于缩放进场的缓动（与 zoom 转场配套）。', 'zoomin (0.34,1.2,0.64,1)：中段有过冲(1.2)使缩放「先略大再回弹到目标」，配套 zoomin 转场的推近登场。', '放大登场、怼脸切入。', '中段过冲的缩放入场曲线。'),
    warper('w-zoomout', 'zoomout', '缩放离场曲线', [0.36, 0, 0.66, -0.2], '专用于缩放离场的缓动。', 'zoomout (0.36,0,-0.2 控制形状)：起步快、末端带轻微负向回弹，配套 zoomout 转场的远去感。', '缩小远去、退场消逝。', '缩放离场专用曲线。'),
    warper('w-bounce', 'bounce', '弹跳', [0.34, 1.56, 0.64, 1], '落地后多次小弹跳，俏皮、Q 弹。', 'bounce 用 >1 控制点制造「到终点后小幅回弹」，模拟物体落地的多次弹跳余韵，俏皮 Q 弹。', '小球落地、果冻 UI、俏皮元素。', '落地多次小弹跳的 Q 弹曲线。'),
    warper('w-back', 'ease_back', '回弹(Penner)', [0.68, -0.55, 0.27, 1.55], '先微退再冲过、最后回弹就位，有「蓄力感」。', 'ease_back（Penner back）：起手先反向微退（蓄力），再冲过终点，最后回弹就位，强烈「蓄力→弹出」感。', '按钮弹出、强调登场、需要存在感的进入。', '先退再冲过回弹的蓄力曲线。'),
    warper('w-bounce-p', 'ease_bounce', '弹跳(Penner)', [0.34, 1.56, 0.64, 1], '标准 Penner 弹跳曲线，落地回弹。', 'Penner 标准 bounce：精确模拟重力落地后逐次减半的弹跳衰减，比 CSS bounce 更「物理」。', '物体真实落地、弹跳球。', 'Penner 物理弹跳衰减曲线。'),
    warper('w-circ', 'ease_circ', '圆周(Penner)', [0.08, 0.82, 0.17, 1], '基于圆周函数的加速，收尾极陡。', 'ease_circ 用四分之一圆周函数，起步极缓、收尾极陡（加速度持续增大），适合「慢慢起势后骤然到位」。', '蓄力大招、能量汇聚后爆发。', '圆周加速，收尾极陡。'),
    warper('w-cubic', 'ease_cubic', '三次(Penner)', [0.65, 0, 0.35, 1], '三次缓动，比 quad 更柔。', 'ease_cubic 用三次多项式，比二次(quad)更柔更缓，起止都更克制。', '需要比 quad 更柔的通用缓动。', '三次多项式缓动，柔和。'),
    warper('w-elastic', 'ease_elastic', '弹性(Penner)', [0.68, -0.55, 0.27, 1.55], '剧烈来回震荡后归位，超有弹性张力。', 'ease_elastic 用衰减正弦叠加，进度会大幅来回震荡多次才归位，弹性张力极强，戏剧化。', '夸张登场、魔法弹簧、需要「震一下」的强调。', '大幅来回震荡后归位的弹性曲线。'),
    warper('w-expo', 'ease_expo', '指数(Penner)', [1, 0, 0, 1], '指数级加速/减速，极快起步或极柔收尾。', 'ease_expo 用指数函数，起步极快（瞬间冲出）或收尾极柔（无限趋近），对比极端。', '闪电瞬移、极速入场、柔和消散。', '指数级加速/减速，极端对比。'),
    warper('w-quad', 'ease_quad', '二次(Penner)', [0.45, 0, 0.55, 1], '二次缓动，轻量柔和。', 'ease_quad 用二次多项式，最轻量的缓入缓出，比 cubic 更「直」一点。', '轻量补间、不想太柔时的默认。', '二次缓动，轻量柔和。'),
    warper('w-quart', 'ease_quart', '四次(Penner)', [0.76, 0, 0.24, 1], '四次缓动，比 cubic 更明显。', 'ease_quart 用四次多项式，缓入缓出比 cubic 更夸张（两端更平、中间更陡）。', '需要更强缓动对比时。', '四次缓动，对比更强。'),
    warper('w-quint', 'ease_quint', '五次(Penner)', [0.83, 0, 0.17, 1], '五次缓动，最极致的缓入缓出。', 'ease_quint 用五次多项式，缓入缓出最极致，两端极平、中间极陡，最「丝滑厚重」。', '顶级丝滑补间、电影级运镜。', '五次缓动，极致丝滑。'),
    warper('w-sine', 'ease_sine', '正弦(Penner)', [0.37, 0, 0.63, 1], '正弦曲线，最平滑、最「呼吸感」。', 'ease_sine 用正弦半波，过渡最平滑无拐点，有「呼吸般」的自然感。', '呼吸动画、漂浮、轻柔往复。', '正弦曲线，最平滑呼吸感。'),
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
      principle:
        'Penner 缓动是 Robert Penner 提出的经典缓动函数族，每个基函数（back/bounce/circ/cubic/elastic/expo/quad/quart/quint/sine）都提供 in（仅缓入）、out（仅缓出）、inout（两端都缓）三种形态，共 30 种，覆盖几乎所有「加速/减速/回弹/弹跳」需求。',
      scenario: '需要精确控制「起手/收尾」缓动质感时，从 30 种 Penner 里挑最贴切的。',
      brief: '10 种基函数 × in/out/inout = 30 种 Penner 缓动。',
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
      syntax2: 'ease 1.0 alpha 0.5\npause 0.5\nease 1.0 alpha 1.0',
      desc: 'ATL 最核心的语句：在给定时长内，用某缓动把属性从当前值补间到目标值。可连续多条形成关键帧。',
      principle:
        '插值语句格式为「warper 时长 属性 目标值」：引擎记录属性当前值作为起点，按 warper 规定的时间曲线，在「时长」内把属性线性(曲线)插值到目标值。多条插值顺序执行即关键帧序列；当前值与目标值的差决定实际位移量。',
      scenario: '任何属性动画的基础：移动、淡入淡出、缩放、旋转都由它驱动。',
      brief: 'warper 时长 属性 目标值，属性按曲线补间。',
      params: [{ name: 'warper time prop value', type: '—', desc: '缓动 时长 属性 目标值', math: '属性从当前值按 warper 曲线在 time 内到 value。' }],
      preview: { kind: 'position' },
    },
    {
      id: 'atl-pause',
      name: 'pause / 数字语句',
      cn: '停顿',
      syntax: 'pause 1.0   # 或单独写 2.0',
      syntax2: 'linear 1.0 xpos 0.5\n2.0\nlinear 1.0 xpos 1.0',
      desc: '在动画时间线上暂停指定秒数（或写个裸数字）。用于关键帧之间的留白。',
      principle:
        'pause 是时间线上的「空转」：它不修改任何属性，只让动画时钟前进指定秒数。单独写一个数字（如 2.0）等价 pause 2.0。用于在两条插值之间制造留白/呼吸。',
      scenario: '关键帧之间等停顿、让一个动作「悬停」一会儿再继续。',
      brief: '时间线空转指定秒数，制造留白。',
      params: [{ name: 'time', type: 'float', desc: '暂停秒数', math: '时钟前进 time 秒，属性不变。' }],
      preview: { kind: 'concept', text: 'pause 在动画时间线上制造停顿（留白），无自身画面变化，可观察后一段动画「延迟启动」。' },
    },
    {
      id: 'atl-time',
      name: 'time',
      cn: '绝对时间点',
      syntax: 'time 2.0\n    xalign 0.5',
      syntax2: 'time 0.0 xpos 0.0\ntime 1.0 xpos 1.0',
      desc: '把后续语句「锚定」到时间线的绝对时刻（而非相对上一条之后），便于编排多轨同步。',
      principle:
        'time N 把其后的语句锚定到时间线绝对时刻 N 秒（而非「接在上一条之后」）。多条 time 语句可让不同属性在各自绝对时刻启动，便于多轨同步编排（类似关键帧的绝对时间戳）。',
      scenario: '多属性需要在「同一绝对时刻」精确对齐时（而非顺序接龙）。',
      brief: '把语句锚定到时间线绝对时刻，多轨对齐。',
      params: [{ name: 'time', type: 'float', desc: '绝对秒数', math: '后续语句从时间线第 N 秒开始。' }],
      preview: { kind: 'concept', text: 'time 2.0 让其后语句从时间线第 2 秒开始，便于多属性按绝对时刻对齐。' },
    },
    {
      id: 'atl-repeat',
      name: 'repeat',
      cn: '循环',
      syntax: 'repeat:\n    linear 1.0 rotate 360',
      syntax2: 'repeat 3:\n    linear 1.0 alpha 0.5',
      desc: '从头重复整个块（可带次数 repeat 3）。做呼吸、自转、飘浮等「永续动画」的关键。',
      principle:
        'repeat 使其后的代码块在时间线结束后「回到开头重新执行」。不带参数 = 无限循环（常用于呼吸/自转/飘浮等永续动画）；repeat N = 只重复 N 次后停止。配合 animation 语句可让每次循环时间归零。',
      scenario: '呼吸缩放、持续自转、飘浮上下、任何「永远在动」的装饰动画。',
      brief: '从头重复整个块，可带次数，做永续动画。',
      params: [{ name: 'count', type: 'int?', desc: '重复次数，省略=无限', math: '省略=∞；N=重复 N 次后停。' }],
      preview: { kind: 'loop' },
    },
    {
      id: 'atl-parallel',
      name: 'parallel',
      cn: '并行',
      syntax: 'parallel:\n    xalign 0.0 0.5\n    linear 1.0 yalign 0.0',
      syntax2: 'parallel:\n    linear 2.0 rotate 360\n    linear 1.0 alpha 0.5',
      desc: '让多个块同时执行——例如「一边左右移动、一边上下浮动」。注意同一数据块内不要同时改互相冲突的属性。',
      principle:
        'parallel 把其下多个代码块「同时启动、并行执行」。每个块独立跑自己的时间线，于是可让两个属性在同一时段各自动画（如 X 移动 + Y 浮动）。注意：不要在两个并行块里同时改「同一个属性」，会冲突（后者的时间线覆盖前者）。',
      scenario: '同时进行多轴动画：一边平移一边旋转、一边浮一边闪。',
      brief: '多块同时执行，做多轴并行动画。',
      params: [],
      preview: { kind: 'parallel' },
    },
    {
      id: 'atl-choice',
      name: 'choice',
      cn: '随机选择',
      syntax: 'choice:\n    "a.png"\n    "b.png"',
      syntax2: 'choice:\n    linear 1.0 xpos 0.0\n    linear 1.0 xpos 1.0',
      desc: '按权重随机挑选一个分支执行，做「眨眼随机 / 多套表情随机 / 自然不重复」演出。',
      principle:
        'choice 在其下的多个分支中随机选一个执行（可给每个分支加权重，默认等权）。用来做「每次播放都不一样的随机演出」：随机眨眼、随机表情、随机走位，避免机械重复。',
      scenario: '随机眨眼、随机表情、随机待机动作、自然不重复的 idle。',
      brief: '随机选一个分支执行，做不重复随机演出。',
      params: [],
      preview: { kind: 'choice' },
    },
    {
      id: 'atl-block',
      name: 'block',
      cn: '代码块',
      syntax: 'block:\n    linear 1.0 xpos 0.5',
      syntax2: 'block idle:\n    linear 2.0 rotate 0',
      desc: '把一组语句聚成可重复/可并行的单元，是 repeat/parallel/choice 的内容载体。',
      principle:
        'block 把若干 ATL 语句聚成一个「逻辑单元」，本身不改变行为，但它是 repeat/parallel/choice 的「内容容器」——这些语句需要 block 来界定作用范围。也可命名 block 便于引用。',
      scenario: '组织复杂动画结构、给 repeat/parallel/choice 提供内容范围。',
      brief: '语句容器，repeat/parallel/choice 的内容载体。',
      params: [],
      preview: { kind: 'concept', text: 'block 是组织 ATL 语句的「容器」，本身无画面，常与 repeat/parallel/choice 配合。' },
    },
    {
      id: 'atl-contains',
      name: 'contains',
      cn: '内嵌子显示件',
      syntax: 'contains "sprite.png"\ncontains:\n    ...ATL...',
      syntax2: 'contains:\n    linear 1.0 rotate 360',
      desc: '在变换内嵌一个子显示件（并独立施加 ATL）。可用于「立绘内部再叠一个飘动的光效」。',
      principle:
        'contains 在当前变换「内部」挂载一个子显示件（可以是图像，也可以是一个带 ATL 的 block）。子件拥有独立的 ATL 时间线，于是可让「立绘上再叠一个独立动画的光效/表情」，父子层级清晰。',
      scenario: '立绘上叠加局部动效（飘动光点、独立表情）、层级化动画。',
      brief: '在当前变换内嵌子显示件并独立动画。',
      params: [],
      preview: { kind: 'concept', text: 'contains 把一个子显示件嵌入当前变换并独立动画，适合「立绘上叠加局部动效」。' },
    },
    {
      id: 'atl-function',
      name: 'function',
      cn: 'Python 函数驱动',
      syntax: 'function my_anim',
      syntax2: 'function particles.update',
      desc: '调用 Python 函数 (trans, st, at) -> delay|None 逐帧驱动变换，实现算法化动画（粒子、物理、逐像素）。',
      principle:
        'function 把动画控制权交给一个 Python 函数：引擎每帧调用 fn(trans, st, at)，传入变换对象、显示时间 st、动画时间 at，函数返回「下一帧间隔 delay」（或 None 表示结束）。这能实现任意算法化动画（粒子、物理、逐像素），是 ATL 的「终极逃生舱」。',
      scenario: '粒子系统、物理模拟、逐像素算法、任何声明式 ATL 做不到的复杂动画。',
      brief: '把动画交给 Python 逐帧函数，实现算法化动画。',
      params: [{ name: 'func', type: 'callable', desc: '接收 transform/time 并返回延迟', math: '返回 delay=下一帧间隔；None=结束。' }],
      preview: { kind: 'concept', text: 'function 把动画交给 Python 逐帧函数驱动，可实现任意算法化效果（粒子、物理）。' },
    },
    {
      id: 'atl-on',
      name: 'on',
      cn: '事件处理器',
      syntax: 'on show,hide:\n    linear 0.5 alpha 1.0',
      syntax2: 'on hover:\n    linear 0.2 zoom 1.1',
      desc: '响应 show/hide/hover/idle 等事件时执行对应动画块，做「出场/入场/悬停反馈」的状态机。',
      principle:
        'on 是 ATL 的「事件状态机」：当指定事件（show/hide/hover/idle/ 或自定义事件名，可逗号并列多个）发生时，执行对应 block。于是立绘可在「被 show 时淡入、被 hide 时淡出、hover 时放大」，行为随状态自动切换。',
      scenario: '出场/入场动画、按钮悬停反馈、立绘状态切换。',
      brief: '事件触发时执行对应动画块，做状态机。',
      params: [{ name: 'event', type: 'str', desc: '事件名（可逗号并列）', math: 'show/hide/hover/idle/自定义事件。' }],
      preview: { kind: 'loop' },
    },
    {
      id: 'atl-event',
      name: 'event',
      cn: '发出事件',
      syntax: 'event "arrived"',
      syntax2: 'event "step"',
      desc: '在动画某时刻主动发出一个命名事件，供外层 on 或 Python 监听，做跨层联动。',
      principle:
        'event "name" 在动画时间线的当前时刻「广播」一个命名事件。外层 on 语句或 Python 可监听该事件，于是动画能主动「通知外界」（如走到某步触发音效/对话），实现跨层联动编排。',
      scenario: '动画走到关键帧时触发音效/对话/外部逻辑。',
      brief: '在时间点广播命名事件，供 on/Python 监听联动。',
      params: [{ name: 'name', type: 'str', desc: '事件名', math: '广播的命名事件标识。' }],
      preview: { kind: 'concept', text: 'event 在动画中广播命名事件，供 on 语句 / Python 监听，实现跨层编排。' },
    },
    {
      id: 'atl-with',
      name: 'with',
      cn: '转场嵌套',
      syntax: 'contains "a.png" with dissolve',
      syntax2: 'show eileen at t with dissolve',
      desc: '在切换显示件时套用一次转场（如 contains 换图时 dissolve），让子层切换也丝滑。',
      principle:
        'with 在「显示件发生切换」的时机套用一次转场。最常见于 contains 换子图时（如 contains "a.png" with dissolve 让子图切换也 dissolve），让本层切换不再硬切、同样丝滑。',
      scenario: '子层换图也要转场、嵌套显示件切换需柔化。',
      brief: '显示件切换时套用转场，子层也丝滑。',
      params: [{ name: 'transition', type: 'Transition', desc: '嵌套转场', math: '作用于本次显示件切换。' }],
      preview: { kind: 'dissolve' },
    },
    {
      id: 'atl-pass',
      name: 'pass',
      cn: '空操作',
      syntax: 'pass',
      syntax2: 'pass  # 占位',
      desc: '占位空语句（no-op），用于对齐结构或预留扩展，不改变任何属性。',
      principle:
        'pass 是空操作：它不修改任何属性、不消耗额外时间，仅作为语法占位。常用于对齐 if/choice 分支结构、预留将来扩展点。',
      scenario: '结构对齐、占位预留，无视觉效果。',
      brief: '空操作占位，不改变画面。',
      params: [],
      preview: { kind: 'concept', text: 'pass 是空操作占位语句，不改变画面，常用于结构对齐。' },
    },
    {
      id: 'atl-animation',
      name: 'animation',
      cn: '动画时间基',
      syntax: 'animation\nlinear 1.0 xpos 1.0',
      syntax2: 'animation\nrepeat:\n    linear 1.0 rotate 360',
      desc: '声明该变换使用「动画时间基(at)」而非「显示时间基(st)」，使其在循环/重播时时间归零，避免续播错位。',
      principle:
        '默认 ATL 用「显示时间基 st」（自显示起累计）。加入 animation 语句后改用「动画时间基 at」：每次循环/重播都从 at=0 重新计时，避免「续播错位」（如 repeat 时卡在半途）。对 repeat/循环动画几乎必加。',
      scenario: 'repeat 循环动画、需要每次重播都从头开始时不串帧。',
      brief: '改用动画时间基，循环/重播时时间归零防串帧。',
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
    { id: 'bi-center', name: 'center', cn: '居中', syntax: 'show eileen at center', desc: '水平居中、与屏幕底部对齐，最常用的立绘机位。', principle: 'center 等价于 align (0.5, 1.0)：立绘中心横坐标对齐屏幕中线，脚底(anchor y=1)对齐屏幕底部。', scenario: '绝大多数对话立绘的默认站位。', brief: '水平居中 + 脚底贴底。', preview: { kind: 'position' } },
    { id: 'bi-left', name: 'left', cn: '左下', syntax: 'show eileen at left', desc: '对齐屏幕左下角。', principle: 'left = align (0.0, 1.0)：左边缘贴屏幕左，脚底贴底。', scenario: '双人对话时的「左位」。', brief: '左边缘贴左 + 脚底贴底。', preview: { kind: 'position' } },
    { id: 'bi-right', name: 'right', cn: '右下', syntax: 'show eileen at right', desc: '对齐屏幕右下角。', principle: 'right = align (1.0, 1.0)：右边缘贴屏幕右，脚底贴底。', scenario: '双人对话时的「右位」。', brief: '右边缘贴右 + 脚底贴底。', preview: { kind: 'position' } },
    { id: 'bi-top', name: 'top', cn: '顶中', syntax: 'show eileen at top', desc: '水平居中、与屏幕顶部对齐（适合俯视/招牌）。', principle: 'top = align (0.5, 0.0)：水平居中，顶部(anchor y=0)贴屏幕顶。', scenario: '俯视角色、头顶招牌、悬挂物。', brief: '水平居中 + 顶部贴顶。', preview: { kind: 'position' } },
    { id: 'bi-topleft', name: 'topleft', cn: '左上', syntax: 'show eileen at topleft', desc: '对齐屏幕左上角。', principle: 'topleft = align (0.0, 0.0)：左上角对齐屏幕左上。', scenario: '角落 UI、角落立绘。', brief: '左上角对齐。', preview: { kind: 'position' } },
    { id: 'bi-topright', name: 'topright', cn: '右上', syntax: 'show eileen at topright', desc: '对齐屏幕右上角。', principle: 'topright = align (1.0, 0.0)：右上角对齐屏幕右上。', scenario: '角落 UI、角落立绘。', brief: '右上角对齐。', preview: { kind: 'position' } },
    { id: 'bi-truecenter', name: 'truecenter', cn: '绝对中心', syntax: 'show eileen at truecenter', desc: '水平与垂直都居中（含中心点），适合特写/重要画面。', principle: 'truecenter = align (0.5, 0.5)：立绘中心对齐屏幕正中心，而非脚底贴底。', scenario: '特写、CG 感画面、重要人物居中。', brief: '中心对齐屏幕正中。', preview: { kind: 'position' } },
    { id: 'bi-offleft', name: 'offscreenleft', cn: '屏外左', syntax: 'show eileen at offscreenleft', desc: '放到屏幕左侧之外（与底对齐），用于「从画外走进来」的起点。', principle: 'offscreenleft 把立绘放到屏幕左边缘之外（xpos 略小于 0），脚底贴底，作为 moveinright 的入场起点。', scenario: '角色从画外走进来的起点站位。', brief: '屏幕左外，作入场起点。', preview: { kind: 'move', dir: 'right', mode: 'in' } },
    { id: 'bi-offright', name: 'offscreenright', cn: '屏外右', syntax: 'show eileen at offscreenright', desc: '放到屏幕右侧之外，用于「向画外走去」的终点。', principle: 'offscreenright 把立绘放到屏幕右边缘之外，脚底贴底，作为 moveoutright 的离场终点。', scenario: '角色向画外走去的终点站位。', brief: '屏幕右外，作离场终点。', preview: { kind: 'move', dir: 'right', mode: 'out' } },
    { id: 'bi-default', name: 'default', cn: '默认变换', syntax: 'config.default_transform = ...', desc: 'show/scene 的默认摆放变换（默认等同 center），可全局重定义改变所有登场机位。', principle: 'config.default_transform 是每次 show/scene 未指定 at 时使用的变换，默认等同 center。重写它可全局改变所有立绘的默认登场机位。', scenario: '想让全项目立绘默认就站某个机位时，改这个配置。', brief: '全局默认登场变换，默认=center。', preview: { kind: 'position' } },
    { id: 'bi-reset', name: 'reset', cn: '重置变换', syntax: 'show eileen at reset', desc: '把所有变换属性还原为默认值、清除之前设置的属性，相当于「清空叠加状态」。', principle: 'reset 是一个「归零」变换：它把所有 transform 属性（pos/rotate/zoom/alpha/matrixcolor…）还原为默认值，清除历史叠加——相当于舞台的「清屏重启」，防止属性残留叠加。', scenario: '切换机位/重设姿态前先复位，避免上一轮变换残留污染。', brief: '把所有变换属性还原默认，清空叠加状态。', preview: { kind: 'concept', text: 'reset 把变换属性全部还原默认、清除历史叠加，无独立画面——可观察立绘瞬间回到初始姿态。' } },
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
      syntax2: 'transform t:\n    perspective 800.0',
      desc: '开启 3D 舞台并设置视距（越小透视越夸张）。开启后子显示件才能用 xrotate/yrotate/zrotate 做真三维旋转。',
      principle:
        'perspective 开启 3D 渲染并设定「视距 d」（相机到 z=0 平面的距离，单位像素）。它建立透视投影：远处(z 大)的物体看起来小，近处(z 小)看起来大。d 越小透视越夸张（广角），越大越接近正交（平）。开启后子件才能用 x/y/zrotate 做真三维旋转。',
      scenario: '任何真三维旋转/景深效果的前提，卡牌翻面、立体 UI。',
      brief: '开启 3D 并设视距，越小透视越夸张。',
      params: [{ name: 'perspective', type: 'float?', desc: '视距，None=关闭 3D', math: 'd=相机到 z=0 距离；越小透视越强。' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-matrixtransform',
      name: 'matrixtransform',
      cn: '三维变换矩阵',
      syntax: 'matrixtransform rotate_matrix',
      syntax2: 'matrixtransform ScaleMatrix(2.0, 1.0, 1.0)',
      desc: '用 4×4 矩阵对显示件做三维变换（旋转/平移/缩放），与 matrixanchor 配合确定变换中心。',
      principle:
        'matrixtransform 接收一个 4×4 三维变换矩阵，对显示件做「真三维」变换（绕任意轴旋转、平移、缩放）。它与 2D 的 matrixcolor 不同：后者只改颜色，前者改几何。配合 matrixanchor 确定变换绕哪个点进行。',
      scenario: '自定义三维旋转/倾斜、3D 翻转、GPU 级几何变换。',
      brief: '4×4 三维变换矩阵，做真三维几何变换。',
      params: [{ name: 'matrixtransform', type: 'Matrix?', desc: '三维变换矩阵', math: '4×4；绕 matrixanchor 作用。' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-matrixanchor',
      name: 'matrixanchor',
      cn: '三维变换锚点',
      syntax: 'matrixanchor (0.5, 0.5)',
      syntax2: 'matrixanchor (0.0, 1.0)',
      desc: '三维变换的「旋转/缩放中心」点，默认 (0.5,0.5) 即中心。',
      principle:
        'matrixanchor 是三维变换的「支点」比例（相对显示件自身）。默认 (0.5,0.5) 即绕中心变换；改成 (0,1) 则绕脚底旋转。它决定 matrixtransform 的变换中心。',
      scenario: '想让 3D 旋转绕特定点（如脚底、边缘）进行时。',
      brief: '三维变换支点，默认中心。',
      params: [{ name: 'matrixanchor', type: '(pos,pos)', desc: '锚点比例', math: '变换绕此点进行。' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-xrotate',
      name: 'xrotate / yrotate / zrotate',
      cn: '三维旋转（三轴）',
      syntax: 'xrotate 45 yrotate 30',
      syntax2: 'linear 2.0 zrotate 360',
      desc: '分别绕 X/Y/Z 轴做三维旋转，需先开启 perspective。zrotate 等价于 2D 的 rotate。可做「卡牌翻面 / 立体翻转」。',
      principle:
        '三个轴旋转：xrotate 绕水平横轴（前后翻，如抬头/低头），yrotate 绕垂直纵轴（左右转，如转身），zrotate 绕屏幕法向（等同 2D rotate，平面自旋）。都要先开 perspective 才有真三维透视。组合即任意三维朝向。',
      scenario: '卡牌翻面、书本翻开、立体转身、3D 翻转 UI。',
      brief: '绕 X/Y/Z 三轴真三维旋转，需 perspective。',
      params: [{ name: 'xrotate/yrotate/zrotate', type: 'float', desc: '绕各轴旋转角度', math: '度；zrotate 等价 2D rotate。' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-orientation',
      name: 'orientation',
      cn: '欧拉朝向',
      syntax: 'orientation 0.0 0.0 0.0',
      syntax2: 'orientation 30.0 45.0 0.0',
      desc: '用 (x,y,z) 欧拉角一次性设置三维朝向，是 xrotate/yrotate/zrotate 的便捷组合。',
      principle:
        'orientation (x,y,z) 是 xrotate/yrotate/zrotate 的「一次性打包」：内部等价于同时设三个轴角度，方便用一组欧拉角表达最终三维朝向，免去分写三条。',
      scenario: '想用一组欧拉角直接设定最终三维姿态时。',
      brief: 'x/y/z 欧拉角一次性设定三维朝向。',
      params: [{ name: 'orientation', type: '(3)float', desc: 'X/Y/Z 欧拉角', math: '等价同时设 x/y/zrotate。' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-point-to',
      name: 'point_to',
      cn: '朝向某点',
      syntax: 'point_to (0.5, 0.5)',
      syntax2: 'point_to (1.0, 0.0)',
      desc: '让显示件「正面」自动转向指定坐标点，常用于 3D 场景里角色始终面向镜头或目标。',
      principle:
        'point_to (x,y) 自动计算「让显示件正面法线指向目标点 (x,y)」所需的 orientation，于是立绘/模型始终「看向」该点。常用于 3D 场景角色面向镜头或面向交互目标。',
      scenario: '3D 场景里角色始终面向镜头/目标、billboard 效果。',
      brief: '自动转向使正面指向目标点。',
      params: [{ name: 'point_to', type: '(pos,pos)', desc: '目标坐标', math: '立绘正面法线指向该点。' }],
      preview: { kind: 'rotate3d' },
    },
    {
      id: 's-zpos-zzoom',
      name: 'zpos / zzoom',
      cn: '深度位置 / 深度缩放',
      syntax: 'zpos 0.2 zzoom 1.1',
      syntax2: 'linear 1.0 zpos 0.5',
      desc: '在 3D 舞台中设置沿 Z 轴的深度位置与深度缩放，制造「前后景层次 / 推拉镜头」。',
      principle:
        'zpos 是显示件沿 Z 轴（景深）的位置：zpos 越大离相机越远（在 perspective 下显得越小，且可被前景遮挡）；zzoom 是「沿 Z 的缩放因子」，放大/缩小景深感。二者配合做推拉镜头与前后景层次。',
      scenario: '3D 推拉镜头、前后景层次、景深调度。',
      brief: 'Z 轴深度位置与深度缩放，做推拉与层次。',
      params: [{ name: 'zpos', type: 'float', desc: 'Z 深度', math: '沿景深位置；越大越远越小。' }, { name: 'zzoom', type: 'float', desc: 'Z 方向缩放', math: '景深方向的缩放因子。' }],
      preview: { kind: 'zoom', mode: 'in' },
    },
    {
      id: 's-mesh',
      name: 'mesh / mesh_pad',
      cn: '网格化（GPU 渲染）',
      syntax: 'mesh True',
      syntax2: 'mesh True mesh_pad True',
      desc: '把显示件转为 GPU 模型网格，使其能应用自定义 shader / 矩阵变换。mesh_pad 控制是否在边缘留透明边距以避免采样越界。',
      principle:
        'mesh=True 把 2D 显示件「三角化」成 GPU 模型网格（顶点+纹理），于是能用 shader 做逐像素/逐顶点特效，或用 matrixtransform 做真三维变换。mesh_pad=True 在网格边缘留透明边距，防止 shader 采样越界产生黑边。',
      scenario: '需要 shader 特效（水波/故障/发光）或真三维变换前的必要前提。',
      brief: '转为 GPU 网格，是 shader/3D 变换的前提。',
      params: [{ name: 'mesh', type: 'bool', desc: '是否网格化', math: 'True=转 GPU 模型网格。' }, { name: 'mesh_pad', type: 'bool', desc: '是否留透明边距', math: 'True=边缘留透明防采样越界。' }],
      preview: { kind: 'concept', text: 'mesh/mesh_pad 把显示件转为 GPU 模型网格，是应用 shader/矩阵变换的前提，本身无独立画面。' },
    },
    {
      id: 's-shader',
      name: 'shader / blend',
      cn: '着色器 / 混合模式',
      syntax: 'shader "shaders.example"',
      syntax2: 'shader "shaders.water" blend "add"',
      desc: '指定 GLSL 着色器实现自定义渲染（水波、故障、像素风等）；blend 设置混合方程（如加法发光）。是 Ren\'Py 特效的「终极武器」。',
      principle:
        'shader 把一段 GLSL 着色器挂到显示件上，完全接管其像素渲染：可做水波、故障、像素化、发光等任意 GPU 效果，是 Ren\'Py 特效的终极武器。blend 设置混合方程（如 "add" 加法发光、"multiply" 正片叠底）。需先 mesh=True。',
      scenario: '所有「声明式变换做不到」的终极特效：水波、故障、自定义发光、高级滤镜。',
      brief: 'GLSL 着色器接管渲染，特效终极武器。',
      params: [{ name: 'shader', type: 'str', desc: '着色器名', math: 'GLSL 着色器标识。' }, { name: 'blend', type: 'str', desc: '混合模式', math: '"add"/"multiply" 等混合方程。' }],
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
