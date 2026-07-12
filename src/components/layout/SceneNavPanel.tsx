import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { AssetItem, AssetType } from '@/core/types'
import { setDragCache, DRAG_MIME, type DragAssetData } from '@/utils/assetHelpers'

type TabId = AssetType

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'background', label: '背景', icon: '🖼' },
  { id: 'sprite', label: '立绘', icon: '👤' },
  { id: 'audio', label: '音频', icon: '🎵' },
]

export default function SceneNavPanel() {
  const assets = useAppStore((s) => s.assets)
  const addAsset = useAppStore((s) => s.addAsset)

  const [tab, setTab] = useState<TabId>('background')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 按 tab + 搜索过滤
  const filtered = assets
    .filter((a) => a.type === tab)
    .filter((a) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return a.name.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q)
    })

  // ---- 拖拽 ----

  const handleDragStart = useCallback(
    (e: React.DragEvent, asset: AssetItem) => {
      const data: DragAssetData = {
        type: asset.type,
        assetId: asset.id,
        label: asset.name,
      }
      setDragCache(data)
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(data))
      e.dataTransfer.effectAllowed = 'copy'

      // 创建拖拽预览图：半透明小卡片
      const ghost = document.createElement('div')
      ghost.className =
        'rounded-md border border-brand-400 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 shadow-lg'
      ghost.textContent = asset.name
      ghost.style.position = 'absolute'
      ghost.style.top = '-9999px'
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 40, 20)
      requestAnimationFrame(() => document.body.removeChild(ghost))
    },
    [],
  )

  const handleDragEnd = useCallback(() => {
    setDragCache(null)
  }, [])

  // ---- 导入 ----

  const handleImport = useCallback(async () => {
    const api = window.electronAPI
    if (api) {
      let filters: { name: string; extensions: string[] }[] | undefined
      if (tab === 'audio') {
        filters = [{ name: '音频文件', extensions: ['mp3', 'ogg', 'wav'] }]
      } else {
        filters = [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      }

      const result = await api.pickAssetFiles({ filters })
      if (!result.success || !result.files) return

      const now = new Date().toISOString()
      for (const f of result.files) {
        const asset: AssetItem = {
          id: f.id,
          type: tab,
          name: f.fileName.replace(/\.[^.]+$/, ''),
          fileName: f.fileName,
          relativePath: f.relativePath,
          width: f.width,
          height: f.height,
          importedAt: now,
        }
        addAsset(asset)
      }
    } else {
      fileInputRef.current?.click()
    }
  }, [tab, addAsset])

  const handleBrowserImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      const now = new Date().toISOString()
      Array.from(files).forEach((file) => {
        const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const asset: AssetItem = {
          id,
          type: tab,
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          relativePath: '',
          importedAt: now,
        }
        addAsset(asset)
      })
      e.target.value = ''
    },
    [tab, addAsset],
  )

  // ---- 渲染素材卡片 ----

  const renderAssetCard = (asset: AssetItem) => {
    const isImg = asset.type !== 'audio'
    return (
      <div
        key={asset.id}
        draggable
        onDragStart={(e) => handleDragStart(e, asset)}
        onDragEnd={handleDragEnd}
        className="group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-800/60 active:cursor-grabbing active:bg-gray-700/60"
        title={`拖拽到舞台或时间轴使用`}
      >
        {/* 缩略图占位 */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-800 text-xs text-gray-500">
          {isImg ? '🖼' : '🎵'}
        </div>

        {/* 名称 */}
        <div className="min-w-0 flex-1">
          <span
            className="block truncate text-[11px] text-gray-400 group-hover:text-gray-200"
            title={asset.name}
          >
            {asset.name}
          </span>
          <span className="block truncate text-[10px] text-gray-600">
            {asset.fileName}
          </span>
        </div>

        {/* 拖拽提示 */}  
        <span className="shrink-0 text-[10px] text-gray-700 opacity-0 transition-opacity group-hover:opacity-100">
          ⠿
        </span>
      </div>
    )
  }

  // ---- 整体 ----

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-950/80">
      {/* 标题 */}
      <div className="border-b border-gray-800 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          素材库
        </span>
        <span className="ml-1.5 text-[10px] text-gray-600">
          · 拖拽至舞台
        </span>
      </div>

      {/* 导入按钮 */}
      <div className="border-b border-gray-800 px-2 py-2">
        <button
          onClick={handleImport}
          className="w-full rounded-md border border-dashed border-gray-600 px-2 py-1.5 text-[11px] text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-300"
        >
          + 导入{tab === 'audio' ? '音频' : '图片'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={tab === 'audio' ? 'audio/*' : 'image/*'}
          multiple
          className="hidden"
          onChange={handleBrowserImport}
        />
      </div>

      {/* 搜索 */}
      <div className="border-b border-gray-800 px-2 py-1.5">
        <input
          type="text"
          placeholder="搜索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 outline-none focus:border-brand-500/50"
        />
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              setSearch('')
            }}
            className={`flex-1 py-1.5 text-[11px] transition-colors ${
              tab === t.id
                ? 'border-b-2 border-brand-500 bg-gray-900/50 text-brand-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/30'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 素材列表（可拖拽） */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-[10px] text-gray-600">
            {search ? '没有匹配的素材' : '暂无素材，点击上方导入'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map(renderAssetCard)}
          </div>
        )}
      </div>

      {/* 底部计数 */}
      <div className="shrink-0 border-t border-gray-800 px-2 py-1.5 text-[10px] text-gray-600">
        {filtered.length} 个{tab === 'audio' ? '音频' : tab === 'sprite' ? '立绘' : '背景'}
        {search && ` · 共 ${assets.filter((a) => a.type === tab).length}`}
      </div>
    </aside>
  )
}
