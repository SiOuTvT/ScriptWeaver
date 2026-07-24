import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  BookOpen, ChevronRight, Search, ExternalLink,
  HelpCircle, FileText, Keyboard, Zap, Video, Sparkles,
  Globe, Users, Download, ArrowRight, X, MessageCircle
} from 'lucide-react'

interface HelpTopic {
  id: string
  label: string
  icon: typeof BookOpen
  category: string
  sections: { id: string; title: string; content: string }[]
  links?: { label: string; url: string }[]
}

const TOPICS: HelpTopic[] = [
  {
    id: 'getting-started', label: '快速上手', icon: Zap, category: '入门指南',
    sections: [
      { id: 'overview', title: 'ScriptWeaver 概览', content: `**ScriptWeaver** 是一款专为 Ren'Py 视觉小说的集成创作工具。它提供可视化剧本编辑、AI 辅助写作、素材管理、导出等功能。

核心模块：
- **场景导航 (左侧 #02)**：浏览和管理剧本场景
- **舞台预览 (中央)**：实时预览角色立绘与背景
- **时间轴 (底部)**：按行编辑剧本对白、选择支、标签
- **素材库 (#01)**：管理背景图片、立绘、音频等
- **角色管理 (#03)**：配置角色属性、表情、对话框样式` },
      { id: 'first-script', title: '创建第一个剧本', content: `1. 点击左侧 **场景导航**，在第一章下添加新场景
2. 在时间轴中输入第一行对白
3. 点击顶部播放按钮预览效果
4. 使用快捷键组合提升效率：

| 快捷键 | 功能 |
|--------|------|
| Ctrl+K | 命令面板 |
| Ctrl+S | 保存项目 |
| Ctrl+Z | 撤销 |
| Ctrl+Shift+Z | 重做 |
| Tab | 缩进 |
| Enter | 添加新行 |` },
    ],
    links: [],
  },
  {
    id: 'editor-basics', label: '编辑器基础', icon: FileText, category: '入门指南',
    sections: [
      { id: 'timeline', title: '时间轴编辑', content: `**时间轴**是 ScriptWeaver 的核心编辑区，以行列表形式展示剧本。

每行支持：
- **标签 (label)**：跳转锚点，如 \`chapter1_start\`
- **对话行**：角色名 + 对话框内容
- **选择支行**：带 target_label 跳转的分支选项
- **背景/立绘变更**：scene / show 命令

单击行可编辑属性，双击可快速定位到场景导航。` },
      { id: 'docks', title: '可停靠面板 (Dock)', content: `ScriptWeaver 采用 IDE 式**可停靠布局**：

- **舞台 (中央)**：永久占据最大空间，不可折叠
- **时间轴 (底部)**：默认 320px 高，可折叠到 38px
- **左侧 Dock**：素材库、场景导航、AI 面板等
- **右侧 Dock**：角色管理、变量监视器等

每个 Dock 面板可独立折叠成 44px 细轨，点击图标展开。` },
    ],
    links: [],
  },
  {
    id: 'ai-copilot', label: 'AI 编剧 Copilot', icon: Sparkles, category: 'AI 功能',
    sections: [
      { id: 'ai-modes', title: '三种 AI 模式', content: `**舞台监督模式**：AI 导演辅助编排场景。输入场景意图，AI 返回角色调度、节奏建议、演出指导。

**文学导师模式**：分析剧本结构、角色弧光与台词质量。粘贴剧本片段，获取结构诊断与改进建议。

**剧情蓝图模式**：输入故事梗概，AI 自动生成网状分歧剧情树，包含：
- 起点节点 → 分支节点 → 结局节点
- 自动挂载角色与表情
- 选择支自动插入带 jump 标签
- 变量操作 (如 heroine_trust += 1)` },
      { id: 'ai-config', title: 'AI 配置', content: `在**设置 (#11) > AI 配置**中填入 OpenAI 兼容 API Key。

支持的模型：
- GPT-4 / GPT-4 Turbo / GPT-3.5 Turbo
- Claude 3 Opus / Sonnet
- DeepSeek Chat

API Key 加密存储在本地 userData，不会上传到任何服务器。` },
    ],
    links: [],
  },
  {
    id: 'assets', label: '素材管理', icon: Download, category: '素材与资源',
    sections: [
      { id: 'import-assets', title: '导入素材', content: `导入素材有两种方式：

1. **拖拽导入**：从文件管理器拖拽图片/音频到素材库
2. **文件选择器**：点击导入按钮选择文件 (电子版内更推荐拖拽)

支持的格式：
- 图片：PNG / JPG / WebP
- 音频：WAV / MP3 / OGG

导入后素材落入本地存储区，通过 sw-asset:// 协议流式直读，不占用内存。` },
      { id: 'organize', title: '组织素材', content: `素材库支持：
- **分类筛选**：背景/立绘/音频/视频
- **搜索**：按文件名查找
- **排序**：最近导入/名称/类型
- **视图切换**：紧凑卡片/标准/大图模式
- **重命名与删除**：右键素材卡片操作

音频素材自带波形预览播放器，可直接试听。` },
    ],
    links: [],
  },
  {
    id: 'renpy-hub', label: "Ren'Py 生态", icon: Globe, category: "Ren'Py 知识库",
    sections: [
      { id: 'audit', title: '特效全量审计', content: `**Ren'Py 生态大厅 (#06)** 提供 19 大类 Ren'Py 特效的全量审计清单：

已全覆盖 (16 类)：基础转场、裁剪、位移、缩放、透明度、位置变换、颜色、裁剪角、3D 仿射、缓动函数、ATL 语句、内置定位、3D 舞台、粒子、矩阵滤镜

补充覆盖 (3 类)：QTE 限时选择、NVL 小说模式、后处理滤镜 —— 已在插件 DB 与语法学院中完整补全，每个特效均有代码范例。` },
      { id: 'plugins', title: '社区插件 Hub', content: `12 个高质量 Ren'Py 社区插件，6 大分类：

- **角色表演**：Live2D 集成、Kinetic 动态文字、立绘自动口型
- **UI 界面**：手机短信模拟、CG 鉴赏厅、音乐鉴赏厅
- **小游戏**：小游戏模板、QTE 限时选择、好感度日程
- **系统引擎**：日历时间、成就系统、道具背包
- **视觉滤镜**：天气粒子、后处理滤镜 (CRT/VHS)
- **NVL 模式**：NVL 扩展风格包

每个插件附带接口预览、代码范例与安装说明，可一键插入剧本。` },
    ],
    links: [],
  },
  {
    id: 'export', label: '导出与发布', icon: ExternalLink, category: '导出与发布',
    sections: [
      { id: 'renpy-export', title: "导出为 Ren'Py 工程", content: `将 ScriptWeaver 项目导出为标准 Ren'Py 工程：

1. 点击 **导出到 Ren'Py** 按钮
2. 选择目标目录
3. 自动生成 script.rpy、images/、audio/ 等标准目录结构

导出规则：
- 所有过场动作会被转为标准 ATL 变换
- 选择支自动生成 menu 块
- 不支持的特性会标注为注释而非生成错误代码` },
      { id: 'multi-export', title: '多格式导出', content: `**多格式导出 (#09)** 支持四种导出格式：

- **Markdown (.md)**：带格式文档，适合分享
- **纯文本 (.txt)**：纯台词文本
- **HTML 打印 (.html)**：网页排版，适合打印
- **CV 台词表 (.csv)**：按角色分组的台词统计

可指定角色过滤，导出的预览展示前 80 行，完整内容通过下载获取。` },
    ],
    links: [],
  },
  {
    id: 'shortcuts', label: '快捷键', icon: Keyboard, category: '参考',
    sections: [
      { id: 'all-shortcuts', title: '全部快捷键', content: `| 快捷键 | 功能 |
|--------|------|
| Ctrl+K | 命令面板 |
| Ctrl+S | 保存项目 |
| Ctrl+Z | 撤销 |
| Ctrl+Shift+Z | 重做 |
| Ctrl+E | 导出到 Ren'Py |
| Tab | 缩进当前行 |
| Enter | 添加新行 |
| Delete / Backspace | 删除选中元素 |
| Esc | 关闭弹窗 / 取消选择 |` },
    ],
    links: [],
  },
  {
    id: 'faq', label: '常见问题', icon: HelpCircle, category: '支持',
    sections: [
      { id: 'faq-items', title: 'FAQ', content: `**Q: 素材导入后不显示？**
A: 确认在 Electron 应用内使用（非浏览器），素材通过 sw-asset:// 私有协议加载。

**Q: AI 功能无响应？**
A: 检查设置中的 API Key 是否正确，端点 URL 是否可达。

**Q: 导出到 Ren'Py 后素材缺失？**
A: 导入素材后需保存项目 (.swproj) 再导出。

**Q: 如何反馈 Bug 或建议？**
A: 欢迎通过 GitHub Issue 或内置反馈渠道联系我们。` },
    ],
    links: [
      { label: 'GitHub 仓库', url: 'https://github.com' },
      { label: 'Ren\'Py 官方文档', url: 'https://renpy.org/doc/html/' },
    ],
  },
]

export default function HelpCenter() {
  const [selectedTopic, setSelectedTopic] = useState<string>('getting-started')
  const [searchQuery, setSearchQuery] = useState('')

  const topic = TOPICS.find((t) => t.id === selectedTopic) ?? TOPICS[0]

  // Group topics by category
  const grouped = useMemo(() => {
    const map = new Map<string, HelpTopic[]>()
    TOPICS.forEach((t) => {
      const existing = map.get(t.category) ?? []
      existing.push(t)
      map.set(t.category, existing)
    })
    return Array.from(map.entries())
  }, [])

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    const results: { topicId: string; sectionId: string; title: string }[] = []
    TOPICS.forEach((t) => {
      t.sections.forEach((s) => {
        if (s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)) {
          results.push({ topicId: t.id, sectionId: s.id, title: s.title })
        }
      })
    })
    return results.slice(0, 10)
  }, [searchQuery])

  const handleSearchSelect = (topicId: string, sectionId: string) => {
    setSelectedTopic(topicId)
    setSearchQuery('')
    setTimeout(() => {
      document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  return (
    <div className="flex h-full select-none">
      {/* Left Nav: 200px */}
      <div className="w-[200px] shrink-0 border-r border-edge/10 flex flex-col">
        <div className="px-4 py-5 border-b border-edge/10">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-primary" />
            <span className="text-[14px] font-semibold text-fg">帮助中心</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-2">
          {grouped.map(([category, topics]) => (
            <div key={category} className="mb-4 last:mb-0">
              <div className="text-[11px] font-medium text-fg-faint uppercase tracking-[0.08em] px-2 mb-1.5">
                {category}
              </div>
              {topics.map((t) => {
                const Icon = t.icon
                const active = selectedTopic === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTopic(t.id)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-left transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary border border-primary/15 font-medium'
                        : 'text-fg-muted hover:text-fg hover:bg-surface-2/60 border border-transparent'
                    }`}
                  >
                    <Icon size={15} className={active ? 'text-primary' : ''} />
                    {t.label}
                    {active && <span className="ml-auto w-1 h-4 rounded-full bg-primary/60" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Middle Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Search + Header */}
        <div className="shrink-0 border-b border-edge/10 px-8 py-4">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索帮助内容..."
              className="w-full rounded-lg border border-edge/10 bg-surface pl-10 pr-4 py-2 text-[13px] text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchResults && (
            <div className="mt-2 rounded-lg border border-edge/10 bg-surface shadow-lg overflow-hidden">
              {searchResults.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-fg-muted text-center">未找到匹配内容</div>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={`${r.topicId}-${r.sectionId}`}
                    onClick={() => handleSearchSelect(r.topicId, r.sectionId)}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-fg hover:bg-surface-hover/40 border-b border-edge/8 last:border-b-0 flex items-center gap-2 transition-colors"
                  >
                    <Search size={12} className="text-fg-faint shrink-0" />
                    <span className="truncate">{r.title}</span>
                    <ChevronRight size={12} className="text-fg-faint ml-auto shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[680px] px-8 py-6">
            {/* Topic Title */}
            <div className="mb-6">
              <div className="flex items-center gap-2.5 mb-1">
                {React.createElement(topic.icon, { size: 18, className: 'text-primary' })}
                <h1 className="text-[16px] font-semibold text-fg">{topic.label}</h1>
              </div>
              <span className="text-[12px] text-fg-faint">{topic.category}</span>
            </div>

            {/* Sections */}
            <div className="space-y-6">
              {topic.sections.map((section) => (
                <div
                  key={section.id}
                  id={`section-${section.id}`}
                  className="rounded-xl border border-edge/10 bg-surface p-5"
                >
                  <h2 className="text-[14px] font-medium text-fg mb-3 pb-3 border-b border-edge/8">{section.title}</h2>
                  <div className="prose-help">
                    {renderMarkdown(section.content)}
                  </div>
                </div>
              ))}
            </div>

            {/* Links */}
            {topic.links && topic.links.length > 0 && (
              <div className="mt-6 pt-6 border-t border-edge/10">
                <h3 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-3">相关链接</h3>
                <div className="flex flex-wrap gap-2">
                  {topic.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-edge/10 bg-surface-2/60 px-3 py-2 text-[13px] text-fg-muted hover:text-fg hover:border-primary/15 transition-colors"
                    >
                      <ExternalLink size={12} />
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback */}
            <div className="mt-8 rounded-xl border border-edge/10 bg-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                  <MessageCircle size={18} className="text-primary" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-fg">还有问题？</div>
                  <div className="text-[12px] text-fg-muted mt-0.5">欢迎通过 GitHub Issue 或内置反馈渠道联系我们</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right TOC */}
        <div className="hidden xl:block w-[180px] shrink-0 border-l border-edge/10 overflow-y-auto">
          <div className="px-3 py-5">
            <div className="text-[11px] font-medium text-fg-faint uppercase tracking-[0.08em] mb-3 px-1">页面目录</div>
            {topic.sections.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg hover:bg-surface-2/60 rounded-md transition-colors truncate"
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Simple Markdown Renderer ──────────────────────────────────────
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === '') { i++; continue }

    // Heading
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-[13px] font-medium text-fg mt-4 mb-2">{line.slice(4)}</h3>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-[14px] font-medium text-fg mt-4 mb-2">{line.slice(3)}</h2>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-[15px] font-semibold text-fg mt-4 mb-2">{line.slice(2)}</h1>)
      i++; continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]); i++
      }
      const headerCells = tableLines[0]?.split('|').filter(Boolean).map((c) => c.trim()) ?? []
      const rows = tableLines.slice(2).map((r) => r.split('|').filter(Boolean).map((c) => c.trim()))
      elements.push(
        <div key={key++} className="overflow-x-auto my-3 rounded-lg border border-edge/10">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-surface-2/60">
                {headerCells.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-medium text-fg-muted border-b border-edge/10">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-edge/8 last:border-b-0">
                  {row.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 text-fg">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]); i++
      }
      i++ // skip closing ```
      elements.push(
        <pre key={key++} className="bg-surface-2/80 rounded-lg border border-edge/10 p-3 my-3 overflow-x-auto text-[12px] font-mono text-fg-muted whitespace-pre-wrap">
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // Bullet list
    if (line.match(/^[\*\-\d]\.?\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[\*\-\d]\.?\s/)) {
        items.push(lines[i].replace(/^[\*\-\d]\.?\s/, '')); i++
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside my-2 space-y-1 text-[13px] text-fg leading-relaxed">
          {items.map((item, ii) => <li key={ii}>{renderInlineMarkdown(item)}</li>)}
        </ul>
      )
      continue
    }

    // Paragraph
    elements.push(
      <p key={key++} className="text-[13px] text-fg leading-relaxed my-2">{renderInlineMarkdown(line)}</p>
    )
    i++
  }

  return elements.length > 0 ? elements : <p className="text-[13px] text-fg-muted italic">暂无内容</p>
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    // Inline code: `text`
    const codeParts = part.split(/(`[^`]+`)/g)
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return <code key={j} className="font-mono text-[12px] bg-surface-2/80 px-1 rounded">{cp.slice(1, -1)}</code>
      }
      return cp
    })
  })
}
