/**
 * 项目模板选择器
 * 新建项目时弹出，让用户选择内置模板或空白项目。
 */

import { useState } from 'react'
import { BookOpen, MessageCircle, GitBranch, Network, FilePlus, X, ChevronLeft } from 'lucide-react'
import { BUILTIN_TEMPLATES, type ProjectTemplate } from '@/utils/templates'
import { useAppStore } from '@/stores/appStore'

interface Props {
  onSelect?: (template: ProjectTemplate) => void
  onClose?: () => void
  embedded?: boolean
}

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  blank: <FilePlus size={28} strokeWidth={1.5} />,
  linear: <BookOpen size={28} strokeWidth={1.5} />,
  dialogue: <MessageCircle size={28} strokeWidth={1.5} />,
  branching: <GitBranch size={28} strokeWidth={1.5} />,
  'multi-ending': <Network size={28} strokeWidth={1.5} />,
}

export default function TemplatePicker({ onSelect, onClose, embedded }: Props) {
  const [selectedId, setSelectedId] = useState<string>('blank')
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  const selected = BUILTIN_TEMPLATES.find((t) => t.id === selectedId) ?? BUILTIN_TEMPLATES[0]

  const handleClose = () => {
    if (onClose) onClose()
    if (embedded) setActiveNavItem('chapters')
  }

  const handleSelect = () => {
    if (onSelect) onSelect(selected)
    if (embedded) setActiveNavItem('chapters')
  }

  // Page mode: full-screen layout with header
  if (embedded) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex shrink-0 items-center gap-3 border-b border-edge/10 bg-surface px-6 py-3">
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft size={15} />
            返回
          </button>
          <h1 className="text-[15px] font-semibold">从模板新建项目</h1>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {BUILTIN_TEMPLATES.map((tpl) => {
              const active = tpl.id === selectedId
              return (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedId(tpl.id)}
                  className={`group relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border p-5 text-left shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2 ${
                    active
                      ? 'border-primary/40 bg-surface-2 ring-2 ring-primary/25'
                      : 'border-edge/10 bg-surface-2'
                  }`}
                >
                  {/* Top accent strip */}
                  <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r transition-opacity ${
                    active ? 'from-primary to-primary/50' : 'from-fg-muted/30 to-transparent opacity-0 group-hover:opacity-100'
                  }`} />
                  <span className={active ? 'text-primary' : 'text-fg-muted'}>
                    {TEMPLATE_ICONS[tpl.id] ?? <FilePlus size={28} strokeWidth={1.5} />}
                  </span>
                  <span className="text-[13px] font-semibold">{tpl.name}</span>
                  <span className="text-[12px] text-fg-muted leading-snug text-center">{tpl.description}</span>
                  <span className="flex gap-1 flex-wrap justify-center">
                    {tpl.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-fg-subtle">{tag}</span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-edge/10 bg-surface px-6 py-3">
          <span className="text-[12px] text-fg-muted">
            选中: <span className="font-semibold text-fg">{selected.name}</span>
          </span>
          <div className="flex gap-2">
            <button onClick={handleClose} className="btn-ghost-sm">取消</button>
            <button
              onClick={handleSelect}
              className="btn-primary-sm"
            >
              使用此模板创建
            </button>
          </div>
        </footer>
      </div>
    )
  }

  // Dialog mode: centered modal (backward compat)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-2xl rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">从模板新建项目</h2>
          <button onClick={handleClose} className="rounded p-1 text-fg-muted hover:bg-surface-2 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
          {BUILTIN_TEMPLATES.map((tpl) => {
            const active = tpl.id === selectedId
            return (
              <button
                key={tpl.id}
                onClick={() => setSelectedId(tpl.id)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${
                  active
                    ? 'border-primary/50 bg-primary-soft ring-1 ring-primary/30'
                    : 'border-line bg-surface-2 hover:bg-surface-hover'
                }`}
              >
                <span className={active ? 'text-primary' : 'text-fg-muted'}>
                  {TEMPLATE_ICONS[tpl.id] ?? <FilePlus size={28} strokeWidth={1.5} />}
                </span>
                <span className="text-[13px] font-semibold">{tpl.name}</span>
                <span className="text-[11px] text-fg-muted leading-snug">{tpl.description}</span>
                <span className="flex gap-1 flex-wrap justify-center">
                  {tpl.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-faint">{tag}</span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-4">
          <div className="text-[12px] text-fg-muted">
            选中: <span className="font-semibold text-fg">{selected.name}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={handleClose} className="btn-ghost-sm">取消</button>
            <button
              onClick={handleSelect}
              className="btn-primary-sm"
            >
              使用此模板创建
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
