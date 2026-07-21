import { useState, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Button, IconButton, Input, ConfirmDialog } from '@/components/ui'
import { resolveAssetSrc } from '@/utils/assetSrc'
import { hashCharColor } from '@/utils/charColor'
import { getAudioCategory } from '@/utils/assetHelpers'
import { toggleAssetPreview, isAssetPlaying } from '@/utils/audioManager'
import { PRESET_SLOTS } from '@/core/positionSlots'
import type { CharacterConfig, ExpressionRef, AssetItem, AssetType } from '@/core/types'
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Star,
  UploadCloud,
  X,
  User,
  Volume2,
  MoveUp,
  MoveDown,
  Image as ImageIcon,
} from 'lucide-react'

const CHAR_ID_REGEX = /^[a-z][a-z0-9_]*$/

// ============================ 工具 ============================

const CHECKER =
  'linear-gradient(45deg,#d8d8d8 25%,transparent 25%),linear-gradient(-45deg,#d8d8d8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d8d8d8 75%),linear-gradient(-45deg,transparent 75%,#d8d8d8 75%)'

/** 由 hex 派生一层同色系花纹（仅作装饰，不入库） */
function tintGradient(hex: string): string {
  return `linear-gradient(135deg, ${hex}26 0%, ${hex}0a 60%, transparent 100%)`
}

/** 取角色默认表情（或首个表情）绑定的素材，用作头像 */
function getAvatarAsset(char: CharacterConfig | null, assets: AssetItem[]): AssetItem | undefined {
  if (!char) return undefined
  const refId = char.defaultExpression ?? char.expressions[0]?.id
  const ref = char.expressions.find((e) => e.id === refId) ?? char.expressions[0]
  if (!ref) return undefined
  return assets.find((a) => a.id === ref.assetId)
}

/** 取单个表情绑定的素材 */
function exprAsset(expr: ExpressionRef, assets: AssetItem[]): AssetItem | undefined {
  return assets.find((a) => a.id === expr.assetId)
}

/** drop 落盘后把 ipc 返回的文件转成 AssetItem（与 AssetManager 同源逻辑） */
function makeAsset(f: { id: string; fileName: string; relativePath: string; type: AssetType }): AssetItem {
  return {
    id: f.id,
    type: f.type,
    name: f.fileName.replace(/\.[^.]+$/, ''),
    fileName: f.fileName,
    relativePath: f.relativePath,
    importedAt: new Date().toISOString(),
  }
}

// ============================ 主组件 ============================

export default function CharacterManager() {
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const addCharacter = useAppStore((s) => s.addCharacter)
  const updateCharacter = useAppStore((s) => s.updateCharacter)
  const deleteCharacter = useAppStore((s) => s.deleteCharacter)
  const setCharacterConfigs = useAppStore((s) => s.setCharacterConfigs)
  const addAsset = useAppStore((s) => s.addAsset)

  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newCharId, setNewCharId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newCharIdError, setNewCharIdError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  // 表情编辑态
  const [editingExprId, setEditingExprId] = useState<string | null>(null)
  const [editingExprName, setEditingExprName] = useState('')
  const [showExprPicker, setShowExprPicker] = useState(false)
  const [exprDropActive, setExprDropActive] = useState(false)
  const [previewNameStyle, setPreviewNameStyle] = useState<'normal' | 'bold'>('bold')

  const selectedChar = selectedCharId
    ? characterConfigs.find((c) => c.charId === selectedCharId) ?? null
    : null

  const spriteAssets = useMemo(() => assets.filter((a) => a.type === 'sprite'), [assets])
  const voiceAssets = useMemo(
    () => assets.filter((a) => getAudioCategory(a.id) === 'voice'),
    [assets],
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 头像
  const avatarAsset = useMemo(() => getAvatarAsset(selectedChar, assets), [selectedChar, assets])

  // ---- 角色名校验 ----
  const validateCharId = useCallback(
    (id: string): string => {
      if (!id.trim()) return '变量名不能为空'
      if (!CHAR_ID_REGEX.test(id)) return '仅允许小写字母、数字、下划线，且必须以字母开头'
      if (characterConfigs.some((c) => c.charId === id)) return '该变量名已被使用'
      return ''
    },
    [characterConfigs],
  )

  // ---- 新建角色 ----
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
    setSelectedCharId(newCharId.trim())
  }, [newCharId, newDisplayName, addCharacter, validateCharId])

  // ---- 复制角色配置 ----
  const handleDuplicate = useCallback(
    (src: CharacterConfig) => {
      let newId = `${src.charId}_copy`
      let n = 1
      while (characterConfigs.some((c) => c.charId === newId)) newId = `${src.charId}_copy${n++}`
      addCharacter({
        charId: newId,
        displayName: `${src.displayName} 副本`,
        expressions: src.expressions.map((e) => ({ ...e })),
        defaultExpression: src.defaultExpression,
        dialogueColor: src.dialogueColor,
        voiceAssetId: src.voiceAssetId,
        defaultScale: src.defaultScale,
        defaultSlot: src.defaultSlot,
      })
      setSelectedCharId(newId)
    },
    [characterConfigs, addCharacter],
  )

  // ---- 调整显示顺序 ----
  const moveChar = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = characterConfigs.findIndex((c) => c.charId === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= characterConfigs.length) return
      const next = [...characterConfigs]
      const [item] = next.splice(idx, 1)
      next.splice(target, 0, item)
      setCharacterConfigs(next)
    },
    [characterConfigs, setCharacterConfigs],
  )

  // ---- 字段更新 ----
  const handleUpdateField = useCallback(
    (field: keyof CharacterConfig, value: string | number | undefined) => {
      if (!selectedCharId) return
      updateCharacter(selectedCharId, { [field]: value } as Partial<CharacterConfig>)
    },
    [selectedCharId, updateCharacter],
  )

  // ---- 表情：添加（素材选择器） ----
  const addExpressionFromAsset = useCallback(
    (asset: AssetItem) => {
      if (!selectedCharId) return
      const char = useAppStore.getState().characterConfigs.find((c) => c.charId === selectedCharId)
      if (!char) return
      const baseId = asset.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      let exprId = baseId
      let counter = 1
      while (char.expressions.some((e) => e.id === exprId)) {
        exprId = `${baseId}_${counter}`
        counter++
      }
      updateCharacter(selectedCharId, {
        expressions: [...char.expressions, { id: exprId, label: asset.name, assetId: asset.id }],
      })
      setShowExprPicker(false)
    },
    [selectedCharId, updateCharacter],
  )

  // ---- 表情：拖入文件上传（OS 真实路径落盘） ----
  const handleExprDrop = useCallback(
    async (paths: string[]) => {
      if (!selectedCharId) return
      setExprDropActive(false)
      const real = paths.filter(Boolean)
      const api = window.electronAPI
      if (real.length && api?.importFilesFromPaths) {
        const res = await api.importFilesFromPaths(real, 'sprite')
        if (res.success && res.files && res.files.length) {
          const newExprs: ExpressionRef[] = []
          for (const f of res.files) {
            addAsset(makeAsset(f))
            const baseId = f.fileName.toLowerCase().replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
            let exprId = baseId
            let counter = 1
            const char = useAppStore.getState().characterConfigs.find((c) => c.charId === selectedCharId)
            while (char?.expressions.some((e) => e.id === exprId) || newExprs.some((e) => e.id === exprId)) {
              exprId = `${baseId}_${counter}`
              counter++
            }
            newExprs.push({ id: exprId, label: f.fileName.replace(/\.[^.]+$/, ''), assetId: f.id })
          }
          const char = useAppStore.getState().characterConfigs.find((c) => c.charId === selectedCharId)
          if (char) {
            updateCharacter(selectedCharId, { expressions: [...char.expressions, ...newExprs] })
          }
        }
      } else if (fileInputRef.current) {
        fileInputRef.current.click()
      }
    },
    [selectedCharId, addAsset, updateCharacter],
  )

  // ---- 表情：浏览器降级上传 ----
  const handleBrowserUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedCharId) return
      const files = e.target.files
      if (!files) return
      const newExprs: ExpressionRef[] = []
      Array.from(files).forEach((file) => {
        const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        addAsset({
          id,
          type: 'sprite',
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          relativePath: '',
          blobUrl: URL.createObjectURL(file),
          importedAt: new Date().toISOString(),
        })
        const baseId = file.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
        let exprId = baseId
        let counter = 1
        const char = useAppStore.getState().characterConfigs.find((c) => c.charId === selectedCharId)
        while (char?.expressions.some((e) => e.id === exprId) || newExprs.some((e) => e.id === exprId)) {
          exprId = `${baseId}_${counter}`
          counter++
        }
        newExprs.push({ id: exprId, label: file.name.replace(/\.[^.]+$/, ''), assetId: id })
      })
      const char = useAppStore.getState().characterConfigs.find((c) => c.charId === selectedCharId)
      if (char) updateCharacter(selectedCharId, { expressions: [...char.expressions, ...newExprs] })
      e.target.value = ''
    },
    [selectedCharId, addAsset, updateCharacter],
  )

  // ---- 表情：重命名 Key ----
  const startRenameExpr = useCallback((expr: ExpressionRef) => {
    setEditingExprId(expr.id)
    setEditingExprName(expr.id)
  }, [])
  const commitRenameExpr = useCallback(() => {
    if (!selectedCharId || !editingExprId) return
    const newId = editingExprName.trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!newId) {
      setEditingExprId(null)
      return
    }
    const char = useAppStore.getState().characterConfigs.find((c) => c.charId === selectedCharId)
    if (!char) return
    if (char.expressions.some((e) => e.id === newId && e.id !== editingExprId)) {
      setEditingExprId(null)
      return
    }
    updateCharacter(selectedCharId, {
      expressions: char.expressions.map((e) => (e.id === editingExprId ? { ...e, id: newId } : e)),
      defaultExpression:
        char.defaultExpression === editingExprId ? newId : char.defaultExpression,
    })
    setEditingExprId(null)
  }, [selectedCharId, editingExprId, editingExprName, updateCharacter])

  // ---- 表情：设为默认 / 删除 ----
  const setDefaultExpr = useCallback(
    (exprId: string) => {
      if (!selectedCharId) return
      updateCharacter(selectedCharId, { defaultExpression: exprId })
    },
    [selectedCharId, updateCharacter],
  )
  const removeExpr = useCallback(
    (exprId: string) => {
      if (!selectedCharId || !selectedChar) return
      const rest = selectedChar.expressions.filter((e) => e.id !== exprId)
      const newDef = selectedChar.defaultExpression === exprId ? rest[0]?.id : selectedChar.defaultExpression
      updateCharacter(selectedCharId, { expressions: rest, defaultExpression: newDef })
    },
    [selectedCharId, selectedChar, updateCharacter],
  )

  const voiceAsset = selectedChar?.voiceAssetId
    ? assets.find((a) => a.id === selectedChar.voiceAssetId)
    : undefined
  const voicePlaying = voiceAsset ? isAssetPlaying(voiceAsset.id) : false

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-edge/14 bg-surface-1 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="signal-dot" />
          <span className="eyebrow">角色管理 Characters</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNewForm(!showNewForm)}
          className="text-signal hover:bg-signal/15"
        >
          <Plus size={14} strokeWidth={1.75} /> 新建角色
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ===== 左：角色名册 ===== */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-edge/12 bg-surface">
          {showNewForm && (
            <div className="space-y-2 border-b border-edge/10 p-2.5">
              <Input
                placeholder="变量名 (如 alice)"
                value={newCharId}
                onChange={(e) => {
                  setNewCharId(e.target.value)
                  setNewCharIdError('')
                }}
                error={!!newCharIdError}
                hint={newCharIdError || undefined}
              />
              <Input
                placeholder="显示名 (如 Alice)"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
              <div className="flex gap-1">
                <Button variant="primary" block size="sm" onClick={handleCreate}>
                  创建
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNewForm(false)
                    setNewCharIdError('')
                  }}
                >
                  取消
                </Button>
              </div>
              <p className="text-[11px] text-fg-faint">变量名仅允许小写字母开头 + 数字/下划线，如 alice, hero_1</p>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {characterConfigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-10 text-[12px] text-fg-faint">
                暂无角色，点击右上角新建
              </div>
            ) : (
              <div className="space-y-1.5">
                {characterConfigs.map((char, idx) => {
                  const isSelected = selectedCharId === char.charId
                  const color = char.dialogueColor || hashCharColor(char.charId)
                  const av = getAvatarAsset(char, assets)
                  const avSrc = av ? resolveAssetSrc(av) : undefined
                  const defExpr = char.expressions.find(
                    (e) => e.id === (char.defaultExpression ?? char.expressions[0]?.id),
                  )
                  return (
                    <div
                      key={char.charId}
                      className={`group relative overflow-hidden rounded-lg border transition-all ${
                        isSelected
                          ? 'signal-bar border-edge/20 bg-surface-2'
                          : 'border-transparent hover:bg-surface-hover'
                      }`}
                    >
                      {/* 主题色花纹顶条 */}
                      <div className="h-1 w-full" style={{ background: tintGradient(color) }} />
                      <button
                        onClick={() => {
                          setSelectedCharId(isSelected ? null : char.charId)
                          setShowNewForm(false)
                        }}
                        className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left"
                      >
                        {/* 头像 */}
                        <div
                          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-edge/20 bg-surface-3"
                          style={avSrc ? undefined : { background: tintGradient(color) }}
                        >
                          {avSrc ? (
                            <img src={avSrc} alt={char.displayName} className="h-full w-full object-contain" />
                          ) : (
                            <span
                              className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-fg"
                              style={{ color }}
                            >
                              {char.displayName.slice(0, 1)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-fg">{char.displayName}</div>
                          <div className="font-mono text-[11px] text-fg-faint">{char.charId}</div>
                          {/* 对话框文本样式预览（微型） */}
                          <div className="mt-1 flex items-center gap-1 rounded bg-surface-1/60 px-1.5 py-0.5">
                            <span
                              className="shrink-0 text-[11px] font-semibold"
                              style={{ color }}
                            >
                              {char.displayName.slice(0, 4)}
                            </span>
                            <span className="truncate text-[11px] text-fg-subtle">示例台词…</span>
                          </div>
                        </div>
                      </button>

                      {/* 悬浮操作：复制 / 上移 / 下移 / 删除 */}
                      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<Copy size={12} strokeWidth={1.75} />}
                          title="复制角色配置"
                          aria-label="复制角色配置"
                          onClick={() => handleDuplicate(char)}
                          className="bg-surface/80"
                        />
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<MoveUp size={12} strokeWidth={1.75} />}
                          title="上移"
                          aria-label="上移"
                          disabled={idx === 0}
                          onClick={() => moveChar(char.charId, -1)}
                          className="bg-surface/80"
                        />
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<MoveDown size={12} strokeWidth={1.75} />}
                          title="下移"
                          aria-label="下移"
                          disabled={idx === characterConfigs.length - 1}
                          onClick={() => moveChar(char.charId, 1)}
                          className="bg-surface/80"
                        />
                        <IconButton
                          size="xs"
                          variant="danger"
                          icon={<Trash2 size={12} strokeWidth={1.75} />}
                          title="删除角色"
                          aria-label="删除角色"
                          onClick={() => setPendingDelete(char.charId)}
                          className="bg-surface/80"
                        />
                      </div>
                      {defExpr && (
                        <span className="absolute bottom-1.5 right-2 font-mono text-[10px] text-fg-faint">
                          {char.expressions.length} 表情
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ===== 右：角色详情 ===== */}
        <section className="min-w-0 flex-1 overflow-y-auto">
          {selectedChar ? (
            <div className="mx-auto max-w-5xl space-y-5 p-5">
              {/* ---- 头部：头像 + 名称 + 主题色 ---- */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-edge/20 shadow-1"
                  style={
                    avatarAsset
                      ? undefined
                      : { background: tintGradient(selectedChar.dialogueColor || hashCharColor(selectedChar.charId)) }
                  }
                >
                  {avatarAsset ? (
                    <img
                      src={resolveAssetSrc(avatarAsset)}
                      alt={selectedChar.displayName}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center text-[28px] font-bold"
                      style={{ color: selectedChar.dialogueColor || hashCharColor(selectedChar.charId) }}
                    >
                      {selectedChar.displayName.slice(0, 1)}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[18px] font-semibold text-fg">{selectedChar.displayName}</h2>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] uppercase text-fg-subtle">
                      {selectedChar.charId}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-fg-faint">
                    角色专属对话框主题色与默认配置，改动即时反映到下方预览。
                  </p>

                  {/* 显示名编辑 */}
                  <div className="mt-2 max-w-xs">
                    <Input
                      value={selectedChar.displayName}
                      onChange={(e) => handleUpdateField('displayName', e.target.value)}
                      aria-label="显示名"
                    />
                  </div>
                </div>

                {/* 主题色 */}
                <div className="shrink-0 rounded-lg border border-edge/12 bg-surface-1 p-2.5">
                  <label className="mb-1 block text-[11px] text-fg-subtle">对话框主题色</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedChar.dialogueColor || '#888888'}
                      onChange={(e) => handleUpdateField('dialogueColor', e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-edge/15 bg-transparent"
                      aria-label="主题色拾色器"
                    />
                    <Input
                      value={selectedChar.dialogueColor || ''}
                      onChange={(e) => handleUpdateField('dialogueColor', e.target.value)}
                      placeholder="#888888"
                      className="w-24 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* ---- 声色与定位预设面板 ---- */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* 左：CV 语音包 + 缩放 + 槽位 */}
                <div className="rounded-xl border border-edge/12 bg-surface-1 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Volume2 size={15} strokeWidth={1.75} className="text-signal" />
                    <span className="eyebrow">声色与定位预设</span>
                  </div>

                  {/* CV 语音包预设 */}
                  <div className="mb-3">
                    <label className="mb-1 block text-[12px] text-fg-subtle">专属 CV 语音包预设</label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedChar.voiceAssetId ?? ''}
                        onChange={(e) => handleUpdateField('voiceAssetId', e.target.value || undefined)}
                        className="flex-1 rounded-md border border-edge/15 bg-surface-3 px-2 py-1.5 text-[13px] text-fg outline-none focus:border-signal/60"
                      >
                        <option value="">未绑定</option>
                        {voiceAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      {voiceAsset && (
                        <IconButton
                          size="sm"
                          variant={voicePlaying ? 'primary' : 'ghost'}
                          icon={voicePlaying ? <X size={14} strokeWidth={1.75} /> : <Volume2 size={14} strokeWidth={1.75} />}
                          aria-label={voicePlaying ? '停止试听' : '试听 CV'}
                          title={voicePlaying ? '停止试听' : '试听 CV'}
                          onClick={() => {
                            if (voiceAsset) toggleAssetPreview(voiceAsset)
                          }}
                        />
                      )}
                    </div>
                    {voiceAssets.length === 0 && (
                      <p className="mt-1 text-[11px] text-fg-faint">尚未导入 voice 类音频素材</p>
                    )}
                  </div>

                  {/* 默认出场缩放比例 */}
                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-[12px] text-fg-subtle">立绘默认出场缩放比例</label>
                      <span className="font-mono text-[12px] text-fg-muted">
                        {((selectedChar.defaultScale ?? 1) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={selectedChar.defaultScale ?? 1}
                      onChange={(e) => handleUpdateField('defaultScale', Number(e.target.value))}
                      className="w-full accent-signal"
                    />
                  </div>

                  {/* 默认槽位 */}
                  <div>
                    <label className="mb-1 block text-[12px] text-fg-subtle">立绘默认出场槽位</label>
                    <div className="grid grid-cols-5 gap-1">
                      {PRESET_SLOTS.map((slot) => {
                        const active = (selectedChar.defaultSlot ?? 'center') === slot.id
                        return (
                          <button
                            key={slot.id}
                            onClick={() => handleUpdateField('defaultSlot', slot.id)}
                            className={`rounded-md border px-1 py-1.5 text-[12px] transition-colors ${
                              active
                                ? 'border-signal bg-signal/15 text-signal'
                                : 'border-edge/15 bg-surface-3 text-fg-subtle hover:bg-surface-hover'
                            }`}
                          >
                            {slot.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* 右：对话框样式实时 Preview */}
                <div className="rounded-xl border border-edge/12 bg-surface-1 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="eyebrow">对话框样式实时预览</span>
                    <div className="flex items-center gap-1 rounded-md border border-edge/15 bg-surface-3 p-0.5">
                      <button
                        onClick={() => setPreviewNameStyle('normal')}
                        className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                          previewNameStyle === 'normal' ? 'bg-surface-2 text-fg' : 'text-fg-subtle'
                        }`}
                      >
                        常规
                      </button>
                      <button
                        onClick={() => setPreviewNameStyle('bold')}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          previewNameStyle === 'bold' ? 'bg-surface-2 text-fg' : 'text-fg-subtle'
                        }`}
                      >
                        加粗
                      </button>
                    </div>
                  </div>
                  <DialoguePreview
                    name={selectedChar.displayName}
                    color={selectedChar.dialogueColor || hashCharColor(selectedChar.charId)}
                    nameStyle={previewNameStyle}
                  />
                </div>
              </div>

              {/* ---- 表情包大观墙 ---- */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="eyebrow">表情包大观墙 Expressions</span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowExprPicker(!showExprPicker)}
                      className="text-signal hover:opacity-80"
                    >
                      <Plus size={13} strokeWidth={1.75} /> 从素材库添加
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const api = window.electronAPI
                        if (api?.importFilesFromPaths) {
                          // 触发 OS 拖入说明：直接点按走文件选择器降级
                          fileInputRef.current?.click()
                        } else {
                          fileInputRef.current?.click()
                        }
                      }}
                      className="text-signal hover:opacity-80"
                    >
                      <UploadCloud size={13} strokeWidth={1.75} /> 上传新表情
                    </Button>
                  </div>
                </div>

                {showExprPicker && (
                  <div className="mb-2 max-h-44 overflow-y-auto rounded-lg border border-edge/15 bg-surface-2 p-1.5">
                    {spriteAssets.length === 0 ? (
                      <p className="p-2 text-[12px] text-fg-faint">请先在素材管理中导入立绘图片</p>
                    ) : (
                      spriteAssets.map((asset) => {
                        const used = selectedChar.expressions.some((e) => e.assetId === asset.id)
                        return (
                          <button
                            key={asset.id}
                            disabled={used}
                            onClick={() => addExpressionFromAsset(asset)}
                            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                              used ? 'cursor-not-allowed text-fg-faint' : 'text-fg-muted hover:bg-surface-hover'
                            }`}
                          >
                            <ImageIcon size={14} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
                            <span className="truncate">{asset.name}</span>
                            {used && <span className="ml-auto text-[11px] text-fg-faint">已使用</span>}
                          </button>
                        )
                      })
                    )}
                  </div>
                )}

                {/* 拖拽上传热区包裹表情墙 */}
                <div
                  className="relative"
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('Files')) {
                      e.preventDefault()
                      setExprDropActive(true)
                    }
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget === e.target) setExprDropActive(false)
                  }}
                  onDrop={(e) => {
                    if (e.dataTransfer.types.includes('Files')) {
                      e.preventDefault()
                      const paths = Array.from(e.dataTransfer.files)
                        .map((f) => (f as unknown as { path?: string }).path)
                        .filter((p): p is string => !!p)
                      void handleExprDrop(paths)
                    }
                  }}
                >
                  {exprDropActive && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-signal bg-signal/10 text-[13px] font-medium text-signal backdrop-blur-sm">
                      <UploadCloud size={16} strokeWidth={1.75} className="mr-1.5" /> 松开以导入为新表情
                    </div>
                  )}

                  {selectedChar.expressions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge/15 bg-surface-1 py-12 text-[12px] text-fg-faint">
                      <ImageIcon size={26} strokeWidth={1.5} className="text-fg-subtle" />
                      暂无表情，点击「上传新表情」或拖入立绘图片
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {selectedChar.expressions.map((expr) => {
                        const asset = exprAsset(expr, assets)
                        const src = asset ? resolveAssetSrc(asset) : undefined
                        const isDefault = (selectedChar.defaultExpression ?? selectedChar.expressions[0]?.id) === expr.id
                        return (
                          <div
                            key={expr.id}
                            className={`group relative overflow-hidden rounded-xl border bg-surface-1 transition-all hover:shadow-2 ${
                              isDefault ? 'border-signal/60' : 'border-edge/12 hover:border-edge/25'
                            }`}
                          >
                            {/* 大图缩略 */}
                            <div
                              className="relative aspect-[3/4] w-full overflow-hidden"
                              style={{ background: CHECKER, backgroundSize: '14px 14px' }}
                            >
                              {src ? (
                                <img
                                  src={src}
                                  alt={expr.label}
                                  className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                                  draggable={false}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[12px] text-fg-faint">
                                  (素材缺失)
                                </div>
                              )}

                              {/* 默认徽标 */}
                              {isDefault && (
                                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-signal px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  <Star size={10} strokeWidth={2.5} /> 默认
                                </span>
                              )}

                              {/* 悬浮操作 */}
                              <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <IconButton
                                  size="xs"
                                  variant={isDefault ? 'primary' : 'ghost'}
                                  icon={<Star size={12} strokeWidth={1.75} />}
                                  title={isDefault ? '已是默认表情' : '设为默认表情'}
                                  aria-label="设为默认表情"
                                  disabled={isDefault}
                                  onClick={() => setDefaultExpr(expr.id)}
                                  className="bg-surface/85"
                                />
                                <IconButton
                                  size="xs"
                                  variant="ghost"
                                  icon={<Pencil size={12} strokeWidth={1.75} />}
                                  title="重命名表情 Key"
                                  aria-label="重命名表情 Key"
                                  onClick={() => startRenameExpr(expr)}
                                  className="bg-surface/85"
                                />
                                <IconButton
                                  size="xs"
                                  variant="danger"
                                  icon={<Trash2 size={12} strokeWidth={1.75} />}
                                  title="移除表情"
                                  aria-label="移除表情"
                                  onClick={() => removeExpr(expr.id)}
                                  className="bg-surface/85"
                                />
                              </div>
                            </div>

                            {/* 表情 Key + 显示名 */}
                            <div className="border-t border-edge/10 px-2 py-1.5">
                              {editingExprId === expr.id ? (
                                <input
                                  autoFocus
                                  value={editingExprName}
                                  onChange={(e) => setEditingExprName(e.target.value)}
                                  onBlur={commitRenameExpr}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRenameExpr()
                                    if (e.key === 'Escape') setEditingExprId(null)
                                  }}
                                  className="w-full rounded border border-signal bg-surface-3 px-1 py-0.5 font-mono text-[12px] text-fg outline-none"
                                />
                              ) : (
                                <div className="truncate font-mono text-[12px] font-medium text-signal">{expr.id}</div>
                              )}
                              <div className="truncate text-[11px] text-fg-subtle">{expr.label}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- 删除角色 ---- */}
              <div className="border-t border-edge/10 pt-4">
                <Button variant="danger" block onClick={() => setPendingDelete(selectedChar.charId)}>
                  删除角色
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[12px] text-fg-faint">
              <User size={28} strokeWidth={1.5} className="text-fg-subtle" />
              从左侧角色名册选择一名角色，查看并编辑头像、表情墙与声色定位预设
            </div>
          )}
        </section>
      </div>

      {/* 隐藏文件选择器（浏览器降级） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleBrowserUpload}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除角色"
        confirmText="删除"
        tone="danger"
        onConfirm={() => {
          if (pendingDelete) {
            deleteCharacter(pendingDelete)
            if (selectedCharId === pendingDelete) setSelectedCharId(null)
          }
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
        message={
          pendingDelete ? (
            <>确定要删除角色「{pendingDelete}」吗？此操作不可撤销，相关表情引用一并清除。</>
          ) : null
        }
      />
    </div>
  )
}

// ============================ 对话框样式实时预览 ============================

function DialoguePreview({
  name,
  color,
  nameStyle,
}: {
  name: string
  color: string
  nameStyle: 'normal' | 'bold'
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border bg-surface"
      style={{ borderColor: `${color}55` }}
    >
      {/* 主题色花纹条 */}
      <div className="h-1.5 w-full" style={{ background: tintGradient(color) }} />
      <div className="p-3">
        <div
          className="mb-1 text-[14px]"
          style={{ color, fontWeight: nameStyle === 'bold' ? 600 : 400 }}
        >
          {name || '角色名'}
        </div>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          这是一段示例台词，用于预览角色对话框的最终呈现效果。调整左侧主题色时，此处会即时同步。
        </p>
      </div>
    </div>
  )
}
