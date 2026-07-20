// ============================================================
// ScriptWeaver · 特效预览引擎 (Effect Player)
// ------------------------------------------------------------
// 把 renpyEffects.ts 里声明的 PreviewSpec 翻译成浏览器可丝滑播放的动画。
// 设计：舞台含两层立绘（sprite=当前 / spriteB=新入）、闪光层(flash)、
// 缓动小球(ball)、说明字幕(caption)。所有效果都由 Web Animations API
// 或 CSS transition 驱动，下一轨播放前先 reset() 清空上一轨。
// ============================================================

import type { PreviewSpec, Dir } from '@/data/renpyEffects'

export interface PlayerRefs {
  stage: HTMLElement
  sprite: HTMLElement
  spriteB: HTMLElement
  flash: HTMLElement
  ball: HTMLElement
  caption: HTMLElement
}

const DURATION = 1200

/** 方向 → 位移偏移（用于 slide / push / move / wipe 的"屏外"起点） */
function offTransform(dir: Dir, mode: 'in' | 'out'): string {
  // mode=in：从屏外进入（起点在 dir 所指屏幕外，终点 0）
  // mode=out：向 dir 离开（起点 0，终点在 dir 所指屏幕外）
  const dist = '120%'
  const map: Record<Dir, [string, string]> = {
    right: ['translateX(-' + dist + ')', 'translateX(' + dist + ')'],
    left: ['translateX(' + dist + ')', 'translateX(-' + dist + ')'],
    up: ['translateY(' + dist + ')', 'translateY(-' + dist + ')'],
    down: ['translateY(-' + dist + ')', 'translateY(' + dist + ')'],
  }
  const [from, to] = map[dir]
  return mode === 'in' ? from : to
}

export class EffectPlayer {
  private animations: Animation[] = []
  private timers: number[] = []

  constructor(
    private r: PlayerRefs,
    private onMessage?: (t: string) => void,
  ) {}

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
    const els = [this.r.sprite, this.r.spriteB, this.r.flash, this.r.ball]
    els.forEach((el) => {
      el.getAnimations?.().forEach((a) => a.cancel())
      el.style.transition = ''
      el.style.opacity = ''
      el.style.transform = ''
      el.style.clipPath = ''
      el.style.webkitMaskImage = ''
      el.style.maskImage = ''
      el.style.webkitMaskPosition = ''
      el.style.maskPosition = ''
      el.style.webkitMaskSize = ''
      el.style.maskSize = ''
      el.style.filter = ''
      el.style.backgroundPosition = ''
      el.style.display = ''
    })
    this.r.sprite.style.opacity = '1'
    this.r.spriteB.style.opacity = '0'
    this.r.flash.style.opacity = '0'
    this.r.ball.style.opacity = '0'
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

  play(spec: PreviewSpec) {
    this.clear()
    const { sprite, spriteB, flash, ball, caption } = this.r

    switch (spec.kind) {
      // ---------- 基础转场 ----------
      case 'dissolve': {
        sprite.style.opacity = '1'
        spriteB.style.opacity = '1'
        this.anim(sprite, [{ opacity: 1 }, { opacity: 0 }], { duration: DURATION, easing: 'ease-in-out' })
        this.anim(spriteB, [{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: 'ease-in-out' })
        break
      }
      case 'fadeIn': {
        // 经黑场淡入：黑幕升至满 → 中点切换 A→B → 黑幕退去
        flash.style.background = '#000'
        this.anim(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.45 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], {
          duration: DURATION,
        })
        this.delay(DURATION * 0.5, () => {
          sprite.style.opacity = '0'
          spriteB.style.opacity = '1'
        })
        break
      }
      case 'flash': {
        flash.style.background = '#fff'
        this.anim(flash, [{ opacity: 0 }, { opacity: 0.92, offset: 0.2 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' })
        break
      }
      case 'pixellate': {
        // Web 近似：先抽稀放大再还原（blur 阶梯 + 缩放脉冲）
        sprite.style.imageRendering = 'pixelated'
        this.anim(
          sprite,
          [
            { transform: 'scale(1)', filter: 'blur(0px)' },
            { transform: 'scale(0.82)', filter: 'blur(9px)', offset: 0.5 },
            { transform: 'scale(1)', filter: 'blur(0px)' },
          ],
          { duration: DURATION, easing: 'steps(8, end)' },
        )
        this.delay(DURATION, () => {
          sprite.style.imageRendering = ''
        })
        break
      }
      case 'wipe': {
        const insets: Record<Dir, string> = {
          right: 'inset(0 100% 0 0)',
          left: 'inset(0 0 0 100%)',
          up: 'inset(100% 0 0 0)',
          down: 'inset(0 0 100% 0)',
        }
        spriteB.style.opacity = '1'
        this.anim(spriteB, [{ clipPath: insets[spec.dir] }, { clipPath: 'inset(0 0 0 0)' }], {
          duration: DURATION,
          easing: 'ease-in-out',
        })
        break
      }
      case 'slide': {
        const off = offTransform(spec.dir, spec.mode)
        if (spec.mode === 'in') {
          spriteB.style.opacity = '1'
          this.anim(spriteB, [{ transform: off }, { transform: 'translate(0,0)' }], { duration: DURATION, easing: 'cubic-bezier(0.22,1,0.36,1)' })
        } else {
          this.anim(sprite, [{ transform: 'translate(0,0)' }, { transform: off }], { duration: DURATION, easing: 'cubic-bezier(0.55,0,0.45,1)' })
        }
        break
      }
      case 'push': {
        const offIn = offTransform(spec.dir, 'in')
        const offOut = offTransform(spec.dir, 'out')
        spriteB.style.opacity = '1'
        this.anim(spriteB, [{ transform: offIn }, { transform: 'translate(0,0)' }], { duration: DURATION, easing: 'ease-in-out' })
        this.anim(sprite, [{ transform: 'translate(0,0)' }, { transform: offOut }], { duration: DURATION, easing: 'ease-in-out' })
        break
      }
      case 'iris': {
        spriteB.style.opacity = '1'
        if (spec.mode === 'in') {
          this.anim(spriteB, [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(150% at 50% 50%)' }], {
            duration: DURATION,
            easing: 'ease-in-out',
          })
        } else {
          this.anim(spriteB, [{ clipPath: 'circle(150% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }], {
            duration: DURATION,
            easing: 'ease-in-out',
          })
        }
        break
      }
      case 'blinds': {
        spriteB.style.opacity = '1'
        spriteB.style.webkitMaskImage = 'repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        spriteB.style.maskImage = 'repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        this.anim(spriteB, [{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: 'steps(7, end)' })
        break
      }
      case 'squares': {
        spriteB.style.opacity = '1'
        spriteB.style.webkitMaskImage =
          'repeating-linear-gradient(0deg, #000 0 13%, transparent 13% 26%), repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        spriteB.style.maskImage =
          'repeating-linear-gradient(0deg, #000 0 13%, transparent 13% 26%), repeating-linear-gradient(90deg, #000 0 13%, transparent 13% 26%)'
        this.anim(spriteB, [{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: 'steps(9, end)' })
        break
      }

      // ---------- 位移 / 移动 / 缩放 ----------
      case 'move': {
        const off = offTransform(spec.dir, spec.mode)
        if (spec.mode === 'in') {
          this.anim(sprite, [{ transform: off, opacity: 0.2 }, { transform: 'translate(0,0)', opacity: 1 }], {
            duration: DURATION,
            easing: 'cubic-bezier(0.22,1,0.36,1)',
          })
        } else {
          this.anim(sprite, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: off, opacity: 0.2 }], {
            duration: DURATION,
            easing: 'cubic-bezier(0.55,0,0.45,1)',
          })
        }
        break
      }
      case 'zoom': {
        if (spec.mode === 'in') {
          this.anim(sprite, [{ transform: 'scale(0.3)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], {
            duration: DURATION,
            easing: 'cubic-bezier(0.34,1.2,0.64,1)',
          })
        } else if (spec.mode === 'out') {
          this.anim(sprite, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.3)', opacity: 0.4 }], {
            duration: DURATION,
            easing: 'cubic-bezier(0.36,0,0.66,-0.2)',
          })
        } else {
          spriteB.style.opacity = '1'
          this.anim(sprite, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.3)', opacity: 0.3 }], {
            duration: DURATION / 2,
            easing: 'ease-in',
          })
          this.anim(spriteB, [{ transform: 'scale(0.3)', opacity: 0.3 }, { transform: 'scale(1)', opacity: 1 }], {
            duration: DURATION / 2,
            delay: DURATION / 2,
            easing: 'ease-out',
          })
        }
        break
      }

      // ---------- 冲击 / 抖动 ----------
      case 'shake': {
        const axis = spec.axis === 'h' ? 'translateX' : 'translateY'
        const kf: Keyframe[] = [
          { transform: `${axis}(0px)` },
          { transform: `${axis}(-12px)` },
          { transform: `${axis}(11px)` },
          { transform: `${axis}(-9px)` },
          { transform: `${axis}(7px)` },
          { transform: `${axis}(-4px)` },
          { transform: `${axis}(0px)` },
        ]
        this.anim(sprite, kf, { duration: 420, iterations: 2 })
        break
      }
      case 'swing': {
        sprite.style.transformOrigin = 'left center'
        this.anim(sprite, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-90deg)', offset: 0.5 }, { transform: 'rotateY(-90deg)', offset: 0.5 }, { transform: 'rotateY(0deg)' }], {
          duration: DURATION,
          easing: 'ease-in-out',
        })
        // 中点切换 A→B 模拟换景
        this.delay(DURATION * 0.5, () => {
          sprite.style.opacity = '0'
          spriteB.style.opacity = '1'
          spriteB.style.transformOrigin = 'left center'
          spriteB.style.transform = 'rotateY(90deg)'
          this.anim(spriteB, [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' }], { duration: DURATION / 2, easing: 'ease-out' })
        })
        this.delay(DURATION, () => {
          sprite.style.transformOrigin = ''
        })
        break
      }

      // ---------- 旋转 / 翻转 ----------
      case 'rotate': {
        this.anim(sprite, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${spec.deg}deg)` }], {
          duration: DURATION,
          easing: 'ease-in-out',
        })
        break
      }
      case 'flip': {
        const prop = spec.axis === 'h' ? 'scaleX' : 'scaleY'
        this.anim(sprite, [{ transform: `${prop}(1)` }, { transform: `${prop}(0)` , offset: 0.5 }, { transform: `${prop}(-1)` }], {
          duration: DURATION * 0.8,
          easing: 'ease-in-out',
        })
        break
      }

      // ---------- 像素 / 颜色 ----------
      case 'blur': {
        this.anim(sprite, [{ filter: 'blur(0px)' }, { filter: 'blur(10px)', offset: 0.5 }, { filter: 'blur(0px)' }], {
          duration: DURATION,
          easing: 'ease-in-out',
        })
        break
      }
      case 'color': {
        sprite.style.transition = 'filter 0.55s ease'
        this.delay(30, () => {
          sprite.style.filter = spec.filter
        })
        this.delay(30 + 950, () => {
          sprite.style.filter = 'none'
        })
        this.delay(30 + 950 + 600, () => {
          sprite.style.transition = ''
        })
        break
      }
      case 'alpha': {
        this.anim(sprite, [{ opacity: 1 }, { opacity: 0.25, offset: 0.5 }, { opacity: 1 }], { duration: DURATION, easing: 'ease-in-out' })
        break
      }
      case 'additive': {
        this.anim(
          sprite,
          [
            { filter: 'brightness(1)' },
            { filter: 'brightness(1.7) drop-shadow(0 0 16px rgba(255,255,255,0.9))', offset: 0.5 },
            { filter: 'brightness(1)' },
          ],
          { duration: DURATION, easing: 'ease-in-out' },
        )
        break
      }
      case 'crop': {
        this.anim(
          sprite,
          [{ clipPath: 'inset(38% 32% 38% 32%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }],
          { duration: DURATION, easing: 'cubic-bezier(0.22,1,0.36,1)' },
        )
        break
      }
      case 'pan': {
        sprite.style.background =
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 28px, rgba(255,255,255,0.02) 28px 56px), linear-gradient(135deg,#3b82f6,#8b5cf6)'
        sprite.style.backgroundSize = '112px 100%, 100% 100%'
        this.anim(sprite, [{ backgroundPosition: '0px 0px' }, { backgroundPosition: '-224px 0px' }], {
          duration: DURATION * 1.4,
          easing: 'linear',
          iterations: Infinity,
          direction: 'alternate',
        })
        break
      }
      case 'tile': {
        sprite.style.background =
          'conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)'
        sprite.style.backgroundSize = '40% 40%'
        this.anim(sprite, [{ backgroundPosition: '0px 0px' }, { backgroundPosition: '80px 80px' }], {
          duration: 1400,
          easing: 'linear',
        })
        break
      }

      // ---------- 位置 / 极坐标 ----------
      case 'position': {
        this.anim(
          sprite,
          [
            { left: '50%' },
            { left: '22%', offset: 0.4 },
            { left: '78%', offset: 0.7 },
            { left: '50%' },
          ],
          { duration: DURATION * 1.4, easing: 'ease-in-out' },
        )
        break
      }
      case 'polar': {
        sprite.style.transformOrigin = '50% 140%'
        this.anim(sprite, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
          duration: DURATION * 1.6,
          easing: 'linear',
        })
        this.delay(DURATION * 1.6 + 50, () => {
          sprite.style.transformOrigin = ''
        })
        break
      }

      // ---------- 缓动 ----------
      case 'ease': {
        ball.style.opacity = '1'
        ball.style.left = '8%'
        this.anim(
          ball,
          [{ left: '8%' }, { left: '88%' }],
          { duration: 1500, easing: `cubic-bezier(${spec.bezier.join(',')})`, iterations: Infinity, direction: 'alternate' },
        )
        break
      }

      // ---------- 循环 / 并行 / 随机 ----------
      case 'loop': {
        this.anim(sprite, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
          duration: 1800,
          easing: 'linear',
          iterations: Infinity,
        })
        break
      }
      case 'parallel': {
        this.anim(sprite, [{ left: '30%' }, { left: '70%', offset: 0.5 }, { left: '30%' }], {
          duration: 1600,
          easing: 'ease-in-out',
          iterations: Infinity,
        })
        spriteB.style.opacity = '1'
        this.anim(spriteB, [{ top: '30%' }, { top: '75%', offset: 0.5 }, { top: '30%' }], {
          duration: 1100,
          easing: 'ease-in-out',
          iterations: Infinity,
        })
        break
      }
      case 'choice': {
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

      // ---------- 3D ----------
      case 'rotate3d': {
        this.r.stage.style.perspective = '700px'
        this.anim(sprite, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }], {
          duration: DURATION * 1.4,
          easing: 'ease-in-out',
        })
        this.delay(DURATION * 1.4 + 50, () => {
          this.r.stage.style.perspective = ''
        })
        break
      }

      // ---------- 概念型（无独立画面） ----------
      case 'concept': {
        caption.textContent = spec.text
        caption.style.opacity = '1'
        this.delay(2600, () => {
          caption.style.opacity = '0'
        })
        break
      }
    }
  }
}
