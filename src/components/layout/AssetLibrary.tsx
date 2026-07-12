import { useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { DRAG_MIME, setDragCache, type DragAssetData } from '@/utils/assetHelpers'

type TabId = 'background' | 'sprite' | 'audio'

const TABS: { id: TabId; label: string }[] = [
  { id: 'background', label: '背景' },
  { id: 'sprite', label: '立绘' },
  { id: 'audio', label: '音频' },
]

const MOCK_ASSETS: Record<TabId, { id: string; label: string; color: string }[]> = {
  background: [
    { id: 'bg_street_dusk', label: '黄昏街道', color: '#4a3728' },
    { id: 'bg_street_night', label: '夜晚街道', color: '#1a1a2e' },
    { id: 'bg_night_sky', label: '星空夜空', color: '#0d1b2a' },
    { id: 'bg_room', label: '室内', color: '#3d2b1f' },
    { id: 'bg_park', label: '公园', color: '#2d5a27' },
    { id: 'bg_school', label: '学校', color: '#4a4a6a' },
  ],
  sprite: [
    { id: 'alice_smile', label: 'Alice 微笑', color: '#e8a0bf' },
    { id: 'alice_angry', label: 'Alice 生气', color: '#d4708a' },
    { id: 'bob_normal', label: 'Bob 普通', color: '#7ec8e3' },
    { id: 'bob_smile', label: 'Bob 微笑', color: '#5da8c9' },
    { id: 'charlie_happy', label: 'Charlie 开心', color: '#c3b1e1' },
  ],
  audio: [
    { id: 'bgm_peaceful', label: '宁静 BGM', color: '#4a7c59' },
    { id: 'bgm_lively', label: '活泼 BGM', color: '#c9a243' },
    { id: 'bgm_warm', label: '温暖 BGM', color: '#c47e5a' },
    { id: 'ambient_crickets', label: '虫鸣', color: '#5a6e4a' },
    { id: 'ambient_rain', label: '雨声', color: '#4a6e8a' },
  ],
}

export default function AssetLibrary() {
  const tab = useAppStore((s) => s.assetTab)
  const setTab = useAppStore((s) => s.setAssetTab)
  const assets = MOCK_ASSETS[tab]

  const handleDragStart = useCallback(
    (e: React.DragEvent, assetId: string, label: string) => {
      const data: DragAssetData = { type: tab, assetId, label }
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(data))
      e.dataTransfer.effectAllowed = 'copy'
      setDragCache(data)
      e.currentTarget.classList.add('opacity-50')
    },
    [tab],
  )

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50')
    setDragCache(null)
  }, [])

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-gray-800 bg-gray-950/80">
      {/* 标题 */}
      <div className="border-b border-gray-800 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          素材库
        </span>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs transition-colors ${
              tab === t.id
                ? 'border-b-2 border-brand-500 bg-gray-900/50 text-brand-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 素材列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {assets.map((asset) => (
            <div
              key={asset.id}
              draggable
              onDragStart={(e) => handleDragStart(e, asset.id, asset.label)}
              onDragEnd={handleDragEnd}
              className="group flex cursor-grab items-center gap-2 rounded-lg px-2 py-2 transition-all hover:bg-gray-800 active:cursor-grabbing"
              title={`拖拽 ${asset.label} 到舞台或时间轴`}
            >
              {/* 色块占位缩略图 */}
              <div
                className="h-7 w-7 shrink-0 rounded"
                style={{ backgroundColor: asset.color }}
              />
              <span className="truncate text-xs text-gray-400 group-hover:text-gray-200">
                {asset.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="border-t border-gray-800 px-2 py-1.5 text-[10px] text-gray-600">
        拖拽到舞台或时间轴
      </div>
    </aside>
  )
}
