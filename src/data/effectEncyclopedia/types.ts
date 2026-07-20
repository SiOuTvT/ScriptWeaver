// ============================================================
// ScriptWeaver · 特效百科「灾难级」扩展内容层
// ------------------------------------------------------------
// 与 renpyEffects.ts 完全解耦：此处只承载「第二级纯百科页」的
// 四大深度板块（🎭艺术演出 / 📐参数手册 / 💻双引擎代码 / ⚠️性能避坑），
// 按 effect id 索引。EffectsLab.DetailView 合并渲染，不触碰
// 已验证的 preview 规格，万无一失。
// ============================================================

/** 📐 参数手册中的单条参数 */
export interface EncParam {
  name: string
  /** 类型 */
  type: string
  /** 默认值 */
  def: string
  /** 取值范围与单位 */
  range: string
  /** 修改该参数会如何改变视觉效果 */
  effect: string
}

/** 单个特效的百科扩展条目 */
export interface EncEntry {
  /** 🎭 剧情应用场景与艺术演出指导（感性 + 专业） */
  artGuide: string
  /** 📐 完备的底层参数拆解手册 */
  paramManual?: EncParam[]
  /** 💻 双引擎原生代码示例对照：本项目 Electron + React + CSS 架构下的实现源码 */
  cssImpl: string
  /** ⚠️ 性能提示与视觉避坑指南 */
  perfTips: string
}

/** id -> 百科条目 */
export type Encyclopedia = Record<string, EncEntry>
