import { describe, it } from 'vitest'
import { parseRpy } from '../rpyImporter'
import * as fs from 'fs'

const GAME = 'D:\\meihuogu\\hlzz\\game'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '\\' + e.name
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.rpy')) out.push(p)
  }
  return out
}

describe('DIAG real', () => {
  it('dump all deltas', () => {
    const files = walk(GAME)
    const charMap = new Map<string, string>()
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf-8')
      const r = parseRpy(src)
      for (const c of r.characters) {
        const ex = charMap.get(c.charId)
        if (!ex || (ex === c.charId && c.displayName !== c.charId)) charMap.set(c.charId, c.displayName)
      }
    }
    const parsed: { f: string; result: ReturnType<typeof parseRpy> }[] = []
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf-8')
      parsed.push({ f, result: parseRpy(src, charMap) })
    }

    let total = 0
    let blankRows = 0
    let codeRows = 0
    const codeSamples: string[] = []
    for (const { f, result } of parsed) {
      const short = f.replace(GAME, '')
      for (const d of result.deltas) {
        total++
        const dialogue = d.dialogue ?? ''
        const hasStage =
          !!d.background ||
          (d.characters && Object.keys(d.characters).length) ||
          (d.audio && (d.audio.bgm || (d.audio.se && d.audio.se.length) || d.audio.voice))
        if (dialogue.trim() === '' && !hasStage && !d.label) {
          blankRows++
        }
        const isCode = /^(zoom|xpos|ypos|text |style |config\.|gui\.|window_|"bottom|"top|"thought|define |transform |screen |init |image |play |scene |show |hide |label |menu|^\}|\s|\w+\s*=)/.test(dialogue)
        if (isCode) {
          codeRows++
          if (codeSamples.length < 30) codeSamples.push(`[${short}] ${JSON.stringify(dialogue.slice(0, 60))}`)
        }
      }
    }
    console.log(`TOTAL DELTAS=${total}, BLANK ROWS=${blankRows}, CODE ROWS=${codeRows}`)
    console.log('CODE SAMPLES:')
    codeSamples.forEach((s) => console.log('  ', s))
  })
})
