import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookOpen, Search, ChevronRight, ChevronDown, FileText,
  ExternalLink, Info, AlertTriangle, Lightbulb, X
} from 'lucide-react'
import { toast } from '@/utils/toast'

// ─── 静态预加载所有帮助文档 ─────────────────────────

import helpIndex from '../../help/index.md?raw'
import helpGettingStarted from '../../help/getting-started.md?raw'
import helpAssetManager from '../../help/asset-manager.md?raw'
import helpScriptOverview from '../../help/script-overview.md?raw'
import helpStagePreview from '../../help/stage-preview.md?raw'
import helpCharacterManager from '../../help/character-manager.md?raw'
import helpAiCopilot from '../../help/ai-copilot.md?raw'
import helpTimeline from '../../help/timeline.md?raw'
import helpTtsSynthesis from '../../help/tts-synthesis.md?raw'
import helpEffectsLab from '../../help/effects-lab.md?raw'
import helpExport from '../../help/export.md?raw'
import helpFaq from '../../help/faq.md?raw'
import helpShortcuts from '../../help/shortcuts.md?raw'

function resolveDocContent(file: string): string {
  const map: Record<string, string> = {
    'index.md':                helpIndex,
    'getting-started.md':      helpGettingStarted,
    'asset-manager.md':        helpAssetManager,
    'script-overview.md':      helpScriptOverview,
    'stage-preview.md':        helpStagePreview,
    'character-manager.md':    helpCharacterManager,
    'ai-copilot.md':           helpAiCopilot,
    'timeline.md':             helpTimeline,
    'tts-synthesis.md':        helpTtsSynthesis,
    'effects-lab.md':          helpEffectsLab,
    'export.md':               helpExport,
    'faq.md':                  helpFaq,
    'shortcuts.md':            helpShortcuts,
  }
  return map[file] || ''
}

// ─── 文档目录树 ──────────────────────────────────────

interface DocNode {
  id: string
  label: string
  file?: string
  children?: DocNode[]
  icon?: string
}

const DOC_TREE: DocNode[] = [
  {
    id: 'getting-started', label: '入门指南', children: [
      { id: 'index', label: '欢迎使用 ScriptWeaver', file: 'index.md' },
      { id: 'getting-started', label: '快速开始', file: 'getting-started.md' },
    ],
  },
  {
    id: 'core-features', label: '核心功能', children: [
      { id: 'stage-preview', label: '舞台预览', file: 'stage-preview.md' },
      { id: 'timeline', label: '时间轴编辑', file: 'timeline.md' },
      { id: 'script-overview', label: '剧本总览', file: 'script-overview.md' },
    ],
  },
  {
    id: 'asset-mgmt', label: '资源管理', children: [
      { id: 'asset-manager', label: '素材管理', file: 'asset-manager.md' },
      { id: 'character-manager', label: '角色管理', file: 'character-manager.md' },
    ],
  },
  {
    id: 'ai-creative', label: 'AI 创作', children: [
      { id: 'ai-copilot', label: 'AI 编剧 Copilot', file: 'ai-copilot.md' },
      { id: 'tts-synthesis', label: 'TTS 语音合成', file: 'tts-synthesis.md' },
    ],
  },
  {
    id: 'advanced', label: '进阶功能', children: [
      { id: 'effects-lab', label: '特效工坊', file: 'effects-lab.md' },
      { id: 'export', label: '导出发布', file: 'export.md' },
    ],
  },
  {
    id: 'reference', label: '参考', children: [
      { id: 'shortcuts', label: '快捷键速查', file: 'shortcuts.md' },
      { id: 'faq', label: '常见问题', file: 'faq.md' },
    ],
  },
]

function flattenDocs(nodes: DocNode[]): DocNode[] {
  return nodes.flatMap((n) => (n.children ? [n, ...flattenDocs(n.children)] : [n]))
}

function findDocById(nodes: DocNode[], id: string): DocNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findDocById(n.children, id)
      if (found) return found
    }
  }
  return undefined
}

// ─── 提示框 / Alert 组件 ────────────────────────────

const alertStyles = {
  info:    { bg: 'bg-info/8',      border: 'border-info/30',   icon: Info,           iconColor: 'text-info' },
  warning: { bg: 'bg-warning/8',   border: 'border-warning/30',icon: AlertTriangle,  iconColor: 'text-warning' },
  tip:     { bg: 'bg-success/8',   border: 'border-success/30',icon: Lightbulb,      iconColor: 'text-success' },
  danger:  { bg: 'bg-danger/8',    border: 'border-danger/30', icon: AlertTriangle,  iconColor: 'text-danger' },
}

function AlertBox({ type, children }: { type: 'info' | 'warning' | 'tip' | 'danger'; children: React.ReactNode }) {
  const style = alertStyles[type]
  const Icon = style.icon
  return (
    <div className={`my-3 flex items-start gap-2.5 px-3 py-2.5 rounded-lg border ${style.bg} ${style.border}`}>
      <Icon size={15} className={`${style.iconColor} shrink-0 mt-px`} />
      <div className="text-sm text-fg-muted leading-relaxed">{children}</div>
    </div>
  )
}

// ─── 代码块组件（带语言标签） ──────────────────────

function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="my-3 rounded-lg border border-edge/8 overflow-hidden bg-surface-1-tinted">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-edge/6 bg-surface-tinted/50">
        <span className="text-xs font-medium text-fg-faint uppercase tracking-wide">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs text-fg-subtle hover:text-fg-muted transition-colors px-2 py-0.5 rounded hover:bg-surface-hover/60"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto">
        <code className="text-sm leading-relaxed font-mono text-fg-default">{children}</code>
      </pre>
    </div>
  )
}

// ─── 主页面 ────────────────────────────────────────────

export default function HelpCenter() {
  const [activeDoc, setActiveDoc] = useState('index')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(DOC_TREE.map((g) => g.id))
  )
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([])
  const [activeHeading, setActiveHeading] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editingDoc, setEditingDoc] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({})

  const contentRef = useRef<HTMLDivElement>(null)
  const headingRefs = useRef<Map<string, HTMLElement>>(new Map())

  // ─── 文档加载 ─────────────────────────────────
  const loadDoc = useCallback(async (docId: string) => {
    const doc = findDocById(DOC_TREE, docId)
    if (!doc?.file) return

    // 检查是否有本地编辑草稿
    if (editDrafts[docId]) {
      setContent(editDrafts[docId])
      setActiveDoc(docId)
      return
    }

    setLoading(true)
    setError('')
    setActiveDoc(docId)
    try {
      const text = resolveDocContent(doc.file)
      if (!text) throw new Error('empty')
      setContent(text)
    } catch {
      setError('文档加载失败，请稍后重试')
      setContent('')
    } finally {
      setLoading(false)
    }
  }, [editDrafts])

  useEffect(() => {
    loadDoc(activeDoc)
  }, [activeDoc, loadDoc])

  // ─── 提取标题 ──────────────────────────────────
  useEffect(() => {
    if (!content || !contentRef.current) return
    // 等一小段时间让 DOM 渲染完成
    const timer = setTimeout(() => {
      const els = contentRef.current?.querySelectorAll('h1[id], h2[id]')
      if (!els) return
      const h: { id: string; text: string; level: number }[] = []
      const map = new Map<string, HTMLElement>()
      els.forEach((el) => {
        const htmlEl = el as HTMLElement
        h.push({ id: htmlEl.id, text: htmlEl.textContent || '', level: Number(htmlEl.tagName[1]) })
        map.set(htmlEl.id, htmlEl)
      })
      setHeadings(h)
      headingRefs.current = map
    }, 150)
    return () => clearTimeout(timer)
  }, [content])

  // ─── IntersectionObserver 滚动追踪 ──────────────
  useEffect(() => {
    if (headings.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveHeading(visible[0].target.id)
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )
    const currentMap = headingRefs.current
    currentMap.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  // ─── 目录点击平滑滚动 ──────────────────────────
  const scrollToHeading = useCallback((id: string) => {
    const el = headingRefs.current.get(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveHeading(id)
    }
  }, [])

  // ─── 搜索过滤 ──────────────────────────────────
  const filteredGroups = !searchQuery.trim() ? DOC_TREE : DOC_TREE
    .map((group) => ({
      ...group,
      children: group.children?.filter((child) =>
        child.label.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((group) => group.children && group.children.length > 0)

  // 展开/折叠分组
  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── 编辑器 ────────────────────────────────────
  const openEditor = () => {
    const doc = findDocById(DOC_TREE, activeDoc)
    setEditingDoc(doc?.file || activeDoc)
    setEditorContent(editDrafts[activeDoc] || content)
    setShowEditor(true)
  }

  const saveEditor = () => {
    const draft = editorContent.trim()
    if (draft) {
      setEditDrafts((prev) => ({ ...prev, [activeDoc]: draft }))
      setContent(draft)
      toast('草稿已保存', 'success')
    } else {
      const newDrafts = { ...editDrafts }
      delete newDrafts[activeDoc]
      setEditDrafts(newDrafts)
      loadDoc(activeDoc)
    }
    setShowEditor(false)
  }

  const activeLabel = findDocById(DOC_TREE, activeDoc)?.label || '帮助中心'

  return (
    <div className="flex h-full select-none">
      {/* ── 左侧：树形导航 ──────────────────────── */}
      <div className="w-56 shrink-0 border-r border-edge/8 flex flex-col bg-surface-tinted/50">
        {/* 搜索 */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文档..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-edge/10
                bg-surface-2-tinted/60 text-fg-default placeholder:text-fg-faint
                focus:outline-none focus:border-primary/30 transition-colors"
            />
          </div>
        </div>

        {/* 树形导航 */}
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {filteredGroups.map((group) => {
            const expanded = expandedGroups.has(group.id)
            return (
              <div key={group.id} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-md
                    text-xs font-medium text-fg-muted hover:bg-surface-hover/60 transition-colors"
                >
                  <span>{group.label}</span>
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {expanded && group.children && (
                  <div className="ml-1">
                    {group.children.map((child) => {
                      const isActive = activeDoc === child.id
                      return (
                        <button
                          key={child.id}
                          onClick={() => setActiveDoc(child.id)}
                          className={`w-full flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-md text-left
                            text-sm transition-colors
                            ${isActive
                              ? 'bg-primary/10 text-primary border border-primary/20 font-medium'
                              : 'text-fg-muted hover:bg-surface-hover/60 border border-transparent'
                            }`}
                        >
                          <FileText size={13} className={isActive ? 'text-primary' : 'text-fg-faint'} />
                          <span className="truncate">{child.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {filteredGroups.length === 0 && (
            <p className="text-xs text-fg-faint text-center py-4">未找到相关文档</p>
          )}
        </nav>

        <div className="px-3 py-2 border-t border-edge/6">
          <button
            onClick={openEditor}
            className="w-full text-xs text-fg-subtle hover:text-primary transition-colors
              py-1.5 px-2 rounded hover:bg-surface-hover/60 text-left"
          >
            编辑当前页...
          </button>
        </div>
      </div>

      {/* ── 中间：Markdown 正文 ──────────────────── */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-8 py-6"
      >
        {loading && (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-fg-faint">加载中...</p>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
        {!loading && !error && (
          <div className="prose-content max-w-3xl">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children, ...props }) => {
                  const id = String(children).replace(/\s+/g, '-').toLowerCase()
                  return <h1 id={id} {...props}>{children}</h1>
                },
                h2: ({ children, ...props }) => {
                  const id = String(children).replace(/\s+/g, '-').toLowerCase()
                  return <h2 id={id} {...props}>{children}</h2>
                },
                code: ({ className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '')
                  const isInline = !match && !String(children).includes('\n')
                  if (isInline) {
                    return <code className={className} {...props}>{children}</code>
                  }
                  return (
                    <CodeBlock language={match ? match[1] : undefined}>
                      {String(children).replace(/\n$/, '')}
                    </CodeBlock>
                  )
                },
                blockquote: ({ children, ...props }: any) => {
                  // 检测是否为 Alert 提示框
                  const rawText = String((children as any)?.props?.children || '')
                  if (rawText.startsWith('[!INFO]') || rawText.startsWith('[!info]'))
                    return <AlertBox type="info">{rawText.replace(/^\[!INFO\]\s*/i, '')}</AlertBox>
                  if (rawText.startsWith('[!WARNING]') || rawText.startsWith('[!warning]'))
                    return <AlertBox type="warning">{rawText.replace(/^\[!WARNING\]\s*/i, '')}</AlertBox>
                  if (rawText.startsWith('[!TIP]') || rawText.startsWith('[!tip]'))
                    return <AlertBox type="tip">{rawText.replace(/^\[!TIP\]\s*/i, '')}</AlertBox>
                  if (rawText.startsWith('[!DANGER]') || rawText.startsWith('[!danger]'))
                    return <AlertBox type="danger">{rawText.replace(/^\[!DANGER\]\s*/i, '')}</AlertBox>
                  return <blockquote {...props}>{children}</blockquote>
                },
                table: ({ children, ...props }) => (
                  <div className="overflow-x-auto my-3 rounded-lg border border-edge/8">
                    <table {...props}>{children}</table>
                  </div>
                ),
                th: ({ children, ...props }) => (
                  <th className="px-3 py-2 text-xs font-medium text-fg-muted bg-surface-tinted/60 border-b border-edge/8 text-left" {...props}>
                    {children}
                  </th>
                ),
                td: ({ children, ...props }) => (
                  <td className="px-3 py-2 text-sm text-fg-default border-b border-edge/4" {...props}>
                    {children}
                  </td>
                ),
                a: ({ href, children, ...props }) => {
                  const isExternal = href?.startsWith('http')
                  return (
                    <a
                      href={href}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                      {...props}
                    >
                      {children}
                      {isExternal && <ExternalLink size={11} />}
                    </a>
                  )
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* ── 右侧：本页目录（On This Page） + 滚动追踪 ── */}
      <div className="w-48 shrink-0 border-l border-edge/8 overflow-y-auto bg-surface-tinted/50">
        <div className="px-3 pt-4 pb-2">
          <h3 className="text-xs font-medium text-fg-muted uppercase tracking-[0.08em]">本页内容</h3>
        </div>
        <nav className="px-2 pb-4">
          {headings.length === 0 && content && (
            <p className="text-xs text-fg-faint px-2 py-4 text-center">无标题</p>
          )}
          {headings.map((h, i) => {
            const isActive = activeHeading === h.id
            return (
              <button
                key={`${h.id}-${i}`}
                onClick={() => scrollToHeading(h.id)}
                className={`w-full text-left py-1 px-2 rounded-md transition-colors text-xs
                  ${h.level === 2 ? 'pl-4' : ''}
                  ${isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-fg-subtle hover:text-fg-muted hover:bg-surface-hover/40'
                  }`}
              >
                <span className="block truncate">{h.text}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Markdown 编辑器浮层 ──────────────────── */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-tinted/80 backdrop-blur-sm">
          <div className="w-[80vw] max-w-4xl h-[80vh] panel flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge/8">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-fg-muted" />
                <span className="text-sm font-medium text-fg-default">
                  编辑 - {activeLabel}
                </span>
              </div>
              <button
                onClick={() => setShowEditor(false)}
                className="p-1 rounded hover:bg-surface-hover/60 text-fg-subtle hover:text-fg-muted"
              >
                <X size={16} />
              </button>
            </div>
            {/* 分屏编辑+预览 */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col border-r border-edge/8">
                <div className="px-3 py-1.5 border-b border-edge/6 bg-surface-tinted/40">
                  <span className="text-xs text-fg-faint">Markdown 源码</span>
                </div>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="flex-1 p-4 text-sm font-mono resize-none bg-transparent text-fg-default
                    outline-none placeholder:text-fg-faint"
                  placeholder="输入 Markdown 内容..."
                />
              </div>
              <div className="flex-1 flex flex-col">
                <div className="px-3 py-1.5 border-b border-edge/6 bg-surface-tinted/40">
                  <span className="text-xs text-fg-faint">实时预览</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 prose-content text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {editorContent}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
            {/* 底部操作条 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-edge/8 bg-surface-tinted/50">
              <div className="flex gap-2">
                <button
                  onClick={() => insertMarkdown('**', '**', '加粗文字')}
                  className="text-xs px-2 py-1 rounded hover:bg-surface-hover/60 text-fg-subtle hover:text-fg-muted font-bold"
                  title="加粗"
                >B</button>
                <button
                  onClick={() => insertMarkdown('*', '*', '斜体文字')}
                  className="text-xs px-2 py-1 rounded hover:bg-surface-hover/60 text-fg-subtle hover:text-fg-muted italic"
                  title="斜体"
                >I</button>
                <span className="w-px bg-edge/10 mx-1" />
                <button
                  onClick={() => insertMarkdown('\n> ', '', '引用文字')}
                  className="text-xs px-2 py-1 rounded hover:bg-surface-hover/60 text-fg-subtle hover:text-fg-muted"
                  title="引用"
                >"</button>
                <button
                  onClick={() => insertMarkdown('`', '`', '代码')}
                  className="text-xs px-2 py-1 rounded hover:bg-surface-hover/60 text-fg-subtle hover:text-fg-muted font-mono"
                  title="行内代码"
                >{`<>`}</button>
                <button
                  onClick={() => insertMarkdown('\n```\n', '\n```\n', '代码块')}
                  className="text-xs px-2 py-1 rounded hover:bg-surface-hover/60 text-fg-subtle hover:text-fg-muted"
                  title="代码块"
                >{`{ }`}</button>
                <span className="w-px bg-edge/10 mx-1" />
                <button
                  onClick={() => insertMarkdown('\n| 列A | 列B |\n| --- | --- |\n| ', ' |\n', '值A')}
                  className="text-xs px-2 py-1 rounded hover:bg-surface-hover/60 text-fg-subtle hover:text-fg-muted"
                  title="表格"
                >表</button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEditor(false)}
                  className="text-xs px-3 py-1.5 rounded-md text-fg-subtle hover:bg-surface-hover/60"
                >取消</button>
                <button
                  onClick={saveEditor}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25
                    font-medium transition-colors"
                >保存草稿</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑器插入标记辅助 */}
    </div>
  )

  function insertMarkdown(prefix: string, suffix: string, placeholder: string) {
    const ta = document.querySelector('textarea') as HTMLTextAreaElement
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = editorContent.slice(0, start)
    const selected = editorContent.slice(start, end) || placeholder
    const after = editorContent.slice(end)
    setEditorContent(before + prefix + selected + suffix + after)
  }
}
