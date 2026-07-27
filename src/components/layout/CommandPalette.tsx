/**
 * 全局命令面板（Command Palette / Ctrl+K）—— v0.9.0
 *
 * 按下 Ctrl+K / Cmd+K 唤醒全局搜索与命令输入框，
 * 支持键盘快速搜索并执行全站动作。
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAppStore, type NavItemId } from '@/stores/appStore'
import {
  Search, Zap, FileText, Download, Bug, Camera, Sparkles,
  BookOpen, Images, Users, Wand2, Settings, HelpCircle, Info,
  Save, Undo2, Redo2, Sun, Play, Globe, Plus, Copy, Trash2, type LucideIcon
} from 'lucide-react'

interface Command {
  id: string
  label: string
  description?: string
  keywords?: string[]
  icon: LucideIcon | React.FC<{ size?: number; strokeWidth?: number }>
  action: () => void
  category: 'navigation' | 'editor' | 'export' | 'tool' | 'view'
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ---------- 构建命令注册表 ----------
  const commands = useMemo((): Command[] => {
    const s = useAppStore.getState()
    const navItems: { id: NavItemId; label: string }[] = [
      { id: 'chapters', label: '场景导航' },
      { id: 'script-overview', label: '剧本总览' },
      { id: 'assets', label: '素材管理' },
      { id: 'characters', label: '角色管理' },
      { id: 'effects', label: '特效大本营' },
      { id: 'renpy-hub', label: 'Ren\'Py 生态大厅' },
      { id: 'export', label: '导出设置' },
      { id: 'ai', label: 'AI 功能' },
      { id: 'settings', label: '设置中心' },
      { id: 'about', label: '关于' },
      { id: 'help', label: '帮助中心' },
      { id: 'diagnostics', label: '工程体检' },
      { id: 'exporter', label: '多格式导出' },
    ]

    const cmds: Command[] = [
      // ---- 导航 ----
      ...navItems.map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        keywords: [item.id, item.label],
        icon: getNavIcon(item.id),
        action: () => {
          useAppStore.getState().setActiveNavItem(item.id)
          setOpen(false)
        },
        category: 'navigation' as const,
      })),

      // ---- 编辑器 ----
      {
        id: 'save', label: '保存项目',
        keywords: ['ctrl+s'],
        description: '使用 Ctrl+S 快捷键保存项目',
        icon: Save,
        action: () => { setOpen(false) },
        category: 'editor',
      },
      {
        id: 'undo', label: '撤销',
        keywords: ['ctrl+z'],
        icon: Undo2,
        action: () => { s.undo() },
        category: 'editor',
      },
      {
        id: 'redo', label: '重做',
        keywords: ['ctrl+shift+z', 'ctrl+y'],
        icon: Redo2,
        action: () => { s.redo() },
        category: 'editor',
      },
      {
        id: 'insert-line', label: '在当前行后插入新行',
        keywords: ['插入', '新行', 'add line', '新增'],
        icon: Plus,
        action: () => {
          const st = useAppStore.getState()
          st.insertDeltaAt(st.selectedLineIndex + 1)
          setOpen(false)
        },
        category: 'editor',
      },
      {
        id: 'duplicate-line', label: '复制当前行',
        keywords: ['复制', 'duplicate', 'copy line'],
        icon: Copy,
        action: () => {
          const st = useAppStore.getState()
          const cur = st.draftDeltas[st.selectedLineIndex]
          if (cur) st.insertDeltaAt(st.selectedLineIndex + 1, { ...cur, line_id: 'L' + Date.now() })
          setOpen(false)
        },
        category: 'editor',
      },
      {
        id: 'delete-line', label: '删除当前行',
        keywords: ['删除', 'delete line', '移除'],
        icon: Trash2,
        action: () => {
          const st = useAppStore.getState()
          st.deleteDeltaAt(st.selectedLineIndex)
          setOpen(false)
        },
        category: 'editor',
      },

      // ---- 导出 ----
      {
        id: 'export-rpy', label: '导出 Ren\'Py 工程',
        icon: Download,
        action: () => { useAppStore.getState().setActiveNavItem('export'); setOpen(false) },
        category: 'export',
      },
      {
        id: 'export-multi', label: '多格式导出',
        keywords: ['markdown', 'txt', 'pdf', 'csv', 'cv', '台词表'],
        icon: FileText,
        action: () => { useAppStore.getState().setActiveNavItem('exporter'); setOpen(false) },
        category: 'export',
      },

      // ---- 工具 ----
      {
        id: 'diagnostics', label: '工程健康度诊断',
        keywords: ['体检', '检查', '诊断', '错误', 'diagnostics'],
        description: '扫描悬空 Jump、缺失引用、残缺选择支等',
        icon: Bug,
        action: () => { useAppStore.getState().setActiveNavItem('diagnostics'); setOpen(false) },
        category: 'tool',
      },
      {
        id: 'snapshot', label: '打一个快照',
        keywords: ['snapshot', '版本', '备份', 'save point'],
        description: '保存当前剧本的版本快照',
        icon: Camera,
        action: () => { useAppStore.getState().setActiveNavItem('about'); setOpen(false) },
        category: 'tool',
      },
      {
        id: 'ai-generate', label: 'AI 生成剧情',
        keywords: ['ai', '生成', 'copilot', '剧情'],
        icon: Sparkles,
        action: () => { useAppStore.getState().setActiveNavItem('ai'); setOpen(false) },
        category: 'tool',
      },
      {
        id: 'preview-run', label: '舞台播放/运行预览',
        keywords: ['play', 'preview', 'stage'],
        icon: Play,
        action: () => { /* stage preview is always visible */ },
        category: 'tool',
      },

      // ---- 视图 ----
      {
        id: 'toggle-sidebar', label: '切换侧边栏',
        icon: SidebarIcon,
        action: () => { s.toggleLeftSidebar() },
        category: 'view',
      },
      {
        id: 'toggle-theme', label: '切换深浅色主题',
        keywords: ['dark', 'light', 'theme'],
        icon: Sun,
        action: () => { s.toggleTheme() },
        category: 'view',
      },
    ]

    return cmds
  }, [])

  // ---------- 键盘快捷键 ----------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => {
          if (!prev) {
            setQuery('')
            setSelectedIndex(0)
          }
          return !prev
        })
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // ---------- 自动聚焦 ----------
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // ---------- 过滤 ----------
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.keywords?.some((kw) => kw.toLowerCase().includes(q)),
    )
  }, [commands, query])

  // 分组
  const groups = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const c of filtered) {
      const arr = map.get(c.category) ?? []
      arr.push(c)
      map.set(c.category, arr)
    }
    return map
  }, [filtered])

  // 选中项复位
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // 滚动到选中项
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-command-index="${selectedIndex}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action()
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    },
    [filtered, selectedIndex],
  )

  // 点击执行
  const execute = useCallback((cmd: Command) => {
    cmd.action()
  }, [])

  if (!open) return null

  const categoryLabels: Record<string, string> = {
    navigation: '导航',
    editor: '编辑',
    export: '导出',
    tool: '工具',
    view: '视图',
  }

  return (
    <div
      className="fixed inset-0 z-[999] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* 面板 */}
      <div
        className="relative z-10 w-full max-w-xl rounded-xl border border-edge/15 bg-surface-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-3 border-b border-edge/10 px-4 py-3">
          <Search size={16} className="text-fg-faint shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索命令或操作..."
            className="flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-faint outline-none border-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="px-1.5 py-0.5 rounded text-[11px] font-mono text-fg-faint bg-surface-3/50 border border-edge/10">
            ESC
          </kbd>
        </div>

        {/* 结果列表 */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-fg-faint">
              没有匹配的命令
            </div>
          ) : (
            Array.from(groups.entries()).map(([category, cmds], gi) => (
              <div key={category}>
                {gi > 0 && <div className="my-1 border-t border-edge/5" />}
                <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-fg-faint uppercase tracking-wider">
                  {categoryLabels[category] || category}
                </div>
                {cmds.map((cmd, ci) => {
                  const flatIdx = filtered.indexOf(cmd)
                  const isSelected = flatIdx === selectedIndex
                  return (
                    <button
                      key={cmd.id}
                      data-command-index={flatIdx}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-fg'
                          : 'text-fg-muted hover:bg-surface-hover'
                      }`}
                    >
                      <cmd.icon size={16} strokeWidth={1.75} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-[12px] text-fg-faint truncate">{cmd.description}</div>
                        )}
                      </div>
                      {isSelected && (
                        <kbd className="text-[11px] text-fg-faint/60">↩</kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center gap-4 border-t border-edge/10 px-4 py-2 text-[11px] text-fg-faint">
          <span>↑↓ 导航</span>
          <span>↩ 执行</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}

function getNavIcon(id: NavItemId): LucideIcon {
  const map: Partial<Record<NavItemId, LucideIcon>> = {
    chapters: BookOpen,
    'script-overview': FileText,
    assets: Images,
    characters: Users,
    effects: Wand2,
    export: Download,
    ai: Sparkles,
    settings: Settings,
    about: Info,
    help: HelpCircle,
    diagnostics: Bug,
    exporter: FileText,
    'renpy-hub': Globe,
  }
  return map[id] || Zap
}

function SidebarIcon({ size = 16, strokeWidth = 1.75 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  )
}
