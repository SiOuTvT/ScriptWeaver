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

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-canvas/50 p-6">
      <h2 className="mb-1 text-sm font-semibold text-fg">Ren'Py 导出设置</h2>
      <p className="mb-5 text-[11px] text-fg-subtle">配置导出选项并校验脚本完整性</p>

      {/* 项目概况 */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: '剧本行数', value: totalLines },
          { label: '出场说话人', value: speakerCount },
          { label: '角色配置', value: charInScene },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-edge/10 bg-surface-2/60 px-4 py-3">
            <p className="text-[10px] text-fg-subtle">{item.label}</p>
            <p className="mt-0.5 font-mono text-lg font-semibold text-fg">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Label 设置 */}
      <div className="mb-5">
        <label className="mb-1 block text-[11px] font-medium text-fg-muted">Ren'Py Script Label</label>
        <input
          type="text"
          value={scriptLabel}
          onChange={(e) => setScriptLabel(e.target.value)}
          className="w-48 rounded-md border border-edge/15 bg-surface-3 px-2.5 py-1.5 text-xs text-fg outline-none transition-colors focus:border-primary/60"
        />
        <p className="mt-0.5 text-[10px] text-fg-faint">导出的脚本将以 label {scriptLabel}: 开头</p>
      </div>

      {/* 操作按钮 */}
      <div className="mb-5 flex flex-wrap gap-2">
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

      {/* 校验结果 */}
      {validationResult && (
        <div className={`rounded-lg border p-4 ${validationResult.ok ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'}`}>
          <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-fg-muted font-mono">
            {validationResult.message}
          </pre>
        </div>
      )}

      {/* 空缺引导 */}
      {totalLines === 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-edge/15 px-4 py-6 text-center">
          <p className="text-[11px] text-fg-subtle">尚未添加任何剧本行。先去场景导航中编写内容再导出。</p>
        </div>
      )}

      {/* 导出格式说明 */}
      <div className="mt-auto pt-6">
        <h3 className="mb-2 text-[11px] font-medium text-fg-subtle">导出文件说明</h3>
        <div className="space-y-1.5 text-[10px] text-fg-faint">
          <p><code className="text-primary">script.rpy</code> — Ren'Py 脚本主文件，包含 label/scene/show/hide/台词等</p>
          <p><code className="text-primary">definitions.rpy</code> — 角色声明 + image/transform 定义 + 素材路径清单</p>
          <p>导出后将文件放入 Ren'Py 项目的 <code className="text-primary">game/</code> 目录，素材放入对应子目录即可运行。</p>
        </div>
      </div>
    </div>
  )
}
