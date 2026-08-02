/**
 * Ren'Py 工程导入对话框（重写版）
 * 全宽响应式布局 | 真实浏览按钮 | 全量素材解析 | 完整统计面板
 */

import { useState, useCallback } from 'react'
import {
  FolderOpen, Loader2, X, AlertTriangle, CheckCircle2, ChevronLeft,
  FileDown, Info, BookOpen, FileText, Users, Code, Image, Music, BarChart3,
  ExternalLink, FolderSearch, FileCheck, Upload, ShieldAlert,
} from 'lucide-react'
import { importRpyDirectory, type RpyImportResult } from '@/utils/rpyImporter'
import { useAppStore } from '@/stores/appStore'
import { createSnapshot } from '@/utils/cloudSync'
import { serializeProject } from '@/utils/projectFile'
import { toast } from '@/utils/toast'
import type { CharacterConfig, AssetItem, LineDelta, GlobalVariable, CharacterDelta } from '@/core/types'

interface Props {
  onClose?: () => void
  embedded?: boolean
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function buildImportLabel(dirPath: string): string {
  const name = dirPath.split(/[\\/]/).pop() || dirPath
  const ts = new Date().toLocaleString('zh-CN', { hour12: false })
  return `导入: ${name} (${ts})`
}

// ═══════════════════════════════════════════
// Stats card component
// ═══════════════════════════════════════════

function StatCard({ icon: Icon, label, value, sub, color = 'primary' }: {
  icon: React.ComponentType<any>
  label: string
  value: string | number
  sub?: string
  color?: 'primary' | 'success' | 'warning' | 'info' | 'muted'
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/[0.06] text-primary',
    success: 'bg-emerald/[0.06] text-emerald',
    warning: 'bg-amber/[0.06] text-amber',
    info: 'bg-sky/[0.06] text-sky',
    muted: 'bg-fg/[0.04] text-fg-muted',
  }
  return (
    <div className="rounded-2xl border border-edge/10 bg-surface p-4 shadow-1">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorMap[color] || colorMap.primary}`}>
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <span className="text-[12px] font-medium text-fg-muted">{label}</span>
      </div>
      <div className="text-[24px] font-semibold text-fg tabular-nums leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-fg-faint">{sub}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════

export default function RpyImportDialog({ onClose, embedded }: Props) {
  const setActiveNavItem = useAppStore((s) => s.setActiveNavItem)

  const wrappedClose = useCallback(() => {
    if (onClose) onClose()
    if (embedded) setActiveNavItem('chapters')
  }, [onClose, embedded, setActiveNavItem])

  // ═══ State ═══
  const [dirPath, setDirPath] = useState('')
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'preview' | 'importing' | 'done'>('idle')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<RpyImportResult | null>(null)

  // ═══ Browse ═══
  const handleBrowse = useCallback(async () => {
    try {
      const result = await (window as any).electronAPI?.selectDirectory()
      if (result && result.path) {
        setDirPath(result.path)
        setError('')
        setPreview(null)
        setPhase('idle')
      }
    } catch {
      // 用户取消或 API 不可用
    }
  }, [])

  // ═══ Scan ═══
  const handleScan = useCallback(async () => {
    if (!dirPath.trim()) {
      setError('请先选择 Ren\'Py 工程目录（通常是 game 目录）')
      return
    }
    setPhase('scanning')
    setError('')
    setPreview(null)
    try {
      const result = await importRpyDirectory(dirPath.trim())
      setPreview(result)
      setPhase('preview')

      if (result.deltas.length === 0 && result.imageAssets.filter(a => a.fileName).length === 0 && result.audioAssets.filter(a => a.fileName).length === 0) {
        setError('未在目录中找到可解析的 .rpy 文件或素材文件')
      }
    } catch (e: any) {
      setError(e?.message ?? '扫描失败，请检查目录路径是否正确')
      setPhase('idle')
    }
  }, [dirPath])

  // ═══ Import ═══
  const handleImport = useCallback(async () => {
    if (!preview) return
    const store = useAppStore.getState()

    // 前置检查：项目未保存时，素材无法落盘（importFilesFromPaths 需要 activeProjectRoot）
    if (!store.projectRoot) {
      toast('请先保存当前项目（Ctrl+S），再导入 Ren\'Py 工程', 'warning')
      return
    }

    setPhase('importing')

    try {
      const fsImport = (window as any).electronAPI?.importFilesFromPaths as
        ((paths: string[], kind?: string) => Promise<{ success: boolean; files?: AssetItem[]; error?: string }>) | undefined

      // ── Step 1: 导入素材文件 ──
      const importedImageMap = new Map<string, AssetItem>()
      const importedAudioMap = new Map<string, AssetItem>()
      const importedVideoMap = new Map<string, AssetItem>()

      if (fsImport) {
        const validImages = preview.imageAssets.filter(a => a.fileName)
        // 立绘(sprite)与背景(background)分组导入：保证素材管理分类正确、场景预览能正确渲染
        const spriteImages = validImages.filter(a => a.usage === 'sprite')
        const bgImages = validImages.filter(a => a.usage !== 'sprite')

        const importImageGroup = async (group: typeof validImages, kind: string) => {
          if (group.length === 0) return
          const paths = group.map(a =>
            dirPath + (dirPath.endsWith('\\') || dirPath.endsWith('/') ? '' : '\\') + a.relativePath)
          try {
            const r = await fsImport(paths, kind)
            if (r.success && r.files) {
              for (let i = 0; i < r.files.length && i < group.length; i++) {
                importedImageMap.set(group[i].refName, r.files[i])
              }
            }
          } catch { /* 部分图片导入失败，继续 */ }
        }

        await importImageGroup(spriteImages, 'sprite')
        await importImageGroup(bgImages, 'background')

        const validAudio = preview.audioAssets.filter(a => a.fileName)
        if (validAudio.length > 0) {
          const audioPaths = validAudio.map(a =>
            dirPath + (dirPath.endsWith('\\') || dirPath.endsWith('/') ? '' : '\\') + a.relativePath)
          try {
            const r = await fsImport(audioPaths, 'audio')
            if (r.success && r.files) {
              for (let i = 0; i < r.files.length && i < validAudio.length; i++) {
                importedAudioMap.set(validAudio[i].refName, r.files[i])
              }
            }
          } catch { /* 部分音频导入失败 */ }
        }

        // 视频组：Movie(play=...) / renpy.movie_cutscene 收集到的视频文件
        const validVideo = preview.videoAssets.filter(a => a.fileName)
        if (validVideo.length > 0) {
          const videoPaths = validVideo.map(a =>
            dirPath + (dirPath.endsWith('\\') || dirPath.endsWith('/') ? '' : '\\') + a.relativePath)
          try {
            const r = await fsImport(videoPaths, 'video')
            if (r.success && r.files) {
              for (let i = 0; i < r.files.length && i < validVideo.length; i++) {
                importedVideoMap.set(validVideo[i].refName, r.files[i])
              }
            }
          } catch { /* 部分视频导入失败 */ }
        }
      }

      // ── Step 2: 注册素材到 store ──
      // 使用 store.setAssets() 一次性批量替换，避免每 addAsset 都 pushHistory。
      // 按 relativePath 去重：fsImport 已做内容去重（同名/同内容文件复用），
      // 这里再兜底一次，杜绝同一文件在素材库里出现两份 AssetItem。
      const currentAssets = [...useAppStore.getState().assets]
      const newAssets: AssetItem[] = [...currentAssets]
      const seenRel = new Set(newAssets.map(a => a.relativePath))
      const pushUnique = (asset: AssetItem) => {
        if (seenRel.has(asset.relativePath)) return
        seenRel.add(asset.relativePath)
        newAssets.push(asset)
      }
      for (const [, asset] of importedImageMap) pushUnique(asset)
      for (const [, asset] of importedAudioMap) pushUnique(asset)
      for (const [, asset] of importedVideoMap) pushUnique(asset)
      useAppStore.getState().setAssets(newAssets)

      // ── Step 3: 注册角色 ──
      const currentChars = [...useAppStore.getState().characterConfigs]
      const newChars: CharacterConfig[] = [...currentChars]
      for (const char of preview.characters) {
        if (!newChars.find(c => c.charId === char.charId)) {
          newChars.push({
            charId: char.charId,
            displayName: char.displayName || char.charId,
            dialogueColor: '#61afef',
            expressions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
      }
      // Step 3.5: 为导入的立绘素材绑定角色默认表情（保证场景预览 / 角色管理能直接渲染立绘）
      for (const [refName, asset] of importedImageMap) {
        if (asset.type !== 'sprite') continue
        const target = newChars.find(c => c.charId === refName)
        if (target) {
          const exprs = target.expressions || []
          if (!exprs.some(e => e.id === 'default')) {
            target.expressions = [...exprs, { id: 'default', label: '默认', assetId: asset.id }]
          }
        }
      }
      useAppStore.getState().setCharacterConfigs(newChars)

      // ── Step 4: 注册全局变量 ──
      const currentVars = [...useAppStore.getState().variables]
      for (const v of preview.variables) {
        if (!currentVars.find(gv => gv.name === v.name)) {
          currentVars.push({
            name: v.name,
            type: 'number' as const,
            initial: Number(v.value) || 0,
            note: `从 Ren'Py 导入 (原始: ${v.value})`,
          })
        }
      }
      useAppStore.getState().setVariables(currentVars)

      // ── Step 5: 修正 deltas 中的素材引用 ──
      const revisedDeltas: LineDelta[] = preview.deltas.map(d => {
        const next = { ...d }
        if (next.background?.asset_id) {
          const bgId = next.background.asset_id
          // 视频背景：sw-video:<文件名> → 导入的视频素材 id
          if (bgId.startsWith('sw-video:')) {
            const v = importedVideoMap.get(bgId.slice('sw-video:'.length))
            if (v) next.background = { ...next.background, asset_id: v.id }
          } else {
            const asset = importedImageMap.get(bgId)
            if (asset) next.background = { ...next.background, asset_id: asset.id }
          }
        }
        // 修正立绘：sprite_id（变量名）→ 绑定导入素材 id + 默认表情（场景预览据此渲染）
        if (next.characters) {
          const nc: Record<string, CharacterDelta> = {}
          for (const [key, cs] of Object.entries(next.characters)) {
            const entry: CharacterDelta = { ...cs }
            if (entry.sprite_id) {
              const asset = importedImageMap.get(entry.sprite_id)
              if (asset) {
                entry.asset_id = asset.id
                entry.sprite_id = 'default'
              }
            }
            nc[key] = entry
          }
          next.characters = nc
        }
        if (next.audio) {
          const na = { ...next.audio }
          const bgm = na.bgm
          if (bgm && typeof bgm === 'object' && 'asset_id' in bgm) {
            const audioAsset = importedAudioMap.get(bgm.asset_id.replace(/\.[^.]+$/, ''))
            if (audioAsset) na.bgm = { ...bgm, asset_id: audioAsset.id }
          }
          if (na.se) {
            na.se = na.se.map(ref => {
              const audioAsset = importedAudioMap.get(ref.replace(/\.[^.]+$/, ''))
              return audioAsset ? audioAsset.id : ref
            })
          }
          next.audio = na
        }
        return next
      })

      // ── Step 6: 写入剧本 ──
      // 导入 Ren'Py 工程即「整本替换」：避免把上一次（可能不干净）的剧本
      // 追加到顶部，造成顶部一堆空白隔断、背景/音频看起来「丢失」的错觉。
      // 直接以本次解析出的干净 beats 覆盖当前剧本。
      useAppStore.getState().setDraftDeltas(revisedDeltas)

      // ── Step 6.5: 对齐工程基准分辨率与画布比例 ──
      // 立绘 zoom 是相对原图像素的，舞台必须知道脚本的基准分辨率才能算对占屏比
      if (preview.screen?.width > 0 && preview.screen?.height > 0) {
        useAppStore.getState().setBaseResolution(preview.screen)
        const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b))
        const d = g(preview.screen.width, preview.screen.height)
        useAppStore.getState().setCanvasRatio({
          w: preview.screen.width / d,
          h: preview.screen.height / d,
        })
      }

      // ── Step 7: 创建自动快照 ──
      const json = serializeProject(
        useAppStore.getState().draftDeltas,
        useAppStore.getState().characterConfigs,
        useAppStore.getState().assets,
      )
      const snapshotLabel = buildImportLabel(dirPath)
      await createSnapshot(json, snapshotLabel, false)

      // ── Done ──
      setPhase('done')
      const assetCount = importedImageMap.size + importedAudioMap.size
      toast(
        `Ren'Py 导入完成：${revisedDeltas.length} 行剧本，${preview.charCount} 个角色，${assetCount} 个素材`,
        'success',
      )
    } catch (e: any) {
      setError(e?.message ?? '导入失败，请重试')
      setPhase('preview')
    }
  }, [preview, dirPath])

  // ═══ Derived stats ═══
  const labelCount = preview ? new Set(preview.deltas.filter(d => d.label).map(d => d.label)).size : 0
  const choiceCount = preview ? preview.deltas.filter(d => d.line_type === 'choice').length : 0
  const matchedImages = preview ? preview.imageAssets.filter(a => a.fileName).length : 0
  const unmatchedImages = preview ? preview.imageAssets.filter(a => !a.fileName).length : 0
  const matchedAudio = preview ? preview.audioAssets.filter(a => a.fileName).length : 0
  const unmatchedAudio = preview ? preview.audioAssets.filter(a => !a.fileName).length : 0
  const hasPreview = !!(phase === 'preview' && preview)
  const isScanning = phase === 'scanning'
  const isImporting = phase === 'importing'
  const isDone = phase === 'done'

  // ═══ Modal mode ═══
  if (!embedded) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="mx-4 w-full max-w-3xl rounded-2xl border border-edge/10 bg-surface shadow-2xl max-h-[90vh] flex flex-col">
          <ImportHeader wrappedClose={wrappedClose} />
          <div className="flex-1 overflow-y-auto p-5">
            <ImportBody
              dirPath={dirPath} setDirPath={setDirPath}
              phase={phase} error={error} handleBrowse={handleBrowse}
              handleScan={handleScan} preview={preview}
              labelCount={labelCount} choiceCount={choiceCount}
              matchedImages={matchedImages} unmatchedImages={unmatchedImages}
              matchedAudio={matchedAudio} unmatchedAudio={unmatchedAudio}
              handleImport={handleImport} wrappedClose={wrappedClose}
              isScanning={isScanning} isImporting={isImporting}
              isDone={isDone} hasPreview={hasPreview}
            />
          </div>
        </div>
      </div>
    )
  }

  // ═══ Embedded mode (full-width) ═══
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <ImportHeader wrappedClose={wrappedClose} />

      <div className="flex gap-6 overflow-y-auto p-5">
        {/* ─── 左侧：选择 & 扫描 ─── */}
        <div
          className="flex min-w-0 flex-col gap-4 transition-all duration-300"
          style={{ flex: hasPreview || isDone || isImporting ? 1 : 3 }}
        >
          {/* 目录选择 */}
          <div className="rounded-2xl border border-edge/10 bg-surface p-5 shadow-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06] text-primary">
                <FolderSearch size={16} strokeWidth={1.75} />
              </div>
              <span className="text-[13px] font-semibold text-fg">步骤一：选择 Ren'Py 工程目录</span>
            </div>
            <p className="text-[12px] text-fg-muted mb-4">
              请选择 Ren'Py 项目的 <b className="text-fg-subtle">game</b> 目录。<br />
              导入器将自动解析剧本结构并扫描所有图片和音频素材文件。
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <input
                  className="w-full rounded-xl border border-edge/10 bg-surface-2 px-3 py-2 text-[13px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                  value={dirPath} disabled={isScanning || isImporting}
                  onChange={(e) => { setDirPath(e.target.value); setPreview(null); setError(''); setPhase('idle') }}
                  placeholder="点击浏览选择 game 目录，或手动输入路径..."
                  onKeyDown={(e) => e.key === 'Enter' && void handleScan()}
                />
              </div>
              <button
                onClick={handleBrowse}
                disabled={isScanning || isImporting}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-edge/10 bg-surface-2 px-3 text-[12px] font-medium text-fg-subtle hover:bg-surface-hover hover:text-fg disabled:opacity-40 transition-colors"
              >
                <FolderOpen size={14} strokeWidth={1.75} />
                浏览
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-fg-faint">
              <Info size={11} strokeWidth={1.5} />
              例如：<code className="rounded border border-edge/10 bg-surface-2 px-1.5 py-px text-fg-muted text-[11px]">D:\mygame\game</code>
            </div>
          </div>

          {/* 导入说明 */}
          <div className="rounded-2xl border border-edge/10 bg-surface p-5 shadow-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky/[0.06] text-sky">
                <Info size={16} strokeWidth={1.75} />
              </div>
              <span className="text-[13px] font-semibold text-fg">导入范围说明</span>
            </div>
            <ul className="space-y-2 text-[12px] text-fg-muted">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald" />
                label / 对话 / 选择支 / menu / jump
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald" />
                scene (背景) / show (立绘) / play music / play sound
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald" />
                define Character / default 变量
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald" />
                图片素材 (.png .jpg .webp .gif .bmp) 与音频素材 (.mp3 .ogg .wav .flac .aac)
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber" />
                Python 代码块 / transform 动画 / screen 定义不会被导入
              </li>
            </ul>
          </div>

          {/* 前置条件提醒 */}
          <div className="rounded-2xl border border-warning/15 bg-warning/[0.03] p-4">
            <div className="flex items-start gap-2 text-[12px] text-fg-muted">
              <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warning" />
              <span>
                导入素材需要已保存的项目。请先 <b className="text-fg-subtle">Ctrl+S 保存当前工程</b>，素材文件才能正确落盘到项目目录。
                未保存时你可以先扫描预览导入结果。
              </span>
            </div>
          </div>

          {/* 扫描按钮 */}
          <button
            onClick={() => void handleScan()}
            disabled={isScanning || isImporting || !dirPath.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-white shadow-1 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isScanning ? (
              <>
                <Loader2 size={16} strokeWidth={2} className="animate-spin" />
                正在扫描目录...
              </>
            ) : (
              <>
                <FileCheck size={16} strokeWidth={1.75} />
                扫描并预览
              </>
            )}
          </button>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.04] p-3 text-[12px] text-danger">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* ─── 右侧：结果面板 ─── */}
        {(hasPreview || isDone || isImporting) && preview && (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard icon={FileText} label="剧本行" value={preview.lineCount} color="primary" />
              <StatCard icon={BookOpen} label="场景" value={labelCount || '—'} color="info" />
              <StatCard icon={Code} label="选择支" value={choiceCount || '—'} color="warning" />
              <StatCard icon={Users} label="角色" value={preview.charCount} color="success" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={Image} label="图片素材" value={matchedImages}
                sub={unmatchedImages > 0 ? `${unmatchedImages} 未匹配` : undefined}
                color={matchedImages > 0 ? 'primary' : 'muted'}
              />
              <StatCard
                icon={Music} label="音频素材" value={matchedAudio}
                sub={unmatchedAudio > 0 ? `${unmatchedAudio} 未匹配` : undefined}
                color={matchedAudio > 0 ? 'primary' : 'muted'}
              />
              <StatCard icon={Code} label="变量" value={preview.varCount} color="muted" />
              <StatCard
                icon={BarChart3} label="可导入素材" value={matchedImages + matchedAudio}
                sub="已匹配到真实文件"
                color={matchedImages + matchedAudio > 0 ? 'info' : 'muted'}
              />
            </div>

            {/* 警告区域 */}
            {preview.warnings.length > 0 && (
              <details className="group rounded-xl border border-warning/20 bg-warning/[0.02]">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[12px] font-medium text-warning">
                  <AlertTriangle size={12} />
                  {preview.warnings.length} 条解析警告（点击展开）
                </summary>
                <div className="max-h-40 overflow-y-auto border-t border-warning/10 px-4 py-3 space-y-1">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="text-[11px] text-fg-muted break-all">{w}</div>
                  ))}
                </div>
              </details>
            )}

            {/* 素材未匹配提示 */}
            {(unmatchedImages > 0 || unmatchedAudio > 0) && (
              <div className="flex items-start gap-3 rounded-xl border border-warning/15 bg-warning/[0.03] p-4">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                <div className="text-[12px] text-fg-muted">
                  有 {unmatchedImages + unmatchedAudio} 个素材引用未在目录中找到对应文件。
                  这些引用不会导入素材，但剧本行本身会保留。
                </div>
              </div>
            )}

            {/* 完成提示 */}
            {isDone && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald/20 bg-emerald/[0.04] p-4">
                <CheckCircle2 size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-emerald" />
                <div>
                  <div className="text-[14px] font-semibold text-emerald mb-1">导入完成</div>
                  <p className="text-[12px] text-fg-muted">
                    已成功导入 {preview.lineCount} 行剧本、{preview.charCount} 个角色、
                    {matchedImages} 张图片与 {matchedAudio} 个音频。
                    系统已自动创建版本快照。
                  </p>
                  <button
                    onClick={wrappedClose}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-white shadow-1 hover:bg-primary/90 transition-colors"
                  >
                    前往剧本流
                    <ExternalLink size={13} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )}

            {/* 导入按钮 */}
            {!isDone && (
              <button
                onClick={() => void handleImport()}
                disabled={isImporting || preview.deltas.length === 0 || !useAppStore.getState().projectRoot}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-white shadow-1 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title={!useAppStore.getState().projectRoot ? '需要先保存项目' : undefined}
              >
                {isImporting ? (
                  <>
                    <Loader2 size={16} strokeWidth={2} className="animate-spin" />
                    正在导入素材与剧本...
                  </>
                ) : (
                  <>
                    <Upload size={16} strokeWidth={1.75} />
                    {!useAppStore.getState().projectRoot ? '请先保存项目' : '导入到当前工程'}
                  </>
                )}
              </button>
            )}

            {/* .rpy 文件预览：列出已解析的关键场景 */}
            {hasPreview && preview.deltas.length > 0 && (
              <details className="group rounded-xl border border-edge/10 bg-surface-2">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-[11px] text-fg-muted">
                  <BookOpen size={11} />
                  剧本预览（前 20 行）
                </summary>
                <div className="max-h-48 overflow-y-auto border-t border-edge/10 px-4 py-3 space-y-0.5 font-mono text-[11px]">
                  {preview.deltas.slice(0, 20).map((d, i) => (
                    <div key={i} className="text-fg-faint">
                      {d.label && <span className="text-sky">{d.label} → </span>}
                      {d.speaker && <span className="text-primary">{d.speaker}: </span>}
                      {d.dialogue && <span className="text-fg-muted">{d.dialogue}</span>}
                      {d.line_type === 'choice' && <span className="text-amber">[选择支: {(d.choices || []).map(c => c.text).join(' | ')}]</span>}
                      {!d.label && !d.speaker && !d.dialogue && d.line_type !== 'choice' && <span className="text-fg-faint/50">—</span>}
                    </div>
                  ))}
                  {preview.deltas.length > 20 && (
                    <div className="text-fg-faint/40 pt-1">... 还有 {preview.deltas.length - 20} 行</div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// Shared header
// ═══════════════════════════════════════════

function ImportHeader({ wrappedClose }: { wrappedClose: () => void }) {
  return (
    <div className="shrink-0 border-b border-edge/10 px-5 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-faint">Import</span>
            <button
              onClick={wrappedClose}
              className="inline-flex items-center gap-1 rounded-xl border border-edge/10 px-2 py-0.5 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
            >
              <ChevronLeft size={12} />
              返回剧本流
            </button>
          </div>
          <h2 className="text-[15px] font-semibold text-fg mt-1.5">导入 Ren'Py 工程</h2>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            选择 game 目录，自动解析剧本、角色、素材 — 全量导入而非仅解析变量
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/[0.06] text-primary">
          <FileDown size={18} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// Shared body (used by modal mode)
// ═══════════════════════════════════════════

function ImportBody(props: {
  dirPath: string; setDirPath: (v: string) => void
  phase: string; error: string
  handleBrowse: () => void; handleScan: () => void
  preview: RpyImportResult | null
  labelCount: number; choiceCount: number
  matchedImages: number; unmatchedImages: number
  matchedAudio: number; unmatchedAudio: number
  handleImport: () => void; wrappedClose: () => void
  isScanning: boolean; isImporting: boolean
  isDone: boolean; hasPreview: boolean
}) {
  const {
    dirPath, setDirPath, phase, error, handleBrowse, handleScan,
    preview, labelCount, choiceCount,
    matchedImages, unmatchedImages, matchedAudio, unmatchedAudio,
    handleImport, wrappedClose, isScanning, isImporting, isDone, hasPreview,
  } = props

  return (
    <div className="space-y-4">
      {/* 目录选择 */}
      <div className="rounded-xl border border-edge/10 bg-surface-2 p-4">
        <label className="text-[12px] font-medium text-fg-muted block mb-2">Ren'Py 工程目录（game 目录）</label>
        <div className="flex items-end gap-2">
          <input
            className="flex-1 rounded-xl border border-edge/10 bg-surface px-3 py-2 text-[13px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
            value={dirPath} disabled={isScanning || isImporting}
            onChange={(e) => { setDirPath(e.target.value); /* parent reset via setDirPath */ }}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="选择 .rpy 文件所在目录..."
          />
          <button onClick={handleBrowse} disabled={isScanning || isImporting} className="btn-ghost-sm">
            <FolderOpen size={14} /> 浏览
          </button>
        </div>
      </div>

      <button
        onClick={handleScan}
        disabled={isScanning || isImporting || !dirPath.trim()}
        className="btn-primary-sm w-full justify-center"
      >
        {isScanning ? <><Loader2 size={14} className="animate-spin" /> 扫描中...</> : '扫描并预览'}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.04] p-3 text-[12px] text-danger">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-[11px] text-fg-muted">剧本行</div>
              <div className="text-[18px] font-semibold text-fg">{preview.lineCount}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-[11px] text-fg-muted">场景</div>
              <div className="text-[18px] font-semibold text-fg">{labelCount || '—'}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-[11px] text-fg-muted">角色</div>
              <div className="text-[18px] font-semibold text-fg">{preview.charCount}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-[11px] text-fg-muted">图片</div>
              <div className="text-[18px] font-semibold text-fg">{matchedImages}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-[11px] text-fg-muted">音频</div>
              <div className="text-[18px] font-semibold text-fg">{matchedAudio}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-[11px] text-fg-muted">变量</div>
              <div className="text-[18px] font-semibold text-fg">{preview.varCount}</div>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/[0.04] p-3 text-[11px] text-fg-muted">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" />
              <span>{preview.warnings.length} 条警告</span>
            </div>
          )}

          {!isDone && (
            <button
              onClick={handleImport}
              disabled={isImporting || preview.deltas.length === 0}
              className="btn-primary-sm w-full justify-center"
            >
              {isImporting ? <><Loader2 size={14} className="animate-spin" /> 导入中...</> : '导入到当前工程'}
            </button>
          )}

          {isDone && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald/20 bg-emerald/[0.04] p-3">
              <CheckCircle2 size={16} className="text-emerald" />
              <span className="text-[13px] font-medium text-emerald">导入完成</span>
              <button onClick={wrappedClose} className="ml-auto text-[12px] text-primary hover:underline">
                查看剧本
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
