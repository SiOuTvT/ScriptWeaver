import type { ReactNode } from 'react'
import Dialog from './Dialog'
import Button from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  message: ReactNode
  confirmText?: string
  cancelText?: string
  /** 确认按钮色调，默认 primary */
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

/** 基于 Dialog 的标准确认框，预置「取消 / 确认」双按钮。 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      {message}
    </Dialog>
  )
}
