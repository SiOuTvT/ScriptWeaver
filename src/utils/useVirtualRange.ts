import { useEffect, useRef, useState } from 'react'

export interface VirtualRange {
  /** 第一个需要渲染的 item 下标（含） */
  start: number
  /** 最后一个需要渲染的 item 下标（不含） */
  end: number
  /** 全部 item 的总尺寸（px），用于撑开滚动容器 */
  totalSize: number
}

/**
 * 纯函数：给定 item 偏移函数与当前滚动视口，二分计算出需要渲染的 [start, end) 区间。
 * 与 React / DOM 解耦，便于单测；useVirtualRange 仅负责把滚动事件喂进来。
 *
 * @param count         item 总数
 * @param getItemOffset 第 index 个 item 的起始偏移（约定 getItemOffset(count) = 总尺寸）
 * @param offset        滚动偏移（scrollTop / scrollLeft）
 * @param viewport      视口尺寸（clientHeight / clientWidth）；<=0 视为「未知」→ 渲染全部
 * @param overscan      视口外预渲染数量
 */
export function computeVirtualRange(
  count: number,
  getItemOffset: (index: number) => number,
  offset: number,
  viewport: number,
  overscan: number,
): VirtualRange {
  const totalSize = count > 0 ? getItemOffset(count) : 0

  if (count <= 0 || viewport <= 0) {
    return { start: 0, end: count, totalSize }
  }

  // 二分：最大的 i 满足 getItemOffset(i) <= offset
  let lo = 0
  let hi = count - 1
  let start = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (getItemOffset(mid) <= offset) {
      start = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  start = Math.max(0, start - overscan)

  // 二分：最小的 i 满足 getItemOffset(i) >= offset + viewport
  lo = start
  hi = count - 1
  let end = count
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (getItemOffset(mid) >= offset + viewport) {
      end = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  end = Math.min(count, end + overscan)

  return { start, end, totalSize }
}

interface UseVirtualRangeOptions<T extends HTMLElement> {
  /** item 总数 */
  count: number
  /** 返回第 index 个 item 的起始偏移（px）。约定 getItemOffset(count) = 总尺寸 */
  getItemOffset: (index: number) => number
  /** 视口外预渲染的 item 数量，避免快速滚动白屏 */
  overscan?: number
  /** 滚动轴：'y' 纵向（默认），'x' 横向 */
  axis?: 'x' | 'y'
  /** 滚动容器 ref（监听其 scroll / 尺寸） */
  scrollRef: React.RefObject<T | null>
}

/**
 * 轻量、零依赖的区间虚拟化 hook。
 *
 * 与 @tanstack/react-virtual 不同，这里直接用「单个滚动容器 + 已知/可计算的 item 偏移」
 * 做二分查找，既能处理等高的时间轴列（offset = i * cellWidth），也能处理不等高的
 * 扁平列表（offset 取自预计算的 offsets 数组）。不引入任何依赖，严格 TS、零 any / 零 !。
 */
export function useVirtualRange<T extends HTMLElement = HTMLElement>(
  opts: UseVirtualRangeOptions<T>,
): VirtualRange {
  const { count, getItemOffset, overscan = 6, axis = 'y', scrollRef } = opts
  const [offset, setOffset] = useState(0)
  const [viewport, setViewport] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const scrollProp = axis === 'x' ? 'scrollLeft' : 'scrollTop'
    const sizeProp = axis === 'x' ? 'clientWidth' : 'clientHeight'

    const onScroll = () => {
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        setOffset(el[scrollProp])
      })
    }
    // 立即同步一次，避免首帧只渲染 overscan 个 item
    setViewport(el[sizeProp])
    setOffset(el[scrollProp])

    // jsdom / 老环境可能无 ResizeObserver：缺失时跳过观测，
    // viewport 保持 0 → 按设计渲染全部 item，不丢内容、不崩溃。
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setViewport(el[sizeProp]))
    ro.observe(el)

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [scrollRef, axis])

  const range = computeVirtualRange(count, getItemOffset, offset, viewport, overscan)
  return range
}
