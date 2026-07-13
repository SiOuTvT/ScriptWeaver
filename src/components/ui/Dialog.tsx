import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import IconButton from './IconButton'
import { X } from 'lucide-react'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 面板宽度，默认 320 */
  width?: number | string
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlay?: boolean
  /** 是否显示右上角关闭按钮，默认 true */
  showClose?: boolean
}

/**
 * 模态对话框：遮罩毛玻璃 + 玻璃面板 + 上浮动效。
 * - Esc 关闭；点击遮罩关闭（可由 closeOnOverlay 关闭）
 * - 通过 Portal 渲染到 body，避免被父级 stacking context 裁剪
 */
export default function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 320,
  closeOnOverlay = true,
  showClose = true,
}: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        className="max-w-[92vw] animate-slide-up rounded-lg border border-edge-strong/15 bg-surface-2 p-6 shadow-3 shadow-inset-top"
      >
        {title && (
          <div className="mb-2 flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
            {showClose && (
              <IconButton
                icon={<X size={14} strokeWidth={1.75} />}
                aria-label="关闭"
                onClick={onClose}
              />
            )}
          </div>
        )}
        <div className="text-xs leading-relaxed text-fg-muted">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
