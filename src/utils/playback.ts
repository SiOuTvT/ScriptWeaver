// ============================================================
// ScriptWeaver - 预览播放时长估算
//
// 经典 Galgame「自动播放（Auto）」按台词字数估算每行停留时长；
// 同一估算也作为「段落（行）内时间轴」的总时长基准，
// 供音频块在单段内部的相对偏移（offset）换算为毫秒。
// ============================================================

/**
 * 估算单行演出停留时长（毫秒）。
 * 公式：基础停顿 + 每字符耗时，下限 / 上限保护，避免极短句一闪而过或长句拖死。
 * 中文按字符计、混合文本按字符近似即可（标点占比低，整体 + 基础停顿已含余量）。
 */
export function estimateLineDurationMs(dialogue: string | null | undefined): number {
  const text = (dialogue ?? '').trim()
  if (!text) return 1200
  const chars = Array.from(text).length
  const ms = 800 + chars * 90
  return Math.max(1200, Math.min(ms, 9000))
}
