/**
 * ============================================================
 * Ren'Py 语法学院（Syntax Academy）—— v0.9.0
 * ============================================================
 * 模块化中文图文教学，将 Ren'Py 官方语法解构为卡片式教程。
 * 每张卡片含：基础讲解、代码范例（可插入剧本）、进阶提示。
 */

export interface SyntaxLesson {
  id: string
  /** 模块标题 */
  title: string
  /** 子标题（一句话摘要） */
  subtitle: string
  /** 分类 */
  category: string
  /** 难度 */
  level: '入门' | '进阶' | '高级'
  /** 正文 Markdown（图文教学内容） */
  content: string
  /** 代码范例（核心，可直接插入时间轴的 .rpy 片段） */
  codeExample: string
  /** 可插入的完整 label 块（含 label 头尾） */
  insertableLabel?: string
  /** 搜索关键词 */
  tags: string[]
  /** 关联特效/插件 ID */
  related?: string[]
  /** 图标（emoji 字符串） */
  icon: string
}

export const SYNTAX_LESSONS: SyntaxLesson[] = [
  // ============================================================
  // 第一章：基础入门
  // ============================================================
  {
    id: 'hello-world',
    title: 'Hello Ren\'Py——第一行剧本',
    subtitle: '从零开始写出你的第一句对话',
    category: '基础语法',
    level: '入门',
    icon: '1',
    tags: ['入门', 'hello', '对话', 'say', 'define', 'label'],
    content: `## 最小的 Ren'Py 脚本

只需要三行就能让角色说话：

1. **define** —— 定义一个角色（Character）
2. **label** —— 标记一个场景/章节的入口
3. **角色名 + 引号** —— 让角色说出台词

Character 的第一个参数是显示名（玩家看到的），后面可以跟各种属性。

label 后面跟一个标识符，用冒号结尾。Ren'Py 从 start 标签开始执行。`,
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
    category: '基础语法',
    level: '入门',
    icon: '2',
    tags: ['立绘', 'image', 'show', 'hide', 'scene', 'position'],
    content: `## 图像显示指令

Ren'Py 用 **show** / **hide** / **scene** 三条指令管理舞台上的图像：

- **show** —— 在舞台上显示一张图片（不隐藏已有的）
- **hide** —— 从舞台移除一张图片
- **scene** —— 清除舞台所有图片，可紧接着显示新背景

图片可以用 **at** 子句指定位置：center、left、right、offscreenleft 等。用 with 子句添加过渡效果。

图片必须先用 **image** 语句注册，指定 tag（标签）和文件路径。`,
    codeExample: `# 注册图片
image bg classroom = "classroom.jpg"
image eileen happy = "eileen_happy.png"
image eileen sad = "eileen_sad.png"

label start:
    scene bg classroom
    with fade

    show eileen happy at center
    with dissolve
    e "我在教室中间。"

    show eileen sad at left
    with dissolve
    e "现在换了个表情，移动到左边。"

    hide eileen
    with dissolve
    "艾琳离开了。"`,
    insertableLabel: `label image_demo:
    scene bg classroom with fade
    show eileen happy at center with dissolve
    e "你好。"
    hide eileen with dissolve
    return`,
    related: ['dissolve', 'fade'],
  },
  {
    id: 'menus-jumps',
    title: '选项菜单与跳转',
    subtitle: 'menu 分支 + label 跳转构建分歧剧情',
    category: '基础语法',
    level: '入门',
    icon: '3',
    tags: ['menu', 'jump', '选择支', '分支', 'label', 'choice'],
    content: `## 创造选择支

**menu** 语句是视觉小说的灵魂。每个选项可以跳转（jump）到不同的 label，形成故事分歧。

语法：
\`\`\`
menu:
    "选项文字":
        jump 目标标签名
\`\`\`

**jump** 跳转到指定 label；**call** 跳转后可以用 **return** 返回原位。

label 命名建议用英文下划线命名法（如 'forest_path'），中文 label 在部分导出场景可能有问题。`,
    codeExample: `label crossroads:
    menu:
        "往左走——进入森林":
            jump forest_path
        "往右走——前往村庄":
            jump village_gate
        "站在原地不动":
            "你决定先观察一下四周。"
            jump crossroads

label forest_path:
    "茂密的树林遮住了天空..."
    return

label village_gate:
    "村庄的守卫拦住了你。"
    return`,
    insertableLabel: `label my_choice:
    menu:
        "选项 A":
            jump choice_a
        "选项 B":
            jump choice_b

label choice_a:
    "你选择了 A。"
    return

label choice_b:
    "你选择了 B。"
    return`,
  },
  {
    id: 'variables-conditions',
    title: '变量与条件判断',
    subtitle: '数值、布尔、字符串变量与 if/elif/else',
    category: '基础语法',
    level: '入门',
    icon: '4',
    tags: ['变量', 'if', '赋值', 'python', '条件', '数值'],
    content: `## 游戏变量

Ren'Py 支持三种变量声明方式：

- **default** —— 游戏变量（会被存档保存/读取）
- **define** —— 常量/配置（存档不会保存）
- **\$ 开头** —— 单行 Python 语句

常用运算符：==（等于）、!=（不等于）、>=、<=、>、<。

if/elif/else 块可以放在任何地方，包括 menu 选项前面。`,
    codeExample: `# 定义变量
default affection = 0
default has_sword = False

label start:
    "你遇到了一位少女。"
    menu:
        "帮助她":
            $ affection += 10
            "少女感激地笑了。"
        "无视她":
            $ affection -= 5
            "少女失落地离开了。"

    if affection >= 5:
        "少女对你的好感度很高。"
    elif affection >= 0:
        "你们的关系还算正常。"
    else:
        "少女似乎对你有些失望。"

    "当前好感度：[affection]"`,
    insertableLabel: `label variable_demo:
    $ score = 0
    menu:
        "选项 +10":
            $ score += 10
        "选项 -5":
            $ score -= 5
    if score >= 5:
        "得分优秀。"
    else:
        "得分偏低。"
    return`,
  },

  // ============================================================
  // 第二章：ATL 动画
  // ============================================================
  {
    id: 'atl-basics',
    title: 'ATL 入门——让画面动起来',
    subtitle: 'transform 定义 + linear/ease 语句',
    category: 'ATL 动画',
    level: '进阶',
    icon: '5',
    tags: ['ATL', 'transform', '动画', '移动', 'linear', 'ease', 'zoom'],
    content: `## ATL (Animation and Transformation Language)

ATL 是 Ren'Py 内置的动画语言，写在 **transform** 块中。每个 transform 是一组动画指令序列。

核心指令：
- **linear 时长** —— 在指定秒数内平滑过渡到下一条指令
- **ease 时长** —— 缓入缓出（加速→减速）过渡
- **pause 时长** —— 等待若干秒
- **repeat** —— 重复整个动画
- **parallel** —— 多属性同时执行

可修改的属性：xpos/ypos/xalign/yalign（位置）、zoom（缩放）、rotate（旋转）、alpha（透明度）、xoffset/yoffset（偏移）。`,
    codeExample: `# 定义动画
transform slide_in_from_right:
    xalign 1.0     # 从右侧屏外
    linear 0.5 xalign 0.5   # 0.5秒滑到中间

transform breathe:
    zoom 1.0
    linear 2.0 zoom 1.05    # 放大
    linear 2.0 zoom 1.0     # 缩回
    repeat

transform entrance:
    alpha 0.0 xalign 0.3
    parallel:
        linear 0.4 alpha 1.0            # 淡入
    parallel:
        ease 0.6 xalign 0.5             # 滑入
    ease 0.4 zoom 1.1                   # 弹性放大
    ease 0.3 zoom 1.0                   # 回弹`

label atl_demo:
    show eileen happy at slide_in_from_right
    e "我从右边滑进来了。"
    show eileen happy at breathe
    e "现在我在呼吸动画中。"`,
    insertableLabel: `label atl_demo:
    show eileen happy at entrance with dissolve
    e "这是入场动画。"
    return`,
    related: ['tf-pos', 'tf-rot', 'atl'],
  },
  {
    id: 'atl-camera',
    title: '镜头运镜——Pan / Zoom / Shake',
    subtitle: '用 camera 语句操控3D摄像机',
    category: 'ATL 动画',
    level: '进阶',
    icon: '6',
    tags: ['camera', 'camera3d', '运镜', '摇镜', '缩放', '震动', '3D Stage'],
    content: `## 3D 镜头系统

Ren'Py 从 7.4 开始引入 **3D Stage**，通过 camera 语句可以像电影摄影师一样操控摄像机：

- **camera** —— 声明一个摄像机移动
- **perspective True** —— 启用透视投影
- 使用标准 ATL 属性操控镜头：xpos/ypos/zpos、rotate、matrixtransform

重要概念：
- **zpos** 控制镜头纵深，值越大越远（画面缩小）
- **xpos/ypos** 控制水平/垂直偏移
- **rotate** 绕Z轴旋转造成画面倾斜

镜头运动和角色/背景的变换是独立的，可以同时组合。`,
    codeExample: `label camera_demo:
    scene bg city
    show eileen happy at center

    # 镜头缓慢向右平摇
    camera:
        xpos 0 ypos 0 zpos 0
        linear 3.0 xpos -100
    with Pause(3.0)

    # 镜头拉近（推镜）
    camera:
        zpos 0
        ease 2.0 zpos -200
    with Pause(2.0)

    # 镜头震动
    camera:
        parallel:
            linear 0.05 xoffset -10
            linear 0.05 xoffset 10
            repeat 10
    with Pause(0.5)

    # 重置镜头
    camera:
        xpos 0 ypos 0 zpos 0
    "镜头回到原位。"`,
    insertableLabel: `label camera_shake:
    camera:
        parallel:
            linear 0.05 xoffset -10
            linear 0.05 xoffset 10
            repeat 5
    "画面震动了！"
    camera:
        xpos 0 ypos 0 zpos 0
    "恢复平静。"
    return`,
    related: ['stage3d'],
  },
  {
    id: 'atl-kinetic',
    title: '动态文字特效',
    subtitle: '自定义 Text Tag 实现文字动画',
    category: 'ATL 动画',
    level: '进阶',
    icon: '7',
    tags: ['文字', 'text-tag', '动画', '抖动', '彩虹', '打字机'],
    content: `## 自定义 Text Tag

Ren'Py 允许通过 **renpy.register_text_tag** 或 **renpy.custom_text_tags** 注册自定义文字效果。

Text Tag 是用花括号包裹的标记，如 {shake}文字{/shake}。开标签传参、闭标签结束作用域。

自定义 Tag 的 Python 回调函数每帧被调用，接收当前文字的 Displayable、时间等参数，可以改变文字的位置、颜色、大小等。`,
    codeExample: `init python:
    def shake_tag(tag, argument, contents):
        import random
        return [
            (renpy.TEXT_DISPLAYABLE, Text(
                "".join(contents),
                xoffset=random.randint(-3, 3),
                yoffset=random.randint(-3, 3),
            ))
        ]

    renpy.custom_text_tags["shake"] = shake_tag

# 使用
label text_effect:
    "这是普通的文字。"
    "这是{shake}抖动的文字{/shake}效果。"

    # 内置 text tag（无需注册）
    "{b}加粗{/b} {i}斜体{/i} {u}下划线{/u}"
    "{color=#ff0000}红色文字{/color}"
    "{size=+10}放大的字{/size}"
    "{font=fonts/Special.ttf}特殊字体{/font}"`,
    insertableLabel: `label text_fx_demo:
    "{b}加粗{/b} {i}斜体{/i} {u}下划线{/u}"
    "{color=#ff6347}彩色文字{/color}"
    "{size=+10}更大的字号{/size}"
    return`,
    related: ['kinetic-text-tags'],
  },

  // ============================================================
  // 第三章：NVL 模式
  // ============================================================
  {
    id: 'nvl-mode',
    title: 'NVL 小说模式完全指南',
    subtitle: '从配置到实战的 NVL 全流程',
    category: 'NVL 模式',
    level: '进阶',
    icon: '8',
    tags: ['NVL', '小说模式', '全屏文本', 'kind=nvl', 'nvl clear'],
    content: `## NVL（Novel）模式 vs ADV（Adventure）模式

Ren'Py 默认是 ADV 模式（对话框在下方，一次一句）。NVL 模式把文字累积显示在屏幕中央/全屏，适合长篇叙述。

**两种模式可以混用**：给不同的 Character 分别指定 ADV 还是 NVL。

### NVL 核心指令
- **nvl clear** —— 清空当前 NVL 文本（开始新段落）
- **nvl_narrator** —— 系统预设的 NVL 旁白角色
- **kind=nvl** —— 给 Character 指定 NVL 模式

### 自定义 NVL 样式
可以修改 style 来定制 NVL 窗口、条目间距、字体、背景图等。`,
    codeExample: `# 定义 ADV + NVL 角色
define e = Character("艾琳")               # ADV 模式
define n = Character(None, kind=nvl)       # NVL 旁白
define d = Character("日记", kind=nvl,     # NVL 日记角色
    what_font="fonts/handwriting.ttf",
    what_size=24,
    what_color="#3a2a1a")

label nvl_demo:
    e "这句话是 ADV 模式，在底部对话框显示。"

    n """
    切换到 NVL 模式。

    第二句话也会累加在同一窗口，不会清掉上一行。

    这非常适合写长篇独白、背景介绍、心理活动。
    """
    nvl clear    # 清空，开始新段落

    n "用 nvl clear 清空后，新的 NVL 段落从头开始。"

    nvl hide     # 彻底隐藏 NVL 窗口
    e "现在又回到 ADV 对话模式了。"`,
    insertableLabel: `label nvl_demo:
    nvl_narrator "这是 NVL 模式的第一行文字。"
    nvl_narrator "第二行会累积在下方。"
    nvl clear
    nvl_narrator "上面被清空了，重新开始。"
    nvl hide
    "回到 ADV 模式。"
    return`,
    related: ['nvl-extras'],
  },

  // ============================================================
  // 第四章：自定义 Screen
  // ============================================================
  {
    id: 'custom-screens',
    title: '自定义界面 Screen 编程',
    subtitle: '用 screen 语句构建你想要的任何界面',
    category: '自定义界面',
    level: '进阶',
    icon: '9',
    tags: ['screen', 'UI', '界面', '按钮', 'bar', 'viewport', 'imagebutton'],
    content: `## Screen 语言

**screen** 是 Ren'Py 的界面构建系统，语法类似声明式 UI 框架。

### 常用容器
- **vbox** —— 垂直排列子元素
- **hbox** —— 水平排列
- **fixed** —— 绝对定位（子元素可用 xpos/ypos）
- **frame** —— 带边框/背景的容器
- **viewport** —— 可滚动区域

### 常用控件
- **text** / **textbutton** —— 文字/按钮
- **imagebutton** —— 图片按钮
- **bar** —— 进度条/滑条
- **null** —— 占位空白`,
    codeExample: `screen my_stats():
    frame:
        xalign 0.1 yalign 0.1
        xsize 250
        vbox:
            text "角色状态" size 20
            null height 10
            hbox:
                text "体力"
                bar value StaticValue(hp, 100) xsize 120
            hbox:
                text "好感度"
                bar value StaticValue(affection, 100) xsize 120
            textbutton "关闭" action Hide("my_stats")
                xalign 0.5

screen choice_banner(title, choices):
    frame:
        xalign 0.5 yalign 0.7
        xpadding 30 ypadding 20
        vbox:
            text title size 24 xalign 0.5
            for label, target in choices:
                textbutton label action Jump(target)

label screen_demo:
    show screen my_stats
    e "看，左边多了状态面板。"
    call screen choice_banner("要去哪里？", [
        ("图书馆", "library"),
        ("公园", "park"),
    ])
    hide screen my_stats`,
    insertableLabel: `label screen_demo:
    show screen my_stats
    "状态面板显示在左上角。"
    hide screen my_stats
    return`,
  },
  {
    id: 'advanced-layout',
    title: '高级布局与自适应',
    subtitle: 'Grid / Side / Viewport / Drag 布局',
    category: '自定义界面',
    level: '高级',
    icon: '10',
    tags: ['layout', 'grid', 'viewport', 'drag', 'side', '自适应'],
    content: `## 高级界面布局

### Grid 网格
**grid 列数 行数** —— 将子元素排列成规整的网格。

### Viewport 滚动区域
当内容超出可视范围时，viewport 提供滚动条或鼠标拖拽滚动。

### Side 边栏布局
**side "c b r"** —— "c"=center（主区域）、"b"=bottom、"r"=right 等。

### Drag 拖拽组件
**drag** 提供可拖拽的交互元素，适合拼图、排序等小游戏。`,
    codeExample: `# Grid 网格翻牌
screen card_grid():
    grid 4 3:
        spacing 10
        for i in range(12):
            frame:
                xsize 100 ysize 140
                text "[i]" align (0.5, 0.5)

# Viewport 滚动长廊
screen scroll_gallery():
    side "c r":
        viewport id "gallery_vp":
            draggable True
            hbox:
                for img in gallery_images:
                    image img xsize 200
        vbar value YScrollValue("gallery_vp")

# Drag 拖拽
screen drag_demo():
    drag:
        drag_name "piece1"
        xpos 100 ypos 100
        frame:
            xsize 80 ysize 80
            text "A"
    drag:
        drag_name "piece2"
        xpos 300 ypos 200
        frame:
            xsize 80 ysize 80
            text "B"`,
    insertableLabel: `label grid_demo:
    call screen card_grid
    return`,
  },

  // ============================================================
  // 第五章：音频与多媒体
  // ============================================================
  {
    id: 'audio-system',
    title: '音频系统——BGM / SE / Voice',
    subtitle: '播放、停止、淡入淡出和声道管理',
    category: '音频多媒体',
    level: '入门',
    icon: '11',
    tags: ['音频', 'BGM', '音效', '语音', 'play', 'stop', 'fade'],
    content: `## 音频播放系统

Ren'Py 支持 7 个独立声道：

| 声道 | 说明 |
|------|------|
| music | 背景音乐（单曲，默认带淡入淡出） |
| sound | 音效（可叠加多个） |
| voice | 语音（自动随对话播放/停止） |
| audio | 通用音频通道 |

### 常用指令
- **play music "文件名"** —— 播放 BGM，旧曲淡出
- **queue music "文件名"** —— 当前曲结束后播放
- **stop music** —— 停止 BGM
- **play sound "文件名"** —— 播放一次音效
- **voice "文件名"** —— 播放单句语音（放在对话前）`,
    codeExample: `# 注册音频（可选）
define audio.bgm_peaceful = "audio/peaceful_theme.ogg"
define audio.se_click = "audio/click.wav"

label audio_demo:
    # BGM 播放
    play music bgm_peaceful fadein 1.0
    "背景音乐开始播放..."

    # 降低音量（对话时）
    play music bgm_peaceful volume 0.3

    # 音效
    play sound se_click
    "点击了一个按钮。"

    # 停止音乐
    stop music fadeout 2.0
    "音乐渐隐消失。"

    # 语音
    voice "audio/line_001.ogg"
    e "这句话带有配音。"

    # 循环播放
    play music bgm_peaceful loop`,
    insertableLabel: `label audio_demo:
    play music bgm_peaceful fadein 1.0
    "BGM 开始播放。"
    play sound se_click
    "音效触发。"
    stop music fadeout 2.0
    "音乐淡出。"
    return`,
  },
  {
    id: 'video-system',
    title: '视频播放与 Movie Sprite',
    subtitle: '全屏过场动画 + Movie Displayable',
    category: '音频多媒体',
    level: '进阶',
    icon: '12',
    tags: ['视频', 'movie', '过场', 'op', 'webm'],
    content: `## 视频系统

### 全屏视频（Movie）
用于播放过场动画、OP/ED。支持 .webm（推荐）、.mp4、.avi 等格式。

**renpy.movie_cutscene()** 播放全屏视频，玩家可点击跳过。

### Movie Sprite（动画精灵）
将视频作为 Displayable 放在舞台上任意位置，可以像普通图片一样缩放、移动。适合做背景动画、动态 UI 元素等。

视频循环播放时可作为动态背景或动态立绘的替代品。`,
    codeExample: `# 全屏过场动画
label opening:
    $ renpy.movie_cutscene("video/opening.webm")
    return

# Movie Displayable（舞台上播放）
image bg_animated = Movie(
    play="video/rain_bg.webm",
    loop=True
)

image character_movie = Movie(
    play="video/character_idle.webm",
    loop=True,
    size=(400, 600)
)

label video_demo:
    # 播放过场
    $ renpy.movie_cutscene("video/intro.webm")

    # 动态背景
    scene bg_animated
    "雨中的城市..."

    # 动态立绘
    show character_movie at center
    e "看，这是动态角色！"`,
    insertableLabel: `label movie_demo:
    $ renpy.movie_cutscene("video/demo.webm")
    "过场动画播放完毕。"
    return`,
  },

  // ============================================================
  // 第六章：高级剧情技巧
  // ============================================================
  {
    id: 'persistent-data',
    title: '持久化数据与多周目',
    subtitle: 'persistent 变量、CG 解锁、结局收集',
    category: '高级技巧',
    level: '高级',
    icon: '13',
    tags: ['persistent', '多周目', '解锁', '二周目', 'save'],
    content: `## 跨存档数据持久化

**persistent** 变量是特殊的持久化数据，存储在玩家的设备上，不随存档保存/删除而改变。

### 典型用途
- CG/结局收集比例
- 二周目解锁内容（新选项、新路线）
- 全局设置（已读文本跳过、音量偏好）
- 玩家统计（总游玩时间、总选择次数）

### 重要提示
persistent 变量一旦设置，在玩家的整个设备生命周期都有效。调试时可以在设置菜单添加「重置数据」按钮。`,
    codeExample: `# 持久化变量（不随存档变化）
default persistent.cg_unlocked = set()
default persistent.endings_seen = set()
default persistent.total_playtime = 0.0

label ending_a:
    $ persistent.endings_seen.add("ending_a")
    "结局 A —— 达成！"
    return

label check_progress:
    $ total = len(persistent.endings_seen)
    "你已经解锁了 [total] 个结局。"
    if "ending_a" in persistent.endings_seen:
        "之前走过结局 A。"

# 二周目内容
label start:
    if persistent.endings_seen:
        menu:
            "你似乎感受到了既视感..."
            "跟随直觉":
                jump secret_path
            "按原路前进":
                jump normal_path
    else:
        jump normal_path`,
    insertableLabel: `label persistent_demo:
    $ persistent.demo_flag = True
    "设置了持久化标记。"
    if persistent.demo_flag:
        "标记已确认生效。"
    return`,
  },
  {
    id: 'layered-image',
    title: '分层立绘系统',
    subtitle: 'LayeredImage / LiveComposite 动态角色',
    category: '高级技巧',
    level: '高级',
    icon: '14',
    tags: ['layeredimage', '分层', '服装', '表情', '动态换装'],
    content: `## 分层立绘（LayeredImage）

传统方式需要为每个表情+姿势+服装组合准备一张完整图片（N×M 组合爆炸）。
**layeredimage** 允许你逐层"零件化"角色：

### 图层属性
- **always** —— 始终显示的底层（身体、皮肤）
- 每个属性对应一组可选图层变量（表情、服装、配饰）
- 属性值可以组合（如 "happy shirt_blue"）

### 自动属性
- **if_all / if_any / if_not** 条件图层显示
- **attribute_function** 自定义属性逻辑`,
    codeExample: `# 分层立绘定义
layeredimage eileen:
    always:
        "eileen_base"         # 基础身体

    group outfit:              # 服装组
        attribute uniform default:
            "eileen_uniform"
        attribute casual:
            "eileen_casual"

    group eyes:                # 表情组
        attribute normal default:
            "eileen_eyes_normal"
        attribute happy:
            "eileen_eyes_happy"
        attribute sad:
            "eileen_eyes_sad"

    group mouth:               # 嘴型组
        attribute closed default:
            "eileen_mouth_closed"
        attribute open:
            "eileen_mouth_open"

label layered_demo:
    show eileen                    # 默认：uniform + normal + closed
    e "默认状态。"

    show eileen happy open         # 开心 + 张嘴
    e "现在很开心！"

    show eileen casual sad           # 便服 + 难过
    e "换了衣服但是心情不好..."

    show eileen happy casual open  # 多属性组合
    e "便服、开心、说话中！"`,
    insertableLabel: `label layered_demo:
    show eileen
    e "默认立绘。"
    show eileen happy
    e "开心表情。"
    return`,
  },

  // ============================================================
  // 第七章：调试与优化
  // ============================================================
  {
    id: 'debug-tools',
    title: '调试工具与开发流程',
    subtitle: '控制台、变量监视、热重载与快速测试',
    category: '调试优化',
    level: '进阶',
    icon: '15',
    tags: ['debug', 'console', 'shift+o', '热重载', '测试'],
    content: `## Ren'Py 调试工具箱

### 开发者菜单（Shift+O）
游戏运行时按 Shift+O 打开控制台，可输入 Python 命令。

### 常用调试命令
\`\`\`python
# 查看变量
renpy.watch("变量名")

# 跳转到任意标签
renpy.jump("label名")

# 列出所有图像
renpy.list_images()

# 快速存档/读档
renpy.quick_save()
renpy.quick_load()
\`\`\`

### 变量监视器（Shift+D）
按 Shift+D 打开开发者菜单，可实时查看和修改游戏变量。

### 热重载（Shift+R）
修改 .rpy 文件后按 Shift+R 热重载，无需重启游戏。`,
    codeExample: `# 调试专用代码块（发布时移除）
init python:
    if config.developer:
        config.console = True        # 启用控制台
        config.debug_sound = True    # 显示音频加载
        config.debug_image_cache = True  # 查看图片缓存

# 快捷测试入口（发布时注释掉）
label debug_start:
    $ persistent._clear(progress=True)  # 清除进度
    jump start

# 条件断点
label check_bug:
    if debug_mode:
        "【调试】当前变量：affection=[affection], flag=[flag]"
    "正常剧情继续..."`,
    insertableLabel: `label debug_test:
    if config.developer:
        "【调试模式】当前处于开发环境。"
    "正常流程。"
    return`,
  },
]

export const LESSON_CATEGORIES = [
  '基础语法',
  'ATL 动画',
  'NVL 模式',
  '自定义界面',
  '音频多媒体',
  '高级技巧',
  '调试优化',
] as const

export type LessonCategory = (typeof LESSON_CATEGORIES)[number]
