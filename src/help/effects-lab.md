# 特效大本营

特效大本营是 Ren'Py 特效的百科全书和可视化预览工具，帮助你挑选和组合最合适的画面过渡效果。

---

## 功能概述

特效大本营提供：
- 所有 Ren'Py 内置过渡效果的可视化预览
- 特效参数的可调节选项
- 特效组合预览
- 一键应用到剧本背景/场景切换

## 内置过渡效果清单

ScriptWeaver 支持以下 Ren'Py 内置过渡效果：

| 过渡名 | 说明 |
|--------|------|
| `dissolve` | 淡入淡出 |
| `fade` | 先黑屏再淡入 |
| `pixellate` | 像素化过渡 |
| `move` | 移动过渡 |
| `moveinright` | 从右侧滑入 |
| `moveinleft` | 从左侧滑入 |
| `moveintop` | 从顶部滑入 |
| `moveinbottom` | 从底部滑入 |
| `moveoutright` | 滑出到右侧 |
| `moveoutleft` | 滑出到左侧 |
| `moveouttop` | 滑出到顶部 |
| `moveoutbottom` | 滑出到底部 |
| `easeinright` | 缓入右侧 |
| `easeinleft` | 缓入左侧 |
| `easeintop` | 缓入顶部 |
| `easeinbottom` | 缓入底部 |
| `easeoutright` | 缓出右侧 |
| `easeoutleft` | 缓出左侧 |
| `easeouttop` | 缓出顶部 |
| `easeoutbottom` | 缓出底部 |
| `zoomin` | 放大 |
| `zoomout` | 缩小 |
| `vpunch` | 垂直震动 |
| `hpunch` | 水平震动 |
| `blinds` | 百叶窗 |
| `squares` | 方块 |
| `wipeleft` | 向左擦除 |
| `wiperight` | 向右擦除 |
| `wipeup` | 向上擦除 |
| `wipedown` | 向下擦除 |
| `slideleft` | 向左滑动 |
| `slideright` | 向右滑动 |
| `slideup` | 向上滑动 |
| `slidedown` | 向下滑动 |
| `pushright` | 向右推出 |
| `pushleft` | 向左推出 |
| `pushup` | 向上推出 |
| `pushdown` | 向下推出 |
| `irisin` | 虹膜收缩 |
| `irisout` | 虹膜扩张 |

## 使用方式

### 浏览特效
1. 点击左侧栏「特效大本营」进入特效面板
2. 滚动浏览特效卡片列表
3. 每个卡片展示特效名称和预览动画
4. 点击卡片查看详细信息

### 预览特效
- 特效卡片带有实时动画预览
- 点击「预览」按钮在舞台预览区以全屏方式查看效果

### 应用特效
- 在场景切换或背景变化时，从特效列表中选择想要的效果
- 特效自动应用到 `scene` 或 `show` 语句的 `with` 子句中

## Ren'Py 导出

导出时特效会自动映射为合法的 Ren'Py 语句：

```
scene bg park with dissolve
show heroine happy at &lt;transform&gt; with moveinright
```

所有非内置过渡会经过 `BUILTIN_TRANSITIONS` 白名单校验，并自动生成 `transform` 定义兜底。

---

## 注意事项

- 禁止在 Ren'Py 导出中生成非法的 `zoom()` 属性调用
- 缩放效果必须通过标准逐行 ATL 变换实现
- 缺失素材的过渡效果会降级为注释而非无效语句
