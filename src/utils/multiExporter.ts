/**
 * 剧本多格式导出器（v0.9.0）
 *
 * 支持：
 *  1. Markdown 纯文本导出
 *  2. TXT 纯文本导出
 *  3. HTML 打印友好版（可另存为 PDF）
 *  4. CV 配音演员台词表（CSV 格式，按角色筛选，含字数/句数统计）
 */

import type { LineDelta, LineType, CharacterConfig, AssetItem } from '@/core/types'

export type ExportFormat = 'markdown' | 'txt' | 'html' | 'csv'

export interface ExportOptions {
  format: ExportFormat
  /** 仅导出指定角色的台词（CV 表模式），空 = 全部 */
  characterFilter?: string
  /** 是否包含舞台指令（背景/角色位置等） */
  includeDirections?: boolean
  /** 是否包含行号 */
  includeLineNumbers?: boolean
  /** 剧本标题 */
  title?: string
}

export interface CharacterLineStats {
  charId: string
  displayName: string
  totalChars: number
  totalLines: number
}

/** 统计各角色台词字数与句数 */
export function computeCharacterStats(
  deltas: LineDelta[],
  characters: CharacterConfig[],
): CharacterLineStats[] {
  const map = new Map<string, { chars: number; lines: number }>()
  const nameMap = new Map<string, string>()
  for (const ch of characters) {
    nameMap.set(ch.charId, ch.displayName)
    // 也按 displayName 建立反向映射，用于 speaker 匹配
    nameMap.set(ch.displayName, ch.displayName)
  }

  for (const d of deltas) {
    if (!d.speaker || !d.dialogue) continue
    const displayName = nameMap.get(d.speaker) || d.speaker
    const existing = map.get(displayName)
    if (existing) {
      existing.chars += d.dialogue.length
      existing.lines += 1
    } else {
      map.set(displayName, { chars: d.dialogue.length, lines: 1 })
    }
  }

  return Array.from(map.entries()).map(([displayName, stats]) => ({
    charId: displayName,
    displayName,
    totalChars: stats.chars,
    totalLines: stats.lines,
  }))
}

/** Markdown 转义 */
function escMd(text: string): string {
  return text.replace(/([*_~`|#])/g, '\\$1')
}

/** TXT 纯文本 */
function exportTxt(deltas: LineDelta[], opts: ExportOptions): string {
  const lines: string[] = []
  if (opts.title) {
    lines.push(opts.title)
    lines.push('='.repeat(opts.title.length))
    lines.push('')
  }

  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i]
    const prefix = opts.includeLineNumbers ? `[${i + 1}] ` : ''

    if (d.line_type === 'choice') {
      lines.push(`${prefix}--- 选择支 ---`)
      if (d.prompt) lines.push(`  ${d.prompt}`)
      for (const c of d.choices ?? []) {
        lines.push(`  ○ ${c.text}${c.target_label ? ` → ${c.target_label}` : ''}`)
      }
      lines.push('')
      continue
    }

    if (d.label) {
      lines.push(`${prefix}【${d.label}】`)
    }

    if (opts.includeDirections && d.background?.asset_id) {
      lines.push(`  [背景切换]`)
    }

    const speaker = d.speaker || '旁白'
    if (d.dialogue.trim()) {
      lines.push(`${prefix}${speaker}：${d.dialogue}`)
    }

    if (opts.includeDirections && Object.keys(d.characters).length > 0) {
      for (const [key, ch] of Object.entries(d.characters)) {
        lines.push(`  [${ch.char_id || key}: ${ch.action}]`)
      }
    }

    if (!d.dialogue.trim() && !d.label && !opts.includeDirections) {
      // 空行保留
      lines.push('')
    }
  }

  return lines.join('\n')
}

/** Markdown 导出 */
function exportMarkdown(deltas: LineDelta[], opts: ExportOptions): string {
  const lines: string[] = []
  if (opts.title) {
    lines.push(`# ${escMd(opts.title)}`)
    lines.push('')
  }

  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i]

    if (d.line_type === 'choice') {
      lines.push('')
      lines.push('---')
      lines.push('')
      if (d.prompt) lines.push(`> ${escMd(d.prompt)}`)
      lines.push('')
      for (const c of d.choices ?? []) {
        const label = c.target_label ? ` → \`${escMd(c.target_label)}\`` : ''
        const cond = c.condition ? ` *(条件: ${escMd(c.condition)})*` : ''
        lines.push(`- **${escMd(c.text)}**${label}${cond}`)
      }
      lines.push('')
      continue
    }

    if (d.label) {
      lines.push(`### ${escMd(d.label)}`)
      lines.push('')
    }

    if (d.dialogue.trim()) {
      const speaker = d.speaker ? `**${escMd(d.speaker)}**` : '*旁白*'
      if (opts.includeLineNumbers) {
        lines.push(`${i + 1}. ${speaker}：${escMd(d.dialogue)}`)
      } else {
        lines.push(`${speaker}：${escMd(d.dialogue)}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/** HTML 打印友好版导出 */
function exportHtml(deltas: LineDelta[], characters: CharacterConfig[], opts: ExportOptions): string {
  const nameMap = new Map(characters.map((c) => [c.charId, c.displayName]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speakerColorMap: Record<string, string> = {}
  for (const ch of characters) {
    if (ch.dialogueColor) {
      speakerColorMap[ch.displayName] = ch.dialogueColor
      speakerColorMap[ch.charId] = ch.dialogueColor
    }
  }

  const rows: string[] = []

  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i]

    if (d.line_type === 'choice') {
      rows.push(`<div class="choice-block">`)
      if (d.prompt) rows.push(`<p class="prompt">${escHtml(d.prompt)}</p>`)
      rows.push(`<ul class="choices">`)
      for (const c of d.choices ?? []) {
        rows.push(`<li>${escHtml(c.text)}${c.target_label ? ` → ${escHtml(c.target_label)}` : ''}</li>`)
      }
      rows.push(`</ul></div>`)
      continue
    }

    if (d.label) {
      rows.push(`<h3 class="label">${escHtml(d.label)}</h3>`)
    }

    if (d.dialogue.trim()) {
      const speaker = d.speaker || '旁白'
      const displayName = nameMap.get(speaker) || speaker
      const color = speakerColorMap[displayName] || speakerColorMap[speaker]
      const speakerStyle = color ? ` style="color:${color}"` : ''
      const cls = d.speaker ? 'speaker' : 'narrator'
      rows.push(
        `<div class="line"><span class="${cls}"${speakerStyle}>${escHtml(displayName)}</span><span class="sep">：</span><span class="dialogue">${escHtml(d.dialogue)}</span></div>`,
      )
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(opts.title || '剧本导出')}</title>
<style>
  @media print { body { margin: 0; } }
  body {
    font-family: "Noto Sans SC", "Noto Sans", system-ui, sans-serif;
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1.5rem;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.8;
    font-size: 15px;
  }
  h1 { font-size: 24px; font-weight: 600; border-bottom: 2px solid #333; padding-bottom: 0.5rem; margin-bottom: 2rem; }
  h3.label { font-size: 13px; font-weight: 500; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 2rem 0 0.5rem; }
  .line { margin-bottom: 0.5rem; }
  .speaker { font-weight: 600; }
  .narrator { font-style: italic; color: #666; }
  .sep { margin: 0 0.25rem; color: #bbb; }
  .dialogue { }
  .choice-block { margin: 1rem 0; padding: 1rem; border-left: 3px solid #ccc; background: #fafafa; }
  .prompt { font-weight: 500; color: #555; margin: 0 0 0.5rem; }
  .choices { margin: 0; padding-left: 1.5rem; }
  .choices li { margin-bottom: 0.25rem; }
</style>
</head>
<body>
<h1>${escHtml(opts.title || '剧本导出')}</h1>
${rows.join('\n')}
</body>
</html>`
}

function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** CSV 导出（CV 台词表） */
function exportCsv(deltas: LineDelta[], characters: CharacterConfig[], opts: ExportOptions): string {
  const nameMap = new Map(characters.map((c) => [c.charId, c.displayName]))

  // 收集说话人
  const speakerNames = new Set<string>()
  for (const d of deltas) {
    if (d.speaker) {
      const dn = nameMap.get(d.speaker) || d.speaker
      speakerNames.add(dn)
    }
  }

  const filterName = opts.characterFilter || ''

  const header = '角色,行号,台词'
  const rows: string[] = [header]

  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i]
    if (!d.speaker || !d.dialogue.trim()) continue
    const dn = nameMap.get(d.speaker) || d.speaker
    if (filterName && dn !== filterName) continue
    const text = d.dialogue.replace(/"/g, '""')
    rows.push(`"${dn}","${i + 1}","${text}"`)
  }

  return rows.join('\n')
}

/** 主导出入口 */
export function exportScript(
  deltas: LineDelta[],
  characters: CharacterConfig[],
  opts: ExportOptions,
): string {
  switch (opts.format) {
    case 'txt':
      return exportTxt(deltas, opts)
    case 'markdown':
      return exportMarkdown(deltas, opts)
    case 'html':
      return exportHtml(deltas, characters, opts)
    case 'csv':
      return exportCsv(deltas, characters, opts)
    default:
      return exportTxt(deltas, opts)
  }
}

/** 触发浏览器下载 */
export function downloadExport(content: string, filename: string, mimeType: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType }) // BOM for CJK
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
