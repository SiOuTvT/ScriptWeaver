import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** 圆角，默认 md */
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

const ROUNDED = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
}

/**
 * 骨架屏占位块：主题感知的微光（shimmer）动画。
 * 渐变取自 surface-1 → surface-hover → surface-1 语义 token，深浅主题下均自然。
 */
export default function Skeleton({ rounded = 'md', className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-surface-1 via-surface-hover to-surface-1',
        ROUNDED[rounded],
        className,
      )}
      {...rest}
    />
  )
}
