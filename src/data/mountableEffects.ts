// ============================================================
// 可挂载特效预设登记表（时间轴 → 特效大本营 闭环的核心桥）
// ------------------------------------------------------------
// 把「特效大本营」(renpyEffects) 中「可被挂载到剧本行 / 立绘 / 背景」的
// 特效抽成可实例化预设：每个预设有唯一 id，并通过 renpyEffectId 关联
// renpyEffects 的 EffectItem（保证与特效大本营同源、可跳转百科）。
// 并声明它的挂载语义（transition / transform）与可调参数规格。
//
// 用户在时间轴右侧面板「添加特效」时，下拉即来自本表；
// 挂载后微调的参数经单事务提交持久化；任务 2/2 导出闭环按
// kind + params 生成对应的 `with <transition>` 或 `at <transform>`。
// ============================================================

import type { MountedEffect } from '@/core/types'

/** 挂载语义（驱动导出）：转场（导出为 with）/ 变换（导出为 at transform）/ 滤镜（导出为 show layer master: matrixcolor） */
export type EffectKind = 'transition' | 'transform' | 'filter'

/** 三大核心类目（驱动「特效大本营」目录导航与 UI 分组，不推翻既有 id/kind 归类） */
export type EffectCategory3 = 'element' | 'transition' | 'filter'

/** 三大类目展示元数据 */
export const EFFECT_CATEGORY3_META: Record<EffectCategory3, { label: string; short: string; desc: string }> = {
  element: {
    label: '组件 / 元素特效',
    short: '元素',
    desc: '针对单个立绘、单张背景的动效：震动、弹性放大、描边闪烁、呼吸、位置微调。',
  },
  transition: {
    label: '全屏转场',
    short: '转场',
    desc: '针对场景切换、剧本行行进的视觉过渡：溶解、像素化、淡入淡出、擦除。',
  },
  filter: {
    label: '全屏滤镜',
    short: '滤镜',
    desc: '针对整个舞台色调与氛围的改变（回忆、老照片、中毒、重伤、黑夜）。',
  },
}

/**
 * 导出通道：决定该预设最终生成什么 Ren'Py 代码。
 * 经官方手册（transitions / matrixcolor 章节）逐条复核，杜绝非法调用。
 *  - bare      预定义转场变量，只能裸用：with moveinleft（加括号会 TypeError）
 *  - factory   真正可调用的转场工厂：with dissolve(0.5)
 *  - cropmove  CropMove(time, mode) 实例族：擦除 / 滑动 / 滑出 / 虹膜
 *  - pushmove  PushMove(time, mode) 实例族：推移
 *  - custom    无官方对应，生成 sw_custom_ 前缀的自定义 ATL transform
 *  - matrix    全屏滤镜，走 show layer master 的 matrixcolor
 */
export type EffectEmit =
  | { via: 'bare'; name: string }
  | { via: 'factory'; name: string }
  | { via: 'cropmove'; mode: string }
  | { via: 'pushmove'; mode: string }
  | { via: 'custom' }
  | { via: 'matrix' }

/** 转场二级分组（下拉过长时按族收拢，纯展示用） */
export type EffectGroup =
  | 'dissolve' | 'move' | 'ease' | 'push' | 'slide'
  | 'wipe' | 'iris' | 'zoom' | 'impact' | 'misc'

/** 二级分组展示顺序 */
export const EFFECT_GROUP_ORDER: EffectGroup[] = [
  'dissolve', 'move', 'ease', 'push', 'slide', 'wipe', 'iris', 'zoom', 'impact', 'misc',
]

/** 二级分组显示名 */
export const EFFECT_GROUP_LABEL: Record<EffectGroup, string> = {
  dissolve: '溶解与淡入',
  move: '推移 Move',
  ease: '缓动 Ease',
  push: '推挤 Push',
  slide: '滑动 Slide',
  wipe: '擦除 Wipe',
  iris: '虹膜 Iris',
  zoom: '缩放 Zoom',
  impact: '冲击与闪烁',
  misc: '其它',
}

/**
 * 官方内建 warper（插值曲线）全集，对齐手册 WARPERS 一节共 32 条。
 * 顺序上把最常用的四条前置，其余按 Penner 家族排列。
 * 注意：ATL 中 warper 是语法关键字而非可传参的值，故只能在生成代码时内联。
 */
export const RENPY_WARPERS: readonly string[] = [
  'linear', 'ease', 'easein', 'easeout', 'pause',
  'ease_quad', 'easein_quad', 'easeout_quad',
  'ease_cubic', 'easein_cubic', 'easeout_cubic',
  'ease_quart', 'easein_quart', 'easeout_quart',
  'ease_quint', 'easein_quint', 'easeout_quint',
  'ease_expo', 'easein_expo', 'easeout_expo',
  'ease_circ', 'easein_circ', 'easeout_circ',
  'ease_back', 'easein_back', 'easeout_back',
  'ease_elastic', 'easein_elastic', 'easeout_elastic',
  'ease_bounce', 'easein_bounce', 'easeout_bounce',
]

/** 缓动曲线参数的固定键名 */
export const WARP_KEY = 'warp'

/** 可复用的缓动曲线参数规格（存索引，导出时映射为 warper 名） */
export const WARP_PARAM: MountParamSpec = {
  key: WARP_KEY,
  label: '缓动曲线',
  min: 0,
  max: RENPY_WARPERS.length - 1,
  step: 1,
  def: 0,
  enumValues: RENPY_WARPERS,
}

/** 由参数值取 warper 名（越界回落 linear） */
export function warperName(index: number | undefined): string {
  const i = Math.round(index ?? 0)
  return RENPY_WARPERS[i] ?? 'linear'
}

/** 单个可调数值参数规格 */
export interface MountParamSpec {
  /** 参数键（写入 MountedEffect.params） */
  key: string
  /** 显示名 */
  label: string
  min: number
  max: number
  step: number
  /** 默认值 */
  def: number
  /** 单位（s / px / ° / x / Hz），仅展示 */
  unit?: string
  /**
   * 枚举取值表。存在时该参数为「离散选项」而非连续滑块，
   * params 中仍存数值索引，导出时映射为此表中的字符串。
   */
  enumValues?: readonly string[]
}

/** 可挂载特效预设定义 */
export interface MountableEffectDef {
  /** 唯一注册键（存储进 MountedEffect.effectId，绝不与其它预设重复） */
  id: string
  /** 关联 renpyEffects 的 EffectItem.id（用于「查看百科」深链，如 'tf-alpha'） */
  renpyEffectId: string
  /** 展示名（下拉与面板显示） */
  cn: string
  /** 可挂载目标：立绘 / 背景 / 舞台镜头（camera）/ 滤镜专用（filter，仅 matrixcolor 类） */
  scope: ('sprite' | 'background' | 'stage' | 'filter')[]
  /** 挂载语义（驱动导出通道） */
  kind: EffectKind
  /** 三大核心类目归属（驱动 UI 分组导航） */
  category: EffectCategory3
  /** 可调参数 */
  params: MountParamSpec[]
  /** 导出通道；缺省按 kind 推断（filter → matrix，其余 → custom） */
  emit?: EffectEmit
  /** 转场二级分组（仅 transition 类目使用） */
  group?: EffectGroup
}

/** 取导出通道（未显式声明时按 kind 安全兜底） */
export function emitOf(def: MountableEffectDef): EffectEmit {
  if (def.emit) return def.emit
  return def.kind === 'filter' ? { via: 'matrix' } : { via: 'custom' }
}

/** 三大类目固定顺序，供 UI 分组遍历 */
export const EFFECT_CATEGORY3_ORDER: EffectCategory3[] = ['element', 'transition', 'filter']

// ===================== 预设登记（三大核心类目，全量归仓） =====================
// 类目一 element（组件/元素特效）→ 导出 `at <transform>` 叠加
// 类目二 transition（全屏转场）→ 导出 `with <transition>`
// 类目三 filter（全屏滤镜）→ 导出 `show layer master: matrixcolor <Matrix>`
// 全部可映射到真实 Ren'Py，且 id 不与任何预设重复。
export const MOUNTABLE_EFFECTS: MountableEffectDef[] = [
  // ===================== 一、组件 / 元素特效类（Element Effects） =====================
  // 针对单个立绘 / 单张背景的持续动效，导出为 `at <transform>` 叠加在元素上。
  {
    id: 'shake', renpyEffectId: 'shake', cn: '自定义抖动 (Shake)', category: 'element', scope: ['sprite', 'stage'], kind: 'transform',
    params: [
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.6, unit: 's' },
      { key: 'amplitude', label: '幅度', min: 2, max: 40, step: 1, def: 10, unit: 'px' },
      WARP_PARAM,
    ],
  },
  {
    id: 'zoomin', renpyEffectId: 'zoomin', cn: '弹性放大 (ZoomIn)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    params: [
      { key: 'zoom', label: '目标缩放', min: 1, max: 2, step: 0.05, def: 1.2, unit: 'x' },
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.6, unit: 's' },
      WARP_PARAM,
    ],
  },
  {
    // 描边闪烁 = alpha 循环；关联特效大本营的 tf-alpha 条目，但用独立 id 以区分参数
    id: 'blink', renpyEffectId: 'tf-alpha', cn: '描边闪烁 (Blink)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [
      { key: 'frequency', label: '频率', min: 0.5, max: 4, step: 0.5, def: 2, unit: 'Hz' },
      { key: 'minAlpha', label: '最低透明度', min: 0, max: 1, step: 0.05, def: 0.2 },
      WARP_PARAM,
    ],
  },
  {
    id: 'breathing', renpyEffectId: 'tf-zoom', cn: '呼吸效果 (Breathing)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    params: [
      { key: 'rate', label: '频率', min: 0.2, max: 2, step: 0.1, def: 0.6, unit: 'Hz' },
      { key: 'depth', label: '缩放幅度', min: 0.02, max: 0.2, step: 0.01, def: 0.05, unit: 'x' },
      WARP_PARAM,
    ],
  },
  {
    id: 'nudge', renpyEffectId: 'tf-offset', cn: '位置微调 (Nudge)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    params: [
      { key: 'dx', label: '水平幅度', min: 0, max: 20, step: 1, def: 6, unit: 'px' },
      { key: 'dy', label: '垂直幅度', min: 0, max: 20, step: 1, def: 4, unit: 'px' },
      { key: 'rate', label: '频率', min: 0.2, max: 2, step: 0.1, def: 1, unit: 'Hz' },
      WARP_PARAM,
    ],
  },
  {
    id: 'alpha', renpyEffectId: 'tf-alpha', cn: '透明度 (Alpha)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    params: [
      { key: 'alpha', label: '不透明度', min: 0, max: 1, step: 0.05, def: 0.6 },
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' },
      WARP_PARAM,
    ],
  },
  {
    id: 'rotate', renpyEffectId: 'tf-rotate', cn: '旋转 (Rotate)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    params: [
      { key: 'angle', label: '角度', min: 0, max: 360, step: 5, def: 360, unit: '°' },
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 1, unit: 's' },
      WARP_PARAM,
    ],
  },
  {
    id: 'zoom', renpyEffectId: 'tf-zoom', cn: '整体缩放 (Zoom)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [{ key: 'zoom', label: '缩放', min: 0.5, max: 2, step: 0.05, def: 1.2, unit: 'x' }],
  },
  {
    id: 'blur', renpyEffectId: 'tf-blur', cn: '模糊 (Blur)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [{ key: 'blur', label: '模糊半径', min: 0, max: 20, step: 1, def: 6, unit: 'px' }],
  },

  // ===================== 立体 / 镜头 3D 族（perspective + x/y/zrotate + zzoom） =====================
  // 官方 3D 舞台基于 transform 的 perspective 属性 + 旋转/深度属性，导出为参数化 ATL transform。
  // 可挂载到立绘 / 背景（做单体 3D 翻面），也可挂载到舞台镜头（camera）做整屏立体运动。
  {
    id: 't-3d-flip', renpyEffectId: 's-perspective', cn: '立体翻转 (3D Flip)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    emit: { via: 'custom' },
    params: [
      { key: 'perspective', label: '透视强度', min: 200, max: 2000, step: 50, def: 800 },
      { key: 'duration', label: '时长', min: 0.3, max: 4, step: 0.1, def: 1.2, unit: 's' },
      WARP_PARAM,
    ],
  },
  {
    id: 't-3d-tumble', renpyEffectId: 's-perspective', cn: '立体翻滚 (3D Tumble)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    emit: { via: 'custom' },
    params: [
      { key: 'perspective', label: '透视强度', min: 200, max: 2000, step: 50, def: 800 },
      { key: 'duration', label: '时长', min: 0.3, max: 4, step: 0.1, def: 1.2, unit: 's' },
      WARP_PARAM,
    ],
  },
  {
    id: 't-3d-orbit', renpyEffectId: 's-matrixtransform', cn: '立体环绕 (3D Orbit)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    emit: { via: 'custom' },
    params: [
      { key: 'perspective', label: '透视强度', min: 200, max: 2000, step: 50, def: 800 },
      { key: 'duration', label: '时长', min: 0.3, max: 4, step: 0.1, def: 1.4, unit: 's' },
      WARP_PARAM,
    ],
  },
  {
    id: 't-3d-zoom', renpyEffectId: 's-perspective', cn: '立体推进 (3D Zoom)', category: 'element', scope: ['sprite', 'background', 'stage'], kind: 'transform',
    emit: { via: 'custom' },
    params: [
      { key: 'perspective', label: '透视强度', min: 200, max: 2000, step: 50, def: 800 },
      { key: 'duration', label: '时长', min: 0.3, max: 4, step: 0.1, def: 1, unit: 's' },
      WARP_PARAM,
    ],
  },


  // ===================== 二、全屏转场类（Transitions） =====================
  // 针对场景切换 / 剧本行行进的视觉过渡，导出为 `with <transition>`。
  // 三条通道经官方手册复核：可调用工厂 → with Dissolve(0.5)；预定义实例 → 裸用；
  // CropMove / PushMove 实例族 → with CropMove(time, "mode")。绝不对预定义实例加括号。
  {
    id: 'dissolve', renpyEffectId: 'dissolve', cn: '溶解 (Dissolve)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'factory', name: 'Dissolve' }, group: 'dissolve',
    params: [{ key: 'time', label: '时长', min: 0.1, max: 3, step: 0.1, def: 0.5, unit: 's' }],
  },
  {
    id: 'pixellate', renpyEffectId: 'pixellate', cn: '像素化 (Pixellate)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'factory', name: 'Pixellate' }, group: 'misc',
    params: [
      { key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.5, unit: 's' },
      { key: 'steps', label: '块级数', min: 1, max: 8, step: 1, def: 4 },
    ],
  },
  {
    id: 'fade', renpyEffectId: 'fade', cn: '淡入淡出 (Fade)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'factory', name: 'Fade' }, group: 'dissolve',
    params: [
      { key: 'out_time', label: '淡出', min: 0.1, max: 2, step: 0.1, def: 0.5, unit: 's' },
      { key: 'hold_time', label: '停留', min: 0, max: 2, step: 0.1, def: 0, unit: 's' },
      { key: 'in_time', label: '淡入', min: 0.1, max: 2, step: 0.1, def: 0.5, unit: 's' },
    ],
  },
  // 擦除族：官方 wiperight 等是 CropMove 实例（不可调用），带时长参数必须写成 CropMove(time, "wiperight")
  {
    id: 'wiperight', renpyEffectId: 'wiperight', cn: '擦除 向右 (WipeRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'wiperight' }, group: 'wipe',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'wipeleft', renpyEffectId: 'wiperight', cn: '擦除 向左 (WipeLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'wipeleft' }, group: 'wipe',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'wipeup', renpyEffectId: 'wiperight', cn: '擦除 向上 (WipeUp)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'wipeup' }, group: 'wipe',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'wipedown', renpyEffectId: 'wiperight', cn: '擦除 向下 (WipeDown)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'wipedown' }, group: 'wipe',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  // 官方预定义转场实例：只能裸用，加括号即 TypeError
  {
    id: 'hpunch', renpyEffectId: 'hpunch', cn: '水平震屏 (HPunch)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'hpunch' }, group: 'impact', params: [],
  },
  {
    id: 'vpunch', renpyEffectId: 'vpunch', cn: '垂直震屏 (VPunch)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'vpunch' }, group: 'impact', params: [],
  },
  {
    id: 'blinds', renpyEffectId: 'blinds', cn: '百叶窗 (Blinds)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'blinds' }, group: 'misc', params: [],
  },
  // 闪白：官方无同名预定义变量，走自定义 ATL 定义
  {
    id: 'flash', renpyEffectId: 'flash', cn: '闪白 (Flash)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'custom' }, group: 'impact', params: [],
  },

  // ---------- 推移 Move 族（MoveTransition 预定义实例，裸用） ----------
  {
    id: 'tr-move', renpyEffectId: 'move', cn: '位置移动 (Move)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'move' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveinleft', renpyEffectId: 'moveinright', cn: '移入 从左侧 (MoveInLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveinleft' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveinright', renpyEffectId: 'moveinright', cn: '移入 从右侧 (MoveInRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveinright' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveintop', renpyEffectId: 'moveinright', cn: '移入 从顶部 (MoveInTop)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveintop' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveinbottom', renpyEffectId: 'moveinright', cn: '移入 从底部 (MoveInBottom)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveinbottom' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveoutleft', renpyEffectId: 'moveoutright', cn: '移出 向左侧 (MoveOutLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveoutleft' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveoutright', renpyEffectId: 'moveoutright', cn: '移出 向右侧 (MoveOutRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveoutright' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveouttop', renpyEffectId: 'moveoutright', cn: '移出 向顶部 (MoveOutTop)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveouttop' }, group: 'move', params: [],
  },
  {
    id: 'tr-moveoutbottom', renpyEffectId: 'moveoutright', cn: '移出 向底部 (MoveOutBottom)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'moveoutbottom' }, group: 'move', params: [],
  },

  // ---------- 缓动 Ease 族（与 Move 同源，附带缓入缓出曲线） ----------
  {
    id: 'tr-ease', renpyEffectId: 'easeinright', cn: '缓动移动 (Ease)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'ease' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeinleft', renpyEffectId: 'easeinright', cn: '缓入 从左侧 (EaseInLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeinleft' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeinright', renpyEffectId: 'easeinright', cn: '缓入 从右侧 (EaseInRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeinright' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeintop', renpyEffectId: 'easeinright', cn: '缓入 从顶部 (EaseInTop)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeintop' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeinbottom', renpyEffectId: 'easeinright', cn: '缓入 从底部 (EaseInBottom)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeinbottom' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeoutleft', renpyEffectId: 'easeinright', cn: '缓出 向左侧 (EaseOutLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeoutleft' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeoutright', renpyEffectId: 'easeinright', cn: '缓出 向右侧 (EaseOutRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeoutright' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeouttop', renpyEffectId: 'easeinright', cn: '缓出 向顶部 (EaseOutTop)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeouttop' }, group: 'ease', params: [],
  },
  {
    id: 'tr-easeoutbottom', renpyEffectId: 'easeinright', cn: '缓出 向底部 (EaseOutBottom)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'easeoutbottom' }, group: 'ease', params: [],
  },

  // ---------- 推挤 Push 族（PushMove(time, mode) 可调时长） ----------
  {
    id: 'tr-pushright', renpyEffectId: 'pushright', cn: '推挤 向右 (PushRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'pushmove', mode: 'pushright' }, group: 'push',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-pushleft', renpyEffectId: 'pushright', cn: '推挤 向左 (PushLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'pushmove', mode: 'pushleft' }, group: 'push',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-pushup', renpyEffectId: 'pushright', cn: '推挤 向上 (PushUp)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'pushmove', mode: 'pushup' }, group: 'push',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-pushdown', renpyEffectId: 'pushright', cn: '推挤 向下 (PushDown)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'pushmove', mode: 'pushdown' }, group: 'push',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },

  // ---------- 滑动 Slide 与滑出 SlideAway 族（CropMove(time, mode) 可调时长） ----------
  {
    id: 'tr-slideright', renpyEffectId: 'slideright', cn: '滑入 向右 (SlideRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slideright' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-slideleft', renpyEffectId: 'slideright', cn: '滑入 向左 (SlideLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slideleft' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-slideup', renpyEffectId: 'slideright', cn: '滑入 向上 (SlideUp)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slideup' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-slidedown', renpyEffectId: 'slideright', cn: '滑入 向下 (SlideDown)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slidedown' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-slideawayright', renpyEffectId: 'slideawayright', cn: '滑出 向右 (SlideAwayRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slideawayright' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-slideawayleft', renpyEffectId: 'slideawayright', cn: '滑出 向左 (SlideAwayLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slideawayleft' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-slideawayup', renpyEffectId: 'slideawayright', cn: '滑出 向上 (SlideAwayUp)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slideawayup' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-slideawaydown', renpyEffectId: 'slideawayright', cn: '滑出 向下 (SlideAwayDown)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'slideawaydown' }, group: 'slide',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },

  // ---------- 虹膜 Iris 族（CropMove(time, mode) 可调时长） ----------
  {
    id: 'tr-irisin', renpyEffectId: 'iris', cn: '虹膜 张开 (IrisIn)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'irisin' }, group: 'iris',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'tr-irisout', renpyEffectId: 'iris', cn: '虹膜 闭合 (IrisOut)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'cropmove', mode: 'irisout' }, group: 'iris',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },

  // ---------- 缩放 Zoom 族与方块马赛克（预定义实例，裸用） ----------
  {
    id: 'tr-zoomin', renpyEffectId: 'zoomin', cn: '缩放 放大进入 (ZoomIn)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'zoomin' }, group: 'zoom', params: [],
  },
  {
    id: 'tr-zoomout', renpyEffectId: 'zoomout', cn: '缩放 缩小退出 (ZoomOut)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'zoomout' }, group: 'zoom', params: [],
  },
  {
    id: 'tr-zoominout', renpyEffectId: 'zoominout', cn: '缩放 进出组合 (ZoomInOut)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'zoominout' }, group: 'zoom', params: [],
  },
  {
    id: 'tr-squares', renpyEffectId: 'squares', cn: '方块马赛克 (Squares)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    emit: { via: 'bare', name: 'squares' }, group: 'misc', params: [],
  },

  // ===================== 三、全屏滤镜类（Shaders / Filters） =====================
  // 针对整个舞台色调与氛围，导出为 `show layer master: matrixcolor <Matrix>`，
  // 复用 Ren'Py 内建 SaturationMatrix / SepiaMatrix / HueMatrix，无需自定义 shader。
  {
    id: 'monochrome', renpyEffectId: 'mc-saturation', cn: '黑白 / 回忆 (Monochrome)', category: 'filter', scope: ['sprite', 'background', 'filter'], kind: 'filter',
    params: [{ key: 'saturation', label: '去色程度', min: 0, max: 1, step: 0.05, def: 0, unit: 'x' }],
  },
  {
    id: 'sepia', renpyEffectId: 'mc-sepia', cn: '老照片 (Sepia)', category: 'filter', scope: ['sprite', 'background', 'filter'], kind: 'filter', params: [],
  },
  {
    id: 'colormatrix', renpyEffectId: 'mc-matrix', cn: '调色滤镜 (ColorMatrix/Tint)', category: 'filter', scope: ['sprite', 'background', 'filter'], kind: 'filter',
    params: [
      { key: 'hue', label: '色相', min: 0, max: 360, step: 5, def: 0, unit: '°' },
      { key: 'saturation', label: '饱和度', min: 0, max: 2, step: 0.05, def: 1, unit: 'x' },
    ],
  },
  // 以下为官方 matrixcolor 章节其余内建矩阵类。注意官方并无 ContrastMatrix，故不提供。
  {
    id: 'brightness', renpyEffectId: 'mc-brightness', cn: '亮度 (Brightness)', category: 'filter', scope: ['sprite', 'background', 'filter'], kind: 'filter',
    params: [{ key: 'value', label: '亮度增减', min: -1, max: 1, step: 0.05, def: 0 }],
  },
  {
    id: 'invert', renpyEffectId: 'mc-invert', cn: '反色 (Invert)', category: 'filter', scope: ['sprite', 'background', 'filter'], kind: 'filter',
    params: [{ key: 'value', label: '反转程度', min: 0, max: 1, step: 0.05, def: 1 }],
  },
  {
    id: 'opacity', renpyEffectId: 'mc-opacity', cn: '整层不透明度 (Opacity)', category: 'filter', scope: ['sprite', 'background', 'filter'], kind: 'filter',
    params: [{ key: 'value', label: '不透明度', min: 0, max: 1, step: 0.05, def: 1 }],
  },
  {
    id: 'hue', renpyEffectId: 'mc-hue', cn: '色相旋转 (Hue)', category: 'filter', scope: ['sprite', 'background', 'filter'], kind: 'filter',
    params: [{ key: 'value', label: '旋转角度', min: 0, max: 360, step: 5, def: 180, unit: '°' }],
  },
]

// ===================== 工具 =====================

/** 按唯一 id 查预设定义 */
export function getMountable(id: string): MountableEffectDef | undefined {
  return MOUNTABLE_EFFECTS.find((m) => m.id === id)
}

/** 按挂载目标过滤可用预设；'stage' 为舞台镜头（camera），作用于整层摄像机 */
export function mountablesForScope(scope: 'sprite' | 'background' | 'stage' | 'filter'): MountableEffectDef[] {
  return MOUNTABLE_EFFECTS.filter((m) => m.scope.includes(scope))
}

let _uidSeq = 0
function genUid(): string {
  _uidSeq += 1
  return `ef_${Date.now().toString(36)}_${_uidSeq}_${Math.random().toString(36).slice(2, 7)}`
}

/** 由预设定义创建一个带默认参数的挂载实例 */
export function createMountedEffect(def: MountableEffectDef): MountedEffect {
  const params: Record<string, number> = {}
  for (const p of def.params) params[p.key] = p.def
  return { uid: genUid(), effectId: def.id, params, enabled: true }
}
