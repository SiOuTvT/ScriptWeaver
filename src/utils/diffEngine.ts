/**
 * 剧本快照差异比对引擎（v0.9.0）
 *
 * 提供两个版本间的 diff 计算，用于可视化历史快照比对。
 * 比对维度：行数变化、台词差异、角色配置变化、素材变化。
 */

import type { LineDelta } from '@/core/types'

export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged'

export interface LineDiff {
  index: number
  type: DiffType
  oldLine?: LineDelta
  newLine?: LineDelta
  /** 具体的差异描述 */
  changes?: string[]
}

export interface SnapshotDiff {
  /** 行差异列表 */
  lineDiffs: LineDiff[]
  /** 行数变化 */
  linesAdded: number
  linesRemoved: number
  linesModified: number
  /** 变化摘要 */
  summary: string
}

/**
 * 计算两版 LineDelta[] 的差异
 */
export function diffDeltas(
  oldDeltas: LineDelta[] | undefined,
  newDeltas: LineDelta[] | undefined,
): SnapshotDiff {
  const oldArr = oldDeltas ?? []
  const newArr = newDeltas ?? []

  const lineDiffs: LineDiff[] = []
  let linesAdded = 0
  let linesRemoved = 0
  let linesModified = 0

  const maxLen = Math.max(oldArr.length, newArr.length)

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldArr[i]
    const newLine = newArr[i]

    if (!oldLine && newLine) {
      lineDiffs.push({ index: i, type: 'added', newLine })
      linesAdded++
    } else if (oldLine && !newLine) {
      lineDiffs.push({ index: i, type: 'removed', oldLine })
      linesRemoved++
    } else if (oldLine && newLine) {
      const changes = compareLines(oldLine, newLine)
      if (changes.length > 0) {
        lineDiffs.push({ index: i, type: 'modified', oldLine, newLine, changes })
        linesModified++
      } else {
        lineDiffs.push({ index: i, type: 'unchanged', oldLine, newLine })
      }
    }
  }

  const summaryParts: string[] = []
  if (linesAdded > 0) summaryParts.push(`新增 ${linesAdded} 行`)
  if (linesRemoved > 0) summaryParts.push(`删除 ${linesRemoved} 行`)
  if (linesModified > 0) summaryParts.push(`修改 ${linesModified} 行`)
  const summary = summaryParts.length > 0 ? summaryParts.join('、') : '无变化'

  return { lineDiffs, linesAdded, linesRemoved, linesModified, summary }
}

/** 比对两行的具体变化 */
function compareLines(oldLine: LineDelta, newLine: LineDelta): string[] {
  const changes: string[] = []

  if (oldLine.speaker !== newLine.speaker) {
    changes.push(`说话人: ${oldLine.speaker || '(旁白)'} → ${newLine.speaker || '(旁白)'}`)
  }
  if (oldLine.dialogue !== newLine.dialogue) {
    changes.push('台词变更')
  }
  if (oldLine.line_type !== newLine.line_type) {
    changes.push(`行类型: ${oldLine.line_type || 'dialogue'} → ${newLine.line_type || 'dialogue'}`)
  }
  if (oldLine.label !== newLine.label) {
    changes.push(`标签: ${oldLine.label || '(无)'} → ${newLine.label || '(无)'}`)
  }

  // 背景变化
  if (oldLine.background?.asset_id !== newLine.background?.asset_id) {
    changes.push('背景切换')
  }

  // 角色变化
  const oldCharKeys = Object.keys(oldLine.characters)
  const newCharKeys = Object.keys(newLine.characters)
  const added = newCharKeys.filter((k) => !oldCharKeys.includes(k))
  const removed = oldCharKeys.filter((k) => !newCharKeys.includes(k))
  if (added.length > 0) changes.push(`角色上场: ${added.join(', ')}`)
  if (removed.length > 0) changes.push(`角色退场: ${removed.join(', ')}`)

  // 音频变化
  if (JSON.stringify(oldLine.audio) !== JSON.stringify(newLine.audio)) {
    changes.push('音频变更')
  }

  return changes
}
