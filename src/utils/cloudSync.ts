/**
 * 云端同步 / 版本快照 / 协作 渲染端工具层（v0.6.0 需求 4/4）
 *
 * 现实边界：ScriptWeaver 当前为纯桌面端，没有后端服务器。
 *  - 版本库落地于 userData/snapshots/<projectId>/（本地等价「云端静默备份」）。
 *  - 素材「云端态」为本地状态标识；真正的跨设备同步 / 实时协同需要自建同步服务。
 *  - CloudSyncProvider 抽象已预留：接入真实云后端时，只需实现 push/pull 即可替换本地实现。
 */

import { useAppStore } from '@/stores/appStore'
import type { VersionSnapshotMeta } from '@/core/types'

/** 由项目根目录推导稳定的版本库桶 ID（未保存项目归到 'unsaved'） */
export function projectIdFromRoot(root: string | null): string {
  if (!root) return 'unsaved'
  // 简单稳定哈希（djb2），避免路径中的特殊字符
  let h = 5381
  for (let i = 0; i < root.length; i++) h = ((h << 5) + h + root.charCodeAt(i)) | 0
  return 'p' + (h >>> 0).toString(36)
}

// ===================== 版本快照 =====================

function currentProjectId(): string {
  return projectIdFromRoot(useAppStore.getState().projectRoot)
}

/** 创建版本快照（手动或自动静默备份） */
export async function createSnapshot(projectJson: string, label?: string, auto = false): Promise<boolean> {
  const api = window.electronAPI
  if (!api?.snapshotProject) return false
  const r = await api.snapshotProject({ projectId: currentProjectId(), projectJson, label, auto })
  return r.success
}

/** 列出当前项目的版本快照（按时间倒序） */
export async function listSnapshots(): Promise<VersionSnapshotMeta[]> {
  const api = window.electronAPI
  if (!api?.listSnapshots) return []
  const r = await api.listSnapshots(currentProjectId())
  if (!r.success) return []
  return (r.snapshots as VersionSnapshotMeta[]).filter(Boolean)
}

/** 读取快照完整工程 JSON（用于回滚） */
export async function readSnapshot(id: string): Promise<string | null> {
  const api = window.electronAPI
  if (!api?.restoreSnapshot) return null
  const r = await api.restoreSnapshot(currentProjectId(), id)
  return r.success ? r.projectJson ?? null : null
}

/** 删除快照 */
export async function removeSnapshot(id: string): Promise<boolean> {
  const api = window.electronAPI
  if (!api?.deleteSnapshot) return false
  const r = await api.deleteSnapshot(currentProjectId(), id)
  return r.success
}

// ===================== 素材缓存释放 / 重下载 =====================

/** 释放素材本地缓存（删磁盘文件，保留库内元数据） */
export async function evictAssetCache(relativePath: string): Promise<boolean> {
  const api = window.electronAPI
  if (!api?.evictAssetCache) return false
  const r = await api.evictAssetCache(relativePath)
  return r.success && !!r.removed
}

/** 按需从云端地址重新下载素材 */
export async function downloadAsset(remoteUrl: string, relativePath: string): Promise<boolean> {
  const api = window.electronAPI
  if (!api?.downloadAsset) return false
  const r = await api.downloadAsset(remoteUrl, relativePath)
  return r.success
}

// ===================== 可插拔同步 Provider（接真实云后端用） =====================

export interface CloudSyncProvider {
  readonly kind: 'local' | 'remote'
  /** 推送完整工程到云端 */
  pushProject(projectJson: string): Promise<{ ok: boolean; error?: string }>
  /** 拉取云端工程（无则返回 null） */
  pullProject(): Promise<string | null>
  /** 推送单个素材到云端 */
  pushAsset(relativePath: string, data: ArrayBuffer): Promise<{ ok: boolean; remoteUrl?: string; error?: string }>
  /** 从云端拉取单个素材 */
  pullAsset(remoteUrl: string): Promise<ArrayBuffer | null>
}

/**
 * 本地实现：版本快照即「云端」。它把工程写入 userData/snapshots，
 * 素材推送/拉取走本地会话目录。接真实云后端时替换为 RemoteProvider。
 */
export class LocalCloudProvider implements CloudSyncProvider {
  readonly kind = 'local' as const
  async pushProject(projectJson: string) {
    const ok = await createSnapshot(projectJson, '云端同步（本地）', false)
    return { ok, error: ok ? undefined : '本地建档失败' }
  }
  async pullProject() {
    return null
  }
  async pushAsset() {
    return { ok: false, error: '本地模式不支持素材推送；接入云后端后启用' }
  }
  async pullAsset() {
    return null
  }
}

let activeProvider: CloudSyncProvider | null = null
export function getCloudProvider(): CloudSyncProvider {
  if (!activeProvider) activeProvider = new LocalCloudProvider()
  return activeProvider
}

// ===================== 协作邀请码（离线可分享的描述符） =====================

export interface CollabInvite {
  type: 'sw-collab'
  projectId: string
  name: string
  createdAt: string
}

/** 生成协作邀请码（base64 编码的分享描述符；真实同步需自建服务端解析） */
export function encodeInvite(name: string): string {
  const inv: CollabInvite = {
    type: 'sw-collab',
    projectId: currentProjectId(),
    name: name || '未命名协作',
    createdAt: new Date().toISOString(),
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(inv))))
}

/** 解析协作邀请码 */
export function decodeInvite(code: string): CollabInvite | null {
  try {
    const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim())))) as CollabInvite
    if (obj.type !== 'sw-collab') return null
    return obj
  } catch {
    return null
  }
}
