// ============================================================
// ScriptWeaver · 特效百科「右侧专业副栏」扩展内容层
// ------------------------------------------------------------
// 为特效详情页（DetailView）的右栏提供三类高级内容：
//   1) combos   推荐动效组合搭配（音效 / 转场 / 镜头 / 特效 / 节奏）
//   2) classic  经典 Galgame 名场面参考（概念拆解示意）
//   3) pitfalls 常见错误用法避坑对照（拉跨 ↔ 高级）
// 以 effect id 做精选；未精选的特效由 buildCompanion 按
// preview.kind / 分类做语义兜底，保证任何特效右栏都「不空白」。
// ============================================================
import { EFFECT_CATEGORIES, type EffectItem } from '@/data/renpyEffects'

export type ComboKind = '音效' | '转场' | '镜头' | '特效' | '节奏'

export interface ComboItem {
  kind: ComboKind
  title: string
  note: string
}

export interface ClassicScene {
  work: string
  scene: string
  mood: string
}

export interface PitfallItem {
  bad: string
  good: string
}

export interface Companion {
  combos: ComboItem[]
  classic: ClassicScene[]
  pitfalls: PitfallItem[]
}

// ============================================================
// 精选：对高频 / 招牌特效给出最对味的搭配与避坑
// ============================================================
const CURATED: Record<string, Partial<Companion>> = {
  dissolve: {
    combos: [
      { kind: '音效', title: '环境底噪 BGM 轻垫', note: '日常对话几乎不抢戏，叠一层很轻的氛围音最自然，玩家不会注意到转场。' },
      { kind: '节奏', title: 'Dissolve + Pause 呼吸', note: '切换后 pause 0.4~0.6s，让新画面多停一拍，情绪更从容。' },
      { kind: '特效', title: '搭配 matrixcolor 微偏色', note: '换场景时悄悄把色调往情绪方向推（暖→安心 / 冷→疏离），无声胜有声。' },
    ],
    classic: [
      { work: 'CLANNAD', scene: '古河渚转学初遇的黄昏，背景以极慢 dissolve 推进，几乎无感地沉浸。', mood: '治愈 · 日常' },
      { work: '一般向 gal', scene: '对话间换背景，玩家意识不到「发生了转场」，维持连续感。', mood: '无缝 · 安全' },
    ],
    pitfalls: [
      { bad: '把所有切换都写成 dissolve，连高潮真相也轻轻带过。', good: '大转折换更有重量的转场（fade / flash / compose），dissolve 只留给日常。' },
      { bad: '时长全用默认 0.5s，快节奏段落显得拖沓。', good: '按情绪调速：紧张用 0.3s，抒情用 1.0~1.5s。' },
    ],
  },

  fade: {
    combos: [
      { kind: '转场', title: 'Fade → 章节标题卡', note: '黑场中段插入章节名 / 时间地点字幕，仪式感拉满。' },
      { kind: '音效', title: '低频鼓点 / 钟声', note: '翻篇感配一记沉底的重音，比纯静默更有「时间流过」的重量。' },
      { kind: '特效', title: '白场 color="#fff" 用于苏醒', note: '黑场=夜/转场，白场=醒来/闪回/圣洁，按情绪选中转色。' },
    ],
    classic: [
      { work: 'KEY 系作品', scene: '一章结束整屏沉黑，仅留标题缓缓浮现，再淡入下一段。', mood: '史诗 · 翻篇' },
      { work: '悬疑 gal', scene: '回忆开场用白场醒来，现实与梦境的边界被轻轻划开。', mood: '闪回 · 恍惚' },
    ],
    pitfalls: [
      { bad: '把 fade 塞进高频日常对话，每次黑场都把玩家弹离沉浸。', good: 'fade 留给章节切换 / 时间跳跃 / 大转折，日常用 dissolve。' },
      { bad: '白场连续高频爆白，刺眼且易眩晕。', good: '白场比黑场更刺眼，间隔要足够，敏感人群建议提供减弱开关。' },
    ],
  },

  flash: {
    combos: [
      { kind: '音效', title: '爆音 / 强力和弦', note: '「啪」一下全白配一记爆音，生理冲击感最强。' },
      { kind: '镜头', title: 'Flash + 短暂 Zoomin', note: '爆白回神的同时镜头微微推近，顿悟 / 记忆闪回瞬间成立。' },
      { kind: '特效', title: '彩色 flash 表情绪', note: '红=血色暴击，青=电流冲击，白=强光顿悟，用颜色区分语义。' },
    ],
    classic: [
      { work: '战斗 gal', scene: '必杀命中一瞬爆白，世界从纯白里慢慢回神，打击感封顶。', mood: '冲击 · 顿悟' },
      { work: '恋爱 gal', scene: '告白被说中的刹那轻微闪白，心跳漏一拍的浪漫。', mood: '心动 · 高光' },
    ],
    pitfalls: [
      { bad: '连续高频爆白，既廉价又对光敏性癫痫人群有风险。', good: '两次 flash 之间留足间隔，必要时提供「减弱闪白」开关。' },
      { bad: '把 flash 当普通转场天天用，冲击感被磨平。', good: 'flash 是稀缺资源，留给「啪一下改变一切」的节点。' },
    ],
  },

  pixellate: {
    combos: [
      { kind: '音效', title: '故障 / 电子杂讯 SE', note: '马赛克收束配一段 glitch 音，赛博故障风直接成立。' },
      { kind: '特效', title: 'reverse=True 拼合成形', note: '记忆归位 / 变身完成 / 世界线收束，从最糊一点拼合成形最对味。' },
      { kind: '转场', title: 'Pixellate 接 Dissolve', note: '先糊掉再交叉淡化，机械感与柔感叠出层次。' },
    ],
    classic: [
      { work: '赛博朋克 gal', scene: '监控画面被打成马赛克再收束清晰，揭示关键线索。', mood: '故障 · 悬疑' },
      { work: '魔法 gal', scene: '魔法变形时像素化块化重组，变身完成的瞬间块收束成形。', mood: '奇幻 · 变形' },
    ],
    pitfalls: [
      { bad: 'steps 拉满到 20，整屏巨块 + 重采样掉帧。', good: 'steps 4~6 已足够表现质感，兼顾清晰与性能。' },
      { bad: '多图层同时 pixellate，明显掉帧。', good: '单图层演示即可；移动端尤其要克制叠加。' },
    ],
  },

  swing: {
    combos: [
      { kind: '音效', title: '门轴 / 翻书 SE', note: '绕边翻动配一声门轴或书页响，厚度感一下出来。' },
      { kind: '转场', title: 'Swing 做章节书页翻动', note: 'vertical=False 左右翻门，vertical=True 上下翻页，物理质感强。' },
      { kind: '特效', title: 'background 选场景协调色', note: '翻转 90° 的瞬间会露出背板纯色，选与场景协调的色避免穿帮。' },
    ],
    classic: [
      { work: '推理 gal', scene: '翻开秘密房间的门，画面像门板一样绕边转开。', mood: '揭秘 · 门' },
      { work: '治愈 gal', scene: '章节书页轻轻翻过，过渡到下一篇章。', mood: '温柔 · 翻页' },
    ],
    pitfalls: [
      { bad: '父容器没有 perspective，3D 旋转退化成 2D 缩放，很怪。', good: '容器加 perspective:800px，旋转才有真实厚度。' },
      { bad: '翻转 90° 瞬间背板颜色突兀，画面「穿帮」。', good: 'background 选与场景协调的纯色，中转一瞬才自然。' },
    ],
  },

  zoomin: {
    combos: [
      { kind: '镜头', title: 'Zoomin + 心跳 SE', note: '新角色怼到眼前配一记心跳，登场冲击力封顶。' },
      { kind: '节奏', title: '配合台词重音点', note: '在关键台词落点同时推近，强调「这一刻」。' },
      { kind: '特效', title: '过冲缓动曲线', note: '中段略过冲的专用曲线，比线性弹出更自然。' },
    ],
    classic: [
      { work: '校园 gal', scene: '新女主首次 full 登场，立绘放大推近怼到玩家眼前。', mood: '登场 · 强调' },
      { work: '悬疑 gal', scene: '关键证物被放大推近，暗示「注意这里」。', mood: '聚焦 · 暗示' },
    ],
    pitfalls: [
      { bad: '平凡日常背景切换也放大进场，太张扬稀释重点。', good: 'zoomin 留给真正要强调的登场 / 揭示。' },
      { bad: '锚点不是中心，放大时立绘往一侧偏。', good: '设好 transform_anchor，让缩放围绕视觉重心。' },
    ],
  },

  zoomout: {
    combos: [
      { kind: '镜头', title: 'Zoomout + 远去 BGM 淡出', note: '角色越走越远，配音乐渐弱，拉远感与离愁同步。' },
      { kind: '特效', title: '缩小的同时淡出 alpha', note: '单缩小会「缩成点突然消失」很突兀，叠 alpha 才顺。' },
      { kind: '转场', title: 'Zoomout 接 Fade', note: '退场缩小后沉入黑场，告别更有仪式。' },
    ],
    classic: [
      { work: '催泪 gal', scene: '角色转身离场，画面随脚步缩小淡出，不舍拉满。', mood: '离别 · 远去' },
      { work: '回忆 gal', scene: '回忆「缩远」着退入黑场，回到现实。', mood: '回忆 · 收束' },
    ],
    pitfalls: [
      { bad: '只缩不放淡出，立绘缩成一个点突然消失。', good: '缩放同时叠 alpha 淡出，退场才顺滑。' },
      { bad: '锚点偏差导致缩小过程抖动。', good: '开 rotate_pad / 对齐锚点，缩放稳定不抖。' },
    ],
  },

  shake: {
    combos: [
      { kind: '音效', title: '地震 / 冲击 SE', note: '抖动配一记低频震动音，生理共振最足。' },
      { kind: '特效', title: 'Shake + Flash 复合', note: '巨响爆白 + 画面一震，boss 登场 / 爆炸瞬间成立。' },
      { kind: '镜头', title: '水平震（vpunch）表重击', note: '重拳命中用 vpunch，地震用 hpunch，方向对应语义。' },
    ],
    classic: [
      { work: '战斗 gal', scene: '必杀命中的一震，画面随打击点水平抖一下。', mood: '重击 · 爆发' },
      { work: '灾难 gal', scene: '地震来袭全屏抖动，危机感瞬间拉满。', mood: '危机 · 震颤' },
    ],
    pitfalls: [
      { bad: '频率过高、幅度过大，画面像筛糠还晕。', good: '幅度克制、频率低，一记到位胜过持续抖。' },
      { bad: '连续高频 shake，玩家眩晕且廉价。', good: 'shake 是重料，用在「啪一下改变一切」的节点。' },
    ],
  },

  move: {
    combos: [
      { kind: '音效', title: '脚步 / 衣料 SE', note: '同 tag 立绘挪位配脚步响，走动才「落地」。' },
      { kind: '节奏', title: 'Move + 余弦缓动', note: 'easein/out 版带惯性，比匀速 move 更像真人走。' },
      { kind: '特效', title: '多图层作为整体移动', note: '身体+表情整体作为一个 transform，避免子层错位。' },
    ],
    classic: [
      { work: '日常 gal', scene: '角色从窗边走到桌旁，同 tag 立绘平滑补间过去。', mood: '自然 · 走动' },
      { work: '群像 gal', scene: '多人对话间换位，镜头随站位流动不硬切。', mood: '群像 · 流动' },
    ],
    pitfalls: [
      { bad: 'show 的是不同 tag（或先 hide 再 show），不触发补间硬切。', good: 'move 只在「同 tag 前后两帧」成立，换人用 movein*。' },
      { bad: '多图层立绘子层各自移动错位。', good: '身体+表情打包成一个 transform 一起移动。' },
    ],
  },

  'moveinright': {
    combos: [
      { kind: '音效', title: '入场脚步 SE', note: '从屏外滑入配一步到位的落脚音，登场有戏。' },
      { kind: '镜头', title: 'EaseIn 余弦缓动', note: '首尾柔中间快，比匀速更带生命感。' },
      { kind: '节奏', title: '配合登场台词', note: '滑入落位的瞬间正好接第一句台词。' },
    ],
    classic: [
      { work: '校园 gal', scene: '新角色从门外滑入教室，第一步就定下性格。', mood: '登场 · 活力' },
      { work: '喜剧 gal', scene: '角色从屏幕侧边「咻」地滑入抢戏。', mood: '搞笑 · 抢镜' },
    ],
    pitfalls: [
      { bad: '没配 at 机位，默认滑到 center 撞上已有立绘。', good: '显式 at 指定目标机位，落点可控不重叠。' },
      { bad: '场上已有同 tag 立绘还 movein，叠加不顶替。', good: '先清旧实例再 movein，避免重影。' },
    ],
  },

  push: {
    combos: [
      { kind: '音效', title: '纸张 / 推拉 SE', note: '旧画面被推走配一记滑动音，方向感清晰。' },
      { kind: '转场', title: 'Push + 同方向 Wipe', note: '推走旧、擦入新同一方向，空间逻辑连贯。' },
      { kind: '镜头', title: 'Push 表「换幕不换场」', note: '同一空间里把注意力从一人推到另一人。' },
    ],
    classic: [
      { work: '群像 gal', scene: '对话焦点从 A 推到 B，空间连续不跳戏。', mood: '焦点 · 切换' },
      { work: '悬疑 gal', scene: '旧画面被推开露出背后的秘密。', mood: '揭示 · 推进' },
    ],
    pitfalls: [
      { bad: '推的方向与剧情动线相反，观众空间感错乱。', good: 'push 方向贴合角色走位 / 视线方向。' },
      { bad: '时长过短显得生硬「啪」地推走。', good: '0.4~0.6s 配缓动，推走有重量。' },
    ],
  },

  slide: {
    combos: [
      { kind: '音效', title: '滑入 / 离场 SE', note: 'slide 配一记滑动音，进出都有戏。' },
      { kind: '转场', title: 'Slide 做「旁白插入」', note: '旁白角色从侧边滑入说一句再滑出，不占主舞台。' },
      { kind: '节奏', title: 'Slide 接 Pause', note: '滑入后 pause 一拍，让这句旁白被看见。' },
    ],
    classic: [
      { work: '喜剧 gal', scene: '吐槽役从屏幕侧边滑入抢一句再滑走。', mood: '吐槽 · 插入' },
      { work: '叙事 gal', scene: '回忆旁白从一侧滑入，说完退场不抢戏。', mood: '旁白 · 轻盈' },
    ],
    pitfalls: [
      { bad: 'slide 与 move 混用导致速度曲线突变。', good: '同一段连续移动统一缓动，别突变。' },
      { bad: '滑入后立刻被下一句截断。', good: '留足 pause 让滑入完整播放。' },
    ],
  },

  rotate: {
    combos: [
      { kind: '音效', title: '旋转 / 眩晕 SE', note: '旋转配一段上扬或眩晕音，方向感更明确。' },
      { kind: '特效', title: 'Rotate + Flip 组合', note: '先转再翻，变身 / 反转瞬间的戏剧性。' },
      { kind: '转场', title: '小角度 rotate 表「晃神」', note: '轻微旋转表醉意 / 眩晕 / 时空错位。' },
    ],
    classic: [
      { work: '奇幻 gal', scene: '魔法阵旋转展开，召唤仪式成立。', mood: '仪式 · 魔法' },
      { work: '梦境 gal', scene: '世界轻微旋转，暗示醉意或时空错位。', mood: '恍惚 · 错位' },
    ],
    pitfalls: [
      { bad: '大角度快转配长持续，玩家眩晕。', good: '旋转幅度 / 时长克制，点到为止。' },
      { bad: '旋转中心不对，立绘绕圈飞出画面。', good: '设好 transform_anchor，绕视觉重心转。' },
    ],
  },

  crop: {
    combos: [
      { kind: '镜头', title: 'Crop 做「镜头推近」', note: '裁掉四周放大中心，伪推近且不改立绘尺寸。' },
      { kind: '转场', title: 'Crop 接 Zoom 强调', note: '先裁切聚焦再放大，双重强调关键细节。' },
      { kind: '特效', title: 'Crop 配合 Pan 扫视', note: '裁出窗口后 pan 在图内扫视，像镜头游走。' },
    ],
    classic: [
      { work: '悬疑 gal', scene: '裁切放大信上的某个字，引导玩家注意线索。', mood: '聚焦 · 暗示' },
      { work: '战斗 gal', scene: '裁切到角色眼神特写，情绪张力拉满。', mood: '特写 · 张力' },
    ],
    pitfalls: [
      { bad: '裁切比例失调，立绘被切得奇怪。', good: 'crop 比例贴合「镜头取景」逻辑，别切到关键部位外。' },
      { bad: '裁切后不配合 pan/zoom，画面僵。', good: 'crop 后让镜头在窗口内游走，才有「活的取景」。' },
    ],
  },

  'matrixcolor': {
    combos: [
      { kind: '特效', title: 'Matrixcolor 表情绪偏色', note: '暖=安心 / 冷=疏离 / 红=危险，无声推情绪。' },
      { kind: '转场', title: '偏色接 Fade', note: '先沉色再黑场，章节收束的情绪更统一。' },
      { kind: '节奏', title: '随剧情动态调色', note: '好感度上升悄悄加暖，下降悄悄加冷。' },
    ],
    classic: [
      { work: '催泪 gal', scene: '回忆段落整屏蒙上暖黄，温柔又怅然。', mood: '回忆 · 暖黄' },
      { work: '悬疑 gal', scene: '真相逼近时画面渐冷发青，不安蔓延。', mood: '不安 · 冷青' },
    ],
    pitfalls: [
      { bad: '偏色过饱和，画面像廉价滤镜。', good: '矩阵只做轻微偏移，情绪靠「暗示」不靠「砸」。' },
      { bad: '冷暖突变不过渡，玩家出戏。', good: '偏色用补间平滑过渡，别硬切换色。' },
    ],
  },

  'vpunch': {
    combos: [
      { kind: '音效', title: '重击 / 爆裂 SE', note: '水平一震配重拳命中音，打击感封顶。' },
      { kind: '特效', title: 'Vpunch + Flash 复合', note: '巨响爆白加水平震，boss 登场 / 爆炸瞬间。' },
      { kind: '镜头', title: 'Vpunch 表「被正面击中」', note: '重拳 / 冲撞用水平震，语义对应正面冲击。' },
    ],
    classic: [
      { work: '战斗 gal', scene: '必杀正面命中的一震，画面水平抖一下。', mood: '重击 · 爆发' },
      { work: '喜剧 gal', scene: '被吐槽到「物理打击」的一震，夸张好笑。', mood: '搞笑 · 物理' },
    ],
    pitfalls: [
      { bad: '频率过高幅度过大，像筛糠还晕。', good: '一记到位，幅度克制、频率低。' },
      { bad: '和 hpunch 乱用，方向语义错乱。', good: '正面冲击用 vpunch，上下颠簸用 hpunch。' },
    ],
  },

  'ease-linear': {
    combos: [
      { kind: '节奏', title: 'Warpers 决定「惯性感」', note: 'linear 匀速死板，ease 余弦带生命，按演出挑曲线。' },
      { kind: '特效', title: '缓动配移动 / 缩放', note: '进出场用余弦缓动，比默认线性自然得多。' },
      { kind: '转场', title: '复合转场内各段独立缓动', note: 'compose 里前后置转场各自选曲线，层次更丰富。' },
    ],
    classic: [
      { work: '演出考究的 gal', scene: '角色走动用余弦缓动，惯性感让动作「活」起来。', mood: '生命感 · 惯性' },
      { work: 'UI 精致的 gal', scene: '菜单 / 弹窗用统一缓动曲线，整体手感一致。', mood: '一致 · 手感' },
    ],
    pitfalls: [
      { bad: '全站只用一个 linear，动作死板像幻灯片。', good: '按语义选曲线：进出用 ease，强调用过冲。' },
      { bad: '同一段连续移动混用不同曲线，速度突变。', good: '连续动作统一缓动，过渡才顺。' },
    ],
  },

  'parallel': {
    combos: [
      { kind: '特效', title: 'Parallel 同时做多件事', note: '一边移动一边变色的复合演出，单条 ATL 写完。' },
      { kind: '节奏', title: 'Parallel 表「多线索并发」', note: '画面与字幕 / 音效各自独立时间线并行。' },
      { kind: '转场', title: 'Parallel 叠转场 + 特效', note: '转场进行中同时推近 / 偏色，层次更厚。' },
    ],
    classic: [
      { work: '华丽 gal', scene: '立绘边走入边变色边浮现特效，一镜到底。', mood: '复合 · 一镜' },
      { work: '战斗 gal', scene: '多重演出并行推进，高潮段落 information 密度高。', mood: '高潮 · 密集' },
    ],
    pitfalls: [
      { bad: 'parallel 里塞太多事，观众抓不住重点。', good: '并行也要有主次，一条主线 + 一两条点缀。' },
      { bad: '各并行段时长不一，收尾参差不齐。', good: '约定统一节拍，让并行段在同一拍落定。' },
    ],
  },
}

// ============================================================
// 兜底：未精选特效按 preview.kind / 分类生成语义合理的内容
// ============================================================
const TRANSITION_KINDS = new Set([
  'dissolve', 'fadeIn', 'flash', 'pixellate', 'wipe', 'iris', 'blinds', 'squares', 'swing',
])
const MOVE_KINDS = new Set(['move', 'slide', 'push', 'position', 'pan', 'tile'])
const IMPACT_KINDS = new Set(['shake', 'rotate', 'flip', 'rotate3d'])
const FILTER_KINDS = new Set(['blur', 'crop', 'color', 'alpha', 'additive', 'polar'])

function catNameOf(item: EffectItem): string {
  for (const c of EFFECT_CATEGORIES) {
    if (c.items.some((i) => i.id === item.id)) return c.name
  }
  return '特效'
}

function fallbackCompanion(item: EffectItem): Companion {
  const kind = item.preview.kind
  const cat = catNameOf(item)

  // —— 组合搭配兜底 ——
  let combos: ComboItem[]
  if (TRANSITION_KINDS.has(kind)) {
    const se = kind === 'flash' ? '爆音 SE' : kind === 'pixellate' ? '故障杂讯 SE' : kind === 'fadeIn' ? '钟声 / 翻页 SE' : kind === 'swing' ? '门轴 SE' : '轻机械 / 纸张 SE'
    combos = [
      { kind: '音效', title: se, note: '转场配一记与重量匹配的音效，比纯静默更有「发生了什么」的反馈。' },
      { kind: '节奏', title: '转场后 Pause 呼吸', note: '切完 pause 0.4s 让新画面多停一拍，情绪更从容。' },
      { kind: '特效', title: '叠加轻微滤镜', note: '换场同时叠一点偏色 / 模糊，层次比裸转场厚。' },
    ]
  } else if (MOVE_KINDS.has(kind)) {
    combos = [
      { kind: '音效', title: '脚步 / 滑动 SE', note: '位移配脚步或滑动音，动作才「落地」不飘。' },
      { kind: '节奏', title: '余弦缓动 EaseIn/Out', note: '首尾柔中间快，比匀速 move 更像真人动作。' },
      { kind: '特效', title: '多图层整体移动', note: '身体+表情打包成一个 transform，避免子层错位。' },
    ]
  } else if (IMPACT_KINDS.has(kind)) {
    combos = [
      { kind: '音效', title: '冲击 / 旋转 SE', note: '形变配对应音效，方向感与重量感更明确。' },
      { kind: '特效', title: '复合转场里做前后置', note: '在 compose 里作为前置 / 后置，与主转场叠出层次。' },
      { kind: '镜头', title: '配合锚点设定', note: '设好 transform_anchor，绕视觉重心变形不飞出。' },
    ]
  } else if (FILTER_KINDS.has(kind)) {
    combos = [
      { kind: '特效', title: '滤镜 + 转场连用', note: '偏色 / 模糊与转场叠加，单镜头也能做出情绪推进。' },
      { kind: '节奏', title: '随好感度动态调', note: '上升加暖、下降加冷，无声推情绪。' },
      { kind: '转场', title: '滤镜做章节收束', note: '沉色后接 fade，章节收束更统一。' },
    ]
  } else {
    combos = [
      { kind: '特效', title: 'ATL 复合演出', note: '用 parallel / 缓动把多条时间线编织在一起，演出更厚。' },
      { kind: '节奏', title: '统一缓动曲线', note: '全站缓动风格一致，整体手感才协调。' },
      { kind: '转场', title: '复合转场内分层', note: 'compose 里前后置各选曲线，层次更丰富。' },
    ]
  }

  // —— 名场面兜底 ——
  const classic: ClassicScene[] = [
    { work: '经典 gal 惯例', scene: `${item.cn}（${item.name}）在名场面里多用于「${firstSceneHint(kind)}」的节点，成为情绪锚点。`, mood: `${cat} · 情绪锚` },
    { work: '演出考究的作品', scene: '把该特效的语义「点到为止」地用在高光，而非滥用于每段，反而更被记住。', mood: '克制 · 高光' },
  ]

  // —— 避坑兜底 ——
  const pitfalls: PitfallItem[] = [
    { bad: '把该特效用在每一个相似节点，稀缺感被磨平、观众脱敏。', good: '留给真正要强调的「那一下」，其余用更轻的替代。' },
    { bad: '时长 / 幅度与当前段落语速不匹配，显得突兀或拖沓。', good: '按情绪与台词节奏调速，紧张短、抒情长。' },
    { bad: '单特效孤零零出现，没有音效 / 镜头 / 滤镜配合，显得单薄。', good: '组合搭配（音效 + 镜头 + 滤镜）才撑得起一场演出。' },
  ]

  return { combos, classic, pitfalls }
}

function firstSceneHint(kind: string): string {
  if (TRANSITION_KINDS.has(kind)) return '场景切换 / 翻篇'
  if (MOVE_KINDS.has(kind)) return '角色进出 / 换位'
  if (IMPACT_KINDS.has(kind)) return '冲击 / 形变高光'
  if (FILTER_KINDS.has(kind)) return '情绪偏色 / 聚焦'
  return '复合演出'
}

// ============================================================
// 对外：合并精选与兜底，任何特效都返回完整 Companion
// ============================================================
export function buildCompanion(item: EffectItem): Companion {
  const curated = CURATED[item.id]
  if (!curated) return fallbackCompanion(item)
  const fb = fallbackCompanion(item)
  return {
    combos: curated.combos ?? fb.combos,
    classic: curated.classic ?? fb.classic,
    pitfalls: curated.pitfalls ?? fb.pitfalls,
  }
}
