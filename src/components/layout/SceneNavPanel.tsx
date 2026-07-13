import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { AssetItem, AssetType } from '@/core/types'
import { setDragCache, DRAG_MIME, type DragAssetData } from '@/utils/assetHelpers'
import { playAudioPreview, stopAudioPreview, isAudioPlaying } from '@/utils/audioManager'
import { Tabs, Input, Button } from '@/components/ui'
import { Image as ImageIcon, User, Music, Plus, Play, Pause, GripVertical, Search } from 'lucide-react'

type TabId = AssetType

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'background', label: '背景', icon: <ImageIcon size={14} strokeWidth={1.75} /> },
  { id: 'sprite', label: '立绘', icon: <User size={14} strokeWidth={1.75} /> },
  { id: 'audio', label: '音频', icon: <Music size={14} strokeWidth={1.75} /> },
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
        name: asset.name,
      }
      setDragCache(data)
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(data))
      e.dataTransfer.effectAllowed = 'copy'

      // 创建拖拽预览图：半透明小卡片
      const ghost = document.createElement('div')
      ghost.className =
        'rounded-md border border-primary bg-surface-2 px-3 py-1.5 text-xs text-fg shadow-2'
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
          dataUrl: f.dataUrl,
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
        // 图片类型用 FileReader 生成 base64 dataUrl，音频跳过（仅 Electron 模式支持）
        const isImage = file.type.startsWith('image/')
        if (isImage) {
          const reader = new FileReader()
          reader.onload = () => {
            const asset: AssetItem = {
              id,
              type: tab,
              name: file.name.replace(/\.[^.]+$/, ''),
              fileName: file.name,
              relativePath: '',
              dataUrl: reader.result as string,
              importedAt: now,
            }
            addAsset(asset)
          }
          reader.readAsDataURL(file)
        } else {
          const asset: AssetItem = {
            id,
            type: tab,
            name: file.name.replace(/\.[^.]+$/, ''),
            fileName: file.name,
            relativePath: '',
            importedAt: now,
          }
          addAsset(asset)
        }
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
        className="group flex cursor-grab items-center gap-2 rounded-md border border-edge/12 px-2 py-1.5 shadow-[0_1px_2px_rgba(28,24,18,0.06)] transition-all hover:border-edge/20 hover:shadow-[0_2px_4px_rgba(28,24,18,0.10)] hover:bg-surface-hover active:cursor-grabbing active:bg-surface-active"
        title={`拖拽到舞台或时间轴使用`}
      >
        {/* 缩略图 */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-1">
          {asset.dataUrl ? (
            <img
              src={asset.dataUrl}
              alt={asset.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-fg-subtle">
              {isImg ? <ImageIcon size={16} strokeWidth={1.75} /> : <Music size={16} strokeWidth={1.75} />}
            </span>
          )}
        </div>

        {/* 名称 */}
        <div className="min-w-0 flex-1">
          <span
            className="block truncate text-[11px] text-fg-muted group-hover:text-fg"
            title={asset.name}
          >
            {asset.name}
          </span>
          <span className="block truncate text-[10px] text-fg-faint">
            {asset.fileName}
          </span>
        </div>

        {/* 音频预览按钮 */}
        {!isImg && (
          <button
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              if (isAudioPlaying()) {
                stopAudioPreview()
              } else {
                playAudioPreview(asset)
              }
            }}
            title="点击试听"
            className="shrink-0 rounded p-1 text-fg-subtle opacity-0 transition-all hover:bg-surface-active hover:text-info group-hover:opacity-100"
          >
            {isAudioPlaying() ? <Pause size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
          </button>
        )}

        {/* 拖拽提示 */}
        <span className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">
          <GripVertical size={14} strokeWidth={1.75} />
        </span>
      </div>
    )
  }

  // ---- 整体 ----

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-edge/18 bg-surface">
      {/* 标题 */}
      <div className="flex items-baseline gap-1.5 border-b border-edge/14 bg-surface-1 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          素材库
        </span>
        <span className="text-[10px] text-fg-faint">· 拖拽至舞台</span>
      </div>

      {/* 导入按钮 */}
      <div className="border-b border-edge/10 px-2 py-2">
        <Button
          variant="outline"
          block
          icon={<Plus size={14} strokeWidth={1.75} />}
          onClick={handleImport}
        >
          导入{tab === 'audio' ? '音频' : '图片'}
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

      {/* 素材列表（可拖拽） */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-[10px] text-fg-faint">
            {search ? '没有匹配的素材' : '暂无素材，点击上方导入'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map(renderAssetCard)}
          </div>
        )}
      </div>

      {/* 底部计数 */}
      <div className="shrink-0 border-t border-edge/10 px-2 py-1.5 text-[10px] text-fg-faint">
        {filtered.length} 个{tab === 'audio' ? '音频' : tab === 'sprite' ? '立绘' : '背景'}
        {search && ` · 共 ${assets.filter((a) => a.type === tab).length}`}
      </div>
    </aside>
  )
}
