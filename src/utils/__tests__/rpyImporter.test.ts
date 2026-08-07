import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseRpy, matchAssets, scanAssetFiles, importRpyDirectory, parseDisplayStatement, normalizeAudioRef, canonicalizeImportedAssets, type RpyImageRef } from '../rpyImporter'
import type { AssetItem } from '../../core/types'
import { reduceLines } from '../../core/reducer'
import { buildBundle } from '../rpyExporter'

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
    const ref = r.referencedImages.find((x) => x.refName === 'tp1')
    expect(ref?.path).toBe('images/cg/tp1.png')
    expect(ref?.usage).toBe('background')
  })

  it('单引号 image 声明同样采集 path', () => {
    const r = parseRpy(`image bg_park = 'images/parks/green_park.png'\nlabel start:\n    scene bg_park`)
    const ref = r.referencedImages.find((x) => x.refName === 'bg_park')
    expect(ref?.path).toBe('images/parks/green_park.png')
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

describe('matchAssets：refName 模糊匹配取最佳而非遍历最后一个', () => {
  it('存在精确文件名时，优先于其它包含 refName 的文件', () => {
    const refs: RpyImageRef[] = [{ refName: 'js1' }]
    // 故意把非精确项排在前面，验证结果不依赖遍历顺序
    const found = [
      { fileName: 'js1_happy.png', relativePath: 'js1_happy.png' },
      { fileName: 'js1.png', relativePath: 'js1.png' },
      { fileName: 'js1_gc.png', relativePath: 'js1_gc.png' },
    ]
    const { imageAssets } = matchAssets(refs, [], found, [])
    expect(imageAssets[0].fileName).toBe('js1.png')
  })

  it('无精确文件名时，取以 refName 加分隔符开头的文件，而非仅包含 refName 的文件', () => {
    const refs: RpyImageRef[] = [{ refName: 'eileen' }]
    const found = [
      { fileName: 'myeileen.png', relativePath: 'myeileen.png' }, // 仅包含 -> 低分
      { fileName: 'eileen_happy.png', relativePath: 'eileen_happy.png' }, // 分隔符前缀 -> 高分
    ]
    const { imageAssets } = matchAssets(refs, [], found, [])
    expect(imageAssets[0].fileName).toBe('eileen_happy.png')
  })

  it('分隔符前缀匹配高于「refName 包含文件名片段」的弱匹配', () => {
    const refs: RpyImageRef[] = [{ refName: 'eileen_happy' }]
    const found = [
      { fileName: 'eileen.png', relativePath: 'eileen.png' }, // 'eileen_happy'.includes('eileen') -> 10
      { fileName: 'eileen_happy.png', relativePath: 'eileen_happy.png' }, // 精确 -> 100
    ]
    const { imageAssets } = matchAssets(refs, [], found, [])
    expect(imageAssets[0].fileName).toBe('eileen_happy.png')
  })
})

describe('normalizeAudioRef：音频引用归一化（导入重映射用）', () => {
  it('去 sw-audio: 前缀', () => {
    expect(normalizeAudioRef('sw-audio:nhjj')).toBe('nhjj')
  })

  it('去扩展名（se 引用常带扩展名，素材 key 不带）', () => {
    expect(normalizeAudioRef('nhjj.wav')).toBe('nhjj')
    expect(normalizeAudioRef('zoulu.ogg')).toBe('zoulu')
  })

  it('去控制标签与引号', () => {
    expect(normalizeAudioRef('<from 0.8 to 4.5>zoulu.wav')).toBe('zoulu')
    expect(normalizeAudioRef('"ls.ogg"')).toBe('ls')
  })

  it('组合场景：带前缀 + 扩展名', () => {
    expect(normalizeAudioRef('sw-audio:jy.mp3')).toBe('jy')
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

describe('parseRpy：default 角色声明与真实项目语法', () => {
  it('default js1 = Character("溪") 解耦为显示名「溪」', () => {
    const r = parseRpy(`default js1 = Character("溪")\nlabel start:\n    js1 "你好"`)
    expect(r.characters[0]).toMatchObject({ charId: 'js1', displayName: '溪' })
    expect(r.deltas.find((d) => d.dialogue === '你好')?.speaker).toBe('溪')
  })

  it('scene bj1: 冒号不吞入素材名，ATL 属性行不产生垃圾对白', () => {
    const src = `image bj1 = "cd.jpg"\nlabel start:\n    scene bj1:\n        zoom 2.0\n        xalign 0.5\n    "旁白"`
    const r = parseRpy(src)
    expect(r.deltas.find((d) => d.background?.asset_id)?.background?.asset_id).toBe('bj1')
    expect(r.deltas.filter((d) => d.dialogue).map((d) => d.dialogue)).toEqual(['旁白'])
    expect(r.referencedImages.find((x) => x.refName === 'bj1')?.usage).toBe('background')
    expect(r.referencedImages.find((x) => x.refName === 'bj1')?.path).toBe('cd.jpg')
  })

  it('transform 块内容被跳过，不产生垃圾行', () => {
    const src = `transform f:\n    zoom 1.0\n    xalign 0.5\n    yalign 0.5\nlabel start:\n    "正文"`
    const r = parseRpy(src)
    expect(r.deltas.filter((d) => d.dialogue).map((d) => d.dialogue)).toEqual(['正文'])
  })

  it('show X: 冒号剥离 + usage=sprite', () => {
    const src = `image js2g = "z-gc.png"\nlabel start:\n    show js2g:\n        zoom 1.0\n        yalign 0.5\n    js2g "对白"`
    const r = parseRpy(src)
    expect(r.referencedImages.find((x) => x.refName === 'js2g')?.usage).toBe('sprite')
    expect(r.deltas.find((d) => d.dialogue === '对白')?.speaker).toBe('js2g')
  })

  it('play sound "<from 0.8 to 4.5>zoulu.wav" 剥离控制标签', () => {
    const r = parseRpy(`label start:\n    play sound "<from 0.8 to 4.5>zoulu.wav"`)
    expect(r.referencedAudio).toEqual([{ path: 'zoulu.wav', type: 'se' }])
    expect(r.deltas.find((d) => d.audio?.se?.length)?.audio?.se).toEqual(['zoulu.wav'])
  })

  it('hide 从累积舞台中移除立绘（下一条对白 beat 不应再含该立绘）', () => {
    const r = parseRpy(`default js1 = Character("溪")\nlabel start:\n    show js1 at f\n    hide js1 with dissolve\n    "旁白"`)
    // hide 不应再出现在合并后的对白 beat 中
    const beat = r.deltas.find((d) => d.dialogue === '旁白')
    expect(beat).toBeTruthy()
    expect(Object.keys(beat!.characters || {}).length).toBe(0)
  })

  it('hide 后又有 show 则新立绘落到后续对白 beat', () => {
    const r = parseRpy(`default js1 = Character("溪")\ndefault js2 = Character("罪")\nlabel start:\n    show js1 at f\n    hide js1 with dissolve\n    show js2 at f\n    js2 "对白"`)
    const beat = r.deltas.find((d) => d.dialogue === '对白')
    expect(beat?.characters?.js2).toBeTruthy()
    expect(beat?.characters?.js1).toBeFalsy()
  })

  it('连续对白保持立绘与背景（持久态，非每次清空）', () => {
    const src = `label start:\n    scene bj1\n    show js1 at f\n    js1 "你好"\n    js1 "再见"`
    const r = parseRpy(src)
    const beats = r.deltas.filter((d) => d.dialogue)
    expect(beats.length).toBe(2)
    expect(beats[0].background?.asset_id).toBe('bj1')
    expect(beats[0].characters?.js1).toBeTruthy()
    expect(beats[1].background?.asset_id).toBe('bj1') // 背景持续保留
    expect(beats[1].characters?.js1).toBeTruthy() // 立绘持续保留
  })
})

describe('parseRpy：transform 位置/缩放落实到场景预览', () => {
  it('show X at f 应用 transform 定义（xalign 后被 xpos 覆盖，锚点保持 0.5）', () => {
    const src = `transform f:\n    zoom 1.0\n    xalign 0.5\n    yalign 0.5\n    xpos 350\n    ypos 650\nlabel start:\n    show js1 at f`
    const r = parseRpy(src)
    const showDelta = r.deltas.find((d) => {
      const c = Object.values(d.characters || {})[0]
      return c?.action === 'show'
    })
    const entry = showDelta ? Object.values(showDelta.characters)[0] : null
    expect(entry?.pos_x).toBeCloseTo(350 / 1920, 3)
    expect(entry?.pos_y).toBeCloseTo(650 / 1080, 3)
    // xalign 0.5 先设了锚点，之后的 xpos 只覆盖位置不动锚点（Ren'Py 顺序覆盖语义）
    expect(entry?.anchor_x).toBe(0.5)
    expect(entry?.anchor_y).toBe(0.5)
    expect(entry?.renpy_zoom).toBe(1)
  })

  it('show X: 内联 ATL 属性（zoom/xpos/ypos）落实且不吞后续对白', () => {
    const src = `label start:\n    show js2g:\n        zoom 1.0\n        yalign 0.5\n        xpos 950\n        ypos 600\n    "对白"`
    const r = parseRpy(src)
    const showDelta = r.deltas.find((d) => {
      const c = Object.values(d.characters || {})[0]
      return c?.action === 'show'
    })
    const entry = showDelta ? Object.values(showDelta.characters)[0] : null
    expect(entry?.pos_x).toBeCloseTo(950 / 1920, 3)
    expect(entry?.pos_y).toBeCloseTo(600 / 1080, 3)
    expect(entry?.anchor_y).toBe(0.5)
    expect(entry?.renpy_zoom).toBe(1)
    expect(r.deltas.find((d) => d.dialogue === '对白')).toBeTruthy()
  })

  it('gui.init(1280, 720) 分辨率参与换算', () => {
    const src = `init python:\n    gui.init(1280, 720)\nlabel start:\n    show js1 at f\n\ninit offset = -2\n\ntransform f:\n    xpos 350\n    ypos 650`
    const r = parseRpy(src)
    expect(r.screen).toEqual({ width: 1280, height: 720 })
    const showDelta = r.deltas.find((d) => {
      const c = Object.values(d.characters || {})[0]
      return c?.action === 'show'
    })
    const entry = showDelta ? Object.values(showDelta.characters)[0] : null
    expect(entry?.pos_x).toBeCloseTo(350 / 1280, 3)
    expect(entry?.pos_y).toBeCloseTo(650 / 720, 3)
  })

  it('transform 定义跨文件合并（importRpyDirectory 两阶段注入）', async () => {
    installFs({
      dirs: {
        'game': ['transforms.rpy', 'script.rpy'],
      },
      files: {
        'game/transforms.rpy': 'transform f:\n    zoom 0.8\n    xpos 1500\n    ypos 650',
        'game/script.rpy': 'label start:\n    show js1 at f',
      },
    })
    const res = await importRpyDirectory('game')
    const showDelta = res.deltas.find((d) => {
      const c = Object.values(d.characters || {})[0]
      return c?.action === 'show'
    })
    const entry = showDelta ? Object.values(showDelta.characters)[0] : null
    expect(entry?.pos_x).toBeCloseTo(1500 / 1920, 3)
    expect(entry?.pos_y).toBeCloseTo(650 / 1080, 3)
    expect(entry?.renpy_zoom).toBe(0.8)
  })
})

describe('parseDisplayStatement：对齐 Ren-Py 官方 show/scene 语法的子句解析', () => {
  it('拆分图片名（标签 + 属性）而非按空格截断只取首词', () => {
    const st = parseDisplayStatement('eileen happy vhappy')
    expect(st.name).toEqual(['eileen', 'happy', 'vhappy'])
  })

  it('同时解析 at / with，且不把属性误当图片名', () => {
    const st = parseDisplayStatement('eileen happy at right with dissolve')
    expect(st.name).toEqual(['eileen', 'happy'])
    expect(st.at).toEqual(['right'])
    expect(st.transition).toBe('dissolve')
  })

  it('支持 at 链式（at a, b）', () => {
    const st = parseDisplayStatement('eileen at left, flip')
    expect(st.at).toEqual(['left', 'flip'])
  })

  it('解析 as / behind / zorder / onlayer 子句', () => {
    const st = parseDisplayStatement('eileen as e2 behind lucy, mary zorder 3 onlayer master')
    expect(st.name).toEqual(['eileen'])
    expect(st.alias).toBe('e2')
    expect(st.behind).toEqual(['lucy', 'mary'])
    expect(st.zorder).toBe(3)
    expect(st.onlayer).toBe('master')
  })

  it('工厂式过渡取基名，with None 视为无过渡', () => {
    expect(parseDisplayStatement('bg room with Dissolve(0.5)').transition).toBe('dissolve')
    expect(parseDisplayStatement('bg room with None').transition).toBeUndefined()
  })
})

describe('parseRpy：with 过渡与 at 站位严格还原脚本定义', () => {
  it('scene X with fade 的过渡不再被丢弃', () => {
    const r = parseRpy('label start:\n    scene bj1 with fade\n    "台词"')
    const d = r.deltas.find((x) => x.background)
    expect(d?.background?.asset_id).toBe('bj1')
    expect(d?.background?.transition).toBe('fade')
  })

  it('show X 属性（表情）保留进 sprite_id，不再只取首词', () => {
    const r = parseRpy('label start:\n    show eileen happy\n    "台词"')
    const d = r.deltas.find((x) => Object.keys(x.characters || {}).length > 0)
    const entry = d ? Object.values(d.characters)[0] : null
    expect(entry?.sprite_id).toBe('eileen happy')
    // 素材引用同样按完整图片名登记，才能匹配到 eileen_happy.png
    expect(r.referencedImages.some((ref) => ref.refName === 'eileen happy')).toBe(true)
  })

  it('at 内建位置 left / right 落实为站位，而非一律居中', () => {
    const r = parseRpy('label start:\n    show a at left\n    "台词1"\n    show b at right\n    "台词2"')
    const d1 = r.deltas.find((x) => x.dialogue === '台词1')
    const d2 = r.deltas.find((x) => x.dialogue === '台词2')
    expect(Object.values(d1!.characters)[0].position_slot).toBe('left')
    expect(Object.values(d2!.characters).find((c) => c.sprite_id === 'b')?.position_slot).toBe('right')
  })

  it('show ... with 的过渡落到该立绘上', () => {
    const r = parseRpy('label start:\n    show eileen happy at right with dissolve\n    "台词"')
    const d = r.deltas.find((x) => Object.keys(x.characters || {}).length > 0)
    const entry = d ? Object.values(d.characters)[0] : null
    expect(entry?.transition).toBe('dissolve')
    expect(entry?.position_slot).toBe('right')
  })

  it('独立成行的 with 回填给此前累积的背景与立绘', () => {
    const r = parseRpy('label start:\n    scene bj1\n    show eileen\n    with dissolve\n    "台词"')
    const d = r.deltas.find((x) => x.dialogue === '台词')
    expect(d?.background?.transition).toBe('dissolve')
    expect(Object.values(d!.characters)[0].transition).toBe('dissolve')
  })

  it('过渡只在切换那一 beat 生效，不会在后续行重复播放', () => {
    const r = parseRpy('label start:\n    scene bj1 with fade\n    "第一句"\n    "第二句"')
    const d1 = r.deltas.find((x) => x.dialogue === '第一句')
    const d2 = r.deltas.find((x) => x.dialogue === '第二句')
    expect(d1?.background?.transition).toBe('fade')
    // 背景本身延续，但过渡不再重复
    expect(d2?.background?.asset_id).toBe('bj1')
    expect(d2?.background?.transition).toBeUndefined()
  })

  it('hide 能移除未登记为角色的立绘（必须显式下达移除指令）', () => {
    const r = parseRpy('label start:\n    show prop1\n    "第一句"\n    hide prop1\n    "第二句"')
    const d2 = r.deltas.find((x) => x.dialogue === '第二句')
    // 舞台按「继承 + 变化量」归约，只从累积器删掉不够，必须显式发出移除指令
    expect(Object.values(d2?.characters ?? {})[0]?.action).toBe('__CLEAR__')
    // 归约后立绘确实不在场
    const states = reduceLines(r.deltas)
    const idx = r.deltas.findIndex((x) => x.dialogue === '第二句')
    expect(Object.keys(states[idx].characters)).toHaveLength(0)
  })

  it('hide X with dissolve 保留退场帧，动画播完下一行才真正消失', () => {
    const r = parseRpy(
      'label start:\n    show prop1\n    "第一句"\n    hide prop1 with dissolve\n    "第二句"\n    "第三句"',
    )
    const states = reduceLines(r.deltas)
    const i2 = r.deltas.findIndex((x) => x.dialogue === '第二句')
    const i3 = r.deltas.findIndex((x) => x.dialogue === '第三句')
    const exit = Object.values(states[i2].characters)[0]
    expect(exit?.exiting).toBe(true)
    expect(exit?.transition).toBe('dissolve')
    expect(Object.keys(states[i3].characters)).toHaveLength(0)
  })

  it('scene 清场时同批立绘随整屏过渡一起退场', () => {
    const r = parseRpy(
      'label start:\n    show prop1\n    "第一句"\n    scene bg2 with fade\n    "第二句"',
    )
    const states = reduceLines(r.deltas)
    const i2 = r.deltas.findIndex((x) => x.dialogue === '第二句')
    const exit = Object.values(states[i2].characters)[0]
    expect(exit?.exiting).toBe(true)
    expect(exit?.transition).toBe('fade')
    expect(states[i2].background?.asset_id).toBe('bg2')
  })

  it('show screen 不被误当作立绘角色', () => {
    const r = parseRpy('label start:\n    show screen hud\n    "台词"')
    const d = r.deltas.find((x) => x.dialogue === '台词')
    expect(Object.keys(d?.characters ?? {})).toHaveLength(0)
  })
})

describe('matchAssets：音频控制标签与素材用途分类', () => {
  it('音频引用带 <from..> 标签仍能匹配真实文件', () => {
    const refs = [{ path: '<from 0.8 to 4.5>zoulu.wav', type: 'se' as const }]
    const found = [{ fileName: 'zoulu.wav', relativePath: 'audio/zoulu.wav' }]
    const { audioAssets, unmatchedAudio } = matchAssets([], refs, [], found)
    expect(unmatchedAudio).toEqual([])
    expect(audioAssets[0]).toMatchObject({ refName: 'zoulu', fileName: 'zoulu.wav', audioCategory: 'se' })
  })

  it('show 引用图片归类 sprite，scene 引用归类 background', () => {
    const refs = [
      { refName: 'js1', path: 'x.png', usage: 'sprite' as const },
      { refName: 'bj1', path: 'cd.jpg', usage: 'background' as const },
    ]
    const found = [
      { fileName: 'x.png', relativePath: 'x.png' },
      { fileName: 'cd.jpg', relativePath: 'cd.jpg' },
    ]
    const { imageAssets } = matchAssets(refs, [], found, [])
    expect(imageAssets.find((a) => a.refName === 'js1')?.usage).toBe('sprite')
    expect(imageAssets.find((a) => a.refName === 'bj1')?.usage).toBe('background')
  })
})

describe('parseRpy：真实工程常见写法整段回归', () => {
  // 摘自实际在跑的 Ren'Py 工程：内联 ATL、逐帧 hide、语音带文件标签、视频过场、停顿
  const REAL = [
    'default js1 = Character("溪")',
    'image js1 = "x.png"',
    'image js7 = "y.png"',
    'image bj2 = "bj2.jpg"',
    'transform f:',
    '    zoom 1.0',
    '    xalign 0.5',
    '    yalign 0.5',
    '    xpos 350',
    '    ypos 650',
    'label start:',
    '    stop music',
    '    scene bj2 with dissolve',
    '    play music "bgm.mp3" fadein 2.0',
    '    show js1 at f',
    '    js1 "我回来了"',
    '    hide js1 with dissolve',
    '    show js7:',
    '        zoom 0.2',
    '        xalign 0.5',
    '        yalign 0.5',
    '        xpos 1500',
    '        ypos 850',
    '    voice "<from 2.6>ofy.ogg"',
    '    "旁白一句"',
    '    play sound "zoulu.wav"',
    '    $ renpy.pause(0.5)',
    '    $ renpy.movie_cutscene("szjxz.webm")',
    '    scene black with fade',
    '    "结束"',
  ].join('\n')

  it('整段解析无残留未识别语句', () => {
    const r = parseRpy(REAL)
    expect(r.warnings.filter((w) => w.includes('未识别'))).toEqual([])
    expect(r.warnings.some((w) => w.includes('szjxz.webm'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('停顿'))).toBe(true)
  })

  it('立绘按引擎口径记录 zoom 与锚点，不塞进编辑器的 scale', () => {
    const r = parseRpy(REAL)
    const states = reduceLines(r.deltas)
    const i = r.deltas.findIndex((d) => d.dialogue === '旁白一句')
    const js7 = states[i].characters['js7']
    expect(js7?.renpy_zoom).toBe(0.2)
    expect(js7?.anchor_x).toBe(0.5)
    expect(js7?.anchor_y).toBe(0.5)
    expect(js7?.pos_x).toBeCloseTo(1500 / 1920, 3)
    expect(js7?.scale).toBeUndefined()
  })

  it('hide 后的立绘只保留一帧淡出，随后彻底离场', () => {
    const r = parseRpy(REAL)
    const states = reduceLines(r.deltas)
    const i = r.deltas.findIndex((d) => d.dialogue === '旁白一句')
    // 这一行正在播淡出，再往后就不该出现在台上
    expect(states[i].characters['js1']?.exiting).toBe(true)
    const j = r.deltas.findIndex((d) => d.dialogue === '结束')
    expect(states[j].characters['js1']).toBeUndefined()
  })

  it('音频分轨与语音文件标签均按脚本还原', () => {
    const r = parseRpy(REAL)
    const states = reduceLines(r.deltas)
    const i = r.deltas.findIndex((d) => d.dialogue === '旁白一句')
    expect(states[i].audio.bgm?.asset_id).toBe('bgm.mp3')
    expect(states[i].audio.voice).toBe('ofy.ogg')
    const j = r.deltas.findIndex((d) => d.dialogue === '结束')
    expect(states[j].audio.se).toContain('zoulu.wav')
  })

  it('scene 清场时残留立绘随整屏过渡一起退场', () => {
    const r = parseRpy(REAL)
    const states = reduceLines(r.deltas)
    const j = r.deltas.findIndex((d) => d.dialogue === '结束')
    expect(states[j].background?.asset_id).toBe('black')
    expect(states[j].background?.transition).toBe('fade')
    expect(Object.values(states[j].characters).every((c) => c.exiting)).toBe(true)
  })

  it('基准分辨率随 gui.init 声明，未声明按 1920x1080', () => {
    expect(parseRpy(REAL).screen).toEqual({ width: 1920, height: 1080 })
    const r = parseRpy('init python:\n    gui.init(1280, 720)\nlabel start:\n    "x"')
    expect(r.screen).toEqual({ width: 1280, height: 720 })
  })

  it('导入识别 sw_bg/sw_pos 位置参数，保证导出往返一致', () => {
    const r = parseRpy(
      [
        'label start:',
        '    scene bj1 at sw_bg(2, 0.3, 0.7)',
        '    show js1 at sw_pos(1300, 200, 0.8)',
        '    js1 "hi"',
      ].join('\n'),
    )
    expect(r.warnings.filter((w) => w.includes('未识别'))).toEqual([])
    const states = reduceLines(r.deltas)
    const i = r.deltas.findIndex((d) => d.dialogue === 'hi')
    // 背景 zoom 与取景焦点按 sw_bg 位置参数还原
    expect(states[i].background?.scale).toBe(2)
    expect(states[i].background?.focus_x).toBeCloseTo(0.3, 3)
    expect(states[i].background?.focus_y).toBeCloseTo(0.7, 3)
    // 立绘坐标与 zoom 按 sw_pos 位置参数还原（原图像素折算，不塞进编辑器 scale）
    const js1 = states[i].characters['js1']
    expect(js1?.renpy_zoom).toBe(0.8)
    expect(js1?.pos_x).toBeCloseTo(1300 / 1920, 3)
    expect(js1?.pos_y).toBeCloseTo(200 / 1080, 3)
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

describe('parseRpy：视频背景 Movie 往返（与导出 Movie 一致）', () => {
  it('scene bg = Movie(play="video/op.webm", loop=True) 解析为 sw-video:op.webm 且 movieLoop=true', () => {
    const r = parseRpy('label start:\n    scene bg = Movie(play="video/op.webm", loop=True)\n    "台词"')
    const d = r.deltas.find((x) => x.background)
    expect(d?.background?.asset_id).toBe('sw-video:op.webm')
    expect(d?.background?.movieLoop).toBe(true)
  })

  it('loop=False 解析为 movieLoop=false', () => {
    const r = parseRpy('label start:\n    scene bg = Movie(play="video/op.webm", loop=False)\n    "台词"')
    const d = r.deltas.find((x) => x.background)
    expect(d?.background?.asset_id).toBe('sw-video:op.webm')
    expect(d?.background?.movieLoop).toBe(false)
  })

  it('缺省 loop 视为循环（movieLoop=true）', () => {
    const r = parseRpy('label start:\n    scene bg = Movie(play="video/op.webm")\n    "台词"')
    const d = r.deltas.find((x) => x.background)
    expect(d?.background?.asset_id).toBe('sw-video:op.webm')
    expect(d?.background?.movieLoop).toBe(true)
  })

  it('导出 Movie 往返：导入后再导出仍为 Movie(loop=...)', () => {
    const r = parseRpy('label start:\n    scene bg = Movie(play="video/op.webm", loop=False)\n    "台词"')
    const states = reduceLines(r.deltas)
    const out = buildBundle(r.deltas, states, [], []).script
    expect(out).toContain('scene expression Movie(play="video/op.webm", loop=False)')
    // 入口 label start 不应重复发射（导入的 label 已在 deltas 中）
    expect(out.match(/label start:/g) ?? []).toHaveLength(1)
  })
})

describe('importRpyDirectory：视频文件识别与素材去重', () => {
  const tree = {
    dirs: {
      'game': ['script.rpy', 'images', 'video'],
      'game/images': ['bg', 'eileen'],
      'game/images/bg': ['room.png'],
      'game/images/eileen': ['happy.png', 'sad.png'],
      'game/video': ['op.webm', 'ed.webm'],
    },
    files: {
      'game/script.rpy': `
image bg room = "images/bg/room.png"
image eileen happy = "images/eileen/happy.png"
image eileen sad = "images/eileen/sad.png"
label start:
    scene bg room
    show eileen happy
    "对话1"
    scene bg = Movie(play="video/op.webm")
    "视频背景1"
    scene bg = Movie(play="video/ed.webm")
    "视频背景2"
`,
      'game/images/bg/room.png': 'PNGDATA',
      'game/images/eileen/happy.png': 'PNGDATA',
      'game/images/eileen/sad.png': 'PNGDATA',
      'game/video/op.webm': 'WEBMDATA',
      'game/video/ed.webm': 'WEBMDATA',
    },
  }

  it('视频文件被扫描并匹配为 videoAssets（无视频时为空）', async () => {
    installFs(tree)
    const r = await importRpyDirectory('game')
    expect(r.videoAssets.filter(a => a.fileName).length).toBe(2)
    expect(r.videoAssets.some(a => a.fileName === 'op.webm' && a.kind === 'video')).toBe(true)
    expect(r.videoAssets.some(a => a.fileName === 'ed.webm' && a.kind === 'video')).toBe(true)
  })

  it('两个视频背景对应两条 sw-video 引用且被正确保留', async () => {
    installFs(tree)
    const r = await importRpyDirectory('game')
    const bgIds = r.deltas.map(d => d.background?.asset_id).filter(Boolean)
    expect(bgIds).toContain('sw-video:op.webm')
    expect(bgIds).toContain('sw-video:ed.webm')
  })

  it('图片素材按物理文件去重，不出现重复条目', async () => {
    installFs(tree)
    const r = await importRpyDirectory('game')
    const matched = r.imageAssets.filter(a => a.fileName)
    // 每个物理文件只应出现一次
    const byFile = new Map<string, number>()
    for (const a of matched) {
      const k = a.relativePath || a.fileName
      byFile.set(k, (byFile.get(k) ?? 0) + 1)
    }
    for (const [, n] of byFile) expect(n).toBe(1)
    expect(matched.length).toBe(3) // room / happy / sad 各一
  })
})

describe('parseRpy：视频过场 sw-cutscene（区别于循环背景）', () => {
  it('renpy.movie_cutscene 解析为 sw-cutscene: 前缀（过场语义）', () => {
    const r = parseRpy('label start:\n    $ renpy.movie_cutscene("op.webm")\n    "台词"')
    const d = r.deltas.find((x) => x.background)
    expect(d?.background?.asset_id).toBe('sw-cutscene:op.webm')
    // 过场不带 movieLoop（它是播完继续剧情，不是循环背景）
    expect(d?.background?.movieLoop).toBeUndefined()
  })

  it('renpy.movie_cutscene 带子目录路径时只取文件名', () => {
    const r = parseRpy('label start:\n    $ renpy.movie_cutscene("video/op.webm")\n    "台词"')
    const d = r.deltas.find((x) => x.background)
    expect(d?.background?.asset_id).toBe('sw-cutscene:op.webm')
  })
})

describe('parseRpy：角色识别（界面变量与道具立绘不误判为角色）', () => {
  it('default device = "keyboard"（界面局部变量）不注册为角色', () => {
    const r = parseRpy(
      'init python:\n    pass\n\nlabel start:\n    "开场"\n    $ device = "keyboard"\n    "继续"',
    )
    expect(r.characters.find((c) => c.charId === 'device')).toBeUndefined()
  })

  it('default gs1 = "阿五" 且对白 gs1 "..." 时，gs1 注册为角色', () => {
    const r = parseRpy('default gs1 = "阿五"\n\nlabel start:\n    gs1 "你好"\n    "旁白"')
    const gs1 = r.characters.find((c) => c.charId === 'gs1')
    expect(gs1?.charId).toBe('gs1')
    expect(gs1?.displayName).toBe('阿五')
  })

  it('道具立绘 image js2g 经 show js2g 出场，但不注册为角色（无对白）', () => {
    const r = parseRpy(
      'image js2g = "z-gc.png"\n\nlabel start:\n    show js2g\n    "描述"',
    )
    expect(r.characters.find((c) => c.charId === 'js2g')).toBeUndefined()
  })

  it('真实角色 show alice + alice "..." 注册为角色', () => {
    const r = parseRpy('define alice = Character("爱丽丝")\n\nlabel start:\n    show alice happy\n    alice "你好"')
    expect(r.characters.find((c) => c.charId === 'alice')).toBeDefined()
  })
})

describe('parseRpy：RenPy 引擎/界面内置变量不导出（避免 default 二次定义）', () => {
  it('界面变量 quick_menu / page_name_value / ctc 被过滤', () => {
    const r = parseRpy(
      'default quick_menu = True\n\ndefault page_name_value = 0\n\ndefault ctc = None\n\nlabel start:\n    "台词"',
    )
    const names = r.variables.map((v) => v.name)
    expect(names).not.toContain('quick_menu')
    expect(names).not.toContain('page_name_value')
    expect(names).not.toContain('ctc')
  })

  it('preferences./gui. 命名空间变量被过滤', () => {
    const r = parseRpy(
      'default preferences.text_cps = 0\n\ndefault gui.text_size = 22\n\nlabel start:\n    $ trust = 10\n    "台词"',
    )
    const names = r.variables.map((v) => v.name)
    expect(names).not.toContain('preferences.text_cps')
    expect(names).not.toContain('gui.text_size')
    // 剧情变量 trust 仍保留
    expect(names).toContain('trust')
  })
})

describe('canonicalizeImportedAssets：重复导入时素材 id 必须真实存在（舞台空白修复回归）', () => {
  const mkAsset = (id: string, rel: string): AssetItem =>
    ({ id, fileName: rel.split('/').pop() ?? id, relativePath: rel, type: 'background', createdAt: '', updatedAt: '', importedAt: '', name: rel }) as AssetItem

  it('第一次导入：新条目全部注册', () => {
    const m = new Map([['room', mkAsset('new-id-1', 'assets/images/room.png')]])
    const out = canonicalizeImportedAssets([m], [])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('new-id-1')
    // 映射表 value 与最终 assets 一致
    expect(m.get('room')!.id).toBe('new-id-1')
  })

  it('重复导入同文件：assets 保留旧 id，映射表回落到旧条目（deltas 绑定不会悬空）', () => {
    const old = mkAsset('old-id-1', 'assets/images/room.png')
    // fsImport 复用文件但生成新 uuid
    const m = new Map([['room', mkAsset('new-id-2', 'assets/images/room.png')]])
    const out = canonicalizeImportedAssets([m], [old])
    // 不新增重复条目
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('old-id-1')
    // 关键：映射表 value 回落到 assets 中真实存在的旧 id
    expect(m.get('room')!.id).toBe('old-id-1')
    expect(out.some(a => a.id === m.get('room')!.id)).toBe(true)
  })

  it('多映射表共用同一套去重：跨表重复也回落', () => {
    const old = mkAsset('old-bg', 'assets/images/b.png')
    const bgMap = new Map([['bj1', mkAsset('new-bg', 'assets/images/b.png')]])
    const sprMap = new Map([['js1', mkAsset('new-spr', 'assets/images/js1.png')]])
    const out = canonicalizeImportedAssets([bgMap, sprMap], [old])
    expect(out).toHaveLength(2)
    expect(bgMap.get('bj1')!.id).toBe('old-bg')
    expect(sprMap.get('js1')!.id).toBe('new-spr')
  })
})
