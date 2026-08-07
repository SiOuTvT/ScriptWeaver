/**
 * ============================================================
 * Ren'Py 语法学院（Syntax Academy）—— v1.1.0
 * ============================================================
 * 按「入门基础 → 中级进阶 → 高阶实战」严格逻辑顺序排列。
 * 每条教程统一结构：功能作用 + 通俗解释 + 真实代码范例 + 避坑提示。
 */

export interface SyntaxLesson {
  id: string
  title: string
  subtitle: string
  category: string
  level: '入门' | '进阶' | '高级'
  content: string
  codeExample: string
  insertableLabel?: string
  tags: string[]
  related?: string[]
  icon: string
}

export const LESSON_CATEGORIES = [
  { id: 'basics', label: '入门基础', icon: '1', lessonIds: ['hello-world','show-images','menus-jumps','variables-conditions','audio-system','dialogue-system','dialogue-interpolate','transitions','custom-transitions','expression-statement','video-system','position-slot'] },
  { id: 'atl', label: 'ATL 动画变换', icon: 'A', lessonIds: ['atl-basics','atl-paths','atl-events','atl-camera','atl-kinetic'] },
  { id: 'nvl', label: 'NVL 叙述模式', icon: 'N', lessonIds: ['nvl-mode','nvl-advanced'] },
  { id: 'screen', label: 'Screen 自定义界面', icon: 'S', lessonIds: ['custom-screens','screen-actions','screen-timer','screen-input','screen-use'] },
  { id: 'flow', label: '流程控制', icon: 'F', lessonIds: ['call-return','save-load','rollback-system','persistent-data'] },
  { id: 'python', label: 'Python 内联', icon: 'P', lessonIds: ['python-blocks','image-manipulators','matrixcolor','layered-image','achievements'] },
  { id: 'audio', label: '音频精讲', icon: 'M', lessonIds: ['play-statements','audio-with-atl'] },
  { id: 'advanced', label: '高阶实战', icon: 'H', lessonIds: ['translation','game-config','performance','packaging','accessibility','community'] },
]

export const SYNTAX_LESSONS: SyntaxLesson[] = [
  // ========================================================================
  // 第一章：入门基础 — 台词、分支、变量、音效
  // ========================================================================
  {
    id: 'hello-world',
    title: 'Hello Ren\'Py——第一行剧本',
    subtitle: '从零开始写出你的第一句对话',
    category: '入门基础',
    level: '入门',
    icon: '1',
    tags: ['入门', 'hello', '对话', 'say', 'define', 'label'],
    content: `## 功能作用
让角色在画面中说出第一句台词，启动你的故事。

## 通俗解释
Ren'Py 就像一个舞台导演。你需要先告诉它"谁来说话"（define 定义角色），然后"在哪一幕"（label 标记场景），最后"说什么"（角色名 + 引号里的台词）。就三步。

## 避坑提示
- label 后面必须有冒号，下一行必须缩进 4 个空格。
- Character 的第一个参数是屏幕上显示的名字，不是变量名。
- 不带角色名的纯引号对白，显示为"无角色名"的叙述。`,
    codeExample: `# 定义角色
define e = Character("艾琳")
define n = Character("旁白", kind=nvl)

# 游戏起点
label start:
    e "大家好，我是艾琳。"
    "这是第一段对话。"
    n "这是旁白叙述。"
    return`,
    insertableLabel: `label hello_world:
    e "大家好，我是艾琳。"
    "这是第一段对话。"
    return`,
  },
  {
    id: 'show-images',
    title: '显示与隐藏立绘',
    subtitle: '控制角色立绘的显示、隐藏与位置',
    category: '入门基础',
    level: '入门',
    icon: '2',
    tags: ['立绘', 'image', 'show', 'hide', 'scene', 'position'],
    content: `## 功能作用
在舞台上显示或隐藏角色图像，控制角色出场、退场和站位。

## 通俗解释
show 让角色从"后台"走到"舞台上"。hide 让角色退场。scene 清空整个舞台（所有人一起退场）。这就像舞台导演喊"艾琳上前！"或"全部退场！"。

## 避坑提示
- image 必须先定义才能 show，否则会报错。
- scene 会清除所有当前显示的图像，包括背景。
- show 同一角色的新表情时会自动替换旧立绘，不需要先 hide。`,
    codeExample: `# 定义图像
image eileen happy = "eileen_happy.png"
image eileen sad = "eileen_sad.png"
image bg park = "park.jpg"

label start:
    scene bg park          # 显示背景（先清场）
    show eileen happy       # 显示立绘，默认居中
    "艾琳开心地出现了。"
    show eileen sad         # 自动替换为难过表情
    "她的表情变了。"
    hide eileen             # 退场
    "她离开了。"
    return`,
  },
  {
    id: 'menus-jumps',
    title: '选项菜单与跳转',
    subtitle: '让玩家选择故事走向——分支的核心',
    category: '入门基础',
    level: '入门',
    icon: '3',
    tags: ['分支', 'menu', 'jump', '选择', 'label'],
    content: `## 功能作用
在剧情中弹出选择菜单，让玩家决定下一步——这是视觉小说"互动性"的核心。

## 通俗解释
menu 就是在画面上弹出几个按钮，每个按钮上写一句话（玩家看到的选项文本）。玩家点哪个，故事就跳到对应的 label。就像"向左走还是向右走？"——点"左"跳左边场景，点"右"跳右边场景。

## 避坑提示
- 每个选项后面的冒号不能少。
- jump 目标 label 必须在脚本中已定义，否则运行报错。
- 可以在选项里写多条语句（不止 jump），用缩进写在一组即可。`,
    codeExample: `label start:
    e "你想去哪里？"

menu:
    "去花园散步":
        jump garden
    "去图书馆看书":
        jump library
    "留在房间":
        jump stay_room

label garden:
    "你来到了花园，花香扑鼻。"
    return

label library:
    "图书馆里安静极了。"
    return

label stay_room:
    "你留在房间里，窗外下起了雨。"
    return`,
    insertableLabel: `label choice_branch:
    e "你想去哪里？"
menu:
    "去花园散步":
        jump garden
    "留在房间":
        jump stay_room`,
  },
  {
    id: 'variables-conditions',
    title: '变量与条件判断',
    subtitle: '让游戏记住玩家的选择，改变后续剧情',
    category: '入门基础',
    level: '入门',
    icon: '4',
    tags: ['变量', 'if', '条件', 'default', '$'],
    content: `## 功能作用
用变量记录玩家的选择、好感度、物品等状态，用 if 条件判断来改变故事走向。

## 通俗解释
变量就像一个记分牌：玩家帮了角色→好感+1，没帮→好感不变。后面的剧情可以用 if 来问："好感够不够？够了走好结局，不够走普通结局。"这就是游戏能"记住"玩家行为的秘诀。

## 避坑提示
- 变量赋值前面加 $ 号，如 $ score += 1。
- 要用 default 在游戏开头声明变量并给初始值，不要用 define。
- if 条件后面的冒号和缩进不能忘。`,
    codeExample: `default affection = 0          # 初始好感为 0

label start:
    e "你能帮我一个忙吗？"

menu:
    "当然可以！":
        $ affection += 2
        e "谢谢你！"
    "我很忙……":
        $ affection += 0
        e "好吧……"

    if affection >= 2:
        e "你真是个好人。"
    else:
        e "没关系，我自己来。"
    return`,
  },
  {
    id: 'audio-system',
    title: '音频系统：BGM / 音效 / 语音',
    subtitle: '为游戏配上背景音乐、音效和角色语音',
    category: '入门基础',
    level: '入门',
    icon: '5',
    tags: ['音频', 'BGM', '音效', 'play', 'stop', 'voice'],
    content: `## 功能作用
在剧情中播放背景音乐（BGM）、触发音效（SE）或角色配音（Voice），增强沉浸感。

## 通俗解释
play music 是换背景音乐，像换电影配乐。play sound 是触发短音效，像"叮！"一声。voice 是在角色说台词时自动播放配音文件。stop music 静音。

## 避坑提示
- 音频文件格式推荐 ogg 或 mp3，Ren'Py 支持的格式有限。
- music 和 sound 是两个独立声道，互不干扰。
- voice 需要先在 Character 定义时绑定 voice_tag。`,
    codeExample: `define e = Character("艾琳", voice_tag="eileen")

label start:
    play music "bgm_peaceful.ogg" fadein 2.0
    "一段宁静的音乐渐渐响起。"

    e "你好！"                        # 播放 eileen 的配音
    play sound "ding.wav"
    "收到了一条消息！"

    stop music fadeout 1.0
    "音乐停止了。"
    return`,
  },
  {
    id: 'dialogue-system',
    title: '对话系统精讲',
    subtitle: '深入掌握角色定义、带名字/颜色的高级对话写法',
    category: '入门基础',
    level: '入门',
    icon: '6',
    tags: ['对话', 'Character', 'what_color', 'who_color', 'ctc'],
    content: `## 功能作用
精细化控制角色对话的视觉呈现：名字颜色、对话颜色、点击继续指示器等。

## 通俗解释
Character 是你为每个角色定制的"说话人名片"。你可以设置名字的显示颜色（who_color）、台词文字颜色（what_color）、说话前是否清屏、点击继续的小箭头（ctc）等。这让每个角色的对话都有独特的视觉风格。

## 避坑提示
- 颜色用十六进制如 "#ff6699"。
- ctc 参数接受一个 Displayable，通常用预定义的箭头动画。
- image 参数可以把角色头像绑定到对话框左边。`,
    codeExample: `define e = Character("艾琳",
    who_color="#ff6699",
    what_color="#ffffff",
    ctc="ctc_arrow",
    image="eileen")

define n = Character("旁白",
    what_italic=True,
    what_color="#cccccc")

label start:
    show eileen happy
    e "对话会显示名字颜色和头像！"
    n "旁白的文字是灰色斜体。"
    return`,
  },
  {
    id: 'dialogue-interpolate',
    title: '对话中的变量插值',
    subtitle: '在台词中动态插入变量值，让对话更生动',
    category: '入门基础',
    level: '入门',
    icon: '7',
    tags: ['插值', '变量', '对话', '[ ]', '动态'],
    content: `## 功能作用
在角色台词中嵌入变量的值，让同一句台词根据游戏状态显示不同内容。

## 通俗解释
你不需要为"你的好感度是1"和"你的好感度是10"各写一句台词。用方括号 [affection] 把变量包起来，Ren'Py 会自动把变量值替换进去。就像填空题，填空的内容由游戏状态决定。

## 避坑提示
- 方括号内的变量名不能有空格。
- 如果变量不存在会报错，所以确保该变量已被 default 定义。
- 可以嵌入多个变量，如 "你有 [gold] 金币和 [item_count] 件物品。"`,
    codeExample: `default player_name = "小明"
default affection = 5

label start:
    e "你好，[player_name]！"
    e "我们当前的好感度是 [affection]。"

    $ affection += 3
    e "现在好感度变成了 [affection]。"
    return`,
  },
  {
    id: 'transitions',
    title: '过渡转场大全',
    subtitle: '掌握 dissolve、fade、wipe 等内置过渡效果',
    category: '入门基础',
    level: '入门',
    icon: '8',
    tags: ['过渡', '转场', 'dissolve', 'fade', 'wipe', 'with'],
    content: `## 功能作用
在画面变化时添加平滑的过渡动画，让场景切换不突兀。

## 通俗解释
没有转场就像 PPT 生切——画面"啪"地变了。加了 with dissolve 后，旧画面会慢慢淡出、新画面慢慢淡入，视觉上很舒服。Ren'Py 内置了约 20 种转场效果，常用的就几个。

## 避坑提示
- with 后面直接跟转场名称，不需要加括号。
- 常用转场：dissolve（溶解）、fade（全黑淡入淡出）、wipeleft（左向右擦除）、pixellate（像素化）。
- 如果使用自定义转场，需要先定义 transform，而非直接写 zoom()。`,
    codeExample: `label start:
    scene bg room
    with fade
    "用 fade 进入房间。"

    show eileen happy
    with dissolve
    "用 dissolve 显示立绘。"

    scene bg garden
    with wipeleft
    "用 wipeleft 切到花园。"

    hide eileen
    with pixellate
    "像素化退场。"
    return`,
  },
  {
    id: 'custom-transitions',
    title: '自定义过渡效果',
    subtitle: '用 CropMove、PushMove 创建专属转场动画',
    category: '入门基础',
    level: '进阶',
    icon: '9',
    tags: ['过渡', '自定义', 'CropMove', 'PushMove', 'define'],
    content: `## 功能作用
当内置的 dissolve/fade 不够用、想要独特转场风格时，用 Transition 类创建自定义过渡。

## 通俗解释
你可以让画面像"拉窗帘"一样从中间往两边推开，或者像"翻书"一样从右往左滑入。这些都无法用简单 dissolve 实现，需要用 ComposeTransition 或自定义 Transition 子类。

## 避坑提示
- 自定义 Transition 需要写 Python 类，不能只在 Ren'Py 脚本里写。
- 大多数情况下，用 Dissolve 加 ATL transform 的组合就够了，不必写自定义类。
- 定义好的自定义过渡用 define 绑定到一个名字。`,
    codeExample: `# 定义一个从右侧推入的过渡
define pushright = CropMove(1.0, "pushright")

# 组合过渡：先溶解再推入
define dissolve_push = ComposeTransition(
    Dissolve(0.3),
    before=CropMove(0.3, "pushright")
)

label start:
    scene bg garden
    with pushright
    "画面从右边推入。"
    return`,
  },
  {
    id: 'expression-statement',
    title: '动态图片与表达式',
    subtitle: '根据变量值动态选择要显示的图像',
    category: '入门基础',
    level: '进阶',
    icon: '10',
    tags: ['表达式', '动态', 'ConditionSwitch', 'choice'],
    content: `## 功能作用
让同一段剧情的角色立绘自动根据变量状态变化——好感度高自动显示笑脸，好感度低自动显示冷脸。

## 通俗解释
你不需要写一堆 if 判断来手动选图。用 ConditionSwitch 定义一个规则：好感 ≥ 5 用 happy 图，≥ 0 用 neutral 图，< 0 用 angry 图。之后只要 show 这个图像，Ren'Py 就会自动选对的那张。

## 避坑提示
- ConditionSwitch 按顺序判断：第一个满足条件的规则生效。
- 条件覆盖不到的用 "True" 做兜底。
- 图像文件必须先 define 才能在 ConditionSwitch 里引用。`,
    codeExample: `default affection = 3

image eileen mood = ConditionSwitch(
    "affection >= 5", "eileen_happy.png",
    "affection >= 0", "eileen_neutral.png",
    "True", "eileen_angry.png"
)

label start:
    show eileen mood
    "好感度 [affection]，显示对应的表情。"

    $ affection += 3
    "现在好感度 [affection]，表情自动变了！"
    return`,
  },
  {
    id: 'video-system',
    title: '视频播放',
    subtitle: '在游戏中嵌入过场动画或片头视频',
    category: '入门基础',
    level: '入门',
    icon: '11',
    tags: ['视频', 'movie', '播放', 'cutscene'],
    content: `## 功能作用
在剧情中播放视频文件，常用于片头动画、关键剧情的过场，也可以把视频当作动态背景（雨夜的窗、闪动的霓虹灯、波光粼粼的水面）。

## 通俗解释
两种常见用法：
- 全屏过场：用 renpy.movie_cutscene 播完一整段视频再继续剧情，期间玩家可点击跳过（设置 hard=True 则不可跳过）。
- 动态背景：用 Movie 作为显示件挂到背景层，配合循环播放，让背景"活"起来。这是做动态 CG、雨夜窗景、剧情演出的常用手法，也是本软件视频背景功能对应的标准写法。

## 避坑提示
- 推荐视频格式：WebM（VP8/VP9 + Vorbis）兼容性最好；mp4 在部分平台兼容性差。
- 声明电影用 image 语句，文件名不带扩展名，视频文件放入 images 目录。
- Movie 默认循环播放，需要只播一次时用 loop=False。
- movie_cutscene 期间玩家默认可点击跳过，hard=True 可禁止。
- 视频文件体积大，打包前务必压缩，避免安装包过大。`,
    codeExample: `# 动态背景：声明电影后当作背景使用，循环播放
image bg rain = Movie(play="images/rain.webm", loop=True)

label start:
    scene bg rain                # 雨夜窗景动态背景
    "窗外下着雨……"

# 全屏过场动画（播完继续，可跳过）
label intro:
    $ renpy.movie_cutscene("opening.webm")
    "片头播放完毕，游戏正式开始。"
    return`,
  },
  {
    id: 'position-slot',
    title: '角色位置与槽位',
    subtitle: '灵活控制立绘站位——左、中、右任意摆',
    category: '入门基础',
    level: '入门',
    icon: '12',
    tags: ['位置', '槽位', 'left', 'right', 'center', 'at'],
    content: `## 功能作用
精确控制角色立绘在画面中的位置：左边、中间、右边，或自定义坐标。

## 通俗解释
就像舞台导演安排演员站位——主角站中间，配角站左右两侧。用 at left、at right 这些预定义位置（"槽位"），也可以自己写 transform 自定义精确坐标。

## 避坑提示
- left/center/right 是 Ren'Py 内置的位置定义。
- 同时显示多个立绘时，务必给不同位置，否则会叠在一起。
- 自定义位置用 transform + xalign/yalign 比硬编码像素值更灵活。`,
    codeExample: `label start:
    show eileen happy at left
    show lucy smile at right
    "艾琳在左边，露西在右边。"

    show eileen happy at center
    hide lucy
    "只剩艾琳居中。"
    return`,
  },

  // ========================================================================
  // 第二章：ATL 动画变换语言
  // ========================================================================
  {
    id: 'atl-basics',
    title: 'ATL 入门：动画变换语言基础',
    subtitle: '学习用 ATL 创建图像动画——移动、旋转、缩放',
    category: 'ATL 动画变换',
    level: '进阶',
    icon: 'A1',
    tags: ['ATL', 'transform', '动画', 'xalign', 'yalign', 'alpha'],
    content: `## 功能作用
用 ATL（Animation and Transformation Language）创建平滑的图像动画，实现移动、旋转、缩放、淡入淡出等效果。

## 通俗解释
ATL 是 Ren'Py 的"动画脚本语言"。你在 transform 块里写下"从左边慢慢走到中间，花费 1.5 秒"，Ren'Py 就会自动执行这个动画。不用写任何代码来手动计算位置，只需要告诉它起点、终点和多长时间。

## 避坑提示
- transform 里的缩进非常重要，必须对齐。
- linear 后面的数字是持续时间（秒），非帧数。
- ATL 动画在 show 时自动执行，也可以手动用 at 引用。`,
    codeExample: `transform slide_in_left:
    xalign -0.3 yalign 0.5       # 起点：画面左外侧
    linear 0.8 xalign 0.2         # 0.8 秒滑到 x=0.2

transform fade_in:
    alpha 0.0                     # 起点：完全透明
    linear 1.0 alpha 1.0          # 1 秒淡入到不透明

label start:
    show eileen happy at slide_in_left
    "艾琳从左边滑入。"
    return`,
  },
  {
    id: 'atl-paths',
    title: 'ATL 复杂路径动画',
    subtitle: '让立绘沿曲线轨迹移动——多点路径与循环运动',
    category: 'ATL 动画变换',
    level: '高级',
    icon: 'A2',
    tags: ['ATL', '路径', '运动', 'repeat', 'ease'],
    content: `## 功能作用
实现多关键点的复杂运动轨迹，让角色沿自定义路线移动，支持循环和缓动。

## 通俗解释
如果 slide_in_left 是让角色走直线，那路径动画就是让角色"走曲线"——你可以设 A→B→C→D 四个点，角色会沿着这些点平滑移动。你还能让它一直循环（比如呼吸式的微微上下浮动）。

## 避坑提示
- 多个关键点用连续多个 linear 或 ease 语句串联。
- repeat 放在 transform 末尾会让整个动画无限循环。
- ease 与 linear 的区别：ease 用缓动曲线（开头慢、中间快、结尾慢），更自然。`,
    codeExample: `transform float_loop:
    yalign 0.5
    ease 2.0 yalign 0.48        # 2 秒轻轻上浮
    ease 2.0 yalign 0.5         # 2 秒回到原位
    repeat

transform path_demo:
    xalign 0.1 yalign 0.5
    linear 1.0 xalign 0.3 yalign 0.3
    linear 1.0 xalign 0.5 yalign 0.1
    linear 1.0 xalign 0.7 yalign 0.3
    linear 1.0 xalign 0.9 yalign 0.5

label start:
    show eileen happy at float_loop
    "艾琳在微微浮动。"
    return`,
  },
  {
    id: 'atl-events',
    title: 'ATL 事件与生命周期',
    subtitle: '在动画中触发事件：on show / on hide / on replace',
    category: 'ATL 动画变换',
    level: '高级',
    icon: 'A3',
    tags: ['ATL', '事件', 'on', 'show', 'hide', 'replace'],
    content: `## 功能作用
在 ATL 动画的不同阶段（显示时、隐藏时、被替换时）触发特定行为，实现"入场播音效、退场闪一下"等效果。

## 通俗解释
就像舞台灯光的"亮灯提示"和"熄灯提示"——角色上场时可以触发一个音效或闪光；退场时可以快速缩小消失。这些都是通过 ATL 事件块 on show / on hide 实现的。

## 避坑提示
- on show 在图像第一次被 show 时执行一次。
- on hide 在图像被 hide 时触发，常用于退场动画。
- on replace 在原图像被同 tag 的新图像替代时触发。`,
    codeExample: `transform dramatic_enter:
    on show:
        alpha 0.0
        linear 0.3 alpha 1.0
    on hide:
        linear 0.3 alpha 0.0
    on replace:
        alpha 0.5
        linear 0.3 alpha 1.0

label start:
    show eileen happy at dramatic_enter
    "艾琳淡入上场。"
    show eileen sad at dramatic_enter
    "表情切换时触发 replace 事件。"
    hide eileen
    "淡出退场。"
    return`,
  },
  {
    id: 'atl-camera',
    title: '运镜与 3D 舞台',
    subtitle: '模拟摄像机运动——推拉摇移、深度层次',
    category: 'ATL 动画变换',
    level: '高级',
    icon: 'A4',
    tags: ['camera', '3D', '运镜', 'zpos', 'perspective'],
    content: `## 功能作用
通过 camera 语句模拟电影运镜：推近、拉远、平移，以及 3D 透视效果。

## 通俗解释
camera 就像你拿着摄像机在拍摄这个画面。你可以推近（zoom in）让角色占满屏幕、拉远（zoom out）展示全景、从左边摇到右边（pan）。加上 zpos 还能做出立体纵深感——近处的角色更大、远处的更小。

## 避坑提示
- camera 语句影响整个场景，不是单个立绘。
- 3D 效果需要先在场景中设置 perspective=True。
- 运镜后记得在合适的时机 reset camera 回到初始视角。`,
    codeExample: `label start:
    scene bg room
    show eileen happy at center

    "正常视角。"

    camera:
        xalign 0.5 yalign 0.5 zoom 1.5
        ease 2.0 zoom 1.0
    "镜头缓缓拉近。"

    camera:
        ease 2.0 xalign 0.3
    "镜头向左移动。"
    return`,
  },
  {
    id: 'atl-kinetic',
    title: 'ATL 动态文字特效',
    subtitle: '让文字动起来——打字机效果、文字弹跳、颜色渐变',
    category: 'ATL 动画变换',
    level: '高级',
    icon: 'A5',
    tags: ['文字', '动画', 'text', 'typewriter', 'ATL'],
    content: `## 功能作用
为游戏中的文字（标题、旁白、UI 文字）添加动画效果，打造电影级的文字表现力。

## 通俗解释
不满足于静态文字？ATL 可以让文字逐字出现（打字机效果）、从画面外飞入、沿着弧线运动、颜色渐变闪烁。用的是 text displayable 配合 ATL transform。

## 避坑提示
- 文字动画需要把 text "xxx" 写在 image 定义或 Screen 中与 ATL 绑定。
- 逐字效果需要用到 slow_cps 参数控制速度。
- 大量文字动画可能影响性能，建议仅用于标题和关键节点。`,
    codeExample: `image title_text = Text("第一章", size=60, color="#fff")

transform title_fly_in:
    xalign 0.5 yalign -0.2
    linear 1.0 yalign 0.3
    pause 0.5
    linear 0.5 alpha 0.0

label start:
    show title_text at title_fly_in
    "标题飞入然后淡出。"
    return`,
  },

  // ========================================================================
  // 第三章：NVL 叙述模式
  // ========================================================================
  {
    id: 'nvl-mode',
    title: 'NVL 叙述模式入门',
    subtitle: '小说式的全屏文本叙事——消除对话框、沉浸阅读',
    category: 'NVL 叙述模式',
    level: '进阶',
    icon: 'N1',
    tags: ['NVL', '叙述', '全屏', 'kind', '小说'],
    content: `## 功能作用
启用全屏文本滚动模式，像传统视觉小说一样文字铺满整个画面，没有底部对话框，适合大量叙事段落。

## 通俗解释
默认的 ADV 模式像漫画的对话框——一次一句。NVL 模式则像翻书：文字从画面中间逐行滚出，旧的文字不会消失，而是不断堆叠直到满屏。适合信息量大的旁白、长篇独白、恐怖游戏的氛围描写。

## 避坑提示
- 角色定义时要加 kind=nvl 参数。
- NVL 和 ADV 可以在同一游戏中混用。
- NVL 模式下文字会堆叠，记得用 nvl clear 清屏。`,
    codeExample: `define narrator = Character(kind=nvl)
define e = Character("艾琳", kind=nvl)

label start:
    narrator "这是一个 NVL 模式的演示。"
    narrator "所有的文字都会堆叠显示。"
    narrator "而不是弹出新的对话框。"

    nvl clear
    e "清屏后重新开始。"
    return`,
  },
  {
    id: 'nvl-advanced',
    title: 'NVL 高级混合',
    subtitle: 'ADV 与 NVL 模式自由切换 + 自定义 NVL 窗口样式',
    category: 'NVL 叙述模式',
    level: '高级',
    icon: 'N2',
    tags: ['NVL', 'ADV', '混合', '窗口', '自定义'],
    content: `## 功能作用
在同一游戏中实现 ADV（对话框）和 NVL（全屏文本）模式的自由切换，并自定义 NVL 窗口的外观。

## 通俗解释
你可以在剧情高潮时用 ADV 模式让人物对话更有冲击力，在回忆/独白/背景介绍时切换到 NVL 模式增强沉浸感。还可以自定义 NVL 的菜单样式、文字间距、背景透明度等。

## 避坑提示
- 混用两个模式：一个角色用 kind=nvl，另一个不用即可。
- NVL 菜单（选项）出现在画面中央，和 ADV 菜单（在对话框内）不同。
- 大段 NVL 文字后记得 nvl clear，否则旧文字会一直堆着。`,
    codeExample: `define n = Character(kind=nvl)
define e = Character("艾琳")          # 默认 ADV 模式

label start:
    n "这是 NVL 模式的旁白叙述。"
    n "适合大段的背景介绍和独白。"

    e "而我是普通对话框模式！"        # 自动切回 ADV

    nvl clear
    n "清屏完毕。"
    return`,
  },

  // ========================================================================
  // 第四章：Screen 自定义界面
  // ========================================================================
  {
    id: 'custom-screens',
    title: '自定义界面 Screen 基础',
    subtitle: '创建属于你自己的 UI——按钮、进度条、图片菜单',
    category: 'Screen 自定义界面',
    level: '进阶',
    icon: 'S1',
    tags: ['screen', 'UI', '界面', 'button', 'vbox', 'hbox'],
    content: `## 功能作用
用 Screen 语言创建自定义 UI 界面，不再受限于游戏默认的菜单样式。

## 通俗解释
Ren'Py 自带保存/读取/设置界面，但如果你想做一个酷炫的自定义标题画面、角色状态面板、或者一个带滚动条的日志界面——就需要 Screen。Screen 提供了按钮、文本框、进度条、网格布局等 UI 组件，可以任意组合。

## 避坑提示
- screen 定义后需要通过 show screen 或 call screen 来显示。
- show screen 不阻塞游戏进程（后台运行），call screen 会暂停游戏等你交互。
- 布局用 vbox（垂直排列）、hbox（水平排列）、grid（网格）、fixed（绝对定位）。`,
    codeExample: `screen character_status():
    frame:
        xalign 0.02 yalign 0.02
        vbox:
            text "角色状态" size 24
            text "好感度: [affection]"
            text "金币: [gold]"
            bar value affection range 10
            textbutton "关闭" action Hide("character_status")

label start:
    show screen character_status
    "你可以随时看到角色状态面板。"
    hide screen character_status
    return`,
  },
  {
    id: 'screen-actions',
    title: 'Screen Action 动作系统',
    subtitle: '理解所有 Screen 交互动作——跳转、调用、设置变量',
    category: 'Screen 自定义界面',
    level: '进阶',
    icon: 'S2',
    tags: ['screen', 'action', '交互', 'jump', 'call', 'setVariable'],
    content: `## 功能作用
让 Screen 上的按钮和交互元素真正"做事"——跳转场景、调用函数、修改变量。

## 通俗解释
光画一个按钮不够，你得告诉它"点这个按钮之后干什么"。这就是 Action——绑在按钮上的行为指令。Jump 跳场景、Call 调 label、SetVariable 修改变量、Show/Hide 开关界面。

## 避坑提示
- 一个按钮可以绑定多个 Action，用方括号 [Action1, Action2] 包裹。
- If() 可以在 action 里做条件判断：[If(condition, true_action, false_action)]。
- 常用的还有 Return() 返回调用处的值、Quit() 退出游戏。`,
    codeExample: `screen main_menu_custom():
    vbox:
        xalign 0.5 yalign 0.5
        spacing 20
        text "我的游戏" size 48
        textbutton "开始游戏" action Start()
        textbutton "继续" action Continue()
        textbutton "设置" action ShowMenu("preferences")
        textbutton "退出" action Quit()
        textbutton "测试" action [SetVariable("affection", 5), Jump("test")]`,
  },
  {
    id: 'screen-timer',
    title: 'Screen Timer 定时器',
    subtitle: '在 Screen 中添加倒计时/定时刷新/延迟动作',
    category: 'Screen 自定义界面',
    level: '进阶',
    icon: 'S3',
    tags: ['timer', '定时', '倒计时', '刷新', 'screen'],
    content: `## 功能作用
在 Screen 中设置定时执行的逻辑——倒计时后自动跳转、定期刷新变量显示、延迟触发动画。

## 通俗解释
就像闹钟——你可以告诉 Screen "3 秒后执行这个动作"或"每 1 秒刷新一次"。这在做限时选择、自动推进的过场动画、实时更新的计时器 UI 时非常有用。

## 避坑提示
- timer 的时间单位是秒。
- repeat True 让定时器循环执行，否则只执行一次。
- 定时器在 screen 被 hide 后自动停止。`,
    codeExample: `screen countdown():
    timer 5.0 action Jump("timeout")
    text "你只有 5 秒！" xalign 0.5 yalign 0.3 size 30

    timer 1.0 repeat True action Function(update_clock)
    text "时间: [clock]" xalign 0.5 yalign 0.4

label start:
    call screen countdown
    return

label timeout:
    "时间到！"
    return`,
  },
  {
    id: 'screen-input',
    title: 'Screen Input 输入框',
    subtitle: '让玩家输入文字——角色命名、密码、注释',
    category: 'Screen 自定义界面',
    level: '进阶',
    icon: 'S4',
    tags: ['input', '输入', '命名', 'screen', '键盘'],
    content: `## 功能作用
在 Screen 中添加文本输入框，让玩家可以输入角色名、密码或任何自由文本。

## 通俗解释
很多游戏会让玩家给主角起名字——这就需要 input 组件。你可以设置输入框的默认值、最大长度、是否只允许特定字符。输入的内容可以存到变量里，后续剧情中用 [变量名] 来显示。

## 避坑提示
- input 的 value 绑定到一个 VariableInputValue 对象。
- 可以用 allow 参数限制允许输入的字符集。
- 回车键默认提交输入，可以设 changed 动作在每次输入变化时触发。`,
    codeExample: `default player_name = ""

screen name_input():
    vbox:
        xalign 0.5 yalign 0.4
        text "请输入你的名字："
        input:
            value VariableInputValue("player_name")
            length 12
        text "你好，[player_name]！"

label start:
    call screen name_input
    return`,
  },
  {
    id: 'screen-use',
    title: 'Screen 样式继承 Use',
    subtitle: '用 use 复用 Screen 布局——组件化、模板化',
    category: 'Screen 自定义界面',
    level: '高级',
    icon: 'S5',
    tags: ['use', '继承', '复用', '组件', 'screen'],
    content: `## 功能作用
在 Screen 中通过 use 复用已有 Screen 的布局，像编程中的"函数调用"一样避免重复代码。

## 通俗解释
如果你有两个界面都需要同样的标题栏、页脚或按钮组，不用复制粘贴——写一个基础 screen，然后在新 screen 中用 use 引用它。这就像 HTML 里 include 一个公共 header。

## 避坑提示
- use 引用的 screen 可以传参数，用括号传参如 use title_bar("设置")。
- 被引用的 screen 中不能有 call screen 等阻塞操作。
- 通过 use 可以实现组件化——把复杂界面拆成小模块再组合。`,
    codeExample: `screen title_bar(title_text):
    frame:
        xalign 0.5 yalign 0.05
        text title_text size 28

screen settings_page():
    use title_bar("设置")
    vbox:
        xalign 0.5 yalign 0.5
        textbutton "音量" action NullAction()
        textbutton "返回" action Return()
`,
  },

  // ========================================================================
  // 第五章：流程控制
  // ========================================================================
  {
    id: 'call-return',
    title: 'Call / Return 子剧情',
    subtitle: '像函数一样调用子场景，执行完自动返回',
    category: '流程控制',
    level: '进阶',
    icon: 'F1',
    tags: ['call', 'return', '子剧情', '函数', '复用'],
    content: `## 功能作用
用 call 调用一段子剧情，执行完自动回到调用点继续——避免重复写相同的场景片段。

## 通俗解释
如果游戏里有多条路线都要经过同一个场景（比如"去商店买东西"），不用在每条路线里复制粘贴这段剧本。把它写成一个独立 label，用 call 调用，执行完 return 就自动回到原来的位置继续。

## 避坑提示
- call 和 jump 的区别：jump 是一去不回，call 是去完回来。
- 子剧情末尾必须有 return，否则游戏会报错。
- call 可以嵌套：A call B，B call C，C return 会先回到 B。`,
    codeExample: `label start:
    "准备出门。"
    call go_to_shop
    "从商店回来了。"
    return

label go_to_shop:
    "你走进了商店。"
    "买了些东西。"
    return`,
  },
  {
    id: 'save-load',
    title: '存档与读档精讲',
    subtitle: `掌握 Ren'Py 的存档机制——自定义存档页面与存档点`,
    category: '流程控制',
    level: '进阶',
    icon: 'F2',
    tags: ['存档', 'save', 'load', 'persistent', 'slot'],
    content: `## 功能作用
让玩家在任何时候保存游戏进度，下次继续——并自定义存档界面的外观。

## 通俗解释
Ren'Py 自带存档系统（右键/ESC 打开菜单），但你可以自定义存档页面的样式、存档槽的预览图、存档时的自动截图。还可以用 $ renpy.force_autosave() 在关键剧情点强制自动存档。

## 避坑提示
- Ren'Py 自动处理存档/读档，你不需要自己存变量。
- 存档界面的自定义需要通过 screen file_slots 来覆盖默认界面。
- 如果有不应被存档的临时变量，在 label 后用 python: 块定义。`,
    codeExample: `label start:
    "游戏开始。"

    "这里是关键选择前……"
    $ renpy.force_autosave()

menu:
    "选左":
        "左边的故事。"
    "选右":
        "右边的故事。"
    return`,
  },
  {
    id: 'rollback-system',
    title: '回滚机制',
    subtitle: `理解 Ren'Py 的回滚——何时回滚、何时阻止回滚`,
    category: '流程控制',
    level: '进阶',
    icon: 'F3',
    tags: ['回滚', 'rollback', 'rollforward', '阻止', 'hard'],
    content: `## 功能作用
控制 Ren'Py 的回滚/前进行为——在特定场景阻止回滚或实现自定义回滚逻辑。

## 通俗解释
Ren'Py 默认允许玩家用鼠标滚轮回退到之前的对话——就像翻回上一页。但在某些特殊场景（如随机抽卡、密码输入、战斗结算）需要禁用回滚防止玩家"刷结果"。

## 避坑提示
- $ renpy.block_rollback() 阻止玩家回滚到当前行之前。
- 在 label 开头加这条可以防止玩家重复进入这个场景刷结果。
- 回滚不是存档——关掉游戏后回滚记录就消失了。`,
    codeExample: `label random_event:
    $ renpy.block_rollback()

    $ result = renpy.random.randint(1, 3)
    if result == 1:
        "你抽到了稀有物品！"
    elif result == 2:
        "你抽到了普通物品。"
    else:
        "什么也没抽到……"
    return`,
  },
  {
    id: 'persistent-data',
    title: '持久化数据与多周目',
    subtitle: '跨存档保存数据——成就、解锁、多周目状态',
    category: '流程控制',
    level: '高级',
    icon: 'F4',
    tags: ['持久化', 'persistent', '多周目', '成就', '全局'],
    content: `## 功能作用
用 persistent 变量保存跨存档的全局数据——即使玩家删除所有存档，这些数据依然保留。

## 通俗解释
normal 变量（default 定义的）只在当前游戏进程中有效，读档后会回到存档时的值。persistent 变量则像"永久存储"——完成全路线后解锁的 CG 画廊、多周目才能触发的隐藏剧情、成就列表——这些数据存一次，永久有效。

## 避坑提示
- persistent 变量前面加 persistent. 前缀，如 persistent.total_plays。
- 只能在 init python 块或 python 块中修改 persistent 变量。
- 玩家卸载游戏后 persistent 数据也会丢失（除非用了云存储）。`,
    codeExample: `label start:
    $ persistent.total_plays += 1
    "这是你第 [persistent.total_plays] 次玩这个游戏。"

    if persistent.total_plays >= 3:
        "你已经玩了 3 次以上！解锁隐藏内容。"
    return`,
  },

  // ========================================================================
  // 第六章：Python 内联与图像处理
  // ========================================================================
  {
    id: 'python-blocks',
    title: 'Python 代码块内联',
    subtitle: `在 Ren'Py 中直接写 Python 逻辑——循环、函数、复杂计算`,
    category: 'Python 内联',
    level: '高级',
    icon: 'P1',
    tags: ['python', 'init', '函数', '循环', '类'],
    content: `## 功能作用
在 Ren'Py 脚本中直接嵌入 Python 代码，实现 Ren'Py 语句做不到的复杂逻辑。

## 通俗解释
Ren'Py 本身是 Python 写的，所以你可以随时"切到 Python 模式"写原生 Python 代码。用 init python: 在游戏启动时定义函数和类，用 python: 在剧情中执行一段 Python 逻辑。这让 Ren'Py 几乎是图灵完备的。

## 避坑提示
- $ 开头的单行语句等价于 python: 块中的一行。
- init python: 里的代码在游戏启动时执行一次，适合定义工具函数。
- 不要在 python 块里直接用 Ren'Py 语句（show/hide 等），要用 renpy.show() 函数版。`,
    codeExample: `init python:
    def calculate_ending(affection, trust):
        if affection >= 8 and trust >= 6:
            return "true_ending"
        elif affection >= 5:
            return "good_ending"
        else:
            return "normal_ending"

label start:
    $ result = calculate_ending(7, 5)
    "计算结果：[result]"
    return`,
  },
  {
    id: 'image-manipulators',
    title: 'im 图像操作指令',
    subtitle: '用 im 指令运行时处理图像——缩放、裁剪、翻转、调色',
    category: 'Python 内联',
    level: '高级',
    icon: 'P2',
    tags: ['im', '图像', '缩放', '裁剪', '翻转', '调色'],
    content: `## 功能作用
在游戏运行时对图像进行缩放、裁剪、翻转、调色等处理，而不需要提前用 Photoshop 准备多套素材。

## 通俗解释
假设你只有一个角色的正面全身图，但需要各种尺寸和角度——im.Scale 缩放、im.Flip 水平翻转、im.Crop 裁剪局部。这些指令在 init 阶段处理图像，运行时直接用处理好的版本。

## 避坑提示
- im 指令只在 init 阶段执行（游戏启动时），不能在剧情中动态调用。
- 处理大量图片可能拖慢游戏启动速度。
- 如果需要运行时动态切换图，用 ConditionSwitch 或动态 Displayable。`,
    codeExample: `image eileen_tiny = im.Scale("eileen.png", 200, 300)
image eileen_flip = im.Flip("eileen.png", horizontal=True)
image eileen_face = im.Crop("eileen.png", (50, 20, 200, 200))
image eileen_dark = im.MatrixColor(
    "eileen.png",
    im.matrix.brightness(-0.3)
)

label start:
    show eileen_tiny
    "缩小的立绘。"
    return`,
  },
  {
    id: 'matrixcolor',
    title: '图像颜色滤镜 Matrixcolor',
    subtitle: '实时给图像叠加颜色矩阵——灰度、反色、色调变换',
    category: 'Python 内联',
    level: '高级',
    icon: 'P3',
    tags: ['matrixcolor', '滤镜', '颜色', '灰度', '反色', '色调'],
    content: `## 功能作用
通过 matrixcolor 属性给任意 Displayable 叠加颜色滤镜——灰度化、反色、色调偏移等。

## 通俗解释
matrixcolor 就像 Instagram 滤镜：可以把彩色图片变成黑白、给画面加一层暖色或冷色、让所有颜色反相。它比 im.MatrixColor 更强大，因为可以在 ATL 动画中实时过渡。

## 避坑提示
- matrixcolor 是 ATL 属性，必须写在 transform 块或 at 从句中。
- 常用矩阵：BrightnessMatrix、SaturationMatrix、TintMatrix、OpacityMatrix。
- 多个滤镜可以乘在一起：matrixcolor BrightnessMatrix(-0.2) * TintMatrix("#ffaa88")。`,
    codeExample: `transform grayscale_fade:
    matrixcolor SaturationMatrix(1.0)    # 开始：正常
    linear 2.0 matrixcolor SaturationMatrix(0.0)  # 2秒变黑白

transform night_tint:
    matrixcolor TintMatrix("#224466")

label start:
    show bg room at night_tint
    "画面加了蓝色夜间滤镜。"

    show eileen happy at grayscale_fade
    "艾琳慢慢变成黑白的……"
    return`,
  },
  {
    id: 'layered-image',
    title: '分层立绘系统 LayeredImage',
    subtitle: '用 layers 构建立绘——表情、服装、饰品随意组合',
    category: 'Python 内联',
    level: '高级',
    icon: 'P4',
    tags: ['layered', '分层', '立绘', '组合', '表情'],
    content: `## 功能作用
将立绘拆分为多层（身体、表情、服装、饰品），在游戏中动态组合，大幅减少素材数量。

## 通俗解释
不要为"艾琳微笑穿红衣"和"艾琳生气穿蓝衣"各画一张完整图。把立绘拆成：身体底层 + 表情层（笑/怒/悲）+ 服装层（红/蓝/黑）+ 饰品层（帽子/眼镜）。游戏中任意组合，20 张素材 → 几百种搭配。

## 避坑提示
- layeredimage 需要先定义 attributes，每个 attribute 对应一个图像变体。
- 素材文件命名规则：角色名_属性_层级.png，如 eileen_happy_face.png。
- 适用 face/outfit/accessory 等常规分层，也可以用 always 层固定不变的部分。`,
    codeExample: `layeredimage eileen:
    always "eileen_base"
    group outfit:
        attribute casual default "eileen_casual"
        attribute formal "eileen_formal"
    group face:
        attribute happy default "eileen_happy"
        attribute sad "eileen_sad"
        attribute angry "eileen_angry"

label start:
    show eileen happy casual
    "艾琳微笑常服。"
    show eileen sad formal
    "艾琳伤心正装。"
    return`,
  },
  {
    id: 'achievements',
    title: '成就系统',
    subtitle: '用 Achieve 构建完整的成就追踪与展示界面',
    category: 'Python 内联',
    level: '高级',
    icon: 'P5',
    tags: ['成就', 'achieve', 'persistent', '解锁', '收集'],
    content: `## 功能作用
在游戏中添加成就系统——追踪玩家完成特定事件、解锁隐藏的成就徽章。

## 通俗解释
成就就是"做某件事 → 记一笔 → 展示给玩家看"。用 persistent 变量记录哪些成就已解锁，用 Achievement 对象定义每个成就的名称和描述。玩家可以在成就页面看到已解锁和未解锁的成就。

## 避坑提示
- 成就数据必须放在 persistent 里，否则存档/读档后丢失。
- Achievement.register 在游戏启动时注册所有成就。
- Achievement.grant 在玩家达成条件时触发，可用 Achievement.has() 判断。`,
    codeExample: `init python:
    achievement_complete = Achievement(
        "complete", "通关", "完成所有路线", persistent=True
    )
    achievement_complete.register()

label end_of_game:
    $ achievement_complete.grant()
    "恭喜！成就「通关」已解锁。"
    return`,
  },

  // ========================================================================
  // 第七章：音频精讲
  // ========================================================================
  {
    id: 'play-statements',
    title: '音频通道与多轨混音',
    subtitle: '深入掌握 music/sound/voice 三条独立音频通道',
    category: '音频精讲',
    level: '进阶',
    icon: 'M1',
    tags: ['音频', '通道', '混音', 'music', 'sound', 'voice'],
    content: `## 功能作用
理解 Ren'Py 的三条独立音频通道——music（背景音乐）、sound（音效）、voice（语音），以及如何控制各自的音量。

## 通俗解释
三条通道就像调音台上的三个推子：music 推子控制 BGM 音量，sound 推子控制音效音量，voice 推子控制角色语音音量。它们是独立的——你可以把 BGM 开小但保留语音正常音量。

## 避坑提示
- 每条通道有独立的音量，通过 _preferences 修改或在脚本中用 $ renpy.music.set_volume()。
- play 的 channel 参数可以指定自定义通道名，超出三条默认通道。
- stop 后面跟通道名来指定静音哪条通道。`,
    codeExample: `label start:
    play music "town.ogg" fadein 2.0    # music 通道
    play sound "steps.wav"               # sound 通道
    voice "e_001.ogg"                    # voice 通道

    e "三条通道同时播放。"

    stop music fadeout 1.0               # 只停 BGM
    stop sound                            # 停音效
    return`,
  },
  {
    id: 'audio-with-atl',
    title: '音频与 ATL 同步',
    subtitle: '让动画节奏与音频完美配合——按节拍切换画面',
    category: '音频精讲',
    level: '高级',
    icon: 'M2',
    tags: ['音频', '同步', 'ATL', '节拍', 'lip-sync'],
    content: `## 功能作用
让动画时间与音频播放精确同步——根据音乐节拍切换画面、对口型等。

## 通俗解释
比如一段 BGM 的第 2.5 秒有个重拍，你想在那一瞬间切换场景。用 ATL 的 pause 精确等待，或者用 renpy.music.get_pos() 获取当前播放位置来触发事件。这种对节奏的控制让过场动画像剪辑过一样。

## 避坑提示
- renpy.music.get_pos() 返回当前音乐播放位置（秒），可以用来做精确触发。
- 不同设备的音频延迟不同，不建议用极端精确（< 0.1 秒）的同步。
- 如需完美同步，考虑在视频编辑软件中完成再导入。`,
    codeExample: `label start:
    play music "epic_theme.ogg"

    show eileen happy
    "第 1 秒：艾琳出场。"

    show eileen sad
    "第 3 秒：表情变化。"
    # 实际使用时可以用 get_pos() 配合条件判断
    return`,
  },

  // ========================================================================
  // 第八章：高阶实战
  // ========================================================================
  {
    id: 'translation',
    title: '多语言翻译',
    subtitle: '为你的游戏生成翻译模板——支持中/英/日等多语言',
    category: '高阶实战',
    level: '高级',
    icon: 'H1',
    tags: ['翻译', '多语言', 'generate', 'translate', '本地化'],
    content: `## 功能作用
让你的游戏支持多语言——Ren'Py 内置翻译框架，可以生成翻译模板并加载翻译文件。

## 通俗解释
写好中文版剧本后，Ren'Py 可以自动生成一个翻译文件（.rpy）。翻译者只需把文件里的中文替换成英文/日文，然后放回 game/tl/ 目录下。玩家在设置里切换语言，所有台词自动变成对应语言。

## 避坑提示
- 用 Ren'Py Launcher 的"Generate Translations"生成翻译模板。
- 翻译文件在 game/tl/<语言名>/ 目录下。
- 在脚本中用 _("text") 标记可翻译字符串，对 UI 文字尤其重要。`,
    codeExample: `# 原始脚本
label start:
    e "你好！"
    e _("欢迎来到我的世界。")    # 标记可翻译
    return

# 翻译文件 game/tl/english/common.rpy
# translate english start:
#     e "Hello!"
#     e _("Welcome to my world.")`,
  },
  {
    id: 'game-config',
    title: '游戏配置与环境',
    subtitle: '定制游戏窗口标题、分辨率、存档数量等全局设置',
    category: '高阶实战',
    level: '进阶',
    icon: 'H2',
    tags: ['配置', '窗口', '分辨率', '存档', 'config'],
    content: `## 功能作用
通过 config 变量和 gui.rpy 修改游戏全局设置——窗口大小、标题、存档槽数、自动存档频率等。

## 通俗解释
游戏窗口的标题、默认分辨率、最多能存几个档、鼠标图标长什么样——这些都在 gui.rpy 和 options.rpy 里配置。就像设置手机偏好——改一次全局生效。

## 避坑提示
- 窗口标题在 options.rpy 的 config.name 中修改。
- 分辨率在 gui.rpy 的 gui.init() 中设定。
- 修改默认存档槽数：define config.autosave_slots = 10。`,
    codeExample: `# options.rpy
define config.name = "我的游戏"
define config.version = "1.0"

# gui.rpy
define gui.text_size = 24
define config.autosave_slots = 10
define config.has_autosave = True`,
  },
  {
    id: 'performance',
    title: '性能优化',
    subtitle: '提升游戏运行流畅度——图像缓存、预测加载、减少卡顿',
    category: '高阶实战',
    level: '高级',
    icon: 'H3',
    tags: ['性能', '优化', '缓存', '预测', '内存'],
    content: `## 功能作用
优化 Ren'Py 游戏的运行流畅度——减少画面切换卡顿、控制内存占用、预测加载即将用到的素材。

## 通俗解释
大型游戏在切换场景/显示新立绘时可能出现短暂卡顿——因为 Ren'Py 需要从硬盘读图片到内存。用 renpy.start_predict() 提前告诉引擎"下一页要用这些图"，引擎会在后台偷偷加载好。

## 避坑提示
- 大图（>2000px）越多，加载越慢——尽量用适合屏幕分辨率的图。
- 图片格式推荐 WebP，体积比 PNG 小很多。
- 用 config.image_cache_size 控制内存中缓存的图片数量。`,
    codeExample: `label start:
    $ renpy.start_predict("bg_garden", "eileen_happy")
    "正在预加载下一场景的素材……"

    scene bg garden
    show eileen happy
    "因为提前加载了，切换非常流畅。"
    $ renpy.stop_predict("bg_garden")
    return`,
  },
  {
    id: 'packaging',
    title: '打包与发布',
    subtitle: '将游戏导为 Windows/Mac/Linux/Android 独立安装包',
    category: '高阶实战',
    level: '高级',
    icon: 'H4',
    tags: ['打包', '发布', '导出', 'build', '分发'],
    content: `## 功能作用
将完成的 Ren'Py 游戏打包成独立运行的安装包，分发给玩家无需安装 Ren'Py。

## 通俗解释
写完游戏后在 Ren'Py Launcher 里点"Build Distributions"，它会把你的剧本+图片+音频打包成一个 .exe（Windows）或 .app（Mac）或 .apk（Android）。玩家下载后直接运行就行，不需要装任何额外软件。

## 避坑提示
- 打包前务必删除临时文件和未使用的素材，减少包体积。
- Windows 建议同时生成 zip 和 installer 两种格式。
- 发布前在目标平台上完整测试一遍，尤其是 Mac/Linux 路径区分大小写的问题。`,
    codeExample: `# 在 Ren'Py Launcher 中：
# 1. 点"Build Distributions"
# 2. 选 Windows / Mac / Linux / Android
# 3. 等待打包完成
# 4. 产物在 game/../ 父目录的 dist/ 文件夹中`,
  },
  {
    id: 'accessibility',
    title: '无障碍与辅助功能',
    subtitle: '为视障/听障玩家优化——自动朗读、字幕、高对比度',
    category: '高阶实战',
    level: '高级',
    icon: 'H5',
    tags: ['无障碍', '辅助', '朗读', '字幕', '对比度'],
    content: `## 功能作用
为游戏添加无障碍辅助功能，让视障或听障玩家也能享受游戏。

## 通俗解释
通过启用 self-voicing（自动朗读）模式，Ren'Py 可以用系统 TTS 引擎把台词读出来。通过字幕和视觉提示，听障玩家可以获取音频信息。高对比度模式帮助低视力玩家看清 UI。

## 避坑提示
- self-voicing 默认按 V 键开关，可在设置中显示开关按钮。
- 关键信息不要只通过颜色传递——加上图标或文字。
- 重要的音频信息应同步显示视觉提示（如"🔔 铃声响起"）。`,
    codeExample: `# 在 screen preferences 中添加一行即可：
textbutton _("自动朗读") action Preference("self voicing", "toggle")

label start:
    "这段文字在自动朗读模式下会被读出来。"
    play sound "alarm.wav"
    "{i}警铃响起！{/i}"        # 视觉提示配合音效
    return`,
  },
  {
    id: 'community',
    title: '帮助与社区',
    subtitle: '遇到问题时去哪里求助——官方文档、中文社区、教程资源',
    category: '高阶实战',
    level: '入门',
    icon: 'H6',
    tags: ['帮助', '社区', '文档', '论坛', '教程'],
    content: `## 功能作用
了解 Ren'Py 的官方资源和中文社区，遇到问题时知道该去哪里找答案。

## 通俗解释
Ren'Py 有非常完善的官方文档（英文）和活跃的中文社区。官方文档是百科全书，社区是问答广场。遇到问题上论坛搜一下，大概率别人已经踩过同样的坑并给出了解决方案。

## 避坑提示
- 官方文档：renpy.org/doc/html（最新版）
- 中文社区：renpy.cn 论坛、B站/知乎上的 Ren'Py 教程
- 提问前先搜索——80% 的问题已有答案。
- 提问题时附上相关代码片段和报错信息，更容易获得帮助。`,
    codeExample: `# 学习路线推荐：
# 1. Ren'Py 官方快速入门（The Question 项目）
# 2. 官方文档的 GUI 定制章节
# 3. renpy.cn 中文教程与实践案例
# 4. Lemma Soft Forums 英文社区（lemmasoft.renai.us）`,
  },
]

export function getLessonById(id: string): SyntaxLesson | undefined {
  return SYNTAX_LESSONS.find((l) => l.id === id)
}

export function getLessonsByCategory(cat: string): SyntaxLesson[] {
  return SYNTAX_LESSONS.filter((l) => l.category === cat)
}

export function searchLessons(query: string): SyntaxLesson[] {
  const q = query.toLowerCase()
  return SYNTAX_LESSONS.filter(
    (l) =>
      l.title.toLowerCase().includes(q) ||
      l.subtitle.toLowerCase().includes(q) ||
      l.tags.some((t) => t.toLowerCase().includes(q)) ||
      l.content.toLowerCase().includes(q)
  )
}
