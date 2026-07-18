/**
 * 资产文件夹增量同步。
 *
 * 监听主进程通过 fs.watch 推送的 'asset:changed' 事件，
 * 仅调用既有的 addAsset / deleteAsset action 做增量同步，
 * 不触碰 Zustand 状态机内核（reducer / positionSlots / delta 结构）。
 */

import { useAppStore } from '@/stores/appStore'
import type { AssetType } from '@/core/types'

interface AssetChangePayload {
  relativePath: string
  type: AssetType
  exists: boolean
}

let _bound = false

/** 从相对路径推导显示名 / 文件名 */
function baseName(relativePath: string): string {
  const parts = relativePath.split('/')
  return parts[parts.length - 1] || relativePath
}

/** 绑定文件夹监听（幂等，多次调用只生效一次） */
export function bindAssetWatcher(): void {
  const api = window.electronAPI
  if (!api || _bound) return
  _bound = true

  api.on('asset:changed', (payload: unknown) => {
    const e = payload as AssetChangePayload
    if (!e || !e.relativePath) return

    const store = useAppStore.getState()
    const existing = store.assets.find((a) => a.relativePath === e.relativePath)

    if (e.exists) {
      // 新增文件（磁盘出现、库中没有）→ 复用 addAsset
      if (!existing) {
        const fileName = baseName(e.relativePath)
        store.addAsset({
          id: `disk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: e.type,
          name: fileName.replace(/\.[^.]+$/, ''),
          fileName,
          relativePath: e.relativePath,
          importedAt: new Date().toISOString(),
        })
      }
      // 已存在（内容变更）：src 基于 relativePath，协议 no-cache 已保证刷新，无需改库
    } else if (existing) {
      // 文件被删除（磁盘消失、库中仍有）→ 复用 deleteAsset（含角色引用校验）
      store.deleteAsset(existing.id)
    }
  })
}
