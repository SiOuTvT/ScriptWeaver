/**
 * 音频预览管理器
 * 使用 HTML5 Audio 播放素材：Electron 模式经 sw-asset:// 协议流式直读，Web 模式用 blobUrl。
 */

import type { AssetItem } from '@/core/types'
import { resolveAssetSrc } from '@/utils/assetSrc'

let _currentAudio: HTMLAudioElement | null = null

/** 停止当前正在播放的预览 */
export function stopAudioPreview(): void {
  if (_currentAudio) {
    _currentAudio.pause()
    _currentAudio.currentTime = 0
    _currentAudio = null
  }
}

/**
 * 播放素材预览。
 * 通过 resolveAssetSrc 获取播放源（sw-asset:// 协议 URL 或 blobUrl），二进制不进内存。
 */
export async function playAudioPreview(asset: AssetItem): Promise<boolean> {
  stopAudioPreview()

  const src = resolveAssetSrc(asset)

  if (!src) {
    console.warn(`[AudioPreview] 无法获取音频数据: ${asset.name}`)
    return false
  }

  return new Promise((resolve) => {
    const audio = new Audio(src)
    _currentAudio = audio

    audio.volume = 0.6

    audio.onended = () => {
      _currentAudio = null
      resolve(true)
    }

    audio.onerror = () => {
      console.error(`[AudioPreview] 播放失败: ${asset.name}`)
      _currentAudio = null
      resolve(false)
    }

    audio.play().catch((err) => {
      console.error(`[AudioPreview] 播放异常: ${asset.name}`, err)
      _currentAudio = null
      resolve(false)
    })
  })
}

/** 当前是否正在播放 */
export function isAudioPlaying(): boolean {
  return _currentAudio !== null && !_currentAudio.paused
}
