import { useAppStore } from '@/stores/appStore'
import { serializeProject } from '@/utils/projectFile'

/**
 * 快照基线：记录「最近一次备份时的内容哈希」。
 * 所有自动备份（关窗口 / 退出 / 安全网）都先对比基线：
 * 内容没变化就不建档。手动备份成功后也会更新基线，
 * 这样「手动备份过 → 之后关窗口/退出不会重复备份」。
 */

function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

export function snapshotBaselineKey(root?: string | null): string {
  return `sw-last-snapshot-hash-${root || 'unsaved'}`
}

/** 当前工程内容哈希（剔除 blobUrl 等会话临时值，保证跨会话稳定） */
export function currentContentHash(): string {
  const s = useAppStore.getState()
  if (s.draftDeltas.length === 0 && s.assets.length === 0 && s.characterConfigs.length === 0) return ''
  const json = serializeProject(s.draftDeltas, s.characterConfigs, s.assets)
  let source = json
  try {
    source = JSON.stringify(JSON.parse(json), (k, v) => (k === 'blobUrl' ? undefined : v))
  } catch { /* 保持原样 */ }
  return hashString(source)
}

export function getSnapshotBaseline(): string {
  const root = useAppStore.getState().projectRoot
  try {
    return localStorage.getItem(snapshotBaselineKey(root)) ?? ''
  } catch {
    return ''
  }
}

/** 把当前内容记为基线（手动备份成功后调用） */
export function updateSnapshotBaseline(): void {
  const hash = currentContentHash()
  if (!hash) return
  const root = useAppStore.getState().projectRoot
  try {
    localStorage.setItem(snapshotBaselineKey(root), hash)
  } catch { /* ignore */ }
}

/** 当前内容相对基线是否有变化（空内容视为无变化） */
export function isContentChangedSinceBaseline(): boolean {
  const hash = currentContentHash()
  return !!hash && hash !== getSnapshotBaseline()
}
