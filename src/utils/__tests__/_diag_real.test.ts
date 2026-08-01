import { describe, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseRpy } from '../rpyImporter'

const GAME = 'D:\\meihuogu\\hlzz\\game'

describe('real dump head', () => {
  it('dump first 20 deltas with full fields', () => {
    const file = join(GAME, 'script.rpy')
    const src = readFileSync(file, 'utf8')
    const r = parseRpy(src)
    console.log('TOTAL_DELTAS', r.deltas.length)
    r.deltas.slice(0, 20).forEach((d, i) => {
      console.log(`#${i} type=${d.line_type} label=${d.label ?? '-'} dialogue=${JSON.stringify((d.dialogue ?? '').slice(0, 30))}`)
      console.log(`   bg=${JSON.stringify(d.background ?? null)} chars=${JSON.stringify(Object.keys(d.characters || {}))} audio=${JSON.stringify(d.audio ?? null)}`)
    })
    // count beats that have dialogue
    const withDialogue = r.deltas.filter((d) => (d.dialogue ?? '').trim() !== '').length
    const withBg = r.deltas.filter((d) => d.background).length
    const withAudio = r.deltas.filter((d) => d.audio && (d.audio.bgm || (d.audio.se && d.audio.se.length) || d.audio.voice)).length
    console.log('WITH_DIALOGUE', withDialogue, 'WITH_BG', withBg, 'WITH_AUDIO', withAudio)
    // list image refs and audio refs
    console.log('IMAGE_REFS', JSON.stringify(r.imageRefs))
    console.log('AUDIO_REFS', JSON.stringify(r.audioRefs))
  })
})
