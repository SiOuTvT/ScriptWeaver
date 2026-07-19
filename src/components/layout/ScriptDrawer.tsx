import { useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Pin, X, Image as ImageIcon, Music, AudioLines, Volume2, Megaphone, DoorOpen, VolumeX } from 'lucide-react'
import type { LineDelta } from '@/core/types'
import { IconButton } from '@/components/ui'

export default function ScriptDrawer() {
  const deltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const selectLine = useAppStore((s) => s.selectLine)
  const open = useAppStore((s) => s.scriptDrawerOpen)
  const pinned = useAppStore((s) => s.scriptDrawerPinned)
  const toggleOpen = useAppStore((s) => s.toggleScriptDrawer)
  const togglePin = useAppStore((s) => s.toggleScriptDrawerPin)

  const listRef = useRef<HTMLDivElement>(null)

  // 选中行变化时自动滚动到视口
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIndex])

  // 抽屉宽度：钉住 = 348px，浮动 = 320px，收起 = 0（由外部控制显示/隐藏）
  const width = open ? (pinned ? 'w-[348px]' : 'w-80') : 'w-0'
  const visibility = open ? '' : 'invisible'

  return (
    <>
      {/* 抽屉本体 */}
      <aside
        className={`${width} ${visibility} flex shrink-0 flex-col bg-surface rounded-lg border border-edge/[0.14] shadow-sm transition-all duration-300 overflow-hidden`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-edge/12 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">剧本流 Script</span>
            <span className="rounded-full bg-surface-1 px-1.5 py-0.5 text-[12px] text-fg-subtle">
              {deltas.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* 钉住按钮 */}
            <IconButton
              variant="ghost"
              size="sm"
              icon={<Pin size={15} strokeWidth={1.75} />}
              onClick={togglePin}
              title={pinned ? '取消钉住' : '钉住面板'}
              aria-label={pinned ? '取消钉住' : '钉住面板'}
              className={pinned ? 'bg-signal/15 text-signal' : ''}
            />
            {/* 关闭按钮（钉住时隐藏） */}
            {!pinned && (
              <IconButton
                variant="ghost"
                size="sm"
                icon={<X size={15} strokeWidth={1.75} />}
                onClick={toggleOpen}
                title="关闭剧本流"
                aria-label="关闭剧本流"
              />
            )}
          </div>
        </div>

        {/* 行列表 */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {deltas.map((delta, i) => {
            const isSelected = i === selectedIndex
            const resolved = resolvedStates[i]

            return (
              <button
                key={delta.line_id}
                onClick={() => selectLine(i)}
                className={`relative w-full border-b border-edge/10 px-3 py-3 text-left transition-colors hover:bg-surface-hover ${
                  isSelected ? 'signal-bar bg-signal/10' : ''
                }`}
              >
                {/* 行号 + 角色 */}
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-[12px] font-mono text-fg-subtle">
                    {delta.line_id}
                  </span>
                  <span className="text-xs font-medium text-fg-muted">
                    {delta.speaker ?? '旁白'}
                  </span>
                  {/* 变更指示 */}
                  <ChangeIndicators delta={delta} />
                </div>

                {/* 台词 */}
                <p
                  className={`text-xs leading-relaxed ${
                    isSelected ? 'text-fg' : 'text-fg-subtle'
                  }`}
                >
                  {delta.dialogue}
                </p>

                {/* 合并状态摘要 */}
                {isSelected && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {resolved.background && (
                      <span className="flex items-center gap-1 rounded bg-surface-1 px-1 py-0.5 text-[12px] text-fg-subtle">
                        <ImageIcon size={10} strokeWidth={1.75} /> {resolved.background.asset_id}
                      </span>
                    )}
                    {resolved.audio.bgm && (
                      <span className="flex items-center gap-1 rounded bg-surface-1 px-1 py-0.5 text-[12px] text-fg-subtle">
                        <Music size={10} strokeWidth={1.75} /> {resolved.audio.bgm.asset_id}
                      </span>
                    )}
                    {resolved.audio.ambient && (
                      <span className="flex items-center gap-1 rounded bg-surface-1 px-1 py-0.5 text-[12px] text-fg-subtle">
                        <AudioLines size={10} strokeWidth={1.75} /> {resolved.audio.ambient.asset_id}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </aside>
    </>
  )
}

/** 行内变更指示 */
function ChangeIndicators({ delta: d }: { delta: LineDelta }) {
  const indicators: React.ReactNode[] = []
  const push = (key: string, node: React.ReactNode) => indicators.push(<span key={key}>{node}</span>)

  if (d.background !== null) push('bg', <ImageIcon size={11} strokeWidth={1.75} />)
  if (Object.keys(d.characters).length > 0) {
    const actions = Object.values(d.characters)
    if (actions.some((c) => c.action === 'show')) push('ch', <ImageIcon size={11} strokeWidth={1.75} className="text-signal" />)
    if (actions.some((c) => c.action === 'hide' || c.action === '__CLEAR__')) push('hide', <DoorOpen size={11} strokeWidth={1.75} />)
  }
  if (d.audio.bgm === '__CLEAR__') push('bgm-off', <VolumeX size={11} strokeWidth={1.75} />)
  else if (d.audio.bgm && d.audio.bgm !== null) push('bgm', <Music size={11} strokeWidth={1.75} />)
  if (d.audio.ambient === '__CLEAR__') push('amb-off', <VolumeX size={11} strokeWidth={1.75} />)
  else if (d.audio.ambient && d.audio.ambient !== null) push('amb', <AudioLines size={11} strokeWidth={1.75} />)
  if (d.audio.se.length > 0) push('se', <Megaphone size={11} strokeWidth={1.75} />)
  if (d.audio.voice) push('voice', <Volume2 size={11} strokeWidth={1.75} />)

  if (indicators.length === 0) return null

  return <span className="flex items-center gap-0.5 text-fg-subtle">{indicators}</span>
}
