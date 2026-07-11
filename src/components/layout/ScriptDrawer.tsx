import { useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'

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
        className={`${width} ${visibility} flex shrink-0 flex-col border-l border-gray-800 bg-gray-950 transition-all duration-300 overflow-hidden`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              剧本流
            </span>
            <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
              {deltas.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* 钉住按钮 */}
            <button
              onClick={togglePin}
              title={pinned ? '取消钉住' : '钉住面板'}
              className={`rounded p-1 text-sm transition-colors ${
                pinned
                  ? 'text-brand-400 bg-brand-600/20'
                  : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800'
              }`}
            >
              📌
            </button>
            {/* 关闭按钮（钉住时隐藏） */}
            {!pinned && (
              <button
                onClick={toggleOpen}
                className="rounded p-1 text-sm text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-400"
              >
                ✕
              </button>
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
                className={`w-full border-b border-gray-800/50 px-3 py-3 text-left transition-colors hover:bg-gray-900 ${
                  isSelected ? 'bg-brand-600/10 border-l-2 border-l-brand-500' : ''
                }`}
              >
                {/* 行号 + 角色 */}
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-[11px] font-mono text-gray-600">
                    {delta.line_id}
                  </span>
                  <span className="text-xs font-medium text-gray-300">
                    {delta.speaker ?? '旁白'}
                  </span>
                  {/* 变更指示 */}
                  <ChangeIndicators delta={delta} />
                </div>

                {/* 台词 */}
                <p
                  className={`text-xs leading-relaxed ${
                    isSelected ? 'text-gray-200' : 'text-gray-500'
                  }`}
                >
                  {delta.dialogue}
                </p>

                {/* 合并状态摘要 */}
                {isSelected && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {resolved.background && (
                      <span className="rounded bg-gray-800 px-1 py-0.5 text-[10px] text-gray-500">
                        🖼 {resolved.background.asset_id}
                      </span>
                    )}
                    {resolved.audio.bgm && (
                      <span className="rounded bg-gray-800 px-1 py-0.5 text-[10px] text-gray-500">
                        ♪ {resolved.audio.bgm.asset_id}
                      </span>
                    )}
                    {resolved.audio.ambient && (
                      <span className="rounded bg-gray-800 px-1 py-0.5 text-[10px] text-gray-500">
                        ♫ {resolved.audio.ambient.asset_id}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </aside>

      {/* 浮动触发按钮（抽屉关闭时显示） */}
      {!open && (
        <button
          onClick={toggleOpen}
          className="absolute top-4 right-4 z-20 rounded-lg border border-gray-700 bg-gray-900/90 px-3 py-1.5 text-xs text-gray-400 shadow-lg backdrop-blur transition-colors hover:bg-gray-800 hover:text-gray-200"
        >
          剧本
        </button>
      )}
    </>
  )
}

/** 行内变更指示 */
function ChangeIndicators({ delta: d }: { delta: import('@/core/types').LineDelta }) {
  const indicators: string[] = []

  if (d.background !== null) indicators.push('🖼')
  if (Object.keys(d.characters).length > 0) {
    const actions = Object.values(d.characters)
    if (actions.some((c) => c.action === 'show')) indicators.push('👤')
    if (actions.some((c) => c.action === 'hide' || c.action === '__CLEAR__')) indicators.push('🚪')
  }
  if (d.audio.bgm === '__CLEAR__') indicators.push('🔇')
  else if (d.audio.bgm && d.audio.bgm !== null) indicators.push('♪')
  if (d.audio.ambient === '__CLEAR__') indicators.push('🔇')
  else if (d.audio.ambient && d.audio.ambient !== null) indicators.push('♫')
  if (d.audio.se.length > 0) indicators.push('🔊')
  if (d.audio.voice) indicators.push('🎤')

  if (indicators.length === 0) return null

  return (
    <span className="flex gap-0.5 text-[10px]">
      {indicators.map((icon, idx) => (
        <span key={idx}>{icon}</span>
      ))}
    </span>
  )
}
