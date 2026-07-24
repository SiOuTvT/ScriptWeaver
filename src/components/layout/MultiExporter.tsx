/**
 * 多格式导出面板（Multi-Format Exporter）—— v0.9.0
 *
 * 支持：Markdown / TXT / HTML(打印) / CV 台词表(CSV)
 * 含角色筛选、字数统计、舞台指令开关。
 */

import { useState, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { exportScript, downloadExport, computeCharacterStats, type ExportFormat } from '@/utils/multiExporter'
import { FileText, Download, Users, Eye, EyeOff, AlignLeft, Hash, Table } from 'lucide-react'

const FORMATS: { id: ExportFormat; label: string; ext: string; mime: string; desc: string }[] = [
  { id: 'markdown', label: 'Markdown', ext: '.md', mime: 'text/markdown;charset=utf-8', desc: '通用标记语言，适合 GitHub / 文档平台' },
  { id: 'txt', label: '纯文本', ext: '.txt', mime: 'text/plain;charset=utf-8', desc: '纯文本对话剧本，无格式' },
  { id: 'html', label: 'HTML（打印版)', ext: '.html', mime: 'text/html;charset=utf-8', desc: '浏览器打开可另存为 PDF，含角色配色' },
  { id: 'csv', label: 'CV 台词表', ext: '.csv', mime: 'text/csv;charset=utf-8', desc: '配音演员专用，按角色筛选台词' },
]

export default function MultiExporter() {
  const deltas = useAppStore((s) => s.draftDeltas)
  const characters = useAppStore((s) => s.characterConfigs)

  const [format, setFormat] = useState<ExportFormat>('csv')
  const [characterFilter, setCharacterFilter] = useState('')
  const [includeDirections, setIncludeDirections] = useState(false)
  const [includeLineNumbers, setIncludeLineNumbers] = useState(false)
  const [title, setTitle] = useState('我的剧本')
  const [preview, setPreview] = useState('')

  const stats = useMemo(() => computeCharacterStats(deltas, characters), [deltas, characters])

  const handlePreview = () => {
    const content = exportScript(deltas, characters, {
      format,
      characterFilter: characterFilter || undefined,
      includeDirections,
      includeLineNumbers,
      title: title || undefined,
    })
    setPreview(content)
  }

  const handleDownload = () => {
    const fmt = FORMATS.find((f) => f.id === format)!
    const content = exportScript(deltas, characters, {
      format,
      characterFilter: characterFilter || undefined,
      includeDirections,
      includeLineNumbers,
      title: title || undefined,
    })
    const filename = `${title || '剧本导出'}${fmt.ext}`
    downloadExport(content, filename, fmt.mime)
  }

  const isCsvMode = format === 'csv'

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* 头部 */}
      <div className="shrink-0 border-b border-edge/10 px-6 py-5">
        <h2 className="text-[16px] font-semibold text-fg">多格式导出</h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          将剧本导出为 Markdown / TXT / HTML 或 CV 配音台词表
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* 导出格式选择 */}
          <section>
            <h3 className="text-[13px] font-medium text-fg mb-3 flex items-center gap-2">
              <FileText size={14} /> 导出格式
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setFormat(f.id); setPreview('') }}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    format === f.id
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-edge/10 bg-surface hover:bg-surface-hover'
                  }`}
                >
                  {f.id === 'csv' ? <Table size={16} className="mt-0.5 shrink-0 text-fg-muted" /> :
                   f.id === 'html' ? <Eye size={16} className="mt-0.5 shrink-0 text-fg-muted" /> :
                   <AlignLeft size={16} className="mt-0.5 shrink-0 text-fg-muted" />}
                  <div>
                    <div className="text-[14px] font-medium text-fg">{f.label}</div>
                    <div className="text-[12px] text-fg-faint mt-0.5">{f.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* CV 模式：角色筛选与统计 */}
          {isCsvMode && (
            <section>
              <h3 className="text-[13px] font-medium text-fg mb-3 flex items-center gap-2">
                <Users size={14} /> 角色台词统计
              </h3>
              <div className="rounded-lg border border-edge/10 bg-surface overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-edge/10 text-[12px] text-fg-muted">
                      <th className="px-4 py-2 font-medium">角色</th>
                      <th className="px-4 py-2 font-medium tabular-nums">句数</th>
                      <th className="px-4 py-2 font-medium tabular-nums">字数</th>
                      <th className="px-4 py-2 font-medium">筛选</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.charId} className={`border-b border-edge/5 text-[13px] ${
                        characterFilter === s.displayName ? 'bg-primary/5' : ''
                      }`}>
                        <td className="px-4 py-2.5 text-fg">{s.displayName}</td>
                        <td className="px-4 py-2.5 text-fg tabular-nums">{s.totalLines}</td>
                        <td className="px-4 py-2.5 text-fg tabular-nums">{s.totalChars}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setCharacterFilter(characterFilter === s.displayName ? '' : s.displayName)}
                            className={`text-[12px] px-2 py-0.5 rounded transition-colors ${
                              characterFilter === s.displayName
                                ? 'bg-primary/15 text-fg'
                                : 'text-fg-muted hover:text-fg hover:bg-surface-hover'
                            }`}
                          >
                            {characterFilter === s.displayName ? '已选' : '选择'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {stats.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-[13px] text-fg-faint">
                          暂无角色台词数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {characterFilter && (
                <p className="mt-2 text-[12px] text-fg-muted">
                  当前仅导出「{characterFilter}」的台词，共 {stats.find((s) => s.displayName === characterFilter)?.totalLines || 0} 句
                </p>
              )}
            </section>
          )}

          {/* 通用选项 */}
          {!isCsvMode && (
            <section>
              <h3 className="text-[13px] font-medium text-fg mb-3 flex items-center gap-2">
                <Hash size={14} /> 导出选项
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[14px] text-fg-muted">
                  <span className="w-20 shrink-0 text-[13px]">剧本标题</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="flex-1 rounded-lg border border-edge/10 bg-surface px-3 py-1.5 text-[14px] text-fg outline-none focus:border-primary/30"
                    placeholder="我的剧本"
                  />
                </div>
                <label className="flex items-center gap-3 text-[14px] text-fg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDirections}
                    onChange={(e) => setIncludeDirections(e.target.checked)}
                    className="accent-primary"
                  />
                  <span className="flex items-center gap-1.5">
                    {includeDirections ? <Eye size={14} /> : <EyeOff size={14} />}
                    包含舞台指令（背景切换、角色位置等）
                  </span>
                </label>
                <label className="flex items-center gap-3 text-[14px] text-fg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLineNumbers}
                    onChange={(e) => setIncludeLineNumbers(e.target.checked)}
                    className="accent-primary"
                  />
                  包含行号
                </label>
              </div>
            </section>
          )}

          {/* 预览 */}
          {preview && (
            <section>
              <h3 className="text-[13px] font-medium text-fg mb-3">预览</h3>
              <div className="rounded-lg border border-edge/10 bg-surface p-4 max-h-[300px] overflow-y-auto">
                <pre className="text-[13px] text-fg whitespace-pre-wrap font-sans leading-relaxed">
                  {preview}
                </pre>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="shrink-0 border-t border-edge/10 px-6 py-4 flex items-center gap-3">
        <button
          onClick={handlePreview}
          className="flex items-center gap-2 rounded-lg border border-edge/10 bg-surface px-4 py-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Eye size={14} />
          预览
        </button>
        <button
          onClick={handleDownload}
          disabled={deltas.length === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-[13px] text-white font-medium transition-colors hover:bg-primary/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          下载 {FORMATS.find((f) => f.id === format)!.label}
        </button>
        <span className="ml-auto text-[12px] text-fg-faint">
          {deltas.length} 行 {isCsvMode && characterFilter ? `· 仅「${characterFilter}」` : ''}
        </span>
      </div>
    </div>
  )
}
