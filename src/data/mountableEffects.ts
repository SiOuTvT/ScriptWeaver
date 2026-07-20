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
}

/** 可挂载特效预设定义 */
export interface MountableEffectDef {
  /** 唯一注册键（存储进 MountedEffect.effectId，绝不与其它预设重复） */
  id: string
  /** 关联 renpyEffects 的 EffectItem.id（用于「查看百科」深链，如 'tf-alpha'） */
  renpyEffectId: string
  /** 展示名（下拉与面板显示） */
  cn: string
  /** 可挂载目标：立绘 / 背景（多数两者皆可） */
  scope: ('sprite' | 'background')[]
  /** 挂载语义（驱动导出通道） */
  kind: EffectKind
  /** 三大核心类目归属（驱动 UI 分组导航） */
  category: EffectCategory3
  /** 可调参数 */
  params: MountParamSpec[]
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
    id: 'shake', renpyEffectId: 'shake', cn: '自定义抖动 (Shake)', category: 'element', scope: ['sprite'], kind: 'transform',
    params: [
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.6, unit: 's' },
      { key: 'amplitude', label: '幅度', min: 2, max: 40, step: 1, def: 10, unit: 'px' },
    ],
  },
  {
    id: 'zoomin', renpyEffectId: 'zoomin', cn: '弹性放大 (ZoomIn)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [
      { key: 'zoom', label: '目标缩放', min: 1, max: 2, step: 0.05, def: 1.2, unit: 'x' },
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.6, unit: 's' },
    ],
  },
  {
    // 描边闪烁 = alpha 循环；关联特效大本营的 tf-alpha 条目，但用独立 id 以区分参数
    id: 'blink', renpyEffectId: 'tf-alpha', cn: '描边闪烁 (Blink)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [
      { key: 'frequency', label: '频率', min: 0.5, max: 4, step: 0.5, def: 2, unit: 'Hz' },
      { key: 'minAlpha', label: '最低透明度', min: 0, max: 1, step: 0.05, def: 0.2 },
    ],
  },
  {
    id: 'breathing', renpyEffectId: 'tf-zoom', cn: '呼吸效果 (Breathing)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [
      { key: 'rate', label: '频率', min: 0.2, max: 2, step: 0.1, def: 0.6, unit: 'Hz' },
      { key: 'depth', label: '缩放幅度', min: 0.02, max: 0.2, step: 0.01, def: 0.05, unit: 'x' },
    ],
  },
  {
    id: 'nudge', renpyEffectId: 'tf-offset', cn: '位置微调 (Nudge)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [
      { key: 'dx', label: '水平幅度', min: 0, max: 20, step: 1, def: 6, unit: 'px' },
      { key: 'dy', label: '垂直幅度', min: 0, max: 20, step: 1, def: 4, unit: 'px' },
      { key: 'rate', label: '频率', min: 0.2, max: 2, step: 0.1, def: 1, unit: 'Hz' },
    ],
  },
  {
    id: 'alpha', renpyEffectId: 'tf-alpha', cn: '透明度 (Alpha)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [
      { key: 'alpha', label: '不透明度', min: 0, max: 1, step: 0.05, def: 0.6 },
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' },
    ],
  },
  {
    id: 'rotate', renpyEffectId: 'tf-rotate', cn: '旋转 (Rotate)', category: 'element', scope: ['sprite', 'background'], kind: 'transform',
    params: [
      { key: 'angle', label: '角度', min: 0, max: 360, step: 5, def: 360, unit: '°' },
      { key: 'duration', label: '时长', min: 0.2, max: 3, step: 0.1, def: 1, unit: 's' },
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

  // ===================== 二、全屏转场类（Transitions） =====================
  // 针对场景切换 / 剧本行行进的视觉过渡，导出为 `with <transition>`。
  // 内建工厂（dissolve/fade/pixellate/四向 wipe）直接 `with <id>(参数)`，无自定义定义。
  {
    id: 'dissolve', renpyEffectId: 'dissolve', cn: '溶解 (Dissolve)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    params: [{ key: 'time', label: '时长', min: 0.1, max: 3, step: 0.1, def: 0.5, unit: 's' }],
  },
  {
    id: 'pixellate', renpyEffectId: 'pixellate', cn: '像素化 (Pixellate)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    params: [
      { key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.5, unit: 's' },
      { key: 'steps', label: '块级数', min: 1, max: 8, step: 1, def: 4 },
    ],
  },
  {
    id: 'fade', renpyEffectId: 'fade', cn: '淡入淡出 (Fade)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    params: [
      { key: 'out_time', label: '淡出', min: 0.1, max: 2, step: 0.1, def: 0.5, unit: 's' },
      { key: 'hold_time', label: '停留', min: 0, max: 2, step: 0.1, def: 0, unit: 's' },
      { key: 'in_time', label: '淡入', min: 0.1, max: 2, step: 0.1, def: 0.5, unit: 's' },
    ],
  },
  {
    id: 'wiperight', renpyEffectId: 'wiperight', cn: '擦除·右 (WipeRight)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'wipeleft', renpyEffectId: 'wiperight', cn: '擦除·左 (WipeLeft)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'wipeup', renpyEffectId: 'wiperight', cn: '擦除·上 (WipeUp)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  {
    id: 'wipedown', renpyEffectId: 'wiperight', cn: '擦除·下 (WipeDown)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition',
    params: [{ key: 'time', label: '时长', min: 0.2, max: 3, step: 0.1, def: 0.8, unit: 's' }],
  },
  // 自定义 ATL 过渡（仍走 with，但需生成 sw_custom_ 定义）
  {
    id: 'hpunch', renpyEffectId: 'hpunch', cn: '水平震屏 (HPunch)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition', params: [],
  },
  {
    id: 'vpunch', renpyEffectId: 'vpunch', cn: '垂直震屏 (VPunch)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition', params: [],
  },
  {
    id: 'flash', renpyEffectId: 'flash', cn: '闪白 (Flash)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition', params: [],
  },
  {
    id: 'blinds', renpyEffectId: 'blinds', cn: '百叶窗 (Blinds)', category: 'transition', scope: ['sprite', 'background'], kind: 'transition', params: [],
  },

  // ===================== 三、全屏滤镜类（Shaders / Filters） =====================
  // 针对整个舞台色调与氛围，导出为 `show layer master: matrixcolor <Matrix>`，
  // 复用 Ren'Py 内建 SaturationMatrix / SepiaMatrix / HueMatrix，无需自定义 shader。
  {
    id: 'monochrome', renpyEffectId: 'mc-saturation', cn: '黑白 / 回忆 (Monochrome)', category: 'filter', scope: ['sprite', 'background'], kind: 'filter',
    params: [{ key: 'saturation', label: '去色程度', min: 0, max: 1, step: 0.05, def: 0, unit: 'x' }],
  },
  {
    id: 'sepia', renpyEffectId: 'mc-sepia', cn: '老照片 (Sepia)', category: 'filter', scope: ['sprite', 'background'], kind: 'filter', params: [],
  },
  {
    id: 'colormatrix', renpyEffectId: 'mc-matrix', cn: '调色滤镜 (ColorMatrix/Tint)', category: 'filter', scope: ['sprite', 'background'], kind: 'filter',
    params: [
      { key: 'hue', label: '色相', min: 0, max: 360, step: 5, def: 0, unit: '°' },
      { key: 'saturation', label: '饱和度', min: 0, max: 2, step: 0.05, def: 1, unit: 'x' },
    ],
  },
]

// ===================== 工具 =====================

/** 按唯一 id 查预设定义 */
export function getMountable(id: string): MountableEffectDef | undefined {
  return MOUNTABLE_EFFECTS.find((m) => m.id === id)
}

/** 按挂载目标过滤可用预设 */
export function mountablesForScope(scope: 'sprite' | 'background'): MountableEffectDef[] {
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
