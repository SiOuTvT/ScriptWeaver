/**
 * localStorage 草稿自动保存/恢复
 * 用于防止意外关闭或忘记手动保存导致数据丢失
 */

import type { LineDelta } from '@/core/types'

const DRAFT_KEY = 'scriptweaver_draft'

export interface DraftData {
  deltas: LineDelta[]
  savedAt: string
}

export function saveDraft(deltas: LineDelta[]): void {
  if (deltas.length === 0) {
    clearDraft()
    return
  }
  try {
    const data: DraftData = { deltas, savedAt: new Date().toISOString() }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as DraftData
    if (!data.deltas || !Array.isArray(data.deltas)) return null
    return data
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // 静默失败
  }
}
