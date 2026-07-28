/**
 * Ren'Py 工程导入对话框
 * 选择 .rpy 文件所在目录，解析后导入为 ScriptWeaver 项目。
 */

import { useState } from 'react'
import { FolderOpen, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { importRpyDirectory, type RpyImportResult } from '@/utils/rpyImporter'

interface Props {
  onImport: (result: RpyImportResult) => void
  onClose: () => void
}

export default function RpyImportDialog({ onImport, onClose }: Props) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-line bg-surface shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">导入 Ren'Py 工程</h2>
          <button onClick={onClose} className="rounded p-1 text-fg-muted hover:bg-surface-2 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* 目录选择 */}
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

          {/* 操作按钮 */}
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

          {/* 错误 */}
          {error && (
            <div className="flex items-start gap-2 rounded border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 预览面板 */}
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

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="btn-ghost-sm text-fg-muted">取消</button>
          <button
            onClick={() => preview && onImport(preview)}
            disabled={!preview || preview.deltas.length === 0}
            className="btn-primary-sm bg-signal text-white disabled:opacity-50"
          >
            导入到当前工程
          </button>
        </div>
      </div>
    </div>
  )
}
