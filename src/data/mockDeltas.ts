import type { LineDelta, AssetItem, CharacterConfig } from '@/core/types'

const CLEAR = '__CLEAR__' as const

// ============================================================
// Mock 素材数据
// ============================================================

export const MOCK_ASSETS: AssetItem[] = [
  // 背景 (6)
  { id: 'asset_bg_street_dusk', type: 'background', name: '黄昏街道', fileName: 'street_dusk.jpg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_bg_street_night', type: 'background', name: '夜晚街道', fileName: 'street_night.jpg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_bg_night_sky', type: 'background', name: '星空夜空', fileName: 'night_sky.jpg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_bg_room', type: 'background', name: '室内', fileName: 'room.jpg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_bg_park', type: 'background', name: '公园', fileName: 'park.jpg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_bg_school', type: 'background', name: '学校', fileName: 'school.jpg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  // 立绘 (5)
  { id: 'asset_spr_alice_smile', type: 'sprite', name: 'Alice 微笑', fileName: 'alice_smile.png', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_spr_alice_angry', type: 'sprite', name: 'Alice 生气', fileName: 'alice_angry.png', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_spr_bob_normal', type: 'sprite', name: 'Bob 普通', fileName: 'bob_normal.png', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_spr_bob_smile', type: 'sprite', name: 'Bob 微笑', fileName: 'bob_smile.png', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_spr_charlie_happy', type: 'sprite', name: 'Charlie 开心', fileName: 'charlie_happy.png', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  // 音频 (5)
  { id: 'asset_audio_bgm_peaceful', type: 'audio', name: '宁静 BGM', fileName: 'bgm_peaceful.mp3', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_bgm_lively', type: 'audio', name: '活泼 BGM', fileName: 'bgm_lively.mp3', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_bgm_warm', type: 'audio', name: '温暖 BGM', fileName: 'bgm_warm.mp3', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_ambient_crickets', type: 'audio', name: '虫鸣', fileName: 'ambient_crickets.mp3', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_ambient_rain', type: 'audio', name: '雨声', fileName: 'ambient_rain.mp3', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  // 语音 (6)
  { id: 'asset_audio_voice_alice_02', type: 'audio', name: 'Alice 语音02', fileName: 'v_alice_02.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_voice_alice_04', type: 'audio', name: 'Alice 语音04', fileName: 'v_alice_04.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_voice_bob_03', type: 'audio', name: 'Bob 语音03', fileName: 'v_bob_03.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_voice_bob_05', type: 'audio', name: 'Bob 语音05', fileName: 'v_bob_05.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_voice_alice_06', type: 'audio', name: 'Alice 语音06', fileName: 'v_alice_06.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_voice_bob_07', type: 'audio', name: 'Bob 语音07', fileName: 'v_bob_07.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_voice_charlie_09', type: 'audio', name: 'Charlie 语音09', fileName: 'v_charlie_09.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  // 音效 (2)
  { id: 'asset_audio_se_footsteps', type: 'audio', name: '脚步声', fileName: 'footsteps.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
  { id: 'asset_audio_se_door_close', type: 'audio', name: '关门声', fileName: 'door_close.ogg', relativePath: '', importedAt: '2024-01-01T00:00:00Z' },
]

// ============================================================
// Mock 角色配置
// ============================================================

export const MOCK_CHARACTERS: CharacterConfig[] = [
  {
    charId: 'alice',
    displayName: 'Alice',
    expressions: [
      { id: 'smile', label: '微笑', assetId: 'asset_spr_alice_smile' },
      { id: 'angry', label: '生气', assetId: 'asset_spr_alice_angry' },
    ],
    defaultExpression: 'smile',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    charId: 'bob',
    displayName: 'Bob',
    expressions: [
      { id: 'normal', label: '普通', assetId: 'asset_spr_bob_normal' },
      { id: 'smile', label: '微笑', assetId: 'asset_spr_bob_smile' },
    ],
    defaultExpression: 'normal',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    charId: 'charlie',
    displayName: 'Charlie',
    expressions: [
      { id: 'happy', label: '开心', assetId: 'asset_spr_charlie_happy' },
    ],
    defaultExpression: 'happy',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

// ============================================================
// Mock Delta 数据 —— sprite_id 现为表情 ID
// ============================================================

export const MOCK_DELTAS: LineDelta[] = [
  // L1: 开场旁白
  {
    line_id: 'L1',
    speaker: null,
    dialogue: '黄昏的街道上，行人渐渐稀少。街灯一盏接一盏亮起，将石板路面染成暖黄。',
    background: { asset_id: 'asset_bg_street_dusk' },
    characters: {},
    audio: {
      bgm: { asset_id: 'asset_audio_bgm_peaceful', volume: 0.7, loop: true, fade_in_ms: 2000 },
      ambient: null, se: [], voice: null,
    },
  },
  // L2: Alice 出场
  {
    line_id: 'L2',
    speaker: 'Alice',
    dialogue: '今天的夕阳真美啊，不是吗？',
    background: null,
    characters: {
      alice: { sprite_id: 'smile', position_slot: 'center', action: 'show', transition: 'fade' },
    },
    audio: { bgm: null, ambient: null, se: [], voice: 'asset_audio_voice_alice_02' },
  },
  // L3: 背景切换 + Bob 出场
  {
    line_id: 'L3',
    speaker: 'Bob',
    dialogue: '是啊……不过我更喜欢夜晚的星空。',
    background: { asset_id: 'asset_bg_street_night', transition: 'dissolve' },
    characters: {
      bob: { sprite_id: 'normal', position_slot: 'left', action: 'show' },
    },
    audio: { bgm: null, ambient: null, se: ['asset_audio_se_footsteps'], voice: 'asset_audio_voice_bob_03' },
  },
  // L4: Alice 换表情
  {
    line_id: 'L4',
    speaker: 'Alice',
    dialogue: '那你为什么总是迟到看日落呢？（微怒）',
    background: null,
    characters: {
      alice: { sprite_id: 'angry', position_slot: 'center', action: 'show' },
    },
    audio: { bgm: null, ambient: null, se: [], voice: 'asset_audio_voice_alice_04' },
  },
  // L5: Alice 换位置 + BGM 替换
  {
    line_id: 'L5',
    speaker: 'Bob',
    dialogue: '抱歉抱歉，路上遇到了一只流浪猫……',
    background: null,
    characters: {
      alice: { sprite_id: 'angry', position_slot: 'right', action: 'show', transition: 'move' },
    },
    audio: {
      bgm: { asset_id: 'asset_audio_bgm_lively', volume: 0.8, loop: true },
      ambient: null, se: [], voice: 'asset_audio_voice_bob_05',
    },
  },
  // L6: 环境音出场
  {
    line_id: 'L6',
    speaker: 'Alice',
    dialogue: '（叹气）算了，下次不准再迟到了。你看，星星出来了。',
    background: null,
    characters: {},
    audio: {
      bgm: null,
      ambient: { asset_id: 'asset_audio_ambient_crickets', volume: 0.3, loop: true, fade_in_ms: 1500 },
      se: [], voice: 'asset_audio_voice_alice_06',
    },
  },
  // L7: Bob 退场 + BGM 停止
  {
    line_id: 'L7',
    speaker: 'Bob',
    dialogue: '好，一言为定！明天见！',
    background: null,
    characters: {
      bob: { sprite_id: 'smile', position_slot: 'left', action: 'hide', transition: 'fade' },
    },
    audio: { bgm: CLEAR, ambient: null, se: ['asset_audio_se_door_close'], voice: 'asset_audio_voice_bob_07' },
  },
  // L8: 旁白
  {
    line_id: 'L8',
    speaker: null,
    dialogue: 'Bob 的身影消失在夜色中。街道重归寂静，只有虫鸣在耳边回荡。',
    background: null,
    characters: {},
    audio: { bgm: null, ambient: null, se: [], voice: null },
  },
  // L9: Charlie 出场 + BGM 恢复
  {
    line_id: 'L9',
    speaker: 'Charlie',
    dialogue: 'Alice！好久不见，你一个人在这里做什么？',
    background: null,
    characters: {
      charlie: { sprite_id: 'happy', position_slot: 'left', action: 'show' },
    },
    audio: {
      bgm: { asset_id: 'asset_audio_bgm_warm', volume: 0.6, loop: true },
      ambient: null, se: [], voice: 'asset_audio_voice_charlie_09',
    },
  },
  // L10: 全清场 + 旁白结尾
  {
    line_id: 'L10',
    speaker: null,
    dialogue: '夜幕完全降临，星空下的街道迎来了又一个宁静的夜晚……',
    background: { asset_id: 'asset_bg_night_sky', transition: 'fade' },
    characters: {
      alice: { sprite_id: 'smile', position_slot: 'right', action: CLEAR },
      charlie: { sprite_id: 'happy', position_slot: 'left', action: 'hide' },
    },
    audio: { bgm: null, ambient: CLEAR, se: [], voice: null },
  },
]
