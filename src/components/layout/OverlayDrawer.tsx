import { useRef, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'

interface OverlayDrawerProps {
  /** 是否展开（展开时滑入覆盖舞台区，关闭时滑出且不占布局空间） */
  open: boolean
  onClose: () => void
  title: string
  icon: LucideIcon
  badge?: ReactNode
  /** 当前宽度（px），可经左侧手柄拖拽调整 */
  width: number
  onWidthChange: (w: number) => void
  minWidth?: number
  maxWidth?: number
  /** 距容器右缘的偏移（px），用于多抽屉从右向左堆叠 */
  right: number
  /** 子组件自带头部（如变量监视）时，隐藏抽屉头部并改用悬浮关闭钮 */
  headerless?: boolean
  children: ReactNode
}

/**
 * 浮层抽屉（Overlay Drawer）—— 工业级 IDE 检视面板。
 * 与旧 Dock 不同：它「浮」在中央舞台之上（absolute + transform 滑入），
 * 不挤压主工作区；默认关闭时舞台与时间轴拉满。支持左缘拖拽自由收缩宽度。
 * 仅用 transform/opacity 动画（GPU 友好，60fps），尊重全局 prefers-reduced-motion。
 */
export default function OverlayDrawer({
  open,
  onClose,
  title,
  icon: Icon,
  badge,
  width,
  onWidthChange,
  minWidth = 220,
  maxWidth = 540,
  right,
  headerless = false,
  children,
}: OverlayDrawerProps) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const onHandleDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    const move = (ev: PointerEvent) => {
      if (!dragging.current) return
      const delta = startX.current - ev.clientX // 向左拖 → 更宽
      const next = Math.min(maxWidth, Math.max(minWidth, startW.current + delta))
      onWidthChange(next)
    }
    const up = () => {
      dragging.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className="absolute bottom-0 top-0 z-30 flex"
      style={{
        right,
        width,
        transform: open ? 'translateX(0)' : 'translateX(calc(100% + 18px))',
        transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: open ? 'auto' : 'none',
      }}
      aria-hidden={!open}
    >
      {/* 左缘拖拽调整手柄（自由收缩宽度） */}
      <div
        onPointerDown={onHandleDown}
        className="group relative w-1.5 shrink-0 cursor-ew-resize"
        title="拖拽调整宽度"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-edge-strong/15 transition-colors group-hover:bg-signal/60" />
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col border-l border-edge/12 bg-surface/95 shadow-[var(--shadow-3)] backdrop-blur-xl">
        {!headerless && (
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-edge/10 bg-surface-1/60 px-3">
            <Icon size={15} strokeWidth={1.75} className="text-signal" />
            <span className="eyebrow truncate">{title}</span>
            {badge != null && (
              <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[12px] tabular-nums text-fg-subtle">
                {badge}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              title={`收起${title}`}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>

        {/* headerless 时由子组件自带头部，这里补一个悬浮关闭钮 */}
        {headerless && (
          <button
            type="button"
            onClick={onClose}
            title="收起"
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-surface/80 text-fg-subtle backdrop-blur transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  )
}
