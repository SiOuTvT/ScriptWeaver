import { describe, it, expect } from 'vitest'
import { exportToRpy, exportDefinitionsRpy, buildBundle } from '../rpyExporter'
import type { LineDelta, ResolvedLineState, CharacterConfig, AssetItem } from '@/core/types'

const characterConfigs: CharacterConfig[] = [
  {
    charId: 'alice',
    displayName: 'Alice',
    expressions: [{ id: 'smile', label: 'smile', assetId: 'a_smile' }],
    dialogueColor: '#ff6688',
    createdAt: '',
    updatedAt: '',
  },
  {
    charId: 'bob',
    displayName: 'Bob',
    expressions: [{ id: 'smile', label: 'smile', assetId: 'b_smile' }],
    createdAt: '',
    updatedAt: '',
  },
]

const assets: AssetItem[] = [
  { id: 'bg_room', type: 'background', name: 'room', fileName: 'bg_room.png', relativePath: 'assets/images/background/bg_room.png', importedAt: '' },
  { id: 'a_smile', type: 'sprite', name: 'a', fileName: 'alice_smile.png', relativePath: 'assets/images/sprite/alice_smile.png', importedAt: '' },
  { id: 'b_smile', type: 'sprite', name: 'b', fileName: 'bob_smile.png', relativePath: 'assets/images/sprite/bob_smile.png', importedAt: '' },
  { id: 'bgm1', type: 'audio', name: 'bgm', fileName: 'bgm1.ogg', relativePath: 'assets/audio/bgm1.ogg', importedAt: '' },
  { id: 'se1', type: 'audio', name: 'se', fileName: 'se1.ogg', relativePath: 'assets/audio/se1.ogg', importedAt: '' },
  { id: 'v_alice', type: 'audio', name: 'v', fileName: 'voice_alice.ogg', relativePath: 'assets/audio/voice_alice.ogg', importedAt: '' },
]

function baseDelta(line_id: string, over: Partial<LineDelta> = {}): LineDelta {
  return {
    line_id,
    speaker: null,
    dialogue: '',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
    ...over,
  }
}

const deltas: LineDelta[] = [
  baseDelta('L1', {
    speaker: 'alice',
    dialogue: 'Hi there.',
    background: { asset_id: 'bg_room', transition: 'dissolve' },
    characters: { c1: { sprite_id: 'smile', position_slot: 'center', char_id: 'alice', action: 'show' } },
    audio: { bgm: { asset_id: 'bgm1', volume: 0.6, loop: true }, ambient: null, se: [], voice: 'v_alice' },
  }),
  baseDelta('L2', {
    speaker: 'bob',
    dialogue: 'Hello!',
    characters: { c2: { sprite_id: 'smile', position_slot: 'right', char_id: 'bob', action: 'show', transition: 'push' } },
    audio: { bgm: null, ambient: null, se: ['se1'], voice: null },
  }),
  baseDelta('L3', {
    speaker: null,
    dialogue: 'The end.',
    characters: {},
  }),
  baseDelta('L4', {
    speaker: 'alice',
    dialogue: 'Zoomed in.',
    characters: { c1: { sprite_id: 'smile', position_slot: 'center', char_id: 'alice', action: 'show', pos_x: 0.3, pos_y: 0.6, scale: 1.2 } },
  }),
]

const resolvedStates: ResolvedLineState[] = [
  {
    line_id: 'L1',
    speaker: 'alice',
    dialogue: 'Hi there.',
    background: { asset_id: 'bg_room', transition: 'dissolve' },
    characters: { c1: { sprite_id: 'smile', char_id: 'alice', position_slot: 'center' } },
    audio: { bgm: { asset_id: 'bgm1', volume: 0.6, loop: true }, ambient: null, se: [], voice: 'v_alice' },
  },
  {
    line_id: 'L2',
    speaker: 'bob',
    dialogue: 'Hello!',
    background: null,
    characters: {
      c1: { sprite_id: 'smile', char_id: 'alice', position_slot: 'center' },
      c2: { sprite_id: 'smile', char_id: 'bob', position_slot: 'right', transition: 'push' },
    },
    audio: { bgm: null, ambient: null, se: ['se1'], voice: null },
  },
  {
    line_id: 'L3',
    speaker: null,
    dialogue: 'The end.',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
  },
  {
    line_id: 'L4',
    speaker: 'alice',
    dialogue: 'Zoomed in.',
    background: null,
    characters: { c1: { sprite_id: 'smile', char_id: 'alice', position_slot: 'center', pos_x: 0.3, pos_y: 0.6, scale: 1.2 } },
    audio: { bgm: null, ambient: null, se: [], voice: null },
  },
]

describe('rpyExporter · Ren\'Py 合规产出', () => {
  const script = exportToRpy(deltas, resolvedStates, characterConfigs, assets)
  const defs = exportDefinitionsRpy(characterConfigs, assets, undefined, undefined)

  it('label 与语句缩进为 4 空格', () => {
    expect(script).toContain('label start:')
    expect(script).toContain('    scene bg_room with dissolve')
    expect(script).toMatch(/^    show alice smile at center zorder \d+$/m)
  })

  it('缩放通过合规 transform（sw_pos/sw_zoom），绝不使用非法的 zoom() 调用', () => {
    expect(script).not.toContain('zoom(')
    expect(script).toContain('sw_pos(0.3, 0.6, 1.2)')
    expect(defs).toContain('transform sw_pos(xpos, ypos, zoom=1.0):')
    expect(defs).toContain('transform sw_zoom(z):')
    expect(defs).not.toContain('semislotted')
  })

  it('自定义特效过渡（push）被定义为 transform，保证 with 可被解析', () => {
    expect(script).toContain('with push')
    expect(defs).toContain('transform push:')
  })

  it('内建过渡（dissolve）无需额外定义即可使用', () => {
    expect(script).toContain('with dissolve')
    expect(defs).not.toContain('transform dissolve:')
  })

  it('隐藏角色生成 hide 语句', () => {
    expect(script).toContain('    hide alice')
  })

  it('所有非内建 with <name> 都在 definitions 中有 transform 定义', () => {
    const builtins = new Set([
      'dissolve', 'fade', 'flash', 'pixellate', 'blinds', 'glitter', 'irisin', 'irisout', 'move',
      'moveinleft', 'moveinright', 'moveinup', 'moveindown', 'moveoutleft', 'moveoutright', 'moveoutup', 'moveoutdown',
      'pushleft', 'pushright', 'pushup', 'pushdown', 'slideleft', 'slideright', 'slideup', 'slidedown',
      'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'squeezeleft', 'squeezeright', 'squeezeup', 'squeezedown',
      'easeinleft', 'easeinright', 'easeinup', 'easeindown', 'easeoutleft', 'easeoutright', 'easeoutup', 'easeoutdown',
      'facin', 'facout', 'vpunch', 'hpunch',
    ])
    const withs = [...script.matchAll(/with (\w+)/g)].map((m) => m[1])
    for (const w of withs) {
      if (builtins.has(w)) continue
      expect(defs).toContain(`transform ${w}:`, `with ${w} 必须有 transform 定义`)
    }
  })

  it('buildBundle 同时产出 script 与 definitions', () => {
    const bundle = buildBundle(deltas, resolvedStates, characterConfigs, assets)
    expect(bundle.script).toBe(script)
    expect(bundle.definitions).toContain('define alice')
    expect(bundle.assets.length).toBeGreaterThan(0)
  })
})
