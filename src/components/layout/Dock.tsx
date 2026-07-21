import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'

interface DockProps {
  /** 面板标题（展开时显示在头部，折叠时竖排显示在细轨） */
  title: string
  /** 头部 / 折叠轨图标 */
  icon: LucideIcon
  /** 停靠方向：左 / 右 */
  side: 'left' | 'right'
  /** 默认是否展开 */
  defaultOpen?: boolean
  /** 展开宽度（px） */
  width?: number
  /** 头部右侧徽标（如资产数 / 行数） */
  badge?: ReactNode
  /** 是否渲染 Dock 自带头部（内置已带标题的面板如变量监视可设 false） */
  showHeader?: boolean
  children: ReactNode
}

/**
 * 可停靠抽屉（Dock）—— 工业级 IDE 式侧边面板。
 * 展开时占固定宽度、与舞台并排；折叠时缩为 44px 细轨（图标 + 竖排标题），
 * 把全部空间让给中央舞台与底部时间轴，杜绝遮挡核心操作。
 */
export default function Dock({
  title,
  icon: Icon,
  side,
  defaultOpen = true,
  width = 264,
  badge,
  showHeader = true,
  children,
}: DockProps) {
  const [open, setOpen] = useState(defaultOpen)
  const CollapseIcon = side === 'left' ? ChevronLeft : ChevronRight
  const ExpandIcon = side === 'left' ? ChevronRight : ChevronLeft
  const borderCls = side === 'left' ? 'border-r' : 'border-l'

  if (!open) {
    return (
      <div
        className={`flex w-11 shrink-0 flex-col items-center gap-4 border-edge/10 bg-surface/70 py-3 backdrop-blur-sm ${borderCls}`}
        style={{ transition: 'width 200ms ease' }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`展开${title}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Icon size={18} strokeWidth={1.75} />
        </button>
        <span className="eyebrow [writing-mode:vertical-rl] rotate-180 text-fg-faint">{title}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`展开${title}`}
          className="mt-auto flex h-7 w-7 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <ExpandIcon size={15} strokeWidth={1.75} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`flex shrink-0 flex-col bg-surface ${borderCls} border-edge/10 shadow-[0_8px_28px_rgba(23,22,20,0.07)]`}
      style={{ width, transition: 'width 200ms ease' }}
    >
      {showHeader && (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-edge/10 bg-surface-1/40 px-3">
          <span className="signal-dot" />
          <span className="eyebrow truncate">{title}</span>
          {badge != null && (
            <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[12px] tabular-nums text-fg-subtle">
              {badge}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            title={`收起${title}`}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <CollapseIcon size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
