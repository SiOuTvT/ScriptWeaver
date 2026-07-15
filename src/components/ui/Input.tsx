import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const BASE =
  'w-full rounded-md border bg-surface-3 px-2.5 py-1.5 text-xs text-fg placeholder-fg-subtle outline-none transition-colors duration-150 disabled:opacity-50'

function fieldBorder(error?: boolean) {
  return error
    ? 'border-danger/60 focus:border-danger'
    : 'border-edge/15 focus:border-primary/60'
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: ReactNode
  hint?: ReactNode
  error?: boolean
  /** 前缀图标，置于输入框内部左侧 */
  prefix?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, prefix, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-[11px] font-medium text-fg-muted">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-2 text-fg-subtle">{prefix}</span>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            BASE,
            fieldBorder(error),
            prefix && 'pl-7',
            className,
          )}
          {...rest}
        />
      </div>
      {hint && (
        <span className={cn('text-[11px]', error ? 'text-danger' : 'text-fg-faint')}>
          {hint}
        </span>
      )}
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const areaId = id ?? autoId
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={areaId} className="text-[11px] font-medium text-fg-muted">
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        ref={ref}
        className={cn(BASE, 'resize-none leading-relaxed', fieldBorder(error), className)}
        {...rest}
      />
      {hint && (
        <span className={cn('text-[11px]', error ? 'text-danger' : 'text-fg-faint')}>
          {hint}
        </span>
      )}
    </div>
  )
})
