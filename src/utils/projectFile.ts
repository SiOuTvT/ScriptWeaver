/**
 * 项目文件（.swproj）序列化 / 反序列化 / 恢复 —— 供 AppLayout、版本历史等复用。
 */

import { useAppStore } from '@/stores/appStore'
import { saveDraft } from '@/utils/draftStorage'
import type { ProjectFile, LineDelta, CharacterConfig, AssetItem, GlobalVariable, ProjectMeta } from '@/core/types'

/** 剥离 assets 中的 blobUrl 易失字段 —— 仅 Web 降级内存渲染使用，不入 .swproj / localStorage */
function stripVolatile(assets: AssetItem[]): AssetItem[] {
  return assets.map(({ blobUrl: _blobUrl, ...rest }) => rest)
}

/** 序列化完整项目数据为 JSON（不含 dataUrl） */
export function serializeProject(deltas: LineDelta[], characterConfigs: CharacterConfig[], assets: AssetItem[]): string {
  const project: ProjectFile = {
    version: 1,
    draftDeltas: deltas,
    characterConfigs,
    assets: stripVolatile(assets),
    variables: useAppStore.getState().variables,
    savedAt: new Date().toISOString(),
    canvasRatio: useAppStore.getState().canvasRatio,
    projectMeta: useAppStore.getState().projectMeta,
  }
  return JSON.stringify(project, null, 2)
}

/** 反序列化项目 JSON，校验基本结构并返回最佳努力的恢复结果。
 *  设计目标：即使遇到手改 / 部分写入 / 旧版 JSON，也尽量恢复而非整体丢弃或崩溃。
 *  - 顶层非对象或 JSON 非法 → 返回 null（无法恢复）
 *  - 数组字段缺省/类型错误 → 回退为空数组（不阻断其余数据加载）
 *  - draftDeltas 中混入 null / 非对象 / 缺 line_id 的条目 → 过滤或补全 line_id，
 *    杜绝下游 normalizeDelta 因访问 null.audio 等而抛错（铁律：外部数据进入内核须有边界校验）
 */
export function deserializeProject(json: string): {
  deltas: LineDelta[]
  characterConfigs: CharacterConfig[]
  assets: AssetItem[]
  variables: GlobalVariable[]
  canvasRatio?: { w: number; h: number }
  projectMeta?: ProjectMeta
} | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!isPlainObject(data)) return null
  const file = data as Partial<ProjectFile>

  const deltas = sanitizeDeltas(file.draftDeltas)
  // 外部数据：仅保证为对象数组（过滤 null / 非对象），精确字段类型由下游 normalizeDelta 兜底
  const characterConfigs = asObjectArray(file.characterConfigs) as unknown as CharacterConfig[]
  const assets = asObjectArray(file.assets) as unknown as AssetItem[]
  const variables = sanitizeVariables(file.variables)
  const canvasRatio = sanitizeCanvasRatio(file.canvasRatio)
  const projectMeta = isPlainObject(file.projectMeta)
    ? (file.projectMeta as ProjectMeta)
    : { title: 'My Visual Novel' }

  return { deltas, characterConfigs, assets, variables, canvasRatio, projectMeta }
}

/** 仅接受纯对象（不含 null / 数组 / 原始值），用于防御性类型收窄 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 把任意值收敛为对象数组（过滤 null / 非对象项），保证下游 map 安全 */
function asObjectArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is Record<string, unknown> => isPlainObject(x))
}

/** 清洗剧本行数组：过滤非对象项；缺 line_id 的合成确定性占位 id（sw_line_<索引>），避免下游键冲突与崩溃 */
function sanitizeDeltas(v: unknown): LineDelta[] {
  if (!Array.isArray(v)) return []
  const out: LineDelta[] = []
  v.forEach((entry, i) => {
    if (!isPlainObject(entry)) return
    const d = entry as unknown as LineDelta
    if (typeof d.line_id !== 'string' || d.line_id.length === 0) {
      // 补全缺失的 line_id，保留其余字段给 normalizeDelta 处理
      out.push({ ...d, line_id: `sw_line_${i}` })
    } else {
      out.push(d)
    }
  })
  return out
}

/** 清洗全局变量数组：过滤非对象项；丢弃无 name 的非法变量（避免导出器引用 undefined 名） */
function sanitizeVariables(v: unknown): GlobalVariable[] {
  if (!Array.isArray(v)) return []
  const out: GlobalVariable[] = []
  for (const entry of v) {
    if (!isPlainObject(entry)) continue
    const gv = entry as unknown as GlobalVariable
    if (typeof gv.name !== 'string' || gv.name.length === 0) continue
    out.push(gv)
  }
  return out
}

/** 校验画布比例：必须是含正数 w / h 的对象，否则视为未指定 */
function sanitizeCanvasRatio(v: unknown): { w: number; h: number } | undefined {
  if (!isPlainObject(v)) return undefined
  const w = (v as { w?: unknown }).w
  const h = (v as { h?: unknown }).h
  if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
    return { w, h }
  }
  return undefined
}

/**
 * 将工程 JSON 恢复到当前工作区（用于打开 .swproj 或回滚快照）。
 * 统一处理：写入 store → 恢复画布比例 → 落草稿 → 激活项目根目录（驱动 sw-asset:// 协议）。
 */
export async function restoreProjectFromJson(json: string, projectRoot: string | null): Promise<boolean> {
  const parsed = deserializeProject(json)
  if (!parsed) return false
  const store = useAppStore.getState()
  store.loadProjectData({ ...parsed, projectRoot })
  store.setCanvasRatio(parsed.canvasRatio ?? { w: 16, h: 9 })
  saveDraft(parsed.deltas, parsed.characterConfigs, parsed.assets, projectRoot, parsed.canvasRatio ?? { w: 16, h: 9 })

  const api = window.electronAPI
  if (api) {
    try {
      await api.setActiveProjectRoot(projectRoot)
    } catch {
      /* 忽略：纯浏览器环境无此 IPC */
    }
  }
  return true
}
