import { useState, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Button, Input, ConfirmDialog } from '@/components/ui'
import { Image as ImageIcon, X, ChevronDown, ChevronRight } from 'lucide-react'
import type { CharacterConfig, ExpressionRef, AssetItem } from '@/core/types'
import { hashCharColor } from '@/utils/charColor'

const CHAR_ID_REGEX = /^[a-z][a-z0-9_]*$/

export default function CharacterManager() {
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const addCharacter = useAppStore((s) => s.addCharacter)
  const updateCharacter = useAppStore((s) => s.updateCharacter)
  const deleteCharacter = useAppStore((s) => s.deleteCharacter)

  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [showExprPicker, setShowExprPicker] = useState(false)

  // 新建角色表单
  const [newCharId, setNewCharId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newCharIdError, setNewCharIdError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const selectedChar = selectedCharId
    ? characterConfigs.find((c) => c.charId === selectedCharId)
    : null

  // 获取所有 sprite 类型的素材
  const spriteAssets = assets.filter((a) => a.type === 'sprite')

  // 校验 charId
  const validateCharId = useCallback(
    (id: string): string => {
      if (!id.trim()) return '变量名不能为空'
      if (!CHAR_ID_REGEX.test(id)) return '仅允许小写字母、数字、下划线，且必须以字母开头'
      const exists = characterConfigs.some((c) => c.charId === id)
      if (exists) return '该变量名已被使用'
      return ''
    },
    [characterConfigs],
  )

  // 新建角色
  const handleCreate = useCallback(() => {
    const err = validateCharId(newCharId)
    if (err) {
      setNewCharIdError(err)
      return
    }
    if (!newDisplayName.trim()) return

    addCharacter({
      charId: newCharId.trim(),
      displayName: newDisplayName.trim(),
      expressions: [],
    })
    setNewCharId('')
    setNewDisplayName('')
    setNewCharIdError('')
    setShowNewForm(false)
  }, [newCharId, newDisplayName, addCharacter, validateCharId])

  // 更新角色字段
  const handleUpdateField = useCallback(
    (field: keyof CharacterConfig, value: string) => {
      if (!selectedCharId) return
      updateCharacter(selectedCharId, { [field]: value })
    },
    [selectedCharId, updateCharacter],
  )

  // 添加表情
  const handleAddExpression = useCallback(
    (asset: AssetItem) => {
      if (!selectedCharId) return
      const char = characterConfigs.find((c) => c.charId === selectedCharId)
      if (!char) return

      // 自动生成表情 ID
      const baseId = asset.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      let exprId = baseId
      let counter = 1
      while (char.expressions.some((e) => e.id === exprId)) {
        exprId = `${baseId}_${counter}`
        counter++
      }

      const newExpr: ExpressionRef = {
        id: exprId,
        label: asset.name,
        assetId: asset.id,
      }
      updateCharacter(selectedCharId, {
        expressions: [...char.expressions, newExpr],
      })
      setShowExprPicker(false)
    },
    [selectedCharId, characterConfigs, updateCharacter],
  )

  // 删除表情
  const handleRemoveExpression = useCallback(
    (exprId: string) => {
      if (!selectedCharId || !selectedChar) return
      updateCharacter(selectedCharId, {
        expressions: selectedChar.expressions.filter((e) => e.id !== exprId),
      })
    },
    [selectedCharId, selectedChar, updateCharacter],
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-edge/12 bg-surface shadow-[0_1px_3px_rgba(28,24,18,0.08)]">
      {/* 标题 */}
      <div className="flex items-center justify-between border-b border-edge/14 bg-surface-1 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          角色管理
        </span>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/15"
        >
          + 新建
        </button>
      </div>

      {/* 新建角色表单 */}
      {showNewForm && (
        <div className="space-y-2 border-b border-edge/10 p-2">
          <Input
            placeholder="变量名 (如 alice)"
            value={newCharId}
            onChange={(e) => { setNewCharId(e.target.value); setNewCharIdError('') }}
            error={!!newCharIdError}
            hint={newCharIdError || undefined}
          />
          <Input
            placeholder="显示名 (如 Alice)"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
          />
          <div className="flex gap-1">
            <Button variant="primary" block onClick={handleCreate}>
              创建
            </Button>
            <Button variant="ghost" onClick={() => { setShowNewForm(false); setNewCharIdError('') }}>
              取消
            </Button>
          </div>
          <p className="text-[10px] text-fg-faint">
            变量名仅允许小写字母开头 + 数字/下划线，如 alice, hero_1
          </p>
        </div>
      )}

      {/* 角色列表 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
        {characterConfigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-[10px] text-fg-faint">
            暂无角色，点击"新建"创建
          </div>
        ) : (
          <div className="space-y-0 p-2">
            {characterConfigs.map((char) => {
              const isSelected = selectedCharId === char.charId
              const exprCount = char.expressions.length

              // 角色列表项
              return (
                <div key={char.charId} className="mx-2 my-1 flex items-stretch overflow-hidden rounded-lg border border-edge/12 bg-surface-2/60 shadow-[0_1px_2px_rgba(28,24,18,0.05)] transition-all hover:border-edge/20">
                  {/* 角色色块：点开即可取色，控制时间轴/总览/对话框 */}
                  <label
                    title="角色色（时间轴 / 总览 / 对话框通用）"
                    className="relative flex w-8 shrink-0 cursor-pointer items-center justify-center border-r border-edge/10 hover:bg-surface-hover"
                  >
                    <span
                      className="pointer-events-none h-3.5 w-3.5 rounded-full border border-edge/30"
                      style={{ backgroundColor: char.dialogueColor || hashCharColor(char.charId) }}
                    />
                    <input
                      type="color"
                      value={char.dialogueColor || '#888888'}
                      onChange={(e) => updateCharacter(char.charId, { dialogueColor: e.target.value })}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <button
                    onClick={() => {
                      setSelectedCharId(isSelected ? null : char.charId)
                      setShowNewForm(false)
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-primary/8'
                        : 'hover:bg-surface-hover'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-fg-muted">
                        {char.displayName}
                      </span>
                      <span className="block text-[10px] text-fg-faint">
                        {char.charId} · {exprCount} 表情
                      </span>
                    </div>
                    <span className="text-[10px] text-fg-faint">
                      {isSelected ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
                    </span>
                  </button>

                  {/* 角色详情 */}
                  {isSelected && (
                    <div className="space-y-2 border-t border-edge/10 bg-surface-1/40 px-3 py-2">
                      {/* 变量名（只读） */}
                      <Field label="变量名" value={char.charId} readOnly />

                      {/* 显示名 */}
                      <Field
                        label="显示名"
                        value={char.displayName}
                        onChange={(v) => handleUpdateField('displayName', v)}
                      />

                      {/* 角色色（时间轴 / 总览 / 对话框通用） */}
                      <div>
                        <label className="mb-0.5 block text-[10px] text-fg-subtle">
                          角色色（时间轴 / 总览 / 对话框通用）
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={char.dialogueColor || '#888888'}
                            onChange={(e) => handleUpdateField('dialogueColor', e.target.value)}
                            className="h-6 w-8 cursor-pointer rounded border border-edge/15 bg-transparent"
                          />
                          <Input
                            value={char.dialogueColor || ''}
                            onChange={(e) => handleUpdateField('dialogueColor', e.target.value)}
                            placeholder="#888888"
                            className="flex-1"
                          />
                        </div>
                      </div>

                      {/* 表情管理 */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[10px] text-fg-subtle">表情列表</label>
                          <button
                            onClick={() => setShowExprPicker(!showExprPicker)}
                            className="text-[10px] text-primary transition-colors hover:text-primary-hover"
                          >
                            + 添加表情
                          </button>
                        </div>

                        {/* 表情选择器 */}
                        {showExprPicker && (
                          <div className="mb-2 max-h-40 overflow-y-auto rounded border border-edge/15 bg-surface-2 p-1">
                            {spriteAssets.length === 0 ? (
                              <p className="p-2 text-[10px] text-fg-faint">
                                请先在素材管理中导入立绘图片
                              </p>
                            ) : (
                              spriteAssets.map((asset) => {
                                const alreadyUsed = char.expressions.some((e) => e.assetId === asset.id)
                                return (
                                  <button
                                    key={asset.id}
                                    disabled={alreadyUsed}
                                    onClick={() => handleAddExpression(asset)}
                                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[10px] transition-colors ${
                                      alreadyUsed
                                        ? 'cursor-not-allowed text-fg-faint'
                                        : 'text-fg-muted hover:bg-surface-hover'
                                    }`}
                                  >
                                    <ImageIcon size={14} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
                                    <span className="truncate">{asset.name}</span>
                                    {alreadyUsed && <span className="ml-auto text-[9px] text-fg-faint">已使用</span>}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        )}

                        {/* 已有表情列表 */}
                        {char.expressions.length === 0 ? (
                          <p className="text-[10px] italic text-fg-faint">暂无表情</p>
                        ) : (
                          <div className="space-y-1">
                            {char.expressions.map((expr) => {
                              const asset = assets.find((a) => a.id === expr.assetId)
                              return (
                                <div
                                  key={expr.id}
                                  className="flex items-center gap-2 rounded bg-surface-1/40 px-2 py-1"
                                >
                                  <span className="w-12 shrink-0 truncate text-[10px] text-fg-subtle" title={expr.id}>
                                    {expr.id}
                                  </span>
                                  <span className="flex-1 truncate text-[10px] text-fg-muted">
                                    {asset?.name ?? '(素材已删除)'}
                                  </span>
                                  <button
                                    onClick={() => handleRemoveExpression(expr.id)}
                                    className="shrink-0 text-fg-faint transition-colors hover:text-danger"
                                    title="移除表情"
                                  >
                                    <X size={13} strokeWidth={1.75} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* 删除角色 */}
                      <Button
                        variant="danger"
                        block
                        onClick={() => setPendingDelete(char.charId)}
                      >
                        删除角色
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>

      {/* 底部统计 */}
      <div className="border-t border-edge/10 px-3 py-1.5 text-[10px] text-fg-subtle">
        {characterConfigs.length} 个角色
      </div>

      {/* 删除确认框 */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除角色"
        confirmText="删除"
        tone="danger"
        onConfirm={() => {
          if (pendingDelete) {
            deleteCharacter(pendingDelete)
            setSelectedCharId(null)
          }
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
        message={
          pendingDelete ? (
            <>确定要删除角色「{pendingDelete}」吗？此操作不可撤销。</>
          ) : null
        }
      />
    </div>
  )
}

/** 简易表单字段 */
function Field({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-fg-subtle">{label}</label>
      <Input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={readOnly ? 'text-fg-faint' : ''}
      />
    </div>
  )
}
