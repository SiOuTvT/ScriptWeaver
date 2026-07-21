/**
 * 轻量 Toast 通知系统 — 无 React 依赖，纯事件驱动。
 * 在 AppLayout 中挂载 <ToastContainer /> 后，任意位置调用 toast() 即可。
 */

type ToastType = 'success' | 'info' | 'warning' | 'error'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

let _uid = 0
let _listeners: Array<(items: ToastItem[]) => void> = []
let _items: ToastItem[] = []

function notify() {
  for (const fn of _listeners) fn([..._items])
}

export function toast(message: string, type: ToastType = 'success') {
  const id = ++_uid
  _items = [..._items, { id, message, type }]
  notify()
  setTimeout(() => {
    _items = _items.filter((i) => i.id !== id)
    notify()
  }, 2500)
}

export function subscribe(fn: (items: ToastItem[]) => void) {
  _listeners.push(fn)
  return () => {
    _listeners = _listeners.filter((l) => l !== fn)
  }
}

/** 直接导出当前列表（用于初始化） */
export function getToastItems(): ToastItem[] {
  return _items
}

export type { ToastItem, ToastType }
