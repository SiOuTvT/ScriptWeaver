import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { AssetItem, AssetType } from '@/core/types'

type TabId = AssetType

const TABS: { id: TabId; label: string }[] = [
  { id: 'background', label: '背景' },
  { id: 'sprite', label: '立绘' },
  { id: 'audio', label: '音频' },
]

export default function AssetManager() {
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const addAsset = useAppStore((s) => s.addAsset)
  const updateAsset = useAppStore((s) => s.updateAsset)
  const deleteAsset = useAppStore((s) => s.deleteAsset)

  const [tab, setTab] = useState<TabId>('background')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 按 tab 过滤
  const filtered = assets
    .filter((a) => a.type === tab)
    .filter((a) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return a.name.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q)
    })

  // 检查素材是否被角色引用
  const getRefs = useCallback(
    (assetId: string): string[] => {
      const refs: string[] = []
      for (const c of characterConfigs) {
        for (const e of c.expressions) {
          if (e.assetId === assetId) {
            refs.push(`${c.displayName}(${c.charId}).${e.label}`)
          }
        }
      }
      return refs
    },
    [characterConfigs],
  )

  // 导入素材
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
          dataUrl: f.dataUrl,
          importedAt: now,
        }
        addAsset(asset)
      }
    } else {
      // 浏览器降级：通过文件 input
      fileInputRef.current?.click()
    }
  }, [tab, addAsset])

  // 浏览器降级导入
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

  // 重命名
  const startRename = useCallback((asset: AssetItem) => {
    setEditingId(asset.id)
    setEditName(asset.name)
    setContextMenu(null)
  }, [])

  const commitRename = useCallback(() => {
    if (editingId && editName.trim()) {
      updateAsset(editingId, { name: editName.trim() })
    }
    setEditingId(null)
    setEditName('')
  }, [editingId, editName, updateAsset])

  // 删除
  const handleDelete = useCallback(
    (asset: AssetItem) => {
      const refs = getRefs(asset.id)
      if (refs.length > 0) {
        alert(`无法删除素材 "${asset.name}"，它被以下角色表情引用：\n${refs.join('\n')}\n\n请先在角色管理中解除引用。`)
        return
      }
      if (confirm(`确定要删除素材 "${asset.name}" 吗？此操作不可撤销。`)) {
        deleteAsset(asset.id)
      }
      setContextMenu(null)
    },
    [deleteAsset, getRefs],
  )

  // 右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, asset: AssetItem) => {
    e.preventDefault()
    setContextMenu({ id: asset.id, x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gray-950/80">
      {/* 标题 */}
      <div className="border-b border-gray-800 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          素材管理
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
          placeholder="搜索素材..."
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
            {t.label}
          </button>
        ))}
      </div>

      {/* 素材列表 */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-[10px] text-gray-600">
            {search ? '没有匹配的素材' : '暂无素材，点击上方按钮导入'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((asset) => (
              <div
                key={asset.id}
                onContextMenu={(e) => handleContextMenu(e, asset)}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-800/60"
              >
                {/* 缩略图/图标 */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-800 text-xs text-gray-500">
                  {asset.type === 'audio' ? '🎵' : '🖼'}
                </div>

                {/* 名称 */}
                <div className="min-w-0 flex-1">
                  {editingId === asset.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                      className="w-full rounded border border-brand-500 bg-gray-900 px-1 py-0.5 text-[11px] text-gray-200 outline-none"
                    />
                  ) : (
                    <span
                      className="block truncate text-[11px] text-gray-400 group-hover:text-gray-200 cursor-default"
                      title={asset.name}
                    >
                      {asset.name}
                    </span>
                  )}
                  <span className="block truncate text-[10px] text-gray-600">
                    {asset.fileName}
                  </span>
                </div>

                {/* 操作按钮 */}
                <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => startRename(asset)}
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                    title="重命名"
                  >
                    ✏
                  </button>
                  <button
                    onClick={() => handleDelete(asset)}
                    className="rounded p-0.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部统计 */}
      <div className="border-t border-gray-800 px-2 py-1.5 text-[10px] text-gray-600">
        {filtered.length} 个{tab === 'audio' ? '音频' : '素材'}
        {search && ` · 共 ${assets.filter((a) => a.type === tab).length}`}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }}
          />
          <div
            className="fixed z-50 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                const asset = assets.find((a) => a.id === contextMenu.id)
                if (asset) startRename(asset)
              }}
              className="block w-full px-3 py-1.5 text-left text-[11px] text-gray-300 hover:bg-gray-800"
            >
              重命名
            </button>
            <button
              onClick={() => {
                const asset = assets.find((a) => a.id === contextMenu.id)
                if (asset) handleDelete(asset)
              }}
              className="block w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-gray-800"
            >
              删除
            </button>
          </div>
        </>
      )}
    </div>
  )
}
