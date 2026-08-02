import { useAppStore } from '@/stores/appStore'
import {
  BookOpen, FileText, Images, Users, Download, Sparkles, Wand2, Info, HelpCircle, Settings,
  ChevronLeft, ChevronRight, Stethoscope, FileDown, Globe, Cloud, History, Code, ScrollText,
  FilePlus2, FolderOpen, SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

interface NavItem {
  id: string
  label: string
  icon: ReactNode
  code?: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

/** 完整模式：全部功能入口（面向进阶用户） */
const NAV_GROUPS: NavGroup[] = [
  {
    title: '创作工作区',
    items: [
      { id: 'chapters', label: '写剧情', code: '01', icon: <BookOpen size={18} strokeWidth={1.75} /> },
      { id: 'script-overview', label: '剧本总览', code: '02', icon: <FileText size={18} strokeWidth={1.75} /> },
      { id: 'script', label: '脚本文本', code: '03', icon: <Code size={18} strokeWidth={1.75} /> },
      { id: 'ai', label: 'AI 编剧', code: '04', icon: <Sparkles size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '内容资产',
    items: [
      { id: 'characters', label: '角色', code: '05', icon: <Users size={18} strokeWidth={1.75} /> },
      { id: 'assets', label: '素材库', code: '06', icon: <Images size={18} strokeWidth={1.75} /> },
      { id: 'effects', label: '特效', code: '07', icon: <Wand2 size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '导出与生态',
    items: [
      { id: 'export', label: '发布与导出', code: '08', icon: <Download size={18} strokeWidth={1.75} /> },
      { id: 'exporter', label: '多文件导出', code: '09', icon: <FileDown size={18} strokeWidth={1.75} /> },
      { id: 'renpy-hub', label: 'Ren\'Py 生态', code: '10', icon: <Globe size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '工程与协作',
    items: [
      {
        id: 'templates', label: '从模板新建', code: '11', icon: <FilePlus2 size={18} strokeWidth={1.75} />,
      },
      {
        id: 'import-rpy', label: '导入工程', code: '12', icon: <FolderOpen size={18} strokeWidth={1.75} />,
      },
      { id: 'diagnostics', label: '工程体检', code: '13', icon: <Stethoscope size={18} strokeWidth={1.75} /> },
      { id: 'history', label: '版本历史', code: '14', icon: <History size={18} strokeWidth={1.75} /> },
      { id: 'collab', label: 'P2P 协作', code: '15', icon: <Cloud size={18} strokeWidth={1.75} /> },
      { id: 'audit-log', label: '协作日志', code: '16', icon: <ScrollText size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '设置与帮助',
    items: [
      { id: 'settings', label: '设置', code: '17', icon: <Settings size={18} strokeWidth={1.75} /> },
      { id: 'help', label: '帮助', code: '18', icon: <HelpCircle size={18} strokeWidth={1.75} /> },
      { id: 'about', label: '关于', code: '19', icon: <Info size={18} strokeWidth={1.75} /> },
    ],
  },
]

/** 新手模式：只留最常用的入口，名字全是大白话 */
const SIMPLE_GROUPS: NavGroup[] = [
  {
    title: '开始创作',
    items: [
      { id: 'chapters', label: '写剧情', code: '1', icon: <BookOpen size={18} strokeWidth={1.75} /> },
      { id: 'assets', label: '素材库', code: '2', icon: <Images size={18} strokeWidth={1.75} /> },
      { id: 'characters', label: '角色', code: '3', icon: <Users size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '完成发布',
    items: [
      { id: 'export', label: '发布与导出', code: '4', icon: <Download size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '设置与帮助',
    items: [
      { id: 'settings', label: '设置', code: '5', icon: <Settings size={18} strokeWidth={1.75} /> },
      { id: 'help', label: '帮助', code: '6', icon: <HelpCircle size={18} strokeWidth={1.75} /> },
    ],
  },
]

export default function LeftSidebar() {
  const collapsed = useAppStore((s) => s.leftSidebarCollapsed)
  const activeItem = useAppStore((s) => s.activeNavItem)
  const setActive = useAppStore((s) => s.setActiveNavItem)
  const toggle = useAppStore((s) => s.toggleLeftSidebar)
  const simpleMode = useAppStore((s) => s.simpleMode)
  const setSimpleMode = useAppStore((s) => s.setSimpleMode)

  const [appVersion, setAppVersion] = useState('1.0.0')

  useEffect(() => {
    window.electronAPI?.getVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  const width = collapsed ? 'w-12' : 'w-44'

  const groups = simpleMode ? SIMPLE_GROUPS : NAV_GROUPS
  const allItems = groups.flatMap((g) => g.items)

  const handleClick = (item: NavItem) => {
    setActive(item.id as Parameters<typeof setActive>[0])
  }

  const renderItem = (item: NavItem) => {
    const isActive = activeItem === item.id
    return (
      <button
        key={item.id}
        onClick={() => handleClick(item)}
        title={collapsed ? item.label : undefined}
        className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-all ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'signal-bar bg-primary/[0.08] text-fg'
            : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
        }`}
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[14px] text-left">{item.label}</span>
        )}
      </button>
    )
  }

  const renderGroupDivider = (title: string) => (
    <div
      key={`divider-${title}`}
      className="mb-1 mt-0.5 px-2.5 py-1 text-[11px] font-medium tracking-[0.06em] text-fg-faint/60 select-none"
    >
      — {title} —
    </div>
  )

  return (
    <aside
      className={`${width} flex shrink-0 flex-col border-r border-edge/12 bg-surface transition-all duration-200`}
    >
      {/* 折叠按钮 */}
      <button
        onClick={toggle}
        className="flex h-12 items-center justify-center border-b border-edge/10 text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg-muted"
        title={collapsed ? '展开侧栏' : '收起侧栏'}
      >
        {collapsed ? <ChevronRight size={16} strokeWidth={1.75} /> : <ChevronLeft size={16} strokeWidth={1.75} />}
      </button>

      {/* 导航项：折叠态全部直接列出，展开态按分组平铺 + 分组标题分隔 */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {collapsed
          ? allItems.map(renderItem)
          : groups.map((group) => (
              <div key={group.title}>
                {renderGroupDivider(group.title)}
                {group.items.map(renderItem)}
              </div>
            ))
        }
      </nav>

      {/* 底部：新手/完整模式切换 + 版本号 */}
      <div className="border-t border-edge/10 p-2">
        {!collapsed && (
          <button
            onClick={() => setSimpleMode(!simpleMode)}
            className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-edge/10 bg-surface-2 px-2 py-1.5 text-[12px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            title={simpleMode ? '切换到完整模式，显示全部功能入口' : '切换到新手模式，只显示最常用功能'}
          >
            <SlidersHorizontal size={13} strokeWidth={1.75} />
            {simpleMode ? '切到完整模式' : '切到新手模式'}
          </button>
        )}
        <div className="text-center font-mono text-[12px] text-fg-faint">
          {`v${appVersion}`}
        </div>
      </div>
    </aside>
  )
}
