import { describe, it, expect } from 'vitest'
import { exportToRpy, exportDefinitionsRpy, buildBundle } from '../rpyExporter'
import { MOUNTABLE_EFFECTS } from '@/data/mountableEffects'
import type { LineDelta, ResolvedLineState, CharacterConfig, AssetItem, MountedEffect } from '@/core/types'

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
  const defs = buildBundle(deltas, resolvedStates, characterConfigs, assets).definitions

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
    const bundle = buildBundle(deltas, resolvedStates, characterConfigs, assets)
    const withs = [...bundle.script.matchAll(/with (\w+)/g)].map((m) => m[1])
    for (const w of withs) {
      if (builtins.has(w)) continue
      expect(bundle.definitions).toContain(`transform ${w}:`)
    }
  })

  it('buildBundle 同时产出 script 与 definitions', () => {
    const bundle = buildBundle(deltas, resolvedStates, characterConfigs, assets)
    expect(bundle.script).toBe(script)
    expect(bundle.definitions).toContain('define alice')
    expect(bundle.assets.length).toBeGreaterThan(0)
  })
})

describe('rpyExporter · 挂载特效导出闭环（任务 2/2）', () => {
  const eff = (uid: string, effectId: string, params: Record<string, number>): MountedEffect => ({
    uid, effectId, params, enabled: true,
  })

  const d2: LineDelta[] = [
    baseDelta('L1', {
      speaker: 'alice',
      dialogue: '震起来！',
      background: { asset_id: 'bg_room', effects: [eff('u1', 'dissolve', { time: 0.5 })] },
      characters: {
        c1: {
          sprite_id: 'smile', position_slot: 'center', char_id: 'alice', action: 'show',
          effects: [
            eff('u2', 'shake', { duration: 0.5, amplitude: 10 }),
            eff('u3', 'blink', { frequency: 2, minAlpha: 0.2 }),
          ],
        },
      },
    }),
  ]
  const r2: ResolvedLineState[] = [
    {
      line_id: 'L1', speaker: 'alice', dialogue: '震起来！',
      background: { asset_id: 'bg_room', effects: [eff('u1', 'dissolve', { time: 0.5 })] },
      characters: {
        c1: {
          sprite_id: 'smile', char_id: 'alice', position_slot: 'center',
          effects: [
            eff('u2', 'shake', { duration: 0.5, amplitude: 10 }),
            eff('u3', 'blink', { frequency: 2, minAlpha: 0.2 }),
          ],
        },
      },
      audio: { bgm: null, ambient: null, se: [], voice: null },
    },
  ]

  const bundle = buildBundle(d2, r2, characterConfigs, assets)

  it('transforms.rpy 生成参数化 transform 定义（shake/blink），且内建工厂 dissolve 不重复定义', () => {
    expect(bundle.transforms).toContain('transform sw_custom_shake(duration=0.6, amplitude=10):')
    expect(bundle.transforms).toContain('linear (duration / 4.0) xoffset -amplitude')
    expect(bundle.transforms).toContain('transform sw_custom_blink(frequency=2, minAlpha=0.2):')
    expect(bundle.transforms).toContain('repeat:')
    expect(bundle.transforms).toContain('linear (0.5 / frequency) alpha minAlpha')
    // 内建过渡工厂 dissolve 无需自定义 transform
    expect(bundle.transforms).not.toContain('transform sw_custom_dissolve')
  })

  it('show 语句把 transform 型挂载特效追加到 at 子句', () => {
    expect(bundle.script).toMatch(
      /show alice smile at center, sw_custom_shake\(duration=0\.5, amplitude=10\), sw_custom_blink\(frequency=2, minAlpha=0\.2\) zorder \d+/,
    )
  })

  it('背景挂载内建过渡工厂 → with dissolve(0.5) 直接调用', () => {
    expect(bundle.script).toContain('scene bg_room with dissolve(0.5)')
  })

  it('同一特效多次挂载只生成一次 transform 定义（去重）', () => {
    const count = (bundle.transforms!.match(/transform sw_custom_shake\(/g) || []).length
    expect(count).toBe(1)
  })

  it('关闭启用的挂载特效在导出中被忽略', () => {
    const d3 = baseDelta('LX', {
      characters: {
        c1: { sprite_id: 'smile', position_slot: 'center', char_id: 'alice', action: 'show',
          effects: [eff('u9', 'shake', { duration: 0.5, amplitude: 10 })].map((e) => ({ ...e, enabled: false })) },
      },
    })
    const r3: ResolvedLineState[] = [{
      line_id: 'LX', speaker: null, dialogue: '',
      background: null,
      characters: { c1: { sprite_id: 'smile', char_id: 'alice', position_slot: 'center',
        effects: [eff('u9', 'shake', { duration: 0.5, amplitude: 10 })].map((e) => ({ ...e, enabled: false })) } },
      audio: { bgm: null, ambient: null, se: [], voice: null },
    }]
    const b3 = buildBundle([d3], r3, characterConfigs, assets)
    expect(b3.script).not.toContain('sw_custom_shake')
    expect(b3.transforms).not.toContain('transform sw_custom_shake')
  })
})

describe('rpyExporter · 三大类目与缺失项补全（增补任务）', () => {
  const eff = (uid: string, effectId: string, params: Record<string, number>): MountedEffect => ({
    uid, effectId, params, enabled: true,
  })
  const noAudio = { bgm: null, ambient: null, se: [] as string[], voice: null }

  it('所有可挂载特效均归属三大核心类目（无遗漏、无游离）', () => {
    expect(MOUNTABLE_EFFECTS.length).toBeGreaterThan(0)
    for (const m of MOUNTABLE_EFFECTS) {
      expect(['element', 'transition', 'filter']).toContain(m.category)
    }
    // 三大类目各自至少命中用户点名的关键项
    const ids = new Set(MOUNTABLE_EFFECTS.map((m) => m.id))
    expect(ids.has('dissolve')).toBe(true)
    expect(ids.has('pixellate')).toBe(true)
    expect(ids.has('fade')).toBe(true)
    expect(ids.has('wiperight')).toBe(true)
    expect(ids.has('wipeleft')).toBe(true)
    expect(ids.has('wipeup')).toBe(true)
    expect(ids.has('wipedown')).toBe(true)
    expect(ids.has('monochrome')).toBe(true)
    expect(ids.has('sepia')).toBe(true)
    expect(ids.has('colormatrix')).toBe(true)
    expect(ids.has('breathing')).toBe(true)
    expect(ids.has('nudge')).toBe(true)
  })

  it('Wipe 转场映射到 Ren\'Py 内建 with wiperight(time) 且不生成自定义 transform', () => {
    const d = baseDelta('LW', { background: { asset_id: 'bg_room', effects: [eff('uW', 'wiperight', { time: 0.8 })] } })
    const r: ResolvedLineState[] = [{
      line_id: 'LW', speaker: null, dialogue: '',
      background: { asset_id: 'bg_room', effects: [eff('uW', 'wiperight', { time: 0.8 })] },
      characters: {}, audio: noAudio,
    }]
    const b = buildBundle([d], r, characterConfigs, assets)
    expect(b.script).toContain('scene bg_room with wiperight(0.8)')
    expect(b.transforms).not.toContain('sw_custom_wiperight')
  })

  it('滤镜挂载导出为 show layer master: matrixcolor（全屏色调），且不进 transforms.rpy', () => {
    const d = baseDelta('LF', { background: { asset_id: 'bg_room', effects: [eff('uM', 'monochrome', { saturation: 0 })] } })
    const r: ResolvedLineState[] = [{
      line_id: 'LF', speaker: null, dialogue: '',
      background: { asset_id: 'bg_room', effects: [eff('uM', 'monochrome', { saturation: 0 })] },
      characters: {}, audio: noAudio,
    }]
    const b = buildBundle([d], r, characterConfigs, assets)
    expect(b.script).toContain('show layer master:')
    expect(b.script).toContain('matrixcolor SaturationMatrix(0)')
    expect(b.transforms).not.toContain('sw_custom_monochrome')
  })

  it('多滤镜按 ColorMatrix 乘法组合（Saturation * Hue），关闭后回退 IdentityMatrix', () => {
    const d = baseDelta('LC', {
      background: { asset_id: 'bg_room', effects: [eff('uA', 'colormatrix', { hue: 0, saturation: 1.4 })] },
    })
    const r: ResolvedLineState[] = [{
      line_id: 'LC', speaker: null, dialogue: '',
      background: { asset_id: 'bg_room', effects: [eff('uA', 'colormatrix', { hue: 0, saturation: 1.4 })] },
      characters: {}, audio: noAudio,
    }]
    const b = buildBundle([d], r, characterConfigs, assets)
    expect(b.script).toContain('matrixcolor SaturationMatrix(1.4) * HueMatrix(0)')

    // 关闭滤镜 → 下一行回退 IdentityMatrix（清染色）
    const d2 = baseDelta('LD', { background: { asset_id: 'bg_room' } })
    const r2: ResolvedLineState[] = [
      r[0],
      { line_id: 'LD', speaker: null, dialogue: '', background: { asset_id: 'bg_room' }, characters: {}, audio: noAudio },
    ]
    const b2 = buildBundle([d, d2], r2, characterConfigs, assets)
    expect(b2.script).toContain('matrixcolor IdentityMatrix()')
  })

  it('Sepia 滤镜导出为内建 SepiaMatrix()', () => {
    const d = baseDelta('LS', { background: { asset_id: 'bg_room', effects: [eff('uS', 'sepia', {})] } })
    const r: ResolvedLineState[] = [{
      line_id: 'LS', speaker: null, dialogue: '',
      background: { asset_id: 'bg_room', effects: [eff('uS', 'sepia', {})] },
      characters: {}, audio: noAudio,
    }]
    const b = buildBundle([d], r, characterConfigs, assets)
    expect(b.script).toContain('matrixcolor SepiaMatrix()')
  })

  it('呼吸 / 位置微调作为元素特效导出 at sw_custom_breathing / sw_custom_nudge', () => {
    const d = baseDelta('LB', {
      characters: {
        c1: {
          sprite_id: 'smile', position_slot: 'center', char_id: 'alice', action: 'show',
          effects: [eff('uB', 'breathing', { rate: 0.6, depth: 0.05 }), eff('uN', 'nudge', { dx: 6, dy: 4, rate: 1 })],
        },
      },
    })
    const r: ResolvedLineState[] = [{
      line_id: 'LB', speaker: null, dialogue: '', background: null,
      characters: { c1: { sprite_id: 'smile', char_id: 'alice', position_slot: 'center',
        effects: [eff('uB', 'breathing', { rate: 0.6, depth: 0.05 }), eff('uN', 'nudge', { dx: 6, dy: 4, rate: 1 })] } },
      audio: noAudio,
    }]
    const b = buildBundle([d], r, characterConfigs, assets)
    expect(b.transforms).toContain('transform sw_custom_breathing(')
    expect(b.transforms).toContain('transform sw_custom_nudge(')
    expect(b.script).toMatch(/show alice smile at center, sw_custom_breathing\([^)]*\), sw_custom_nudge\([^)]*\) zorder \d+/)
  })
})
