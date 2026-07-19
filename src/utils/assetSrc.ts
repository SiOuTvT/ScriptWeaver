/**
 * 素材 URL 统一解析。
 *
 * 全站所有 <img>/<audio>/background-image 的 src 都必须经此函数解析，
 * 杜绝散落的 dataUrl 直用。
 *
 * - Electron 模式：返回 sw-asset://asset/<relativePath>，由主进程流式直读硬盘，二进制永不进内存。
 * - Web 降级模式：返回临时 blobUrl（URL.createObjectURL 结果）。
 */

import type { AssetItem } from '@/core/types'

export function resolveAssetSrc(asset: AssetItem | undefined | null): string | undefined {
  if (!asset) return undefined
  // Web 降级：临时对象 URL
  if (asset.blobUrl) return asset.blobUrl
  // Electron：协议直读。
  // 注意 sw-asset 是 standard 协议，URL 中 "sw-asset://<host>/<path>" 的 <host> 段会被
  // URL 解析器吞掉，因此这里必须用固定哨兵主机 "asset"，并把完整 relativePath 放在 path 里：
  //   sw-asset://asset/assets/images/sprite/x.png  →  host="asset"  pathname="/assets/images/sprite/x.png"
  // 协议 handler 据此还原出 root/assets/images/sprite/x.png。绝对不能写成 sw-asset://assets/...（会被吃掉 assets/ 前缀 → 404）。
  if (!asset.relativePath) return undefined
  const rel = asset.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return `sw-asset://asset/${rel}`
}
