/**
 * ScriptWeaver 项目模板
 * 预置几套典型视觉小说结构，新建项目时可选。
 */

import type { LineDelta, CharacterConfig, GlobalVariable } from '@/core/types'

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  deltas: LineDelta[]
  characters: CharacterConfig[]
  variables: GlobalVariable[]
}

const emptyAudio = { bgm: null as null, ambient: null as null, se: [] as string[], voice: null as string | null }
const noBG = null
const noChars = {} as Record<string, never>

const now = new Date().toISOString()

function d(sp: string | null, dial: string): { speaker: string | null; dialogue: string } {
  return { speaker: sp, dialogue: dial }
}

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  // ---- 空白项目 ----
  {
    id: 'blank',
    name: '空白项目',
    description: '从零开始，没有任何预设内容',
    tags: ['基础'],
    deltas: [],
    characters: [],
    variables: [],
  },

  // ---- 经典单线 ----
  {
    id: 'linear',
    name: '经典单线',
    description: '一人称叙述驱动的线性故事，适合日记体/回忆录',
    tags: ['入门', '单线'],
    deltas: [
      { ...d(null, '这是一个平凡的日子。像往常一样，我推开那扇沉重的铁门。'), line_id: 'tpl_start', label: 'start', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d(null, '暮色把整条街染成了橘红色。梧桐叶沙沙地响着，像无数只干枯的手掌在摩擦。'), line_id: 'tpl_2', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d(null, '远处传来火车的汽笛声，悠长而寂寥。'), line_id: 'tpl_3', background: noBG, characters: noChars, audio: emptyAudio },
    ],
    characters: [],
    variables: [],
  },

  // ---- 对话短剧 ----
  {
    id: 'dialogue',
    name: '对话短剧',
    description: '双人对话开场，适合恋爱/日常/相声类短篇',
    tags: ['入门', '双人'],
    deltas: [
      { ...d('她', '喂，你觉得今天会下雨吗？'), line_id: 'tpl_d1', label: 'start', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d('我', '谁知道呢。气象预报说不会。'), line_id: 'tpl_d2', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d('她', '你总是这么敷衍。气象预报那次准过？'), line_id: 'tpl_d3', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d('我', '……行吧，你说得对。'), line_id: 'tpl_d4', background: noBG, characters: noChars, audio: emptyAudio },
    ],
    characters: [
      { charId: 'she', displayName: '她', dialogueColor: '#e06c75', expressions: [], createdAt: now, updatedAt: now },
      { charId: 'me', displayName: '我', dialogueColor: '#61afef', expressions: [], createdAt: now, updatedAt: now },
    ],
    variables: [],
  },

  // ---- 分支选择 ----
  {
    id: 'branching',
    name: '分支选择',
    description: '带一条关键选择支的模板，展示分歧结局写法',
    tags: ['入门', '分支'],
    deltas: [
      { ...d(null, '你在深夜的十字路口停了下来。左前方是回家的路，右前方通向城外。'), line_id: 'tpl_b1', label: 'start', background: noBG, characters: noChars, audio: emptyAudio },
      {
        line_id: 'tpl_b2', speaker: null, dialogue: '你选择——',
        line_type: 'choice',
        choices: [
          { uid: 'choice_home', text: '回家', target_label: 'go_home' },
          { uid: 'choice_leave', text: '离开这座城市', target_label: 'go_leave' },
        ],
        background: noBG, characters: noChars, audio: emptyAudio,
      },
      { ...d(null, '你推开家门，温暖的灯光洒落。一切如旧。'), line_id: 'tpl_b3', label: 'go_home', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d(null, '你踏上了通向城外的公路。身后是万家灯火，前方是无尽的黑暗。'), line_id: 'tpl_b4', label: 'go_leave', background: noBG, characters: noChars, audio: emptyAudio },
    ],
    characters: [],
    variables: [],
  },

  // ---- 多结局 ----
  {
    id: 'multi-ending',
    name: '多结局（带变量）',
    description: '包含好感度变量与双结局分支的模板，展示变量驱动的分歧写法',
    tags: ['进阶', '变量', '多结局'],
    deltas: [
      { ...d(null, '你收到了一封写着红色火漆的信。'), line_id: 'tpl_m1', label: 'start', background: noBG, characters: noChars, audio: emptyAudio },
      {
        line_id: 'tpl_m2', speaker: null, dialogue: '拆开它？',
        line_type: 'choice',
        choices: [
          { uid: 'open_yes', text: '拆开', target_label: 'open_letter', ops: [{ varName: 'curiosity', op: 'add', value: 1 }] },
          { uid: 'open_no', text: '先放着', target_label: 'ignore_letter' },
        ],
        background: noBG, characters: noChars, audio: emptyAudio,
      },
      { ...d(null, '信上只写了一句话：「午夜钟楼见。」'), line_id: 'tpl_m3', label: 'open_letter', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d(null, '你把信放在桌上，去泡了杯茶。'), line_id: 'tpl_m4', label: 'ignore_letter', background: noBG, characters: noChars, audio: emptyAudio },
      { ...d(null, '午夜的钟声响起。'), line_id: 'tpl_m5', background: noBG, characters: noChars, audio: emptyAudio },
    ],
    characters: [],
    variables: [
      { name: 'curiosity', type: 'number', initial: 0, note: '好奇心数值' },
    ],
  },
]
