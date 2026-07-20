import { useEffect, useRef } from 'react'
import { EffectPlayer } from './effectPlayer'
import type { PreviewSpec } from '@/data/renpyEffects'

export interface ActiveSpec {
  spec: PreviewSpec
  token: number
}

const SPRITE_W = 168
const SPRITE_H = 232

/** 立绘剪影（自包含 SVG，无需外部素材即可演示） */
function Silhouette({ hue, label }: { hue: string; label: string }) {
  return (
    <svg width={SPRITE_W} height={SPRITE_H} viewBox="0 0 168 232" fill="none">
      <defs>
        <linearGradient id={`g-${hue}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hue} stopOpacity="0.95" />
          <stop offset="100%" stopColor={hue} stopOpacity="0.65" />
        </linearGradient>
      </defs>
      {/* 身体 */}
      <path d="M30 232 C30 160 52 120 84 120 C116 120 138 160 138 232 Z" fill={`url(#g-${hue})`} />
      {/* 头 */}
      <circle cx="84" cy="78" r="42" fill={`url(#g-${hue})`} />
      {/* 高光 */}
      <ellipse cx="70" cy="64" rx="14" ry="18" fill="#fff" fillOpacity="0.18" />
      <text x="84" y="220" textAnchor="middle" fontSize="13" fill="#fff" fillOpacity="0.85" fontWeight="600">
        {label}
      </text>
    </svg>
  )
}

export default function PreviewStage({ active }: { active: ActiveSpec | null }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const spriteRef = useRef<HTMLDivElement>(null)
  const spriteBRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const ballRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<EffectPlayer | null>(null)

  useEffect(() => {
    if (
      !stageRef.current ||
      !spriteRef.current ||
      !spriteBRef.current ||
      !flashRef.current ||
      !ballRef.current ||
      !captionRef.current
    )
      return
    playerRef.current = new EffectPlayer({
      stage: stageRef.current,
      sprite: spriteRef.current,
      spriteB: spriteBRef.current,
      flash: flashRef.current,
      ball: ballRef.current,
      caption: captionRef.current,
    })
  }, [])

  useEffect(() => {
    if (playerRef.current && active) playerRef.current.play(active.spec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.token])

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-edge/15 bg-gradient-to-br from-[#1b2030] via-[#222a3f] to-[#2c2440] shadow-inner"
    >
      {/* 背景景片（让转场有"前后幕"可辨） */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-8 top-10 h-24 w-24 rounded-full bg-sky-500/20 blur-2xl" />
        <div className="absolute right-10 bottom-12 h-32 w-32 rounded-full bg-fuchsia-500/20 blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* 双层立绘：sprite=当前 / spriteB=新入 */}
      <div
        ref={spriteRef}
        className="absolute"
        style={{
          left: '50%',
          top: '56%',
          width: SPRITE_W,
          height: SPRITE_H,
          marginLeft: -SPRITE_W / 2,
          marginTop: -SPRITE_H / 2,
          filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.45))',
        }}
      >
        <Silhouette hue="#6366f1" label="OLD" />
      </div>
      <div
        ref={spriteBRef}
        className="absolute"
        style={{
          left: '50%',
          top: '56%',
          width: SPRITE_W,
          height: SPRITE_H,
          marginLeft: -SPRITE_W / 2,
          marginTop: -SPRITE_H / 2,
          opacity: 0,
          filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.45))',
        }}
      >
        <Silhouette hue="#f43f5e" label="NEW" />
      </div>

      {/* 闪光层 */}
      <div ref={flashRef} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }} />

      {/* 缓动小球（Warpers 演示用） */}
      <div
        ref={ballRef}
        className="pointer-events-none absolute h-5 w-5 rounded-full bg-signal shadow-[0_0_18px_rgba(99,102,241,0.9)]"
        style={{ top: '50%', left: '8%', opacity: 0, transform: 'translateY(-50%)' }}
      />

      {/* 概念说明字幕 */}
      <div
        ref={captionRef}
        className="pointer-events-none absolute inset-x-5 bottom-5 rounded-lg border border-edge/15 bg-black/55 px-4 py-3 text-center text-[13px] leading-relaxed text-fg backdrop-blur-md"
        style={{ opacity: 0, transition: 'opacity 0.4s ease' }}
      />

      {/* 提示角标 */}
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-surface/70 px-2 py-0.5 font-mono text-[11px] text-fg-faint backdrop-blur">
        PREVIEW STAGE
      </div>
    </div>
  )
}
