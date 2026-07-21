import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { AssetItem, AssetType } from '@/core/types'
import { hashAssetColor } from '@/utils/charColor'
import { resolveAssetSrc } from '@/utils/assetSrc'
import { setDragCache, DRAG_MIME, type DragAssetData } from '@/utils/assetHelpers'
import { Button, IconButton, Input, ConfirmDialog } from '@/components/ui'
import {
  Image as ImageIcon,
  User,
  Music,
  Film,
  Sparkles,
  Plus,
  Search,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  Rows3,
  Rows4,
  Square,
  Link2,
  UploadCloud,
  Play,
  Pause,
  Volume2,
  X,
} from 'lucide-react'

// ============================ 类型与工具 ============================

type Cat = 'all' | AssetType | 'video' | 'effect'

const CATS: { id: Cat; label: string; icon: React.ReactNode; enabled: boolean }[] = [
  { id: 'all', label: '全部素材', icon: <LayoutGrid size={15} strokeWidth={1.75} />, enabled: true },
  { id: 'background', label: '背景', icon: <ImageIcon size={15} strokeWidth={1.75} />, enabled: true },
  { id: 'sprite', label: '立绘', icon: <User size={15} strokeWidth={1.75} />, enabled: true },
  { id: 'audio', label: '音频', icon: <Music size={15} strokeWidth={1.75} />, enabled: true },
  { id: 'video', label: '视频', icon: <Film size={15} strokeWidth={1.75} />, enabled: false },
  { id: 'effect', label: '特效预设', icon: <Sparkles size={15} strokeWidth={1.75} />, enabled: false },
]

const CHECKER =
  'linear-gradient(45deg,#d8d8d8 25%,transparent 25%),linear-gradient(-45deg,#d8d8d8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d8d8d8 75%),linear-gradient(-45deg,transparent 75%,#d8d8d8 75%)'

function extOf(name: string): string {
  const m = name.split('.').pop()
  return m ? m.toUpperCase() : '?'
}

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 通过 Range 请求拿 Content-Range 头，零下载得到文件体积
async function getByteSize(url: string): Promise<number | null> {
  try {
    const resp = await fetch(url, { headers: { Range: 'bytes=0-0' } })
    const cr = resp.headers.get('Content-Range')
    if (cr) {
      const m = cr.match(/\/(\d+)\s*$/)
      if (m) return parseInt(m[1], 10)
    }
    const cl = resp.headers.get('Content-Length')
    if (cl) return parseInt(cl, 10)
  } catch {
    /* 协议不支持时静默降级 */
  }
  return null
}

const waveCache = new Map<string, number[]>()
let sharedCtx: AudioContext | null = null

// 解码音频生成波形峰值（缓存），失败时用确定性伪波形兜底
async function computeWaveform(url: string): Promise<number[]> {
  if (waveCache.has(url)) return waveCache.get(url)!
  const fallback = () => {
    const seed = [...url].reduce((a, c) => a + c.charCodeAt(0), 0)
    const out = Array.from({ length: 80 }, (_, i) => 0.18 + 0.62 * Math.abs(Math.sin(i * 0.42 + seed)))
    waveCache.set(url, out)
    return out
  }
  try {
    const resp = await fetch(url)
    const buf = await resp.arrayBuffer()
    if (!sharedCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      sharedCtx = new Ctor()
    }
    const audioBuf = await sharedCtx.decodeAudioData(buf)
    const ch = audioBuf.getChannelData(0)
    const bars = 80
    const block = Math.max(1, Math.floor(ch.length / bars))
    const peaks: number[] = []
    for (let i = 0; i < bars; i++) {
      let max = 0
      for (let j = 0; j < block; j++) {
        const v = Math.abs(ch[i * block + j] || 0)
        if (v > max) max = v
      }
      peaks.push(max)
    }
    const norm = Math.max(...peaks) || 1
    const out = peaks.map((p) => p / norm)
    waveCache.set(url, out)
    return out
  } catch {
    return fallback()
  }
}

// ============================ 引用检索 ============================

interface RefLine {
  index: number
  label: string
  snippet: string
}

function buildRefs(deltas: { background?: { asset_id?: string } | null; characters?: Record<string, { asset_id?: string }>; audio?: { bgm?: { asset_id?: string } | null; ambient?: { asset_id?: string } | null; voice?: string | null; se?: string[] }; speaker?: string | null; dialogue?: string }[], assetId: string): RefLine[] {
  const out: RefLine[] = []
  deltas.forEach((d, i) => {
    let hit = false
    if (d.background?.asset_id === assetId) hit = true
    if (d.characters) {
      for (const k in d.characters) {
        if (d.characters[k]?.asset_id === assetId) {
          hit = true
          break
        }
      }
    }
    const a = d.audio
    if (a) {
      if (a.bgm?.asset_id === assetId) hit = true
      else if (a.ambient?.asset_id === assetId) hit = true
      else if (a.voice === assetId) hit = true
      else if (a.se?.includes(assetId)) hit = true
    }
    if (hit) {
      const sp = d.speaker ? `${d.speaker}：` : ''
      out.push({
        index: i,
        label: `第 ${i + 1} 行`,
        snippet: (sp + (d.dialogue || '')).slice(0, 42) + ((sp + (d.dialogue || '')).length > 42 ? '…' : ''),
      })
    }
  })
  return out
}

// ============================ 主组件 ============================

export default function AssetManager() {
  const assets = useAppStore((s) => s.assets)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const addAsset = useAppStore((s) => s.addAsset)
  const updateAsset = useAppStore((s) => s.updateAsset)
  const deleteAsset = useAppStore((s) => s.deleteAsset)
  const selectLine = useAppStore((s) => s.selectLine)
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  const [cat, setCat] = useState<Cat>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'modified' | 'type'>('modified')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [density, setDensity] = useState<'compact' | 'normal' | 'large'>('normal')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AssetItem | null>(null)
  const [refsAsset, setRefsAsset] = useState<AssetItem | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditName('')
  }, [])

  // 各分类计数
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assets.length, background: 0, sprite: 0, audio: 0, video: 0, effect: 0 }
    for (const a of assets) c[a.type] = (c[a.type] || 0) + 1
    return c
  }, [assets])

  const list = useMemo(() => {
    let arr = assets.filter((a) => (cat === 'all' ? true : a.type === cat))
    const q = search.trim().toLowerCase()
    if (q) arr = arr.filter((a) => a.name.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q))
    arr = [...arr].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
      if (sort === 'type') return a.type.localeCompare(b.type)
      return b.importedAt.localeCompare(a.importedAt)
    })
    return arr
  }, [assets, cat, search, sort])

  const refs = useMemo(
    () => (refsAsset ? buildRefs(draftDeltas as never, refsAsset.id) : []),
    [refsAsset, draftDeltas],
  )

  // 角色引用（删除防御）
  const getCharRefs = useCallback(
    (assetId: string): string[] => {
      const r: string[] = []
      for (const c of characterConfigs) {
        for (const e of c.expressions) {
          if (e.assetId === assetId) r.push(`${c.displayName}(${c.charId}).${e.label}`)
        }
      }
      return r
    },
    [characterConfigs],
  )

  const makeAsset = useCallback(
    (f: { id: string; fileName: string; relativePath: string; type: AssetType }): AssetItem => ({
      id: f.id,
      type: f.type,
      name: f.fileName.replace(/\.[^.]+$/, ''),
      fileName: f.fileName,
      relativePath: f.relativePath,
      importedAt: new Date().toISOString(),
    }),
    [],
  )

  const handleImport = useCallback(async () => {
    const api = window.electronAPI
    const kind: AssetType | undefined = cat === 'all' || cat === 'video' || cat === 'effect' ? undefined : cat
    if (api) {
      const filters =
        kind === 'audio'
          ? [{ name: '音频文件', extensions: ['mp3', 'ogg', 'wav', 'flac'] }]
          : [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      const result = await api.pickAssetFiles({ filters, kind })
      if (!result.success || !result.files) return
      for (const f of result.files) addAsset(makeAsset(f))
    } else {
      fileInputRef.current?.click()
    }
  }, [cat, addAsset, makeAsset])

  const handleDropFiles = useCallback(
    async (paths: string[]) => {
      const api = window.electronAPI
      const real = paths.filter(Boolean)
      if (real.length && api?.importFilesFromPaths) {
        const kind: AssetType | undefined = cat === 'all' || cat === 'video' || cat === 'effect' ? undefined : cat
        const res = await api.importFilesFromPaths(real, kind)
        if (res.success && res.files) for (const f of res.files) addAsset(makeAsset(f))
      } else {
        handleImport()
      }
    },
    [cat, addAsset, makeAsset, handleImport],
  )

  const handleBrowserImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      const now = new Date().toISOString()
      Array.from(files).forEach((file) => {
        const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const isImage = file.type.startsWith('image/')
        addAsset({
          id,
          type: cat === 'all' || cat === 'video' || cat === 'effect' ? (isImage ? 'sprite' : 'audio') : cat,
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          relativePath: '',
          blobUrl: isImage ? URL.createObjectURL(file) : undefined,
          importedAt: now,
        })
      })
      e.target.value = ''
    },
    [cat, addAsset],
  )

  const handleAssetDragStart = useCallback((e: React.DragEvent, asset: AssetItem) => {
    const data: DragAssetData = { type: asset.type, assetId: asset.id, label: asset.name, name: asset.name }
    setDragCache(data)
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleAssetDragEnd = useCallback(() => setDragCache(null), [])

  const startRename = useCallback((asset: AssetItem) => {
    setEditingId(asset.id)
    setEditName(asset.name)
    setContextMenu(null)
  }, [])

  const commitRename = useCallback(() => {
    if (editingId && editName.trim()) updateAsset(editingId, { name: editName.trim() })
    setEditingId(null)
    setEditName('')
  }, [editingId, editName, updateAsset])

  const requestDelete = useCallback(
    (asset: AssetItem) => {
      const r = getCharRefs(asset.id)
      if (r.length > 0) {
        alert(`无法删除素材 "${asset.name}"，它被以下角色表情引用：\n${r.join('\n')}\n\n请先在角色管理中解除引用。`)
        return
      }
      setPendingDelete(asset)
      setContextMenu(null)
    },
    [getCharRefs],
  )

  const jumpToLine = useCallback(
    (index: number) => {
      selectLine(index)
      setActiveNavItem('chapters')
      setRefsAsset(null)
    },
    [selectLine, setActiveNavItem],
  )

  const isUnsupported = cat === 'video' || cat === 'effect'
  const catLabel = CATS.find((c) => c.id === cat)?.label ?? '素材'

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-canvas">
      {/* 左侧分类树 */}
      <aside className="flex w-40 shrink-0 flex-col border-r border-edge/12 bg-surface">
        <div className="flex items-center gap-2 border-b border-edge/10 px-3 py-2.5">
          <span className="signal-dot" />
          <span className="eyebrow">素材库</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {CATS.map((c) => {
            const active = cat === c.id
            return (
              <button
                key={c.id}
                disabled={!c.enabled}
                onClick={() => {
                  setCat(c.id)
                  setSearch('')
                }}
                className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all ${
                  active
                    ? 'signal-bar bg-primary/[0.08] text-fg'
                    : c.enabled
                      ? 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                      : 'cursor-not-allowed text-fg-faint/60'
                }`}
              >
                <span className="shrink-0">{c.icon}</span>
                <span className="truncate">{c.label}</span>
                <span
                  className={`ml-auto rounded-full px-1.5 text-[11px] tabular-nums ${
                    active ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-fg-faint'
                  }`}
                >
                  {counts[c.id] ?? 0}
                </span>
              </button>
            )
          })}
        </nav>
        <div className="border-t border-edge/10 p-2">
          <Button variant="primary" block icon={<Plus size={14} strokeWidth={1.75} />} onClick={handleImport}>
            导入素材
          </Button>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-edge/12 bg-surface-1 px-3 py-2">
          <div className="min-w-[180px] flex-1">
            <Input
              placeholder={`在${catLabel}中搜索…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<Search size={12} strokeWidth={1.75} />}
            />
          </div>

          <div className="flex items-center gap-1 rounded-md border border-edge/12 bg-surface-2 p-0.5">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'name' | 'modified' | 'type')}
              className="bg-transparent px-1.5 py-1 text-[12px] text-fg-muted outline-none"
              title="排序方式"
            >
              <option value="modified">最近导入</option>
              <option value="name">名称</option>
              <option value="type">类型</option>
            </select>
          </div>

          {view === 'grid' && (
            <div className="flex items-center gap-0.5 rounded-md border border-edge/12 bg-surface-2 p-0.5">
              <IconButton
                size="xs"
                variant={density === 'compact' ? 'primary' : 'ghost'}
                icon={<Rows4 size={13} strokeWidth={1.75} />}
                aria-label="紧凑"
                title="紧凑"
                onClick={() => setDensity('compact')}
              />
              <IconButton
                size="xs"
                variant={density === 'normal' ? 'primary' : 'ghost'}
                icon={<Square size={13} strokeWidth={1.75} />}
                aria-label="标准"
                title="标准"
                onClick={() => setDensity('normal')}
              />
              <IconButton
                size="xs"
                variant={density === 'large' ? 'primary' : 'ghost'}
                icon={<Rows3 size={13} strokeWidth={1.75} />}
                aria-label="大图"
                title="大图"
                onClick={() => setDensity('large')}
              />
            </div>
          )}

          <div className="flex items-center gap-0.5 rounded-md border border-edge/12 bg-surface-2 p-0.5">
            <IconButton
              size="xs"
              variant={view === 'grid' ? 'primary' : 'ghost'}
              icon={<LayoutGrid size={13} strokeWidth={1.75} />}
              aria-label="网格视图"
              title="网格视图"
              onClick={() => setView('grid')}
            />
            <IconButton
              size="xs"
              variant={view === 'list' ? 'primary' : 'ghost'}
              icon={<List size={13} strokeWidth={1.75} />}
              aria-label="列表视图"
              title="列表视图"
              onClick={() => setView('list')}
            />
          </div>
        </div>

        {/* 内容区（含拖拽上传热区） */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false)
          }}
          onDrop={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setDragging(false)
              const paths = Array.from(e.dataTransfer.files)
                .map((f) => (f as unknown as { path?: string }).path)
                .filter((p): p is string => !!p)
              void handleDropFiles(paths)
            }
          }}
        >
          <div className="h-full overflow-y-auto p-3">
            {isUnsupported ? (
              <UnsupportedPanel label={catLabel} />
            ) : list.length === 0 ? (
              <EmptyPanel search={search} onImport={handleImport} />
            ) : view === 'grid' ? (
              <GridArea
                list={list}
                density={density}
                editingId={editingId}
                editName={editName}
                onEditName={setEditName}
                onCommitRename={commitRename}
                onCancelEdit={cancelEdit}
                onStartRename={startRename}
                onRequestDelete={requestDelete}
                onShowRefs={setRefsAsset}
                onContextMenu={(e, a) => {
                  e.preventDefault()
                  setContextMenu({ id: a.id, x: e.clientX, y: e.clientY })
                }}
                onDragStart={handleAssetDragStart}
                onDragEnd={handleAssetDragEnd}
              />
            ) : (
              <ListArea
                list={list}
                editingId={editingId}
                editName={editName}
                onEditName={setEditName}
                onCommitRename={commitRename}
                onCancelEdit={cancelEdit}
                onStartRename={startRename}
                onRequestDelete={requestDelete}
                onShowRefs={setRefsAsset}
                onContextMenu={(e, a) => {
                  e.preventDefault()
                  setContextMenu({ id: a.id, x: e.clientX, y: e.clientY })
                }}
                onDragStart={handleAssetDragStart}
                onDragEnd={handleAssetDragEnd}
              />
            )}
          </div>

          {/* 拖拽上传遮罩 */}
          {dragging && (
            <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/60 bg-primary/[0.08] backdrop-blur-sm">
              <UploadCloud size={34} strokeWidth={1.5} className="text-primary" />
              <span className="text-[14px] font-medium text-fg">松开鼠标即可导入素材</span>
              <span className="text-[12px] text-fg-subtle">支持背景 / 立绘 / 音频，自动归类落盘</span>
            </div>
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between border-t border-edge/12 bg-surface-1 px-3 py-1.5 text-[12px] text-fg-faint">
          <span>
            {list.length} 个{catLabel}
            {search && ` (共 ${assets.filter((a) => (cat === 'all' ? true : a.type === cat)).length})`}
          </span>
          <span className="font-mono">{cat === 'all' ? '全部类型' : catLabel}</span>
        </div>
      </div>

      {/* 隐藏文件输入（浏览器降级） */}
      <input
        ref={fileInputRef}
        type="file"
        accept={cat === 'audio' ? 'audio/*' : 'image/*'}
        multiple
        className="hidden"
        onChange={handleBrowserImport}
      />

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu(null)
            }}
          />
          <div
            className="fixed z-50 rounded-lg border border-edge-strong/20 bg-surface-2 py-1 shadow-2"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(['rename', 'refs', 'delete'] as const).map((action) => {
              const a = assets.find((x) => x.id === contextMenu.id)
              if (!a) return null
              const map = {
                rename: { label: '重命名', danger: false, run: () => startRename(a) },
                refs: { label: '查看引用', danger: false, run: () => setRefsAsset(a) },
                delete: { label: '删除', danger: true, run: () => requestDelete(a) },
              }[action]
              return (
                <button
                  key={action}
                  onClick={map.run}
                  className={`block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-hover ${
                    map.danger ? 'text-danger' : 'text-fg-muted'
                  }`}
                >
                  {map.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 引用检索弹窗 */}
      {refsAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRefsAsset(null)}>
          <div
            className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-edge-strong/15 bg-surface shadow-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-edge/12 px-4 py-3">
              <div className="flex items-center gap-2">
                <Link2 size={15} strokeWidth={1.75} className="text-info" />
                <span className="text-[14px] font-medium text-fg">引用检索 · {refsAsset.name}</span>
              </div>
              <IconButton size="xs" variant="ghost" icon={<X size={15} strokeWidth={1.75} />} aria-label="关闭" onClick={() => setRefsAsset(null)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {refs.length === 0 ? (
                <div className="px-3 py-10 text-center text-[12px] text-fg-faint">该素材尚未被任何剧本行引用</div>
              ) : (
                refs.map((r) => (
                  <button
                    key={r.index}
                    onClick={() => jumpToLine(r.index)}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-fg-subtle">
                      {r.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted group-hover:text-fg">{r.snippet || '(无台词)'}</span>
                    <span className="shrink-0 text-[11px] text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">跳转 →</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
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
              alert(`无法删除素材 "${pendingDelete.name}"，它被以下角色表情引用：\n${res.refs.join('\n')}\n\n请先在角色管理中解除引用。`)
            }
          }
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
        message={pendingDelete ? <>确定要删除素材「{pendingDelete.name}」吗？此操作不可撤销。</> : null}
      />
    </div>
  )
}

// ============================ 网格视图 ============================

function densityCols(type: AssetType, density: 'compact' | 'normal' | 'large'): string {
  if (type === 'audio') {
    return density === 'compact' ? 'grid-cols-2 sm:grid-cols-3' : density === 'normal' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
  }
  if (type === 'sprite') {
    return density === 'compact' ? 'grid-cols-4 sm:grid-cols-5' : density === 'normal' ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'
  }
  return density === 'compact' ? 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8' : density === 'normal' ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
}

interface GridProps {
  list: AssetItem[]
  density: 'compact' | 'normal' | 'large'
  editingId: string | null
  editName: string
  onEditName: (v: string) => void
  onCommitRename: () => void
  onCancelEdit: () => void
  onStartRename: (a: AssetItem) => void
  onRequestDelete: (a: AssetItem) => void
  onShowRefs: (a: AssetItem) => void
  onContextMenu: (e: React.MouseEvent, a: AssetItem) => void
  onDragStart: (e: React.DragEvent, a: AssetItem) => void
  onDragEnd: () => void
}

function GridArea(props: GridProps) {
  // 按类型分组套用不同列数
  const groups = useMemo(() => {
    const bg = props.list.filter((a) => a.type === 'background')
    const sp = props.list.filter((a) => a.type === 'sprite')
    const au = props.list.filter((a) => a.type === 'audio')
    return [
      { type: 'background' as AssetType, items: bg },
      { type: 'sprite' as AssetType, items: sp },
      { type: 'audio' as AssetType, items: au },
    ].filter((g) => g.items.length > 0)
  }, [props.list])

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.type} className={`grid gap-3 ${densityCols(g.type, props.density)}`}>
          {g.items.map((a) =>
            a.type === 'audio' ? (
              <AudioCard key={a.id} asset={a} {...audioCardProps(props, a)} />
            ) : (
              <ImageCard key={a.id} asset={a} density={props.density} {...imageCardProps(props, a)} />
            ),
          )}
        </div>
      ))}
    </div>
  )
}

function imageCardProps(props: GridProps, a: AssetItem) {
  return {
    editingId: props.editingId,
    editName: props.editName,
    onEditName: props.onEditName,
    onCommitRename: props.onCommitRename,
    onCancelEdit: props.onCancelEdit,
    onStartRename: props.onStartRename,
    onRequestDelete: props.onRequestDelete,
    onShowRefs: props.onShowRefs,
    onContextMenu: props.onContextMenu,
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
  }
}

function audioCardProps(props: GridProps, a: AssetItem) {
  return {
    editingId: props.editingId,
    editName: props.editName,
    onEditName: props.onEditName,
    onCommitRename: props.onCommitRename,
    onCancelEdit: props.onCancelEdit,
    onStartRename: props.onStartRename,
    onRequestDelete: props.onRequestDelete,
    onShowRefs: props.onShowRefs,
    onContextMenu: props.onContextMenu,
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
  }
}

// ============================ 图片卡片 ============================

interface ImageCardProps {
  asset: AssetItem
  density: 'compact' | 'normal' | 'large'
  editingId: string | null
  editName: string
  onEditName: (v: string) => void
  onCommitRename: () => void
  onCancelEdit: () => void
  onStartRename: (a: AssetItem) => void
  onRequestDelete: (a: AssetItem) => void
  onShowRefs: (a: AssetItem) => void
  onContextMenu: (e: React.MouseEvent, a: AssetItem) => void
  onDragStart: (e: React.DragEvent, a: AssetItem) => void
  onDragEnd: () => void
}

function ImageCard(p: ImageCardProps) {
  const { asset, density } = p
  const isSprite = asset.type === 'sprite'
  const isPng = asset.fileName.toLowerCase().endsWith('.png')
  const imgSrc = resolveAssetSrc(asset)
  const [size, setSize] = useState<number | null>(null)
  const [dims, setDims] = useState<string>(asset.width && asset.height ? `${asset.width}×${asset.height}` : '—')

  useEffect(() => {
    let alive = true
    if (imgSrc) getByteSize(imgSrc).then((s) => alive && setSize(s))
    return () => {
      alive = false
    }
  }, [imgSrc])

  const ratio = density === 'compact' ? 'aspect-[4/3]' : density === 'large' ? 'aspect-[3/4]' : isSprite ? 'aspect-square' : 'aspect-video'

  return (
    <div
      draggable
      onDragStart={(e) => p.onDragStart(e, asset)}
      onDragEnd={p.onDragEnd}
      onContextMenu={(e) => p.onContextMenu(e, asset)}
      className="group relative cursor-grab overflow-hidden rounded-xl border border-edge/12 bg-surface-1 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-edge-strong/20 hover:shadow-2 active:cursor-grabbing"
      title="拖拽到舞台或时间轴使用"
    >
      {/* 预览区 */}
      <div className={`relative ${ratio} overflow-hidden bg-surface-2`}>
        {imgSrc ? (
          <div className="flex h-full w-full items-center justify-center overflow-hidden">
            <div className="relative flex h-full w-full items-center justify-center p-1.5">
              {isPng && isSprite && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-70"
                  style={{ backgroundImage: CHECKER, backgroundSize: '14px 14px', backgroundPosition: '0 0,0 7px,7px -7px,-7px 0', backgroundColor: '#e9e9e9' }}
                />
              )}
              <img
                src={imgSrc}
                alt={asset.name}
                draggable={false}
                onLoad={(e) => {
                  const el = e.currentTarget
                  if (el.naturalWidth && el.naturalHeight) setDims(`${el.naturalWidth}×${el.naturalHeight}`)
                }}
                className={`relative max-h-full max-w-full object-contain transition-transform duration-300 ease-out group-hover:scale-110 ${
                  isSprite ? '' : 'object-cover'
                }`}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-subtle">
            {isSprite ? <User size={26} strokeWidth={1.5} /> : <ImageIcon size={26} strokeWidth={1.5} />}
          </div>
        )}

        {/* 色点（编辑素材色） */}
        <label
          title="素材显示色"
          className="absolute left-1.5 top-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded hover:bg-black/15"
        >
          <span
            className="pointer-events-none h-2.5 w-2.5 rounded-full border border-edge/40 shadow-sm"
            style={{ backgroundColor: asset.color || hashAssetColor(asset.id) }}
          />
          <input
            type="color"
            value={asset.color || '#888888'}
            onChange={(e) => useAppStore.getState().updateAsset(asset.id, { color: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>

        {/* hover 操作 */}
        <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => p.onStartRename(asset)} className="rounded-md bg-black/45 p-1 text-white/90 backdrop-blur transition-colors hover:bg-black/65" title="重命名" aria-label="重命名">
            <Pencil size={12} strokeWidth={1.75} />
          </button>
          <button onClick={() => p.onShowRefs(asset)} className="rounded-md bg-black/45 p-1 text-white/90 backdrop-blur transition-colors hover:bg-info/70" title="查看引用" aria-label="查看引用">
            <Link2 size={12} strokeWidth={1.75} />
          </button>
          <button onClick={() => p.onRequestDelete(asset)} className="rounded-md bg-black/45 p-1 text-white/90 backdrop-blur transition-colors hover:bg-danger/70" title="删除" aria-label="删除">
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </div>

        {/* 底部信息条 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 pb-1.5 pt-5">
          {p.editingId === asset.id ? (
            <input
              type="text"
              value={p.editName}
              onChange={(e) => p.onEditName(e.target.value)}
              onBlur={p.onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') p.onCommitRename()
                if (e.key === 'Escape') p.onCancelEdit()
              }}
              autoFocus
              className="w-full rounded border border-signal bg-surface-3 px-1 py-0.5 text-[12px] text-fg outline-none"
            />
          ) : (
            <span className="block truncate text-[12px] font-medium text-white" title={asset.name}>
              {asset.name}
            </span>
          )}
        </div>
      </div>

      {/* 元数据条 */}
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] text-fg-faint">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono uppercase">{extOf(asset.fileName)}</span>
        <span className="truncate font-mono">{dims}</span>
        <span className="shrink-0 font-mono">{formatBytes(size)}</span>
      </div>
    </div>
  )
}

// ============================ 音频卡片 + 波形播放器 ============================

interface AudioCardProps {
  asset: AssetItem
  editingId: string | null
  editName: string
  onEditName: (v: string) => void
  onCommitRename: () => void
  onCancelEdit: () => void
  onStartRename: (a: AssetItem) => void
  onRequestDelete: (a: AssetItem) => void
  onShowRefs: (a: AssetItem) => void
  onContextMenu: (e: React.MouseEvent, a: AssetItem) => void
  onDragStart: (e: React.DragEvent, a: AssetItem) => void
  onDragEnd: () => void
}

function AudioCard(p: AudioCardProps) {
  const { asset } = p
  const src = resolveAssetSrc(asset)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(asset.duration || 0)
  const [volume, setVolume] = useState(0.8)
  const [wave, setWave] = useState<number[] | null>(null)
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    if (src) {
      computeWaveform(src).then((w) => alive && setWave(w))
      getByteSize(src).then((s) => alive && setSize(s))
    }
    return () => {
      alive = false
    }
  }, [src])

  // 播放时逐帧刷新进度 + 重绘波形进度
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const el = audioRef.current
      if (el) {
        setCurrent(el.currentTime)
        drawWave(el.currentTime / (el.duration || 1))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, wave])

  const drawWave = useCallback(
    (ratio: number) => {
      const cv = canvasRef.current
      if (!cv || !wave) return
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr
        cv.height = h * dpr
      }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, cv.width, cv.height)
      const n = wave.length
      const gap = 2
      const bw = (w - gap * (n - 1)) / n
      const played = Math.max(0, Math.min(1, ratio)) * n
      for (let i = 0; i < n; i++) {
        const x = i * (bw + gap)
        const bh = Math.max(2, wave[i] * h)
        const y = (h - bh) / 2
        ctx.fillStyle = i < played ? '#d98a2b' : 'rgba(120,120,120,0.4)'
        ctx.fillRect(x * dpr, y * dpr, Math.max(1, bw * dpr), bh * dpr)
      }
    },
    [wave],
  )

  useEffect(() => {
    drawWave(current / (duration || 1))
  }, [wave, drawWave, current, duration])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [])

  const seekFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const el = audioRef.current
      const cv = canvasRef.current
      if (!el || !cv || !el.duration) return
      const rect = cv.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      el.currentTime = Math.max(0, Math.min(1, ratio)) * el.duration
      setCurrent(el.currentTime)
    },
    [],
  )

  return (
    <div
      draggable
      onDragStart={(e) => p.onDragStart(e, asset)}
      onDragEnd={p.onDragEnd}
      onContextMenu={(e) => p.onContextMenu(e, asset)}
      className="group relative flex cursor-grab flex-col gap-2 rounded-xl border border-edge/12 bg-surface-1 p-2.5 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-edge-strong/20 hover:shadow-2 active:cursor-grabbing"
      title="拖拽到时间轴使用"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || asset.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
      />

      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            playing ? 'bg-signal text-white shadow-sm' : 'bg-surface-2 text-fg-muted hover:bg-signal/15 hover:text-signal'
          }`}
          aria-label={playing ? '暂停' : '试听'}
        >
          {playing ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} className="ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          {p.editingId === asset.id ? (
            <input
              type="text"
              value={p.editName}
              onChange={(e) => p.onEditName(e.target.value)}
              onBlur={p.onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') p.onCommitRename()
                if (e.key === 'Escape') p.onCancelEdit()
              }}
              autoFocus
              className="w-full rounded border border-signal bg-surface-3 px-1 py-0.5 text-[12px] text-fg outline-none"
            />
          ) : (
            <span className="block truncate text-[13px] font-medium text-fg" title={asset.name} onDoubleClick={() => p.onStartRename(asset)}>
              {asset.name}
            </span>
          )}
          <span className="block truncate text-[11px] text-fg-subtle">{asset.fileName}</span>
        </div>
      </div>

      {/* 波形 + 进度 */}
      <canvas
        ref={canvasRef}
        onClick={seekFromEvent}
        className="h-10 w-full cursor-pointer rounded-md bg-surface-2"
        title="点击波形跳转播放位置"
      />

      {/* 时间 + 音量 */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] text-fg-faint">{formatTime(current)}</span>
        <span className="font-mono text-[11px] text-fg-faint">{formatTime(duration)}</span>
        <div className="ml-auto flex items-center gap-1 text-fg-subtle">
          <Volume2 size={13} strokeWidth={1.75} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setVolume(v)
              if (audioRef.current) audioRef.current.volume = v
            }}
            className="h-1 w-16 cursor-pointer accent-signal"
            aria-label="音量"
          />
        </div>
      </div>

      {/* 元数据 + 操作 */}
      <div className="flex items-center justify-between border-t border-edge/8 pt-1.5 text-[11px] text-fg-faint">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono uppercase">{extOf(asset.fileName)}</span>
        <span className="font-mono">{formatBytes(size)}</span>
        <div className="flex gap-0.5">
          <button onClick={() => p.onShowRefs(asset)} className="rounded p-1 text-fg-subtle transition-colors hover:bg-info/12 hover:text-info" title="查看引用" aria-label="查看引用">
            <Link2 size={12} strokeWidth={1.75} />
          </button>
          <button onClick={() => p.onStartRename(asset)} className="rounded p-1 text-fg-subtle transition-colors hover:bg-surface-hover" title="重命名" aria-label="重命名">
            <Pencil size={12} strokeWidth={1.75} />
          </button>
          <button onClick={() => p.onRequestDelete(asset)} className="rounded p-1 text-fg-subtle transition-colors hover:bg-danger/12 hover:text-danger" title="删除" aria-label="删除">
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================ 列表视图 ============================

interface ListProps {
  list: AssetItem[]
  editingId: string | null
  editName: string
  onEditName: (v: string) => void
  onCommitRename: () => void
  onCancelEdit: () => void
  onStartRename: (a: AssetItem) => void
  onRequestDelete: (a: AssetItem) => void
  onShowRefs: (a: AssetItem) => void
  onContextMenu: (e: React.MouseEvent, a: AssetItem) => void
  onDragStart: (e: React.DragEvent, a: AssetItem) => void
  onDragEnd: () => void
}

function ListArea(props: ListProps) {
  return (
    <div className="flex flex-col gap-1">
      {props.list.map((a) =>
        a.type === 'audio' ? (
          <AudioRow key={a.id} asset={a} {...props} />
        ) : (
          <ImageRow key={a.id} asset={a} {...props} />
        ),
      )}
    </div>
  )
}

function ImageRow(p: ListProps & { asset: AssetItem }) {
  const { asset } = p
  const isSprite = asset.type === 'sprite'
  const isPng = asset.fileName.toLowerCase().endsWith('.png')
  const imgSrc = resolveAssetSrc(asset)
  const [size, setSize] = useState<number | null>(null)
  const [dims, setDims] = useState<string>(asset.width && asset.height ? `${asset.width}×${asset.height}` : '—')

  useEffect(() => {
    let alive = true
    if (imgSrc) getByteSize(imgSrc).then((s) => alive && setSize(s))
    return () => {
      alive = false
    }
  }, [imgSrc])

  return (
    <div
      draggable
      onDragStart={(e) => p.onDragStart(e, asset)}
      onDragEnd={p.onDragEnd}
      onContextMenu={(e) => p.onContextMenu(e, asset)}
      className="group flex items-center gap-3 rounded-lg border border-edge/10 bg-surface-1 px-2.5 py-2 shadow-1 transition-colors hover:border-edge-strong/20 hover:bg-surface-hover"
      title="拖拽到舞台或时间轴使用"
    >
      <div className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2 ${isPng && isSprite ? '' : ''}`} style={isPng && isSprite ? { backgroundImage: CHECKER, backgroundSize: '10px 10px', backgroundPosition: '0 0,0 5px,5px -5px,-5px 0', backgroundColor: '#e9e9e9' } : undefined}>
        {imgSrc ? (
          <img src={imgSrc} alt={asset.name} draggable={false} onLoad={(e) => { const el = e.currentTarget; if (el.naturalWidth && el.naturalHeight) setDims(`${el.naturalWidth}×${el.naturalHeight}`) }} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-subtle">{isSprite ? <User size={16} /> : <ImageIcon size={16} />}</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {p.editingId === asset.id ? (
          <input type="text" value={p.editName} onChange={(e) => p.onEditName(e.target.value)} onBlur={p.onCommitRename} onKeyDown={(e) => { if (e.key === 'Enter') p.onCommitRename(); if (e.key === 'Escape') p.onCancelEdit() }} autoFocus className="w-full rounded border border-signal bg-surface-3 px-1 py-0.5 text-[13px] text-fg outline-none" />
        ) : (
          <div className="truncate text-[13px] font-medium text-fg">{asset.name}</div>
        )}
        <div className="truncate text-[11px] text-fg-subtle">{asset.fileName}</div>
      </div>

      <span className="hidden shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] uppercase text-fg-faint sm:block">{extOf(asset.fileName)}</span>
      <span className="hidden w-20 shrink-0 text-right font-mono text-[11px] text-fg-faint md:block">{dims}</span>
      <span className="hidden w-16 shrink-0 text-right font-mono text-[11px] text-fg-faint lg:block">{formatBytes(size)}</span>
      <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] text-fg-faint xl:block">{formatDate(asset.importedAt)}</span>

      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton size="xs" variant="ghost" icon={<Link2 size={13} strokeWidth={1.75} />} aria-label="查看引用" title="查看引用" onClick={() => p.onShowRefs(asset)} />
        <IconButton size="xs" variant="ghost" icon={<Pencil size={13} strokeWidth={1.75} />} aria-label="重命名" title="重命名" onClick={() => p.onStartRename(asset)} />
        <IconButton size="xs" variant="danger" icon={<Trash2 size={13} strokeWidth={1.75} />} aria-label="删除" title="删除" onClick={() => p.onRequestDelete(asset)} />
      </div>
    </div>
  )
}

function AudioRow(p: ListProps & { asset: AssetItem }) {
  const { asset } = p
  const src = resolveAssetSrc(asset)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(asset.duration || 0)
  const [volume, setVolume] = useState(0.8)
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    if (src) getByteSize(src).then((s) => alive && setSize(s))
    return () => {
      alive = false
    }
  }, [src])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const el = audioRef.current
      if (el) setCurrent(el.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }, [])

  return (
    <div
      draggable
      onDragStart={(e) => p.onDragStart(e, asset)}
      onDragEnd={p.onDragEnd}
      onContextMenu={(e) => p.onContextMenu(e, asset)}
      className="group flex items-center gap-3 rounded-lg border border-edge/10 bg-surface-1 px-2.5 py-2 shadow-1 transition-colors hover:border-edge-strong/20 hover:bg-surface-hover"
      title="拖拽到时间轴使用"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || asset.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
      />
      <button
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          playing ? 'bg-signal text-white' : 'bg-surface-2 text-fg-muted hover:bg-signal/15 hover:text-signal'
        }`}
        aria-label={playing ? '暂停' : '试听'}
      >
        {playing ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} className="ml-0.5" />}
      </button>

      <div className="min-w-0 flex-1">
        {p.editingId === asset.id ? (
          <input type="text" value={p.editName} onChange={(e) => p.onEditName(e.target.value)} onBlur={p.onCommitRename} onKeyDown={(e) => { if (e.key === 'Enter') p.onCommitRename(); if (e.key === 'Escape') p.onCancelEdit() }} autoFocus className="w-full rounded border border-signal bg-surface-3 px-1 py-0.5 text-[13px] text-fg outline-none" />
        ) : (
          <div className="truncate text-[13px] font-medium text-fg">{asset.name}</div>
        )}
        <div className="truncate text-[11px] text-fg-subtle">{asset.fileName}</div>
      </div>

      <span className="hidden w-20 shrink-0 text-right font-mono text-[11px] text-fg-faint sm:block">{formatTime(current)} / {formatTime(duration)}</span>
      <span className="hidden w-16 shrink-0 text-right font-mono text-[11px] text-fg-faint lg:block">{formatBytes(size)}</span>
      <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] text-fg-faint xl:block">{formatDate(asset.importedAt)}</span>

      <div className="hidden items-center gap-1 text-fg-subtle md:flex">
        <Volume2 size={13} strokeWidth={1.75} />
        <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v }} className="h-1 w-14 cursor-pointer accent-signal" aria-label="音量" />
      </div>

      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton size="xs" variant="ghost" icon={<Link2 size={13} strokeWidth={1.75} />} aria-label="查看引用" title="查看引用" onClick={() => p.onShowRefs(asset)} />
        <IconButton size="xs" variant="ghost" icon={<Pencil size={13} strokeWidth={1.75} />} aria-label="重命名" title="重命名" onClick={() => p.onStartRename(asset)} />
        <IconButton size="xs" variant="danger" icon={<Trash2 size={13} strokeWidth={1.75} />} aria-label="删除" title="删除" onClick={() => p.onRequestDelete(asset)} />
      </div>
    </div>
  )
}

// ============================ 空态 / 暂未开放 ============================

function EmptyPanel({ search, onImport }: { search: string; onImport: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-fg-subtle">
        <ImageIcon size={26} strokeWidth={1.5} />
      </div>
      <div className="text-[13px] text-fg-muted">{search ? '没有匹配的素材' : '该分类下暂无素材'}</div>
      {!search && (
        <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={onImport}>
          导入素材
        </Button>
      )}
    </div>
  )
}

function UnsupportedPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-fg-subtle">
        <Film size={26} strokeWidth={1.5} />
      </div>
      <div className="text-[14px] font-medium text-fg-muted">{label} 类型暂未开放导入</div>
      <div className="max-w-xs text-[12px] leading-relaxed text-fg-faint">
        当前版本素材管线聚焦于背景、立绘与音频三类。视频与特效预设的导入链路将在后续版本接入，左侧分类树已为其预留位置。
      </div>
    </div>
  )
}
