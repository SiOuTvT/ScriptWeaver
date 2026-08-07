/**
 * 主进程资产安全与分类的纯函数集合。
 *
 * 从 electron/main.ts 抽出，目的是让「安全关键逻辑」可被 Vitest 直接单测，
 * 而无需启动 Electron 运行时。本模块**不依赖 electron**，只依赖 node 内置 `path`，
 * 因此可在纯 Node 环境下测试（防目录穿越 / 扩展名白名单 / 资产分类）。
 *
 * 任何改动都必须保持与 main.ts 原有行为一致 —— 这里是 sw-asset:// 协议的安全边界。
 */
import path from 'path'

export type AssetKind = 'background' | 'sprite' | 'audio' | 'video' | 'effect'

export const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
export const AUDIO_EXTS = ['.mp3', '.ogg', '.wav', '.flac']
export const VIDEO_EXTS = ['.webm', '.mp4', '.ogv', '.mov', '.mkv', '.avi']
export const EFFECT_EXTS = ['.rpy', '.rpym', '.json']

export const ALL_ASSET_EXTS = [...IMG_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS, ...EFFECT_EXTS]

export const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.rpy': 'text/plain',
  '.rpym': 'text/plain',
  '.json': 'application/json',
}

// 统一目录规范（与渲染端 assets/ 约定同名映射）
export const SUBDIR_BACKGROUND = path.join('images', 'background')
export const SUBDIR_SPRITE = path.join('images', 'sprite')
export const SUBDIR_AUDIO = 'audio'
export const SUBDIR_VIDEO = 'video'
export const SUBDIR_EFFECT = 'effects'

/**
 * 扩展名白名单：仅允许已知素材类型，杜绝任意文件经 sw-asset:// 流出。
 * 大小写不敏感（磁盘扩展名可能大写）。
 */
export function isAllowedAssetExt(ext: string): boolean {
  return ALL_ASSET_EXTS.includes(ext.toLowerCase())
}

/**
 * 防目录穿越：候选绝对路径必须严格落在 <assetsDir> 子树内。
 * 仅当 abs 等于 assetsDir 本身，或以 `assetsDir + path.sep` 开头时才放行。
 * 这是 sw-asset:// 协议的安全核心，任何改动都须保持此语义。
 */
export function isWithinAssetsDir(assetsDir: string, abs: string): boolean {
  return abs === assetsDir || abs.startsWith(assetsDir + path.sep)
}

/** 依据扩展名与 kind 决定落盘子目录 */
export function resolveSubdir(ext: string, kind?: AssetKind): { subdir: string; type: AssetKind } {
  if (VIDEO_EXTS.includes(ext)) return { subdir: SUBDIR_VIDEO, type: 'video' }
  if (EFFECT_EXTS.includes(ext)) return { subdir: SUBDIR_EFFECT, type: 'effect' }
  if (AUDIO_EXTS.includes(ext)) return { subdir: SUBDIR_AUDIO, type: 'audio' }
  if (kind === 'background') return { subdir: SUBDIR_BACKGROUND, type: 'background' }
  if (kind === 'video') return { subdir: SUBDIR_VIDEO, type: 'video' }
  if (kind === 'effect') return { subdir: SUBDIR_EFFECT, type: 'effect' }
  return { subdir: SUBDIR_SPRITE, type: 'sprite' }
}

/** 依据磁盘绝对路径推断资产类型（用于扫描 / 监听） */
export function classifyAsset(abs: string): AssetKind | null {
  const ext = path.extname(abs).toLowerCase()
  const normalized = abs.replace(/\\/g, '/')
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (EFFECT_EXTS.includes(ext)) return 'effect'
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  if (IMG_EXTS.includes(ext)) {
    return normalized.includes('/images/background/') ? 'background' : 'sprite'
  }
  return null
}
