/**
 * 音频预览管理器
 * 使用 HTML5 Audio 播放素材的 dataUrl 或通过 Electron IPC 按需加载。
 */

import type { AssetItem } from '@/core/types'

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
 * 优先使用 asset.dataUrl（base64），
 * 如果没有则尝试通过 Electron IPC 按需读取。
 */
export async function playAudioPreview(asset: AssetItem): Promise<boolean> {
  stopAudioPreview()

  let src: string | undefined = asset.dataUrl

  // 没有 dataUrl 时尝试 Electron IPC 读取
  if (!src) {
    const api = (window as any).electronAPI
    if (api?.readAssetFile) {
      try {
        const projectRoot = await api.getSessionDir?.() ?? null
        if (projectRoot && asset.relativePath) {
          const result = await api.readAssetFile(asset.relativePath, projectRoot)
          if (result.success && result.dataUrl) {
            src = result.dataUrl
          }
        }
      } catch {
        // 静默失败
      }
    }
  }

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
