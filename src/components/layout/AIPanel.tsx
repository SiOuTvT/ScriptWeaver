import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui'
import { Settings, Sparkles, Loader2 } from 'lucide-react'
import type { LineDelta } from '@/core/types'

const STORAGE_KEY = 'scriptweaver_ai_config'

interface AIConfig {
  endpoint: string
  apiKey: string
  model: string
}

function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* noop */ }
  return { endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-3.5-turbo' }
}

function saveConfig(cfg: AIConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

function nextLineId(deltas: LineDelta[]): string {
  let maxNum = 0
  for (const d of deltas) {
    const match = d.line_id.match(/^L(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > maxNum) maxNum = n
    }
  }
  return `L${maxNum + 1}`
}

const SYSTEM_PROMPT = `你是一个视觉小说剧本生成助手。用户会描述想要的场景，你需要生成一个 Ren'Py 风格的剧本JSON。

返回格式必须是纯 JSON 数组，每个元素是一条指令，包含：
- line_id: "L1", "L2", ...（行号）
- speaker: 说话人名称（null 表示旁白）
- dialogue: 台词
- background: { asset_id: "school", transition: "dissolve" } | null（null=延续上一行）
- characters: { "角色名": { sprite_id: "表情名", position_slot: "left"|"center"|"right", action: "show" } }（空对象={}表示无角色变更）
- audio: { bgm: null, ambient: null, se: [], voice: null }（bgm可设 { asset_id, volume, loop, fade_in_ms }）

【规则】
1. 生成 5-12 行
2. 角色名为英文小写（如 alice, bob）
3. 表情名用英文（如 smile, angry, normal, sad, happy）
4. 背景用英文关键词（如 school, park, room, street, night_sky）
5. 音乐用英文风格关键词（如 peaceful, tense, romantic, cheerful）
6. 输出只包含 JSON 数组，不要任何额外文字`

function buildUserPrompt(desc: string, existingChars: string, existingBgs: string): string {
  return `现有角色: ${existingChars || '无'}
现有背景: ${existingBgs || '无'}

用户需求: ${desc}

请根据以上信息生成适合的剧本。角色和背景尽量用已有的，必要时可以新增合适的。`
}

export default function AIPanel() {
  const draftDeltas = useAppStore((s) => s.draftDeltas)
  const characterConfigs = useAppStore((s) => s.characterConfigs)
  const assets = useAppStore((s) => s.assets)
  const insertDeltaAt = useAppStore((s) => s.insertDeltaAt)
  const selectLine = useAppStore((s) => s.selectLine)

  const [config, setConfig] = useState<AIConfig>(loadConfig)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(!config.apiKey)
  const abortRef = useRef<AbortController | null>(null)

  const existingChars = characterConfigs.map((c) => `${c.charId}(${c.displayName})`).join(', ')
  const existingBgs = assets.filter((a) => a.type === 'background').map((a) => a.name).join(', ')

  const generate = useCallback(async () => {
    if (!prompt.trim() || !config.apiKey.trim()) return

    setLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(prompt, existingChars, existingBgs) },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`API 请求失败 (${res.status}): ${errText.slice(0, 200)}`)
      }

      const data = await res.json()
      const content = data.choices?.[0]?.message?.content ?? ''

      // 提取 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('AI 响应格式错误：未找到 JSON 数组')
      }

      const lines = JSON.parse(jsonMatch[0]) as Array<Partial<LineDelta>>

      // 插入生成的行
      const insertAt = draftDeltas.length
      for (const line of lines) {
        const id = nextLineId(useAppStore.getState().draftDeltas)
        const delta: LineDelta = {
          line_id: id,
          speaker: line.speaker ?? null,
          dialogue: line.dialogue ?? '',
          background: line.background ?? null,
          characters: line.characters ?? {},
          audio: line.audio ?? { bgm: null, ambient: null, se: [], voice: null },
        }
        insertDeltaAt(insertAt, delta)
      }

      selectLine(insertAt)
      setPrompt('')
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err.message ?? '未知错误')
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [prompt, config, existingChars, existingBgs, draftDeltas.length, insertDeltaAt, selectLine])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const saveConfigCb = useCallback(() => {
    saveConfig(config)
    setShowConfig(false)
  }, [config])

  return (
    <div className="flex flex-1 flex-col bg-canvas">
      {/* Header */}
      <div className="shrink-0 border-b border-edge/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="eyebrow">AI 辅助写作 Assistant</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Settings size={14} strokeWidth={1.75} />}
            onClick={() => setShowConfig(!showConfig)}
          >
            设置
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* 连接设置 */}
        {showConfig && (
          <section className="panel p-4">
            <div className="eyebrow mb-3">连接设置 Connection</div>
            <div className="space-y-3">
              <label className="block">
                <span className="t-label">API 端点</span>
                <input
                  type="text"
                  value={config.endpoint}
                  onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
              </label>
              <label className="block">
                <span className="t-label">API Key</span>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
              </label>
              <label className="block">
                <span className="t-label">模型</span>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="mt-1 w-full rounded border border-edge/15 bg-surface-3 px-2 py-1.5 text-xs text-fg outline-none focus:border-signal/60"
                />
              </label>
              <Button variant="primary" block onClick={saveConfigCb}>
                保存设置
              </Button>
            </div>
          </section>
        )}

        {/* 当前上下文 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">当前上下文 Context</div>
          <div className="flex gap-5 t-label">
            <span><span className="font-mono text-fg-muted">{draftDeltas.length}</span> 行</span>
            <span><span className="font-mono text-fg-muted">{characterConfigs.length}</span> 个角色</span>
            <span><span className="font-mono text-fg-muted">{assets.filter((a) => a.type === 'background').length}</span> 个背景</span>
          </div>
        </section>

        {/* 错误 */}
        {error && (
          <div className="panel border-danger/40 p-3">
            <p className="t-caption text-danger">{error}</p>
          </div>
        )}

        {/* 创作指令 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">创作指令 Prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：Alice 和 Bob 在学校走廊相遇，争吵关于周末去图书馆还是去游乐园的事情..."
            rows={4}
            disabled={loading}
            className="w-full resize-none rounded-lg border border-edge/15 bg-surface-3 px-3 py-2 text-xs text-fg placeholder-fg-subtle outline-none focus:border-signal/60 disabled:opacity-50"
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              onClick={generate}
              disabled={loading || !prompt.trim() || !config.apiKey.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={1.75} />
                  生成剧本
                </>
              )}
            </Button>
            {loading && (
              <Button variant="outline" onClick={cancel}>
                取消
              </Button>
            )}
          </div>
        </section>

        {/* 使用提示 */}
        <section className="panel p-4">
          <div className="eyebrow mb-3">使用提示 Tips</div>
          <p className="t-micro leading-relaxed">
            生成的剧本会被追加到当前时间轴末尾。你可以描述剧情走向、人物关系、场景氛围等。
            模型会自动匹配现有角色和背景，必要时会新增。
            支持 OpenAI 兼容的 API 端点（如 OpenAI、Azure、本地模型等）。
          </p>
        </section>
      </div>
    </div>
  )
}
