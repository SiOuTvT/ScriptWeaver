import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { exportScript, downloadExport, type ExportOptions } from '../../utils/multiExporter'
import { FileDown, FileText, FileCode, Users, Check, Copy, Download } from 'lucide-react'

type ExportFormat = 'markdown' | 'txt' | 'html' | 'csv'

interface FormatOption {
  id: ExportFormat
  label: string
  desc: string
  icon: typeof FileText
  ext: string
}

const FORMATS: FormatOption[] = [
  { id: 'markdown', label: 'Markdown', desc: '可读性最高的文档格式，适合发布或分享', icon: FileText, ext: '.md' },
  { id: 'txt', label: '纯文本', desc: '纯文本台词输出，适合朗读或简单存档', icon: FileText, ext: '.txt' },
  { id: 'html', label: 'HTML 打印', desc: '带排版的网页文档，适合打印或预览', icon: FileCode, ext: '.html' },
  { id: 'csv', label: 'CV 台词表', desc: '按角色分组的台词统计表，含字数句数统计', icon: Users, ext: '.csv' },
]

export default function MultiExporter() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const characterConfigs = useAppStore((s) => s.characterConfigs)

  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [filterChar, setFilterChar] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const characters = useMemo(() => {
    const set = new Set<string>()
    draftDeltas.forEach((d) => {
      if (d.speaker) set.add(d.speaker)
    })
    return Array.from(set)
  }, [draftDeltas])

  const stats = useMemo(() => {
    const dialogueLines = draftDeltas.filter((d) => d.dialogue).length
    const choiceLines = draftDeltas.filter((d) => d.line_type === 'choice').length
    const totalChars = draftDeltas.reduce((sum, d) => sum + (d.dialogue?.length ?? 0), 0)
    return { dialogueLines, choiceLines, totalChars, totalLines: draftDeltas.length }
  }, [draftDeltas])

  const exportOpts: ExportOptions = useMemo(() => ({
    format,
    characterFilter: filterChar || undefined,
  }), [format, filterChar])

  const preview = useMemo(() => {
    return exportScript(draftDeltas, characterConfigs, exportOpts)
  }, [draftDeltas, characterConfigs, exportOpts])

  const previewLines = useMemo(() => {
    return preview.split('\n').slice(0, 80)
  }, [preview])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(preview)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [preview])

  const handleDownload = useCallback(() => {
    const opt = FORMATS.find((f) => f.id === format)
    const filename = `export${opt?.ext ?? '.txt'}`
    const mime = format === 'html' ? 'text/html' : 'text/plain'
    downloadExport(preview, filename, mime)
  }, [preview, format])

  return (
    <div className="flex h-full flex-1 min-w-0 flex-col select-none">
      {/* Header */}
      <div className="shrink-0 border-b border-edge/10 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-semibold text-fg">多格式导出</h1>
            <p className="mt-0.5 text-[12px] text-fg-muted">将剧本导出为 Markdown / 纯文本 / HTML / CV 台词表</p>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-fg-muted">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{stats.totalLines} 行</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{stats.totalChars} 字</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{stats.dialogueLines} 对白</span>
          </div>
        </div>
      </div>

      {/* Main: 2-column layout on wide screens */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_2fr]">
          
          {/* Left Panel: Format + Options */}
          <div className="border-r border-edge/10 overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* Format Select */}
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-3">导出格式</h3>
                <div className="space-y-2">
                  {FORMATS.map((opt) => {
                    const Icon = opt.icon
                    const active = format === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setFormat(opt.id)}
                        className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                          active
                            ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10'
                            : 'border-edge/10 bg-surface hover:border-primary/15 hover:bg-surface-hover/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-md ${active ? 'bg-primary/15' : 'bg-surface-2'}`}>
                            <Icon size={14} className={active ? 'text-primary' : 'text-fg-muted'} />
                          </span>
                          <div>
                            <div className="text-[13px] font-medium text-fg">{opt.label}</div>
                            <div className="text-[12px] text-fg-muted mt-0.5">{opt.desc}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Character Filter */}
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-3">角色过滤</h3>
                <select
                  value={filterChar}
                  onChange={(e) => setFilterChar(e.target.value)}
                  className="w-full rounded-lg border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">全部角色</option>
                  {characters.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="mt-1.5 text-[11px] text-fg-faint">仅导出指定角色的台词</p>
              </section>

              {/* Stats */}
              <section>
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-3">剧本统计</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '总行数', value: stats.totalLines },
                    { label: '总字数', value: stats.totalChars },
                    { label: '对白行', value: stats.dialogueLines },
                    { label: '选择支', value: stats.choiceLines },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-edge/10 bg-surface-2/60 px-3 py-2.5">
                      <div className="text-[11px] text-fg-faint">{s.label}</div>
                      <div className="text-[18px] font-semibold text-fg mt-0.5">{s.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-edge/10 bg-surface-2/40">
              <div className="flex items-center gap-2 text-[12px] text-fg-muted">
                <FileText size={13} />
                <span>预览 {previewLines.length} 行</span>
                {filterChar && <span className="text-primary">· {filterChar}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy} className="inline-flex items-center gap-1.5 rounded-lg border border-edge/10 bg-surface px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg hover:border-primary/20 transition-colors">
                  {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  {copied ? '已复制' : '复制'}
                </button>
                <button onClick={handleDownload} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 hover:bg-primary/15 px-3 py-1.5 text-[12px] text-primary transition-colors">
                  <Download size={13} />
                  下载
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <pre className="p-5 text-[13px] leading-relaxed font-mono whitespace-pre-wrap text-fg/90">
                {previewLines.join('\n')}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
