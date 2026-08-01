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
    const issues: string[] = []
    for (const { f, result } of parsed) {
      const short = f.replace(GAME, '')
      for (const d of result.deltas) {
        total++
        const dialogue = d.dialogue ?? ''
        const isBlank = dialogue.trim() === ''
        const isCode =
          /^(zoom|xpos|ypos|text |style |config\.|gui\.|window_|\"bottom|\"top|\"thought|define |transform |screen |init |image |play |scene |show |hide |label |menu|^\}|\\s)/.test(dialogue)
        if (isBlank || isCode) {
          issues.push(`[${short}] ${d.dialogue === undefined ? 'NO-DIALOGUE' : JSON.stringify(dialogue.slice(0, 60))} | bg=${d.background?.asset_id ?? '-'} | audio=${JSON.stringify(d.audio ?? null)}`)
        }
      }
    }
    console.log(`TOTAL DELTAS=${total}, ISSUE COUNT=${issues.length}`)
    issues.slice(0, 60).forEach((s) => console.log('  ISSUE:', s))
  })
})
