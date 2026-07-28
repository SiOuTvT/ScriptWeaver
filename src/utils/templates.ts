/**
 * ScriptWeaver 项目模板
 * 预置几套典型视觉小说结构，新建项目时可选。
 */

import type { LineDelta, CharacterConfig, GlobalVariable } from '@/core/types'

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  /** 模板作者/来源标记 */
  tags: string[]
  deltas: LineDelta[]
  characters: CharacterConfig[]
  variables: GlobalVariable[]
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
      {
        kind: 'dialogue',
        line_id: 'tpl_start',
        speaker: '',
        text: '这是一个平凡的日子。像往常一样，我推开那扇沉重的铁门。',
        label: 'start',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_2',
        speaker: '',
        text: '暮色把整条街染成了橘红色。梧桐叶沙沙地响着，像无数只干枯的手掌在摩擦。',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_3',
        speaker: '',
        text: '远处传来火车的汽笛声，悠长而寂寥。',
        audio: {},
      },
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
      {
        kind: 'dialogue',
        line_id: 'tpl_d1',
        speaker: '她',
        text: '喂，你觉得今天会下雨吗？',
        label: 'start',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_d2',
        speaker: '我',
        text: '谁知道呢。气象预报说不会。',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_d3',
        speaker: '她',
        text: '你总是这么敷衍。气象预报那次准过？',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_d4',
        speaker: '我',
        text: '……行吧，你说得对。',
        audio: {},
      },
    ],
    characters: [
      { variableName: 'she', displayName: '她', color: '#e06c75' },
      { variableName: 'me', displayName: '我', color: '#61afef' },
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
      {
        kind: 'dialogue',
        line_id: 'tpl_b1',
        speaker: '',
        text: '你在深夜的十字路口停了下来。左前方是回家的路，右前方通向城外。',
        label: 'start',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_b2',
        speaker: '',
        text: '你选择——',
        choices: [
          { id: 'choice_home', text: '回家', label: 'go_home' },
          { id: 'choice_leave', text: '离开这座城市', label: 'go_leave' },
        ],
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_b3',
        speaker: '',
        text: '你推开家门，温暖的灯光洒落。一切如旧。',
        label: 'go_home',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_b4',
        speaker: '',
        text: '你踏上了通向城外的公路。身后是万家灯火，前方是无尽的黑暗。',
        label: 'go_leave',
        audio: {},
      },
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
      {
        kind: 'dialogue',
        line_id: 'tpl_m1',
        speaker: '',
        text: '你收到了一封写着红色火漆的信。',
        label: 'start',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_m2',
        speaker: '',
        text: '拆开它？',
        choices: [
          { id: 'open_yes', text: '拆开', label: 'open_letter', variableOps: [{ variable: 'curiosity', op: '+', value: 1 }] },
          { id: 'open_no', text: '先放着', label: 'ignore_letter' },
        ],
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_m3',
        speaker: '',
        text: '信上只写了一句话：「午夜钟楼见。」',
        label: 'open_letter',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_m4',
        speaker: '',
        text: '你把信放在桌上，去泡了杯茶。',
        label: 'ignore_letter',
        audio: {},
      },
      {
        kind: 'dialogue',
        line_id: 'tpl_m5',
        speaker: '',
        text: '午夜的钟声响起。',
        audio: {},
      },
    ],
    characters: [],
    variables: [
      { name: 'curiosity', default_value: '0', description: '好奇心数值' },
    ],
  },
]
