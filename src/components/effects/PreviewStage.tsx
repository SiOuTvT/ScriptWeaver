import { useEffect, useRef, type RefObject } from 'react'
import { EffectPlayer, type PlayOpts } from './effectPlayer'
import type { PreviewSpec } from '@/data/renpyEffects'

export interface ActiveSpec {
  spec: PreviewSpec
  token: number
}

interface Props {
  active: ActiveSpec | null
  /** 背景图 URL（sw-asset:// 或本地 blob），为空时显示渐变兜底 */
  bgUrl?: string
  /** 立绘 URL，为空时显示占位块 */
  spriteUrl?: string
  duration: number
  amp: number
}

/**
 * 特效预览舞台（16:9）。
 *
 * 【重置机制】每次 active.token 变化都通过外层 <div key={token}> 强制重挂载，
 * 上一轮所有 DOM / 内联样式 / 动画被整体销毁重建，从绝对干净状态开始演示；
 * EffectPlayer.play() 内部再 clear() 一遍，双保险杜绝效果叠加。
 */
export default function PreviewStage({ active, bgUrl, spriteUrl, duration, amp }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const spriteRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const ballRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<EffectPlayer | null>(null)

  const token = active?.token

  useEffect(() => {
    if (!stageRef.current || !spriteRef.current || !flashRef.current || !ballRef.current || !captionRef.current) return
    const player = new EffectPlayer({
      stage: stageRef.current,
      sprite: spriteRef.current,
      flash: flashRef.current,
      ball: ballRef.current,
      caption: captionRef.current,
    })
    playerRef.current = player
    if (active) player.play(active.spec, { duration, amp } satisfies PlayOpts)
    return () => player.dispose()
    // 仅 token 变化触发重挂载+重播；duration/amp 由播放闭包读取，滑块松手时通过 token 重播生效
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div
      ref={stageRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-edge/15 bg-gradient-to-br from-[#1b2233] via-[#222b40] to-[#2c2440] shadow-inner"
    >
      {/* 背景层（第一保底：素材库背景 / 动态切换 / 本地选择 / 渐变兜底） */}
      {bgUrl ? (
        <img src={bgUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#2a3350] via-[#33405f] to-[#3a2f55]" />
      )}

      {/* 关键：key=token 的动画层，每次播放整体重挂载 → 彻底清空上一轮叠加态 */}
      <div key={token ?? 0} className="absolute inset-0">
        {/* 立绘层：居中由 flex 承担，动画只改 transform/opacity/clip 等（不与定位冲突） */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {spriteUrl ? (
            <img
              ref={spriteRef as unknown as RefObject<HTMLImageElement>}
              src={spriteUrl}
              alt=""
              draggable={false}
              className="h-[76%] w-auto max-w-[74%] object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.5)]"
            />
          ) : (
            <div
              ref={spriteRef}
              className="flex h-[60%] w-[34%] min-w-[120px] items-center justify-center rounded-2xl border border-white/15 bg-gradient-to-br from-[#5b6cff]/80 to-[#b15bff]/80 text-[14px] font-medium text-white/90 shadow-[0_14px_28px_rgba(0,0,0,0.5)]"
            >
              立绘占位
            </div>
          )}
        </div>

        {/* 闪光层（fade/flash 用） */}
        <div ref={flashRef} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }} />

        {/* 缓动小球（Warpers 演示用） */}
        <div
          ref={ballRef}
          className="pointer-events-none absolute h-4 w-4 rounded-full bg-signal shadow-[0_0_18px_rgba(99,102,241,0.9)]"
          style={{ top: '50%', left: '8%', opacity: 0, transform: 'translateY(-50%)' }}
        />

        {/* 概念说明字幕 */}
        <div
          ref={captionRef}
          className="pointer-events-none absolute inset-x-5 bottom-5 rounded-lg border border-edge/15 bg-black/55 px-4 py-3 text-center text-[13px] leading-relaxed text-fg backdrop-blur-md"
          style={{ opacity: 0, transition: 'opacity 0.4s ease' }}
        />
      </div>

      {/* 角标 */}
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/40 px-2 py-0.5 font-mono text-[12px] text-white/60 backdrop-blur">
        PREVIEW
      </div>
    </div>
  )
}
