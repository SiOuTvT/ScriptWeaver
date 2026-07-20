// ============================================================
// ScriptWeaver · 特效预览引擎 (Effect Player)
// ------------------------------------------------------------
// 把 renpyEffects.ts 里的 PreviewSpec 翻译成浏览器可丝滑播放的动画。
//
// 【重置机制（杜绝叠加）】
// 本引擎由外层 PreviewStage 在每次播放前通过「key 重挂载」强制销毁上一轮
// 所有 DOM / 内联样式 / 动画，从绝对干净的初始状态重建；engine 自身 play()
// 也会先 clear() 取消全部 Animation、清空 timers 并剥离内联 transform / opacity /
// filter / clipPath / mask 等属性，双保险确保「点击新特效 = 单一干净演示」。
//
// 舞台只需两层：bg（静态背景，全屏）+ sprite（前景立绘，居中）。
// 转场类效果在 sprite 上做「旧→新」的揭示/滑入/溶解；变换类在 sprite 上做
// 旋转/缩放/位移/颜色；flash/ball/caption 为辅助层。
// ============================================================

import type { PreviewSpec, Dir } from '@/data/renpyEffects'

export interface PlayerRefs {
  stage: HTMLElement
  sprite: HTMLElement
  flash: HTMLElement
  ball: HTMLElement
  caption: HTMLElement
}

export interface PlayOpts {
  /** 时长（毫秒） */
  duration: number
  /** 幅度倍率 0.3 ~ 1.6，缩放动效强度 */
  amp: number
}

/** 屏外位移（用于 slide / push / move / 转场揭示的起点/终点） */
function offTransform(dir: Dir): string {
  switch (dir) {
    case 'right':
      return 'translateX(120%)'
    case 'left':
      return 'translateX(-120%)'
    case 'up':
      return 'translateY(-120%)'
    case 'down':
      return 'translateY(120%)'
  }
}

/** 需要被重置的内联属性清单（剥离上一轮叠加态） */
const RESET_PROPS = [
  'transform',
  'opacity',
  'filter',
  'clipPath',
  'maskImage',
  'webkitMaskImage',
  'maskPosition',
  'webkitMaskPosition',
  'maskSize',
  'webkitMaskSize',
  'transition',
  'backgroundPosition',
  'transformOrigin',
  'imageRendering',
  'left',
  'top',
] as const

export class EffectPlayer {
  private animations: Animation[] = []
  private timers: number[] = []

  constructor(
    private r: PlayerRefs,
    private onMessage?: (t: string) => void,
  ) {}

  /** 取消全部动画 + 清空定时器 + 剥离内联动效属性 */
  private clear() {
    this.animations.forEach((a) => {
      try {
        a.cancel()
      } catch {
        /* noop */
      }
    })
    this.animations = []
    this.timers.forEach((t) => clearTimeout(t))
    this.timers = []
    const els = [this.r.sprite, this.r.flash, this.r.ball, this.r.caption]
    els.forEach((el) => {
      el.getAnimations?.().forEach((a) => {
        try {
          a.cancel()
        } catch {
          /* noop */
        }
      })
      RESET_PROPS.forEach((p) => {
        el.style[p] = ''
      })
    })
    // 还原辅助层基础可见性
    this.r.flash.style.opacity = '0'
    this.r.ball.style.opacity = '0'
    this.r.caption.style.opacity = '0'
    this.r.caption.textContent = ''
    this.r.stage.style.perspective = ''
  }

  private anim(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation {
    const a = el.animate(frames, { fill: 'forwards', ...opts })
    this.animations.push(a)
    a.finished
      .then(() => {
        this.animations = this.animations.filter((x) => x !== a)
      })
      .catch(() => {
        /* cancelled */
      })
    return a
  }

  private delay(ms: number, fn: () => void) {
    const t = window.setTimeout(fn, ms)
    this.timers.push(t)
  }

  dispose() {
    this.clear()
  }

  play(spec: PreviewSpec, opts: PlayOpts) {
    this.clear()
    const { sprite, flash, ball, caption } = this.r
    const d = opts.duration
    const amp = opts.amp
    const off = (dir: Dir) => offTransform(dir)

    switch (spec.kind) {
      // ---------------- 基础转场（作用于 sprite 揭示） ----------------
      case 'dissolve': {
        sprite.style.opacity = '0'
        this.anim(sprite, [{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: 'ease-in-out' })
        break
      }
      case 'fadeIn': {
        flash.style.background = '#000'
        sprite.style.opacity = '0'
        this.anim(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.45 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], {
          duration: d,
        })
        this.delay(d * 0.5, () => {
          sprite.style.opacity = '1'
        })
        break
      }
      case 'flash': {
        flash.style.background = '#fff'
        this.anim(flash, [{ opacity: 0 }, { opacity: 0.95, offset: 0.18 }, { opacity: 0 }], {
          duration: Math.min(700, d),
          easing: 'ease-out',
        })
        break
      }
      case 'pixellate': {
        sprite.style.opacity = '1'
        sprite.style.imageRendering = 'pixelated'
        const blur = 4 + 6 * amp
        this.anim(
          sprite,
          [
            { transform: 'scale(1)', filter: 'blur(0px)' },
            { transform: `scale(${(1 - 0.2 * amp).toFixed(3)})`, filter: `blur(${blur}px)`, offset: 0.5 },
            { transform: 'scale(1)', filter: 'blur(0px)' },
          ],
          { duration: d, easing: 'steps(8, end)' },
        )
        this.delay(d, () => {
          sprite.style.imageRendering = ''
          sprite.style.filter = ''
        })
        break
      }

      // ---------------- 擦除 / 滑动 / 推挤 / 虹膜（揭示 sprite） ----------------
      case 'wipe': {
        sprite.style.opacity = '1'
        const insets: Record<Dir, string> = {
          right: 'inset(0 100% 0 0)',
          left: 'inset(0 0 0 100%)',
          up: 'inset(100% 0 0 0)',
          down: 'inset(0 0 100% 0)',
        }
        sprite.style.clipPath = insets[spec.dir]
        this.anim(
          sprite,
          [{ clipPath: insets[spec.dir] }, { clipPath: 'inset(0 0 0 0)' }],
          { duration: d, easing: 'ease-in-out' },
        )
        break
      }
      case 'slide': {
        sprite.style.opacity = '1'
        if (spec.mode === 'in') {
          sprite.style.transform = off(spec.dir)
          this.anim(sprite, [{ transform: off(spec.dir) }, { transform: 'translate(0,0)' }], {
            duration: d,
            easing: 'cubic-bezier(0.22,1,0.36,1)',
          })
        } else {
          this.anim(sprite, [{ transform: 'translate(0,0)' }, { transform: off(spec.dir) }], {
            duration: d,
            easing: 'cubic-bezier(0.55,0,0.45,1)',
          })
        }
        break
      }
      case 'push': {
        sprite.style.opacity = '1'
        const o = off(spec.dir)
        this.anim(sprite, [{ transform: 'translate(0,0)' }, { transform: o }], {
          duration: d,
          easing: 'ease-in-out',
        })
        break
      }
      case 'iris': {
        sprite.style.opacity = '1'
        if (spec.mode === 'in') {
          sprite.style.clipPath = 'circle(0% at 50% 50%)'
          this.anim(sprite, [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(150% at 50% 50%)' }], {
            duration: d,
            easing: 'ease-in-out',
          })
        } else {
          sprite.style.clipPath = 'circle(150% at 50% 50%)'
          this.anim(sprite, [{ clipPath: 'circle(150% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }], {
            duration: d,
            easing: 'ease-in-out',
          })
        }
        break
      }
      case 'blinds': {
        sprite.style.opacity = '1'
        sprite.style.webkitMaskImage = 'repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        sprite.style.maskImage = 'repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        sprite.style.opacity = '0'
        this.anim(sprite, [{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: 'steps(7, end)' })
        break
      }
      case 'squares': {
        sprite.style.opacity = '1'
        sprite.style.webkitMaskImage =
          'repeating-linear-gradient(0deg, #000 0 13%, transparent 13% 26%), repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        sprite.style.maskImage =
          'repeating-linear-gradient(0deg, #000 0 13%, transparent 13% 26%), repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        sprite.style.opacity = '0'
        this.anim(sprite, [{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: 'steps(9, end)' })
        break
      }
      case 'swing': {
        sprite.style.opacity = '1'
        this.r.stage.style.perspective = '900px'
        sprite.style.transformOrigin = 'left center'
        sprite.style.transform = 'rotateY(90deg)'
        this.anim(sprite, [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' }], {
          duration: d,
          easing: 'ease-in-out',
        })
        this.delay(d + 50, () => {
          sprite.style.transformOrigin = ''
          sprite.style.transform = ''
          this.r.stage.style.perspective = ''
        })
        break
      }

      // ---------------- 位移 / 移动 / 缩放（作用于 sprite） ----------------
      case 'move': {
        sprite.style.opacity = '1'
        const o = off(spec.dir)
        if (spec.mode === 'in') {
          sprite.style.transform = o
          sprite.style.opacity = '0.15'
          this.anim(sprite, [{ transform: o, opacity: 0.15 }, { transform: 'translate(0,0)', opacity: 1 }], {
            duration: d,
            easing: 'cubic-bezier(0.22,1,0.36,1)',
          })
        } else {
          this.anim(sprite, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: o, opacity: 0.15 }], {
            duration: d,
            easing: 'cubic-bezier(0.55,0,0.45,1)',
          })
        }
        break
      }
      case 'zoom': {
        sprite.style.opacity = '1'
        const start = Math.max(0.12, 1 - 0.7 * amp).toFixed(3)
        if (spec.mode === 'in') {
          sprite.style.transform = `scale(${start})`
          sprite.style.opacity = '0.4'
          this.anim(sprite, [{ transform: `scale(${start})`, opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], {
            duration: d,
            easing: 'cubic-bezier(0.34,1.2,0.64,1)',
          })
        } else if (spec.mode === 'out') {
          this.anim(sprite, [{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${start})`, opacity: 0.4 }], {
            duration: d,
            easing: 'cubic-bezier(0.36,0,0.66,-0.2)',
          })
        } else {
          sprite.style.transform = `scale(${start})`
          sprite.style.opacity = '0.3'
          this.anim(sprite, [{ transform: `scale(${start})`, opacity: 0.3 }, { transform: 'scale(1)', opacity: 1 }], {
            duration: d,
            easing: 'ease-in-out',
          })
        }
        break
      }

      // ---------------- 冲击 / 抖动 ----------------
      case 'shake': {
        sprite.style.opacity = '1'
        const m = 12 * amp
        const axis = spec.axis === 'h' ? 'translateX' : 'translateY'
        this.anim(sprite, [
          { transform: `${axis}(0px)` },
          { transform: `${axis}(${-m}px)` },
          { transform: `${axis}(${m * 0.9}px)` },
          { transform: `${axis}(${-m * 0.7}px)` },
          { transform: `${axis}(${m * 0.5}px)` },
          { transform: `${axis}(${-m * 0.3}px)` },
          { transform: `${axis}(0px)` },
        ], { duration: 380 * Math.min(1.4, amp + 0.3), iterations: 2 })
        break
      }

      // ---------------- 旋转 / 翻转 ----------------
      case 'rotate': {
        sprite.style.opacity = '1'
        const deg = Math.round(spec.deg * (0.5 + 0.5 * amp))
        this.anim(sprite, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${deg}deg)` }], {
          duration: d,
          easing: 'ease-in-out',
        })
        break
      }
      case 'flip': {
        sprite.style.opacity = '1'
        const prop = spec.axis === 'h' ? 'scaleX' : 'scaleY'
        this.anim(sprite, [{ transform: `${prop}(1)` }, { transform: `${prop}(0)`, offset: 0.5 }, { transform: `${prop}(-1)` }], {
          duration: d * 0.8,
          easing: 'ease-in-out',
        })
        break
      }

      // ---------------- 像素 / 颜色 ----------------
      case 'blur': {
        sprite.style.opacity = '1'
        const b = 4 + 7 * amp
        this.anim(sprite, [{ filter: 'blur(0px)' }, { filter: `blur(${b}px)`, offset: 0.5 }, { filter: 'blur(0px)' }], {
          duration: d,
          easing: 'ease-in-out',
        })
        break
      }
      case 'color': {
        sprite.style.opacity = '1'
        sprite.style.transition = 'filter 0.5s ease'
        const f = spec.filter
        this.delay(30, () => {
          sprite.style.filter = f
        })
        this.delay(30 + 900, () => {
          sprite.style.filter = 'none'
        })
        this.delay(30 + 900 + 550, () => {
          sprite.style.transition = ''
          sprite.style.filter = ''
        })
        break
      }
      case 'alpha': {
        sprite.style.opacity = '1'
        const a = Math.max(0.05, 1 - 0.8 * amp)
        this.anim(sprite, [{ opacity: 1 }, { opacity: a, offset: 0.5 }, { opacity: 1 }], { duration: d, easing: 'ease-in-out' })
        break
      }
      case 'additive': {
        sprite.style.opacity = '1'
        this.anim(
          sprite,
          [
            { filter: 'brightness(1)' },
            { filter: `brightness(${(1.3 + 0.6 * amp).toFixed(2)}) drop-shadow(0 0 ${(12 + 10 * amp).toFixed(0)}px rgba(255,255,255,0.9))`, offset: 0.5 },
            { filter: 'brightness(1)' },
          ],
          { duration: d, easing: 'ease-in-out' },
        )
        break
      }
      case 'crop': {
        sprite.style.opacity = '1'
        const k = Math.min(0.45, 0.18 + 0.18 * amp)
        const inset = `${k * 100}% ${(k + 0.06) * 100}% ${k * 100}% ${(k + 0.06) * 100}%`
        this.anim(sprite, [{ clipPath: `inset(${inset})` }, { clipPath: 'inset(0% 0% 0% 0%)' }], {
          duration: d,
          easing: 'cubic-bezier(0.22,1,0.36,1)',
        })
        break
      }

      // ---------------- 位置 / 极坐标（统一用 transform 驱动，居中交给外层 flex） ----------------
      case 'position': {
        sprite.style.opacity = '1'
        const k = (28 * amp).toFixed(0)
        this.anim(
          sprite,
          [
            { transform: 'translate(0%,0%)' },
            { transform: `translate(-${k}%,0%)`, offset: 0.4 },
            { transform: `translate(${k}%,0%)`, offset: 0.7 },
            { transform: 'translate(0%,0%)' },
          ],
          { duration: d * 1.3, easing: 'ease-in-out' },
        )
        break
      }
      case 'polar': {
        sprite.style.opacity = '1'
        sprite.style.transformOrigin = '50% 150%'
        this.anim(sprite, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${Math.round(360 * amp)}deg)` }], {
          duration: d * 1.4,
          easing: 'linear',
        })
        this.delay(d * 1.4 + 50, () => {
          sprite.style.transformOrigin = ''
          sprite.style.transform = ''
        })
        break
      }

      // ---------------- 缓动 ----------------
      case 'ease': {
        ball.style.opacity = '1'
        ball.style.left = '8%'
        this.anim(
          ball,
          [{ left: '8%' }, { left: '88%' }],
          { duration: d + 300, easing: `cubic-bezier(${spec.bezier.join(',')})`, iterations: Infinity, direction: 'alternate' },
        )
        break
      }

      // ---------------- 循环 / 并行 / 随机 ----------------
      case 'loop': {
        sprite.style.opacity = '1'
        this.anim(sprite, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${Math.round(360 * amp)}deg)` }], {
          duration: d * 1.4,
          easing: 'linear',
          iterations: Infinity,
        })
        break
      }
      case 'parallel': {
        sprite.style.opacity = '1'
        // 同时使用 X/Y 两组位移合成「一边横移一边上下浮」的并行观感
        this.anim(
          sprite,
          [
            { transform: 'translate(-22%,-20%)' },
            { transform: 'translate(22%,20%)', offset: 0.5 },
            { transform: 'translate(-22%,-20%)' },
          ],
          { duration: d * 1.2, easing: 'ease-in-out', iterations: Infinity },
        )
        break
      }
      case 'choice': {
        sprite.style.opacity = '1'
        const spots = ['20% 30%', '75% 30%', '20% 75%', '75% 75%']
        let i = 0
        const step = () => {
          const [l, t] = spots[i % spots.length].split(' ')
          sprite.style.transition = 'left 0.5s ease, top 0.5s ease'
          sprite.style.left = l
          sprite.style.top = t
          i++
          this.delay(650, step)
        }
        step()
        break
      }

      // ---------------- 3D ----------------
      case 'rotate3d': {
        sprite.style.opacity = '1'
        this.r.stage.style.perspective = '700px'
        this.anim(sprite, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${Math.round(360 * amp)}deg)` }], {
          duration: d * 1.3,
          easing: 'ease-in-out',
        })
        this.delay(d * 1.3 + 50, () => {
          sprite.style.transform = ''
          this.r.stage.style.perspective = ''
        })
        break
      }

      // ---------------- 概念型（无独立画面） ----------------
      case 'concept': {
        sprite.style.opacity = '1'
        caption.textContent = spec.text
        caption.style.opacity = '1'
        this.delay(2800, () => {
          caption.style.opacity = '0'
        })
        break
      }
    }
  }
}
