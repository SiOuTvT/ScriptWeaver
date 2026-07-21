import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, GitBranch, CornerDownRight, ListTree, Sigma } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import type { ChoiceItem, LineDelta, VariableOperation } from '@/core/types'

/** 生成选项唯一 ID（单事务内稳定，作 React key） */
function genChoiceUid(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** 选项内联变量操作的本地预览（$ 表达式），与 rpyExporter 的 varOpExpr 对齐 */
function opPreview(op: VariableOperation): string {
  const n = op.varName || '?'
  switch (op.op) {
    case 'set':
      return `${n} = ${op.value === true ? 'True' : op.value === false ? 'False' : (op.value ?? 0)}`
    case 'add':
      return `${n} += ${op.value ?? 0}`
    case 'subtract':
      return `${n} -= ${op.value ?? 0}`
    case 'toggle':
      return `${n} = not ${n}`
    default:
      return ''
  }
}

/**
 * 选项编辑器（选择支行专属属性面板）。
 * 当时间轴选中「选择支行」时，右侧属性面板自动切换为本品。
 * 所有变更均经 updateDeltaAt / setLineType 单事务提交，严格遵守四大铁律。
 */
export default function ChoiceEditor() {
  const selectedIndex = useAppStore((s) => s.selectedLineIndex)
  const delta = useAppStore((s) => s.draftDeltas[s.selectedLineIndex])
  const variables = useAppStore((s) => s.variables)
  const allDeltas = useAppStore((s) => s.draftDeltas)
  const updateDeltaAt = useAppStore((s) => s.updateDeltaAt)
  const setLineType = useAppStore((s) => s.setLineType)

  // 全项目已定义的剧情块标签（供下拉建议：可跳到已登记的剧情块）
  const knownLabels = useMemo(() => {
    const set = new Set<string>(['start'])
    for (const d of allDeltas) {
      if (d.label?.trim()) set.add(d.label.trim())
    }
    return [...set]
  }, [allDeltas])

  if (!delta || delta.line_type !== 'choice') return null

  const choices = delta.choices ?? []

  const commitChoices = (next: ChoiceItem[]) => {
    updateDeltaAt(selectedIndex, (prev) => ({ ...prev, choices: next }))
  }

  const addChoice = () => {
    const next: ChoiceItem[] = [
      ...choices,
      { uid: genChoiceUid(), text: '', target_label: '', condition: '' },
    ]
    commitChoices(next)
  }

  const removeChoice = (uid: string) => {
    commitChoices(choices.filter((c) => c.uid !== uid))
  }

  const updateChoice = (uid: string, patch: Partial<ChoiceItem>) => {
    commitChoices(choices.map((c) => (c.uid === uid ? { ...c, ...patch } : c)))
  }

  const setPrompt = (prompt: string) => {
    updateDeltaAt(selectedIndex, (prev) => ({ ...prev, prompt }))
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-edge/[0.14] bg-surface shadow-sm transition-all">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-edge/12 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ListTree size={15} strokeWidth={1.75} className="text-signal" />
          <span className="eyebrow">选项编辑器</span>
          <span className="rounded-full bg-surface-1 px-1.5 py-0.5 text-[12px] text-fg-subtle">
            {delta.line_id}
          </span>
        </div>
        <button
          onClick={() => setLineType(selectedIndex, 'dialogue')}
          className="rounded px-1.5 py-0.5 text-[12px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          title="切换回对话行"
        >
          转回对话
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* 提示语（menu 标题） */}
        <div>
          <label className="mb-1 block text-[12px] font-medium text-fg-muted">选择支提示语（可选）</label>
          <PromptInput value={delta.prompt ?? ''} onChange={setPrompt} />
          <p className="mt-1 text-[12px] text-fg-faint">显示在选项上方的引导语，如「你要怎么做？」</p>
        </div>

        {/* 选项列表 */}
        <div className="space-y-2.5">
          {choices.length === 0 && (
            <div className="rounded-md border border-dashed border-edge/20 px-3 py-6 text-center text-[12px] text-fg-faint">
              暂无选项，点击下方「+ 新增选项」开始编辑
            </div>
          )}
          {choices.map((c, idx) => (
            <ChoiceCard
              key={c.uid}
              index={idx}
              choice={c}
              knownLabels={knownLabels}
              variables={variables}
              onChange={(patch) => updateChoice(c.uid, patch)}
              onRemove={() => removeChoice(c.uid)}
            />
          ))}
        </div>

        {/* 新增选项 */}
        <button
          onClick={addChoice}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-signal/40 bg-signal/5 py-2 text-[13px] font-medium text-signal transition-colors hover:bg-signal/10"
        >
          <Plus size={14} strokeWidth={1.75} /> 新增选项
        </button>
      </div>
    </aside>
  )
}

// ===================== 提示语输入（失焦单事务提交） =====================

function PromptInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => setLocal(value), [value])
  return (
    <input
      value={local}
      onChange={(e) => {
        setLocal(e.target.value)
        if (timer.current) clearTimeout(timer.current)
        const v = e.target.value
        timer.current = setTimeout(() => onChange(v), 300)
      }}
      onBlur={() => onChange(local)}
      placeholder="例如：你要怎么做？"
      className="w-full rounded-md border border-edge/15 bg-canvas px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-signal/50"
    />
  )
}

// ===================== 单选项卡片 =====================

function ChoiceCard({
  index,
  choice,
  knownLabels,
  variables,
  onChange,
  onRemove,
}: {
  index: number
  choice: ChoiceItem
  knownLabels: string[]
  variables: { name: string; type: 'boolean' | 'number' }[]
  onChange: (patch: Partial<ChoiceItem>) => void
  onRemove: () => void
}) {
  const [text, setText] = useState(choice.text)
  const [cond, setCond] = useState(choice.condition ?? '')
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const condTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 选中行 / 选项变化 → 同步本地态（兼容撤销重做与跨选项切换）
  useEffect(() => setText(choice.text), [choice.uid, choice.text])
  useEffect(() => setCond(choice.condition ?? ''), [choice.uid, choice.condition])

  const commitText = (v: string) => onChange({ text: v })
  const commitCond = (v: string) => onChange({ condition: v })

  // 点击变量库芯片 → 写入条件模板（利用任务 1/3 变量库联动）
  const insertVarTemplate = (name: string, type: 'boolean' | 'number') => {
    const tpl = type === 'boolean' ? `${name}` : `${name} >= `
    setCond(tpl)
    if (condTimer.current) clearTimeout(condTimer.current)
    condTimer.current = setTimeout(() => commitCond(tpl), 300)
  }

  // ---- 选项内联变量操作 ----
  const ops = choice.ops ?? []
  const setOps = (next: VariableOperation[]) => onChange({ ops: next })
  const addOp = () => {
    if (!variables.length) return
    const t = variables[0].type
    setOps([...ops, { varName: variables[0].name, op: 'add', value: t === 'boolean' ? false : 0 }])
  }
  const updateOp = (oi: number, patch: Partial<VariableOperation>) => {
    setOps(ops.map((op, i) => (i === oi ? { ...op, ...patch } : op)))
  }
  const removeOp = (oi: number) => setOps(ops.filter((_, i) => i !== oi))

  return (
    <div className="rounded-md border border-edge/15 bg-canvas/40 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-muted">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-signal/15 text-[11px] text-signal">
            {index + 1}
          </span>
          选项
        </span>
        <button
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
          title="删除此选项"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>

      {/* 选项文本 */}
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (textTimer.current) clearTimeout(textTimer.current)
          const v = e.target.value
          textTimer.current = setTimeout(() => commitText(v), 300)
        }}
        onBlur={() => commitText(text)}
        placeholder="选项按钮文本，如：拿钥匙开门"
        className="mb-2 w-full rounded-md border border-edge/15 bg-canvas px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-signal/50"
      />

      {/* 跳转目标（下拉框 + 自由输入） */}
      <div className="mb-2">
        <label className="mb-1 flex items-center gap-1 text-[12px] text-fg-subtle">
          <GitBranch size={12} strokeWidth={1.75} /> 跳转目标（剧情块 / 标签）
        </label>
        <input
          list="sw-choice-labels"
          value={choice.target_label}
          onChange={(e) => onChange({ target_label: e.target.value })}
          placeholder="留空 = 顺序继续（不跳转）"
          className="w-full rounded-md border border-edge/15 bg-canvas px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-signal/50"
        />
        <datalist id="sw-choice-labels">
          {knownLabels.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>

      {/* 前置变量条件 */}
      <div className="mb-2">
        <label className="mb-1 flex items-center gap-1 text-[12px] text-fg-subtle">
          <CornerDownRight size={12} strokeWidth={1.75} /> 前置变量条件（可选）
        </label>
        {variables.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {variables.map((v) => (
              <button
                key={v.name}
                onClick={() => insertVarTemplate(v.name, v.type)}
                title={`插入条件模板：${v.name}`}
                className="rounded bg-surface-1 px-1.5 py-0.5 text-[12px] text-fg-subtle transition-colors hover:bg-signal/15 hover:text-signal"
              >
                {v.name}
              </button>
            ))}
          </div>
        )}
        <input
          value={cond}
          onChange={(e) => {
            setCond(e.target.value)
            if (condTimer.current) clearTimeout(condTimer.current)
            const v = e.target.value
            condTimer.current = setTimeout(() => commitCond(v), 300)
          }}
          onBlur={() => commitCond(cond)}
          placeholder="如：tsundere_points >= 5（空 = 始终显示）"
          className="w-full rounded-md border border-edge/15 bg-canvas px-2.5 py-1.5 font-mono text-[12px] text-fg outline-none transition-colors focus:border-signal/50"
        />
        <p className="mt-1 text-[12px] text-fg-faint">
          条件不满足时该选项自动隐藏；如「没有钥匙则无法选此枝」
        </p>
      </div>

      {/* 选项内联变量操作（选中该选项时立即生效） */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-[12px] text-fg-subtle">
          <Sigma size={12} strokeWidth={1.75} /> 选项内变量操作（可选）
        </label>
        <div className="space-y-1.5">
          {ops.map((op, oi) => (
            <OpRow
              key={oi}
              op={op}
              variables={variables}
              onChange={(patch) => updateOp(oi, patch)}
              onRemove={() => removeOp(oi)}
            />
          ))}
        </div>
        <button
          onClick={addOp}
          disabled={variables.length === 0}
          title={variables.length === 0 ? '请先在变量库中添加变量' : '添加选项内变量操作'}
          className={`mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-dashed py-1 text-[12px] transition-colors ${
            variables.length === 0
              ? 'cursor-default border-edge/15 text-fg-faint'
              : 'border-signal/40 bg-signal/5 text-signal hover:bg-signal/10'
          }`}
        >
          <Plus size={12} strokeWidth={1.75} /> 添加变量操作
        </button>
        {ops.length > 0 && (
          <p className="mt-1 text-[12px] text-fg-faint">选中该选项后，立即执行上述 $ 语句再跳转</p>
        )}
      </div>
    </div>
  )
}

// ===================== 单条变量操作行 =====================

function OpRow({
  op,
  variables,
  onChange,
  onRemove,
}: {
  op: VariableOperation
  variables: { name: string; type: 'boolean' | 'number' }[]
  onChange: (patch: Partial<VariableOperation>) => void
  onRemove: () => void
}) {
  const vType = variables.find((v) => v.name === op.varName)?.type

  return (
    <div className="rounded border border-edge/12 bg-canvas/40 p-2">
      <div className="flex items-center gap-1.5">
        <select
          value={op.varName}
          onChange={(e) => {
            const t = variables.find((v) => v.name === e.target.value)?.type
            onChange({ varName: e.target.value, value: t === 'boolean' ? false : 0 })
          }}
          className="min-w-0 flex-1 rounded border border-edge/15 bg-canvas px-1.5 py-1 text-[12px] text-fg outline-none focus:border-signal/50"
        >
          {variables.length === 0 && <option value="">（无变量）</option>}
          {variables.map((v) => (
            <option key={v.name} value={v.name}>{v.name}</option>
          ))}
        </select>
        <select
          value={op.op}
          onChange={(e) => onChange({ op: e.target.value as VariableOperation['op'] })}
          className="rounded border border-edge/15 bg-canvas px-1.5 py-1 text-[12px] text-fg outline-none focus:border-signal/50"
        >
          <option value="set">=</option>
          <option value="add">+=</option>
          <option value="subtract">-=</option>
          <option value="toggle">取反</option>
        </select>
        {op.op !== 'toggle' &&
          (vType === 'boolean' ? (
            <select
              value={String(op.value === true)}
              onChange={(e) => onChange({ value: e.target.value === 'true' })}
              className="rounded border border-edge/15 bg-canvas px-1.5 py-1 text-[12px] text-fg outline-none focus:border-signal/50"
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              type="number"
              value={Number(op.value ?? 0)}
              onChange={(e) => onChange({ value: Number(e.target.value) })}
              className="w-16 rounded border border-edge/15 bg-canvas px-1.5 py-1 text-[12px] text-fg outline-none focus:border-signal/50"
            />
          ))}
        <button
          onClick={onRemove}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
          title="删除此操作"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>
      <p className="mt-1 font-mono text-[12px] text-fg-faint">$ {opPreview(op)}</p>
    </div>
  )
}
