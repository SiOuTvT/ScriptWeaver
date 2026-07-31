import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseRpy, matchAssets, scanAssetFiles, importRpyDirectory, type RpyImageRef } from '../rpyImporter'

/** 构造内存文件树 mock：dirs 用归一化路径（/）做 key，files 同。 */
function mockFs(tree: { dirs: Record<string, string[]>; files: Record<string, string> }) {
  const norm = (p: string) => p.replace(/\\/g, '/')
  return {
    readdir: async (p: string) => tree.dirs[norm(p)] ?? [],
    readFile: async (p: string) => {
      const c = tree.files[norm(p)]
      if (c === undefined) throw new Error('ENOENT: ' + p)
      return c
    },
    stat: async (p: string) => {
      const n = norm(p)
      if (tree.dirs[n]) return { size: 0, isDir: true }
      if (tree.files[n] !== undefined) return { size: tree.files[n].length, isDir: false }
      return null
    },
  }
}

function installFs(tree: { dirs: Record<string, string[]>; files: Record<string, string> }) {
  ;(window as any).electronAPI = { fs: mockFs(tree) }
}

afterEach(() => {
  delete (window as any).electronAPI
})

describe('parseRpy：变量名与角色显示名彻底解耦', () => {
  it('define gs1 = Character("阿五") 时，UI 展示「阿五」而非变量名 gs1', () => {
    const r = parseRpy(
      `define gs1 = Character("阿五", color="#c8a2c8")\nlabel start:\n    gs1 "你好世界"`,
    )
    expect(r.characters[0]).toMatchObject({ charId: 'gs1', displayName: '阿五' })
    expect(r.deltas.find((d) => d.dialogue === '你好世界')?.speaker).toBe('阿五')
  })

  it('define a5 = Character(\'阿五\') 单引号写法同样解耦', () => {
    const r = parseRpy(`define a5 = Character('阿五')\nlabel start:\n    a5 "测试"`)
    expect(r.characters[0]).toMatchObject({ charId: 'a5', displayName: '阿五' })
    expect(r.deltas.find((d) => d.dialogue === '测试')?.speaker).toBe('阿五')
  })

  it('define 简写字符串声明 "阿五" 同样解耦', () => {
    const r = parseRpy(`define gs1 = "阿五"\nlabel start:\n    gs1 "你好"`)
    expect(r.characters[0]).toMatchObject({ charId: 'gs1', displayName: '阿五' })
    expect(r.deltas.find((d) => d.dialogue === '你好')?.speaker).toBe('阿五')
  })

  it('DynamicCharacter 声明同样解耦', () => {
    const r = parseRpy(`define h1 = DynamicCharacter("小惠")\nlabel start:\n    h1 "在呢"`)
    expect(r.characters[0]).toMatchObject({ charId: 'h1', displayName: '小惠' })
    expect(r.deltas.find((d) => d.dialogue === '在呢')?.speaker).toBe('小惠')
  })

  it('未声明变量名时退化为变量名本身（保守兜底）', () => {
    const r = parseRpy(`label start:\n    gs1 "你好"`)
    expect(r.deltas.find((d) => d.dialogue === '你好')?.speaker).toBe('gs1')
  })
})

describe('parseRpy：跨文件集中声明的全局角色映射注入', () => {
  it('注入 globalCharMap 后，本文件对白也能解析为显示名「阿五」', () => {
    const alone = parseRpy(`label start:\n    gs1 "你好"`)
    expect(alone.deltas.find((d) => d.dialogue === '你好')?.speaker).toBe('gs1')

    const map = new Map<string, string>([['gs1', '阿五']])
    const injected = parseRpy(`label start:\n    gs1 "你好"`, map)
    expect(injected.deltas.find((d) => d.dialogue === '你好')?.speaker).toBe('阿五')
    expect(injected.characters[0]).toMatchObject({ charId: 'gs1', displayName: '阿五' })
  })

  it('本文件局部 define 声明优先级高于全局映射', () => {
    const map = new Map<string, string>([['gs1', '阿五']])
    const r = parseRpy(`define gs1 = Character("阿狸")\nlabel start:\n    gs1 "你好"`, map)
    expect(r.deltas.find((d) => d.dialogue === '你好')?.speaker).toBe('阿狸')
  })
})

describe('parseRpy：image 声明采集变量名与真实路径', () => {
  it('image tp1 = "images/cg/tp1.png" 采集 refName 与 path', () => {
    const r = parseRpy(`image tp1 = "images/cg/tp1.png"\nlabel start:\n    scene tp1`)
    expect(r.referencedImages).toContainEqual<RpyImageRef>({ refName: 'tp1', path: 'images/cg/tp1.png' })
  })

  it('单引号 image 声明同样采集 path', () => {
    const r = parseRpy(`image bg_park = 'images/parks/green_park.png'\nlabel start:\n    scene bg_park`)
    expect(r.referencedImages).toContainEqual<RpyImageRef>({ refName: 'bg_park', path: 'images/parks/green_park.png' })
  })

  it('scene 引用不会覆盖 image 声明中的真实路径', () => {
    const r = parseRpy(`image tp1 = "images/cg/tp1.png"\nlabel start:\n    scene tp1`)
    const ref = r.referencedImages.find((x) => x.refName === 'tp1')
    expect(ref?.path).toBe('images/cg/tp1.png')
  })
})

describe('matchAssets：按真实路径精准归类素材', () => {
  it('变量名简写 tp1 通过真实路径 images/cg/tp1.png 命中素材', () => {
    const refs: RpyImageRef[] = [{ refName: 'tp1', path: 'images/cg/tp1.png' }]
    const found = [{ fileName: 'tp1.png', relativePath: 'images/cg/tp1.png' }]
    const { imageAssets, unmatchedImages } = matchAssets(refs, [], found, [])
    expect(unmatchedImages).toEqual([])
    expect(imageAssets[0]).toMatchObject({ refName: 'tp1', fileName: 'tp1.png', relativePath: 'images/cg/tp1.png' })
  })

  it('path 文件名与变量名不同时，仍按 path 命中（bg_park → green_park.png）', () => {
    const refs: RpyImageRef[] = [{ refName: 'bg_park', path: 'images/parks/green_park.png' }]
    const found = [{ fileName: 'green_park.png', relativePath: 'images/parks/green_park.png' }]
    const { imageAssets } = matchAssets(refs, [], found, [])
    expect(imageAssets[0]).toMatchObject({ refName: 'bg_park', fileName: 'green_park.png' })
  })

  it('无 path 时按变量名匹配（eileen happy → eileen_happy.png）', () => {
    const refs: RpyImageRef[] = [{ refName: 'eileen happy' }]
    const found = [{ fileName: 'eileen_happy.png', relativePath: 'images/eileen_happy.png' }]
    const { imageAssets } = matchAssets(refs, [], found, [])
    expect(imageAssets[0].fileName).toBe('eileen_happy.png')
  })
})

describe('scanAssetFiles：递归扫描素材与脚本', () => {
  it('用 stat 递归含点目录（v1.2）并收集 .rpy / 图片 / 音频', async () => {
    installFs({
      dirs: {
        'game': ['script.rpy', 'images', 'v1.2'],
        'game/images': ['bg.png', 'sound.ogg'],
        'game/v1.2': ['extra.jpg'],
      },
      files: { 'game/script.rpy': 'label start:' },
    })
    const res = await scanAssetFiles('game')
    expect(res.rpyFiles.map((r) => r.relativePath)).toContain('script.rpy')
    expect(res.images.map((i) => i.relativePath)).toEqual(
      expect.arrayContaining(['images/bg.png', 'v1.2/extra.jpg']),
    )
    expect(res.audio.map((a) => a.relativePath)).toContain('images/sound.ogg')
  })
})

describe('importRpyDirectory：全局两阶段解析', () => {
  it('define.rpy 集中声明 + script.rpy 使用，跨文件显示名正确合并', async () => {
    installFs({
      dirs: {
        'game': ['define.rpy', 'script.rpy', 'images'],
        'game/images': ['tp1.png'],
      },
      files: {
        'game/define.rpy': 'define gs1 = Character("阿五")\nimage tp1 = "images/cg/tp1.png"',
        'game/script.rpy': 'label start:\n    gs1 "你好"\n    scene tp1',
      },
    })
    const res = await importRpyDirectory('game')
    // 跨文件：script.rpy 中对白 speaker 必须是「阿五」而非 gs1
    expect(res.deltas.find((d) => d.dialogue === '你好')?.speaker).toBe('阿五')
    expect(res.characters.find((c) => c.charId === 'gs1')?.displayName).toBe('阿五')
    // image 通过真实路径归类到素材管理
    const img = res.imageAssets.find((a) => a.refName === 'tp1')
    expect(img?.fileName).toBe('tp1.png')
    expect(img?.relativePath).toBe('images/tp1.png')
  })

  it('子目录 .rpy 也会被解析', async () => {
    installFs({
      dirs: {
        'game': ['script.rpy', 'sub'],
        'game/sub': ['extra.rpy'],
      },
      files: {
        'game/script.rpy': 'define a5 = Character("阿五")',
        'game/sub/extra.rpy': 'label start:\n    a5 "子目录对白"',
      },
    })
    const res = await importRpyDirectory('game')
    expect(res.deltas.find((d) => d.dialogue === '子目录对白')?.speaker).toBe('阿五')
  })
})
