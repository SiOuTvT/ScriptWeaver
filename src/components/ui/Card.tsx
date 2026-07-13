import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 阴影层级，默认 2 */
  elevation?: 0 | 1 | 2 | 3
  /** 内边距预设，默认 md（16px） */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** 是否使用毛玻璃背景 */
  glass?: boolean
}

const ELEVATIONS = {
  0: '',
  1: 'shadow-1',
  2: 'shadow-2',
  3: 'shadow-3',
}

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

const Card = function Card({
  elevation = 2,
  padding = 'md',
  glass = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-edge/10',
        glass ? 'bg-surface/70 backdrop-blur-md' : 'bg-surface-2',
        ELEVATIONS[elevation],
        PADDINGS[padding],
        className,
      )}
    >
      {children}
    </div>
  )
}

export default Card

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  /** 右侧操作区 */
  action?: ReactNode
  /** 副标题/说明 */
  subtitle?: ReactNode
}

export function CardHeader({ title, action, subtitle, className, ...rest }: CardHeaderProps) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...rest}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-fg-subtle">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  )
}
