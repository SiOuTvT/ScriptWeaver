// ============================================================
// ScriptWeaver - 变量实时监视与调试器（Variable Debugger / DevTools）
//
// 列出版本 1/3 定义的所有全局变量当前运行时值；剧本播放执行到 `$ <op>` 或
// 选择支时数值高亮跳变；支持创作者手控直接修改当前值，便于测试后续分支条件。
// 严守铁律：仅操作调试用 runtimeValues，绝不污染 .swproj 持久数据。
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Sigma, RotateCcw, ChevronDown, ChevronUp, Activity } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import type { RuntimeValues } from '@/utils/varRuntime'

export default function VariableDebugger({ embedded = false }: { embedded?: boolean }) {
  const variables = useAppStore((s) => s.variables)
  const runtimeValues = useAppStore((s) => s.runtimeValues)
  const setRuntimeValue = useAppStore((s) => s.setRuntimeValue)
  const resetRuntimeValues = useAppStore((s) => s.resetRuntimeValues)

  const [collapsed, setCollapsed] = useState(false)
  const [flash, setFlash] = useState<Record<string, boolean>>({})
  const prevRef = useRef<RuntimeValues>({})

  // 数值变化 → 高亮跳变
  useEffect(() => {
    const changed: Record<string, boolean> = {}
    for (const v of variables) {
      const cur = runtimeValues[v.name]
      const prev = prevRef.current[v.name]
      if (prev !== undefined && prev !== cur) changed[v.name] = true
    }
    prevRef.current = { ...runtimeValues }
    if (Object.keys(changed).length > 0) {
      setFlash(changed)
      const t = setTimeout(() => setFlash({}), 900)
      return () => clearTimeout(t)
    }
    prevRef.current = { ...runtimeValues }
  }, [runtimeValues, variables])

  const rootCls = embedded
    ? 'pointer-events-auto flex h-full w-full flex-col'
    : 'pointer-events-auto absolute right-3 top-14 z-50 w-60 overflow-hidden rounded-xl border border-edge/15 bg-surface/90 shadow-2 backdrop-blur-md'

  return (
    <div className={rootCls}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-edge/10 bg-surface-1/50 px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
          <Activity size={13} strokeWidth={1.75} className="text-signal" />
          变量监视
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={resetRuntimeValues}
            title="用初始值重置全部变量"
            className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <RotateCcw size={12} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? '展开' : '收起'}
            className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {collapsed ? <ChevronDown size={13} strokeWidth={1.75} /> : <ChevronUp size={13} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className={embedded ? 'min-h-0 flex-1 overflow-y-auto p-2' : 'max-h-[42vh] overflow-y-auto p-2'}>
          {variables.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-2 py-4 text-center">
              <Sigma size={18} strokeWidth={1.5} className="text-fg-faint" />
              <p className="text-[12px] leading-relaxed text-fg-subtle">
                暂无全局变量。先到「变量库」添加变量，即可在此实时监视与手控调试。
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {variables.map((v) => {
                const val = runtimeValues[v.name]
                const display = val === undefined ? v.initial : val
                const isFlash = flash[v.name]
                return (
                  <div
                    key={v.name}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors duration-300 ${
                      isFlash ? 'border-signal/60 bg-signal/20' : 'border-edge/10 bg-canvas/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate font-mono text-[12px] text-fg">{v.name}</span>
                        <span className="shrink-0 rounded bg-surface-1 px-1 text-[10px] uppercase text-fg-faint">
                          {v.type === 'boolean' ? 'bool' : 'num'}
                        </span>
                      </div>
                      {v.note && <p className="truncate text-[11px] text-fg-faint">{v.note}</p>}
                    </div>

                    {/* 手动编辑 / 实时值 */}
                    {v.type === 'boolean' ? (
                      <button
                        onClick={() => setRuntimeValue(v.name, !display)}
                        className={`shrink-0 rounded-md px-2 py-1 font-mono text-[12px] font-semibold transition-colors ${
                          display ? 'bg-success/20 text-success' : 'bg-surface-2 text-fg-subtle'
                        }`}
                        title="点击切换 True / False"
                      >
                        {display ? 'True' : 'False'}
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setRuntimeValue(v.name, Number(display) - 1)}
                          className="flex h-5 w-5 items-center justify-center rounded bg-surface-2 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                          title="减 1"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={Number(display)}
                          onChange={(e) => setRuntimeValue(v.name, Number(e.target.value))}
                          className="w-12 rounded bg-canvas px-1 py-0.5 text-center font-mono text-[12px] text-fg outline-none focus:ring-1 focus:ring-signal/50"
                        />
                        <button
                          onClick={() => setRuntimeValue(v.name, Number(display) + 1)}
                          className="flex h-5 w-5 items-center justify-center rounded bg-surface-2 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                          title="加 1"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
