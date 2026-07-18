import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { AssetItem, AssetType } from '@/core/types'
import { hashAssetColor } from '@/utils/charColor'
import { resolveAssetSrc } from '@/utils/assetSrc'
import { Tabs, Input, Button, IconButton, ConfirmDialog } from '@/components/ui'
import { Image as ImageIcon, User, Music, Plus, Search, Pencil, Trash2 } from 'lucide-react'

type TabId = AssetType

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'background', label: '背景', icon: <ImageIcon size={14} strokeWidth={1.75} /> },
  { id: 'sprite', label: '立绘', icon: <User size={14} strokeWidth={1.75} /> },
  { id: 'audio', label: '音频', icon: <Music size={14} strokeWidth={1.75} /> },
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
  const [pendingDelete, setPendingDelete] = useState<AssetItem | null>(null)
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

      const result = await api.pickAssetFiles({ filters, kind: tab })
      if (!result.success || !result.files) return

      const now = new Date().toISOString()
      for (const f of result.files) {
        const asset: AssetItem = {
          id: f.id,
          type: tab,
          name: f.fileName.replace(/\.[^.]+$/, ''),
          fileName: f.fileName,
          relativePath: f.relativePath,
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
        // Web 降级：用 URL.createObjectURL 生成临时 blobUrl（比 base64 省内存），仅内存有效
        const isImage = file.type.startsWith('image/')
        const asset: AssetItem = {
          id,
          type: tab,
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          relativePath: '',
          blobUrl: isImage ? URL.createObjectURL(file) : undefined,
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

  // 删除（先校验引用，再弹确认框）
  const requestDelete = useCallback(
    (asset: AssetItem) => {
      const refs = getRefs(asset.id)
      if (refs.length > 0) {
        alert(`无法删除素材 "${asset.name}"，它被以下角色表情引用：\n${refs.join('\n')}\n\n请先在角色管理中解除引用。`)
        return
      }
      setPendingDelete(asset)
      setContextMenu(null)
    },
    [deleteAsset, getRefs],
  )

  // 右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, asset: AssetItem) => {
    e.preventDefault()
    setContextMenu({ id: asset.id, x: e.clientX, y: e.clientY })
  }, [])

  const tabLabel = tab === 'audio' ? '音频' : tab === 'sprite' ? '立绘' : '背景'

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* 标题 */}
      <div className="flex items-center gap-2 border-b border-edge/14 bg-surface-1 px-3 py-2.5">
        <span className="signal-dot" />
        <span className="eyebrow">素材管理 Assets</span>
      </div>

      {/* 导入按钮 */}
      <div className="border-b border-edge/10 px-2 py-2">
        <Button
          variant="outline"
          block
          icon={<Plus size={14} strokeWidth={1.75} />}
          onClick={handleImport}
        >
          导入{tabLabel}
        </Button>
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
      <div className="border-b border-edge/10 px-2 py-1.5">
        <Input
          placeholder="搜索素材..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<Search size={12} strokeWidth={1.75} />}
        />
      </div>

      {/* Tab 切换 */}
      <Tabs
        items={TABS}
        value={tab}
        onChange={(id) => {
          setTab(id)
          setSearch('')
        }}
        size="sm"
      />

      {/* 素材列表 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-10 text-[12px] text-fg-faint">
              {search ? '没有匹配的素材' : '暂无素材，点击上方按钮导入'}
            </div>
          ) : tab === 'audio' ? (
            /* 音频：紧凑列表行 */
            <div className="space-y-0.5">
              {filtered.map((asset) => (
                <div
                  key={asset.id}
                  onContextMenu={(e) => handleContextMenu(e, asset)}
                  className="group flex items-center gap-2 rounded-md border border-edge/12 px-2 py-1.5 transition-all hover:border-edge/20 hover:bg-surface-hover"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-1 text-fg-subtle">
                    <Music size={16} strokeWidth={1.75} />
                  </div>
                  <label
                    title="素材色（时间轴 / 总览通用）"
                    className="relative flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-surface-hover"
                  >
                    <span
                      className="pointer-events-none h-3.5 w-3.5 rounded-full border border-edge/30"
                      style={{ backgroundColor: asset.color || hashAssetColor(asset.id) }}
                    />
                    <input
                      type="color"
                      value={asset.color || '#888888'}
                      onChange={(e) => updateAsset(asset.id, { color: e.target.value })}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
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
                        className="w-full rounded border border-signal bg-surface-3 px-1 py-0.5 text-[12px] text-fg outline-none"
                      />
                    ) : (
                      <span
                        className="block truncate text-[12px] text-fg-muted group-hover:text-fg"
                        title={asset.name}
                      >
                        {asset.name}
                      </span>
                    )}
                    <span className="block truncate text-[12px] text-fg-subtle">{asset.fileName}</span>
                  </div>
                  <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      icon={<Pencil size={13} strokeWidth={1.75} />}
                      onClick={() => startRename(asset)}
                      title="重命名"
                      aria-label="重命名"
                    />
                    <IconButton
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={13} strokeWidth={1.75} />}
                      onClick={() => requestDelete(asset)}
                      title="删除"
                      aria-label="删除"
                      className="hover:bg-danger/12 hover:text-danger"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 图片：缩略图网格（背景图 cover 填满；立绘透明底用棋盘格 + contain 居中） */
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
              {filtered.map((asset) => {
                const isSprite = asset.type === 'sprite'
                const imgSrc = resolveAssetSrc(asset)
                return (
                  <div
                    key={asset.id}
                    onContextMenu={(e) => handleContextMenu(e, asset)}
                    className={`group relative aspect-square overflow-hidden rounded-md border border-edge/12 transition-all hover:border-edge/25 hover:shadow-2 ${
                      isSprite ? 'checkerboard' : 'bg-surface-2'
                    }`}
                  >
                    {imgSrc ? (
                      isSprite ? (
                        <div className="flex h-full w-full items-center justify-center p-1">
                          <img
                            src={imgSrc}
                            alt={asset.name}
                            className="max-h-full max-w-full object-contain drop-shadow-sm"
                          />
                        </div>
                      ) : (
                        <img
                          src={imgSrc}
                          alt={asset.name}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                        {isSprite ? <User size={20} strokeWidth={1.5} /> : <ImageIcon size={20} strokeWidth={1.5} />}
                      </div>
                    )}

                    {/* 色点 */}
                    <label
                      title="素材色（时间轴 / 总览通用）"
                      className="absolute left-1 top-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded hover:bg-black/15"
                    >
                      <span
                        className="pointer-events-none h-2.5 w-2.5 rounded-full border border-edge/40 shadow-sm"
                        style={{ backgroundColor: asset.color || hashAssetColor(asset.id) }}
                      />
                      <input
                        type="color"
                        value={asset.color || '#888888'}
                        onChange={(e) => updateAsset(asset.id, { color: e.target.value })}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </label>

                    {/* hover 操作 */}
                    <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => startRename(asset)}
                        className="rounded bg-black/45 p-0.5 text-white/90 backdrop-blur transition-colors hover:bg-black/65"
                        title="重命名"
                      >
                        <Pencil size={12} strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => requestDelete(asset)}
                        className="rounded bg-black/45 p-0.5 text-white/90 backdrop-blur transition-colors hover:bg-danger/70"
                        title="删除"
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    </div>

                    {/* 底部名称 */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-1.5 pb-1 pt-4">
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
                          className="w-full rounded border border-signal bg-surface-3 px-1 py-0.5 text-[12px] text-fg outline-none"
                        />
                      ) : (
                        <span className="block truncate text-[12px] font-medium text-white" title={asset.name}>
                          {asset.name}
                        </span>
                      )}
                      <span className="block truncate text-[12px] text-white/70">{asset.fileName}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="border-t border-edge/10 px-2 py-1.5 text-[12px] text-fg-faint">
        {filtered.length} 个{tabLabel}
        {search && ` 共 ${assets.filter((a) => a.type === tab).length}`}
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
            className="fixed z-50 rounded-lg border border-edge-strong/20 bg-surface-2 py-1 shadow-2"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                const asset = assets.find((a) => a.id === contextMenu.id)
                if (asset) startRename(asset)
              }}
              className="block w-full px-3 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-hover"
            >
              重命名
            </button>
            <button
              onClick={() => {
                const asset = assets.find((a) => a.id === contextMenu.id)
                if (asset) requestDelete(asset)
              }}
              className="block w-full px-3 py-1.5 text-left text-[12px] text-danger transition-colors hover:bg-surface-hover"
            >
              删除
            </button>
          </div>
        </>
      )}

      {/* 删除确认框 */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除素材"
        confirmText="删除"
        tone="danger"
        onConfirm={() => {
          if (pendingDelete) {
            const res = deleteAsset(pendingDelete.id)
            if (!res.ok) {
              alert(
                `无法删除素材 "${pendingDelete.name}"，它被以下角色表情引用：\n${res.refs.join(
                  '\n',
                )}\n\n请先在角色管理中解除引用。`,
              )
            }
          }
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
        message={
          pendingDelete ? (
            <>确定要删除素材「{pendingDelete.name}」吗？此操作不可撤销。</>
          ) : null
        }
      />
    </div>
  )
}
