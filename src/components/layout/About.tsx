import { useState, useEffect } from 'react'
import {
  Atom, Cpu, Bug, Heart, ExternalLink,
  RefreshCw, CheckCircle2, AlertTriangle,
  Sparkles, Globe, BookOpen, MessageCircle
} from 'lucide-react'
import { GITHUB_LINKS } from '../../data/links'

const GithubIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

const TECH_STACK = [
  { icon: Cpu, label: 'Electron', color: '#9FEAF9' },
  { icon: Atom, label: 'React 18', color: '#61DAFB' },
  { label: 'TypeScript', color: '#3178C6' },
  { label: 'Vite', color: '#BD34FE' },
  { label: 'Tailwind', color: '#38BDF8' },
  { label: 'Zustand', color: '#F5A623' },
  { label: "Ren'Py 7.x", color: '#E95678' },
]

const FEATURES = [
  { icon: Sparkles, label: 'AI 编剧 Copilot', desc: '舞台监督·文学导师·剧情蓝图三模式' },
  { icon: Globe, label: "Ren'Py 生态大厅", desc: '特效审计·社区插件·语法学院' },
  { icon: BookOpen, label: '全流程编辑器', desc: '场景导航·时间轴·素材管理·角色配置' },
]

export default function About() {
  const [version, setVersion] = useState('0.9.0')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available'>('idle')

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    ;(async () => {
      try {
        const v = await api.getVersion?.()
        if (v) setVersion(v)
      } catch { /* ignore */ }
    })()
  }, [])

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking')
    try {
      const api = window.electronAPI
      const result = await (api as any)?.checkForUpdates?.()
      if (result?.updateAvailable) {
        setUpdateStatus('available')
      } else {
        setUpdateStatus('up-to-date')
      }
    } catch {
      setUpdateStatus('up-to-date')
    } finally {
      setTimeout(() => setUpdateStatus('idle'), 5000)
    }
  }

  return (
    <div className="flex h-full flex-1 min-w-0 flex-col overflow-y-auto select-none">
      {/* Hero Section: full-width gradient banner */}
      <div className="relative shrink-0 overflow-hidden border-b border-edge/10">
        {/* subtle gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
        <div className="relative px-6 py-10">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-rose-500 flex items-center justify-center shadow-lg shrink-0 ring-1 ring-white/10">
              <span className="text-white text-2xl font-semibold">SW</span>
            </div>
            {/* Brand */}
            <div>
              <h1 className="text-[18px] font-semibold text-fg">ScriptWeaver</h1>
              <p className="mt-1 text-[13px] text-fg-muted">视觉小说引擎 · 一站式创作工具</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-surface-2/80 text-fg-muted border border-edge/10">
                  v{version}
                </span>
                <button
                  onClick={handleCheckUpdate}
                  disabled={updateStatus === 'checking'}
                  className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted hover:text-fg transition-colors disabled:opacity-50"
                >
                  {updateStatus === 'checking' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : updateStatus === 'up-to-date' ? (
                    <CheckCircle2 size={13} className="text-emerald-500" />
                  ) : updateStatus === 'available' ? (
                    <AlertTriangle size={13} className="text-amber-500" />
                  ) : null}
                  <span>
                    {updateStatus === 'checking' ? '检查中...'
                     : updateStatus === 'up-to-date' ? '已是最新'
                     : updateStatus === 'available' ? '发现新版本'
                     : '检查更新'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex-1 px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Column 1: 核心功能 + 技术栈 */}
          <div className="space-y-6">
            {/* 核心功能 */}
            <section>
              <h2 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.1em] mb-4">核心功能</h2>
              <div className="grid grid-cols-1 gap-3">
                {FEATURES.map((f) => {
                  const Icon = f.icon
                  return (
                    <div
                      key={f.label}
                      className="rounded-lg border border-edge/10 bg-surface p-5 hover:border-primary/20 transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                          <Icon size={16} className="text-primary" />
                        </span>
                        <span className="text-[14px] font-medium text-fg">{f.label}</span>
                      </div>
                      <p className="text-[13px] text-fg-muted leading-relaxed">{f.desc}</p>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* 技术栈 */}
            <section>
              <h2 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.1em] mb-4">技术栈</h2>
              <div className="rounded-lg border border-edge/10 bg-surface p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {TECH_STACK.map((tech) => {
                    const Icon = tech.icon
                    return (
                      <span
                        key={tech.label}
                        className="flex items-center gap-2.5 px-3 py-3 rounded-lg border border-edge/8 bg-surface-2/60 text-[13px] text-fg-muted transition-colors hover:border-primary/15 hover:bg-surface-hover/40"
                      >
                        {Icon ? <Icon size={16} style={{ color: tech.color }} /> : (
                          <span className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: tech.color }} />
                        )}
                        <span style={{ color: tech.color }}>{tech.label}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            </section>
          </div>

          {/* Column 2: 社区反馈 + 开源协议 + 致谢 */}
          <div className="space-y-6">
            <section>
              <h2 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.1em] mb-4">社区与反馈</h2>
              <div className="rounded-lg border border-edge/10 bg-surface p-5">
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { icon: GithubIcon, label: 'GitHub 仓库', href: GITHUB_LINKS.repo },
                    { icon: Bug, label: '报告 Bug', href: GITHUB_LINKS.newBug },
                    { icon: Heart, label: '功能建议', href: GITHUB_LINKS.newFeature },
                    { icon: MessageCircle, label: '反馈与建议', href: GITHUB_LINKS.issues },
                  ].map((link) => {
                    const Icon = link.icon
                    return (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge/8 bg-surface-2/60 text-[14px] text-fg-muted hover:text-fg hover:border-primary/15 hover:bg-surface-hover/40 transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <Icon size={17} />
                        {link.label}
                      </span>
                      <ExternalLink size={14} className="text-fg-faint" />
                    </a>
                    )
                  })}
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-[12px] font-medium text-fg-faint uppercase tracking-[0.1em] mb-4">开源协议</h2>
              <div className="rounded-lg border border-edge/10 bg-surface p-5">
                <p className="text-[14px] text-fg-muted leading-relaxed">
                  基于 AGPL-3.0 协议开源<br />
                  GNU Affero General Public License v3.0
                </p>
                <p className="mt-3 text-[12px] text-fg-faint leading-relaxed">
                  强 copyleft：修改后分发或作为网络服务提供，均须以同协议开源并附带源码
                </p>
                <a
                  href={`${GITHUB_LINKS.repo}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink size={12} />
                  查看完整 LICENSE
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
