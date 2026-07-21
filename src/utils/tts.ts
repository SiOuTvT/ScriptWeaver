/**
 * TTS 一键合成辅助（渲染端）。
 *
 * 复用主进程持有的 AI 密钥与接口（OpenAI 兼容 /audio/speech），
 * 由主进程把音频落盘到会话目录并返回素材元数据，渲染端据此建 AssetItem。
 * 同时提供读取音频真实时长的工具，用于时间轴自动吸附与播放停留时长。
 */

import type { AssetItem } from '@/core/types'
import { resolveAssetSrc } from '@/utils/assetSrc'

export interface TtsSynthesizePayload {
  /** 待合成文本（台词） */
  text: string
  /** 音色 ID（OpenAI 系如 alloy；微软系如 zh-CN-XiaoxiaoNeural） */
  voiceId: string
  /** 角色 ID（用于生成稳定的 voice 类素材 ID 与文件名） */
  charId: string
  /** 行标签（如 L3），用于文件名去重 */
  lineTag: string
  /** 语速 0.25~4 */
  speed?: number
  /** 音调（仅 SSML 兼容提供方生效） */
  pitch?: number
  /** 输出格式 */
  format?: 'mp3' | 'wav' | 'ogg'
}

export interface TtsResult {
  id: string
  fileName: string
  relativePath: string
}

/** 调用主进程合成语音，返回素材元数据（二进制已落盘，不进渲染端内存） */
export async function synthesizeVoice(payload: TtsSynthesizePayload): Promise<TtsResult> {
  const api = window.electronAPI
  if (!api?.ttsSynthesize) {
    throw new Error('当前环境不支持 TTS 合成（需在 Electron 桌面端运行）')
  }
  const res = await api.ttsSynthesize(payload)
  if (!res || !res.success || !res.asset) {
    throw new Error(res?.error || 'TTS 合成失败')
  }
  return res.asset
}

/**
 * 读取音频真实时长（秒）。用于时间轴吸附与播放停留时长计算。
 * 通过 sw-asset:// 协议加载元数据（不整段下载），失败返回 0。
 */
export function getAudioDuration(asset: AssetItem): Promise<number> {
  return new Promise((resolve) => {
    const src = resolveAssetSrc(asset)
    if (!src) {
      resolve(0)
      return
    }
    const el = document.createElement('audio')
    el.preload = 'metadata'
    el.src = src
    el.onloadedmetadata = () => resolve(el.duration || 0)
    el.onerror = () => resolve(0)
  })
}
