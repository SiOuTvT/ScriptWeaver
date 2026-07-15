import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Side = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  content: ReactNode
  side?: Side
  children: ReactNode
  className?: string
}

const SIDE: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
}

/** 轻量 CSS 悬浮提示，hover / focus 触发，无 JS 定位开销。 */
export default function Tooltip({ content, side = 'top', children, className }: TooltipProps) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[300] whitespace-nowrap rounded-md border border-edge-strong/15 bg-surface-2 px-2 py-1 text-[11px] text-fg-muted shadow-2',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          SIDE[side],
        )}
      >
        {content}
      </span>
    </span>
  )
}
