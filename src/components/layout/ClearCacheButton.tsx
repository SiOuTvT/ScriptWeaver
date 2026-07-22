import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { Button, type Variant } from '@/components/ui'
import { toast } from '@/utils/toast'

interface ClearCacheButtonProps {
  variant?: Variant
  block?: boolean
}

/**
 * 一键清除本地缓存：删除已导入素材（session-assets）、版本快照（snapshots），
 * 并清空草稿持久化（localStorage），随后重载软件回到纯净白板。
 * 用于打包/测试前清场，避免旧数据被带进工程。
 */
export function ClearCacheButton({ variant = 'outline', block = false }: ClearCacheButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleClear = async () => {
    const confirmed = window.confirm(
      '确定清除本地缓存吗？\n\n这会删除：\n· 已导入的素材文件（session-assets）\n· 版本快照（snapshots）\n· 当前草稿与本地设置（localStorage）\n\n操作不可撤销，软件将重置为纯净白板。',
    )
    if (!confirmed) return
    setBusy(true)
    try {
      const api = window.electronAPI
      const res = api?.clearLocalCache ? await api.clearLocalCache() : { success: false }
      // 无论磁盘清理是否成功，渲染端都清空草稿持久化，确保重置彻底
      try {
        localStorage.clear()
      } catch {
        /* 忽略：隐私模式等场景下可能抛错 */
      }
      if (res?.success) {
        toast('本地缓存已清除，正在重置…', 'success')
      } else {
        toast('草稿缓存已清空，正在重置…', 'success')
      }
      setTimeout(() => window.location.reload(), 600)
    } catch {
      setBusy(false)
      toast('清除失败，请重试', 'error')
    }
  }

  return (
    <Button
      variant={variant}
      icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      onClick={handleClear}
      disabled={busy}
      block={block}
    >
      {busy ? '清除中…' : '清除本地缓存'}
    </Button>
  )
}
