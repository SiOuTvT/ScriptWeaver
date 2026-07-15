import { useCallback, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui'
import { downloadRpy, validateExportNames, resolveLookups, formatValidationErrors, exportDefinitionsRpy, exportToRpy } from '@/utils/rpyExporter'
import { DEFAULT_POSITION_SLOTS } from '@/core/positionSlots'

export default function ExportSettings() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const resolvedStates = useAppStore((s) => s.resolvedStates)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)

  const [scriptLabel, setScriptLabel] = useState('start')
  const [validationResult, setValidationResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleValidate = useCallback(() => {
    const lookups = resolveLookups(draftDeltas, characterConfigs)
    const errors = validateExportNames(draftDeltas, lookups, characterConfigs)
    if (errors.length === 0) {
      setValidationResult({ ok: true, message: '所有引用均有效，无错误。' })
    } else {
      setValidationResult({ ok: false, message: formatValidationErrors(errors) })
    }
  }, [draftDeltas, characterConfigs])

  const handleExportScript = useCallback(() => {
    downloadRpy(draftDeltas, resolvedStates, characterConfigs, assets, DEFAULT_POSITION_SLOTS, `${scriptLabel}.rpy`)
  }, [draftDeltas, resolvedStates, characterConfigs, assets, scriptLabel])

  const handleExportDefs = useCallback(() => {
    const content = exportDefinitionsRpy(characterConfigs, assets, DEFAULT_POSITION_SLOTS)
    const blob = new Blob([content], { type: 'text/x-renpy;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'definitions.rpy'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [characterConfigs, assets])

  const handleExportBoth = useCallback(() => {
    downloadRpy(draftDeltas, resolvedStates, characterConfigs, assets, DEFAULT_POSITION_SLOTS, `${scriptLabel}.rpy`)
    const defs = exportDefinitionsRpy(characterConfigs, assets, DEFAULT_POSITION_SLOTS)
    const blob = new Blob([defs], { type: 'text/x-renpy;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'definitions.rpy'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [draftDeltas, resolvedStates, characterConfigs, assets, scriptLabel])

  const totalLines = draftDeltas.length
  const speakerCount = new Set(draftDeltas.map((d) => d.speaker).filter(Boolean)).size
  const charInScene = characterConfigs.length

  const stats = [
    { label: '剧本行数', value: totalLines },
    { label: '出场说话人', value: speakerCount },
    { label: '角色配置', value: charInScene },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-canvas p-6">
      <div className="mx-auto w-full max-w-2xl">
        {/* 标题 */}
        <header className="mb-5">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">Export · Ren'Py</span>
          </div>
          <h2 className="mt-1.5 text-base font-semibold tracking-tight text-fg">Ren'Py 导出设置</h2>
          <p className="mt-0.5 t-subtitle">配置导出选项并校验脚本完整性</p>
        </header>

        {/* 项目概况 */}
        <section className="panel mb-4 p-4">
          <div className="eyebrow mb-3">项目概况 · Overview</div>
          <div className="grid grid-cols-3 divide-x divide-edge/10">
            {stats.map((item) => (
              <div key={item.label} className="px-4 first:pl-0">
                <p className="t-label">{item.label}</p>
                <p className="mt-0.5 t-display t-mono">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 脚本入口 */}
        <section className="panel mb-4 p-4">
          <div className="eyebrow mb-3">脚本入口 · Label</div>
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
        <section className="panel mb-4 p-4">
          <div className="eyebrow mb-3">导出操作 · Export</div>
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
          </div>
        </section>

        {/* 校验结果 */}
        {validationResult && (
          <div className={`panel mb-4 p-4 ${validationResult.ok ? 'border-success/40' : 'border-danger/40'}`}>
            <pre className="whitespace-pre-wrap t-micro t-mono leading-relaxed">
              {validationResult.message}
            </pre>
          </div>
        )}

        {/* 空缺引导 */}
        {totalLines === 0 && (
          <div className="panel mb-4 border-dashed border-edge/25 p-6 text-center">
            <p className="t-caption">尚未添加任何剧本行。先去场景导航中编写内容再导出。</p>
          </div>
        )}

        {/* 导出格式说明 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">导出格式 · Format</div>
          <div className="space-y-2 t-micro leading-relaxed">
            <p><code className="text-signal">script.rpy</code> — Ren'Py 脚本主文件，包含 label / scene / show / hide / 台词等。</p>
            <p><code className="text-signal">definitions.rpy</code> — 角色声明 + image / transform 定义 + 素材路径清单。</p>
            <p>导出后将文件放入 Ren'Py 项目的 <code className="text-signal">game/</code> 目录，素材放入对应子目录即可运行。</p>
          </div>
        </section>
      </div>
    </div>
  )
}
