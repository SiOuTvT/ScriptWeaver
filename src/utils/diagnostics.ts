/**
 * 工程体检诊断引擎（v0.9.0）
 *
 * 扫描全剧本逻辑，检测：
 *  1. 悬空 Jump 跳转 —— choice.target_label 指向不存在的 label
 *  2. 不存在的 Label —— 被引用但剧本中未定义
 *  3. 未挂载资产的资源引用 —— background/character/audio 引用了不存在的 asset_id
 *  4. 残缺的选择支逻辑 —— choice 行无选项、选项无 target_label、条件表达式语法可疑
 */

import type { LineDelta, AssetItem, CharacterConfig, ChoiceItem } from '@/core/types'

export type DiagSeverity = 'error' | 'warning' | 'info'

export interface DiagnosticItem {
  id: string
  severity: DiagSeverity
  category: 'jump' | 'label' | 'asset' | 'choice' | 'structure'
  message: string
  /** 关联的剧本行索引（0-based） */
  lineIndex: number
  lineId: string
  /** 额外的上下文描述 */
  detail?: string
}

export interface DiagnosticsReport {
  totalLines: number
  totalIssues: number
  errors: number
  warnings: number
  infos: number
  items: DiagnosticItem[]
  summary: string
}

let _uid = 0
function did(): string {
  return `diag_${++_uid}_${Date.now()}`
}

/** 收集所有已定义的 label → lineIndex 映射 */
function collectLabels(deltas: LineDelta[]): Map<string, number> {
  const map = new Map<string, number>()
  deltas.forEach((d, i) => {
    if (d.label && d.label.trim()) {
      map.set(d.label.trim(), i)
    }
  })
  return map
}

/** 收集所有被引用的 asset_id */
function collectReferencedAssetIds(deltas: LineDelta[]): Set<string> {
  const ids = new Set<string>()
  for (const d of deltas) {
    if (d.background?.asset_id) ids.add(d.background.asset_id)
    for (const ch of Object.values(d.characters)) {
      if (ch.asset_id) ids.add(ch.asset_id)
    }
    if (d.audio.bgm && typeof d.audio.bgm === 'object') ids.add(d.audio.bgm.asset_id)
    if (d.audio.ambient && typeof d.audio.ambient === 'object') ids.add(d.audio.ambient.asset_id)
    for (const se of d.audio.se) ids.add(se)
    if (d.audio.voice) ids.add(d.audio.voice)
  }
  return ids
}

/** 检查条件表达式基本语法（简单启发式） */
function checkConditionSyntax(condition: string): { ok: boolean; hint?: string } {
  if (!condition || !condition.trim()) return { ok: true }
  const c = condition.trim()
  // 检查括号匹配
  let depth = 0
  for (const ch of c) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (depth < 0) return { ok: false, hint: '括号不匹配' }
  }
  if (depth !== 0) return { ok: false, hint: '括号不匹配' }
  // 检查引号匹配
  const sq = (c.match(/'/g) || []).length
  const dq = (c.match(/"/g) || []).length
  if (sq % 2 !== 0) return { ok: false, hint: '单引号不匹配' }
  if (dq % 2 !== 0) return { ok: false, hint: '双引号不匹配' }
  return { ok: true }
}

/**
 * 运行完整诊断扫描
 */
export function runDiagnostics(
  deltas: LineDelta[],
  assets: AssetItem[],
  characterConfigs: CharacterConfig[],
): DiagnosticsReport {
  const items: DiagnosticItem[] = []
  const labels = collectLabels(deltas)
  const referencedAssets = collectReferencedAssetIds(deltas)
  const allAssetIds = new Set(assets.map((a) => a.id))
  const allCharIds = new Set(characterConfigs.map((c) => c.charId))

  // 扫描每一行
  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i]

    // 1. 选择支逻辑检查
    if (d.line_type === 'choice') {
      const choices = d.choices ?? []
      if (choices.length === 0) {
        items.push({
          id: did(), severity: 'error', category: 'choice',
          message: '选择支行没有任何选项',
          lineIndex: i, lineId: d.line_id,
          detail: '添加至少一个选项，或将该行切换为对话行',
        })
      }
      for (const c of choices) {
        // 检查 target_label 悬空
        if (c.target_label && c.target_label.trim()) {
          const tl = c.target_label.trim()
          if (!labels.has(tl)) {
            items.push({
              id: did(), severity: 'error', category: 'jump',
              message: `选项「${c.text || '(无文本)'}」跳转到不存在的标签「${tl}」`,
              lineIndex: i, lineId: d.line_id,
              detail: `请确认剧本中存在 label ${tl}: 的定义`,
            })
          }
        }
        // 检查条件表达式语法
        if (c.condition) {
          const check = checkConditionSyntax(c.condition)
          if (!check.ok) {
            items.push({
              id: did(), severity: 'warning', category: 'choice',
              message: `选项「${c.text || '(无文本)'}」的条件表达式可能有误：${check.hint}`,
              lineIndex: i, lineId: d.line_id,
              detail: `条件：${c.condition}`,
            })
          }
        }
        // 检查 option 内联变量操作引用的变量
        if (c.ops) {
          for (const op of c.ops) {
            items.push({
              id: did(), severity: 'info', category: 'choice',
              message: `选项「${c.text || '(无文本)'}」含内联变量操作：${op.varName} ${op.op} ${op.value ?? ''}`,
              lineIndex: i, lineId: d.line_id,
            })
          }
        }
      }
    }

    // 2. 变量操作检查（顶层 variableOps）
    if (d.variableOps && d.variableOps.length > 0) {
      for (const op of d.variableOps) {
        items.push({
          id: did(), severity: 'info', category: 'structure',
          message: `变量操作：${op.varName} ${op.op} ${op.value ?? ''}`,
          lineIndex: i, lineId: d.line_id,
        })
      }
    }

    // 3. 资产引用检查
    if (d.background?.asset_id && !allAssetIds.has(d.background.asset_id)) {
      items.push({
        id: did(), severity: 'warning', category: 'asset',
        message: `背景引用了不存在的素材 ID：${d.background.asset_id}`,
        lineIndex: i, lineId: d.line_id,
        detail: '该素材可能已被删除或尚未导入',
      })
    }
    for (const [key, ch] of Object.entries(d.characters)) {
      if (ch.asset_id && !allAssetIds.has(ch.asset_id)) {
        items.push({
          id: did(), severity: 'warning', category: 'asset',
          message: `角色「${ch.char_id || key}」引用了不存在的立绘素材 ID：${ch.asset_id}`,
          lineIndex: i, lineId: d.line_id,
          detail: '该素材可能已被删除或尚未导入',
        })
      }
    }
    if (d.audio.bgm && typeof d.audio.bgm === 'object' && !allAssetIds.has(d.audio.bgm.asset_id)) {
      items.push({
        id: did(), severity: 'warning', category: 'asset',
        message: `BGM 引用了不存在的音频素材 ID：${d.audio.bgm.asset_id}`,
        lineIndex: i, lineId: d.line_id,
      })
    }
    if (d.audio.voice && !allAssetIds.has(d.audio.voice)) {
      items.push({
        id: did(), severity: 'warning', category: 'asset',
        message: `语音引用了不存在的音频素材 ID：${d.audio.voice}`,
        lineIndex: i, lineId: d.line_id,
      })
    }
    for (const se of d.audio.se) {
      if (!allAssetIds.has(se)) {
        items.push({
          id: did(), severity: 'warning', category: 'asset',
          message: `音效引用了不存在的音频素材 ID：${se}`,
          lineIndex: i, lineId: d.line_id,
        })
      }
    }
  }

  // 4. 跨行检查：未使用的标签（定义了但没被 jump 引用）
  const referencedLabels = new Set<string>()
  for (const d of deltas) {
    if (d.choices) {
      for (const c of d.choices) {
        if (c.target_label?.trim()) referencedLabels.add(c.target_label.trim())
      }
    }
  }
  for (const [label, li] of labels) {
    // 第一个 label（起点）不需要被引用
    if (li === 0) continue
    if (!referencedLabels.has(label)) {
      items.push({
        id: did(), severity: 'info', category: 'label',
        message: `标签「${label}」未被任何选择支跳转引用`,
        lineIndex: li, lineId: deltas[li].line_id,
        detail: '如果这是起点或备用节点可忽略；否则可能缺少跳转到此的选项',
      })
    }
  }

  // 5. 未使用的素材（导入了但未被引用）
  const unusedAssets = allAssetIds.difference(referencedAssets)
  for (const aid of unusedAssets) {
    const a = assets.find((x) => x.id === aid)
    if (a) {
      items.push({
        id: did(), severity: 'info', category: 'asset',
        message: `素材「${a.name}」(${a.type}) 未被任何剧本行引用`,
        lineIndex: -1, lineId: '',
        detail: a.relativePath,
      })
    }
  }

  // 按严重程度排序：error > warning > info
  items.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 }
    return (order[a.severity] - order[b.severity]) || a.lineIndex - b.lineIndex
  })

  const errors = items.filter((x) => x.severity === 'error').length
  const warnings = items.filter((x) => x.severity === 'warning').length
  const infos = items.filter((x) => x.severity === 'info').length

  let summary: string
  if (items.length === 0) {
    summary = '工程健康：未发现任何问题'
  } else {
    const parts: string[] = []
    if (errors > 0) parts.push(`${errors} 个错误`)
    if (warnings > 0) parts.push(`${warnings} 个警告`)
    if (infos > 0) parts.push(`${infos} 个提示`)
    summary = `发现 ${parts.join('、')}`
  }

  return {
    totalLines: deltas.length,
    totalIssues: items.length,
    errors,
    warnings,
    infos,
    items,
    summary,
  }
}
