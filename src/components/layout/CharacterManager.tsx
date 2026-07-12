import { useState, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { CharacterConfig, ExpressionRef, AssetItem } from '@/core/types'

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

  // 删除角色
  const handleDeleteCharacter = useCallback(() => {
    if (!selectedCharId) return
    if (confirm(`确定要删除角色 "${selectedChar?.displayName ?? selectedCharId}" 吗？`)) {
      deleteCharacter(selectedCharId)
      setSelectedCharId(null)
    }
  }, [selectedCharId, selectedChar, deleteCharacter])

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-800 bg-gray-950/80">
      {/* 标题 */}
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          角色管理
        </span>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-brand-400 transition-colors hover:bg-brand-600/20"
        >
          + 新建
        </button>
      </div>

      {/* 新建角色表单 */}
      {showNewForm && (
        <div className="border-b border-gray-800 p-2 space-y-2">
          <div>
            <input
              type="text"
              placeholder="变量名 (如 alice)"
              value={newCharId}
              onChange={(e) => { setNewCharId(e.target.value); setNewCharIdError('') }}
              className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 outline-none focus:border-brand-500/50"
            />
            {newCharIdError && (
              <p className="mt-0.5 text-[10px] text-red-400">{newCharIdError}</p>
            )}
          </div>
          <input
            type="text"
            placeholder="显示名 (如 Alice)"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 outline-none focus:border-brand-500/50"
          />
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              className="flex-1 rounded bg-brand-600 py-1 text-[10px] font-medium text-white transition-colors hover:bg-brand-500"
            >
              创建
            </button>
            <button
              onClick={() => { setShowNewForm(false); setNewCharIdError('') }}
              className="rounded px-3 py-1 text-[10px] text-gray-400 transition-colors hover:bg-gray-800"
            >
              取消
            </button>
          </div>
          <p className="text-[10px] text-gray-600">
            变量名仅允许小写字母开头 + 数字/下划线，如 alice, hero_1
          </p>
        </div>
      )}

      {/* 角色列表 */}
      <div className="flex-1 overflow-y-auto">
        {characterConfigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-[10px] text-gray-600">
            暂无角色，点击"新建"创建
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {characterConfigs.map((char) => {
              const isSelected = selectedCharId === char.charId
              const exprCount = char.expressions.length

              // 角色列表项
              return (
                <div key={char.charId}>
                  <button
                    onClick={() => {
                      setSelectedCharId(isSelected ? null : char.charId)
                      setShowNewForm(false)
                    }}
                    className={`w-full px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-brand-600/10 border-l-2 border-brand-500'
                        : 'hover:bg-gray-800/50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* 颜色指示器 */}
                      {char.dialogueColor && (
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: char.dialogueColor }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-gray-300">
                          {char.displayName}
                        </span>
                        <span className="block text-[10px] text-gray-600">
                          {char.charId} · {exprCount} 表情
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-600">
                        {isSelected ? '▲' : '►'}
                      </span>
                    </div>
                  </button>

                  {/* 角色详情 */}
                  {isSelected && (
                    <div className="border-t border-gray-800/30 bg-gray-900/40 px-3 py-2 space-y-2">
                      {/* 变量名（只读） */}
                      <Field label="变量名" value={char.charId} readOnly />

                      {/* 显示名 */}
                      <Field
                        label="显示名"
                        value={char.displayName}
                        onChange={(v) => handleUpdateField('displayName', v)}
                      />

                      {/* 对话框颜色 */}
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">
                          对话框颜色
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={char.dialogueColor || '#888888'}
                            onChange={(e) => handleUpdateField('dialogueColor', e.target.value)}
                            className="h-6 w-8 rounded border border-gray-700 bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={char.dialogueColor || ''}
                            onChange={(e) => handleUpdateField('dialogueColor', e.target.value)}
                            placeholder="#888888"
                            className="flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-400 placeholder-gray-600 outline-none focus:border-brand-500/50"
                          />
                        </div>
                      </div>

                      {/* 表情管理 */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-gray-500">表情列表</label>
                          <button
                            onClick={() => setShowExprPicker(!showExprPicker)}
                            className="text-[10px] text-brand-400 hover:text-brand-300"
                          >
                            + 添加表情
                          </button>
                        </div>

                        {/* 表情选择器 */}
                        {showExprPicker && (
                          <div className="mb-2 max-h-40 overflow-y-auto rounded border border-gray-700 bg-gray-900 p-1">
                            {spriteAssets.length === 0 ? (
                              <p className="p-2 text-[10px] text-gray-600">
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
                                        ? 'text-gray-600 cursor-not-allowed'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                    }`}
                                  >
                                    <span className="text-xs">🖼</span>
                                    <span className="truncate">{asset.name}</span>
                                    {alreadyUsed && <span className="text-[9px] text-gray-600 ml-auto">已使用</span>}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        )}

                        {/* 已有表情列表 */}
                        {char.expressions.length === 0 ? (
                          <p className="text-[10px] text-gray-600 italic">暂无表情</p>
                        ) : (
                          <div className="space-y-1">
                            {char.expressions.map((expr) => {
                              const asset = assets.find((a) => a.id === expr.assetId)
                              return (
                                <div
                                  key={expr.id}
                                  className="flex items-center gap-2 rounded bg-gray-800/40 px-2 py-1"
                                >
                                  <span className="text-[10px] text-gray-500 w-12 shrink-0 truncate" title={expr.id}>
                                    {expr.id}
                                  </span>
                                  <span className="flex-1 truncate text-[10px] text-gray-400">
                                    {asset?.name ?? '(素材已删除)'}
                                  </span>
                                  <button
                                    onClick={() => handleRemoveExpression(expr.id)}
                                    className="shrink-0 text-[10px] text-gray-600 hover:text-red-400"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* 删除角色 */}
                      <button
                        onClick={handleDeleteCharacter}
                        className="w-full rounded border border-red-800/50 py-1 text-[10px] text-red-400 transition-colors hover:bg-red-900/20 hover:text-red-300"
                      >
                        删除角色
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 底部统计 */}
      <div className="border-t border-gray-800 px-3 py-1.5 text-[10px] text-gray-600">
        {characterConfigs.length} 个角色
      </div>
    </aside>
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
      <label className="block text-[10px] text-gray-500 mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] outline-none ${
          readOnly
            ? 'text-gray-500 cursor-not-allowed'
            : 'text-gray-300 placeholder-gray-600 focus:border-brand-500/50'
        }`}
      />
    </div>
  )
}
