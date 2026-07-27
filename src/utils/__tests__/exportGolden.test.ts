import { describe, it, expect } from 'vitest'
import { buildBundle, buildTranslationBundle } from '../rpyExporter'
import { buildWebProject } from '../webExporter'
import type {
  LineDelta,
  ResolvedLineState,
  CharacterConfig,
  AssetItem,
  GlobalVariable,
  ChoiceItem,
  VariableOperation,
  MountedEffect,
} from '@/core/types'

// ---- 与 rpyExporter.test.ts 一致的基线夹具（保证黄金快照稳定）----
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

const variables: GlobalVariable[] = [{ name: 'trust', type: 'number', defaultValue: 0 }]

// ===================== 黄金快照（整文件对拍，锁定导出行为） =====================

describe('导出层黄金快照 · Ren\'Py bundle 整文件', () => {
  const bundle = buildBundle(deltas, resolvedStates, characterConfigs, assets, undefined, 'start', variables)

  it('script.rpy 整文件对拍', () => {
    expect(bundle.script).toMatchSnapshot()
  })
  it('definitions.rpy 整文件对拍', () => {
    expect(bundle.definitions).toMatchSnapshot()
  })
  it('transforms.rpy 整文件对拍', () => {
    expect(bundle.transforms ?? '').toMatchSnapshot()
  })
})

describe('导出层黄金快照 · 挂载特效转 Ren\'Py', () => {
  const eff = (uid: string, effectId: string, params: Record<string, number>): MountedEffect => ({
    uid,
    effectId,
    params,
    enabled: true,
  })

  const d2: LineDelta[] = [
    baseDelta('L1', {
      speaker: 'alice',
      dialogue: '震起来！',
      background: { asset_id: 'bg_room', effects: [eff('u1', 'dissolve', { time: 0.5 })] },
      characters: {
        c1: {
          sprite_id: 'smile',
          position_slot: 'center',
          char_id: 'alice',
          action: 'show',
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
      line_id: 'L1',
      speaker: 'alice',
      dialogue: '震起来！',
      background: { asset_id: 'bg_room', effects: [eff('u1', 'dissolve', { time: 0.5 })] },
      characters: {
        c1: {
          sprite_id: 'smile',
          char_id: 'alice',
          position_slot: 'center',
          effects: [
            eff('u2', 'shake', { duration: 0.5, amplitude: 10 }),
            eff('u3', 'blink', { frequency: 2, minAlpha: 0.2 }),
          ],
        },
      },
      audio: { bgm: null, ambient: null, se: [], voice: null },
    },
  ]

  const bundle = buildBundle(d2, r2, characterConfigs, assets, undefined, 'start', variables)

  it('特效脚本整文件对拍', () => {
    expect(bundle.script).toMatchSnapshot()
  })
  it('特效 transforms 整文件对拍', () => {
    expect(bundle.transforms ?? '').toMatchSnapshot()
  })
})

describe('导出层黄金快照 · 多语言翻译骨架', () => {
  const tl = buildTranslationBundle(deltas, resolvedStates, characterConfigs, assets, undefined, 'start', variables, 'chinese')

  it('chinese 翻译骨架整文件对拍', () => {
    expect(tl).toMatchSnapshot()
  })
})

describe('导出层黄金快照 · Web 导出 gameJson', () => {
  const web = buildWebProject({ deltas, characterConfigs, assets, variables, title: 'ScriptWeaver' })

  it('gameJson 整文件对拍', () => {
    expect(web.gameJson).toMatchSnapshot()
  })
})

describe('导出层黄金快照 · 选择支（menu + 变量操作）', () => {
  const choices: ChoiceItem[] = [
    { uid: 'c1', text: '前进', target_label: 'start', ops: [{ varName: 'trust', op: 'add', value: 1 }] },
    { uid: 'c2', text: '撤退', target_label: 'retreat', condition: 'trust >= 5' },
  ]
  const choiceDelta = baseDelta('C0', {
    line_type: 'choice',
    prompt: '你要怎么做？',
    choices,
    variableOps: [{ varName: 'step', op: 'set', value: 1 }],
  })
  const d = [choiceDelta, ...deltas]
  const r: ResolvedLineState[] = [
    {
      line_id: 'C0',
      speaker: null,
      dialogue: '',
      line_type: 'choice',
      prompt: '你要怎么做？',
      choices,
      background: null,
      characters: {},
      audio: { bgm: null, ambient: null, se: [], voice: null },
    },
    ...resolvedStates,
  ]

  const bundle = buildBundle(d, r, characterConfigs, assets, undefined, 'start', variables)

  it('选择支行导出整文件对拍', () => {
    expect(bundle.script).toMatchSnapshot()
  })
})

// 变量操作表达式辅助（确保 ChoiceItem.ops / variableOps 形状正确进入快照）
const _assertOps: VariableOperation[] = [{ varName: 'trust', op: 'add', value: 1 }]
void _assertOps
