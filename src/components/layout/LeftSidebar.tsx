import { useAppStore } from '@/stores/appStore'
import {
  BookOpen, FileText, Images, Users, Download, Sparkles, Wand2, Info, HelpCircle, Settings,
  ChevronLeft, ChevronRight, Stethoscope, FileDown, Globe, Cloud, History, Code, ScrollText,
  FilePlus2, FolderOpen,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

interface NavItem {
  id: string
  label: string
  icon: ReactNode
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
      { id: 'chapters', label: '写剧情', icon: <BookOpen size={17} strokeWidth={1.75} /> },
      { id: 'script-overview', label: '剧本总览', icon: <FileText size={17} strokeWidth={1.75} /> },
      { id: 'script', label: '脚本文本', icon: <Code size={17} strokeWidth={1.75} /> },
      { id: 'ai', label: 'AI 编剧', icon: <Sparkles size={17} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '内容资产',
    items: [
      { id: 'characters', label: '角色', icon: <Users size={17} strokeWidth={1.75} /> },
      { id: 'assets', label: '素材库', icon: <Images size={17} strokeWidth={1.75} /> },
      { id: 'effects', label: '特效', icon: <Wand2 size={17} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '导出与生态',
    items: [
      { id: 'export', label: '发布与导出', icon: <Download size={17} strokeWidth={1.75} /> },
      { id: 'exporter', label: '多文件导出', icon: <FileDown size={17} strokeWidth={1.75} /> },
      { id: 'renpy-hub', label: 'Ren\'Py 生态', icon: <Globe size={17} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '工程与协作',
    items: [
      { id: 'templates', label: '从模板新建', icon: <FilePlus2 size={17} strokeWidth={1.75} /> },
      { id: 'import-rpy', label: '导入工程', icon: <FolderOpen size={17} strokeWidth={1.75} /> },
      { id: 'diagnostics', label: '工程体检', icon: <Stethoscope size={17} strokeWidth={1.75} /> },
      { id: 'history', label: '版本历史', icon: <History size={17} strokeWidth={1.75} /> },
      { id: 'collab', label: 'P2P 协作', icon: <Cloud size={17} strokeWidth={1.75} /> },
      { id: 'audit-log', label: '协作日志', icon: <ScrollText size={17} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '设置与帮助',
    items: [
      { id: 'settings', label: '设置', icon: <Settings size={17} strokeWidth={1.75} /> },
      { id: 'help', label: '帮助', icon: <HelpCircle size={17} strokeWidth={1.75} /> },
      { id: 'about', label: '关于', icon: <Info size={17} strokeWidth={1.75} /> },
    ],
  },
]

/** 新手模式：只留最常用的入口，名字全是大白话 */
const SIMPLE_GROUPS: NavGroup[] = [
  {
    title: '开始创作',
    items: [
      { id: 'chapters', label: '写剧情', icon: <BookOpen size={17} strokeWidth={1.75} /> },
      { id: 'assets', label: '素材库', icon: <Images size={17} strokeWidth={1.75} /> },
      { id: 'characters', label: '角色', icon: <Users size={17} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '完成发布',
    items: [
      { id: 'export', label: '发布与导出', icon: <Download size={17} strokeWidth={1.75} /> },
    ],
  },
  {
    title: '设置与帮助',
    items: [
      { id: 'settings', label: '设置', icon: <Settings size={17} strokeWidth={1.75} /> },
      { id: 'help', label: '帮助', icon: <HelpCircle size={17} strokeWidth={1.75} /> },
    ],
  },
]

export default function LeftSidebar() {
  const collapsed = useAppStore((s) => s.leftSidebarCollapsed)
  const activeItem = useAppStore((s) => s.activeNavItem)
  const setActive = useAppStore((s) => s.setActiveNavItem)
  const toggle = useAppStore((s) => s.toggleLeftSidebar)
  const simpleMode = useAppStore((s) => s.simpleMode)

  const [appVersion, setAppVersion] = useState('1.0.0')

  useEffect(() => {
    window.electronAPI?.getVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  const width = collapsed ? 'w-12' : 'w-[136px]'

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
        className={`group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'signal-bar bg-primary/[0.08] text-fg'
            : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
        }`}
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-center text-[13px]">{item.label}</span>
        )}
      </button>
    )
  }

  const renderGroupDivider = (title: string) => (
    <div
      key={`divider-${title}`}
      className="mb-0.5 mt-2.5 px-2 pb-1 text-[12px] font-medium tracking-[0.08em] text-fg-faint/70 select-none"
    >
      {title}
    </div>
  )

  return (
    <aside
      className={`${width} flex shrink-0 flex-col border-r border-edge/12 bg-surface transition-all duration-200`}
    >
      {/* 折叠按钮 */}
      <button
        onClick={toggle}
        className="flex h-10 shrink-0 items-center justify-center border-b border-edge/10 text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg-muted"
        title={collapsed ? '展开侧栏' : '收起侧栏'}
      >
        {collapsed ? <ChevronRight size={15} strokeWidth={1.75} /> : <ChevronLeft size={15} strokeWidth={1.75} />}
      </button>

      {/* 导航项 */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-2">
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

      {/* 底部版本号 */}
      <div className="shrink-0 border-t border-edge/10 py-1.5 text-center font-mono text-[12px] text-fg-faint">
        {`v${appVersion}`}
      </div>
    </aside>
  )
}
