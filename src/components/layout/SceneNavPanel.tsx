import { useAppStore } from '@/stores/appStore'
import type { AssetItem } from '@/core/types'

export default function SceneNavPanel() {
  const deltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const selectLine = useAppStore((s) => s.selectLine)

  // 按类型分组素材（响应式，导入后自动刷新）
  const bgAssets = assets.filter((a) => a.type === 'background')
  const spriteAssets = assets.filter((a) => a.type === 'sprite')
  const audioAssets = assets.filter((a) => a.type === 'audio')

  // 统计已使用的素材 ID
  const usedBgIds = new Set<string>()
  const usedSpriteIds = new Set<string>()
  const usedAudioIds = new Set<string>()
  for (const d of deltas) {
    if (d.background?.asset_id) usedBgIds.add(d.background.asset_id)
    for (const ch of Object.values(d.characters)) {
      if (ch.sprite_id) usedSpriteIds.add(ch.sprite_id)
    }
    if (d.audio.bgm?.asset_id) usedAudioIds.add(d.audio.bgm.asset_id)
    if (d.audio.ambient?.asset_id) usedAudioIds.add(d.audio.ambient.asset_id)
    for (const seId of d.audio.se) usedAudioIds.add(seId)
    if (d.audio.voice) usedAudioIds.add(d.audio.voice)
  }

  const renderAssetBadge = (assets: AssetItem[], usedIds: Set<string>, label: string, color: string) => {
    const unused = assets.filter((a) => !usedIds.has(a.id))
    return (
      <div className="rounded bg-gray-800/50 px-2 py-1.5">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-gray-500">{label}</span>
          <span className={`text-[10px] font-medium ${color}`}>
            {assets.length} 个
          </span>
        </div>
        {assets.length === 0 ? (
          <p className="text-[10px] text-gray-600 italic">暂无，请到素材管理导入</p>
        ) : unused.length === assets.length ? (
          <p className="text-[10px] text-gray-500">全部可用（{assets.length}）</p>
        ) : (
          <p className="text-[10px] text-gray-500">
            {assets.length - unused.length} 已用 · {unused.length} 可用
          </p>
        )}
      </div>
    )
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-950/80">
      {/* 标题 */}
      <div className="border-b border-gray-800 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          场景导航
        </span>
      </div>

      {/* 剧本行列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-800 px-3 py-1.5">
          <span className="text-[10px] text-gray-500">
            剧本行 · {deltas.length} 行
          </span>
        </div>
        {deltas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-[10px] text-gray-600">
            暂无内容
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {resolvedStates.map((state, i) => {
              const isSelected = i === selectedIndex
              const speakerLabel = state.speaker
                ? characterConfigs.find((c) => c.charId.toLowerCase() === state.speaker?.toLowerCase())?.displayName ?? state.speaker
                : ''
              const preview = state.dialogue
                ? state.dialogue.length > 28
                  ? state.dialogue.slice(0, 28) + '…'
                  : state.dialogue
                : '(空行)'

              return (
                <button
                  key={state.line_id}
                  onClick={() => selectLine(i)}
                  className={`w-full px-3 py-1.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-brand-600/10 border-l-2 border-brand-500'
                      : 'border-l-2 border-transparent hover:bg-gray-800/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-mono text-gray-600 shrink-0">
                      {state.line_id}
                    </span>
                    {speakerLabel && (
                      <span className="text-[10px] font-medium text-brand-400/80 truncate">
                        {speakerLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 line-clamp-1">
                    {preview}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 底部素材库概览（导入后实时刷新） */}
      <div className="shrink-0 border-t border-gray-800 p-2 space-y-1.5">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          素材库
        </span>
        {renderAssetBadge(bgAssets, usedBgIds, '🖼 背景', 'text-purple-400')}
        {renderAssetBadge(spriteAssets, usedSpriteIds, '👤 立绘', 'text-pink-400')}
        {renderAssetBadge(audioAssets, usedAudioIds, '🎵 音频', 'text-green-400')}
        <div className="text-[10px] text-gray-600 pt-0.5">
          {characterConfigs.length} 角色
        </div>
      </div>
    </aside>
  )
}
