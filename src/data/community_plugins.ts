/**
 * ============================================================
 * Ren'Py 社区插件数据库（Community Plugin Hub）—— v0.9.0
 * ============================================================
 * 收录 Ren'Py 社区常用衍生插件与扩展框架，
 * 每个条目包含：名称、作者、描述、关键词、安装指南、代码片段与标准接口预览。
 */

export interface PluginEntry {
  /** 唯一标识 */
  id: string
  /** 插件名 */
  name: string
  /** 作者/维护者 */
  author?: string
  /** 版本 */
  version?: string
  /** 分类标签 */
  category: string
  /** 简要描述 */
  desc: string
  /** 详细说明 */
  detail?: string
  /** 搜索关键词 */
  tags: string[]
  /** 安装指令（安装到游戏工程 game/ 目录下） */
  install?: string
  /** 代码片段（在 script.rpy / screens.rpy 中的调用方式） */
  snippet?: string
  /** 标准接口演示（声明/定义到使用的完整示例） */
  apiPreview?: string
  /** GitHub / 官网链接 */
  url?: string
  /** 依赖 */
  requires?: string[]
  /** 难度 */
  difficulty: 'beginner' | 'intermediate' | 'advanced'
}

export const COMMUNITY_PLUGINS: PluginEntry[] = [
  // ============================================================
  // 角色表演与动态
  // ============================================================
  {
    id: 'live2d-integration',
    name: 'Live2D 集成',
    author: 'Kandy Wong / RenPyTom',
    version: '3.x',
    category: '角色表演',
    desc: '将 Live2D Cubism 模型导入 Ren\'Py 并驱动嘴型同步、物理抖动与动作切换。支持静态表情、口型映射、模型层级控制。',
    detail: 'Live2D 插件利用 Ren\'Py 的 GL2 渲染环境绑定 Cubism SDK，允许 .model3.json 模型作为 Displayable 显示在舞台上。配合 {w} 等对话标签可驱动自动口型开合。',
    tags: ['Live2D', 'Cubism', '嘴型同步', '物理引擎', '模型', 'spine替代'],
    install: '# 1. 将 Live2D Cubism SDK for Native 放入 renpy/ 同级目录\n# 2. 将模型文件(.model3.json / .moc3 / 纹理)放入 game/images/live2d/',
    snippet: `define e = Character("艾琳", image="eileen")
image eileen live2d = Live2D("eileen", loop=True)

label start:
    show eileen live2d at center
    e "你好，我是 Live2D 角色。"
    show eileen live2d expression happy
    e "现在换了个表情！"`,
    apiPreview: `# Live2D Displayable 标准接口
image <tag> live2d = Live2D("<model_name>", loop=True, seamless=False)

# expression 切换
show <tag> live2d expression <exprName>
# motion 播放
show <tag> live2d motion <motionName>
# 物理参数调节
$ <tag>_live2d.adjust_physics(damping=0.8)`,
    url: 'https://github.com/RenpyTom/live2d',
    difficulty: 'advanced',
  },
  {
    id: 'kinetic-text-tags',
    name: 'Kinetic 动态文字标签',
    author: 'renpy-community',
    version: '2.1',
    category: '角色表演',
    desc: '为对话文字添加逐字弹出、抖动、彩虹色渐变、打字机效果等动态文字特效。通过自定义 Text Tag 注入对话字符串。',
    detail: '在 say 语句的字串中嵌入 {kinetic=tween}...{/kinetic} 或 {shake}...{/shake} 等标签，引擎在每帧重新计算字形位置与颜色。利用 renpy.register_text_tag 机制实现。',
    tags: ['文字动效', '打字机', '逐字', '抖动', '彩虹', 'text-tag'],
    install: '# 将 kinetic_tags.rpy 放入 game/ 目录\n# 在 script.rpy 中调用即可',
    snippet: `label start:
    "这是一段{shake}抖动的文字{/shake}。"
    "{kinetic=bounce}每个字都会{/kinetic}逐个弹跳出现。"
    "{rainbow}彩虹色的渐变文字效果{/rainbow}。"`,
    apiPreview: `# 已注册的自定义 text tag:
{shake}...{/shake}        # 文字抖动
{rainbow}...{/rainbow}    # 彩虹色渐变
{kinetic=bounce}...{/kinetic}  # 弹跳逐字
{kinetic=float}...{/kinetic}   # 浮动逐字
{typewriter}...{/typewriter}  # 打字机效果
{wavy}...{/wavy}          # 波浪效果`,
    difficulty: 'intermediate',
  },
  {
    id: 'sprite-lip-flap',
    name: '立绘自动口型',
    author: 'community',
    category: '角色表演',
    desc: '根据对话文字长度和标点自动切换立绘的口型（张嘴/闭嘴）图片，模拟说话效果。无需 Live2D，只需准备两张立绘变体。',
    tags: ['口型', 'lip-flap', '立绘', '说话动画', 'auto-voice'],
    snippet: `# 注册立绘口型图集
image eileen mouth open = "eileen_mouth_open.png"
image eileen mouth closed = "eileen_mouth_closed.png"

init python:
    def lip_flap_callback(event, interact=True, **kwargs):
        if event == "show":
            renpy.show("eileen mouth open")
        elif event == "slow_done":
            renpy.show("eileen mouth closed")

define e = Character("艾琳", callback=lip_flap_callback)`,
    apiPreview: `# callback 事件钩子：
event == "show"       # 对话开始
event == "slow_done"  # 当前文字显示完毕
event == "end"        # 交互结束
event == "begin"      # 新交互开始

# 可在回调中控制：
renpy.show()    # 切换口型图层
renpy.play()    # 播放音效
renpy.restart_interaction()  # 强制刷新`,
    difficulty: 'intermediate',
  },

  // ============================================================
  // UI 与界面
  // ============================================================
  {
    id: 'sms-messenger',
    name: '手机短信模拟界面',
    author: 'Divona / Elckarow',
    version: '2.0',
    category: 'UI 界面',
    desc: '在 Ren\'Py 中模拟手机短信/即时通讯聊天界面。支持多联系人、消息气泡、打字动画、头像显示与对话历史回滚。',
    detail: '通过自定义 Screen 实现完整的消息应用 UI：联系人列表、聊天气泡、输入框模拟、消息时间戳。通常配合 NVL 模式或独立 overlay 使用。',
    tags: ['SMS', '手机', '短信', '聊天', '即时通讯', 'messenger', '气泡'],
    snippet: `screen phone_messenger(contact):
    frame:
        xalign 0.5 yalign 0.5
        xsize 300 ysize 500
        vbox:
            text "[contact]" size 20
            viewport:
                vbox:
                    for msg in messages[contact]:
                        text msg.body
    textbutton "关闭" action Hide("phone_messenger") xalign 0.95 yalign 0.02

label start:
    show screen phone_messenger("艾琳")
    "手机屏幕亮起，弹出一条新消息。"`,
    apiPreview: `# 消息数据模型
default messages = {
    "艾琳": [
        Message("你还好吗？", sender="艾琳"),
        Message("我很好", sender="我"),
    ]
}

init python:
    class Message:
        def __init__(self, body, sender="", timestamp=None):
            self.body = body
            self.sender = sender
            self.timestamp = timestamp

# 调用：show screen phone_messenger("艾琳")`,
    difficulty: 'intermediate',
  },
  {
    id: 'cg-gallery',
    name: 'CG 鉴赏厅',
    author: 'renpy-standard',
    version: '1.0',
    category: 'UI 界面',
    desc: '标准 CG 画廊/鉴赏厅。自动收集游戏中已解锁的 CG，支持缩略图网格浏览、全屏查看、上锁/解锁状态与进度百分比。',
    detail: '利用 renpy.seen_image() 判断 CG 是否已浏览过。通过自定义 Action/Button 实现网格布局、锁图标覆盖、点击全屏预览。通常放在主菜单的「Gallery」入口。',
    tags: ['CG', '画廊', '鉴赏', '收集', '解锁', 'gallery'],
    snippet: `init python:
    cg_pages = [
        ("第1章", ["cg_ch1_01", "cg_ch1_02", "cg_ch1_03"]),
        ("第2章", ["cg_ch2_01", "cg_ch2_02"]),
    ]

screen cg_gallery():
    tag menu
    use game_menu(_("CG鉴赏")):
        vbox:
            for title, cgs in cg_pages:
                text title
                hbox:
                    for cg in cgs:
                        if renpy.seen_image(cg):
                            imagebutton idle cg action Show("cg_view", cg=cg)
                        else:
                            image "gui/locked.png"`,
    apiPreview: `# 核心 API
renpy.seen_image(filename)    # 是否浏览过
renpy.show()                  # 全屏查看
Show(screen, **kwargs)        # 弹出预览
# 持久化变量
default persistent.cg_unlocked = set()

# Action 快捷方式
action If(renpy.seen_image(cg), Show("cg_view"), None)`,
    difficulty: 'beginner',
  },
  {
    id: 'music-room',
    name: '音乐鉴赏厅',
    author: 'renpy-standard',
    version: '1.0',
    category: 'UI 界面',
    desc: '游戏内音乐播放器/鉴赏厅。列出所有 BGM，显示是否解锁、支持播放/停止、显示曲名与作曲家。',
    tags: ['音乐', 'BGM', '鉴赏', '播放器', 'music-room', 'jukebox'],
    snippet: `screen music_room():
    tag menu
    use game_menu(_("音乐鉴赏")):
        vbox:
            for track in music_tracks:
                hbox:
                    text track.title
                    text track.composer
                    textbutton "播放" action Play("music", track.file)`,
    apiPreview: `# 曲目数据
define music_tracks = [
    MusicTrack("春日", "bgm_spring.ogg", "Alice"),
    MusicTrack("夜曲", "bgm_night.ogg", "Bob"),
]

init python:
    class MusicTrack:
        def __init__(self, title, file, composer=""):
            self.title = title
            self.file = file
            self.composer = composer

# 操作
action Play("music", track.file)
action Stop("music")
action Queue("music", [track.file])
action SetVariable("current_track", track)`,
    difficulty: 'beginner',
  },

  // ============================================================
  // 小游戏与玩法
  // ============================================================
  {
    id: 'minigame-framework',
    name: '小游戏模板框架',
    author: 'community',
    category: '小游戏',
    desc: '轻量级小游戏开发框架：内置回合制战斗、卡牌对战、解谜面板、记忆翻牌、节奏点击等模板，通过 Screen 与 Python 逻辑实现。',
    detail: '每个小游戏模板提供 init python block（逻辑） + screen（UI） + label（流程入口）三个部分。可独立运行或嵌入主线剧情。游戏结果通过 return 值或全局变量回传主线。',
    tags: ['minigame', '小游戏', '战斗', '卡牌', '解谜', '翻牌', '节奏'],
    snippet: `# 记忆翻牌小游戏模板
init python:
    import random

    class MemoryGame:
        def __init__(self, pairs=6):
            self.cards = list(range(pairs)) * 2
            random.shuffle(self.cards)
            self.flipped = []
            self.matched = set()

        def flip(self, idx):
            if idx in self.flipped or idx in self.matched:
                return False
            self.flipped.append(idx)
            if len(self.flipped) == 2:
                a, b = self.flipped
                if self.cards[a] == self.cards[b]:
                    self.matched.add(a)
                    self.matched.add(b)
                self.flipped = []
            return True

default memory_game = MemoryGame(pairs=6)

screen memory_board():
    grid 4 3:
        for i in range(12):
            button action Function(memory_game.flip, i)`,
    apiPreview: `# 小游戏模板标准接口
# init python:     游戏逻辑类
# screen:          界面渲染
# label:           入口流程，含 while 循环与判定

label play_memory:
    call screen memory_board
    if len(memory_game.matched) == 12:
        "恭喜！全部配对成功！"
        return True
    else:
        return False`,
    difficulty: 'advanced',
  },
  {
    id: 'qte-system',
    name: 'QTE 限时选择系统',
    author: 'community',
    version: '1.2',
    category: '小游戏',
    desc: '快速反应事件（Quick Time Event）系统：限时菜单选择、连打按键、进度条 qte。支持计时器、失败回退与成功分支。',
    tags: ['QTE', '限时', '快速反应', 'timer', 'action-game'],
    snippet: `# 限时菜单（5秒内选择，否则走 default）
menu:
    "快选！" (timer=5.0):
        "攻击":
            jump attack
        "防御":
            jump defend
    (timer_expired):
        "来不及了！"
        jump hit

# 连打 QTE（带进度条）
screen qte_mash():
    bar value AnimatedValue(0, 100, 5.0, 0):
        xalign 0.5 yalign 0.8
        xsize 300
    key "K_SPACE" action AddToSet(setvar, 1)
    timer 5.0 action Return(False)

label qte_mash_start:
    $ qte_value = 0
    call screen qte_mash
    if qte_value >= 20:
        "成功挣脱！"`,
    apiPreview: `# timer 参数（menu 内）
menu:
    "提示文字" (timer=5.0):
        "选项A":
            ...
    (timer_expired):
        "超时后自动执行的标签"

# screen 内 timer
timer 5.0 action Return(False)
timer 3.0 action Jump("timeout_label")

# AnimatedValue 进度条
bar value AnimatedValue(old, new, delay, range)`,
    difficulty: 'intermediate',
  },
  {
    id: 'dating-sim-stats',
    name: '好感度与日程系统',
    author: 'community',
    category: '小游戏',
    desc: 'Galgame 式日程安排 + 好感度数值系统。支持多角色好感度条、每日行动选择、事件触发阈值与结局判定。',
    tags: ['好感度', '日程', 'dating-sim', 'affection', '攻略', '数值'],
    snippet: `# 好感度变量
default affection = {"艾琳": 0, "莉莉": 0, "小雪": 0}
default day = 1
default max_days = 30

label daily_plan:
    if day > max_days:
        jump ending
    "第 [day] 天，你要做什么？"
    menu:
        "和艾琳去图书馆":
            $ affection["艾琳"] += 5
        "和莉莉逛街":
            $ affection["莉莉"] += 5
        "一个人待着":
            pass
    $ day += 1
    jump daily_plan

label ending:
    $ best = max(affection, key=affection.get)
    if affection[best] >= 50:
        "你和 [best] 走到了一起。"`,
    apiPreview: `# 数值系统常用模式
default stats = {
    "好感度": {"艾琳": 0, "莉莉": 0},
    "智力": 0, "魅力": 0, "体力": 100,
}

# 条件触发
if stats["好感度"]["艾琳"] >= 30:
    jump eileen_event

# 多条件结局
if affection["艾琳"] >= 50 and intelligence >= 40:
    jump eileen_good_end`,
    difficulty: 'beginner',
  },

  // ============================================================
  // 系统与引擎
  // ============================================================
  {
    id: 'calendar-system',
    name: '日历时间系统',
    author: 'community',
    category: '系统引擎',
    desc: '完整的游戏内日历与时间推进系统：日/周/月/年、季节变化、节日事件触发、时间段（早/午/晚）切换。',
    tags: ['日历', '时间', '日程', 'calendar', '季节', 'date'],
    snippet: `init python:
    class Calendar:
        def __init__(self, year=2024, month=1, day=1):
            self.year = year; self.month = month; self.day = day
        def advance(self, days=1):
            self.day += days
            while self.day > 30:
                self.day -= 30; self.month += 1
            while self.month > 12:
                self.month -= 12; self.year += 1
        @property
        def season(self):
            if self.month in [3,4,5]: return "春"
            if self.month in [6,7,8]: return "夏"
            if self.month in [9,10,11]: return "秋"
            return "冬"

default cal = Calendar()

label morning:
    $ cal.advance(1)
    "今天是 [cal.year]年[cal.month]月[cal.day]日，[cal.season]季。"`,
    apiPreview: `# Calendar 标准接口
cal.advance(days)       # 推进 N 天
cal.season              # 当前季节
cal.weekday()           # 星期几
cal.is_weekend          # 是否周末
cal.days_until(目标日)  # 距目标日天数`,
    difficulty: 'beginner',
  },
  {
    id: 'achievement-system',
    name: '成就系统',
    author: 'renpy-standard',
    version: '1.0',
    category: '系统引擎',
    desc: 'Steam/游戏内置成就系统：定义成就列表、解锁条件、通知弹出、持久化存储。支持未解锁状态灰显。',
    tags: ['成就', 'achievement', 'steam', '奖杯', '统计'],
    snippet: `init python:
    achievement.register("first_meet", stat_max="first_meet")
    achievement.register("all_cg", stat_sum="cg_count", stat_max=20)

label after_meet:
    $ achievement.grant("first_meet")
    "结识新角色！"

screen achievements():
    tag menu
    use game_menu(_("成就")):
        vbox:
            for name, a in achievement.achievements.items():
                hbox:
                    if a.has():
                        text a.name
                    else:
                        text "???"`,
    apiPreview: `# 核心 API
achievement.register(id, **conditions)
achievement.grant(id)            # 解锁
achievement.has(id)              # 是否解锁
achievement.progress(id)         # 当前进度
achievement.clear_all()          # 清除所有（debug）
achievement.Sync()               # Steam 同步

# 解锁条件类型
stat_max="stat"       # 统计值达最大值
stat_sum="stat"       # 统计值累计
stat_range="stat"     # 统计值在范围`,
    difficulty: 'beginner',
  },
  {
    id: 'inventory-system',
    name: '道具背包系统',
    author: 'community',
    category: '系统引擎',
    desc: '经典 RPG 式道具/物品管理系统：物品定义、背包格、获得/失去/使用物品、物品描述与分类、装备系统。',
    tags: ['道具', '背包', '装备', '物品', 'inventory'],
    snippet: `init python:
    class Item:
        def __init__(self, id, name, desc, category="消耗品"):
            self.id = id; self.name = name
            self.desc = desc; self.category = category

    class Inventory:
        def __init__(self, max_slots=20):
            self.items = {}      # item_id → count
            self.max_slots = max_slots
        def add(self, item, qty=1):
            self.items[item.id] = self.items.get(item.id, 0) + qty
        def remove(self, item, qty=1):
            if item.id in self.items:
                self.items[item.id] -= qty
                if self.items[item.id] <= 0:
                    del self.items[item.id]
        def has(self, item):
            return self.items.get(item.id, 0) > 0

define herb = Item("herb_01", "药草", "恢复少许体力")
default inventory = Inventory()

label get_herb:
    $ inventory.add(herb, 3)
    "获得了 [herb.name] ×3！"`,
    apiPreview: `# Inventory 标准接口
inv.add(item, qty)       # 添加
inv.remove(item, qty)    # 移除
inv.has(item)            # 是否存在
inv.count(item)          # 数量
inv.list_by(category)    # 按类别列出`,
    difficulty: 'intermediate',
  },

  // ============================================================
  // 视觉与滤镜
  // ============================================================
  {
    id: 'weather-particles',
    name: '天气粒子系统',
    author: 'community',
    version: '1.5',
    category: '视觉滤镜',
    desc: '基于 SnowBlossom / AlphaBlend 的自定义天气效果：飘雪、落花、萤火虫、雨滴、樱花等粒子特效，可直接叠加在舞台上。',
    tags: ['粒子', '天气', '雪', '雨', '樱花', '萤火虫', 'particle', 'SnowBlossom'],
    snippet: `# 飘雪效果（内建 SnowBlossom）
image snow = SnowBlossom("snowflake.png", count=100, xspeed=(10,30), yspeed=(50,100), start=50)

# 落花效果
image sakura = SnowBlossom("petal.png", count=40, xspeed=(5,15), yspeed=(30,60), border=20)

# 萤火虫（使用 AlphaBlend + 随机运动）
image fireflies = SnowBlossom(
    "particle_light.png",
    count=15, xspeed=(-5,5), yspeed=(-8,8),
    start=30, fast=True, horizontal=True
)

label start:
    show bg park
    show sakura
    "樱花飘落的庭院…"`,
    apiPreview: `# SnowBlossom 标准参数
SnowBlossom(
    image,           # 粒子图片路径
    count=10,        # 同时显示的粒子数
    border=50,       # 边界外边距
    xspeed=(x1,x2),  # 水平速度范围（px/s）
    yspeed=(y1,y2),  # 垂直速度范围
    start=0,         # 初始 Y 偏移(px)
    fast=False,      # 若 True，粒子从底部重新出现而非销毁
    horizontal=False # 若 True，粒子环绕屏幕四边
)

# 自定义粒子（使用 AlphaBlend）
AlphaBlend(
    control, child, alpha=True
)`,
    difficulty: 'intermediate',
  },
  {
    id: 'post-processing',
    name: '后处理滤镜包',
    author: 'community',
    category: '视觉滤镜',
    desc: '屏幕后处理滤镜集合：CRT/老电视扫描线、VHS 噪音、胶片颗粒、水墨/素描渲染、Bloom 泛光、色差偏移、景深模糊。通过自定义 shader 或 matrixcolor 实现。',
    tags: ['滤镜', 'CRT', 'VHS', '噪点', '后处理', 'shader', 'glitch'],
    snippet: `# CRT 老电视效果（自定义 shader）
init python:
    renpy.register_shader("sw.crt", variables="""
        uniform float u_time;
        varying vec2 v_tex_coord;
    """, fragment_functions="""
        // scanlines + slight rgb offset
    """, fragment_200="""
        vec4 col = texture2D(tex0, v_tex_coord);
        float scanline = sin(v_tex_coord.y * 400.0 + u_time) * 0.05 + 0.95;
        col.rgb *= scanline;
        gl_FragColor = col;
    """)

transform crt_effect:
    shader "sw.crt"
    u_time 0.0
    linear 10.0 u_time 1.0
    repeat

# 应用：show layer master at crt_effect`,
    apiPreview: `# 后处理标准管道
1. 注册 shader: renpy.register_shader(name, ...)
2. 定义 transform: transform <name>: shader "shader_name"
3. 应用到 layer: show layer master at <transform>
4. 或 Model-based: 对特定 displayable 绑定 shader

# 常用后处理类型
- scanlines: 水平扫描线
- chromatic_aberration: 红蓝通道偏移
- grain: 胶片颗粒
- vignette: 暗角效果
- bloom: 泛光（需 GL2/Render to texture）
- glitch: 画面撕裂`,
    difficulty: 'advanced',
  },

  // ============================================================
  // NVL 小说模式扩展
  // ============================================================
  {
    id: 'nvl-extras',
    name: 'NVL 扩展风格包',
    author: 'renpy-standard',
    version: '1.0',
    category: 'NVL 模式',
    desc: 'NVL（视觉小说）模式的高级配置与风格变体：滚动日志式、信纸/日记样式、双栏布局、进度保存与历史回溯增强。',
    tags: ['NVL', '小说模式', '日志', '信纸', 'scroll', '双栏'],
    snippet: `# 信纸风格 NVL
define nvl_narrator = Character(
    None,
    kind=nvl,
    what_font="fonts/handwriting.ttf",
    what_size=22,
    what_color="#3a2a1a",
    what_xalign=0.05,
    window_background="gui/paper_bg.png"
)

# NVL 滚动日志样式
style nvl_window:
    background "gui/nvl_log.png"
    ysize 600

label nvl_scene:
    nvl_narrator """
    这是一段 NVL 模式的叙述。

    文字会累积显示在同一个窗口中，
    不会像 ADV 模式那样每次清空。

    适合用来写大段的内心独白、回忆、背景介绍。
    """
    nvl clear

    nvl_narrator "每次 nvl clear 会清空之前的 NVL 内容，开始新的段落。"`,
    apiPreview: `# NVL 核心指令
nvl clear                 # 清空 NVL 文本
nvl show <text>           # 追加到 NVL 窗口
nvl hide                  # 隐藏 NVL 窗口
nvl_erase()               # Python 擦除
nvl_narrator "..."        # NVL 叙述角色

# 高级配置
define narrator = Character(kind=nvl, ...)
# 自定义 style
style nvl_window, nvl_entry, nvl_label

# 混合 ADV+NVL
define e = Character("艾琳")
e "这句走 ADV 模式"        # 正常对话
nvl_narrator "切到 NVL 写旁白"  # NVL 叙述`,
    difficulty: 'intermediate',
  },
]

/**
 * 所有插件的分类列表
 */
export const PLUGIN_CATEGORIES = [
  '角色表演',
  'UI 界面',
  '小游戏',
  '系统引擎',
  '视觉滤镜',
  'NVL 模式',
] as const

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]
