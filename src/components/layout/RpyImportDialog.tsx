/**
 * Ren'Py 工程导入对话框
 * 选择 .rpy 文件所在目录，解析后导入为 ScriptWeaver 项目。
 */

import { useState } from 'react'
import { FolderOpen, Loader2, X, AlertTriangle, CheckCircle2, ChevronLeft } from 'lucide-react'
import { importRpyDirectory, type RpyImportResult } from '@/utils/rpyImporter'
import { useAppStore } from '@/stores/appStore'

interface Props {
  onImport?: (result: RpyImportResult) => void
  onClose?: () => void
  embedded?: boolean
}

export default function RpyImportDialog({ onImport, onClose, embedded }: Props) {
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  const wrappedClose = () => {
    if (onClose) onClose()
    if (embedded) setActiveNavItem('chapters')
  }

  const wrappedImport = (result: RpyImportResult) => {
    if (onImport) onImport(result)
    if (embedded) setActiveNavItem('chapters')
  }
  const [dirPath, setDirPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<RpyImportResult | null>(null)

  const handleBrowse = async () => {
    try {
      const result = await window.electronAPI?.selectDirectory()
      if (result && result.path) {
        setDirPath(result.path)
        setError('')
        setPreview(null)
      }
    } catch {
      // 用户取消或 API 不可用
    }
  }

  const handlePreview = async () => {
    if (!dirPath.trim()) { setError("请先选择 Ren'Py 工程目录"); return }
    setLoading(true)
    setError('')
    try {
      const result = await importRpyDirectory(dirPath.trim())
      setPreview(result)
      if (result.deltas.length === 0) {
        setError('未在目录中找到可解析的 .rpy 文件')
      }
    } catch (e: any) {
      setError(e?.message ?? '导入失败')
    } finally {
      setLoading(false)
    }
  }

  // Page mode: full-screen layout with header
  if (embedded) {
    return (
      <div className="flex h-full flex-col bg-canvas">
        <header className="flex shrink-0 items-center gap-3 border-b border-edge/10 bg-surface px-6 py-3">
          <button
            onClick={wrappedClose}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft size={15} />
            返回
          </button>
          <h1 className="text-[15px] font-semibold">导入 Ren'Py 工程</h1>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="label mb-1">Ren'Py 工程目录</label>
                <input
                  className="input w-full text-[13px]"
                  value={dirPath}
                  onChange={(e) => { setDirPath(e.target.value); setPreview(null); setError('') }}
                  placeholder="选择包含 .rpy 文件的目录..."
                />
              </div>
              <button onClick={handleBrowse} className="btn-ghost-sm">
                <FolderOpen size={16} className="mr-1 inline" />浏览
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePreview}
                disabled={loading || !dirPath.trim()}
                className="btn-primary-sm"
              >
                {loading ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : null}
                预览解析结果
              </button>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {preview && (
              <div className="rounded-xl border border-edge/10 bg-surface p-4 shadow-1">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-signal" />
                  <span className="text-[13px] font-semibold">解析结果</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-surface-2 p-3 shadow-1">
                    <div className="text-[18px] font-semibold text-signal">{preview.deltas.length}</div>
                    <div className="text-[11px] text-fg-muted">剧本行</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3 shadow-1">
                    <div className="text-[18px] font-semibold">{preview.characters.length}</div>
                    <div className="text-[11px] text-fg-muted">角色</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3 shadow-1">
                    <div className="text-[18px] font-semibold">{preview.variables.length}</div>
                    <div className="text-[11px] text-fg-muted">变量</div>
                  </div>
                </div>
                {preview.warnings.length > 0 && (
                  <div className="mt-3 text-[11px] text-fg-muted">
                    <AlertTriangle size={12} className="mr-1 inline text-warning" />
                    {preview.warnings.length} 条警告（未识别行可能未被导入）
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge/10 bg-surface px-6 py-3">
          <button onClick={wrappedClose} className="btn-ghost-sm">取消</button>
          <button
            onClick={() => preview && wrappedImport(preview)}
            disabled={!preview || preview.deltas.length === 0}
            className="btn-primary-sm"
          >
            导入到当前工程
          </button>
        </footer>
      </div>
    )
  }

  // Dialog mode: centered modal (backward compat)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">导入 Ren'Py 工程</h2>
          <button onClick={wrappedClose} className="rounded p-1 text-fg-muted hover:bg-surface-2 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label mb-1">Ren'Py 工程目录</label>
              <input
                className="input w-full text-[13px]"
                value={dirPath}
                onChange={(e) => { setDirPath(e.target.value); setPreview(null); setError('') }}
                placeholder="选择包含 .rpy 文件的目录..."
              />
            </div>
            <button onClick={handleBrowse} className="btn-ghost-sm text-fg-muted">
              <FolderOpen size={16} className="mr-1 inline" />浏览
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePreview}
              disabled={loading || !dirPath.trim()}
              className="btn-primary-sm bg-signal text-white disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : null}
              预览解析结果
            </button>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {preview && (
            <div className="rounded-lg border border-line bg-surface-2/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-signal" />
                <span className="text-[13px] font-semibold">解析结果</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded bg-surface-2 p-2">
                  <div className="text-[18px] font-semibold text-signal">{preview.deltas.length}</div>
                  <div className="text-[11px] text-fg-muted">剧本行</div>
                </div>
                <div className="rounded bg-surface-2 p-2">
                  <div className="text-[18px] font-semibold">{preview.characters.length}</div>
                  <div className="text-[11px] text-fg-muted">角色</div>
                </div>
                <div className="rounded bg-surface-2 p-2">
                  <div className="text-[18px] font-semibold">{preview.variables.length}</div>
                  <div className="text-[11px] text-fg-muted">变量</div>
                </div>
              </div>
              {preview.warnings.length > 0 && (
                <div className="mt-3 text-[11px] text-fg-muted">
                  <AlertTriangle size={12} className="mr-1 inline text-warning" />
                  {preview.warnings.length} 条警告（未识别行可能未被导入）
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={wrappedClose} className="btn-ghost-sm">取消</button>
          <button
            onClick={() => preview && wrappedImport(preview)}
            disabled={!preview || preview.deltas.length === 0}
            className="btn-primary-sm"
          >
            导入到当前工程
          </button>
        </div>
      </div>
    </div>
  )
}
