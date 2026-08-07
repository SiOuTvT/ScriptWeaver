import { describe, it, expect } from 'vitest'
import {
  isAllowedAssetExt,
  isWithinAssetsDir,
  classifyAsset,
  resolveSubdir,
  ALL_ASSET_EXTS,
} from '../assetSecurity'

describe('isAllowedAssetExt（扩展名白名单）', () => {
  it('允许已知素材扩展名（大小写不敏感）', () => {
    expect(isAllowedAssetExt('.png')).toBe(true)
    expect(isAllowedAssetExt('.PNG')).toBe(true)
    expect(isAllowedAssetExt('.mp3')).toBe(true)
    expect(isAllowedAssetExt('.webm')).toBe(true)
    expect(isAllowedAssetExt('.json')).toBe(true)
  })

  it('拒绝任意非白名单扩展名（防任意文件流出）', () => {
    expect(isAllowedAssetExt('.exe')).toBe(false)
    expect(isAllowedAssetExt('.bat')).toBe(false)
    expect(isAllowedAssetExt('.txt')).toBe(false)
    expect(isAllowedAssetExt('')).toBe(false)
    expect(isAllowedAssetExt('png')).toBe(false) // 必须带点
  })

  it('白名单集合非空且覆盖图片/音频/视频/特效', () => {
    expect(ALL_ASSET_EXTS.length).toBeGreaterThan(10)
  })
})

describe('isWithinAssetsDir（防目录穿越）', () => {
  const assetsDir = '/proj/assets'

  it('精确等于 assets 目录本身 → 放行', () => {
    expect(isWithinAssetsDir(assetsDir, '/proj/assets')).toBe(true)
  })

  it('落在 assets 子树内 → 放行', () => {
    expect(isWithinAssetsDir(assetsDir, '/proj/assets/bg.png')).toBe(true)
    expect(isWithinAssetsDir(assetsDir, '/proj/assets/sub/deep/x.mp3')).toBe(true)
  })

  it('同名前缀陷阱（/assets-evil）一律拒绝', () => {
    expect(isWithinAssetsDir(assetsDir, '/proj/assets-evil/x.png')).toBe(false)
    expect(isWithinAssetsDir(assetsDir, '/proj/assets2/x.png')).toBe(false)
  })

  it('兄弟目录 / 父目录 / 完全无关路径 → 拒绝', () => {
    expect(isWithinAssetsDir(assetsDir, '/proj/other/x.png')).toBe(false)
    expect(isWithinAssetsDir(assetsDir, '/proj/x.png')).toBe(false)
    expect(isWithinAssetsDir(assetsDir, '/etc/passwd')).toBe(false)
  })
})

describe('classifyAsset（磁盘路径推断资产类型）', () => {
  it('按扩展名与目录推断类型', () => {
    expect(classifyAsset('/p/assets/images/background/bg.png')).toBe('background')
    expect(classifyAsset('/p/assets/images/sprite/al.png')).toBe('sprite')
    expect(classifyAsset('/p/assets/audio/x.mp3')).toBe('audio')
    expect(classifyAsset('/p/assets/video/x.mp4')).toBe('video')
    expect(classifyAsset('/p/assets/effects/fx.rpy')).toBe('effect')
  })

  it('未知扩展名 → null', () => {
    expect(classifyAsset('/p/assets/x.txt')).toBeNull()
    expect(classifyAsset('/p/x.log')).toBeNull()
  })
})

describe('resolveSubdir（落盘子目录）', () => {
  it('按扩展名决定子目录与类型', () => {
    expect(resolveSubdir('.mp4')).toEqual({ subdir: 'video', type: 'video' })
    expect(resolveSubdir('.json')).toEqual({ subdir: 'effects', type: 'effect' })
    expect(resolveSubdir('.mp3')).toEqual({ subdir: 'audio', type: 'audio' })
  })

  it('图片按 kind 区分背景 / 立绘，缺省立绘', () => {
    expect(resolveSubdir('.png', 'background')).toEqual({
      subdir: expect.stringContaining('background'),
      type: 'background',
    })
    expect(resolveSubdir('.png').type).toBe('sprite')
  })
})
