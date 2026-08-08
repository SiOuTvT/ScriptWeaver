import { describe, it, expect } from 'vitest'
import { computeVirtualRange } from '../useVirtualRange'

describe('computeVirtualRange', () => {
  const uniform = (cellWidth: number) => (i: number) => i * cellWidth

  it('等分偏移：视口顶部只渲染可见列 + overscan', () => {
    const r = computeVirtualRange(1000, uniform(120), 0, 600, 4)
    // offset+viewport=600 → 首个 >=600 的列是 i=5；end = 5 + overscan(4) = 9
    expect(r.start).toBe(0)
    expect(r.end).toBe(9)
    expect(r.totalSize).toBe(1000 * 120)
  })

  it('等分偏移：滚动到中部，start/end 正确窗口化且无重叠', () => {
    const r = computeVirtualRange(1000, uniform(120), 1000, 600, 4)
    // start: 最大 i 使 i*120 <= 1000 → i=8(960)；8-overscan=4
    // end: 最小 i 使 i*120 >= 1600 → i=14(1680)；14+4=18
    expect(r.start).toBe(4)
    expect(r.end).toBe(18)
    expect(r.end).toBeLessThanOrEqual(1000)
  })

  it('viewport<=0（未知尺寸）时渲染全部 item，不丢内容', () => {
    const r = computeVirtualRange(1000, uniform(120), 0, 0, 4)
    expect(r.start).toBe(0)
    expect(r.end).toBe(1000)
  })

  it('count=0 时安全返回空区间', () => {
    const r = computeVirtualRange(0, uniform(120), 0, 600, 4)
    expect(r).toEqual({ start: 0, end: 0, totalSize: 0 })
  })

  it('滚动到末尾时 end 被 clamp 到 count', () => {
    const r = computeVirtualRange(50, uniform(120), 50 * 120 - 10, 600, 4)
    expect(r.end).toBe(50)
    expect(r.start).toBeGreaterThanOrEqual(0)
  })

  it('变高偏移（扁平列表）：二分命中正确区间', () => {
    // 不等高 item：前 10 个高 100，其余高 36
    const offsets = (i: number) => (i <= 10 ? i * 100 : 10 * 100 + (i - 10) * 36)
    const r = computeVirtualRange(200, offsets, 0, 500, 2)
    // 视口 0..500 → 前 5 个高 item（0..500）可见；end 落在首个 >=500 的 item：i=5(500)
    expect(r.start).toBe(0)
    expect(r.end).toBe(5 + 2)
  })
})
