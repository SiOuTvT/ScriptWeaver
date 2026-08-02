import { Sparkles, Trash2, Plus, Power, ExternalLink } from 'lucide-react'
import type { MountedEffect } from '@/core/types'
import {
  MOUNTABLE_EFFECTS,
  getMountable,
  mountablesForScope,
  createMountedEffect,
  EFFECT_CATEGORY3_ORDER,
  EFFECT_CATEGORY3_META,
  EFFECT_GROUP_ORDER,
  EFFECT_GROUP_LABEL,
  type EffectCategory3,
} from '@/data/mountableEffects'

interface EffectMountPanelProps {
  /** 当前已挂载的特效（来自立绘 / 背景） */
  effects: MountedEffect[]
  /** 挂载目标，决定下拉可用预设（'stage' = 舞台镜头 camera，'filter' = 仅 matrixcolor 滤镜） */
  scope: 'sprite' | 'background' | 'stage' | 'filter'
  /** 任意变更（增 / 删 / 启停 / 调参）后回传完整新数组，由父级单事务提交 */
  onChange: (next: MountedEffect[]) => void
}

/**
 * 时间轴特效挂载面板：把「特效大本营」的预设关联到具体剧本对象。
 * 完全受控：所有改动经 onChange 回传，由调用方（StagePreview 右侧面板）
 * 通过 updateDeltaAt 做单事务提交并持久化，本组件不触碰 store。
 */
export default function EffectMountPanel({ effects, scope, onChange }: EffectMountPanelProps) {
  const options = mountablesForScope(scope)

  const addEffect = (id: string) => {
    const def = getMountable(id)
    if (!def) return
    onChange([...effects, createMountedEffect(def)])
  }

  const removeEffect = (uid: string) => onChange(effects.filter((e) => e.uid !== uid))

  const toggleEffect = (uid: string) =>
    onChange(effects.map((e) => (e.uid === uid ? { ...e, enabled: !e.enabled } : e)))

  const setParam = (uid: string, key: string, value: number) =>
    onChange(
      effects.map((e) =>
        e.uid === uid ? { ...e, params: { ...e.params, [key]: value } } : e,
      ),
    )

  return (
    <div className="space-y-2">
      {/* 添加特效：下拉关联特效大本营预设 */}
      <div className="flex items-center gap-1.5">
        <Sparkles size={13} strokeWidth={1.75} className="shrink-0 text-signal" />
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addEffect(e.target.value)
            e.target.value = ''
          }}
          className="min-w-0 flex-1 rounded border border-edge/15 bg-surface-3 px-2 py-1 text-[12px] text-fg outline-none transition-colors focus:border-signal/60"
          title="从特效大本营三大类目（元素 / 转场 / 滤镜）选择要挂载的预设"
        >
          <option value="">+ 添加特效…</option>
          {EFFECT_CATEGORY3_ORDER.map((cat: EffectCategory3) => {
            const catOpts = options.filter((o) => o.category === cat)
            if (catOpts.length === 0) return null
            // 转场已覆盖官方全部预定义族，条目达数十条，按族拆二级分组避免下拉变成长条
            if (cat === 'transition') {
              return EFFECT_GROUP_ORDER.map((g) => {
                const gOpts = catOpts.filter((o) => (o.group ?? 'misc') === g)
                if (gOpts.length === 0) return null
                return (
                  <optgroup key={`${cat}-${g}`} label={`${EFFECT_CATEGORY3_META[cat].short} ${EFFECT_GROUP_LABEL[g]}`}>
                    {gOpts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.cn}
                      </option>
                    ))}
                  </optgroup>
                )
              })
            }
            return (
              <optgroup key={cat} label={EFFECT_CATEGORY3_META[cat].label}>
                {catOpts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.cn}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>

      {effects.length === 0 && (
        <p className="text-[12px] leading-relaxed text-fg-faint">
          暂无挂载特效。点击「+ 添加特效」从特效大本营三大类目（元素 / 转场 / 滤镜）选择，参数可在下方实时微调。
        </p>
      )}

      <div className="space-y-2">
        {effects.map((ef) => {
          const def = getMountable(ef.effectId)
          if (!def) return null
          return (
            <div
              key={ef.uid}
              className={`rounded-lg border p-2 transition-colors ${
                ef.enabled ? 'border-edge/15 bg-surface-2' : 'border-edge/10 bg-surface-1 opacity-60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleEffect(ef.uid)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
                    ef.enabled ? 'text-success hover:bg-surface-hover' : 'text-fg-faint hover:bg-surface-hover'
                  }`}
                  title={ef.enabled ? '已启用（点击停用）' : '已停用（点击启用）'}
                >
                  <Power size={13} strokeWidth={2} />
                </button>
                <span className="shrink-0 rounded bg-primary/[0.10] px-1.5 py-0.5 text-[12px] font-medium text-signal">
                  {EFFECT_CATEGORY3_META[def.category].short}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{def.cn}</span>
                <a
                  href={`#effect-${def.renpyEffectId}`}
                  onClick={(e) => e.preventDefault()}
                  className="shrink-0 rounded p-0.5 text-fg-faint transition-colors hover:bg-surface-hover hover:text-signal"
                  title="查看特效大本营对应条目"
                >
                  <ExternalLink size={12} strokeWidth={1.75} />
                </a>
                <button
                  type="button"
                  onClick={() => removeEffect(ef.uid)}
                  className="shrink-0 rounded p-0.5 text-fg-faint transition-colors hover:bg-danger/15 hover:text-danger"
                  title="移除该特效"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>

              {ef.enabled && def.params.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {def.params.map((p) => {
                    const val = ef.params[p.key] ?? p.def
                    // 离散选项（如官方 32 条缓动曲线）用下拉，连续量用滑块
                    if (p.enumValues) {
                      const idx = Math.min(Math.max(Math.round(val), 0), p.enumValues.length - 1)
                      return (
                        <div key={p.key}>
                          <div className="mb-0.5 text-[12px] text-fg-subtle">{p.label}</div>
                          <select
                            value={idx}
                            onChange={(e) => setParam(ef.uid, p.key, Number(e.target.value))}
                            className="w-full rounded border border-edge/15 bg-surface-3 px-1.5 py-1 font-mono text-[12px] text-fg outline-none transition-colors focus:border-signal/60"
                            title="Ren'Py 官方内建插值曲线，决定动画的加速与减速手感"
                          >
                            {p.enumValues.map((name, i) => (
                              <option key={name} value={i}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    }
                    return (
                      <div key={p.key}>
                        <div className="mb-0.5 flex items-center justify-between text-[12px]">
                          <span className="text-fg-subtle">{p.label}</span>
                          <span className="font-mono text-fg-faint">
                            {val}
                            {p.unit ?? ''}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          value={val}
                          onChange={(e) => setParam(ef.uid, p.key, Number(e.target.value))}
                          onPointerUp={() => undefined}
                          className="w-full accent-signal"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
