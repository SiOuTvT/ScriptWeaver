import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string = string> {
  id: T
  label: ReactNode
  icon?: ReactNode
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  size?: 'sm' | 'md'
  className?: string
}

/** 顶部下划线式标签页，语义化 token 驱动选中态。 */
export default function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  size = 'sm',
  className,
}: TabsProps<T>) {
  return (
    <div className={cn('flex border-b border-edge/10', className)} role="tablist">
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 transition-colors duration-150',
              size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs',
              active
                ? 'border-primary text-fg'
                : 'border-transparent text-fg-subtle hover:bg-surface-hover hover:text-fg',
            )}
          >
            {it.icon}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
