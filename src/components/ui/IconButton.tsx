import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'ghost' | 'subtle' | 'outline' | 'primary' | 'danger'
type Size = 'xs' | 'sm' | 'md'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 图标元素（lucide 组件实例） */
  icon: ReactNode
  variant?: Variant
  size?: Size
  /** 无障碍标签，必填（图标按钮无可见文字） */
  'aria-label': string
}

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  subtle: 'bg-surface-2 text-fg hover:bg-surface-hover border border-edge/10',
  outline: 'border border-edge/15 text-fg-muted hover:bg-surface-hover hover:text-fg',
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active',
  danger: 'text-danger hover:bg-danger/12',
}

const SIZES: Record<Size, string> = {
  xs: 'h-6 w-6',
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = 'ghost', size = 'sm', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        'transition-[background-color,color,transform] duration-150 active:scale-90',
        'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
})

export default IconButton
