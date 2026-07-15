import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'ghost' | 'subtle' | 'outline' | 'danger'
type Size = 'xs' | 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** 左侧图标（通常为 lucide 组件实例） */
  icon?: ReactNode
  /** 是否占满父容器宽度 */
  block?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active shadow-1 ring-1 ring-inset ring-signal/35',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  subtle:
    'bg-surface-2 text-fg border border-edge/10 hover:bg-surface-hover hover:border-edge-strong/15',
  outline:
    'border border-edge/15 text-fg-muted hover:bg-surface-hover hover:text-fg hover:border-edge-strong/20',
  danger:
    'bg-danger text-white hover:opacity-90 active:opacity-100 shadow-1',
}

const SIZES: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1',
  sm: 'h-7 px-2.5 text-[11px] gap-1.5',
  md: 'h-8 px-3 text-xs gap-1.5',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'sm', icon, block, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md font-medium',
        'transition-[background-color,color,border-color,box-shadow,transform] duration-150 active:scale-[0.97]',
        'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export default Button
