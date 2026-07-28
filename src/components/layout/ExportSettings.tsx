import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Monitor, Apple, Smartphone, Globe, Circle, CheckCircle2, XCircle, Loader2, Play, Package, ShieldCheck, RefreshCw, Languages, Gamepad2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui'
import {
  downloadRpy,
  validateExportNames,
  resolveLookups,
  formatValidationErrors,
  exportDefinitionsRpy,
  exportProjectPackage,
  buildBundle,
  buildTranslationBundle,
  downloadTranslation,
} from '@/utils/rpyExporter'
import { validateRenpyText } from '@/utils/renpyText'
import { buildWebProject } from '@/utils/webExporter'
import { DEFAULT_POSITION_SLOTS } from '@/core/positionSlots'

type StageStatus = 'pending' | 'active' | 'done' | 'error'

interface PlatformDef {
  id: string
  label: string
  sub: string
  icon: ReactNode
  hint: string
}

const PLATFORMS: PlatformDef[] = [
  {
    id: 'windows',
    label: 'Windows',
    sub: 'exe / NSIS 安装包',
    icon: <Monitor size={18} strokeWidth={1.75} />,
    hint: '输出独立运行的 .exe，并生成 NSIS 安装程序；素材随包内嵌，双击即可分发。',
  },
  {
    id: 'macos',
    label: 'macOS',
    sub: 'DMG / App',
    icon: <Apple size={18} strokeWidth={1.75} />,
    hint: '输出 .app / .dmg；正式分发需在 macOS 上签名与公证，否则会被 Gatekeeper 拦截。',
  },
  {
    id: 'mobile',
    label: '移动端',
    sub: 'Android / iOS',
    icon: <Smartphone size={18} strokeWidth={1.75} />,
    hint: 'Ren’Py 可经 Android/iOS 构建链打包；导出脚本后在对应 SDK 中编译为安装包。',
  },
  {
    id: 'web',
    label: 'Web 端',
    sub: 'HTML5 / 在线托管',
    icon: <Globe size={18} strokeWidth={1.75} />,
    hint: '导出为纯前端网页工程，生成 index.html / player.js 与全部素材；部署到任意静态托管即可在浏览器试玩，无需安装。',
  },
]

/** 导出流水线看板各阶段 */
const STAGES: { id: string; label: string }[] = [
  { id: 'validate', label: '校验引用' },
  { id: 'script', label: '生成脚本' },
  { id: 'defs', label: '生成定义' },
  { id: 'pack', label: '打包素材' },
  { id: 'done', label: '完成' },
]

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'done') return <CheckCircle2 size={20} strokeWidth={2} className="text-success" />
  if (status === 'error') return <XCircle size={20} strokeWidth={2} className="text-danger" />
  if (status === 'active') return <Loader2 size={20} strokeWidth={2} className="animate-spin text-primary" />
  return <Circle size={20} strokeWidth={1.75} className="text-fg-faint" />
}

/** 开关行 */
function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: () => void
  label: string
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge/8 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{label}</div>
        {hint && <div className="mt-0.5 t-micro">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-surface-3'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-1 transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export default function ExportSettings() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const variables = useAppStore((s) => s.variables)
  const canvasRatio = useAppStore((s) => s.canvasRatio)
  const projectMeta = useAppStore((s) => s.projectMeta)
  const setProjectMeta = useAppStore((s) => s.setProjectMeta)



  const [scriptLabel, setScriptLabel] = useState('start')
  const [validationResult, setValidationResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [packageResult, setPackageResult] = useState<{ ok: boolean; message: string } | null>(null)

  // 平台导航选中态
  const [platform, setPlatform] = useState('windows')
  // 打包偏好（随平台展示，作为导出目标提示）
  const [opts, setOpts] = useState({ includeAssets: true, generateDefs: true, minify: false })
  // 流水线看板各阶段状态
  const [stage, setStage] = useState<Record<string, StageStatus>>({
    validate: 'pending',
    script: 'pending',
    defs: 'pending',
    pack: 'pending',
    done: 'pending',
  })

  const activePlatform = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0]

  const handleValidate = useCallback(() => {
    const lookups = resolveLookups(draftDeltas, characterConfigs, assets)
    const errors = validateExportNames(draftDeltas, lookups, characterConfigs)

    // 台词富文本体检：Ren'Py 文本标签配对 / 未知标签 / [变量] 未定义（逐行 + 选择支）
    const varNames = variables.map((v) => v.name)
    const textLines: string[] = []
    const checkText = (raw: string | null | undefined, where: string) => {
      if (!raw || !/[{[]/.test(raw)) return
      for (const iss of validateRenpyText(raw, varNames)) {
        textLines.push(`${iss.severity === 'error' ? '✕' : '⚠'} ${where}：${iss.message}`)
      }
    }
    draftDeltas.forEach((d, i) => {
      checkText(d.dialogue, `第 ${i + 1} 行台词`)
      if (d.line_type === 'choice') {
        checkText(d.prompt, `第 ${i + 1} 行选择支提示`)
        for (const c of d.choices ?? []) checkText(c.text, `第 ${i + 1} 行选项「${c.text?.slice(0, 8) ?? ''}」`)
      }
    })

    const hasTextError = textLines.some((l) => l.startsWith('✕'))
    if (errors.length === 0 && !hasTextError) {
      const suffix = textLines.length > 0 ? `\n\n文本标记提醒（不阻断导出）：\n${textLines.join('\n')}` : ''
      setValidationResult({ ok: true, message: '所有引用均有效，无错误。' + suffix })
      setStage((s) => ({ ...s, validate: 'done', script: 'active' }))
    } else {
      const parts: string[] = []
      if (errors.length > 0) parts.push(formatValidationErrors(errors))
      if (textLines.length > 0) parts.push(`台词文本标记问题：\n${textLines.join('\n')}`)
      setValidationResult({ ok: false, message: parts.join('\n\n') })
      setStage((s) => ({ ...s, validate: 'error' }))
    }
  }, [draftDeltas, characterConfigs, assets, variables])

  const handleExportScript = useCallback(() => {
    downloadRpy(draftDeltas, resolvedStates, characterConfigs, assets, DEFAULT_POSITION_SLOTS, `${scriptLabel}.rpy`, variables)
    setStage((s) => ({ ...s, script: 'done' }))
  }, [draftDeltas, resolvedStates, characterConfigs, assets, scriptLabel, variables])

  const handleExportDefs = useCallback(() => {
    const content = exportDefinitionsRpy(characterConfigs, assets, DEFAULT_POSITION_SLOTS, undefined, undefined, variables)
    const blob = new Blob([content], { type: 'text/x-renpy;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'definitions.rpy'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStage((s) => ({ ...s, defs: 'done' }))
  }, [characterConfigs, assets, variables])

  const handleExportBoth = useCallback(() => {
    downloadRpy(draftDeltas, resolvedStates, characterConfigs, assets, DEFAULT_POSITION_SLOTS, `${scriptLabel}.rpy`, variables)
    const defs = exportDefinitionsRpy(characterConfigs, assets, DEFAULT_POSITION_SLOTS, undefined, undefined, variables)
    const blob = new Blob([defs], { type: 'text/x-renpy;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'definitions.rpy'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStage((s) => ({ ...s, script: 'done', defs: 'done' }))
  }, [draftDeltas, resolvedStates, characterConfigs, assets, scriptLabel, variables])

  const handleExportPackage = useCallback(async () => {
    const res = await exportProjectPackage(
      draftDeltas,
      resolvedStates,
      characterConfigs,
      assets,
      DEFAULT_POSITION_SLOTS,
      scriptLabel,
      variables,
      projectMeta,
    )
    setPackageResult({ ok: res.success, message: res.message })
    setStage((s) => (res.success ? { ...s, pack: 'done', done: 'done' } : { ...s, pack: 'error' }))
  }, [draftDeltas, resolvedStates, characterConfigs, assets, scriptLabel, variables, projectMeta])

  const handleExportWeb = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.exportWeb) {
      setPackageResult({ ok: false, message: '当前环境不支持 Web 导出（需在 Electron 桌面端运行）。' })
      return
    }
    const bundle = buildWebProject({
      deltas: draftDeltas,
      characterConfigs,
      assets,
      variables,
      canvasRatio,
      title: projectMeta.title,
    })
    const res = await api.exportWeb({
      gameJson: bundle.gameJson,
      assetRefs: bundle.assetRefs,
      title: bundle.title,
    })
    if (res.success) {
      let msg = `已生成 Web 独立包：\n${res.outDir}\n\n包含 index.html / player.js / style.css / game.json 与 ${res.copied} 个素材文件。\n将整个目录托管到任意静态服务器，即可在浏览器中直接试玩。`
      if (bundle.missing.length) {
        msg += `\n\n${bundle.missing.length} 个素材未找到（已跳过，对应立绘 / 音频将不显示）。`
      }
      setPackageResult({ ok: true, message: msg })
      setStage((s) => ({ ...s, pack: 'done', done: 'done' }))
    } else {
      setPackageResult({ ok: false, message: res.error || '导出失败' })
      setStage((s) => ({ ...s, pack: 'error' }))
    }
  }, [draftDeltas, characterConfigs, assets, variables, canvasRatio, projectMeta])

  // --------------- Ren'Py 引擎对接 ---------------
  const [sdkDetecting, setSdkDetecting] = useState(true)
  const [sdkDetected, setSdkDetected] = useState(false)
  const [sdkVersion, setSdkVersion] = useState<string | null>(null)
  const [sdkPath, setSdkPath] = useState<string | undefined>(undefined)
  const [sdkHint, setSdkHint] = useState<string | undefined>(undefined)
  const [manualSdk, setManualSdk] = useState('')
  const [engineBusy, setEngineBusy] = useState(false)
  const [engineResult, setEngineResult] = useState('')

  const detectSdk = useCallback(async () => {
    setSdkDetecting(true)
    try {
      const r = await window.electronAPI?.renpyDetectSdk()
      if (r?.detected) {
        setSdkDetected(true)
        setSdkVersion(r.version ?? null)
        setSdkPath(r.sdkPath)
        setSdkHint(undefined)
      } else {
        setSdkDetected(false)
        setSdkPath(undefined)
        setSdkHint(r?.hint)
      }
    } catch {
      setSdkDetected(false)
      setSdkHint('探测 SDK 时发生错误')
    } finally {
      setSdkDetecting(false)
    }
  }, [])

  useEffect(() => {
    detectSdk()
  }, [detectSdk])

  const runEngineAction = useCallback(
    async (action: 'run' | 'build' | 'lint') => {
      if (engineBusy) return
      setEngineBusy(true)
      setEngineResult('正在准备工程…')
      try {
        const bundle = buildBundle(
          draftDeltas,
          resolvedStates,
          characterConfigs,
          assets,
          DEFAULT_POSITION_SLOTS,
          scriptLabel,
          variables,
          projectMeta,
        )
        const stage = await window.electronAPI?.renpyStageProject({ bundle, title: projectMeta.title })
        if (!stage?.success) {
          setEngineResult('暂存工程失败：' + (stage?.error ?? '未知错误'))
          return
        }
        setEngineResult(
          `工程已暂存（拷贝素材 ${stage.copied ?? 0} 个${stage.missingCount ? `，缺失 ${stage.missingCount} 个` : ''}）。\n正在调用 Ren'Py SDK…`,
        )
        const res = await window.electronAPI?.renpyRunEngine({
          action,
          projectDir: stage.projectDir as string,
          sdkPath: manualSdk.trim() || undefined,
        })
        if (!res?.success) {
          setEngineResult((prev) => prev + '\n\n执行失败：' + (res?.error ?? '未知错误'))
          return
        }
        if (action === 'lint') {
          const verdict = res.exitCode === 0 ? '\n\n✔ Lint 通过，无语法错误' : `\n\n✘ Lint 退出码 ${res.exitCode}`
          setEngineResult((prev) => prev + '\n\n' + (res.output || '(无输出)') + verdict)
        } else if (action === 'run') {
          setEngineResult((prev) => prev + `\n\n已启动 Ren'Py 预览（进程 ${res.pid}）。\n工程目录：${res.projectDir}`)
        } else {
          setEngineResult(
            (prev) => prev + `\n\n构建已在后台启动。\n产物目录：${res.distDir}\n构建日志：${res.logFile}`,
          )
        }
      } catch (e) {
        setEngineResult('异常：' + (e as Error).message)
      } finally {
        setEngineBusy(false)
      }
    },
    [engineBusy, draftDeltas, resolvedStates, projectMeta, manualSdk],
  )

  // --------------- 多语言翻译导出 ---------------
  const TL_PRESETS = ['chinese', 'japanese', 'korean', 'french', 'german', 'spanish', 'russian', 'portuguese', 'italian']
  // 记住上次生成翻译用的语言，下次直接沿用
  const [tlLang, setTlLang] = useState(() => localStorage.getItem('sw:tl-lang') || 'chinese')
  useEffect(() => {
    localStorage.setItem('sw:tl-lang', tlLang)
  }, [tlLang])
  const [tlBusy, setTlBusy] = useState(false)
  const [tlResult, setTlResult] = useState('')

  const handleExportTranslation = useCallback(() => {
    if (tlBusy || draftDeltas.length === 0) return
    setTlBusy(true)
    try {
      const content = buildTranslationBundle(
        draftDeltas,
        resolvedStates,
        characterConfigs,
        assets,
        DEFAULT_POSITION_SLOTS,
        scriptLabel,
        variables,
        tlLang,
      )
      const count = (content.match(/-->/g) ?? []).length
      downloadTranslation(
        draftDeltas,
        resolvedStates,
        characterConfigs,
        assets,
        DEFAULT_POSITION_SLOTS,
        scriptLabel,
        variables,
        tlLang,
      )
      const lang = tlLang.trim() || 'chinese'
      setTlResult(
        `已生成翻译骨架：提取原文 ${count} 处（台词与选择支）。\n` +
          `下载文件：script_${lang}.rpy\n` +
          `放置路径：将文件放入你的 Ren'Py 工程 game/tl/${lang}/script.rpy\n` +
          `使用方法：把每行右侧（new）替换为译文，左侧（old）保持原文不变即可被 Ren'Py 精确匹配。`,
      )
    } catch (e) {
      setTlResult('生成失败：' + (e as Error).message)
    } finally {
      setTlBusy(false)
    }
  }, [tlBusy, draftDeltas, resolvedStates, characterConfigs, assets, variables, tlLang])

  const totalLines = draftDeltas.length
  const speakerCount = new Set(draftDeltas.map((d) => d.speaker).filter(Boolean)).size
  const charInScene = characterConfigs.length

  const stats = [
    { label: '剧本行数', value: totalLines },
    { label: '出场说话人', value: speakerCount },
    { label: '角色配置', value: charInScene },
  ]

  return (
    <div className="flex-1 overflow-auto bg-canvas">
      <div className="p-6">
        {/* 页头 */}
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">Export</span>
          </div>
          <h2 className="t-h1 mt-1.5">导出设置</h2>
          <p className="mt-0.5 t-subtitle">选择导出目标、配置打包偏好并校验脚本完整性</p>
        </header>

        {/* ============ 游戏信息（标题 / 封面 / 图标） ============ */}
        <section className="mb-6 rounded-xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <Gamepad2 size={16} className="text-primary" />
            <h3 className="t-h3">游戏信息</h3>
          </div>
          <p className="mb-4 t-subtitle">导出的 Ren'Py 游戏将使用下列元信息：窗口标题、打开时的封面画面与图标。</p>

          {/* 游戏名称 */}
          <label className="label">游戏名称</label>
          <input
            className="input mt-1 w-full"
            value={projectMeta.title}
            onChange={(e) => setProjectMeta({ title: e.target.value })}
            placeholder="我的视觉小说"
          />
          <p className="mt-1 text-[11px] text-fg-faint">作为窗口标题、关于页名称与打包目录名</p>

          {/* 标题画面封面 */}
          <div className="mt-4">
            <label className="label">标题画面封面（可选）</label>
            <select
              className="input mt-1 w-full"
              value={projectMeta.coverAssetId ?? ''}
              onChange={(e) => setProjectMeta({ coverAssetId: e.target.value || undefined })}
            >
              <option value="">使用 Ren'Py 默认主菜单</option>
              {assets.filter((a) => a.type === 'background').map((a) => (
                <option key={a.id} value={a.id}>{a.fileName}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-fg-faint">选一张背景图作为打开游戏时的封面；不选则使用默认主菜单</p>
          </div>

          {/* 游戏图标 */}
          <div className="mt-4">
            <label className="label">游戏图标（可选）</label>
            <select
              className="input mt-1 w-full"
              value={projectMeta.iconAssetId ?? ''}
              onChange={(e) => setProjectMeta({ iconAssetId: e.target.value || undefined })}
            >
              <option value="">不设置（使用 Ren'Py 默认图标）</option>
              {assets.filter((a) => a.type === 'background' || a.type === 'sprite').map((a) => (
                <option key={a.id} value={a.id}>{a.fileName}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-fg-faint">导出为根目录 icon.ico；Windows 打包为 .exe 图标建议使用真实 .ico 文件</p>
          </div>

          {/* 结局画面 */}
          <div className="mt-5 border-t border-edge/8 pt-4">
            <Switch
              checked={!!projectMeta.endingEnabled}
              onChange={() => setProjectMeta({ endingEnabled: !projectMeta.endingEnabled })}
              label="结局画面"
              hint="剧情跑完退回主菜单前，定格展示一段「The End」字幕"
            />

            {!!projectMeta.endingEnabled && (
              <div className="mt-3 space-y-4">
                <div>
                  <label className="label">结局背景（可选）</label>
                  <select
                    className="input mt-1 w-full"
                    value={projectMeta.endingAssetId ?? ''}
                    onChange={(e) => setProjectMeta({ endingAssetId: e.target.value || undefined })}
                  >
                    <option value="">使用当前场景画面</option>
                    {assets.filter((a) => a.type === 'background').map((a) => (
                      <option key={a.id} value={a.id}>{a.fileName}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-fg-faint">选一张背景图铺满结局画面；不选则叠在最后一幕场景之上</p>
                </div>

                <div>
                  <label className="label">结局文字</label>
                  <input
                    className="input mt-1 w-full"
                    value={projectMeta.endingText ?? 'The End'}
                    onChange={(e) => setProjectMeta({ endingText: e.target.value })}
                    placeholder="The End"
                  />
                  <p className="mt-1 text-[11px] text-fg-faint">居中显示的大字，可改成「完」「终章」等</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          {/* ============ 左栏：导出平台 / 格式导航 ============ */}
          <nav className="flex flex-col gap-2">
            <div className="eyebrow px-1 pb-1">导出目标 Target</div>
            {PLATFORMS.map((p) => {
              const active = p.id === platform
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-primary/45 bg-primary-soft'
                      : 'border-edge/12 bg-surface-2 hover:bg-surface-hover'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-signal" aria-hidden />
                  )}
                  <span className={active ? 'text-primary' : 'text-fg-muted group-hover:text-fg'}>{p.icon}</span>
                  <span className="min-w-0">
                    <span className={`block text-[14px] font-medium ${active ? 'text-fg' : 'text-fg'}`}>{p.label}</span>
                    <span className="block text-[12px] text-fg-faint">{p.sub}</span>
                  </span>
                </button>
              )
            })}
            <p className="px-1 pt-1 t-micro">
              说明：以下为导出目标与打包偏好，核心均生成 Ren'Py 脚本源文件，再按目标平台打包。
            </p>
          </nav>

          {/* ============ 右栏：配置 + 看板 ============ */}
          <div className="flex flex-col gap-4">
            {/* 项目概况 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">项目概况 Overview</div>
              <div className="grid grid-cols-3 divide-x divide-edge/10">
                {stats.map((item) => (
                  <div key={item.label} className="px-4 first:pl-0">
                    <p className="t-label">{item.label}</p>
                    <p className="mt-0.5 t-h2 t-mono">{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* 平台专属配置 */}
            <section className="panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-primary">{activePlatform.icon}</span>
                <div>
                  <div className="text-[14px] font-semibold text-fg">{activePlatform.label} 导出配置</div>
                  <div className="t-micro">{activePlatform.sub}</div>
                </div>
              </div>
              <p className="mb-2 t-micro leading-relaxed text-fg-subtle">{activePlatform.hint}</p>
              {platform === 'web' ? (
                <p className="t-micro leading-relaxed text-fg-subtle">
                  网页包将自动打包全部被引用的素材（背景 / 立绘 / 音频），并生成可直接托管的静态工程。无需额外配置。
                </p>
              ) : (
                <div className="rounded-md border border-edge/10 bg-surface-1 px-3">
                  <Switch
                    checked={opts.includeAssets}
                    onChange={() => setOpts((o) => ({ ...o, includeAssets: !o.includeAssets }))}
                    label="内嵌素材"
                    hint="将立绘 / 背景 / 音频随包复制，免手动搬运。"
                  />
                  <Switch
                    checked={opts.generateDefs}
                    onChange={() => setOpts((o) => ({ ...o, generateDefs: !o.generateDefs }))}
                    label="生成 definitions.rpy"
                    hint="角色声明、image / transform 与素材路径清单。"
                  />
                  <Switch
                    checked={opts.minify}
                    onChange={() => setOpts((o) => ({ ...o, minify: !o.minify }))}
                    label="压缩空白"
                    hint="导出时剔除注释与空行，减小体积。"
                  />
                </div>
              )}
            </section>

            {platform !== 'web' && (
            <section className="panel p-4">
              <div className="eyebrow mb-3">脚本入口 Label</div>
              <label className="mb-1 block t-label">Ren'Py Script Label</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={scriptLabel}
                  onChange={(e) => setScriptLabel(e.target.value)}
                  className="w-48 rounded-md border border-edge/15 bg-surface-3 px-2.5 py-1.5 text-xs text-fg outline-none transition-colors focus:border-signal/60"
                />
                <code className="truncate t-micro t-mono">label {scriptLabel}:</code>
              </div>
              <p className="mt-1.5 t-micro">导出的脚本将以该 label 开头，Ren'Py 通过它定位剧本入口。</p>
            </section>
            )}

            {/* 导出操作 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">导出操作 Export</div>
              {platform === 'web' ? (
                <>
                  <Button variant="primary" onClick={handleExportWeb} disabled={totalLines === 0}>
                    导出 Web 独立包
                  </Button>
                  <p className="mt-2 t-micro">
                    生成 <code className="text-signal">index.html</code> / <code className="text-signal">player.js</code> /{' '}
                    <code className="text-signal">style.css</code> / <code className="text-signal">game.json</code> 与全部素材，复制到所选目录。
                    将目录托管到任意静态服务器即可在浏览器中试玩，支持 PC 与移动端、点击 / 触摸 / 键盘推进，进度自动存于浏览器 localStorage。
                  </p>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleValidate}>
                      校验引用
                    </Button>
                    <Button variant="primary" onClick={handleExportScript} disabled={totalLines === 0}>
                      导出 script.rpy
                    </Button>
                    <Button variant="outline" onClick={handleExportDefs} disabled={characterConfigs.length === 0}>
                      导出 definitions.rpy
                    </Button>
                    <Button variant="primary" onClick={handleExportBoth} disabled={totalLines === 0}>
                      一并导出
                    </Button>
                    <Button variant="ghost" onClick={handleExportPackage} disabled={totalLines === 0}>
                      导出 Ren'Py 项目包
                    </Button>
                  </div>
                  <p className="mt-2 t-micro">
                    「项目包」会生成完整 <code className="text-signal">game/</code> 目录（含 script.rpy / definitions.rpy / images / audio），
                    Electron 下自动建目录并磁盘直拷素材；纯浏览器环境回落为双文件下载。
                  </p>
                </>
              )}
            </section>

            {/* 导出流水线看板 */}
            <section className="panel p-4">
              <div className="eyebrow mb-4">导出流水线 Pipeline</div>
              <div className="flex items-center">
                {STAGES.map((s, i) => (
                  <Fragment key={s.id}>
                    <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                      <StageIcon status={stage[s.id]} />
                      <span
                        className={`text-[12px] ${
                          stage[s.id] === 'done'
                            ? 'text-fg'
                            : stage[s.id] === 'error'
                              ? 'text-danger'
                              : 'text-fg-muted'
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div
                        className={`mx-1 h-px flex-1 ${
                          stage[s.id] === 'done' ? 'bg-success/40' : 'bg-edge/15'
                        }`}
                      />
                    )}
                  </Fragment>
                ))}
              </div>
              <p className="mt-3 t-micro">点按上方导出操作即点亮对应阶段；校验失败会在此处标红。</p>
            </section>

            {/* Ren'Py 引擎对接 */}
            <section className="panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="eyebrow">Ren'Py 引擎对接 Engine</div>
                <button
                  type="button"
                  onClick={detectSdk}
                  disabled={sdkDetecting}
                  className="flex items-center gap-1 text-[12px] text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
                >
                  <RefreshCw size={13} strokeWidth={1.75} className={sdkDetecting ? 'animate-spin' : ''} />
                  重新检测
                </button>
              </div>

              {/* SDK 状态 */}
              <div
                className={`mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] ${
                  sdkDetected ? 'border-success/40 bg-success/5' : 'border-edge/15 bg-surface-1'
                }`}
              >
                {sdkDetecting ? (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin text-fg-muted" />
                ) : sdkDetected ? (
                  <CheckCircle2 size={15} strokeWidth={2} className="text-success" />
                ) : (
                  <XCircle size={15} strokeWidth={2} className="text-danger" />
                )}
                <span className="text-fg">
                  {sdkDetecting
                    ? '正在探测本机 Ren\'Py SDK…'
                    : sdkDetected
                      ? `已检测到 Ren'Py SDK${sdkVersion ? ` v${sdkVersion}` : ''}`
                      : '未检测到 Ren\'Py SDK'}
                </span>
                {sdkDetected && sdkPath && (
                  <code className="ml-auto truncate t-micro t-mono text-fg-faint">{sdkPath}</code>
                )}
              </div>

              {!sdkDetected && (
                <p className="mb-3 t-micro leading-relaxed text-fg-subtle">
                  {sdkHint ?? '请安装 Ren\'Py 并设置环境变量 RENPY_SDK 指向 SDK 根目录，或在下方手动指定路径后重试。'}
                </p>
              )}

              {/* 手动指定 SDK 路径 */}
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="text"
                  value={manualSdk}
                  onChange={(e) => setManualSdk(e.target.value)}
                  placeholder="手动指定 Ren'Py SDK 根目录（可选）"
                  className="flex-1 rounded-md border border-edge/15 bg-surface-3 px-2.5 py-1.5 text-xs text-fg outline-none transition-colors focus:border-signal/60"
                />
              </div>

              {/* 引擎操作 */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => runEngineAction('run')}
                  disabled={engineBusy || totalLines === 0}
                >
                  <Play size={14} strokeWidth={1.75} className="mr-1" />
                  在 Ren'Py 中预览
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runEngineAction('build')}
                  disabled={engineBusy || totalLines === 0}
                >
                  <Package size={14} strokeWidth={1.75} className="mr-1" />
                  构建分发包
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runEngineAction('lint')}
                  disabled={engineBusy || totalLines === 0}
                >
                  <ShieldCheck size={14} strokeWidth={1.75} className="mr-1" />
                  Lint 校验语法
                </Button>
              </div>
              <p className="mt-2 t-micro leading-relaxed text-fg-subtle">
                预览会直接拉起 Ren'Py 运行当前剧本；构建将分发包产出到暂存工程目录的 dist/；Lint 会调用 Ren'Py 内建语法检查并回显结果。以上均基于本机 SDK，未安装时将降级提示。
              </p>

              {engineResult && (
                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-edge/12 bg-surface-1 p-3 t-micro t-mono leading-relaxed text-fg">
                  {engineResult}
                </pre>
              )}
            </section>

            {/* 多语言翻译导出 */}
            <section className="panel p-4">
              <div className="eyebrow">多语言翻译 Translation</div>
              <p className="mt-1 t-micro leading-relaxed text-fg-subtle">
                一键抽取当前剧本所有台词与选择支原文，生成标准 Ren'Py 翻译骨架（game/tl/&lt;语言&gt;/script.rpy）。无需本机 SDK，译文可直接被 Ren'Py 加载。
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {TL_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTlLang(p)}
                    className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                      tlLang === p
                        ? 'border-signal/60 bg-signal/10 text-fg'
                        : 'border-edge/15 bg-surface-3 text-fg-muted hover:text-fg'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={tlLang}
                  onChange={(e) => setTlLang(e.target.value)}
                  placeholder="自定义语言代码（须与 Ren'Py translate 语言一致）"
                  className="min-w-[260px] flex-1 rounded-md border border-edge/15 bg-surface-3 px-2.5 py-1.5 text-xs text-fg outline-none transition-colors focus:border-signal/60"
                />
                <Button
                  variant="primary"
                  onClick={handleExportTranslation}
                  disabled={tlBusy || totalLines === 0}
                >
                  <Languages size={14} strokeWidth={1.75} className="mr-1" />
                  生成并下载翻译骨架
                </Button>
              </div>

              <p className="mt-2 t-micro leading-relaxed text-fg-subtle">
                语言代码需与 Ren'Py 的 translate 语言标识一致（如 chinese / japanese）。生成后把文件放到工程 game/tl/&lt;语言&gt;/ 目录下即可生效。
              </p>

              {tlResult && (
                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-edge/12 bg-surface-1 p-3 t-micro t-mono leading-relaxed text-fg">
                  {tlResult}
                </pre>
              )}
            </section>

            {/* 校验结果 */}
            {validationResult && (
              <div className={`panel p-4 ${validationResult.ok ? 'border-success/40' : 'border-danger/40'}`}>
                <pre className="whitespace-pre-wrap t-micro t-mono leading-relaxed">{validationResult.message}</pre>
              </div>
            )}

            {/* 项目包导出结果 */}
            {packageResult && (
              <div className={`panel p-4 ${packageResult.ok ? 'border-success/40' : 'border-danger/40'}`}>
                <pre className="whitespace-pre-wrap t-micro t-mono leading-relaxed">{packageResult.message}</pre>
              </div>
            )}

            {/* 空缺引导 */}
            {totalLines === 0 && (
              <div className="panel border-dashed border-edge/25 p-6 text-center">
                <p className="t-caption">尚未添加任何剧本行。先去场景导航中编写内容再导出。</p>
              </div>
            )}

            {/* 导出格式说明 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">导出格式 Format</div>
              <div className="space-y-2 t-micro leading-relaxed">
                <p>
                  <code className="text-signal">script.rpy</code> — Ren'Py 脚本主文件，包含 label / scene / show / hide / 台词等。
                </p>
                <p>
                  <code className="text-signal">definitions.rpy</code> — 角色声明 + image / transform 定义 + 素材路径清单。
                </p>
                <p>
                  导出后将文件放入 Ren'Py 项目的 <code className="text-signal">game/</code> 目录，素材放入对应子目录即可运行。
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
