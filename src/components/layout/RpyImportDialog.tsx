/**
 * Ren'Py 工程导入对话框
 * 选择 .rpy 文件所在目录，解析后导入为 ScriptWeaver 项目。
 */

import { useState } from 'react'
import { FolderOpen, Loader2, X, AlertTriangle, CheckCircle2, ChevronLeft, FileDown, Info, BookOpen, FileText, Users, Code, Image } from 'lucide-react'
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
      <div className="flex h-full min-w-0 flex-1 flex-col bg-canvas">
        {/* ═══ Header ═══ */}
        <div className="shrink-0 border-b border-edge/10 px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="signal-dot" />
                <span className="eyebrow">Import</span>
                <button
                  onClick={wrappedClose}
                  className="inline-flex items-center gap-1 rounded-xl border border-edge/10 px-2 py-0.5 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
                >
                  <ChevronLeft size={12} />
                  返回
                </button>
              </div>
              <h2 className="t-h2 mt-1.5">导入 Ren'Py 工程</h2>
              <p className="mt-0.5 t-subtitle">选择 .rpy 文件所在目录，自动解析角色、脚本与素材引用</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/[0.06] text-primary">
              <FileDown size={18} strokeWidth={1.75} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col xl:flex-row gap-5">
            {/* ═══ Left: Form + Error ═══ */}
            <div className={`${preview ? 'xl:flex-1' : 'flex-1'} space-y-5`}>
              <div className="rounded-2xl border border-edge/10 bg-surface p-5 shadow-1">
                <div className="mb-3 text-[12px] font-medium text-fg-muted">Ren'Py 工程目录</div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <input
                      className="w-full rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[13px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                      value={dirPath}
                      onChange={(e) => { setDirPath(e.target.value); setPreview(null); setError('') }}
                      placeholder="选择包含 .rpy 文件的目录..."
                    />
                  </div>
                  <button onClick={handleBrowse} className="btn-ghost-sm shrink-0">
                    <FolderOpen size={15} className="mr-1 inline" />浏览
                  </button>
                </div>
                <div className="mt-3">
                  <button
                    onClick={handlePreview}
                    disabled={loading || !dirPath.trim()}
                    className="btn-primary-sm"
                  >
                    {loading ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : null}
                    预览解析结果
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.04] p-3 text-[12px] text-danger">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* ═══ No Preview: Tips sidebar ═══ */}
              {!preview && !loading && (
                <div className="rounded-2xl border border-edge/10 bg-surface p-5 shadow-1">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/[0.06]">
                      <Info size={13} strokeWidth={1.75} className="text-primary" />
                    </div>
                    <span className="text-[12px] font-semibold text-fg">使用须知</span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { icon: FileText, text: '选择包含 .rpy 脚本文件的 Ren\'Py 项目根目录' },
                      { icon: Users, text: '自动识别 define 角色定义，导入为可管理角色' },
                      { icon: Code, text: '标签(label)映射为剧本块（Block），菜单(menu)映射为选择支' },
                      { icon: Image, text: '引用的素材路径记录在案，导入后可手动绑定' },
                    ].map(({ icon: Icon, text }, i) => (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-fg-subtle">
                        <Icon size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-fg-muted" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ═══ Right: Preview stats ═══ */}
            {preview && (
              <div className="xl:flex-1 space-y-5 animate-slide-up">
                <div className="rounded-2xl border border-edge/10 bg-surface p-5 shadow-1">
                  <div className="mb-4 flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-signal" />
                    <span className="text-[13px] font-semibold text-fg">解析结果</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-surface-2 p-4 shadow-1 transition-all hover:-translate-y-0.5">
                      <div className="text-[26px] font-semibold text-signal tabular-nums">{preview.deltas.length}</div>
                      <div className="text-[11px] text-fg-muted mt-0.5">剧本行</div>
                    </div>
                    <div className="rounded-xl bg-surface-2 p-4 shadow-1 transition-all hover:-translate-y-0.5">
                      <div className="text-[26px] font-semibold text-fg tabular-nums">{preview.characters.length}</div>
                      <div className="text-[11px] text-fg-muted mt-0.5">角色</div>
                    </div>
                    <div className="rounded-xl bg-surface-2 p-4 shadow-1 transition-all hover:-translate-y-0.5">
                      <div className="text-[26px] font-semibold text-fg tabular-nums">{preview.variables.length}</div>
                      <div className="text-[11px] text-fg-muted mt-0.5">变量</div>
                    </div>
                  </div>
                  {preview.characters.length > 0 && (
                    <div className="mt-4 border-t border-edge/10 pt-3">
                      <div className="text-[11px] font-medium text-fg-muted mb-2">识别到的角色</div>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.characters.slice(0, 20).map((c, i) => (
                          <span key={i} className="rounded-full border border-edge/10 bg-surface-2 px-2.5 py-1 text-[11px] text-fg-subtle">
                            {c.displayName || c.charId}
                          </span>
                        ))}
                        {preview.characters.length > 20 && (
                          <span className="rounded-full border border-edge/10 bg-surface-2 px-2 py-1 text-[11px] text-fg-muted">
                            +{preview.characters.length - 20} 人
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {preview.variables.length > 0 && (
                    <div className="mt-3 border-t border-edge/10 pt-3">
                      <div className="text-[11px] font-medium text-fg-muted mb-2">识别到的变量</div>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.variables.slice(0, 20).map((v, i) => (
                          <code key={i} className="rounded-md border border-edge/10 bg-surface-2 px-2 py-0.5 text-[11px] text-primary font-mono">
                            {v.name}{v.value ? ` = ${v.value}` : ''}
                          </code>
                        ))}
                        {preview.variables.length > 20 && (
                          <span className="text-[11px] text-fg-muted">+{preview.variables.length - 20} 个</span>
                        )}
                      </div>
                    </div>
                  )}
                  {preview.warnings.length > 0 && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/[0.04] p-3 text-[11px] text-fg-muted">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" />
                      <span>{preview.warnings.length} 条警告（未识别行可能未被导入）</span>
                    </div>
                  )}
                </div>

                {/* ═══ Quick actions ═══ */}
                {preview.deltas.length > 0 && (
                  <div className="rounded-2xl border border-edge/10 bg-surface p-5 shadow-1">
                    <div className="text-[12px] font-medium text-fg-muted mb-3">导入后生成</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-surface-2 p-3 text-center">
                        <div className="text-[11px] text-fg-muted">Script 脚本行</div>
                        <div className="text-[18px] font-semibold text-fg tabular-nums">{preview.deltas.length}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 p-3 text-center">
                        <div className="text-[11px] text-fg-muted">Scenes 场景</div>
                        <div className="text-[18px] font-semibold text-fg tabular-nums">
                          {new Set(preview.deltas.map(d => (d as any).label).filter(Boolean)).size || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge/10 bg-surface px-5 py-3">
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
      <div className="mx-4 w-full max-w-2xl rounded-2xl border border-edge/10 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge/10 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="signal-dot" />
              <span className="eyebrow">Import</span>
            </div>
            <h2 className="t-h2 mt-1">导入 Ren'Py 工程</h2>
          </div>
          <button onClick={wrappedClose} className="rounded-xl p-1 text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[12px] font-medium text-fg-muted block mb-1.5">Ren'Py 工程目录</label>
              <input
                className="w-full rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[13px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                value={dirPath}
                onChange={(e) => { setDirPath(e.target.value); setPreview(null); setError('') }}
                placeholder="选择包含 .rpy 文件的目录..."
              />
            </div>
            <button onClick={handleBrowse} className="btn-ghost-sm shrink-0">
              <FolderOpen size={15} className="mr-1 inline" />浏览
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
            <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.04] p-3 text-[12px] text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {preview && (
            <div className="rounded-2xl border border-edge/10 bg-surface p-4 shadow-1 animate-slide-up">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-signal" />
                <span className="text-[13px] font-semibold text-fg">解析结果</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-surface-2 p-3 shadow-1">
                  <div className="text-[22px] font-semibold text-signal tabular-nums">{preview.deltas.length}</div>
                  <div className="text-[11px] text-fg-muted">剧本行</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-3 shadow-1">
                  <div className="text-[22px] font-semibold text-fg tabular-nums">{preview.characters.length}</div>
                  <div className="text-[11px] text-fg-muted">角色</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-3 shadow-1">
                  <div className="text-[22px] font-semibold text-fg tabular-nums">{preview.variables.length}</div>
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
        <div className="flex items-center justify-end gap-2 border-t border-edge/10 px-5 py-4">
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
