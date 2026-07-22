import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookOpen, Search, Edit3, Eye, Save, X, Bold, Italic,
  Heading1, Heading2, Heading3, List, ListOrdered, Link, Code,
  MessageSquareQuote, Table2, Image, FileText, ChevronRight, Undo2,
  Hash, Minus, Type
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── 文档索引 ───────────────────────────────────────────────────
interface DocEntry {
  id: string
  title: string
  icon: string
}

const DOCS: DocEntry[] = [
  { id: 'index', title: 'ScriptWeaver 帮助中心', icon: 'BookOpen' },
  { id: 'getting-started', title: '快速入门', icon: 'FileText' },
  { id: 'stage-preview', title: '舞台预览', icon: 'Eye' },
  { id: 'timeline', title: '时间轴与节点图谱', icon: 'Hash' },
  { id: 'script-overview', title: '剧本总览', icon: 'FileText' },
  { id: 'asset-manager', title: '素材管理', icon: 'Image' },
  { id: 'character-manager', title: '角色管理', icon: 'Type' },
  { id: 'ai-copilot', title: 'AI 编剧 Copilot', icon: 'BookOpen' },
  { id: 'tts-synthesis', title: 'TTS 语音合成', icon: 'BookOpen' },
  { id: 'effects-lab', title: '特效大本营', icon: 'BookOpen' },
  { id: 'export', title: '导出设置', icon: 'FileText' },
  { id: 'shortcuts', title: '快捷键速查', icon: 'Hash' },
  { id: 'faq', title: '常见问题 FAQ', icon: 'MessageSquareQuote' },
]

const iconMap: Record<string, LucideIcon> = {
  BookOpen, FileText, Eye, Hash, Image, Type, MessageSquareQuote,
}

function DocIcon({ name }: { name: string }) {
  const Icon = iconMap[name] || FileText
  return <Icon size={15} strokeWidth={1.75} />
}

// ─── 加载打包文档 ──────────────────────────────────────────────────
const bundledDocs = import.meta.glob('../../help/*.md', { query: '?raw', import: 'default' })

function getDocKey(docId: string): string {
  return `../../help/${docId}.md`
}

async function loadBundledContent(docId: string): Promise<string | undefined> {
  const loader = bundledDocs[getDocKey(docId)]
  if (!loader) return undefined
  const raw = await loader()
  return raw as string
}

// ─── localStorage 辅助 ────────────────────────────────────────────
const STORAGE_PREFIX = 'sw-help-edit-'

function getSavedContent(docId: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + docId)
  } catch {
    return null
  }
}

function saveContent(docId: string, content: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + docId, content)
  } catch {
    // localStorage 满或不可用
  }
}

function deleteSavedContent(docId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + docId)
  } catch {
    // ignore
  }
}

// ─── TOC 提取 ─────────────────────────────────────────────────────
interface TocItem {
  level: number
  text: string
  id: string
}

function extractToc(markdown: string): TocItem[] {
  const headingRe = /^(#{1,6})\s+(.+)$/gm
  const items: TocItem[] = []
  let match: RegExpExecArray | null
  while ((match = headingRe.exec(markdown)) !== null) {
    const level = match[1].length
    const text = match[2].trim()
    const id = text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    items.push({ level, text, id })
  }
  return items
}

// ─── WYSIWYG 编辑器工具栏操作 ─────────────────────────────────────
type ToolAction = {
  label: string
  icon: LucideIcon
  insert: (selection: { start: number; end: number; text: string }) => {
    text: string
    cursorOffset: number
  }
}

const TOOLS: ToolAction[] = [
  {
    label: '加粗',
    icon: Bold,
    insert: ({ start, end, text }) => {
      const sel = text.slice(start, end) || '粗体文本'
      return { text: text.slice(0, start) + `**${sel}**` + text.slice(end), cursorOffset: start + 2 + sel.length + 2 }
    },
  },
  {
    label: '斜体',
    icon: Italic,
    insert: ({ start, end, text }) => {
      const sel = text.slice(start, end) || '斜体文本'
      return { text: text.slice(0, start) + `*${sel}*` + text.slice(end), cursorOffset: start + 1 + sel.length + 1 }
    },
  },
  {
    label: '标题 1',
    icon: Heading1,
    insert: ({ start, text }) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const prefix = '# '
      return { text: text.slice(0, lineStart) + prefix + text.slice(lineStart), cursorOffset: lineStart + prefix.length }
    },
  },
  {
    label: '标题 2',
    icon: Heading2,
    insert: ({ start, text }) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const prefix = '## '
      return { text: text.slice(0, lineStart) + prefix + text.slice(lineStart), cursorOffset: lineStart + prefix.length }
    },
  },
  {
    label: '标题 3',
    icon: Heading3,
    insert: ({ start, text }) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const prefix = '### '
      return { text: text.slice(0, lineStart) + prefix + text.slice(lineStart), cursorOffset: lineStart + prefix.length }
    },
  },
  {
    label: '无序列表',
    icon: List,
    insert: ({ start, text }) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const prefix = '- '
      return { text: text.slice(0, lineStart) + prefix + text.slice(lineStart), cursorOffset: lineStart + prefix.length }
    },
  },
  {
    label: '有序列表',
    icon: ListOrdered,
    insert: ({ start, text }) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const prefix = '1. '
      return { text: text.slice(0, lineStart) + prefix + text.slice(lineStart), cursorOffset: lineStart + prefix.length }
    },
  },
  {
    label: '链接',
    icon: Link,
    insert: ({ start, end, text }) => {
      const sel = text.slice(start, end) || '链接文字'
      return { text: text.slice(0, start) + `[${sel}](url)` + text.slice(end), cursorOffset: start + sel.length + 3 }
    },
  },
  {
    label: '行内代码',
    icon: Code,
    insert: ({ start, end, text }) => {
      const sel = text.slice(start, end) || 'code'
      return { text: text.slice(0, start) + `\`${sel}\`` + text.slice(end), cursorOffset: start + 1 + sel.length + 1 }
    },
  },
  {
    label: '引用',
    icon: MessageSquareQuote,
    insert: ({ start, text }) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const prefix = '> '
      return { text: text.slice(0, lineStart) + prefix + text.slice(lineStart), cursorOffset: lineStart + prefix.length }
    },
  },
  {
    label: '分割线',
    icon: Minus,
    insert: ({ start, text }) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const hr = '---\n'
      return { text: text.slice(0, lineStart) + hr + text.slice(lineStart), cursorOffset: lineStart + hr.length }
    },
  },
  {
    label: '表格',
    icon: Table2,
    insert: ({ start, text }) => {
      const table = '\n| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容 | 内容 | 内容 |\n'
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      return { text: text.slice(0, lineStart) + table + text.slice(lineStart), cursorOffset: lineStart + table.length }
    },
  },
  {
    label: '图片',
    icon: Image,
    insert: ({ start, end, text }) => {
      const sel = text.slice(start, end) || '图片描述'
      return { text: text.slice(0, start) + `![${sel}](url)` + text.slice(end), cursorOffset: start + sel.length + 3 }
    },
  },
]

// ─── 编辑器组件 ────────────────────────────────────────────────────
function MarkdownEditor({
  content,
  onChange,
  onCancel,
}: {
  content: string
  onChange: (newContent: string) => void
  onCancel: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(content)

  const handleTool = useCallback((tool: ToolAction) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: start, selectionEnd: end, value } = ta
    const result = tool.insert({ start, end, text: value })
    setText(result.text)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(result.cursorOffset, result.cursorOffset)
    })
  }, [])

  // 拖入图片：转 base64 data URL 插入
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      const ta = textareaRef.current
      if (!ta) return
      const { selectionStart: start, value } = ta
      const mdImg = `![${file.name}](${base64})\n`
      const newText = value.slice(0, start) + mdImg + value.slice(start)
      setText(newText)
      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(start + mdImg.length, start + mdImg.length)
      })
    }
    reader.readAsDataURL(file)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-edge/10 bg-surface/60 px-3 py-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            title={tool.label}
            onClick={() => handleTool(tool)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <tool.icon size={15} strokeWidth={1.75} />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-edge/20" />
        <button
          onClick={onCancel}
          title="取消编辑"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <X size={14} strokeWidth={1.75} />
          取消
        </button>
      </div>

      {/* 分屏编辑区 */}
      <div className="flex min-h-0 flex-1">
        {/* 编辑 */}
        <div className="flex w-1/2 flex-col border-r border-edge/10">
          <div className="flex items-center gap-1 border-b border-edge/10 bg-surface/40 px-3 py-1.5">
            <Edit3 size={13} strokeWidth={1.75} className="text-fg-subtle" />
            <span className="text-[12px] text-fg-subtle">编辑</span>
            <span className="ml-auto font-mono text-[12px] text-fg-faint">
              {text.length} 字
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-fg placeholder-fg-faint outline-none"
            placeholder="在此编写 Markdown 文档..."
            spellCheck={false}
          />
        </div>

        {/* 预览 */}
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center gap-1 border-b border-edge/10 bg-surface/40 px-3 py-1.5">
            <Eye size={13} strokeWidth={1.75} className="text-fg-subtle" />
            <span className="text-[12px] text-fg-subtle">预览</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            <div className="prose-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex shrink-0 items-center gap-2 border-t border-edge/10 bg-surface/60 px-3 py-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <X size={14} strokeWidth={1.75} />
          放弃修改
        </button>
        <button
          onClick={() => onChange(text)}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-primary/90"
        >
          <Save size={14} strokeWidth={1.75} />
          保存文档
        </button>
      </div>
    </div>
  )
}

// ─── 主体组件 ──────────────────────────────────────────────────────
export default function HelpCenter() {
  const [docId, setDocId] = useState('index')
  const [searchQuery, setSearchQuery] = useState('')
  const [bundledContent, setBundledContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [hasEdit, setHasEdit] = useState(false)

  // 加载文档内容
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setBundledContent('')

    // 先检查 localStorage 覆盖
    const saved = getSavedContent(docId)
    if (saved) {
      if (!cancelled) {
        setBundledContent(saved)
        setHasEdit(true)
        setLoading(false)
      }
      return
    }

    setHasEdit(false)
    loadBundledContent(docId).then((raw) => {
      if (!cancelled) {
        setBundledContent(raw ?? `# 文档未找到\n\n无法加载 "${docId}" 文档。`)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setBundledContent(`# 加载失败\n\n文档 "${docId}" 加载出错。`)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [docId])

  // 修改后关闭编辑模式
  useEffect(() => {
    setIsEditing(false)
  }, [docId])

  // TOC
  const toc = useMemo(() => extractToc(bundledContent), [bundledContent])

  // 搜索过滤
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return DOCS
    const q = searchQuery.toLowerCase()
    return DOCS.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q),
    )
  }, [searchQuery])

  const currentDoc = DOCS.find((d) => d.id === docId)
  const docTitle = currentDoc?.title ?? '帮助文档'

  // 编辑器保存
  const handleEditorSave = useCallback(
    (newContent: string) => {
      saveContent(docId, newContent)
      setBundledContent(newContent)
      setHasEdit(true)
      setIsEditing(false)
    },
    [docId],
  )

  // 放弃编辑并还原默认
  const handleResetDoc = useCallback(() => {
    deleteSavedContent(docId)
    setHasEdit(false)
    setIsEditing(false)
    loadBundledContent(docId).then((raw) => {
      setBundledContent(raw ?? `# 文档未找到\n\n无法加载 "${docId}" 文档。`)
    }).catch(() => {
      setBundledContent(`# 加载失败\n\n文档 "${docId}" 加载出错。`)
    })
  }, [docId])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* 顶部导航栏 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-edge/10 bg-surface/70 px-4 py-2.5 backdrop-blur-md">
        <BookOpen size={16} strokeWidth={1.75} className="text-primary/70" />
        <span className="text-[14px] font-semibold text-fg">帮助中心</span>
        <span className="text-[12px] text-fg-faint">文档教程与功能参考</span>

        <span className="flex-1" />

        {/* 搜索 */}
        <div className="relative flex items-center">
          <Search size={14} strokeWidth={1.75} className="absolute left-2.5 text-fg-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文档..."
            className="w-48 rounded-md border border-edge/15 bg-surface/60 py-1.5 pl-8 pr-3 text-[13px] text-fg placeholder-fg-faint outline-none transition-colors focus:border-primary/40 focus:bg-surface"
          />
        </div>

        {/* 编辑/还原按钮 */}
        <div className="flex items-center gap-1">
          {hasEdit && !isEditing && (
            <button
              onClick={handleResetDoc}
              title="还原为默认文档"
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Undo2 size={13} strokeWidth={1.75} />
              还原默认
            </button>
          )}
          <button
            onClick={() => setIsEditing((v) => !v)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              isEditing
                ? 'bg-primary/15 text-primary'
                : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
            }`}
          >
            <Edit3 size={13} strokeWidth={1.75} />
            {isEditing ? '退出编辑' : '编辑文档'}
          </button>
        </div>
      </header>

      {/* 编辑器模式 */}
      {isEditing ? (
        <div className="min-h-0 flex-1">
          <MarkdownEditor
            content={bundledContent}
            onChange={handleEditorSave}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ── 左侧文档导航 ── */}
          <aside className="flex w-52 shrink-0 flex-col border-r border-edge/10 bg-surface/30">
            <div className="overflow-auto px-2 py-2">
              {searchQuery && filteredDocs.length === 0 ? (
                <p className="px-2.5 py-4 text-center text-[13px] text-fg-faint">
                  未找到匹配的文档
                </p>
              ) : (
                <nav className="flex flex-col gap-0.5">
                  {filteredDocs.map((doc) => {
                    const active = doc.id === docId
                    const hasLocal = !!getSavedContent(doc.id)
                    return (
                      <button
                        key={doc.id}
                        onClick={() => setDocId(doc.id)}
                        className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-all ${
                          active
                            ? 'signal-bar bg-primary/[0.08] text-fg font-medium'
                            : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
                        }`}
                      >
                        <span className={`shrink-0 ${active ? 'text-primary' : 'text-fg-faint'}`}>
                          <DocIcon name={doc.icon} />
                        </span>
                        <span className="truncate">{doc.title}</span>
                        {hasLocal && !active && (
                          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                        )}
                      </button>
                    )
                  })}
                </nav>
              )}
            </div>

            {/* 底部统计 */}
            <div className="mt-auto border-t border-edge/10 px-3 py-2 text-[12px] text-fg-faint">
              {DOCS.length} 篇文档
              {searchQuery && filteredDocs.length !== DOCS.length && (
                <span> · {filteredDocs.length} 篇匹配</span>
              )}
            </div>
          </aside>

          {/* ── 中央文档正文 ── */}
          <main className="flex min-w-0 flex-1 justify-center overflow-auto bg-surface">
            <div className="w-full max-w-3xl px-8 py-8">
              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
              ) : (
                <>
                  <div className="mb-8">
                    <h1 className="text-[18px] font-semibold leading-snug text-fg">
                      {docTitle}
                    </h1>
                    {hasEdit && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] text-primary/80">
                        <Edit3 size={11} strokeWidth={1.75} />
                        已自定义
                      </span>
                    )}
                  </div>
                  <article className="prose-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {bundledContent}
                    </ReactMarkdown>
                  </article>

                  {/* 文档底部导航 */}
                  <div className="mt-12 border-t border-edge/10 pt-6">
                    <div className="flex items-center justify-between">
                      {(() => {
                        const idx = DOCS.findIndex((d) => d.id === docId)
                        const prev = idx > 0 ? DOCS[idx - 1] : null
                        const next = idx < DOCS.length - 1 ? DOCS[idx + 1] : null
                        return (
                          <>
                            {prev ? (
                              <button
                                onClick={() => setDocId(prev.id)}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                              >
                                <ChevronRight size={14} strokeWidth={1.75} className="rotate-180" />
                                {prev.title}
                              </button>
                            ) : (
                              <span />
                            )}
                            {next && (
                              <button
                                onClick={() => setDocId(next.id)}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                              >
                                {next.title}
                                <ChevronRight size={14} strokeWidth={1.75} />
                              </button>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          </main>

          {/* ── 右侧 TOC ── */}
          <aside className="flex w-44 shrink-0 flex-col border-l border-edge/10 bg-surface/20">
            <div className="border-b border-edge/10 px-3 py-2.5">
              <span className="text-[12px] font-medium text-fg-muted">本页目录</span>
            </div>
            <nav className="overflow-auto px-2 py-2">
              {toc.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-fg-faint">暂无标题</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {toc.map((item, i) => (
                    <a
                      key={i}
                      href={`#${item.id}`}
                      className={`block truncate rounded-md px-2 py-1.5 text-[12px] leading-snug transition-colors hover:bg-surface-hover hover:text-fg ${
                        item.level === 1
                          ? 'font-medium text-fg-subtle'
                          : item.level === 2
                            ? 'text-fg-subtle'
                            : 'pl-5 text-fg-faint'
                      }`}
                      style={{ paddingLeft: item.level === 1 ? 8 : item.level === 2 ? 16 : 24 }}
                      onClick={(e) => {
                        e.preventDefault()
                        const el = document.getElementById(item.id)
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    >
                      {item.text}
                    </a>
                  ))}
                </div>
              )}
            </nav>
          </aside>
        </div>
      )}
    </div>
  )
}
