/**
 * 音频预览混音管理器（四通道架构雏形）
 *
 * 设计目标：应用内试听向导出的四通道（bgm / ambient / se / voice）靠拢——
 *   - bgm、ambient 为「常驻通道」：各自独立、循环播放，互不打断；
 *   - se、voice 为「一次性通道」：独立新建短生命周期元素，与 bgm/ambient 自然重叠；
 *   - 任意通道皆可通过 toggleAssetPreview 按资产精准切换，实现「放 bgm 的同时叠 se/voice」。
 *
 * 经 sw-asset:// 协议流式直读，二进制不进内存。
 */

import type { AssetItem } from '@/core/types'
import { resolveAssetSrc } from '@/utils/assetSrc'
import { getAudioCategory } from '@/utils/assetHelpers'

// 常驻通道元素（懒创建，复用不重建，避免爆音）
let bgmEl: HTMLAudioElement | null = null
let ambientEl: HTMLAudioElement | null = null
// 当前常驻通道正在播放的素材 ID
let bgmId: string | null = null
let ambientId: string | null = null

// 一次性通道（se / voice）：每个素材一个独立元素，播放完自动回收
const oneShots = new Set<HTMLAudioElement>()
const oneShotIds = new Set<string>()

// ---- 轻量订阅：让 React UI 能随播放状态变化重渲染（含播放自然结束时自动复位图标）----
let version = 0
const listeners = new Set<() => void>()

/** 订阅播放状态变化（配合 useSyncExternalStore 使用） */
export function subscribeAudio(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** 当前播放状态版本号（getSnapshot） */
export function getAudioVersion(): number {
  return version
}

function notify(): void {
  version++
  for (const l of listeners) l()
}

function ensureEl(kind: 'bgm' | 'ambient'): HTMLAudioElement {
  const el = kind === 'bgm' ? bgmEl : ambientEl
  if (el) return el
  const created = document.createElement('audio')
  created.style.display = 'none'
  created.loop = true
  created.volume = kind === 'bgm' ? 0.6 : 0.4
  document.body.appendChild(created)
  if (kind === 'bgm') bgmEl = created
  else ambientEl = created
  return created
}

function stopBgm(): void {
  if (bgmEl) {
    bgmEl.pause()
    bgmEl.currentTime = 0
  }
  bgmId = null
  notify()
}

function stopAmbient(): void {
  if (ambientEl) {
    ambientEl.pause()
    ambientEl.currentTime = 0
  }
  ambientId = null
  notify()
}

function stopOneShots(): void {
  for (const el of oneShots) {
    try {
      el.pause()
      el.removeAttribute('src')
      if (el.parentNode) el.parentNode.removeChild(el)
    } catch {
      /* noop */
    }
  }
  oneShots.clear()
  oneShotIds.clear()
  notify()
}

/** 停止全部通道预览 */
export function stopAudioPreview(): void {
  stopBgm()
  stopAmbient()
  stopOneShots()
}

/** 是否有任意通道正在播放 */
export function isAudioPlaying(): boolean {
  if (bgmEl && !bgmEl.paused) return true
  if (ambientEl && !ambientEl.paused) return true
  return oneShots.size > 0
}

/** 指定素材是否正在播放（用于按资产精准切换图标） */
export function isAssetPlaying(assetId: string): boolean {
  return bgmId === assetId || ambientId === assetId || oneShotIds.has(assetId)
}

/** 按素材试听（路由到对应通道，不打断其它通道） */
export async function playAudioPreview(asset: AssetItem): Promise<boolean> {
  const src = resolveAssetSrc(asset)
  if (!src) {
    console.warn(`[AudioPreview] 无法获取音频数据: ${asset.name}`)
    return false
  }

  const cat = getAudioCategory(asset.id)

  if (cat === 'bgm' || cat === 'ambient') {
    const el = ensureEl(cat)
    // 先挂载再设 src，确保媒体管线就绪
    el.src = src
    el.load()
    if (cat === 'bgm') {
      el.volume = 0.6
      bgmId = asset.id
    } else {
      el.volume = 0.4
      ambientId = asset.id
    }
    try {
      await el.play()
      notify()
      return true
    } catch (err) {
      console.error(`[AudioPreview] 播放失败: ${asset.name}`, err)
      if (cat === 'bgm') bgmId = null
      else ambientId = null
      notify()
      return false
    }
  }

  // se / voice：一次性通道，与常驻通道自然重叠
  const el = document.createElement('audio')
  el.style.display = 'none'
  el.preload = 'auto'
  el.volume = 0.7
  // 关键：先挂 DOM 再设 src，否则 Electron 自定义协议下可能加载失败
  document.body.appendChild(el)
  el.src = src
  el.load()
  oneShotIds.add(asset.id)
  oneShots.add(el)
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try { el.removeAttribute('src') } catch { /* noop */ }
    if (el.parentNode) el.parentNode.removeChild(el)
    oneShots.delete(el)
    oneShotIds.delete(asset.id)
    notify()
  }
  el.onended = cleanup
  el.onerror = cleanup
  try {
    await el.play()
    notify()
    return true
  } catch (err) {
    console.error(`[AudioPreview] 播放失败: ${asset.name}`, err)
    cleanup()
    return false
  }
}

/**
 * 按资产切换试听：同一素材再次点击即停其通道，否则叠加播放。
 * 这样「先点 BGM、再点环境音、再点音效」能让四通道同时响起。
 */
export function toggleAssetPreview(asset: AssetItem): void {
  const cat = getAudioCategory(asset.id)
  if (cat === 'bgm') {
    if (bgmId === asset.id) stopBgm()
    else void playAudioPreview(asset)
  } else if (cat === 'ambient') {
    if (ambientId === asset.id) stopAmbient()
    else void playAudioPreview(asset)
  } else {
    if (oneShotIds.has(asset.id)) stopOneShots()
    else void playAudioPreview(asset)
  }
}
