import type { LineDelta } from '@/core/types'

/**
 * Mock LineDelta 数据 —— 10 行，覆盖规格文档定义的全部场景：
 *
 * 场景覆盖：
 *  L1  - 旁白 + 设置背景 + 开始 BGM
 *  L2  - 角色出场（Alice）+ 语音
 *  L3  - 背景切换（dissolve）+ 多角色同场（Bob 出场）
 *  L4  - 角色换表情（继承 Alice，Bob 不变）+ SE
 *  L5  - 角色换位置（槽位切换）
 *  L6  - 环境音出场（Ambient）+ BGM 替换
 *  L7  - 角色退场（Bob）+ BGM __CLEAR__
 *  L8  - Ambient 继承 + 旁白
 *  L9  - 新角色出场（Charlie）+ BGM 重新设置
 *  L10 - 全清场 + 旁白结束
 *
 * 覆盖的关键场景：
 *  - 继承（null）：背景、角色未提及、BGM/Ambient 跨行
 *  - 显式覆盖：换背景、换表情、换槽位、换 BGM
 *  - __CLEAR__ 清除：BGM 停止、角色移除
 *  - 槽位复用：left/right/center 命名槽位
 *  - 一次性事件：SE、Voice 不继承
 *  - 音频独立：BGM 与 Ambient 各自继承互不干扰
 *  - 旁白行（speaker=null）
 */

const CLEAR = '__CLEAR__' as const

export const MOCK_DELTAS: LineDelta[] = [
  // ===== L1: 开场 —— 旁白，设置背景和 BGM =====
  {
    line_id: 'L1',
    speaker: null,
    dialogue: '黄昏的街道上，行人渐渐稀少。街灯一盏接一盏亮起，将石板路面染成暖黄。',
    background: { asset_id: 'bg_street_dusk' },
    characters: {},
    audio: {
      bgm: { asset_id: 'bgm_peaceful', volume: 0.7, loop: true, fade_in_ms: 2000 },
      ambient: null,
      se: [],
      voice: null,
    },
  },

  // ===== L2: Alice 出场 —— 继承背景和 BGM，角色 show =====
  {
    line_id: 'L2',
    speaker: 'Alice',
    dialogue: '今天的夕阳真美啊，不是吗？',
    background: null, // 继承 L1 的 bg_street_dusk
    characters: {
      alice: {
        sprite_id: 'alice_smile',
        position_slot: 'center',
        action: 'show',
        transition: 'fade',
      },
    },
    audio: {
      bgm: null, // 继承 L1 的 bgm_peaceful
      ambient: null,
      se: [],
      voice: 'v_alice_02',
    },
  },

  // ===== L3: 背景切换 + Bob 出场，BGM 继承 =====
  {
    line_id: 'L3',
    speaker: 'Bob',
    dialogue: '是啊……不过我更喜欢夜晚的星空。',
    background: { asset_id: 'bg_street_night', transition: 'dissolve' }, // 切换背景
    characters: {
      bob: {
        sprite_id: 'bob_normal',
        position_slot: 'left',
        action: 'show',
      },
      // alice 未提及 → 继承（position_slot: center, sprite: alice_smile）
    },
    audio: {
      bgm: null, // 继续 bgm_peaceful
      ambient: null,
      se: ['footsteps'],
      voice: 'v_bob_03',
    },
  },

  // ===== L4: Alice 换表情，Bob 继承不变 =====
  {
    line_id: 'L4',
    speaker: 'Alice',
    dialogue: '那你为什么总是迟到看日落呢？（微怒）',
    background: null, // 继承 bg_street_night
    characters: {
      alice: {
        sprite_id: 'alice_angry',
        position_slot: 'center',
        action: 'show',
      },
      // bob 未提及 → 继承（position_slot: left, sprite: bob_normal）
    },
    audio: {
      bgm: null, // 继承 bgm_peaceful
      ambient: null,
      se: [],
      voice: 'v_alice_04',
    },
  },

  // ===== L5: Alice 换位置（槽位切换），BGM 替换 =====
  {
    line_id: 'L5',
    speaker: 'Bob',
    dialogue: '抱歉抱歉，路上遇到了一只流浪猫……',
    background: null, // 继承
    characters: {
      alice: {
        sprite_id: 'alice_angry',
        position_slot: 'right', // 从 center 移到 right
        action: 'show',
        transition: 'move',
      },
      // bob 未提及 → 继承
    },
    audio: {
      bgm: { asset_id: 'bgm_lively', volume: 0.8, loop: true }, // 替换 BGM
      ambient: null,
      se: [],
      voice: 'v_bob_05',
    },
  },

  // ===== L6: 环境音出场，BGM 继承新 BGM =====
  {
    line_id: 'L6',
    speaker: 'Alice',
    dialogue: '（叹气）算了，下次不准再迟到了。你看，星星出来了。',
    background: null,
    characters: {},
    audio: {
      bgm: null, // 继承 bgm_lively
      ambient: { asset_id: 'ambient_crickets', volume: 0.3, loop: true, fade_in_ms: 1500 },
      se: [],
      voice: 'v_alice_06',
    },
  },

  // ===== L7: Bob 退场，BGM __CLEAR__ =====
  {
    line_id: 'L7',
    speaker: 'Bob',
    dialogue: '好，一言为定！明天见！',
    background: null,
    characters: {
      bob: {
        sprite_id: 'bob_smile',
        position_slot: 'left',
        action: 'hide',
        transition: 'fade',
      },
    },
    audio: {
      bgm: CLEAR, // 显式停止 BGM
      ambient: null, // 继承 ambient_crickets
      se: ['door_close'],
      voice: 'v_bob_07',
    },
  },

  // ===== L8: 旁白，Ambient 继承，BGM 为空 =====
  {
    line_id: 'L8',
    speaker: null,
    dialogue: 'Bob 的身影消失在夜色中。街道重归寂静，只有虫鸣在耳边回荡。',
    background: null,
    characters: {
      // alice 未提及 → 继承（right, alice_angry）
      // bob 已退场 → 不再出现
    },
    audio: {
      bgm: null, // 继承 null（已 __CLEAR__）
      ambient: null, // 继续 ambient_crickets
      se: [],
      voice: null,
    },
  },

  // ===== L9: Charlie 出场，BGM 重新开始 =====
  {
    line_id: 'L9',
    speaker: 'Charlie',
    dialogue: 'Alice！好久不见，你一个人在这里做什么？',
    background: null,
    characters: {
      charlie: {
        sprite_id: 'charlie_happy',
        position_slot: 'left', // 复用 Bob 刚离开的 left 槽位
        action: 'show',
      },
    },
    audio: {
      bgm: { asset_id: 'bgm_warm', volume: 0.6, loop: true }, // 重新设置 BGM
      ambient: null, // 继承 ambient_crickets
      se: [],
      voice: 'v_charlie_09',
    },
  },

  // ===== L10: Alice 清场 + 旁白结尾 =====
  {
    line_id: 'L10',
    speaker: null,
    dialogue: '夜幕完全降临，星空下的街道迎来了又一个宁静的夜晚……',
    background: { asset_id: 'bg_night_sky', transition: 'fade' },
    characters: {
      alice: {
        sprite_id: 'alice_smile',
        position_slot: 'right',
        action: CLEAR, // 清除 Alice
      },
      charlie: {
        sprite_id: 'charlie_happy',
        position_slot: 'left',
        action: 'hide',
      },
    },
    audio: {
      bgm: null, // 继承 bgm_warm
      ambient: CLEAR, // 停止虫鸣
      se: [],
      voice: null,
    },
  },
]
