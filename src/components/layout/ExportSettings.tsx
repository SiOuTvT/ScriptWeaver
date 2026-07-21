import { Fragment, useCallback, useState, type ReactNode } from 'react'
import { Monitor, Apple, Smartphone, Globe, Circle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui'
import {
  downloadRpy,
  validateExportNames,
  resolveLookups,
  formatValidationErrors,
  exportDefinitionsRpy,
  exportProjectPackage,
} from '@/utils/rpyExporter'
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
    hint: '导出为 WebGL 构建，可直接部署到任意静态托管；注意控制立绘与音频体积。',
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
    if (errors.length === 0) {
      setValidationResult({ ok: true, message: '所有引用均有效，无错误。' })
      setStage((s) => ({ ...s, validate: 'done', script: 'active' }))
    } else {
      setValidationResult({ ok: false, message: formatValidationErrors(errors) })
      setStage((s) => ({ ...s, validate: 'error' }))
    }
  }, [draftDeltas, characterConfigs])

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
    )
    setPackageResult({ ok: res.success, message: res.message })
    setStage((s) => (res.success ? { ...s, pack: 'done', done: 'done' } : { ...s, pack: 'error' }))
  }, [draftDeltas, resolvedStates, characterConfigs, assets, scriptLabel, variables])

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
            <span className="eyebrow">Export Ren'Py</span>
          </div>
          <h2 className="t-h1 mt-1.5">Ren'Py 导出设置</h2>
          <p className="mt-0.5 t-subtitle">选择导出目标、配置打包偏好并校验脚本完整性</p>
        </header>

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
            </section>

            {/* 脚本入口 */}
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

            {/* 导出操作 */}
            <section className="panel p-4">
              <div className="eyebrow mb-3">导出操作 Export</div>
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
