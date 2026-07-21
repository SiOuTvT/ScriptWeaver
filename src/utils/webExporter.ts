// ============================================================
// ScriptWeaver - Web 独立包导出（纯函数层）
//
// 将当前工程序列化为 Web Player 可直接消费的 game.json，并收集所有被
// 引用的素材（背景 / 立绘 / 音频），交由主进程磁盘直拷。
// 关键：逐行预解析「表情 ID → 立绘素材 asset_id」，使纯前端播放器无需
// 重新实现角色解析逻辑，只凭 asset_id 从 assetMap 取相对路径即可渲染。
// ============================================================

import type {
  LineDelta,
  CharacterConfig,
  AssetItem,
  GlobalVariable,
  ResolvedLineState,
} from '@/core/types'
import { reduceLines } from '@/core/reducer'

export interface WebAssetRef {
  assetId: string
  type: string
  sourceRelativePath: string
  exportRelPath: string
}

export interface WebProjectBundle {
  gameJson: string
  assetRefs: WebAssetRef[]
  title: string
  missing: string[]
  lineCount: number
}

interface WebLine {
  line_id: string
  speaker: string | null
  dialogue: string
  background: { asset_id: string; transition?: string } | null
  characters: Record<
    string,
    { asset_id: string; position_slot: string; pos_x?: number; pos_y?: number; scale?: number }
  >
  audio: {
    voice: string | null
    se: string[]
    bgm: { asset_id: string; loop: boolean; volume: number } | null
    ambient: { asset_id: string; loop: boolean; volume: number } | null
  }
  line_type?: 'dialogue' | 'choice'
  choices?: { text: string; target_label: string; condition?: string; ops?: unknown }[]
  prompt?: string
  label?: string
  variableOps?: unknown
}

/**
 * 构建 Web 工程包：game.json 字符串 + 素材引用清单。
 * 纯函数：不触碰任何 store / fs，I/O 全部交由主进程。
 */
export function buildWebProject(params: {
  deltas: LineDelta[]
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
  variables: GlobalVariable[]
  canvasRatio?: { w: number; h: number }
  title: string
}): WebProjectBundle {
  const { deltas, characterConfigs, assets, variables, canvasRatio, title } = params

  const resolved: ResolvedLineState[] = reduceLines(deltas)
  const charById = new Map(characterConfigs.map((c) => [c.charId, c]))

  // ---- 逐行预解析立绘 asset_id（表情 → 素材）并裁剪为播放器所需字段 ----
  const linesOut: WebLine[] = resolved.map((st, i) => {
    const delta = deltas[i]

    const characters: WebLine['characters'] = {}
    Object.entries(st.characters).forEach(([instId, ch]) => {
      let assetId = ch.asset_id
      if (!assetId) {
        const cfg = ch.char_id ? charById.get(ch.char_id) : undefined
        if (cfg) {
          const expr =
            cfg.expressions.find((e) => e.id === ch.sprite_id) ||
            cfg.expressions.find((e) => e.id === cfg.defaultExpression) ||
            cfg.expressions[0]
          if (expr) assetId = expr.assetId
        }
      }
      characters[instId] = {
        asset_id: assetId ?? '',
        position_slot: ch.position_slot,
        pos_x: ch.pos_x,
        pos_y: ch.pos_y,
        scale: ch.scale,
      }
    })

    const au = st.audio
    const bgm = au.bgm
      ? { asset_id: au.bgm.asset_id, loop: au.bgm.loop, volume: au.bgm.volume }
      : null
    const ambient = au.ambient
      ? { asset_id: au.ambient.asset_id, loop: au.ambient.loop, volume: au.ambient.volume }
      : null

    return {
      line_id: st.line_id,
      speaker: st.speaker,
      dialogue: st.dialogue,
      background: st.background ? { asset_id: st.background.asset_id, transition: st.background.transition } : null,
      characters,
      audio: {
        voice: au.voice ?? null,
        se: au.se ?? [],
        bgm,
        ambient,
      },
      line_type: st.line_type ?? 'dialogue',
      choices: st.choices?.map((c) => ({
        text: c.text,
        target_label: c.target_label,
        condition: c.condition,
        ops: c.ops,
      })),
      prompt: st.prompt,
      label: st.label,
      variableOps: delta.variableOps,
    }
  })

  // ---- 收集素材引用，构建 assetMap（id → 相对路径 / 类型 / 时长） ----
  const assetMap: Record<string, { src: string; type: string; name: string; duration?: number }> = {}
  const refSet = new Map<string, WebAssetRef>()
  const seen = new Set<string>()
  const missing: string[] = []

  const collect = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    const a = assets.find((x) => x.id === id)
    if (!a) {
      missing.push(id)
      return
    }
    assetMap[id] = { src: a.relativePath, type: a.type, name: a.name, duration: a.duration }
    refSet.set(id, {
      assetId: a.id,
      type: a.type,
      sourceRelativePath: a.relativePath,
      exportRelPath: a.relativePath,
    })
  }

  for (const ln of linesOut) {
    collect(ln.background?.asset_id)
    Object.values(ln.characters).forEach((c) => collect(c.asset_id || undefined))
    collect(ln.audio.voice)
    ln.audio.se.forEach((s) => collect(s))
    collect(ln.audio.bgm?.asset_id)
    collect(ln.audio.ambient?.asset_id)
  }

  // ---- 角色显示信息（用于说话人名称着色） ----
  const charactersMeta: Record<string, { displayName: string; dialogueColor?: string }> = {}
  for (const c of characterConfigs) {
    charactersMeta[c.charId] = { displayName: c.displayName, dialogueColor: c.dialogueColor }
  }

  const gameData = {
    version: 1,
    title: title || 'ScriptWeaver',
    canvasRatio: canvasRatio ?? { w: 16, h: 9 },
    assetMap,
    variables,
    charactersMeta,
    lines: linesOut,
  }

  return {
    gameJson: JSON.stringify(gameData, null, 2),
    assetRefs: Array.from(refSet.values()),
    title: title || 'ScriptWeaver',
    missing,
    lineCount: linesOut.length,
  }
}
