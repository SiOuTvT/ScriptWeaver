import { describe, it, expect } from 'vitest'
import { exportToRpy, exportDefinitionsRpy, buildBundle, resolveLookups, validateExportNames } from '../rpyExporter'
import { MOUNTABLE_EFFECTS } from '@/data/mountableEffects'
import type { LineDelta, ResolvedLineState, CharacterConfig, AssetItem, MountedEffect, GlobalVariable } from '@/core/types'

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
      'dissolve', 'fade', 'flash', 'pixellate', 'blinds', 'squares', 'irisin', 'irisout', 'move',
      'moveinleft', 'moveinright', 'moveintop', 'moveinbottom', 'moveoutleft', 'moveoutright', 'moveouttop', 'moveoutbottom',
      'pushleft', 'pushright', 'pushup', 'pushdown', 'slideleft', 'slideright', 'slideup', 'slidedown',
      'slideawayleft', 'slideawayright', 'slideawayup', 'slideawaydown',
      'wipeleft', 'wiperight', 'wipeup', 'wipedown',
      'ease', 'easeinleft', 'easeinright', 'easeintop', 'easeinbottom', 'easeoutleft', 'easeoutright', 'easeouttop', 'easeoutbottom',
      'zoomin', 'zoomout', 'zoominout', 'vpunch', 'hpunch',
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

describe('rpyExporter · 舞台级全局滤镜（stageEffects，任务 1/3）', () => {
  const eff = (uid: string, effectId: string, params: Record<string, number>): MountedEffect => ({
    uid, effectId, params, enabled: true,
  })
  const noAudio = { bgm: null, ambient: null, se: [] as string[], voice: null }

  it('stageEffects 导出为整层 show layer master: matrixcolor，关闭后自动复位 IdentityMatrix', () => {
    const d1 = baseDelta('LS1', { stageEffects: [eff('uM', 'monochrome', { saturation: 0 })] })
    const r1: ResolvedLineState[] = [{
      line_id: 'LS1', speaker: null, dialogue: '',
      background: null, characters: {}, stageEffects: [eff('uM', 'monochrome', { saturation: 0 })],
      audio: noAudio,
    }]
    const b = buildBundle([d1], r1, characterConfigs, assets, undefined, 'start', [])
    expect(b.script).toContain('show layer master:')
    expect(b.script).toContain('matrixcolor SaturationMatrix(0)')

    // 下一行清空舞台滤镜 → 复位 IdentityMatrix()，杜绝染色残留
    const d2 = baseDelta('LS2', {})
    const r2: ResolvedLineState[] = [
      r1[0],
      { line_id: 'LS2', speaker: null, dialogue: '', background: null, characters: {}, stageEffects: [], audio: noAudio },
    ]
    const b2 = buildBundle([d1, d2], r2, characterConfigs, assets, undefined, 'start', [])
    expect(b2.script).toContain('matrixcolor IdentityMatrix()')
  })

  it('舞台滤镜与立绘/背景滤镜共存时合并到同一整层 matrixcolor', () => {
    const d = baseDelta('LM', {
      background: { asset_id: 'bg_room', effects: [eff('uS', 'sepia', {})] },
      stageEffects: [eff('uC', 'colormatrix', { hue: 0, saturation: 1.4 })],
    })
    const r: ResolvedLineState[] = [{
      line_id: 'LM', speaker: null, dialogue: '',
      background: { asset_id: 'bg_room', effects: [eff('uS', 'sepia', {})] },
      characters: {}, stageEffects: [eff('uC', 'colormatrix', { hue: 0, saturation: 1.4 })],
      audio: noAudio,
    }]
    const b = buildBundle([d], r, characterConfigs, assets, undefined, 'start', [])
    // 二者组合到同一行 matrixcolor（顺序不固定，分别断言）
    expect(b.script).toMatch(/matrixcolor .*SepiaMatrix\(\).*/)
    expect(b.script).toContain('SaturationMatrix(1.4) * HueMatrix(0)')
  })
})

describe('rpyExporter · 全局变量中央数据库（任务 1/3）', () => {
  const noAudio = { bgm: null, ambient: null, se: [] as string[], voice: null }
  const variables: GlobalVariable[] = [
    { name: 'tsundere_points', type: 'number', initial: 0 },
    { name: 'has_key', type: 'boolean', initial: false },
  ]

  it('definitions.rpy 输出 default 声明（boolean 为大写 True/False）', () => {
    const b = buildBundle(deltas, resolvedStates, characterConfigs, assets, undefined, 'start', variables)
    expect(b.definitions).toContain('default tsundere_points = 0')
    expect(b.definitions).toContain('default has_key = False')
    expect(b.definitions).not.toContain('default has_key = false')
  })

  it('剧本行变量操作导出为 $ <python 表达式>，且位于台词之前', () => {
    const d: LineDelta[] = [
      baseDelta('LV1', {
        speaker: 'alice', dialogue: '拿到钥匙了。',
        variableOps: [
          { varName: 'tsundere_points', op: 'add', value: 1 },
          { varName: 'has_key', op: 'set', value: true },
        ],
      }),
    ]
    const r: ResolvedLineState[] = [{
      line_id: 'LV1', speaker: 'alice', dialogue: '拿到钥匙了。',
      background: null, characters: {}, audio: noAudio,
    }]
    const b = buildBundle(d, r, characterConfigs, assets, undefined, 'start', variables)
    expect(b.script).toContain('    $ tsundere_points += 1')
    expect(b.script).toContain('    $ has_key = True')
    const idxOp = b.script.indexOf('$ has_key = True')
    const idxSay = b.script.indexOf('alice "拿到钥匙了。"')
    expect(idxOp).toBeGreaterThan(-1)
    expect(idxSay).toBeGreaterThan(-1)
    expect(idxOp).toBeLessThan(idxSay)
  })

  it('toggle 操作导出为 $ x = not x', () => {
    const d: LineDelta[] = [
      baseDelta('LV2', { variableOps: [{ varName: 'has_key', op: 'toggle' }] }),
    ]
    const r: ResolvedLineState[] = [{
      line_id: 'LV2', speaker: null, dialogue: '', background: null, characters: {}, audio: noAudio,
    }]
    const b = buildBundle(d, r, characterConfigs, assets, undefined, 'start', variables)
    expect(b.script).toContain('    $ has_key = not has_key')
  })
})

describe('rpyExporter · 选择支行（ChoiceLine，任务 2/3）', () => {
  const noAudio = { bgm: null, ambient: null, se: [] as string[], voice: null }
  const choiceDelta: LineDelta = baseDelta('LC1', {
    line_type: 'choice',
    prompt: '你要怎么做？',
    choices: [
      { uid: 'c1', text: '拿钥匙开门', target_label: 'door', condition: 'has_key' },
      { uid: 'c2', text: '直接离开', target_label: '' },
      { uid: 'c3', text: '需好感足够', target_label: 'special', condition: 'tsundere_points >= 5' },
    ],
  })
  const choiceResolved: ResolvedLineState = {
    line_id: 'LC1', speaker: null, dialogue: '', background: null, characters: {},
    audio: noAudio, line_type: 'choice',
    choices: choiceDelta.choices,
    prompt: '你要怎么做？',
  }

  it('导出为 Ren\'Py menu: 块，含 if 条件与 jump 目标，缩进合规', () => {
    // 跳转目标 door / special 必须作为已定义 label 存在，否则会被安全降级（铁律4）
    const ds: LineDelta[] = [
      choiceDelta,
      baseDelta('LD', { label: 'door', speaker: 'alice', dialogue: '开门。' }),
      baseDelta('LS', { label: 'special', speaker: 'bob', dialogue: '特别剧情。' }),
    ]
    const rsAll: ResolvedLineState[] = [
      choiceResolved,
      { line_id: 'LD', speaker: 'alice', dialogue: '开门。', background: null, characters: {}, audio: noAudio, line_type: 'dialogue', label: 'door' },
      { line_id: 'LS', speaker: 'bob', dialogue: '特别剧情。', background: null, characters: {}, audio: noAudio, line_type: 'dialogue', label: 'special' },
    ]
    const b = buildBundle(ds, rsAll, characterConfigs, assets, undefined, 'start', [])
    const script = b.script
    // 菜单标题
    expect(script).toContain('menu:')
    expect(script).toContain('        "你要怎么做？"')
    // 带条件 + 跳转（目标已定义 → 正常 jump）
    expect(script).toContain('        "拿钥匙开门" if has_key:')
    expect(script).toContain('            jump door')
    // 无跳转目标 → pass 占位
    expect(script).toContain('        "直接离开":')
    expect(script).toContain('            pass')
    // 数值条件
    expect(script).toContain('        "需好感足够" if tsundere_points >= 5:')
    expect(script).toContain('            jump special')
    // 缩进：menu 在 4 空格、选项 8 空格、jump 12 空格
    expect(script).toMatch(/^    menu:/m)
    expect(script).toMatch(/^        "拿钥匙开门" if has_key:$/m)
    expect(script).toMatch(/^            jump door$/m)
  })

  it('选择支行不发射 say 台词节点（提示语作为 menu 标题而非独立 say）', () => {
    const b = buildBundle([choiceDelta], [choiceResolved], characterConfigs, assets, undefined, 'start', [])
    // 提示语应以 8 空格 menu 标题出现，而非 4 空格的独立 say 行
    expect(b.script).not.toContain('\n    "你要怎么做？"')
    expect(b.script).toContain('\n        "你要怎么做？"')
  })

  it('校验：选项文本为空时报错', () => {
    const bad: LineDelta = baseDelta('LC2', {
      line_type: 'choice',
      choices: [{ uid: 'x1', text: '', target_label: '' }],
    })
    const lookups = resolveLookups([bad], characterConfigs, assets)
    const errors = validateExportNames([bad], lookups, characterConfigs, assets)
    expect(errors.some((e) => e.field.startsWith('choices[') && e.field.endsWith('.text'))).toBe(true)
  })

  it('校验：选择支至少需要一个选项', () => {
    const bad: LineDelta = baseDelta('LC3', { line_type: 'choice', choices: [] })
    const lookups = resolveLookups([bad], characterConfigs, assets)
    const errors = validateExportNames([bad], lookups, characterConfigs, assets)
    expect(errors.some((e) => e.field === 'choices')).toBe(true)
  })
})

describe('rpyExporter · 剧情标签节点化与多分支（任务 3/3）', () => {
  const noAudio = { bgm: null, ambient: null, se: [] as string[], voice: null }
  const rs = (line_id: string, over: Partial<ResolvedLineState> = {}): ResolvedLineState => ({
    line_id, speaker: null, dialogue: '', background: null, characters: {}, audio: noAudio, ...over,
  })

  it('任意行携带 label 导出为独立 label 节点（剧情块），且被 jump 引用时合法可达', () => {
    const ds: LineDelta[] = [
      baseDelta('L1', { speaker: 'alice', dialogue: '开始。' }),
      baseDelta('L2', {
        line_type: 'choice',
        label: 'route_split',
        choices: [{ uid: 'c1', text: '战斗', target_label: 'battle' }],
      }),
      baseDelta('L3', { label: 'battle', speaker: 'alice', dialogue: '战斗开始！' }),
      baseDelta('L4', { label: 'epilogue', speaker: 'bob', dialogue: '结局。' }),
    ]
    const rs2: ResolvedLineState[] = [
      rs('L1', { speaker: 'alice', dialogue: '开始。' }),
      rs('L2', { line_type: 'choice', choices: ds[1].choices }),
      rs('L3', { speaker: 'alice', dialogue: '战斗开始！' }),
      rs('L4', { speaker: 'bob', dialogue: '结局。' }),
    ]
    const b = buildBundle(ds, rs2, characterConfigs, assets, undefined, 'start', [])
    const script = b.script
    expect(script).toContain('label start:')
    expect(script).toContain('label route_split:')
    expect(script).toContain('label battle:')
    expect(script).toContain('label epilogue:')
    expect(script).toContain('            jump battle')
  })

  it('被 jump 引用的分支段在段尾补 return，避免穿透进下一剧情块', () => {
    const ds: LineDelta[] = [
      baseDelta('L1', { speaker: 'alice', dialogue: '开始。' }),
      baseDelta('L2', {
        line_type: 'choice',
        choices: [{ uid: 'c1', text: '战斗', target_label: 'battle' }],
      }),
      baseDelta('L3', { label: 'battle', speaker: 'alice', dialogue: '战斗开始！' }),
      baseDelta('L4', { label: 'epilogue', speaker: 'bob', dialogue: '结局。' }),
    ]
    const rs2: ResolvedLineState[] = [
      rs('L1', { speaker: 'alice', dialogue: '开始。' }),
      rs('L2', { line_type: 'choice', choices: ds[1].choices }),
      rs('L3', { speaker: 'alice', dialogue: '战斗开始！' }),
      rs('L4', { speaker: 'bob', dialogue: '结局。' }),
    ]
    const script = buildBundle(ds, rs2, characterConfigs, assets, undefined, 'start', []).script
    // 首个 return 位于 battle 段尾、epilogue 之前（battle 被引用 → 收尾 return）
    const idxBattle = script.indexOf('label battle:')
    const idxEpi = script.indexOf('label epilogue:')
    const idxReturn = script.indexOf('    return')
    expect(idxBattle).toBeGreaterThan(-1)
    expect(idxEpi).toBeGreaterThan(-1)
    expect(idxReturn).toBeGreaterThan(idxBattle)
    expect(idxReturn).toBeLessThan(idxEpi)
  })

  it('铁律4：未定义/缺失的 target_label 绝不发射 jump，降级为注释 + return（无 NameError）', () => {
    const ds: LineDelta[] = [
      baseDelta('L1', {
        line_type: 'choice',
        choices: [{ uid: 'c1', text: '去未知地', target_label: 'ghost' }],
      }),
    ]
    const rs2: ResolvedLineState[] = [rs('L1', { line_type: 'choice', choices: ds[0].choices })]
    const script = buildBundle(ds, rs2, characterConfigs, assets, undefined, 'start', []).script
    expect(script).not.toContain('jump ghost')
    expect(script).toContain('# [ScriptWeaver] 跳转目标 "ghost" 未定义，已安全降级')
    expect(script).toContain('            return')
  })

  it('选项内联变量操作导出为选项分支内 12 空格缩进的 $ 语句，且在 jump 之前', () => {
    const ds: LineDelta[] = [
      baseDelta('L1', {
        line_type: 'choice',
        choices: [{
          uid: 'c1',
          text: '调戏她',
          target_label: 'label_tsundere_response',
          condition: 'tsundere_points >= 5',
          ops: [{ varName: 'tsundere_points', op: 'add', value: 1 }],
        }],
      }),
      baseDelta('L2', { label: 'label_tsundere_response', speaker: 'alice', dialogue: '回应。' }),
    ]
    const rs2: ResolvedLineState[] = [
      rs('L1', { line_type: 'choice', choices: ds[0].choices }),
      rs('L2', { speaker: 'alice', dialogue: '回应。' }),
    ]
    const script = buildBundle(ds, rs2, characterConfigs, assets, undefined, 'start', []).script
    expect(script).toContain('        "调戏她" if tsundere_points >= 5:')
    expect(script).toContain('            $ tsundere_points += 1')
    expect(script).toContain('            jump label_tsundere_response')
    const idxOp = script.indexOf('$ tsundere_points += 1')
    const idxJump = script.indexOf('jump label_tsundere_response')
    expect(idxOp).toBeGreaterThan(-1)
    expect(idxJump).toBeGreaterThan(idxOp)
  })

  it('校验：标签名非合法标识符时报错', () => {
    const bad = baseDelta('L1', { label: '1bad' })
    const lookups = resolveLookups([bad], characterConfigs, assets)
    const errors = validateExportNames([bad], lookups, characterConfigs, assets)
    expect(errors.some((e) => e.field === 'label' && e.value === '1bad')).toBe(true)
  })

  it('校验：重复标签名报错', () => {
    const a = baseDelta('L1', { label: 'dup' })
    const b = baseDelta('L2', { label: 'dup' })
    const lookups = resolveLookups([a, b], characterConfigs, assets)
    const errors = validateExportNames([a, b], lookups, characterConfigs, assets)
    expect(errors.some((e) => e.field === 'label' && e.value === 'dup')).toBe(true)
  })

  it('校验：标签名 start 与入口冲突报错', () => {
    const a = baseDelta('L1', { label: 'start' })
    const lookups = resolveLookups([a], characterConfigs, assets)
    const errors = validateExportNames([a], lookups, characterConfigs, assets)
    expect(errors.some((e) => e.field === 'label' && e.value === 'start')).toBe(true)
  })
})
