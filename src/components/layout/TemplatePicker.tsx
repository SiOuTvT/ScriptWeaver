/**
 * 项目模板选择器
 * 新建项目时弹出，让用户选择内置模板或空白项目。
 */

import { useState } from 'react'
import { BookOpen, MessageCircle, GitBranch, Network, FilePlus, X } from 'lucide-react'
import { BUILTIN_TEMPLATES, type ProjectTemplate } from '@/utils/templates'

interface Props {
  onSelect: (template: ProjectTemplate) => void
  onClose: () => void
}

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  blank: <FilePlus size={28} strokeWidth={1.5} />,
  linear: <BookOpen size={28} strokeWidth={1.5} />,
  dialogue: <MessageCircle size={28} strokeWidth={1.5} />,
  branching: <GitBranch size={28} strokeWidth={1.5} />,
  'multi-ending': <Network size={28} strokeWidth={1.5} />,
}

export default function TemplatePicker({ onSelect, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string>('blank')

  const selected = BUILTIN_TEMPLATES.find((t) => t.id === selectedId) ?? BUILTIN_TEMPLATES[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-2xl rounded-xl border border-line bg-surface shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">从模板新建项目</h2>
          <button onClick={onClose} className="rounded p-1 text-fg-muted hover:bg-surface-2 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 模板网格 */}
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

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between border-t border-line px-5 py-4">
          <div className="text-[12px] text-fg-muted">
            选中: <span className="font-semibold text-fg">{selected.name}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost-sm text-fg-muted">取消</button>
            <button
              onClick={() => onSelect(selected)}
              className="btn-primary-sm bg-signal text-white"
            >
              使用此模板创建
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
